//! Export module for creating distributable mod packages
//!
//! This module uses ltk_fantome and ltk_modpkg for league-mod compatible exports:
//! - `.fantome` format (legacy, widely supported) via ltk_fantome
//! - `.modpkg` format (modern format) via ltk_modpkg

// Re-export from ltk crates for convenience
#[allow(unused_imports)]
pub use ltk_fantome::{pack_to_fantome, FantomeInfo, create_file_name, FantomeExtractor};
#[allow(unused_imports)]
pub use ltk_modpkg::builder::ModpkgBuilder;

/// Generate a default filename for the fantome package
/// (Convenience wrapper around ltk_fantome)
pub fn generate_fantome_filename(name: &str, version: &str) -> String {
    let slug = name
        .chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    format!("{}_{}.fantome", slug, version)
}
