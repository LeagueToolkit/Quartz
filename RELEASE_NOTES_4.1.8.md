# 4.1.8

## What's new

- **Curves in Image Recolor.** A GIMP-style tone curve now sits under the sliders. Click to add a point, drag to move it, right-click to remove. Reset puts it back to a straight line.
- **Image Recolor is much faster.** Loading thumbnails, Filter Grayscale and Save All now do their work in the backend across all your cores instead of one image at a time in the UI. Large folders no longer freeze the window.
- **Progress in the bottom bar.** Scanning and recoloring show a live count and percentage while they run, replacing the old popup.

## Fixes

- **Recolored textures no longer crash the game.** Saved DDS files were written with a newer header the game cannot read. They now use the same format League ships.
- Cubemaps and distortion maps are greyed out in the selection grid. Recoloring them corrupted the texture, and cubemaps lost five of their six faces.
- Fixed Reset washing every image out to grey instead of restoring the original colors.
- The selection grid now shows your recolored textures after saving instead of the originals.

Thank you for testing Quartz. Please report any remaining issues on GitHub.
