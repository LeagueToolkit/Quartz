# Assets Ported from Electron Quartz

Source root: `e:\RitoShark\Quartz-Port\Quartz\public`
Target roots:
- Web-served: `e:\RitoShark\Quartz-Port\Quartz-Rust\public`
- Bundled native: `e:\RitoShark\Quartz-Port\Quartz-Rust\src-tauri\resources`

## Logos / Icons (-> public/)

| File | Source | Destination | Category |
|------|--------|-------------|----------|
| your-logo.gif | Quartz/public/your-logo.gif | Quartz-Rust/public/your-logo.gif | logo (animated; old UI used as loading/navbar logo) |
| divinelab.ico | Quartz/public/divinelab.ico | Quartz-Rust/public/divinelab.ico | icon (app/title-bar/favicon) |

Note: `quartz-logo.png` already existed in target public/ and is referenced by `src/components/layout/TitleBar.tsx`. Not overwritten.

## Onboarding / Doc Images (-> public/)

| File | Source | Destination | Category |
|------|--------|-------------|----------|
| celestia.webp | Quartz/public/celestia.webp | Quartz-Rust/public/celestia.webp | image |
| explanation1.webp | Quartz/public/explanation1.webp | Quartz-Rust/public/explanation1.webp | image |
| explanation2.webp | Quartz/public/explanation2.webp | Quartz-Rust/public/explanation2.webp | image |
| jade.webp | Quartz/public/jade.webp | Quartz-Rust/public/jade.webp | image |
| quartzminecraft.WEBP | Quartz/public/quartzminecraft.WEBP | Quartz-Rust/public/quartzminecraft.WEBP | image (note: uppercase .WEBP extension preserved) |
| UxYW2KY_x2.png | Quartz/public/UxYW2KY_x2.png | Quartz-Rust/public/UxYW2KY_x2.png | image (Celestia welcome) |

## Cursors (-> src-tauri/resources/cursors/)

Merged with existing. All 8 source cursor assets were already present in target (identical names); re-copied to ensure parity. `.gitkeep` was intentionally skipped (not an asset).

| File | Category |
|------|----------|
| Kassadin.cur | cursor |
| Normal Select 6.cur | cursor |
| Normal Select 7.cur | cursor |
| Pokeball_normal_select.cur | cursor |
| Right Transparent Rainbow.cur | cursor |
| glitchcursor.gif | cursor |
| league of legends legacy .cur | cursor (note trailing space in filename, preserved) |
| sword.cur | cursor |

## Wallpapers (-> src-tauri/resources/wallpapers/)

Merged with existing. All 8 source wallpapers were already present in target (identical names); re-copied to ensure parity.

| File | Category |
|------|----------|
| Forest.webp | wallpaper |
| amogus.webp | wallpaper |
| cafe.webp | wallpaper |
| cyberpunkcityrain.webp | wallpaper |
| sakura.webp | wallpaper |
| slime.webp | wallpaper |
| starsky.webp | wallpaper |
| wavethemewallpaper.webp | wallpaper |

## 3D Textures / Mesh (-> src-tauri/resources/textures/)

| File | Source | Destination | Category |
|------|--------|-------------|----------|
| floor.dds | Quartz/public/floor.dds | resources/textures/floor.dds | texture |
| screen.dds | Quartz/public/screen.dds | resources/textures/screen.dds | texture |
| riots_sru_skybox_cubemap.dds | Quartz/public/riots_sru_skybox_cubemap.dds | resources/textures/riots_sru_skybox_cubemap.dds | texture |
| screen.scb | Quartz/public/screen.scb | resources/textures/screen.scb | texture (static mesh) |

## Audio (-> src-tauri/resources/audio/)

| File | Source | Destination | Category |
|------|--------|-------------|----------|
| silence.wem | Quartz/public/silence.wem | resources/audio/silence.wem | audio |
| codebook.bin | Quartz/public/codebook.bin | resources/audio/codebook.bin | audio (Vorbis codebook) |

## Celestia Welcome Image (-> src-tauri/resources/)

| File | Source | Destination | Category |
|------|--------|-------------|----------|
| UxYW2KY_x2.png | Quartz/public/UxYW2KY_x2.png | resources/UxYW2KY_x2.png | image (bundled) |

Rationale: In the old Electron app `src/components/celestia/CelestiaWelcome.js` reads this from `resourcesPath` (a bundled native resource), so a copy is placed in `resources/`. A web-served copy is also in `public/` in case the rewrite's UI references it via URL. Keep whichever the rewrite uses; both are provided.

## Fonts

None found. No `.ttf/.otf/.woff/.woff2/.eot` files exist anywhere in the source Quartz project (outside node_modules/archived). No `resources/fonts/` folder was created.

---

## tauri.conf.json bundle.resources globs to register

Add the following to `bundle.resources`:

```
"resources/cursors/*",
"resources/wallpapers/*",
"resources/textures/*",
"resources/audio/*",
"resources/UxYW2KY_x2.png"
```

(`resources/cursors/*` and `resources/wallpapers/*` may already be present — verify before adding to avoid duplicates.)
