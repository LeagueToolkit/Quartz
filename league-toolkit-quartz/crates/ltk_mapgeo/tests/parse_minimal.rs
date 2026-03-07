use std::io::Cursor;

use ltk_mapgeo::EnvironmentAsset;

// Builds a minimal (but structurally valid) mapgeo stream that exercises the top-level parser.
//
// Notes:
// - Uses version 15 to avoid texture override format (v17) and planar reflectors (v13+) are present,
//   but we set reflector count to 0.
// - Uses 1 vertex declaration (POSITION/XYZ_Float32) and 1 vertex buffer with 1 vertex.
// - Uses 1 index buffer with 3 indices (one triangle).
// - Uses 1 mesh with 0 submeshes and disabled bucketed-geometry (so no vertices/indices/buckets).
#[test]
fn parses_minimal_mapgeo() {
    let mut bytes = Vec::new();

    // Magic + version (u32 LE)
    bytes.extend_from_slice(b"OEGM");
    bytes.extend_from_slice(&15u32.to_le_bytes());

    // Sampler defs (v15): version >=9 & >=11 => two sized strings (u32 length + bytes)
    write_sized_string(&mut bytes, ""); // sampler 0
    write_sized_string(&mut bytes, ""); // sampler 1

    // Vertex declarations
    bytes.extend_from_slice(&1u32.to_le_bytes()); // count
                                                  // VertexBufferDescription: usage(u32)=0, element_count(u32)=1, element name/format (u32/u32)
    bytes.extend_from_slice(&0u32.to_le_bytes()); // Static
    bytes.extend_from_slice(&1u32.to_le_bytes()); // 1 element
    bytes.extend_from_slice(&0u32.to_le_bytes()); // ElementName::Position
    bytes.extend_from_slice(&2u32.to_le_bytes()); // ElementFormat::XYZ_Float32
                                                  // MapGeo vertex declarations always reserve 15 elements; pad the unused ones (8 bytes each)
    bytes.extend(std::iter::repeat_n(0u8, 8 * (15 - 1)));

    // Vertex buffers (v15 has visibility byte)
    bytes.extend_from_slice(&1u32.to_le_bytes()); // vb count
    bytes.push(0); // visibility flags (ignored)
    let vb_data = [0u8; 12]; // 1 vertex, XYZ_Float32
    bytes.extend_from_slice(&(vb_data.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&vb_data);

    // Index buffers (v15 has visibility byte)
    bytes.extend_from_slice(&1u32.to_le_bytes()); // ib count
    bytes.push(0); // visibility flags (ignored)
    let ib_data: [u8; 6] = [
        0, 0, // 0
        0, 0, // 0
        0, 0, // 0
    ];
    bytes.extend_from_slice(&(ib_data.len() as i32).to_le_bytes());
    bytes.extend_from_slice(&ib_data);

    // Meshes
    bytes.extend_from_slice(&1u32.to_le_bytes()); // mesh count
                                                  // Mesh 0 (version > 11 => name not stored)
    bytes.extend_from_slice(&1i32.to_le_bytes()); // vertex_count
    bytes.extend_from_slice(&1u32.to_le_bytes()); // vertex_declaration_count
    bytes.extend_from_slice(&0i32.to_le_bytes()); // base_vertex_declaration_id
    bytes.extend_from_slice(&0i32.to_le_bytes()); // vertex_buffer_id[0]
    bytes.extend_from_slice(&3u32.to_le_bytes()); // index_count
    bytes.extend_from_slice(&0i32.to_le_bytes()); // index_buffer_id
    bytes.extend_from_slice(&0u8.to_le_bytes()); // visibility flags (early; v>=13)
    bytes.extend_from_slice(&0u32.to_le_bytes()); // visibility_controller_path_hash (v>=15)
    bytes.extend_from_slice(&0u32.to_le_bytes()); // submesh_count
    bytes.push(0); // disable_backface_culling (stored as "disable", 0 => false)
                   // AABB (min/max vec3) via ltk_io_ext::ReaderExt::read_aabb::<LE>()
                   // Format: 6 f32: min(x,y,z), max(x,y,z)
    bytes.extend_from_slice(&0.0f32.to_le_bytes());
    bytes.extend_from_slice(&0.0f32.to_le_bytes());
    bytes.extend_from_slice(&0.0f32.to_le_bytes());
    bytes.extend_from_slice(&0.0f32.to_le_bytes());
    bytes.extend_from_slice(&0.0f32.to_le_bytes());
    bytes.extend_from_slice(&0.0f32.to_le_bytes());
    // Mat4 row-major: 16 f32
    for i in 0..16 {
        let v = if i % 5 == 0 { 1.0f32 } else { 0.0f32 };
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    bytes.push(0); // quality flags
                   // Render flags (v15 uses new render flags): transition_behavior(u8) + render_flags(u8)
    bytes.push(0); // transition behavior
    bytes.push(0); // render flags
                   // Lighting channels (v>=9): baked_light + stationary_light
    write_channel(&mut bytes); // baked_light
    write_channel(&mut bytes); // stationary_light
                               // v15: baked paint old-format present (v12-16)
    write_channel(&mut bytes);

    // Scene graphs (v>=15): count i32, then BucketedGeometry
    bytes.extend_from_slice(&1i32.to_le_bytes());
    // BucketedGeometry (not legacy): visibility_controller_path_hash(u32) + floats/flags + disabled=1
    bytes.extend_from_slice(&0u32.to_le_bytes()); // visibility_controller_path_hash
    bytes.extend_from_slice(&0.0f32.to_le_bytes()); // min_x
    bytes.extend_from_slice(&0.0f32.to_le_bytes()); // min_z
    bytes.extend_from_slice(&0.0f32.to_le_bytes()); // max_x
    bytes.extend_from_slice(&0.0f32.to_le_bytes()); // max_z
    bytes.extend_from_slice(&0.0f32.to_le_bytes()); // max_stick_out_x
    bytes.extend_from_slice(&0.0f32.to_le_bytes()); // max_stick_out_z
    bytes.extend_from_slice(&1.0f32.to_le_bytes()); // bucket_size_x
    bytes.extend_from_slice(&1.0f32.to_le_bytes()); // bucket_size_z
    bytes.extend_from_slice(&1u16.to_le_bytes()); // buckets_per_side
    bytes.push(1); // is_disabled = true
    bytes.push(0); // flags
    bytes.extend_from_slice(&0u32.to_le_bytes()); // vertex_count
    bytes.extend_from_slice(&0u32.to_le_bytes()); // index_count
                                                  // disabled => no more data

    // Planar reflectors (v>=13): u32 count
    bytes.extend_from_slice(&0u32.to_le_bytes());

    let mut cur = Cursor::new(bytes);
    let asset = EnvironmentAsset::from_reader(&mut cur).expect("should parse minimal mapgeo");

    assert_eq!(asset.meshes().len(), 1);
    assert_eq!(asset.vertex_buffers().len(), 1);
    assert_eq!(asset.index_buffers().len(), 1);
    assert_eq!(asset.scene_graphs().len(), 1);
    assert_eq!(asset.planar_reflectors().len(), 0);
}

fn write_sized_string(buf: &mut Vec<u8>, s: &str) {
    buf.extend_from_slice(&(s.len() as u32).to_le_bytes());
    buf.extend_from_slice(s.as_bytes());
}

fn write_channel(buf: &mut Vec<u8>) {
    // EnvironmentAssetChannel::read:
    // string + vec2 scale + vec2 offset
    write_sized_string(buf, "");
    buf.extend_from_slice(&1.0f32.to_le_bytes());
    buf.extend_from_slice(&1.0f32.to_le_bytes());
    buf.extend_from_slice(&0.0f32.to_le_bytes());
    buf.extend_from_slice(&0.0f32.to_le_bytes());
}
