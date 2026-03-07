//! Spatial scene graph structures for environment assets.
//!
//! The scene graph provides spatial partitioning via bucketed geometry,
//! enabling efficient visibility queries, culling, and collision detection.

mod bucket;
mod bucketed_geometry;
mod build;

pub use bucket::*;
pub use bucketed_geometry::*;
pub use build::{BucketGridConfig, BuildError};
