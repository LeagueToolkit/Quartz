using PaintDotNet;
using PaintDotNet.Imaging;
using PaintDotNet.Rendering;
using System;
using System.IO;

namespace TexFileTypePlugin
{
    public class TexFileTypeFactory : IFileTypeFactory
    {
        public FileType[] GetFileTypeInstances()
        {
            return new FileType[] { new TexFileType() };
        }
    }

    internal class TexFileType : FileType
    {
        private static readonly System.Collections.Generic.Dictionary<int, byte> documentFormats = new();
        private static readonly System.Collections.Generic.Dictionary<int, bool> documentMipmaps = new();

        public TexFileType()
            : base(
                "League of Legends TEX",
                new FileTypeOptions
                {
                    LoadExtensions = new string[] { ".tex" },
                    SaveExtensions = new string[] { ".tex" }
                })
        {
        }

        protected override Document OnLoad(Stream input)
        {
            byte[] data = new byte[input.Length];
            input.Read(data, 0, data.Length);

            TexFile tex = TexFile.Read(data);
            byte[] rgba = tex.DecompressToRgba();

            Document doc = new Document(tex.Width, tex.Height);
            BitmapLayer layer = new BitmapLayer(tex.Width, tex.Height) { Name = "Background" };

            Surface surface = layer.Surface;
            for (int y = 0; y < tex.Height; y++)
            {
                for (int x = 0; x < tex.Width; x++)
                {
                    int idx = (y * tex.Width + x) * 4;
                    byte r = rgba[idx];
                    byte g = rgba[idx + 1];
                    byte b = rgba[idx + 2];
                    byte a = rgba[idx + 3];
                    surface[x, y] = ColorBgra.FromBgra(b, g, r, a);
                }
            }

            doc.Layers.Add(layer);
            documentFormats[doc.GetHashCode()] = tex.Format;
            documentMipmaps[doc.GetHashCode()] = tex.Mipmaps;
            return doc;
        }

        protected override void OnSave(Document input, Stream output, SaveConfigToken? saveConfigToken, Surface scratchSurface, ProgressEventHandler? progressCallback)
        {
            input.Flatten(scratchSurface);

            int width = scratchSurface.Width;
            int height = scratchSurface.Height;

            byte format = 12; // Default to DXT5
            if (documentFormats.TryGetValue(input.GetHashCode(), out byte savedFormat))
            {
                format = savedFormat;
            }

            byte[] data;
            
            if (format == 20)
            {
                byte[] bgra = new byte[width * height * 4];
                for (int y = 0; y < height; y++)
                {
                    for (int x = 0; x < width; x++)
                    {
                        ColorBgra pixel = scratchSurface[x, y];
                        int idx = (y * width + x) * 4;
                        bgra[idx] = pixel.B;
                        bgra[idx + 1] = pixel.G;
                        bgra[idx + 2] = pixel.R;
                        bgra[idx + 3] = pixel.A;
                    }
                }
                data = bgra;
            }
            else
            {
                if (width % 4 != 0 || height % 4 != 0)
                {
                    string errorMsg = $"Image dimensions must be divisible by 4 for DXT compression.\n\n" +
                                    $"Current size: {width}x{height}\n" +
                                    $"Width: {width} (needs to be {((width + 3) / 4) * 4})\n" +
                                    $"Height: {height} (needs to be {((height + 3) / 4) * 4})\n\n" +
                                    $"Please resize your image to dimensions divisible by 4.\n" +
                                    $"Examples: 1024x1024, 2048x2048, 512x256, etc.";
                    
                    throw new FormatException(errorMsg);
                }

                byte[] rgba = new byte[width * height * 4];
                for (int y = 0; y < height; y++)
                {
                    for (int x = 0; x < width; x++)
                    {
                        ColorBgra pixel = scratchSurface[x, y];
                        int idx = (y * width + x) * 4;
                        rgba[idx] = pixel.R;
                        rgba[idx + 1] = pixel.G;
                        rgba[idx + 2] = pixel.B;
                        rgba[idx + 3] = pixel.A;
                    }
                }

                if (format == 10)
                {
                    data = CompressDxt1Native(rgba, width, height);
                }
                else
                {
                    data = CompressDxt5Native(rgba, width, height);
                }
            }

            bool generateMipmaps = false;
            if (documentMipmaps.TryGetValue(input.GetHashCode(), out bool savedMipmaps))
            {
                generateMipmaps = savedMipmaps;
            }

            TexFile tex = new TexFile
            {
                Width = (ushort)width,
                Height = (ushort)height,
                Format = format,
                Mipmaps = generateMipmaps,
                Data = data
            };

            byte[] fileData = tex.Write((rgba, w, h, fmt) =>
            {
                if (fmt == 10) // DXT1
                    return CompressDxt1Native(rgba, w, h);
                else // DXT5
                    return CompressDxt5Native(rgba, w, h);
            });
            output.Write(fileData, 0, fileData.Length);
        }

        private byte[] CompressDxt1Native(byte[] rgba, int width, int height)
        {
            // Use pure C# DirectXTex port (dithering enabled, perceptual mode)
            return DirectXTexCompressor.CompressBC1(rgba, width, height, true, true);
        }

        private void CompressDxt1Block(byte[] rgba, int width, int height, int blockX, int blockY, byte[] output, int offset)
        {
            byte[] colors = new byte[48];

            for (int y = 0; y < 4; y++)
            {
                for (int x = 0; x < 4; x++)
                {
                    int px = blockX + x;
                    int py = blockY + y;
                    int idx = y * 4 + x;

                    if (px < width && py < height)
                    {
                        int pixelIdx = (py * width + px) * 4;
                        colors[idx * 3] = rgba[pixelIdx];
                        colors[idx * 3 + 1] = rgba[pixelIdx + 1];
                        colors[idx * 3 + 2] = rgba[pixelIdx + 2];
                    }
                    else
                    {
                        colors[idx * 3] = 0;
                        colors[idx * 3 + 1] = 0;
                        colors[idx * 3 + 2] = 0;
                    }
                }
            }

            CompressColorBlock(colors, output, offset);
        }

        private byte[] CompressDxt5Native(byte[] rgba, int width, int height)
        {
            // Use pure C# DirectXTex port (dithering enabled, perceptual mode)
            return DirectXTexCompressor.CompressBC3(rgba, width, height, true, true);
        }

        private void CompressDxt5Block(byte[] rgba, int width, int height, int blockX, int blockY, byte[] output, int offset)
        {
            // Extract 4x4 block of pixels
            byte[] alphas = new byte[16];
            byte[] colors = new byte[48]; // RGB for 16 pixels

            for (int y = 0; y < 4; y++)
            {
                for (int x = 0; x < 4; x++)
                {
                    int px = blockX + x;
                    int py = blockY + y;
                    int idx = y * 4 + x;

                    if (px < width && py < height)
                    {
                        int pixelIdx = (py * width + px) * 4;
                        colors[idx * 3] = rgba[pixelIdx];     // R
                        colors[idx * 3 + 1] = rgba[pixelIdx + 1]; // G
                        colors[idx * 3 + 2] = rgba[pixelIdx + 2]; // B
                        alphas[idx] = rgba[pixelIdx + 3];     // A
                    }
                    else
                    {
                        colors[idx * 3] = 0;
                        colors[idx * 3 + 1] = 0;
                        colors[idx * 3 + 2] = 0;
                        alphas[idx] = 255;
                    }
                }
            }

            // Compress alpha (first 8 bytes)
            CompressAlphaBlock(alphas, output, offset);

            // Compress color (next 8 bytes)
            CompressColorBlock(colors, output, offset + 8);
        }

        private void CompressAlphaBlock(byte[] alphas, byte[] output, int offset)
        {
            // Find min and max alpha
            byte minAlpha = 255;
            byte maxAlpha = 0;
            foreach (byte a in alphas)
            {
                if (a < minAlpha) minAlpha = a;
                if (a > maxAlpha) maxAlpha = a;
            }

            output[offset] = maxAlpha;
            output[offset + 1] = minAlpha;

            // Interpolate and encode alpha values
            byte[] alphaPalette = new byte[8];
            alphaPalette[0] = maxAlpha;
            alphaPalette[1] = minAlpha;

            if (maxAlpha > minAlpha)
            {
                for (int i = 1; i < 7; i++)
                {
                    alphaPalette[i + 1] = (byte)(((7 - i) * maxAlpha + i * minAlpha) / 7);
                }
            }
            else
            {
                for (int i = 1; i < 5; i++)
                {
                    alphaPalette[i + 1] = (byte)(((5 - i) * maxAlpha + i * minAlpha) / 5);
                }
                alphaPalette[6] = 0;
                alphaPalette[7] = 255;
            }

            // Encode 16 alpha values as 3-bit indices (48 bits total)
            ulong bits = 0;
            for (int i = 0; i < 16; i++)
            {
                int bestIndex = 0;
                int bestDiff = Math.Abs(alphas[i] - alphaPalette[0]);
                for (int j = 1; j < 8; j++)
                {
                    int diff = Math.Abs(alphas[i] - alphaPalette[j]);
                    if (diff < bestDiff)
                    {
                        bestDiff = diff;
                        bestIndex = j;
                    }
                }
                bits |= ((ulong)bestIndex << (i * 3));
            }

            for (int i = 0; i < 6; i++)
            {
                output[offset + 2 + i] = (byte)(bits >> (i * 8));
            }
        }

        private void CompressColorBlock(byte[] colors, byte[] output, int offset)
        {
            // Default: dithering enabled with perceptual error metric
            CompressColorBlockWithDithering(colors, output, offset, true, true);
        }

        private void CompressColorBlockWithDithering(byte[] colors, byte[] output, int offset, bool useDithering, bool usePerceptual)
        {
            // Perceptual weights from DirectXTex BC.cpp
            float lumR = usePerceptual ? (0.2125f / 0.7154f) : 1.0f;
            float lumG = 1.0f;
            float lumB = usePerceptual ? (0.0721f / 0.7154f) : 1.0f;
            float lumRInv = usePerceptual ? (0.7154f / 0.2125f) : 1.0f;
            float lumBInv = usePerceptual ? (0.7154f / 0.0721f) : 1.0f;

            // Convert colors to normalized float with optional dithering pre-quantization
            float[] colorR = new float[16];
            float[] colorG = new float[16];
            float[] colorB = new float[16];
            float[] errorR = new float[16];
            float[] errorG = new float[16];
            float[] errorB = new float[16];

            for (int i = 0; i < 16; i++)
            {
                float r = colors[i * 3] / 255.0f;
                float g = colors[i * 3 + 1] / 255.0f;
                float b = colors[i * 3 + 2] / 255.0f;

                if (useDithering)
                {
                    r += errorR[i];
                    g += errorG[i];
                    b += errorB[i];
                }

                r = Math.Max(0, Math.Min(1, r));
                g = Math.Max(0, Math.Min(1, g));
                b = Math.Max(0, Math.Min(1, b));

                float qr = (float)Math.Round(r * 31.0f) / 31.0f;
                float qg = (float)Math.Round(g * 63.0f) / 63.0f;
                float qb = (float)Math.Round(b * 31.0f) / 31.0f;

                colorR[i] = qr;
                colorG[i] = qg;
                colorB[i] = qb;

                if (useDithering)
                {
                    float diffR = r - qr;
                    float diffG = g - qg;
                    float diffB = b - qb;

                    if ((i & 3) != 3 && i + 1 < 16) { errorR[i + 1] += diffR * (7.0f / 16.0f); errorG[i + 1] += diffG * (7.0f / 16.0f); errorB[i + 1] += diffB * (7.0f / 16.0f); }
                    if (i < 12)
                    {
                        if ((i & 3) != 0) { errorR[i + 3] += diffR * (3.0f / 16.0f); errorG[i + 3] += diffG * (3.0f / 16.0f); errorB[i + 3] += diffB * (3.0f / 16.0f); }
                        errorR[i + 4] += diffR * (5.0f / 16.0f); errorG[i + 4] += diffG * (5.0f / 16.0f); errorB[i + 4] += diffB * (5.0f / 16.0f);
                        if ((i & 3) != 3) { errorR[i + 5] += diffR * (1.0f / 16.0f); errorG[i + 5] += diffG * (1.0f / 16.0f); errorB[i + 5] += diffB * (1.0f / 16.0f); }
                    }
                }
            }

            // Apply perceptual weighting to colors for optimization
            float[] wR = new float[16];
            float[] wG = new float[16];
            float[] wB = new float[16];
            for (int i = 0; i < 16; i++)
            {
                wR[i] = colorR[i] * lumR;
                wG[i] = colorG[i] * lumG;
                wB[i] = colorB[i] * lumB;
            }

            // Find initial min/max (bounding box in weighted color space)
            float xR = 1, xG = 1, xB = 1;
            float yR = 0, yG = 0, yB = 0;
            for (int i = 0; i < 16; i++)
            {
                if (wR[i] < xR) xR = wR[i];
                if (wG[i] < xG) xG = wG[i];
                if (wB[i] < xB) xB = wB[i];
                if (wR[i] > yR) yR = wR[i];
                if (wG[i] > yG) yG = wG[i];
                if (wB[i] > yB) yB = wB[i];
            }

            // Try to optimize along the diagonal axis
            float abR = yR - xR, abG = yG - xG, abB = yB - xB;
            float fAB = abR * abR + abG * abG + abB * abB;

            if (fAB >= 1.0f / 4096.0f)
            {
                // Newton's Method optimization (8 iterations)
                float[] pC4 = { 1.0f, 2.0f / 3.0f, 1.0f / 3.0f, 0.0f };
                float[] pD4 = { 0.0f, 1.0f / 3.0f, 2.0f / 3.0f, 1.0f };
                const float fEpsilon = (0.25f / 64.0f) * (0.25f / 64.0f);

                for (int iteration = 0; iteration < 8; iteration++)
                {
                    float dirR = yR - xR, dirG = yG - xG, dirB = yB - xB;
                    float fLen = dirR * dirR + dirG * dirG + dirB * dirB;
                    if (fLen < 1.0f / 4096.0f) break;

                    float fScale = 3.0f / fLen;
                    dirR *= fScale; dirG *= fScale; dirB *= fScale;

                    float[] stepR = new float[4], stepG = new float[4], stepB = new float[4];
                    for (int s = 0; s < 4; s++)
                    {
                        stepR[s] = xR * pC4[s] + yR * pD4[s];
                        stepG[s] = xG * pC4[s] + yG * pD4[s];
                        stepB[s] = xB * pC4[s] + yB * pD4[s];
                    }

                    float d2X = 0, d2Y = 0;
                    float dxR = 0, dxG = 0, dxB = 0;
                    float dyR = 0, dyG = 0, dyB = 0;

                    for (int i = 0; i < 16; i++)
                    {
                        float fDot = (wR[i] - xR) * dirR + (wG[i] - xG) * dirG + (wB[i] - xB) * dirB;
                        int iStep = fDot <= 0 ? 0 : (fDot >= 3.0f ? 3 : (int)(fDot + 0.5f));

                        float diffR = stepR[iStep] - wR[i];
                        float diffG = stepG[iStep] - wG[i];
                        float diffB = stepB[iStep] - wB[i];

                        float fC = pC4[iStep] * (1.0f / 8.0f);
                        float fD = pD4[iStep] * (1.0f / 8.0f);

                        d2X += fC * pC4[iStep];
                        dxR += fC * diffR; dxG += fC * diffG; dxB += fC * diffB;

                        d2Y += fD * pD4[iStep];
                        dyR += fD * diffR; dyG += fD * diffG; dyB += fD * diffB;
                    }

                    if (d2X > 0) { float f = -1.0f / d2X; xR += dxR * f; xG += dxG * f; xB += dxB * f; }
                    if (d2Y > 0) { float f = -1.0f / d2Y; yR += dyR * f; yG += dyG * f; yB += dyB * f; }

                    if (dxR * dxR < fEpsilon && dxG * dxG < fEpsilon && dxB * dxB < fEpsilon &&
                        dyR * dyR < fEpsilon && dyG * dyG < fEpsilon && dyB * dyB < fEpsilon)
                        break;
                }
            }

            float c0R = Math.Max(0, Math.Min(1, xR * lumRInv));
            float c0G = Math.Max(0, Math.Min(1, xG));
            float c0B = Math.Max(0, Math.Min(1, xB * lumBInv));
            float c1R = Math.Max(0, Math.Min(1, yR * lumRInv));
            float c1G = Math.Max(0, Math.Min(1, yG));
            float c1B = Math.Max(0, Math.Min(1, yB * lumBInv));

            ushort color0 = (ushort)(((int)(c0R * 31 + 0.5f) << 11) | ((int)(c0G * 63 + 0.5f) << 5) | (int)(c0B * 31 + 0.5f));
            ushort color1 = (ushort)(((int)(c1R * 31 + 0.5f) << 11) | ((int)(c1G * 63 + 0.5f) << 5) | (int)(c1B * 31 + 0.5f));

            float p0R = ((color0 >> 11) & 31) / 31.0f;
            float p0G = ((color0 >> 5) & 63) / 63.0f;
            float p0B = (color0 & 31) / 31.0f;
            float p1R = ((color1 >> 11) & 31) / 31.0f;
            float p1G = ((color1 >> 5) & 63) / 63.0f;
            float p1B = (color1 & 31) / 31.0f;

            if (color0 < color1)
            {
                ushort temp = color0; color0 = color1; color1 = temp;
                float t = p0R; p0R = p1R; p1R = t;
                t = p0G; p0G = p1G; p1G = t;
                t = p0B; p0B = p1B; p1B = t;
            }

            output[offset] = (byte)(color0 & 0xFF);
            output[offset + 1] = (byte)(color0 >> 8);
            output[offset + 2] = (byte)(color1 & 0xFF);
            output[offset + 3] = (byte)(color1 >> 8);

            float[] palR = { p0R, p1R, (p0R * 2 + p1R) / 3.0f, (p0R + p1R * 2) / 3.0f };
            float[] palG = { p0G, p1G, (p0G * 2 + p1G) / 3.0f, (p0G + p1G * 2) / 3.0f };
            float[] palB = { p0B, p1B, (p0B * 2 + p1B) / 3.0f, (p0B + p1B * 2) / 3.0f };

            float[] wPalR = new float[4], wPalG = new float[4], wPalB = new float[4];
            for (int j = 0; j < 4; j++)
            {
                wPalR[j] = palR[j] * lumR;
                wPalG[j] = palG[j] * lumG;
                wPalB[j] = palB[j] * lumB;
            }

            float encDirR = wPalR[1] - wPalR[0];
            float encDirG = wPalG[1] - wPalG[0];
            float encDirB = wPalB[1] - wPalB[0];
            float encLen = encDirR * encDirR + encDirG * encDirG + encDirB * encDirB;
            float encScale = (color0 != color1 && encLen > 0) ? (3.0f / encLen) : 0;
            encDirR *= encScale; encDirG *= encScale; encDirB *= encScale;

            if (useDithering) { Array.Clear(errorR, 0, 16); Array.Clear(errorG, 0, 16); Array.Clear(errorB, 0, 16); }

            uint bits = 0;
            int[] stepMap = { 0, 2, 3, 1 };
            for (int i = 0; i < 16; i++)
            {
                float r = colorR[i], g = colorG[i], b = colorB[i];
                if (useDithering) { r += errorR[i]; g += errorG[i]; b += errorB[i]; }

                float wr = r * lumR, wg = g * lumG, wb = b * lumB;
                float fDot = (wr - wPalR[0]) * encDirR + (wg - wPalG[0]) * encDirG + (wb - wPalB[0]) * encDirB;
                int iStep = fDot <= 0 ? 0 : (fDot >= 3.0f ? 1 : stepMap[(int)(fDot + 0.5f)]);

                bits |= (uint)iStep << (i * 2);

                if (useDithering)
                {
                    float diffR = r - palR[iStep == 0 ? 0 : (iStep == 1 ? 1 : (iStep == 2 ? 2 : 3))];
                    float diffG = g - palG[iStep == 0 ? 0 : (iStep == 1 ? 1 : (iStep == 2 ? 2 : 3))];
                    float diffB = b - palB[iStep == 0 ? 0 : (iStep == 1 ? 1 : (iStep == 2 ? 2 : 3))];

                    if ((i & 3) != 3 && i + 1 < 16) { errorR[i + 1] += diffR * (7.0f / 16.0f); errorG[i + 1] += diffG * (7.0f / 16.0f); errorB[i + 1] += diffB * (7.0f / 16.0f); }
                    if (i < 12)
                    {
                        if ((i & 3) != 0) { errorR[i + 3] += diffR * (3.0f / 16.0f); errorG[i + 3] += diffG * (3.0f / 16.0f); errorB[i + 3] += diffB * (3.0f / 16.0f); }
                        errorR[i + 4] += diffR * (5.0f / 16.0f); errorG[i + 4] += diffG * (5.0f / 16.0f); errorB[i + 4] += diffB * (5.0f / 16.0f);
                        if ((i & 3) != 3) { errorR[i + 5] += diffR * (1.0f / 16.0f); errorG[i + 5] += diffG * (1.0f / 16.0f); errorB[i + 5] += diffB * (1.0f / 16.0f); }
                    }
                }
            }

            output[offset + 4] = (byte)(bits & 0xFF);
            output[offset + 5] = (byte)((bits >> 8) & 0xFF);
            output[offset + 6] = (byte)((bits >> 16) & 0xFF);
            output[offset + 7] = (byte)((bits >> 24) & 0xFF);
        }
    }
}
