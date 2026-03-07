pub mod reader;
pub mod writer;

pub use reader::*;
pub use writer::*;

/// Measures the differnece in cursor position of an `io::Seek`, before and after calling `inner`
/// **NOTE**: this function assumes the cursor position after calling `inner()` will always be >= the cursor after calling `inner()`. Negative position differences will clamp to 0.
///
/// The `inner` function's Err type **must** impl `From<std::io::Error>`, since
/// `std::io::Seek::stream_position()` is fallable
pub fn measure<S, T, E>(
    seekable: &mut S,
    mut inner: impl FnMut(&mut S) -> Result<T, E>,
) -> Result<(u64, T), E>
where
    S: std::io::Seek + ?Sized,
    E: std::error::Error + From<std::io::Error>,
{
    let start = seekable.stream_position()?;

    let val = inner(seekable)?;
    Ok((seekable.stream_position()?.saturating_sub(start), val))
}

/// Temporarily seeks an `io::Seek` to `SeekFrom::Start(at)`, for the duration of the `inner` call.
/// Returns back to the seek position afterwards.
///
/// # Example
/// ```rs
/// let mut buf = Cursor::new(Vec::new());
///
/// let size_pos = buf.stream_position().unwrap();
///
/// // things happen....
///
/// window_at(&mut buf, size_pos, |buf| {
///     let size = 10;
///     buf.write_u32::<LE>(size)
/// })
/// ```
pub fn window_at<S, T, E>(
    seekable: &mut S,
    at: u64,
    mut inner: impl FnMut(&mut S) -> Result<T, E>,
) -> Result<T, E>
where
    S: std::io::Seek + ?Sized,
    E: std::error::Error + From<std::io::Error>,
{
    let original = seekable.stream_position()?;
    seekable.seek(std::io::SeekFrom::Start(at))?;
    let val = inner(seekable)?;
    seekable.seek(std::io::SeekFrom::Start(original))?;
    Ok(val)
}

/// Temporarily seeks an `io::Seek` to the current position, for the duration of the `inner` call.
/// Returns back to the seek position afterwards.
///
/// # Example
/// ```rs
/// let mut buf = Cursor::new(Vec::new());
/// // things happen....
/// window(&mut buf, |buf| {
///     let size = 10;
///     buf.write_u32::<LE>(size)
/// })
/// ```
pub fn window<S, T, E>(
    seekable: &mut S,
    mut inner: impl FnMut(&mut S) -> Result<T, E>,
) -> Result<T, E>
where
    S: std::io::Seek + ?Sized,
    E: std::error::Error + From<std::io::Error>,
{
    let original = seekable.stream_position()?;
    let val = inner(seekable)?;
    seekable.seek(std::io::SeekFrom::Start(original))?;
    Ok(val)
}
