////////////////////////////////////////////////////////////////////////
//
// TEX FileType for Paint.NET - Property-Based UI with Auto-Preview
// Uses the same PropertyBasedFileType approach as the DDS plugin
//
////////////////////////////////////////////////////////////////////////

using PaintDotNet;
using PaintDotNet.IndirectUI;
using PaintDotNet.PropertySystem;
using System;
using System.Collections.Generic;
using System.IO;

namespace TexFileTypePlugin
{
    public class TexFileTypeDialogFactory : IFileTypeFactory
    {
        public FileType[] GetFileTypeInstances()
        {
            return new FileType[] { new TexFileTypeDialog() };
        }
    }

    internal class TexFileTypeDialog : PropertyBasedFileType
    {
        private static readonly Dictionary<int, TexFileFormat> documentFormats = new();
        private static readonly Dictionary<int, bool> documentMipmaps = new();
        private static int lastLoadedDocHash = 0;

        public TexFileTypeDialog()
            : base(
                "League of Legends TEX (with options)",
                new FileTypeOptions
                {
                    LoadExtensions = new string[] { ".tex" },
                    SaveExtensions = new string[] { ".tex" }
                })
        {
        }

        public override PropertyCollection OnCreateSavePropertyCollection()
        {
            List<Property> props = new()
            {
                CreateFileFormat(),
                new BooleanProperty(PropertyNames.ErrorDiffusionDithering, true),
                StaticListChoiceProperty.CreateForEnum(PropertyNames.ErrorMetric, ErrorMetricType.Perceptual, false),
                new BooleanProperty(PropertyNames.GenerateMipMaps, false),
            };

            List<PropertyCollectionRule> rules = new()
            {
                // Dithering only applies to BC1 and BC3
                new ReadOnlyBoundToValueRule<object, StaticListChoiceProperty>(
                    PropertyNames.ErrorDiffusionDithering,
                    PropertyNames.FileFormat,
                    new object[] { TexFileFormat.DXT1_BC1, TexFileFormat.DXT5_BC3 },
                    true),
                // Error metric only applies to BC1 and BC3
                new ReadOnlyBoundToValueRule<object, StaticListChoiceProperty>(
                    PropertyNames.ErrorMetric,
                    PropertyNames.FileFormat,
                    new object[] { TexFileFormat.DXT1_BC1, TexFileFormat.DXT5_BC3 },
                    true),
            };

            return new PropertyCollection(props, rules);

            static StaticListChoiceProperty CreateFileFormat()
            {
                object[] values = new object[]
                {
                    TexFileFormat.DXT1_BC1,
                    TexFileFormat.DXT5_BC3,
                    TexFileFormat.BGRA8_Uncompressed,
                };

                int defaultChoiceIndex = Array.IndexOf(values, TexFileFormat.DXT5_BC3);

                return new StaticListChoiceProperty(PropertyNames.FileFormat, values, defaultChoiceIndex, false);
            }
        }

        public override ControlInfo OnCreateSaveConfigUI(PropertyCollection props)
        {
            ControlInfo configUI = CreateDefaultSaveConfigUI(props);

            // Format dropdown
            PropertyControlInfo formatPCI = configUI.FindControlForPropertyName(PropertyNames.FileFormat);
            formatPCI.ControlProperties[ControlInfoPropertyNames.DisplayName].Value = string.Empty;
            formatPCI.SetValueDisplayName(TexFileFormat.DXT1_BC1, "DXT1 / BC1 (no alpha)");
            formatPCI.SetValueDisplayName(TexFileFormat.DXT5_BC3, "DXT5 / BC3 (with alpha)");
            formatPCI.SetValueDisplayName(TexFileFormat.BGRA8_Uncompressed, "BGRA8 Uncompressed");

            // Dithering checkbox
            PropertyControlInfo ditheringPCI = configUI.FindControlForPropertyName(PropertyNames.ErrorDiffusionDithering);
            ditheringPCI.ControlProperties[ControlInfoPropertyNames.DisplayName].Value = string.Empty;
            ditheringPCI.ControlProperties[ControlInfoPropertyNames.Description].Value = "Error Diffusion Dithering";

            // Error metric radio buttons
            PropertyControlInfo errorMetricPCI = configUI.FindControlForPropertyName(PropertyNames.ErrorMetric);
            errorMetricPCI.ControlProperties[ControlInfoPropertyNames.DisplayName].Value = "Error Metric";
            errorMetricPCI.ControlType.Value = PropertyControlType.RadioButton;
            errorMetricPCI.SetValueDisplayName(ErrorMetricType.Perceptual, "Perceptual");
            errorMetricPCI.SetValueDisplayName(ErrorMetricType.Uniform, "Uniform");

            // Mipmaps checkbox
            PropertyControlInfo mipMapsPCI = configUI.FindControlForPropertyName(PropertyNames.GenerateMipMaps);
            mipMapsPCI.ControlProperties[ControlInfoPropertyNames.DisplayName].Value = string.Empty;
            mipMapsPCI.ControlProperties[ControlInfoPropertyNames.Description].Value = "Generate MipMaps";

            return configUI;
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
            int docHash = doc.GetHashCode();
            documentFormats[docHash] = (TexFileFormat)tex.Format;
            documentMipmaps[docHash] = tex.Mipmaps;
            lastLoadedDocHash = docHash;
            return doc;
        }

        protected override void OnSaveT(Document input, Stream output, PropertyBasedSaveConfigToken token, Surface scratchSurface, ProgressEventHandler progressCallback)
        {
            input.Flatten(scratchSurface);

            int width = scratchSurface.Width;
            int height = scratchSurface.Height;

            TexFileFormat fileFormat = (TexFileFormat)token.GetProperty(PropertyNames.FileFormat).Value;
            bool useDithering = token.GetProperty<BooleanProperty>(PropertyNames.ErrorDiffusionDithering).Value;
            ErrorMetricType errorMetric = (ErrorMetricType)token.GetProperty(PropertyNames.ErrorMetric).Value;
            bool generateMipmaps = token.GetProperty<BooleanProperty>(PropertyNames.GenerateMipMaps).Value;
            bool usePerceptual = errorMetric == ErrorMetricType.Perceptual;

            byte format = (byte)fileFormat;
            byte[] data;
            byte[] sourceRgba = null; // For mipmap generation

            if (fileFormat == TexFileFormat.BGRA8_Uncompressed)
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

                // Store source RGBA for mipmap generation
                sourceRgba = rgba;

                if (fileFormat == TexFileFormat.DXT1_BC1)
                {
                    data = DirectXTexCompressor.CompressBC1(rgba, width, height, useDithering, usePerceptual);
                }
                else
                {
                    data = DirectXTexCompressor.CompressBC3(rgba, width, height, useDithering, usePerceptual);
                }
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
                    return DirectXTexCompressor.CompressBC1(rgba, w, h, useDithering, usePerceptual);
                else // DXT5
                    return DirectXTexCompressor.CompressBC3(rgba, w, h, useDithering, usePerceptual);
            }, sourceRgba);
            output.Write(fileData, 0, fileData.Length);
        }

        public enum PropertyNames
        {
            FileFormat,
            ErrorDiffusionDithering,
            ErrorMetric,
            GenerateMipMaps,
        }
    }

    // File format enum matching TEX format bytes
    public enum TexFileFormat : byte
    {
        DXT1_BC1 = 10,
        DXT5_BC3 = 12,
        BGRA8_Uncompressed = 20,
    }

    // Error metric enum for compression quality
    public enum ErrorMetricType
    {
        Perceptual,
        Uniform
    }
}
