//! Multi-bin resident VFX porting session.
//!
//! A skin's data is split across sibling bins: the main skin bin plus every
//! bin its `linked` list resolves to on disk. [`session`] holds them ALL
//! resident together (never merged) in a registry mirroring `paint::session`;
//! [`resolve`] gathers the linked graph from the project folder
//! case-insensitively; [`path`] addresses nodes across bins; [`schema`]
//! carries the FNV1a-32 hash vocabulary; [`project`] flattens the bin set into
//! the Port UI model; [`construct`] builds new `BinValue` subtrees; and
//! [`ops`] layers the porting edits on top. Save writes ONLY dirty bins, each
//! back to its own original file.

pub mod anm;
pub mod construct;
pub mod ops;
pub mod path;
pub mod project;
pub mod resolve;
pub mod schema;
pub mod session;
