//! Linked-bin gathering. Derives the mod/project root from the opened bin's
//! path, indexes every `.bin` under it ONCE (lowercase WAD-relative path to
//! real disk path), and resolves the main bin's `linked` list against that
//! index — links are WAD-relative and case-insensitive on disk
//! (`"data/x_vfx.bin"` may live as `data/X_VFX.bin`).

use crate::port_donor::link_candidates;
use ritoshark::bin::Bin;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Project root for a bin: the parent of the `data`/`assets` segment in its
/// path (same rule as the port-donor asset copier), falling back to the bin's
/// own directory when no such segment exists.
pub fn project_root_for(bin_path: &Path) -> Option<PathBuf> {
    let mut current = bin_path.parent();
    while let Some(dir) = current {
        if let Some(name) = dir.file_name().and_then(|n| n.to_str()) {
            let lower = name.to_lowercase();
            if lower == "data" || lower == "assets" {
                return dir.parent().map(|p| p.to_path_buf());
            }
        }
        current = dir.parent();
    }
    bin_path.parent().map(|p| p.to_path_buf())
}

/// One entry of the main bin's `linked` list and where it resolved on disk.
/// `path` is `None` when the project doesn't ship that bin (e.g. game-internal
/// links like `DATA/Characters/X/X.bin`).
#[derive(Debug, Clone)]
pub struct ResolvedLink {
    pub link: String,
    pub path: Option<PathBuf>,
}

/// Index every `.bin` file under `root` by its lowercase forward-slashed
/// relative path. Unreadable directories are skipped; first hit wins.
fn bin_index(root: &Path) -> HashMap<String, PathBuf> {
    let mut map = HashMap::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(read) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in read.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if p
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("bin"))
                .unwrap_or(false)
            {
                if let Ok(rel) = p.strip_prefix(root) {
                    let key = rel.to_string_lossy().replace('\\', "/").to_lowercase();
                    map.entry(key).or_insert(p);
                }
            }
        }
    }
    map
}

/// Resolve the main bin's `linked` list against the project root's disk index
/// (main bin only, never recursive into linked bins' own lists). Returns one
/// [`ResolvedLink`] per link string, in `linked` order; unresolved links get
/// `path: None`, never an error.
pub fn gather_linked(main_path: &Path, main: &Bin) -> Vec<ResolvedLink> {
    if main.linked.is_empty() {
        return Vec::new();
    }
    let index = match project_root_for(main_path) {
        Some(root) => bin_index(&root),
        None => HashMap::new(),
    };
    main.linked
        .iter()
        .map(|link| {
            let path = link_candidates(link)
                .into_iter()
                .find_map(|c| index.get(&c).cloned());
            ResolvedLink {
                link: link.clone(),
                path,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_normalize_link_forms() {
        assert_eq!(
            link_candidates("DATA/Characters/X/X.bin"),
            vec!["data/characters/x/x.bin"]
        );
        assert_eq!(
            link_candidates("data/foo_vfx"),
            vec!["data/foo_vfx", "data/foo_vfx.bin"]
        );
        assert_eq!(link_candidates("\\DATA\\Foo.bin"), vec!["data/foo.bin"]);
        assert!(link_candidates("").is_empty());
    }

    #[test]
    fn project_root_is_parent_of_data_segment() {
        let p = Path::new(r"C:\mods\evelynn.wad.client\data\characters\evelynn\skins\skin0.bin");
        assert_eq!(
            project_root_for(p),
            Some(PathBuf::from(r"C:\mods\evelynn.wad.client"))
        );

        let a = Path::new(r"C:\mods\mymod\assets\foo\bar.bin");
        assert_eq!(project_root_for(a), Some(PathBuf::from(r"C:\mods\mymod")));

        // No data/assets segment: fall back to the bin's own directory.
        let q = Path::new(r"C:\somewhere\loose.bin");
        assert_eq!(project_root_for(q), Some(PathBuf::from(r"C:\somewhere")));
    }

    #[test]
    fn gather_linked_resolves_case_insensitively_from_disk() {
        let root =
            std::env::temp_dir().join(format!("quartz_vfx_resolve_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let skins = root
            .join("data")
            .join("characters")
            .join("evelynn")
            .join("skins");
        std::fs::create_dir_all(&skins).unwrap();
        let main_path = skins.join("skin0.bin");
        std::fs::write(&main_path, b"stub").unwrap();
        // Real disk casing differs from the link string.
        let vfx_real = root.join("data").join("SirDexal_saya-evelynn_VFX.bin");
        std::fs::write(&vfx_real, b"stub").unwrap();

        let mut main = Bin::new();
        main.linked = vec![
            "data/sirdexal_saya-evelynn_vfx.bin".to_string(),
            "data/sirdexal_saya-evelynn_vfx".to_string(), // missing extension
            "DATA/Characters/Evelynn/Evelynn.bin".to_string(), // not shipped by the mod
        ];

        let links = gather_linked(&main_path, &main);
        assert_eq!(links.len(), 3);
        assert_eq!(links[0].path.as_deref(), Some(vfx_real.as_path()));
        assert_eq!(links[1].path.as_deref(), Some(vfx_real.as_path()));
        assert!(links[2].path.is_none());
        assert_eq!(links[2].link, "DATA/Characters/Evelynn/Evelynn.bin");

        let _ = std::fs::remove_dir_all(&root);
    }
}
