# CLAUDE.md - BnkExtract

## Scope
This folder owns all sound-bank feature code.

## File Map
- `BnkExtract.js`: page orchestration only (state wiring + composition).
- `BnkExtract.css`: page-specific styling.
- `components/`: BNK feature UI (header, tree, context menu, modals, splitter).
- `hooks/`: BNK feature behavior split by domain.
- `utils/bnkParser.js`: BNK/WPK/BIN parsing + write helpers.
- `utils/wemConverter.js`: WEM conversion helpers for BNK flows.

## Boundaries
- Keep BnkExtract-specific code local to `src/pages/bnkextract/*`.
- Shared app utilities remain in `src/utils/*` only when truly cross-feature.
- Shared dialogs/modals remain in `src/components/*`.

## Change Checklist
1. If changing parser behavior, start in `utils/bnkParser.js`.
2. If changing Wwise conversion/install/gain behavior, use:
`hooks/useBnkWwiseBridge.js` and `hooks/useBnkGainOps.js`.
3. If changing split UX, update `components/AudioSplitter.js` + `hooks/useBnkSplitterActions.js`.
4. If changing persistence (paths/history/settings), use:
`hooks/useBnkPersistence.js`.
5. Keep route path stable (`/bnk-extract`) unless explicitly requested.
6. Verify imports do not point back to removed legacy paths:
   - `src/pages/BnkExtract.js` (removed)
   - `src/components/AudioSplitter.js` (moved)
   - `src/utils/bnkParser.js` (moved)
