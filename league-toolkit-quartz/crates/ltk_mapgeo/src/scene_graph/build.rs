//! Building bucketed geometry from input triangles.

use std::collections::HashMap;

use glam::Vec3;

use crate::EnvironmentVisibility;

use super::bucketed_geometry::{BucketedGeometryBuilder, BucketedGeometryFlags};
use super::{BucketedGeometry, GeometryBucket};

/// Configuration for building a bucketed geometry grid.
#[derive(Debug, Clone)]
pub struct BucketGridConfig {
    /// Number of buckets per side (grid is NxN). Typical value: 128 for Summoner's Rift.
    pub buckets_per_side: u16,
    /// Hash identifying which visibility controller/scene graph this belongs to.
    pub visibility_controller_path_hash: u32,
}

/// Errors that can occur when building bucketed geometry.
#[derive(Debug, thiserror::Error)]
pub enum BuildError {
    #[error("buckets_per_side must be greater than 0")]
    ZeroBucketsPerSide,

    #[error("bucket grid size {0}x{0} overflows usize")]
    GridSizeOverflow(u16),

    #[error("index count ({0}) is not a multiple of 3")]
    InvalidIndexCount(usize),

    #[error("index {index} out of bounds for {vertex_count} vertices")]
    IndexOutOfBounds { index: u32, vertex_count: usize },

    #[error("bucket ({bucket_x}, {bucket_z}) has {count} unique vertices, exceeding u16 max")]
    BucketVertexOverflow {
        bucket_x: usize,
        bucket_z: usize,
        count: usize,
    },

    #[error("face visibility flags length ({got}) does not match face count ({expected})")]
    VisibilityFlagsMismatch { got: usize, expected: usize },
}

struct FaceAssignment {
    face_index: usize,
    vertex_indices: [u32; 3],
    is_inside: bool,
}

impl BucketedGeometry {
    /// Builds a bucketed geometry from simplified world-space triangles.
    ///
    /// # Arguments
    /// - `config` — Grid parameters (buckets_per_side, visibility hash)
    /// - `vertices` — World-space vertex positions
    /// - `indices` — Triangle indices (length must be a multiple of 3)
    /// - `face_visibility_flags` — Optional per-face visibility layer masks
    ///
    /// Returns `BucketedGeometry::empty()` if the input has no triangles.
    pub fn build(
        config: &BucketGridConfig,
        vertices: &[Vec3],
        indices: &[u32],
        face_visibility_flags: Option<&[EnvironmentVisibility]>,
    ) -> Result<BucketedGeometry, BuildError> {
        // Phase 1: Validate & compute world bounds
        if config.buckets_per_side == 0 {
            return Err(BuildError::ZeroBucketsPerSide);
        }

        let n_usize = config.buckets_per_side as usize;
        let total_buckets = n_usize
            .checked_mul(n_usize)
            .ok_or(BuildError::GridSizeOverflow(config.buckets_per_side))?;

        if !indices.len().is_multiple_of(3) {
            return Err(BuildError::InvalidIndexCount(indices.len()));
        }

        let face_count = indices.len() / 3;

        for &idx in indices {
            if idx as usize >= vertices.len() {
                return Err(BuildError::IndexOutOfBounds {
                    index: idx,
                    vertex_count: vertices.len(),
                });
            }
        }

        if let Some(flags) = face_visibility_flags {
            if flags.len() != face_count {
                return Err(BuildError::VisibilityFlagsMismatch {
                    got: flags.len(),
                    expected: face_count,
                });
            }
        }

        if face_count == 0 {
            return Ok(BucketedGeometry::empty());
        }

        // Compute AABB on XZ plane across all referenced vertices
        let mut min_x = f32::MAX;
        let mut min_z = f32::MAX;
        let mut max_x = f32::MIN;
        let mut max_z = f32::MIN;

        for &idx in indices {
            let v = vertices[idx as usize];
            min_x = min_x.min(v.x);
            min_z = min_z.min(v.z);
            max_x = max_x.max(v.x);
            max_z = max_z.max(v.z);
        }

        // Add epsilon to max bounds to prevent boundary edge cases
        const EPSILON: f32 = 1e-3;
        max_x += EPSILON;
        max_z += EPSILON;

        // Phase 2: Compute grid parameters
        let n = config.buckets_per_side as f32;
        let bucket_size_x = (max_x - min_x) / n;
        let bucket_size_z = (max_z - min_z) / n;

        // Phase 3: Assign triangles to buckets & classify
        let mut bucket_faces: Vec<Vec<FaceAssignment>> =
            (0..total_buckets).map(|_| Vec::new()).collect();

        for face_idx in 0..face_count {
            let i0 = indices[face_idx * 3];
            let i1 = indices[face_idx * 3 + 1];
            let i2 = indices[face_idx * 3 + 2];

            let v0 = vertices[i0 as usize];
            let v1 = vertices[i1 as usize];
            let v2 = vertices[i2 as usize];

            // Compute centroid on XZ
            let cx = (v0.x + v1.x + v2.x) / 3.0;
            let cz = (v0.z + v1.z + v2.z) / 3.0;

            // Map to bucket coords
            let bx = ((cx - min_x) / bucket_size_x)
                .floor()
                .clamp(0.0, (n_usize - 1) as f32) as usize;
            let bz = ((cz - min_z) / bucket_size_z)
                .floor()
                .clamp(0.0, (n_usize - 1) as f32) as usize;

            // Bucket bounds
            let bucket_min_x = min_x + bx as f32 * bucket_size_x;
            let bucket_max_x = bucket_min_x + bucket_size_x;
            let bucket_min_z = min_z + bz as f32 * bucket_size_z;
            let bucket_max_z = bucket_min_z + bucket_size_z;

            // Classify: inside if all 3 vertices fall within bucket bounds
            let is_inside = [v0, v1, v2].iter().all(|v| {
                v.x >= bucket_min_x
                    && v.x <= bucket_max_x
                    && v.z >= bucket_min_z
                    && v.z <= bucket_max_z
            });

            bucket_faces[bz * n_usize + bx].push(FaceAssignment {
                face_index: face_idx,
                vertex_indices: [i0, i1, i2],
                is_inside,
            });
        }

        // Stable-sort each bucket's face list so inside faces come first
        for faces in &mut bucket_faces {
            faces.sort_by_key(|f| !f.is_inside);
        }

        // Phase 4: Pack geometry buffers
        let mut global_vertices: Vec<Vec3> = Vec::new();
        let mut global_indices: Vec<u16> = Vec::new();
        let mut buckets: Vec<GeometryBucket> = Vec::with_capacity(total_buckets);
        let mut reordered_visibility_flags: Vec<EnvironmentVisibility> =
            if face_visibility_flags.is_some() {
                Vec::with_capacity(face_count)
            } else {
                Vec::new()
            };

        for (bucket_idx, faces) in bucket_faces.iter().enumerate() {
            if faces.is_empty() {
                buckets.push(GeometryBucket::new(0.0, 0.0, 0, 0, 0, 0));
                continue;
            }

            let base_vertex = global_vertices.len() as u32;
            let start_index = global_indices.len() as u32;

            let mut local_vertex_map: HashMap<u32, u16> = HashMap::new();
            let mut local_vertices: Vec<Vec3> = Vec::new();

            let mut inside_face_count: u16 = 0;
            let mut sticking_out_face_count: u16 = 0;

            for face in faces {
                let mut local_tri = [0u16; 3];
                for (j, &orig_idx) in face.vertex_indices.iter().enumerate() {
                    let local_idx = match local_vertex_map.get(&orig_idx) {
                        Some(&idx) => idx,
                        None => {
                            let idx = local_vertices.len();
                            if idx > u16::MAX as usize {
                                let bx = bucket_idx % n_usize;
                                let bz = bucket_idx / n_usize;
                                return Err(BuildError::BucketVertexOverflow {
                                    bucket_x: bx,
                                    bucket_z: bz,
                                    count: idx + 1,
                                });
                            }
                            let idx = idx as u16;
                            local_vertex_map.insert(orig_idx, idx);
                            local_vertices.push(vertices[orig_idx as usize]);
                            idx
                        }
                    };
                    local_tri[j] = local_idx;
                }

                global_indices.extend_from_slice(&local_tri);

                if face.is_inside {
                    inside_face_count += 1;
                } else {
                    sticking_out_face_count += 1;
                }

                if let Some(flags) = face_visibility_flags {
                    reordered_visibility_flags.push(flags[face.face_index]);
                }
            }

            global_vertices.extend_from_slice(&local_vertices);

            // Phase 5: Compute stick-out distances for this bucket
            let bx = bucket_idx % n_usize;
            let bz = bucket_idx / n_usize;
            let bucket_min_x = min_x + bx as f32 * bucket_size_x;
            let bucket_max_x = bucket_min_x + bucket_size_x;
            let bucket_min_z = min_z + bz as f32 * bucket_size_z;
            let bucket_max_z = bucket_min_z + bucket_size_z;

            let mut max_so_x: f32 = 0.0;
            let mut max_so_z: f32 = 0.0;

            for face in faces {
                if !face.is_inside {
                    for &orig_idx in &face.vertex_indices {
                        let v = vertices[orig_idx as usize];
                        let overshoot_x = if v.x < bucket_min_x {
                            bucket_min_x - v.x
                        } else if v.x > bucket_max_x {
                            v.x - bucket_max_x
                        } else {
                            0.0
                        };
                        let overshoot_z = if v.z < bucket_min_z {
                            bucket_min_z - v.z
                        } else if v.z > bucket_max_z {
                            v.z - bucket_max_z
                        } else {
                            0.0
                        };
                        max_so_x = max_so_x.max(overshoot_x);
                        max_so_z = max_so_z.max(overshoot_z);
                    }
                }
            }

            buckets.push(GeometryBucket::new(
                max_so_x,
                max_so_z,
                start_index,
                base_vertex,
                inside_face_count,
                sticking_out_face_count,
            ));
        }

        // Compute global max stick-out
        let mut global_max_stick_out_x: f32 = 0.0;
        let mut global_max_stick_out_z: f32 = 0.0;
        for bucket in &buckets {
            global_max_stick_out_x = global_max_stick_out_x.max(bucket.max_stick_out_x());
            global_max_stick_out_z = global_max_stick_out_z.max(bucket.max_stick_out_z());
        }

        // Phase 6: Assemble
        let has_visibility_flags = face_visibility_flags.is_some();

        let mut flags = BucketedGeometryFlags::empty();
        if has_visibility_flags {
            flags |= BucketedGeometryFlags::HAS_FACE_VISIBILITY_FLAGS;
        }

        let result = BucketedGeometryBuilder::default()
            .visibility_controller_path_hash(config.visibility_controller_path_hash)
            .bounds(min_x, min_z, max_x, max_z)
            .max_stick_out(global_max_stick_out_x, global_max_stick_out_z)
            .bucket_size(bucket_size_x, bucket_size_z)
            .buckets_per_side(config.buckets_per_side)
            .set_disabled(false)
            .flags(flags)
            .vertices(global_vertices)
            .indices(global_indices)
            .buckets(buckets)
            .face_visibility_flags(if has_visibility_flags {
                Some(reordered_visibility_flags)
            } else {
                None
            })
            .build();

        Ok(result)
    }
}
