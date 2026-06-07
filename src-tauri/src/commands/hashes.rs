use crate::commands::settings::get_quartz_home;
use serde::Serialize;
use std::path::PathBuf;

// CommunityDragon CDTB hash lists — the canonical source consumed in Phase 2.
const HASH_BASE_URL: &str = "https://raw.communitydragon.org/data/hashes/lol/";
const HASH_FILES: &[&str] = &[
    "hashes.game.txt",
    "hashes.binentries.txt",
    "hashes.binfields.txt",
    "hashes.binhashes.txt",
    "hashes.bintypes.txt",
    "hashes.lcu.txt",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashFileStatus {
    pub name: String,
    pub present: bool,
    pub size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashStatus {
    pub dir: String,
    pub files: Vec<HashFileStatus>,
    pub complete: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub downloaded: u32,
    pub skipped: u32,
    pub errors: Vec<String>,
}

fn hashes_dir() -> Result<PathBuf, String> {
    let dir = get_quartz_home()?.join("hashes");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create hashes dir: {}", e))?;
    Ok(dir)
}

#[tauri::command]
pub fn get_hash_status() -> Result<HashStatus, String> {
    let dir = hashes_dir()?;
    let files: Vec<HashFileStatus> = HASH_FILES
        .iter()
        .map(|name| {
            let path = dir.join(name);
            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            HashFileStatus { name: (*name).to_string(), present: path.exists() && size > 0, size }
        })
        .collect();
    let complete = files.iter().all(|f| f.present);
    Ok(HashStatus { dir: dir.to_string_lossy().into_owned(), files, complete })
}

/* Downloads any missing hash files (all of them when `force`). Files are large
   (tens of MB), so this is an explicit user action, not a startup step. */
#[tauri::command]
pub async fn download_hashes(force: bool) -> Result<DownloadResult, String> {
    let dir = hashes_dir()?;
    let client = reqwest::Client::builder()
        .user_agent("Quartz")
        .build()
        .map_err(|e| e.to_string())?;

    let mut result = DownloadResult { downloaded: 0, skipped: 0, errors: Vec::new() };

    for name in HASH_FILES {
        let path = dir.join(name);
        if !force && path.exists() && std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0) > 0 {
            result.skipped += 1;
            continue;
        }
        let url = format!("{}{}", HASH_BASE_URL, name);
        tracing::info!("Downloading {}", url);
        match download_one(&client, &url, &path).await {
            Ok(()) => result.downloaded += 1,
            Err(e) => {
                tracing::warn!("Failed to download {}: {}", name, e);
                result.errors.push(format!("{}: {}", name, e));
            }
        }
    }
    Ok(result)
}

async fn download_one(client: &reqwest::Client, url: &str, path: &PathBuf) -> Result<(), String> {
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    tokio::fs::write(path, &bytes).await.map_err(|e| e.to_string())?;
    Ok(())
}
