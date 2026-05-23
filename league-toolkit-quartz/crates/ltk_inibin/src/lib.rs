//! `ltk_inibin` — Inibin (INIBIN v1/v2) parser and writer for League Toolkit.
//!
//! Handles `.inibin`, `.troybin`, and `.cfgbin` files — all share the same
//! binary format. Values are stored in typed buckets ([`InibinSet`]) grouped
//! by storage type ([`InibinFlags`]).
//!
//! # Quick start
//!
//! ```no_run
//! let data = std::fs::read("particle.troybin").unwrap();
//! let file = ltk_inibin::from_slice(&data).unwrap();
//!
//! // Look up a value by hash
//! if let Some(val) = file.get(0xDEADBEEF) {
//!     println!("{val:?}");
//! }
//!
//! // Write back to binary (v2)
//! let mut output = Vec::new();
//! ltk_inibin::write(&mut output, &file).unwrap();
//! ```

mod error;
mod reader;
mod types;
mod writer;

pub use error::InibinError;
pub use types::{InibinFile, InibinFlags, InibinSet, InibinValue};

/// Read an inibin binary from a byte slice.
pub fn from_slice(data: &[u8]) -> Result<InibinFile, InibinError> {
    reader::from_slice(data)
}

/// Write an [`InibinFile`] to binary v2 format.
pub fn write<W: std::io::Write>(w: &mut W, file: &InibinFile) -> Result<(), InibinError> {
    writer::write(w, file)
}
