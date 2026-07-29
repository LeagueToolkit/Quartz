<p align="center">
  <img src="public/quartz-logo.gif" alt="Quartz" width="360"/>
</p>

<p align="center">
  <strong>The League of Legends modding suite built for VFX.</strong><br/>
  Recolor particles, port effects between champions, extract from the game, and repath a finished mod — all in one window.
</p>

<p align="center">
  <a href="https://github.com/RitoShark/Quartz/releases/latest">
    <img src="https://img.shields.io/github/v/release/RitoShark/Quartz?style=for-the-badge&color=3fa6f4&labelColor=0d1117&logo=github" alt="Release"/>
  </a>
  <img src="https://img.shields.io/badge/Windows-10%20%2F%2011-0d1117?style=for-the-badge&labelColor=0d1117&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTAgMy40NDlMOS43NSAyLjF2OS40NTFIMG0xMC45NDktOS42MDJMMjQgMHYxMS40SDEwLjk0OU0wIDEyLjZoOS43NXY5LjQ1MUwwIDIwLjY5OU0xMC45NDkgMTIuNkgyNFYyNGwtMTIuOS0xLjgwMSIvPjwvc3ZnPg==" alt="Windows"/>
  <img src="https://img.shields.io/badge/Rust-DEA584?style=for-the-badge&logo=rust&logoColor=white&labelColor=0d1117" alt="Rust"/>
  <img src="https://img.shields.io/badge/Tauri%202-24C8D8?style=for-the-badge&logo=tauri&logoColor=white&labelColor=0d1117" alt="Tauri"/>
  <img src="https://img.shields.io/badge/React%2018-61DAFB?style=for-the-badge&logo=react&logoColor=white&labelColor=0d1117" alt="React"/>
  <img src="https://img.shields.io/badge/License-Custom%20OSS-22c55e?style=for-the-badge&labelColor=0d1117" alt="Custom Open Source License"/>
</p>

<p align="center">
  <a href="https://github.com/RitoShark/Quartz/releases/latest"><strong>⬇ Download the latest release</strong></a>
</p>

---

## What is Quartz?

Quartz is a modding suite aimed squarely at League of Legends VFX work. Where most
tools stop at extracting files, Quartz gives you the whole loop — pull the assets
out of the game, recolor and randomize particles, port emitters and vfxsystems
between champions, then repath and ship the result.

This is the Rust rewrite. The original Electron build lives on the
[`electron-legacy`](https://github.com/RitoShark/Quartz/tree/electron-legacy)
branch; everything here runs on Tauri 2 with a native Rust backend, so no
external CLIs or bundled Python are required.

---

## Features

### Particles & VFX
- **Paint** — the core recoloring workflow. Random colors, hue shift that preserves lightness and saturation, generated shade ranges, blend-mode selection, custom saved palettes, and inline texture previews on hover.
- **Port** — load a target and a donor BIN, then drag whole vfxsystems or individual emitters across. Textures are copied into your project automatically; add persistent effects, matrix transforms, child emitters, or empty vfxsystems to nest into.
- **VFX Hub** — community-powered vfxsystem sharing, with images and the full Port toolset on top.
- **Randomizer** — randomize VFX particle parameters across an entire skin in one pass.
- **FakeGear** — wires up an in-game `Ctrl+5` toggle so your skin can swap between VFX variants.

### Browse & extract
- **WAD Explorer** — explore WAD archives with live 3D model and texture preview.
- **Asset Extractor** — pick a champion and skin ID and extract straight out of the game's WADs, with auto-detection of your Champions folder, optional voiceover extraction, and automatic repathing on the way out.
- **Sound Banks** — extract, edit, and repack BNK / WPK / WEM audio for custom sound mods.

### Textures & images
- **Image Recolor** — batch hue/saturation/brightness across a folder of DDS or TEX files, with a live preview before you commit.
- **RGBA** — adjust RGBA channels on DDS and TEX textures, and generate League-format color codes with full alpha support.
- **Upscale** — AI upscaling for DDS and PNG textures, powered by [Upscayl](https://github.com/upscayl).

### Editing & shipping
- **Bin Editor** — edit BIN parameters like `birthscale` and `scale` directly, in bulk, across selected emitters or vfxsystems.
- **AniPort** — port animations between champions and skins, including `AtomicClipData` and event maps.
- **Bumpath** — repath a mod's file references using the integrated hash database.
- **File Handler** — bulk file processing in two modes: randomize textures across a folder (great for custom emotes), or add and strip prefixes/suffixes for map mods.
- **Tools** — drop your own executables in and drag folders onto them to run custom fixes.

---

## Under the hood

Every League file Quartz touches is parsed in Rust by
**[RitoShark Crates](https://github.com/RitoShark/RitoShark-Crates)** — the
`ritoshark` workspace of `rs_*` crates written for this ecosystem, where the
contract is correct and lossless round-trips. Quartz uses it for:

| Crate | Used for |
|---|---|
| `rs_bin` | BIN read/write — the backbone of Paint, Port, VFX Hub, Bin Editor and Bumpath |
| `rs_wad` | WAD archives — Asset Extractor and WAD Explorer |
| `rs_tex` | TEX / DDS decode and encode — Image Recolor, RGBA, Upscale, texture previews |
| `rs_hash` | WAD and BIN hash resolution against the LMDB hash database |
| `rs_mesh` / `rs_anim` | SKN / SKL meshes and animations — 3D preview and AniPort |
| `rs_troybin` / `rs_luabin` | Legacy VFX and script formats |

Because parsing lives in the library rather than the app, a format fix lands once
and every RitoShark tool gets it. `src-tauri/crates/quartz-lib/` is a thin wrapper
over those crates; the command modules in `src-tauri/src/commands/` stay thin on
top of that. No `ritobin` CLI, no Python sidecar, no shelling out.

---

## Quick start

**Just want to use it?** [Download the latest installer](https://github.com/RitoShark/Quartz/releases/latest) and run it. Quartz auto-updates itself from there.

### Build from source

```bash
git clone https://github.com/RitoShark/Quartz
cd Quartz

npm install
npm run tauri dev
```

<details>
<summary><strong>Prerequisites</strong></summary>

| Tool | Version |
|------|---------|
| Rust | 1.75+ ([rustup](https://rustup.rs)) |
| Node | v20+ ([nodejs.org](https://nodejs.org)) |
| OS   | Windows 10 / 11 |

</details>

<details>
<summary><strong>Build a release installer</strong></summary>

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/nsis/Quartz_<version>_x64-setup.exe`

</details>

---

## Layout

- `src/` — React frontend: `pages/`, `components/`, `lib/api/` (typed `invoke` wrappers), `lib/stores/` (Zustand), `lib/types/`, `styles/`
- `src-tauri/` — Rust backend: `src/commands/` (one module per domain), `src/core/`, `crates/quartz-lib/` (the format layer over the RitoShark crates)

---

## Theming

Quartz ships a theme creator with a live preview, and the whole UI is driven by
CSS variables. To theme it by hand, override the accent palette from
[src/styles/theme.css](src/styles/theme.css):

```css
:root {
  --accent-primary:   #3fa6f4;  /* Quartz blue */
  --accent-hover:     #66b8f6;
  --accent-secondary: #0f90f1;
  --accent-muted:     #1e5681;
}
```

---

## Contributing

PRs welcome. Keep commits [conventional](https://www.conventionalcommits.org) — `feat:`, `fix:`, `perf:`, `refactor:`, `docs:` — they feed the changelog via [git-cliff](cliff.toml).

```bash
git checkout -b feat/your-feature
# hack hack hack
git commit -m "feat(scope): short imperative message"
```

---

## Credits

### Contributors

- **[SirDexal](https://github.com/DexalGT)** — the Rust port. Designed and built this rewrite from the ground up: the Tauri 2 + React architecture, the Rust backend and `quartz-lib` format layer on top of the RitoShark crates, and the port of every page across from the Electron app.
- **[Wiko](https://github.com/wiko3)** — contributions to both the original Electron app and the Rust port.
- **[FrogCsLoL](https://github.com/FrogCsLoL)** — original author of Quartz and its Electron build, which this rewrite is based on.

### Built on

- **[RitoShark Crates](https://github.com/RitoShark/RitoShark-Crates)** — the Rust format library doing all of Quartz's BIN, WAD, TEX, mesh and animation parsing.
- **[LtMAO](https://github.com/tarngaina/LtMAO)** by [tarngaina](https://github.com/tarngaina) — one of the most impressive toolpacks in League modding. Quartz would not exist without it.
- **[Jade](https://github.com/LeagueToolkit/Jade-League-Bin-Editor)** by Bud — the BIN editor Quartz hands files off to.
- **[Upscayl](https://github.com/upscayl)** and **[upscayl-ncnn](https://github.com/upscayl/upscayl-ncnn)** — the free and open source AI upscaler behind the Upscale page.
- **[bnk-extract-GUI](https://github.com/Morilli/bnk-extract-GUI)** by [Morilli](https://github.com/Morilli) — made full `.bnk` / `.wpk` support possible.
- **[LeagueToolkit](https://github.com/LeagueToolkit)** — the C# toolkit that remains the reference for League file formats.

---

## License

[Custom Open Source License](LICENSE). You can do what you like with this code, on
three conditions: credit Quartz, keep your derivative open source and forkable,
and grant the original author the right to use improvements from your fork.

> League of Legends, all champion art, and all referenced game assets are property of **Riot Games, Inc.** Quartz is an unofficial community tool and is not endorsed by or affiliated with Riot Games.
