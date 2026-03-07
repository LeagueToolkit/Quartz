use super::RigResource;
use byteorder::{WriteBytesExt, LE};
use ltk_hash::elf;
use ltk_io_ext::WriterExt;
use std::io;
use std::io::{Seek, SeekFrom, Write};

impl RigResource {
    pub fn to_writer<W: Write + Seek + ?Sized>(&self, writer: &mut W) -> io::Result<()> {
        writer.write_u32::<LE>(0)?; // file size - write later (see [3])
        writer.write_u32::<LE>(Self::FORMAT_TOKEN)?;
        writer.write_u32::<LE>(0)?; // version

        writer.write_u16::<LE>(self.flags)?;
        writer.write_u16::<LE>(self.joints.len() as _)?;
        writer.write_u32::<LE>(self.influences.len() as _)?;

        let joints_section_size = self.joints.len() * 100;
        let joint_hash_ids_section_size = self.joints.len() * 8;
        let influences_section_size = self.influences.len() * 2;

        let joints_off = 64;
        let joint_hash_ids_off = joints_off + joints_section_size;
        let influences_off = joint_hash_ids_off + joint_hash_ids_section_size;
        let joint_names_off = influences_off + influences_section_size;

        writer.write_i32::<LE>(joints_off as i32)?;
        writer.write_i32::<LE>(joint_hash_ids_off as i32)?;
        writer.write_i32::<LE>(influences_off as i32)?;

        let name_off_pos = writer.stream_position()?;
        writer.write_i32::<LE>(-1)?; // name offset - write later (see [1])

        let asset_name_off_pos = writer.stream_position()?;
        writer.write_i32::<LE>(-1)?; // asset_name offset - write later (see [2])

        writer.write_i32::<LE>(joint_names_off as i32)?;

        for _ in 0..5 {
            // reserved offset fields
            writer.write_u32::<LE>(0xFFFFFFFF)?;
        }

        writer.seek(SeekFrom::Start(joint_names_off as u64))?;
        // Write joint names + remember offsets
        let mut joint_name_offs = Vec::with_capacity(self.joints.len());
        for j in &self.joints {
            joint_name_offs.push(writer.stream_position()?);
            writer.write_terminated_string(j.name())?;
        }

        // Write joints
        writer.seek(SeekFrom::Start(joints_off as u64))?;
        for (j, off) in self.joints.iter().zip(joint_name_offs.iter()) {
            j.to_writer(writer, *off)?;
        }

        // Write influences
        writer.seek(SeekFrom::Start(influences_off as u64))?;
        for inf in &self.influences {
            writer.write_i16::<LE>(*inf)?;
        }

        // Write joint id hashed, sorted by hash
        writer.seek(SeekFrom::Start(joint_hash_ids_off as u64))?;
        let mut hash_ids = self
            .joints
            .iter()
            .map(|j| (j.id(), elf::elf(j.name())))
            .collect::<Vec<_>>();
        hash_ids.sort_by(|a, b| b.1.cmp(&a.1));

        for (id, hash) in hash_ids {
            writer.write_i16::<LE>(id)?;
            writer.write_i16::<LE>(0)?;
            writer.write_u32::<LE>(hash as u32)?; // TODO (alan): is this u32 or u64
        }

        let name_off = writer.seek(SeekFrom::End(0))?;
        writer.write_terminated_string(&self.name)?;

        let asset_name_off = writer.stream_position()?;
        writer.write_terminated_string(&self.asset_name)?;
        // file size, see [3]
        let size = writer.stream_position()?;

        // [1] write name offset
        writer.seek(SeekFrom::Start(name_off_pos))?;
        writer.write_i32::<LE>(name_off as i32)?;

        // [2] write name offset
        writer.seek(SeekFrom::Start(asset_name_off_pos))?;
        writer.write_i32::<LE>(asset_name_off as i32)?;

        // [3] write file size
        writer.seek(SeekFrom::Start(0))?;
        writer.write_u32::<LE>(size as u32)?;

        Ok(())
    }
}
