use crate::{
    error::ParseError,
    mem::{IndexBuffer, VertexBufferDescription},
    skinned::{vertex, SkinnedMeshVertexType, MAGIC},
    SkinnedMesh, SkinnedMeshRange,
};
use byteorder::{ReadBytesExt, LE};
use ltk_io_ext::ReaderExt;
use ltk_primitives::{Sphere, AABB};
use num_enum::TryFromPrimitiveError;
use std::io::Read;

impl SkinnedMesh {
    pub fn from_reader<R: Read>(reader: &mut R) -> crate::Result<Self> {
        let magic = reader.read_u32::<LE>()?;
        if magic != MAGIC {
            return Err(ParseError::InvalidFileSignature);
        }

        let major = reader.read_u16::<LE>()?;
        let minor = reader.read_u16::<LE>()?;
        if major != 0 && major != 2 && major != 4 && minor != 1 {
            return Err(ParseError::InvalidFileVersion(major, minor));
        }

        let index_count;
        let vertex_count;
        let mut ranges;
        let mut vertex_declaration: VertexBufferDescription = vertex::BASIC.clone();
        let mut _b_box = AABB::default();
        let mut _b_sphere = Sphere::INFINITE;

        if major == 0 {
            index_count = reader.read_i32::<LE>()?;
            vertex_count = reader.read_i32::<LE>()?;
            ranges = vec![SkinnedMeshRange::new("Base", 0, 0, 0, 0)]
        } else {
            let range_len = reader.read_u32::<LE>()? as usize;
            ranges = Vec::with_capacity(range_len);
            for _ in 0..range_len {
                ranges.push(SkinnedMeshRange::from_reader(reader)?)
            }

            if major == 4 {
                let _flags = reader.read_u32::<LE>()?;
            }

            index_count = reader.read_i32::<LE>()?;
            vertex_count = reader.read_i32::<LE>()?;

            if major == 4 {
                let vertex_size = reader.read_u32::<LE>()?;
                let vertex_type: SkinnedMeshVertexType = reader
                    .read_u32::<LE>()?
                    .try_into()
                    .map_err(|e: TryFromPrimitiveError<SkinnedMeshVertexType>| {
                        ParseError::InvalidField("vertex type", e.number.to_string())
                    })?;

                vertex_declaration = match (vertex_size, vertex_type) {
                    (52, SkinnedMeshVertexType::Basic) => vertex::BASIC.clone(),
                    (56, SkinnedMeshVertexType::Color) => vertex::COLOR.clone(),
                    (72, SkinnedMeshVertexType::Tangent) => vertex::TANGENT.clone(),
                    _ => {
                        return Err(ParseError::InvalidField(
                            "vertex type/size",
                            format!("{vertex_type:?}: {vertex_size}"),
                        ));
                    }
                };

                _b_box = reader.read_aabb::<LE>()?;
                _b_sphere = reader.read_sphere::<LE>()?;
            }
        }

        let index_buffer = IndexBuffer::<u16>::read(reader, index_count as _)?;

        let mut vertex_buffer = vec![0; vertex_declaration.vertex_size() * vertex_count as usize];
        reader.read_exact(&mut vertex_buffer)?;
        let vertex_buffer = vertex_declaration.into_vertex_buffer(vertex_buffer);

        Ok(Self::new(ranges, vertex_buffer, index_buffer))
    }
}
