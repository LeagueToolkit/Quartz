/* Stage a VFX Hub system (a decompiled .py plus its assets, downloaded from the
GitHub hub) into a temporary donor tree so the Port donor session (`vfx_open`)
can load it and resolve its assets exactly like a game-extracted donor. The
temp root is handed back so the Port page can clean it up on close, matching the
Load-Donor-From-Game flow. */

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubAssetBytes {
    pub rel_path: String,
    pub base64: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedDonor {
    pub temp_root: String,
    /// Path to the compiled donor .bin (vfx_open rejects .py, so hub .py content
    /// is converted to a .bin here).
    pub bin_path: String,
}

/// Normalize an asset rel path to a SAFE relative path under the tree's
/// `assets/` root. Strips a leading `assets/`/`ASSETS/`, then drops any drive
/// prefix, absolute-root, and `.`/`..` segments so a hostile hub entry can
/// never escape the staging dir (path traversal / arbitrary write). Returns
/// None if nothing safe remains.
fn asset_dest_rel(rel: &str) -> Option<String> {
    let r = rel.replace('\\', "/");
    let stripped = r
        .strip_prefix("assets/")
        .or_else(|| r.strip_prefix("ASSETS/"))
        .unwrap_or(&r);

    let safe: Vec<&str> = stripped
        .split('/')
        .filter(|seg| {
            // Reject empty (leading `/`, doubled `//`), current/parent refs, and
            // any Windows drive component like `C:`.
            !seg.is_empty() && *seg != "." && *seg != ".." && !seg.contains(':')
        })
        .collect();

    if safe.is_empty() {
        None
    } else {
        Some(safe.join("/"))
    }
}

/// Write the donor `.py` and asset bytes into a fresh temp tree:
///   <temp_root>/data/donor.py
///   <temp_root>/assets/<rel-without-assets-prefix>
/// so `vfx_open(py_path)` finds the assets beside the bin's mod root.
#[tauri::command]
pub fn port_stage_hub_donor(
    bin_base64: String,
    assets: Vec<HubAssetBytes>,
) -> Result<StagedDonor, String> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let root = std::env::temp_dir().join(format!("quartz_hub_donor_{nanos}"));
    let data_dir = root.join("data");
    let assets_dir = root.join("assets");
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("mkdir data: {e}"))?;
    std::fs::create_dir_all(&assets_dir).map_err(|e| format!("mkdir assets: {e}"))?;

    // Hub systems are compiled .bin files (Vfx-Hub-Rust), so write the bin bytes
    // straight to disk for vfx_open. No conversion needed.
    let bin_bytes = base64::engine::general_purpose::STANDARD
        .decode(bin_base64.as_bytes())
        .map_err(|e| format!("decode donor bin: {e}"))?;
    let bin_path = data_dir.join("donor.bin");
    std::fs::write(&bin_path, &bin_bytes).map_err(|e| format!("write bin: {e}"))?;

    for a in &assets {
        // Reject anything that doesn't sanitize to a safe relative path.
        let Some(rel) = asset_dest_rel(&a.rel_path) else {
            continue;
        };
        let dest = assets_dir.join(&rel);
        // Defense in depth: the normalized dest must still live under assets_dir.
        if !dest.starts_with(&assets_dir) {
            continue;
        }
        if let Some(parent) = dest.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        // A single bad/undownloadable asset is non-fatal: porting already warns
        // on missing assets, so skip and continue.
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(a.base64.as_bytes()) {
            let _ = std::fs::write(&dest, bytes);
        }
    }

    Ok(StagedDonor {
        temp_root: root.to_string_lossy().into_owned(),
        bin_path: bin_path.to_string_lossy().into_owned(),
    })
}

// ── Upload: prepare a target system for the hub (repath to ASSETS/vfxhub) ────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HubUploadAsset {
    /// Basename under assets/vfxhub/, e.g. "Foo.dds".
    pub name: String,
    pub base64: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedHubUpload {
    pub bin_base64: String,
    pub emitters: u32,
    pub assets: Vec<HubUploadAsset>,
    pub missing: Vec<String>,
}

/// Rewrite every asset reference in `text` to ASSETS/vfxhub/<basename>, keeping
/// the basename. Returns the rewritten text plus the set of original refs seen.
fn repath_assets_to_vfxhub(text: &str) -> (String, Vec<String>) {
    // Matches the quoted string value of the common asset-bearing fields, plus
    // any bare quoted path ending in a known asset extension.
    let mut refs: Vec<String> = Vec::new();
    let mut out = String::with_capacity(text.len());
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'"' {
            // Read the quoted string.
            let start = i + 1;
            let mut j = start;
            while j < bytes.len() && bytes[j] != b'"' {
                j += 1;
            }
            if j < bytes.len() {
                let s = &text[start..j];
                let lower = s.to_lowercase();
                let is_asset = lower.ends_with(".dds")
                    || lower.ends_with(".tex")
                    || lower.ends_with(".png")
                    || lower.ends_with(".scb")
                    || lower.ends_with(".sco")
                    || lower.ends_with(".skn")
                    || lower.ends_with(".skl")
                    || lower.ends_with(".anm");
                // Only repath asset-looking strings that carry a path separator
                // or an ASSETS/ prefix (skip plain names used as ids).
                if is_asset && (s.contains('/') || s.contains('\\')) {
                    let base = s.rsplit(['/', '\\']).next().unwrap_or(s);
                    refs.push(s.to_string());
                    out.push('"');
                    out.push_str(&format!("ASSETS/vfxhub/{base}"));
                    out.push('"');
                    i = j + 1;
                    continue;
                }
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    (out, refs)
}

/// Find the mod root (dir holding the data/ or assets/ tree) for a bin path.
fn mod_root(bin_path: &Path) -> Option<PathBuf> {
    let mut cur = bin_path.parent();
    while let Some(dir) = cur {
        let seg = dir
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase());
        if matches!(seg.as_deref(), Some("data") | Some("assets")) {
            return dir.parent().map(|p| p.to_path_buf());
        }
        cur = dir.parent();
    }
    bin_path.parent().map(|p| p.to_path_buf())
}

/// Resolve an asset ref (e.g. "ASSETS/skin.../Foo.dds") to a file under the mod
/// root, tolerating case + assets/ASSETS depth. Basename fallback last.
fn resolve_asset(root: &Path, rel: &str) -> Option<PathBuf> {
    let norm = rel.replace('\\', "/");
    let no_prefix = norm
        .strip_prefix("ASSETS/")
        .or_else(|| norm.strip_prefix("assets/"))
        .unwrap_or(&norm);
    let candidates = [
        root.join(&norm),
        root.join(no_prefix),
        root.join("assets").join(no_prefix),
        root.join("ASSETS").join(no_prefix),
    ];
    for c in candidates {
        if c.is_file() {
            return Some(c);
        }
    }
    // Basename walk (case-insensitive) as a last resort.
    let want = Path::new(&norm)
        .file_name()?
        .to_string_lossy()
        .to_lowercase();
    walk_find(root, &want, 0)
}

fn walk_find(dir: &Path, want_lower: &str, depth: u32) -> Option<PathBuf> {
    if depth > 6 {
        return None;
    }
    let entries = std::fs::read_dir(dir).ok()?;
    let mut subdirs = Vec::new();
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            subdirs.push(p);
        } else if p
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase() == want_lower)
            .unwrap_or(false)
        {
            return Some(p);
        }
    }
    for sd in subdirs {
        if let Some(hit) = walk_find(&sd, want_lower, depth + 1) {
            return Some(hit);
        }
    }
    None
}

/// Prepare a target system for upload: isolate it, repath its assets to
/// ASSETS/vfxhub/<basename>, recompile to a .bin, and collect the referenced
/// asset files from the target's mod tree. All bin-native (no .py leaves here).
#[tauri::command]
pub fn port_prepare_hub_upload(
    bin_path: String,
    system_content: String,
) -> Result<PreparedHubUpload, String> {
    // Repath the system's asset refs, then wrap + compile to a .bin.
    let (repathed, refs) = repath_assets_to_vfxhub(&system_content);
    let doc = format!(
        "#PROP_text\nversion: u32 = 3\nlinked: list[string] = {{\n}}\nentries: map[hash,embed] = {{\n{repathed}\n}}\n"
    );
    let tree =
        quartz_lib::bin::text_to_tree(&doc).map_err(|e| format!("compile upload bin: {e}"))?;
    let bin_bytes =
        quartz_lib::bin::write_bin(&tree).map_err(|e| format!("write upload bin: {e}"))?;
    let bin_base64 = base64::engine::general_purpose::STANDARD.encode(&bin_bytes);
    let emitters = system_content.matches("VfxEmitterDefinitionData").count() as u32;

    // Resolve each referenced asset file from the target's mod tree.
    let root = mod_root(Path::new(&bin_path)).ok_or("Could not locate target mod root")?;
    let mut assets = Vec::new();
    let mut missing = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for r in refs {
        let base = r.rsplit(['/', '\\']).next().unwrap_or(&r).to_string();
        if !seen.insert(base.to_lowercase()) {
            continue;
        }
        match resolve_asset(&root, &r) {
            Some(path) => match std::fs::read(&path) {
                Ok(bytes) => assets.push(HubUploadAsset {
                    name: base,
                    base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
                }),
                Err(_) => missing.push(base),
            },
            None => missing.push(base),
        }
    }

    Ok(PreparedHubUpload {
        bin_base64,
        emitters,
        assets,
        missing,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repath_rewrites_asset_refs_to_vfxhub() {
        let src = r#"texture: string = "ASSETS/skin30_samira_particles/Foo.dds""#;
        let (out, refs) = repath_assets_to_vfxhub(src);
        assert!(out.contains(r#""ASSETS/vfxhub/Foo.dds""#));
        assert_eq!(refs, vec!["ASSETS/skin30_samira_particles/Foo.dds"]);
    }

    #[test]
    fn repath_leaves_plain_ids_alone() {
        // No path separator -> not an asset path -> untouched.
        let src = r#"emitterName: string = "Petals""#;
        let (out, refs) = repath_assets_to_vfxhub(src);
        assert_eq!(out, src);
        assert!(refs.is_empty());
    }

    #[test]
    fn asset_dest_rel_strips_assets_prefix() {
        assert_eq!(
            asset_dest_rel("assets/foo/bar.dds").as_deref(),
            Some("foo/bar.dds")
        );
        assert_eq!(
            asset_dest_rel("ASSETS/foo/BAR.dds").as_deref(),
            Some("foo/BAR.dds")
        );
        assert_eq!(
            asset_dest_rel("foo/bar.dds").as_deref(),
            Some("foo/bar.dds")
        );
        assert_eq!(asset_dest_rel("a\\b\\c.tex").as_deref(), Some("a/b/c.tex"));
    }

    #[test]
    fn asset_dest_rel_rejects_traversal_and_absolute() {
        // Parent refs are dropped, so an escape attempt collapses to its tail.
        assert_eq!(
            asset_dest_rel("../../../../Windows/System32/evil.dll").as_deref(),
            Some("Windows/System32/evil.dll")
        );
        assert_eq!(
            asset_dest_rel("foo/../../bar.dds").as_deref(),
            Some("foo/bar.dds")
        );
        // Leading slash / drive letters are stripped, never rooted.
        assert_eq!(asset_dest_rel("/etc/passwd").as_deref(), Some("etc/passwd"));
        assert_eq!(
            asset_dest_rel("C:/Windows/x.dll").as_deref(),
            Some("Windows/x.dll")
        );
        assert_eq!(
            asset_dest_rel("C:\\Windows\\x.dll").as_deref(),
            Some("Windows/x.dll")
        );
        // Nothing safe left.
        assert_eq!(asset_dest_rel("../.."), None);
        assert_eq!(asset_dest_rel("").as_deref(), None);
    }
}
