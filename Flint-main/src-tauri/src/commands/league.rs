//! Tauri commands for League installation detection
//!
//! These commands expose league detection functionality to the frontend.

use crate::core::league::{detect_league_installation, validate_league_path, LeagueInstallation};

/// Automatically detect League of Legends installation
///
/// Searches Windows registry and common installation paths.
///
/// # Returns
/// * `Ok(LeagueInstallation)` - Detected installation info
/// * `Err(String)` - Error message if detection failed
#[tauri::command]
pub async fn detect_league() -> Result<LeagueInstallation, String> {
    tracing::info!("Frontend requested League detection");
    
    tokio::task::spawn_blocking(move || {
        detect_league_installation()
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(|e| e.to_string())
}

/// Validate a manually specified League path
///
/// # Arguments
/// * `path` - Path to validate
///
/// # Returns
/// * `Ok(LeagueInstallation)` - Validated installation info
/// * `Err(String)` - Error message if validation failed
#[tauri::command]
pub async fn validate_league(path: String) -> Result<LeagueInstallation, String> {
    tracing::info!("Frontend requested validation for path: {}", path);
    
    tokio::task::spawn_blocking(move || {
        validate_league_path(&path)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(|e| e.to_string())
}
