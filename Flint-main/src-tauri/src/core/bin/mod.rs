// Bin module exports
pub mod ltk_bridge;
pub mod converter;
pub mod concat;

// Re-export ltk-based functions from bridge
#[allow(unused_imports)]
pub use ltk_bridge::{
    read_bin as read_bin_ltk,
    write_bin as write_bin_ltk,
    tree_to_text,
    tree_to_text_with_resolved_names,
    tree_to_text_cached,
    get_cached_bin_hashes,
    text_to_tree,
    HashMapProvider,
    MAX_BIN_SIZE,
};

// Re-export ltk_meta types directly (allow unused for external usage)
#[allow(unused_imports)]
pub use ltk_meta::{BinTree, BinTreeObject, BinProperty, BinPropertyKind, PropertyValueEnum};

// Legacy aliases for backwards compatibility with commands
pub use ltk_bridge::read_bin;
pub use ltk_bridge::write_bin;

// Re-export converter functions
pub use converter::{bin_to_text, text_to_bin, bin_to_json, json_to_bin};

// Re-export concat utilities (used by refather)
#[allow(unused_imports)]
pub use concat::{classify_bin, concatenate_linked_bins, BinCategory, ConcatResult};

