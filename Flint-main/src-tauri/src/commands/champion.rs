//! Tauri commands for champion discovery
//!
//! These commands expose champion discovery functionality to the frontend.

use crate::core::champion::{
    discover_champions as core_discover_champions,
    get_champion_skins as core_get_champion_skins,
    ChampionInfo, SkinInfo,
};
use std::path::PathBuf;

/// Discover all champions in a League installation
///
/// # Arguments
/// * `league_path` - Path to League of Legends installation
///
/// # Returns
/// * `Ok(Vec<ChampionInfo>)` - List of discovered champions
/// * `Err(String)` - Error message if discovery failed
#[tauri::command]
pub async fn discover_champions(league_path: String) -> Result<Vec<ChampionInfo>, String> {
    tracing::info!("Frontend requested champion discovery for: {}", league_path);

    let path = PathBuf::from(league_path);

    tokio::task::spawn_blocking(move || core_discover_champions(&path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
        .map_err(|e| e.to_string())
}

/// Get skins for a specific champion
///
/// # Arguments
/// * `league_path` - Path to League installation
/// * `champion` - Champion internal name
///
/// # Returns
/// * `Ok(Vec<SkinInfo>)` - List of skins
/// * `Err(String)` - Error message if discovery failed
#[tauri::command]
pub async fn get_champion_skins(
    league_path: String,
    champion: String,
) -> Result<Vec<SkinInfo>, String> {
    tracing::info!("Frontend requested skins for: {}", champion);

    let path = PathBuf::from(league_path);

    tokio::task::spawn_blocking(move || core_get_champion_skins(&path, &champion))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
        .map_err(|e| e.to_string())
}

/// Search champions by name
///
/// # Arguments
/// * `champions` - List of champions to search
/// * `query` - Search query
///
/// # Returns
/// Filtered list of champions matching the query
#[tauri::command]
pub fn search_champions(champions: Vec<ChampionInfo>, query: String) -> Vec<ChampionInfo> {
    let query_lower = query.to_lowercase();
    
    champions
        .into_iter()
        .filter(|c| {
            c.name.to_lowercase().contains(&query_lower)
                || c.internal_name.to_lowercase().contains(&query_lower)
        })
        .collect()
}
