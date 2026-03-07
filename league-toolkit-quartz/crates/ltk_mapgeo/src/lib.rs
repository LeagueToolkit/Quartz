//! Map Geometry (.mapgeo) parsing for League of Legends environment assets.
//!
//! This crate provides parsing for the `.mapgeo` file format, which contains
//! 3D geometry data for League of Legends maps (Summoner's Rift, ARAM, etc.).
//!
//! # Overview
//!
//! A `.mapgeo` file contains:
//! - **Environment Meshes**: Renderable geometry with materials
//! - **Vertex/Index Buffers**: Shared GPU buffer data
//! - **Bucketed Geometry**: Spatial acceleration structure for queries
//! - **Planar Reflectors**: Reflection plane definitions
//!
//! # Example
//!
//! ```ignore
//! use ltk_mapgeo::EnvironmentAsset;
//! use std::fs::File;
//!
//! let mut file = File::open("base.mapgeo")?;
//! let asset = EnvironmentAsset::from_reader(&mut file)?;
//!
//! println!("Meshes: {}", asset.meshes().len());
//! println!("Scene graphs: {}", asset.scene_graphs().len());
//! ```

mod error;
pub use error::*;

mod visibility;
pub use visibility::*;

mod channel;
pub use channel::*;

mod shader_override;
pub use shader_override::*;

mod submesh;
pub use submesh::*;

mod mesh;
pub use mesh::{sampler, EnvironmentMesh, ResolvedDiffuseTexture};

mod reflector;
pub use reflector::*;

pub mod scene_graph;
pub use scene_graph::{BucketGridConfig, BucketedGeometry, BuildError, GeometryBucket};

mod asset;
pub use asset::*;

pub(crate) mod read;

/// Magic bytes for Map Geometry files: "OEGM"
pub const MAGIC: &[u8; 4] = b"OEGM";

/// Supported file format versions
pub const SUPPORTED_VERSIONS: &[u32] = &[5, 6, 7, 9, 11, 12, 13, 14, 15, 17];

/// Result type alias for this crate
pub type Result<T> = std::result::Result<T, ParseError>;
