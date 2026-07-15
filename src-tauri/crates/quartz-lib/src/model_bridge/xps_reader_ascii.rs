use std::path::Path;

use super::xps_model::{XpsBone, XpsInfluence, XpsMesh, XpsModel, XpsVertex};

pub fn parse_ascii(text: &str) -> Result<XpsModel, String> {
    let lines: Vec<&str> = text.lines().collect();
    let mut idx = 0usize;

    let bone_count = read_count(&lines, &mut idx, "bone count")?;
    let mut bones = Vec::with_capacity(bone_count);
    for _ in 0..bone_count {
        let bone_name = read_string_line(&lines, &mut idx, "bone name")?;
        let parent_id = read_count(&lines, &mut idx, "bone parent id")? as i16;
        let coords = read_xyz(&lines, &mut idx, "bone coords")?;
        bones.push(XpsBone {
            name: sanitize_mesh_name(&bone_name),
            parent_index: parent_id,
            position: coords,
        });
    }

    let has_bones = bone_count > 0;
    let mesh_count = read_count(&lines, &mut idx, "mesh count")?;
    let mut meshes = Vec::with_capacity(mesh_count);

    for _ in 0..mesh_count {
        let mut mesh_name = read_string_line(&lines, &mut idx, "mesh name")?;
        if mesh_name.is_empty() {
            mesh_name = "unnamed".to_string();
        }

        let uv_layer_count = read_count(&lines, &mut idx, "uv layer count")?;
        let texture_count = read_count(&lines, &mut idx, "texture count")?;
        for _ in 0..texture_count {
            let _texture_name = read_string_line(&lines, &mut idx, "texture name")?;
            let _uv_layer = read_count(&lines, &mut idx, "texture uv layer")?;
        }

        let vertex_count = read_count(&lines, &mut idx, "vertex count")?;
        let mut vertices = Vec::with_capacity(vertex_count);
        for _ in 0..vertex_count {
            let position = read_xyz(&lines, &mut idx, "vertex position")?;
            let normal = read_xyz(&lines, &mut idx, "vertex normal")?;
            let _vcolor = read_n_ints(&lines, &mut idx, 4, "vertex color")?;

            let mut uv0 = [0.0f32, 0.0f32];
            for uv_layer in 0..uv_layer_count {
                let uv = read_n_floats(&lines, &mut idx, 2, "vertex uv")?;
                if uv_layer == 0 {
                    uv0 = [uv[0], uv[1]];
                }
            }

            let mut influences = [XpsInfluence::default(); 4];
            if has_bones {
                let bone_ids = read_n_ints_with_default(&lines, &mut idx, 4, "bone ids", 0)?;
                let bone_weights =
                    read_n_floats_with_default(&lines, &mut idx, 4, "bone weights", 0.0)?;
                let mut pairs: Vec<(u16, f32)> = (0..4)
                    .map(|i| (bone_ids[i].max(0) as u16, bone_weights[i].max(0.0)))
                    .filter(|(_, w)| *w > 0.0)
                    .collect();
                pairs.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                if pairs.len() > 4 {
                    pairs.truncate(4);
                }
                let sum: f32 = pairs.iter().map(|p| p.1).sum();
                if sum > 0.0 {
                    for (idx, (bone, weight)) in pairs.iter().enumerate() {
                        influences[idx] = XpsInfluence {
                            bone_index: *bone,
                            weight: *weight / sum,
                        };
                    }
                }
            }

            vertices.push(XpsVertex {
                position,
                normal,
                uv: uv0,
                influences,
            });
        }

        let tri_count = read_count(&lines, &mut idx, "triangle count")?;
        let mut faces = Vec::with_capacity(tri_count);
        for _ in 0..tri_count {
            let tri = read_n_ints(&lines, &mut idx, 3, "triangle indices")?;
            faces.push([tri[0] as u32, tri[1] as u32, tri[2] as u32]);
        }

        meshes.push(XpsMesh {
            name: sanitize_mesh_name(&mesh_name),
            vertices,
            faces,
        });
    }

    Ok(XpsModel { bones, meshes })
}

fn sanitize_mesh_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return "unnamed".to_string();
    }

    let file_name = Path::new(trimmed)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(trimmed);

    file_name.to_string()
}

fn read_count(lines: &[&str], idx: &mut usize, label: &str) -> Result<usize, String> {
    let values = read_values_line(lines, idx, label)?;
    let first = values
        .first()
        .ok_or_else(|| format!("Missing value for {}", label))?;
    let parsed = first
        .parse::<i64>()
        .map_err(|e| format!("Invalid integer for {}: {}", label, e))?;
    if parsed < 0 {
        return Err(format!("Negative value for {}: {}", label, parsed));
    }
    Ok(parsed as usize)
}

fn read_string_line(lines: &[&str], idx: &mut usize, label: &str) -> Result<String, String> {
    while *idx < lines.len() {
        let line = lines[*idx];
        *idx += 1;
        let value = line.split('#').next().unwrap_or("").trim().to_string();
        if !value.is_empty() {
            return Ok(value);
        }
    }
    Err(format!("Unexpected EOF while reading {}", label))
}

fn read_values_line(lines: &[&str], idx: &mut usize, label: &str) -> Result<Vec<String>, String> {
    while *idx < lines.len() {
        let line = lines[*idx];
        *idx += 1;
        let cleaned = line.replace('#', " ");
        let values: Vec<String> = cleaned.split_whitespace().map(|s| s.to_string()).collect();
        if !values.is_empty() {
            return Ok(values);
        }
    }
    Err(format!("Unexpected EOF while reading {}", label))
}

fn read_xyz(lines: &[&str], idx: &mut usize, label: &str) -> Result<[f32; 3], String> {
    let vals = read_n_floats(lines, idx, 3, label)?;
    Ok([vals[0], vals[1], vals[2]])
}

fn read_n_ints(lines: &[&str], idx: &mut usize, n: usize, label: &str) -> Result<Vec<i64>, String> {
    let values = read_values_line(lines, idx, label)?;
    if values.len() < n {
        return Err(format!(
            "Expected {} ints for {}, got {}",
            n,
            label,
            values.len()
        ));
    }

    let mut out = Vec::with_capacity(n);
    for token in values.iter().take(n) {
        let parsed = token
            .parse::<i64>()
            .map_err(|e| format!("Invalid int for {}: {}", label, e))?;
        out.push(parsed);
    }
    Ok(out)
}

fn read_n_ints_with_default(
    lines: &[&str],
    idx: &mut usize,
    n: usize,
    label: &str,
    default: i64,
) -> Result<Vec<i64>, String> {
    let values = read_values_line(lines, idx, label)?;
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let parsed = values
            .get(i)
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(default);
        out.push(parsed);
    }
    Ok(out)
}

fn read_n_floats(
    lines: &[&str],
    idx: &mut usize,
    n: usize,
    label: &str,
) -> Result<Vec<f32>, String> {
    let values = read_values_line(lines, idx, label)?;
    if values.len() < n {
        return Err(format!(
            "Expected {} floats for {}, got {}",
            n,
            label,
            values.len()
        ));
    }

    let mut out = Vec::with_capacity(n);
    for token in values.iter().take(n) {
        let parsed = token
            .parse::<f32>()
            .map_err(|e| format!("Invalid float for {}: {}", label, e))?;
        out.push(parsed);
    }
    Ok(out)
}

fn read_n_floats_with_default(
    lines: &[&str],
    idx: &mut usize,
    n: usize,
    label: &str,
    default: f32,
) -> Result<Vec<f32>, String> {
    let values = read_values_line(lines, idx, label)?;
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let parsed = values
            .get(i)
            .and_then(|v| v.parse::<f32>().ok())
            .unwrap_or(default);
        out.push(parsed);
    }
    Ok(out)
}
