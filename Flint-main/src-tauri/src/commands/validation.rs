//! Tauri commands for asset validation
//!
//! These commands expose asset validation functionality to the frontend.

use crate::core::validation::{
    extract_asset_references as core_extract_references,
    validate_assets as core_validate_assets,
    AssetReference, ValidationReport,
};
use std::collections::HashSet;

/// Extract asset references from BIN content
///
/// # Arguments
/// * `content` - BIN file content in text format
///
/// # Returns
/// * `Vec<AssetReference>` - List of found asset references
#[tauri::command]
pub fn extract_asset_references(content: String) -> Vec<AssetReference> {
    tracing::debug!("Frontend requested asset reference extraction");
    core_extract_references(&content)
}

/// Validate asset references against available hashes
///
/// # Arguments
/// * `references` - List of asset references to validate
/// * `available_hashes` - Set of hashes that exist in WAD files
/// * `source_file` - Name of source file containing references
///
/// # Returns
/// * `ValidationReport` - Validation results
#[tauri::command]
pub fn validate_assets(
    references: Vec<AssetReference>,
    available_hashes: Vec<u64>,
    source_file: String,
) -> ValidationReport {
    tracing::info!("Frontend requested validation of {} references", references.len());
    
    let hash_set: HashSet<u64> = available_hashes.into_iter().collect();
    core_validate_assets(&references, &hash_set, &source_file)
}
