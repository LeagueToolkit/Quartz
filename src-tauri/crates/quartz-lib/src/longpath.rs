/* Windows extended-length path support.

Windows' default path APIs reject paths longer than MAX_PATH (260 chars) unless
the path is prefixed with the `\\?\` verbatim marker, which raises the limit to
~32K. Combined multi-skin BINs (e.g. `ahri_multi_skins_skin0_..._skin95.bin`)
have ~500-char names, so writing them fails with OS error 123 without this.

`to_extended` converts an ABSOLUTE path to the verbatim form:
  * backslash-only separators (verbatim paths do NOT accept `/`),
  * a `\\?\` prefix (or `\\?\UNC\` for UNC paths),
  * already-verbatim paths pass through unchanged.

Relative paths and non-Windows targets are returned unchanged (the caller should
always join onto an absolute output root before writing anyway). */

use std::path::{Path, PathBuf};

/// Return a path safe to pass to `std::fs` for long-path writes on Windows.
/// No-op on non-Windows and on relative / already-verbatim paths.
pub fn to_extended(path: &Path) -> PathBuf {
    #[cfg(not(windows))]
    {
        path.to_path_buf()
    }
    #[cfg(windows)]
    {
        let s = path.to_string_lossy();
        // Already verbatim (\\?\ or \\?\UNC\): leave it.
        if s.starts_with(r"\\?\") {
            return path.to_path_buf();
        }
        // Only absolute paths can be made verbatim.
        if !path.is_absolute() {
            return path.to_path_buf();
        }
        // Normalize separators to `\` — verbatim paths reject `/`.
        let norm = s.replace('/', r"\");
        if let Some(rest) = norm.strip_prefix(r"\\") {
            // UNC path `\\server\share\...` -> `\\?\UNC\server\share\...`
            PathBuf::from(format!(r"\\?\UNC\{}", rest))
        } else {
            // Drive path `C:\...` -> `\\?\C:\...`
            PathBuf::from(format!(r"\\?\{}", norm))
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn drive_path_gets_prefix_and_backslashes() {
        let p = Path::new(r"C:\a/b\c.bin");
        assert_eq!(to_extended(p), Path::new(r"\\?\C:\a\b\c.bin"));
    }

    #[test]
    fn already_verbatim_unchanged() {
        let p = Path::new(r"\\?\C:\a\b.bin");
        assert_eq!(to_extended(p), p);
    }

    #[test]
    fn relative_unchanged() {
        let p = Path::new(r"a\b.bin");
        assert_eq!(to_extended(p), p);
    }

    #[test]
    fn unc_path() {
        let p = Path::new(r"\\srv\share\x.bin");
        assert_eq!(to_extended(p), Path::new(r"\\?\UNC\srv\share\x.bin"));
    }
}
