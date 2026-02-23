//! Tauri commands for project management
//!
//! These commands expose project management functionality to the frontend.

use crate::core::project::{
    create_project as core_create_project,
    open_project as core_open_project,
    save_project as core_save_project,
    Project,
};
use crate::core::repath::{organize_project, OrganizerConfig};
use crate::core::bin::{classify_bin, BinCategory};
use crate::core::wad::extractor::{find_champion_wad, extract_skin_assets};
use crate::state::HashtableState;
use league_toolkit::wad::Wad;
use std::path::PathBuf;
use tauri::Emitter;

/// Create a new project
///
/// # Arguments
/// * `name` - Project name
/// * `champion` - Champion internal name
/// * `skin_id` - Skin ID
/// * `league_path` - Path to League installation
/// * `output_path` - Directory where project will be created
/// * `creator_name` - Creator name for repathing (e.g., "SirDexal")
///
/// # Returns
/// * `Ok(Project)` - The created project
/// * `Err(String)` - Error message if creation failed
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn create_project(
    name: String,
    champion: String,
    skin_id: u32,
    league_path: String,
    output_path: String,
    creator_name: Option<String>,
    hashtable_state: tauri::State<'_, HashtableState>,
    app: tauri::AppHandle,
) -> Result<Project, String> {
    tracing::info!(
        "Frontend requested project creation: {} ({} skin {})",
        name, champion, skin_id
    );

    let league_path_buf = PathBuf::from(&league_path);
    let output_path_buf = PathBuf::from(&output_path);

    // Get hashtable (lazy-loaded on first use)
    let _ = app.emit("project-create-progress", serde_json::json!({
        "phase": "init",
        "message": "Initializing..."
    }));

    let hashtable = hashtable_state.get_hashtable().ok_or_else(|| 
        "Failed to load hashtable. Please check that hash files are available.".to_string()
    )?;
    
    tracing::info!("Hashtable ready with {} entries", hashtable.len());

    // 2. Validate WAD existence before creating project
    let wad_path = find_champion_wad(&league_path_buf, &champion)
        .ok_or_else(|| format!(
            "Champion WAD not found for '{}'. Please check League installation.",
            champion
        ))?;

    // 3. Create the project directory structure
    let _ = app.emit("project-create-progress", serde_json::json!({
        "phase": "create",
        "message": "Creating project structure..."
    }));

    let name_clone = name.clone();
    let champion_clone = champion.clone();
    let league_clone = league_path_buf.clone();
    let output_clone = output_path_buf.clone();
    let creator_clone = creator_name.clone();

    let project = tokio::task::spawn_blocking(move || {
        core_create_project(&name_clone, &champion_clone, skin_id, &league_clone, &output_clone, creator_clone)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(|e| e.to_string())?;
    
    // 4. Extract skin assets into the project
    let _ = app.emit("project-create-progress", serde_json::json!({
        "phase": "extract",
        "message": format!("Extracting {} skin {} assets...", champion, skin_id)
    }));

    tracing::info!("Extracting assets for {} skin {}...", champion, skin_id);
    
    let assets_path = project.assets_path();
    let champion_for_extract = champion.clone();
    
    let extraction_result = tokio::task::spawn_blocking(move || {
        let mut wad = Wad::mount(std::fs::File::open(&wad_path)
            .map_err(|e| format!("Failed to open WAD: {}", e))?)
            .map_err(|e| format!("Failed to mount WAD: {}", e))?;
        
        extract_skin_assets(
            &mut wad,
            &assets_path,
            &champion_for_extract,
            skin_id,
            &hashtable,
        ).map_err(|e| e.to_string())
    })
    .await;
    
    let extraction_result = match extraction_result {
        Ok(Ok(result)) => {
            tracing::info!("Extracted {} assets to project", result.extracted_count);
            result
        }
        Ok(Err(e)) => {
            tracing::error!("Asset extraction failed: {}", e);
            tracing::info!("Cleaning up project directory due to failure...");
            if let Err(cleanup_err) = std::fs::remove_dir_all(&project.project_path) {
                tracing::error!("Failed to clean up project directory: {}", cleanup_err);
            }
            return Err(format!("Asset extraction failed: {}. Project creation cancelled.", e));
        }
        Err(e) => {
            tracing::error!("Extraction task panicked: {}", e);
            if let Err(cleanup_err) = std::fs::remove_dir_all(&project.project_path) {
                tracing::error!("Failed to clean up project directory: {}", cleanup_err);
            }
            return Err(format!("Internal error during extraction: {}", e));
        }
    };

    // 5. Repath assets if creator name is provided
    if let Some(creator) = creator_name {
        if !creator.is_empty() {
            let _ = app.emit("project-create-progress", serde_json::json!({
                "phase": "repath",
                "message": format!("Repathing assets to ASSETS/{}/{}...", creator, name)
            }));

            tracing::info!("Repathing assets with prefix: ASSETS/{}/{}", creator, name);

            let repath_config = OrganizerConfig {
                enable_concat: true,
                enable_repath: true,
                creator_name: creator.clone(),
                project_name: name.clone(),
                champion: champion.clone(),
                target_skin_id: skin_id,
                cleanup_unused: true,
            };

            let assets_path_for_repath = project.assets_path();
            let path_mappings = extraction_result.path_mappings.clone();
            let repath_result = tokio::task::spawn_blocking(move || {
                organize_project(&assets_path_for_repath, &repath_config, &path_mappings)
            })
            .await;

            match repath_result {
                Ok(Ok(result)) => {
                    let paths_modified = result.repath_result.as_ref().map(|r| r.paths_modified).unwrap_or(0);
                    let files_relocated = result.repath_result.as_ref().map(|r| r.files_relocated).unwrap_or(0);
                    let bins_combined = result.concat_result.as_ref().map(|r| r.source_count).unwrap_or(0);
                    tracing::info!(
                        "Project organization complete: {} paths modified, {} files relocated, {} BINs combined",
                        paths_modified,
                        files_relocated,
                        bins_combined
                    );
                }
                Ok(Err(e)) => {
                    tracing::warn!("Repathing failed (project still usable): {}", e);
                    // Don't fail the whole project creation if repathing fails
                }
                Err(e) => {
                    tracing::warn!("Repathing task panicked (project still usable): {}", e);
                }
            }
        }
    }

    let _ = app.emit("project-create-progress", serde_json::json!({
        "phase": "complete",
        "message": "Project created successfully!"
    }));

    Ok(project)
}


/// Open an existing project
///
/// # Arguments
/// * `path` - Path to the .flint project directory
///
/// # Returns
/// * `Ok(Project)` - The loaded project
/// * `Err(String)` - Error message if loading failed
#[tauri::command]
pub async fn open_project(path: String) -> Result<Project, String> {
    tracing::info!("Frontend requested opening project: {}", path);

    let path = PathBuf::from(path);

    tokio::task::spawn_blocking(move || core_open_project(&path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
        .map_err(|e| e.to_string())
}

/// Save project state
///
/// # Arguments
/// * `project` - The project to save
///
/// # Returns
/// * `Ok(())` - If save succeeded
/// * `Err(String)` - Error message if save failed
#[tauri::command]
pub async fn save_project(project: Project) -> Result<(), String> {
    tracing::info!("Frontend requested saving project: {}", project.name);

    tokio::task::spawn_blocking(move || core_save_project(&project))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
        .map_err(|e| e.to_string())
}

/// List files in a project directory
///
/// # Arguments
/// * `project_path` - Path to the project directory
///
/// # Returns
/// * `Ok(FileTree)` - The file tree structure
/// * `Err(String)` - Error message if listing failed
#[tauri::command]
pub async fn list_project_files(project_path: String) -> Result<serde_json::Value, String> {
    use std::fs;
    use serde_json::json;
    
    let path = PathBuf::from(&project_path);
    
    if !path.exists() {
        return Err(format!("Project path does not exist: {}", project_path));
    }
    
    fn build_tree(dir: &std::path::Path, base: &std::path::Path) -> serde_json::Value {
        let mut tree = serde_json::Map::new();
        
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                
                // Skip .ritobin cache files - users should only see .bin files
                if name.ends_with(".ritobin") {
                    continue;
                }
                
                let relative_path = entry_path.strip_prefix(base)
                    .unwrap_or(&entry_path)
                    .to_string_lossy()
                    .replace('\\', "/");
                
                if entry_path.is_dir() {
                    let children = build_tree(&entry_path, base);
                    tree.insert(name, json!({
                        "path": relative_path,
                        "children": children
                    }));
                } else {
                    tree.insert(name, json!({
                        "path": relative_path,
                        "size": entry.metadata().map(|m| m.len()).unwrap_or(0)
                    }));
                }
            }
        }
        
        serde_json::Value::Object(tree)
    }
    
    let tree = tokio::task::spawn_blocking(move || build_tree(&path, &path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?;
    
    Ok(tree)
}

/// Pre-convert all BIN files in a project to .ritobin format
/// This enables instant loading when the user opens BIN files later
///
/// Uses parallel processing with rayon for maximum performance.
/// BIN hashes are cached globally to avoid repeated disk I/O.
///
/// # Arguments
/// * `project_path` - Path to the project directory
/// * `app` - Tauri app handle for emitting progress events
///
/// # Returns
/// * `Ok(usize)` - Number of BIN files converted
/// * `Err(String)` - Error message if conversion failed
#[tauri::command]
pub async fn preconvert_project_bins(
    project_path: String,
    app: tauri::AppHandle,
) -> Result<usize, String> {
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use rayon::prelude::*;
    use walkdir::WalkDir;
    
    tracing::info!("Pre-converting BIN files in project: {}", project_path);
    
    let path = std::path::PathBuf::from(&project_path);
    if !path.exists() {
        return Err(format!("Project path does not exist: {}", project_path));
    }
    
    // Pre-warm the hash cache before parallel processing
    // This ensures the cache is initialized on the main thread before workers access it
    tracing::info!("Pre-warming BIN hash cache...");
    let _ = crate::core::bin::get_cached_bin_hashes();
    tracing::info!("Hash cache ready");
    
    // Find all .bin files
    let bin_files: Vec<_> = WalkDir::new(&path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension()
                .map(|ext| ext == "bin")
                .unwrap_or(false)
        })
        .filter(|e| {
            if let Ok(rel_path) = e.path().strip_prefix(&path) {
                let rel_str = rel_path.to_string_lossy();
                let category = classify_bin(&rel_str);
                
                // Skip Ignore category (corrupt/recursive names)
                if category == BinCategory::Ignore {
                    tracing::warn!("Skipping suspicious BIN file: {}", rel_str);
                    return false;
                }
                
                // Skip Animation BINs - they shouldn't be pre-converted and can have corrupt metadata
                if category == BinCategory::Animation {
                    tracing::debug!("Skipping animation BIN: {}", rel_str);
                    return false;
                }
                
                // Skip ChampionRoot BINs - these reference game data and shouldn't be converted
                if category == BinCategory::ChampionRoot {
                    tracing::debug!("Skipping champion root BIN: {}", rel_str);
                    return false;
                }
            }
            true
        })
        .map(|e| e.path().to_path_buf())
        .collect();
    
    let total = bin_files.len();
    tracing::info!("Found {} BIN files to convert", total);
    
    // Emit initial progress
    let _ = app.emit("bin-convert-progress", serde_json::json!({
        "current": 0,
        "total": total,
        "file": "",
        "status": "starting"
    }));
    
    // Filter to only files that need conversion (not already up-to-date)
    let files_to_convert: Vec<_> = bin_files.iter()
        .filter(|bin_path| {
            let ritobin_path = format!("{}.ritobin", bin_path.display());
            let ritobin_file = std::path::Path::new(&ritobin_path);
            
            if ritobin_file.exists() {
                if let (Ok(bin_meta), Ok(ritobin_meta)) = (fs::metadata(bin_path), fs::metadata(ritobin_file)) {
                    if let (Ok(bin_time), Ok(ritobin_time)) = (bin_meta.modified(), ritobin_meta.modified()) {
                        if ritobin_time >= bin_time {
                            tracing::debug!("[PRECONVERT] CACHE HIT - skipping: {}", bin_path.file_name().unwrap_or_default().to_string_lossy());
                            return false;
                        } else {
                            tracing::debug!("[PRECONVERT] CACHE STALE - will convert: {}", bin_path.file_name().unwrap_or_default().to_string_lossy());
                        }
                    }
                }
            } else {
                tracing::debug!("[PRECONVERT] NO CACHE - will convert: {}", bin_path.file_name().unwrap_or_default().to_string_lossy());
            }
            true
        })
        .cloned()
        .collect();
    
    let cache_hits = total - files_to_convert.len();
    let to_convert_count = files_to_convert.len();
    tracing::info!("[PRECONVERT] {} files need conversion, {} CACHE HITS (already up-to-date)", 
        to_convert_count, cache_hits);
    
    // Atomic counter for thread-safe progress tracking
    let converted = Arc::new(AtomicUsize::new(0));
    let failed = Arc::new(AtomicUsize::new(0));
    
    // Process in batches to control peak memory usage
    const BATCH_SIZE: usize = 50;
    
    for (batch_idx, batch) in files_to_convert.chunks(BATCH_SIZE).enumerate() {
        let batch_start = batch_idx * BATCH_SIZE;
        
        // Emit progress for batch start
        let _ = app.emit("bin-convert-progress", serde_json::json!({
            "current": batch_start,
            "total": to_convert_count,
            "file": format!("Batch {}/{}", batch_idx + 1, to_convert_count.div_ceil(BATCH_SIZE)),
            "status": "converting"
        }));
        
        // Process batch in parallel using rayon
        let converted_clone = Arc::clone(&converted);
        let failed_clone = Arc::clone(&failed);
        
        batch.par_iter().for_each(|bin_path| {
            let bin_path_str = bin_path.to_string_lossy().to_string();
            
            match convert_bin_file_sync(&bin_path_str) {
                Ok(_) => {
                    converted_clone.fetch_add(1, Ordering::Relaxed);
                    tracing::debug!("Converted: {}", bin_path.display());
                }
                Err(e) => {
                    failed_clone.fetch_add(1, Ordering::Relaxed);
                    tracing::warn!("Failed to convert {}: {}", bin_path.display(), e);
                }
            }
        });
        
        // Log batch completion
        let current_converted = converted.load(Ordering::Relaxed);
        tracing::info!("Batch {} complete: {} converted so far", batch_idx + 1, current_converted);
    }
    
    let final_converted = converted.load(Ordering::Relaxed);
    let final_failed = failed.load(Ordering::Relaxed);
    
    // Emit completion
    let _ = app.emit("bin-convert-progress", serde_json::json!({
        "current": total,
        "total": total,
        "file": "",
        "status": "complete"
    }));
    
    tracing::info!("Pre-converted {} BIN files ({} failed, {} skipped)", 
        final_converted, final_failed, total - to_convert_count);
    Ok(final_converted)
}

/// Synchronous helper function to convert a single BIN file to ritobin
/// Used by parallel processing (rayon doesn't work well with async)
fn convert_bin_file_sync(bin_path: &str) -> Result<(), String> {
    use std::fs;
    use crate::core::bin::{read_bin_ltk, tree_to_text_cached, MAX_BIN_SIZE};
    
    // Check file size before reading to avoid loading huge corrupt files
    let metadata = fs::metadata(bin_path)
        .map_err(|e| format!("Failed to get file metadata for '{}': {}", bin_path, e))?;
    
    let file_size = metadata.len() as usize;
    
    // Reject suspiciously large files (using the same limit as ltk_bridge)
    if file_size > MAX_BIN_SIZE {
        return Err(format!(
            "BIN file too large ({} bytes, max {} bytes) - likely corrupt, skipping: {}",
            file_size, MAX_BIN_SIZE, bin_path
        ));
    }
    
    let data = fs::read(bin_path)
        .map_err(|e| format!("Failed to read file '{}': {}", bin_path, e))?;

    let bin = read_bin_ltk(&data)
        .map_err(|e| format!("Failed to parse bin file '{}': {}", bin_path, e))?;

    // Use cached hash resolution for performance
    let text = tree_to_text_cached(&bin)
        .map_err(|e| format!("Failed to convert to text for '{}': {}", bin_path, e))?;

    let ritobin_path = format!("{}.ritobin", bin_path);
    fs::write(&ritobin_path, &text)
        .map_err(|e| format!("Failed to write ritobin '{}': {}", ritobin_path, e))?;

    Ok(())
}

