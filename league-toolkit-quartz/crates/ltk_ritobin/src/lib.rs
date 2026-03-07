//! Ritobin text format parser and writer for League Toolkit.
//!
//! This crate provides functionality to parse and write the ritobin text format,
//! which is a human-readable representation of League of Legends bin files.
//!
//! # Example
//!
//! ```rust,ignore
//! use ltk_ritobin::{parse, write};
//!
//! // Parse ritobin text
//! let text = r#"
//! #PROP_text
//! type: string = "PROP"
//! version: u32 = 3
//! "#;
//!
//! let file = parse(text).unwrap();
//! let tree = file.to_bin_tree();
//!
//! // Write back to text
//! let output = write(&tree).unwrap();
//! ```
//!
//! # Error Reporting
//!
//! Parse errors include span information compatible with [`miette`] for rich
//! error reporting with source highlighting:
//!
//! ```rust,ignore
//! use ltk_ritobin::parse;
//! use miette::Report;
//!
//! let text = "test: badtype = 42";
//! match parse(text) {
//!     Ok(file) => { /* ... */ }
//!     Err(e) => {
//!         // Print with miette formatting
//!         eprintln!("{:?}", Report::new(e));
//!     }
//! }
//! ```

// Nom-style parsers use elided lifetimes extensively
#![allow(mismatched_lifetime_syntaxes)]

pub mod error;
pub mod hashes;
pub mod parser;
pub mod types;
pub mod writer;

pub use error::*;
pub use hashes::*;
pub use parser::{parse, parse_to_bin_tree, RitobinFile};
pub use types::*;
pub use writer::*;
