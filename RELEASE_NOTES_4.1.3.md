# 4.1.3 is a performance and quality-of-life release: a much smoother model viewer, a rebuilt BIN viewer you can actually copy from, and correct skin textures.

## What's new

- The BIN viewer in WAD Explorer has been rebuilt on a proper code editor. You can now select text across the whole file, scroll while selecting without losing it, and Ctrl+A / Ctrl+C to copy the entire file.
- Ctrl+A inside the BIN viewer now selects only the BIN text instead of the whole app.
- The BIN viewer's search, collapse, and expand are now built in, with Ctrl+F to find.
- Extract and Open in Jade now sit in the BIN viewer's toolbar, so the panel shows one row of buttons instead of three stacked bars.
- Replaced "Open in Bin Editor" with "Open in Jade" in the WAD Explorer preview.

## Improvements

- Big performance pass on the model viewer. It no longer redraws constantly when nothing is moving, so an open model no longer keeps your CPU and GPU busy for no reason.
- Animation playback is much lighter. The heavy per-frame work that caused stutter and made the whole app feel sluggish during playback has been rewritten.
- The app no longer redraws the entire model window on every single animation frame, which was the main cause of the app-wide lag while a model was open.
- The skeleton overlay is far cheaper to display and no longer doubles the cost of playing an animation.

## Fixes

- Fixed models loading with flat random colors instead of their real textures. Quartz was reading only one BIN file and picking the wrong skin, so it often found no textures at all. It now reads the related BIN files and targets the correct skin.
- Fixed the same problem causing some skins' animations to come up missing.
- Fixed audio preview failing with a "no supported source" error in BNK Extract. Quartz was trusting the file name instead of the actual audio inside, so imported tracks could be sent to the player in a format it could not read.
- Fixed audio previews holding onto memory after playing.

Thank you for testing Quartz. Please report any remaining issues on GitHub.
