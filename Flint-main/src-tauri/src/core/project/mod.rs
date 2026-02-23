// Project management module exports
#[allow(clippy::module_inception)]
pub mod project;

// Re-export from ltk_mod_project for league-mod compatibility
#[allow(unused_imports)]
pub use ltk_mod_project::{
    ModProject, ModProjectLayer, ModProjectAuthor, 
    ModProjectLicense, FileTransformer, default_layers
};
#[allow(unused_imports)]
pub use project::{create_project, open_project, save_project, Project, FlintMetadata};
