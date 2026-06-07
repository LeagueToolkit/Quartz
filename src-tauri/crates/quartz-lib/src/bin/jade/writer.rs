use super::types::*;
use std::io::{Cursor, Seek, SeekFrom, Write};
use std::fmt;

#[derive(Debug)]
pub struct WriteError(pub String);

impl fmt::Display for WriteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

type Result<T> = std::result::Result<T, WriteError>;

fn err(msg: impl Into<String>) -> WriteError {
    WriteError(msg.into())
}

struct BinWriter {
    cursor: Cursor<Vec<u8>>,
}

impl BinWriter {
    fn new() -> Self {
        Self { cursor: Cursor::new(Vec::new()) }
    }

    fn into_bytes(self) -> Vec<u8> {
        self.cursor.into_inner()
    }

    fn position(&self) -> u64 {
        self.cursor.position()
    }

    fn write_bytes(&mut self, bytes: &[u8]) -> Result<()> {
        self.cursor.write_all(bytes).map_err(|e| err(e.to_string()))
    }

    fn write_u8(&mut self, v: u8) -> Result<()> { self.write_bytes(&[v]) }
    fn write_i8(&mut self, v: i8) -> Result<()> { self.write_bytes(&(v as u8).to_le_bytes()) }
    fn write_u16(&mut self, v: u16) -> Result<()> { self.write_bytes(&v.to_le_bytes()) }
    fn write_i16(&mut self, v: i16) -> Result<()> { self.write_bytes(&v.to_le_bytes()) }
    fn write_u32(&mut self, v: u32) -> Result<()> { self.write_bytes(&v.to_le_bytes()) }
    fn write_i32(&mut self, v: i32) -> Result<()> { self.write_bytes(&v.to_le_bytes()) }
    fn write_u64(&mut self, v: u64) -> Result<()> { self.write_bytes(&v.to_le_bytes()) }
    fn write_i64(&mut self, v: i64) -> Result<()> { self.write_bytes(&v.to_le_bytes()) }
    fn write_f32(&mut self, v: f32) -> Result<()> { self.write_bytes(&v.to_le_bytes()) }

    fn write_string(&mut self, s: &str) -> Result<()> {
        let bytes = s.as_bytes();
        self.write_u16(bytes.len() as u16)?;
        self.write_bytes(bytes)
    }

    fn seek_to(&mut self, pos: u64) -> Result<()> {
        self.cursor.seek(SeekFrom::Start(pos)).map_err(|e| err(e.to_string()))?;
        Ok(())
    }

    /// Write a u32 size placeholder, return the position of the placeholder.
    fn write_size_placeholder(&mut self) -> Result<u64> {
        let pos = self.position();
        self.write_u32(0)?;
        Ok(pos)
    }

    /// Fill in a size placeholder with (current_pos - start_pos - 4).
    fn fill_size(&mut self, placeholder_pos: u64) -> Result<()> {
        let end_pos = self.position();
        let size = (end_pos - placeholder_pos - 4) as u32;
        self.seek_to(placeholder_pos)?;
        self.write_u32(size)?;
        self.seek_to(end_pos)
    }

    fn write_value(&mut self, value: &BinValue) -> Result<()> {
        match value {
            BinValue::None => {}
            BinValue::Bool(v) => self.write_u8(if *v { 1 } else { 0 })?,
            BinValue::I8(v) => self.write_i8(*v)?,
            BinValue::U8(v) => self.write_u8(*v)?,
            BinValue::I16(v) => self.write_i16(*v)?,
            BinValue::U16(v) => self.write_u16(*v)?,
            BinValue::I32(v) => self.write_i32(*v)?,
            BinValue::U32(v) => self.write_u32(*v)?,
            BinValue::I64(v) => self.write_i64(*v)?,
            BinValue::U64(v) => self.write_u64(*v)?,
            BinValue::F32(v) => self.write_f32(*v)?,
            BinValue::Vec2(v) => { self.write_f32(v[0])?; self.write_f32(v[1])?; }
            BinValue::Vec3(v) => { self.write_f32(v[0])?; self.write_f32(v[1])?; self.write_f32(v[2])?; }
            BinValue::Vec4(v) => { self.write_f32(v[0])?; self.write_f32(v[1])?; self.write_f32(v[2])?; self.write_f32(v[3])?; }
            BinValue::Mtx44(m) => { for v in m { self.write_f32(*v)?; } }
            BinValue::Rgba(r, g, b, a) => { self.write_u8(*r)?; self.write_u8(*g)?; self.write_u8(*b)?; self.write_u8(*a)?; }
            BinValue::String(s) => self.write_string(s)?,
            BinValue::Hash(h) => self.write_u32(h.hash)?,
            BinValue::File(f) => self.write_u64(f.hash)?,
            BinValue::Link(l) => self.write_u32(l.hash)?,
            BinValue::Flag(v) => self.write_u8(if *v { 1 } else { 0 })?,

            BinValue::List { value_type, items } => {
                self.write_u8(*value_type as u8)?;
                let placeholder = self.write_size_placeholder()?;
                self.write_u32(items.len() as u32)?;
                for item in items { self.write_value(item)?; }
                self.fill_size(placeholder)?;
            }

            BinValue::List2 { value_type, items } => {
                self.write_u8(*value_type as u8)?;
                let placeholder = self.write_size_placeholder()?;
                self.write_u32(items.len() as u32)?;
                for item in items { self.write_value(item)?; }
                self.fill_size(placeholder)?;
            }

            BinValue::Pointer { name, fields } => {
                self.write_u32(name.hash)?;
                if name.hash == 0 { return Ok(()); }
                let placeholder = self.write_size_placeholder()?;
                self.write_u16(fields.len() as u16)?;
                for field in fields {
                    self.write_u32(field.key.hash)?;
                    self.write_u8(field.value.bin_type() as u8)?;
                    self.write_value(&field.value)?;
                }
                self.fill_size(placeholder)?;
            }

            BinValue::Embed { name, fields } => {
                self.write_u32(name.hash)?;
                let placeholder = self.write_size_placeholder()?;
                self.write_u16(fields.len() as u16)?;
                for field in fields {
                    self.write_u32(field.key.hash)?;
                    self.write_u8(field.value.bin_type() as u8)?;
                    self.write_value(&field.value)?;
                }
                self.fill_size(placeholder)?;
            }

            BinValue::Option { value_type, items } => {
                self.write_u8(*value_type as u8)?;
                self.write_u8(items.len() as u8)?;
                if let Some(item) = items.first() {
                    self.write_value(item)?;
                }
            }

            BinValue::Map { key_type, value_type, items } => {
                self.write_u8(*key_type as u8)?;
                self.write_u8(*value_type as u8)?;
                let placeholder = self.write_size_placeholder()?;
                self.write_u32(items.len() as u32)?;
                for (k, v) in items {
                    self.write_value(k)?;
                    self.write_value(v)?;
                }
                self.fill_size(placeholder)?;
            }
        }
        Ok(())
    }
}

/// Write a Bin structure to binary .bin format.
pub fn write(bin: &Bin) -> Result<Vec<u8>> {
    let mut w = BinWriter::new();

    // Type
    let type_str = bin.sections.get("type")
        .and_then(|v| if let BinValue::String(s) = v { Some(s.as_str()) } else { None })
        .ok_or_else(|| err("Missing 'type' section"))?;

    let is_patch = type_str == "PTCH";

    if is_patch {
        w.write_bytes(b"PTCH")?;
        w.write_u64(1)?; // PTCH unknown header
    }

    w.write_bytes(b"PROP")?;

    // Version
    let version = bin.sections.get("version")
        .and_then(|v| if let BinValue::U32(n) = v { Some(*n) } else { None })
        .ok_or_else(|| err("Missing 'version' section"))?;
    w.write_u32(version)?;

    // Linked
    if version >= 2 {
        if let Some(BinValue::List { items, .. }) = bin.sections.get("linked") {
            w.write_u32(items.len() as u32)?;
            for item in items {
                if let BinValue::String(s) = item {
                    w.write_string(s)?;
                }
            }
        } else {
            w.write_u32(0)?;
        }
    }

    // Entries
    if let Some(BinValue::Map { items, .. }) = bin.sections.get("entries") {
        w.write_u32(items.len() as u32)?;

        // Reserve space for entry name hashes
        let hashes_offset = w.position();
        let hashes_size = items.len() as u64 * 4;
        w.write_bytes(&vec![0u8; hashes_size as usize])?;

        let mut hashes = Vec::with_capacity(items.len());

        for (key, val) in items {
            // Get the embed name hash for the hash table
            if let BinValue::Embed { name, .. } = val {
                hashes.push(name.hash);
            } else {
                hashes.push(0);
            }

            // Write entry
            let entry_key_hash = match key {
                BinValue::Hash(h) => h.hash,
                _ => 0,
            };
            let fields = match val {
                BinValue::Embed { fields, .. } => fields,
                _ => return Err(err("Entry value must be Embed")),
            };

            let placeholder = w.write_size_placeholder()?;
            w.write_u32(entry_key_hash)?;
            w.write_u16(fields.len() as u16)?;
            for field in fields {
                w.write_u32(field.key.hash)?;
                w.write_u8(field.value.bin_type() as u8)?;
                w.write_value(&field.value)?;
            }
            w.fill_size(placeholder)?;
        }

        // Go back and write hashes
        let end_pos = w.position();
        w.seek_to(hashes_offset)?;
        for h in &hashes {
            w.write_u32(*h)?;
        }
        w.seek_to(end_pos)?;
    } else {
        w.write_u32(0)?;
    }

    // Patches
    if is_patch {
        if let Some(BinValue::Map { items, .. }) = bin.sections.get("patches") {
            w.write_u32(items.len() as u32)?;
            for (key, val) in items {
                let key_hash = match key {
                    BinValue::Hash(h) => h.hash,
                    _ => 0,
                };
                w.write_u32(key_hash)?;

                if let BinValue::Embed { fields, .. } = val {
                    let path = fields.iter()
                        .find(|f| f.key.string.as_deref() == Some("path") || f.key.hash == FNV1a::calculate("path"))
                        .and_then(|f| if let BinValue::String(s) = &f.value { Some(s.as_str()) } else { None })
                        .ok_or_else(|| err("Patch missing 'path' field"))?;
                    let value_field = fields.iter()
                        .find(|f| f.key.string.as_deref() == Some("value") || f.key.hash == FNV1a::calculate("value"))
                        .ok_or_else(|| err("Patch missing 'value' field"))?;

                    let placeholder = w.write_size_placeholder()?;
                    w.write_u8(value_field.value.bin_type() as u8)?;
                    w.write_string(path)?;
                    w.write_value(&value_field.value)?;
                    w.fill_size(placeholder)?;
                }
            }
        } else {
            w.write_u32(0)?;
        }
    }

    Ok(w.into_bytes())
}
