# 4.2.9 is all about the Audio Splitter: it works again, and it got a proper rebuild.

## What's new

- **Tabs**: open several audio files at once and switch between them. Each tab keeps its own waveform and segments.
- **Recent Audio**: your last files are listed on the start screen, same as Recent Bins elsewhere. Entries whose file is gone are cleared automatically.
- Your marked segments are saved per file. Open that audio again later and they come back.
- Closing the splitter no longer throws away what you loaded.

## Improvements

- Segments are colour coded. The selected one lights up on the waveform, and each row in the list is tinted to match.
- Segment names moved off the waveform and into the list, so overlapping segments are readable again.
- The segment list fills the window instead of stopping halfway down.
- The header row is gone. Open File sits in the bottom bar, and status messages show in the middle of it like on the other pages.

## Fixes

- Fixed the Audio Splitter accepting a file and then never showing the waveform.
- Fixed WEM files failing to load from disk.
- Fixed tabs that could get stuck and refuse to close.
- Failed loads now tell you what went wrong instead of quietly doing nothing.

Thank you for testing Quartz. Please report any remaining issues on GitHub.
