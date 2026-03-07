# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

League Toolkit is a Rust workspace for parsing, editing, and writing League of Legends file formats. It consists of 13 individual `ltk_*` crates plus one umbrella `league-toolkit` crate that re-exports them via feature flags.

## Build Commands

```bash
cargo build --verbose          # Build all crates
cargo test --verbose           # Run all tests
cargo fmt -- --check           # Check formatting
cargo clippy --all-targets -- -D warnings  # Lint (CI denies all warnings)
```

Run a single crate's tests:
```bash
cargo test -p ltk_meta --verbose
```

Run a specific test:
```bash
cargo test -p ltk_meta test_name
```

Snapshot tests use `cargo-insta`. To review snapshot changes:
```bash
cargo insta review
```

## Workspace Structure

All crates live under `crates/`. The dependency graph flows upward:

- **Foundation**: `ltk_hash`, `ltk_primitives` (no internal deps)
- **I/O layer**: `ltk_io_ext` (depends on `ltk_primitives`)
- **Format crates**: `ltk_wad`, `ltk_texture`, `ltk_mesh`, `ltk_anim`, `ltk_meta`, `ltk_file` (depend on foundation + I/O)
- **Higher-level**: `ltk_mapgeo` (depends on `ltk_mesh`), `ltk_ritobin` (depends on `ltk_meta`), `ltk_shader` (depends on `ltk_wad`)
- **Umbrella**: `league-toolkit` re-exports everything behind feature flags

## Key Patterns

**Reading/Writing**: Most types implement `from_reader(&mut impl Read)` and `to_writer(&mut impl Write)`. WAD mounting requires `Read + Seek`.

**Builder pattern**: Complex types use builders — `BinTree::builder()`, `BinTreeObject::builder()`, `RigResource::builder()`, `WadBuilder`.

**Error handling**: Each crate defines its own error type via `thiserror` and a `Result<T>` type alias. `ltk_meta` additionally uses `miette` for diagnostic errors.

**Math**: All vector/matrix types use `glam` (Vec2, Vec3, Vec4, Mat4, Quat).

**Hashing**: WAD paths are XXHash64 (64-bit) of lowercased paths. Bin object/property names are FNV-1a (32-bit) hashes via `ltk_hash::fnv1a::hash_lower()`.

## Crate Layout Convention

Each crate typically follows:
```
crates/ltk_*/
├── src/
│   ├── lib.rs        # Re-exports + module declarations
│   ├── error.rs      # Error enum (thiserror)
│   └── ...           # Type modules
├── tests/            # Integration tests (some crates)
└── Cargo.toml
```

Snapshot test data lives in `crates/*/src/**/snapshots/` or `crates/*/tests/snapshots/`.

## Testing Approach

- Unit tests inline in source files
- Integration tests in `crates/*/tests/` (ltk_anim, ltk_meta, ltk_mapgeo, ltk_ritobin)
- Round-trip tests (parse → write → parse → assert equal) are the primary verification pattern
- Snapshot tests use `insta` with `.ron` format
- `approx` crate for floating-point comparisons

## Workspace Dependencies

Shared dependency versions are declared in the root `Cargo.toml` under `[workspace.dependencies]`. Individual crates reference them with `workspace = true`. When adding dependencies, prefer adding them at workspace level.

## Additional Context

The `docs/LTK_GUIDE.md` file contains detailed crate-by-crate API documentation with usage examples, file format references, and hash algorithm details. Consult it for format-specific questions.
