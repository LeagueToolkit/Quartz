//! Integration test: parse real brawl.mapgeo and print summary for validation

use std::fs::File;
use std::io::BufReader;

use ltk_mapgeo::EnvironmentAsset;

#[test]
fn parse_brawl_mapgeo() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/maps/brawl.mapgeo");
    let file = File::open(path).expect("failed to open brawl.mapgeo");
    let mut reader = BufReader::new(file);

    let asset = EnvironmentAsset::from_reader(&mut reader).expect("failed to parse brawl.mapgeo");

    // Print summary
    println!("\n========== BRAWL.MAPGEO SUMMARY ==========");
    println!(
        "Shader texture overrides: {}",
        asset.shader_texture_overrides().len()
    );
    for (i, sto) in asset.shader_texture_overrides().iter().enumerate() {
        println!(
            "  [{}] sampler={} texture=\"{}\"",
            i,
            sto.sampler_index(),
            sto.texture_path()
        );
    }

    println!("\nVertex buffers: {}", asset.vertex_buffers().len());
    for (i, vb) in asset.vertex_buffers().iter().enumerate() {
        println!(
            "  [{}] vertices={} stride={} elements={:?}",
            i,
            vb.count(),
            vb.stride(),
            vb.description()
                .elements()
                .iter()
                .map(|e| format!("{:?}", e.name))
                .collect::<Vec<_>>()
        );
    }

    println!("\nIndex buffers: {}", asset.index_buffers().len());
    for (i, ib) in asset.index_buffers().iter().enumerate() {
        println!("  [{}] indices={}", i, ib.count());
    }

    println!("\nMeshes: {}", asset.meshes().len());
    for (i, mesh) in asset.meshes().iter().take(20).enumerate() {
        println!(
            "  [{}] name=\"{}\" verts={} indices={} submeshes={} vb_ids={:?} ib_id={} texture_overrides={:?}",
            i,
            mesh.name(),
            mesh.vertex_count(),
            mesh.index_count(),
            mesh.submeshes().len(),
            mesh.vertex_buffer_ids(),
            mesh.index_buffer_id(),
            mesh.texture_overrides()
        );
        for (j, sm) in mesh.submeshes().iter().enumerate() {
            println!(
                "       submesh[{}]: material=\"{}\" start={} count={} verts=[{}..{}]",
                j,
                sm.material(),
                sm.start_index(),
                sm.index_count(),
                sm.min_vertex(),
                sm.max_vertex()
            );
        }
    }
    if asset.meshes().len() > 20 {
        println!("  ... and {} more meshes", asset.meshes().len() - 20);
    }

    println!("\nScene graphs: {}", asset.scene_graphs().len());
    for (i, sg) in asset.scene_graphs().iter().enumerate() {
        println!(
            "  [{}] buckets_per_side={} bucket_count={} vertices={} indices={} disabled={}",
            i,
            sg.buckets_per_side(),
            sg.buckets().len(),
            sg.vertices().len(),
            sg.indices().len(),
            sg.is_disabled()
        );
    }

    println!("\nPlanar reflectors: {}", asset.planar_reflectors().len());
    for (i, pr) in asset.planar_reflectors().iter().enumerate() {
        let n = pr.normal();
        println!("  [{}] normal=({:.3}, {:.3}, {:.3})", i, n.x, n.y, n.z);
    }

    println!("==========================================\n");

    // Basic sanity checks
    assert!(!asset.meshes().is_empty(), "expected at least one mesh");
    assert!(
        !asset.vertex_buffers().is_empty(),
        "expected at least one vertex buffer"
    );
    assert!(
        !asset.index_buffers().is_empty(),
        "expected at least one index buffer"
    );
    assert!(
        !asset.scene_graphs().is_empty(),
        "expected at least one scene graph"
    );
}
