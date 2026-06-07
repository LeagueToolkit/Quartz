// Mirrors the Rust AppInfo struct returned by get_app_info.
export interface AppInfo {
    name: string;
    version: string;
    tauri: boolean;
}
