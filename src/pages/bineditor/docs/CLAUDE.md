# CLAUDE.md - BinEditor

## Scope
This folder contains the BinEditor page and its page-scoped utilities.

## Primary Entry
- `src/pages/bineditor/BinEditorV2.js`

## Utilities
- `src/pages/bineditor/utils/binEditor/parser.js`
- `src/pages/bineditor/utils/binEditor/operations.js`
- `src/pages/bineditor/utils/binEditor/serializer.js`
- `src/pages/bineditor/utils/binEditor/index.js`
- `src/pages/bineditor/utils/parameters/bindWeight.js`
- `src/pages/bineditor/utils/parameters/translationOverride.js`

## Shared App Dependencies
- Unsaved exit flow:
  - `src/hooks/navigation/useUnsavedNavigationGuard.js`
  - `src/components/modals/UnsavedChangesModal.js`
- Asset preview flow:
  - `src/utils/assets/assetPreviewEvent.js`
  - `src/components/modals/AssetPreviewModal.js`
- Shared texture hover preview helper:
  - `src/components/modals/textureHoverPreview.js`
- Warnings:
  - `src/components/modals/RitobinWarningModal.js`

## Behavior Notes
- BinEditor tracks edits with `hasUnsavedChanges`.
- Shared unsaved guard is wired via:
  - `fileSaved = !hasUnsavedChanges`
  - `setFileSaved(saved) => setHasUnsavedChanges(!saved)`
- Texture hover preview uses shared helper and opens the global asset preview modal on click.

## Refactor Rule
- Keep BinEditor-specific logic under `src/pages/bineditor/**`.
- Keep globally shared UI/behavior under `src/components/**` and `src/hooks/**`.
