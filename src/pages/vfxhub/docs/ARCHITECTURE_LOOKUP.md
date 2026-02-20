# VFXHub Architecture Lookup

## Purpose
`vfxhub` is the GitHub-driven VFX hub + target editor:
- Target pane: local target bin content to modify.
- Hub/donor pane: downloaded systems from GitHub collections.
- Supports porting emitters/systems, upload/download, assets, persistent/idle/child/matrix tools.

Route:
- `src/App.js` -> `/vfx-hub` -> `src/pages/vfxhub/VFXHub.js`

## Quick Lookup Table
| Concern | Primary File | Notes |
|---|---|---|
| Page composition | `src/pages/vfxhub/VFXHub.js` | Main orchestrator and page-level wiring. |
| GitHub collections state | `src/pages/vfxhub/hooks/useGitHubCollections.js` | Load/auth/filter/pagination/modal open/refresh. |
| Download systems/assets | `src/pages/vfxhub/hooks/useVfxDownload.js` | Download VFX systems and copy assets into project. |
| Upload flow | `src/pages/vfxhub/hooks/useVfxUpload.js` | Prepare + execute upload and metadata handling. |
| Combined hook (WIP) | `src/pages/vfxhub/hooks/useVfxHub.js` | Composition scaffold for modular wiring. |
| Toolbar | `src/pages/vfxhub/components/VfxHubToolbar.js` | Open target, open hub, upload actions. |
| Footer/status | `src/pages/vfxhub/components/VfxHubFooter.js` | Status line and small controls. |
| Collections modal | `src/pages/vfxhub/components/CollectionBrowser.js` | Search/filter/page + download list UI. |
| Collection card | `src/pages/vfxhub/components/CollectionItem.js` | Per-system display in browser grid. |
| Upload modal | `src/pages/vfxhub/components/UploadModal.js` | Upload selection, metadata, asset preview. |
| New system modal | `src/pages/port2/components/modals/NewVfxSystemModal.js` | Shared by Port2 and VFXHub for target system creation UX. |
| Guard dialogs | `src/components/modals/UnsavedChangesModal.js`, `src/components/modals/RitoBinErrorDialog.js` | Shared unsaved guard + shared conversion error dialog. |
| Asset path helper | `src/pages/vfxhub/utils/assetDetection.js` | Project root / asset destination helpers. |
| Shared list renderer | `src/pages/port2/components/ParticleSystemList/` | VFXHub uses port2 list components. |
| Shared VFX mutations | `src/utils/vfx/mutations/*.js` | Persistent/idle/child/matrix mutation helpers used through port2 hooks/components. |

## Current Integration Notes
VFXHub intentionally reuses many `port2` pieces:
- Modals: persistent, idle, child, matrix from `port2/components`.
- Hooks: idle and child from `port2/hooks`.
- System list: `port2/components/ParticleSystemList`.
- Texture preview behavior: wired with the same hover/click context actions used by port2.

This reduces duplicate behavior and keeps interaction parity between tools.

## Core State Ownership
`VFXHub.js` still owns page session state, while GitHub upload/download concerns are in dedicated hooks.

Major state groups:
- File/session: target/donor paths, py content, save flag, processing text/status.
- Parsed systems: `targetSystems`, `donorSystems`.
- Selection/UI: selected target system, collapse sets, filters, drag/list state.
- Feature tools: persistent, idle, child, matrix modal states and data.
- Hub state: collections/search/category/page/download modal from `useGitHubCollections`.
- Upload state: selected systems, metadata, preparation/output from `useVfxUpload`.

## End-to-End Flows
### Open Hub and Download
1. `VfxHubToolbar` triggers open hub.
2. `useGitHubCollections.handleOpenVFXHub` tests access and opens browser modal.
3. Download action uses `useVfxDownload.downloadVFXSystem`.
4. Downloaded systems populate donor pane; assets copied to project `assets/vfxhub`.

### Port to Target
1. Donor row action triggers port handlers in `VFXHub.js`.
2. Target systems and py content update.
3. Save flag and status update; asset copy attempts run where applicable.

### Upload to Hub
1. Toolbar upload opens `UploadModal` via `useVfxUpload.handleUploadToVFXHub`.
2. `prepareUpload` analyzes selected systems/assets.
3. `executeUpload` submits through GitHub API and refreshes collections.

## Edit Playbook
### Add a new hub filter or collection metadata field
1. Extend `useGitHubCollections.js` derived filtering/pagination.
2. Update `CollectionBrowser.js` UI.
3. Keep filter state in hook, not in component local state.

### Add a new upload validation rule
1. Add rule in `useVfxUpload.prepareUpload`.
2. Show user-facing status in `setStatusMessage`.
3. Keep modal presentation logic in `UploadModal.js` only.

### Change target/donor list behavior
1. Prefer changes in `port2/components/ParticleSystemList/*` for shared behavior.
2. Wire additional props in `VFXHub.js` as needed.

## Known Maintainability Direction
- Goal is continued shrink of `VFXHub.js` into hook-driven modules, similar to `port2`.
- Keep business logic in hooks/util files, UI in components, and avoid adding new monolithic inline blocks.
- Preserve behavior parity with port2 for actions users expect to work the same way.
