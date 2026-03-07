use crate::{r#static::MAGIC, StaticMesh, StaticMeshFlags};
use byteorder::{WriteBytesExt, LE};
use ltk_io_ext::WriterExt;
use std::io::Write;

impl StaticMesh {
    /// Writes the static mesh to a binary stream
    pub fn to_writer<W: Write>(&self, writer: &mut W) -> crate::Result<()> {
        let aabb = self.bounding_box();

        // Determine flags based on face colors
        let mut flags = StaticMeshFlags::HAS_LOCAL_ORIGIN_LOCATOR_AND_PIVOT;
        let has_face_colors = self.faces.iter().any(|f| f.has_custom_colors());
        if has_face_colors {
            flags |= StaticMeshFlags::HAS_VCP;
        }

        // Write header
        writer.write_all(MAGIC)?;
        writer.write_u16::<LE>(3)?; // major version
        writer.write_u16::<LE>(2)?; // minor version
        writer.write_padded_string::<128>(&self.name)?;

        writer.write_i32::<LE>(self.vertices.len() as i32)?;
        writer.write_i32::<LE>(self.faces.len() as i32)?;

        writer.write_u32::<LE>(flags.bits())?;
        writer.write_aabb::<LE>(&aabb)?;
        writer.write_u32::<LE>(if self.has_vertex_colors() { 1 } else { 0 })?;

        // Write vertices
        for vertex in &self.vertices {
            writer.write_vec3::<LE>(vertex)?;
        }

        // Write vertex colors (BGRA u8 format)
        if let Some(colors) = &self.vertex_colors {
            for color in colors {
                writer.write_color_bgra_u8(color)?;
            }
        }

        // Write central point
        writer.write_vec3::<LE>(&aabb.center())?;

        // Write faces
        for face in &self.faces {
            face.to_writer(writer)?;
        }

        // Write face vertex colors if needed (RGB u8 format)
        if flags.contains(StaticMeshFlags::HAS_VCP) {
            for face in &self.faces {
                writer.write_color_rgb_u8(&face.colors[0])?;
                writer.write_color_rgb_u8(&face.colors[1])?;
                writer.write_color_rgb_u8(&face.colors[2])?;
            }
        }

        Ok(())
    }

    /// Writes the static mesh to an ASCII stream (.sco format)
    pub fn to_ascii<W: Write>(&self, writer: &mut W) -> crate::Result<()> {
        let central_point = self.bounding_box().center();

        writeln!(writer, "[ObjectBegin]")?;
        writeln!(writer, "Name= {}", self.name)?;
        writeln!(
            writer,
            "CentralPoint= {} {} {}",
            central_point.x, central_point.y, central_point.z
        )?;
        writeln!(
            writer,
            "PivotPoint= {} {} {}",
            central_point.x, central_point.y, central_point.z
        )?;

        if self.has_vertex_colors() {
            writeln!(writer, "VertexColors= 1")?;
        }

        writeln!(writer, "Verts= {}", self.vertices.len())?;
        for vertex in &self.vertices {
            writeln!(writer, "{} {} {}", vertex.x, vertex.y, vertex.z)?;
        }

        if let Some(colors) = &self.vertex_colors {
            for color in colors {
                writeln!(writer, "{} {} {} {}", color.r, color.g, color.b, color.a)?;
            }
        }

        writeln!(writer, "Faces= {}", self.faces.len())?;
        for face in &self.faces {
            face.to_ascii(writer)?;
        }

        writeln!(writer, "[ObjectEnd]")?;

        Ok(())
    }
}
