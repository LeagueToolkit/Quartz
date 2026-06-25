//! HIRC section parser — extracts Wwise hierarchy objects from BNK files.

use byteorder::{LittleEndian, ReadBytesExt};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HircData {
    pub sounds: Vec<HircSound>,
    pub event_actions: Vec<HircEventAction>,
    pub events: Vec<HircEvent>,
    pub random_containers: Vec<HircRandomContainer>,
    pub switch_containers: Vec<HircSwitchContainer>,
    pub music_segments: Vec<HircMusicContainer>,
    pub music_tracks: Vec<HircMusicTrack>,
    pub music_switches: Vec<HircMusicSwitch>,
    pub music_playlists: Vec<HircMusicContainer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HircSound {
    pub self_id: u32,
    pub file_id: u32,
    pub is_streamed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HircEventAction {
    pub self_id: u32,
    pub scope: u8,
    pub action_type: u8,
    pub sound_object_id: u32,
    pub switch_group_id: u32,
    pub switch_state_id: u32,
    pub state_group_id: u32,
    pub target_state_id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HircEvent {
    pub self_id: u32,
    pub action_ids: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HircRandomContainer {
    pub self_id: u32,
    pub parent_id: u32,
    pub sound_ids: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HircSwitchContainer {
    pub self_id: u32,
    pub parent_id: u32,
    pub group_type: u8,
    pub group_id: u32,
    pub children: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HircMusicContainer {
    pub self_id: u32,
    pub parent_id: u32,
    pub track_ids: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HircMusicTrack {
    pub self_id: u32,
    pub parent_id: u32,
    pub track_count: u32,
    pub file_ids: Vec<u32>,
    pub has_switch_ids: bool,
    pub switch_group_id: u32,
    pub switch_ids: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HircMusicSwitch {
    pub self_id: u32,
    pub parent_id: u32,
    pub children: Vec<u32>,
    pub arguments: Vec<MusicSwitchArg>,
    pub decision_nodes: Vec<DecisionNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MusicSwitchArg {
    pub group_id: u32,
    pub group_type: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionNode {
    pub key: u32,
    pub audio_id: u32,
}

/// Returns 0 on EOF.
fn read_u8(c: &mut Cursor<&[u8]>) -> u8 {
    c.read_u8().unwrap_or(0)
}

fn read_u16(c: &mut Cursor<&[u8]>) -> u16 {
    c.read_u16::<LittleEndian>().unwrap_or(0)
}

fn read_u32(c: &mut Cursor<&[u8]>) -> u32 {
    c.read_u32::<LittleEndian>().unwrap_or(0)
}

fn skip(c: &mut Cursor<&[u8]>, n: u64) {
    c.set_position(c.position() + n);
}

// ---------------------------------------------------------------------------
// BaseParams skip functions (version-dependent)
// ---------------------------------------------------------------------------

fn skip_initial_fx_params(c: &mut Cursor<&[u8]>, version: u32) {
    skip(c, 1);
    let num_fx = read_u8(c);
    if num_fx > 0 {
        skip(c, 1);
    }
    let fx_size = if version <= 0x91 { 7 } else { 6 };
    skip(c, num_fx as u64 * fx_size);
}

fn skip_initial_params(c: &mut Cursor<&[u8]>) {
    let prop_count = read_u8(c);
    skip(c, 5 * prop_count as u64);
    let prop_count2 = read_u8(c);
    skip(c, 9 * prop_count2 as u64);
}

fn skip_positioning_params(c: &mut Cursor<&[u8]>, version: u32) {
    let positioning_bits = read_u8(c);
    let has_positioning = positioning_bits & 1 != 0;
    let mut has_3d = false;
    let mut has_automation = false;

    if has_positioning {
        if version <= 0x59 {
            let _has_2d = read_u8(c);
            has_3d = read_u8(c) != 0;
            if _has_2d != 0 {
                skip(c, 1);
            }
        } else {
            has_3d = (positioning_bits & 0x2) != 0;
        }
    }

    if has_positioning && has_3d {
        if version <= 0x59 {
            has_automation = (read_u8(c) & 3) != 1;
            skip(c, 8);
        } else {
            has_automation = ((positioning_bits >> 5) & 3) != 0;
            skip(c, 1);
        }
    }

    if has_automation {
        skip(c, if version <= 0x59 { 9 } else { 5 });
        let num_vertices = read_u32(c);
        skip(c, 16 * num_vertices as u64);
        let num_playlist = read_u32(c);
        let item_size = if version <= 0x59 { 16 } else { 20 };
        skip(c, item_size * num_playlist as u64);
    } else if version <= 0x59 {
        skip(c, 1);
    }
}

fn skip_aux_params(c: &mut Cursor<&[u8]>, version: u32) {
    let val = read_u8(c);
    let has_aux = (val >> 3) & 1 != 0;
    if has_aux {
        skip(c, 16);
    }
    if version > 0x87 {
        skip(c, 4);
    }
}

fn skip_state_chunk(c: &mut Cursor<&[u8]>) {
    let state_props = read_u8(c);
    skip(c, 3 * state_props as u64);
    let state_groups = read_u8(c);
    for _ in 0..state_groups {
        skip(c, 5);
        let states = read_u8(c);
        skip(c, 8 * states as u64);
    }
}

fn skip_rtpc(c: &mut Cursor<&[u8]>, version: u32) {
    let num_rtpc = read_u16(c);
    for _ in 0..num_rtpc {
        skip(c, if version <= 0x59 { 13 } else { 12 });
        let point_count = read_u16(c);
        skip(c, 12 * point_count as u64);
    }
}

fn skip_base_params(c: &mut Cursor<&[u8]>, version: u32) -> u32 {
    skip_initial_fx_params(c, version);
    if version > 0x88 {
        skip(c, 1);
        let num_fx = read_u8(c);
        skip(c, 6 * num_fx as u64);
    }
    if version > 0x59 && version <= 0x91 {
        skip(c, 1);
    }
    let _bus_id = read_u32(c);
    let parent_id = read_u32(c);
    skip(c, if version <= 0x59 { 2 } else { 1 });
    skip_initial_params(c);
    skip_positioning_params(c, version);
    skip_aux_params(c, version);
    skip(c, 6);
    skip_state_chunk(c);
    skip_rtpc(c, version);
    parent_id
}

// ---------------------------------------------------------------------------
// HIRC object readers
// ---------------------------------------------------------------------------

fn read_sound(c: &mut Cursor<&[u8]>, version: u32) -> HircSound {
    let self_id = read_u32(c);
    skip(c, 4);
    let is_streamed = read_u8(c) != 0;
    if version <= 0x59 {
        skip(c, 3);
    }
    if version <= 0x70 {
        skip(c, 4);
    }
    let file_id = read_u32(c);
    HircSound { self_id, file_id, is_streamed }
}

fn read_event_action(c: &mut Cursor<&[u8]>) -> HircEventAction {
    let self_id = read_u32(c);
    let scope = read_u8(c);
    let action_type = read_u8(c);
    let mut ea = HircEventAction {
        self_id,
        scope,
        action_type,
        sound_object_id: 0,
        switch_group_id: 0,
        switch_state_id: 0,
        state_group_id: 0,
        target_state_id: 0,
    };

    if action_type == 25 {
        // SetSwitch
        skip(c, 5);
        skip_initial_params(c);
        ea.switch_group_id = read_u32(c);
        ea.switch_state_id = read_u32(c);
    } else if action_type == 18 {
        // SetState
        skip(c, 5);
        skip_initial_params(c);
        ea.state_group_id = read_u32(c);
        ea.target_state_id = read_u32(c);
    } else {
        ea.sound_object_id = read_u32(c);
    }

    ea
}

fn read_event(c: &mut Cursor<&[u8]>, version: u32) -> HircEvent {
    let self_id = read_u32(c);
    let event_amount = read_u8(c) as u32;
    if version == 0x58 {
        skip(c, 3);
    }
    let mut action_ids = Vec::with_capacity(event_amount as usize);
    for _ in 0..event_amount {
        action_ids.push(read_u32(c));
    }
    HircEvent { self_id, action_ids }
}

fn read_random_container(c: &mut Cursor<&[u8]>, version: u32) -> HircRandomContainer {
    let self_id = read_u32(c);
    let parent_id = skip_base_params(c, version);
    skip(c, 24);
    let count = read_u32(c);
    let mut sound_ids = Vec::with_capacity(count as usize);
    for _ in 0..count {
        sound_ids.push(read_u32(c));
    }
    HircRandomContainer { self_id, parent_id, sound_ids }
}

fn read_switch_container(c: &mut Cursor<&[u8]>, version: u32) -> HircSwitchContainer {
    let self_id = read_u32(c);
    let parent_id = skip_base_params(c, version);
    let group_type = read_u8(c);
    if version <= 0x59 {
        skip(c, 3);
    }
    let group_id = read_u32(c);
    skip(c, 5);
    let num_children = read_u32(c);
    let mut children = Vec::with_capacity(num_children as usize);
    for _ in 0..num_children {
        children.push(read_u32(c));
    }
    HircSwitchContainer { self_id, parent_id, group_type, group_id, children }
}

fn read_music_container(c: &mut Cursor<&[u8]>, version: u32) -> HircMusicContainer {
    let self_id = read_u32(c);
    skip(c, 1);
    let parent_id = skip_base_params(c, version);
    let track_count = read_u32(c);
    let mut track_ids = Vec::with_capacity(track_count as usize);
    for _ in 0..track_count {
        track_ids.push(read_u32(c));
    }
    HircMusicContainer { self_id, parent_id, track_ids }
}

fn read_music_track(c: &mut Cursor<&[u8]>, version: u32) -> HircMusicTrack {
    let self_id = read_u32(c);
    skip(c, 1);
    let count1 = read_u32(c);
    skip(c, 14 * count1 as u64);
    let count2 = read_u32(c);

    let start = c.position();
    skip(c, count2 as u64 * 44);
    let track_count = read_u32(c);
    c.set_position(start);

    let mut file_ids = vec![0u32; track_count as usize];
    for _ in 0..count2 {
        let track_index = read_u32(c);
        let file_id = read_u32(c);
        skip(c, 4); // event_id
        skip(c, 32); // doubles
        if (track_index as usize) < file_ids.len() {
            file_ids[track_index as usize] = file_id;
        }
    }

    let _ = read_u32(c); // track_count again

    let num_clip_auto = read_u32(c);
    for _ in 0..num_clip_auto {
        skip(c, 8);
        let point_count = read_u32(c);
        skip(c, 12 * point_count as u64);
    }

    let parent_id = skip_base_params(c, version);
    let track_type = read_u8(c);
    let has_switch_ids = track_type == 0x3;
    let mut switch_group_id = 0u32;
    let mut switch_ids = Vec::new();

    if has_switch_ids {
        skip(c, 1);
        switch_group_id = read_u32(c);
        skip(c, 4); // default switch
        let count3 = read_u32(c);
        for _ in 0..count3 {
            switch_ids.push(read_u32(c));
        }
    }

    HircMusicTrack {
        self_id,
        parent_id,
        track_count,
        file_ids,
        has_switch_ids,
        switch_group_id,
        switch_ids,
    }
}

fn read_music_switch(c: &mut Cursor<&[u8]>, version: u32) -> HircMusicSwitch {
    let self_id = read_u32(c);
    skip(c, 1);
    let parent_id = skip_base_params(c, version);
    let num_children = read_u32(c);
    let mut children = Vec::with_capacity(num_children as usize);
    for _ in 0..num_children {
        children.push(read_u32(c));
    }
    skip(c, 23);
    let num_stingers = read_u32(c);
    skip(c, 24 * num_stingers as u64);
    let num_rules = read_u32(c);
    for _ in 0..num_rules {
        let num_sources = read_u32(c);
        skip(c, 4 * num_sources as u64);
        let num_destinations = read_u32(c);
        skip(c, 4 * num_destinations as u64);
        skip(c, if version <= 0x84 { 45 } else { 47 });
        let has_trans_object = read_u8(c);
        if has_trans_object != 0 {
            skip(c, 30);
        }
    }
    skip(c, 1);
    let num_arguments = read_u32(c);
    let mut arguments = Vec::with_capacity(num_arguments as usize);
    // First pass: group_ids
    for _ in 0..num_arguments {
        arguments.push(MusicSwitchArg {
            group_id: read_u32(c),
            group_type: 0,
        });
    }
    // Second pass: group_types
    for arg in &mut arguments {
        arg.group_type = read_u8(c);
    }

    let tree_size = read_u32(c);
    skip(c, 1);
    let num_nodes = tree_size / 12;
    let mut decision_nodes = Vec::with_capacity(num_nodes as usize);
    for _ in 0..num_nodes {
        let key = read_u32(c);
        let audio_id = read_u32(c);
        skip(c, 4);
        decision_nodes.push(DecisionNode { key, audio_id });
    }

    HircMusicSwitch {
        self_id,
        parent_id,
        children,
        arguments,
        decision_nodes,
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Returns None if no HIRC section is found.
pub fn parse_hirc_from_bnk(bnk_data: &[u8]) -> Result<Option<HircData>, String> {
    if bnk_data.len() < 12 || &bnk_data[0..4] != b"BKHD" {
        return Err("Not a valid BNK file".into());
    }
    let version = u32::from_le_bytes([bnk_data[8], bnk_data[9], bnk_data[10], bnk_data[11]]);

    let mut offset = 0usize;
    while offset + 8 <= bnk_data.len() {
        let magic = &bnk_data[offset..offset + 4];
        let section_len =
            u32::from_le_bytes([bnk_data[offset + 4], bnk_data[offset + 5], bnk_data[offset + 6], bnk_data[offset + 7]]) as usize;

        if magic == b"HIRC" {
            return parse_hirc_section(&bnk_data[offset + 8..offset + 8 + section_len], version)
                .map(Some);
        }

        offset += 8 + section_len;
    }

    Ok(None)
}

/// Input is the section content without the magic+length header.
pub fn parse_hirc_section(hirc_data: &[u8], version: u32) -> Result<HircData, String> {
    let mut c = Cursor::new(hirc_data);
    let num_objects = read_u32(&mut c);
    let mut data = HircData::default();

    let section_end = hirc_data.len() as u64;

    for _ in 0..num_objects {
        if c.position() >= section_end {
            break;
        }

        let obj_type = read_u8(&mut c);
        let obj_length = read_u32(&mut c) as u64;
        let obj_start = c.position();

        match obj_type {
            2 => data.sounds.push(read_sound(&mut c, version)),
            3 => data.event_actions.push(read_event_action(&mut c)),
            4 => data.events.push(read_event(&mut c, version)),
            5 => data.random_containers.push(read_random_container(&mut c, version)),
            6 => data.switch_containers.push(read_switch_container(&mut c, version)),
            10 => data.music_segments.push(read_music_container(&mut c, version)),
            11 => data.music_tracks.push(read_music_track(&mut c, version)),
            12 => data.music_switches.push(read_music_switch(&mut c, version)),
            13 => data.music_playlists.push(read_music_container(&mut c, version)),
            _ => {}
        }

        c.set_position(obj_start + obj_length);
    }

    Ok(data)
}
