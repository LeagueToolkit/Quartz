// Mirrors the Rust AppInfo struct returned by get_app_info.
export interface AppInfo {
    name: string;
    version: string;
    tauri: boolean;
}

// Mirrors the Rust QuartzSettings struct (serde camelCase).
export interface QuartzSettings {
    schemaVersion: number;
    leaguePath: string | null;
    championsPath: string | null;
    wadOutputPath: string | null;
    creatorName: string | null;
    autoUpdateEnabled: boolean;
    skippedUpdateVersion: string | null;
    selectedTheme: string | null;
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
