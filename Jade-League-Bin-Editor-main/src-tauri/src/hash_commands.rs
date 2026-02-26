use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use byteorder::{WriteBytesExt, LittleEndian};
use std::io::Write;
use crate::core::hash::get_leaguetoolkit_hash_dir;
use crate::core::bin::get_cached_bin_hashes;

#[derive(Debug, Serialize, Deserialize)]
pub struct HashStatus {
    pub all_present: bool,
    pub missing: Vec<String>,
    pub format: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PreloadStatus {
    pub loaded: bool,
    pub loading: bool,
    pub fnv_count: usize,
    pub xxh_count: usize,
    pub memory_bytes: usize,
}

const HASH_FILES: &[&str] = &[
    "hashes.binentries.txt",
    "hashes.binfields.txt",
    "hashes.binhashes.txt",
    "hashes.bintypes.txt",
    "hashes.lcu.txt",
];

const BASE_URL: &str = "https://raw.githubusercontent.com/CommunityDragon/Data/master/hashes/lol/";

fn get_hash_dir() -> Result<PathBuf, String> {
    // Use the LeagueToolkit shared hash directory
    get_leaguetoolkit_hash_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_hashes() -> Result<HashStatus, String> {
    let hash_dir = get_hash_dir()?;
    
    let mut missing = Vec::new();
    let mut txt_count = 0;
    let mut bin_count = 0;

    for filename in HASH_FILES {
        let txt_path = hash_dir.join(filename);
        let bin_path = hash_dir.join(filename.replace(".txt", ".bin"));
        
        if bin_path.exists() {
            bin_count += 1;
        } else if txt_path.exists() {
            txt_count += 1;
        } else {
            missing.push(filename.to_string());
        }
    }

    let format = if bin_count > 0 && txt_count == 0 {
        "Binary"
    } else if txt_count > 0 && bin_count == 0 {
        "Text"
    } else if bin_count > 0 && txt_count > 0 {
        "Mixed"
    } else {
        "None"
    };

    Ok(HashStatus {
        all_present: missing.is_empty(),
        missing,
        format: format.to_string(),
    })
}

#[tauri::command]
pub async fn download_hashes(_app: tauri::AppHandle, use_binary: bool) -> Result<Vec<String>, String> {
    let hash_dir = get_hash_dir()?;
    let mut downloaded = Vec::new();
    
    for filename in HASH_FILES {
        let url = format!("{}{}", BASE_URL, filename);
        let txt_path = hash_dir.join(filename);
        
        let response = reqwest::get(&url).await
            .map_err(|e| format!("Failed to request {}: {}", filename, e))?;
            
        let bytes = response.bytes().await
             .map_err(|e| format!("Failed to get bytes {}: {}", filename, e))?;
             
        fs::write(&txt_path, bytes)
             .map_err(|e| format!("Failed to write {}: {}", filename, e))?;
             
        downloaded.push(filename.to_string());
    }
    
    if use_binary {
        for filename in HASH_FILES {
             let txt_path = hash_dir.join(filename);
             let bin_path = hash_dir.join(filename.replace(".txt", ".bin"));
             
             if txt_path.exists() {
                 convert_text_to_binary(&txt_path, &bin_path).map_err(|e| e.to_string())?;
                 // C# behavior: Delete text file if binary conversion succeeds
                 let _ = fs::remove_file(txt_path);
             }
        }
    }
    
    Ok(downloaded)
}

#[tauri::command]
pub async fn open_hashes_folder() -> Result<(), String> {
    let hash_dir = get_hash_dir()?;
    opener::open(hash_dir)
        .map_err(|e| format!("Failed to open folder: {}", e))
}

fn convert_text_to_binary(txt_path: &PathBuf, bin_path: &PathBuf) -> std::io::Result<()> {
    let content = fs::read_to_string(txt_path)?;
    let mut fnv1a = Vec::new();
    let mut xxh64 = Vec::new();
    
    for line in content.lines() {
         if line.trim().is_empty() { continue; }
         if let Some((hash_part, value_part)) = line.split_once(' ') {
             let hash_hex = hash_part;
             if hash_hex.len() == 16 {
                 if let Ok(h) = u64::from_str_radix(hash_hex, 16) {
                     xxh64.push((h, value_part.to_string()));
                 }
             } else if hash_hex.len() == 8 {
                 if let Ok(h) = u32::from_str_radix(hash_hex, 16) {
                     fnv1a.push((h, value_part.to_string()));
                 }
             }
         }
    }
    
    let mut file = fs::File::create(bin_path)?;
    file.write_all(b"HHSH")?;
    file.write_i32::<LittleEndian>(1)?; // version
    file.write_i32::<LittleEndian>(fnv1a.len() as i32)?;
    file.write_i32::<LittleEndian>(xxh64.len() as i32)?;
    
    for (hash, val) in fnv1a {
        file.write_u32::<LittleEndian>(hash)?;
        write_string(&mut file, &val)?;
    }
    
    for (hash, val) in xxh64 {
        file.write_u64::<LittleEndian>(hash)?;
        write_string(&mut file, &val)?;
    }
    
    Ok(())
}

fn write_string(writer: &mut impl Write, value: &str) -> std::io::Result<()> {
    let bytes = value.as_bytes();
    let mut val = bytes.len() as u32;
    
    // Write 7-bit encoded int
    loop {
        let mut byte = (val & 0x7F) as u8;
        val >>= 7;
        if val != 0 {
            byte |= 0x80;
        }
        writer.write_u8(byte)?;
        if val == 0 { break; }
    }
    
    writer.write_all(bytes)?;
    Ok(())
}

/// Preload hashes into RAM for instant bin file conversion
/// This uses the cached hash provider from ltk_bridge
#[tauri::command]
pub async fn preload_hashes() -> Result<PreloadStatus, String> {
    // Trigger cache initialization by accessing it
    let hashes = get_cached_bin_hashes().read();
    let total = hashes.total_count();
    
    Ok(PreloadStatus {
        loaded: true,
        loading: false,
        fnv_count: total,  // Combined count since ltk_ritobin uses different structure
        xxh_count: 0,
        memory_bytes: total * 64, // Estimate
    })
}

/// Check if hashes are preloaded
#[tauri::command]
pub async fn get_preload_status() -> PreloadStatus {
    let hashes = get_cached_bin_hashes().read();
    let total = hashes.total_count();
    
    PreloadStatus {
        loaded: total > 0,
        loading: false,
        fnv_count: total,
        xxh_count: 0,
        memory_bytes: total * 64,
    }
}

/// Unload preloaded hashes from memory
/// Note: With OnceLock cache, hashes can't be truly unloaded without restart
#[tauri::command]
pub async fn unload_hashes() -> Result<(), String> {
    // OnceLock doesn't support unloading - just return success
    println!("[HashCommands] Note: Hashes are cached globally and cannot be unloaded without restart");
    Ok(())
}

/// Convert existing text hash files to binary format
#[tauri::command]
pub async fn convert_hashes_to_binary() -> Result<Vec<String>, String> {
    let hash_dir = get_hash_dir()?;
    let mut converted = Vec::new();
    
    for filename in HASH_FILES {
        let txt_path = hash_dir.join(filename);
        let bin_path = hash_dir.join(filename.replace(".txt", ".bin"));
        
        // Only convert if text file exists and binary doesn't
        if txt_path.exists() && !bin_path.exists() {
            convert_text_to_binary(&txt_path, &bin_path)
                .map_err(|e| format!("Failed to convert {}: {}", filename, e))?;
            
            // Delete text file after successful conversion
            fs::remove_file(&txt_path)
                .map_err(|e| format!("Failed to delete text file {}: {}", filename, e))?;
            
            converted.push(filename.to_string());
        }
    }
    
    Ok(converted)
}
