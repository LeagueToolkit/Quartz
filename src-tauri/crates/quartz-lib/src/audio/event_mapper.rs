//! BIN event extraction + HIRC → WEM event mapping.

use super::hirc::HircData;
use serde::{Deserialize, Serialize};

/// Hash is FNV-1.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinEventString {
    pub name: String,
    pub hash: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventMapping {
    pub event_name: String,
    pub wem_id: u32,
    pub container_id: u32,
    pub music_segment_id: Option<u32>,
    pub switch_id: Option<u32>,
}

// ---------------------------------------------------------------------------
// FNV-1 hash (Wwise uses FNV-1, NOT FNV-1a)
// ---------------------------------------------------------------------------

/// FNV-1 hash (multiply-then-XOR) with case-insensitive ASCII.
pub fn fnv1_hash(input: &str) -> u32 {
    let mut hash: u32 = 0x811c9dc5;
    for &byte in input.as_bytes() {
        hash = hash.wrapping_mul(0x01000193);
        let c = if byte.is_ascii_uppercase() {
            byte + 32
        } else {
            byte
        };
        hash ^= c as u32;
    }
    hash
}

// ---------------------------------------------------------------------------
// BIN event extraction (pattern matching on raw bytes)
// ---------------------------------------------------------------------------

const EVENT_HEADER: [u8; 6] = [0x84, 0xE3, 0xD8, 0x12, 0x80, 0x10];
const MUSIC_HEADER: [u8; 5] = [0xD4, 0x4F, 0x9C, 0x9F, 0x83];

fn find_sequence(data: &[u8], needle: &[u8], start: usize) -> Option<usize> {
    if needle.is_empty() || data.len() < needle.len() {
        return None;
    }
    let max = data.len() - needle.len();
    (start..=max).find(|&i| data[i..i + needle.len()] == *needle)
}

fn read_u8_at(data: &[u8], offset: usize) -> u8 {
    data.get(offset).copied().unwrap_or(0)
}

fn read_u16_le(data: &[u8], offset: usize) -> u16 {
    if offset + 2 > data.len() {
        return 0;
    }
    u16::from_le_bytes([data[offset], data[offset + 1]])
}

fn read_u32_le(data: &[u8], offset: usize) -> u32 {
    if offset + 4 > data.len() {
        return 0;
    }
    u32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
}

pub fn extract_bin_events(bin_data: &[u8]) -> Vec<BinEventString> {
    let mut result = Vec::new();

    let mut offset = 0usize;
    while let Some(found) = find_sequence(bin_data, &EVENT_HEADER, offset) {
        let mut pos = found + EVENT_HEADER.len();

        if pos + 8 > bin_data.len() {
            break;
        }

        pos += 4;

        let amount = read_u32_le(bin_data, pos) as usize;
        pos += 4;

        for _ in 0..amount {
            if pos + 2 > bin_data.len() {
                break;
            }
            let len = read_u16_le(bin_data, pos) as usize;
            pos += 2;

            if pos + len > bin_data.len() {
                break;
            }
            if let Ok(s) = std::str::from_utf8(&bin_data[pos..pos + len]) {
                let hash = fnv1_hash(s);
                result.push(BinEventString {
                    name: s.to_string(),
                    hash,
                });
            }
            pos += len;
        }
        offset = pos;
    }

    offset = 0;
    while let Some(found) = find_sequence(bin_data, &MUSIC_HEADER, offset) {
        let mut pos = found + MUSIC_HEADER.len();
        offset = pos;

        if pos + 4 > bin_data.len() {
            break;
        }

        let type_hash = read_u32_le(bin_data, pos);
        pos += 4;
        if type_hash == 0 {
            continue;
        }

        if pos + 6 > bin_data.len() {
            break;
        }

        pos += 4;

        let amount = read_u16_le(bin_data, pos) as usize;
        pos += 2;

        for _ in 0..amount {
            if pos + 5 > bin_data.len() {
                break;
            }
            pos += 4;

            let bin_type = read_u8_at(bin_data, pos);
            pos += 1;

            if bin_type != 0x10 {
                break;
            }

            if pos + 2 > bin_data.len() {
                break;
            }
            let len = read_u16_le(bin_data, pos) as usize;
            pos += 2;

            if pos + len > bin_data.len() {
                break;
            }
            if let Ok(s) = std::str::from_utf8(&bin_data[pos..pos + len]) {
                let hash = fnv1_hash(s);
                result.push(BinEventString {
                    name: s.to_string(),
                    hash,
                });
            }
            pos += len;
        }
        offset = pos;
    }

    result
}

// ---------------------------------------------------------------------------
// HIRC → WEM event mapping
// ---------------------------------------------------------------------------

fn add_connected_files(
    event_name: &str,
    id: u32,
    parent_id: u32,
    hirc: &HircData,
    results: &mut Vec<EventMapping>,
) {
    if let Some(ms) = hirc.music_switches.iter().find(|o| o.self_id == id) {
        for &child in &ms.children {
            add_connected_files(event_name, child, id, hirc, results);
        }
        return;
    }

    if let Some(mp) = hirc.music_playlists.iter().find(|o| o.self_id == id) {
        let pid = if mp.track_ids.len() > 1 { id } else { parent_id };
        for &track_id in &mp.track_ids {
            add_connected_files(event_name, track_id, pid, hirc, results);
        }
        return;
    }

    if let Some(rc) = hirc.random_containers.iter().find(|o| o.self_id == id) {
        let pid = if rc.sound_ids.len() > 1 { id } else { parent_id };
        for &sound_id in &rc.sound_ids {
            add_connected_files(event_name, sound_id, pid, hirc, results);
        }
        return;
    }

    if let Some(sc) = hirc.switch_containers.iter().find(|o| o.self_id == id) {
        for &child in &sc.children {
            add_connected_files(event_name, child, id, hirc, results);
        }
        return;
    }

    if let Some(seg) = hirc.music_segments.iter().find(|o| o.self_id == id) {
        for &track_id in &seg.track_ids {
            if let Some(track) = hirc.music_tracks.iter().find(|t| t.self_id == track_id) {
                for &file_id in &track.file_ids {
                    if file_id == 0 {
                        continue;
                    }
                    let music_segment_id = if seg.track_ids.len() > 1 {
                        Some(seg.self_id)
                    } else {
                        None
                    };
                    results.push(EventMapping {
                        event_name: event_name.to_string(),
                        wem_id: file_id,
                        container_id: parent_id,
                        music_segment_id,
                        switch_id: None,
                    });
                }
            }
        }
        return;
    }

    if let Some(sound) = hirc.sounds.iter().find(|o| o.self_id == id) {
        results.push(EventMapping {
            event_name: event_name.to_string(),
            wem_id: sound.file_id,
            container_id: parent_id,
            music_segment_id: None,
            switch_id: None,
        });
    }
}

pub fn map_events_to_wem(events: &[BinEventString], hirc: &HircData) -> Vec<EventMapping> {
    let mut results = Vec::new();

    for bin_entry in events {
        let event = match hirc.events.iter().find(|e| e.self_id == bin_entry.hash) {
            Some(e) => e,
            None => continue,
        };

        for &action_id in &event.action_ids {
            let action = match hirc.event_actions.iter().find(|a| a.self_id == action_id) {
                Some(a) => a,
                None => continue,
            };

            if action.action_type == 4 {
                // Play
                add_connected_files(
                    &bin_entry.name,
                    action.sound_object_id,
                    0,
                    hirc,
                    &mut results,
                );
            } else if action.action_type == 25 {
                // SetSwitch
                for track in &hirc.music_tracks {
                    if track.has_switch_ids && track.switch_group_id == action.switch_group_id {
                        for (i, &switch_id) in track.switch_ids.iter().enumerate() {
                            if switch_id == action.switch_state_id {
                                if let Some(&file_id) = track.file_ids.get(i) {
                                    if file_id != 0 {
                                        results.push(EventMapping {
                                            event_name: bin_entry.name.clone(),
                                            wem_id: file_id,
                                            container_id: 0,
                                            music_segment_id: None,
                                            switch_id: Some(track.switch_group_id),
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            } else if action.action_type == 18 {
                // SetState
                for ms in &hirc.music_switches {
                    for arg in &ms.arguments {
                        if arg.group_type == 1 && arg.group_id == action.state_group_id {
                            for node in &ms.decision_nodes {
                                if node.key == action.target_state_id {
                                    add_connected_files(
                                        &bin_entry.name,
                                        node.audio_id,
                                        ms.self_id,
                                        hirc,
                                        &mut results,
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fnv1_hash() {
        assert_eq!(fnv1_hash("Play_sfx_Ahri_Base_Q_Cast"), fnv1_hash("play_sfx_ahri_base_q_cast"));
        let fnv1 = fnv1_hash("test");
        let mut fnv1a: u32 = 0x811c9dc5;
        for &b in b"test" {
            fnv1a ^= b as u32;
            fnv1a = fnv1a.wrapping_mul(0x01000193);
        }
        assert_ne!(fnv1, fnv1a, "FNV-1 and FNV-1a should produce different results");
    }

    #[test]
    fn test_extract_bin_events_empty() {
        let events = extract_bin_events(&[]);
        assert!(events.is_empty());
    }
}
