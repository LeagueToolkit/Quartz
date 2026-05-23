# League Toolkit (ltk) - LLM Context Guide

This document provides context for LLM assistants working on projects that use `league-toolkit` as a dependency. It covers crate purposes, common patterns, file format knowledge, and usage examples.

---

## Overview

League Toolkit is a Rust library for parsing, editing, and writing League of Legends file formats. The library is organized as a cargo workspace with:

- **`league-toolkit`** — Umbrella crate that re-exports all sub-crates via feature flags
- **Individual `ltk_*` crates** — Can be used independently for smaller dependency surfaces

### Quick Start

```toml
# Recommended: use the umbrella crate with feature flags
[dependencies]
league-toolkit = { version = "0.2", features = ["wad", "mesh", "texture", "meta"] }

# Or use individual crates directly
[dependencies]
ltk_wad = "0.2"
ltk_texture = "0.4"
```

---

## Crate Reference

### `ltk_wad` — WAD Archive Handling

**Purpose**: Read and write WAD archives (`.wad.client` files), which are League's primary asset containers.

**Key Types**:
- `Wad<TSource>` — A mounted WAD archive (lazy loading)
- `WadChunk` — Metadata for a single file in the archive
- `WadDecoder` — Decompresses chunk data (GZip, Zstd, ZstdMulti)
- `WadBuilder` — Creates new WAD archives
- `WadExtractor` — Extracts chunks to disk with progress callbacks
- `PathResolver` trait — Maps path hashes to human-readable paths

**WAD Path Hashing**: Files in WAD archives are identified by 64-bit path hashes (XXHash64 of lowercase path). Use a "hashtable" (hash→path mapping) to resolve paths.

**Example: Reading a WAD**
```rust
use std::fs::File;
use ltk_wad::{Wad, WadChunk};

let file = File::open("base.wad.client")?;
let mut wad = Wad::mount(file)?;

// Get chunk table
let chunks = wad.chunks();
println!("WAD contains {} files", chunks.len());

// Decode a specific chunk
let (mut decoder, chunks) = wad.decode();
if let Some(chunk) = chunks.get(&0x1234567890abcdef) {
    let data = decoder.load_chunk_decompressed(chunk)?;
    // data is the raw file bytes
}
```

**Example: Extracting with Progress**
```rust
use ltk_wad::{Wad, WadExtractor, HashMapPathResolver};

let mut wad = Wad::mount(File::open("archive.wad.client")?)?;
let resolver = HashMapPathResolver::new(load_hashtable()?);

let extractor = WadExtractor::new(&resolver)
    .on_progress(|p| println!("{:.0}% - {}", p.percent() * 100.0, p.current_path()));

let (mut decoder, chunks) = wad.decode();
extractor.extract_all(&mut decoder, chunks, "./output")?;
```

**Compression Types**:
- `None` — Uncompressed
- `GZip` — Standard gzip
- `Zstd` — Zstandard
- `ZstdMulti` — Zstd with multiple frames
- `Satellite` — External file reference (rare)

---

### `ltk_texture` — Texture Formats

**Purpose**: Decode and encode League's texture formats (.tex, .dds).

**Key Types**:
- `Texture` — Enum over `Tex` and `Dds`
- `Tex` — League's custom .tex format
- `Dds` — Standard DirectDraw Surface format
- `Surface` — Decoded pixel data, convertible to `image::RgbaImage`

**Example: Decoding a Texture**
```rust
use ltk_texture::{Tex, Texture};
use std::io::Cursor;

// From .tex file
let tex = Tex::from_reader(&mut cursor)?;
let surface = tex.decode_mipmap(0)?;
let rgba_image = surface.into_rgba_image()?;
rgba_image.save("output.png")?;

// Or use the unified Texture enum
let texture: Texture = Tex::from_reader(&mut cursor)?.into();
let surface = texture.decode_mipmap(0)?;
```

**BC Encoding** (optional): Enable `intel-tex` feature on `ltk_texture` for BC1/BC3 encoding:
```toml
ltk_texture = { version = "0.4", features = ["intel-tex"] }
```

---

### `ltk_mesh` — Mesh Formats

**Purpose**: Parse skinned meshes (.skn) and static meshes (.scb/.sco).

**Key Types**:
- `SkinnedMesh` — Skinned mesh for characters (vertex skinning with bone weights)
- `StaticMesh` — Static environment mesh
- `VertexBuffer`, `IndexBuffer` — GPU-ready buffer abstractions
- `SkinnedMeshRange` — Submesh range (material assignment)

**Skinned Mesh (.skn)**:
```rust
use ltk_mesh::{SkinnedMesh, mem::vertex::ElementName};
use std::fs::File;

let mut file = File::open("champion.skn")?;
let mesh = SkinnedMesh::from_reader(&mut file)?;

// Access vertex data
let positions = mesh.vertex_buffer().accessor::<glam::Vec3>(ElementName::Position)?;
for pos in positions.iter() {
    println!("Vertex: {:?}", pos);
}

// Submesh ranges (for materials)
for range in mesh.ranges() {
    println!("Submesh: {} - material: {}", range.name(), range.material());
}
```

**Static Mesh (.scb)**:
```rust
use ltk_mesh::StaticMesh;

let mesh = StaticMesh::from_reader(&mut file)?;
println!("Mesh: {}", mesh.name());
println!("Vertices: {}", mesh.vertices().len());
println!("Faces: {}", mesh.faces().len());
```

**Vertex Elements**: `Position`, `Normal`, `Tangent`, `TexCoord`, `Color`, `BlendWeight`, `BlendIndex`

---

### `ltk_anim` — Animation & Skeleton Formats

**Purpose**: Parse skeleton files (.skl) and animation files (.anm).

**Key Types**:
- `RigResource` — Skeleton/rig definition
- `Joint` — Single bone/joint in hierarchy
- `Animation` — Animation clip (compressed or uncompressed)
- `AnimationAsset` — Unified animation asset container

**Reading a Skeleton**:
```rust
use ltk_anim::RigResource;

let rig = RigResource::from_reader(&mut file)?;
println!("Rig: {}", rig.name());
for joint in rig.joints() {
    println!("Joint: {} (parent: {:?})", joint.name(), joint.parent_id());
}
```

**Animation Types**:
- `Uncompressed` — Full keyframe data
- `Compressed` — Quantized/compressed format (requires evaluator)

---

### `ltk_meta` — Property Bin Files

**Purpose**: Read and write property bin files (.bin), League's primary data format for game configuration.

**Key Types**:
- `BinTree` — Top-level container (collection of objects + dependencies)
- `BinTreeObject` — Single object with typed properties
- `BinProperty` — Property with hash key and typed value
- `value::*` — Property value types (I32, F32, String, Vec3, Container, etc.)

**Property bins** are hierarchical data structures containing game data (champions, items, abilities, etc.).

**Reading a Bin File**:
```rust
use ltk_meta::BinTree;

let tree = BinTree::from_reader(&mut file)?;

println!("Dependencies: {:?}", tree.dependencies);
for (path_hash, object) in &tree.objects {
    println!("Object 0x{:08x} (class: 0x{:08x})", path_hash, object.class_hash);
    for (prop_hash, prop) in &object.properties {
        println!("  Property 0x{:08x}: {:?}", prop_hash, prop.value);
    }
}
```

**Creating a Bin File**:
```rust
use ltk_meta::{BinTree, BinTreeObject, value::*};

let tree = BinTree::builder()
    .dependency("shared/data.bin")
    .object(
        BinTreeObject::builder(0x12345678, 0xABCDEF00)
            .property(0x1111, I32Value(42))
            .property(0x2222, StringValue("hello".into()))
            .property(0x3333, Vec3Value(glam::Vec3::new(1.0, 2.0, 3.0)))
            .build()
    )
    .build();

tree.to_writer(&mut output)?;
```

**Path/Name Hashing**: Object paths and property names are stored as FNV-1a hashes. Use community hash databases or `ltk_hash::fnv1a::hash_lower()` to compute hashes.

---

### `ltk_ritobin` — Human-Readable Bin Format

**Purpose**: Parse and write the "ritobin" text format — a human-readable representation of .bin files.

**Example**:
```rust
use ltk_ritobin::{parse, write};

let text = r#"
#PROP_text
type: string = "PROP"
version: u32 = 3
linked: list2[hash] = {}
entries: map[hash,embed] = {
    0x12345678 = SomeClass {
        value: i32 = 42
    }
}
"#;

// Parse text → RitobinFile → BinTree
let file = parse(text)?;
let tree = file.to_bin_tree();

// BinTree → text
let output = write(&tree)?;
```

Useful for debugging, diffing, or hand-editing bin data.

---

### `ltk_mapgeo` — Map Geometry

**Purpose**: Parse .mapgeo files containing environment geometry for maps (Summoner's Rift, ARAM, etc.).

**Key Types**:
- `EnvironmentAsset` — Complete map geometry asset
- `EnvironmentMesh` — Individual mesh with materials
- `BucketedGeometry` — Spatial acceleration structure (grid-based)
- `PlanarReflector` — Reflection plane definition

**Example**:
```rust
use ltk_mapgeo::EnvironmentAsset;

let asset = EnvironmentAsset::from_reader(&mut file)?;

println!("Meshes: {}", asset.meshes().len());
for mesh in asset.meshes() {
    println!("  Mesh: {} submeshes", mesh.submeshes().len());
}

// Bucketed geometry for spatial queries
for scene_graph in asset.scene_graphs() {
    let buckets = scene_graph.bucketed_geometry();
    if !buckets.is_disabled() {
        // Query spatial data
        if let Some((bx, bz)) = buckets.world_to_bucket(100.0, 200.0) {
            let bucket = buckets.bucket_at(bx, bz);
            // ...
        }
    }
}
```

**Supported Versions**: 5, 6, 7, 9, 11, 12, 13, 14, 15, 17

---

### `ltk_file` — File Type Detection

**Purpose**: Identify League file types from magic bytes or extensions.

**Key Types**:
- `LeagueFileKind` — Enum of all known file types

**Example**:
```rust
use ltk_file::{LeagueFileKind, MAX_MAGIC_SIZE};

// From magic bytes
let mut buffer = [0u8; MAX_MAGIC_SIZE];
reader.read(&mut buffer)?;
let kind = LeagueFileKind::identify_from_bytes(&buffer);

// From extension
let kind = LeagueFileKind::from_extension(".skn");
assert_eq!(kind, LeagueFileKind::SimpleSkin);

// Get extension for a kind
assert_eq!(LeagueFileKind::Animation.extension(), Some("anm"));
```

**Known File Types**: Animation (.anm), MapGeometry (.mapgeo), PropertyBin (.bin), SimpleSkin (.skn), Skeleton (.skl), StaticMeshBinary (.scb), StaticMeshAscii (.sco), Texture (.tex), TextureDds (.dds), WwiseBank (.bnk), WwisePackage (.wpk), and more.

---

### `ltk_hash` — Hashing Utilities

**Purpose**: Hash functions used by League of Legends formats.

**Functions**:
- `fnv1a::hash_lower(input)` → `u32` — FNV-1a hash of lowercase string (used for bin property/object hashes)
- `elf::elf(input)` → `usize` — ELF hash

**Example**:
```rust
use ltk_hash::fnv1a::hash_lower;

let hash = hash_lower("mSpellName");
// Use this hash to look up properties in BinTree
```

**Note**: WAD path hashes use XXHash64, not FNV-1a.

---

### `ltk_primitives` — Primitive Types

**Purpose**: Common geometric primitives used across crates.

**Types**:
- `AABB` — Axis-aligned bounding box
- `Sphere` — Bounding sphere
- `Color<T>` — RGBA color (generic over component type)

```rust
use ltk_primitives::{AABB, Sphere, Color};
use glam::Vec3;

let aabb = AABB::of_points([Vec3::ZERO, Vec3::ONE].iter().copied());
let sphere = aabb.bounding_sphere();
let color = Color::<u8>::new(255, 128, 64, 255);
```

---

### `ltk_shader` — Shader Utilities

**Purpose**: Shader path generation and TOC (table of contents) parsing for League's shader system.

**Key Functions**:
- `create_shader_object_path(path, shader_type, platform)` — Build shader path
- `create_shader_bundle_path(path, bundle_id)` — Build bundle path

**Platforms**: Dx9, Dx11, Glsl, Metal  
**Shader Types**: Vertex, Pixel

---

### `ltk_io_ext` — I/O Extensions

**Purpose**: Internal I/O utilities used by other crates. Generally not needed directly.

---

## Common Patterns

### Reading Files

Most types implement `from_reader(&mut impl Read)`:

```rust
let mesh = SkinnedMesh::from_reader(&mut file)?;
let tex = Tex::from_reader(&mut cursor)?;
let tree = BinTree::from_reader(&mut reader)?;
```

### Writing Files

Types that support writing implement `to_writer(&mut impl Write)`:

```rust
tree.to_writer(&mut file)?;
mesh.to_writer(&mut output)?;
```

### Builder Pattern

Complex types often use builders:

```rust
// BinTree builder
let tree = BinTree::builder()
    .dependency("base.bin")
    .object(obj)
    .build();

// RigResource builder
let rig = RigResource::builder("MyRig", "asset_name")
    .joint(joint)
    .build();
```

### Error Handling

Each crate defines its own error type (e.g., `WadError`, `ParseError`). Most expose a `Result<T>` type alias:

```rust
use ltk_wad::Result;
fn process_wad() -> Result<()> { ... }
```

### Working with Glam

Vector/matrix types use the `glam` crate:

```rust
use glam::{Vec2, Vec3, Vec4, Mat4, Quat};
```

---

## File Format Quick Reference

| Extension | Crate | Type | Description |
|-----------|-------|------|-------------|
| `.wad.client` | `ltk_wad` | `Wad` | Asset archive container |
| `.bin` | `ltk_meta` | `BinTree` | Property/configuration data |
| `.skn` | `ltk_mesh` | `SkinnedMesh` | Character mesh with skinning |
| `.skl` | `ltk_anim` | `RigResource` | Skeleton/rig |
| `.anm` | `ltk_anim` | `Animation` | Animation clip |
| `.scb` | `ltk_mesh` | `StaticMesh` | Static mesh (binary) |
| `.sco` | `ltk_mesh` | `StaticMesh` | Static mesh (ASCII) |
| `.tex` | `ltk_texture` | `Tex` | League texture format |
| `.dds` | `ltk_texture` | `Dds` | DirectDraw Surface |
| `.mapgeo` | `ltk_mapgeo` | `EnvironmentAsset` | Map geometry |

---

## Hash Reference

| Context | Algorithm | Size | Crate |
|---------|-----------|------|-------|
| WAD path hashes | XXHash64 | 64-bit | (external) |
| Bin object/property hashes | FNV-1a (lowercase) | 32-bit | `ltk_hash` |
| String table hashes | ELF hash | varies | `ltk_hash` |

---

## Version Notes

- All crates follow semantic versioning
- The umbrella `league-toolkit` crate versions independently from sub-crates
- Breaking changes in sub-crates cause major version bumps
- File format version support is documented per-crate (e.g., mapgeo supports versions 5-17)

---

## Tips for LLM Assistants

1. **Always check feature flags**: The umbrella crate requires explicit feature flags for each subsystem.

2. **Path hashes**: When working with WAD files, remember that paths are hashed. You need a hashtable to get human-readable paths.

3. **Bin file hashes**: Property and object names in .bin files are FNV-1a hashes. Community databases map these to names.

4. **Use glam for math**: All vector/matrix operations use `glam` types.

5. **Texture encoding is optional**: BC1/BC3 encoding requires the `intel-tex` feature.

6. **Error types are crate-specific**: Don't mix error types across crates without conversion.

7. **Reader must be seekable for WAD**: `Wad::mount()` requires `Read + Seek`.

8. **Bin files can reference other bins**: Check `dependencies` field in `BinTree`.

---

## Example: Complete Asset Extraction Pipeline

```rust
use std::fs::File;
use ltk_wad::{Wad, WadExtractor, HashMapPathResolver};
use ltk_file::LeagueFileKind;
use ltk_texture::Texture;
use ltk_mesh::SkinnedMesh;
use ltk_meta::BinTree;

fn extract_and_process(wad_path: &str, output_dir: &str) -> anyhow::Result<()> {
    // 1. Mount WAD
    let mut wad = Wad::mount(File::open(wad_path)?)?;
    let (mut decoder, chunks) = wad.decode();
    
    // 2. Process each chunk based on type
    for chunk in chunks.values() {
        let data = decoder.load_chunk_decompressed(chunk)?;
        let kind = LeagueFileKind::identify_from_bytes(&data);
        
        match kind {
            LeagueFileKind::SimpleSkin => {
                let mesh = SkinnedMesh::from_reader(&mut std::io::Cursor::new(&data))?;
                println!("Mesh with {} vertices", mesh.vertex_buffer().vertex_count());
            }
            LeagueFileKind::Texture => {
                let tex = ltk_texture::Tex::from_reader(&mut std::io::Cursor::new(&data))?;
                println!("Texture {}x{}", tex.width, tex.height);
            }
            LeagueFileKind::PropertyBin => {
                let tree = BinTree::from_reader(&mut std::io::Cursor::new(&data))?;
                println!("Bin with {} objects", tree.len());
            }
            _ => {}
        }
    }
    
    Ok(())
}
```

---

*This guide is intended for LLM context. For full API documentation, see [docs.rs/league-toolkit](https://docs.rs/league-toolkit).*

