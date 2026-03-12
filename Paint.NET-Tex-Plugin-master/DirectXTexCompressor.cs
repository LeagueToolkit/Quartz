////////////////////////////////////////////////////////////////////////
//
// DirectXTex BC1/BC3 Compression - Pure C# Port
// Based on Microsoft DirectXTex (MIT License)
// Exact line-by-line port of BC.cpp D3DXEncodeBC1
//
////////////////////////////////////////////////////////////////////////

using System;

namespace TexFileTypePlugin
{
    /// <summary>
    /// Pure C# implementation of DirectXTex BC1/BC3 compression with dithering
    /// </summary>
    internal static class DirectXTexCompressor
    {
        private const int NUM_PIXELS_PER_BLOCK = 16;

        // Perceptual weightings from DirectXTex BC.cpp (line 30-31)
        private const float LumR = 0.2125f / 0.7154f;
        private const float LumG = 1.0f;
        private const float LumB = 0.0721f / 0.7154f;
        private const float LumRInv = 0.7154f / 0.2125f;
        private const float LumBInv = 0.7154f / 0.0721f;

        public static byte[] CompressBC1(byte[] rgba, int width, int height, bool useDithering, bool usePerceptual)
        {
            int blockWidth = (width + 3) / 4;
            int blockHeight = (height + 3) / 4;
            byte[] output = new byte[blockWidth * blockHeight * 8];

            for (int by = 0; by < blockHeight; by++)
            {
                for (int bx = 0; bx < blockWidth; bx++)
                {
                    float[] pColorR = new float[16];
                    float[] pColorG = new float[16];
                    float[] pColorB = new float[16];

                    for (int y = 0; y < 4; y++)
                    {
                        for (int x = 0; x < 4; x++)
                        {
                            int px = bx * 4 + x;
                            int py = by * 4 + y;
                            int idx = y * 4 + x;

                            if (px < width && py < height)
                            {
                                int pixelIdx = (py * width + px) * 4;
                                pColorR[idx] = rgba[pixelIdx] / 255.0f;
                                pColorG[idx] = rgba[pixelIdx + 1] / 255.0f;
                                pColorB[idx] = rgba[pixelIdx + 2] / 255.0f;
                            }
                        }
                    }

                    int blockOffset = (by * blockWidth + bx) * 8;
                    D3DXEncodeBC1(pColorR, pColorG, pColorB, output, blockOffset, useDithering, usePerceptual);
                }
            }

            return output;
        }

        public static byte[] CompressBC3(byte[] rgba, int width, int height, bool useDithering, bool usePerceptual)
        {
            int blockWidth = (width + 3) / 4;
            int blockHeight = (height + 3) / 4;
            byte[] output = new byte[blockWidth * blockHeight * 16];

            for (int by = 0; by < blockHeight; by++)
            {
                for (int bx = 0; bx < blockWidth; bx++)
                {
                    float[] pColorR = new float[16];
                    float[] pColorG = new float[16];
                    float[] pColorB = new float[16];
                    byte[] pAlpha = new byte[16];

                    for (int y = 0; y < 4; y++)
                    {
                        for (int x = 0; x < 4; x++)
                        {
                            int px = bx * 4 + x;
                            int py = by * 4 + y;
                            int idx = y * 4 + x;

                            if (px < width && py < height)
                            {
                                int pixelIdx = (py * width + px) * 4;
                                pColorR[idx] = rgba[pixelIdx] / 255.0f;
                                pColorG[idx] = rgba[pixelIdx + 1] / 255.0f;
                                pColorB[idx] = rgba[pixelIdx + 2] / 255.0f;
                                pAlpha[idx] = rgba[pixelIdx + 3];
                            }
                            else
                            {
                                pAlpha[idx] = 255;
                            }
                        }
                    }

                    int blockOffset = (by * blockWidth + bx) * 16;
                    EncodeBC3Alpha(pAlpha, output, blockOffset);
                    D3DXEncodeBC1(pColorR, pColorG, pColorB, output, blockOffset + 8, useDithering, usePerceptual);
                }
            }

            return output;
        }

        // Exact port of D3DXEncodeBC1 from BC.cpp lines 374-684
        private static void D3DXEncodeBC1(float[] pColorR, float[] pColorG, float[] pColorB, 
            byte[] output, int offset, bool useDithering, bool usePerceptual)
        {
            uint bcflags = 0;
            if (useDithering) bcflags |= 0x10000; // BC_FLAGS_DITHER_RGB
            if (!usePerceptual) bcflags |= 0x20000; // BC_FLAGS_UNIFORM

            // Determine uSteps (4 for opaque BC1)
            uint uSteps = 4;

            // Quantize block to R5G6B5, using Floyd-Steinberg error diffusion
            // This increases the chance that colors will map directly to the quantized axis endpoints.
            float[] ColorR = new float[16];
            float[] ColorG = new float[16];
            float[] ColorB = new float[16];
            float[] ErrorR = new float[16];
            float[] ErrorG = new float[16];
            float[] ErrorB = new float[16];

            for (int i = 0; i < NUM_PIXELS_PER_BLOCK; i++)
            {
                float clrR = pColorR[i];
                float clrG = pColorG[i];
                float clrB = pColorB[i];

                if (useDithering)
                {
                    clrR += ErrorR[i];
                    clrG += ErrorG[i];
                    clrB += ErrorB[i];
                }

                // Quantize to RGB565 and back - NO CLAMPING here (matches DirectXTex BC.cpp line 433)
                // The cast to int naturally handles out-of-range values
                ColorR[i] = (float)((int)(clrR * 31.0f + 0.5f)) * (1.0f / 31.0f);
                ColorG[i] = (float)((int)(clrG * 63.0f + 0.5f)) * (1.0f / 63.0f);
                ColorB[i] = (float)((int)(clrB * 31.0f + 0.5f)) * (1.0f / 31.0f);

                if (useDithering)
                {
                    float diffR = clrR - ColorR[i];
                    float diffG = clrG - ColorG[i];
                    float diffB = clrB - ColorB[i];

                    if ((i & 3) != 3 && i < 15)
                    {
                        ErrorR[i + 1] += diffR * (7.0f / 16.0f);
                        ErrorG[i + 1] += diffG * (7.0f / 16.0f);
                        ErrorB[i + 1] += diffB * (7.0f / 16.0f);
                    }
                    if (i < 12)
                    {
                        if ((i & 3) != 0)
                        {
                            ErrorR[i + 3] += diffR * (3.0f / 16.0f);
                            ErrorG[i + 3] += diffG * (3.0f / 16.0f);
                            ErrorB[i + 3] += diffB * (3.0f / 16.0f);
                        }
                        ErrorR[i + 4] += diffR * (5.0f / 16.0f);
                        ErrorG[i + 4] += diffG * (5.0f / 16.0f);
                        ErrorB[i + 4] += diffB * (5.0f / 16.0f);
                        if ((i & 3) != 3)
                        {
                            ErrorR[i + 5] += diffR * (1.0f / 16.0f);
                            ErrorG[i + 5] += diffG * (1.0f / 16.0f);
                            ErrorB[i + 5] += diffB * (1.0f / 16.0f);
                        }
                    }
                }

                // Apply luminance AFTER dithering error calculation (BC.cpp lines 484-489)
                if (usePerceptual)
                {
                    ColorR[i] *= LumR;
                    ColorG[i] *= LumG;
                    ColorB[i] *= LumB;
                }
            }

            // OptimizeRGB - find optimal endpoints
            float minR, minG, minB, maxR, maxG, maxB;
            OptimizeRGB(ColorR, ColorG, ColorB, out minR, out minG, out minB, out maxR, out maxG, out maxB, uSteps, usePerceptual);

            // Convert back from perceptual space if needed
            float ColorCR, ColorCG, ColorCB, ColorDR, ColorDG, ColorDB;
            if (usePerceptual)
            {
                ColorCR = minR * LumRInv;
                ColorCG = minG;
                ColorCB = minB * LumBInv;
                ColorDR = maxR * LumRInv;
                ColorDG = maxG;
                ColorDB = maxB * LumBInv;
            }
            else
            {
                ColorCR = minR; ColorCG = minG; ColorCB = minB;
                ColorDR = maxR; ColorDG = maxG; ColorDB = maxB;
            }

            ushort wColorA = Encode565(ColorCR, ColorCG, ColorCB);
            ushort wColorB = Encode565(ColorDR, ColorDG, ColorDB);

            // Handle degenerate case
            if (uSteps == 4 && wColorA == wColorB)
            {
                output[offset] = (byte)(wColorA & 0xFF);
                output[offset + 1] = (byte)(wColorA >> 8);
                output[offset + 2] = (byte)(wColorB & 0xFF);
                output[offset + 3] = (byte)(wColorB >> 8);
                output[offset + 4] = 0;
                output[offset + 5] = 0;
                output[offset + 6] = 0;
                output[offset + 7] = 0;
                return;
            }

            // Decode the colors back for exact palette
            Decode565(wColorA, out ColorCR, out ColorCG, out ColorCB);
            Decode565(wColorB, out ColorDR, out ColorDG, out ColorDB);

            // Apply luminance weighting to decoded colors
            float ColorAR, ColorAG, ColorAB, ColorBR, ColorBG, ColorBB;
            if (usePerceptual)
            {
                ColorAR = ColorCR * LumR;
                ColorAG = ColorCG * LumG;
                ColorAB = ColorCB * LumB;
                ColorBR = ColorDR * LumR;
                ColorBG = ColorDG * LumG;
                ColorBB = ColorDB * LumB;
            }
            else
            {
                ColorAR = ColorCR; ColorAG = ColorCG; ColorAB = ColorCB;
                ColorBR = ColorDR; ColorBG = ColorDG; ColorBB = ColorDB;
            }

            // Calculate color steps - this MUST match BC.cpp lines 546-582
            float[] StepR = new float[4];
            float[] StepG = new float[4];
            float[] StepB = new float[4];

            // Determine ordering based on encoded values
            bool swap = (uSteps == 4) ? (wColorA < wColorB) : (wColorA > wColorB);

            if (swap)
            {
                output[offset] = (byte)(wColorB & 0xFF);
                output[offset + 1] = (byte)(wColorB >> 8);
                output[offset + 2] = (byte)(wColorA & 0xFF);
                output[offset + 3] = (byte)(wColorA >> 8);

                StepR[0] = ColorBR; StepG[0] = ColorBG; StepB[0] = ColorBB;
                StepR[1] = ColorAR; StepG[1] = ColorAG; StepB[1] = ColorAB;
            }
            else
            {
                output[offset] = (byte)(wColorA & 0xFF);
                output[offset + 1] = (byte)(wColorA >> 8);
                output[offset + 2] = (byte)(wColorB & 0xFF);
                output[offset + 3] = (byte)(wColorB >> 8);

                StepR[0] = ColorAR; StepG[0] = ColorAG; StepB[0] = ColorAB;
                StepR[1] = ColorBR; StepG[1] = ColorBG; StepB[1] = ColorBB;
            }

            // Interpolated steps - BC.cpp lines 574-582
            // HDRColorALerp(&Step[2], &Step[0], &Step[1], 1.0f / 3.0f);
            // HDRColorALerp(&Step[3], &Step[0], &Step[1], 2.0f / 3.0f);
            StepR[2] = StepR[0] + (StepR[1] - StepR[0]) * (1.0f / 3.0f);
            StepG[2] = StepG[0] + (StepG[1] - StepG[0]) * (1.0f / 3.0f);
            StepB[2] = StepB[0] + (StepB[1] - StepB[0]) * (1.0f / 3.0f);
            StepR[3] = StepR[0] + (StepR[1] - StepR[0]) * (2.0f / 3.0f);
            StepG[3] = StepG[0] + (StepG[1] - StepG[0]) * (2.0f / 3.0f);
            StepB[3] = StepB[0] + (StepB[1] - StepB[0]) * (2.0f / 3.0f);

            // Calculate color direction - BC.cpp lines 584-596
            float DirR = StepR[1] - StepR[0];
            float DirG = StepG[1] - StepG[0];
            float DirB = StepB[1] - StepB[0];

            float fSteps = (float)(uSteps - 1);
            float fLenSq = DirR * DirR + DirG * DirG + DirB * DirB;
            float fScale = (fLenSq > 0) ? (fSteps / fLenSq) : 0;

            DirR *= fScale;
            DirG *= fScale;
            DirB *= fScale;

            // pSteps4 = { 0, 2, 3, 1 } - BC.cpp line 567
            int[] pSteps = { 0, 2, 3, 1 };

            // Reset error for encoding - BC.cpp lines 600-601
            if (useDithering)
            {
                Array.Clear(ErrorR, 0, 16);
                Array.Clear(ErrorG, 0, 16);
                Array.Clear(ErrorB, 0, 16);
            }

            // Encode colors - BC.cpp lines 603-682
            uint dw = 0;
            for (int i = 0; i < NUM_PIXELS_PER_BLOCK; i++)
            {
                float clrR, clrG, clrB;
                if (usePerceptual)
                {
                    clrR = pColorR[i] * LumR;
                    clrG = pColorG[i] * LumG;
                    clrB = pColorB[i] * LumB;
                }
                else
                {
                    clrR = pColorR[i];
                    clrG = pColorG[i];
                    clrB = pColorB[i];
                }

                if (useDithering)
                {
                    clrR += ErrorR[i];
                    clrG += ErrorG[i];
                    clrB += ErrorB[i];
                }

                // BC.cpp line 633
                float fDot = (clrR - StepR[0]) * DirR + (clrG - StepG[0]) * DirG + (clrB - StepB[0]) * DirB;

                // BC.cpp lines 635-641
                int iStep;
                if (fDot <= 0.0f)
                    iStep = 0;
                else if (fDot >= fSteps)
                    iStep = 1;
                else
                    iStep = pSteps[(int)(fDot + 0.5f)];

                // BC.cpp line 643
                dw = ((uint)iStep << 30) | (dw >> 2);

                // BC.cpp lines 645-680
                if (useDithering)
                {
                    float diffR = clrR - StepR[iStep];
                    float diffG = clrG - StepG[iStep];
                    float diffB = clrB - StepB[iStep];

                    if ((i & 3) != 3 && i < 15)
                    {
                        ErrorR[i + 1] += diffR * (7.0f / 16.0f);
                        ErrorG[i + 1] += diffG * (7.0f / 16.0f);
                        ErrorB[i + 1] += diffB * (7.0f / 16.0f);
                    }
                    if (i < 12)
                    {
                        if ((i & 3) != 0)
                        {
                            ErrorR[i + 3] += diffR * (3.0f / 16.0f);
                            ErrorG[i + 3] += diffG * (3.0f / 16.0f);
                            ErrorB[i + 3] += diffB * (3.0f / 16.0f);
                        }
                        ErrorR[i + 4] += diffR * (5.0f / 16.0f);
                        ErrorG[i + 4] += diffG * (5.0f / 16.0f);
                        ErrorB[i + 4] += diffB * (5.0f / 16.0f);
                        if ((i & 3) != 3)
                        {
                            ErrorR[i + 5] += diffR * (1.0f / 16.0f);
                            ErrorG[i + 5] += diffG * (1.0f / 16.0f);
                            ErrorB[i + 5] += diffB * (1.0f / 16.0f);
                        }
                    }
                }
            }

            output[offset + 4] = (byte)(dw & 0xFF);
            output[offset + 5] = (byte)((dw >> 8) & 0xFF);
            output[offset + 6] = (byte)((dw >> 16) & 0xFF);
            output[offset + 7] = (byte)((dw >> 24) & 0xFF);
        }

        // Port of OptimizeRGB from BC.cpp lines 83-321
        private static void OptimizeRGB(float[] colorR, float[] colorG, float[] colorB,
            out float xR, out float xG, out float xB, out float yR, out float yG, out float yB,
            uint uSteps, bool usePerceptual)
        {
            // Find bounding box
            xR = xG = xB = 1.0f;
            yR = yG = yB = 0.0f;

            for (int i = 0; i < NUM_PIXELS_PER_BLOCK; i++)
            {
                if (colorR[i] < xR) xR = colorR[i];
                if (colorG[i] < xG) xG = colorG[i];
                if (colorB[i] < xB) xB = colorB[i];
                if (colorR[i] > yR) yR = colorR[i];
                if (colorG[i] > yG) yG = colorG[i];
                if (colorB[i] > yB) yB = colorB[i];
            }

            // Diagonal axis
            float abR = yR - xR;
            float abG = yG - xG;
            float abB = yB - xB;
            float fAB = abR * abR + abG * abG + abB * abB;

            if (fAB < float.Epsilon)
                return;

            // Try all four axis directions
            float fABInv = 1.0f / fAB;
            float dirR = abR * fABInv;
            float dirG = abG * fABInv;
            float dirB = abB * fABInv;

            float midR = (xR + yR) * 0.5f;
            float midG = (xG + yG) * 0.5f;
            float midB = (xB + yB) * 0.5f;

            float[] fDir = new float[4];
            for (int i = 0; i < NUM_PIXELS_PER_BLOCK; i++)
            {
                float ptR = (colorR[i] - midR) * dirR;
                float ptG = (colorG[i] - midG) * dirG;
                float ptB = (colorB[i] - midB) * dirB;

                float f;
                f = ptR + ptG + ptB; fDir[0] += f * f;
                f = ptR + ptG - ptB; fDir[1] += f * f;
                f = ptR - ptG + ptB; fDir[2] += f * f;
                f = ptR - ptG - ptB; fDir[3] += f * f;
            }

            int iDirMax = 0;
            float fDirMax = fDir[0];
            for (int iDir = 1; iDir < 4; iDir++)
            {
                if (fDir[iDir] > fDirMax) { fDirMax = fDir[iDir]; iDirMax = iDir; }
            }

            if ((iDirMax & 2) != 0) { float t = xG; xG = yG; yG = t; }
            if ((iDirMax & 1) != 0) { float t = xB; xB = yB; yB = t; }

            // Two color block.. no need to root-find (BC.cpp line 198)
            if (fAB < 1.0f / 4096.0f)
            {
                // Clamp to valid range before returning
                xR = Clamp01(xR); xG = Clamp01(xG); xB = Clamp01(xB);
                yR = Clamp01(yR); yG = Clamp01(yG); yB = Clamp01(yB);
                return;
            }

            // Newton's method optimization (8 iterations) - lines 215-315
            float fSteps = (float)(uSteps - 1);
            float[] pC = { 1.0f, 0.0f };
            float[] pD = { 0.0f, 1.0f };

            if (uSteps == 4)
            {
                pC = new float[] { 1.0f, 2.0f / 3.0f, 1.0f / 3.0f, 0.0f };
                pD = new float[] { 0.0f, 1.0f / 3.0f, 2.0f / 3.0f, 1.0f };
            }
            else
            {
                pC = new float[] { 1.0f, 1.0f / 2.0f, 0.0f };
                pD = new float[] { 0.0f, 1.0f / 2.0f, 1.0f };
            }

            const float fEpsilon = (0.25f / 64.0f) * (0.25f / 64.0f);

            for (int iIteration = 0; iIteration < 8; iIteration++)
            {
                float dxR = yR - xR, dxG = yG - xG, dxB = yB - xB;
                float fLen = dxR * dxR + dxG * dxG + dxB * dxB;

                if (fLen < 1.0f / 4096.0f)
                    break;

                float fScl = fSteps / fLen;
                dxR *= fScl; dxG *= fScl; dxB *= fScl;

                // Build palette
                float[] stepR = new float[(int)uSteps];
                float[] stepG = new float[(int)uSteps];
                float[] stepB = new float[(int)uSteps];
                for (int iStep = 0; iStep < (int)uSteps; iStep++)
                {
                    stepR[iStep] = xR * pC[iStep] + yR * pD[iStep];
                    stepG[iStep] = xG * pC[iStep] + yG * pD[iStep];
                    stepB[iStep] = xB * pC[iStep] + yB * pD[iStep];
                }

                float d2X = 0, d2Y = 0;
                float dXR = 0, dXG = 0, dXB = 0;
                float dYR = 0, dYG = 0, dYB = 0;

                for (int iPoint = 0; iPoint < NUM_PIXELS_PER_BLOCK; iPoint++)
                {
                    float fDot = (colorR[iPoint] - xR) * dxR + (colorG[iPoint] - xG) * dxG + (colorB[iPoint] - xB) * dxB;
                    int iStep;
                    if (fDot <= 0.0f)
                        iStep = 0;
                    else if (fDot >= fSteps)
                        iStep = (int)uSteps - 1;
                    else
                        iStep = (int)(fDot + 0.5f);

                    float diffR = stepR[iStep] - colorR[iPoint];
                    float diffG = stepG[iStep] - colorG[iPoint];
                    float diffB = stepB[iStep] - colorB[iPoint];

                    float fC = pC[iStep] * (1.0f / 8.0f);
                    float fD = pD[iStep] * (1.0f / 8.0f);

                    d2X += fC * pC[iStep];
                    dXR += fC * diffR;
                    dXG += fC * diffG;
                    dXB += fC * diffB;

                    d2Y += fD * pD[iStep];
                    dYR += fD * diffR;
                    dYG += fD * diffG;
                    dYB += fD * diffB;
                }

                if (d2X > 0.0f)
                {
                    float f = -1.0f / d2X;
                    xR += dXR * f; xG += dXG * f; xB += dXB * f;
                }

                if (d2Y > 0.0f)
                {
                    float f = -1.0f / d2Y;
                    yR += dYR * f; yG += dYG * f; yB += dYB * f;
                }

                if (dXR * dXR < fEpsilon && dXG * dXG < fEpsilon && dXB * dXB < fEpsilon &&
                    dYR * dYR < fEpsilon && dYG * dYG < fEpsilon && dYB * dYB < fEpsilon)
                    break;
            }

            // Clamp to valid range
            xR = Clamp01(xR); xG = Clamp01(xG); xB = Clamp01(xB);
            yR = Clamp01(yR); yG = Clamp01(yG); yB = Clamp01(yB);
        }

        private static void EncodeBC3Alpha(byte[] alphas, byte[] output, int offset)
        {
            byte minAlpha = 255, maxAlpha = 0;
            for (int i = 0; i < 16; i++)
            {
                if (alphas[i] < minAlpha) minAlpha = alphas[i];
                if (alphas[i] > maxAlpha) maxAlpha = alphas[i];
            }

            output[offset] = maxAlpha;
            output[offset + 1] = minAlpha;

            byte[] palette = new byte[8];
            palette[0] = maxAlpha;
            palette[1] = minAlpha;

            if (maxAlpha > minAlpha)
            {
                for (int i = 1; i < 7; i++)
                    palette[i + 1] = (byte)((maxAlpha * (7 - i) + minAlpha * i + 3) / 7);
            }
            else
            {
                for (int i = 1; i < 5; i++)
                    palette[i + 1] = (byte)((maxAlpha * (5 - i) + minAlpha * i + 2) / 5);
                palette[6] = 0;
                palette[7] = 255;
            }

            ulong bits = 0;
            for (int i = 0; i < 16; i++)
            {
                int bestIndex = 0;
                int bestDiff = Math.Abs(alphas[i] - palette[0]);
                for (int j = 1; j < 8; j++)
                {
                    int diff = Math.Abs(alphas[i] - palette[j]);
                    if (diff < bestDiff) { bestDiff = diff; bestIndex = j; }
                }
                bits |= ((ulong)bestIndex << (i * 3));
            }

            for (int i = 0; i < 6; i++)
                output[offset + 2 + i] = (byte)(bits >> (i * 8));
        }

        private static float Clamp01(float v) => v < 0 ? 0 : (v > 1 ? 1 : v);

        private static ushort Encode565(float r, float g, float b)
        {
            return (ushort)(
                ((int)(Clamp01(r) * 31.0f + 0.5f) << 11) |
                ((int)(Clamp01(g) * 63.0f + 0.5f) << 5) |
                (int)(Clamp01(b) * 31.0f + 0.5f));
        }

        private static void Decode565(ushort w, out float r, out float g, out float b)
        {
            r = ((w >> 11) & 31) / 31.0f;
            g = ((w >> 5) & 63) / 63.0f;
            b = (w & 31) / 31.0f;
        }
    }
}
