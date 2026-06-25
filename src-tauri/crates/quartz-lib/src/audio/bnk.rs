use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioEntryInfo {
    pub id: u32,
    pub size: u32,
}

#[derive(Debug, Clone)]
pub struct AudioEntry {
    pub id: u32,
    pub data: Vec<u8>,
}

#[derive(Debug)]
pub struct BnkFile {
    pub version: u32,
    pub bank_id: u32,
    /// DIDX entries (file_id, offset_in_data, length)
    entries: Vec<(u32, u32, u32)>,
    /// Absolute offset of the DATA section payload in the original buffer
    data_section_offset: usize,
    pub hirc_bytes: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BnkInfo {
    pub format: String,
    pub version: u32,
    pub bank_id: u32,
    pub entry_count: usize,
    pub entries: Vec<AudioEntryInfo>,
    pub has_hirc: bool,
}

impl BnkFile {
    pub fn parse(data: &[u8]) -> Result<Self, String> {
        let mut cursor = Cursor::new(data);
        let len = data.len() as u64;

        let mut magic = [0u8; 4];
        cursor
            .read_exact(&mut magic)
            .map_err(|e| format!("Failed to read BNK magic: {e}"))?;
        if &magic != b"BKHD" {
            return Err("Not a valid BNK file — missing BKHD header".into());
        }
        let bkhd_len = cursor
            .read_u32::<LittleEndian>()
            .map_err(|e| format!("Failed to read BKHD length: {e}"))?;
        let version = cursor
            .read_u32::<LittleEndian>()
            .map_err(|e| format!("Failed to read BNK version: {e}"))?;
        let bank_id = cursor
            .read_u32::<LittleEndian>()
            .map_err(|e| format!("Failed to read bank ID: {e}"))?;

        let bkhd_remaining = bkhd_len.saturating_sub(8) as u64;
        cursor.set_position(cursor.position() + bkhd_remaining);

        let mut entries: Vec<(u32, u32, u32)> = Vec::new();
        let mut data_section_offset: usize = 0;
        let mut hirc_bytes: Option<Vec<u8>> = None;

        while cursor.position() + 8 <= len {
            let mut section_magic = [0u8; 4];
            if cursor.read_exact(&mut section_magic).is_err() {
                break;
            }
            let section_len = match cursor.read_u32::<LittleEndian>() {
                Ok(v) => v,
                Err(_) => break,
            };
            let section_start = cursor.position() as usize;

            match &section_magic {
                b"DIDX" => {
                    let entry_count = section_len / 12;
                    entries.reserve(entry_count as usize);
                    for _ in 0..entry_count {
                        let file_id = cursor
                            .read_u32::<LittleEndian>()
                            .map_err(|e| format!("DIDX read error: {e}"))?;
                        let offset = cursor
                            .read_u32::<LittleEndian>()
                            .map_err(|e| format!("DIDX read error: {e}"))?;
                        let length = cursor
                            .read_u32::<LittleEndian>()
                            .map_err(|e| format!("DIDX read error: {e}"))?;
                        entries.push((file_id, offset, length));
                    }
                }
                b"DATA" => {
                    data_section_offset = section_start;
                }
                b"HIRC" => {
                    let hirc_end = section_start + section_len as usize;
                    if hirc_end <= data.len() {
                        hirc_bytes = Some(data[section_start..hirc_end].to_vec());
                    }
                }
                _ => {}
            }

            cursor.set_position((section_start + section_len as usize) as u64);
        }

        Ok(BnkFile {
            version,
            bank_id,
            entries,
            data_section_offset,
            hirc_bytes,
        })
    }

    pub fn info(&self) -> BnkInfo {
        BnkInfo {
            format: "bnk".into(),
            version: self.version,
            bank_id: self.bank_id,
            entry_count: self.entries.len(),
            entries: self
                .entries
                .iter()
                .map(|&(id, _, size)| AudioEntryInfo { id, size })
                .collect(),
            has_hirc: self.hirc_bytes.is_some(),
        }
    }

    pub fn read_entry_data<'a>(&self, data: &'a [u8], file_id: u32) -> Result<&'a [u8], String> {
        let entry = self
            .entries
            .iter()
            .find(|e| e.0 == file_id)
            .ok_or_else(|| format!("Audio entry {file_id} not found in BNK"))?;

        let start = self.data_section_offset + entry.1 as usize;
        let end = start + entry.2 as usize;

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
        for &(id, offset, length) in &self.entries {
            let start = self.data_section_offset + offset as usize;
            let end = start + length as usize;
            if end > data.len() {
                return Err(format!("Audio entry {id} data out of bounds"));
            }
            result.push(AudioEntry {
                id,
                data: data[start..end].to_vec(),
            });
        }
        Ok(result)
    }
}

pub fn parse_bnk_metadata(data: &[u8]) -> Result<BnkInfo, String> {
    let bnk = BnkFile::parse(data)?;
    Ok(bnk.info())
}

pub fn read_bnk_entry(data: &[u8], file_id: u32) -> Result<Vec<u8>, String> {
    let bnk = BnkFile::parse(data)?;
    Ok(bnk.read_entry_data(data, file_id)?.to_vec())
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

const ALIGNMENT: usize = 16;

fn align_up(val: usize, alignment: usize) -> usize {
    let rem = val % alignment;
    if rem == 0 {
        val
    } else {
        val + (alignment - rem)
    }
}

/// Produces a minimal BKHD + DIDX + DATA bank (version 0x86).
pub fn write_bnk(entries: &[AudioEntry]) -> Vec<u8> {
    let bkhd_section_len: u32 = 0x14;

    let didx_size = (entries.len() * 12) as u32;

    let mut offsets = Vec::with_capacity(entries.len());
    let mut data_size: usize = 0;
    for entry in entries {
        let aligned = align_up(data_size, ALIGNMENT);
        offsets.push(aligned as u32);
        data_size = aligned + entry.data.len();
    }

    let total = 8 + bkhd_section_len as usize
        + 8 + didx_size as usize
        + 8 + data_size;

    let mut buf = Vec::with_capacity(total);

    buf.write_all(b"BKHD").unwrap();
    buf.write_u32::<LittleEndian>(bkhd_section_len).unwrap();
    buf.write_u32::<LittleEndian>(0x86).unwrap();
    buf.write_u32::<LittleEndian>(0).unwrap();
    buf.write_u32::<LittleEndian>(0x17705D3E).unwrap();
    buf.write_all(&[0u8; 8]).unwrap();

    buf.write_all(b"DIDX").unwrap();
    buf.write_u32::<LittleEndian>(didx_size).unwrap();
    for (i, entry) in entries.iter().enumerate() {
        buf.write_u32::<LittleEndian>(entry.id).unwrap();
        buf.write_u32::<LittleEndian>(offsets[i]).unwrap();
        buf.write_u32::<LittleEndian>(entry.data.len() as u32).unwrap();
    }

    buf.write_all(b"DATA").unwrap();
    buf.write_u32::<LittleEndian>(data_size as u32).unwrap();
    let data_start = buf.len();
    buf.resize(data_start + data_size, 0);
    for (i, entry) in entries.iter().enumerate() {
        let dst = data_start + offsets[i] as usize;
        buf[dst..dst + entry.data.len()].copy_from_slice(&entry.data);
    }

    buf
}

pub fn replace_bnk_entry(data: &[u8], file_id: u32, new_wem: &[u8]) -> Result<Vec<u8>, String> {
    let bnk = BnkFile::parse(data)?;
    let mut entries = bnk.read_all_entries(data)?;

    let entry = entries
        .iter_mut()
        .find(|e| e.id == file_id)
        .ok_or_else(|| format!("Entry {file_id} not found"))?;
    entry.data = new_wem.to_vec();

    Ok(write_bnk(&entries))
}

/// Minimal silence WEM (valid RIFF WAV with no audio data).
pub const SILENCE_WEM: &[u8] = &[
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x24, 0x00, 0x00, 0x00, // chunk size = 36
    0x57, 0x41, 0x56, 0x45, // "WAVE"
    0x66, 0x6D, 0x74, 0x20, // "fmt "
    0x10, 0x00, 0x00, 0x00, // fmt size = 16
    0x01, 0x00,             // PCM format
    0x01, 0x00,             // 1 channel
    0x44, 0xAC, 0x00, 0x00, // 44100 Hz
    0x88, 0x58, 0x01, 0x00, // byte rate
    0x02, 0x00,             // block align
    0x10, 0x00,             // 16 bits per sample
    0x64, 0x61, 0x74, 0x61, // "data"
    0x00, 0x00, 0x00, 0x00, // data size = 0 (silence)
];

pub fn silence_bnk_entry(data: &[u8], file_id: u32) -> Result<Vec<u8>, String> {
    replace_bnk_entry(data, file_id, SILENCE_WEM)
}

/// Rewrites BKHD/DIDX/DATA — HIRC is not preserved.
pub fn remove_bnk_entry(data: &[u8], file_id: u32) -> Result<Vec<u8>, String> {
    let bnk = BnkFile::parse(data)?;
    let mut entries = bnk.read_all_entries(data)?;
    let before = entries.len();
    entries.retain(|e| e.id != file_id);
    if entries.len() == before {
        return Err(format!("Entry {file_id} not found"));
    }
    Ok(write_bnk(&entries))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_bnk() -> Vec<u8> {
        let e1 = AudioEntry { id: 100, data: vec![0xAA; 32] };
        let e2 = AudioEntry { id: 200, data: vec![0xBB; 16] };
        write_bnk(&[e1, e2])
    }

    #[test]
    fn roundtrip_write_parse() {
        let bnk_data = make_test_bnk();
        let info = parse_bnk_metadata(&bnk_data).unwrap();
        assert_eq!(info.format, "bnk");
        assert_eq!(info.entry_count, 2);
        assert_eq!(info.entries[0].id, 100);
        assert_eq!(info.entries[0].size, 32);
        assert_eq!(info.entries[1].id, 200);
        assert_eq!(info.entries[1].size, 16);
    }

    #[test]
    fn read_entry_data() {
        let bnk_data = make_test_bnk();
        let entry_data = read_bnk_entry(&bnk_data, 100).unwrap();
        assert_eq!(entry_data.len(), 32);
        assert!(entry_data.iter().all(|&b| b == 0xAA));

        let entry_data = read_bnk_entry(&bnk_data, 200).unwrap();
        assert_eq!(entry_data.len(), 16);
        assert!(entry_data.iter().all(|&b| b == 0xBB));
    }

    #[test]
    fn replace_entry() {
        let bnk_data = make_test_bnk();
        let new_bnk = replace_bnk_entry(&bnk_data, 100, &[0xCC; 64]).unwrap();
        let info = parse_bnk_metadata(&new_bnk).unwrap();
        assert_eq!(info.entries[0].size, 64);
        let entry_data = read_bnk_entry(&new_bnk, 100).unwrap();
        assert!(entry_data.iter().all(|&b| b == 0xCC));
    }

    #[test]
    fn entry_not_found() {
        let bnk_data = make_test_bnk();
        assert!(read_bnk_entry(&bnk_data, 999).is_err());
    }
}
