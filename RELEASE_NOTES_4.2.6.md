# 4.2.6

## What's new

- **The RitoShark tools live in one menu.** The Jade and Ruby buttons in the title bar are now a single RitoShark logo. Opening it lists the suite: Jade, RubyRe, Flint, Hematite, Celestial, the Divine Wiki and the TEX plugins for Photoshop, Paint.NET and GIMP, each with who made it and what it is for. An info button opens that tool's readme without leaving Quartz, with a download button for the latest release, and the people who built it are one click from their Discord. The play button still hands your open bin to Jade or RubyRe, and now only appears when there is actually a bin to hand over.
- **Custom paths survive a round trip.** Repathing invents asset paths that exist in no hash database, so once a bin stored only their hash the name was gone and the `.py` showed a bare `0x…`. Quartz already recorded those inside the bin; it now also writes them to a `files.txt` beside the mod, which survives a tool that rewrites the bin, and it reads three sources when converting back: the record inside the bin, then `files.txt`, then the mod folder itself. A path that exists is no longer unrecoverable.
- **Recent bins say which mod they belong to.** Every entry was called `skin0.bin`. The project folder now sits under the name, so four identical filenames are four distinguishable rows.
- **Patch notes are reachable again.** Settings > App Updates has a Patch Notes button that reopens this window for the version you are on.

## Fixes

- **Names inside containers are no longer lost.** Recording custom paths only looked at single-line references, so anything inside a list or an option — a custom HUD icon, for example — was skipped and its path lost on the next save. Names are now matched against the hashes the bin actually contains rather than by reading the text line by line, which covers containers, map keys and custom system names alike.
- **Clear Junk no longer deletes `files.txt`.** The cleaner removes files nothing references, and nothing references a record of paths, so it qualified as junk. It is now kept, along with the other mod metadata.
- **The League path field tells you whether it is right.** A wrong path stayed silent until an extraction failed with "Could not locate a League of Legends install", which reads as though no path is set. Picking the `Game` folder inside the install, or the `Riot Games` folder above it, is the usual mistake, and both now get the correct path spelled out.
- **Hashes download by themselves when missing.** The startup check gave up when there were none, so a fresh install had no hash databases at all unless you found the download button in WAD Explorer.
- **A failed hash check no longer blocks the next one for a day.** The daily cooldown was recorded even when the download failed, so every startup for the next 24 hours skipped the check.
- **Hash updates install instead of failing silently.** Windows refuses to replace a file that is in use, and Quartz held its hash database open while trying to swap it, so the update downloaded every time and never applied.

Thank you for testing Quartz. Please report any remaining issues on GitHub.
