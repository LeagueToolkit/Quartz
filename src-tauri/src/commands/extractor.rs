use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Champion {
    pub id: String,
    pub name: String,
    pub skin_count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub ok: bool,
    pub output_dir: String,
    pub files: u32,
}

/* STUB — returns a fixed champion list so the UI can be built and exercised.
   Phase 2 replaces this with a real scan of the League Champions folder. */
#[tauri::command]
pub fn discover_champions() -> Vec<Champion> {
    let demo = [
        ("Ahri", 14u32), ("Lux", 12), ("Yasuo", 11), ("Jinx", 9),
        ("Ezreal", 13), ("Lulu", 10), ("Kaisa", 8), ("Akali", 11),
        ("Zed", 9), ("Seraphine", 5), ("Aurora", 3), ("Briar", 3),
    ];
    demo.iter()
        .map(|(name, skins)| Champion {
            id: name.to_lowercase(),
            name: (*name).to_string(),
            skin_count: *skins,
        })
        .collect()
}

/* STUB — pretends to extract. Phase 2 wires this to the WAD pipeline. */
#[tauri::command]
pub fn extract_champion_assets(champion: String, skin_id: u32, output_dir: String) -> ExtractResult {
    tracing::info!("[stub] extract {} skin {} -> {}", champion, skin_id, output_dir);
    ExtractResult { ok: true, output_dir, files: 0 }
}
