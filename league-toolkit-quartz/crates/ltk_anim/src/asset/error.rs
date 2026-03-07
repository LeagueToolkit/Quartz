#[derive(Debug, thiserror::Error)]
pub enum AssetParseError {
    #[error("Unknown asset type")]
    UnknownAssetType,
    #[error("Invalid file version '{0}'")]
    InvalidFileVersion(u32),
    #[error("Invalid '{0}' - got '{1}'")]
    InvalidField(&'static str, String),

    #[error("Animation does not contain {0} data!")]
    MissingData(&'static str),

    #[error("IO Error - {0}")]
    ReaderError(#[from] std::io::Error),
    #[error("UTF-8 Error - {0}")]
    Utf8Error(#[from] std::str::Utf8Error),
    #[error("Reader Error - {0}")]
    IoReaderError(#[from] ltk_io_ext::ReaderError),
}

pub type Result<T> = core::result::Result<T, AssetParseError>;
