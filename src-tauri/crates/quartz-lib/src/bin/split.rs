//! BIN split — extract a subset of objects from a parent BIN into a sibling
//! "linked" BIN file, leaving an entry in the parent's dependency list so the
//! engine merges them back at load time.
//!
//! ## Wire format reference (Quartz parity)
//!
//! Quartz's `bin:combineLinkedBins` action does the inverse of this — it
//! reads `parent.entries` + `parent.links`, walks each linked path in
//! `links`, appends the linked file's `entries` into the parent, deletes the
//! linked file from disk, and prunes the merged path from `links`. See
//! `Quartz/src/main/ipc/channels/binTools.js`.
//!
//! Split is the inverse of that pipeline. The wire format we emit needs to
//! be byte-compatible: a sibling `.bin` with the moved entries in
//! `bin.entries`, an empty `linked` list, and the parent's `linked` list
//! gets the new file's project-relative path appended.
//!
//! ## VFX classification
//!
//! `classify_vfx_objects` returns the path hashes whose class hash matches
//! a known VFX class. The list is the conservative initial set; growing it
//! is safe (more entries get split out), shrinking is safe too (fewer get
//! split — the BIN still works because skipped entries stay in the parent).
//!
//! BIN class hashes are 32-bit FNV1a of the lowercase class name string.
//! See `event_mapper.rs::fnv1_hash` for FNV-1 vs FNV-1a; we use 1a here.

use crate::error::{Error, Result};
use ritoshark::bin::{Bin, BinEntry};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Result of a successful split operation.
#[derive(Debug, Clone)]
pub struct SplitResult {
    /// Number of objects moved out of the parent(s) into the new file.
    pub moved: usize,
    /// Project-relative path appended to the owner BIN's `dependencies`
    /// (forward slashes, lowercase — engine convention).
    pub link_added: String,
}

/// Per-source contribution returned by [`MultiAnalysis`].
#[derive(Debug, Clone)]
pub struct MultiSourceInfo {
    pub bin_path: PathBuf,
    pub object_count: usize,
}

/// Combined analysis across several BIN files. Class groups are unioned;
/// `path_hashes` per group is the concatenation across all sources (each
/// hash is unique per BIN already, so no dedupe needed).
#[derive(Debug, Clone)]
pub struct MultiAnalysis {
    pub sources: Vec<MultiSourceInfo>,
    /// Total object count across every analyzed BIN.
    pub total_objects: usize,
    /// (class_hash, path_hashes) — same shape as [`group_by_class`].
    pub groups: Vec<(u32, Vec<u32>)>,
    /// Default VFX selection — class hashes flagged as VFX in any source.
    pub vfx_class_hashes: HashSet<u32>,
}

/// Compute the FNV-1a 32-bit hash of a string. Used to derive BIN class
/// hashes from their textual class names. Always lowercases the input,
/// matching the convention ritobin and Riot's tooling use.
fn fnv1a_lower(s: &str) -> u32 {
    let mut h: u32 = 0x811c9dc5;
    for b in s.to_lowercase().bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x01000193);
    }
    h
}

/// Class names that we treat as "VFX" by default for the right-click split
/// action. Conservative — anything ambiguous is left in the parent BIN.
pub const VFX_CLASS_NAMES: &[&str] = &[
    "VfxSystemDefinitionData",
    "VfxParticleEmitterDefinitionData",
    "VfxRendererDefinitionData",
    "VfxComplexEmitterDefinitionData",
    "TrailDef",
    "BeamDef",
    "ParticleParameterDef",
    "ParticleSystemDef",
];

/// Returns the path hashes of every object in `bin` whose class hash matches
/// one of [`VFX_CLASS_NAMES`].
pub fn classify_vfx_objects(bin: &Bin) -> Vec<u32> {
    let vfx_hashes: HashSet<u32> = VFX_CLASS_NAMES.iter().map(|n| fnv1a_lower(n)).collect();
    bin.entries
        .iter()
        .filter_map(|e| {
            if vfx_hashes.contains(&e.class_hash) {
                Some(e.path_hash)
            } else {
                None
            }
        })
        .collect()
}

/// Group objects by class hash for the modal preview. Returns a Vec of
/// `(class_hash, path_hashes)` so the frontend can show "VfxSystemDefinitionData
/// (×42)" with checkboxes.
pub fn group_by_class(bin: &Bin) -> Vec<(u32, Vec<u32>)> {
    use std::collections::BTreeMap;
    let mut map: BTreeMap<u32, Vec<u32>> = BTreeMap::new();
    for e in bin.entries.iter() {
        map.entry(e.class_hash).or_default().push(e.path_hash);
    }
    map.into_iter().collect()
}

/// Split a subset of objects out of `parent_bin_path` into a new sibling
/// file at `parent_dir / output_filename`. Updates the parent's
/// `dependencies` to reference the new file (project-relative form).
///
/// `project_root` is the WAD-folder root used as the link path's base — for
/// a project laid out as `content/base/<champion>.wad.client/data/...`, the
/// engine expects link paths like `data/SomeFile.bin`, so we strip
/// `<project_root>` from the absolute path of the new file.
///
/// On success returns the move count and the link string we appended.
pub fn split_bin(
    parent_bin_path: &Path,
    project_root: &Path,
    output_filename: &str,
    move_hashes: &HashSet<u32>,
) -> Result<SplitResult> {
    if move_hashes.is_empty() {
        return Err(Error::InvalidInput(
            "split_bin: no objects selected to move".to_string(),
        ));
    }

    // 1. Read parent.
    let parent_data =
        std::fs::read(parent_bin_path).map_err(|e| Error::io_with_path(e, parent_bin_path))?;
    let mut parent = crate::bin::read_bin(&parent_data)
        .map_err(|e| Error::InvalidInput(format!("Failed to parse parent BIN: {}", e)))?;

    // 2. Pull moved objects out of parent.
    let mut moved_objects: Vec<BinEntry> = Vec::with_capacity(move_hashes.len());
    parent.entries.retain(|e| {
        if move_hashes.contains(&e.path_hash) {
            moved_objects.push(e.clone());
            false
        } else {
            true
        }
    });

    if moved_objects.is_empty() {
        return Err(Error::InvalidInput(
            "split_bin: none of the requested hashes existed in the parent BIN".to_string(),
        ));
    }

    let moved_count = moved_objects.len();

    // 3. Build the new sibling BIN (objects only, empty dependencies).
    let new_bin = Bin {
        entries: moved_objects,
        ..Bin::new()
    };

    // 4. Always write the new BIN under `<wad_root>/data/`. This matches
    //    Riot's convention for linked/concat BINs (engine load-paths look
    //    like `data/<file>.bin`) and keeps the project tree tidy — the new
    //    file is never co-located with the source skin BIN, where it would
    //    get tangled with character-specific assets.
    let data_dir = project_root.join("data");
    std::fs::create_dir_all(&data_dir).map_err(|e| Error::io_with_path(e, &data_dir))?;
    let new_full_path: PathBuf = data_dir.join(output_filename);

    if new_full_path.exists() {
        return Err(Error::InvalidInput(format!(
            "Output file already exists: {}",
            new_full_path.display()
        )));
    }

    // 5. Compute the engine-relative link string — `data/<filename>` per the
    //    rule above. Engine reads `bin.linked` as paths relative to
    //    the WAD root (the directory containing `data/`, `assets/`, etc).
    let link_rel = new_full_path
        .strip_prefix(project_root)
        .map_err(|_| {
            Error::InvalidInput(format!(
                "Output path {} is not inside project root {}",
                new_full_path.display(),
                project_root.display()
            ))
        })?
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase();

    // 6. Write the new BIN to disk first — only mutate the parent if this
    //    succeeds, so a failure leaves the project in its original state.
    let new_bytes = crate::bin::write_bin(&new_bin)
        .map_err(|e| Error::InvalidInput(format!("Failed to serialize new BIN: {}", e)))?;
    std::fs::write(&new_full_path, &new_bytes)
        .map_err(|e| Error::io_with_path(e, &new_full_path))?;

    // 7. Append link to parent.linked (skip duplicates).
    if !parent
        .linked
        .iter()
        .any(|d| d.eq_ignore_ascii_case(&link_rel))
    {
        parent.linked.push(link_rel.clone());
    }

    // 8. Write parent back.
    let parent_bytes = crate::bin::write_bin(&parent)
        .map_err(|e| Error::InvalidInput(format!("Failed to serialize parent BIN: {}", e)))?;
    std::fs::write(parent_bin_path, &parent_bytes)
        .map_err(|e| Error::io_with_path(e, parent_bin_path))?;

    Ok(SplitResult {
        moved: moved_count,
        link_added: link_rel,
    })
}

/// Read several BINs and produce a unioned class breakdown for a multi-source
/// split modal. Failures on individual files are skipped (and tracing-warn'd)
/// so the modal can still operate on whatever parsed.
pub fn analyze_multi(bin_paths: &[PathBuf]) -> MultiAnalysis {
    use std::collections::BTreeMap;
    let vfx_set: HashSet<u32> = VFX_CLASS_NAMES.iter().map(|n| fnv1a_lower(n)).collect();

    let mut class_buckets: BTreeMap<u32, Vec<u32>> = BTreeMap::new();
    let mut sources: Vec<MultiSourceInfo> = Vec::with_capacity(bin_paths.len());
    let mut total_objects = 0usize;

    for path in bin_paths {
        let data = match std::fs::read(path) {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!("analyze_multi: skip {}: {}", path.display(), e);
                continue;
            }
        };
        let bin = match crate::bin::read_bin(&data) {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(
                    "analyze_multi: skip {} (parse error): {}",
                    path.display(),
                    e
                );
                continue;
            }
        };

        sources.push(MultiSourceInfo {
            bin_path: path.clone(),
            object_count: bin.entries.len(),
        });
        total_objects += bin.entries.len();

        for e in bin.entries.iter() {
            class_buckets
                .entry(e.class_hash)
                .or_default()
                .push(e.path_hash);
        }
    }

    let groups: Vec<(u32, Vec<u32>)> = class_buckets.into_iter().collect();
    MultiAnalysis {
        sources,
        total_objects,
        groups,
        vfx_class_hashes: vfx_set,
    }
}

/// Multi-source split: move every object whose path hash is in `move_hashes`
/// from each of `source_paths` into a single shared output file at
/// `<project_root>/data/<output_filename>`.
///
/// `owner_path` is the BIN whose `dependencies` list should be updated to
/// link to the new output file (typically the main skin BIN). The other
/// source BINs only have matching objects removed — no link change, since
/// the engine only follows top-level dependencies from the main BIN.
pub fn split_bin_multi(
    source_paths: &[PathBuf],
    owner_path: &Path,
    project_root: &Path,
    output_filename: &str,
    move_hashes: &HashSet<u32>,
) -> Result<SplitResult> {
    if move_hashes.is_empty() {
        return Err(Error::InvalidInput(
            "split_bin_multi: no objects selected to move".to_string(),
        ));
    }
    if source_paths.is_empty() {
        return Err(Error::InvalidInput(
            "split_bin_multi: no source BINs provided".to_string(),
        ));
    }

    // 1. Read every source. Bail on read/parse error so we never mutate
    //    state when something's off — better to fail before any write.
    struct Source {
        path: PathBuf,
        bin: Bin,
    }
    let mut sources: Vec<Source> = Vec::with_capacity(source_paths.len());
    for path in source_paths {
        let data = std::fs::read(path).map_err(|e| Error::io_with_path(e, path))?;
        let bin = crate::bin::read_bin(&data).map_err(|e| {
            Error::InvalidInput(format!("Failed to parse {}: {}", path.display(), e))
        })?;
        sources.push(Source {
            path: path.clone(),
            bin,
        });
    }

    // 2. Pull matching objects out of each source. Track which paths
    //    actually had moves so we only rewrite files that changed.
    let mut moved_objects: Vec<BinEntry> = Vec::new();
    let mut sources_changed: Vec<bool> = vec![false; sources.len()];
    for (idx, src) in sources.iter_mut().enumerate() {
        let before = src.bin.entries.len();
        src.bin.entries.retain(|e| {
            if move_hashes.contains(&e.path_hash) {
                moved_objects.push(e.clone());
                false
            } else {
                true
            }
        });
        if src.bin.entries.len() != before {
            sources_changed[idx] = true;
        }
    }

    if moved_objects.is_empty() {
        return Err(Error::InvalidInput(
            "split_bin_multi: none of the requested hashes existed in any source BIN".to_string(),
        ));
    }
    let moved_count = moved_objects.len();

    // 3. Build the consolidated output BIN.
    let new_bin = Bin {
        entries: moved_objects,
        ..Bin::new()
    };

    // 4. Always write the new BIN under `<project_root>/data/`.
    let data_dir = project_root.join("data");
    std::fs::create_dir_all(&data_dir).map_err(|e| Error::io_with_path(e, &data_dir))?;
    let new_full_path: PathBuf = data_dir.join(output_filename);
    if new_full_path.exists() {
        return Err(Error::InvalidInput(format!(
            "Output file already exists: {}",
            new_full_path.display()
        )));
    }

    let link_rel = new_full_path
        .strip_prefix(project_root)
        .map_err(|_| {
            Error::InvalidInput(format!(
                "Output {} is not inside project root {}",
                new_full_path.display(),
                project_root.display()
            ))
        })?
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase();

    // 5. Write the new BIN first.
    let new_bytes = crate::bin::write_bin(&new_bin)
        .map_err(|e| Error::InvalidInput(format!("Failed to serialize new BIN: {}", e)))?;
    std::fs::write(&new_full_path, &new_bytes)
        .map_err(|e| Error::io_with_path(e, &new_full_path))?;

    // 6. Update the owner BIN's dependencies, then write back every changed
    //    source. The owner is identified by path equality with one of the
    //    sources — fall back to appending if it isn't in the list.
    let owner_idx = sources.iter().position(|s| s.path == owner_path);
    let owner_bin = match owner_idx {
        Some(i) => &mut sources[i].bin,
        None => {
            // Owner wasn't included in sources; load it separately, mutate,
            // and write. Rare but possible if the caller didn't include it.
            let data = std::fs::read(owner_path).map_err(|e| Error::io_with_path(e, owner_path))?;
            let mut bin = crate::bin::read_bin(&data)
                .map_err(|e| Error::InvalidInput(format!("Failed to parse owner BIN: {}", e)))?;
            if !bin.linked.iter().any(|d| d.eq_ignore_ascii_case(&link_rel)) {
                bin.linked.push(link_rel.clone());
            }
            let bytes = crate::bin::write_bin(&bin).map_err(|e| {
                Error::InvalidInput(format!("Failed to serialize owner BIN: {}", e))
            })?;
            std::fs::write(owner_path, &bytes).map_err(|e| Error::io_with_path(e, owner_path))?;
            // continue to write the other sources below
            for (idx, src) in sources.iter().enumerate() {
                if !sources_changed[idx] {
                    continue;
                }
                let bytes = crate::bin::write_bin(&src.bin).map_err(|e| {
                    Error::InvalidInput(format!(
                        "Failed to serialize {}: {}",
                        src.path.display(),
                        e
                    ))
                })?;
                std::fs::write(&src.path, &bytes).map_err(|e| Error::io_with_path(e, &src.path))?;
            }
            return Ok(SplitResult {
                moved: moved_count,
                link_added: link_rel,
            });
        }
    };
    if !owner_bin
        .linked
        .iter()
        .any(|d| d.eq_ignore_ascii_case(&link_rel))
    {
        owner_bin.linked.push(link_rel.clone());
    }
    if let Some(i) = owner_idx {
        sources_changed[i] = true;
    }

    // 7. Write back every changed source.
    for (idx, src) in sources.iter().enumerate() {
        if !sources_changed[idx] {
            continue;
        }
        let bytes = crate::bin::write_bin(&src.bin).map_err(|e| {
            Error::InvalidInput(format!("Failed to serialize {}: {}", src.path.display(), e))
        })?;
        std::fs::write(&src.path, &bytes).map_err(|e| Error::io_with_path(e, &src.path))?;
    }

    Ok(SplitResult {
        moved: moved_count,
        link_added: link_rel,
    })
}

// =============================================================================
// BIN organizer — auto-consolidate VFX vs main
// =============================================================================

/// Result of an [`organize_vfx_in_folder`] run.
#[derive(Debug, Clone)]
pub struct OrganizeResult {
    /// VFX-class objects pulled into the consolidated VFX BIN.
    pub vfx_objects_moved: usize,
    /// Non-VFX objects merged from non-owner sources into the main skin
    /// BIN. The owner's own non-VFX objects are not counted (they stay
    /// where they were).
    pub main_objects_merged: usize,
    /// Source BINs that were deleted because they ended up empty.
    pub sources_deleted: Vec<PathBuf>,
    /// Number of dead dependency entries pruned from the owner BIN.
    pub links_pruned: usize,
    /// The link path appended to the owner's `dependencies` (empty string
    /// if no VFX objects were moved — no new file was created).
    pub vfx_link_added: String,
}

/// Auto-consolidate VFX vs non-VFX content across every BIN in a folder.
///
/// All VFX-class objects (matching one of [`VFX_CLASS_NAMES`]) from every
/// source — including the owner — are pulled into a single new file at
/// `<project_root>/data/<vfx_filename>`. All non-VFX objects from non-owner
/// sources are merged into the owner's objects (skip-on-collision so the
/// owner's existing version of any duplicated hash wins). Source BINs that
/// end up empty are deleted, and the owner's dependency list is pruned of
/// any entry pointing at a deleted file.
///
/// Restrictions:
/// - `source_paths` must NOT include animation BINs or other format-specific
///   files; the caller filters upstream.
/// - The owner must be one of the source paths.
/// - Reads happen up front; if a parse fails the project is untouched.
pub fn organize_vfx_in_folder(
    source_paths: &[PathBuf],
    owner_path: &Path,
    project_root: &Path,
    vfx_filename: &str,
) -> Result<OrganizeResult> {
    if source_paths.is_empty() {
        return Err(Error::InvalidInput(
            "organize_vfx_in_folder: no source BINs provided".to_string(),
        ));
    }

    let vfx_class_set: HashSet<u32> = VFX_CLASS_NAMES.iter().map(|n| fnv1a_lower(n)).collect();

    // 1. Read every source BIN. Bail before any write if anything fails.
    struct Source {
        path: PathBuf,
        bin: Bin,
        is_owner: bool,
    }
    let mut sources: Vec<Source> = Vec::with_capacity(source_paths.len());
    for path in source_paths {
        let data = std::fs::read(path).map_err(|e| Error::io_with_path(e, path))?;
        let bin = crate::bin::read_bin(&data).map_err(|e| {
            Error::InvalidInput(format!("Failed to parse {}: {}", path.display(), e))
        })?;
        let is_owner = paths_match(path, owner_path);
        sources.push(Source {
            path: path.clone(),
            bin,
            is_owner,
        });
    }
    if !sources.iter().any(|s| s.is_owner) {
        return Err(Error::InvalidInput(format!(
            "Owner BIN {} is not in the source list",
            owner_path.display()
        )));
    }

    // 2. Bucket sort: pull VFX from every source into one bucket; pull
    //    non-VFX from NON-OWNER sources into another. Owner's non-VFX stays
    //    in place — it's already where we want it.
    let mut vfx_bucket: Vec<BinEntry> = Vec::new();
    let mut main_bucket: Vec<BinEntry> = Vec::new();
    for src in sources.iter_mut() {
        let mut keep: Vec<BinEntry> = Vec::new();
        let drained = std::mem::take(&mut src.bin.entries);
        for entry in drained {
            if vfx_class_set.contains(&entry.class_hash) {
                vfx_bucket.push(entry);
            } else if src.is_owner {
                keep.push(entry);
            } else {
                main_bucket.push(entry);
            }
        }
        src.bin.entries = keep;
    }

    let vfx_count = vfx_bucket.len();
    let main_count = main_bucket.len();
    if vfx_count == 0 && main_count == 0 {
        return Err(Error::InvalidInput(
            "Nothing to consolidate — no VFX objects and no non-owner spillover".to_string(),
        ));
    }

    // 3. Merge main_bucket into the owner. Skip-on-collision (owner's
    //    existing version of any duplicated path hash wins). `entries` is a
    //    Vec, so we track the owner's existing path hashes in a HashSet to
    //    keep the collision check O(1) instead of scanning the Vec per push.
    let owner_idx = sources.iter().position(|s| s.is_owner).unwrap();
    let mut owner_hashes: HashSet<u32> = sources[owner_idx]
        .bin
        .entries
        .iter()
        .map(|e| e.path_hash)
        .collect();
    for entry in main_bucket {
        if owner_hashes.insert(entry.path_hash) {
            sources[owner_idx].bin.entries.push(entry);
        }
    }

    // 4. Decide where the new VFX BIN lives. Refuse to overwrite, refuse
    //    to collide with a source path.
    let data_dir = project_root.join("data");
    std::fs::create_dir_all(&data_dir).map_err(|e| Error::io_with_path(e, &data_dir))?;
    let vfx_path = data_dir.join(vfx_filename);
    if vfx_count > 0 {
        if vfx_path.exists() {
            return Err(Error::InvalidInput(format!(
                "VFX output already exists: {} — pick a different filename",
                vfx_path.display()
            )));
        }
        if sources.iter().any(|s| paths_match(&s.path, &vfx_path)) {
            return Err(Error::InvalidInput(
                "VFX output filename collides with one of the source BINs".to_string(),
            ));
        }
    }

    let vfx_link_rel = vfx_path
        .strip_prefix(project_root)
        .map_err(|_| {
            Error::InvalidInput(format!(
                "VFX output {} is not inside project root {}",
                vfx_path.display(),
                project_root.display()
            ))
        })?
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase();

    // 5. Determine which sources end up deleted (non-owner with no objects
    //    left). Track their relative paths so we can prune dead links.
    let mut to_delete: Vec<PathBuf> = Vec::new();
    let mut deleted_links: HashSet<String> = HashSet::new();
    for src in sources.iter() {
        if src.is_owner {
            continue;
        }
        if src.bin.entries.is_empty() {
            to_delete.push(src.path.clone());
            if let Ok(rel) = src.path.strip_prefix(project_root) {
                deleted_links.insert(rel.to_string_lossy().replace('\\', "/").to_lowercase());
            }
        }
    }

    // 6. Update owner deps: prune dead links, append the new VFX link.
    let dep_count_before = sources[owner_idx].bin.linked.len();
    sources[owner_idx]
        .bin
        .linked
        .retain(|d| !deleted_links.contains(&d.to_lowercase()));
    let links_pruned = dep_count_before - sources[owner_idx].bin.linked.len();
    if vfx_count > 0
        && !sources[owner_idx]
            .bin
            .linked
            .iter()
            .any(|d| d.eq_ignore_ascii_case(&vfx_link_rel))
    {
        sources[owner_idx].bin.linked.push(vfx_link_rel.clone());
    }

    // 7. Write the consolidated VFX BIN first (only if non-empty).
    if vfx_count > 0 {
        let vfx_bin = Bin {
            entries: vfx_bucket,
            ..Bin::new()
        };
        let vfx_bytes = crate::bin::write_bin(&vfx_bin)
            .map_err(|e| Error::InvalidInput(format!("Failed to serialize VFX BIN: {}", e)))?;
        std::fs::write(&vfx_path, &vfx_bytes).map_err(|e| Error::io_with_path(e, &vfx_path))?;
    }

    // 8. Write the owner BIN.
    {
        let owner_bytes = crate::bin::write_bin(&sources[owner_idx].bin)
            .map_err(|e| Error::InvalidInput(format!("Failed to serialize owner BIN: {}", e)))?;
        std::fs::write(&sources[owner_idx].path, &owner_bytes)
            .map_err(|e| Error::io_with_path(e, &sources[owner_idx].path))?;
    }

    // 9. Write any non-empty non-owner sources (in case any of them had
    //    only some objects move out). Then delete the empty ones.
    for src in sources.iter() {
        if src.is_owner {
            continue;
        }
        if src.bin.entries.is_empty() {
            continue;
        } // gets deleted below
        let bytes = crate::bin::write_bin(&src.bin).map_err(|e| {
            Error::InvalidInput(format!("Failed to serialize {}: {}", src.path.display(), e))
        })?;
        std::fs::write(&src.path, &bytes).map_err(|e| Error::io_with_path(e, &src.path))?;
    }
    for path in &to_delete {
        if let Err(e) = std::fs::remove_file(path) {
            tracing::warn!(
                "organize_vfx: failed to delete empty {}: {}",
                path.display(),
                e
            );
        }
    }

    Ok(OrganizeResult {
        vfx_objects_moved: vfx_count,
        main_objects_merged: main_count,
        sources_deleted: to_delete,
        links_pruned,
        vfx_link_added: if vfx_count > 0 {
            vfx_link_rel
        } else {
            String::new()
        },
    })
}

/// Two paths are "the same" if canonicalize matches. Falls back to lexical
/// equality when canonicalize fails (e.g. one input doesn't exist).
fn paths_match(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(ca), Ok(cb)) => ca == cb,
        _ => a == b,
    }
}

// =============================================================================
// Separate animations — 1:1 port of old quartz_cli `separate_anm`
// =============================================================================

/// The WAD project root: walk up until a `data` folder's parent, else the
/// file's own folder. (Mirrors the combine variants' `find_root_dir`.)
fn anm_root_dir(bin_path: &Path) -> PathBuf {
    let mut cur = bin_path.parent();
    while let Some(dir) = cur {
        let lower = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if lower == "data" {
            if let Some(parent) = dir.parent() {
                return parent.to_path_buf();
            }
        }
        cur = dir.parent();
    }
    bin_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn detect_champ_name(path: &Path) -> Option<String> {
    let posix = path.to_string_lossy().replace('\\', "/").to_lowercase();
    let marker = "/characters/";
    let start = posix.find(marker)? + marker.len();
    let rest = &posix[start..];
    let end = rest.find('/')?;
    Some(rest[..end].to_string())
}

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) => c.to_ascii_uppercase().to_string() + chars.as_str(),
        None => String::new(),
    }
}

/// Move every `AnimationGraphData` entry from the target BIN and its sibling
/// BINs into a single new `<champ>_anm_<stem>.bin` under `data/`, and add a
/// `DATA/<LinkName>` dependency to the target BIN. Returns the number of
/// entries extracted.
///
/// Refuses to run when the input already contains only `AnimationGraphData`
/// entries (already separated).
pub fn separate_anm(bin_path: &Path) -> Result<usize> {
    let root_dir = anm_root_dir(bin_path);
    let anm_type_hash = fnv1a_lower("AnimationGraphData");

    // Refuse when the input is already a pure split-anm bin.
    {
        let input = crate::bin::read_bin(
            &std::fs::read(bin_path).map_err(|e| Error::io_with_path(e, bin_path))?,
        )
        .map_err(|e| Error::InvalidInput(format!("Failed to parse {}: {}", bin_path.display(), e)))?;
        if !input.entries.is_empty()
            && input.entries.iter().all(|e| e.class_hash == anm_type_hash)
        {
            return Ok(0);
        }
    }

    // Scan the target BIN plus every other `.bin` in the root, pulling out
    // AnimationGraphData entries (deduped by path hash across files).
    let mut files_to_scan = vec![bin_path.to_path_buf()];
    if let Ok(entries) = std::fs::read_dir(&root_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().map(|e| e.to_ascii_lowercase()) == Some("bin".into()) && p != bin_path
            {
                files_to_scan.push(p);
            }
        }
    }

    let mut all_anm: Vec<BinEntry> = Vec::new();
    let mut managed: HashSet<u32> = HashSet::new();

    for f_path in &files_to_scan {
        let mut bin = match std::fs::read(f_path).ok().and_then(|d| crate::bin::read_bin(&d).ok()) {
            Some(b) => b,
            None => continue,
        };

        let take: HashSet<u32> = bin
            .entries
            .iter()
            .filter(|e| e.class_hash == anm_type_hash && !managed.contains(&e.path_hash))
            .map(|e| e.path_hash)
            .collect();
        if take.is_empty() {
            continue;
        }

        bin.entries.retain(|e| {
            if take.contains(&e.path_hash) {
                managed.insert(e.path_hash);
                all_anm.push(e.clone());
                false
            } else {
                true
            }
        });

        let bytes = crate::bin::write_bin(&bin)
            .map_err(|e| Error::InvalidInput(format!("Failed to serialize {}: {}", f_path.display(), e)))?;
        std::fs::write(f_path, &bytes).map_err(|e| Error::io_with_path(e, f_path))?;
    }

    if all_anm.is_empty() {
        return Ok(0);
    }

    // Derive the output filename and the (capitalized) link name.
    let stem = bin_path.file_stem().unwrap_or_default().to_string_lossy();
    let stem_lower = stem.to_lowercase();
    let (file_name_lower, link_name) = if let Some(champ) = detect_champ_name(bin_path) {
        (
            format!("{}_anm_{}.bin", champ.to_lowercase(), stem_lower),
            format!("{}_anm_{}.bin", capitalize_first(&champ), stem_lower),
        )
    } else {
        (
            format!("{}_anm.bin", stem_lower),
            format!("{}_anm.bin", capitalize_first(&stem_lower)),
        )
    };

    let anm_path = root_dir.join("data").join(&file_name_lower);
    if let Some(parent) = anm_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| Error::io_with_path(e, parent))?;
    }

    let anm_bin = Bin {
        entries: all_anm.clone(),
        ..Bin::new()
    };
    let anm_bytes = crate::bin::write_bin(&anm_bin)
        .map_err(|e| Error::InvalidInput(format!("Failed to serialize anm BIN: {}", e)))?;
    std::fs::write(&anm_path, &anm_bytes).map_err(|e| Error::io_with_path(e, &anm_path))?;

    // Add the DATA/<LinkName> dependency to the target BIN.
    let mut main = crate::bin::read_bin(
        &std::fs::read(bin_path).map_err(|e| Error::io_with_path(e, bin_path))?,
    )
    .map_err(|e| Error::InvalidInput(format!("Failed to re-parse target BIN: {}", e)))?;
    let link_str = format!("DATA/{}", link_name);
    if !main.linked.iter().any(|d| d.eq_ignore_ascii_case(&link_str)) {
        main.linked.push(link_str);
    }
    let main_bytes = crate::bin::write_bin(&main)
        .map_err(|e| Error::InvalidInput(format!("Failed to serialize target BIN: {}", e)))?;
    std::fs::write(bin_path, &main_bytes).map_err(|e| Error::io_with_path(e, bin_path))?;

    Ok(all_anm.len())
}
