use crate::{error::ParseError, r#static::MAGIC, StaticMesh, StaticMeshFace, StaticMeshFlags};
use byteorder::{ReadBytesExt, LE};
use glam::{vec3, Vec3};
use ltk_io_ext::ReaderExt;
use ltk_primitives::Color;
use std::io::{BufRead, Read};

impl StaticMesh {
    /// Reads a static mesh from a binary stream
    pub fn from_reader<R: Read>(reader: &mut R) -> crate::Result<Self> {
        let mut buf: [u8; 8] = [0; 8];
        reader.read_exact(&mut buf)?;
        if MAGIC != buf {
            return Err(ParseError::InvalidFileSignature);
        }

        let major = reader.read_u16::<LE>()?;
        let minor = reader.read_u16::<LE>()?;

        // Valid versions: [3.2], [2.1], [1.1] - accept if major in {2,3} OR minor == 1
        if major != 2 && major != 3 && minor != 1 {
            return Err(ParseError::InvalidFileVersion(major, minor));
        }

        let name = reader.read_padded_string::<LE, 128>()?;

        let vertex_count = reader.read_i32::<LE>()? as usize;
        let face_count = reader.read_i32::<LE>()? as usize;

        let flags = StaticMeshFlags::from_bits_truncate(reader.read_u32::<LE>()?);
        let _bounding_box = reader.read_aabb::<LE>()?;

        // Vertex colors flag only present in version 3.2+
        let has_vertex_colors = match (major, minor) {
            (major, minor) if major >= 3 && minor >= 2 => reader.read_u32::<LE>()? == 1,
            _ => false,
        };

        // Read vertices
        let mut vertices = Vec::with_capacity(vertex_count);
        for _ in 0..vertex_count {
            vertices.push(reader.read_vec3::<LE>()?);
        }

        // Read vertex colors (BGRA u8 format)
        let vertex_colors = if has_vertex_colors {
            let mut colors = Vec::with_capacity(vertex_count);
            for _ in 0..vertex_count {
                colors.push(reader.read_color_bgra_u8()?);
            }
            Some(colors)
        } else {
            None
        };

        let _central_point: Vec3 = reader.read_vec3::<LE>()?;

        // Read faces
        let mut faces = Vec::with_capacity(face_count);
        for _ in 0..face_count {
            faces.push(StaticMeshFace::from_reader(reader)?);
        }

        // Read face vertex colors if HasVcp flag is set (RGB u8 format, no alpha)
        if flags.contains(StaticMeshFlags::HAS_VCP) {
            for face in &mut faces {
                face.colors = [
                    reader.read_color_rgb_u8()?,
                    reader.read_color_rgb_u8()?,
                    reader.read_color_rgb_u8()?,
                ];
            }
        }

        Ok(Self {
            name,
            vertices,
            faces,
            vertex_colors,
        })
    }

    /// Reads a static mesh from an ASCII stream (.sco format)
    pub fn from_ascii<R: BufRead>(reader: &mut R) -> crate::Result<Self> {
        let mut line = String::new();

        // Read and validate header
        reader.read_line(&mut line)?;
        if line.trim() != "[ObjectBegin]" {
            return Err(ParseError::InvalidFileSignature);
        }

        // Read name: "Name= <name>"
        line.clear();
        reader.read_line(&mut line)?;
        let name = Self::parse_ascii_value(&line)
            .unwrap_or_default()
            .to_string();

        // Read CentralPoint (we don't store it, but must parse)
        line.clear();
        reader.read_line(&mut line)?;
        let _central_point = Self::parse_ascii_vec3(&line)?;

        // Next line could be PivotPoint=, VertexColors=, or Verts=
        line.clear();
        reader.read_line(&mut line)?;
        let parts: Vec<&str> = line.split_whitespace().collect();

        let mut has_vertex_colors = false;

        // Handle optional PivotPoint
        if parts.first().copied() == Some("PivotPoint=") {
            let _pivot_point = Self::parse_ascii_vec3(&line)?;
            line.clear();
            reader.read_line(&mut line)?;
        }

        // Check for VertexColors
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.first().copied() == Some("VertexColors=") {
            has_vertex_colors = parts
                .get(1)
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0)
                != 0;
            line.clear();
            reader.read_line(&mut line)?;
        }

        // Now we should be at Verts= line (or already read it)
        let parts: Vec<&str> = line.split_whitespace().collect();
        let vertex_count: usize = if parts.first().copied() == Some("Verts=") {
            parts
                .get(1)
                .and_then(|s| s.parse().ok())
                .ok_or_else(|| ParseError::InvalidField("vertex count", line.clone()))?
        } else {
            return Err(ParseError::InvalidField("Verts=", line.clone()));
        };

        // Read vertices
        let mut vertices = Vec::with_capacity(vertex_count);
        for _ in 0..vertex_count {
            line.clear();
            reader.read_line(&mut line)?;
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 3 {
                return Err(ParseError::InvalidField(
                    "vertex",
                    format!("expected 3 components, got {}", parts.len()),
                ));
            }
            vertices.push(vec3(
                parts[0]
                    .parse()
                    .map_err(|_| ParseError::InvalidField("vertex.x", parts[0].to_string()))?,
                parts[1]
                    .parse()
                    .map_err(|_| ParseError::InvalidField("vertex.y", parts[1].to_string()))?,
                parts[2]
                    .parse()
                    .map_err(|_| ParseError::InvalidField("vertex.z", parts[2].to_string()))?,
            ));
        }

        // Read vertex colors if present
        let vertex_colors = if has_vertex_colors {
            let mut colors = Vec::with_capacity(vertex_count);
            for _ in 0..vertex_count {
                line.clear();
                reader.read_line(&mut line)?;
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() != 4 {
                    return Err(ParseError::InvalidField(
                        "vertex color",
                        format!("expected 4 components, got {}", parts.len()),
                    ));
                }
                colors.push(Color::new(
                    parts[0]
                        .parse()
                        .map_err(|_| ParseError::InvalidField("color.r", parts[0].to_string()))?,
                    parts[1]
                        .parse()
                        .map_err(|_| ParseError::InvalidField("color.g", parts[1].to_string()))?,
                    parts[2]
                        .parse()
                        .map_err(|_| ParseError::InvalidField("color.b", parts[2].to_string()))?,
                    parts[3]
                        .parse()
                        .map_err(|_| ParseError::InvalidField("color.a", parts[3].to_string()))?,
                ));
            }
            Some(colors)
        } else {
            None
        };

        // Read face count: "Faces= <count>"
        line.clear();
        reader.read_line(&mut line)?;
        let parts: Vec<&str> = line.split_whitespace().collect();
        let face_count: usize = parts
            .get(1)
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| ParseError::InvalidField("face count", line.clone()))?;

        // Read faces
        let mut faces = Vec::with_capacity(face_count);
        for _ in 0..face_count {
            faces.push(StaticMeshFace::from_ascii(reader)?);
        }

        Ok(Self {
            name,
            vertices,
            faces,
            vertex_colors,
        })
    }

    /// Helper to parse "Key= value" format and extract value
    fn parse_ascii_value(line: &str) -> Option<&str> {
        line.split_once('=').map(|(_, v)| v.trim())
    }

    /// Helper to parse "Key= x y z" format into Vec3
    fn parse_ascii_vec3(line: &str) -> crate::Result<Vec3> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            return Err(ParseError::InvalidField("vec3", line.to_string()));
        }
        Ok(vec3(
            parts[1]
                .parse()
                .map_err(|_| ParseError::InvalidField("vec3.x", parts[1].to_string()))?,
            parts[2]
                .parse()
                .map_err(|_| ParseError::InvalidField("vec3.y", parts[2].to_string()))?,
            parts[3]
                .parse()
                .map_err(|_| ParseError::InvalidField("vec3.z", parts[3].to_string()))?,
        ))
    }
}
