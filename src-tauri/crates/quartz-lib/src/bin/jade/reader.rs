use super::types::*;
use std::fmt;

#[derive(Debug)]
pub struct ReadError(pub String);

impl fmt::Display for ReadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

type Result<T> = std::result::Result<T, ReadError>;

fn err(msg: impl Into<String>) -> ReadError {
    ReadError(msg.into())
}

struct BinReader<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> BinReader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }

    fn remaining(&self) -> usize {
        self.data.len().saturating_sub(self.offset)
    }

    fn read_bytes(&mut self, count: usize) -> Result<&'a [u8]> {
        if self.offset + count > self.data.len() {
            return Err(err(format!("Unexpected EOF: need {} bytes at offset {}", count, self.offset)));
        }
        let slice = &self.data[self.offset..self.offset + count];
        self.offset += count;
        Ok(slice)
    }

    fn read_u8(&mut self) -> Result<u8> {
        Ok(self.read_bytes(1)?[0])
    }

    fn read_bool(&mut self) -> Result<bool> {
        Ok(self.read_u8()? != 0)
    }

    fn read_i8(&mut self) -> Result<i8> {
        Ok(self.read_u8()? as i8)
    }

    fn read_u16(&mut self) -> Result<u16> {
        let b = self.read_bytes(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    fn read_i16(&mut self) -> Result<i16> {
        let b = self.read_bytes(2)?;
        Ok(i16::from_le_bytes([b[0], b[1]]))
    }

    fn read_u32(&mut self) -> Result<u32> {
        let b = self.read_bytes(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn read_i32(&mut self) -> Result<i32> {
        let b = self.read_bytes(4)?;
        Ok(i32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn read_u64(&mut self) -> Result<u64> {
        let b = self.read_bytes(8)?;
        Ok(u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
    }

    fn read_i64(&mut self) -> Result<i64> {
        let b = self.read_bytes(8)?;
        Ok(i64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
    }

    fn read_f32(&mut self) -> Result<f32> {
        let b = self.read_bytes(4)?;
        Ok(f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn read_string(&mut self) -> Result<String> {
        let len = self.read_u16()? as usize;
        let bytes = self.read_bytes(len)?;
        String::from_utf8(bytes.to_vec()).map_err(|e| err(format!("Invalid UTF-8 string: {}", e)))
    }

    fn read_fnv1a(&mut self) -> Result<FNV1a> {
        Ok(FNV1a::new(self.read_u32()?))
    }

    fn read_xxh64(&mut self) -> Result<XXH64> {
        Ok(XXH64::new(self.read_u64()?))
    }

    fn read_vec2(&mut self) -> Result<[f32; 2]> {
        Ok([self.read_f32()?, self.read_f32()?])
    }

    fn read_vec3(&mut self) -> Result<[f32; 3]> {
        Ok([self.read_f32()?, self.read_f32()?, self.read_f32()?])
    }

    fn read_vec4(&mut self) -> Result<[f32; 4]> {
        Ok([self.read_f32()?, self.read_f32()?, self.read_f32()?, self.read_f32()?])
    }

    fn read_mtx44(&mut self) -> Result<[f32; 16]> {
        let mut m = [0.0f32; 16];
        for v in &mut m {
            *v = self.read_f32()?;
        }
        Ok(m)
    }

    fn read_value(&mut self, bin_type: BinType) -> Result<BinValue> {
        match bin_type {
            BinType::None => Ok(BinValue::None),
            BinType::Bool => Ok(BinValue::Bool(self.read_bool()?)),
            BinType::I8 => Ok(BinValue::I8(self.read_i8()?)),
            BinType::U8 => Ok(BinValue::U8(self.read_u8()?)),
            BinType::I16 => Ok(BinValue::I16(self.read_i16()?)),
            BinType::U16 => Ok(BinValue::U16(self.read_u16()?)),
            BinType::I32 => Ok(BinValue::I32(self.read_i32()?)),
            BinType::U32 => Ok(BinValue::U32(self.read_u32()?)),
            BinType::I64 => Ok(BinValue::I64(self.read_i64()?)),
            BinType::U64 => Ok(BinValue::U64(self.read_u64()?)),
            BinType::F32 => Ok(BinValue::F32(self.read_f32()?)),
            BinType::Vec2 => Ok(BinValue::Vec2(self.read_vec2()?)),
            BinType::Vec3 => Ok(BinValue::Vec3(self.read_vec3()?)),
            BinType::Vec4 => Ok(BinValue::Vec4(self.read_vec4()?)),
            BinType::Mtx44 => Ok(BinValue::Mtx44(self.read_mtx44()?)),
            BinType::Rgba => {
                let r = self.read_u8()?;
                let g = self.read_u8()?;
                let b = self.read_u8()?;
                let a = self.read_u8()?;
                Ok(BinValue::Rgba(r, g, b, a))
            }
            BinType::String => Ok(BinValue::String(self.read_string()?)),
            BinType::Hash => Ok(BinValue::Hash(self.read_fnv1a()?)),
            BinType::File => Ok(BinValue::File(self.read_xxh64()?)),
            BinType::Link => Ok(BinValue::Link(self.read_fnv1a()?)),
            BinType::Flag => Ok(BinValue::Flag(self.read_bool()?)),

            BinType::List => {
                let vt = BinType::from_u8(self.read_u8()?).ok_or_else(|| err("Unknown list value type"))?;
                let size = self.read_u32()? as usize;
                let start = self.offset;
                let count = self.read_u32()? as usize;
                let mut items = Vec::with_capacity(count);
                for _ in 0..count {
                    items.push(self.read_value(vt)?);
                }
                if self.offset != start + size {
                    return Err(err(format!("List size mismatch: expected {}, got {}", size, self.offset - start)));
                }
                Ok(BinValue::List { value_type: vt, items })
            }

            BinType::List2 => {
                let vt = BinType::from_u8(self.read_u8()?).ok_or_else(|| err("Unknown list2 value type"))?;
                let size = self.read_u32()? as usize;
                let start = self.offset;
                let count = self.read_u32()? as usize;
                let mut items = Vec::with_capacity(count);
                for _ in 0..count {
                    items.push(self.read_value(vt)?);
                }
                if self.offset != start + size {
                    return Err(err(format!("List2 size mismatch: expected {}, got {}", size, self.offset - start)));
                }
                Ok(BinValue::List2 { value_type: vt, items })
            }

            BinType::Pointer => {
                let name = self.read_fnv1a()?;
                if name.hash == 0 {
                    return Ok(BinValue::Pointer { name, fields: Vec::new() });
                }
                let size = self.read_u32()? as usize;
                let start = self.offset;
                let count = self.read_u16()? as usize;
                let mut fields = Vec::with_capacity(count);
                for _ in 0..count {
                    let key = self.read_fnv1a()?;
                    let ft = BinType::from_u8(self.read_u8()?).ok_or_else(|| err("Unknown field type"))?;
                    let value = self.read_value(ft)?;
                    fields.push(BinField { key, value });
                }
                if self.offset != start + size {
                    return Err(err(format!("Pointer size mismatch: expected {}, got {}", size, self.offset - start)));
                }
                Ok(BinValue::Pointer { name, fields })
            }

            BinType::Embed => {
                let name = self.read_fnv1a()?;
                let size = self.read_u32()? as usize;
                let start = self.offset;
                let count = self.read_u16()? as usize;
                let mut fields = Vec::with_capacity(count);
                for _ in 0..count {
                    let key = self.read_fnv1a()?;
                    let ft = BinType::from_u8(self.read_u8()?).ok_or_else(|| err("Unknown field type"))?;
                    let value = self.read_value(ft)?;
                    fields.push(BinField { key, value });
                }
                if self.offset != start + size {
                    return Err(err(format!("Embed size mismatch: expected {}, got {}", size, self.offset - start)));
                }
                Ok(BinValue::Embed { name, fields })
            }

            BinType::Option => {
                let vt = BinType::from_u8(self.read_u8()?).ok_or_else(|| err("Unknown option value type"))?;
                let count = self.read_u8()?;
                let mut items = Vec::new();
                if count != 0 {
                    items.push(self.read_value(vt)?);
                }
                Ok(BinValue::Option { value_type: vt, items })
            }

            BinType::Map => {
                let kt = BinType::from_u8(self.read_u8()?).ok_or_else(|| err("Unknown map key type"))?;
                let vt = BinType::from_u8(self.read_u8()?).ok_or_else(|| err("Unknown map value type"))?;
                let size = self.read_u32()? as usize;
                let start = self.offset;
                let count = self.read_u32()? as usize;
                let mut items = Vec::with_capacity(count);
                for _ in 0..count {
                    let key = self.read_value(kt)?;
                    let val = self.read_value(vt)?;
                    items.push((key, val));
                }
                if self.offset != start + size {
                    return Err(err(format!("Map size mismatch: expected {}, got {}", size, self.offset - start)));
                }
                Ok(BinValue::Map { key_type: kt, value_type: vt, items })
            }
        }
    }

    fn read_entry(&mut self, entry_key_hash: &mut FNV1a, entry: &mut Vec<BinField>) -> Result<()> {
        let length = self.read_u32()? as usize;
        let start = self.offset;

        *entry_key_hash = self.read_fnv1a()?;
        let count = self.read_u16()? as usize;

        for _ in 0..count {
            let name = self.read_fnv1a()?;
            let ft = BinType::from_u8(self.read_u8()?).ok_or_else(|| err("Unknown field type in entry"))?;
            let value = self.read_value(ft)?;
            entry.push(BinField { key: name, value });
        }

        if self.offset != start + length {
            return Err(err(format!("Entry length mismatch: expected {}, got {}", length, self.offset - start)));
        }
        Ok(())
    }

    fn read_patch(&mut self) -> Result<(BinValue, BinValue)> {
        let patch_key = self.read_fnv1a()?;
        let length = self.read_u32()? as usize;
        let start = self.offset;

        let ft = BinType::from_u8(self.read_u8()?).ok_or_else(|| err("Unknown patch value type"))?;
        let path = self.read_string()?;
        let value = self.read_value(ft)?;

        if self.offset != start + length {
            return Err(err("Patch length mismatch"));
        }

        let patch_embed = BinValue::Embed {
            name: FNV1a::from_string("patch"),
            fields: vec![
                BinField { key: FNV1a::from_string("path"), value: BinValue::String(path) },
                BinField { key: FNV1a::from_string("value"), value },
            ],
        };
        Ok((BinValue::Hash(patch_key), patch_embed))
    }
}

/// Read a binary .bin file and return a Bin structure.
pub fn read(data: &[u8]) -> Result<Bin> {
    if data.len() < 4 {
        return Err(err("File too small"));
    }

    let mut r = BinReader::new(data);
    let mut bin = Bin::new();

    // Magic
    let magic = r.read_bytes(4)?;
    let magic_str = std::str::from_utf8(magic).unwrap_or("");
    let mut is_patch = false;

    if magic_str == "PTCH" {
        let _unk = r.read_u64()?;
        let magic2 = r.read_bytes(4)?;
        let magic2_str = std::str::from_utf8(magic2).unwrap_or("");
        if magic2_str != "PROP" {
            return Err(err(format!("Invalid magic after PTCH: expected PROP, got '{}'", magic2_str)));
        }
        bin.sections.insert("type".to_string(), BinValue::String("PTCH".to_string()));
        is_patch = true;
    } else if magic_str == "PROP" {
        bin.sections.insert("type".to_string(), BinValue::String("PROP".to_string()));
    } else {
        return Err(err(format!("Invalid magic: expected PROP or PTCH, got '{}'", magic_str)));
    }

    // Version
    let version = r.read_u32()?;
    bin.sections.insert("version".to_string(), BinValue::U32(version));

    // Linked (v2+)
    if version >= 2 {
        let count = r.read_u32()? as usize;
        let mut items = Vec::with_capacity(count);
        for _ in 0..count {
            items.push(BinValue::String(r.read_string()?));
        }
        bin.sections.insert("linked".to_string(), BinValue::List {
            value_type: BinType::String,
            items,
        });
    }

    // Entries
    let entry_count = r.read_u32()? as usize;
    let mut entry_name_hashes = Vec::with_capacity(entry_count);
    for _ in 0..entry_count {
        entry_name_hashes.push(r.read_u32()?);
    }

    let mut map_items = Vec::with_capacity(entry_count);
    for hash in &entry_name_hashes {
        let mut entry_key = FNV1a::new(0);
        let mut fields = Vec::new();
        r.read_entry(&mut entry_key, &mut fields)?;

        let key = BinValue::Hash(entry_key);
        let val = BinValue::Embed {
            name: FNV1a::new(*hash),
            fields,
        };
        map_items.push((key, val));
    }
    bin.sections.insert("entries".to_string(), BinValue::Map {
        key_type: BinType::Hash,
        value_type: BinType::Embed,
        items: map_items,
    });

    // Patches
    if is_patch && r.remaining() > 0 {
        let patch_count = r.read_u32()? as usize;
        let mut patch_items = Vec::with_capacity(patch_count);
        for _ in 0..patch_count {
            let (key, val) = r.read_patch()?;
            patch_items.push((key, val));
        }
        bin.sections.insert("patches".to_string(), BinValue::Map {
            key_type: BinType::Hash,
            value_type: BinType::Embed,
            items: patch_items,
        });
    }

    Ok(bin)
}
