#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("IO error{}: {}", .path.as_ref().map(|p| format!(" at '{}'", p.display())).unwrap_or_default(), .source)]
    Io {
        source: std::io::Error,
        path: Option<std::path::PathBuf>,
    },

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Parse error{} at line {}: {}", .path.as_ref().map(|p| format!(" in file '{}'", p.display())).unwrap_or_default(), .line, .message)]
    Parse {
        line: usize,
        message: String,
        path: Option<std::path::PathBuf>,
    },

    #[error("WAD error{}: {}", .path.as_ref().map(|p| format!(" in file '{}'", p.display())).unwrap_or_default(), .message)]
    Wad {
        message: String,
        path: Option<std::path::PathBuf>,
    },

    #[error("Hash error: {0}")]
    Hash(String),

    #[error("Bin conversion error{}: {}", .path.as_ref().map(|p| format!(" in file '{}'", p.display())).unwrap_or_default(), .message)]
    BinConversion {
        message: String,
        path: Option<std::path::PathBuf>,
    },

    #[error("Invalid input: {0}")]
    InvalidInput(String),
}

impl Error {
    /// Creates an IO error with file path context
    pub fn io_with_path(source: std::io::Error, path: impl Into<std::path::PathBuf>) -> Self {
        Error::Io {
            source,
            path: Some(path.into()),
        }
    }

    /// Creates a parse error with file path context
    pub fn parse_with_path(
        line: usize,
        message: impl Into<String>,
        path: impl Into<std::path::PathBuf>,
    ) -> Self {
        Error::Parse {
            line,
            message: message.into(),
            path: Some(path.into()),
        }
    }

    /// Creates a WAD error with file path context
    pub fn wad_with_path(message: impl Into<String>, path: impl Into<std::path::PathBuf>) -> Self {
        Error::Wad {
            message: message.into(),
            path: Some(path.into()),
        }
    }

    /// Creates a bin conversion error with file path context
    pub fn bin_conversion_with_path(
        message: impl Into<String>,
        path: impl Into<std::path::PathBuf>,
    ) -> Self {
        Error::BinConversion {
            message: message.into(),
            path: Some(path.into()),
        }
    }
}

// Implement From<std::io::Error> manually since we changed the variant structure
impl From<std::io::Error> for Error {
    fn from(source: std::io::Error) -> Self {
        Error::Io { source, path: None }
    }
}

// Convert to String for Tauri commands
impl From<Error> for String {
    fn from(error: Error) -> Self {
        error.to_string()
    }
}

pub type Result<T> = std::result::Result<T, Error>;
