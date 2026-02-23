# Flint - Frequently Asked Questions

Answers to common questions about Flint.

---

## General

### What is Flint?

Flint is a modding IDE for League of Legends. It extracts champion skin assets, lets you view and edit them, and exports ready-to-use mod packages.

### Is Flint safe to use?

Flint only reads and extracts game files - it never modifies your League installation. Exported mods are applied through third-party mod managers.

**Note:** Using mods in League of Legends may violate Riot's Terms of Service. Use at your own discretion.

### What file formats does Flint support?

| Format | Support |
|--------|---------|
| `.dds` | Full preview with zoom/pan |
| `.bin` | View as text, basic editing |
| `.png`, `.jpg` | Full preview |
| `.py`, `.txt`, `.json` | Text preview |
| Other | Hex viewer fallback |

---

## Projects

### Where are projects saved?

Projects are saved in the location you choose during creation. Each project has:
- `mod.config.json` - Project configuration
- `assets/` - Extracted game files
- `.ritobin/` - Cached BIN conversions (if applicable)

### Can I edit multiple skins at once?

Currently, each project is for one champion/skin combination. To mod multiple skins:
1. Create separate projects for each skin
2. Export each as a separate mod
3. Enable all mods in your mod manager

### Can I share projects with others?

Yes! The entire project folder can be shared. The recipient needs:
- Flint installed
- Same or compatible League version

### How do I update a project after a League patch?

If League updates:
1. Your existing project still works
2. For new assets, create a new project
3. You can manually copy modified files from old to new project

---

## Editing

### Can I edit textures in Flint?

Flint currently supports viewing textures. To edit:
1. View the texture in Flint to identify which file you need
2. Export/copy the DDS file to a folder
3. Edit with an external tool (Photoshop, GIMP with DDS plugin, Paint.NET)
4. Replace the file in your project folder

### Can I edit BIN files?

BIN files are displayed in a text format. The text editing feature is:
- ✅ Viewing - Fully supported
- ⚠️ Editing - Experimental, use with caution

### What's a BIN file?

BIN files are League's property files containing game data like:
- Skin configurations
- VFX parameters
- Animation settings
- Asset path references

---

## Export

### What's a .fantome file?

A `.fantome` file is a mod package format. It's a ZIP file containing:
- Mod metadata (name, author, description)
- Modified game files in WAD structure

### What mod managers work with Flint exports?

Flint exports are compatible with:
- **Fantome** - The original mod manager
- **cslol-manager** - Popular community tool
- Any tool supporting the fantome format

### Can I export to other formats?

Currently Flint supports:
- ✅ Fantome (.fantome)
- 🔜 Modpkg (.modpkg) - Coming soon

---

## Technical

### How does Flint read League files?

Flint uses the `league-toolkit` library to read WAD (Where's All the Data) files. It loads hash tables to resolve internal file paths to human-readable names.

### What are hash files?

League stores file paths as xxhash64 hashes. Hash files are lookup tables that map these hashes back to original paths like `/assets/characters/ahri/skins/skin01/texture.dds`.

### Where are hash files stored?

Hash files are stored in:
```
%APPDATA%\RitoShark\Requirements\Hashes
```

This location is shared with other RitoShark tools.

### How do I update hash files?

1. Open Settings (**Ctrl+,**)
2. Click "Download Hashes"
3. Wait for download to complete

New hashes are released when League patches add new content.

---

## Troubleshooting

### Why can't Flint find my League installation?

See [Troubleshooting Guide](TROUBLESHOOTING.md#league-path-issues) for detailed solutions.

### Why are file paths showing as hex numbers?

Hash files may not be loaded. See [Hash File Issues](TROUBLESHOOTING.md#hash-file-issues).

### Why is the preview not loading?

See [Preview Issues](TROUBLESHOOTING.md#preview-issues).

---

## More Questions?

If your question isn't answered here:
1. Check the [Troubleshooting Guide](TROUBLESHOOTING.md)
2. Read the [Features Guide](FEATURES.md)
3. Report issues on the project repository
