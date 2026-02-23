# Flint - Implementation Tasks

> Detailed task breakdown for implementing the Flint modding IDE.

---

## Development Phases

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | Foundation & Core Engine | ✅ Complete |
| Phase 2 | UI Implementation | ✅ Complete |
| Phase 3 | Preview System | ✅ Complete |
| Phase 4 | Export System | ✅ Complete |
| Phase 5 | BIN Editor | 🔵 In Progress |
| Phase 6 | Polish & Optimization | ✅ Complete |

---

## Phase 1: Foundation & Core Engine

### FLINT-001: Project Setup and Configuration

**Priority**: Critical  
**Estimated Effort**: 1 day  
**Dependencies**: None  
**Status**: ✅ Complete

#### Description
Set up the Tauri project with proper configuration, dependencies, and folder structure.

#### Acceptance Criteria
- [x] Tauri 2.x project initialized
- [x] Rust dependencies configured in Cargo.toml
- [x] Frontend build system (Vite) configured
- [x] Development workflow (npm run tauri dev) works

#### Technical Notes
- Already completed as per PROJECT_STRUCTURE.md
- Using league-toolkit for WAD operations

---

### FLINT-002: Hash Table Management

**Priority**: Critical  
**Estimated Effort**: 2 days  
**Dependencies**: FLINT-001  
**Status**: ✅ Complete

#### Description
Implement hash table loading and management for resolving WAD file paths.

#### Acceptance Criteria
- [x] Load hash files from RitoShark shared directory
- [x] Download hashes from CommunityDragon if missing
- [x] Hash lookup by xxhash64 value
- [x] Status reporting via Tauri commands

#### Technical Notes
- Uses shared path: `%APPDATA%/RitoShark/Requirements/Hashes`
- Fallback to app-specific directory if shared not available

---

### FLINT-003: WAD File Reading

**Priority**: Critical  
**Estimated Effort**: 2 days  
**Dependencies**: FLINT-002  
**Status**: ✅ Complete

#### Description
Implement WAD file reading using league-toolkit.

#### Acceptance Criteria
- [x] Read WAD file headers
- [x] List chunks with resolved paths
- [x] Extract specific chunks to bytes
- [x] Handle multiple WAD versions

---

### FLINT-004: BIN File Parsing

**Priority**: Critical  
**Estimated Effort**: 3 days  
**Dependencies**: FLINT-002  
**Status**: ✅ Complete

#### Description
Parse and convert BIN (ritobin) property files.

#### Acceptance Criteria
- [x] Parse binary BIN files to structured data
- [x] Convert BIN to text format (ritobin style)
- [x] Convert BIN to JSON format
- [x] Reverse conversion (text/JSON to BIN)

---

### FLINT-005: League Installation Detection

**Priority**: High  
**Estimated Effort**: 1 day  
**Dependencies**: FLINT-001  
**Status**: ✅ Complete

#### Description
Detect League of Legends installation path automatically.

#### Acceptance Criteria
- [x] Check common installation paths
- [x] Read Windows registry for Riot Client paths
- [x] Validate found paths contain expected files
- [x] Support manual path override

#### Technical Notes
Common paths:
- `C:\Riot Games\League of Legends`
- `D:\Riot Games\League of Legends`
Registry key: `HKEY_CURRENT_USER\Software\Riot Games\RADS`

---

### FLINT-006: Champion & Skin Discovery

**Priority**: High  
**Estimated Effort**: 2 days  
**Dependencies**: FLINT-003, FLINT-004, FLINT-005  
**Status**: ✅ Complete

#### Description
Scan League files to build champion/skin database.

#### Acceptance Criteria
- [x] Parse Champions folder structure
- [x] Extract skin names and IDs per champion
- [x] Build searchable champion list
- [x] Cache results for performance

#### Technical Notes
- Champions in: `DATA/FINAL/Champions/`
- Skins identified by folder pattern: `Skins/Skin0, Skin1, ...`

---

### FLINT-007: Asset Validation Engine

**Priority**: High  
**Estimated Effort**: 2 days  
**Dependencies**: FLINT-003, FLINT-004  
**Status**: ✅ Complete

#### Description
Validate that referenced assets actually exist in WAD files.

#### Acceptance Criteria
- [x] Parse BIN files for asset path references
- [x] Check each path against WAD contents
- [x] Report missing/broken references
- [x] Create validation report

---

### FLINT-008: Project File Structure

**Priority**: High  
**Estimated Effort**: 1 day  
**Dependencies**: FLINT-001  
**Status**: ✅ Complete

#### Description
Define and implement project file structure.

#### Acceptance Criteria
- [x] Define project.json schema
- [x] Create project initialization logic
- [x] Implement project save/load
- [x] Handle project directory structure

#### Technical Notes
```json
{
  "name": "Project Name",
  "champion": "Ahri",
  "skin": 0,
  "version": "1.0.0",
  "created": "2024-01-01T00:00:00Z",
  "leaguePath": "C:\\Riot Games\\..."
}
```

---

## Phase 2: UI Implementation

### FLINT-101: Frontend Framework Setup

**Priority**: Critical  
**Estimated Effort**: 1 day  
**Dependencies**: FLINT-001  
**Status**: ✅ Complete

#### Description
Set up the frontend framework (React/Vue/Svelte) with styling.

#### Acceptance Criteria
- [x] Framework installed and configured (Vanilla JS + Vite)
- [x] CSS design system implemented
- [x] Basic layout structure created
- [x] Dark theme implemented

#### Technical Notes
- Using Vanilla JS with Vite for minimal dependencies
- Implemented design tokens from DESIGN.md in `src/styles/index.css`

---

### FLINT-102: Tauri Bridge Layer

**Priority**: Critical  
**Estimated Effort**: 2 days  
**Dependencies**: FLINT-101  
**Status**: ✅ Complete

#### Description
Create TypeScript wrappers for all Tauri commands.

#### Acceptance Criteria
- [ ] Type definitions for all command responses
- [ ] Async wrapper functions for each command
- [ ] Error handling with user-friendly messages
- [ ] Loading state management

---

### FLINT-103: Top Bar Component

**Priority**: High  
**Estimated Effort**: 0.5 days  
**Dependencies**: FLINT-101  
**Status**: ✅ Complete

#### Description
Implement the top navigation bar.

#### Acceptance Criteria
- [x] Flint logo and branding
- [x] Project name display
- [x] Configure button (settings modal trigger)
- [x] Export dropdown button

---

### FLINT-104: File Tree Component

**Priority**: Critical  
**Estimated Effort**: 3 days  
**Dependencies**: FLINT-101, FLINT-102  
**Status**: ✅ Complete

#### Description
Implement the left panel file tree view.

#### Acceptance Criteria
- [x] Hierarchical folder/file structure
- [x] Expand/collapse folders
- [x] File type icons
- [x] File count badges
- [x] Selection handling
- [x] Context menu
- [x] Search/filter functionality

---

### FLINT-105: Welcome Screen

**Priority**: High  
**Estimated Effort**: 1 day  
**Dependencies**: FLINT-101  
**Status**: ✅ Complete

#### Description
Create the welcome/empty state for the center panel.

#### Acceptance Criteria
- [x] Flint branding display
- [x] "Create New Project" button
- [x] "Open Existing Project" button
- [x] Recent projects list

---

### FLINT-106: New Project Modal

**Priority**: Critical  
**Estimated Effort**: 2 days  
**Dependencies**: FLINT-101, FLINT-006  
**Status**: ✅ Complete

#### Description
Create the new project creation modal.

#### Acceptance Criteria
- [x] Project name input
- [x] Champion dropdown with search
- [x] Skin selection dropdown
- [x] Project path selection
- [x] Create button with validation

---

### FLINT-107: Settings Modal

**Priority**: Medium  
**Estimated Effort**: 1 day  
**Dependencies**: FLINT-101  
**Status**: ✅ Complete

#### Description
Create the settings/configuration modal.

#### Acceptance Criteria
- [x] League path configuration
- [x] Default project path
- [x] Hash update preferences
- [x] Window state preferences

---

### FLINT-108: Status Bar Component

**Priority**: Medium  
**Estimated Effort**: 0.5 days  
**Dependencies**: FLINT-101  
**Status**: ✅ Complete

#### Description
Implement the bottom status bar.

#### Acceptance Criteria
- [x] Status indicator (ready/working/error)
- [x] Hash count display
- [x] Contextual information display

---

## Phase 3: Preview System

### FLINT-201: Preview Panel Layout

**Priority**: High  
**Estimated Effort**: 1 day  
**Dependencies**: FLINT-104  
**Status**: ✅ Complete

#### Description
Create the center panel preview container.

#### Acceptance Criteria
- [x] Toolbar area (zoom, navigation)
- [x] Preview content area
- [x] Info bar at bottom
- [x] Handle different content types

---

### FLINT-202: DDS Image Preview

**Priority**: Critical  
**Estimated Effort**: 3 days  
**Dependencies**: FLINT-201  
**Status**: ✅ Complete

#### Description
Implement DDS texture preview.

#### Acceptance Criteria
- [x] Decode DDS to displayable format
- [x] Support BC1-7 compression types
- [x] Transparency checkerboard background
- [x] Zoom and pan controls

#### Technical Notes
- May need WebGL or WASM decoder
- Consider using existing DDS libraries

---

### FLINT-203: Hex Viewer Fallback

**Priority**: Medium  
**Estimated Effort**: 1 day  
**Dependencies**: FLINT-201  
**Status**: ✅ Complete

#### Description
Display hex dump for unknown file types.

#### Acceptance Criteria
- [x] Hex + ASCII display
- [x] Address column
- [x] Scrollable large files
- [x] Copy functionality

---

### FLINT-204: File Info Display

**Priority**: Medium  
**Estimated Effort**: 0.5 days  
**Dependencies**: FLINT-201  
**Status**: ✅ Complete

#### Description
Show file metadata in preview info bar.

#### Acceptance Criteria
- [x] File type
- [x] Dimensions (for images)
- [x] Size (original and compressed)
- [x] Path information

---

## Phase 4: Export System

### FLINT-300: Asset Extraction During Project Creation

**Priority**: Critical  
**Estimated Effort**: 2 days  
**Dependencies**: FLINT-003, FLINT-006  
**Status**: ✅ Complete

#### Description
Extract champion/skin assets from WAD files into the project folder when creating a new project. This is required before any preview or export functionality can work.

#### Acceptance Criteria
- [x] Find champion WAD file from League path
- [x] Extract skin-specific assets (textures, BIN, audio)
- [x] Preserve folder structure from WAD paths
- [x] Show extraction progress to user
- [x] Handle extraction errors gracefully

#### Technical Notes
- Champion WAD location: `Game/DATA/FINAL/Champions/{champion}.wad.client`
- Need to filter chunks by skin path prefix (e.g., `assets/characters/{champion}/skins/skin{id}/`)
- Should also extract shared base assets

---

### FLINT-301: Repathing Engine

**Priority**: Critical  
**Estimated Effort**: 3 days  
**Dependencies**: FLINT-004, FLINT-007, FLINT-300  
**Status**: ✅ Complete

#### Description
Implement asset repathing logic.

#### Acceptance Criteria
- [x] Parse BIN for path references
- [x] Apply path prefix replacements
- [x] Relocate asset files to match new paths
- [x] Update BIN files with new paths
- [x] Validate repathed structure

---

### FLINT-302: Fantome Export Builder

**Priority**: Critical  
**Estimated Effort**: 2 days  
**Dependencies**: FLINT-301  
**Status**: ✅ Complete

#### Description
Generate .fantome mod packages.

#### Acceptance Criteria
- [x] Create WAD structure for mod files
- [x] Generate META/info.json
- [x] Package as ZIP with .fantome extension
- [x] Validate output with known working tools

---

### FLINT-303: Modpkg Export Builder

**Priority**: High  
**Estimated Effort**: 2 days  
**Dependencies**: FLINT-301  
**Status**: ⚪ Not Started

#### Description
Generate .modpkg mod packages.

#### Acceptance Criteria
- [ ] Create modpkg structure
- [ ] Generate required metadata
- [ ] Package correctly
- [ ] Validate against league-mod specs

---

### FLINT-304: Export UI

**Priority**: High  
**Estimated Effort**: 1 day  
**Dependencies**: FLINT-302, FLINT-303  
**Status**: ✅ Complete

#### Description
Create export dialog and workflow.

#### Acceptance Criteria
- [x] Format selection (fantome/modpkg)
- [x] Metadata entry (name, author, description)
- [x] Output path selection
- [x] Progress indication
- [x] Success/error feedback

---

## Phase 5: BIN Editor

### FLINT-401: BIN Property Tree

**Priority**: Medium  
**Estimated Effort**: 3 days  
**Dependencies**: FLINT-004, FLINT-201  
**Status**: ⚪ Not Started

#### Description
Display BIN file contents in editable tree view.

#### Acceptance Criteria
- [ ] Hierarchical property display
- [ ] Expand/collapse sections
- [ ] Property type indicators
- [ ] Search within properties

---

### FLINT-402: Property Value Editing

**Priority**: Medium  
**Estimated Effort**: 2 days  
**Dependencies**: FLINT-401  
**Status**: ⚪ Not Started

#### Description
Allow editing of BIN property values.

#### Acceptance Criteria
- [ ] Edit numeric values
- [ ] Edit string/path values
- [ ] Validation before save
- [ ] Undo/redo support

---

### FLINT-403: Path Inspector

**Priority**: Medium  
**Estimated Effort**: 1 day  
**Dependencies**: FLINT-401  
**Status**: ⚪ Not Started

#### Description
Specialized view for path properties.

#### Acceptance Criteria
- [ ] List all path references
- [ ] Show path status (valid/missing)
- [ ] Quick navigation to path
- [ ] Batch repath operations

---

## Phase 6: Polish & Optimization

### FLINT-501: Performance Optimization

**Priority**: Medium  
**Estimated Effort**: 2 days  
**Dependencies**: All previous phases  
**Status**: ✅ Complete

#### Description
Optimize performance bottlenecks.

#### Acceptance Criteria
- [x] Profile and identify slow operations
- [ ] Lazy load file tree for large projects
- [x] Cache preview images
- [ ] Optimize BIN parsing for large files

---

### FLINT-502: Error Handling Polish

**Priority**: High  
**Estimated Effort**: 1 day  
**Dependencies**: All previous phases  
**Status**: ✅ Complete

#### Description
Improve error messages and recovery.

#### Acceptance Criteria
- [x] User-friendly error messages
- [x] Recovery suggestions
- [x] Error logging for debugging
- [x] Graceful degradation

---

### FLINT-503: Documentation

**Priority**: Medium  
**Estimated Effort**: 2 days  
**Dependencies**: All previous phases  
**Status**: ✅ Complete

#### Description
Write user documentation.

#### Acceptance Criteria
- [x] Quick start guide
- [x] Feature documentation
- [x] Troubleshooting guide
- [x] FAQ

---

## Dependency Graph

```
FLINT-001 (Setup)
    │
    ├── FLINT-002 (Hashes)
    │       │
    │       ├── FLINT-003 (WAD)
    │       │       │
    │       │       └── FLINT-007 (Validation)
    │       │
    │       └── FLINT-004 (BIN)
    │               │
    │               └── FLINT-301 (Repathing)
    │
    ├── FLINT-005 (League Detection)
    │       │
    │       └── FLINT-006 (Champion Discovery)
    │
    ├── FLINT-008 (Project Structure)
    │
    └── FLINT-101 (Frontend)
            │
            ├── FLINT-102 (Bridge)
            │
            ├── FLINT-103 (Top Bar)
            │
            ├── FLINT-104 (File Tree)
            │       │
            │       └── FLINT-201 (Preview Panel)
            │               │
            │               ├── FLINT-202 (DDS Preview)
            │               └── FLINT-203 (Hex Viewer)
            │
            ├── FLINT-105 (Welcome)
            │
            ├── FLINT-106 (New Project Modal)
            │
            └── FLINT-107 (Settings)
```

---

## Milestones

### Milestone 1: MVP - Basic Extraction ✅
**Target**: Core backend working
- [x] FLINT-001: Project setup
- [x] FLINT-002: Hash management
- [x] FLINT-003: WAD reading
- [x] FLINT-004: BIN parsing

### Milestone 2: UI Framework ✅
**Target**: Basic UI visible
- [x] FLINT-101: Frontend setup
- [x] FLINT-102: Tauri bridge
- [x] FLINT-103-108: Core components

### Milestone 3: Preview Working ✅
**Target**: View extracted assets
- [x] FLINT-201-204: Preview system complete

### Milestone 4: Fantome Export ✅
**Target**: First mod export
- [x] FLINT-301: Repathing engine
- [x] FLINT-302: Fantome builder
- [x] FLINT-304: Export UI

### Milestone 5: Full Feature Set 🔵
**Target**: All planned features
- [ ] FLINT-303: Modpkg export
- [ ] FLINT-401-403: BIN editor

### Milestone 6: Production Ready ✅
**Target**: Release candidate
- [x] FLINT-501-503: Polish and documentation
