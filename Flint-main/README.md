<p align="center">
  <img src="https://img.shields.io/badge/League%20of%20Legends-Modding-C89B3C?style=for-the-badge&logo=riotgames&logoColor=white" alt="League Modding">
  <img src="https://img.shields.io/badge/Built%20with-Tauri%202.0-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/Rust-Backend-DEA584?style=for-the-badge&logo=rust&logoColor=black" alt="Rust">
  <img src="https://img.shields.io/badge/React-TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
</p>

<h1 align="center">🔥 FLINT</h1>
<h3 align="center">League of Legends Asset Extractor & Modding IDE</h3>

<p align="center">
  <em>A powerful, modern tool for extracting and modifying League of Legends champion skins and assets.</em>
</p>

---

## ✨ Features 

### 🎮 **Smart Game Detection**
- Automatically detects League of Legends installation path
- Supports multiple installation methods (Riot Client, Steam, custom paths)
- Windows Registry integration for reliable detection
- Real-time validation of game files

### 🗂️ **Multi-Tab Workspace**
- Unified tab bar for all open work: projects, individual WAD sessions, and WAD Explorer
- Switch freely between any tab without losing state
- Close individual tabs independently; each tab type has its own fallback chain

### 🌐 **WAD Explorer**
- Browse the entire game's WAD archive library without extracting anything
- Virtual file system tree organized by category (Champions, Maps, etc.)
- Lazy-load WAD chunks on demand — only reads what you expand
- Instant file preview (textures, BIN, audio, hex) inline in the panel
- Debounced search with regex toggle across all loaded WADs
- Quick-action cards for fast filtering by asset type (Textures, BIN, Audio, Models)

### 📦 **WAD Archive Operations**
- High-performance WAD file reading and extraction using `league-toolkit`
- Automatic hash resolution via CommunityDragon hashtables
- Selective asset extraction for champions and skins
- Support for ZSTD and Deflate compression formats
- Browse individual `.wad.client` files in a dedicated tab session

### 🔧 **BIN File Editor**
- Full BIN property file parsing via `ltk_ritobin` / `ltk_meta`
- Python-like text representation (ritobin format)
- **VS Code-style syntax highlighting** with bracket pair colorization
- Pre-conversion of BIN files to `.ritobin` for instant loading
- Support for all BIN data types:
  - Primitives (bool, i8/u8, i16/u16, i32/u32, i64/u64, f32)
  - Vectors (Vec2, Vec3, Vec4) and Matrices (Mtx44)
  - Colors (RGBA) and Strings
  - Hashes, Links, Pointers, Embeds, and Options
  - Containers (List, Map, Optional)

### 🖼️ **Asset Preview**
- **3D Models**: Real-time WebGL preview for champion meshes and static models
  - SKN (Skinned Mesh) with texture support
  - SKL (Skeleton) bone visualization
  - SCB/SCO (Static Mesh) for particle geometry and props
  - Material visibility toggles and wireframe mode
- **Textures**: DDS and TEX file decoding (BC1, BC3, ETC formats) via `ltk_texture`
- **Hex Viewer**: Binary file inspection with offset display
- **Text**: Syntax-highlighted text file viewing
- **Images**: PNG/JPG preview with base64 encoding

### 🎨 **Texture Recoloring**
- **Multiple Recoloring Modes**:
  - **Hue Shift**: Rotate all colors while preserving saturation and brightness
  - **Colorize**: Convert entire texture to a single hue while preserving shading
  - **Grayscale + Tint**: Apply monochrome effect with color overlay
- **Smart Filtering**:
  - Automatically skips distortion/distort textures (UV effect maps)
  - Preserves black backgrounds and alpha transparency
  - Optional checkbox to include distortion textures if needed
- **Batch Processing**: Recolor entire folders of textures at once
- **Color Presets**: Quick-select from 8 common colors (Red, Orange, Gold, Green, Cyan, Blue, Purple, Pink)
- **Live Preview**: Before/after toggle to compare changes

### 💾 **Checkpoint System**
- Create named snapshots of your project state
- Restore to any previous checkpoint instantly
- Compare checkpoints to see exactly what changed
- Auto-checkpoint option before destructive operations

### 📤 **Mod Export**
- Export to `.fantome` format (compatible with cslol-manager) via `ltk_fantome`
- Export to `.modpkg` format via `ltk_modpkg` (compatible with League Mod Tools)
- Champion and skin metadata embedding
- Automatic path normalization for mod manager compatibility

### 🎨 **Theming System**
- Customizable color themes via CSS variables
- Gray-red default palette with accent color swappable
- Dark mode optimized UI

---

## ✅ Advanced Features

> [!NOTE]
> **The following advanced features are now fully operational** thanks to the stable `ltk_ritobin` and `ltk_meta` crates from [LeagueToolkit](https://github.com/LeagueToolkit/league-toolkit).

| Feature | Status | Description |
|---------|--------|-------------|
| **Refather System** | ✅ Working | Intelligent asset path rewriting for custom skins. Renames asset paths in BIN files to use custom `ASSETS/{Creator}/{Project}/` prefixes for conflict-free mod loading. |
| **BIN Concatenation** | ✅ Working | Automatic merging of linked BIN files into optimized bundles. Creates `__Concat.bin` and updates main BIN's linked paths for better mod manager compatibility. |
| **BIN Editing** | ✅ Working | Full read/write support for BIN files with syntax-highlighted editor. Save edited `.ritobin` back to binary `.bin` format. |

These features are implemented in `src-tauri/src/core/repath/refather.rs` and `src-tauri/src/core/bin/concat.rs` respectively, providing full compatibility with league-mod tooling.

---

## 🗺️ Roadmap

| Feature | Status | Description |
|---------|--------|-------------|
| **SKN/SKL 3D Preview** | ✅ Working | In-app 3D model viewer for champion skin meshes and skeletons with texture mapping |
| **SCB/SCO Preview** | ✅ Working | Static mesh viewer for particle geometry and props via `ltk_mesh` |
| **Animation Preview** | ✅ Working | ANM file playback on 3D models with skeleton animation |
| **Parallel Asset Loading** | ✅ Working | Mesh, skeleton, and animations load concurrently for faster previews |
| **Sound Bank Editing** | 🔜 Planned | BNK/WPK audio file preview and editing support |

---

## 🏗️ Project Structure

```
flint/
├── src/                        # React TypeScript Frontend
│   ├── main.tsx                # Application entry point
│   ├── components/             # UI Components
│   │   ├── App.tsx             # Root component & layout
│   │   ├── TopBar.tsx          # Navigation, tab bar & export actions
│   │   ├── FileTree.tsx        # Project asset file browser
│   │   ├── WadExplorer.tsx     # Unified game WAD browser (VFS)
│   │   ├── WadBrowser.tsx      # Single WAD session browser panel
│   │   ├── WadPreviewPanel.tsx # In-memory WAD chunk preview
│   │   ├── CenterPanel.tsx     # Dynamic content area
│   │   ├── PreviewPanel.tsx    # Asset preview container
│   │   ├── StatusBar.tsx       # Status & hash info
│   │   ├── WelcomeScreen.tsx   # Landing page
│   │   ├── ContextMenu.tsx     # Right-click menus
│   │   ├── CheckpointTimeline.tsx # Checkpoint UI
│   │   ├── Toast.tsx           # Notification toasts
│   │   ├── modals/             # Modal dialogs
│   │   │   ├── NewProjectModal.tsx
│   │   │   ├── ExportModal.tsx
│   │   │   ├── SettingsModal.tsx
│   │   │   ├── FirstTimeSetupModal.tsx
│   │   │   ├── RecolorModal.tsx
│   │   │   └── UpdateModal.tsx
│   │   └── preview/            # Asset preview panels
│   │       ├── BinEditor.tsx / LazyBinEditor.tsx
│   │       ├── BinPropertyTree.tsx
│   │       ├── ModelPreview.tsx / LazyModelPreview.tsx
│   │       ├── ImagePreview.tsx
│   │       ├── TextPreview.tsx
│   │       ├── HexViewer.tsx
│   │       └── AssetPreviewTooltip.tsx
│   ├── lib/                    # Utilities & API bridge
│   │   ├── api.ts              # Tauri command wrappers
│   │   ├── state.ts            # Application state management
│   │   ├── types.ts            # TypeScript type definitions
│   │   ├── utils.ts            # Helper functions
│   │   ├── logger.ts           # Frontend logging
│   │   ├── fileIcons.tsx       # File type icon mapping
│   │   ├── ritobinLanguage.ts  # Monaco BIN syntax definition
│   │   └── datadragon.ts       # Champion data integration
│   ├── styles/                 # Global CSS styles
│   └── themes/                 # Customizable CSS themes
│
├── src-tauri/                  # Rust Backend
│   ├── src/
│   │   ├── main.rs             # Application entry point
│   │   ├── lib.rs              # Library exports
│   │   ├── error.rs            # Error types & handling
│   │   ├── state.rs            # Managed application state
│   │   ├── commands/           # Tauri IPC handlers
│   │   │   ├── project.rs      # Project CRUD operations
│   │   │   ├── export.rs       # Mod export commands
│   │   │   ├── bin.rs          # BIN file operations
│   │   │   ├── file.rs         # File I/O & preview
│   │   │   ├── wad.rs          # WAD archive commands
│   │   │   ├── hash.rs         # Hash resolution
│   │   │   ├── champion.rs     # Champion & skin commands
│   │   │   ├── checkpoint.rs   # Checkpoint commands
│   │   │   ├── mesh.rs         # 3D mesh commands
│   │   │   ├── league.rs       # League detection commands
│   │   │   ├── updater.rs      # App update commands
│   │   │   └── validation.rs   # Asset validation commands
│   │   └── core/               # Core functionality
│   │       ├── bin/            # BIN parsing & conversion
│   │       ├── wad/            # WAD extraction
│   │       ├── hash/           # CommunityDragon hashtables
│   │       ├── repath/         # Asset repathing & refathering
│   │       ├── export/         # Fantome/Modpkg export
│   │       ├── mesh/           # SKN/SKL/SCB mesh parsing
│   │       ├── league/         # Game detection
│   │       ├── project/        # Project management
│   │       ├── champion/       # Champion & skin discovery
│   │       ├── validation/     # Asset validation
│   │       ├── checkpoint.rs   # Checkpoint system
│   │       └── frontend_log.rs # Frontend log forwarding
│   └── Cargo.toml              # Rust dependencies
│
├── .github/workflows/          # CI/CD
│   ├── build.yml               # Build + auto-release on push to main
│   └── release.yml             # Tag-based release
│
└── docs/                       # Documentation
```

---

## 🚀 Getting Started

### Prerequisites

- **Rust** (1.75+ stable)
- **Node.js** (v20+)
- **npm**
- **Windows 10+** (for NSIS installer)

### Installation

```bash
# Clone the repository
git clone https://github.com/RitoShark/Flint
cd "Flint - Asset Extractor"

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Building

```bash
# Build optimized production binary with installer
npm run tauri build
```

The installer is generated at `src-tauri/target/release/bundle/nsis/Flint_{version}_x64-setup.exe`.

### Releases

Pushing to `main` automatically builds and creates a GitHub Release with the installer attached. See [BUILD.md](docs/BUILD.md) for details.

---

## 🎨 Theming

Flint supports custom color themes! Create your own theme by copying `src/themes/default.css` and modifying the CSS variables:

```css
:root {
  --accent-primary: #your-color;
  --accent-secondary: #your-secondary-color;
  /* ... */
}
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite 5 |
| **Backend** | Rust, Tauri 2.0 |
| **BIN Parsing** | `ltk_ritobin`, `ltk_meta` (LeagueToolkit) |
| **WAD Handling** | `league-toolkit` |
| **Texture Decoding** | `ltk_texture` (LeagueToolkit) |
| **Mesh Parsing** | `ltk_mesh` (LeagueToolkit) |
| **Animation** | `ltk_anim` (LeagueToolkit) |
| **Mod Export** | `ltk_fantome`, `ltk_modpkg`, `ltk_mod_project` |
| **Hash Resolution** | CommunityDragon hashtables, `xxhash-rust` |

---

## 📦 Key Dependencies

### Rust Backend
- `tauri` 2.0 - Cross-platform desktop framework
- `league-toolkit` - WAD archive operations
- `ltk_mesh` - SKN/SKL/SCB/SCO mesh parsing (LeagueToolkit)
- `ltk_anim` - ANM animation parsing (LeagueToolkit)
- `ltk_ritobin` / `ltk_meta` - BIN file parsing
- `ltk_fantome` / `ltk_modpkg` - Mod format export
- `ltk_texture` - DDS/TEX texture decoding (LeagueToolkit)
- `reqwest` - HTTP client for hash downloading
- `tokio` - Async runtime

### Frontend
- `@tauri-apps/api` 2.0 - Tauri JavaScript bindings
- `@tauri-apps/plugin-dialog` - Native file dialogs
- `react` 18.3 - UI framework
- `typescript` 5.6 - Type safety

---

## 📜 License

This project is for educational purposes. League of Legends and all related assets are property of Riot Games.

---

<p align="center">
  <strong>Made with ❤️ for the League modding community</strong>
</p>
