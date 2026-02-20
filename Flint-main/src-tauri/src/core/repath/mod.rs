//! Repathing module for modifying asset paths in BIN files
//!
//! This module implements the "bumpath" algorithm that prefixes asset paths
//! with a unique identifier (ASSETS/{creator}/{project}) to prevent conflicts between mods.
//!
//! The module is organized as follows:
//! - `refather`: Core path modification logic
//! - `organizer`: High-level orchestrator that coordinates concat and repath operations

pub mod refather;
pub mod organizer;

#[allow(unused_imports)]
pub use refather::{repath_project, RepathConfig, RepathResult};
#[allow(unused_imports)]
pub use organizer::{organize_project, OrganizerConfig, OrganizerResult};
