/* quartz-lib wraps the RitoShark league-toolkit crates. Hash downloading and BIN
   parsing are ported from Flint's flint-ltk: hashes come as prebuilt LMDB from the
   lmdb-hashes GitHub releases (stored under %APPDATA%/RitoShark/Requirements/Hashes),
   and BINs are parsed with the `ritoshark` crate — no ritobin, no CommunityDragon
   text hashes. */

pub mod error;
pub mod hash;
pub mod bin;

// Re-export heed so callers can hold Arc<heed::Env> if needed.
pub use heed;

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    #[test]
    fn version_is_non_empty() {
        assert!(!super::version().is_empty());
    }
}
