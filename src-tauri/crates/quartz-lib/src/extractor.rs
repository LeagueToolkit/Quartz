/*! League of Legends install detection.

   Path-based detection helpers used by the `get_league_path` command. Panels
   that pull assets from the live game (Port, Sound Banks) and the League Path
   settings section rely on this. The Windows-registry probe lives in the command
   layer; this module owns common-path scanning and root validation. */

use std::path::{Path, PathBuf};

const REQUIRED_DIR: &str = "Game";
const REQUIRED_FILE: &str = "LeagueClient.exe";

/// `<root>/Game/DATA/FINAL/Champions`.
fn champions_dir(league_root: &Path) -> PathBuf {
    league_root
        .join("Game")
        .join("DATA")
        .join("FINAL")
        .join("Champions")
}

/// Common League install roots to probe when nothing else is configured.
pub fn common_league_paths() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for drive in ['C', 'D', 'E', 'F', 'G'] {
        let base = format!("{}:\\", drive);
        roots.push(PathBuf::from(&base).join("Riot Games").join("League of Legends"));
        roots.push(
            PathBuf::from(&base)
                .join("Program Files")
                .join("Riot Games")
                .join("League of Legends"),
        );
        roots.push(
            PathBuf::from(&base)
                .join("Program Files (x86)")
                .join("Riot Games")
                .join("League of Legends"),
        );
    }
    roots
}

/// True when `path` looks like a League install root (has `Game/` and either
/// the client exe or the champion archives).
pub fn is_valid_league_root(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    if !path.join(REQUIRED_DIR).is_dir() {
        return false;
    }
    path.join(REQUIRED_FILE).exists() || champions_dir(path).is_dir()
}

/// Scan the common install locations and return the first valid root.
pub fn detect_league_path_by_common_paths() -> Option<PathBuf> {
    common_league_paths().into_iter().find(|p| is_valid_league_root(p))
}
