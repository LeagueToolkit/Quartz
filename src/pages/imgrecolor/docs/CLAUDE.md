# CLAUDE.md - ImgRecolor

## Scope
This folder owns ImgRecolor page code and page-specific processing logic.

## File Map
- `ImgRecolor.js`: page UI, selection state, recolor flow orchestration.
- `ImgRecolor.css`: page-level styling.
- `utils/imgRecolorLogic.js`: load/decode/save image processing helpers.

## Guardrails
- Keep ImgRecolor-only code in this folder.
- Use shared/global modules only for true cross-feature dependencies.
