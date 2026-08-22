// Bin module exports
pub mod batch_split_vfx;
pub mod bin_editor;
pub mod bin_json;
pub mod bin_trailer;
pub mod combine;
pub mod merge;
pub mod concat;
pub mod converter;
pub mod hash_extract;
pub mod jade;
pub mod noskinlite;
pub mod ritoshark_bridge;
pub mod sort_vfx;
pub mod split;

// Re-export the ritoshark-backed BIN read/write helpers from the bridge.
pub use ritoshark_bridge::{
    get_cached_bin_hashes, read_bin, reload_bin_hash_cache, text_to_tree, tree_to_text_cached,
    write_bin, MAX_BIN_SIZE,
};

// Re-export rs_bin types directly
pub use ritoshark::bin::{Bin, BinEntry, BinType, BinValue};

// Re-export converter functions
pub use converter::{bin_to_json, bin_to_text, json_to_bin, text_to_bin};

// Re-export concat utilities (used by refather)
pub use concat::{classify_bin, BinCategory};

// Re-export split utilities (right-click "Split VFX to separate BIN")
pub use split::{
    analyze_multi, classify_vfx_objects, group_by_class, organize_vfx_in_folder, separate_anm,
    split_bin, split_bin_multi, MultiAnalysis, MultiSourceInfo, OrganizeResult, SplitResult,
    VFX_CLASS_NAMES,
};

// Re-export linked-BIN merge utilities (right-click "Combine VFX/Animations/Linked")
pub use combine::{combine_anm, combine_linked, combine_vfx, CombineResult};

pub use merge::{merge_bins, MergeStats};

// Re-export BIN hash extraction (right-click "Extract hashes")
pub use hash_extract::{extract_hashes_bin, extract_hashes_bin_dir};

// Re-export NoSkinLite (right-click "NoSkinLite")
pub use noskinlite::run as noskinlite;

// Re-export batch-split-VFX (right-click "Batch Split VFX" — trigger-emitter rewrite)
pub use batch_split_vfx::{run as batch_split_vfx, BatchSplitResult};
pub use sort_vfx::{sort_vfx_systems, SortVfxReport};
