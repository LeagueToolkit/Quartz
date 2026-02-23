use crate::error::{Error, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{Duration, SystemTime};
use tokio::fs;
use tokio::io::AsyncWriteExt;

/// Statistics about a hash download operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadStats {
    pub downloaded: usize,
    pub skipped: usize,
    pub errors: usize,
}

/// GitHub API response for file content
#[derive(Debug, Deserialize)]
#[allow(dead_code)] // sha field is part of GitHub API response but not currently used
struct GitHubFile {
    name: String,
    download_url: Option<String>,
    sha: String,
}

const GITHUB_API_BASE: &str = "https://api.github.com/repos/CommunityDragon/Data/contents/hashes/lol";
const FILE_AGE_THRESHOLD: Duration = Duration::from_secs(14 * 24 * 60 * 60); // 14 days

/// Gets the RitoShark hash directory path
///
/// Returns the standard RitoShark directory: %APPDATA%/RitoShark/Requirements/Hashes
/// This allows sharing hash files with other RitoShark tools.
pub fn get_ritoshark_hash_dir() -> Result<std::path::PathBuf> {
    let appdata = std::env::var("APPDATA")
        .map_err(|_| Error::Hash("APPDATA environment variable not found".to_string()))?;
    
    Ok(std::path::PathBuf::from(appdata)
        .join("RitoShark")
        .join("Requirements")
        .join("Hashes"))
}

/// List of hash files to download from CommunityDragon
const HASH_FILES: &[&str] = &[
    "hashes.binentries.txt",
    "hashes.binhashes.txt",
    "hashes.bintypes.txt",
    "hashes.binfields.txt",
    "hashes.game.txt.0",
    "hashes.game.txt.1",
    "hashes.lcu.txt",
    "hashes.rst.txt",
];

/// Downloads hash files from CommunityDragon repository
///
/// # Arguments
/// * `output_dir` - Directory where hash files will be saved
/// * `force` - If true, downloads all files regardless of age
///
/// # Returns
/// Statistics about the download operation
pub async fn download_hashes(output_dir: impl AsRef<Path>, force: bool) -> Result<DownloadStats> {
    let output_dir = output_dir.as_ref();
    
    tracing::info!("Downloading hash files to: {}", output_dir.display());
    if force {
        tracing::info!("Force download enabled - will download all files");
    }
    
    // Create output directory if it doesn't exist
    fs::create_dir_all(output_dir).await
        .map_err(|e| {
            tracing::error!("Failed to create output directory '{}': {}", output_dir.display(), e);
            e
        })?;
    
    let client = Client::builder()
        .user_agent("flint")
        .build()
        .map_err(Error::Network)?;
    
    let mut stats = DownloadStats {
        downloaded: 0,
        skipped: 0,
        errors: 0,
    };
    
    // Get list of files from GitHub API
    tracing::debug!("Fetching file list from GitHub API");
    let files = fetch_file_list(&client).await?;
    tracing::debug!("Found {} files in repository", files.len());
    
    // Download each required hash file
    for file_name in HASH_FILES {
        tracing::debug!("Processing file: {}", file_name);
        match download_file(&client, &files, file_name, output_dir, force).await {
            Ok(downloaded) => {
                if downloaded {
                    tracing::info!("Downloaded: {}", file_name);
                    stats.downloaded += 1;
                } else {
                    tracing::debug!("Skipped (up to date): {}", file_name);
                    stats.skipped += 1;
                }
            }
            Err(e) => {
                tracing::error!("Error downloading {}: {}", file_name, e);
                stats.errors += 1;
            }
        }
    }
    
    // Merge split game hash files if both exist
    tracing::debug!("Checking for split files to merge");
    if let Err(e) = merge_split_files(output_dir).await {
        tracing::error!("Error merging split files: {}", e);
        stats.errors += 1;
    } else {
        tracing::debug!("Split files merged successfully");
    }
    
    tracing::info!(
        "Hash download complete: {} downloaded, {} skipped, {} errors",
        stats.downloaded,
        stats.skipped,
        stats.errors
    );
    
    Ok(stats)
}

/// Fetches the list of files from GitHub API
async fn fetch_file_list(client: &Client) -> Result<Vec<GitHubFile>> {
    let response = client
        .get(GITHUB_API_BASE)
        .send()
        .await
        .map_err(Error::Network)?;
    
    if !response.status().is_success() {
        return Err(Error::Hash(format!(
            "GitHub API request failed with status: {}",
            response.status()
        )));
    }
    
    let files: Vec<GitHubFile> = response
        .json()
        .await
        .map_err(Error::Network)?;
    
    Ok(files)
}

/// Downloads a single file if needed
///
/// Returns true if the file was downloaded, false if it was skipped
async fn download_file(
    client: &Client,
    files: &[GitHubFile],
    file_name: &str,
    output_dir: &Path,
    force: bool,
) -> Result<bool> {
    let output_path = output_dir.join(file_name);
    
    // Check if file needs updating
    if !force && !needs_update(&output_path).await? {
        return Ok(false);
    }
    
    // Find file in GitHub API response
    let github_file = files
        .iter()
        .find(|f| f.name == file_name)
        .ok_or_else(|| Error::Hash(format!("File {} not found in repository", file_name)))?;
    
    let download_url = github_file
        .download_url
        .as_ref()
        .ok_or_else(|| Error::Hash(format!("No download URL for {}", file_name)))?;
    
    // Download file content
    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(Error::Network)?;
    
    if !response.status().is_success() {
        return Err(Error::Hash(format!(
            "Failed to download {}: status {}",
            file_name,
            response.status()
        )));
    }
    
    let content = response.bytes().await.map_err(Error::Network)?;
    
    // Note: GitHub API returns git blob SHA (includes header), not raw file SHA1
    // So checksum verification would fail. We skip it since HTTPS ensures integrity.
    
    // Write to file
    let mut file = fs::File::create(&output_path).await?;
    file.write_all(&content).await?;
    file.flush().await?;
    
    Ok(true)
}

/// Checks if a file needs to be updated based on age
async fn needs_update(path: &Path) -> Result<bool> {
    // If file doesn't exist, it needs to be downloaded
    if !path.exists() {
        return Ok(true);
    }
    
    // Check file age
    let metadata = fs::metadata(path).await?;
    let modified = metadata.modified()?;
    let age = SystemTime::now()
        .duration_since(modified)
        .unwrap_or(Duration::from_secs(0));
    
    Ok(age > FILE_AGE_THRESHOLD)
}

/// Verifies SHA checksum of downloaded content
#[allow(dead_code)] // Kept for future use when GitHub API returns correct SHA
fn verify_checksum(content: &[u8], expected_sha: &str) -> Result<()> {
    use sha1::{Digest, Sha1};
    
    let mut hasher = Sha1::new();
    hasher.update(content);
    let result = hasher.finalize();
    let computed_sha = format!("{:x}", result);
    
    if computed_sha != expected_sha {
        return Err(Error::Hash(format!(
            "Checksum mismatch: expected {}, got {}",
            expected_sha, computed_sha
        )));
    }
    
    Ok(())
}

/// Merges split hash files (hashes.game.txt.0 and hashes.game.txt.1) into a single file
async fn merge_split_files(output_dir: &Path) -> Result<()> {
    let file0_path = output_dir.join("hashes.game.txt.0");
    let file1_path = output_dir.join("hashes.game.txt.1");
    let merged_path = output_dir.join("hashes.game.txt");
    
    // Check if both split files exist
    if !file0_path.exists() || !file1_path.exists() {
        // If split files don't exist, nothing to merge
        return Ok(());
    }
    
    // Read both files
    let mut merged_content = fs::read_to_string(&file0_path).await?;
    let content1 = fs::read_to_string(&file1_path).await?;

    // Append in-place to avoid a third allocation from format!
    merged_content.push_str(&content1);

    // Write merged file
    fs::write(&merged_path, merged_content).await?;
    
    // We KEEP the split files so we can check their age next time
    // fs::remove_file(&file0_path).await?;
    // fs::remove_file(&file1_path).await?;
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    
    #[test]
    fn test_download_stats_creation() {
        let stats = DownloadStats {
            downloaded: 5,
            skipped: 2,
            errors: 1,
        };
        
        assert_eq!(stats.downloaded, 5);
        assert_eq!(stats.skipped, 2);
        assert_eq!(stats.errors, 1);
    }
    
    #[test]
    fn test_get_ritoshark_hash_dir() {
        // This test will only pass on Windows with APPDATA set
        if std::env::var("APPDATA").is_ok() {
            let result = get_ritoshark_hash_dir();
            assert!(result.is_ok());
            
            let path = result.unwrap();
            let path_str = path.to_string_lossy();
            assert!(path_str.contains("RitoShark"));
            assert!(path_str.contains("Requirements"));
            assert!(path_str.contains("Hashes"));
        }
    }
    
    #[tokio::test]
    async fn test_needs_update_nonexistent_file() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("nonexistent.txt");
        
        let result = needs_update(&path).await.unwrap();
        assert!(result, "Nonexistent file should need update");
    }
    
    #[tokio::test]
    async fn test_needs_update_fresh_file() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("fresh.txt");
        
        // Create a fresh file
        fs::write(&path, "test content").await.unwrap();
        
        let result = needs_update(&path).await.unwrap();
        assert!(!result, "Fresh file should not need update");
    }
    
    #[test]
    fn test_verify_checksum_valid() {
        let content = b"test content";
        // SHA1 of "test content"
        let sha = "1eebdf4fdc9fc7bf283031b93f9aef3338de9052";
        
        let result = verify_checksum(content, sha);
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_verify_checksum_invalid() {
        let content = b"test content";
        let wrong_sha = "0000000000000000000000000000000000000000";
        
        let result = verify_checksum(content, wrong_sha);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), Error::Hash(_)));
    }
    
    #[tokio::test]
    async fn test_merge_split_files_both_exist() {
        let temp_dir = TempDir::new().unwrap();
        let dir = temp_dir.path();
        
        // Create split files
        fs::write(dir.join("hashes.game.txt.0"), "line1\nline2\n").await.unwrap();
        fs::write(dir.join("hashes.game.txt.1"), "line3\nline4\n").await.unwrap();
        
        // Merge
        merge_split_files(dir).await.unwrap();
        
        // Check merged file exists
        assert!(dir.join("hashes.game.txt").exists());
        
        // Check split files are KEPT (to handle caching)
        assert!(dir.join("hashes.game.txt.0").exists());
        assert!(dir.join("hashes.game.txt.1").exists());
        
        // Check content
        let merged_content = fs::read_to_string(dir.join("hashes.game.txt")).await.unwrap();
        assert_eq!(merged_content, "line1\nline2\nline3\nline4\n");
    }
    
    #[tokio::test]
    async fn test_merge_split_files_missing() {
        let temp_dir = TempDir::new().unwrap();
        let dir = temp_dir.path();
        
        // Don't create split files
        let result = merge_split_files(dir).await;
        
        // Should succeed without error
        assert!(result.is_ok());
    }
}
