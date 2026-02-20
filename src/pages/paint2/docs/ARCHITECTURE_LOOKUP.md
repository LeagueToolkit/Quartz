# Paint2 Architecture Lookup

## Purpose
`paint2` is the VFX color editing tool:
- Loads VFX file content.
- Displays systems/materials/colors.
- Applies palettes and direct color transforms.
- Saves back with backup + ritobin safety flows.

Route:
- `src/App.js` -> `/paint2` -> `src/pages/paint2/Paint2.js`

## Quick Lookup Table
| Concern | Primary File | Notes |
|---|---|---|
| Page composition | `src/pages/paint2/Paint2.js` | Main state + orchestration. |
| Entry export | `src/pages/paint2/index.js` | Re-export of `Paint2`. |
| Toolbar | `src/pages/paint2/components/Toolbar.js` | Open/save/undo/history controls. |
| Systems renderer | `src/pages/paint2/components/SystemList.js` | System/material/color rows and interactions. |
| Palette panel | `src/pages/paint2/components/PalettePanel.js` | Palette browsing + apply controls. |
| Palette manager dialogs | `src/pages/paint2/components/PaletteManager.js` | Save/delete palette UX. |
| Color cell | `src/pages/paint2/components/ColorBlock.js` | Per-color interactions and picker integration. |
| VFX parser | `src/pages/paint2/utils/parser.js` | Parse file into editable model. |
| Color ops | `src/pages/paint2/utils/colorOps.js` | Apply palette transforms. |
| Paint2 utility boundary | `src/pages/paint2/utils/*` + `src/utils/*` domains | Page-local parser/color ops in paint2, shared services in utils domains. |
| Palette persistence | `src/pages/paint2/utils/paletteManager.js` | Paint2-owned palette storage. |
| Backup/safety | `src/utils/io/backupManager.js`, `src/components/modals/BackupViewer.js`, `src/components/modals/RitobinWarningModal.js` | Backup and warning flows. |
| Texture preview helpers | `src/utils/assets/textureConverter.js`, `src/utils/assets/assetPreviewEvent.js`, `src/components/modals/textureHoverPreview.js` | Texture hover + preview bridge. |

## Core State Ownership
`Paint2.js` owns feature state.

Major state groups:
- File/session: `filePath`, `fileName`, `fileSaved`, load status.
- Parsed content: `parsedFile`.
- Selection/locks: selected systems, locked systems.
- Search/filter/expand: query, expand sets, variant filter, texture search toggle.
- Palette/edit mode: mode, palette values, color count, dialogs.
- Safety/UI: undo stack, unsaved navigation guard, backup viewer, ritobin warning.

## End-to-End Flows
### Open File
1. Trigger from toolbar.
2. Parse via `parseVfxFile` and update `parsedFile`.
3. Update file/session flags and status message.

### Apply Palette
1. Palette action triggers `applyPaletteToEmitters` / `applyPaletteToMaterials`.
2. `parsedFile` updates and pushes undo snapshot.
3. Save flag becomes unsaved.

### Save
1. Save handler serializes via `src/utils/io/fileOperations.js`.
2. Backup and warning flows run as needed.
3. Save flag resets.

## Edit Playbook
### Add a new color transform mode
1. Add mode UI in `Toolbar.js` or mode controls in `Paint2.js`.
2. Implement transform in `src/pages/paint2/utils/colorOps.js`.
3. Wire to update `parsedFile` and push undo.

### Add a new palette feature
1. Extend `PalettePanel.js` and/or `PaletteManager.js` UI.
2. Persist through `src/pages/paint2/utils/paletteManager.js`.
3. Keep conversion logic in `src/utils/colors/ColorHandler.js`.

### Add new filter logic
1. Keep filter derivation in `Paint2.js` memoized selectors.
2. Pass filtered data to `SystemList.js`.

## Guardrails
- Keep parser and color math in `src/pages/paint2/utils`, not in JSX components.
- Avoid mutating parsed structures in-place; use immutable updates.
- Keep undo snapshots lightweight but complete enough to restore user intent.
- Maintain consistent file-safety behavior (backup + warning + unsaved guard).
