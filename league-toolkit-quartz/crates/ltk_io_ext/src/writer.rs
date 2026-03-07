use std::io::{self, Write};

use byteorder::{ByteOrder, WriteBytesExt};
use glam::{Mat4, Quat};

use ltk_primitives::{Color, Sphere, AABB};

pub trait WriterExt: Write {
    fn write_padded_string<const N: usize>(&mut self, str: &str) -> io::Result<()> {
        debug_assert!(str.len() <= N);
        let mut buf = Vec::with_capacity(N);
        buf.extend_from_slice(str.as_bytes());
        buf.resize(N, 0);
        self.write_all(&buf)
    }

    fn write_len_prefixed_string<T: ByteOrder, S: AsRef<str>>(&mut self, str: S) -> io::Result<()> {
        let str = str.as_ref();
        self.write_u16::<T>(str.len() as _)?;
        self.write_all(str.as_bytes())?;
        Ok(())
    }

    /// Writes a string with a length prefix (writes sizeof(str.len()) + str.len() bytes)
    fn write_len_prefixed_string_better<T: ByteOrder>(
        &mut self,
        str: impl AsRef<str>,
    ) -> io::Result<()> {
        let str = str.as_ref();
        self.write_u16::<T>(str.len() as _)?;
        self.write_all(str.as_bytes())?;
        Ok(())
    }

    /// Writes a string with a null terminator (writes sizeof(str) + 1 bytes)
    fn write_terminated_string<S: AsRef<str>>(&mut self, str: S) -> io::Result<()> {
        self.write_all(str.as_ref().as_bytes())?;
        self.write_u8(0)
    }
    fn write_bool(&mut self, b: bool) -> io::Result<()> {
        self.write_u8(match b {
            true => 1,
            false => 0,
        })
    }

    fn write_color<E: ByteOrder>(&mut self, color: &Color) -> io::Result<()> {
        color.to_writer::<E>(self)
    }
    fn write_color_u8(&mut self, color: &Color<u8>) -> io::Result<()> {
        color.to_writer(self)
    }
    fn write_color_f32<E: ByteOrder>(&mut self, color: &Color<f32>) -> io::Result<()> {
        color.to_writer::<E>(self)
    }
    /// Writes color as BGRA u8 (4 bytes)
    fn write_color_bgra_u8(&mut self, color: &Color<u8>) -> io::Result<()> {
        color.to_writer_bgra(self)
    }
    /// Writes color as RGB u8 (3 bytes, no alpha)
    fn write_color_rgb_u8(&mut self, color: &Color<u8>) -> io::Result<()> {
        color.to_writer_rgb(self)
    }

    fn write_vec2<E: ByteOrder>(&mut self, vec: impl AsRef<[f32; 2]>) -> io::Result<()> {
        for i in vec.as_ref() {
            self.write_f32::<E>(*i)?;
        }
        Ok(())
    }
    fn write_vec3<E: ByteOrder>(&mut self, vec: impl AsRef<[f32; 3]>) -> io::Result<()> {
        for i in vec.as_ref() {
            self.write_f32::<E>(*i)?;
        }
        Ok(())
    }
    fn write_vec4<E: ByteOrder>(&mut self, vec: impl AsRef<[f32; 4]>) -> io::Result<()> {
        for i in vec.as_ref() {
            self.write_f32::<E>(*i)?;
        }
        Ok(())
    }
    fn write_quat<E: ByteOrder>(&mut self, quaternion: &Quat) -> io::Result<()> {
        for i in quaternion.to_array() {
            self.write_f32::<E>(i)?;
        }
        Ok(())
    }
    fn write_mat4_row_major<E: ByteOrder>(&mut self, mat: Mat4) -> io::Result<()> {
        for i in mat.transpose().to_cols_array() {
            self.write_f32::<E>(i)?;
        }
        Ok(())
    }

    fn write_aabb<E: ByteOrder>(&mut self, aabb: &AABB) -> io::Result<()> {
        self.write_vec3::<E>(&aabb.min)?;
        self.write_vec3::<E>(&aabb.max)?;
        Ok(())
    }
    fn write_sphere<E: ByteOrder>(&mut self, sphere: &Sphere) -> io::Result<()> {
        self.write_vec3::<E>(&sphere.origin)?;
        self.write_f32::<E>(sphere.radius)?;
        Ok(())
    }
}

impl<W: Write + ?Sized> WriterExt for W {}
