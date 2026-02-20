# Flint — Claude Code Rules

## DO NOT run cargo build manually
**Never** run `cargo build` or `cargo check` as a standalone command.
The Tauri dev server (`npm run tauri dev`) compiles Rust automatically on startup.
Running `cargo build` separately wipes the incremental cache and makes the next dev start take 15+ minutes instead of seconds.

If you need to verify Rust syntax, use `cargo check` at most — but prefer just reading the code carefully.

## Commits
- Never add `Co-Authored-By:` lines to commit messages.
- Commit messages should be short and imperative (e.g. `fix get_wad_chunks arg name`).

## Rust lint check
To verify Rust code is warning/error-free, run:
```
cargo clippy --lib --bins -- -D warnings -A clippy::needless_return
```
This is safe to run and does not wipe the incremental cache.

## TypeScript type-checking
`npx tsc --noEmit` is fine to run — it does not affect the Rust build cache.

## Stack
- Frontend: React 18 + TypeScript, built with Vite
- Backend: Rust + Tauri 2
- Dev command: `npm run tauri dev` (from `Flint - Asset Extractor/`)
- Release build: `npm run tauri build`
