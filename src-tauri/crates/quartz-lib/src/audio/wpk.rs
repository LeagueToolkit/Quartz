use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};

use super::bnk::{AudioEntry, AudioEntryInfo};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WpkInfo {
    pub format: String,
    pub version: u32,
    pub entry_count: usize,
    pub entries: Vec<AudioEntryInfo>,
}

#[derive(Debug, Clone)]
struct WpkEntry {
    id: u32,
    data_offset: u32,
    data_length: u32,
}

#[derive(Debug)]
pub struct WpkFile {
    pub version: u32,
    entries: Vec<WpkEntry>,
}

impl WpkFile {
    pub fn parse(data: &[u8]) -> Result<Self, String> {
        let mut cursor = Cursor::new(data);

        let mut magic = [0u8; 4];
        cursor
            .read_exact(&mut magic)
            .map_err(|e| format!("Failed to read WPK magic: {e}"))?;
        if &magic != b"r3d2" {
            return Err("Not a valid WPK file — missing r3d2 header".into());
        }

        let version = cursor
            .read_u32::<LittleEndian>()
            .map_err(|e| format!("Failed to read WPK version: {e}"))?;
        let file_count = cursor
            .read_u32::<LittleEndian>()
            .map_err(|e| format!("Failed to read WPK file count: {e}"))?;

        let mut offsets = Vec::with_capacity(file_count as usize);
        for _ in 0..file_count {
            offsets.push(
                cursor
                    .read_u32::<LittleEndian>()
                    .map_err(|e| format!("Failed to read WPK offset: {e}"))?,
            );
        }

        let mut entries = Vec::new();

        for &offset in &offsets {
            if offset == 0 {
                continue;
            }

            cursor.set_position(offset as u64);

            let data_offset = cursor
                .read_u32::<LittleEndian>()
                .map_err(|e| format!("Failed to read entry data offset: {e}"))?;
            let data_length = cursor
                .read_u32::<LittleEndian>()
                .map_err(|e| format!("Failed to read entry data length: {e}"))?;
            let filename_length = cursor
                .read_u32::<LittleEndian>()
                .map_err(|e| format!("Failed to read filename length: {e}"))?;

            // Read UTF-16LE filename
            let mut filename = String::new();
            for _ in 0..filename_length {
                let lo = cursor.read_u8().unwrap_or(0);
                let _hi = cursor.read_u8().unwrap_or(0);
                filename.push(lo as char);
            }

            let id: u32 = filename
                .trim_end_matches(".wem")
                .parse()
                .unwrap_or(0);

            entries.push(WpkEntry {
                id,
                data_offset,
                data_length,
            });
        }

        entries.sort_by_key(|e| e.id);

        Ok(WpkFile { version, entries })
    }

    pub fn info(&self) -> WpkInfo {
        WpkInfo {
            format: "wpk".into(),
            version: self.version,
            entry_count: self.entries.len(),
            entries: self
                .entries
                .iter()
                .map(|e| AudioEntryInfo {
                    id: e.id,
                    size: e.data_length,
                })
                .collect(),
        }
    }

    pub fn read_entry_data<'a>(&self, data: &'a [u8], file_id: u32) -> Result<&'a [u8], String> {
        let entry = self
            .entries
            .iter()
            .find(|e| e.id == file_id)
            .ok_or_else(|| format!("Audio entry {file_id} not found in WPK"))?;

        let start = entry.data_offset as usize;
        let end = start + entry.data_length as usize;

        if end > data.len() {
            return Err(format!(
                "Audio entry {file_id} data out of bounds ({}..{} > {})",
                start,
                end,
                data.len()
            ));
        }

        Ok(&data[start..end])
    }

    pub fn read_all_entries(&self, data: &[u8]) -> Result<Vec<AudioEntry>, String> {
        let mut result = Vec::with_capacity(self.entries.len());
        for entry in &self.entries {
            let start = entry.data_offset as usize;
            let end = start + entry.data_length as usize;
            if end > data.len() {
                return Err(format!("Audio entry {} data out of bounds", entry.id));
            }
            result.push(AudioEntry {
                id: entry.id,
                data: data[start..end].to_vec(),
            });
        }
        Ok(result)
    }
}

pub fn parse_wpk_metadata(data: &[u8]) -> Result<WpkInfo, String> {
    let wpk = WpkFile::parse(data)?;
    Ok(wpk.info())
}

pub fn read_wpk_entry(data: &[u8], file_id: u32) -> Result<Vec<u8>, String> {
    let wpk = WpkFile::parse(data)?;
    Ok(wpk.read_entry_data(data, file_id)?.to_vec())
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

const WPK_ALIGNMENT: usize = 8;

fn align_up(val: usize, alignment: usize) -> usize {
    let rem = val % alignment;
    if rem == 0 {
        val
    } else {
        val + (alignment - rem)
    }
}

pub fn write_wpk(entries: &[AudioEntry]) -> Vec<u8> {
    let count = entries.len();

    // Header: "r3d2" (4) + version (4) + file_count (4) + offset_table (count * 4)
    let header_size = 12 + count * 4;
    let aligned_header = align_up(header_size, WPK_ALIGNMENT);

    struct EntryLayout {
        info_pos: usize,
        filename: String,
    }
    let mut layouts = Vec::with_capacity(count);
    let mut current_pos = aligned_header;

    for entry in entries {
        let filename = format!("{}.wem", entry.id);
        let info_size = 12 + filename.len() * 2; // 3 u32s + UTF-16LE chars
        let aligned_info = align_up(info_size, WPK_ALIGNMENT);
        layouts.push(EntryLayout {
            info_pos: current_pos,
            filename,
        });
        current_pos += aligned_info;
    }

    let mut data_offsets = Vec::with_capacity(count);
    for entry in entries {
        data_offsets.push(current_pos);
        current_pos += entry.data.len();
        current_pos = align_up(current_pos, WPK_ALIGNMENT);
    }

    let total_size = current_pos;
    let mut buf = vec![0u8; total_size];
    let mut w = Cursor::new(&mut buf[..]);

    w.write_all(b"r3d2").unwrap();
    w.write_u32::<LittleEndian>(1).unwrap(); // version
    w.write_u32::<LittleEndian>(count as u32).unwrap();

    for layout in &layouts {
        w.write_u32::<LittleEndian>(layout.info_pos as u32).unwrap();
    }

    for (i, layout) in layouts.iter().enumerate() {
        w.set_position(layout.info_pos as u64);
        w.write_u32::<LittleEndian>(data_offsets[i] as u32).unwrap();
        w.write_u32::<LittleEndian>(entries[i].data.len() as u32).unwrap();
        w.write_u32::<LittleEndian>(layout.filename.len() as u32).unwrap();

        for ch in layout.filename.bytes() {
            w.write_u8(ch).unwrap();
            w.write_u8(0).unwrap();
        }
    }

    for (i, entry) in entries.iter().enumerate() {
        buf[data_offsets[i]..data_offsets[i] + entry.data.len()].copy_from_slice(&entry.data);
    }

    buf
}

pub fn replace_wpk_entry(data: &[u8], file_id: u32, new_wem: &[u8]) -> Result<Vec<u8>, String> {
    let wpk = WpkFile::parse(data)?;
    let mut entries = wpk.read_all_entries(data)?;

    let entry = entries
        .iter_mut()
        .find(|e| e.id == file_id)
        .ok_or_else(|| format!("Entry {file_id} not found"))?;
    entry.data = new_wem.to_vec();

    Ok(write_wpk(&entries))
}

pub fn remove_wpk_entry(data: &[u8], file_id: u32) -> Result<Vec<u8>, String> {
    let wpk = WpkFile::parse(data)?;
    let mut entries = wpk.read_all_entries(data)?;
    let before = entries.len();
    entries.retain(|e| e.id != file_id);
    if entries.len() == before {
        return Err(format!("Entry {file_id} not found"));
    }
    Ok(write_wpk(&entries))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_wpk() -> Vec<u8> {
        let e1 = AudioEntry { id: 100, data: vec![0xAA; 32] };
        let e2 = AudioEntry { id: 200, data: vec![0xBB; 16] };
        write_wpk(&[e1, e2])
    }

    #[test]
    fn roundtrip_write_parse() {
        let wpk_data = make_test_wpk();
        let info = parse_wpk_metadata(&wpk_data).unwrap();
        assert_eq!(info.format, "wpk");
        assert_eq!(info.entry_count, 2);
        assert_eq!(info.entries[0].id, 100);
        assert_eq!(info.entries[0].size, 32);
        assert_eq!(info.entries[1].id, 200);
        assert_eq!(info.entries[1].size, 16);
    }

    #[test]
    fn read_entry_data() {
        let wpk_data = make_test_wpk();
        let entry_data = read_wpk_entry(&wpk_data, 100).unwrap();
        assert_eq!(entry_data.len(), 32);
        assert!(entry_data.iter().all(|&b| b == 0xAA));
    }

    #[test]
    fn replace_entry() {
        let wpk_data = make_test_wpk();
        let new_wpk = replace_wpk_entry(&wpk_data, 100, &[0xCC; 64]).unwrap();
        let info = parse_wpk_metadata(&new_wpk).unwrap();
        assert_eq!(info.entries[0].size, 64);
    }
}
