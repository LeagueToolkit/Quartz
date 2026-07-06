use std::io::{Cursor, Read, Seek, SeekFrom};
use std::path::Path;

use byteorder::{LittleEndian, ReadBytesExt};

use super::xps_model::{XpsBone, XpsInfluence, XpsMesh, XpsModel, XpsVertex};

const MAGIC_NUMBER: u32 = 323232;
const LIMIT: usize = 128;

pub fn parse_binary(bytes: &[u8]) -> Result<XpsModel, String> {
    let mut cursor = Cursor::new(bytes);
    let first = read_u32(&mut cursor)?;
    cursor
        .seek(SeekFrom::Start(0))
        .map_err(|e| format!("Failed to seek: {}", e))?;

    let mut has_header = false;
    let mut ver_major: u16 = 0;
    let mut ver_minor: u16 = 0;

    if first == MAGIC_NUMBER {
        has_header = true;

        let magic = read_u32(&mut cursor)?;
        if magic != MAGIC_NUMBER {
            return Err("Invalid XPS header magic".to_string());
        }

        ver_major = read_u16(&mut cursor)?;
        ver_minor = read_u16(&mut cursor)?;

        let _xna_aral = read_files_string(&mut cursor)?;
        let settings_len = read_u32(&mut cursor)? as u64;
        let _machine = read_files_string(&mut cursor)?;
        let _user = read_files_string(&mut cursor)?;
        let _files = read_files_string(&mut cursor)?;

        skip_bytes(&mut cursor, settings_len.saturating_mul(4))?;
    }

    let bone_count = read_u32(&mut cursor)? as usize;
    let mut bones = Vec::with_capacity(bone_count);
    for _ in 0..bone_count {
        let bone_name = read_files_string(&mut cursor)?;
        let parent_id = read_i16(&mut cursor)?;
        let coords = read_xyz(&mut cursor)?;
        bones.push(XpsBone {
            name: sanitize_mesh_name(&bone_name),
            parent_index: parent_id,
            position: coords,
        });
    }

    let has_bones = bone_count > 0;
    let has_tangent = if has_header {
        ver_major <= 2 && ver_minor <= 12
    } else {
        true
    };
    let has_variable_weights = if has_header { ver_major >= 3 } else { false };

    let mesh_count = read_u32(&mut cursor)? as usize;
    let mut meshes = Vec::with_capacity(mesh_count);

    for _ in 0..mesh_count {
        let mut mesh_name = read_files_string(&mut cursor)?;
        if mesh_name.is_empty() {
            mesh_name = "unnamed".to_string();
        }

        let uv_layer_count = read_u32(&mut cursor)? as usize;
        let texture_count = read_u32(&mut cursor)? as usize;
        for _ in 0..texture_count {
            let _texture_file = read_files_string(&mut cursor)?;
            let _uv_layer = read_u32(&mut cursor)?;
        }

        let vertex_count = read_u32(&mut cursor)? as usize;
        let mut vertices = Vec::with_capacity(vertex_count);

        for _ in 0..vertex_count {
            let position = read_xyz(&mut cursor)?;
            let normal = read_xyz(&mut cursor)?;
            let _vcolor = read_vertex_color(&mut cursor)?;

            let mut uv0 = [0.0f32, 0.0f32];
            for uv_layer in 0..uv_layer_count {
                let uv = read_uv(&mut cursor)?;
                if uv_layer == 0 {
                    uv0 = uv;
                }
                if has_tangent {
                    skip_bytes(&mut cursor, 16)?;
                }
            }

            let mut influences = [XpsInfluence::default(); 4];
            if has_bones {
                let weights_count = if has_variable_weights {
                    let count = read_i16(&mut cursor)?;
                    if count < 0 {
                        return Err("Invalid negative bone weight count in XPS vertex".to_string());
                    }
                    count as usize
                } else {
                    4
                };

                let mut bone_ids = vec![0u16; weights_count];
                for item in bone_ids.iter_mut().take(weights_count) {
                    *item = read_u16(&mut cursor)?;
                }

                let mut weights = vec![0.0f32; weights_count];
                for item in weights.iter_mut().take(weights_count) {
                    *item = read_f32(&mut cursor)?;
                }

                let mut pairs: Vec<(u16, f32)> = Vec::new();
                for i in 0..weights_count {
                    let w = weights[i];
                    if w <= 0.0 {
                        continue;
                    }
                    pairs.push((bone_ids[i], w));
                }

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

        let tri_count = read_u32(&mut cursor)? as usize;
        let mut faces = Vec::with_capacity(tri_count);
        for _ in 0..tri_count {
            let a = read_u32(&mut cursor)?;
            let b = read_u32(&mut cursor)?;
            let c = read_u32(&mut cursor)?;
            faces.push([a, b, c]);
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

fn read_files_string(cursor: &mut Cursor<&[u8]>) -> Result<String, String> {
    let length_byte1 = read_u8(cursor)? as usize;
    let mut length_byte2 = 0usize;
    if length_byte1 >= LIMIT {
        length_byte2 = read_u8(cursor)? as usize;
    }

    let length = (length_byte1 % LIMIT) + (length_byte2 * LIMIT);
    if length == 0 {
        return Ok(String::new());
    }

    let mut buf = vec![0u8; length];
    cursor
        .read_exact(&mut buf)
        .map_err(|e| format!("Failed to read XPS string: {}", e))?;

    let text = String::from_utf8_lossy(&buf)
        .trim_start_matches('\u{feff}')
        .to_string();
    Ok(text)
}

fn read_vertex_color(cursor: &mut Cursor<&[u8]>) -> Result<[u8; 4], String> {
    Ok([
        read_u8(cursor)?,
        read_u8(cursor)?,
        read_u8(cursor)?,
        read_u8(cursor)?,
    ])
}

fn read_xyz(cursor: &mut Cursor<&[u8]>) -> Result<[f32; 3], String> {
    Ok([
        read_f32(cursor)?,
        read_f32(cursor)?,
        read_f32(cursor)?,
    ])
}

fn read_uv(cursor: &mut Cursor<&[u8]>) -> Result<[f32; 2], String> {
    Ok([read_f32(cursor)?, read_f32(cursor)?])
}

fn skip_bytes(cursor: &mut Cursor<&[u8]>, amount: u64) -> Result<(), String> {
    cursor
        .seek(SeekFrom::Current(amount as i64))
        .map_err(|e| format!("Failed to skip {} bytes: {}", amount, e))?;
    Ok(())
}

fn read_u8(cursor: &mut Cursor<&[u8]>) -> Result<u8, String> {
    cursor.read_u8().map_err(|e| format!("Failed to read u8: {}", e))
}

fn read_u16(cursor: &mut Cursor<&[u8]>) -> Result<u16, String> {
    cursor
        .read_u16::<LittleEndian>()
        .map_err(|e| format!("Failed to read u16: {}", e))
}

fn read_i16(cursor: &mut Cursor<&[u8]>) -> Result<i16, String> {
    cursor
        .read_i16::<LittleEndian>()
        .map_err(|e| format!("Failed to read i16: {}", e))
}

fn read_u32(cursor: &mut Cursor<&[u8]>) -> Result<u32, String> {
    cursor
        .read_u32::<LittleEndian>()
        .map_err(|e| format!("Failed to read u32: {}", e))
}

fn read_f32(cursor: &mut Cursor<&[u8]>) -> Result<f32, String> {
    cursor
        .read_f32::<LittleEndian>()
        .map_err(|e| format!("Failed to read f32: {}", e))
}
