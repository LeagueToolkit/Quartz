# BnkExtract Architecture Lookup

## Purpose
`bnkextract` is the sound-bank editor/extractor:
- Load `.bnk`, `.wpk`, optional `.bin`.
- Parse audio trees, preview/replace/delete entries, save/repack.
- Support drag-drop replacement, Wwise conversion/amplify, splitter workflows.

Route:
- `src/App.js` -> `/bnk-extract` -> `src/pages/bnkextract/BnkExtract.js`

## Current Topology
- Page orchestrator:
`src/pages/bnkextract/BnkExtract.js`
- Styles:
`src/pages/bnkextract/BnkExtract.css`
- Feature components:
`src/pages/bnkextract/components/*`
- Feature hooks:
`src/pages/bnkextract/hooks/*`
- Feature utils:
`src/pages/bnkextract/utils/*`

## Hook Ownership (Lookup Table)
- `useBnkPersistence.js`:
paths/history/settings persistence (`localStorage`) + initial restore.
- `useBnkHistory.js`:
undo/redo stacks and snapshot push/pop.
- `useBnkSearch.js`:
left/right search filtering + expansion sync for matches.
- `useBnkHotkeys.js`:
delete/play/undo/redo keyboard handlers.
- `useBnkAudioPlayback.js`:
decode/play/stop/volume handling.
- `useBnkCodebookLoader.js`:
codebook fetch/load lifecycle.
- `useBnkFileParsing.js`:
open/select/parse BNK/WPK/BIN files.
- `useBnkTreeState.js`:
node select/expand/clear pane actions.
- `useBnkSelectionActions.js`:
context-menu + selection-bound actions.
- `useBnkFileOps.js`:
extract/replace/silent/save operations.
- `useBnkDropOps.js`:
drop-replace and right-pane drop handlers.
- `useBnkSplitterActions.js`:
open splitter, apply split replacement/export.
- `useBnkWwiseBridge.js`:
Wwise install/check/progress + conversion bridge hooks.
- `useBnkGainOps.js`:
gain/amplify flow for selected subtree.
- `useBnkAutoExtract.js`:
auto-extract pipeline.

## Component Ownership (Lookup Table)
- `BnkHeaderPanel.js`:
top controls, file pickers, mode switching.
- `BnkMainContent.js`:
left/right tree panes and action wiring.
- `TreeNode.js`:
recursive tree node renderer.
- `BnkContextMenu.js`:
right-click operations.
- `BnkSettingsModal.js`, `BnkInstallModal.js`, `BnkGainModal.js`, `BnkConvertOverlay.js`:
BNK-specific modals/overlays.
- `AudioSplitter.js`:
waveform splitting modal.
- `BnkHistoryMenu.js`, `BnkLoadingOverlay.js`:
history and loading UX.

## Boundaries
- Keep BNK-specific parsing/writing in:
`src/pages/bnkextract/utils/bnkParser.js`
- Keep BNK-specific WEM conversion in:
`src/pages/bnkextract/utils/wemConverter.js`
- Keep BNK-only UI in:
`src/pages/bnkextract/components/*`
- Do not move BNK feature logic back to root `src/utils`.

## Main Flows
1. Select files -> parse (`useBnkFileParsing`).
2. Build/edit trees -> selection/context actions (`useBnkTreeState`, `useBnkSelectionActions`).
3. Replace/extract/save (`useBnkFileOps`, `useBnkDropOps`).
4. Optional convert/gain/install (`useBnkWwiseBridge`, `useBnkGainOps`).
5. Optional splitter workflow (`useBnkSplitterActions` + `AudioSplitter`).
