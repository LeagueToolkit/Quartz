# BinEditor Architecture Lookup

## Route
- `src/App.js` -> `/bineditor` and `/bineditor-v2` -> `src/pages/bineditor/BinEditorV2.js`

## Structure
- `src/pages/bineditor/BinEditorV2.js`: Main page component and UI.
- `src/pages/bineditor/utils/binEditor/parser.js`: Parse ritobin `.py` into editable structures.
- `src/pages/bineditor/utils/binEditor/operations.js`: Batch edit operations for selected emitters.
- `src/pages/bineditor/utils/binEditor/serializer.js`: Targeted write-back and file serialization.
- `src/pages/bineditor/utils/binEditor/index.js`: BinEditor utility barrel export.
- `src/pages/bineditor/utils/parameters/bindWeight.js`: BindWeight parsing/edit helpers.
- `src/pages/bineditor/utils/parameters/translationOverride.js`: TranslationOverride parsing/edit helpers.

## Notes
- Shared app-level utilities stay in `src/utils` (texture conversion, asset preview event, prefs, etc).
- BinEditor-specific utilities are page-scoped under `src/pages/bineditor/utils`.
