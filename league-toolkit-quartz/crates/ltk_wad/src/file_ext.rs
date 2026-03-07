use crate::WadChunkCompression;
use ltk_file::LeagueFileKind;

pub trait FileExt {
    /// Get the ideal compression for this file type.
    ///
    /// # Examples
    /// ```
    /// # use ltk_file::*;
    /// # use ltk_wad::{WadChunkCompression, FileExt as _};
    /// #
    /// assert_eq!(LeagueFileKind::Animation.ideal_compression(), WadChunkCompression::Zstd);
    /// assert_eq!(LeagueFileKind::WwisePackage.ideal_compression(), WadChunkCompression::None);
    /// ```
    fn ideal_compression(&self) -> WadChunkCompression;
}

impl FileExt for LeagueFileKind {
    fn ideal_compression(&self) -> WadChunkCompression {
        match self {
            LeagueFileKind::WwisePackage | LeagueFileKind::WwiseBank => WadChunkCompression::None,
            _ => WadChunkCompression::Zstd,
        }
    }
}
