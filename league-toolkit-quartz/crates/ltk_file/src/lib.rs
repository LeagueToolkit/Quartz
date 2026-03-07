//! Utility module for identifying/working with League of Legends file types.
//!
//! See [`LeagueFileKind`] for more information.
mod kind;
mod pattern;

pub use kind::*;
pub use pattern::MAX_MAGIC_SIZE;
