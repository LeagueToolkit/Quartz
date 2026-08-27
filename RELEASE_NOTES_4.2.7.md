# 4.2.7 brings .modpkg support to the right-click menu, converters from .fantome and .wad.client, and a fix for a texture crash.

## What's new

- Right-click a `.modpkg` and pick "Unpack Modpkg" to dump it to a folder beside it. Right-click that folder and pick "Pack Modpkg" to rebuild the package under its original name.
- Right-click a `.fantome` and pick "Convert to .modpkg". A modpkg needs a mod name, author and version, so Quartz asks for them, using the fantome's own info as the defaults. Press Enter to accept each one.
- Right-click a `.wad.client` and pick "Convert to .modpkg". A bare WAD says nothing about who made it, so the same details are asked for.

## Improvements

- "Convert to .tex" and "Convert to .dds" now keep the texture's own compression instead of forcing BC3. A BC7 normal map stays BC7, and an uncompressed texture stays uncompressed, so converting rewraps a texture rather than degrading it.
- Quartz no longer writes its hash-to-path table into the end of BIN files. Those trailing bytes are not part of the BIN format, so every other tool had to strip them and one measured file grew 40%. The same information still goes to `files.txt` beside the archive.

## Fixes

- Fixed a crash caused by converting very small textures. A 1x1 `.dds` turned into a `.tex` was being block compressed, which only works on 4x4 blocks, and the game crashed on the result instead of rejecting it. Textures under 4x4 are now grown to that minimum without changing how they look.
- Fixed unpacking a modpkg dropping chunks that belong to more than one WAD.
- Fixed multi-layer modpkg mods losing their layer order when repacked.

Thank you for testing Quartz. Please report any remaining issues on GitHub.
