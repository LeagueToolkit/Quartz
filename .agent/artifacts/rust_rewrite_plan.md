# 🦀 DivineLab Rust Rewrite - Project Plan

## Overview

A high-performance VFX color editing tool for League of Legends, rewritten in Rust with clean architecture and separation of concerns.

---

## 🎯 Goals

1. **10-100x faster parsing** with binary .bin files (no text conversion)
2. **Clean architecture** - UI completely separate from core logic
3. **Cross-platform** - Windows, macOS, Linux
4. **Memory efficient** - Handle 100k+ line files without lag
5. **Modular design** - Easy to extend with new features

---

## 📁 Project Structure

```
divinelab-rs/
├── Cargo.toml                    # Workspace configuration
├── README.md
├── LICENSE
│
├── crates/                       # All library crates
│   │
│   ├── dl-core/                  # 🔧 Core domain logic (no UI deps)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── error.rs          # Custom error types
│   │       ├── color/
│   │       │   ├── mod.rs
│   │       │   ├── handler.rs    # ColorHandler equivalent
│   │       │   ├── hsl.rs        # HSL conversions
│   │       │   └── palette.rs    # Palette management
│   │       ├── vfx/
│   │       │   ├── mod.rs
│   │       │   ├── system.rs     # VfxSystemDefinitionData
│   │       │   ├── emitter.rs    # VfxEmitterDefinitionData
│   │       │   └── recolor.rs    # Color modification logic
│   │       └── material/
│   │           ├── mod.rs
│   │           └── static_def.rs # StaticMaterialDef
│   │
│   ├── dl-bin/                   # 📦 Binary file parsing
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── error.rs
│   │       ├── types.rs          # BINType enum
│   │       ├── hasher.rs         # FNV1a hash functions
│   │       ├── reader.rs         # Binary reading
│   │       ├── writer.rs         # Binary writing
│   │       ├── entry.rs          # BINEntry struct
│   │       ├── field.rs          # BINField struct
│   │       └── stream.rs         # BytesStream equivalent
│   │
│   ├── dl-wad/                   # 📁 WAD file handling
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── reader.rs
│   │       ├── writer.rs
│   │       ├── chunk.rs
│   │       └── hasher.rs
│   │
│   ├── dl-tex/                   # 🖼️ Texture handling
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── dds.rs            # DDS texture parsing
│   │       ├── tex.rs            # TEX format conversion
│   │       └── preview.rs        # Texture preview generation
│   │
│   ├── dl-hashes/                # #️⃣ Hash table management
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── loader.rs         # Load hash tables from disk
│   │       ├── cache.rs          # In-memory hash cache
│   │       └── lookup.rs         # Fast hash -> name lookup
│   │
│   └── dl-state/                 # 💾 Application state management
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── project.rs        # Current project state
│           ├── history.rs        # Undo/redo stack
│           ├── preferences.rs    # User preferences
│           └── backup.rs         # Backup management
│
├── apps/                         # Application binaries
│   │
│   ├── divinelab-gui/            # 🖥️ GUI application (Tauri + React OR egui)
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json       # If using Tauri
│   │   ├── src/
│   │   │   ├── main.rs           # App entry point
│   │   │   ├── commands.rs       # Tauri IPC commands
│   │   │   └── menu.rs           # Native menu setup
│   │   └── ui/                   # Frontend (if Tauri)
│   │       ├── package.json
│   │       ├── src/
│   │       │   ├── App.tsx
│   │       │   ├── components/
│   │       │   ├── pages/
│   │       │   └── hooks/
│   │       └── public/
│   │
│   └── divinelab-cli/            # ⌨️ CLI tool for batch operations
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs
│           └── commands/
│               ├── mod.rs
│               ├── recolor.rs    # Batch recolor command
│               ├── extract.rs    # Extract from WAD
│               └── pack.rs       # Pack to WAD
│
├── tests/                        # Integration tests
│   ├── fixtures/                 # Test .bin files
│   └── integration/
│
└── benches/                      # Performance benchmarks
    ├── parsing.rs
    └── recolor.rs
```

---

## 🏗️ Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         UI LAYER                            │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  Tauri + React  │  │  CLI (clap)     │                  │
│  │  (divinelab-gui)│  │  (divinelab-cli)│                  │
│  └────────┬────────┘  └────────┬────────┘                  │
└───────────┼────────────────────┼────────────────────────────┘
            │                    │
            ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                     STATE LAYER (dl-state)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Project    │  │  History    │  │  Preferences        │ │
│  │  State      │  │  (Undo/Redo)│  │  (Settings)         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                    DOMAIN LAYER (dl-core)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Color      │  │  VFX        │  │  Material           │ │
│  │  Handler    │  │  System     │  │  Definitions        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                   DATA LAYER (File Formats)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  dl-bin     │  │  dl-wad     │  │  dl-tex             │ │
│  │  (.bin)     │  │  (.wad)     │  │  (.tex/.dds)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  dl-hashes (Hash table lookup)                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Crate Dependencies

### `Cargo.toml` (Workspace)

```toml
[workspace]
resolver = "2"
members = [
    "crates/dl-core",
    "crates/dl-bin",
    "crates/dl-wad",
    "crates/dl-tex",
    "crates/dl-hashes",
    "crates/dl-state",
    "apps/divinelab-gui",
    "apps/divinelab-cli",
]

[workspace.package]
version = "0.1.0"
edition = "2021"
authors = ["Frog"]
license = "MIT"

[workspace.dependencies]
# Internal crates
dl-core = { path = "crates/dl-core" }
dl-bin = { path = "crates/dl-bin" }
dl-wad = { path = "crates/dl-wad" }
dl-tex = { path = "crates/dl-tex" }
dl-hashes = { path = "crates/dl-hashes" }
dl-state = { path = "crates/dl-state" }

# External dependencies
thiserror = "1.0"
anyhow = "1.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
byteorder = "1.5"
memmap2 = "0.9"           # Fast memory-mapped file reading
rayon = "1.10"            # Parallel processing
tracing = "0.1"           # Logging
tokio = { version = "1", features = ["full"] }
```

---

## 🔧 Core Types

### `dl-bin/src/types.rs`

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum BinType {
    None = 0,
    Bool = 1,
    I8 = 2,
    U8 = 3,
    I16 = 4,
    U16 = 5,
    I32 = 6,
    U32 = 7,
    I64 = 8,
    U64 = 9,
    F32 = 10,
    Vec2 = 11,
    Vec3 = 12,
    Vec4 = 13,
    Mtx44 = 14,
    Rgba = 15,
    String = 16,
    Hash = 17,
    File = 18,
    List = 0x80,
    List2 = 0x81,
    Pointer = 0x82,
    Embed = 0x83,
    Link = 0x84,
    Option = 0x85,
    Map = 0x86,
    Flag = 0x87,
}
```

### `dl-core/src/color/handler.rs`

```rust
#[derive(Debug, Clone, Copy)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl Color {
    pub fn from_vec4(v: [f32; 4]) -> Self {
        Self { r: v[0], g: v[1], b: v[2], a: v[3] }
    }
    
    pub fn to_hsl(&self) -> (f32, f32, f32) {
        // HSL conversion logic
    }
    
    pub fn from_hsl(h: f32, s: f32, l: f32, a: f32) -> Self {
        // HSL to RGB conversion
    }
    
    pub fn shift_hsl(&mut self, h: f32, s: f32, l: f32) {
        let (hue, sat, light) = self.to_hsl();
        *self = Self::from_hsl(
            (hue + h).rem_euclid(1.0),
            (sat + s).clamp(0.0, 1.0),
            (light + l).clamp(0.0, 1.0),
            self.a
        );
    }
    
    pub fn to_hex(&self) -> String {
        format!("#{:02X}{:02X}{:02X}",
            (self.r * 255.0) as u8,
            (self.g * 255.0) as u8,
            (self.b * 255.0) as u8
        )
    }
}
```

### `dl-core/src/vfx/system.rs`

```rust
use crate::color::Color;

#[derive(Debug)]
pub struct VfxSystem {
    pub hash: u32,
    pub name: Option<String>,  // Resolved from hash tables
    pub emitters: Vec<VfxEmitter>,
}

#[derive(Debug)]
pub struct VfxEmitter {
    pub name: String,
    pub blend_mode: u8,
    pub birth_color: Option<ColorProperty>,
    pub color: Option<ColorProperty>,
    pub fresnel_color: Option<ColorProperty>,
    pub texture_path: Option<String>,
}

#[derive(Debug)]
pub struct ColorProperty {
    pub constant_value: Option<Color>,
    pub dynamics: Option<ColorDynamics>,
}

#[derive(Debug)]
pub struct ColorDynamics {
    pub times: Vec<f32>,
    pub values: Vec<Color>,
}
```

---

## 🚀 Key Features Implementation

### 1. Fast Binary Parsing

```rust
// dl-bin/src/reader.rs
use memmap2::Mmap;

pub struct BinReader {
    data: Mmap,
    pos: usize,
}

impl BinReader {
    pub fn open(path: &Path) -> Result<Self> {
        let file = File::open(path)?;
        let mmap = unsafe { Mmap::map(&file)? };
        Ok(Self { data: mmap, pos: 0 })
    }
    
    #[inline]
    pub fn read_u32(&mut self) -> u32 {
        let val = u32::from_le_bytes(self.data[self.pos..self.pos+4].try_into().unwrap());
        self.pos += 4;
        val
    }
    
    #[inline]
    pub fn read_vec4(&mut self) -> [f32; 4] {
        [self.read_f32(), self.read_f32(), self.read_f32(), self.read_f32()]
    }
}
```

### 2. Parallel VFX Extraction

```rust
// dl-core/src/vfx/mod.rs
use rayon::prelude::*;

pub fn extract_all_vfx_systems(bin: &Bin, hashes: &HashTables) -> Vec<VfxSystem> {
    const VFX_SYSTEM_TYPE: u32 = 0x45cd899f;
    
    bin.entries
        .par_iter()  // Parallel iteration!
        .filter(|e| e.type_hash == VFX_SYSTEM_TYPE)
        .map(|e| VfxSystem::from_entry(e, hashes))
        .collect()
}
```

### 3. Recolor with Palette

```rust
// dl-core/src/vfx/recolor.rs
pub struct RecolorConfig {
    pub mode: RecolorMode,
    pub palette: Vec<Color>,
    pub ignore_black_white: bool,
    pub targets: RecolorTargets,
}

pub struct RecolorTargets {
    pub birth_color: bool,
    pub color: bool,
    pub fresnel_color: bool,
}

pub enum RecolorMode {
    Random,
    Gradient,
    HueShift(f32),
    HslShift { h: f32, s: f32, l: f32 },
    Shades { base: Color, count: u8, intensity: f32 },
}

pub fn recolor_system(system: &mut VfxSystem, config: &RecolorConfig) {
    for emitter in &mut system.emitters {
        if config.targets.birth_color {
            if let Some(ref mut color) = emitter.birth_color {
                apply_recolor(color, config);
            }
        }
        // ... other targets
    }
}
```

---

## 🖥️ UI Options

### Option A: Tauri + React (Recommended)
- Reuse existing React UI components
- Fastest development time
- Proven technology
- Web dev familiarity

### Option B: egui (Pure Rust)
- Single binary, no web runtime
- Immediate mode GUI
- Lower memory footprint
- Steeper learning curve

### Option C: Slint
- Declarative UI in custom language
- Native look and feel
- Good performance
- Growing ecosystem

**Recommendation**: Start with **Tauri** - you can migrate your existing React components and get a working app faster.

---

## 📋 Implementation Phases

### Phase 1: Core Libraries (Week 1-2)
- [ ] `dl-bin` - Binary parsing/writing
- [ ] `dl-hashes` - Hash table loading
- [ ] `dl-core/color` - Color handling
- [ ] Unit tests for all

### Phase 2: VFX Logic (Week 3)
- [ ] `dl-core/vfx` - VFX system/emitter extraction
- [ ] `dl-core/vfx/recolor` - Recolor logic
- [ ] Integration tests with real .bin files

### Phase 3: CLI Tool (Week 4)
- [ ] `divinelab-cli` - Basic CLI with clap
- [ ] Recolor command
- [ ] Extract/pack commands

### Phase 4: GUI Application (Week 5-6)
- [ ] Tauri setup with React
- [ ] Port Paint.js components
- [ ] File picker, palette UI
- [ ] System/emitter tree view

### Phase 5: Polish (Week 7+)
- [ ] Undo/redo history
- [ ] Backup system
- [ ] Settings/preferences
- [ ] Performance optimization

---

## 🔢 Known Hashes

```rust
// dl-hashes/src/known.rs
pub mod types {
    pub const VFX_SYSTEM_DEFINITION_DATA: u32 = 0x45cd899f;
    pub const SKIN_CHARACTER_DATA: u32 = 0x9b67e9f6;
    pub const STATIC_MATERIAL_DEF: u32 = 0xef3a0f33;
}

pub mod fields {
    pub const BIRTH_COLOR: u32 = 0xab57dd5d;  // Verify this
    pub const COLOR: u32 = 0x????????;         // Look up in hashtables
    pub const FRESNEL_COLOR: u32 = 0x????????;
    pub const EMITTER_NAME: u32 = 0x????????;
    pub const BLEND_MODE: u32 = 0x????????;
    pub const TEXTURE: u32 = 0x????????;
}
```

---

## 🧪 Testing Strategy

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_skin0_bin() {
        let bin = Bin::read("tests/fixtures/skin0.bin").unwrap();
        assert_eq!(bin.entries.len(), 92);
    }
    
    #[test]
    fn test_vfx_extraction() {
        let bin = Bin::read("tests/fixtures/skin0.bin").unwrap();
        let systems = extract_all_vfx_systems(&bin, &HashTables::default());
        assert_eq!(systems.len(), 88);
    }
    
    #[test]
    fn test_recolor_roundtrip() {
        let mut bin = Bin::read("tests/fixtures/skin0.bin").unwrap();
        let original = bin.clone();
        
        // Recolor
        let config = RecolorConfig::hue_shift(180.0);
        recolor_bin(&mut bin, &config);
        
        // Write and read back
        let bytes = bin.write_to_vec();
        let reloaded = Bin::from_bytes(&bytes).unwrap();
        
        assert_eq!(bin.entries.len(), reloaded.entries.len());
    }
}
```

---

## 📚 Resources

- [Your jsritofile](./src/jsritofile/) - JavaScript reference implementation
- [LeagueToolkit](https://github.com/LeagueToolkit/LeagueToolkit) - C# reference
- [lol2gltf](https://github.com/LeagueToolkit/lol2gltf) - Rust examples
- [Tauri docs](https://tauri.app/v1/guides/)
- [egui](https://github.com/emilk/egui) - Pure Rust GUI

---

## 🎯 Success Metrics

| Metric | Current (Electron) | Target (Rust) |
|--------|-------------------|---------------|
| Parse time (skin0.bin) | ~500ms | <50ms |
| Memory usage | ~200MB | <50MB |
| Binary size | ~150MB | <20MB |
| Startup time | ~3s | <0.5s |
| Recolor operation | ~1-2s | <100ms |
