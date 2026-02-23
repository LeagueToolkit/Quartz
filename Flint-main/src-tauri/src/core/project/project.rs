//! Project management for Flint
//!
//! This module provides data structures and logic for creating, loading,
//! and saving Flint mod projects using the league-mod compatible format.

use crate::error::{Error, Result};
use chrono::{DateTime, Utc};
use ltk_mod_project::{ModProject, ModProjectAuthor, ModProjectLayer, default_layers};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};

/// Project config file name (league-mod compatible)
const PROJECT_FILE: &str = "mod.config.json";

/// Flint metadata file name
const FLINT_FILE: &str = "flint.json";

/// Flint-specific metadata (stored separately from mod.config.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlintMetadata {
    /// Champion internal name (e.g., "Ahri")
    pub champion: String,

    /// Skin ID (0 for base skin)
    pub skin_id: u32,

    /// Path to League of Legends installation
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub league_path: Option<PathBuf>,

    /// When the project was created (ISO 8601)
    pub created_at: DateTime<Utc>,

    /// When the project was last modified (ISO 8601)
    pub modified_at: DateTime<Utc>,
}

impl FlintMetadata {
    /// Creates new FlintMetadata with current timestamp
    #[allow(dead_code)] // Kept for API completeness
    pub fn new(champion: impl Into<String>, skin_id: u32, league_path: Option<PathBuf>) -> Self {
        let now = Utc::now();
        Self {
            champion: champion.into(),
            skin_id,
            league_path,
            created_at: now,
            modified_at: now,
        }
    }
}

/// Represents a Flint mod project (runtime representation)
/// 
/// This struct combines league-mod compatible ModProject with Flint-specific
/// champion/skin data needed for the extraction workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    // ===== League-mod compatible fields (from mod.config.json) =====
    
    /// The name of the mod (slug format, no spaces)
    pub name: String,
    
    /// The display name of the mod
    pub display_name: String,
    
    /// The version of the mod (semver format)
    pub version: String,
    
    /// The description of the mod
    pub description: String,
    
    /// Layers of the mod project
    #[serde(default = "default_layers")]
    pub layers: Vec<ModProjectLayer>,
    
    /// Authors of the mod (stored as strings for Clone compatibility)
    #[serde(default)]
    pub authors: Vec<String>,
    
    // ===== Flint-specific fields (from flint.json, populated at runtime) =====
    
    /// Champion internal name (e.g., "Ahri") - Flint specific
    #[serde(default)]
    pub champion: String,
    
    /// Skin ID (0 for base skin) - Flint specific
    #[serde(default)]
    pub skin_id: u32,
    
    /// Path to League of Legends installation - Flint specific
    #[serde(skip)]
    pub league_path: Option<PathBuf>,
    
    /// Path to the project directory
    #[serde(default)]
    pub project_path: PathBuf,
    
    /// When the project was created
    #[serde(skip)]
    pub created_at: DateTime<Utc>,
    
    /// When the project was last modified
    #[serde(skip)]
    pub modified_at: DateTime<Utc>,
}

impl Project {
    /// Creates a new project
    pub fn new(
        name: impl Into<String>,
        champion: impl Into<String>,
        skin_id: u32,
        league_path: impl Into<PathBuf>,
        project_path: impl Into<PathBuf>,
        author: Option<String>,
    ) -> Self {
        let now = Utc::now();
        let name_str = name.into();
        let champion_str = champion.into();
        
        // Create display name from champion and skin
        let _display_name = if skin_id == 0 {
            format!("{} Base Skin", champion_str)
        } else {
            format!("{} Skin {}", champion_str, skin_id)
        };
        
        // Store author as simple string
        let authors = author.into_iter().collect::<Vec<_>>();
        
        Self {
            name: slugify(&name_str),
            display_name: name_str,
            version: "0.1.0".to_string(),
            description: format!("Mod for {} skin {}", champion_str, skin_id),
            layers: default_layers(),
            authors,
            champion: champion_str,
            skin_id,
            league_path: Some(league_path.into()),
            project_path: project_path.into(),
            created_at: now,
            modified_at: now,
        }
    }
    
    /// Convert to ltk_mod_project::ModProject for export compatibility
    pub fn to_mod_project(&self) -> ModProject {
        ModProject {
            name: self.name.clone(),
            display_name: self.display_name.clone(),
            version: self.version.clone(),
            description: self.description.clone(),
            authors: self.authors.iter().map(|a| ModProjectAuthor::Name(a.clone())).collect(),
            license: None,
            transformers: vec![],
            layers: self.layers.clone(),
            thumbnail: None,
        }
    }
    
    /// Get FlintMetadata from this project
    pub fn to_flint_metadata(&self) -> FlintMetadata {
        FlintMetadata {
            champion: self.champion.clone(),
            skin_id: self.skin_id,
            league_path: self.league_path.clone(),
            created_at: self.created_at,
            modified_at: self.modified_at,
        }
    }

    /// Returns the path to the mod.config.json file
    pub fn config_path(&self) -> PathBuf {
        self.project_path.join(PROJECT_FILE)
    }
    
    /// Returns the path to the flint.json file
    pub fn flint_path(&self) -> PathBuf {
        self.project_path.join(FLINT_FILE)
    }

    /// Returns the path to the content directory for a specific layer
    pub fn content_path(&self, layer: &str) -> PathBuf {
        self.project_path.join("content").join(layer)
    }

    /// Returns the path to the base layer content (default for assets)
    /// This is the league-mod compatible path: content/base
    pub fn assets_path(&self) -> PathBuf {
        self.content_path("base")
    }

    /// Returns the path to the output directory
    pub fn output_path(&self) -> PathBuf {
        self.project_path.join("output")
    }

    /// Returns the layer names
    #[allow(dead_code)] // Kept for API completeness
    pub fn layer_names(&self) -> Vec<String> {
        self.layers.iter().map(|l| l.name.clone()).collect()
    }
}

/// Creates a new project with the required directory structure
///
/// # Arguments
/// * `name` - Project name (used as folder name)
/// * `champion` - Champion internal name
/// * `skin_id` - Skin ID
/// * `league_path` - Path to League installation
/// * `output_dir` - Directory where project folder will be created
/// * `author` - Optional author/creator name
pub fn create_project(
    name: &str,
    champion: &str,
    skin_id: u32,
    league_path: &Path,
    output_dir: &Path,
    author: Option<String>,
) -> Result<Project> {
    tracing::info!("Creating project '{}' for {} skin {}", name, champion, skin_id);

    // Validate inputs
    if name.is_empty() {
        return Err(Error::InvalidInput("Project name cannot be empty".to_string()));
    }
    if champion.is_empty() {
        return Err(Error::InvalidInput("Champion name cannot be empty".to_string()));
    }
    if !league_path.exists() {
        return Err(Error::InvalidInput(format!(
            "League path does not exist: {}",
            league_path.display()
        )));
    }
    
    // Create output directory if it doesn't exist
    if !output_dir.exists() {
        fs::create_dir_all(output_dir)
            .map_err(|e| Error::io_with_path(e, output_dir))?;
        tracing::info!("Created output directory: {}", output_dir.display());
    }

    // Create project directory name (no .flint extension, like league-mod)
    let project_dir_name = sanitize_filename(name);
    let project_path = output_dir.join(&project_dir_name);

    // Check if project already exists
    if project_path.exists() {
        return Err(Error::InvalidInput(format!(
            "Project already exists at: {}",
            project_path.display()
        )));
    }

    // Create project
    let project = Project::new(
        name,
        champion,
        skin_id,
        league_path,
        &project_path,
        author,
    );

    // Create directories
    fs::create_dir_all(&project_path)
        .map_err(|e| Error::io_with_path(e, &project_path))?;
    
    // Create content/base directory (league-mod compatible)
    fs::create_dir_all(project.assets_path())
        .map_err(|e| Error::io_with_path(e, project.assets_path()))?;
    
    fs::create_dir_all(project.output_path())
        .map_err(|e| Error::io_with_path(e, project.output_path()))?;

    // Save project files
    save_project(&project)?;

    tracing::info!("Project created at: {}", project_path.display());
    Ok(project)
}

/// Opens an existing project from a path
///
/// # Arguments
/// * `path` - Path to the project directory or mod.config.json file
pub fn open_project(path: &Path) -> Result<Project> {
    let project_path = if path.is_file() && path.file_name().and_then(|n| n.to_str()) == Some(PROJECT_FILE) {
        path.parent().unwrap_or(path).to_path_buf()
    } else {
        path.to_path_buf()
    };

    let config_path = project_path.join(PROJECT_FILE);
    
    if !config_path.exists() {
        return Err(Error::InvalidInput(format!(
            "Project file not found: {}",
            config_path.display()
        )));
    }

    tracing::info!("Opening project from: {}", config_path.display());

    // Load mod.config.json
    let file = File::open(&config_path)
        .map_err(|e| Error::io_with_path(e, &config_path))?;
    let reader = BufReader::new(file);
    
    let mut project: Project = serde_json::from_reader(reader)
        .map_err(|e| Error::InvalidInput(format!("Failed to parse project file: {}", e)))?;

    // Set project path (not serialized)
    project.project_path = project_path.clone();
    
    // Load flint.json if it exists
    let flint_path = project_path.join(FLINT_FILE);
    if flint_path.exists() {
        if let Ok(file) = File::open(&flint_path) {
            let reader = BufReader::new(file);
            if let Ok(flint) = serde_json::from_reader::<_, FlintMetadata>(reader) {
                project.champion = flint.champion;
                project.skin_id = flint.skin_id;
                project.league_path = flint.league_path;
                project.created_at = flint.created_at;
                project.modified_at = flint.modified_at;
            }
        }
    }

    tracing::info!("Project '{}' loaded successfully", project.name);
    Ok(project)
}

/// Saves a project to disk
/// Writes both mod.config.json (league-mod compatible) and flint.json (Flint metadata)
pub fn save_project(project: &Project) -> Result<()> {
    // Save mod.config.json (league-mod compatible format)
    let config_path = project.config_path();
    tracing::debug!("Saving project to: {}", config_path.display());

    let mod_project = project.to_mod_project();
    let file = File::create(&config_path)
        .map_err(|e| Error::io_with_path(e, &config_path))?;
    let writer = BufWriter::new(file);
    serde_json::to_writer_pretty(writer, &mod_project)
        .map_err(|e| Error::InvalidInput(format!("Failed to write project file: {}", e)))?;
    
    // Save flint.json (Flint-specific metadata)
    let flint_path = project.flint_path();
    let flint_metadata = project.to_flint_metadata();
    let file = File::create(&flint_path)
        .map_err(|e| Error::io_with_path(e, &flint_path))?;
    let writer = BufWriter::new(file);
    serde_json::to_writer_pretty(writer, &flint_metadata)
        .map_err(|e| Error::InvalidInput(format!("Failed to write flint file: {}", e)))?;

    tracing::debug!("Project saved successfully");
    Ok(())
}

/// Sanitizes a filename to remove invalid characters
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Convert name to slug format
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_project_new() {
        let project = Project::new(
            "Test Project",
            "Ahri",
            0,
            "C:\\Riot Games\\League of Legends",
            "C:\\Projects\\test",
            None,
        );

        assert_eq!(project.name, "test-project");
        assert_eq!(project.display_name, "Test Project");
        assert_eq!(project.champion, "Ahri");
        assert_eq!(project.skin_id, 0);
        assert_eq!(project.layers.len(), 1);
        assert_eq!(project.layers[0].name, "base");
    }

    #[test]
    fn test_project_paths() {
        let project = Project::new(
            "Test",
            "Ahri",
            0,
            "C:\\League",
            "C:\\Projects\\test",
            None,
        );

        assert_eq!(project.config_path(), PathBuf::from("C:\\Projects\\test\\mod.config.json"));
        assert_eq!(project.flint_path(), PathBuf::from("C:\\Projects\\test\\flint.json"));
        assert_eq!(project.assets_path(), PathBuf::from("C:\\Projects\\test\\content\\base"));
        assert_eq!(project.output_path(), PathBuf::from("C:\\Projects\\test\\output"));
    }

    #[test]
    fn test_to_mod_project() {
        let project = Project::new("Test", "Ahri", 0, "C:\\League", "C:\\test", None);
        let mod_project = project.to_mod_project();
        
        assert_eq!(mod_project.name, project.name);
        assert_eq!(mod_project.display_name, project.display_name);
        assert_eq!(mod_project.version, project.version);
    }

    #[test]
    fn test_flint_metadata() {
        let project = Project::new("Test", "Ahri", 5, "C:\\League", "C:\\test", None);
        let flint = project.to_flint_metadata();
        
        assert_eq!(flint.champion, "Ahri");
        assert_eq!(flint.skin_id, 5);
    }

    #[test]
    fn test_project_content_path() {
        let project = Project::new("Test", "Ahri", 0, "C:\\League", "C:\\test", None);
        
        assert_eq!(project.content_path("base"), PathBuf::from("C:\\test\\content\\base"));
        assert_eq!(project.content_path("chroma1"), PathBuf::from("C:\\test\\content\\chroma1"));
    }

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("Test Project"), "Test Project");
        assert_eq!(sanitize_filename("Test/Project"), "Test_Project");
        assert_eq!(sanitize_filename("Test:Project<>"), "Test_Project__");
        assert_eq!(sanitize_filename("Test-Project_123"), "Test-Project_123");
    }

    #[test]
    fn test_slugify() {
        assert_eq!(slugify("Test Project"), "test-project");
        assert_eq!(slugify("My Cool Mod"), "my-cool-mod");
    }

    #[test]
    fn test_layer_names() {
        let project = Project::new("Test", "Ahri", 0, "C:\\League", "C:\\test", None);
        let layers = project.layer_names();
        
        assert_eq!(layers.len(), 1);
        assert_eq!(layers[0], "base");
    }

    #[test]
    fn test_create_and_open_project() {
        let temp_dir = tempdir().unwrap();
        let league_dir = temp_dir.path().join("League");
        fs::create_dir_all(&league_dir).unwrap();

        let project = create_project(
            "Test Project",
            "Ahri",
            0,
            &league_dir,
            temp_dir.path(),
            None,
        ).unwrap();

        assert_eq!(project.display_name, "Test Project");
        assert!(project.project_path.exists());
        assert!(project.assets_path().exists());
        assert!(project.output_path().exists());
        assert!(project.config_path().exists());
        assert!(project.flint_path().exists());
        
        // Verify no .flint extension
        assert!(!project.project_path.to_string_lossy().ends_with(".flint"));

        // Test opening the project
        let loaded = open_project(&project.project_path).unwrap();
        assert_eq!(loaded.display_name, project.display_name);
        assert_eq!(loaded.champion, project.champion);
        assert_eq!(loaded.skin_id, project.skin_id);
    }

    #[test]
    fn test_create_project_empty_name() {
        let temp_dir = tempdir().unwrap();
        let result = create_project("", "Ahri", 0, temp_dir.path(), temp_dir.path(), None);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_project_empty_champion() {
        let temp_dir = tempdir().unwrap();
        let result = create_project("Test", "", 0, temp_dir.path(), temp_dir.path(), None);
        assert!(result.is_err());
    }
}
