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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_io_error_conversion() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err: Error = io_err.into();
        assert!(matches!(err, Error::Io { .. }));
        assert!(err.to_string().contains("IO error"));
    }

    #[test]
    fn test_io_error_with_path() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err = Error::io_with_path(io_err, "/path/to/file.txt");
        let display = err.to_string();
        assert!(display.contains("IO error"));
        assert!(display.contains("/path/to/file.txt"));
        assert!(display.contains("file not found"));
    }

    #[test]
    fn test_parse_error_display() {
        let err = Error::Parse {
            line: 42,
            message: "unexpected token".to_string(),
            path: None,
        };
        let display = err.to_string();
        assert!(display.contains("Parse error"));
        assert!(display.contains("at line 42"));
        assert!(display.contains("unexpected token"));
    }

    #[test]
    fn test_parse_error_with_path() {
        let err = Error::parse_with_path(42, "unexpected token", "/path/to/file.py");
        let display = err.to_string();
        assert!(display.contains("Parse error"));
        assert!(display.contains("/path/to/file.py"));
        assert!(display.contains("at line 42"));
        assert!(display.contains("unexpected token"));
    }

    #[test]
    fn test_wad_error() {
        let err = Error::Wad {
            message: "invalid WAD header".to_string(),
            path: None,
        };
        assert!(err.to_string().contains("WAD error"));
        assert!(err.to_string().contains("invalid WAD header"));
    }

    #[test]
    fn test_wad_error_with_path() {
        let err = Error::wad_with_path("invalid WAD header", "/path/to/file.wad");
        let display = err.to_string();
        assert!(display.contains("WAD error"));
        assert!(display.contains("/path/to/file.wad"));
        assert!(display.contains("invalid WAD header"));
    }

    #[test]
    fn test_hash_error() {
        let err = Error::Hash("hash not found".to_string());
        assert!(err.to_string().contains("Hash error"));
        assert!(err.to_string().contains("hash not found"));
    }

    #[test]
    fn test_bin_conversion_error() {
        let err = Error::BinConversion {
            message: "invalid bin format".to_string(),
            path: None,
        };
        assert!(err.to_string().contains("Bin conversion error"));
        assert!(err.to_string().contains("invalid bin format"));
    }

    #[test]
    fn test_bin_conversion_error_with_path() {
        let err = Error::bin_conversion_with_path("invalid bin format", "/path/to/file.bin");
        let display = err.to_string();
        assert!(display.contains("Bin conversion error"));
        assert!(display.contains("/path/to/file.bin"));
        assert!(display.contains("invalid bin format"));
    }

    #[test]
    fn test_invalid_input_error() {
        let err = Error::InvalidInput("empty path".to_string());
        assert!(err.to_string().contains("Invalid input"));
        assert!(err.to_string().contains("empty path"));
    }

    #[test]
    fn test_error_to_string_conversion() {
        let err = Error::Hash("test error".to_string());
        let s: String = err.into();
        assert!(s.contains("Hash error"));
        assert!(s.contains("test error"));
    }

    #[test]
    fn test_result_type() {
        fn returns_result() -> Result<i32> {
            Ok(42)
        }
        
        fn returns_error() -> Result<i32> {
            Err(Error::InvalidInput("test".to_string()))
        }
        
        assert_eq!(returns_result().unwrap(), 42);
        assert!(returns_error().is_err());
    }
}
