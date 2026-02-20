//! Tauri commands for export operations
//!
//! These commands expose export and repathing functionality to the frontend.
//! Uses ltk_fantome for league-mod compatible .fantome export.

use crate::core::export::generate_fantome_filename;
use crate::core::repath::{organize_project, OrganizerConfig};
use ltk_fantome::pack_to_fantome;
use ltk_mod_project::{ModProject, ModProjectAuthor};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::path::{Path, PathBuf};
use tauri::Emitter;

/// Metadata for export operations (received from frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportMetadata {
    pub name: String,
    pub author: String,
    pub version: String,
    pub description: String,
}

/// Result of export operation (sent to frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub success: bool,
    pub output_path: String,
    pub file_count: usize,
    pub total_size: u64,
    pub message: String,
}

/// Result of repath operation (sent to frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepathResultDto {
    pub success: bool,
    pub bins_processed: usize,
    pub paths_modified: usize,
    pub files_relocated: usize,
    pub missing_paths: Vec<String>,
    pub message: String,
}

/// Repath a project's assets with a unique prefix
///
/// This modifies BIN file paths and relocates asset files to prevent conflicts.
///
/// # Arguments
/// * `project_path` - Path to the project directory
/// * `creator_name` - Creator name for prefix (e.g., "SirDexal")
/// * `project_name` - Project name for prefix (e.g., "MyMod")
#[tauri::command]
pub async fn repath_project_cmd(
    project_path: String,
    creator_name: Option<String>,
    project_name: Option<String>,
    app: tauri::AppHandle,
) -> Result<RepathResultDto, String> {
    tracing::info!("Frontend requested repathing for: {}", project_path);

    let path = PathBuf::from(&project_path);
    let content_base = path.join("content").join("base");
    
    let creator = creator_name.unwrap_or_else(|| "bum".to_string());
    let project = project_name.unwrap_or_else(|| "mod".to_string());

    // Emit start event
    let _ = app.emit("repath-progress", serde_json::json!({
        "status": "starting",
        "message": "Starting repathing..."
    }));

    let config = OrganizerConfig {
        enable_concat: true,
        enable_repath: true,
        creator_name: creator.clone(),
        project_name: project.clone(),
        champion: String::new(), // Champion not provided in direct repath call
        target_skin_id: 0,
        cleanup_unused: true,
    };

    let result = tokio::task::spawn_blocking(move || {
        // Empty mappings since this is a manual repath, not from extraction
        let path_mappings: HashMap<String, String> = HashMap::new();
        organize_project(&content_base, &config, &path_mappings)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    match result {
        Ok(result) => {
            let repath_res = result.repath_result.as_ref();
            let bins_processed = repath_res.map(|r| r.bins_processed).unwrap_or(0);
            let paths_modified = repath_res.map(|r| r.paths_modified).unwrap_or(0);
            let files_relocated = repath_res.map(|r| r.files_relocated).unwrap_or(0);
            let missing_paths = repath_res.map(|r| r.missing_paths.clone()).unwrap_or_default();

            let _ = app.emit("repath-progress", serde_json::json!({
                "status": "complete",
                "message": format!("Repathed {} paths in {} BIN files", paths_modified, bins_processed)
            }));

            Ok(RepathResultDto {
                success: true,
                bins_processed,
                paths_modified,
                files_relocated,
                missing_paths,
                message: format!(
                    "Successfully repathed {} paths in {} BIN files",
                    paths_modified, bins_processed
                ),
            })
        }
        Err(e) => {
            let _ = app.emit("repath-progress", serde_json::json!({
                "status": "error",
                "message": format!("Repathing failed: {}", e)
            }));

            Err(e.to_string())
        }
    }
}

/// Export a project as a .fantome mod package using ltk_fantome
///
/// # Arguments
/// * `project_path` - Path to the project directory
/// * `output_path` - Path where the .fantome file will be created
/// * `champion` - Champion name for WAD structure (unused by ltk_fantome, kept for API compat)
/// * `metadata` - Mod metadata
/// * `auto_repath` - Whether to run repathing before export (default: true)
#[tauri::command]
pub async fn export_fantome(
    project_path: String,
    output_path: String,
    champion: String,
    metadata: ExportMetadata,
    auto_repath: Option<bool>,
    app: tauri::AppHandle,
) -> Result<ExportResult, String> {
    tracing::info!(
        "Frontend requested fantome export: {} -> {}",
        project_path,
        output_path
    );

    let path = PathBuf::from(&project_path);
    let output = PathBuf::from(&output_path);
    let do_repath = auto_repath.unwrap_or(true);

    // Step 1: Repath if requested
    if do_repath {
        let _ = app.emit("export-progress", serde_json::json!({
            "status": "repathing",
            "progress": 0.2,
            "message": "Repathing assets..."
        }));

        let config = OrganizerConfig {
            enable_concat: true,
            enable_repath: true,
            creator_name: metadata.author.clone(),
            project_name: slugify(&metadata.name),
            champion: champion.clone(),
            target_skin_id: 0,
            cleanup_unused: false,
        };

        let repath_path = path.join("content").join("base");
        let repath_result = tokio::task::spawn_blocking(move || {
            let path_mappings: HashMap<String, String> = HashMap::new();
            organize_project(&repath_path, &config, &path_mappings)
        })
        .await
        .map_err(|e| format!("Repath task failed: {}", e))?;

        if let Err(e) = repath_result {
            tracing::warn!("Repathing failed (continuing anyway): {}", e);
        }
    }

    // Step 2: Export using ltk_fantome
    let _ = app.emit("export-progress", serde_json::json!({
        "status": "exporting",
        "progress": 0.5,
        "message": "Creating fantome package..."
    }));

    // Read ModProject from mod.config.json (contains author from project creation)
    let mod_config_path = path.join("mod.config.json");
    let mod_project = if mod_config_path.exists() {
        let config_data = std::fs::read_to_string(&mod_config_path)
            .map_err(|e| format!("Failed to read mod.config.json: {}", e))?;
        serde_json::from_str::<ModProject>(&config_data)
            .map_err(|e| format!("Failed to parse mod.config.json: {}", e))?
    } else {
        // Fallback: create from metadata if mod.config.json doesn't exist
        ModProject {
            name: slugify(&metadata.name),
            display_name: metadata.name.clone(),
            version: metadata.version.clone(),
            description: metadata.description.clone(),
            authors: vec![ModProjectAuthor::Name(metadata.author.clone())],
            license: None,
            transformers: vec![],
            layers: ltk_mod_project::default_layers(),
            thumbnail: None,
        }
    };

    let export_path = path.clone();
    let export_output = output.clone();

    let result = tokio::task::spawn_blocking(move || {
        export_with_ltk_fantome(&export_path, &export_output, &mod_project)
    })
    .await
    .map_err(|e| format!("Export task failed: {}", e))?;

    match result {
        Ok((file_count, total_size)) => {
            let _ = app.emit("export-progress", serde_json::json!({
                "status": "complete",
                "progress": 1.0,
                "message": format!("Export complete: {}", output.display())
            }));

            Ok(ExportResult {
                success: true,
                output_path: output.to_string_lossy().to_string(),
                file_count,
                total_size,
                message: format!(
                    "Successfully exported {} files ({} bytes)",
                    file_count, total_size
                ),
            })
        }
        Err(e) => {
            let _ = app.emit("export-progress", serde_json::json!({
                "status": "error",
                "progress": 0.0,
                "message": format!("Export failed: {}", e)
            }));

            Err(e)
        }
    }
}

/// Helper function to export using ltk_fantome::pack_to_fantome
fn export_with_ltk_fantome(
    project_path: &Path,
    output_path: &Path,
    mod_project: &ModProject,
) -> Result<(usize, u64), String> {
    // Create output file
    let file = File::create(output_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;

    // Count files before export
    let content_base = project_path.join("content").join("base");
    let file_count = walkdir::WalkDir::new(&content_base)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .count();

    // Use ltk_fantome to pack
    pack_to_fantome(file, mod_project, project_path)
        .map_err(|e| format!("ltk_fantome export failed: {}", e))?;

    // Get output file size
    let total_size = std::fs::metadata(output_path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok((file_count, total_size))
}

/// Generate a suggested filename for the fantome export
#[tauri::command]
pub fn get_fantome_filename(name: String, version: String) -> String {
    generate_fantome_filename(&name, &version)
}

/// Get export preview (list of files that would be exported)
#[tauri::command]
pub async fn get_export_preview(project_path: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&project_path);
    let content_base = path.join("content").join("base");

    if !content_base.exists() {
        return Err(format!("Content directory not found: {}", content_base.display()));
    }

    let files: Vec<String> = walkdir::WalkDir::new(&content_base)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .filter_map(|e| {
            e.path()
                .strip_prefix(&content_base)
                .ok()
                .map(|p| p.to_string_lossy().to_string())
        })
        .collect();

    Ok(files)
}

/// Export a project as a .modpkg mod package using ltk_modpkg
///
/// # Arguments
/// * `project_path` - Path to the project directory
/// * `output_path` - Path where the .modpkg file will be created
#[tauri::command]
pub async fn export_modpkg(
    project_path: String,
    output_path: String,
    app: tauri::AppHandle,
) -> Result<ExportResult, String> {
    tracing::info!(
        "Frontend requested modpkg export: {} -> {}",
        project_path,
        output_path
    );

    let path = PathBuf::from(&project_path);
    let output = PathBuf::from(&output_path);

    let _ = app.emit("export-progress", serde_json::json!({
        "status": "exporting",
        "progress": 0.3,
        "message": "Creating modpkg package..."
    }));

    // Read ModProject from mod.config.json
    let mod_config_path = path.join("mod.config.json");
    let mod_project = if mod_config_path.exists() {
        let config_data = std::fs::read_to_string(&mod_config_path)
            .map_err(|e| format!("Failed to read mod.config.json: {}", e))?;
        serde_json::from_str::<ModProject>(&config_data)
            .map_err(|e| format!("Failed to parse mod.config.json: {}", e))?
    } else {
        return Err("mod.config.json not found - cannot export modpkg without project metadata".to_string());
    };

    let export_path = path.clone();
    let export_output = output.clone();

    let result = tokio::task::spawn_blocking(move || {
        export_with_ltk_modpkg(&export_path, &export_output, &mod_project)
    })
    .await
    .map_err(|e| format!("Export task failed: {}", e))?;

    match result {
        Ok((file_count, total_size)) => {
            let _ = app.emit("export-progress", serde_json::json!({
                "status": "complete",
                "progress": 1.0,
                "message": format!("Export complete: {}", output.display())
            }));

            Ok(ExportResult {
                success: true,
                output_path: output.to_string_lossy().to_string(),
                file_count,
                total_size,
                message: format!(
                    "Successfully exported {} files ({} bytes)",
                    file_count, total_size
                ),
            })
        }
        Err(e) => {
            let _ = app.emit("export-progress", serde_json::json!({
                "status": "error",
                "progress": 0.0,
                "message": format!("Export failed: {}", e)
            }));

            Err(e)
        }
    }
}

/// Helper function to export using ltk_modpkg
fn export_with_ltk_modpkg(
    project_path: &Path,
    output_path: &Path,
    mod_project: &ModProject,
) -> Result<(usize, u64), String> {
    use ltk_modpkg::builder::{ModpkgBuilder, ModpkgChunkBuilder, ModpkgLayerBuilder};
    use ltk_modpkg::{ModpkgMetadata, ModpkgAuthor};
    use std::io::Write;

    // Collect all files and their data
    let content_base = project_path.join("content").join("base");
    let mut file_map: HashMap<String, Vec<u8>> = HashMap::new();
    
    for entry in walkdir::WalkDir::new(&content_base)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
    {
        let file_path = entry.path();
        let relative_path = file_path
            .strip_prefix(&content_base)
            .map_err(|e| format!("Failed to get relative path: {}", e))?;
        
        let file_data = std::fs::read(file_path)
            .map_err(|e| format!("Failed to read file {}: {}", file_path.display(), e))?;
        
        // Normalize path separators and lowercase (modpkg builder lowercases paths internally)
        let normalized_path = relative_path.to_string_lossy().replace("\\", "/").to_lowercase();
        file_map.insert(normalized_path, file_data);
    }

    let file_count = file_map.len();

    // Parse version from string to semver::Version
    let version = semver::Version::parse(&mod_project.version)
        .unwrap_or_else(|_| semver::Version::new(1, 0, 0));

    // Create metadata with correct field types
    let metadata = ModpkgMetadata {
        name: mod_project.name.clone(),
        display_name: mod_project.display_name.clone(),
        version,
        description: if mod_project.description.is_empty() {
            None
        } else {
            Some(mod_project.description.clone())
        },
        authors: mod_project.authors.iter().map(|author| {
            match author {
                ltk_mod_project::ModProjectAuthor::Name(name) => ModpkgAuthor::new(name.clone(), None),
                ltk_mod_project::ModProjectAuthor::Role { name, role } => ModpkgAuthor::new(name.clone(), Some(role.clone())),
            }
        }).collect(),
        ..Default::default()
    };

    // Build the modpkg - add base layer and chunks
    let mut builder = ModpkgBuilder::default()
        .with_metadata(metadata)
        .map_err(|e| format!("Failed to set metadata: {}", e))?
        .with_layer(ModpkgLayerBuilder::base());

    // Add all files as chunks
    for path in file_map.keys() {
        let chunk = ModpkgChunkBuilder::new()
            .with_path(path)
            .map_err(|e| format!("Failed to set chunk path: {}", e))?
            .with_layer("base");
        builder = builder.with_chunk(chunk);
    }

    // Create output file
    let mut output_file = File::create(output_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;

    // Build to writer with data provider closure
    builder.build_to_writer(&mut output_file, |chunk_builder, cursor| {
        if let Some(data) = file_map.get(&chunk_builder.path) {
            cursor.write_all(data)?;
        }
        Ok(())
    })
    .map_err(|e| format!("Failed to build modpkg: {}", e))?;

    // Get output file size
    let total_size = std::fs::metadata(output_path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok((file_count, total_size))
}

/// Simple slugify function
fn slugify(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}
