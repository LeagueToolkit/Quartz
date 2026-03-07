use super::Format;
use std::io;

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("Unknown TEX format: {0}")]
    UnknownTextureFormat(u8),
    #[error("Unsupported TEX format: {0:?}")]
    UnsupportedTextureFormat(Format),
    #[error("Invalid TEX flags: {0:#b}")]
    InvalidTextureFlags(u8),
    #[error("IO Error: {0}")]
    IOError(#[from] io::Error),

    #[error("Could not make image - invalid dimensions")]
    InvalidDimensions,

    #[error("Error reading image data: {0}")]
    DDSError(#[from] image_dds::error::SurfaceError),
    #[error(transparent)]
    TexError(#[from] super::DecodeErr),
}

#[derive(thiserror::Error, Debug)]
pub enum DecodeErr {
    #[error("Could not decode ETC1: {0}")]
    Etc1(&'static str),
    #[error("Could not decode ETC2/EAC: {0}")]
    Etc2Eac(&'static str),
    #[error("Could not decode BC3: {0}")]
    Bc3(&'static str),
    #[error("Could not decode BC1: {0}")]
    Bc1(&'static str),
}
