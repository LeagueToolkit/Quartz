# 4.1.1 brings the animated model viewer back, a big Paint and Port pass, and an app-wide UI cleanup.

## What's new

- Restored the animated model viewer: .skn/.skl/.anm playback in WAD Explorer and Asset Extractor, with a searchable animation list, scrubbing, playback speed, and a skeleton overlay.
- Animation clip names are trimmed in the list, so "akali_base_joke_loop" reads as "joke_loop".
- Submeshes now show and hide correctly during animation, following each clip's visibility events (including sequencer clips).
- Fixed animations that were reported as missing on non-base skins: clips are now resolved through the linked animation graph and its base-shared folder, so nothing is left out.
- New floating model-viewer controls (Animation, Render, Materials, Info) instead of the old sidebar, with per-submesh texture picking.
- Live texture reload in the model viewer: edit a texture on disk and see it update, plus a manual Reload Textures button as a fallback.
- Paint: restored the old-Quartz layout with the top toolbar (Open Bin, filename, Mode) and the Open Bin button back in the bottom bar.
- Paint: reworked the Palette Manager into a compact modal that fits short windows and never clips at the top.
- Port: pointer-drag VFX porting, donor-from-game combine and consolidate, and cleaner recent-bin handling.
- Bin Editor V2: multi-bin linked-bin editing, a Create VFX dialog, and a reworked keyframe editor.
- Reworked the BNK Extract and Audio Splitter UI, with drag-and-drop that no longer opens files in the main window.
- Unified the texture converter: right-click .tex, .dds, and .png files (or whole folders) in Explorer to convert between them, run by the app itself with no separate sidecar.
- New shared Dropdown component in the Design Lab style, replacing the OS dropdowns.
- Added recent WADs on the WAD Explorer landing and skeleton loaders on Asset Extractor champion cards.
- Reworked the Image Recolor left panel and matched its bottom bar to the rest of the app.

## Improvements

- Faster, lighter WAD reads and a shared drag-and-drop overlay across pages.
- Glass and sharp-corner appearance settings now apply consistently across every page, with solid (non-glass) popovers and recent-bin rows.
- Unified recent-bin styling across Paint, Port, and Bin Editor, with a clickable folder icon that opens the file location.
- Matched every page's bottom bar to a single consistent color.
- Removed the icon tiles on the WAD Explorer and Asset Extractor empty states so they sit flush with the rest of the app.
- Custom dropdowns can now be searched, used first for the animation list.

## Fixes

- Fixed the Colors slider and color-picker lag in Paint when adding or dragging colors.
- Fixed WAD Explorer showing the wrong textures on a model's submeshes.
- Fixed champion names containing a period (for example Dr. Mundo) failing to find their WAD.

Thank you for testing Quartz. Please report any remaining issues on GitHub.
