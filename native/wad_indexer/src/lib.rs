use napi_derive::napi;
use rayon::prelude::*;
use std::fs;
use std::io::{Write, Cursor, Read, Seek};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::SystemTime;
use ltk_wad::Wad;
use xxhash_rust::xxh64::xxh64;
use napi::{Env, Task, bindgen_prelude::AsyncTask};
use heed::{Database, EnvOpenOptions};
use heed::types::{Bytes, Str};
use memmap2::Mmap;

// ── Global LMDB env cache ───────────────────────────────────────────────────
// Opened once per hash dir, reused for all reads.
// OS memory-maps the file — only physically pages in what's actually touched.
static LMDB_CACHE: OnceLock<Mutex<Option<(String, Arc<heed::Env>)>>> = OnceLock::new();

fn lmdb_mutex() -> &'static Mutex<Option<(String, Arc<heed::Env>)>> {
  LMDB_CACHE.get_or_init(|| Mutex::new(None))
}

fn get_or_open_env(hash_dir: &str) -> Option<Arc<heed::Env>> {
  let lmdb_dir = Path::new(hash_dir).join("hashes.lmdb");
  if !lmdb_dir.exists() { return None; }
  let key = lmdb_dir.to_string_lossy().into_owned();

  let mut g = lmdb_mutex().lock().unwrap_or_else(|e| e.into_inner());
  if let Some((ref k, ref env)) = *g {
    if *k == key { return Some(Arc::clone(env)); }
  }

  let env = match unsafe {
    EnvOpenOptions::new()
      .map_size(512 * 1024 * 1024) // 512MB virtual — OS pages in only accessed data
      .max_dbs(1)
      .open(&lmdb_dir)
  } {
    Ok(e) => e,
    Err(_) => return None,
  };
  let arc = Arc::new(env);
  *g = Some((key, Arc::clone(&arc)));
  Some(arc)
}

fn drop_lmdb_cache() {
  let mut g = lmdb_mutex().lock().unwrap_or_else(|e| e.into_inner());
  *g = None;
}

// ── napi structs ────────────────────────────────────────────────────────────

#[napi(object)]
pub struct WadIndexBatch {
  pub path: String,
  pub error: Option<String>,
  pub paths: Vec<String>,
  #[napi(js_name = "chunkCount")]
  pub chunk_count: u32,
}

#[napi(object)]
pub struct WadExtractResult {
  pub success: bool,
  pub error: Option<String>,
  #[napi(js_name = "extractedCount")]
  pub extracted_count: u32,
  #[napi(js_name = "skippedCount")]
  pub skipped_count: u32,
}

#[napi(object)]
#[derive(Clone)]
pub struct WadExtractItem {
  #[napi(js_name = "wadPath")]
  pub wad_path: String,
  #[napi(js_name = "pathHash")]
  pub path_hash: String,
  #[napi(js_name = "relPath")]
  pub rel_path: String,
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn is_safe_relative_path(path: &str) -> bool {
  let p = Path::new(path);
  if p.is_absolute() { return false; }
  for comp in p.components() {
    use std::path::Component;
    match comp {
      Component::ParentDir | Component::RootDir | Component::Prefix(_) => return false,
      _ => {}
    }
  }
  true
}

fn normalize_rel_path(v: &str) -> String {
  v.replace('\\', "/").trim_start_matches('/').to_string()
}

fn parse_hash_hex(s: &str) -> Option<u64> {
  let raw = s.trim().trim_start_matches("0x").trim_start_matches("0X");
  if raw.len() != 16 || !raw.bytes().all(|b| b.is_ascii_hexdigit()) { return None; }
  u64::from_str_radix(raw, 16).ok()
}

/// Resolve u64 hashes to paths using a single LMDB read txn.
/// Opens one txn per call — fast (microseconds per lookup after OS page warmup).
fn resolve_hashes_lmdb(hashes: &[u64], env: &heed::Env) -> Vec<String> {
  let rtxn = match env.read_txn() {
    Ok(t) => t,
    Err(_) => return hashes.iter().map(|h| format!("{:016x}", h)).collect(),
  };
  let db = match env.open_database::<Bytes, Str>(&rtxn, None) {
    Ok(Some(d)) => d,
    _ => return hashes.iter().map(|h| format!("{:016x}", h)).collect(),
  };
  hashes.iter().map(|h| {
    let key = h.to_be_bytes();
    db.get(&rtxn, &key[..])
      .ok().flatten()
      .map(|s| s.to_string())
      .unwrap_or_else(|| format!("{:016x}", h))
  }).collect()
}

/// Parse WAD TOC only — returns chunk hashes and count. No I/O beyond the TOC.
fn parse_wad_toc(wad_path: &str) -> Result<(Vec<u64>, u32), String> {
  let file = fs::File::open(wad_path)
    .map_err(|e| format!("Failed to open {}: {}", wad_path, e))?;
  let wad = Wad::mount(file)
    .map_err(|e| format!("Failed to mount {}: {}", wad_path, e))?;
  let chunk_count = wad.chunks().len() as u32;
  let hashes = wad.chunks().iter().map(|c| c.path_hash()).collect();
  Ok((hashes, chunk_count))
}

// ── buildHashDb ──────────────────────────────────────────────────────────────

/// Build (or update) hashes.lmdb from the text hash files.
/// Only rebuilds when a source file is newer than the existing LMDB.
/// Keys are u64 xxhash stored as 8-byte big-endian; values are path strings.
#[napi(js_name = "buildHashDb")]
pub fn build_hash_db(hash_dir: String) -> bool {
  let dir = Path::new(&hash_dir);
  let lmdb_dir = dir.join("hashes.lmdb");

  let sources: &[(&str, usize)] = &[
    ("hashes.game.txt", 16),
    ("hashes.lcu.txt",  16),
    ("hashes.extracted.txt", 16),
  ];

  // data.mdb is written on every successful commit — use its mtime as freshness marker
  let db_mtime: Option<SystemTime> = fs::metadata(lmdb_dir.join("data.mdb"))
    .and_then(|m| m.modified()).ok();

  let needs_rebuild = !lmdb_dir.exists() || sources.iter().any(|(name, _)| {
    let file_mtime = fs::metadata(dir.join(name)).and_then(|m| m.modified()).ok();
    match (db_mtime, file_mtime) {
      (Some(db_t), Some(f_t)) => f_t > db_t,
      (None, Some(_)) => true,
      _ => false,
    }
  });

  if !needs_rebuild { return true; }

  // Close cached env before deleting the directory (Windows won't delete open files)
  drop_lmdb_cache();

  if lmdb_dir.exists() && fs::remove_dir_all(&lmdb_dir).is_err() { return false; }
  if fs::create_dir_all(&lmdb_dir).is_err() { return false; }

  let env = match unsafe {
    EnvOpenOptions::new()
      .map_size(512 * 1024 * 1024)
      .max_dbs(1)
      .open(&lmdb_dir)
  } {
    Ok(e) => e,
    Err(_) => return false,
  };

  let mut wtxn = match env.write_txn() {
    Ok(t) => t,
    Err(_) => return false,
  };
  let db: Database<Bytes, Str> = match env.create_database(&mut wtxn, None) {
    Ok(d) => d,
    Err(_) => return false,
  };

  // Collect all entries across all sources, sort by key for fast MDB_APPEND-style insert
  let mut entries: Vec<([u8; 8], String)> = Vec::with_capacity(2_000_000);
  for (filename, sep) in sources {
    let file_path = dir.join(filename);
    let Ok(content) = fs::read_to_string(&file_path) else { continue };
    for line in content.lines() {
      if line.len() <= sep + 1 || line.starts_with('#') { continue; }
      let hash_hex = &line[..*sep];
      let path = line[*sep + 1..].trim_end_matches('\r');
      let Ok(hash_u64) = u64::from_str_radix(hash_hex, 16) else { continue };
      entries.push((hash_u64.to_be_bytes(), path.to_string()));
    }
  }

  // Sort by key — LMDB B-tree is ordered so sorted inserts are ~2x faster
  entries.sort_unstable_by_key(|(k, _)| *k);
  entries.dedup_by_key(|(k, _)| *k);

  for (key, path) in &entries {
    if db.put(&mut wtxn, key.as_slice(), path.as_str()).is_err() {
      return false;
    }
  }

  wtxn.commit().is_ok()
}

#[napi(js_name = "primeHashTables")]
pub fn prime_hash_tables(hash_path: String) -> bool {
  build_hash_db(hash_path)
}

/// Clear the cached LMDB env — drops it from memory. Frees any mmap'd pages.
#[napi(js_name = "clearHashTables")]
pub fn clear_hash_tables() {
  drop_lmdb_cache();
}

// ── loadAllIndexes ───────────────────────────────────────────────────────────

#[napi(js_name = "loadAllIndexes")]
pub fn load_all_indexes(
  wad_paths: Vec<String>,
  hash_path: Option<String>,
  concurrency: Option<u32>,
) -> Vec<WadIndexBatch> {
  if wad_paths.is_empty() { return Vec::new(); }

  // Phase 1: parallel WAD TOC parsing — I/O bound, benefits from Rayon
  let make_tocs = || {
    wad_paths.par_iter()
      .map(|p| (p.as_str(), parse_wad_toc(p)))
      .collect::<Vec<_>>()
  };

  let toc_results: Vec<(&str, Result<(Vec<u64>, u32), String>)> = {
    if let Some(c) = concurrency {
      let threads = (c as usize).clamp(1, 32);
      if let Ok(pool) = rayon::ThreadPoolBuilder::new().num_threads(threads).build() {
        pool.install(make_tocs)
      } else {
        make_tocs()
      }
    } else {
      make_tocs()
    }
  };

  // Phase 2: LMDB lookups — single open env, per-WAD read txns (cheap)
  // RAM stays near zero — OS only pages in what's touched (~5-20MB for typical use)
  let env_opt = hash_path.as_deref().and_then(get_or_open_env);

  toc_results.into_iter().map(|(path, result)| {
    match result {
      Err(e) => WadIndexBatch {
        path: path.to_string(),
        error: Some(e),
        paths: Vec::new(),
        chunk_count: 0,
      },
      Ok((hashes, chunk_count)) => {
        let paths = match env_opt.as_deref() {
          Some(env) => resolve_hashes_lmdb(&hashes, env),
          None => hashes.iter().map(|h| format!("{:016x}", h)).collect(),
        };
        WadIndexBatch {
          path: path.to_string(),
          error: None,
          paths,
          chunk_count,
        }
      }
    }
  }).collect()
}

// ── resolveHashes ────────────────────────────────────────────────────────────

/// Resolve hex hash strings to paths using LMDB point lookups.
/// ~1-5ms for a typical WAD (~4000 hashes) vs 80-155ms with the old SQLite approach.
#[napi(js_name = "resolveHashes")]
pub fn resolve_hashes(hex_hashes: Vec<String>, hash_dir: String) -> Vec<String> {
  let Some(env) = get_or_open_env(&hash_dir) else {
    return hex_hashes;
  };
  let Ok(rtxn) = env.read_txn() else { return hex_hashes; };
  let Ok(Some(db)) = env.open_database::<Bytes, Str>(&rtxn, None) else { return hex_hashes; };

  hex_hashes.iter().map(|h| {
    let Ok(hash_u64) = u64::from_str_radix(h.trim(), 16) else { return h.clone(); };
    let key = hash_u64.to_be_bytes();
    db.get(&rtxn, &key[..])
      .ok().flatten()
      .map(|s| s.to_string())
      .unwrap_or_else(|| h.clone())
  }).collect()
}

// ── extractWad ───────────────────────────────────────────────────────────────

#[napi(js_name = "extractWad")]
pub fn extract_wad(
  wad_path: String,
  output_dir: String,
  hash_path: Option<String>,
  replace_existing: Option<bool>,
) -> WadExtractResult {
  if wad_path.is_empty() || !Path::new(&wad_path).exists() {
    return WadExtractResult {
      success: false,
      error: Some(format!("WAD file not found: {}", wad_path)),
      extracted_count: 0,
      skipped_count: 0,
    };
  }
  if output_dir.is_empty() {
    return WadExtractResult {
      success: false,
      error: Some("Output directory is required".to_string()),
      extracted_count: 0,
      skipped_count: 0,
    };
  }
  if let Err(e) = fs::create_dir_all(&output_dir) {
    return WadExtractResult {
      success: false,
      error: Some(format!("Failed to create output directory: {}", e)),
      extracted_count: 0,
      skipped_count: 0,
    };
  }

  let replace = replace_existing.unwrap_or(true);
  let env_opt = hash_path.as_deref().and_then(get_or_open_env);

  let file = match fs::File::open(&wad_path) {
    Ok(f) => f,
    Err(e) => return WadExtractResult {
      success: false,
      error: Some(format!("Failed to open WAD: {}", e)),
      extracted_count: 0,
      skipped_count: 0,
    },
  };
  let mmap = match unsafe { Mmap::map(&file) } {
    Ok(m) => m,
    Err(e) => return WadExtractResult {
      success: false,
      error: Some(format!("Failed to mmap WAD: {}", e)),
      extracted_count: 0,
      skipped_count: 0,
    },
  };

  let wad = match Wad::mount(Cursor::new(&mmap[..])) {
    Ok(w) => w,
    Err(e) => return WadExtractResult {
      success: false,
      error: Some(format!("Failed to mount WAD: {}", e)),
      extracted_count: 0,
      skipped_count: 0,
    },
  };

  let chunks: Vec<_> = wad.chunks().iter().map(|c| *c).collect();
  let hash_u64s: Vec<u64> = chunks.iter().map(|c| c.path_hash()).collect();
  let resolved_paths: Vec<String> = match env_opt.as_deref() {
    Some(env) => resolve_hashes_lmdb(&hash_u64s, env),
    None => hash_u64s.iter().map(|h| format!("{:016x}", h)).collect(),
  };

  let mut extracted_count: u32 = 0;
  let mut skipped_count: u32 = 0;
  let output_root = Path::new(&output_dir);
  let mut hashed_files: HashMap<String, String> = HashMap::new();

  // 1. Pre-process metadata and directories SEQUENTIALLY to avoid thread fighting
  let mut extraction_plan = Vec::new();
  let mut parents_to_create = HashSet::new();

  for (chunk, resolved) in chunks.into_iter().zip(resolved_paths.into_iter()) {
    let mut rel = normalize_rel_path(&resolved);
    if !is_safe_relative_path(&rel) { skipped_count += 1; continue; }

    let mut out_path = output_root.join(&rel);
    let file_name = out_path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    
    // Minimal disk hits: only check if we need to hash the path
    let should_be_hashed = file_name.len() > 255 || (out_path.exists() && out_path.is_dir());
    
    if should_be_hashed {
      let ext = if rel.contains('.') { format!(".{}", rel.split('.').last().unwrap_or("")) } else { "".to_string() };
      let hex_hash = format!("{:016x}", chunk.path_hash() as u64);
      let basename = format!("{}{}", hex_hash, ext);
      hashed_files.insert(basename.clone(), resolved.to_string());
      rel = basename;
      out_path = output_root.join(&rel);
    }

    if out_path.exists() && !replace { skipped_count += 1; continue; }

    if let Some(parent) = out_path.parent() {
      parents_to_create.insert(parent.to_path_buf());
    }

    extraction_plan.push((chunk, out_path));
  }

  // Batch create directories
  for parent in parents_to_create {
    let _ = fs::create_dir_all(parent);
  }

  // 2. Parallel Extraction: No more filesystem fighting!
  let mmap_ref = &mmap;
  let thread_results: Vec<(u32, u32)> = extraction_plan
    .par_chunks((extraction_plan.len() / rayon::current_num_threads().max(1)).max(1))
    .map(|slice| {
      let mut e = 0;
      let mut s = 0;
      let mut local_wad = match Wad::mount(Cursor::new(&mmap_ref[..])) {
        Ok(w) => w,
        Err(_) => return (0, slice.len() as u32),
      };

      for (chunk, out_path) in slice {
        let data = match local_wad.load_chunk_decompressed(chunk) {
          Ok(d) => d,
          Err(_) => { s += 1; continue; }
        };
        // Simple write_all - binary writing is fast, directory is already there.
        if fs::write(out_path, &data).is_ok() {
          e += 1;
        } else {
          s += 1;
        }
      }
      (e, s)
    })
    .collect();

  for (e, s) in thread_results {
    extracted_count += e;
    skipped_count += s;
  }

  if !hashed_files.is_empty() {
    let json_path = output_root.join("hashed_files.json");
    let mut existing: HashMap<String, String> = HashMap::new();
    if let Ok(content) = fs::read_to_string(&json_path) {
        if let Ok(map) = serde_json::from_str(&content) {
            existing = map;
        }
    }
    existing.extend(hashed_files);
    if let Ok(json) = serde_json::to_string_pretty(&existing) {
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        if let Ok(mut f) = opts.open(&json_path) {
            let _ = f.write_all(json.as_bytes());
        }
    }
  }

  WadExtractResult { success: true, error: None, extracted_count, skipped_count }
}

pub struct ExtractWadTask {
  wad_path: String,
  output_dir: String,
  hash_path: Option<String>,
  replace_existing: Option<bool>,
}

#[napi]
impl Task for ExtractWadTask {
  type Output = WadExtractResult;
  type JsValue = WadExtractResult;

  fn compute(&mut self) -> napi::Result<Self::Output> {
    Ok(extract_wad(
      self.wad_path.clone(),
      self.output_dir.clone(),
      self.hash_path.clone(),
      self.replace_existing,
    ))
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "extractWadAsync")]
pub fn extract_wad_async(
  wad_path: String,
  output_dir: String,
  hash_path: Option<String>,
  replace_existing: Option<bool>,
) -> AsyncTask<ExtractWadTask> {
  AsyncTask::new(ExtractWadTask {
    wad_path,
    output_dir,
    hash_path,
    replace_existing,
  })
}

// ── extractSelected ──────────────────────────────────────────────────────────

pub struct ExtractSelectedTask {
  items: Vec<WadExtractItem>,
  output_dir: String,
  replace_existing: Option<bool>,
}

#[napi]
impl Task for ExtractSelectedTask {
  type Output = WadExtractResult;
  type JsValue = WadExtractResult;

  fn compute(&mut self) -> napi::Result<Self::Output> {
    Ok(extract_selected(
      self.items.clone(),
      self.output_dir.clone(),
      self.replace_existing,
    ))
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "extractSelectedAsync")]
pub fn extract_selected_async(
  items: Vec<WadExtractItem>,
  output_dir: String,
  replace_existing: Option<bool>,
) -> AsyncTask<ExtractSelectedTask> {
  AsyncTask::new(ExtractSelectedTask {
    items,
    output_dir,
    replace_existing,
  })
}

#[napi(js_name = "extractSelected")]
pub fn extract_selected(
  items: Vec<WadExtractItem>,
  output_dir: String,
  replace_existing: Option<bool>,
) -> WadExtractResult {
  if output_dir.is_empty() {
    return WadExtractResult {
      success: false,
      error: Some("Output directory is required".to_string()),
      extracted_count: 0,
      skipped_count: 0,
    };
  }
  if let Err(e) = fs::create_dir_all(&output_dir) {
    return WadExtractResult {
      success: false,
      error: Some(format!("Failed to create output directory: {}", e)),
      extracted_count: 0,
      skipped_count: 0,
    };
  }
  if items.is_empty() {
    return WadExtractResult { success: true, error: None, extracted_count: 0, skipped_count: 0 };
  }

  let replace = replace_existing.unwrap_or(true);
  let output_root = Path::new(&output_dir);
  let mut extracted_count: u32 = 0;
  let mut skipped_count: u32 = 0;
  let mut hashed_files: HashMap<String, String> = HashMap::new();

  let mut grouped: HashMap<String, Vec<(u64, String)>> = HashMap::new();
  for item in items {
    if item.wad_path.is_empty() || item.rel_path.is_empty() { skipped_count += 1; continue; }
    let Some(hash) = parse_hash_hex(&item.path_hash) else { skipped_count += 1; continue; };
    let rel = normalize_rel_path(&item.rel_path);
    if !is_safe_relative_path(&rel) { skipped_count += 1; continue; }
    grouped.entry(item.wad_path).or_default().push((hash, rel));
  }

  for (wad_path, entries) in grouped {
    if !Path::new(&wad_path).exists() { skipped_count += entries.len() as u32; continue; }
    let file = match fs::File::open(&wad_path) {
      Ok(f) => f,
      Err(_) => { skipped_count += entries.len() as u32; continue; }
    };
    let mmap = match unsafe { Mmap::map(&file) } {
      Ok(m) => m,
      Err(_) => { skipped_count += entries.len() as u32; continue; }
    };
    let wad = match Wad::mount(Cursor::new(&mmap[..])) {
      Ok(w) => w,
      Err(_) => { skipped_count += entries.len() as u32; continue; }
    };

    let mut extraction_plan = Vec::new();
    let mut parents_to_create = HashSet::new();

    for (path_hash, rel_path) in entries {
      let Some(chunk) = wad.chunks().get(path_hash).copied() else { skipped_count += 1; continue; };
      let mut rel = rel_path.clone();
      let mut out_path = output_root.join(&rel);

      let file_name = out_path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
      let should_be_hashed = file_name.len() > 255 || (out_path.exists() && out_path.is_dir());

      if should_be_hashed {
        let ext = if rel.contains('.') { format!(".{}", rel.split('.').last().unwrap_or("")) } else { "".to_string() };
        let hex_hash = format!("{:016x}", chunk.path_hash() as u64);
        let basename = format!("{}{}", hex_hash, ext);
        hashed_files.insert(basename.clone(), rel_path.clone());
        rel = basename;
        out_path = output_root.join(&rel);
      }

      if out_path.exists() && !replace { skipped_count += 1; continue; }
      
      if let Some(parent) = out_path.parent() {
        parents_to_create.insert(parent.to_path_buf());
      }
      extraction_plan.push((chunk, out_path));
    }

    for p in parents_to_create { let _ = fs::create_dir_all(p); }

    let mmap_ref = &mmap;
    let results: Vec<(u32, u32)> = extraction_plan
      .par_chunks((extraction_plan.len() / rayon::current_num_threads().max(1)).max(1))
      .map(|slice| {
        let mut e = 0;
        let mut s = 0;
        let mut local_wad = match Wad::mount(Cursor::new(&mmap_ref[..])) {
          Ok(w) => w,
          Err(_) => return (0, slice.len() as u32),
        };
        for (chunk, out_path) in slice {
          let data = match local_wad.load_chunk_decompressed(chunk) {
            Ok(d) => d,
            Err(_) => { s += 1; continue; }
          };
          if fs::write(out_path, &data).is_ok() { e += 1; } else { s += 1; }
        }
        (e, s)
      })
      .collect();

    for (e, s) in results {
      extracted_count += e;
      skipped_count += s;
    }
  }

  if !hashed_files.is_empty() {
    let json_path = output_root.join("hashed_files.json");
    let mut existing: HashMap<String, String> = HashMap::new();
    if let Ok(content) = fs::read_to_string(&json_path) {
        if let Ok(map) = serde_json::from_str(&content) {
            existing = map;
        }
    }
    existing.extend(hashed_files);
    if let Ok(json) = serde_json::to_string_pretty(&existing) {
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        if let Ok(mut f) = opts.open(&json_path) {
            let _ = f.write_all(json.as_bytes());
        }
    }
  }

  WadExtractResult { success: true, error: None, extracted_count, skipped_count }
}

// ── Hash extraction ──────────────────────────────────────────────────────────

#[napi(object)]
pub struct ExtractHashesResult {
  pub success: bool,
  pub error: Option<String>,
  #[napi(js_name = "newHashCount")]
  pub new_hash_count: u32,
}

const PATH_PREFIXES: &[&[u8]] = &[
  b"assets/", b"data/", b"maps/", b"levels/",
  b"clientstates/", b"ux/", b"uiautoatlas/",
];

fn xxhash_path(s: &str) -> u64 { xxh64(s.as_bytes(), 0) }

fn fnv1a_lower(s: &str) -> u32 {
  let mut h: u32 = 0x811c9dc5;
  for b in s.bytes().map(|b| b.to_ascii_lowercase()) {
    h ^= b as u32;
    h = h.wrapping_mul(0x01000193);
  }
  h
}

fn scan_bin_game_hashes(data: &[u8]) -> Vec<(u64, String)> {
  if data.len() < 4 { return vec![]; }
  if &data[..4] != b"PROP" && &data[..4] != b"PTCH" { return vec![]; }
  let mut results = Vec::new();
  let mut i = 0usize;
  while i + 2 <= data.len() {
    let len = u16::from_le_bytes([data[i], data[i + 1]]) as usize;
    if len >= 8 && len <= 300 {
      if let Some(slice) = data.get(i + 2..i + 2 + len) {
        if let Ok(s) = std::str::from_utf8(slice) {
          let lb = s.as_bytes();
          let is_path = s.contains('/') && s.is_ascii()
            && PATH_PREFIXES.iter().any(|p| lb.len() >= p.len() && lb[..p.len()].eq_ignore_ascii_case(p));
          if is_path {
            let lower = s.to_ascii_lowercase();
            results.push((xxhash_path(&lower), lower.clone()));
            if lower.ends_with(".dds") {
              let slash = lower.rfind('/').map(|i| i + 1).unwrap_or(0);
              let dir = &lower[..slash];
              let fname = &lower[slash..];
              let v2x = format!("{}2x_{}", dir, fname);
              let v4x = format!("{}4x_{}", dir, fname);
              results.push((xxhash_path(&v2x), v2x));
              results.push((xxhash_path(&v4x), v4x));
            }
            if lower.ends_with(".bin") {
              let py = format!("{}.py", &lower[..lower.len() - 4]);
              results.push((xxhash_path(&py), py));
            }
            i += 2 + len;
            continue;
          }
        }
      }
    }
    i += 1;
  }
  results
}

fn scan_skn_bin_hashes(data: &[u8]) -> Vec<(u32, String)> {
  if data.len() < 12 { return vec![]; }
  let magic = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
  if magic != 0x00112233 { return vec![]; }
  let major = u16::from_le_bytes([data[4], data[5]]);
  if major == 0 { return vec![]; }
  let range_count = u32::from_le_bytes([data[8], data[9], data[10], data[11]]) as usize;
  if range_count == 0 || range_count > 256 { return vec![]; }
  let mut results = Vec::with_capacity(range_count);
  let mut pos = 12usize;
  for _ in 0..range_count {
    if pos + 80 > data.len() { break; }
    let name_bytes = &data[pos..pos + 64];
    let null_pos = name_bytes.iter().position(|&b| b == 0).unwrap_or(64);
    if let Ok(name) = std::str::from_utf8(&name_bytes[..null_pos]) {
      if !name.is_empty() { results.push((fnv1a_lower(name), name.to_string())); }
    }
    pos += 80;
  }
  results
}

fn parse_hash_value(s: &str) -> Option<u64> {
  if let Some(hex) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
    return u64::from_str_radix(hex, 16).ok();
  }
  if s.bytes().all(|b| b.is_ascii_digit()) { return s.parse::<u64>().ok(); }
  if s.bytes().all(|b| b.is_ascii_hexdigit()) { return u64::from_str_radix(s, 16).ok(); }
  None
}

/// Extract hashes from all BIN/SKN chunks inside a WAD file.
/// Writes discovered hashes to `hash_dir/hashes.extracted.txt` and updates LMDB directly.
#[napi(js_name = "extractHashesFromWad")]
pub fn extract_hashes_from_wad(wad_path: String, hash_dir: Option<String>) -> ExtractHashesResult {
  if wad_path.is_empty() || !Path::new(&wad_path).exists() {
    return ExtractHashesResult {
      success: false,
      error: Some(format!("WAD not found: {}", wad_path)),
      new_hash_count: 0,
    };
  }

  let file = match fs::File::open(&wad_path) {
    Ok(f) => f,
    Err(e) => return ExtractHashesResult { success: false, error: Some(e.to_string()), new_hash_count: 0 },
  };
  let mut wad = match Wad::mount(file) {
    Ok(w) => w,
    Err(e) => return ExtractHashesResult { success: false, error: Some(e.to_string()), new_hash_count: 0 },
  };

  let chunks: Vec<_> = wad.chunks().iter().copied().collect();
  let mut chunk_data: Vec<Vec<u8>> = Vec::with_capacity(chunks.len());
  for chunk in &chunks {
    chunk_data.push(wad.load_chunk_decompressed(chunk).map(|b| b.to_vec()).unwrap_or_default());
  }

  let game_hashes: HashMap<u64, String> = chunk_data
    .par_iter()
    .flat_map(|data| scan_bin_game_hashes(data))
    .fold(HashMap::new, |mut m, (k, v)| { m.entry(k).or_insert(v); m })
    .reduce(HashMap::new, |mut a, b| { for (k, v) in b { a.entry(k).or_insert(v); } a });

  let bin_hashes: HashMap<u32, String> = chunk_data
    .par_iter()
    .flat_map(|data| scan_skn_bin_hashes(data))
    .fold(HashMap::new, |mut m, (k, v)| { m.entry(k).or_insert(v); m })
    .reduce(HashMap::new, |mut a, b| { for (k, v) in b { a.entry(k).or_insert(v); } a });

  let new_count = (game_hashes.len() + bin_hashes.len()) as u32;

  if let Some(ref dir) = hash_dir {
    let dir_path = Path::new(dir);
    let _ = fs::create_dir_all(dir_path);

    // --- hashes.extracted.txt ---
    let game_path = dir_path.join("hashes.extracted.txt");
    let mut existing_game: HashMap<u64, String> = HashMap::new();
    if let Ok(content) = fs::read_to_string(&game_path) {
      for line in content.lines() {
        if let Some((h, p)) = line.split_once(' ') {
          if let Some(hash) = parse_hash_value(h) {
            existing_game.insert(hash, p.to_string());
          }
        }
      }
    }
    for (k, v) in &game_hashes { existing_game.entry(*k).or_insert_with(|| v.clone()); }
    let mut game_entries: Vec<_> = existing_game.iter().collect();
    game_entries.sort_by(|a, b| a.1.cmp(b.1));
    let mut game_out = String::with_capacity(game_entries.len() * 60);
    for (hash, path) in &game_entries {
      use std::fmt::Write as FmtWrite;
      let _ = writeln!(game_out, "{:016x} {}", hash, path);
    }
    let _ = fs::write(&game_path, game_out.as_bytes());

    // --- hashes.binhashes.extracted.txt ---
    if !bin_hashes.is_empty() {
      let bin_path = dir_path.join("hashes.binhashes.extracted.txt");
      let mut existing_bin: HashMap<u32, String> = HashMap::new();
      if let Ok(content) = fs::read_to_string(&bin_path) {
        for line in content.lines() {
          if let Some((h, p)) = line.split_once(' ') {
            if let Ok(hash) = u32::from_str_radix(h.trim_start_matches("0x"), 16) {
              existing_bin.insert(hash, p.to_string());
            }
          }
        }
      }
      for (k, v) in &bin_hashes { existing_bin.entry(*k).or_insert_with(|| v.clone()); }
      let mut bin_entries: Vec<_> = existing_bin.iter().collect();
      bin_entries.sort_by(|a, b| a.1.cmp(b.1));
      let mut bin_out = String::with_capacity(bin_entries.len() * 40);
      for (hash, name) in &bin_entries {
        use std::fmt::Write as FmtWrite;
        let _ = writeln!(bin_out, "{:08x} {}", hash, name);
      }
      let _ = fs::write(&bin_path, bin_out.as_bytes());
    }

    // --- Update LMDB directly with the new game hashes ---
    // If LMDB exists: open a write txn and insert. Existing readers see old data until txn commits (MVCC).
    // If LMDB doesn't exist: skip — buildHashDb will pick up the txt file on next primeWad call.
    let lmdb_dir = dir_path.join("hashes.lmdb");
    if lmdb_dir.exists() {
      // Use cached env or open fresh for write
      let env_opt = get_or_open_env(dir);
      if let Some(env) = env_opt {
        if let Ok(mut wtxn) = env.write_txn() {
          // create_database is idempotent — returns existing DB if already created
          if let Ok(db) = env.create_database::<Bytes, Str>(&mut wtxn, None) {
            for (hash_u64, path) in &game_hashes {
              let key = hash_u64.to_be_bytes();
              let _ = db.put(&mut wtxn, key.as_slice(), path.as_str());
            }
            let _ = wtxn.commit();
          }
        }
      }
    }
  }

  ExtractHashesResult { success: true, error: None, new_hash_count: new_count }
}

// ── Ritobin Conversion ───────────────────────────────────────────────────────

use ltk_meta::Bin;
use ltk_ritobin::{parse, write_with_hashes, HashMapProvider};
use std::io::{BufReader, BufWriter};

#[napi(js_name = "binToPy")]
pub fn bin_to_py(bin_path: String, py_path: String, hash_dir: Option<String>) -> bool {
  let file = match fs::File::open(&bin_path) {
    Ok(f) => f,
    Err(e) => {
      eprintln!("binToPy: failed to open bin file {}: {}", bin_path, e);
      return false;
    }
  };
  let mut reader = BufReader::new(file);
  let tree = match Bin::from_reader(&mut reader) {
    Ok(t) => t,
    Err(e) => {
      eprintln!("binToPy: failed to parse bin file: {:?}", e);
      return false;
    }
  };

  let mut hashes = HashMapProvider::new();
  if let Some(dir) = hash_dir {
    let p = Path::new(&dir);
    if p.exists() {
      hashes.load_from_directory(p);
    }
  }

  let text = match write_with_hashes(&tree, &hashes) {
    Ok(t) => t,
    Err(e) => {
      eprintln!("binToPy: failed to format ritobin string: {:?}", e);
      return false;
    }
  };

  if let Err(e) = fs::write(&py_path, text) {
    eprintln!("binToPy: failed to write to py file {}: {}", py_path, e);
    return false;
  }

  true
}

#[napi(js_name = "pyToBin")]
pub fn py_to_bin(py_path: String, bin_path: String) -> bool {
  let text = match fs::read_to_string(&py_path) {
    Ok(t) => t,
    Err(e) => {
      eprintln!("pyToBin: failed to read py file {}: {}", py_path, e);
      return false;
    }
  };

  let file_ast = match parse(&text) {
    Ok(ast) => ast,
    Err(e) => {
      eprintln!("pyToBin: failed to parse ritobin py file: {:?}", e);
      return false;
    }
  };

  let tree = file_ast.to_bin_tree();

  let out_file = match fs::File::create(&bin_path) {
    Ok(f) => f,
    Err(e) => {
      eprintln!("pyToBin: failed to create bin file {}: {}", bin_path, e);
      return false;
    }
  };
  let mut writer = BufWriter::new(out_file);
  if let Err(e) = tree.to_writer(&mut writer) {
    eprintln!("pyToBin: failed to write bin stream: {}", e);
    return false;
  }

  true
}
