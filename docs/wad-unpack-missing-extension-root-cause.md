# ltk_wad Extraction: Missing Extensions on Unresolved Hash Paths

## Summary
When extracting WAD chunks with unresolved hash paths, some output files are written without extension (example: `0cb8c9e455bc6520` instead of `0cb8c9e455bc6520.bin`).

## Expected
If a path is unresolved and represented as a hash filename, extraction should still infer file type from bytes and append extension where possible (`.bin`, `.bnk`, `.dds`, etc.).

## Actual
Many files stayed extensionless because type detection returned `Unknown`.

## Root Cause
`ltk_file` type detection originally only checked magic at byte offset `0`:

- `LeagueFileKind::identify_from_bytes(data)`

For some chunk formats (notably `ZstdMulti` decode path), decoded buffers may contain a small prefix before real payload magic.  
So valid signatures like `PROP` / `PTCH` / `BKHD` were not at `data[0..]`, causing false `Unknown`.

Relevant `ltk` code paths:

- `league-toolkit-main/crates/ltk_file/src/kind.rs`
- `league-toolkit-main/crates/ltk_wad/src/extractor.rs`

## Fix Implemented
Added offset-tolerant identification in `ltk_file`:

- `LeagueFileKind::identify_from_bytes_with_offset(data, max_offset)`

Behavior:

1. Try normal detection at offset `0`.
2. If `Unknown`, scan `data[1..=max_offset]` and retry detection on each slice.
3. Return first non-`Unknown` match.

`ltk_wad` extraction now uses this API with `max_offset = 64`.

## Why This Works
It preserves strict fast-path behavior for normal files, but recovers signatures when payload magic is shifted by a small prefix.

## Validation

- Added tests in `ltk_file` for offset detection and scan-limit behavior.
- `cargo test -p ltk_file` passes.

## Suggested Acceptance Criteria (ltk-only)

1. If extracted chunk path is unresolved hex hash and byte signature is known within first 64 bytes, output filename gets inferred extension.
2. If signature remains unknown, output remains hash filename without inferred extension.
3. Existing behavior for already-resolved paths is unchanged.
