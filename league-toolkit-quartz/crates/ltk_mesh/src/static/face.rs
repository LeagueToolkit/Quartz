use byteorder::{ReadBytesExt, WriteBytesExt, LE};
use glam::{vec2, Vec2};
use ltk_io_ext::{ReaderExt, WriterExt};
use ltk_primitives::Color;
use std::io::{BufRead, Read, Write};

/// A face (triangle) in a static mesh
#[derive(Debug, Clone)]
pub struct StaticMeshFace {
    /// Material name for this face
    pub material: String,
    /// Vertex indices
    pub indices: [u32; 3],
    /// UV coordinates for each vertex of the face
    pub uvs: [Vec2; 3],
    /// Per-vertex colors for this face (used when HasVcp flag is set)
    pub colors: [Color<u8>; 3],
}

impl StaticMeshFace {
    /// Creates a new face with the given material, indices, and UVs.
    /// Colors default to white (255, 255, 255, 255).
    pub fn new(material: impl Into<String>, indices: [u32; 3], uvs: [Vec2; 3]) -> Self {
        Self {
            material: material.into(),
            indices,
            uvs,
            colors: [Color::<u8>::ONE; 3],
        }
    }

    /// Creates a new face with explicit colors.
    pub fn with_colors(
        material: impl Into<String>,
        indices: [u32; 3],
        uvs: [Vec2; 3],
        colors: [Color<u8>; 3],
    ) -> Self {
        Self {
            material: material.into(),
            indices,
            uvs,
            colors,
        }
    }

    /// Returns true if any face color differs from white
    pub fn has_custom_colors(&self) -> bool {
        self.colors.iter().any(|c| *c != Color::<u8>::ONE)
    }

    pub(crate) fn from_reader<R: Read>(reader: &mut R) -> crate::Result<Self> {
        let indices = [
            reader.read_u32::<LE>()?,
            reader.read_u32::<LE>()?,
            reader.read_u32::<LE>()?,
        ];

        let material = reader.read_padded_string::<LE, 64>()?;

        // UVs are stored as [u0, u1, u2, v0, v1, v2]
        let u0 = reader.read_f32::<LE>()?;
        let u1 = reader.read_f32::<LE>()?;
        let u2 = reader.read_f32::<LE>()?;
        let v0 = reader.read_f32::<LE>()?;
        let v1 = reader.read_f32::<LE>()?;
        let v2 = reader.read_f32::<LE>()?;

        Ok(Self {
            material,
            indices,
            uvs: [vec2(u0, v0), vec2(u1, v1), vec2(u2, v2)],
            colors: [Color::<u8>::ONE; 3],
        })
    }

    pub(crate) fn to_writer<W: Write>(&self, writer: &mut W) -> crate::Result<()> {
        writer.write_u32::<LE>(self.indices[0])?;
        writer.write_u32::<LE>(self.indices[1])?;
        writer.write_u32::<LE>(self.indices[2])?;

        writer.write_padded_string::<64>(&self.material)?;

        // Write UVs as [u0, u1, u2, v0, v1, v2]
        writer.write_f32::<LE>(self.uvs[0].x)?;
        writer.write_f32::<LE>(self.uvs[1].x)?;
        writer.write_f32::<LE>(self.uvs[2].x)?;
        writer.write_f32::<LE>(self.uvs[0].y)?;
        writer.write_f32::<LE>(self.uvs[1].y)?;
        writer.write_f32::<LE>(self.uvs[2].y)?;

        Ok(())
    }

    /// Reads a face from ASCII format (.sco)
    /// Format: `3 idx0 idx1 idx2 material u0 v0 u1 v1 u2 v2`
    pub(crate) fn from_ascii<R: BufRead>(reader: &mut R) -> crate::Result<Self> {
        let mut line = String::new();
        reader.read_line(&mut line)?;

        let parts: Vec<&str> = line.split([' ', '\t']).filter(|s| !s.is_empty()).collect();

        // Validate format: must have exactly 11 parts
        if parts.len() < 11 {
            return Err(crate::error::ParseError::InvalidField(
                "face format",
                format!("expected 11 fields, got {}", parts.len()),
            ));
        }

        // Validate vertex count (must be 3 for triangles)
        if parts[0] != "3" {
            return Err(crate::error::ParseError::InvalidField(
                "vertex count",
                parts[0].to_string(),
            ));
        }

        // parts[0] = "3" (vertex count, always 3 for triangles)
        // parts[1..4] = indices
        // parts[4] = material
        // parts[5..11] = UVs (u0, v0, u1, v1, u2, v2)
        let indices = [
            parts[1].parse().map_err(|_| {
                crate::error::ParseError::InvalidField("face index 0", parts[1].to_string())
            })?,
            parts[2].parse().map_err(|_| {
                crate::error::ParseError::InvalidField("face index 1", parts[2].to_string())
            })?,
            parts[3].parse().map_err(|_| {
                crate::error::ParseError::InvalidField("face index 2", parts[3].to_string())
            })?,
        ];

        let material = parts[4].trim().to_string();

        let uvs = [
            vec2(
                parts[5].parse().map_err(|_| {
                    crate::error::ParseError::InvalidField("uv0.x", parts[5].to_string())
                })?,
                parts[6].parse().map_err(|_| {
                    crate::error::ParseError::InvalidField("uv0.y", parts[6].to_string())
                })?,
            ),
            vec2(
                parts[7].parse().map_err(|_| {
                    crate::error::ParseError::InvalidField("uv1.x", parts[7].to_string())
                })?,
                parts[8].parse().map_err(|_| {
                    crate::error::ParseError::InvalidField("uv1.y", parts[8].to_string())
                })?,
            ),
            vec2(
                parts[9].parse().map_err(|_| {
                    crate::error::ParseError::InvalidField("uv2.x", parts[9].to_string())
                })?,
                parts[10].trim().parse().map_err(|_| {
                    crate::error::ParseError::InvalidField("uv2.y", parts[10].to_string())
                })?,
            ),
        ];

        Ok(Self {
            material,
            indices,
            uvs,
            colors: [Color::<u8>::ONE; 3],
        })
    }

    /// Writes the face in ASCII format (.sco)
    /// Format: `3 idx0 idx1 idx2 material u0 v0 u1 v1 u2 v2`
    pub(crate) fn to_ascii<W: Write>(&self, writer: &mut W) -> crate::Result<()> {
        writeln!(
            writer,
            "3 {} {} {} {} {} {} {} {} {} {}",
            self.indices[0],
            self.indices[1],
            self.indices[2],
            self.material,
            self.uvs[0].x,
            self.uvs[0].y,
            self.uvs[1].x,
            self.uvs[1].y,
            self.uvs[2].x,
            self.uvs[2].y,
        )?;
        Ok(())
    }
}
