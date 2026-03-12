# Paint.NET TEX Plugin

Load and save League of Legends .tex texture files in Paint.NET 5.1+

## Features
- Load DXT1, DXT5, and BGRA8 texture formats.
- Auto detect the compression, mipmaps and saves acordingly.
- Second saving option with a menu to manually pick the compression, error diffusion dithering and mipmap generation.
- Fast DXT compression/decompression using native C#.
- Great error diffusion dithering quality.
- Full alpha channel support.

## Requirements

- Paint.NET 5.1 or later (.NET 9)
- .NET 9.0 SDK (for building)
- Windows 10 or later

## Installation

1. Close Paint.NET
2. Open `C:\Program Files\Paint.NET\FileTypes`
3. Paste **TexFileType.dll** from the releases into this folder
4. Start Paint.NET
- Portable version note! In order to install the plugin on the portable version of Paint.NET please paste the dll file into `[Paint.NET folder]\FileTypes`

## Usage

### Opening TEX Files

- File → Open → Select your .tex file
- Drag and drop .tex files into Paint.NET

### Saving TEX Files

1. File → Save As
2. Choose "League of Legends TEX" from the file type dropdown

### Saving TEX Files with customizable settings
1. File → Save As
2. Choose League of Legends TEX (with options) from the file type dropdown

## Troubleshooting

**Paint.NET crashes or the file doesn't load**
- Make sure you're running the 5.1.11 (latest) version of Paint.NET

**Plugin doesn't appear in Paint.NET:**
- Make sure Paint.NET is completely closed
- Check the FileTypes folder exists: `C:\Program Files\Paint.NET`
- Verify **TexFileType.dll** is in the `FileTypes` folder

**"There was an error while saving the file." error when saving:**
- Make sure that the dimensions of the file are divisible by 4. This is a requirement for it to work in League.

## Credits

### Uses LtMAO's tex reading logic. Thanks to Tarngaina.
- GitHub: https://github.com/tarngaina/LtMAO

### Compression and Error Diffusion Dithering Logic
- BC1/BC3 compression with Floyd-Steinberg dithering is based on 
[Microsoft DirectXTex](https://github.com/microsoft/DirectXTex) (MIT License).
