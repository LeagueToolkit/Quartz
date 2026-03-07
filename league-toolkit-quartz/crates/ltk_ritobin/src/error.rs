//! Error types for ritobin parsing and writing.

// The miette Diagnostic derive macro generates code that triggers this warning
#![allow(unused_assignments)]

use miette::{Diagnostic, SourceSpan};
use thiserror::Error;

/// A span in the source text (offset and length).
#[derive(Debug, Clone, Copy, Default)]
pub struct Span {
    pub offset: usize,
    pub len: usize,
}

impl Span {
    pub fn new(offset: usize, len: usize) -> Self {
        Self { offset, len }
    }
}

impl From<Span> for SourceSpan {
    fn from(span: Span) -> Self {
        SourceSpan::new(span.offset.into(), span.len)
    }
}

/// Errors that can occur during ritobin parsing.
#[derive(Debug, Error, Diagnostic)]
pub enum ParseError {
    #[error("unexpected end of input")]
    #[diagnostic(code(ltk_ritobin::unexpected_eof))]
    UnexpectedEof,

    #[error("invalid header: expected '#PROP_text'")]
    #[diagnostic(code(ltk_ritobin::invalid_header))]
    InvalidHeader {
        #[source_code]
        src: String,
        #[label("expected '#PROP_text' here")]
        span: SourceSpan,
    },

    #[error("unknown type name: '{type_name}'")]
    #[diagnostic(code(ltk_ritobin::unknown_type), help("valid types: bool, i8, u8, i16, u16, i32, u32, i64, u64, f32, vec2, vec3, vec4, mtx44, rgba, string, hash, file, link, flag, list, list2, option, map, pointer, embed"))]
    UnknownType {
        type_name: String,
        #[source_code]
        src: String,
        #[label("unknown type")]
        span: SourceSpan,
    },

    #[error("invalid number: '{value}'")]
    #[diagnostic(code(ltk_ritobin::invalid_number))]
    InvalidNumber {
        value: String,
        #[source_code]
        src: String,
        #[label("could not parse as number")]
        span: SourceSpan,
    },

    #[error("invalid hex value: '{value}'")]
    #[diagnostic(code(ltk_ritobin::invalid_hex))]
    InvalidHex {
        value: String,
        #[source_code]
        src: String,
        #[label("invalid hexadecimal")]
        span: SourceSpan,
    },

    #[error("expected '{expected}'")]
    #[diagnostic(code(ltk_ritobin::expected))]
    Expected {
        expected: String,
        #[source_code]
        src: String,
        #[label("expected {expected}")]
        span: SourceSpan,
    },

    #[error("missing type info for container type")]
    #[diagnostic(
        code(ltk_ritobin::missing_type_info),
        help(
            "container types require inner type specification, e.g. list[string], map[hash,embed]"
        )
    )]
    MissingTypeInfo {
        #[source_code]
        src: String,
        #[label("container type needs type parameters")]
        span: SourceSpan,
    },

    #[error("unexpected content after parsing")]
    #[diagnostic(code(ltk_ritobin::trailing_content))]
    TrailingContent {
        #[source_code]
        src: String,
        #[label("unexpected content here")]
        span: SourceSpan,
    },

    #[error("parse error: {message}")]
    #[diagnostic(code(ltk_ritobin::parse_error))]
    ParseErrorAt {
        message: String,
        #[source_code]
        src: String,
        #[label("{message}")]
        span: SourceSpan,
    },

    #[error("invalid escape sequence")]
    #[diagnostic(code(ltk_ritobin::invalid_escape))]
    InvalidEscape {
        #[source_code]
        src: String,
        #[label("invalid escape sequence")]
        span: SourceSpan,
    },

    #[error("unclosed string")]
    #[diagnostic(code(ltk_ritobin::unclosed_string))]
    UnclosedString {
        #[source_code]
        src: String,
        #[label("string starts here but is never closed")]
        span: SourceSpan,
    },

    #[error("unclosed block")]
    #[diagnostic(code(ltk_ritobin::unclosed_block))]
    UnclosedBlock {
        #[source_code]
        src: String,
        #[label("block starts here but is never closed with '}}'")]
        span: SourceSpan,
    },
}

impl ParseError {
    /// Create an "expected" error with span information.
    pub fn expected(expected: impl Into<String>, src: &str, offset: usize, len: usize) -> Self {
        Self::Expected {
            expected: expected.into(),
            src: src.to_string(),
            span: SourceSpan::new(offset.into(), len),
        }
    }

    /// Create a parse error with span information.
    pub fn at(message: impl Into<String>, src: &str, offset: usize, len: usize) -> Self {
        Self::ParseErrorAt {
            message: message.into(),
            src: src.to_string(),
            span: SourceSpan::new(offset.into(), len),
        }
    }

    /// Create an unknown type error.
    pub fn unknown_type(
        type_name: impl Into<String>,
        src: &str,
        offset: usize,
        len: usize,
    ) -> Self {
        Self::UnknownType {
            type_name: type_name.into(),
            src: src.to_string(),
            span: SourceSpan::new(offset.into(), len),
        }
    }
}

/// Errors that can occur during ritobin writing.
#[derive(Debug, Error, Diagnostic)]
pub enum WriteError {
    #[error("fmt error: {0}")]
    #[diagnostic(code(ltk_ritobin::write::fmt))]
    Fmt(#[from] std::fmt::Error),
}
