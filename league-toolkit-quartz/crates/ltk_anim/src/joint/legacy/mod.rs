use byteorder::{ReadBytesExt, LE};
use glam::Mat4;
use ltk_io_ext::ReaderExt;
use std::io;
use std::io::Read;

#[derive(Debug, Clone, PartialEq)]
pub struct LegacyJoint {
    name: String,
    id: i16,
    parent_id: i16,
    radius: f32,
    global_transform: Mat4,
}

impl LegacyJoint {
    pub fn from_reader<R: Read + ?Sized>(reader: &mut R, id: i16) -> io::Result<Self> {
        let name = reader
            .read_padded_string::<LE, 32>()
            .expect("FIXME: better error here");
        let parent_id = reader.read_i32::<LE>()? as i16;
        let radius = reader.read_f32::<LE>()?;
        let mut transform = [[0.0; 4]; 4];
        transform[3][3] = 1.0;
        for i in 0..3 {
            for row in &mut transform {
                row[i] = reader.read_f32::<LE>()?;
            }
        }

        Ok(Self {
            name,
            id,
            parent_id,
            radius,
            global_transform: Mat4::from_cols_array_2d(&transform),
        })
    }
}
