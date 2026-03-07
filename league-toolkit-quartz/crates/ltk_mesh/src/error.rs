#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("Invalid file signature")]
    InvalidFileSignature,
    #[error("Invalid file version '{0}.{1}'")]
    InvalidFileVersion(u16, u16),
    #[error("Invalid '{0}' - got '{1}'")]
    InvalidField(&'static str, String),
    #[error("IO Error - {0}")]
    IOError(#[from] std::io::Error),
    #[error("UTF-8 Error - {0}")]
    Utf8Error(#[from] std::str::Utf8Error),
    #[error(transparent)]
    ReaderError(#[from] ltk_io_ext::ReaderError),
}
