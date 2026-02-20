# Project Structure

## Overview

Flint is a League of Legends modding IDE built with Rust (Tauri 2.x) backend and React + TypeScript frontend.

### Root Files
- `package.json` - Node.js dependencies and scripts
- `vite.config.ts` - Vite configuration for frontend
- `tsconfig.json` - TypeScript configuration
- `index.html` - Frontend entry HTML
- `.gitignore` - Git ignore rules
- `README.md` - Project documentation

### Frontend Structure (React + TypeScript)
```
src/
├── main.tsx                    # Application entry point
├── components/                 # React components
│   ├── App.tsx                 # Root component
│   ├── TopBar.tsx              # Navigation bar with project info
│   ├── FileTree.tsx            # Asset file browser (left panel)
│   ├── CenterPanel.tsx         # Dynamic content area
│   ├── PreviewPanel.tsx        # Asset preview container
│   ├── TabBar.tsx              # Preview tab management
│   ├── StatusBar.tsx           # Status bar with hash info
│   ├── WelcomeScreen.tsx       # Landing page (no project open)
│   ├── ContextMenu.tsx         # Right-click context menus
│   ├── CheckpointTimeline.tsx  # Checkpoint management UI
│   ├── Toast.tsx               # Notification toasts
│   ├── modals/                 # Modal dialogs
│   │   ├── NewProjectModal.tsx
│   │   ├── ExportModal.tsx
│   │   ├── SettingsModal.tsx
│   │   ├── FirstTimeSetupModal.tsx
│   │   ├── RecolorModal.tsx
│   │   └── UpdateModal.tsx
│   └── preview/                # Asset preview panels
│       ├── BinEditor.tsx       # BIN file editor (Monaco)
│       ├── LazyBinEditor.tsx   # Lazy-loaded BIN editor wrapper
│       ├── BinPropertyTree.tsx # BIN property tree view
│       ├── ModelPreview.tsx    # 3D model viewer (Three.js/R3F)
│       ├── LazyModelPreview.tsx # Lazy-loaded model viewer wrapper
│       ├── ImagePreview.tsx    # DDS/PNG/JPG image preview
│       ├── TextPreview.tsx     # Text file preview
│       ├── HexViewer.tsx       # Binary hex viewer
│       └── AssetPreviewTooltip.tsx # Preview hover tooltips
├── lib/                        # Utilities and API bridge
│   ├── api.ts                  # Tauri command wrappers (invoke calls)
│   ├── state.ts                # Application state management
│   ├── types.ts                # TypeScript type definitions
│   ├── utils.ts                # Helper functions
│   ├── logger.ts               # Frontend logging
│   ├── fileIcons.tsx           # File type icon mapping
│   ├── ritobinLanguage.ts      # Monaco editor BIN syntax definition
│   └── datadragon.ts           # Champion data integration (Data Dragon API)
├── styles/                     # Global CSS styles
│   └── index.css               # Design tokens and global styles
├── themes/                     # Customizable CSS themes
│   └── default.css             # Default gray-red theme
└── assets/                     # Static assets (icons, images)
```

### Backend Structure (Rust + Tauri 2.x)
```
src-tauri/
├── Cargo.toml                  # Rust dependencies
├── tauri.conf.json             # Tauri app configuration
├── build.rs                    # Build script
└── src/
    ├── main.rs                 # Application entry point with Tauri setup
    ├── lib.rs                  # Library exports
    ├── error.rs                # Error types and handling (FlintError)
    ├── state.rs                # Application state (HashtableState)
    │
    ├── commands/               # Tauri IPC command handlers
    │   ├── mod.rs              # Command module exports
    │   ├── hash.rs             # Hash management commands
    │   ├── wad.rs              # WAD file operations
    │   ├── bin.rs              # BIN file operations
    │   ├── project.rs          # Project CRUD operations
    │   ├── export.rs           # Mod export commands
    │   ├── file.rs             # File I/O & preview
    │   ├── champion.rs         # Champion & skin commands
    │   ├── checkpoint.rs       # Checkpoint commands
    │   ├── mesh.rs             # 3D mesh commands
    │   ├── league.rs           # League detection commands
    │   ├── updater.rs          # App update commands
    │   └── validation.rs       # Asset validation commands
    │
    ├── core/                   # Core business logic
    │   ├── mod.rs              # Core module exports
    │   ├── checkpoint.rs       # Checkpoint/snapshot system
    │   ├── frontend_log.rs     # Frontend log forwarding
    │   │
    │   ├── hash/               # Hash table management
    │   ├── wad/                # WAD archive handling
    │   ├── bin/                # BIN file parsing & conversion
    │   ├── repath/             # Asset repathing & refathering
    │   │   ├── organizer.rs    # Path organization
    │   │   └── refather.rs     # Intelligent path rewriting
    │   ├── export/             # Fantome/Modpkg export
    │   ├── mesh/               # SKN/SKL/SCB mesh parsing
    │   ├── league/             # Game installation detection
    │   ├── project/            # Project management
    │   ├── champion/           # Champion & skin discovery
    │   └── validation/         # Asset validation
    │
    └── bin/                    # Additional binary targets
        └── bin_roundtrip_test.rs # BIN format roundtrip test
```

### CI/CD
```
.github/workflows/
├── build.yml                   # Build + auto-release on push to main
└── release.yml                 # Tag-based release (v* tags)
```

### Documentation
```
docs/
├── OVERVIEW.md                 # High-level project vision
├── REQUIREMENTS.md             # Feature requirements
├── DESIGN.md                   # UI/UX specifications
├── ARCHITECTURE.md             # Technical architecture
├── TASKS.md                    # Implementation task breakdown
├── BUILD.md                    # Build instructions & CI/CD
├── AI-STEERING.md              # AI development guidelines
└── user/                       # End-user documentation
    ├── FAQ.md                  # Frequently asked questions
    └── TROUBLESHOOTING.md      # Common issues & solutions
```

## Key Dependencies

### Cargo.toml (Rust)
- `tauri` 2.x - Desktop framework
- `league-toolkit` 0.2 - WAD archive operations
- `ltk_mesh` 0.3 - SKN/SKL/SCB mesh parsing
- `ltk_anim` 0.3 - ANM animation parsing
- `ltk_ritobin` 0.1 / `ltk_meta` 0.3 - BIN file parsing
- `ltk_texture` 0.4 - DDS/TEX texture decoding
- `ltk_fantome` 0.1 / `ltk_modpkg` 0.1 - Mod format export
- `ltk_mod_project` 0.1 / `ltk_mod_core` 0.1 - Project system
- `reqwest` 0.11 - HTTP client (rustls-tls)
- `tokio` 1.x - Async runtime
- `rayon` 1.x - Parallel processing
- `glam` 0.27 - Vector math
- `image` 0.25 / `image_dds` 0.6 - Image processing

### package.json (Frontend)
- `react` 18.x - UI framework
- `react-dom` 18.x - React DOM renderer
- `@tauri-apps/api` 2.x - Tauri JavaScript bindings
- `@tauri-apps/plugin-dialog` 2.x - Native file dialogs
- `@monaco-editor/react` 4.x - Code editor (BIN editing)
- `@react-three/fiber` 8.x - Three.js React renderer (3D preview)
- `@react-three/drei` 9.x - Three.js helpers
- `three` 0.182 - 3D graphics
- `react-window` 2.x - Virtualized lists
- `typescript` 5.x - Type safety
- `vite` 5.x - Build tool

## Status
- Phases 1-4 and 6: Complete (core engine, UI, preview, export, polish)
- Phase 5: In progress (BIN editor)
- CI/CD: Auto-release on push to main
