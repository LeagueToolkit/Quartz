//! Asset validation engine
//!
//! This module provides functionality to validate that assets referenced in BIN files
//! actually exist in WAD archives.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Validation report for asset references
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationReport {
    /// Total number of asset references found
    pub total_references: usize,
    /// Number of valid (existing) references
    pub valid_references: usize,
    /// List of missing assets
    pub missing_assets: Vec<MissingAsset>,
    /// Summary statistics by asset type
    pub stats_by_type: HashMap<String, AssetTypeStats>,
}

impl ValidationReport {
    /// Creates a new empty validation report
    pub fn new() -> Self {
        Self {
            total_references: 0,
            valid_references: 0,
            missing_assets: Vec::new(),
            stats_by_type: HashMap::new(),
        }
    }

    /// Returns the number of missing references
    #[allow(dead_code)]
    pub fn missing_count(&self) -> usize {
        self.missing_assets.len()
    }

    /// Returns true if all references are valid
    #[allow(dead_code)]
    pub fn is_valid(&self) -> bool {
        self.missing_assets.is_empty()
    }

    /// Returns the validation success rate as a percentage
    pub fn success_rate(&self) -> f32 {
        if self.total_references == 0 {
            100.0
        } else {
            (self.valid_references as f32 / self.total_references as f32) * 100.0
        }
    }
}

impl Default for ValidationReport {
    fn default() -> Self {
        Self::new()
    }
}

/// Statistics for a specific asset type
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AssetTypeStats {
    /// Total references of this type
    pub total: usize,
    /// Valid references of this type
    pub valid: usize,
    /// Missing references of this type
    pub missing: usize,
}

/// Represents a missing asset reference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MissingAsset {
    /// The path that was referenced
    pub path: String,
    /// Hash of the path (if available)
    pub path_hash: Option<u64>,
    /// Source file that contains this reference
    pub source_file: String,
    /// Asset type based on file extension
    pub asset_type: String,
}

impl MissingAsset {
    /// Creates a new MissingAsset
    #[allow(dead_code)]
    pub fn new(path: impl Into<String>, source_file: impl Into<String>) -> Self {
        let path_str = path.into();
        let asset_type = infer_asset_type(&path_str);
        Self {
            path: path_str,
            path_hash: None,
            source_file: source_file.into(),
            asset_type,
        }
    }
}

/// Represents an asset reference found in a file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetReference {
    /// The referenced path
    pub path: String,
    /// Hash of the path
    pub path_hash: u64,
    /// Asset type based on extension
    pub asset_type: String,
    /// Line number or offset where reference was found
    pub location: Option<usize>,
}

impl AssetReference {
    /// Creates a new AssetReference
    pub fn new(path: impl Into<String>, path_hash: u64) -> Self {
        let path_str = path.into();
        let asset_type = infer_asset_type(&path_str);
        Self {
            path: path_str,
            path_hash,
            asset_type,
            location: None,
        }
    }
}

/// Validates asset references against available WAD contents
///
/// # Arguments
/// * `references` - List of asset references to validate
/// * `available_hashes` - Set of path hashes that exist in WAD files
/// * `source_file` - Name of the source file containing references
///
/// # Returns
/// * `ValidationReport` - Report of validation results
pub fn validate_assets(
    references: &[AssetReference],
    available_hashes: &HashSet<u64>,
    source_file: &str,
) -> ValidationReport {
    tracing::debug!("Validating {} asset references from {}", references.len(), source_file);

    let mut report = ValidationReport::new();
    report.total_references = references.len();

    for reference in references {
        let is_valid = available_hashes.contains(&reference.path_hash);

        // Update stats by type
        let stats = report.stats_by_type
            .entry(reference.asset_type.clone())
            .or_default();
        stats.total += 1;

        if is_valid {
            report.valid_references += 1;
            stats.valid += 1;
        } else {
            stats.missing += 1;
            report.missing_assets.push(MissingAsset {
                path: reference.path.clone(),
                path_hash: Some(reference.path_hash),
                source_file: source_file.to_string(),
                asset_type: reference.asset_type.clone(),
            });
        }
    }

    tracing::info!(
        "Validation complete: {}/{} valid ({:.1}%)",
        report.valid_references,
        report.total_references,
        report.success_rate()
    );

    report
}

/// Extracts asset references from BIN file content (text format)
///
/// This looks for path-like strings in the BIN text format that reference
/// game assets.
///
/// # Arguments
/// * `content` - BIN file content in text format
///
/// # Returns
/// * `Vec<AssetReference>` - List of found asset references
pub fn extract_asset_references(content: &str) -> Vec<AssetReference> {
    let mut references = Vec::new();
    let mut seen_paths: HashSet<String> = HashSet::new();

    for (line_num, line) in content.lines().enumerate() {
        // Look for quoted paths
        for path in extract_paths_from_line(line) {
            if !seen_paths.contains(&path) {
                let hash = compute_path_hash(&path);
                let mut reference = AssetReference::new(path.clone(), hash);
                reference.location = Some(line_num + 1);
                references.push(reference);
                seen_paths.insert(path);
            }
        }
    }

    tracing::debug!("Extracted {} unique asset references", references.len());
    references
}

/// Extracts path-like strings from a line of text
fn extract_paths_from_line(line: &str) -> Vec<String> {
    let mut paths = Vec::new();
    
    // Look for quoted strings that look like paths
    let mut in_quote = false;
    let mut current_path = String::new();
    let chars = line.chars().peekable();

    for c in chars {
        if c == '"' {
            if in_quote {
                // End of quoted string
                if is_asset_path(&current_path) {
                    paths.push(current_path.clone());
                }
                current_path.clear();
            }
            in_quote = !in_quote;
        } else if in_quote {
            current_path.push(c);
        }
    }

    // Also look for hash references (format: path: hash "path")
    if let Some(start) = line.find("hash \"") {
        let remainder = &line[start + 6..];
        if let Some(end) = remainder.find('"') {
            let path = &remainder[..end];
            if is_asset_path(path) && !paths.contains(&path.to_string()) {
                paths.push(path.to_string());
            }
        }
    }

    paths
}

/// Checks if a string looks like an asset path
fn is_asset_path(s: &str) -> bool {
    if s.is_empty() || s.len() < 5 {
        return false;
    }

    // Check for path-like structure
    let lower = s.to_lowercase();
    
    // Must contain path separator or start with assets/
    if !s.contains('/') && !s.contains('\\') {
        return false;
    }

    // Check for known asset patterns
    let asset_patterns = [
        "assets/",
        "data/",
        "characters/",
        "particles/",
        "sfx/",
        "vo/",
        "ui/",
    ];

    for pattern in &asset_patterns {
        if lower.contains(pattern) {
            return true;
        }
    }

    // Check for known asset extensions
    let extensions = [
        ".dds", ".tex", ".png", ".jpg",
        ".skn", ".skl", ".anm",
        ".bin", ".bnk", ".wem", ".wpk",
        ".lua", ".luabin",
        ".troybin", ".inibin",
    ];

    for ext in &extensions {
        if lower.ends_with(ext) {
            return true;
        }
    }

    false
}

/// Computes the xxhash64 of a path (lowercase, forward slashes)
fn compute_path_hash(path: &str) -> u64 {
    use xxhash_rust::xxh64::xxh64;
    
    let normalized = path.to_lowercase().replace('\\', "/");
    xxh64(normalized.as_bytes(), 0)
}

/// Infers asset type from file path/extension
fn infer_asset_type(path: &str) -> String {
    let lower = path.to_lowercase();
    
    if lower.ends_with(".dds") || lower.ends_with(".tex") || lower.ends_with(".png") {
        "Texture".to_string()
    } else if lower.ends_with(".skn") {
        "Model".to_string()
    } else if lower.ends_with(".skl") {
        "Skeleton".to_string()
    } else if lower.ends_with(".anm") {
        "Animation".to_string()
    } else if lower.ends_with(".bin") || lower.ends_with(".troybin") {
        "Binary".to_string()
    } else if lower.ends_with(".bnk") || lower.ends_with(".wem") || lower.ends_with(".wpk") {
        "Audio".to_string()
    } else if lower.contains("particle") || lower.contains("/vfx/") {
        "Particle".to_string()
    } else {
        "Unknown".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validation_report_new() {
        let report = ValidationReport::new();
        assert_eq!(report.total_references, 0);
        assert_eq!(report.valid_references, 0);
        assert!(report.missing_assets.is_empty());
    }

    #[test]
    fn test_validation_report_success_rate() {
        let mut report = ValidationReport::new();
        report.total_references = 10;
        report.valid_references = 8;
        assert!((report.success_rate() - 80.0).abs() < 0.1);
    }

    #[test]
    fn test_validation_report_success_rate_empty() {
        let report = ValidationReport::new();
        assert!((report.success_rate() - 100.0).abs() < 0.1);
    }

    #[test]
    fn test_missing_asset_new() {
        let asset = MissingAsset::new(
            "ASSETS/Characters/Ahri/Skins/Base/ahri_base.dds",
            "test.bin"
        );
        assert_eq!(asset.asset_type, "Texture");
        assert!(asset.path_hash.is_none());
    }

    #[test]
    fn test_asset_reference_new() {
        let reference = AssetReference::new(
            "ASSETS/Characters/Ahri/ahri.skn",
            12345
        );
        assert_eq!(reference.asset_type, "Model");
        assert_eq!(reference.path_hash, 12345);
    }

    #[test]
    fn test_is_asset_path() {
        assert!(is_asset_path("ASSETS/Characters/Ahri/ahri.dds"));
        assert!(is_asset_path("data/particles/effect.bin"));
        assert!(is_asset_path("Characters/Ahri/Skins/Base/ahri.skn"));
        assert!(!is_asset_path(""));
        assert!(!is_asset_path("hello"));
        assert!(!is_asset_path("Ahri"));
    }

    #[test]
    fn test_infer_asset_type() {
        assert_eq!(infer_asset_type("test.dds"), "Texture");
        assert_eq!(infer_asset_type("test.skn"), "Model");
        assert_eq!(infer_asset_type("test.skl"), "Skeleton");
        assert_eq!(infer_asset_type("test.anm"), "Animation");
        assert_eq!(infer_asset_type("test.bnk"), "Audio");
        assert_eq!(infer_asset_type("test.xyz"), "Unknown");
    }

    #[test]
    fn test_extract_paths_from_line() {
        let line = r#"texture: hash "ASSETS/Characters/Ahri/Skins/Base/ahri_base.dds""#;
        let paths = extract_paths_from_line(line);
        assert_eq!(paths.len(), 1);
        assert!(paths[0].contains("ahri_base.dds"));
    }

    #[test]
    fn test_validate_assets() {
        let refs = vec![
            AssetReference::new("path/to/valid.dds", 123),
            AssetReference::new("path/to/missing.dds", 456),
        ];
        
        let mut available = HashSet::new();
        available.insert(123u64);
        
        let report = validate_assets(&refs, &available, "test.bin");
        
        assert_eq!(report.total_references, 2);
        assert_eq!(report.valid_references, 1);
        assert_eq!(report.missing_count(), 1);
        assert!(!report.is_valid());
    }
}
