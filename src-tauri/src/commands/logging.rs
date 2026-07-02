use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

/* Frontend pipes its logs here so everything lands in the same tracing
sink (stdout + the rolling file under the app home). */
#[tauri::command]
pub fn log_message(level: LogLevel, message: String) {
    match level {
        LogLevel::Trace => tracing::trace!(target: "frontend", "{}", message),
        LogLevel::Debug => tracing::debug!(target: "frontend", "{}", message),
        LogLevel::Info => tracing::info!(target: "frontend", "{}", message),
        LogLevel::Warn => tracing::warn!(target: "frontend", "{}", message),
        LogLevel::Error => tracing::error!(target: "frontend", "{}", message),
    }
}
