use crate::error::{Error, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use sha2::{Sha256, Digest};
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AssetType {
    Texture,
    Model,
    Animation,
    Bin,
    Audio,
    Data,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,       // Relative to project root
    pub hash: String,      // SHA256 of content
    pub size: u64,
    pub asset_type: AssetType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Checkpoint {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub message: String,
    pub author: Option<String>,
    pub tags: Vec<String>,
    pub file_manifest: HashMap<String, FileEntry>, // path -> Entry
}

/// Content types returned when reading a checkpoint file for preview
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CheckpointFileContent {
    /// Base64-encoded PNG image data
    #[serde(rename = "image")]
    Image { data: String, width: u32, height: u32 },
    /// Text file content
    #[serde(rename = "text")]
    Text { data: String },
    /// Binary file (only size returned)
    #[serde(rename = "binary")]
    Binary { size: u64 },
}

/// Progress information emitted during checkpoint creation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointProgress {
    pub phase: String,
    pub current: u64,
    pub total: u64,
}

/// Directories/files to skip when scanning or cleaning
fn should_skip_dir(name: &str) -> bool {
    matches!(name, ".flint" | ".git" | "node_modules" | "output")
}

/// Collect all project files (excluding internal dirs), returning their paths
fn collect_project_files(project_path: &Path) -> Vec<PathBuf> {
    WalkDir::new(project_path)
        .into_iter()
        .filter_entry(|e| {
            if e.file_type().is_dir() {
                let name = e.file_name().to_string_lossy();
                !should_skip_dir(&name)
            } else {
                true
            }
        })
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .collect()
}

pub struct CheckpointManager {
    pub project_path: PathBuf,
    pub checkpoints_dir: PathBuf, // .flint/checkpoints/
    pub object_store: PathBuf,    // .flint/objects/
}

impl CheckpointManager {
    pub fn new(project_path: PathBuf) -> Self {
        let flint_dir = project_path.join(".flint");
        Self {
            project_path,
            checkpoints_dir: flint_dir.join("checkpoints"),
            object_store: flint_dir.join("objects"),
        }
    }

    pub fn init(&self) -> Result<()> {
        fs::create_dir_all(&self.checkpoints_dir)
            .map_err(|e| Error::io_with_path(e, &self.checkpoints_dir))?;
        fs::create_dir_all(&self.object_store)
            .map_err(|e| Error::io_with_path(e, &self.object_store))?;
        Ok(())
    }

    /// Create a checkpoint with optional progress callback.
    /// The callback receives (phase, current, total).
    pub fn create_checkpoint_with_progress<F>(
        &self,
        message: String,
        tags: Vec<String>,
        progress: Option<F>,
    ) -> Result<Checkpoint>
    where
        F: Fn(&str, u64, u64),
    {
        // Phase 1: Collect all files first (for progress tracking)
        if let Some(ref cb) = progress {
            cb("Scanning files...", 0, 0);
        }
        let files = collect_project_files(&self.project_path);
        let total = files.len() as u64;

        // Phase 2: Hash and store each file
        let mut manifest = HashMap::new();
        for (i, full_path) in files.iter().enumerate() {
            if let Some(ref cb) = progress {
                cb("Saving checkpoint...", (i + 1) as u64, total);
            }

            let relative_path = full_path.strip_prefix(&self.project_path)
                .map_err(|_| Error::InvalidInput("Failed to relativize path".into()))?
                .to_string_lossy()
                .to_string()
                .replace('\\', "/");

            let (hash, size) = self.hash_and_store_file(full_path)?;

            manifest.insert(relative_path.clone(), FileEntry {
                path: relative_path,
                hash,
                size,
                asset_type: Self::detect_type(full_path),
            });
        }

        let checkpoint = Checkpoint {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            message,
            author: None,
            tags,
            file_manifest: manifest,
        };

        self.save_checkpoint(&checkpoint)?;

        Ok(checkpoint)
    }

    /// Create a checkpoint (no progress callback)
    pub fn create_checkpoint(&self, message: String, tags: Vec<String>) -> Result<Checkpoint> {
        self.create_checkpoint_with_progress(message, tags, None::<fn(&str, u64, u64)>)
    }

    fn hash_and_store_file(&self, path: &Path) -> Result<(String, u64)> {
        let data = fs::read(path).map_err(|e| Error::io_with_path(e, path))?;
        let size = data.len() as u64;

        let mut hasher = Sha256::new();
        hasher.update(&data);
        let hash = format!("{:x}", hasher.finalize());

        let object_rel_path = PathBuf::from(&hash[..2]).join(&hash);
        let object_path = self.object_store.join(object_rel_path);

        if !object_path.exists() {
            if let Some(parent) = object_path.parent() {
                fs::create_dir_all(parent).map_err(|e| Error::io_with_path(e, parent))?;
            }
            fs::write(&object_path, data).map_err(|e| Error::io_with_path(e, &object_path))?;
        }

        Ok((hash, size))
    }

    fn detect_type(path: &Path) -> AssetType {
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_lowercase();

        match ext.as_str() {
            "dds" | "tex" | "png" | "jpg" | "jpeg" | "tga" => AssetType::Texture,
            "skn" | "skl" | "mapgeo" | "wgeo" | "sco" | "scb" => AssetType::Model,
            "anm" => AssetType::Animation,
            "bin" => AssetType::Bin,
            "bnk" | "wpk" | "wav" | "ogg" | "mp3" => AssetType::Audio,
            "json" | "txt" | "lua" | "xml" | "ritobin" | "py" => AssetType::Data,
            _ => AssetType::Unknown,
        }
    }

    fn save_checkpoint(&self, checkpoint: &Checkpoint) -> Result<()> {
        let path = self.checkpoints_dir.join(format!("{}.json", checkpoint.id));
        let file = fs::File::create(&path).map_err(|e| Error::io_with_path(e, &path))?;
        serde_json::to_writer_pretty(file, checkpoint)
            .map_err(|e| Error::InvalidInput(format!("Failed to save checkpoint: {}", e)))?;
        Ok(())
    }

    pub fn load_checkpoint(&self, id: &str) -> Result<Checkpoint> {
        let path = self.checkpoints_dir.join(format!("{}.json", id));
        let file = fs::File::open(&path).map_err(|e| Error::io_with_path(e, &path))?;
        let checkpoint = serde_json::from_reader(file)
            .map_err(|e| Error::InvalidInput(format!("Failed to load checkpoint: {}", e)))?;
        Ok(checkpoint)
    }

    pub fn list_checkpoints(&self) -> Result<Vec<Checkpoint>> {
        let mut checkpoints = Vec::new();
        if !self.checkpoints_dir.exists() {
            return Ok(checkpoints);
        }

        for entry in fs::read_dir(&self.checkpoints_dir)
            .map_err(|e| Error::io_with_path(e, &self.checkpoints_dir))?
        {
            let entry = entry.map_err(|e| Error::InvalidInput(e.to_string()))?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(cp) = self.load_checkpoint(path.file_stem().unwrap().to_str().unwrap()) {
                    checkpoints.push(cp);
                }
            }
        }

        // Sort by timestamp descending
        checkpoints.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(checkpoints)
    }

    /// Restore a checkpoint with full snapshot semantics:
    /// 1. Auto-backup current state before restoring
    /// 2. Delete files not in the checkpoint manifest
    /// 3. Restore all files from the checkpoint
    pub fn restore_checkpoint(&self, id: &str) -> Result<()> {
        let checkpoint = self.load_checkpoint(id)?;

        // 1. Auto-backup current state before restoring
        let backup_msg = format!("Auto-backup before restore to: {}", checkpoint.message);
        self.create_checkpoint(backup_msg, vec!["auto-backup".to_string()])?;

        // 2. Delete files NOT in the checkpoint manifest
        let current_files = collect_project_files(&self.project_path);
        for file_path in &current_files {
            let relative = file_path.strip_prefix(&self.project_path)
                .map_err(|_| Error::InvalidInput("Failed to relativize path".into()))?
                .to_string_lossy()
                .to_string()
                .replace('\\', "/");

            // Skip project.json (metadata shouldn't be reverted)
            if relative == "project.json" {
                continue;
            }

            if !checkpoint.file_manifest.contains_key(&relative) {
                // File doesn't exist in checkpoint - remove it
                let _ = fs::remove_file(file_path);
            }
        }

        // 3. Restore all files from manifest
        for (rel_path, entry) in &checkpoint.file_manifest {
            let target_path = self.project_path.join(rel_path.replace('/', "\\"));
            let object_path = self.object_store.join(&entry.hash[..2]).join(&entry.hash);

            if !object_path.exists() {
                return Err(Error::InvalidInput(format!("Object not found for hash: {}", entry.hash)));
            }

            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|e| Error::io_with_path(e, parent))?;
            }

            fs::copy(&object_path, &target_path).map_err(|e| Error::io_with_path(e, &target_path))?;
        }

        // 4. Clean up empty directories left after file deletion
        self.cleanup_empty_dirs()?;

        Ok(())
    }

    /// Remove empty directories in the project (after file deletion during restore)
    fn cleanup_empty_dirs(&self) -> Result<()> {
        // Walk bottom-up to clean nested empty dirs
        let mut dirs: Vec<PathBuf> = WalkDir::new(&self.project_path)
            .into_iter()
            .filter_entry(|e| {
                if e.file_type().is_dir() {
                    let name = e.file_name().to_string_lossy();
                    !should_skip_dir(&name)
                } else {
                    true
                }
            })
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_dir() && e.path() != self.project_path)
            .map(|e| e.into_path())
            .collect();

        // Sort by depth descending (deepest dirs first)
        dirs.sort_by_key(|b| std::cmp::Reverse(b.components().count()));

        for dir in dirs {
            if let Ok(mut entries) = fs::read_dir(&dir) {
                if entries.next().is_none() {
                    let _ = fs::remove_dir(&dir);
                }
            }
        }

        Ok(())
    }

    pub fn compare_checkpoints(&self, from_id: &str, to_id: &str) -> Result<CheckpointDiff> {
        let cp1 = self.load_checkpoint(from_id)?;
        let cp2 = self.load_checkpoint(to_id)?;

        let mut diff = CheckpointDiff::default();

        for (path, entry) in &cp2.file_manifest {
            match cp1.file_manifest.get(path) {
                None => diff.added.push(entry.clone()),
                Some(old) if old.hash != entry.hash => {
                    diff.modified.push((old.clone(), entry.clone()));
                }
                _ => {} // Unchanged
            }
        }

        for (path, entry) in &cp1.file_manifest {
            if !cp2.file_manifest.contains_key(path) {
                diff.deleted.push(entry.clone());
            }
        }

        Ok(diff)
    }

    pub fn delete_checkpoint(&self, id: &str) -> Result<()> {
        let path = self.checkpoints_dir.join(format!("{}.json", id));
        if path.exists() {
            fs::remove_file(&path).map_err(|e| Error::io_with_path(e, &path))?;
        }
        Ok(())
    }

    /// Read a stored object file by its hash for preview purposes.
    /// Returns raw bytes of the file from the object store.
    pub fn read_object_file(&self, hash: &str) -> Result<Vec<u8>> {
        let object_path = self.object_store.join(&hash[..2]).join(hash);
        if !object_path.exists() {
            return Err(Error::InvalidInput(format!("Object not found for hash: {}", hash)));
        }
        fs::read(&object_path).map_err(|e| Error::io_with_path(e, &object_path))
    }

    /// Read a checkpoint file and return its content in a preview-friendly format.
    /// For textures (DDS/TEX): decode to base64 PNG
    /// For text files: return string content
    /// For other files: return size info
    pub fn read_checkpoint_file(&self, hash: &str, file_path: &str) -> Result<CheckpointFileContent> {
        let data = self.read_object_file(hash)?;
        let ext = Path::new(file_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_lowercase();

        match ext.as_str() {
            // Texture files - decode to PNG
            "dds" | "tex" => {
                match Self::decode_texture_to_png(&data) {
                    Ok((base64_data, width, height)) => {
                        Ok(CheckpointFileContent::Image { data: base64_data, width, height })
                    }
                    Err(_) => {
                        // If decoding fails, return as binary
                        Ok(CheckpointFileContent::Binary { size: data.len() as u64 })
                    }
                }
            }
            // Image files that are already standard formats
            "png" | "jpg" | "jpeg" => {
                use base64::{engine::general_purpose::STANDARD, Engine};
                let base64_data = STANDARD.encode(&data);
                let prefix = match ext.as_str() {
                    "png" => "data:image/png;base64,",
                    _ => "data:image/jpeg;base64,",
                };
                Ok(CheckpointFileContent::Image {
                    data: format!("{}{}", prefix, base64_data),
                    width: 0,
                    height: 0,
                })
            }
            // Text-based files
            "json" | "txt" | "lua" | "xml" | "ritobin" | "py" | "cfg" | "ini" | "yaml" | "yml" | "toml" | "md" => {
                match String::from_utf8(data.clone()) {
                    Ok(text) => Ok(CheckpointFileContent::Text { data: text }),
                    Err(_) => Ok(CheckpointFileContent::Binary { size: data.len() as u64 }),
                }
            }
            // Everything else
            _ => Ok(CheckpointFileContent::Binary { size: data.len() as u64 }),
        }
    }

    /// Decode DDS/TEX texture data to base64 PNG
    fn decode_texture_to_png(data: &[u8]) -> std::result::Result<(String, u32, u32), String> {
        use ltk_texture::Texture;
        use std::io::Cursor;
        use base64::{engine::general_purpose::STANDARD, Engine};

        if data.len() < 4 {
            return Err("File too small".to_string());
        }

        let mut cursor = Cursor::new(data);
        let texture = Texture::from_reader(&mut cursor)
            .map_err(|e| format!("Failed to parse texture: {:?}", e))?;

        let width = texture.width();
        let height = texture.height();

        let surface = texture
            .decode_mipmap(0)
            .map_err(|e| format!("Failed to decode texture: {:?}", e))?;

        let rgba_image = surface
            .into_rgba_image()
            .map_err(|e| format!("Failed to convert to RGBA: {:?}", e))?;

        let mut png_data = Vec::new();
        {
            use image::ImageEncoder;
            let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
            encoder
                .write_image(rgba_image.as_raw(), width, height, image::ExtendedColorType::Rgba8)
                .map_err(|e| format!("Failed to encode PNG: {}", e))?;
        }

        let base64_data = STANDARD.encode(&png_data);
        Ok((base64_data, width, height))
    }
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct CheckpointDiff {
    pub added: Vec<FileEntry>,
    pub modified: Vec<(FileEntry, FileEntry)>, // (old, new)
    pub deleted: Vec<FileEntry>,
}
