use std::fs;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use super::xps_model::XpsModel;
use super::xps_reader_ascii::parse_ascii;
use super::xps_reader_binary::parse_binary;

pub fn xps2fbx(input: &Path, output: Option<&Path>) -> Result<(), String> {
    let output_path = output
        .map(PathBuf::from)
        .unwrap_or_else(|| input.with_extension("fbx"));

    let bridge_path = find_bridge_exe()?;
    let mut cmd = Command::new(&bridge_path);
    cmd.arg("--output").arg(&output_path);

    let bytes =
        fs::read(input).map_err(|e| format!("Failed to read {}: {}", input.display(), e))?;
    let model = parse_with_fallback(input, &bytes)?;

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Failed to read system clock: {}", e))?
        .as_millis();
    let mesh_name = format!(
        "quartz_xps2fbx_{}_{}_{}.qmesh",
        std::process::id(),
        stamp,
        sanitize_stem(input)
    );
    let mesh_path = std::env::temp_dir().join(mesh_name);
    write_qmesh_sidecar(&mesh_path, &model)?;
    cmd.arg("--qmesh").arg(&mesh_path);

    let status = cmd.status().map_err(|e| {
        format!(
            "Failed to start xps_fbx_bridge at {}: {}",
            bridge_path.display(),
            e
        )
    })?;

    let _ = fs::remove_file(mesh_path);

    if !status.success() {
        return Err(format!(
            "xps_fbx_bridge failed with exit code {}",
            status.code().unwrap_or(-1)
        ));
    }

    eprintln!("OK: {} -> {}", input.display(), output_path.display(),);

    Ok(())
}

fn parse_with_fallback(input: &Path, bytes: &[u8]) -> Result<XpsModel, String> {
    if looks_ascii(input) {
        let txt = String::from_utf8_lossy(bytes);
        return parse_ascii(&txt).map_err(|e| format!("Failed to parse ASCII XPS: {}", e));
    }

    match parse_binary(bytes) {
        Ok(model) => Ok(model),
        Err(bin_err) => {
            let txt = String::from_utf8_lossy(bytes);
            match parse_ascii(&txt) {
                Ok(model) => Ok(model),
                Err(ascii_err) => Err(format!(
                    "Failed to parse as binary XPS ({}) and as ASCII XPS ({})",
                    bin_err, ascii_err
                )),
            }
        }
    }
}

fn looks_ascii(input: &Path) -> bool {
    let lower = input.to_string_lossy().to_ascii_lowercase();
    lower.ends_with(".ascii")
}

fn sanitize_stem(input: &Path) -> String {
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("xps")
        .trim();

    let out: String = stem
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();

    if out.is_empty() {
        "xps".to_string()
    } else {
        out
    }
}

fn write_qmesh_sidecar(path: &Path, model: &XpsModel) -> Result<(), String> {
    let file = File::create(path)
        .map_err(|e| format!("Failed to create qmesh sidecar {}: {}", path.display(), e))?;
    let mut out = BufWriter::new(file);

    writeln!(out, "QXPS1").map_err(|e| format!("Failed to write qmesh header: {}", e))?;
    writeln!(out, "BONES {}", model.bones.len())
        .map_err(|e| format!("Failed to write qmesh bones count: {}", e))?;
    for bone in &model.bones {
        writeln!(
            out,
            "B {} {} {} {} {}",
            bone.parent_index,
            bone.position[0],
            bone.position[1],
            bone.position[2],
            sanitize_name_token(&bone.name)
        )
        .map_err(|e| format!("Failed to write qmesh bone row: {}", e))?;
    }

    writeln!(out, "MESHES {}", model.meshes.len())
        .map_err(|e| format!("Failed to write qmesh meshes count: {}", e))?;
    for mesh in &model.meshes {
        writeln!(
            out,
            "M {} {} {}",
            sanitize_name_token(&mesh.name),
            mesh.vertices.len(),
            mesh.faces.len()
        )
        .map_err(|e| format!("Failed to write qmesh mesh header: {}", e))?;

        for v in &mesh.vertices {
            let mut pairs: Vec<(u16, f32)> = Vec::new();
            for inf in &v.influences {
                if inf.weight > 0.0 {
                    pairs.push((inf.bone_index, inf.weight));
                }
            }

            write!(
                out,
                "V {} {} {} {} {} {} {} {} {}",
                v.position[0],
                v.position[1],
                v.position[2],
                v.normal[0],
                v.normal[1],
                v.normal[2],
                v.uv[0],
                v.uv[1],
                pairs.len()
            )
            .map_err(|e| format!("Failed to write qmesh vertex base: {}", e))?;
            for (bone, weight) in pairs {
                write!(out, " {} {}", bone, weight)
                    .map_err(|e| format!("Failed to write qmesh vertex influence: {}", e))?;
            }
            writeln!(out).map_err(|e| format!("Failed to write qmesh vertex row: {}", e))?;
        }

        for face in &mesh.faces {
            writeln!(out, "F {} {} {}", face[0], face[1], face[2])
                .map_err(|e| format!("Failed to write qmesh face row: {}", e))?;
        }
    }

    out.flush()
        .map_err(|e| format!("Failed to flush qmesh {}: {}", path.display(), e))?;
    Ok(())
}

fn sanitize_name_token(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return "unnamed".to_string();
    }

    trimmed
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn find_bridge_exe() -> Result<PathBuf, String> {
    // Shares the resource-dir + env-override discovery with the PMX bridge
    // (env var → next-to-exe → bundled `resources/bin/` → dev build tree).
    super::find_bridge_exe(
        "QUARTZ_XPS_FBX_BRIDGE_PATH",
        "xps_fbx_bridge",
        "xps_fbx_bridge.exe",
    )
}
