use byteorder::{ReadBytesExt, WriteBytesExt, LE};
use ltk_io_ext::ReaderExt;
use ltk_io_ext::WriterExt;
use std::io;
use std::io::{Read, Write};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct SkinnedMeshRange {
    pub material: String,
    pub start_vertex: i32,
    pub vertex_count: i32,
    pub start_index: i32,
    pub index_count: i32,
}

impl SkinnedMeshRange {
    pub fn new<S: Into<String>>(
        material: S,
        start_vertex: i32,
        vertex_count: i32,
        start_index: i32,
        index_count: i32,
    ) -> Self {
        Self {
            material: material.into(),
            start_vertex,
            vertex_count,
            start_index,
            index_count,
        }
    }

    pub fn from_reader<R: Read>(reader: &mut R) -> super::Result<Self> {
        Ok(Self {
            material: reader.read_padded_string::<LE, 64>()?,
            start_vertex: reader.read_i32::<LE>()?,
            vertex_count: reader.read_i32::<LE>()?,
            start_index: reader.read_i32::<LE>()?,
            index_count: reader.read_i32::<LE>()?,
        })
    }

    pub fn to_writer<W: Write>(&self, writer: &mut W) -> io::Result<()> {
        writer.write_padded_string::<64>(&self.material)?;
        writer.write_i32::<LE>(self.start_vertex)?;
        writer.write_i32::<LE>(self.vertex_count)?;
        writer.write_i32::<LE>(self.start_index)?;
        writer.write_i32::<LE>(self.index_count)?;
        Ok(())
    }
}
