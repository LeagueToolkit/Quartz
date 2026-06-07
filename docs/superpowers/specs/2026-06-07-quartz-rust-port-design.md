# Quartz-Rust Port — Design Document

**Date:** 2026-06-07
**Status:** Approved (design phase)
**Branch:** `rust-tauri-port` (remote: `https://github.com/RitoShark/Quartz`)

## 1. Goal

Port **Quartz** — currently an Electron + Create-React-App + JavaScript desktop app
(~134K lines, 372 files) — to a new **Tauri 2 + React 18 + TypeScript + Zustand + Rust**
application, mirroring the architecture of the sibling **Flint** project.

The first deliverable is:
1. A new `Quartz-Rust/` folder with a complete, runnable Tauri+React+Zustand+Rust
   **scaffold** (configs, folder tree, api/store/command stubs, sidecar wiring).
2. This design doc + a detailed phased **implementation plan**.

No feature logic is ported in the scaffold phase; that is sequenced across later phases.

## 2. Source vs. Target

| Concern | Quartz (source) | Quartz-Rust (target) |
|---|---|---|
| Desktop shell | Electron (`electron-main.js`, `preload.js`) | Tauri 2 |
| Frontend build | Create React App (`react-scripts`) | Vite |
| Language | JavaScript (`.js`) | TypeScript (`.ts`/`.tsx`) |
| State | local/ad-hoc + react-router | Zustand stores + navigation store |
| Backend IPC | `ipcRenderer.invoke` → `src/main/ipc/**` (~7,400 lines) | `invoke()` → `#[tauri::command]` |
| 3D | three.js / react-three-fiber | Babylon.js |
| UI | MUI / Emotion | Hybrid: MUI initially, Tailwind + custom `ui/` going forward |
| Native Rust | `quartz_cli` + `league-toolkit-quartz` workspace, `wad_indexer` (napi) | `quartz-ltk` wrapper crate over **ritoshark** crates; in-process commands |
| Native helpers | `bc7_native` DLL (koffi), FBX bridge exes, upscayl | Tauri **sidecars** via `tauri-plugin-shell` |

## 3. Architecture Overview

A Tauri 2 desktop app structured like Flint: a **React 18 + TypeScript + Vite** frontend
communicating with a **Rust** backend over Tauri's command/event IPC. State lives in
**Zustand** stores.

The entire Electron main process is replaced. Each `ipcRenderer.invoke` channel becomes a
typed `invoke()` call in a `src/lib/api/*.ts` wrapper, backed by a `#[tauri::command]` in
`src-tauri/src/commands/*`. Native helpers that were napi/DLL/exe are absorbed into Rust
commands or bundled as Tauri sidecars.

## 4. Folder Structure

```
Quartz-Rust/
├─ package.json, vite.config.ts, tsconfig.json, tailwind.config.js, postcss.config.js
├─ index.html
├─ public/                      # static assets (cursors, wallpapers, dds, codebook.bin…)
├─ src/                         # React frontend (TypeScript)
│  ├─ main.tsx, App.tsx
│  ├─ components/               # app-shell, layout, modals, overlays, ui, dialogs, viewer3d
│  ├─ pages/                    # one folder per feature (paint, port, bineditor, wad, settings…)
│  ├─ lib/
│  │  ├─ api/                   # typed wrappers around invoke() — mirrors Flint src/lib/api
│  │  ├─ stores/                # Zustand stores (config, navigation, notifications, per-feature)
│  │  ├─ babylon/               # 3D viewer (Babylon.js) replacing three.js/r3f
│  │  ├─ types/                 # shared TS types (mirror Rust serde structs)
│  │  └─ util/
│  ├─ styles/ + themes/         # theme system + Tailwind layer
│  └─ workers/                  # web workers (image processing, parsing) as needed
└─ src-tauri/
   ├─ Cargo.toml (workspace), tauri.conf.json, build.rs, capabilities/, icons/, resources/
   ├─ src/
   │  ├─ main.rs, lib.rs, state.rs
   │  ├─ commands/              # domain-organized: wad, bin, audio, texture, port, paint,
   │  │                         #   bineditor, upscale, settings, system, model_inspect…
   │  └─ core/                  # logging, ipc trace, app lifecycle, prefs store
   ├─ crates/
   │  └─ quartz-ltk/            # wrapper crate (Flint's flint-ltk analog) over ritoshark crates
   └─ sidecars/                 # bundled exes: fbx bridges, bc7 helper, upscayl, bnk tools
```

## 5. IPC / Command Mapping

Each Electron channel file maps to a Rust command module and a TS api file:

| Electron channel | → Rust `commands/` | → TS `lib/api/` |
|---|---|---|
| `wadBumpath`, `hashes` | `wad`, `bumpath`, `hash` | `wad.ts`, `bumpath.ts`, `hash.ts` |
| `binTools`, `portDonor` | `bin`, `port` | `bin.ts`, `port.ts` |
| `audio`, `bnkGameBanks` | `audio` | `audio.ts` |
| `upscale` | `upscale` (upscayl sidecar) | `upscale.ts` |
| `modelInspect` | `model_inspect` (Babylon front) | `modelInspect.ts` |
| `fileRandomizer` | `file_handler` | `fileHandler.ts` |
| `interop`, `tools`, `contextMenu`, `dialogs`, `prefs`, `update`, `window`, `appInfo`, `misc` | `system`, `platform`, `settings` | matching files |

## 6. Native Helpers → Tauri

- **`wad_indexer`** (napi-rs) → linked directly as a Rust dependency/module; no Node bridge.
- **`quartz_cli` / `league-toolkit-quartz`** → logic exposed through the `quartz-ltk` wrapper
  crate built on **ritoshark** crates, so commands call Rust in-process instead of shelling
  out where feasible.
- **`bc7_native` (DLL), FBX bridges (xps/pmx exes), upscayl** → Tauri **sidecars** bundled via
  `tauri.conf.json`, invoked through `tauri-plugin-shell`.

## 7. UI Strategy (Hybrid)

The scaffold ships with **both** MUI/Emotion and Tailwind configured. Features port over
keeping their MUI components initially (fast, preserves current behavior); the shared
shell/layout and any new components use Flint-style Tailwind + custom `ui/` components,
giving a gradual migration path. The theme system (Theme Creator, custom color picker) is
preserved as a first-class feature.

## 8. Phasing (Plan Spine)

Each phase ships a runnable app. Within a phase, each feature is one vertical slice
(UI page + `lib/api` wrapper + Rust command + supporting crate code + verification).

- **Phase 0 — Scaffold:** empty runnable Tauri+React+Zustand app; all config; folder tree;
  api/store/command stubs; sidecar wiring; `quartz-ltk` crate skeleton.
- **Phase 1 — Foundation:** app shell, navigation store, config/prefs store, Settings +
  Theme Creator, hash management, logging, command-bus pattern, shared WAD/bin Rust plumbing.
- **Phase 2 — WAD pipeline:** Asset Extractor, WAD explorer, Bumpath.
- **Phase 3 — VFX core:** Paint, Port, Bineditor (+ Babylon viewer).
- **Phase 4 — Media tools:** audio/bnk, Image Recolor, Upscale, RGBA, File Handler, AniPort.
- **Phase 5 — VfxHub + polish:** community VFX DB, updater, packaging/NSIS installer.

## 9. Testing & Verification

Mirror Flint: Rust unit/integration tests per command/crate (e.g. bin round-trip tests),
TypeScript type-checking via `tsc`, and a manual verification checklist per vertical slice
(load the feature, exercise the IPC path, confirm parity with Electron Quartz).

## 10. Non-Goals

- Not porting feature logic during the scaffold phase.
- Not removing the original Electron Quartz; the source folder stays for reference/parity.
- No unrelated refactoring of Quartz behavior — the port preserves existing workflows.
