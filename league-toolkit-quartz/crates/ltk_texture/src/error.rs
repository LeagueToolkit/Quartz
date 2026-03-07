use thiserror::Error;

use super::{dds, format::TextureFileFormat, tex};

#[derive(Error, Debug)]
pub enum DecompressError {
    #[error("Error decompressing TEX: {0}")]
    Tex(#[from] tex::DecodeErr),
    #[error("Error decompressing DDS: {0}")]
    Dds(#[from] dds::DecodeErr),
}

#[derive(Error, Debug)]
pub enum ToImageError {
    #[error("Invalid container size")]
    InvalidContainerSize,
    #[error(transparent)]
    Dds(#[from] image_dds::error::CreateImageError),
}

#[derive(Error, Debug)]
pub enum ReadError {
    #[error("Unexpected magic, expected {expected:#x}, got {got:#x}")]
    UnexpectedMagic { expected: u32, got: u32 },

    #[error("Invalid texture file format! Got magic: '{0:#x}'")]
    UnknownTextureFormat(u32),
    #[error("Unsupported texture file format - '{0}'!")]
    UnsupportedTextureFormat(TextureFileFormat),
    #[error("Unexpected texture file format! expected {0}, got {1}")]
    UnexpectedTextureFormat(TextureFileFormat, TextureFileFormat),

    #[error("IO error: {0}")]
    IOError(#[from] std::io::Error),
    #[error("Error reading DDS file: {0}")]
    Dds(#[from] ddsfile::Error),
    #[error("Error decoding DDS file: {0}")]
    DdsDecodeError(#[from] image_dds::error::CreateImageError),
    #[error("Error reading TEX file: {0}")]
    TexError(#[from] tex::Error),
}
