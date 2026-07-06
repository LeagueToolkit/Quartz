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
    pub py_path: String,
}

/// Normalize an asset rel path to sit under the tree's `assets/` root: strip any
/// leading `assets/`/`ASSETS/` and normalize separators.
fn asset_dest_rel(rel: &str) -> String {
    let r = rel.replace('\\', "/");
    let stripped = r
        .strip_prefix("assets/")
        .or_else(|| r.strip_prefix("ASSETS/"))
        .unwrap_or(&r);
    stripped.to_string()
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

    let py_path = data_dir.join("donor.py");
    std::fs::write(&py_path, py_content.as_bytes()).map_err(|e| format!("write py: {e}"))?;

    for a in &assets {
        let dest = assets_dir.join(asset_dest_rel(&a.rel_path));
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
        py_path: py_path.to_string_lossy().into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_dest_rel_strips_assets_prefix() {
        assert_eq!(asset_dest_rel("assets/foo/bar.dds"), "foo/bar.dds");
        assert_eq!(asset_dest_rel("ASSETS/foo/BAR.dds"), "foo/BAR.dds");
        assert_eq!(asset_dest_rel("foo/bar.dds"), "foo/bar.dds");
        assert_eq!(asset_dest_rel("a\\b\\c.tex"), "a/b/c.tex");
    }
}
