//! Binary writer for INIBIN v2 files.
//!
//! Serializes an [`InibinFile`] back to the v2 binary format. V1 (old format)
//! sets are skipped since v1 is a legacy read-only format.

use std::io::Write;

use byteorder::{WriteBytesExt, LE};

use crate::error::InibinError;
use crate::types::{InibinFile, InibinFlags, InibinSet, InibinValue};

/// Write an [`InibinFile`] to binary v2 format.
///
/// Sets with [`InibinFlags::OldFormat`] are skipped — v1 is read-only.
/// Returns [`InibinError::V1WriteNotSupported`] if all sets are old format.
pub fn write<W: Write>(w: &mut W, file: &InibinFile) -> Result<(), InibinError> {
    // Check if everything is old format (nothing writable)
    let has_v2 = file.sets().any(|s| s.flags() != InibinFlags::OldFormat);
    if !has_v2 && !file.is_empty() {
        return Err(InibinError::V1WriteNotSupported);
    }

    // Compute flags bitmask
    let mut flags: u16 = 0;
    for set in file.sets() {
        if set.is_empty() || set.flags() == InibinFlags::OldFormat {
            continue;
        }
        let bit: u8 = set.flags().into();
        if (bit as usize) < 14 {
            flags |= 1 << bit;
        }
    }

    // Build string pool first (needed for stringsLength header)
    let string_pool = file
        .set(InibinFlags::StringList)
        .filter(|s| !s.is_empty())
        .map(build_string_pool)
        .unwrap_or_default();
    let strings_length = string_pool.data.len() as u16;

    // Version byte
    w.write_u8(2)?;
    // stringsLength (u16 LE)
    w.write_u16::<LE>(strings_length)?;
    // flags (u16 LE)
    w.write_u16::<LE>(flags)?;

    // Write each block in flag-bit order
    for bit in 0u8..14 {
        if flags & (1 << bit) == 0 {
            continue;
        }
        let inibin_flags = InibinFlags::try_from(bit)?;
        let set = file.set(inibin_flags).unwrap();
        match bit {
            5 => write_bool_block(w, set)?,
            12 => write_string_block(w, set, &string_pool)?,
            _ => write_number_block(w, set, inibin_flags)?,
        }
    }

    Ok(())
}

// ── Bool block ──────────────────────────────────────────────────────────────

fn write_bool_block<W: Write>(w: &mut W, set: &InibinSet) -> Result<(), InibinError> {
    let num = set.len();
    w.write_u16::<LE>(num as u16)?;

    // Hashes
    for (&hash, _) in set.iter() {
        w.write_u32::<LE>(hash)?;
    }

    // Packed booleans
    let bytes_count = num.div_ceil(8);
    let mut packed = vec![0u8; bytes_count];
    for (j, (_, val)) in set.iter().enumerate() {
        let bit = match val {
            InibinValue::Bool(b) => *b,
            _ => false,
        };
        if bit {
            packed[j / 8] |= 1 << (j % 8);
        }
    }
    w.write_all(&packed)?;
    Ok(())
}

// ── Number block ────────────────────────────────────────────────────────────

fn write_number_block<W: Write>(
    w: &mut W,
    set: &InibinSet,
    flags: InibinFlags,
) -> Result<(), InibinError> {
    w.write_u16::<LE>(set.len() as u16)?;

    // Hashes
    for (&hash, _) in set.iter() {
        w.write_u32::<LE>(hash)?;
    }

    // Values
    for (_, val) in set.iter() {
        write_value(w, val, flags)?;
    }
    Ok(())
}

fn write_value<W: Write>(
    w: &mut W,
    val: &InibinValue,
    flags: InibinFlags,
) -> Result<(), InibinError> {
    match flags {
        InibinFlags::Int32List | InibinFlags::Int32LongList => {
            let v = match val {
                InibinValue::I32(v) => *v,
                _ => 0,
            };
            w.write_i32::<LE>(v)?;
        }
        InibinFlags::Float32List => {
            let v = match val {
                InibinValue::F32(v) => *v,
                _ => 0.0,
            };
            w.write_f32::<LE>(v)?;
        }
        InibinFlags::FixedPointFloatList => {
            let v = match val {
                InibinValue::FixedPointFloat(v) => *v,
                _ => 0.0,
            };
            w.write_u8((v / 0.1).round().clamp(0.0, 255.0) as u8)?;
        }
        InibinFlags::Int16List => {
            let v = match val {
                InibinValue::I16(v) => *v,
                _ => 0,
            };
            w.write_i16::<LE>(v)?;
        }
        InibinFlags::Int8List => {
            let v = match val {
                InibinValue::U8(v) => *v,
                _ => 0,
            };
            w.write_u8(v)?;
        }
        InibinFlags::FixedPointFloatListVec3 => {
            let [a, b, c] = match val {
                InibinValue::FixedPointVec3(v) => *v,
                _ => [0.0; 3],
            };
            w.write_u8((a / 0.1).round().clamp(0.0, 255.0) as u8)?;
            w.write_u8((b / 0.1).round().clamp(0.0, 255.0) as u8)?;
            w.write_u8((c / 0.1).round().clamp(0.0, 255.0) as u8)?;
        }
        InibinFlags::Float32ListVec3 => {
            let [a, b, c] = match val {
                InibinValue::F32Vec3(v) => *v,
                _ => [0.0; 3],
            };
            w.write_f32::<LE>(a)?;
            w.write_f32::<LE>(b)?;
            w.write_f32::<LE>(c)?;
        }
        InibinFlags::FixedPointFloatListVec2 => {
            let [a, b] = match val {
                InibinValue::FixedPointVec2(v) => *v,
                _ => [0.0; 2],
            };
            w.write_u8((a / 0.1).round().clamp(0.0, 255.0) as u8)?;
            w.write_u8((b / 0.1).round().clamp(0.0, 255.0) as u8)?;
        }
        InibinFlags::Float32ListVec2 => {
            let [a, b] = match val {
                InibinValue::F32Vec2(v) => *v,
                _ => [0.0; 2],
            };
            w.write_f32::<LE>(a)?;
            w.write_f32::<LE>(b)?;
        }
        InibinFlags::FixedPointFloatListVec4 => {
            let [a, b, c, d] = match val {
                InibinValue::FixedPointVec4(v) => *v,
                _ => [0.0; 4],
            };
            w.write_u8((a / 0.1).round().clamp(0.0, 255.0) as u8)?;
            w.write_u8((b / 0.1).round().clamp(0.0, 255.0) as u8)?;
            w.write_u8((c / 0.1).round().clamp(0.0, 255.0) as u8)?;
            w.write_u8((d / 0.1).round().clamp(0.0, 255.0) as u8)?;
        }
        InibinFlags::Float32ListVec4 => {
            let [a, b, c, d] = match val {
                InibinValue::F32Vec4(v) => *v,
                _ => [0.0; 4],
            };
            w.write_f32::<LE>(a)?;
            w.write_f32::<LE>(b)?;
            w.write_f32::<LE>(c)?;
            w.write_f32::<LE>(d)?;
        }
        _ => {}
    }
    Ok(())
}

// ── String block ────────────────────────────────────────────────────────────

#[derive(Default)]
struct StringPool {
    offsets: Vec<u16>,
    data: Vec<u8>,
}

fn build_string_pool(set: &InibinSet) -> StringPool {
    let mut offsets = Vec::with_capacity(set.len());
    let mut data = Vec::new();

    for (_, val) in set.iter() {
        offsets.push(data.len() as u16);
        let s = match val {
            InibinValue::String(s) => s.as_bytes(),
            _ => b"",
        };
        data.extend_from_slice(s);
        data.push(0); // null terminator
    }

    StringPool { offsets, data }
}

fn write_string_block<W: Write>(
    w: &mut W,
    set: &InibinSet,
    pool: &StringPool,
) -> Result<(), InibinError> {
    w.write_u16::<LE>(set.len() as u16)?;

    // Hashes
    for (&hash, _) in set.iter() {
        w.write_u32::<LE>(hash)?;
    }

    // Offsets (u16 each)
    for &offset in &pool.offsets {
        w.write_u16::<LE>(offset)?;
    }

    // String data
    w.write_all(&pool.data)?;
    Ok(())
}
