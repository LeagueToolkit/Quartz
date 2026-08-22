/* quartz-lib wraps the RitoShark league-toolkit crates. Hash downloading and BIN
parsing are ported from Flint's toolkit layer: hashes come as prebuilt LMDB from the
lmdb-hashes GitHub releases (stored under %APPDATA%/RitoShark/Requirements/Hashes),
and BINs are parsed with the `ritoshark` crate — no ritobin, no CommunityDragon
text hashes. */

pub mod anim_graph;
pub mod anim_preview;
pub mod audio;
pub mod bin;
pub mod bineditor;
pub mod bumpath;
pub mod error;
pub mod extractor;
pub mod flint_repath;
pub mod hash;
pub mod longpath;
pub mod linked_bins;
pub mod mesh;
pub mod model_bridge;
pub mod model_preview;
pub mod paint;
pub mod port_donor;
pub mod pyntex;
pub mod sco_scb;
pub mod skeleton;
pub mod skin_preview;
pub mod tex;
mod undo;
pub mod vfx_session;
pub mod vfx_tools;
pub mod wad;
pub mod wad_explorer;
pub mod wad_tools;

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
