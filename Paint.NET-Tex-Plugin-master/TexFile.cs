using System;
using System.Collections.Generic;
using System.IO;

namespace TexFileTypePlugin
{
    internal class TexFile
    {
        public ushort Width { get; set; }
        public ushort Height { get; set; }
        public byte Format { get; set; }
        public bool Mipmaps { get; set; }
        public byte[] Data { get; set; }

        public const byte DXT1 = 10;
        public const byte DXT5 = 12;
        public const byte BGRA8 = 20;

        public static TexFile Read(byte[] data)
        {
            using (MemoryStream ms = new MemoryStream(data))
            using (BinaryReader br = new BinaryReader(ms))
            {
                uint signature = br.ReadUInt32();
                if (signature != 0x00584554)
                {
                    throw new FormatException($"Invalid TEX signature: 0x{signature:X8}");
                }

                TexFile tex = new TexFile
                {
                    Width = br.ReadUInt16(),
                    Height = br.ReadUInt16()
                };

                byte unknown1 = br.ReadByte();
                tex.Format = br.ReadByte();
                byte unknown2 = br.ReadByte();
                tex.Mipmaps = br.ReadBoolean();

                if (tex.Mipmaps && (tex.Format == DXT1 || tex.Format == DXT5 || tex.Format == BGRA8))
                {
                    int maxDim = Math.Max(tex.Width, tex.Height);
                    int mipmapCount = 0;
                    while (maxDim > 0)
                    {
                        mipmapCount++;
                        maxDim >>= 1;
                    }
                    
                    List<byte[]> mipmaps = new List<byte[]>();
                    for (int i = mipmapCount - 1; i >= 0; i--)
                    {
                        int mipWidth = Math.Max(tex.Width >> i, 1);
                        int mipHeight = Math.Max(tex.Height >> i, 1);
                        
                        int mipSize;
                        if (tex.Format == DXT1)
                        {
                            int blockWidth = (mipWidth + 3) / 4;
                            int blockHeight = (mipHeight + 3) / 4;
                            mipSize = blockWidth * blockHeight * 8;
                        }
                        else if (tex.Format == DXT5)
                        {
                            int blockWidth = (mipWidth + 3) / 4;
                            int blockHeight = (mipHeight + 3) / 4;
                            mipSize = blockWidth * blockHeight * 16;
                        }
                        else
                        {
                            mipSize = mipWidth * mipHeight * 4;
                        }
                        
                        byte[] mipData = br.ReadBytes(mipSize);
                        mipmaps.Add(mipData);
                    }
                    
                    tex.Data = mipmaps[mipmaps.Count - 1];
                }
                else
                {
                    int mainTextureSize;
                    if (tex.Format == DXT1)
                    {
                        int blockWidth = (tex.Width + 3) / 4;
                        int blockHeight = (tex.Height + 3) / 4;
                        mainTextureSize = blockWidth * blockHeight * 8;
                    }
                    else if (tex.Format == DXT5)
                    {
                        int blockWidth = (tex.Width + 3) / 4;
                        int blockHeight = (tex.Height + 3) / 4;
                        mainTextureSize = blockWidth * blockHeight * 16;
                    }
                    else if (tex.Format == BGRA8)
                    {
                        mainTextureSize = tex.Width * tex.Height * 4;
                    }
                    else
                    {
                        mainTextureSize = (int)(ms.Length - ms.Position);
                    }
                    
                    tex.Data = br.ReadBytes(mainTextureSize);
                }

                return tex;
            }
        }

        public byte[] Write()
        {
            return Write(null, null);
        }

        public byte[] Write(Func<byte[], int, int, byte, byte[]>? compressor)
        {
            return Write(compressor, null);
        }

        /// <summary>
        /// Write TEX file with optional mipmap generation
        /// </summary>
        /// <param name="compressor">Compression function for DXT formats</param>
        /// <param name="sourceRgba">Original uncompressed RGBA data for high-quality mipmap generation</param>
        public byte[] Write(Func<byte[], int, int, byte, byte[]>? compressor, byte[]? sourceRgba)
        {
            using (MemoryStream ms = new MemoryStream())
            using (BinaryWriter bw = new BinaryWriter(ms))
            {
                bw.Write((uint)0x00584554);
                bw.Write(Width);
                bw.Write(Height);
                bw.Write((byte)1);
                bw.Write(Format);
                bw.Write((byte)0);
                bw.Write(Mipmaps);

                if (Mipmaps && (Format == DXT1 || Format == DXT5 || Format == BGRA8))
                {
                    // Calculate number of mip levels
                    int maxDim = Math.Max(Width, Height);
                    int mipmapCount = 0;
                    int temp = maxDim;
                    while (temp > 0)
                    {
                        mipmapCount++;
                        temp >>= 1;
                    }

                    // Use source RGBA if provided, otherwise fallback to decompression
                    byte[] currentRgba;
                    if (sourceRgba != null)
                    {
                        // Use provided source RGBA - no quality loss
                        currentRgba = sourceRgba;
                    }
                    else if (Format == BGRA8)
                    {
                        // Data is BGRA, convert to RGBA
                        currentRgba = new byte[Data.Length];
                        for (int i = 0; i < Data.Length; i += 4)
                        {
                            currentRgba[i] = Data[i + 2];     // R
                            currentRgba[i + 1] = Data[i + 1]; // G
                            currentRgba[i + 2] = Data[i];     // B
                            currentRgba[i + 3] = Data[i + 3]; // A
                        }
                    }
                    else
                    {
                        // DXT compressed - need to decompress to RGBA (fallback)
                        currentRgba = DecompressToRgba();
                    }

                    // Generate all mip levels (from full size down to 1x1)
                    List<(byte[] data, int w, int h)> mipLevels = new();
                    int mipW = Width;
                    int mipH = Height;
                    byte[] mipRgba = currentRgba;

                    for (int i = 0; i < mipmapCount; i++)
                    {
                        byte[] mipData;
                        if (Format == BGRA8)
                        {
                            // Convert RGBA to BGRA
                            mipData = new byte[mipW * mipH * 4];
                            for (int j = 0; j < mipData.Length; j += 4)
                            {
                                mipData[j] = mipRgba[j + 2];     // B
                                mipData[j + 1] = mipRgba[j + 1]; // G
                                mipData[j + 2] = mipRgba[j];     // R
                                mipData[j + 3] = mipRgba[j + 3]; // A
                            }
                        }
                        else if (compressor != null)
                        {
                            // Compress using provided compressor
                            mipData = compressor(mipRgba, mipW, mipH, Format);
                        }
                        else
                        {
                            // No compressor provided, use original data for first level
                            if (i == 0)
                            {
                                mipData = Data;
                            }
                            else
                            {
                                // Skip mipmap generation if no compressor
                                break;
                            }
                        }

                        mipLevels.Add((mipData, mipW, mipH));

                        // Downsample for next level
                        if (mipW > 1 || mipH > 1)
                        {
                            int newW = Math.Max(mipW / 2, 1);
                            int newH = Math.Max(mipH / 2, 1);
                            mipRgba = DownsampleRgba(mipRgba, mipW, mipH, newW, newH);
                            mipW = newW;
                            mipH = newH;
                        }
                    }

                    // Write mip levels from smallest to largest
                    for (int i = mipLevels.Count - 1; i >= 0; i--)
                    {
                        bw.Write(mipLevels[i].data);
                    }
                }
                else
                {
                    bw.Write(Data);
                }

                return ms.ToArray();
            }
        }

        /// <summary>
        /// Lanczos kernel function
        /// </summary>
        private static double Lanczos(double x, double a)
        {
            if (x == 0) return 1.0;
            if (x < -a || x > a) return 0.0;
            double pix = Math.PI * x;
            return (Math.Sin(pix) / pix) * (Math.Sin(pix / a) / (pix / a));
        }

        /// <summary>
        /// Downsample RGBA image using Lanczos3 resampling
        /// </summary>
        private static byte[] DownsampleRgba(byte[] src, int srcW, int srcH, int dstW, int dstH)
        {
            byte[] dst = new byte[dstW * dstH * 4];
            const double a = 3.0; // Lanczos3 kernel size

            double scaleX = (double)srcW / dstW;
            double scaleY = (double)srcH / dstH;

            for (int y = 0; y < dstH; y++)
            {
                for (int x = 0; x < dstW; x++)
                {
                    // Source center position
                    double srcX = (x + 0.5) * scaleX - 0.5;
                    double srcY = (y + 0.5) * scaleY - 0.5;

                    // Calculate sample window
                    int x0 = Math.Max(0, (int)Math.Floor(srcX - a));
                    int x1 = Math.Min(srcW - 1, (int)Math.Ceiling(srcX + a));
                    int y0 = Math.Max(0, (int)Math.Floor(srcY - a));
                    int y1 = Math.Min(srcH - 1, (int)Math.Ceiling(srcY + a));

                    double r = 0, g = 0, b = 0, al = 0;
                    double weightSum = 0;

                    for (int sy = y0; sy <= y1; sy++)
                    {
                        double wy = Lanczos(sy - srcY, a);
                        for (int sx = x0; sx <= x1; sx++)
                        {
                            double wx = Lanczos(sx - srcX, a);
                            double w = wx * wy;
                            
                            int srcIdx = (sy * srcW + sx) * 4;
                            r += src[srcIdx] * w;
                            g += src[srcIdx + 1] * w;
                            b += src[srcIdx + 2] * w;
                            al += src[srcIdx + 3] * w;
                            weightSum += w;
                        }
                    }

                    int dstIdx = (y * dstW + x) * 4;
                    if (weightSum > 0)
                    {
                        dst[dstIdx] = (byte)Math.Clamp(r / weightSum + 0.5, 0, 255);
                        dst[dstIdx + 1] = (byte)Math.Clamp(g / weightSum + 0.5, 0, 255);
                        dst[dstIdx + 2] = (byte)Math.Clamp(b / weightSum + 0.5, 0, 255);
                        dst[dstIdx + 3] = (byte)Math.Clamp(al / weightSum + 0.5, 0, 255);
                    }
                }
            }

            return dst;
        }

        public byte[] DecompressToRgba()
        {
            if (Format == BGRA8)
            {
                return DecompressBgra8();
            }
            else if (Format == DXT1)
            {
                return DecompressDxt1();
            }
            else if (Format == DXT5)
            {
                return DecompressDxt5();
            }
            else
            {
                throw new FormatException($"Unsupported format: {Format}");
            }
        }

        private byte[] DecompressBgra8()
        {
            byte[] rgba = new byte[Width * Height * 4];
            for (int i = 0; i < Data.Length && i < rgba.Length; i += 4)
            {
                rgba[i] = Data[i + 2];
                rgba[i + 1] = Data[i + 1];
                rgba[i + 2] = Data[i];
                rgba[i + 3] = Data[i + 3];
            }
            return rgba;
        }

        private byte[] DecompressDxt1()
        {
            byte[] rgba = new byte[Width * Height * 4];
            int blockWidth = (Width + 3) / 4;
            int blockHeight = (Height + 3) / 4;

            for (int by = 0; by < blockHeight; by++)
            {
                for (int bx = 0; bx < blockWidth; bx++)
                {
                    int blockIdx = (by * blockWidth + bx) * 8;
                    if (blockIdx + 8 <= Data.Length)
                    {
                        DecompressDxt1Block(Data, blockIdx, bx * 4, by * 4, rgba);
                    }
                }
            }

            return rgba;
        }

        private byte[] DecompressDxt5()
        {
            byte[] rgba = new byte[Width * Height * 4];
            int blockWidth = (Width + 3) / 4;
            int blockHeight = (Height + 3) / 4;

            for (int by = 0; by < blockHeight; by++)
            {
                for (int bx = 0; bx < blockWidth; bx++)
                {
                    int blockIdx = (by * blockWidth + bx) * 16;
                    if (blockIdx + 16 <= Data.Length)
                    {
                        DecompressDxt5Block(Data, blockIdx, bx * 4, by * 4, rgba);
                    }
                }
            }

            return rgba;
        }

        private void DecompressDxt1Block(byte[] data, int offset, int x, int y, byte[] pixels)
        {
            ushort color0 = (ushort)(data[offset] | (data[offset + 1] << 8));
            ushort color1 = (ushort)(data[offset + 2] | (data[offset + 3] << 8));
            uint colorBits = (uint)(data[offset + 4] | (data[offset + 5] << 8) | (data[offset + 6] << 16) | (data[offset + 7] << 24));

            // Proper RGB565 to RGB888 expansion - replicate high bits into low bits for full range
            int r5_0 = (color0 >> 11) & 0x1F;
            int g6_0 = (color0 >> 5) & 0x3F;
            int b5_0 = color0 & 0x1F;
            int r5_1 = (color1 >> 11) & 0x1F;
            int g6_1 = (color1 >> 5) & 0x3F;
            int b5_1 = color1 & 0x1F;

            // 5-bit to 8-bit: (val << 3) | (val >> 2) expands 0-31 to 0-255
            // 6-bit to 8-bit: (val << 2) | (val >> 4) expands 0-63 to 0-255
            byte r0 = (byte)((r5_0 << 3) | (r5_0 >> 2));
            byte g0 = (byte)((g6_0 << 2) | (g6_0 >> 4));
            byte b0 = (byte)((b5_0 << 3) | (b5_0 >> 2));
            byte r1 = (byte)((r5_1 << 3) | (r5_1 >> 2));
            byte g1 = (byte)((g6_1 << 2) | (g6_1 >> 4));
            byte b1 = (byte)((b5_1 << 3) | (b5_1 >> 2));

            byte[][] colors = new byte[4][];
            colors[0] = new byte[] { r0, g0, b0, 255 };
            colors[1] = new byte[] { r1, g1, b1, 255 };

            if (color0 > color1)
            {
                colors[2] = new byte[] { (byte)((r0 * 2 + r1) / 3), (byte)((g0 * 2 + g1) / 3), (byte)((b0 * 2 + b1) / 3), 255 };
                colors[3] = new byte[] { (byte)((r0 + r1 * 2) / 3), (byte)((g0 + g1 * 2) / 3), (byte)((b0 + b1 * 2) / 3), 255 };
            }
            else
            {
                colors[2] = new byte[] { (byte)((r0 + r1) / 2), (byte)((g0 + g1) / 2), (byte)((b0 + b1) / 2), 255 };
                colors[3] = new byte[] { 0, 0, 0, 0 };
            }

            for (int py = 0; py < 4; py++)
            {
                for (int px = 0; px < 4; px++)
                {
                    if (x + px < Width && y + py < Height)
                    {
                        int idx = py * 4 + px;
                        int colorIdx = (int)((colorBits >> (idx * 2)) & 3);
                        int pixelIdx = ((y + py) * Width + (x + px)) * 4;
                        pixels[pixelIdx] = colors[colorIdx][0];
                        pixels[pixelIdx + 1] = colors[colorIdx][1];
                        pixels[pixelIdx + 2] = colors[colorIdx][2];
                        pixels[pixelIdx + 3] = colors[colorIdx][3];
                    }
                }
            }
        }

        private void DecompressDxt5Block(byte[] data, int offset, int x, int y, byte[] pixels)
        {
            byte alpha0 = data[offset];
            byte alpha1 = data[offset + 1];
            ulong alphaBits = 0;
            for (int i = 0; i < 6; i++)
            {
                alphaBits |= ((ulong)data[offset + 2 + i] << (i * 8));
            }

            byte[] alphas = new byte[8];
            alphas[0] = alpha0;
            alphas[1] = alpha1;
            if (alpha0 > alpha1)
            {
                for (int i = 1; i < 7; i++)
                {
                    alphas[i + 1] = (byte)(((7 - i) * alpha0 + i * alpha1) / 7);
                }
            }
            else
            {
                for (int i = 1; i < 5; i++)
                {
                    alphas[i + 1] = (byte)(((5 - i) * alpha0 + i * alpha1) / 5);
                }
                alphas[6] = 0;
                alphas[7] = 255;
            }

            ushort color0 = (ushort)(data[offset + 8] | (data[offset + 9] << 8));
            ushort color1 = (ushort)(data[offset + 10] | (data[offset + 11] << 8));
            uint colorBits = (uint)(data[offset + 12] | (data[offset + 13] << 8) | (data[offset + 14] << 16) | (data[offset + 15] << 24));

            // Proper RGB565 to RGB888 expansion - replicate high bits into low bits for full range
            int r5_0 = (color0 >> 11) & 0x1F;
            int g6_0 = (color0 >> 5) & 0x3F;
            int b5_0 = color0 & 0x1F;
            int r5_1 = (color1 >> 11) & 0x1F;
            int g6_1 = (color1 >> 5) & 0x3F;
            int b5_1 = color1 & 0x1F;

            byte r0 = (byte)((r5_0 << 3) | (r5_0 >> 2));
            byte g0 = (byte)((g6_0 << 2) | (g6_0 >> 4));
            byte b0 = (byte)((b5_0 << 3) | (b5_0 >> 2));
            byte r1 = (byte)((r5_1 << 3) | (r5_1 >> 2));
            byte g1 = (byte)((g6_1 << 2) | (g6_1 >> 4));
            byte b1 = (byte)((b5_1 << 3) | (b5_1 >> 2));

            byte[][] colors = new byte[4][];
            colors[0] = new byte[] { r0, g0, b0 };
            colors[1] = new byte[] { r1, g1, b1 };
            colors[2] = new byte[] { (byte)((r0 * 2 + r1) / 3), (byte)((g0 * 2 + g1) / 3), (byte)((b0 * 2 + b1) / 3) };
            colors[3] = new byte[] { (byte)((r0 + r1 * 2) / 3), (byte)((g0 + g1 * 2) / 3), (byte)((b0 + b1 * 2) / 3) };

            for (int py = 0; py < 4; py++)
            {
                for (int px = 0; px < 4; px++)
                {
                    if (x + px < Width && y + py < Height)
                    {
                        int idx = py * 4 + px;
                        int alphaIdx = (int)((alphaBits >> (idx * 3)) & 7);
                        int colorIdx = (int)((colorBits >> (idx * 2)) & 3);
                        int pixelIdx = ((y + py) * Width + (x + px)) * 4;
                        pixels[pixelIdx] = colors[colorIdx][0];
                        pixels[pixelIdx + 1] = colors[colorIdx][1];
                        pixels[pixelIdx + 2] = colors[colorIdx][2];
                        pixels[pixelIdx + 3] = alphas[alphaIdx];
                    }
                }
            }
        }
    }
}
