//! Skinned & static meshes
mod r#static;

pub mod mem;

use error::ParseError;
pub use r#static::*;

pub mod error;

pub mod skinned;
pub use skinned::*;

pub type Result<T> = core::result::Result<T, ParseError>;
