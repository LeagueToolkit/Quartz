# Flint - Features Guide

Complete documentation of all Flint features and functionality.

---

## Project Management

### Creating a Project

1. Press **Ctrl+N** or click "New Project"
2. Enter project details:
   - **Project Name**: Internal name for your project
   - **Champion**: Select from the searchable dropdown
   - **Skin**: Choose the skin ID to modify
   - **Location**: Where project files will be stored

When created, Flint extracts all relevant assets from the champion's WAD file.

### Opening Existing Projects

1. Click "Open Project" on the welcome screen
2. Navigate to your project folder
3. Select the `mod.config.json` file

Recent projects appear on the welcome screen for quick access.

### Saving Projects

Press **Ctrl+S** to save your project. The status bar confirms when saved.

---

## File Tree Navigation

The left panel displays your project's file structure.

### Features:
- **Click** to select and preview a file
- **Double-click** folder to expand/collapse
- **Right-click** for context menu options
- **Search bar** at top to filter files by name

### File Icons:
- 📁 Folders
- 🖼️ Texture files (.dds, .png, .jpg)
- 📄 Property files (.bin)
- 📝 Text files (.py, .txt, .json)
- 📦 Other binary files

---

## Preview System

### DDS Texture Preview

For `.dds` texture files:
- **Scroll wheel**: Zoom in/out
- **Click and drag**: Pan the image
- **Toolbar buttons**: Fit to screen, 100%, 200%

Transparent textures display with a checkerboard background.

### BIN File Viewing

`.bin` files are displayed in a Python-like text format:
- Property names with their types
- Nested structures indented
- Hash values shown with resolved names when available

### Hex Viewer

Unknown file types show a hex dump:
- Left column: Address offset
- Center: Hex bytes
- Right column: ASCII representation

### Text Preview

Plain text files (.py, .txt, .json) display with:
- Syntax highlighting (where applicable)
- Line numbers
- Scrollable content

---

## Texture Recoloring

Flint includes powerful texture recoloring tools for quickly changing skin colors.

### Opening the Recolor Modal

1. **Right-click** on a texture file (.dds, .tex) or folder in the file tree
2. Select **"Recolor"** from the context menu

### Recoloring Modes

| Mode | Description | Best For |
|------|-------------|----------|
| **Hue Shift** | Rotates all colors around the color wheel | Subtle color variations |
| **Colorize** | Converts everything to one hue | Making textures a single color |
| **Grayscale + Tint** | Applies monochrome with color overlay | Stylized effects |

### Color Presets

Quick-select from 8 preset colors:
- Red, Orange, Gold, Green, Cyan, Blue, Purple, Pink

Or use the hue slider for precise control (0-360°).

### Batch Folder Recoloring

When recoloring a folder:
- All `.dds` and `.tex` files are processed recursively
- **Distortion textures are skipped by default** (they use special UV effects)
- Uncheck "Skip distortion textures" if you need to recolor them too

### Preview Controls

- **Click the preview** to toggle between original and modified view
- **Create checkpoint** option auto-saves project state before changes

### Smart Filtering

The recolor system automatically:
- Skips fully transparent pixels (preserves alpha)
- Skips very dark/black pixels (preserves backgrounds)
- Skips textures with "distortion" or "distort" in the filename

---

## Checkpoint System

Checkpoints let you save and restore project states.

### Creating a Checkpoint

1. Open the **History** panel (Project History tab)
2. Enter a checkpoint message describing the current state
3. Click **"Create Checkpoint"**

### Restoring a Checkpoint

1. Find the checkpoint in the list
2. Click the **restore icon** (↻)
3. Confirm the restore action

> **Warning:** Restoring overwrites your current project files!

### Comparing Checkpoints

Click the **compare icon** on any checkpoint to see:
- Files added since the previous checkpoint
- Files modified (with different hashes)
- Files deleted

### Auto-Checkpoints

Enable "Create checkpoint before recoloring" in the Recolor modal to automatically save your project state before making destructive changes.

---

## Export System

### Fantome Export (.fantome)

The primary export format for League mods.

**Process:**
1. Click "Export Mod" or press **Ctrl+E**
2. Enter metadata:
   - **Mod Name**: Shown in mod managers
   - **Author**: Your name/alias
   - **Description**: What the mod changes
3. Choose output location
4. Click "Export"

**Output:** A `.fantome` ZIP file containing:
- `META/info.json` - Mod metadata
- `WAD/` - Modified game files

### Compatibility

Exported mods work with:
- Fantome mod manager
- cslol-manager
- Other League mod tools supporting the fantome format

---

## Settings

Access via **Ctrl+,** or the gear icon.

### League Path
The path to your League of Legends installation. Auto-detected on first run, but can be changed manually.

**Expected path format:** `C:\Riot Games\League of Legends\Game`

### Hash Files
Hash files resolve internal file paths. They download automatically on first launch from CommunityDragon.

---

## Keyboard Shortcuts Reference

| Category | Shortcut | Action |
|----------|----------|--------|
| **Project** | Ctrl+N | New Project |
| | Ctrl+S | Save Project |
| | Ctrl+E | Export Mod |
| **Navigation** | Ctrl+, | Open Settings |
| | Escape | Close Modal/Dialog |
| **File Tree** | Enter | Expand selected folder |
| | Backspace | Go to parent folder |

---

## Status Bar

The bottom status bar displays:

**Left side:**
- Status indicator (🟢 Ready, 🟡 Working, 🔴 Error)
- Current status message

**Right side:**
- Hash count (number of loaded path hashes)
- Contextual information

---

## Tips & Best Practices

1. **Always save before exporting** - Ensures all changes are included
2. **Use descriptive project names** - Makes finding projects easier
3. **Keep backups** - Copy project folders before major changes
4. **Test frequently** - Export and test in-game after significant changes
5. **Check hash status** - If paths show as hashes, hashes may need updating
