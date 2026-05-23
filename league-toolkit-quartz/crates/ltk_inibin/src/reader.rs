//! Binary reader for INIBIN v1 and v2 files.

use std::io::{Cursor, Read};

use byteorder::{ReadBytesExt, LE};
use indexmap::IndexMap;

use crate::error::InibinError;
use crate::types::{InibinFile, InibinFlags, InibinSet, InibinValue};

// ── V1 reader ───────────────────────────────────────────────────────────

fn sanitize_str(s: &str) -> InibinValue {
    if s == "true" {
        return InibinValue::Bool(true);
    }
    if s == "false" {
        return InibinValue::Bool(false);
    }

    if let Ok(v) = s.parse::<i32>() {
        if !s.contains('.') && !s.contains('e') && !s.contains('E') {
            return InibinValue::I32(v);
        }
    }

    if let Ok(v) = s.parse::<f32>() {
        return InibinValue::F32(v);
    }

    InibinValue::String(s.to_string())
}

fn read_v1<R: Read>(r: &mut R) -> Result<InibinFile, InibinError> {
    let mut skip_buf = [0u8; 3];
    r.read_exact(&mut skip_buf)?;
    let entry_count = r.read_u32::<LE>()? as usize;
    let data_count = r.read_u32::<LE>()? as usize;

    let mut offsets = Vec::with_capacity(entry_count);
    for _ in 0..entry_count {
        let h = r.read_u32::<LE>()?;
        let o = r.read_u32::<LE>()? as usize;
        offsets.push((h, o));
    }

    let mut data = vec![0u8; data_count];
    r.read_exact(&mut data)?;

    let mut properties = IndexMap::new();
    for &(hash, offset) in &offsets {
        let mut o = offset;
        let mut s = String::new();
        while o < data.len() && data[o] != 0 {
            s.push(data[o] as char);
            o += 1;
        }
        properties.insert(hash, sanitize_str(&s));
    }

    let set = InibinSet::with_properties(InibinFlags::OldFormat, properties);
    let mut file = InibinFile::new();
    file.set_version(1);
    file.insert_set(set);
    Ok(file)
}

// ── V2 readers ──────────────────────────────────────────────────────────

fn read_bools<R: Read>(r: &mut R) -> Result<InibinSet, InibinError> {
    let num = r.read_u16::<LE>()? as usize;
    let mut keys = Vec::with_capacity(num);
    for _ in 0..num {
        keys.push(r.read_u32::<LE>()?);
    }
    let bytes_count = num.div_ceil(8);
    let mut bools = vec![0u8; bytes_count];
    r.read_exact(&mut bools)?;

    let mut properties = IndexMap::with_capacity(num);
    for (j, &key) in keys.iter().enumerate() {
        let bit = (bools[j / 8] >> (j % 8)) & 1;
        properties.insert(key, InibinValue::Bool(bit != 0));
    }
    Ok(InibinSet::with_properties(InibinFlags::BitList, properties))
}

fn read_numbers<R: Read>(r: &mut R, flags: InibinFlags) -> Result<InibinSet, InibinError> {
    let num = r.read_u16::<LE>()? as usize;
    let mut keys = Vec::with_capacity(num);
    for _ in 0..num {
        keys.push(r.read_u32::<LE>()?);
    }

    let mut properties = IndexMap::with_capacity(num);
    for &key in &keys {
        let value = match flags {
            InibinFlags::Int32List | InibinFlags::Int32LongList => {
                InibinValue::I32(r.read_i32::<LE>()?)
            }
            InibinFlags::Float32List => InibinValue::F32(r.read_f32::<LE>()?),
            InibinFlags::FixedPointFloatList => {
                InibinValue::FixedPointFloat(r.read_u8()? as f64 * 0.1)
            }
            InibinFlags::Int16List => InibinValue::I16(r.read_i16::<LE>()?),
            InibinFlags::Int8List => InibinValue::U8(r.read_u8()?),
            InibinFlags::FixedPointFloatListVec3 => {
                let a = r.read_u8()? as f64 * 0.1;
                let b = r.read_u8()? as f64 * 0.1;
                let c = r.read_u8()? as f64 * 0.1;
                InibinValue::FixedPointVec3([a, b, c])
            }
            InibinFlags::Float32ListVec3 => {
                let a = r.read_f32::<LE>()?;
                let b = r.read_f32::<LE>()?;
                let c = r.read_f32::<LE>()?;
                InibinValue::F32Vec3([a, b, c])
            }
            InibinFlags::FixedPointFloatListVec2 => {
                let a = r.read_u8()? as f64 * 0.1;
                let b = r.read_u8()? as f64 * 0.1;
                InibinValue::FixedPointVec2([a, b])
            }
            InibinFlags::Float32ListVec2 => {
                let a = r.read_f32::<LE>()?;
                let b = r.read_f32::<LE>()?;
                InibinValue::F32Vec2([a, b])
            }
            InibinFlags::FixedPointFloatListVec4 => {
                let a = r.read_u8()? as f64 * 0.1;
                let b = r.read_u8()? as f64 * 0.1;
                let c = r.read_u8()? as f64 * 0.1;
                let d = r.read_u8()? as f64 * 0.1;
                InibinValue::FixedPointVec4([a, b, c, d])
            }
            InibinFlags::Float32ListVec4 => {
                let a = r.read_f32::<LE>()?;
                let b = r.read_f32::<LE>()?;
                let c = r.read_f32::<LE>()?;
                let d = r.read_f32::<LE>()?;
                InibinValue::F32Vec4([a, b, c, d])
            }
            _ => unreachable!(),
        };
        properties.insert(key, value);
    }
    Ok(InibinSet::with_properties(flags, properties))
}

fn read_strings<R: Read>(r: &mut R, strings_length: usize) -> Result<InibinSet, InibinError> {
    let num = r.read_u16::<LE>()? as usize;
    let mut keys = Vec::with_capacity(num);
    for _ in 0..num {
        keys.push(r.read_u32::<LE>()?);
    }
    let mut offsets = Vec::with_capacity(num);
    for _ in 0..num {
        offsets.push(r.read_u16::<LE>()? as usize);
    }
    let mut data = vec![0u8; strings_length];
    r.read_exact(&mut data)?;

    let mut properties = IndexMap::with_capacity(num);
    for i in 0..num {
        let mut o = offsets[i];
        let mut s = String::new();
        while o < data.len() && data[o] != 0 {
            s.push(data[o] as char);
            o += 1;
        }
        properties.insert(keys[i], InibinValue::String(s));
    }
    Ok(InibinSet::with_properties(
        InibinFlags::StringList,
        properties,
    ))
}

fn read_v2<R: Read>(r: &mut R) -> Result<InibinFile, InibinError> {
    let strings_length = r.read_u16::<LE>()? as usize;
    let mut flags = r.read_u16::<LE>()?;
    if flags == 0 {
        flags = r.read_u16::<LE>()?;
    }

    let mut file = InibinFile::new();

    for i in 0u8..14 {
        if flags & (1 << i) == 0 {
            continue;
        }
        let set = match i {
            5 => read_bools(r)?,
            12 => read_strings(r, strings_length)?,
            _ => {
                let inibin_flags = InibinFlags::try_from(i)?;
                read_numbers(r, inibin_flags)?
            }
        };
        file.insert_set(set);
    }

    Ok(file)
}

/// Read an inibin binary from a byte slice.
pub fn from_slice(data: &[u8]) -> Result<InibinFile, InibinError> {
    if data.is_empty() {
        return Err(InibinError::Empty);
    }

    let mut cursor = Cursor::new(data);
    let version = cursor.read_u8()?;

    match version {
        2 => read_v2(&mut cursor),
        1 => read_v1(&mut cursor),
        _ => Err(InibinError::UnknownVersion(version)),
    }
}
