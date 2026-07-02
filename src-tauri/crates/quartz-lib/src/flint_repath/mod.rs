//! Repathing: prefixes asset paths with `ASSETS/{creator}/{project}` to prevent
//! conflicts between mods.

pub mod refather;
pub mod organizer;
pub mod rename;

pub use refather::{repath_project, RepathConfig, RepathResult};
pub use organizer::{organize_project, OrganizerConfig, OrganizerResult};
pub use rename::{rename_project_asset_prefix, RenameResult};
