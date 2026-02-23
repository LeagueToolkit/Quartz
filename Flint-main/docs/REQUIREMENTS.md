# Flint - Requirements Document

> Comprehensive functional and technical requirements for the Flint modding IDE.

---

## 1. Functional Requirements

### 1.1 Project Management

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-PM-01 | Create new mod project | MUST | User can create project with name, champion, and skin selection |
| FR-PM-02 | Open existing project | MUST | User can open `.flint` project files and resume work |
| FR-PM-03 | Save project state | MUST | All modifications persist across sessions |
| FR-PM-04 | Recent projects list | SHOULD | Quick access to last 10 opened projects |
| FR-PM-05 | Project templates | COULD | Pre-configured templates for common mod types |

### 1.2 League Installation Detection

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-LD-01 | Auto-detect League installation | MUST | Automatically find League folder on startup |
| FR-LD-02 | Manual path selection | MUST | User can manually browse to League folder |
| FR-LD-03 | Path validation | MUST | Verify selected path contains valid League files |
| FR-LD-04 | Path persistence | SHOULD | Remember user's League path between sessions |

### 1.3 Asset Extraction

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-AE-01 | Champion selection | MUST | User selects champion from searchable list |
| FR-AE-02 | Skin selection | MUST | User selects skin(s) to extract |
| FR-AE-03 | WAD scanning | MUST | Identify all WAD files containing champion assets |
| FR-AE-04 | BIN parsing | MUST | Parse BIN files to find asset references |
| FR-AE-05 | Selective extraction | SHOULD | User can choose which asset categories to extract |
| FR-AE-06 | Validation before extraction | MUST | Only extract files that actually exist in archives |
| FR-AE-07 | Extraction progress | MUST | Show progress bar during extraction |
| FR-AE-08 | Error reporting | MUST | Clear messages for any extraction failures |

### 1.4 File Tree View

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-FT-01 | Hierarchical display | MUST | Show files in expandable folder structure |
| FR-FT-02 | Category grouping | MUST | Group by type: particles, characters, audio, textures, etc. |
| FR-FT-03 | File counts | SHOULD | Show number of files per folder |
| FR-FT-04 | Search/filter | SHOULD | Filter files by name or type |
| FR-FT-05 | Multi-select | COULD | Select multiple files for batch operations |
| FR-FT-06 | Context menu | SHOULD | Right-click menu for file operations |

### 1.5 Asset Preview

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-AP-01 | Texture preview | MUST | Display DDS images inline |
| FR-AP-02 | Hex viewer fallback | MUST | Show hex dump for unknown formats |
| FR-AP-03 | Model preview | COULD | 3D view for SKN/SKL files |
| FR-AP-04 | Audio playback | COULD | Play extracted audio files |
| FR-AP-05 | Preview zoom/pan | SHOULD | Navigate large images |

### 1.6 Repathing Engine

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-RE-01 | Automatic repathing | MUST | Modify asset paths in BIN files automatically |
| FR-RE-02 | Path preview | SHOULD | Show before/after paths before applying |
| FR-RE-03 | File relocation | MUST | Move extracted files to match new paths |
| FR-RE-04 | Conflict detection | SHOULD | Warn about path conflicts |
| FR-RE-05 | Undo repathing | COULD | Revert repathing changes |

### 1.7 BIN Editor (Future)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-BE-01 | Property browser | SHOULD | View all properties in selected BIN file |
| FR-BE-02 | Value editing | SHOULD | Modify numeric, string, and path values |
| FR-BE-03 | Path inspector | SHOULD | See all path references in a BIN |
| FR-BE-04 | Validation | SHOULD | Validate changes before saving |
| FR-BE-05 | Syntax highlighting | COULD | Color-coded property display |

### 1.8 Export System

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-EX-01 | .fantome export | MUST | Generate valid .fantome mod packages |
| FR-EX-02 | .modpkg export | SHOULD | Generate valid .modpkg packages |
| FR-EX-03 | Export preview | SHOULD | Show what will be included before export |
| FR-EX-04 | Metadata editing | SHOULD | Set mod name, author, description |
| FR-EX-05 | Output path selection | MUST | User chooses where to save export |

---

## 2. Technical Requirements

### 2.1 System Requirements

| ID | Requirement | Details |
|----|-------------|---------|
| TR-SYS-01 | **Operating Systems** | Windows 10/11 (primary), macOS, Linux |
| TR-SYS-02 | **Memory** | Minimum 4GB RAM, recommended 8GB |
| TR-SYS-03 | **Disk Space** | 500MB for application, variable for projects |
| TR-SYS-04 | **Display** | 1280x720 minimum resolution |

### 2.2 File Format Support

| Format | Read | Write | Notes |
|--------|------|-------|-------|
| WAD | ✅ | ❌ | Read-only via league-toolkit |
| BIN/ritobin | ✅ | ✅ | Full read/write support |
| DDS | ✅ | ❌ | Preview only |
| SKN | ✅ | ❌ | Preview only (future) |
| SKL | ✅ | ❌ | Preview only (future) |
| .fantome | ❌ | ✅ | Write-only for export |
| .modpkg | ❌ | ✅ | Write-only for export |

### 2.3 Backend Requirements

| ID | Requirement | Details |
|----|-------------|---------|
| TR-BE-01 | **Rust Version** | Edition 2021, stable toolchain |
| TR-BE-02 | **Tauri Version** | 2.x series |
| TR-BE-03 | **Async Runtime** | Tokio for all I/O operations |
| TR-BE-04 | **Error Handling** | Result types, no panics in production |
| TR-BE-05 | **Logging** | Tracing for all significant operations |

### 2.4 Performance Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| TR-PR-01 | Application startup | < 3 seconds |
| TR-PR-02 | WAD file scan | < 5 seconds per archive |
| TR-PR-03 | Asset extraction | > 10 MB/s throughput |
| TR-PR-04 | File tree rendering | < 100ms for 1000 items |
| TR-PR-05 | Memory usage | < 500MB for typical project |

### 2.5 Integration Requirements

| ID | Requirement | Details |
|----|-------------|---------|
| TR-INT-01 | **CommunityDragon** | Download and update hash tables |
| TR-INT-02 | **league-toolkit** | WAD file operations |
| TR-INT-03 | **league-mod** | .modpkg format validation (future) |

---

## 3. Data Requirements

### 3.1 Project Structure

```
<project_name>.flint/
├── project.json          # Project metadata and settings
├── assets/               # Extracted and modified assets
│   ├── particles/
│   ├── characters/
│   ├── audio/
│   └── textures/
├── cache/                # Cached WAD/BIN data
├── repath_rules.json     # Custom repathing rules
└── output/               # Generated export files
```

### 3.2 Configuration Data

| Data | Storage | Notes |
|------|---------|-------|
| League path | User config | `%APPDATA%/Flint/config.json` |
| Hash tables | Shared | `%APPDATA%/RitoShark/Requirements/Hashes` |
| Recent projects | User config | Last 10 project paths |
| Window state | User config | Size, position, panel widths |

### 3.3 Asset Metadata

Each extracted asset tracks:
- Original path (from WAD)
- New path (after repathing)
- File type and size
- Modification status
- Associated BIN references

---

## 4. Constraints & Limitations

### 4.1 Will NOT Do

| Constraint | Reason |
|------------|--------|
| Online multiplayer mods | Technical/ethical limitations |
| Champion ability modifications | Beyond scope of cosmetic modding |
| Automatic mod updates | Out of scope for v1.0 |
| In-game overlay | Not a mod manager, just an IDE |
| WAD file creation | Read-only access to game files |

### 4.2 Known Limitations

| Limitation | Mitigation |
|------------|------------|
| Windows-first development | Cross-platform planned for later |
| English-only UI initially | i18n framework included for future |
| No 3D model editing | Preview only, use external tools |
| Single project at a time | Tabbed projects in future version |

---

## 5. Success Criteria

### 5.1 MVP Criteria

- [ ] User can create a new project
- [ ] User can select a champion and skin
- [ ] Assets are extracted with validation
- [ ] File tree displays extracted assets
- [ ] Basic texture preview works
- [ ] Repathing applies automatically
- [ ] Export to .fantome succeeds

### 5.2 User Acceptance Criteria

| Metric | Target |
|--------|--------|
| Task completion rate | > 90% for core workflows |
| Error rate | < 5% of extraction attempts fail |
| Time savings | 50% reduction vs manual workflow |
| User satisfaction | Positive feedback from 3+ beta testers |

---

## 6. Priority Matrix (MoSCoW)

### MUST Have (MVP)
- Project creation and management
- League installation detection
- Asset extraction with validation
- File tree view
- Basic texture preview
- Automatic repathing
- .fantome export

### SHOULD Have (v1.1)
- BIN editor
- .modpkg export
- Search and filter
- Path conflict detection
- Export preview

### COULD Have (v1.2+)
- 3D model preview
- Audio playback
- Multi-select operations
- Project templates
- Custom repath rules

### WON'T Have (Out of Scope)
- In-game mod loading
- WAD file creation/editing
- Online mod repository
- Automatic updates
