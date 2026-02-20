# ImgRecolor Architecture Lookup

## Purpose
`imgrecolor` is the texture recolor tool:
- Loads images/folders (`.tex`, `.dds`, `.png`, `.jpg`).
- Applies palette-based recolor transforms.
- Saves output in original/selected formats.

Route:
- `src/App.js` -> `/img-recolor` -> `src/pages/imgrecolor/ImgRecolor.js`

## Structure
- Page:
`src/pages/imgrecolor/ImgRecolor.js`
- Page stylesheet:
`src/pages/imgrecolor/ImgRecolor.css`
- Page utils:
`src/pages/imgrecolor/utils/imgRecolorLogic.js`

## Shared Dependencies
- Filetype codecs:
`src/filetypes/index.js`
- Worker:
`src/workers/imageProcessor.worker.js`
- Shared components:
`src/components/GlowingSpinner.js`

## Ownership Rules
- Keep ImgRecolor-specific orchestration and logic inside `src/pages/imgrecolor/*`.
- Only keep utilities in global `src/utils/*` if reused by multiple pages.
