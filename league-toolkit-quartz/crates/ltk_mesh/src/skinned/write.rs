use crate::{
    skinned::{vertex, SkinnedMeshVertexType, MAGIC},
    SkinnedMesh,
};
use byteorder::{WriteBytesExt, LE};
use ltk_io_ext::WriterExt;
use std::io::Write;

impl SkinnedMesh {
    pub fn to_writer<W: Write>(&self, w: &mut W) -> crate::Result<()> {
        w.write_u32::<LE>(MAGIC)?;

        w.write_u16::<LE>(4)?; // major
        w.write_u16::<LE>(1)?; // minor

        w.write_i32::<LE>(self.ranges.len() as i32)?;

        for range in &self.ranges {
            range.to_writer(w)?;
        }

        w.write_u32::<LE>(0)?; // flags
        w.write_i32::<LE>(self.index_buffer.count() as i32)?;
        w.write_i32::<LE>(self.vertex_buffer.count() as i32)?;
        w.write_u32::<LE>(self.vertex_buffer.stride() as u32)?;
        w.write_u32::<LE>(match self.vertex_buffer.description() {
            d if d == &*vertex::BASIC => SkinnedMeshVertexType::Basic.into(),
            d if d == &*vertex::COLOR => SkinnedMeshVertexType::Color.into(),
            d if d == &*vertex::TANGENT => SkinnedMeshVertexType::Tangent.into(),
            _ => panic!("FIXME: unhandled mesh vertex type"),
        })?;

        w.write_aabb::<LE>(&self.aabb)?;
        w.write_sphere::<LE>(&self.bounding_sphere)?;

        w.write_all(self.index_buffer.as_bytes())?;
        w.write_all(self.vertex_buffer.as_bytes())?;

        w.write_all(&[0_u8; 12])?; // end tab
        Ok(())
    }
}
