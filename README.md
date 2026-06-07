# Quartz-Rust

Tauri 2 + React + TypeScript + Zustand + Rust port of Quartz (League of Legends
Modding Suite). Architecture mirrors the Flint project.

## Develop
- `npm install` — install frontend deps
- `npm run tauri dev` — run the desktop app (compiles Rust + serves Vite)
- `npm run typecheck` — type-check the frontend
- `cd src-tauri && cargo test` — run Rust unit tests

## Layout
- `src/` — React frontend (components, pages, lib/api, lib/stores, lib/types)
- `src-tauri/` — Rust backend (commands, core, crates/quartz-lib)
- `docs/` — design doc + implementation plans (local only)

## Notes
- App icons in `src-tauri/icons/` are placeholders; replace with Quartz branding
  via `npx @tauri-apps/cli icon <square-logo.png>`.
