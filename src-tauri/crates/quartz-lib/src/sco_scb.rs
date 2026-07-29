//! .sco (ASCII) → .scb (binary r3d2Mesh v3.2) converter, ported from
//! pyRitoFile (via the sco-scb-converter Python tool). Self-contained: no
//! dependency on the mesh module because the SCO ASCII path doesn't live
//! there and the flag/central-point semantics differ from StaticMesh.
//!
//! Game-compat behavior matched from the Python tool:
//!   * subtract CentralPoint from every position, then central = 0,
//!     because the old SCO engine implicitly did the subtraction at load
//!     while SCB uses vertices as-is.
//!   * flags = 1 (SOFlag::HasVcp). The "flags = 5" comment in sco_fixer.py
//!     refers to dead code; the bundled writer actually emits 1.
//!   * vertex_color_indicator = 0 (no per-vertex colors written).
//!   * UVs are written grouped per-face as (u0,u1,u2, v0,v1,v2), not per
//!     vertex as (u,v).
//!   * Central is only zeroed after an actual subtract. Sources with
//!     CentralPoint= -0.0 0.0 0.0 fail the IEEE != 0.0 check, skip the
//!     subtract, and must preserve the original signed zeros so Maya 2023
//!     accepts the file.
//!
//! The original .sco is kept on disk; the .scb is written next to it.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use byteorder::{WriteBytesExt, LE};

#[derive(Default)]
struct Sco {
    central: [f32; 3],
    positions: Vec<[f32; 3]>,
    /// Flat triangle index list (length is a multiple of 3).
    indices: Vec<u32>,
    /// Per-index UVs, parallel to `indices`.
    uvs: Vec<[f32; 2]>,
    material: String,
}

fn parse_sco(bytes: &[u8]) -> Result<Sco, String> {
    let text =
        std::str::from_utf8(bytes).map_err(|e| format!("SCO is not valid UTF-8: {e}"))?;
    // Normalize CRLF / CR so split('\n') reaches every keyword line.
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();

    if lines.first().map(|s| s.trim()).unwrap_or("") != "[ObjectBegin]" {
        return Err("SCO does not start with [ObjectBegin]".into());
    }

    let mut sco = Sco::default();
    let mut i = 1usize;
    while i < lines.len() {
        let parts: Vec<&str> = lines[i].split_whitespace().collect();
        if parts.is_empty() {
            i += 1;
            continue;
        }
        match parts[0] {
            "Name=" => { /* name unused: pyRitoFile writes empty name into SCB anyway */ }
            "CentralPoint=" => {
                if parts.len() >= 4 {
                    sco.central = [
                        parts[1]
                            .parse()
                            .map_err(|e| format!("Bad CentralPoint.x: {e}"))?,
                        parts[2]
                            .parse()
                            .map_err(|e| format!("Bad CentralPoint.y: {e}"))?,
                        parts[3]
                            .parse()
                            .map_err(|e| format!("Bad CentralPoint.z: {e}"))?,
                    ];
                }
            }
            // PivotPoint isn't preserved in the SCB write path (Python's
            // write_scb doesn't serialize it), so we just ignore it here.
            "PivotPoint=" => {}
            "Verts=" => {
                let count: usize = parts
                    .get(1)
                    .ok_or("Verts= missing count")?
                    .parse()
                    .map_err(|e| format!("Verts= bad count: {e}"))?;
                sco.positions.reserve(count);
                for j in (i + 1)..(i + 1 + count) {
                    let v: Vec<&str> = lines
                        .get(j)
                        .ok_or_else(|| format!("SCO truncated at vertex {}", j - i - 1))?
                        .split_whitespace()
                        .collect();
                    if v.len() < 3 {
                        return Err(format!("Vertex line {} has < 3 components", j));
                    }
                    sco.positions.push([
                        v[0].parse().map_err(|e| format!("vert.x: {e}"))?,
                        v[1].parse().map_err(|e| format!("vert.y: {e}"))?,
                        v[2].parse().map_err(|e| format!("vert.z: {e}"))?,
                    ]);
                }
                i = i + 1 + count;
                continue;
            }
            "Faces=" => {
                let count: usize = parts
                    .get(1)
                    .ok_or("Faces= missing count")?
                    .parse()
                    .map_err(|e| format!("Faces= bad count: {e}"))?;
                for j in (i + 1)..(i + 1 + count) {
                    let line = lines
                        .get(j)
                        .ok_or_else(|| format!("SCO truncated at face {}", j - i - 1))?;
                    // Faces are tab-separated in Riot SCO; whitespace split
                    // also covers space-separated dumps.
                    let f: Vec<&str> = line.split_whitespace().collect();
                    if f.len() < 11 {
                        // Malformed face line — skip silently like pyRitoFile.
                        continue;
                    }
                    let v0: u32 = f[1].parse().map_err(|e| format!("face v0: {e}"))?;
                    let v1: u32 = f[2].parse().map_err(|e| format!("face v1: {e}"))?;
                    let v2: u32 = f[3].parse().map_err(|e| format!("face v2: {e}"))?;
                    // Degenerate (zero-area) triangle — Riot's loader rejects
                    // them, so we drop them here too.
                    if v0 == v1 || v1 == v2 || v0 == v2 {
                        continue;
                    }
                    sco.material = f[4].to_string();
                    sco.indices.push(v0);
                    sco.indices.push(v1);
                    sco.indices.push(v2);
                    // UVs are (u v) pairs per vertex in the SCO source.
                    sco.uvs.push([
                        f[5].parse().map_err(|e| format!("uv0.u: {e}"))?,
                        f[6].parse().map_err(|e| format!("uv0.v: {e}"))?,
                    ]);
                    sco.uvs.push([
                        f[7].parse().map_err(|e| format!("uv1.u: {e}"))?,
                        f[8].parse().map_err(|e| format!("uv1.v: {e}"))?,
                    ]);
                    sco.uvs.push([
                        f[9].parse().map_err(|e| format!("uv2.u: {e}"))?,
                        f[10].parse().map_err(|e| format!("uv2.v: {e}"))?,
                    ]);
                }
                i = i + 1 + count;
                continue;
            }
            _ => {}
        }
        i += 1;
    }

    if sco.positions.is_empty() {
        return Err("SCO has no vertices".into());
    }
    if sco.indices.is_empty() {
        return Err("SCO has no faces".into());
    }
    Ok(sco)
}

fn write_padded_string(buf: &mut Vec<u8>, s: &str, len: usize) {
    let bytes = s.as_bytes();
    let n = bytes.len().min(len);
    buf.extend_from_slice(&bytes[..n]);
    buf.extend(std::iter::repeat(0u8).take(len - n));
}

fn write_scb(sco: &Sco) -> Result<Vec<u8>, String> {
    // Replicate sco_fixer.py: subtract central from every position before
    // writing, then zero out central — but only if any component is
    // *actually* non-zero. IEEE-equality treats -0.0 == 0.0, matching
    // Python's behavior here, so a `-0.0` central is preserved as-is
    // (otherwise the byte stream diverges from the reference tool and
    // Maya 2023 rejects the output).
    let cx = sco.central[0];
    let cy = sco.central[1];
    let cz = sco.central[2];
    let needs_subtract = cx != 0.0 || cy != 0.0 || cz != 0.0;
    let positions: Vec<[f32; 3]> = if needs_subtract {
        sco.positions
            .iter()
            .map(|p| [p[0] - cx, p[1] - cy, p[2] - cz])
            .collect()
    } else {
        sco.positions.clone()
    };
    let central_out = if needs_subtract {
        [0.0_f32, 0.0, 0.0]
    } else {
        sco.central
    };

    // Bounding box over the adjusted positions.
    let mut min = [f32::INFINITY; 3];
    let mut max = [f32::NEG_INFINITY; 3];
    for p in &positions {
        for k in 0..3 {
            if p[k] < min[k] {
                min[k] = p[k];
            }
            if p[k] > max[k] {
                max[k] = p[k];
            }
        }
    }

    let mut out = Vec::with_capacity(64 + positions.len() * 12 + sco.indices.len() * 28);
    out.write_all(b"r3d2Mesh").unwrap();
    out.write_u16::<LE>(3).unwrap(); // major
    out.write_u16::<LE>(2).unwrap(); // minor
    write_padded_string(&mut out, "", 128); // name (pyRitoFile writes empty)
    out.write_u32::<LE>(positions.len() as u32).unwrap();
    let face_count = (sco.indices.len() / 3) as u32;
    out.write_u32::<LE>(face_count).unwrap();
    // flags = SOFlag::HasVcp (1). Maya 2023 rejects flags=5, which is what
    // the comment in sco_fixer.py suggests but which the actual bundled
    // pyRitoFile writer never emits (its `self.flags.value` resolves to 1).
    out.write_u32::<LE>(1).unwrap();
    // Bounding box (vec3 min, vec3 max)
    for v in &min {
        out.write_f32::<LE>(*v).unwrap();
    }
    for v in &max {
        out.write_f32::<LE>(*v).unwrap();
    }
    out.write_u32::<LE>(0).unwrap(); // vertex color indicator (none)

    // Positions
    for p in &positions {
        out.write_f32::<LE>(p[0]).unwrap();
        out.write_f32::<LE>(p[1]).unwrap();
        out.write_f32::<LE>(p[2]).unwrap();
    }

    // Central point — zero if we subtracted, preserved (including signed
    // zeros) if the SCO's central was already IEEE-zero.
    out.write_f32::<LE>(central_out[0]).unwrap();
    out.write_f32::<LE>(central_out[1]).unwrap();
    out.write_f32::<LE>(central_out[2]).unwrap();

    // Faces
    for face_idx in 0..(face_count as usize) {
        let i0 = sco.indices[face_idx * 3];
        let i1 = sco.indices[face_idx * 3 + 1];
        let i2 = sco.indices[face_idx * 3 + 2];
        out.write_u32::<LE>(i0).unwrap();
        out.write_u32::<LE>(i1).unwrap();
        out.write_u32::<LE>(i2).unwrap();
        write_padded_string(&mut out, &sco.material, 64);
        // UVs grouped (u0, u1, u2, v0, v1, v2).
        let uv0 = sco.uvs[face_idx * 3];
        let uv1 = sco.uvs[face_idx * 3 + 1];
        let uv2 = sco.uvs[face_idx * 3 + 2];
        out.write_f32::<LE>(uv0[0]).unwrap();
        out.write_f32::<LE>(uv1[0]).unwrap();
        out.write_f32::<LE>(uv2[0]).unwrap();
        out.write_f32::<LE>(uv0[1]).unwrap();
        out.write_f32::<LE>(uv1[1]).unwrap();
        out.write_f32::<LE>(uv2[1]).unwrap();
    }

    Ok(out)
}

/// Convert a single `.sco` file to a `.scb` next to it. Returns the output
/// path on success. The original `.sco` is left untouched.
pub fn convert_one(path: &Path) -> Result<PathBuf, String> {
    let bytes =
        fs::read(path).map_err(|e| format!("Read failed: {}: {}", path.display(), e))?;
    let sco = parse_sco(&bytes)?;
    let scb_bytes = write_scb(&sco)?;
    let scb_path = path.with_extension("scb");
    fs::write(&scb_path, scb_bytes)
        .map_err(|e| format!("Write failed: {}: {}", scb_path.display(), e))?;
    Ok(scb_path)
}

/// Result of a recursive directory conversion.
pub struct DirConvertResult {
    pub scanned: usize,
    pub converted: usize,
    pub failed: usize,
    /// (input_path, error) for every file that failed to convert.
    pub errors: Vec<(PathBuf, String)>,
}

fn walk_sco(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read dir {}: {}", dir.display(), e))?;
    for e in entries {
        let e = e
            .map_err(|err| format!("Failed to read entry in {}: {}", dir.display(), err))?;
        let p = e.path();
        if p.is_dir() {
            walk_sco(&p, out)?;
        } else if p
            .extension()
            .and_then(|x| x.to_str())
            .map(|x| x.eq_ignore_ascii_case("sco"))
            .unwrap_or(false)
        {
            out.push(p);
        }
    }
    Ok(())
}

/// Recursively convert every `.sco` under `dir`. If `dir` is a file, its
/// parent directory is scanned (a convenience for right-clicking a file
/// inside a folder that some Windows configs pass via `%1`).
pub fn convert_dir(dir: &Path) -> Result<DirConvertResult, String> {
    let scan_root = if dir.is_file() {
        dir.parent().unwrap_or(dir).to_path_buf()
    } else {
        dir.to_path_buf()
    };

    let mut files = Vec::new();
    walk_sco(&scan_root, &mut files)?;

    let mut result = DirConvertResult {
        scanned: files.len(),
        converted: 0,
        failed: 0,
        errors: Vec::new(),
    };
    for p in &files {
        match convert_one(p) {
            Ok(_) => result.converted += 1,
            Err(e) => {
                result.failed += 1;
                result.errors.push((p.clone(), e));
            }
        }
    }
    Ok(result)
}
