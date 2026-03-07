pub mod defines;
pub mod loader;
pub mod toc;

use byteorder::{ReadBytesExt, LE};
use std::io::{self, Read};

#[derive(Debug, Clone, Copy)]
pub enum ShaderType {
    Vertex,
    Pixel,
}

impl ShaderType {
    pub fn extension(&self) -> &'static str {
        match self {
            ShaderType::Vertex => "vs",
            ShaderType::Pixel => "ps",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum GraphicsPlatform {
    Dx9,
    Dx11,
    Glsl,
    Metal,
}

impl GraphicsPlatform {
    pub fn extension(&self) -> &'static str {
        match self {
            GraphicsPlatform::Dx9 => "dx9",
            GraphicsPlatform::Dx11 => "dx11",
            GraphicsPlatform::Glsl => "glsl",
            GraphicsPlatform::Metal => "metal",
        }
    }
}

pub(crate) fn read_sized_string<R: Read>(reader: &mut R) -> io::Result<String> {
    let len = reader.read_u32::<LE>()?;
    let mut buf = vec![0u8; len as usize];
    reader.read_exact(&mut buf)?;
    String::from_utf8(buf).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

pub fn create_shader_object_path(
    shader_object_path: &str,
    shader_type: ShaderType,
    platform: GraphicsPlatform,
) -> String {
    format!(
        "{}.{}.{}",
        shader_object_path,
        shader_type.extension(),
        platform.extension()
    )
    .to_lowercase()
}

pub fn create_shader_bundle_path(full_shader_object_path: &str, shader_bundle_id: u32) -> String {
    format!("{}_{}", full_shader_object_path, shader_bundle_id).to_lowercase()
}
