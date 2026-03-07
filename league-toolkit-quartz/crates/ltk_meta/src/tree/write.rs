use std::io;

use super::Bin;
use byteorder::{WriteBytesExt, LE};
use ltk_io_ext::WriterExt;

/// The version used when writing Bin files.
///
/// This is always version 3, which supports all features including
/// dependencies and data overrides.
pub const WRITE_VERSION: u32 = 3;

impl Bin {
    /// Write this bin to a writer.
    ///
    /// The output will always use version 3 format, regardless of the
    /// `version` field on this struct. This ensures maximum compatibility
    /// and feature support.
    ///
    /// # Arguments
    ///
    /// * `writer` - A writer that implements io::Write and io::Seek.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use std::io::Cursor;
    /// use ltk_meta::Bin;
    ///
    /// let tree = Bin::default();
    /// let mut buffer = Cursor::new(Vec::new());
    /// tree.to_writer(&mut buffer)?;
    /// # Ok::<(), std::io::Error>(())
    /// ```
    pub fn to_writer<W: io::Write + io::Seek + ?Sized>(&self, writer: &mut W) -> io::Result<()> {
        match self.is_override {
            true => todo!("implement is_override Bin write"),
            false => {
                writer.write_u32::<LE>(Self::PROP)?;
            }
        }

        // Always write version 3
        writer.write_u32::<LE>(WRITE_VERSION)?;
        writer.write_u32::<LE>(self.dependencies.len() as _)?;
        for dep in &self.dependencies {
            writer.write_len_prefixed_string::<LE, _>(dep)?;
        }

        writer.write_u32::<LE>(self.objects.len() as _)?;
        for obj in self.objects.values() {
            writer.write_u32::<LE>(obj.class_hash)?;
        }
        for obj in self.objects.values() {
            obj.to_writer(writer)?;
        }

        if self.is_override {
            writer.write_u32::<LE>(self.data_overrides.len() as _)?;
            // TODO: impl data overrides
            //for o in &self.data_overrides {
            //}
        }

        Ok(())
    }
}
