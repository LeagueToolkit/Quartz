# AniPort Architecture Lookup

## Purpose
`aniport` ports animation events and VFX links between animation/skins files:
- Parse animation clips/events.
- Link particle events to VFX systems.
- Insert/merge VFX systems and resolver mappings.
- Save modified animation/skins content.

Route:
- `src/App.js` -> `/aniport` -> `src/pages/aniport/AniPortSimple.js`

## Structure
- Page:
`src/pages/aniport/AniPortSimple.js`
- Page stylesheet:
`src/pages/aniport/AniPortSimple.css`
- AniPort-local utils:
`src/pages/aniport/utils/animationParser.js`
`src/pages/aniport/utils/animationVfxLinker.js`
`src/pages/aniport/utils/animationFileLoader.js`
`src/pages/aniport/utils/animationContentGenerator.js`
`src/pages/aniport/utils/aniportVfxInserter.js`
`src/pages/aniport/utils/clipTextManipulator.js`
`src/pages/aniport/utils/aniportutils/*`

## Shared Dependencies
- VFX parsing/insertion:
`src/utils/vfx/*`
- IO/backup:
`src/utils/io/*`
- Asset helpers:
`src/utils/assets/*`
- Prefs:
`src/utils/core/electronPrefs.js`
- Shared components/modals:
`src/components/*`, `src/components/modals/*`

## Ownership Rules
- Keep AniPort-specific parse/link/edit logic in `src/pages/aniport/utils/*`.
- Keep cross-feature VFX/IO/assets logic in `src/utils/*` domain folders.
- Avoid adding AniPort-only code back into flat `src/utils`.
