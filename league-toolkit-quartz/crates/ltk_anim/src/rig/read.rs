use crate::RigResource;
use std::io::{Read, Seek};

impl RigResource {
    pub fn from_reader<R: Read + Seek + ?Sized>(reader: &mut R) -> crate::Result<Self> {
        use byteorder::{ReadBytesExt as _, LE};
        use std::io::SeekFrom;

        reader.seek(SeekFrom::Start(4))?;
        let format_token = reader.read_u32::<LE>()?;
        reader.rewind()?;
        match format_token == Self::FORMAT_TOKEN {
            true => Self::read(reader),
            false => Self::read_legacy(reader),
        }
    }

    fn read<R: Read + Seek + ?Sized>(reader: &mut R) -> crate::Result<Self> {
        use crate::{Joint, ParseError};
        use byteorder::{ReadBytesExt, LE};
        use ltk_io_ext::ReaderExt;
        use std::io::SeekFrom;

        let _file_size = reader.read_u32::<LE>()?;
        let _format_token = reader.read_u32::<LE>()?;
        let version = reader.read_u32::<LE>()?;
        if version != 0 {
            return Err(ParseError::InvalidFileVersion(version));
        }

        let flags = reader.read_u16::<LE>()?;
        let joint_count = reader.read_u16::<LE>()? as usize;
        let influences_count = reader.read_u32::<LE>()? as usize;
        let joints_off = reader.read_i32::<LE>()?;
        let joint_indices_off = reader.read_i32::<LE>()?;
        let influences_off = reader.read_i32::<LE>()?;
        let name_off = reader.read_i32::<LE>()?;
        let asset_name_off = reader.read_i32::<LE>()?;
        let _bone_names_off = reader.read_i32::<LE>()?;

        // extension offsets
        for _ in 0..5 {
            reader.read_i32::<LE>()?;
        }

        let mut joints = Vec::with_capacity(joint_count);
        if joints_off > 0 {
            reader.seek(SeekFrom::Start(joints_off as u64))?;
            for _ in 0..joint_count {
                joints.push(Joint::from_reader(reader)?);
            }
        }

        let mut influences = Vec::with_capacity(influences_count);
        if influences_off > 0 {
            reader.seek(SeekFrom::Start(influences_off as u64))?;
            for _ in 0..influences_count {
                influences.push(reader.read_i16::<LE>()?);
            }
        }

        // These are sorted by hash in ascending order
        let mut joint_hash_ids = Vec::with_capacity(joint_count);
        if joint_indices_off > 0 {
            reader.seek(SeekFrom::Start(joint_indices_off as u64))?;
            for _ in 0..joint_count {
                let id = reader.read_i16::<LE>()?;
                reader.read_i16::<LE>()?;
                let hash = reader.read_u32::<LE>()?;
                joint_hash_ids.push((id, hash));
            }
        }

        let name = match name_off > 0 {
            true => {
                reader.seek(SeekFrom::Start(name_off as u64))?;
                reader.read_str_until_nul()?
            }
            false => String::new(),
        };

        let asset_name = match asset_name_off > 0 {
            true => {
                reader.seek(SeekFrom::Start(asset_name_off as u64))?;
                reader.read_str_until_nul()?
            }
            false => String::new(),
        };

        Ok(Self {
            flags,
            name,
            asset_name,
            joints,
            influences,
        })
    }

    fn read_legacy<R: Read + ?Sized>(_reader: &mut R) -> crate::Result<Self> {
        unimplemented!("TODO: impl legacy skeleton");
    }
}
