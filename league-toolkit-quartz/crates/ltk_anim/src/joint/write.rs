use crate::Joint;
use byteorder::{WriteBytesExt, LE};
use ltk_hash::elf;
use ltk_io_ext::WriterExt;
use std::io;
use std::io::{Seek, Write};

impl Joint {
    pub fn to_writer<W: Write + Seek + ?Sized>(
        &self,
        writer: &mut W,
        name_off: u64,
    ) -> io::Result<()> {
        writer.write_u16::<LE>(self.flags)?;
        writer.write_i16::<LE>(self.id)?;
        writer.write_i16::<LE>(self.parent_id)?;

        writer.write_i16::<LE>(0)?; // padding

        writer.write_u32::<LE>(elf::elf(&self.name) as u32)?;
        writer.write_f32::<LE>(self.radius)?;

        writer.write_vec3::<LE>(&self.local_translation)?;
        writer.write_vec3::<LE>(&self.local_scale)?;
        writer.write_quat::<LE>(&self.local_rotation)?;

        writer.write_vec3::<LE>(&self.inverse_bind_translation)?;
        writer.write_vec3::<LE>(&self.inverse_bind_scale)?;
        writer.write_quat::<LE>(&self.inverse_bind_rotation)?;

        let pos = writer.stream_position()?;
        writer.write_i32::<LE>((name_off as i64 - pos as i64) as i32)?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use approx::assert_ulps_eq;
    use glam::{vec3, Mat4, Quat};
    use io::SeekFrom;
    use std::io::Cursor;

    macro_rules! assert_joint_fuzzy_vec {
        ($a: ident, $b: ident, $field:tt) => {
            for (a, b) in $a.$field.to_array().iter().zip($b.$field.to_array().iter()) {
                assert_ulps_eq!(a, b);
            }
            $a.$field = $b.$field;
        };
    }
    macro_rules! assert_joint_fuzzy_mat {
        ($a: ident, $b: ident, $field:tt) => {
            for (a, b) in $a
                .$field
                .to_cols_array()
                .iter()
                .zip($b.$field.to_cols_array().iter())
            {
                assert_ulps_eq!(a, b);
            }
            $a.$field = $b.$field;
        };
    }

    #[test]
    fn roundtrip_write() {
        let mat = Mat4::from_scale_rotation_translation(
            vec3(0.5, 0.5, 0.5),
            Quat::from_array([1.0, 0.8, 0.1, 0.0]).normalize(),
            vec3(1.0, 50.0, 34.0),
        );

        let joint_name = "joint";
        let joint_size = 100; // size of joint in bytes
        let mut buf = Cursor::new(vec![0; joint_size + joint_name.len() + 1]); // +1 for nul terminator

        let mut a = Joint::new(
            joint_name.into(),
            1234,
            5432,
            9876,
            42.0,
            mat,
            mat.inverse(),
        );

        let name_off = joint_size as u64;

        a.to_writer(&mut buf, name_off).unwrap();

        buf.seek(SeekFrom::Start(name_off)).unwrap();
        buf.write_all(joint_name.as_bytes()).unwrap();
        buf.rewind().unwrap();

        println!("{buf:?}");

        let b = Joint::from_reader(&mut buf).unwrap();
        /*
         Because assert_eq isn't good with floats,
         we first check the float values with the 'approx' crate (see above macros),
         then *sets* the fields equal to each other,
         so that the assert_eq doesn't fail on those fields - but still checks everything else.
        */
        assert_joint_fuzzy_vec!(a, b, local_scale);
        assert_joint_fuzzy_vec!(a, b, local_rotation);
        assert_joint_fuzzy_vec!(a, b, local_translation);
        assert_joint_fuzzy_mat!(a, b, local_transform);

        assert_joint_fuzzy_vec!(a, b, inverse_bind_scale);
        assert_joint_fuzzy_vec!(a, b, inverse_bind_rotation);
        assert_joint_fuzzy_vec!(a, b, inverse_bind_translation);
        assert_joint_fuzzy_mat!(a, b, inverse_bind_transform);

        assert_eq!(a, b);
    }
}
