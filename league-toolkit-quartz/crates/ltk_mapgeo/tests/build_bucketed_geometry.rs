use glam::Vec3;
use ltk_mapgeo::{BucketGridConfig, BucketedGeometry, BuildError, EnvironmentVisibility};

// ── Empty input ──────────────────────────────────────────────────────

#[test]
fn empty_input_returns_disabled() {
    let config = BucketGridConfig {
        buckets_per_side: 4,
        visibility_controller_path_hash: 0xDEAD,
    };
    let result = BucketedGeometry::build(&config, &[], &[], None).unwrap();

    assert!(result.is_disabled());
    assert!(result.vertices().is_empty());
    assert!(result.indices().is_empty());
    assert!(result.buckets().is_empty());
    assert!(result.face_visibility_flags().is_none());
}

#[test]
fn empty_indices_with_vertices_returns_disabled() {
    let config = BucketGridConfig {
        buckets_per_side: 4,
        visibility_controller_path_hash: 0,
    };
    let vertices = vec![Vec3::ZERO, Vec3::ONE];
    let result = BucketedGeometry::build(&config, &vertices, &[], None).unwrap();

    assert!(result.is_disabled());
}

// ── Validation errors ────────────────────────────────────────────────

#[test]
fn zero_buckets_per_side() {
    let config = BucketGridConfig {
        buckets_per_side: 0,
        visibility_controller_path_hash: 0,
    };
    let vertices = vec![Vec3::ZERO; 3];
    let indices = vec![0, 1, 2];

    let err = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap_err();
    assert!(matches!(err, BuildError::ZeroBucketsPerSide));
}

#[test]
fn invalid_index_count_not_multiple_of_3() {
    let config = BucketGridConfig {
        buckets_per_side: 4,
        visibility_controller_path_hash: 0,
    };
    let vertices = vec![Vec3::ZERO; 4];
    let indices = vec![0, 1];

    let err = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap_err();
    assert!(matches!(err, BuildError::InvalidIndexCount(2)));
}

#[test]
fn index_out_of_bounds() {
    let config = BucketGridConfig {
        buckets_per_side: 4,
        visibility_controller_path_hash: 0,
    };
    let vertices = vec![Vec3::ZERO; 3];
    let indices = vec![0, 1, 5];

    let err = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap_err();
    assert!(matches!(
        err,
        BuildError::IndexOutOfBounds {
            index: 5,
            vertex_count: 3
        }
    ));
}

#[test]
fn visibility_flags_length_mismatch() {
    let config = BucketGridConfig {
        buckets_per_side: 4,
        visibility_controller_path_hash: 0,
    };
    let vertices = vec![
        Vec3::new(0.0, 0.0, 0.0),
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, 0.0, 1.0),
    ];
    let indices = vec![0, 1, 2];
    let flags = vec![EnvironmentVisibility::ALL_LAYERS; 2];

    let err = BucketedGeometry::build(&config, &vertices, &indices, Some(&flags)).unwrap_err();
    assert!(matches!(
        err,
        BuildError::VisibilityFlagsMismatch {
            got: 2,
            expected: 1
        }
    ));
}

// ── Single triangle fully inside one bucket ──────────────────────────

#[test]
fn single_triangle_inside_one_bucket() {
    // 2x2 grid. Two triangles establish AABB ≈ [0.2, 1.8] × [0.2, 1.8].
    // bucket_size ≈ 0.8, so bucket (0,0) spans ~[0.2, 1.0] and bucket (1,1) spans ~[1.0, 1.8].
    // Both triangles fit entirely inside their respective buckets.
    let config = BucketGridConfig {
        buckets_per_side: 2,
        visibility_controller_path_hash: 0xDEAD,
    };
    let vertices = vec![
        // Triangle in bucket (0, 0)
        Vec3::new(0.2, 0.0, 0.2),
        Vec3::new(0.8, 0.0, 0.2),
        Vec3::new(0.5, 0.0, 0.8),
        // Triangle in bucket (1, 1) — also establishes grid extent
        Vec3::new(1.2, 0.0, 1.2),
        Vec3::new(1.8, 0.0, 1.2),
        Vec3::new(1.5, 0.0, 1.8),
    ];
    let indices = vec![0, 1, 2, 3, 4, 5];

    let bg = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap();

    assert!(!bg.is_disabled());
    assert_eq!(bg.buckets_per_side(), 2);
    assert_eq!(bg.vertices().len(), 6);
    assert_eq!(bg.indices().len(), 6);

    // Bucket (0, 0) should have the triangle as inside
    let b00 = bg.bucket_at(0, 0).unwrap();
    assert_eq!(b00.inside_face_count(), 1);
    assert_eq!(b00.sticking_out_face_count(), 0);
    assert_eq!(b00.max_stick_out_x(), 0.0);
    assert_eq!(b00.max_stick_out_z(), 0.0);

    // Bucket (1, 1) should have the anchor triangle as inside
    let b11 = bg.bucket_at(1, 1).unwrap();
    assert_eq!(b11.inside_face_count(), 1);
    assert_eq!(b11.sticking_out_face_count(), 0);

    // Other buckets should be empty
    assert_eq!(bg.bucket_at(1, 0).unwrap().total_face_count(), 0);
    assert_eq!(bg.bucket_at(0, 1).unwrap().total_face_count(), 0);
}

// ── Triangle spanning bucket boundary ────────────────────────────────

#[test]
fn triangle_spanning_bucket_boundary() {
    // 2x2 grid. Test triangle's centroid is in bucket (0,0) but a vertex extends
    // past the bucket boundary. Anchor triangle in bucket (1,1).
    let config = BucketGridConfig {
        buckets_per_side: 2,
        visibility_controller_path_hash: 0,
    };
    let vertices = vec![
        // Test triangle — centroid X ≈ 0.73, centroid Z ≈ 0.3 → bucket (0, 0)
        // but vertex at x=1.5 extends into bucket (1, 0)
        Vec3::new(0.2, 0.0, 0.2),
        Vec3::new(1.5, 0.0, 0.2),
        Vec3::new(0.5, 0.0, 0.5),
        // Anchor triangle in bucket (1, 1)
        Vec3::new(1.2, 0.0, 1.2),
        Vec3::new(1.8, 0.0, 1.2),
        Vec3::new(1.5, 0.0, 1.8),
    ];
    let indices = vec![0, 1, 2, 3, 4, 5];

    let bg = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap();

    let bucket = bg.bucket_at(0, 0).unwrap();
    assert_eq!(bucket.inside_face_count(), 0);
    assert_eq!(bucket.sticking_out_face_count(), 1);

    // Vertex at x=1.5 extends past the bucket boundary
    assert!(bucket.max_stick_out_x() > 0.0);

    // Global max stick out should match
    assert!(bg.max_stick_out().x > 0.0);
}

// ── Multiple buckets ─────────────────────────────────────────────────

#[test]
fn multiple_buckets_centroid_assignment() {
    // 2x2 grid with 4 triangles, one per bucket.
    // The triangles themselves establish the grid extent.
    let config = BucketGridConfig {
        buckets_per_side: 2,
        visibility_controller_path_hash: 0,
    };

    let vertices = vec![
        // T0 in bucket (0, 0): centroid ≈ (0.5, 0.4)
        Vec3::new(0.2, 0.0, 0.2),
        Vec3::new(0.8, 0.0, 0.2),
        Vec3::new(0.5, 0.0, 0.8),
        // T1 in bucket (1, 0): centroid ≈ (1.5, 0.4)
        Vec3::new(1.2, 0.0, 0.2),
        Vec3::new(1.8, 0.0, 0.2),
        Vec3::new(1.5, 0.0, 0.8),
        // T2 in bucket (0, 1): centroid ≈ (0.5, 1.4)
        Vec3::new(0.2, 0.0, 1.2),
        Vec3::new(0.8, 0.0, 1.2),
        Vec3::new(0.5, 0.0, 1.8),
        // T3 in bucket (1, 1): centroid ≈ (1.5, 1.4)
        Vec3::new(1.2, 0.0, 1.2),
        Vec3::new(1.8, 0.0, 1.2),
        Vec3::new(1.5, 0.0, 1.8),
    ];
    let indices = vec![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    let bg = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap();

    assert_eq!(bg.bucket_at(0, 0).unwrap().total_face_count(), 1);
    assert_eq!(bg.bucket_at(1, 0).unwrap().total_face_count(), 1);
    assert_eq!(bg.bucket_at(0, 1).unwrap().total_face_count(), 1);
    assert_eq!(bg.bucket_at(1, 1).unwrap().total_face_count(), 1);

    // All 4 should be inside (no sticking out)
    for z in 0..2 {
        for x in 0..2 {
            let b = bg.bucket_at(x, z).unwrap();
            assert_eq!(b.inside_face_count(), 1, "bucket ({x}, {z})");
            assert_eq!(b.sticking_out_face_count(), 0, "bucket ({x}, {z})");
        }
    }
}

// ── Round-trip consistency with world_to_bucket ──────────────────────

#[test]
fn round_trip_world_to_bucket() {
    // 2x2 grid. Triangle in bucket (0,0) and anchor in bucket (1,1).
    // Query the centroid of the first triangle.
    let config = BucketGridConfig {
        buckets_per_side: 2,
        visibility_controller_path_hash: 0,
    };

    let vertices = vec![
        // Triangle in bucket (0, 0)
        Vec3::new(0.2, 0.0, 0.2),
        Vec3::new(0.8, 0.0, 0.2),
        Vec3::new(0.5, 0.0, 0.8),
        // Anchor in bucket (1, 1)
        Vec3::new(1.2, 0.0, 1.2),
        Vec3::new(1.8, 0.0, 1.2),
        Vec3::new(1.5, 0.0, 1.8),
    ];
    let indices = vec![0, 1, 2, 3, 4, 5];

    let bg = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap();

    // Query centroid of the first triangle: (0.5, 0.4)
    let (bx, bz) = bg.world_to_bucket(0.5, 0.4).unwrap();
    assert_eq!(bx, 0);
    assert_eq!(bz, 0);
    assert_eq!(bg.bucket_at(bx, bz).unwrap().total_face_count(), 1);

    // Query centroid of the second triangle: (1.5, 1.4)
    let (bx, bz) = bg.world_to_bucket(1.5, 1.4).unwrap();
    assert_eq!(bx, 1);
    assert_eq!(bz, 1);
    assert_eq!(bg.bucket_at(bx, bz).unwrap().total_face_count(), 1);
}

// ── Face visibility flags reordering ─────────────────────────────────

#[test]
fn face_visibility_flags_reordered_during_packing() {
    // 2x2 grid. Two triangles in the same bucket (0,0):
    // Face 0 = sticking out, Face 1 = inside.
    // After sorting, inside comes first → flags reordered to [LAYER_1, LAYER_0, LAYER_2].
    let config = BucketGridConfig {
        buckets_per_side: 2,
        visibility_controller_path_hash: 0,
    };

    let vertices = vec![
        // Face 0 (sticking out of bucket (0,0)): centroid ≈ (0.73, 0.3)
        Vec3::new(0.2, 0.0, 0.2),
        Vec3::new(1.5, 0.0, 0.2), // extends past bucket boundary
        Vec3::new(0.5, 0.0, 0.5),
        // Face 1 (inside bucket (0,0)): centroid ≈ (0.5, 0.43)
        Vec3::new(0.3, 0.0, 0.3),
        Vec3::new(0.7, 0.0, 0.3),
        Vec3::new(0.5, 0.0, 0.7),
        // Face 2 (anchor in bucket (1,1)): inside
        Vec3::new(1.2, 0.0, 1.2),
        Vec3::new(1.8, 0.0, 1.2),
        Vec3::new(1.5, 0.0, 1.8),
    ];
    let indices = vec![0, 1, 2, 3, 4, 5, 6, 7, 8];

    let flag_a = EnvironmentVisibility::LAYER_0;
    let flag_b = EnvironmentVisibility::LAYER_1;
    let flag_c = EnvironmentVisibility::LAYER_2;
    let flags = vec![flag_a, flag_b, flag_c];

    let bg = BucketedGeometry::build(&config, &vertices, &indices, Some(&flags)).unwrap();

    let result_flags = bg.face_visibility_flags().unwrap();
    assert_eq!(result_flags.len(), 3);

    // Bucket (0,0) faces: inside (face 1) first, then sticking out (face 0)
    // Bucket (1,1) face: face 2
    // Row-major order: (0,0), (1,0), (0,1), (1,1)
    assert_eq!(result_flags[0], flag_b); // face 1 (inside) → LAYER_1
    assert_eq!(result_flags[1], flag_a); // face 0 (sticking out) → LAYER_0
    assert_eq!(result_flags[2], flag_c); // face 2 (anchor) → LAYER_2
}

#[test]
fn face_visibility_flags_none_when_not_provided() {
    let config = BucketGridConfig {
        buckets_per_side: 1,
        visibility_controller_path_hash: 0,
    };
    let vertices = vec![
        Vec3::new(0.1, 0.0, 0.1),
        Vec3::new(0.9, 0.0, 0.1),
        Vec3::new(0.5, 0.0, 0.9),
    ];
    let indices = vec![0, 1, 2];

    let bg = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap();
    assert!(bg.face_visibility_flags().is_none());
}

// ── Determinism ──────────────────────────────────────────────────────

#[test]
fn deterministic_output() {
    let config = BucketGridConfig {
        buckets_per_side: 4,
        visibility_controller_path_hash: 0xDEAD,
    };
    let vertices = vec![
        Vec3::new(0.1, 0.0, 0.1),
        Vec3::new(0.9, 0.0, 0.1),
        Vec3::new(0.5, 0.0, 0.9),
        Vec3::new(2.1, 5.0, 2.1),
        Vec3::new(2.9, 5.0, 2.1),
        Vec3::new(2.5, 5.0, 2.9),
    ];
    let indices = vec![0, 1, 2, 3, 4, 5];

    let bg1 = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap();
    let bg2 = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap();

    assert_eq!(bg1.vertices().len(), bg2.vertices().len());
    assert_eq!(bg1.indices().len(), bg2.indices().len());
    assert_eq!(bg1.buckets().len(), bg2.buckets().len());

    for (v1, v2) in bg1.vertices().iter().zip(bg2.vertices()) {
        assert_eq!(*v1, *v2);
    }
    for (i1, i2) in bg1.indices().iter().zip(bg2.indices()) {
        assert_eq!(*i1, *i2);
    }
    for (b1, b2) in bg1.buckets().iter().zip(bg2.buckets()) {
        assert_eq!(*b1, *b2);
    }
}

// ── Geometry buffer layout ───────────────────────────────────────────

#[test]
fn bucket_base_vertex_and_start_index_layout() {
    // 2x2 grid with triangles in bucket (0,0) and bucket (1,1).
    // Verify buffer offsets are sequential in row-major bucket order.
    let config = BucketGridConfig {
        buckets_per_side: 2,
        visibility_controller_path_hash: 0,
    };
    let vertices = vec![
        // Triangle in bucket (0, 0)
        Vec3::new(0.2, 0.0, 0.2),
        Vec3::new(0.8, 0.0, 0.2),
        Vec3::new(0.5, 0.0, 0.8),
        // Triangle in bucket (1, 1)
        Vec3::new(1.2, 0.0, 1.2),
        Vec3::new(1.8, 0.0, 1.2),
        Vec3::new(1.5, 0.0, 1.8),
    ];
    let indices = vec![0, 1, 2, 3, 4, 5];

    let bg = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap();

    // Row-major order: (0,0), (1,0), (0,1), (1,1)
    let b00 = bg.bucket_at(0, 0).unwrap();
    assert_eq!(b00.base_vertex(), 0);
    assert_eq!(b00.start_index(), 0);
    assert_eq!(b00.inside_face_count(), 1);

    // (1,0) and (0,1) are empty — their base_vertex/start_index don't matter

    let b11 = bg.bucket_at(1, 1).unwrap();
    assert_eq!(b11.base_vertex(), 3); // after first bucket's 3 vertices
    assert_eq!(b11.start_index(), 3); // after first bucket's 3 indices
    assert_eq!(b11.inside_face_count(), 1);
}

#[test]
fn indices_reference_local_vertices() {
    // With a single bucket, indices should be 0, 1, 2 (local offsets)
    let config = BucketGridConfig {
        buckets_per_side: 1,
        visibility_controller_path_hash: 0,
    };
    let vertices = vec![
        Vec3::new(0.2, 0.0, 0.2),
        Vec3::new(0.8, 0.0, 0.2),
        Vec3::new(0.5, 0.0, 0.8),
    ];
    let indices = vec![0, 1, 2];

    let bg = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap();

    assert_eq!(bg.indices(), &[0, 1, 2]);
}

// ── Shared vertices deduplication ────────────────────────────────────

#[test]
fn shared_vertices_deduplicated_within_bucket() {
    // Two triangles sharing an edge, both in the same bucket
    let config = BucketGridConfig {
        buckets_per_side: 1,
        visibility_controller_path_hash: 0,
    };
    let vertices = vec![
        Vec3::new(0.1, 0.0, 0.1),
        Vec3::new(0.5, 0.0, 0.1),
        Vec3::new(0.3, 0.0, 0.5),
        Vec3::new(0.7, 0.0, 0.5),
    ];
    // Two triangles sharing vertices 1 and 2
    let indices = vec![0, 1, 2, 1, 3, 2];

    let bg = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap();

    // Should have 4 unique vertices, not 6
    assert_eq!(bg.vertices().len(), 4);
    assert_eq!(bg.indices().len(), 6);
}

// ── Config hash propagation ──────────────────────────────────────────

#[test]
fn visibility_controller_hash_propagated() {
    let config = BucketGridConfig {
        buckets_per_side: 1,
        visibility_controller_path_hash: 0xCAFEBABE,
    };
    let vertices = vec![
        Vec3::new(0.1, 0.0, 0.1),
        Vec3::new(0.9, 0.0, 0.1),
        Vec3::new(0.5, 0.0, 0.9),
    ];
    let indices = vec![0, 1, 2];

    let bg = BucketedGeometry::build(&config, &vertices, &indices, None).unwrap();
    assert_eq!(bg.visibility_controller_path_hash(), 0xCAFEBABE);
}
