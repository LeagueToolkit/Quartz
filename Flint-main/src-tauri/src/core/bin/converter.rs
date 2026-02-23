//! Bin converter for converting between binary, text, and JSON formats
//!
//! This module provides functionality to convert League of Legends .bin files
//! between different formats using ltk_meta and ltk_ritobin.

use crate::core::bin::ltk_bridge::{read_bin, write_bin, tree_to_text, text_to_tree};
use crate::core::hash::Hashtable;
use crate::error::{Error, Result};
use ltk_meta::BinTree;

// Helper function to create BinConversion errors
fn bin_error(message: impl Into<String>) -> Error {
    Error::BinConversion {
        message: message.into(),
        path: None,
    }
}

/// Convert binary data to Python-like text format
///
/// # Arguments
/// * `data` - The binary data to convert
/// * `_hashtable` - Optional hashtable for resolving hash values (not yet implemented)
///
/// # Returns
/// A string containing the Python-like representation
#[allow(dead_code)] // Kept for legacy compatibility
pub fn bin_to_text_from_data(data: &[u8], _hashtable: Option<&Hashtable>) -> Result<String> {
    let tree = read_bin(data)
        .map_err(|e| bin_error(format!("Failed to parse bin: {}", e)))?;
    
    // TODO: Integrate hashtable with ltk_ritobin's HashMapProvider
    tree_to_text(&tree)
        .map_err(|e| bin_error(format!("Failed to convert to text: {}", e)))
}

/// Convert a BinTree to Python-like text format
///
/// This is for legacy compatibility - prefer using ltk_bridge::tree_to_text directly
pub fn bin_to_text(tree: &BinTree, _hashtable: Option<&Hashtable>) -> Result<String> {
    tree_to_text(tree)
        .map_err(|e| bin_error(format!("Failed to convert to text: {}", e)))
}

/// Convert Python-like text format to BinTree
///
/// # Arguments
/// * `text` - The ritobin text to parse
/// * `_hashtable` - Optional hashtable (not used in this implementation)
///
/// # Returns
/// A BinTree structure
pub fn text_to_bin(text: &str, _hashtable: Option<&Hashtable>) -> Result<BinTree> {
    text_to_tree(text)
        .map_err(|e| bin_error(format!("Failed to parse text: {}", e)))
}

/// Convert a BinTree to JSON format
///
/// Uses serde serialization of the BinTree structure
pub fn bin_to_json(tree: &BinTree, _hashtable: Option<&Hashtable>) -> Result<String> {
    serde_json::to_string_pretty(tree)
        .map_err(|e| bin_error(format!("JSON serialization failed: {}", e)))
}

/// Convert JSON format to a BinTree
///
/// Uses serde deserialization
pub fn json_to_bin(json: &str, _hashtable: Option<&Hashtable>) -> Result<BinTree> {
    serde_json::from_str(json)
        .map_err(|e| bin_error(format!("JSON parse error: {}", e)))
}

/// Read binary data and convert to BinTree
#[allow(dead_code)] // Kept for legacy compatibility
pub fn read_and_parse(data: &[u8]) -> Result<BinTree> {
    read_bin(data)
        .map_err(|e| bin_error(format!("Failed to parse bin: {}", e)))
}

/// Write BinTree to binary format
#[allow(dead_code)] // Kept for legacy compatibility
pub fn write_to_binary(tree: &BinTree) -> Result<Vec<u8>> {
    write_bin(tree)
        .map_err(|e| bin_error(format!("Failed to write bin: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_roundtrip() {
        // Create a simple BinTree
        let tree = BinTree::new(std::iter::empty::<ltk_meta::BinTreeObject>(), std::iter::empty::<String>());
        
        // Convert to JSON
        let json = bin_to_json(&tree, None).unwrap();
        
        // Convert back
        let tree2 = json_to_bin(&json, None).unwrap();
        
        assert_eq!(tree.objects.len(), tree2.objects.len());
    }
}
