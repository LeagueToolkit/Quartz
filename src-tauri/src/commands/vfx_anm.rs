/* Animation-graph editing commands: clip and event field edits, renames, and
the structural create / delete / move / reorder set.

Split out of `vfx_session.rs` rather than appended to it. That file is already
the VFX porting surface and these are a distinct feature with their own model
type; keeping them apart means neither grows into the 2k-line file nobody wants
to navigate.

Every command here returns the reprojected `AnmModel`, exactly as the VFX
commands return `VfxPortModel`. The frontend replaces its model wholesale from
the return value, so no command needs a separate refresh round-trip. */

use quartz_lib::vfx_session::anm::ops::{self, AnmValue, ClipField, EventField};
use quartz_lib::vfx_session::anm::port::{self, PortClipResult};
use quartz_lib::bineditor::JsonBinValue;
use quartz_lib::vfx_session::anm::project::AnmModel;
use quartz_lib::vfx_session::anm::raw::{self, RawNode};
use quartz_lib::vfx_session::anm::structure::{self, NewClip, NewEvent};
use quartz_lib::vfx_session::path::VfxPath;

/// Every op runs on the blocking pool: an edit reprojects the whole animation
/// model, which walks each resident bin, and that should not stall the async
/// runtime.
macro_rules! anm_command {
    ($label:literal, $body:expr) => {
        tokio::task::spawn_blocking(move || $body)
            .await
            .map_err(|e| format!(concat!($label, " task failed to join: {}"), e))?
            .map_err(|e| e.to_string())
    };
}

// ── Field edits ──────────────────────────────────────────────────────────────

/// Set one field on a clip. `value` is `null` to clear the field entirely.
#[tauri::command]
pub async fn vfx_anm_set_clip_field(
    session_id: u64,
    clip: VfxPath,
    field: ClipField,
    value: AnmValue,
) -> Result<AnmModel, String> {
    anm_command!(
        "Set clip field",
        ops::set_clip_field(session_id, &clip, field, value)
    )
}

/// Set one field on an event. `value` is `null` to clear the field entirely.
#[tauri::command]
pub async fn vfx_anm_set_event_field(
    session_id: u64,
    event: VfxPath,
    field: EventField,
    value: AnmValue,
) -> Result<AnmModel, String> {
    anm_command!(
        "Set event field",
        ops::set_event_field(session_id, &event, field, value)
    )
}

/// Rewrite a clip's map key. Rejects an empty name or a collision with a
/// sibling key.
#[tauri::command]
pub async fn vfx_anm_rename_clip(
    session_id: u64,
    clip: VfxPath,
    new_name: String,
) -> Result<AnmModel, String> {
    anm_command!(
        "Rename clip",
        ops::rename_clip(session_id, &clip, &new_name)
    )
}

/// Rewrite an event's map key. Rejects an empty name or a sibling collision.
#[tauri::command]
pub async fn vfx_anm_rename_event(
    session_id: u64,
    event: VfxPath,
    new_name: String,
) -> Result<AnmModel, String> {
    anm_command!(
        "Rename event",
        ops::rename_event(session_id, &event, &new_name)
    )
}

// ── Structure ────────────────────────────────────────────────────────────────

/// Delete events in one batch: one undo frame, one reprojection.
#[tauri::command]
pub async fn vfx_anm_delete_events(
    session_id: u64,
    events: Vec<VfxPath>,
) -> Result<AnmModel, String> {
    anm_command!(
        "Delete events",
        structure::delete_events(session_id, &events)
    )
}

/// Delete clips in one batch: one undo frame, one reprojection.
#[tauri::command]
pub async fn vfx_anm_delete_clips(
    session_id: u64,
    clips: Vec<VfxPath>,
) -> Result<AnmModel, String> {
    anm_command!("Delete clips", structure::delete_clips(session_id, &clips))
}

/// Append a new event of `spec.kind` to a clip's event map.
#[tauri::command]
pub async fn vfx_anm_create_event(
    session_id: u64,
    clip: VfxPath,
    spec: NewEvent,
) -> Result<AnmModel, String> {
    anm_command!(
        "Create event",
        structure::create_event(session_id, &clip, &spec)
    )
}

/// Append a new clip of `spec.kind` to the graph's clip map.
#[tauri::command]
pub async fn vfx_anm_create_clip(session_id: u64, spec: NewClip) -> Result<AnmModel, String> {
    anm_command!("Create clip", structure::create_clip(session_id, &spec))
}

/// Relocate an event to another clip, moving the map entry verbatim so
/// unmodelled fields survive. Backs cross-clip drag and drop.
#[tauri::command]
pub async fn vfx_anm_move_event(
    session_id: u64,
    event: VfxPath,
    target_clip: VfxPath,
) -> Result<AnmModel, String> {
    anm_command!(
        "Move event",
        structure::move_event(session_id, &event, &target_clip)
    )
}

/// Move an event to a new position inside its own clip. Backs drag-to-reorder.
#[tauri::command]
pub async fn vfx_anm_reorder_event(
    session_id: u64,
    event: VfxPath,
    new_index: usize,
) -> Result<AnmModel, String> {
    anm_command!(
        "Reorder event",
        structure::reorder_event(session_id, &event, new_index)
    )
}

/// Move a clip to a new position in the clip map.
#[tauri::command]
pub async fn vfx_anm_reorder_clip(
    session_id: u64,
    clip: VfxPath,
    new_index: usize,
) -> Result<AnmModel, String> {
    anm_command!(
        "Reorder clip",
        structure::reorder_clip(session_id, &clip, new_index)
    )
}

// ── Cross-session porting ────────────────────────────────────────────────────

/// Port a clip from the donor into the target, carrying the VFX systems its
/// particle events reference (and their resolver entries).
///
/// `donor_generation` is the same staleness guard the VFX port uses: a donor bin
/// swapped since the UI read its paths rejects the port instead of addressing
/// whatever now sits at those indices.
#[tauri::command]
pub async fn vfx_anm_port_clip(
    target_session_id: u64,
    donor_session_id: u64,
    donor_clip: VfxPath,
    desired_name: Option<String>,
    donor_generation: Option<u64>,
) -> Result<PortClipResult, String> {
    anm_command!(
        "Port clip",
        port::port_clip(
            target_session_id,
            donor_session_id,
            &donor_clip,
            desired_name.as_deref(),
            donor_generation,
        )
    )
}

/// Port a single event into an existing target clip, carrying its VFX system
/// when it is a particle event.
#[tauri::command]
pub async fn vfx_anm_port_event(
    target_session_id: u64,
    donor_session_id: u64,
    donor_event: VfxPath,
    target_clip: VfxPath,
    donor_generation: Option<u64>,
) -> Result<PortClipResult, String> {
    anm_command!(
        "Port event",
        port::port_event(
            target_session_id,
            donor_session_id,
            &donor_event,
            &target_clip,
            donor_generation,
        )
    )
}

// ── Raw node access ──────────────────────────────────────────────────────────

/// Project any node in the graph into its editable fields.
///
/// The typed commands above cover the seven event classes the read layer models.
/// This reaches everything else: the bone bindings nested inside a particle
/// event, and the event classes that arrive as `Unknown` because nothing models
/// them (`JointSnapEventData`, `FadeEventData`, `SpringPhysicsEventData`, ...).
#[tauri::command]
pub async fn vfx_anm_raw_node(session_id: u64, path: VfxPath) -> Result<RawNode, String> {
    anm_command!("Read node", raw::raw_node(session_id, &path))
}

/// Write one primitive at `path`, keeping the field's existing BIN type.
///
/// Rejects a container target and a type change, so a raw edit cannot reshape
/// the tree or turn an `f32` field into a string.
#[tauri::command]
pub async fn vfx_anm_set_raw_node(
    session_id: u64,
    path: VfxPath,
    value: JsonBinValue,
) -> Result<AnmModel, String> {
    anm_command!("Set node", raw::set_raw_node(session_id, &path, &value))
}

/// Add a field to a structure that does not currently carry it.
///
/// League omits a field holding its default, so a real `ParticleEventData` ships
/// three of its sixteen fields and the rest are absent rather than empty. Editing
/// alone could never reach them; this is how they come into existence.
#[tauri::command]
pub async fn vfx_anm_add_raw_field(
    session_id: u64,
    parent: VfxPath,
    name: String,
    value: JsonBinValue,
) -> Result<AnmModel, String> {
    anm_command!(
        "Add field",
        raw::add_raw_field(session_id, &parent, &name, &value)
    )
}

/// Remove a field, restoring the "absent means default" state League reads.
#[tauri::command]
pub async fn vfx_anm_remove_raw_field(session_id: u64, path: VfxPath) -> Result<AnmModel, String> {
    anm_command!("Remove field", raw::remove_raw_field(session_id, &path))
}
