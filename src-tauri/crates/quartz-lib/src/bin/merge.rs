//! Multi-file BIN merge — unions the entries from N input .bin files into one
//! output file. Unlike `combine::combine_linked` (which follows a main bin's
//! `linked` chain), this is a straight explicit merge of whatever files the
//! caller hands it.
//!
//! Rules:
//! - **Entries**: preserve the order given by the caller; on duplicate
//!   `path_hash`, first-seen wins (later duplicates are dropped and counted).
//!   Matches how `combine::combine_linked` treats duplicates.
//! - **Linked deps**: union of every input bin's `linked` list, order-preserving,
//!   deduped by string. Anything that points at a basename of one of the input
//!   files is dropped (that dependency is now inlined).
//! - **Version / type flags**: inherited from the first input bin. Riot never
//!   mixes bin format versions across a single champion, so the first one is
//!   a safe representative.
//!
//! Output goes to `output_path`; caller decides whether to overwrite.

use crate::bin::ritoshark_bridge::{read_bin, write_bin};
use crate::error::{Error, Result};
use ritoshark::bin::Bin;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Outcome of a merge, for the UI notification.
#[derive(Debug, Clone)]
pub struct MergeStats {
    pub inputs: usize,
    pub entries_written: usize,
    pub duplicates_skipped: usize,
    pub linked_deps: usize,
    pub output_path: PathBuf,
    /// Per-input diagnostic tuple: (path, entries in that input, linked in that input).
    /// Populated in order the inputs were fed in. Useful for the CLI verb log so
    /// unexpected entry counts can be traced back to a specific source.
    pub per_input: Vec<(PathBuf, usize, usize)>,
}

/// Merge the entries of every `input` bin into a single output bin at
/// `output_path`. Callers should ensure `inputs.len() >= 2`; single-input
/// merges are the caller's no-op case, not this function's.
pub fn merge_bins(inputs: &[PathBuf], output_path: &Path) -> Result<MergeStats> {
    if inputs.is_empty() {
        return Err(Error::InvalidInput("no input .bin files".to_string()));
    }

    // Basenames of the inputs — we strip these from the merged `linked` list
    // because a link to a file we just inlined would dangle after the merge.
    let input_basenames: HashSet<String> = inputs
        .iter()
        .filter_map(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()))
        .collect();

    let mut merged: Option<Bin> = None;
    let mut seen_path_hashes: HashSet<u32> = HashSet::new();
    let mut seen_linked: HashSet<String> = HashSet::new();
    let mut duplicates_skipped: usize = 0;
    let mut per_input: Vec<(PathBuf, usize, usize)> = Vec::with_capacity(inputs.len());

    for path in inputs {
        let data = fs::read(path).map_err(|e| Error::io_with_path(e, path))?;
        let bin = read_bin(&data).map_err(|e| {
            Error::InvalidInput(format!("Failed to parse {}: {}", path.display(), e))
        })?;

        per_input.push((path.clone(), bin.entries.len(), bin.linked.len()));

        // The first bin becomes the accumulator so we inherit its header /
        // version flags without hand-copying every field.
        let acc = merged.get_or_insert_with(|| {
            let mut seed = bin.clone();
            seed.entries.clear();
            seed.linked.clear();
            seed
        });

        for entry in bin.entries {
            if seen_path_hashes.insert(entry.path_hash) {
                acc.entries.push(entry);
            } else {
                duplicates_skipped += 1;
            }
        }
        for link in bin.linked {
            let link_lc = link.to_lowercase();
            let basename = Path::new(&link)
                .file_name()
                .map(|n| n.to_string_lossy().to_lowercase())
                .unwrap_or_else(|| link_lc.clone());
            if input_basenames.contains(&basename) {
                continue; // dependency was inlined; drop the dangling link
            }
            if seen_linked.insert(link_lc) {
                acc.linked.push(link);
            }
        }
    }

    let merged = merged.expect("inputs was checked non-empty");
    let bytes = write_bin(&merged)
        .map_err(|e| Error::InvalidInput(format!("Failed to serialize merged bin: {}", e)))?;
    fs::write(output_path, &bytes).map_err(|e| Error::io_with_path(e, output_path))?;

    Ok(MergeStats {
        inputs: inputs.len(),
        entries_written: merged.entries.len(),
        duplicates_skipped,
        linked_deps: merged.linked.len(),
        output_path: output_path.to_path_buf(),
        per_input,
    })
}
