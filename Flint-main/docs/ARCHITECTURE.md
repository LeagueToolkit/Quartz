# Flint - Architecture Document

> Technical architecture decisions and system design for the Flint modding IDE.

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FLINT ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   FRONTEND (React + TypeScript)                      │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐        │   │
│  │  │ Components│  │  State    │  │  API      │  │  Utils    │        │   │
│  │  │  (.tsx)   │  │ (lib/ts)  │  │ (lib/ts)  │  │ (lib/ts)  │        │   │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └───────────┘        │   │
│  │        │              │              │                              │   │
│  └────────┼──────────────┼──────────────┼──────────────────────────────┘   │
│           │              │              │                                   │
│           │    Tauri IPC (invoke/emit)  │                                   │
│           └──────────────┼──────────────┘                                   │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         BACKEND (Rust)                               │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐        │   │
│  │  │ Commands  │  │   Core    │  │   State   │  │   Error   │        │   │
│  │  │ (Tauri)   │  │  (Logic)  │  │  (Managed)│  │ (Handling)│        │   │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └───────────┘        │   │
│  │        │              │              │                              │   │
│  └────────┼──────────────┼──────────────┼──────────────────────────────┘   │
│           │              │              │                                   │
│           ▼              ▼              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      EXTERNAL SYSTEMS                                │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐        │   │
│  │  │  League   │  │  Shared   │  │  Project  │  │ Community │        │   │
│  │  │   Files   │  │  Hashes   │  │   Files   │  │  Dragon   │        │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Decisions

### 2.1 Why Rust?

| Factor | Rationale |
|--------|-----------|
| **Performance** | Native speed for large file operations (WAD archives can be GBs) |
| **Safety** | Memory safety prevents crashes when parsing untrusted game files |
| **Ecosystem** | Existing crates: league-toolkit, serde, tokio |
| **Tauri Integration** | First-class Rust support in Tauri framework |

### 2.2 Why Tauri (vs Electron)?

| Comparison | Tauri | Electron |
|------------|-------|----------|
| Binary size | ~5-10 MB | ~150+ MB |
| Memory usage | Low (native rendering) | High (Chromium) |
| Startup time | Fast | Slow |
| Language | Rust (backend) | Node.js |
| Security | Sandboxed by default | Open by default |

### 2.3 Why React + TypeScript?

| Factor | Decision |
|--------|----------|
| **Type Safety** | TypeScript catches errors at compile time, critical for complex IPC types |
| **Component Model** | React's component architecture maps well to the IDE layout |
| **Ecosystem** | Rich library support (Monaco editor, Three.js/R3F for 3D preview) |
| **Developer Experience** | Strong IDE support with TypeScript for Tauri command types |

---

## 3. Module Breakdown

### 3.1 Backend Modules

```
src-tauri/src/
├── main.rs              # Application entry point
├── lib.rs               # Library exports for testing
├── error.rs             # Error types and handling
├── state.rs             # Application state (HashtableState)
│
├── commands/            # Tauri IPC command handlers
│   ├── mod.rs           # Module exports
│   ├── hash.rs          # Hash management commands
│   ├── wad.rs           # WAD file operations
│   ├── bin.rs           # BIN file operations
│   ├── project.rs       # Project CRUD operations
│   ├── export.rs        # Mod export commands
│   ├── file.rs          # File I/O & preview
│   ├── champion.rs      # Champion & skin commands
│   ├── checkpoint.rs    # Checkpoint commands
│   ├── mesh.rs          # 3D mesh commands
│   ├── league.rs        # League detection commands
│   ├── updater.rs       # App update commands
│   └── validation.rs    # Asset validation commands
│
└── core/                # Core business logic
    ├── mod.rs           # Module exports
    │
    ├── hash/            # Hash table management
    ├── wad/             # WAD archive handling
    ├── bin/             # BIN file parsing & conversion
    ├── repath/          # Asset repathing & refathering
    │   ├── organizer.rs # Path organization
    │   └── refather.rs  # Intelligent path rewriting
    ├── export/          # Fantome/Modpkg export
    ├── mesh/            # SKN/SKL/SCB mesh parsing
    ├── league/          # Game installation detection
    ├── project/         # Project management
    ├── champion/        # Champion & skin discovery
    ├── validation/      # Asset validation
    ├── checkpoint.rs    # Checkpoint/snapshot system
    └── frontend_log.rs  # Frontend log forwarding
```

#### Module Responsibilities

| Module | Responsibility | Public API |
|--------|----------------|------------|
| `commands` | Bridge between frontend and core | Tauri commands (12 modules) |
| `core::hash` | Hash table download and lookup | `init()`, `lookup()`, `download()` |
| `core::wad` | WAD file operations | `read()`, `extract()`, `list_chunks()` |
| `core::bin` | BIN parsing and conversion | `parse()`, `to_text()`, `to_json()` |
| `core::repath` | Asset path rewriting | `refather()`, `organize()` |
| `core::export` | Mod format packaging | `export_fantome()`, `export_modpkg()` |
| `core::mesh` | 3D mesh operations | `read_skn()`, `read_skl()`, `read_scb()` |
| `core::league` | League installation detection | `find_league_path()` |
| `core::project` | Project management | `create()`, `open()`, `save()` |
| `core::champion` | Champion/skin discovery | `list_champions()`, `list_skins()` |
| `core::checkpoint` | Project snapshots | `create()`, `restore()`, `compare()` |
| `state` | Managed application state | `HashtableState` |
| `error` | Error types | `FlintError` enum |

### 3.2 Frontend Modules

```
src/
├── main.tsx             # Application entry point
│
├── components/          # React TSX components
│   ├── App.tsx          # Root component
│   ├── TopBar.tsx       # Navigation & project info
│   ├── FileTree.tsx     # Asset file browser
│   ├── CenterPanel.tsx  # Dynamic content area
│   ├── PreviewPanel.tsx # Asset preview container
│   ├── TabBar.tsx       # Preview tab management
│   ├── StatusBar.tsx    # Status & hash info
│   ├── WelcomeScreen.tsx # Landing page
│   ├── ContextMenu.tsx  # Right-click menus
│   ├── CheckpointTimeline.tsx
│   ├── Toast.tsx        # Notification toasts
│   ├── modals/          # Modal dialogs
│   └── preview/         # Asset preview panels
│
├── lib/                 # Utilities & API bridge
│   ├── api.ts           # Tauri command wrappers (invoke calls)
│   ├── state.ts         # Application state management
│   ├── types.ts         # TypeScript type definitions
│   ├── utils.ts         # Helper functions
│   ├── logger.ts        # Frontend logging
│   ├── fileIcons.tsx    # File type icon mapping
│   ├── ritobinLanguage.ts # Monaco BIN syntax definition
│   └── datadragon.ts    # Champion data integration
│
├── styles/              # Global CSS styles
└── themes/              # Customizable CSS themes (default.css)
```

---

## 4. Data Models

### 4.1 Core Types (Rust)

```rust
/// Represents a Flint project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub name: String,
    pub champion: String,
    pub skin_id: u32,
    pub league_path: PathBuf,
    pub project_path: PathBuf,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
}

/// Represents an extracted asset
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Asset {
    pub original_path: String,     // Path in WAD
    pub current_path: PathBuf,     // Path in project
    pub file_type: AssetType,
    pub size: u64,
    pub modified: bool,
}

/// Asset categorization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AssetType {
    Texture,      // DDS files
    Model,        // SKN files
    Skeleton,     // SKL files
    Animation,    // ANM files
    Particle,     // Particle BIN
    Audio,        // Audio files
    Binary,       // Other BIN files
    Unknown,
}

/// Repath rule definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepathRule {
    pub source_prefix: String,     // e.g., "ASSETS/Characters/Ahri/Skins/Skin0"
    pub target_prefix: String,     // e.g., "ASSETS/Characters/Ahri/Skins/Base"
    pub apply_to_bin: bool,        // Update BIN references
    pub apply_to_files: bool,      // Move actual files
}
```

### 4.2 Frontend Types

```typescript
// lib/types.ts

interface FileTreeNode {
    id: string;
    name: string;
    path: string;
    type: 'folder' | 'file';
    children?: FileTreeNode[];
    expanded?: boolean;
    fileType?: string;
}

interface ExportConfig {
    format: 'fantome' | 'modpkg';
    name: string;
    author: string;
    description: string;
    version: string;
    outputPath: string;
}
```

---

## 5. State Management

### 5.1 Backend State

```rust
// Tauri managed state
pub struct HashtableState {
    inner: RwLock<HashtableInner>,
}

struct HashtableInner {
    tables: HashMap<String, HashMap<u64, String>>,
    total_entries: usize,
    last_updated: Option<DateTime<Utc>>,
}

// Usage in commands
#[tauri::command]
pub fn lookup_hash(
    state: State<HashtableState>,
    hash: u64
) -> Option<String> {
    state.lookup(hash)
}
```

### 5.2 Frontend State

```typescript
// State management via React hooks and lib/state.ts
// Components use useState/useReducer for local state
// Shared state is passed via props or React context

// lib/state.ts exports state management utilities
// lib/api.ts provides typed wrappers around Tauri invoke calls

// Example usage in a component:
const [project, setProject] = useState<ProjectInfo | null>(null);
const [files, setFiles] = useState<FileTreeNode[]>([]);
const [loading, setLoading] = useState(false);
```

### 5.3 State Synchronization

```
Frontend                    Backend
   │                           │
   │  invoke('open_project')   │
   │ ─────────────────────────>│
   │                           │ Load from disk
   │   Project data            │
   │ <─────────────────────────│
   │                           │
   │ Update local store        │
   │                           │
   │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
   │                           │
   │  User makes changes       │
   │                           │
   │  invoke('save_project')   │
   │ ─────────────────────────>│
   │                           │ Write to disk
   │   Confirmation            │
   │ <─────────────────────────│
```

---

## 6. File System Organization

### 6.1 Project Structure

```
<project_name>.flint/
├── project.json              # Project metadata
│   {
│     "name": "Ahri Base Rework",
│     "champion": "Ahri",
│     "skinId": 0,
│     "leaguePath": "C:\\Riot Games\\...",
│     "version": "1.0.0",
│     "created": "2024-01-01T00:00:00Z"
│   }
│
├── assets/                   # Extracted and modified assets
│   ├── characters/
│   │   └── ahri/
│   │       ├── skins/
│   │       │   └── base/
│   │       │       ├── ahri_base.skn
│   │       │       └── ahri_base_tx.dds
│   │       └── animations/
│   ├── particles/
│   └── audio/
│
├── modified/                 # Track which files were changed
│   └── manifest.json
│
├── cache/                    # Cached data
│   ├── wad_index.json        # WAD contents cache
│   └── thumbnails/           # Preview cache
│
└── output/                   # Export outputs
    └── ahri_rework.fantome
```

### 6.2 Application Data

```
%APPDATA%/
├── RitoShark/               # Shared with other RitoShark tools
│   └── Requirements/
│       └── Hashes/          # Downloaded hash files
│           ├── hashes.game.txt
│           └── hashes.lcu.txt
│
└── Flint/                   # Flint-specific config
    ├── config.json          # Application settings
    ├── recent.json          # Recent projects list
    └── logs/                # Application logs
```

---

## 7. Integration Points

### 7.1 league-toolkit

```rust
// Using league-toolkit for WAD operations
use league_toolkit::wad::{Wad, WadChunk};

pub fn read_wad(path: &Path) -> Result<Vec<ChunkInfo>, FlintError> {
    let wad = Wad::mount(path)?;
    
    wad.chunks()
        .map(|chunk| ChunkInfo {
            path_hash: chunk.path_hash(),
            size: chunk.compressed_size(),
            // Resolve path using our hashtable
            resolved_path: hashtable.lookup(chunk.path_hash()),
        })
        .collect()
}
```

### 7.2 CommunityDragon

```rust
// Hash file downloads
const HASH_URLS: &[(&str, &str)] = &[
    ("hashes.game.txt", "https://raw.githubusercontent.com/CommunityDragon/CDTB/master/cdragontoolbox/hashes.game.txt"),
    ("hashes.lcu.txt", "https://raw.githubusercontent.com/CommunityDragon/CDTB/master/cdragontoolbox/hashes.lcu.txt"),
];

pub async fn download_hashes(target_dir: &Path) -> Result<(), FlintError> {
    for (filename, url) in HASH_URLS {
        let response = reqwest::get(*url).await?;
        let bytes = response.bytes().await?;
        std::fs::write(target_dir.join(filename), bytes)?;
    }
    Ok(())
}
```

### 7.3 League Installation

```rust
// Windows registry lookup
#[cfg(windows)]
pub fn find_league_path() -> Option<PathBuf> {
    use winreg::enums::*;
    use winreg::RegKey;
    
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    
    // Try Riot Client path
    if let Ok(key) = hkcu.open_subkey("Software\\Riot Games\\RADS") {
        if let Ok(path) = key.get_value::<String, _>("LocalRootFolder") {
            let league_path = PathBuf::from(path).join("League of Legends");
            if league_path.exists() {
                return Some(league_path);
            }
        }
    }
    
    // Try common paths
    for path in COMMON_PATHS {
        if Path::new(path).exists() {
            return Some(PathBuf::from(path));
        }
    }
    
    None
}
```

---

## 8. Performance Considerations

### 8.1 Async I/O

```rust
// All file operations use async
#[tauri::command]
pub async fn extract_assets(paths: Vec<String>) -> Result<Vec<Asset>, String> {
    // Use spawn_blocking for CPU-intensive work
    let result = tokio::task::spawn_blocking(move || {
        paths.into_iter()
            .map(|p| extract_single(&p))
            .collect::<Result<Vec<_>, _>>()
    }).await.map_err(|e| e.to_string())?;
    
    result.map_err(|e| e.to_string())
}
```

### 8.2 Lazy Loading

```typescript
// Lazy-loaded preview components for code splitting
const LazyModelPreview = React.lazy(() => import('./preview/ModelPreview'));
const LazyBinEditor = React.lazy(() => import('./preview/BinEditor'));

// Load file tree on demand
async function loadChildren(node: FileTreeNode): Promise<void> {
    if (node.type !== 'folder' || node.children) {
        return; // Already loaded or not a folder
    }

    const children = await invoke<FileTreeNode[]>('get_folder_contents', { path: node.path });
    node.children = children;
}
```

### 8.3 Caching Strategy

| Data | Cache Location | Invalidation |
|------|----------------|--------------|
| Hash tables | Memory (HashtableState) | On reload command |
| WAD index | Project cache folder | When League updates |
| Thumbnails | Project cache folder | When source changes |
| Recent projects | App config | Never (user manages) |

---

## 9. Security Considerations

### 9.1 Tauri Security

```json
// tauri.conf.json
{
  "security": {
    "csp": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'",
    "dangerousDisableAssetCspModification": false
  }
}
```

### 9.2 Path Validation

```rust
/// Ensure path is within allowed directories
pub fn validate_access(path: &Path, allowed_roots: &[PathBuf]) -> Result<(), FlintError> {
    let canonical = path.canonicalize()?;
    
    for root in allowed_roots {
        if canonical.starts_with(root) {
            return Ok(());
        }
    }
    
    Err(FlintError::AccessDenied(canonical))
}
```

### 9.3 Command Allowlist

```rust
// Only expose necessary commands
.invoke_handler(tauri::generate_handler![
    // Hash commands
    commands::hash::download_hashes,
    commands::hash::get_hash_status,
    // WAD commands
    commands::wad::read_wad,
    commands::wad::extract_wad,
    // BIN commands
    commands::bin::convert_bin_to_text,
    // ... explicit command list
])
```

---

## 10. Error Handling Strategy

### 10.1 Error Hierarchy

```rust
#[derive(Debug, thiserror::Error)]
pub enum FlintError {
    #[error("IO error: {message}")]
    Io {
        message: String,
        #[source]
        source: std::io::Error,
    },
    
    #[error("WAD error: {0}")]
    Wad(String),
    
    #[error("BIN parsing error at offset {offset}: {message}")]
    BinParse {
        offset: usize,
        message: String,
    },
    
    #[error("Path not found: {0}")]
    PathNotFound(PathBuf),
    
    #[error("Access denied: {0}")]
    AccessDenied(PathBuf),
    
    #[error("Champion not found: {0}")]
    ChampionNotFound(String),
}

impl FlintError {
    pub fn io(message: impl Into<String>, source: std::io::Error) -> Self {
        Self::Io {
            message: message.into(),
            source,
        }
    }
}
```

### 10.2 Error Propagation

```
User Action
    │
    ▼
┌─────────────────┐
│  UI Component   │  Display user-friendly error
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Service Layer  │  Log error, transform message
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Tauri Command   │  Convert Result to String
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Core Logic    │  Return Result<T, FlintError>
└─────────────────┘
```

---

## 11. Future Extensibility

### 11.1 Plugin System (Future)

```rust
// Possible plugin trait
pub trait FlintPlugin: Send + Sync {
    fn name(&self) -> &str;
    fn version(&self) -> &str;
    
    /// Called when a file is about to be exported
    fn on_export(&self, file: &Asset) -> Result<Option<Asset>, PluginError>;
    
    /// Called when a file type needs preview
    fn preview_handler(&self, file_type: &str) -> Option<Box<dyn PreviewHandler>>;
}
```

### 11.2 Format Extensions

```rust
// Exporters are modular
pub trait ModExporter: Send + Sync {
    fn format_name(&self) -> &str;
    fn file_extension(&self) -> &str;
    fn export(&self, project: &Project, config: &ExportConfig) -> Result<PathBuf, FlintError>;
}

// Register new formats
let exporters: Vec<Box<dyn ModExporter>> = vec![
    Box::new(FantomeExporter::new()),
    Box::new(ModpkgExporter::new()),
    // Box::new(CustomExporter::new()), // Future
];
```

### 11.3 Custom Repath Rules

```rust
// User-defined repath rules
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomRepathRule {
    pub name: String,
    pub pattern: String,          // Regex pattern
    pub replacement: String,      // Replacement string
    pub applies_to: Vec<String>,  // File extensions
}
```
