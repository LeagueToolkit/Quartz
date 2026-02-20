# Flint - AI Steering Document

> Guidelines for AI-assisted development to maintain codebase consistency and quality.

---

## 1. Project Context

### What is Flint?
Flint is a League of Legends modding IDE built with Rust + Tauri that automates asset extraction, repathing, and mod packaging.

### Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Backend | Rust | 2021 Edition |
| Framework | Tauri | 2.x |
| Frontend | React + TypeScript + Vite | React 18, TS 5.6, Vite 5 |
| WAD Operations | league-toolkit | crates.io 0.2 |
| BIN Parsing | ltk_ritobin, ltk_meta | crates.io |
| Mesh/Anim | ltk_mesh, ltk_anim | crates.io |
| Mod Export | ltk_fantome, ltk_modpkg | crates.io |
| Texture | ltk_texture | crates.io |
| Testing | Rust built-in | - |

### Key Files to Reference

| File | Purpose |
|------|---------|
| `docs/OVERVIEW.md` | High-level project vision |
| `docs/REQUIREMENTS.md` | Feature requirements |
| `docs/DESIGN.md` | UI/UX specifications |
| `docs/TASKS.md` | Implementation breakdown |
| `docs/ARCHITECTURE.md` | Technical architecture |

---

## 2. Code Style & Standards

### 2.1 Rust Backend

#### Naming Conventions

```rust
// Functions: snake_case
fn extract_champion_assets() {}

// Types/Structs: PascalCase
struct ChampionData {}

// Constants: SCREAMING_SNAKE_CASE
const MAX_CHUNK_SIZE: usize = 1024;

// Module files: snake_case
// core/hash_table.rs
```

#### Error Handling

```rust
// PREFERRED: Use Result with custom error types
use crate::error::FlintError;

pub fn read_wad(path: &Path) -> Result<WadFile, FlintError> {
    let file = std::fs::File::open(path)
        .map_err(|e| FlintError::io("Failed to open WAD", e))?;
    // ...
}

// AVOID: panic! or unwrap() in production code
// let file = std::fs::File::open(path).unwrap(); // ❌

// OK: unwrap() in tests
#[cfg(test)]
mod tests {
    fn test_something() {
        let result = function().unwrap(); // ✅ OK in tests
    }
}
```

#### Async Patterns

```rust
// Use async for I/O operations
#[tauri::command]
async fn read_wad_async(path: String) -> Result<WadInfo, String> {
    // Spawn blocking for CPU-intensive work
    let result = tokio::task::spawn_blocking(move || {
        // Heavy computation here
    }).await.map_err(|e| e.to_string())?;
    
    Ok(result)
}

// Avoid blocking the main thread
// std::thread::sleep(Duration::from_secs(1)); // ❌ Blocks UI
// tokio::time::sleep(Duration::from_secs(1)).await; // ✅
```

#### Documentation

```rust
/// Extracts assets for a specific champion and skin.
///
/// # Arguments
///
/// * `champion` - The champion's internal name (e.g., "Ahri")
/// * `skin_id` - The skin ID (0 for base skin)
///
/// # Returns
///
/// A list of extracted file paths, or an error if extraction fails.
///
/// # Errors
///
/// Returns `FlintError::ChampionNotFound` if the champion doesn't exist.
/// Returns `FlintError::Io` if file operations fail.
pub fn extract_champion_assets(
    champion: &str,
    skin_id: u32,
) -> Result<Vec<PathBuf>, FlintError> {
    // ...
}
```

### 2.2 Frontend (React + TypeScript)

#### File Organization

```
src/
├── main.tsx             # Application entry point
├── components/          # React components
│   ├── App.tsx          # Root component
│   ├── TopBar.tsx       # Navigation bar
│   ├── FileTree.tsx     # Asset file browser
│   ├── CenterPanel.tsx  # Dynamic content area
│   ├── PreviewPanel.tsx # Asset preview container
│   ├── TabBar.tsx       # Preview tab management
│   ├── StatusBar.tsx    # Status & hash info
│   ├── WelcomeScreen.tsx # Landing page
│   ├── ContextMenu.tsx  # Right-click menus
│   ├── CheckpointTimeline.tsx
│   ├── Toast.tsx        # Notification toasts
│   ├── modals/          # Modal dialogs (NewProject, Export, Settings, etc.)
│   └── preview/         # Asset preview panels (BinEditor, ModelPreview, etc.)
├── lib/                 # Utilities & API bridge
│   ├── api.ts           # Tauri command wrappers (invoke calls)
│   ├── state.ts         # Application state management
│   ├── types.ts         # TypeScript type definitions
│   ├── utils.ts         # Helper functions
│   ├── logger.ts        # Frontend logging
│   ├── fileIcons.tsx    # File type icon mapping
│   ├── ritobinLanguage.ts # Monaco BIN syntax definition
│   └── datadragon.ts    # Champion data integration
├── styles/              # Global CSS styles
└── themes/              # Customizable CSS themes
```

#### Component Pattern

```tsx
// components/FileTree.tsx

interface FileTreeProps {
    items: FileTreeNode[];
    onSelect: (node: FileTreeNode) => void;
}

export function FileTree({ items, onSelect }: FileTreeProps) {
    // Component logic using React hooks
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    return (
        <div className="file-tree">
            {items.map(item => (
                <FileTreeItem key={item.id} node={item} onSelect={onSelect} />
            ))}
        </div>
    );
}
```

#### Tauri Command Wrappers

```typescript
// lib/api.ts
import { invoke } from '@tauri-apps/api/core';

export async function readWad(path: string): Promise<WadInfo> {
    return await invoke('read_wad', { path });
}

export async function extractAssets(
    champion: string,
    skinId: number
): Promise<ExtractedFile[]> {
    return await invoke('extract_assets', { champion, skinId });
}
```

---

## 3. Architecture Principles

### 3.1 Separation of Concerns

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + TypeScript)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Components  │──│  State (lib) │──│  API (lib)   │          │
│  │  (.tsx)      │  │  state.ts    │  │  api.ts      │          │
│  └──────────────┘  └──────────────┘  └──────┬───────┘          │
└─────────────────────────────────────────────┼───────────────────┘
                                              │ Tauri IPC (invoke)
┌─────────────────────────────────────────────┼───────────────────┐
│                    BACKEND (Rust)            │                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────▼───────┐          │
│  │   Commands   │──│    Core      │──│    State     │          │
│  │  commands/   │  │  core/       │  │  state.rs    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Command Structure

```rust
// src-tauri/src/commands/wad.rs

// Naming: verb_noun pattern
#[tauri::command]
pub async fn read_wad(path: String) -> Result<WadInfo, String> {
    // 1. Validate inputs
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    
    // 2. Call core logic
    let result = core::wad::read(&path)
        .map_err(|e| format!("Failed to read WAD: {}", e))?;
    
    // 3. Transform to serializable output
    Ok(result.into())
}
```

### 3.3 State Management

```rust
// Backend state is managed via Tauri State
use tauri::State;

#[tauri::command]
pub fn get_hash_status(state: State<HashtableState>) -> HashStatus {
    state.get_status()
}
```

```typescript
// Frontend state via lib/state.ts
// Uses React state management patterns

interface AppState {
    project: ProjectInfo | null;
    files: FileTreeNode[];
    selectedFile: string | null;
    loading: boolean;
    error: string | null;
}

// State is managed via React hooks (useState, useReducer)
// and passed through component props or context
```

---

## 4. Tauri-Specific Guidelines

### 4.1 Command Naming

```rust
// Pattern: verb_noun or action_context
#[tauri::command] fn read_wad() {}        // ✅
#[tauri::command] fn extract_assets() {}  // ✅
#[tauri::command] fn get_hash_status() {} // ✅

// Avoid generic names
#[tauri::command] fn process() {}         // ❌ Too vague
#[tauri::command] fn handle() {}          // ❌ Too vague
```

### 4.2 Error Propagation

```rust
// Commands return String errors for frontend consumption
#[tauri::command]
pub async fn risky_operation() -> Result<Output, String> {
    internal_operation()
        .map_err(|e| {
            // Log the detailed error
            tracing::error!("Operation failed: {:?}", e);
            // Return user-friendly message
            format!("Operation failed: {}", e)
        })
}
```

### 4.3 Event Emission

```rust
// For long-running operations, emit progress events
use tauri::Emitter;

#[tauri::command]
pub async fn extract_all(app: tauri::AppHandle) -> Result<(), String> {
    for (i, file) in files.iter().enumerate() {
        // Process file...
        
        // Emit progress
        app.emit("extraction-progress", Progress {
            current: i,
            total: files.len(),
            file: file.name.clone(),
        }).ok();
    }
    
    Ok(())
}
```

---

## 5. Common Patterns

### 5.1 File Path Handling

```rust
// Always validate paths from frontend
use std::path::Path;

fn validate_path(path: &str) -> Result<PathBuf, FlintError> {
    let path = Path::new(path);
    
    // Check path exists
    if !path.exists() {
        return Err(FlintError::PathNotFound(path.to_path_buf()));
    }
    
    // Prevent path traversal
    let canonical = path.canonicalize()?;
    
    Ok(canonical)
}
```

### 5.2 Loading States

```typescript
// Always handle loading states in UI
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

async function loadProject(path: string) {
    setLoading(true);
    setError(null);

    try {
        const project = await invoke<ProjectInfo>('open_project', { path });
        setProject(project);
    } catch (err) {
        setError(String(err));
    } finally {
        setLoading(false);
    }
}
```

### 5.3 Configuration Pattern

```rust
// Use serde for configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub name: String,
    pub champion: String,
    pub skin_id: u32,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
}

impl Default for ProjectConfig {
    fn default() -> Self {
        Self {
            name: "New Project".to_string(),
            champion: String::new(),
            skin_id: 0,
            created_at: Some(Utc::now()),
        }
    }
}
```

---

## 6. Common Pitfalls to Avoid

### ❌ Blocking the UI Thread

```rust
// DON'T: Heavy work on main thread
#[tauri::command]
fn bad_command() -> Vec<u8> {
    std::fs::read("large_file.wad").unwrap() // Blocks UI!
}

// DO: Use async + spawn_blocking
#[tauri::command]
async fn good_command() -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(|| {
        std::fs::read("large_file.wad")
    }).await.map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
```

### ❌ Unvalidated Input

```rust
// DON'T: Trust frontend input
#[tauri::command]
fn bad_read(path: String) -> Vec<u8> {
    std::fs::read(&path).unwrap()
}

// DO: Validate everything
#[tauri::command]
fn good_read(path: String) -> Result<Vec<u8>, String> {
    let safe_path = validate_path(&path)?;
    // Check it's within allowed directories
    ensure_allowed_path(&safe_path)?;
    std::fs::read(&safe_path).map_err(|e| e.to_string())
}
```

### ❌ Memory Leaks

```rust
// DON'T: Hold large data indefinitely
static CACHE: Lazy<Mutex<HashMap<String, Vec<u8>>>> = ...;

// DO: Use bounded caches with eviction
use lru::LruCache;
static CACHE: Lazy<Mutex<LruCache<String, Vec<u8>>>> = 
    Lazy::new(|| Mutex::new(LruCache::new(100)));
```

---

## 7. Testing Strategy

### 7.1 Rust Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_parse_bin_file() {
        let data = include_bytes!("../test_data/sample.bin");
        let result = parse_bin(data);
        
        assert!(result.is_ok());
        let bin = result.unwrap();
        assert!(!bin.entries.is_empty());
    }

    #[test]
    fn test_invalid_bin_returns_error() {
        let data = b"not a valid bin file";
        let result = parse_bin(data);
        
        assert!(result.is_err());
    }
}
```

### 7.2 Integration Tests

```rust
// tests/wad_integration.rs
use lol_modding_suite::core::wad;

#[test]
fn test_read_real_wad_file() {
    // Skip if test file doesn't exist
    let path = "tests/fixtures/sample.wad";
    if !std::path::Path::new(path).exists() {
        eprintln!("Skipping test: {} not found", path);
        return;
    }
    
    let result = wad::read(path);
    assert!(result.is_ok());
}
```

---

## 8. Incremental Development Rules

### DO

1. **Build vertically** - Complete one feature end-to-end before starting another
2. **Test as you go** - Write tests alongside implementation
3. **Commit working code** - Never commit broken builds
4. **Document public APIs** - Every public function gets a doc comment

### DON'T

1. **Don't refactor and add features simultaneously** - One change type at a time
2. **Don't create placeholder code** - Implement fully or not at all
3. **Don't ignore errors** - Handle every Result and Option
4. **Don't optimize prematurely** - Make it work, then make it fast

---

## 9. AI Prompt Templates

### Implementing a Tauri Command

```markdown
## Context
I'm working on Flint, a LoL modding IDE. Reference: docs/AI-STEERING.md

## Task
Create a Tauri command called `extract_champion_assets` that:
- Takes `champion: String` and `skin_id: u32` as parameters
- Calls the core extraction logic
- Returns `Result<Vec<ExtractedFile>, String>`
- Handles errors gracefully with user-friendly messages

## Requirements
- Follow the command naming pattern (verb_noun)
- Use async with spawn_blocking for heavy work
- Log operations with tracing
- Validate inputs before processing
```

### Building a UI Component

```markdown
## Context
I'm working on Flint (React + TypeScript). Reference: docs/DESIGN.md for visual specs.

## Task
Create a FileTreeItem component (TSX) that:
- Displays file name with appropriate icon
- Shows expand/collapse arrow for folders
- Highlights on selection (blue background)
- Triggers onSelect callback on click

## Requirements
- Use TypeScript interfaces for props
- CSS classes should match DESIGN.md specifications
- Handle hover and focus states
- Support keyboard navigation
- Keep component focused and reusable
```

### Debugging an Issue

```markdown
## Context
I'm working on Flint. The WAD extraction is failing.

## Current Behavior
Error message: "Failed to read WAD: InvalidMagic"

## Expected Behavior
Should successfully read and list chunks from.wad files

## Relevant Code
[paste relevant code]

## What I've Tried
1. Verified file exists
2. Checked file permissions

Please help diagnose and fix this issue.
```

---

## 10. Context Reset Checklist

When starting a new AI session, provide:

- [ ] Link to or paste `docs/OVERVIEW.md`
- [ ] Relevant section from `docs/REQUIREMENTS.md`
- [ ] Current task from `docs/TASKS.md`
- [ ] This `docs/AI-STEERING.md` document
- [ ] Any existing related code (paste or file paths)
- [ ] Specific error messages if debugging
