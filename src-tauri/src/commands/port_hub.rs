/* Stage a VFX Hub system (a decompiled .py plus its assets, downloaded from the
GitHub hub) into a temporary donor tree so the Port donor session (`vfx_open`)
can load it and resolve its assets exactly like a game-extracted donor. The
temp root is handed back so the Port page can clean it up on close, matching the
Load-Donor-From-Game flow. */

use base64::Engine;
use serde::{Deserialize, Serialize};

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
            !seg.is_empty()
                && *seg != "."
                && *seg != ".."
                && !seg.contains(':')
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
    py_content: String,
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

    // vfx_open needs a .bin, but hub systems are stored as ritobin .py text.
    // Compile the .py to a .bin here so the donor session can open it.
    let tree = quartz_lib::bin::text_to_tree(&py_content)
        .map_err(|e| format!("parse donor py: {e}"))?;
    let bin_bytes = quartz_lib::bin::write_bin(&tree)
        .map_err(|e| format!("compile donor bin: {e}"))?;
    let bin_path = data_dir.join("donor.bin");
    std::fs::write(&bin_path, &bin_bytes).map_err(|e| format!("write bin: {e}"))?;

    for a in &assets {
        // Reject anything that doesn't sanitize to a safe relative path.
        let Some(rel) = asset_dest_rel(&a.rel_path) else { continue };
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_dest_rel_strips_assets_prefix() {
        assert_eq!(asset_dest_rel("assets/foo/bar.dds").as_deref(), Some("foo/bar.dds"));
        assert_eq!(asset_dest_rel("ASSETS/foo/BAR.dds").as_deref(), Some("foo/BAR.dds"));
        assert_eq!(asset_dest_rel("foo/bar.dds").as_deref(), Some("foo/bar.dds"));
        assert_eq!(asset_dest_rel("a\\b\\c.tex").as_deref(), Some("a/b/c.tex"));
    }

    #[test]
    fn asset_dest_rel_rejects_traversal_and_absolute() {
        // Parent refs are dropped, so an escape attempt collapses to its tail.
        assert_eq!(asset_dest_rel("../../../../Windows/System32/evil.dll").as_deref(), Some("Windows/System32/evil.dll"));
        assert_eq!(asset_dest_rel("foo/../../bar.dds").as_deref(), Some("foo/bar.dds"));
        // Leading slash / drive letters are stripped, never rooted.
        assert_eq!(asset_dest_rel("/etc/passwd").as_deref(), Some("etc/passwd"));
        assert_eq!(asset_dest_rel("C:/Windows/x.dll").as_deref(), Some("Windows/x.dll"));
        assert_eq!(asset_dest_rel("C:\\Windows\\x.dll").as_deref(), Some("Windows/x.dll"));
        // Nothing safe left.
        assert_eq!(asset_dest_rel("../.."), None);
        assert_eq!(asset_dest_rel("").as_deref(), None);
    }
}
