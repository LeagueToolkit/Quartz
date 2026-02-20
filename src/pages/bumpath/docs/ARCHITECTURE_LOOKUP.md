# Bumpath Architecture Lookup

## Purpose
`bumpath` is the BIN repathing tool:
- Loads source folders and discovers BIN files.
- Scans selected BIN content against hashes.
- Applies prefix changes to editable entries.
- Processes and writes repathed output.
- Supports guided "Quick Repath" and manual advanced flow.

Route:
- `src/App.js` -> `/bumpath` -> `src/pages/bumpath/Bumpath.js`

## Quick Lookup Table
| Concern | Primary File | Notes |
|---|---|---|
| Entry export | `src/pages/bumpath/index.js` | Re-export of `Bumpath`. |
| Page composition | `src/pages/bumpath/Bumpath.js` | State orchestration and layout composition. |
| API bridge | `src/pages/bumpath/hooks/useBumpathCoreApi.js` | Native endpoint-like calls to `BumpathCore`. |
| Source + scan flow | `src/pages/bumpath/hooks/useBumpathSourceScan.js` | Source folder add, BIN selection, debounced scan. |
| Action flow | `src/pages/bumpath/hooks/useBumpathActions.js` | Apply prefix, process, reset, output dir select. |
| Entry list behavior | `src/pages/bumpath/hooks/useBumpathEntries.js` | Select/expand/filter and display naming logic. |
| Top controls | `src/pages/bumpath/components/BumpathTopBar.js` | Source add + bulk select actions. |
| Bottom controls | `src/pages/bumpath/components/BumpathBottomControls.js` | Prefix/output/process/quick-repath actions. |
| Source BIN list | `src/pages/bumpath/components/SourceBinsPanel.js` | BIN filter + selection UI. |
| Entries renderer | `src/pages/bumpath/components/EntriesPanel.js` | Scanned entries and referenced file groups. |
| Quick wizard | `src/pages/bumpath/components/QuickRepathWizardModal.js` | Step-by-step quick repath setup. |
| Source mode chooser | `src/pages/bumpath/components/SourceAddModeModal.js` | Quick vs normal modal after source add. |
| Shared button styles | `src/pages/bumpath/utils/styles.js` | Centralized action button look/feedback. |

## Core State Ownership
`Bumpath.js` owns page-level state.

Major state groups:
- Source/scan: `sourceDirs`, `sourceBins`, `isScanning`, `scannedData`.
- Edit/process: `selectedEntries`, `prefixText`, `appliedPrefixes`, `outputPath`, `isProcessing`.
- Workflow: quick wizard state (`quickRepath*`) and source-add mode modal.
- UI: filters, expansion sets, guide overlays, console, status toasts.

## End-to-End Flows
### Normal Repath
1. Add source folder (browse or drag-drop).
2. Choose **Normal Repath** in source mode modal.
3. Select BIN(s), scan, select entries, apply prefix.
4. Select output and run process.

### Quick Repath
1. Add source folder (browse or drag-drop).
2. Choose **Quick Repath (Recommended)**.
3. Wizard steps: main BIN -> prefix -> output/settings.
4. Run quick flow: select main BIN, scan, apply prefix to editable entries, process.

## Guardrails
- Keep heavy business logic in hooks; avoid regressing to large inline logic in `Bumpath.js`.
- Keep processing and scanning state transitions explicit (`isScanning`, `isProcessing`).
- Keep quick and normal flows aligned to same core APIs (`useBumpathCoreApi`).
- Preserve immutable updates for entry/bin state structures.
