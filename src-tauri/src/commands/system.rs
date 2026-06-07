use serde::Serialize;

#[derive(Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub tauri: bool,
}

// First end-to-end command: proves the invoke() <-> command bridge works.
#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: "Quartz".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        tauri: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_quartz_and_cargo_version() {
        let info = get_app_info();
        assert_eq!(info.name, "Quartz");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert!(info.tauri);
    }
}
