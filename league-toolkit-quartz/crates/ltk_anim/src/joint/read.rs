use crate::Joint;
use byteorder::{ReadBytesExt, LE};
use glam::Mat4;
use ltk_io_ext::ReaderExt;
use std::io;
use std::io::SeekFrom;
use std::io::{Read, Seek};

impl Joint {
    pub fn new(
        name: String,
        flags: u16,
        id: i16,
        parent_id: i16,
        radius: f32,
        local_transform: Mat4,
        inverse_bind_transform: Mat4,
    ) -> Self {
        let (local_scale, local_rotation, local_translation) =
            local_transform.to_scale_rotation_translation();
        let (inverse_bind_scale, inverse_bind_rotation, inverse_bind_translation) =
            inverse_bind_transform.to_scale_rotation_translation();

        Self {
            name,
            flags,
            id,
            parent_id,
            radius,
            local_transform,
            local_translation,
            local_scale,
            local_rotation,
            inverse_bind_transform,
            inverse_bind_translation,
            inverse_bind_scale,
            inverse_bind_rotation,
        }
    }

    pub fn from_reader<R: Read + Seek + ?Sized>(reader: &mut R) -> io::Result<Self> {
        let flags = reader.read_u16::<LE>()?;
        let id = reader.read_i16::<LE>()?;
        let parent_id = reader.read_i16::<LE>()?;
        reader.read_i16::<LE>()?; // padding
        let _name_hash = reader.read_u32::<LE>()?;
        let radius = reader.read_f32::<LE>()?;

        let local_translation = reader.read_vec3::<LE>()?;
        let local_scale = reader.read_vec3::<LE>()?;
        let local_rotation = reader.read_quat::<LE>()?.normalize();

        let inverse_bind_translation = reader.read_vec3::<LE>()?;
        let inverse_bind_scale = reader.read_vec3::<LE>()?;
        let inverse_bind_rotation = reader.read_quat::<LE>()?;

        let name_off = reader.read_i32::<LE>()?;
        let return_pos = reader.stream_position()?;

        reader.seek(SeekFrom::Current(-4 + name_off as i64))?;
        let name = reader.read_str_until_nul()?;
        reader.seek(SeekFrom::Start(return_pos))?;

        Ok(Self {
            name,
            flags,
            id,
            parent_id,
            radius,
            local_transform: Mat4::from_scale_rotation_translation(
                local_scale,
                local_rotation.normalize(),
                local_translation,
            ),
            local_translation,
            local_scale,
            local_rotation,
            inverse_bind_transform: Mat4::from_scale_rotation_translation(
                inverse_bind_scale,
                inverse_bind_rotation.normalize(),
                inverse_bind_translation,
            ),
            inverse_bind_translation,
            inverse_bind_scale,
            inverse_bind_rotation,
        })
    }
}
