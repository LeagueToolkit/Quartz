# CLAUDE.md - AniPort

## Scope
This folder owns AniPort page code and AniPort-specific utility logic.

## File Map
- `AniPortSimple.js`: main AniPort UI and orchestration.
- `AniPortSimple.css`: page styling.
- `utils/animationParser.js`: clip/event parser.
- `utils/animationVfxLinker.js`: event <-> VFX linking.
- `utils/animationFileLoader.js`: dual file loading/validation.
- `utils/animationContentGenerator.js`: content regeneration helpers.
- `utils/aniportVfxInserter.js`: AniPort-specific VFX insertion flow.
- `utils/clipTextManipulator.js`: clip add/delete/extract text operations.
- `utils/aniportutils/*`: selector/standalone-event helpers.

## Guardrails
- Keep AniPort-only logic local to this folder.
- Use shared `src/utils/vfx`, `src/utils/io`, `src/utils/assets`, `src/utils/core` only for truly shared behavior.
- Keep route path `/aniport` stable unless explicitly requested.
