# Flint - Quick Start Guide

Get modding in 5 minutes! This guide walks you through creating your first skin mod.

---

## Prerequisites

- **League of Legends** installed on your computer
- **Flint** installed (download from releases page)

---

## Step 1: First Launch

When you launch Flint for the first time:

1. **Hash files download automatically** - This may take 30-60 seconds on first run
2. **League path is auto-detected** - If not found, go to Settings (Ctrl+,) and set it manually

The status bar at the bottom shows:
- 🟢 Green = Ready
- 🟡 Yellow = Working
- 🔴 Red = Error

---

## Step 2: Create a New Project

1. Click **"New Project"** or press **Ctrl+N**
2. Fill in the project details:
   - **Project Name**: Give your mod a name (e.g., "Custom Ahri")
   - **Champion**: Select the champion to mod
   - **Skin**: Choose which skin to modify
   - **Project Location**: Where to save your project files
3. Click **"Create Project"**

Flint will extract all the skin's assets automatically. This may take a minute.

---

## Step 3: Browse & Edit Files

Once your project is created:

- **Left Panel**: File tree showing all extracted assets
- **Center Panel**: Preview/edit selected files

### File Types You Can Work With:

| Extension | Description | What Flint Does |
|-----------|-------------|-----------------|
| `.dds` | Textures | View with zoom/pan, **recolor with multiple modes** |
| `.tex` | Textures | View and **recolor** (League-specific format) |
| `.bin` | Property files | View as Python-like text, edit and save |
| `.py` | VFX scripts | Text editor preview |
| Other | Binary files | Hex viewer fallback |

---

## Step 4: Export Your Mod

When you're ready to test your mod:

1. Click **"Export Mod"** in the top bar or press **Ctrl+E**
2. Fill in metadata:
   - **Mod Name**: Display name for mod managers
   - **Author**: Your name
   - **Description**: What the mod does
3. Choose **Export Format**: Fantome (.fantome)
4. Select output location
5. Click **"Export"**

---

## Step 5: Install Your Mod

Use a mod manager like **Fantome** or **cslol-manager**:

1. Open your mod manager
2. Import the `.fantome` file you exported
3. Enable the mod
4. Launch League of Legends

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+N | New Project |
| Ctrl+S | Save Project |
| Ctrl+E | Export Mod |
| Ctrl+, | Open Settings |
| Escape | Close Modal |

---

## Next Steps

- Read the [Features Guide](FEATURES.md) for detailed documentation
- Check [Troubleshooting](TROUBLESHOOTING.md) if you encounter issues
- Browse the [FAQ](FAQ.md) for common questions

Happy modding! 🎮
