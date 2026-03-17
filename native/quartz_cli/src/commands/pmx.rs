use std::path::{Path, PathBuf};
use std::process::Command;

pub fn pmx2fbx(input: &Path, output: Option<&Path>) -> Result<(), String> {
    let output_path = output
        .map(PathBuf::from)
        .unwrap_or_else(|| input.with_extension("fbx"));

    let bridge_path = find_bridge_exe()?;

    let status = Command::new(&bridge_path)
        .arg("--input")
        .arg(input)
        .arg("--output")
        .arg(&output_path)
        .status()
        .map_err(|e| {
            format!(
                "Failed to start pmx_fbx_bridge at {}: {}",
                bridge_path.display(),
                e
            )
        })?;

    if !status.success() {
        return Err(format!(
            "pmx_fbx_bridge failed with exit code {}",
            status.code().unwrap_or(-1)
        ));
    }

    eprintln!("OK: {} -> {}", input.display(), output_path.display());
    Ok(())
}

fn find_bridge_exe() -> Result<PathBuf, String> {
    if let Ok(raw) = std::env::var("QUARTZ_PMX_FBX_BRIDGE_PATH") {
        let candidate = PathBuf::from(raw);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    let mut candidates = Vec::new();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join("pmx_fbx_bridge.exe"));
        }
    }

    if let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") {
        let native_root = Path::new(manifest_dir)
            .parent()
            .ok_or_else(|| "Failed to locate native root".to_string())?;
        candidates.push(
            native_root
                .join("pmx_fbx_bridge")
                .join("build_release")
                .join("pmx_fbx_bridge.exe"),
        );
        candidates.push(
            native_root
                .join("pmx_fbx_bridge")
                .join("build")
                .join("pmx_fbx_bridge.exe"),
        );
        candidates.push(
            native_root
                .join("pmx_fbx_bridge")
                .join("build")
                .join("Release")
                .join("pmx_fbx_bridge.exe"),
        );
    }

    for candidate in candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(
        "pmx_fbx_bridge.exe not found. Build native/pmx_fbx_bridge or set QUARTZ_PMX_FBX_BRIDGE_PATH."
            .to_string(),
    )
}
