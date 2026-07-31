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

/// Model path supplied by the Windows Explorer `Inspect Model` verb.  This is
/// intentionally read-only; the renderer validates it again through the model
/// loader before opening the inspector.
#[tauri::command]
pub fn get_startup_model_path() -> Option<String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    model_path_from_args(&args)
}

pub(crate) fn model_path_from_args(args: &[String]) -> Option<String> {
    let flagged = args
        .iter()
        .position(|arg| arg == "--inspect-model")
        .and_then(|index| args.get(index + 1));
    let direct = args.iter().find(|arg| {
        let lower = arg.to_ascii_lowercase();
        lower.ends_with(".skn") || lower.ends_with(".scb") || lower.ends_with(".sco")
    });
    flagged.or(direct).and_then(|value| {
        let path = std::path::Path::new(value);
        path.is_file().then(|| path.to_string_lossy().into_owned())
    })
}

/// BIN handed off from another tool (e.g. Flint) via `--paint-bin <path>` to
/// open directly in the Paint page. Same CLI-argument contract as
/// `--inspect-model`; no temp files or interop directory.
#[tauri::command]
pub fn get_startup_paint_bin() -> Option<String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    paint_bin_from_args(&args)
}

pub(crate) fn paint_bin_from_args(args: &[String]) -> Option<String> {
    args.iter()
        .position(|arg| arg == "--paint-bin")
        .and_then(|index| args.get(index + 1))
        .and_then(|value| {
            let path = std::path::Path::new(value);
            path.is_file().then(|| path.to_string_lossy().into_owned())
        })
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

    #[test]
    fn model_launch_args_accept_flagged_model_path() {
        let path = std::env::temp_dir().join(format!("quartz-launch-{}.skn", std::process::id()));
        std::fs::write(&path, []).unwrap();
        let args = vec![
            "--inspect-model".to_string(),
            path.to_string_lossy().into_owned(),
        ];
        assert_eq!(
            model_path_from_args(&args),
            Some(path.to_string_lossy().into_owned())
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn paint_launch_args_accept_flagged_bin_path() {
        let path = std::env::temp_dir().join(format!("quartz-paint-{}.bin", std::process::id()));
        std::fs::write(&path, []).unwrap();
        let args = vec![
            "--paint-bin".to_string(),
            path.to_string_lossy().into_owned(),
        ];
        assert_eq!(
            paint_bin_from_args(&args),
            Some(path.to_string_lossy().into_owned())
        );
        let _ = std::fs::remove_file(path);
    }

    /* The two callers pass DIFFERENTLY SHAPED argv and both must work.
    `get_startup_paint_bin` strips argv[0] itself, while the single-instance
    plugin hands the whole command line through with the exe still at index 0.
    Searching by flag position covers both, and this pins it so a future
    "tidy-up" that switches to a fixed index breaks here rather than in the
    Flint handoff. */
    #[test]
    fn paint_launch_args_survive_a_leading_exe_path() {
        let path = std::env::temp_dir().join(format!("quartz-paint2-{}.bin", std::process::id()));
        std::fs::write(&path, []).unwrap();
        let want = Some(path.to_string_lossy().into_owned());

        let with_exe = vec![
            r"C:\Program Files\Quartz\quartz.exe".to_string(),
            "--paint-bin".to_string(),
            path.to_string_lossy().into_owned(),
        ];
        assert_eq!(paint_bin_from_args(&with_exe), want);

        // A flag with no value must not panic or take the next unrelated arg.
        let dangling = vec!["--paint-bin".to_string()];
        assert_eq!(paint_bin_from_args(&dangling), None);

        // A path that does not exist is rejected rather than routed.
        let missing = vec![
            "--paint-bin".to_string(),
            r"C:\nope\does-not-exist.bin".to_string(),
        ];
        assert_eq!(paint_bin_from_args(&missing), None);

        let _ = std::fs::remove_file(path);
    }
}
