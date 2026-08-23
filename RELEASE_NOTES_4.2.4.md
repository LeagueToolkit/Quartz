# 4.2.4

## What's new

- **The patch notes are reachable again.** Settings > App Updates has a Patch Notes button that reopens this window for the version you are on. The notice itself has been rebuilt: who shipped the release, the version and its date now sit in their own column beside the notes, so the changelog gets the full height of the panel instead of sharing a header strip.

## Fixes

- **Hashes download by themselves when they are missing.** The startup check only ever updated hashes you already had, and gave up immediately when there were none, so a fresh install had no hash databases at all unless you happened to find the download button in WAD Explorer. Until then file names showed as hex and anything needing a lookup failed in a way that looked like missing data rather than a missing table. A first run now fetches them like any other update.
- **Searching an ability token in Paint no longer returns half the file.** Typing `_Q_` matched by texture path as readily as by name, and a texture path carries the ability token too, so every Dance / Taunt / Recall system whose emitters happened to reference a Q texture came back alongside the systems actually named `_Q_`. Names are matched first now, and texture paths only when nothing matches by name, so the obvious hits are never buried. Ability tokens like `_Q_` or `_w` match system names only, since they are a system-naming convention and emitter hits are just noise. Searching for a texture still works exactly as before when that is what you are looking for. Reported by a creator.
- **Settings tells you whether your League folder is right.** A wrong path stayed silent until an extraction failed with "Could not locate a League of Legends install", which reads as though no path is set rather than that the one you picked is wrong. The field now checks as you type and says which it is. Picking the `Game` folder inside the install, or the `Riot Games` folder above it, is the usual mistake, so those two get the correct path spelled out for you instead of a description of what is missing. The example sits under the field either way.

Thank you for testing Quartz. Please report any remaining issues on GitHub.
