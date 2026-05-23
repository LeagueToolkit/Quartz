use crate::types::InibinFlags;

#[derive(Debug, thiserror::Error, miette::Diagnostic)]
pub enum InibinError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Empty inibin data")]
    Empty,

    #[error("Unknown inibin version: {0}")]
    UnknownVersion(u8),

    #[error("Cannot write v1 (old format) entries to binary — convert to v2 storage types first")]
    V1WriteNotSupported,

    #[error("Invalid storage type: {0}")]
    InvalidStorageType(#[from] num_enum::TryFromPrimitiveError<InibinFlags>),
}
