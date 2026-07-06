//! Model → FBX bridges. 1:1 port of old quartz_cli `xps`/`pmx`/`model_dir`.
//!
//! Neither path uses `ltk_*` — both shell out to external C++ bridge exes:
//! - **XPS** (`.xps`/`.mesh`/`.ascii`): parsed in pure Rust into an
//!   [`xps_model::XpsModel`], written to a text `.qmesh` sidecar, then handed to
//!   `xps_fbx_bridge.exe --output <fbx> --qmesh <sidecar>`.
//! - **PMX** (`.pmx`): passed straight to `pmx_fbx_bridge.exe --input <pmx>
//!   --output <fbx>` (the C++ side parses PMX itself).
//!
//! The bridge exes are located via a `QUARTZ_*_FBX_BRIDGE_PATH` env override,
//! then next to the running exe, then the bundled `resources/bin/` folder (they
//! ship as Tauri resources — see `tauri.conf.json`), then a dev build tree. If
//! none resolve the call fails with a clear "not found" error.

pub mod xps_converter;
pub mod xps_model;
pub mod xps_reader_ascii;
pub mod xps_reader_binary;

use std::path::{Path, PathBuf};
use std::process::Command;

pub use xps_converter::xps2fbx;

/// Convert a single `.pmx` to `.fbx` via `pmx_fbx_bridge.exe`.
pub fn pmx2fbx(input: &Path, output: Option<&Path>) -> Result<(), String> {
    let output_path = output
        .map(PathBuf::from)
        .unwrap_or_else(|| input.with_extension("fbx"));

    let bridge_path = find_pmx_bridge_exe()?;
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
    Ok(())
}

fn find_pmx_bridge_exe() -> Result<PathBuf, String> {
    find_bridge_exe(
        "QUARTZ_PMX_FBX_BRIDGE_PATH",
        "pmx_fbx_bridge",
        "pmx_fbx_bridge.exe",
    )
}

/// Shared bridge-exe discovery: env override → next-to-exe → dev build tree.
pub(crate) fn find_bridge_exe(
    env_var: &str,
    subdir: &str,
    exe_name: &str,
) -> Result<PathBuf, String> {
    if let Ok(raw) = std::env::var(env_var) {
        let candidate = PathBuf::from(raw);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    let mut candidates = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // Right next to the app exe.
            candidates.push(exe_dir.join(exe_name));
            // Bundled as a Tauri resource: NSIS installs put `resources/` next
            // to the exe, so the bridge lands at `<exe>/resources/bin/<name>`.
            candidates.push(exe_dir.join("resources").join("bin").join(exe_name));
            candidates.push(exe_dir.join("resources").join(exe_name));
        }
    }
    if let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") {
        if let Some(native_root) = Path::new(manifest_dir).parent() {
            for build in ["build_release", "build"] {
                candidates.push(native_root.join(subdir).join(build).join(exe_name));
            }
            candidates.push(native_root.join(subdir).join("build").join("Release").join(exe_name));
            candidates.push(native_root.join(subdir).join("build").join("Debug").join(exe_name));
        }
    }

    for candidate in candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(format!(
        "{exe_name} not found. Build native/{subdir} or set {env_var}."
    ))
}

// ── directory batch ─────────────────────────────────────────────────────────

const XPS_EXTS: &[&str] = &["xps", "mesh", "ascii"];
const PMX_EXTS: &[&str] = &["pmx"];

fn walk_ext_multi(dir: &Path, exts: &[&str], out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            walk_ext_multi(&p, exts, out);
        } else if p
            .extension()
            .and_then(|x| x.to_str())
            .map(|x| exts.iter().any(|e| x.eq_ignore_ascii_case(e)))
            .unwrap_or(false)
        {
            out.push(p);
        }
    }
}

/// Convert every `.xps`/`.mesh`/`.ascii` under `dir` to `.fbx`. Returns
/// `(ok, failed)`.
pub fn xps_to_fbx_dir(dir: &Path) -> Result<(usize, usize), String> {
    let mut files = Vec::new();
    walk_ext_multi(dir, XPS_EXTS, &mut files);
    let (mut ok, mut failed) = (0usize, 0usize);
    for f in &files {
        match xps2fbx(f, None) {
            Ok(_) => ok += 1,
            Err(e) => {
                failed += 1;
                eprintln!("  {}: {}", f.display(), e);
            }
        }
    }
    Ok((ok, failed))
}

/// Convert every `.pmx` under `dir` to `.fbx`. Returns `(ok, failed)`.
pub fn pmx_to_fbx_dir(dir: &Path) -> Result<(usize, usize), String> {
    let mut files = Vec::new();
    walk_ext_multi(dir, PMX_EXTS, &mut files);
    let (mut ok, mut failed) = (0usize, 0usize);
    for f in &files {
        match pmx2fbx(f, None) {
            Ok(_) => ok += 1,
            Err(e) => {
                failed += 1;
                eprintln!("  {}: {}", f.display(), e);
            }
        }
    }
    Ok((ok, failed))
}
