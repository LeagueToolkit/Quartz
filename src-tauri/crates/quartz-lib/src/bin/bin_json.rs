//! Manual JSON (de)serialization for `rs_bin`'s `Bin` tree.
//!
//! `ritoshark::bin::BinValue` is not `serde`-derived (it is a flat owned tree
//! whose integer hashes are the source of truth), so we provide an explicit,
//! lossless mapping to and from `serde_json::Value`. The shape is internal to
//! Flint and only needs to be `bin → json → bin` self-consistent; every
//! `BinValue` variant, every `BinType` tag, and entry/field ordering are
//! preserved so the round-trip reconstructs the original document exactly.
//!
//! Each value is encoded as a tagged object `{ "t": <tag>, ... }` where `<tag>`
//! is the `BinType` name. Containers carry their element `BinType` tags so the
//! decoded tree keeps full type information without needing a separate schema.

use indexmap::IndexMap;
use ritoshark::bin::{Bin, BinEntry, BinPatch, BinType, BinValue};
use serde_json::{json, Map, Value};

use crate::error::{Error, Result};

fn err(message: impl Into<String>) -> Error {
    Error::BinConversion {
        message: message.into(),
        path: None,
    }
}

// ---------------------------------------------------------------------------
// BinType <-> string tag
// ---------------------------------------------------------------------------

fn type_tag(ty: BinType) -> &'static str {
    match ty {
        BinType::None => "none",
        BinType::Bool => "bool",
        BinType::I8 => "i8",
        BinType::U8 => "u8",
        BinType::I16 => "i16",
        BinType::U16 => "u16",
        BinType::I32 => "i32",
        BinType::U32 => "u32",
        BinType::I64 => "i64",
        BinType::U64 => "u64",
        BinType::F32 => "f32",
        BinType::Vec2 => "vec2",
        BinType::Vec3 => "vec3",
        BinType::Vec4 => "vec4",
        BinType::Mtx44 => "mtx44",
        BinType::Rgba => "rgba",
        BinType::String => "string",
        BinType::Hash => "hash",
        BinType::File => "file",
        BinType::List => "list",
        BinType::List2 => "list2",
        BinType::Pointer => "pointer",
        BinType::Embed => "embed",
        BinType::Link => "link",
        BinType::Option => "option",
        BinType::Map => "map",
        BinType::Flag => "flag",
    }
}

fn type_from_tag(tag: &str) -> Result<BinType> {
    Ok(match tag {
        "none" => BinType::None,
        "bool" => BinType::Bool,
        "i8" => BinType::I8,
        "u8" => BinType::U8,
        "i16" => BinType::I16,
        "u16" => BinType::U16,
        "i32" => BinType::I32,
        "u32" => BinType::U32,
        "i64" => BinType::I64,
        "u64" => BinType::U64,
        "f32" => BinType::F32,
        "vec2" => BinType::Vec2,
        "vec3" => BinType::Vec3,
        "vec4" => BinType::Vec4,
        "mtx44" => BinType::Mtx44,
        "rgba" => BinType::Rgba,
        "string" => BinType::String,
        "hash" => BinType::Hash,
        "file" => BinType::File,
        "list" => BinType::List,
        "list2" => BinType::List2,
        "pointer" => BinType::Pointer,
        "embed" => BinType::Embed,
        "link" => BinType::Link,
        "option" => BinType::Option,
        "map" => BinType::Map,
        "flag" => BinType::Flag,
        other => return Err(err(format!("unknown BinType tag '{other}'"))),
    })
}

// ---------------------------------------------------------------------------
// Encode: Bin -> JSON
// ---------------------------------------------------------------------------

/// Serialize a `Bin` to a pretty JSON string.
pub fn to_json(bin: &Bin) -> Result<String> {
    let value = encode_bin(bin);
    serde_json::to_string_pretty(&value)
        .map_err(|e| err(format!("JSON serialization failed: {e}")))
}

fn encode_bin(bin: &Bin) -> Value {
    let entries: Vec<Value> = bin.entries.iter().map(encode_entry).collect();
    let patches: Vec<Value> = bin.patches.iter().map(encode_patch).collect();
    json!({
        "is_patch": bin.is_patch,
        "patch_header": bin.patch_header.to_vec(),
        "version": bin.version,
        "linked": bin.linked,
        "entries": entries,
        "patches": patches,
    })
}

fn encode_entry(entry: &BinEntry) -> Value {
    json!({
        "path_hash": entry.path_hash,
        "class_hash": entry.class_hash,
        "fields": encode_fields(&entry.fields),
    })
}

fn encode_patch(patch: &BinPatch) -> Value {
    json!({
        "key_hash": patch.key_hash,
        "path": patch.path,
        "value": encode_value(&patch.value),
    })
}

fn encode_fields(fields: &IndexMap<u32, BinValue>) -> Value {
    // Field order matters, so encode as an array of [hash, value] pairs.
    let arr: Vec<Value> = fields
        .iter()
        .map(|(name, value)| json!([name, encode_value(value)]))
        .collect();
    Value::Array(arr)
}

fn encode_value(value: &BinValue) -> Value {
    let tag = type_tag(value.ty());
    match value {
        BinValue::None => json!({ "t": tag }),
        BinValue::Bool(v) => json!({ "t": tag, "v": v }),
        BinValue::Flag(v) => json!({ "t": tag, "v": v }),
        BinValue::I8(v) => json!({ "t": tag, "v": v }),
        BinValue::U8(v) => json!({ "t": tag, "v": v }),
        BinValue::I16(v) => json!({ "t": tag, "v": v }),
        BinValue::U16(v) => json!({ "t": tag, "v": v }),
        BinValue::I32(v) => json!({ "t": tag, "v": v }),
        BinValue::U32(v) => json!({ "t": tag, "v": v }),
        BinValue::I64(v) => json!({ "t": tag, "v": v }),
        BinValue::U64(v) => json!({ "t": tag, "v": v }),
        BinValue::F32(v) => json!({ "t": tag, "v": v }),
        BinValue::Vec2(a) => json!({ "t": tag, "v": a.to_vec() }),
        BinValue::Vec3(a) => json!({ "t": tag, "v": a.to_vec() }),
        BinValue::Vec4(a) => json!({ "t": tag, "v": a.to_vec() }),
        BinValue::Mtx44(a) => json!({ "t": tag, "v": a.to_vec() }),
        BinValue::Rgba(a) => json!({ "t": tag, "v": a.to_vec() }),
        BinValue::String(s) => json!({ "t": tag, "v": s }),
        BinValue::Hash(v) => json!({ "t": tag, "v": v }),
        BinValue::File(v) => json!({ "t": tag, "v": v }),
        BinValue::Link(v) => json!({ "t": tag, "v": v }),
        BinValue::List { item, items, .. } => json!({
            "t": tag,
            "item": type_tag(*item),
            "items": items.iter().map(encode_value).collect::<Vec<_>>(),
        }),
        BinValue::Map { key, value, entries } => json!({
            "t": tag,
            "key": type_tag(*key),
            "value": type_tag(*value),
            "entries": entries
                .iter()
                .map(|(k, v)| json!([encode_value(k), encode_value(v)]))
                .collect::<Vec<_>>(),
        }),
        BinValue::Pointer { class, fields } => json!({
            "t": tag,
            "class": class,
            "fields": encode_fields(fields),
        }),
        BinValue::Embed { class, fields } => json!({
            "t": tag,
            "class": class,
            "fields": encode_fields(fields),
        }),
        BinValue::Option { item, value } => json!({
            "t": tag,
            "item": type_tag(*item),
            "value": value.as_deref().map(encode_value),
        }),
    }
}

// ---------------------------------------------------------------------------
// Decode: JSON -> Bin
// ---------------------------------------------------------------------------

/// Deserialize a `Bin` from a JSON string produced by [`to_json`].
pub fn from_json(json: &str) -> Result<Bin> {
    let value: Value =
        serde_json::from_str(json).map_err(|e| err(format!("JSON parse error: {e}")))?;
    decode_bin(&value)
}

fn obj<'a>(value: &'a Value, ctx: &str) -> Result<&'a Map<String, Value>> {
    value
        .as_object()
        .ok_or_else(|| err(format!("expected object for {ctx}")))
}

fn field<'a>(map: &'a Map<String, Value>, key: &str) -> Result<&'a Value> {
    map.get(key)
        .ok_or_else(|| err(format!("missing field '{key}'")))
}

fn as_u32(value: &Value, ctx: &str) -> Result<u32> {
    value
        .as_u64()
        .and_then(|n| u32::try_from(n).ok())
        .ok_or_else(|| err(format!("expected u32 for {ctx}")))
}

fn as_str_field(map: &Map<String, Value>, key: &str) -> Result<String> {
    field(map, key)?
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| err(format!("expected string for '{key}'")))
}

fn decode_bin(value: &Value) -> Result<Bin> {
    let map = obj(value, "Bin")?;

    let is_patch = field(map, "is_patch")?
        .as_bool()
        .ok_or_else(|| err("expected bool for 'is_patch'"))?;

    let header_vec = field(map, "patch_header")?
        .as_array()
        .ok_or_else(|| err("expected array for 'patch_header'"))?;
    if header_vec.len() != 8 {
        return Err(err("patch_header must have 8 bytes"));
    }
    let mut patch_header = [0u8; 8];
    for (i, b) in header_vec.iter().enumerate() {
        patch_header[i] = b
            .as_u64()
            .and_then(|n| u8::try_from(n).ok())
            .ok_or_else(|| err("patch_header byte out of range"))?;
    }

    let version = as_u32(field(map, "version")?, "version")?;

    let linked = field(map, "linked")?
        .as_array()
        .ok_or_else(|| err("expected array for 'linked'"))?
        .iter()
        .map(|v| {
            v.as_str()
                .map(str::to_string)
                .ok_or_else(|| err("linked entry must be a string"))
        })
        .collect::<Result<Vec<_>>>()?;

    let entries = field(map, "entries")?
        .as_array()
        .ok_or_else(|| err("expected array for 'entries'"))?
        .iter()
        .map(decode_entry)
        .collect::<Result<Vec<_>>>()?;

    let patches = field(map, "patches")?
        .as_array()
        .ok_or_else(|| err("expected array for 'patches'"))?
        .iter()
        .map(decode_patch)
        .collect::<Result<Vec<_>>>()?;

    Ok(Bin {
        is_patch,
        patch_header,
        version,
        linked,
        entries,
        patches,
    })
}

fn decode_entry(value: &Value) -> Result<BinEntry> {
    let map = obj(value, "BinEntry")?;
    Ok(BinEntry {
        path_hash: as_u32(field(map, "path_hash")?, "path_hash")?,
        class_hash: as_u32(field(map, "class_hash")?, "class_hash")?,
        fields: decode_fields(field(map, "fields")?)?,
    })
}

fn decode_patch(value: &Value) -> Result<BinPatch> {
    let map = obj(value, "BinPatch")?;
    Ok(BinPatch {
        key_hash: as_u32(field(map, "key_hash")?, "key_hash")?,
        path: as_str_field(map, "path")?,
        value: decode_value(field(map, "value")?)?,
    })
}

fn decode_fields(value: &Value) -> Result<IndexMap<u32, BinValue>> {
    let arr = value
        .as_array()
        .ok_or_else(|| err("expected array for fields"))?;
    let mut fields = IndexMap::with_capacity(arr.len());
    for pair in arr {
        let pair = pair
            .as_array()
            .ok_or_else(|| err("field entry must be [hash, value]"))?;
        if pair.len() != 2 {
            return Err(err("field entry must be [hash, value]"));
        }
        let name = as_u32(&pair[0], "field hash")?;
        let val = decode_value(&pair[1])?;
        fields.insert(name, val);
    }
    Ok(fields)
}

fn decode_value(value: &Value) -> Result<BinValue> {
    let map = obj(value, "BinValue")?;
    let tag = field(map, "t")?
        .as_str()
        .ok_or_else(|| err("BinValue missing string tag 't'"))?;
    let ty = type_from_tag(tag)?;

    Ok(match ty {
        BinType::None => BinValue::None,
        BinType::Bool => BinValue::Bool(decode_bool(map)?),
        BinType::Flag => BinValue::Flag(decode_bool(map)?),
        BinType::I8 => BinValue::I8(decode_int(map)?),
        BinType::U8 => BinValue::U8(decode_uint(map)?),
        BinType::I16 => BinValue::I16(decode_int(map)?),
        BinType::U16 => BinValue::U16(decode_uint(map)?),
        BinType::I32 => BinValue::I32(decode_int(map)?),
        BinType::U32 => BinValue::U32(decode_uint(map)?),
        BinType::I64 => BinValue::I64(decode_int(map)?),
        BinType::U64 => BinValue::U64(decode_u64(map)?),
        BinType::F32 => BinValue::F32(decode_f32(map)?),
        BinType::Vec2 => BinValue::Vec2(decode_f32_array::<2>(map)?),
        BinType::Vec3 => BinValue::Vec3(decode_f32_array::<3>(map)?),
        BinType::Vec4 => BinValue::Vec4(decode_f32_array::<4>(map)?),
        BinType::Mtx44 => BinValue::Mtx44(decode_f32_array::<16>(map)?),
        BinType::Rgba => BinValue::Rgba(decode_u8_array::<4>(map)?),
        BinType::String => BinValue::String(as_str_field(map, "v")?),
        BinType::Hash => BinValue::Hash(decode_uint(map)?),
        BinType::File => BinValue::File(decode_u64(map)?),
        BinType::Link => BinValue::Link(decode_uint(map)?),
        BinType::List | BinType::List2 => {
            let item = type_from_tag(
                field(map, "item")?
                    .as_str()
                    .ok_or_else(|| err("list 'item' must be a string tag"))?,
            )?;
            let items = field(map, "items")?
                .as_array()
                .ok_or_else(|| err("list 'items' must be an array"))?
                .iter()
                .map(decode_value)
                .collect::<Result<Vec<_>>>()?;
            BinValue::List {
                is_list2: ty == BinType::List2,
                item,
                items,
            }
        }
        BinType::Map => {
            let key = type_from_tag(
                field(map, "key")?
                    .as_str()
                    .ok_or_else(|| err("map 'key' must be a string tag"))?,
            )?;
            let val_ty = type_from_tag(
                field(map, "value")?
                    .as_str()
                    .ok_or_else(|| err("map 'value' must be a string tag"))?,
            )?;
            let entries = field(map, "entries")?
                .as_array()
                .ok_or_else(|| err("map 'entries' must be an array"))?
                .iter()
                .map(|pair| {
                    let pair = pair
                        .as_array()
                        .ok_or_else(|| err("map entry must be [key, value]"))?;
                    if pair.len() != 2 {
                        return Err(err("map entry must be [key, value]"));
                    }
                    Ok((decode_value(&pair[0])?, decode_value(&pair[1])?))
                })
                .collect::<Result<Vec<_>>>()?;
            BinValue::Map {
                key,
                value: val_ty,
                entries,
            }
        }
        BinType::Pointer => BinValue::Pointer {
            class: as_u32(field(map, "class")?, "pointer class")?,
            fields: decode_fields(field(map, "fields")?)?,
        },
        BinType::Embed => BinValue::Embed {
            class: as_u32(field(map, "class")?, "embed class")?,
            fields: decode_fields(field(map, "fields")?)?,
        },
        BinType::Option => {
            let item = type_from_tag(
                field(map, "item")?
                    .as_str()
                    .ok_or_else(|| err("option 'item' must be a string tag"))?,
            )?;
            let inner = field(map, "value")?;
            let value = if inner.is_null() {
                None
            } else {
                Some(Box::new(decode_value(inner)?))
            };
            BinValue::Option { item, value }
        }
    })
}

fn decode_bool(map: &Map<String, Value>) -> Result<bool> {
    field(map, "v")?
        .as_bool()
        .ok_or_else(|| err("expected bool 'v'"))
}

fn decode_uint<T>(map: &Map<String, Value>) -> Result<T>
where
    T: TryFrom<u64>,
{
    let n = field(map, "v")?
        .as_u64()
        .ok_or_else(|| err("expected unsigned integer 'v'"))?;
    T::try_from(n).map_err(|_| err("unsigned integer 'v' out of range"))
}

fn decode_int<T>(map: &Map<String, Value>) -> Result<T>
where
    T: TryFrom<i64>,
{
    let n = field(map, "v")?
        .as_i64()
        .ok_or_else(|| err("expected signed integer 'v'"))?;
    T::try_from(n).map_err(|_| err("signed integer 'v' out of range"))
}

fn decode_u64(map: &Map<String, Value>) -> Result<u64> {
    field(map, "v")?
        .as_u64()
        .ok_or_else(|| err("expected u64 'v'"))
}

fn decode_f32(map: &Map<String, Value>) -> Result<f32> {
    field(map, "v")?
        .as_f64()
        .map(|n| n as f32)
        .ok_or_else(|| err("expected float 'v'"))
}

fn decode_f32_array<const N: usize>(map: &Map<String, Value>) -> Result<[f32; N]> {
    let arr = field(map, "v")?
        .as_array()
        .ok_or_else(|| err("expected float array 'v'"))?;
    if arr.len() != N {
        return Err(err(format!("expected {N} floats, got {}", arr.len())));
    }
    let mut out = [0.0f32; N];
    for (i, v) in arr.iter().enumerate() {
        out[i] = v.as_f64().map(|n| n as f32).ok_or_else(|| err("non-float in array"))?;
    }
    Ok(out)
}

fn decode_u8_array<const N: usize>(map: &Map<String, Value>) -> Result<[u8; N]> {
    let arr = field(map, "v")?
        .as_array()
        .ok_or_else(|| err("expected u8 array 'v'"))?;
    if arr.len() != N {
        return Err(err(format!("expected {N} bytes, got {}", arr.len())));
    }
    let mut out = [0u8; N];
    for (i, v) in arr.iter().enumerate() {
        out[i] = v
            .as_u64()
            .and_then(|n| u8::try_from(n).ok())
            .ok_or_else(|| err("byte out of range in array"))?;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_bin_roundtrip() {
        let bin = Bin::new();
        let json = to_json(&bin).unwrap();
        let bin2 = from_json(&json).unwrap();
        assert_eq!(bin, bin2);
    }

    #[test]
    fn rich_bin_roundtrip() {
        let mut fields = IndexMap::new();
        fields.insert(0x1111_1111, BinValue::String("hello".to_string()));
        fields.insert(0x2222_2222, BinValue::F32(1.5));
        fields.insert(0x3333_3333, BinValue::Vec3([1.0, 2.0, 3.0]));
        fields.insert(0x4444_4444, BinValue::Rgba([10, 20, 30, 40]));
        fields.insert(0x5555_5555, BinValue::Hash(0xdead_beef));
        fields.insert(0x6666_6666, BinValue::File(0x0123_4567_89ab_cdef));
        fields.insert(
            0x7777_7777,
            BinValue::List {
                is_list2: false,
                item: BinType::String,
                items: vec![
                    BinValue::String("a".to_string()),
                    BinValue::String("b".to_string()),
                ],
            },
        );
        fields.insert(
            0x8888_8888,
            BinValue::Option {
                item: BinType::I32,
                value: Some(Box::new(BinValue::I32(-7))),
            },
        );
        fields.insert(
            0x9999_9999,
            BinValue::Option {
                item: BinType::String,
                value: None,
            },
        );
        fields.insert(
            0xaaaa_aaaa,
            BinValue::Map {
                key: BinType::Hash,
                value: BinType::Embed,
                entries: vec![(
                    BinValue::Hash(1),
                    BinValue::Embed {
                        class: 0xcccc_cccc,
                        fields: {
                            let mut f = IndexMap::new();
                            f.insert(0xbbbb_bbbb, BinValue::Bool(true));
                            f
                        },
                    },
                )],
            },
        );
        fields.insert(
            0xdddd_dddd,
            BinValue::Pointer {
                class: 0xeeee_eeee,
                fields: {
                    let mut f = IndexMap::new();
                    f.insert(0xffff_0000, BinValue::Flag(false));
                    f
                },
            },
        );

        let bin = Bin {
            is_patch: false,
            patch_header: [0u8; 8],
            version: 3,
            linked: vec!["dep/one.bin".to_string(), "dep/two.bin".to_string()],
            entries: vec![BinEntry {
                path_hash: 0x1234_5678,
                class_hash: 0x9abc_def0,
                fields,
            }],
            patches: Vec::new(),
        };

        let json = to_json(&bin).unwrap();
        let bin2 = from_json(&json).unwrap();
        assert_eq!(bin, bin2);
    }

    #[test]
    fn patch_bin_roundtrip() {
        let bin = Bin {
            is_patch: true,
            patch_header: [1, 0, 0, 0, 0, 0, 0, 0],
            version: 3,
            linked: Vec::new(),
            entries: Vec::new(),
            patches: vec![BinPatch {
                key_hash: 0x4242_4242,
                path: "a.b.c".to_string(),
                value: BinValue::U32(99),
            }],
        };
        let json = to_json(&bin).unwrap();
        let bin2 = from_json(&json).unwrap();
        assert_eq!(bin, bin2);
    }
}
