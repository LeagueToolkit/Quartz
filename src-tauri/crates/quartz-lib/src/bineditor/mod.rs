//! Bin Editor V2 — native in-memory bin field editing.
//!
//! Like [`crate::paint`], a `.bin` (or `.py`/`.ritobin` text) is parsed once
//! into a resident `ritoshark::bin::Bin` held in [`session`]'s registry, and
//! the tree is the single source of truth. Unlike paint, [`project`] walks
//! EVERY field of every emitter under `VfxSystemDefinitionData` entries into a
//! generic [`project::EditorNode`] tree, each node carrying a [`path::NodePath`]
//! back into the live tree. The frontend edits leaves via `apply` batches and
//! restructures via `insert`/`remove`; values cross IPC as the tagged
//! [`value::JsonBinValue`] encoding.

pub mod path;
pub mod project;
pub mod session;
pub mod value;

pub use path::{NodePath, Step};
pub use project::{EditorEmitter, EditorModel, EditorNode, EditorSystem};
pub use session::{EditOp, OpenResult, SessionId};
pub use value::JsonBinValue;
