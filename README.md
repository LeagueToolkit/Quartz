# Quartz - League of Legends Modding Suite

A comprehensive toolkit for League of Legends modding and visual effects editing, built with Electron and React.

## ⚠️ IMPORTANT SETUP REQUIRED ⚠️

**Before using any features, you MUST configure the following in Settings:**

1. **Hash Files**: Hash files are automatically downloaded and managed. If missing, a reminder will appear on first launch to download them automatically.
2. **Ritobin CLI**: The ritobin executable is automatically bundled and configured. You can set a custom path in Settings if needed.

**These settings are required for most Quartz features to function properly!**

## 🔗 Key Dependencies & Credits

- **[Upscayl](https://github.com/upscayl)** - Free and open source AI Image Upscaler for Linux, MacOS and Windows
- **[Upscayl NCNN](https://github.com/upscayl/upscayl-ncnn)** - The Upscayl backend powered by the NCNN framework and Real-ESRGAN architecture

<img width="1190" height="796" alt="image" src="https://github.com/user-attachments/assets/c491ceff-8f2c-44d0-8f8f-c54f8cfa5adc" />


## 🚀 Main Features

### Settings
- **Theme Creator**: Create and customize your own themes with full control over colors, fonts, and styling
  - **Custom Color Picker**: Same advanced color picker used in RGBA and Paint pages
  - **Live Preview**: See theme changes in real-time
  - **Advanced Options**: Fine-tune derived colors with sliders
- **Font Manager**: Manage and customize fonts throughout the application
- **Page Visibility**: Control which pages and features are visible in the interface
- **Hash Management**: Automatic hash file download and management
- **External Tools**: Configure ritobin CLI and manage backend services

<img width="1199" height="791" alt="image" src="https://github.com/user-attachments/assets/6727bb38-3e7c-497d-9d0a-e25acb3f12a2" />


### Paint - Advanced Particle Recoloring
- **Recolor Particles**: Mainly focused on recoloring particle effects with precision
- **Shades Generator**: Create custom shades and color variations
- **Shift Hue**: Shifts hue while keeping lightness and saturation intact for consistent results
- **Backup Button**: Located in bottom right corner for quick saves
- **Blend Mode Selection**: Choose blend modes for specific coloring effects (e.g., blendmode 1 for black coloring)
- **Random Gradient**: Places colors randomly with customizable color count
- **Image Texture Preview**: Hover over image symbol for instant texture preview
- **Search Functionality**: Search for emitter names, vfxsystem names, and texture names
- **Custom Palettes**: Create and save your own color palettes for reuse

<img width="1189" height="796" alt="image" src="https://github.com/user-attachments/assets/4b69e422-e487-4943-818b-e7460b2c5073" />


### Port - Advanced VFX Porting
- **Load Target & Donor**: Load target and donor bin files for porting operations
- **Port Emitters**: Transfer individual emitters between projects
- **Port VFXSystems**: Drag and drop entire vfxsystems from donor to target
- **Automatic Asset Management**: Automatically places textures into your target bin project folder
- **Persistent Effects**: Add persistent effects via bottom right persistent button
- **Idle Particle Setup**: Set vfxsystem as Idle particle
- **Matrix Support**: Add matrix transformations to vfxsystems
- **Child Emitters**: Create child emitters for child particles
- **Advanced Filtering**: Filter by emitter name, vfxsystem name, texture name
- **Empty VFXSystem Creation**: Create empty vfxsystems for nesting with emitters

<img width="1189" height="784" alt="image" src="https://github.com/user-attachments/assets/f33e007e-1b99-4351-b23d-c26657fd8d0f" />


### VfxHub - Community VFX Database
- **Upload VFXSystems**: Upload vfxsystems to GitHub-hosted database
- **Image Support**: Add images to vfxsystems for better organization
- **Download Menu**: Access uploaded vfxsystems from the top download menu
- **Community Sharing**: Share and discover vfxsystems from other users
- **Full Port Functionality**: Includes all features from the Port section

<img width="1195" height="785" alt="image" src="https://github.com/user-attachments/assets/40420df1-5f18-4766-a99e-84633209f49c" />

### Asset Extractor - WAD Extraction & Repathing
- **Champion & Skin Selection**: Extract assets by selecting champions and skin IDs
- **Auto-Detection**: Automatically detects League of Legends Champions folder
- **WAD Extraction**: Extract WAD files with automatic output directory management
- **Automatic Repathing**: Automatically repaths mods or extracts filters
- **Voiceover Support**: Optional voiceover file extraction
- **Important**: Requires League of Legends Champions folder and WAD output directory configured in settings

<img width="1190" height="799" alt="image" src="https://github.com/user-attachments/assets/8ab284ef-c487-4269-8242-5bdaf39a6dbd" />

### Bineditor - Parameter Scaling
- **Emitter & VFXSystem Selection**: Select either emitters or vfxsystems for editing
- **Scale Operations**: Scale birthscale and scale by desired values (e.g., 2x multiplier)
- **Matrix Bug Fixes**: Useful when matrix transformations don't work properly
- **Batch Processing**: Apply scaling to multiple elements at once

<img width="1180" height="776" alt="image" src="https://github.com/user-attachments/assets/0657cf4b-1018-45af-b48c-659a7b551d49" />

### Image Recolor - Advanced Color Manipulation
- Multi-Format Support: Load and process PNG, JPG, DDS, and TEX files
- Precise Color Control: Fine-tune hue, saturation, and brightness adjustments
- Real-Time Preview: See changes instantly before exporting
- Batch Processing: Apply color transformations to multiple images at once

<img width="1185" height="787" alt="image" src="https://github.com/user-attachments/assets/a6275d20-4955-4b44-84a6-56059be4ee17" />


### Upscale - AI-Powered Image Enhancement
- **Upscayl Integration**: Powered by Upscayl for high-quality image upscaling
- **Batch Processing**: Upscale multiple images at once
- **Quality Preservation**: Maintains image quality during upscaling

<img width="1192" height="801" alt="image" src="https://github.com/user-attachments/assets/4c06006e-ffdd-444e-876c-082e9640796b" />


### RGBA - Color Code Generator
- **Custom Color Picker**: Advanced color picker with HSV, RGB, and HEX inputs
- **Color Picker**: Pick any color with alpha value support
- **League RGB Codes**: Get League of Legends RGB color codes
- **Alpha Support**: Full alpha channel support for transparency

<img width="1181" height="781" alt="image" src="https://github.com/user-attachments/assets/05cfcb77-9043-408c-a70c-230d6531e278" />


### AniPort Simple - Animation Porting
- **Animation Porting**: Port animations between different champions and skins
- **Clip Data Management**: Create and manage AtomicClipData with event maps
- **Animation File Path**: Automatic resource data structure management
- **VFX System Integration**: Full integration with VFX systems for complete animation porting

### Tools - Custom Executable Integration
- **Drag & Drop Exes**: Add custom executables by drag and dropping them into the window
- **Folder Processing**: Drag and drop folders onto exes for batch processing
- **Static Mat Fix**: Store tools like staticmatfix exe for easy access
- **Custom Workflows**: Create custom processing workflows

### File Handler - Advanced File Management
Two distinct modes:

#### Randomizer Mode
- **Custom Emotes**: Perfect for creating custom emotes
- **Image Selection**: Select any amount of images for randomization
- **Target Folder**: Choose target folder for processed files
- **Batch Randomization**: Randomizes every tex or dds with provided images

#### Renamer Mode
- **Map Mod Support**: Designed for editing map mods
- **Prefix/Suffix Management**: Add or delete custom prefixes and suffixes
- **Riot Compatibility**: Handles Riot's texture naming conventions
- **Batch Renaming**: Process multiple files at once

### Bumpath - Mod Repathing
- **Path Management**: Repath your mod files efficiently
- **Automatic Hash Management**: Uses integrated hash files for seamless operation
- **Smart Defaults**: "Ignore Missing Files" and "Combine Linked BINs" enabled by default
- **Compatibility**: Ensures mod compatibility across different setups


## 🔗 Links

- **GitHub Repository**: [Quartz](https://github.com/RitoShark/Quartz)
- **Issues**: Report bugs and request features
- **Discussions**: Community discussions and support

---

**Quartz** - Empowering League of Legends modders with professional-grade tools.
