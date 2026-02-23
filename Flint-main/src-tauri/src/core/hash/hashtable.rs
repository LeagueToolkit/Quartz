use std::fs;
use std::path::{Path, PathBuf};
use rayon::prelude::*;
use crate::error::{Error, Result};

/// Compact hash-to-path lookup table.
///
/// Instead of `HashMap<u64, String>` (one heap allocation per path + bucket
/// overhead), all path strings are packed into a single contiguous byte arena.
/// Keys are stored in a sorted `Vec<u64>` so `binary_search` gives the index
/// into the parallel `values` vec holding `(byte_offset, byte_length)` into
/// the arena.
///
/// Memory vs HashMap at ~4 M entries / ~50-char avg path:
///   HashMap  ≈ 420 MB (128 MB buckets + 96 MB String headers + ~200 MB data)
///   This     ≈ 264 MB ( 32 MB keys   + 32 MB offsets        + ~200 MB data)
pub struct Hashtable {
    /// Sorted hash keys (index aligns with `values`).
    keys:   Vec<u64>,
    /// (byte_offset, byte_length) into `arena` for each key.
    values: Vec<(u32, u32)>,
    /// All path strings packed as UTF-8 bytes.
    arena:  Vec<u8>,
}

impl Hashtable {
    /// Empty table used as a no-op fallback.
    pub fn empty() -> Self {
        Self { keys: Vec::new(), values: Vec::new(), arena: Vec::new() }
    }

    /// Load all `.txt` hash files from `dir` in parallel and build the table.
    pub fn from_directory(dir: impl AsRef<Path>) -> Result<Self> {
        let dir = dir.as_ref();

        if !dir.is_dir() {
            return Err(Error::Hash(format!(
                "Hash directory does not exist: {}", dir.display()
            )));
        }

        let txt_files: Vec<PathBuf> = fs::read_dir(dir)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_file() && p.extension().and_then(|s| s.to_str()) == Some("txt"))
            .collect();

        tracing::debug!("Loading {} hash files in parallel", txt_files.len());

        // Parse each file in parallel - collect Results to check for parse errors
        type ParseResult = (PathBuf, Result<Vec<(u64, String)>>);
        let results: Vec<ParseResult> = txt_files
            .par_iter()
            .map(|path| (path.clone(), Self::parse_file(path)))
            .collect();

        // Check for parse errors (invalid hash format) - these should fail fast
        // I/O errors are more lenient and just skip the file
        for (path, result) in &results {
            if let Err(e) = result {
                if matches!(e, Error::Parse { .. }) {
                    tracing::error!("Parse error in {:?}: {}", path, e);
                    // Recreate the error since it can't be cloned
                    if let Error::Parse { line, message, .. } = e {
                        return Err(Error::parse_with_path(*line, message.clone(), path));
                    }
                }
            }
        }

        // Collect successful parses
        let partial: Vec<Vec<(u64, String)>> = results
            .into_iter()
            .filter_map(|(_, result)| match result {
                Ok(v) => Some(v),
                Err(e) => {
                    tracing::warn!("Skipped file: {}", e);
                    None
                }
            })
            .collect();

        // Merge, sort by hash, deduplicate.
        let total: usize = partial.iter().map(|v| v.len()).sum();
        let mut flat: Vec<(u64, String)> = Vec::with_capacity(total);
        for v in partial { flat.extend(v); }
        flat.sort_unstable_by_key(|(k, _)| *k);
        flat.dedup_by_key(|(k, _)| *k);

        // Build sorted keys, offset/length index, and arena in one pass.
        let arena_bytes: usize = flat.iter().map(|(_, s)| s.len()).sum();
        let mut keys:   Vec<u64>      = Vec::with_capacity(flat.len());
        let mut values: Vec<(u32,u32)>= Vec::with_capacity(flat.len());
        let mut arena:  Vec<u8>       = Vec::with_capacity(arena_bytes);

        for (hash, path) in &flat {
            values.push((arena.len() as u32, path.len() as u32));
            arena.extend_from_slice(path.as_bytes());
            keys.push(*hash);
        }

        tracing::info!("Hashtable loaded: {} entries, {} KB arena", keys.len(), arena.len() / 1024);

        Ok(Self { keys, values, arena })
    }

    fn parse_file(path: &Path) -> Result<Vec<(u64, String)>> {
        let content = fs::read_to_string(path)?;
        let mut out = Vec::with_capacity(content.len() / 50);

        for (line_idx, line) in content.lines().enumerate() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') { continue; }

            let Some((hash_str, path_str)) = line.split_once(' ') else { continue; };

            let hash = if let Some(hex) = hash_str.strip_prefix("0x").or_else(|| hash_str.strip_prefix("0X")) {
                // Explicit 0x prefix → parse as hex
                u64::from_str_radix(hex, 16).map_err(|e| Error::parse_with_path(
                    line_idx + 1,
                    format!("Invalid hash value: '{}' - {}", hash_str, e),
                    path,
                ))
            } else if hash_str.bytes().all(|b| b.is_ascii_digit()) {
                // Only digits 0-9 → parse as decimal
                hash_str.parse::<u64>().map_err(|e| Error::parse_with_path(
                    line_idx + 1,
                    format!("Invalid hash value: '{}' - {}", hash_str, e),
                    path,
                ))
            } else if hash_str.bytes().all(|b| b.is_ascii_hexdigit()) {
                // Contains hex letters a-f → parse as hex
                u64::from_str_radix(hash_str, 16).map_err(|e| Error::parse_with_path(
                    line_idx + 1,
                    format!("Invalid hash value: '{}' - {}", hash_str, e),
                    path,
                ))
            } else {
                // Invalid format - contains non-hex characters
                Err(Error::parse_with_path(
                    line_idx + 1,
                    format!("Invalid hash value: '{}' - must be decimal, hex, or 0x-prefixed hex", hash_str),
                    path,
                ))
            }?;

            out.push((hash, path_str.to_string()));
        }
        Ok(out)
    }

    /// Resolve a hash to its path string.
    ///
    /// Returns a borrowed `&str` from the arena (zero allocation) on hit,
    /// or an owned hex string on miss.
    pub fn resolve(&self, hash: u64) -> std::borrow::Cow<'_, str> {
        match self.keys.binary_search(&hash) {
            Ok(idx) => {
                let (off, len) = self.values[idx];
                let bytes = &self.arena[off as usize..(off + len) as usize];
                // SAFETY: only valid UTF-8 strings are pushed into the arena.
                std::borrow::Cow::Borrowed(unsafe { std::str::from_utf8_unchecked(bytes) })
            }
            Err(_) => std::borrow::Cow::Owned(format!("{:016x}", hash)),
        }
    }

    pub fn len(&self) -> usize { self.keys.len() }

    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool { self.keys.is_empty() }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as IoWrite;
    use tempfile::TempDir;

    fn write(dir: &Path, name: &str, content: &str) {
        let mut f = fs::File::create(dir.join(name)).unwrap();
        f.write_all(content.as_bytes()).unwrap();
    }

    #[test]
    fn test_loads_all_txt_files() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "a.txt", "0x1a2b3c4d characters/aatrox/base.bin\n0x5e6f7a8b assets/test.dds\n");
        write(tmp.path(), "b.txt", "0xabcdef12 data/menu/main.bin\n");
        write(tmp.path(), "readme.md", "ignored\n");
        assert_eq!(Hashtable::from_directory(tmp.path()).unwrap().len(), 3);
    }

    #[test]
    fn test_resolve_known() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "h.txt", "0x1a2b3c4d characters/aatrox/base.bin\n");
        let ht = Hashtable::from_directory(tmp.path()).unwrap();
        assert_eq!(ht.resolve(0x1a2b3c4d), "characters/aatrox/base.bin");
    }

    #[test]
    fn test_resolve_unknown_returns_hex() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "h.txt", "0x1a2b3c4d test.bin\n");
        let ht = Hashtable::from_directory(tmp.path()).unwrap();
        assert_eq!(ht.resolve(0x9999999999999999), "9999999999999999");
    }

    #[test]
    fn test_decimal_hash() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "h.txt", "123456789 test.bin\n");
        let ht = Hashtable::from_directory(tmp.path()).unwrap();
        assert_eq!(ht.len(), 1);
        assert_eq!(ht.resolve(123456789), "test.bin");
    }

    #[test]
    fn test_skip_empty_and_comments() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "h.txt", "# comment\n\n0x1a2b3c4d t1.bin\n\n# another\n0x5e6f7a8b t2.bin\n");
        assert_eq!(Hashtable::from_directory(tmp.path()).unwrap().len(), 2);
    }

    #[test]
    fn test_nonexistent_dir() {
        let r = Hashtable::from_directory("/nonexistent/path/does/not/exist");
        assert!(r.is_err());
        if let Err(Error::Hash(msg)) = r {
            assert!(msg.contains("does not exist"));
        } else {
            panic!("Expected Hash error");
        }
    }

    #[test]
    fn test_invalid_hash() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "h.txt", "invalid_hash test.bin\n");
        let r = Hashtable::from_directory(tmp.path());
        assert!(r.is_err());
        if let Err(Error::Parse { line, message, .. }) = r {
            assert_eq!(line, 1);
            assert!(message.contains("Invalid hash value"));
        } else {
            panic!("Expected Parse error");
        }
    }

    #[test]
    fn test_is_empty() {
        let tmp = TempDir::new().unwrap();
        assert!(Hashtable::from_directory(tmp.path()).unwrap().is_empty());
        write(tmp.path(), "h.txt", "0x1a2b3c4d t.bin\n");
        assert!(!Hashtable::from_directory(tmp.path()).unwrap().is_empty());
    }
}
