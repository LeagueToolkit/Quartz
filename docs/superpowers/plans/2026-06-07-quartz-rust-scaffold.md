# Quartz-Rust Scaffold + Port Roadmap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a runnable, empty **Tauri 2 + React 18 + TypeScript + Zustand + Rust** application skeleton for the Quartz port (Phase 0), and define the phased roadmap for porting the rest of Quartz's features.

**Architecture:** Vite-served React/TS frontend talks to a Rust Tauri backend over `invoke()` ↔ `#[tauri::command]`. State lives in Zustand stores. A typed `lib/api` layer wraps every command; Rust commands are organized by domain under `src-tauri/src/commands`. A `quartz-ltk` wrapper crate (over the `ritoshark` crates) holds league-toolkit logic. This mirrors the proven Flint architecture.

**Tech Stack:** Tauri 2.11, React 18.3, TypeScript 5.6, Vite 5, Zustand 5, Tailwind 3 + MUI 5 (hybrid), Babylon.js (later phases), Rust 2021, `ritoshark` crates.

**Reference codebase:** `e:\RitoShark\Flint\Flint - Main` (same stack — copy its patterns, not its feature code).

**Source codebase:** `e:\RitoShark\Quartz-Port\Quartz` (the Electron app being ported).

**Working directory for all paths below:** `e:\RitoShark\Quartz-Port\Quartz-Rust`

---

## File Structure (Phase 0 deliverable)

```
Quartz-Rust/
├─ package.json                         # npm deps + scripts (dev/build/tauri)
├─ index.html                           # Vite entry + boot skeleton
├─ vite.config.ts                       # Vite + react plugin + @ alias + tauri css fix
├─ tsconfig.json / tsconfig.node.json   # TS config (mirrors Flint)
├─ tailwind.config.js / postcss.config.js
├─ src/
│  ├─ main.tsx                          # React entry; mounts <AppProvider><App/>
│  ├─ App.tsx                           # minimal shell: sidebar nav + content area
│  ├─ styles/index.css                  # Tailwind layers + base styles
│  └─ lib/
│     ├─ api/
│     │  ├─ core.ts                     # QuartzError + invokeCommand wrapper
│     │  ├─ system.ts                   # get_app_info() typed wrapper
│     │  └─ index.ts                    # re-exports
│     ├─ stores/
│     │  ├─ navigationStore.ts          # current page
│     │  ├─ configStore.ts              # app config (stub)
│     │  ├─ notificationStore.ts        # toasts (stub)
│     │  └─ index.ts                    # AppProvider + re-exports
│     └─ types/
│        └─ index.ts                    # AppInfo + shared types
└─ src-tauri/
   ├─ Cargo.toml                        # workspace + binary crate
   ├─ tauri.conf.json                   # window, bundle, CSP
   ├─ build.rs
   ├─ capabilities/default.json         # permissions
   ├─ icons/                            # app icons (copied from Flint or Quartz)
   ├─ src/
   │  ├─ main.rs                        # tauri::Builder + invoke_handler
   │  ├─ lib.rs                         # module exports for tests
   │  ├─ state.rs                       # managed state (stub)
   │  ├─ core/mod.rs                    # logging/lifecycle (stub)
   │  └─ commands/
   │     ├─ mod.rs                      # pub mod system;
   │     └─ system.rs                   # get_app_info command + unit test
   └─ crates/
      └─ quartz-ltk/
         ├─ Cargo.toml
         └─ src/lib.rs                  # wrapper crate skeleton over ritoshark
```

Each task below produces a self-contained, committable change. Verification at each step is **type-check / cargo check / app boots** (there is no app-level test harness in a scaffold; Rust commands get unit tests where they contain logic).

---

## Task 1: npm project + frontend build tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `index.html`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "quartz",
  "productName": "Quartz",
  "version": "4.0.0",
  "description": "Quartz - League of Legends Modding Suite (Tauri)",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@emotion/react": "^11.11.1",
    "@emotion/styled": "^11.11.0",
    "@mui/icons-material": "^5.15.0",
    "@mui/material": "^5.15.0",
    "@tauri-apps/api": "^2.11.0",
    "@tauri-apps/plugin-dialog": "^2.6.0",
    "@tauri-apps/plugin-opener": "^2.5.3",
    "@tauri-apps/plugin-process": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "@tauri-apps/plugin-updater": "^2.0.0",
    "lucide-react": "^0.539.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.11"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.11.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.6.3",
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`** (mirrors Flint)

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "useDefineForClassFields": true,
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`** (Flint pattern, trimmed for scaffold)

```ts
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/** Strip `crossorigin` from <link rel="stylesheet"> so Tauri's custom
 *  protocol (no CORS headers) doesn't block the stylesheet fetch. */
function tauriCSSFix(): Plugin {
    return {
        name: 'tauri-css-fix',
        enforce: 'post',
        transformIndexHtml(html) {
            return html.replace(
                /<link rel="stylesheet" crossorigin/g,
                '<link rel="stylesheet"',
            );
        },
    };
}

export default defineConfig({
    plugins: [react(), tauriCSSFix()],
    clearScreen: false,
    server: { port: 1420, strictPort: true },
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
        target: ['es2021', 'chrome100', 'safari13'],
        minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
        sourcemap: !!process.env.TAURI_DEBUG,
    },
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    optimizeDeps: {
        include: [
            'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime',
            '@tauri-apps/api/core', '@tauri-apps/api/event', '@tauri-apps/api/window',
            'zustand', 'zustand/react/shallow',
        ],
    },
});
```

- [ ] **Step 5: Create `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  // MUI also injects styles; keep preflight on but be aware of overlap.
  corePlugins: { preflight: true },
  plugins: [],
};
```

- [ ] **Step 6: Create `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Quartz</title>
  </head>
  <body>
    <div id="app">
      <div id="loading-screen" style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#aaa;background:#0d0d12;">
        Loading Quartz…
      </div>
    </div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Install dependencies**

Run: `npm install`
Expected: completes, creates `node_modules/` and `package-lock.json`, no peer-dep errors that abort install.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts tailwind.config.js postcss.config.js index.html
git commit -m "chore: scaffold frontend build tooling (vite, ts, tailwind)"
```

---

## Task 2: React entry + minimal app shell

**Files:**
- Create: `src/styles/index.css`
- Create: `src/main.tsx`
- Create: `src/App.tsx`

- [ ] **Step 1: Create `src/styles/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: dark; }
html, body, #app { height: 100%; margin: 0; }
body { background: #0d0d12; color: #e6e6ee; font-family: system-ui, sans-serif; }
```

- [ ] **Step 2: Create `src/App.tsx`** (placeholder shell; real shell arrives in Phase 1)

```tsx
import { useNavigationStore } from '@/lib/stores';
import { getAppInfo } from '@/lib/api';
import { useEffect, useState } from 'react';
import type { AppInfo } from '@/lib/types';

const PAGES = ['Home', 'Settings'] as const;

export function App() {
    const page = useNavigationStore((s) => s.page);
    const setPage = useNavigationStore((s) => s.setPage);
    const [info, setInfo] = useState<AppInfo | null>(null);

    useEffect(() => {
        getAppInfo().then(setInfo).catch((e) => console.error(e));
    }, []);

    return (
        <div className="flex h-full">
            <nav className="w-48 shrink-0 border-r border-white/10 p-3 space-y-1">
                {PAGES.map((p) => (
                    <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`block w-full text-left px-3 py-2 rounded ${
                            page === p ? 'bg-white/15' : 'hover:bg-white/5'
                        }`}
                    >
                        {p}
                    </button>
                ))}
            </nav>
            <main className="flex-1 p-6">
                <h1 className="text-xl font-semibold">{page}</h1>
                <p className="mt-2 text-sm text-white/60">
                    Quartz-Rust scaffold. Backend says:{' '}
                    {info ? `${info.name} v${info.version}` : '…'}
                </p>
            </main>
        </div>
    );
}
```

- [ ] **Step 3: Create `src/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from '@/lib/stores';
import { App } from '@/App';
import '@/styles/index.css';

const container = document.getElementById('app');
if (!container) throw new Error('[Quartz] #app element not found');

document.getElementById('loading-screen')?.remove();

createRoot(container).render(
    React.createElement(
        React.StrictMode,
        null,
        React.createElement(AppProvider, null, React.createElement(App)),
    ),
);
```

- [ ] **Step 4: Verify the frontend type-checks**

Run: `npm run typecheck`
Expected: FAIL — `@/lib/stores`, `@/lib/api`, `@/lib/types` not found yet. This confirms Task 2 depends on Tasks 3–4. (Do not commit until Tasks 3–4 land and typecheck passes.)

---

## Task 3: Zustand store skeleton

**Files:**
- Create: `src/lib/stores/navigationStore.ts`
- Create: `src/lib/stores/configStore.ts`
- Create: `src/lib/stores/notificationStore.ts`
- Create: `src/lib/stores/index.ts`

- [ ] **Step 1: Create `src/lib/stores/navigationStore.ts`**

```ts
import { create } from 'zustand';

export type Page = 'Home' | 'Settings';

interface NavigationState {
    page: Page;
    setPage: (page: Page) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
    page: 'Home',
    setPage: (page) => set({ page }),
}));
```

- [ ] **Step 2: Create `src/lib/stores/configStore.ts`** (stub; real config in Phase 1)

```ts
import { create } from 'zustand';

interface ConfigState {
    leaguePath: string | null;
    setLeaguePath: (path: string | null) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
    leaguePath: null,
    setLeaguePath: (leaguePath) => set({ leaguePath }),
}));
```

- [ ] **Step 3: Create `src/lib/stores/notificationStore.ts`** (stub)

```ts
import { create } from 'zustand';

export interface Notification {
    id: number;
    kind: 'info' | 'success' | 'error';
    message: string;
}

interface NotificationState {
    items: Notification[];
    push: (kind: Notification['kind'], message: string) => void;
    dismiss: (id: number) => void;
}

let nextId = 1;

export const useNotificationStore = create<NotificationState>((set) => ({
    items: [],
    push: (kind, message) =>
        set((s) => ({ items: [...s.items, { id: nextId++, kind, message }] })),
    dismiss: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
}));
```

- [ ] **Step 4: Create `src/lib/stores/index.ts`** (AppProvider + re-exports)

```ts
import React from 'react';

export { useNavigationStore } from './navigationStore';
export { useConfigStore } from './configStore';
export { useNotificationStore } from './notificationStore';

/**
 * Zustand stores are module-level singletons, so no React Context is strictly
 * required. AppProvider exists as the single mount-time seam for future
 * boot logic (loading persisted config, attaching event listeners) — mirrors
 * Flint's `AppProvider`.
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores
git commit -m "feat: add zustand store skeleton (navigation, config, notifications)"
```

---

## Task 4: API core + system wrapper + shared types

**Files:**
- Create: `src/lib/types/index.ts`
- Create: `src/lib/api/core.ts`
- Create: `src/lib/api/system.ts`
- Create: `src/lib/api/index.ts`

- [ ] **Step 1: Create `src/lib/types/index.ts`**

```ts
/** Mirrors the Rust `AppInfo` struct returned by `get_app_info`. */
export interface AppInfo {
    name: string;
    version: string;
    tauri: boolean;
}
```

- [ ] **Step 2: Create `src/lib/api/core.ts`** (Flint pattern, trimmed)

```ts
import { invoke } from '@tauri-apps/api/core';

export class QuartzError extends Error {
    command: string;
    originalError: unknown;

    constructor(command: string, originalError: unknown) {
        const message =
            typeof originalError === 'string'
                ? originalError
                : (originalError as Error)?.message || 'Unknown error';
        super(message);
        this.name = 'QuartzError';
        this.command = command;
        this.originalError = originalError;
    }
}

export async function invokeCommand<T>(
    command: string,
    args: Record<string, unknown> = {},
): Promise<T> {
    try {
        return await invoke<T>(command, args);
    } catch (error) {
        console.error(`[Quartz] Command "${command}" failed:`, error);
        throw new QuartzError(command, error);
    }
}
```

- [ ] **Step 3: Create `src/lib/api/system.ts`**

```ts
import { invokeCommand } from './core';
import type { AppInfo } from '@/lib/types';

export function getAppInfo(): Promise<AppInfo> {
    return invokeCommand<AppInfo>('get_app_info');
}
```

- [ ] **Step 4: Create `src/lib/api/index.ts`**

```ts
export { QuartzError, invokeCommand } from './core';
export { getAppInfo } from './system';
```

- [ ] **Step 5: Verify frontend type-checks end-to-end**

Run: `npm run typecheck`
Expected: PASS (Tasks 2–4 now resolve all `@/` imports).

- [ ] **Step 6: Verify the frontend builds in the browser (no Tauri yet)**

Run: `npm run dev` then open `http://localhost:1420`
Expected: app renders the sidebar (Home/Settings). The backend line shows `…` because `get_app_info` only resolves inside Tauri — that is expected at this step. Stop the dev server (Ctrl+C).

- [ ] **Step 7: Commit**

```bash
git add src/lib/api src/lib/types src/main.tsx src/App.tsx src/styles/index.css
git commit -m "feat: add api core layer, system wrapper, and minimal app shell"
```

---

## Task 5: Tauri Rust backend skeleton

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/state.rs`
- Create: `src-tauri/src/core/mod.rs`
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/system.rs`

- [ ] **Step 1: Create `src-tauri/Cargo.toml`**

```toml
[workspace]
members = [".", "crates/quartz-ltk"]

[package]
name = "quartz"
version = "4.0.0"
edition = "2021"
default-run = "quartz"

[lib]
name = "quartz"
path = "src/lib.rs"

[[bin]]
name = "quartz"
path = "src/main.rs"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
quartz-ltk = { path = "crates/quartz-ltk" }
tauri = { version = "2.11", features = ["protocol-asset", "devtools"] }
tauri-plugin-dialog = "2.0"
tauri-plugin-process = "2.0"
tauri-plugin-opener = "2"
tauri-plugin-shell = "2.0"
tauri-plugin-updater = "2.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "1.0"
anyhow = "1.0"

[profile.release]
opt-level = 3
lto = true
strip = true
```

- [ ] **Step 2: Create `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 3: Create `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420"
  },
  "bundle": {
    "active": true,
    "targets": "nsis",
    "icon": ["icons/icon.ico", "icons/icon.png"]
  },
  "productName": "Quartz",
  "version": "4.0.0",
  "identifier": "com.github.ritoshark.quartz",
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "Quartz",
        "width": 1280,
        "height": 800,
        "resizable": true,
        "fullscreen": false,
        "visible": true,
        "decorations": false
      }
    ],
    "security": {
      "csp": {
        "default-src": "'self'",
        "style-src": "'self' 'unsafe-inline'",
        "script-src": "'self' blob: 'unsafe-eval'",
        "img-src": "'self' data: https: blob:",
        "connect-src": "'self' http://ipc.localhost https://github.com asset: https://asset.localhost",
        "worker-src": "'self' blob:",
        "media-src": "'self' blob: asset: https://asset.localhost"
      },
      "assetProtocol": {
        "enable": true,
        "scope": { "allow": ["**/*"] }
      }
    }
  }
}
```

- [ ] **Step 4: Create `src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "process:default",
    "opener:default",
    "shell:allow-execute",
    "updater:default"
  ]
}
```

- [ ] **Step 5: Create `src-tauri/src/commands/system.rs`** (the first real command, with a unit test)

```rust
use serde::Serialize;

#[derive(Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub tauri: bool,
}

/// Returns basic app identity. First end-to-end command — proves the
/// frontend `invoke()` ↔ Rust command bridge works.
#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: "Quartz".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        tauri: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_quartz_and_cargo_version() {
        let info = get_app_info();
        assert_eq!(info.name, "Quartz");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert!(info.tauri);
    }
}
```

- [ ] **Step 6: Create `src-tauri/src/commands/mod.rs`**

```rust
pub mod system;
```

- [ ] **Step 7: Create `src-tauri/src/core/mod.rs`** (stub for Phase 1 logging/lifecycle)

```rust
//! Cross-cutting backend concerns (logging, lifecycle, IPC tracing).
//! Populated in Phase 1; kept as a module seam so command modules can
//! depend on a stable path.
```

- [ ] **Step 8: Create `src-tauri/src/state.rs`** (stub)

```rust
//! Tauri-managed application state. Populated in later phases (WAD cache,
//! hash providers, edit sessions — mirrors Flint's `state.rs`).
```

- [ ] **Step 9: Create `src-tauri/src/lib.rs`**

```rust
//! Library exports so command logic is unit-testable without launching Tauri.
pub mod commands;
pub mod core;
pub mod state;
```

- [ ] **Step 10: Create `src-tauri/src/main.rs`**

```rust
// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod core;
mod state;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::system::get_app_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Quartz");
}
```

- [ ] **Step 11: Commit** (compiles only after Task 6 supplies the `quartz-ltk` crate)

After Task 6, run the verification in Task 7, then:

```bash
git add src-tauri/Cargo.toml src-tauri/build.rs src-tauri/tauri.conf.json src-tauri/capabilities src-tauri/src
git commit -m "feat: add tauri rust backend skeleton with get_app_info command"
```

---

## Task 6: `quartz-ltk` wrapper crate skeleton

**Files:**
- Create: `src-tauri/crates/quartz-ltk/Cargo.toml`
- Create: `src-tauri/crates/quartz-ltk/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/crates/quartz-ltk/Cargo.toml`**

> The exact `ritoshark` git rev should match what Flint uses. Check Flint's
> `src-tauri/Cargo.toml` for the current `rev` and copy it here. Until a
> league-toolkit call is actually needed, the dependency can stay commented
> out so the scaffold compiles without network access.

```toml
[package]
name = "quartz-ltk"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
anyhow = "1.0"
thiserror = "1.0"
# Uncomment when first LTK-backed command lands (match Flint's rev):
# ritoshark = { git = "https://github.com/RitoShark/RitoShark-Crates", rev = "d6af5ac" }
```

- [ ] **Step 2: Create `src-tauri/crates/quartz-ltk/src/lib.rs`**

```rust
//! quartz-ltk — wrapper crate over the RitoShark league-toolkit crates.
//! Mirrors Flint's `flint-ltk`: all LTK dependencies and Quartz-specific
//! helpers (WAD, BIN, texture, audio) live here so the binary crate's
//! command modules call clean in-process functions instead of shelling out.

/// Placeholder until the first real LTK-backed helper lands in Phase 1/2.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    #[test]
    fn version_is_non_empty() {
        assert!(!super::version().is_empty());
    }
}
```

- [ ] **Step 3: Type-check the Rust workspace**

Run: `cd src-tauri && cargo check`
Expected: PASS (downloads tauri + plugin crates on first run; may take several minutes).

- [ ] **Step 4: Run Rust unit tests**

Run: `cd src-tauri && cargo test`
Expected: PASS — `app_info_reports_quartz_and_cargo_version` and `version_is_non_empty` both green.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/crates
git commit -m "feat: add quartz-ltk wrapper crate skeleton"
```

---

## Task 7: Icons + end-to-end boot verification

**Files:**
- Create: `src-tauri/icons/icon.ico` (copy from `../Quartz/public/divinelab.ico` or Flint's `icons/`)
- Create: `src-tauri/icons/icon.png`

- [ ] **Step 1: Provide app icons**

Copy an existing icon so the bundler has the referenced files:

```bash
mkdir -p src-tauri/icons
cp "../Quartz/public/divinelab.ico" "src-tauri/icons/icon.ico"
```

Generate the full icon set from a PNG source (recommended — Tauri needs several sizes):

Run: `npx @tauri-apps/cli icon "../Quartz/public/UxYW2KY_x2.png"`
Expected: writes `icon.ico`, `icon.png`, and platform PNGs into `src-tauri/icons/`. If the source PNG is missing, substitute any square PNG ≥ 512×512.

- [ ] **Step 2: Launch the full Tauri app**

Run: `npm run tauri dev`
Expected: Rust compiles, a desktop window titled **Quartz** opens, the sidebar shows Home/Settings, and the content line reads **"Quartz v4.0.0"** — confirming the `get_app_info` command round-trips frontend ↔ Rust. Close the window.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/icons
git commit -m "chore: add app icons and verify end-to-end tauri boot"
```

---

## Task 8: README + scaffold wrap-up

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# Quartz-Rust

Tauri 2 + React + TypeScript + Zustand + Rust port of Quartz
(League of Legends Modding Suite). Architecture mirrors the Flint project.

## Develop
- `npm install` — install frontend deps
- `npm run tauri dev` — run the desktop app (compiles Rust + serves Vite)
- `npm run typecheck` — type-check the frontend
- `cd src-tauri && cargo test` — run Rust unit tests

## Layout
- `src/` — React frontend (components, pages, lib/api, lib/stores)
- `src-tauri/` — Rust backend (commands, core, crates/quartz-ltk)
- `docs/superpowers/` — design doc + implementation plans

See `docs/superpowers/specs/` for the design and `docs/superpowers/plans/` for the roadmap.
```

- [ ] **Step 2: Final scaffold verification**

Run: `npm run typecheck && cd src-tauri && cargo test && cd ..`
Expected: typecheck PASS, cargo tests PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add Quartz-Rust README"
```

---

# Roadmap — Phases 1–5

Phase 0 (above) produces a runnable, empty app. The phases below port Quartz's
features. **Each phase gets its own detailed bite-sized plan** (via the
writing-plans skill) when it is reached — they are summarized here so the
overall sequence and the per-feature vertical-slice template are clear.

### Vertical-slice template (applies to every feature in Phases 1–5)
For each Quartz feature, one slice = these steps, in order:
1. **Rust command(s):** add module under `src-tauri/src/commands/<domain>.rs`, register in `main.rs` `generate_handler!`, put heavy logic in `quartz-ltk`. Unit-test the logic.
2. **Types:** add the serde structs' TS mirrors in `src/lib/types`.
3. **API wrapper:** add `src/lib/api/<domain>.ts` typed function(s), re-export from `index.ts`.
4. **Store:** add/extend a Zustand store in `src/lib/stores` for the feature's UI state.
5. **Page/UI:** port the React page under `src/pages/<feature>` (MUI kept initially; shell uses Tailwind).
6. **Verify:** type-check, cargo test, run the app, exercise the feature, confirm parity with Electron Quartz.
7. **Commit** per slice.

### Phase 1 — Foundation
Maps Electron `appInfo`, `prefs`, `window`, `dialogs`, `misc`, `hashes`, `update` → Rust `system`/`settings`/`hash`/`updater`.
- App shell + window controls (custom titlebar; `decorations: false`).
- `configStore`/`settingsStore` backed by a disk settings file (Rust `settings` commands, mirroring Flint's `get_settings`/`save_settings`).
- Settings page + **Theme Creator** + custom color picker (ported from Quartz `pages/settings`).
- Hash management (download/status/reload) via Rust + `tauri::async_runtime` + a `hashes-ready` event (Flint pattern).
- Logging (`tracing` + frontend log layer) and the IPC-tracing wrapper in `api/core.ts`.
- Updater wiring (`tauri-plugin-updater`).

### Phase 2 — WAD pipeline
Maps Electron `wadBumpath` (1,954 lines), `hashes`, `interop`, `contextMenu`, `fileRandomizer` → Rust `wad`/`bumpath`/`hash`/`file_handler`.
- Asset Extractor (champion/skin selection, WAD extraction, repathing) — absorbs the `wad_indexer` napi module as in-process Rust.
- WAD explorer (browse/extract chunks).
- Bumpath repathing (the largest single IPC surface — split into sub-slices: scan, plan, apply).

### Phase 3 — VFX core
Maps Electron `binTools`, `portDonor`, `modelInspect` → Rust `bin`/`port`/`bineditor`/`model_inspect`; adopts **Babylon.js**.
- Paint (particle recoloring, shades, hue shift, palettes) — `pages/paint2`.
- Port (emitter/vfxsystem porting, asset management) — `pages/port2`.
- Bineditor (parameter scaling) — `pages/bineditor`.
- 3D model-inspect viewer reimplemented on Babylon.js (replaces three.js/r3f), wired to `model_inspect` commands.

### Phase 4 — Media tools
Maps Electron `audio`, `bnkGameBanks`, `upscale`, `tools` → Rust `audio`/`upscale`/`tools`; FBX/bc7/upscayl as sidecars.
- Audio/BNK + WPK (bnkextract) with wavesurfer playback.
- Image Recolor (PNG/JPG/DDS/TEX) — `pages/imgrecolor`.
- Upscale (upscayl sidecar) — `pages/Upscale`.
- RGBA color generator — `pages/RGBA`.
- File Handler (Randomizer/Renamer) — `UniversalFileRandomizer`.
- AniPort (animation porting) — `pages/aniport`.
- Tools (drag-drop custom exes) — `pages/Tools`.

### Phase 5 — VfxHub + polish
- VfxHub community VFX database (GitHub-hosted upload/download) — `pages/vfxhub`.
- Remaining utilities (`fakegearskin`, `frogchanger`, `wadexplorer` extras).
- Packaging: NSIS installer, sidecar bundling in `tauri.conf.json`, updater endpoints/signing.
- Parity pass + cleanup of any MUI→Tailwind migrations targeted for this release.

---

## Self-Review (against the design spec)

- **Spec coverage:** Design §2–7 (stack swap, folder structure, IPC mapping, native helpers, hybrid UI) are realized by Phase 0 Tasks 1–8 (skeleton) and carried by the Phase 1–5 roadmap. Design §8 phasing maps 1:1 to the Roadmap sections. Design §9 testing is encoded as the per-task verification steps and the vertical-slice template step 6.
- **Placeholder scan:** Stub files (core/mod.rs, state.rs, configStore) are intentional, documented scaffold seams — not unfilled work — and each has real, compilable content. The only deferred concrete value is the `ritoshark` git `rev`, which Task 6 Step 1 explicitly instructs to copy from Flint.
- **Type consistency:** `AppInfo` fields (`name`, `version`, `tauri`) match across Rust `commands/system.rs`, TS `lib/types/index.ts`, and consumption in `App.tsx`. `getAppInfo()` ↔ `get_app_info` command name matches the `generate_handler!` registration. `Page` union (`'Home' | 'Settings'`) matches between `navigationStore.ts` and `App.tsx`'s `PAGES`.
- **Scope:** Phase 0 is a single coherent plan that produces working software (a booting app). Phases 1–5 are deliberately left as a roadmap to be expanded into their own plans — correct decomposition for a ~134K-line port.
```
