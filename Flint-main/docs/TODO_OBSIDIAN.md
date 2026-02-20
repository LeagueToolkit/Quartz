# Obsidian - WAD File Extractor Tool

> A standalone tool for browsing and extracting files from League of Legends WAD archives.  
> Inspired by the community tool "Obsidian" - a file extractor for checking in-game WADs and extracting singular files.

---

## Overview

Obsidian will be a dedicated WAD browser/extractor tool that allows users to:
- Browse the contents of any `.wad.client` file
- Search for specific files within WADs
- Extract individual files or batch selections
- Preview file contents before extracting

---

## Features Checklist

### Core Features
- [ ] **WAD File Browser**
  - [ ] Open any `.wad.client` file from disk
  - [ ] Display file tree of WAD contents (using hash dictionary for readable names)
  - [ ] Show file metadata (size, compression type, hash)
  
- [ ] **File Extraction**
  - [ ] Extract single files to a chosen location
  - [ ] Batch extract selected files
  - [ ] Preserve folder structure option
  - [ ] Extract all files from WAD

- [ ] **Search & Filter**
  - [ ] Search by filename/path pattern
  - [ ] Filter by file extension (.dds, .skn, .anm, .bin, etc.)
  - [ ] Filter by asset type (Textures, Models, Animations, etc.)

### Preview Features
- [ ] **Texture Preview** - Show DDS/TEX thumbnails
- [ ] **BIN Preview** - Show parsed BIN structure
- [ ] **Text Preview** - Display JSON, TXT, and other text files
- [ ] **Audio Preview** - Play audio files (BNK extraction if possible)

### Quality of Life
- [ ] **Recently Opened WADs** - Quick access to previously opened files
- [ ] **Drag & Drop** - Drop WAD files onto the window to open
- [ ] **Hash Lookup** - Show both hashed and unhashed paths
- [ ] **Copy Path** - Copy file path to clipboard
- [ ] **Auto-detect League** - Find game WADs automatically

---

## Technical Notes

### Existing Infrastructure to Reuse
- `ltk_wad` - WAD reading and chunk extraction
- `ltk_texture` - Texture decoding for previews
- `ltk_meta` - BIN parsing for preview
- Hash dictionary from `%APPDATA%/RitoShark/Requirements/Hashes/`

### New Components Needed
- [ ] Standalone window/module in Flint (or separate binary)
- [ ] WAD index/cache for faster browsing
- [ ] Extraction progress tracking
- [ ] File selection state management

---

## Implementation Priority

1. **Phase 1 - Basic Browser**
   - Open WAD, display file list, basic extraction

2. **Phase 2 - Enhanced UX**
   - Search, filter, previews

3. **Phase 3 - Advanced Features**
   - Batch operations, drag & drop, preferences

---

## References

- Original Obsidian tool from the modding community
- Existing Flint WAD handling in `src-tauri/src/commands/file.rs`
