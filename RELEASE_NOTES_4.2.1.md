# 4.2.1

## What's new

- **Unzip and repack `.fantome` mods from the Explorer.** Right-click a `.fantome` file to extract it into a sibling folder, or right-click a mod folder containing `META/info.json` to pack it back into a `.fantome` next to it. Extraction rejects zip-slip and path-traversal entries. Unlike LtMAO, Quartz keeps the folder's own name on repack instead of renaming it to `<Name> V<Version> by <Author>`, so an unzip followed by a rezip round-trips to the same filename.
- **Hashed bin paths survive the whole pipeline now.** Riot is migrating `.bin` asset references from plaintext `string =` paths to hashed `file =`/`hash =`/`link =` values. Repathing, bumpathing, extraction, and bin<->py conversion previously only understood plaintext strings, so a hashed reference could get dropped, extracted under its raw hex name, or lost after a repath if the new hash was not in any dictionary. All four now resolve those values against the WAD/BIN hash dictionaries and bump/rehash them properly. When a repathed hash has no dictionary entry, Quartz embeds a small reverse-map trailer directly in the output `.bin` (invisible to the game and other bin parsers) so the mapping is not lost. Repathing also now writes a `files.txt` at the mod root listing every bumped `file =` path.
- **Explorer remembers your sort preference.** Sort column and direction now persist across reopens instead of resetting to Name/Ascending every time you close and reopen the Explorer.

## Fixes

- **Long combined bin filenames no longer fail on Windows.** Repathing and combining bins (and their asset copies) now uses Windows' extended-length path form, fixing "Windows error 123" failures when a multi-skin combined filename ran past the 260-character path limit.
- **Clearer error when a skin bin can't be found.** "No skinX.bin found in ..." is almost always a stale local hash database, not a missing skin, so it now reads "Failed to find skinX. Redownload the hashes in Settings."
- **Hash auto-update no longer skips a day after downloading.** The freshness check compared against the wrong timestamp, so updating your hashes could make Quartz refuse to check again for 24 hours, leaving you on stale hashes without realizing it. It now checks against the correct last-checked time.
- **Malformed bins can no longer crash Quartz outright.** Recursive bin traversal during repath, rename, and bumpath is now depth-bounded, so a cyclic or pathologically nested `.bin` can no longer overflow the stack and take the whole app down with no error logged. A single unparseable bin during a bulk repath is now skipped with a warning instead of failing the run.
- **Crashes are logged instead of silent.** Panics, including on background threads, are now logged with thread name, source location, and a backtrace before the process exits.
- **Lower peak memory during repath.** Bin scanning now runs in bounded chunks instead of one unbounded parallel pass, capping memory spikes on high-core-count machines.

Thank you for testing Quartz. Please report any remaining issues on GitHub.
