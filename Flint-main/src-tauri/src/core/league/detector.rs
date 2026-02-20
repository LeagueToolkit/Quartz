//! League of Legends installation detection
//!
//! This module provides functionality to automatically detect and validate
//! League of Legends installations. Uses ltk_mod_core for detection.

use crate::error::{Error, Result};
use ltk_mod_core::{auto_detect_league_path, is_valid_league_path};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Files that should exist in a valid League installation
const REQUIRED_FILES: &[&str] = &[
    "LeagueClient.exe",
];

/// Directories that should exist in a valid League installation
const REQUIRED_DIRS: &[&str] = &[
    "Game",
];

/// Represents a detected League of Legends installation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeagueInstallation {
    /// Path to the League of Legends installation directory
    pub path: PathBuf,
    /// Path to the Game directory
    pub game_path: PathBuf,
    /// Whether this was detected automatically or set manually
    pub auto_detected: bool,
}

impl LeagueInstallation {
    /// Creates a new LeagueInstallation from a validated path
    pub fn new(path: PathBuf, auto_detected: bool) -> Self {
        let game_path = path.join("Game");
        Self {
            path,
            game_path,
            auto_detected,
        }
    }

    /// Returns the path to the DATA directory
    #[allow(dead_code)] // Kept for API completeness
    pub fn data_path(&self) -> PathBuf {
        self.game_path.join("DATA")
    }

    /// Returns the path to the Champions directory
    #[allow(dead_code)] // Kept for API completeness
    pub fn champions_path(&self) -> PathBuf {
        self.data_path().join("FINAL").join("Champions")
    }
}

/// Attempts to detect a League of Legends installation automatically
/// using ltk_mod_core detection methods.
///
/// Detection order (via ltk_mod_core):
/// 1. RiotClientInstalls.json
/// 2. Running League processes
/// 3. Common installation paths
/// 4. Windows Registry
///
/// # Returns
/// * `Ok(LeagueInstallation)` - If a valid installation was found
/// * `Err(Error)` - If no valid installation was found
pub fn detect_league_installation() -> Result<LeagueInstallation> {
    tracing::info!("Attempting to detect League of Legends installation via ltk_mod_core");

    if let Some(exe_path) = auto_detect_league_path() {
        tracing::info!("ltk_mod_core found League at: {}", exe_path);
        
        // ltk_mod_core returns path to Game/League of Legends.exe
        // Navigate up to installation root
        if let Some(game_path) = exe_path.parent() {
            if let Some(root_path) = game_path.parent() {
                let root_buf = PathBuf::from(root_path.as_str());
                tracing::info!("League installation root: {}", root_buf.display());
                return Ok(LeagueInstallation::new(root_buf, true));
            }
        }
    }

    tracing::warn!("No League of Legends installation found via ltk_mod_core");
    Err(Error::InvalidInput(
        "Could not detect League of Legends installation. Please specify the path manually.".to_string()
    ))
}

/// Validates a manually specified League path
///
/// # Arguments
/// * `path` - The path to validate
///
/// # Returns
/// * `Ok(LeagueInstallation)` - If the path is valid
/// * `Err(Error)` - If the path is invalid
pub fn validate_league_path(path: impl AsRef<Path>) -> Result<LeagueInstallation> {
    let path = path.as_ref();
    tracing::debug!("Validating League path: {}", path.display());
    validate_and_create(path, false)
}

/// Validates a path and creates a LeagueInstallation if valid
fn validate_and_create(path: &Path, auto_detected: bool) -> Result<LeagueInstallation> {
    // Check path exists
    if !path.exists() {
        return Err(Error::InvalidInput(format!(
            "Path does not exist: {}",
            path.display()
        )));
    }

    // Check required files
    for file in REQUIRED_FILES {
        let file_path = path.join(file);
        if !file_path.exists() {
            return Err(Error::InvalidInput(format!(
                "Required file not found: {} (expected at {})",
                file,
                file_path.display()
            )));
        }
    }

    // Check required directories
    for dir in REQUIRED_DIRS {
        let dir_path = path.join(dir);
        if !dir_path.is_dir() {
            return Err(Error::InvalidInput(format!(
                "Required directory not found: {} (expected at {})",
                dir,
                dir_path.display()
            )));
        }
    }

    // Also validate with ltk_mod_core if the exe exists
    let exe_path = path.join("Game").join("League of Legends.exe");
    if exe_path.exists() {
        if let Ok(utf8_path) = camino::Utf8PathBuf::from_path_buf(exe_path) {
            if is_valid_league_path(&utf8_path) {
                tracing::debug!("ltk_mod_core validation passed");
            }
        }
    }

    tracing::debug!("League path validated successfully: {}", path.display());
    Ok(LeagueInstallation::new(path.to_path_buf(), auto_detected))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_league_installation_new() {
        let path = PathBuf::from("C:\\Riot Games\\League of Legends");
        let installation = LeagueInstallation::new(path.clone(), true);
        
        assert_eq!(installation.path, path);
        assert_eq!(installation.game_path, path.join("Game"));
        assert!(installation.auto_detected);
    }

    #[test]
    fn test_league_installation_paths() {
        let path = PathBuf::from("C:\\Riot Games\\League of Legends");
        let installation = LeagueInstallation::new(path.clone(), false);
        
        assert_eq!(installation.data_path(), path.join("Game").join("DATA"));
        assert_eq!(
            installation.champions_path(),
            path.join("Game").join("DATA").join("FINAL").join("Champions")
        );
    }

    #[test]
    fn test_validate_nonexistent_path() {
        let result = validate_league_path("/nonexistent/path/to/league");
        assert!(result.is_err());
        
        if let Err(Error::InvalidInput(msg)) = result {
            assert!(msg.contains("does not exist"));
        } else {
            panic!("Expected InvalidInput error");
        }
    }

    #[test]
    fn test_required_files_not_empty() {
        assert!(!REQUIRED_FILES.is_empty());
        assert!(REQUIRED_FILES.contains(&"LeagueClient.exe"));
    }
}
