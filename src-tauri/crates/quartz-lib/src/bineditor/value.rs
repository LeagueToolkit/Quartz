//! `JsonBinValue` — the tagged JSON encoding of `ritoshark::bin::BinValue`
//! that crosses IPC, plus both conversion directions. Field keys and class
//! names may be readable names or `"0x<hex>"`; names hash via FNV1a-32
//! lowercase (`ritoshark::hash::fnv1a`, the bin convention) except file paths,
//! which hash via lowercase XXH64 like ritobin. i64/u64 travel as strings to
//! avoid JS precision loss. Map/Mtx44/Link project as `unsupported` and are
//! rejected on write.

use crate::error::{Error, Result};
use indexmap::IndexMap;
use ritoshark::bin::{BinType, BinValue};
use ritoshark::hash::{fnv1a, xxh64, HashMapper};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "lowercase")]
pub enum JsonBinValue {
    None,
    Bool {
        v: bool,
    },
    I8 {
        v: f64,
    },
    U8 {
        v: f64,
    },
    I16 {
        v: f64,
    },
    U16 {
        v: f64,
    },
    I32 {
        v: f64,
    },
    U32 {
        v: f64,
    },
    I64 {
        v: String,
    },
    U64 {
        v: String,
    },
    F32 {
        v: f64,
    },
    Vec2 {
        v: [f32; 2],
    },
    Vec3 {
        v: [f32; 3],
    },
    Vec4 {
        v: [f32; 4],
    },
    Rgba {
        v: [f64; 4],
    },
    String {
        v: String,
    },
    Hash {
        v: String,
    },
    File {
        v: String,
    },
    List {
        item: String,
        items: Vec<JsonBinValue>,
    },
    Pointer {
        class: String,
        fields: IndexMap<String, JsonBinValue>,
    },
    Embed {
        class: String,
        fields: IndexMap<String, JsonBinValue>,
    },
    Option {
        inner: String,
        #[serde(default)]
        value: std::option::Option<Box<JsonBinValue>>,
    },
    Flag {
        v: bool,
    },
    Unsupported {
        desc: String,
    },
}

// ── BinType <-> tag strings ──────────────────────────────────────────────────

pub fn bintype_tag(t: BinType) -> &'static str {
    match t {
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

pub fn bintype_from_tag(s: &str) -> std::option::Option<BinType> {
    Some(match s {
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
        _ => return None,
    })
}

// ── Name / hash resolution ───────────────────────────────────────────────────

/// A field key, class name, or hash value: `"0x<hex8>"` parses as hex,
/// anything else hashes with FNV1a-32 lowercase.
pub fn hash32_of(s: &str) -> Result<u32> {
    let s = s.trim();
    if let Some(hex) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
        u32::from_str_radix(hex, 16)
            .map_err(|_| Error::InvalidInput(format!("Invalid 32-bit hex hash: '{}'", s)))
    } else if s.is_empty() {
        Err(Error::InvalidInput("Empty name/hash".to_string()))
    } else {
        Ok(fnv1a(s))
    }
}

/// A file value: `"0x<hex16>"` parses as hex, anything else hashes with
/// lowercase XXH64 (the ritobin file-path convention).
pub fn hash64_of(s: &str) -> Result<u64> {
    let s = s.trim();
    if let Some(hex) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
        u64::from_str_radix(hex, 16)
            .map_err(|_| Error::InvalidInput(format!("Invalid 64-bit hex hash: '{}'", s)))
    } else if s.is_empty() {
        Err(Error::InvalidInput("Empty file path/hash".to_string()))
    } else {
        Ok(xxh64(s))
    }
}

pub fn name32(h: u32, m: &HashMapper) -> String {
    m.get(h as u64)
        .map(str::to_string)
        .unwrap_or_else(|| format!("0x{:08x}", h))
}

pub fn name64(h: u64, m: &HashMapper) -> String {
    m.get(h)
        .map(str::to_string)
        .unwrap_or_else(|| format!("0x{:016x}", h))
}

// ── JSON -> BinValue ─────────────────────────────────────────────────────────

fn int_of(v: f64, lo: i64, hi: i64, what: &str) -> Result<i64> {
    if !v.is_finite() || v.fract() != 0.0 {
        return Err(Error::InvalidInput(format!(
            "{} value {} is not an integer",
            what, v
        )));
    }
    if v < lo as f64 || v > hi as f64 {
        return Err(Error::InvalidInput(format!(
            "{} value {} out of range",
            what, v
        )));
    }
    Ok(v as i64)
}

fn fields_of(fields: &IndexMap<String, JsonBinValue>) -> Result<IndexMap<u32, BinValue>> {
    let mut out = IndexMap::with_capacity(fields.len());
    for (key, val) in fields {
        out.insert(hash32_of(key)?, json_to_bin(val)?);
    }
    Ok(out)
}

pub fn json_to_bin(j: &JsonBinValue) -> Result<BinValue> {
    Ok(match j {
        JsonBinValue::None => BinValue::None,
        JsonBinValue::Bool { v } => BinValue::Bool(*v),
        JsonBinValue::I8 { v } => {
            BinValue::I8(int_of(*v, i8::MIN as i64, i8::MAX as i64, "i8")? as i8)
        }
        JsonBinValue::U8 { v } => BinValue::U8(int_of(*v, 0, u8::MAX as i64, "u8")? as u8),
        JsonBinValue::I16 { v } => {
            BinValue::I16(int_of(*v, i16::MIN as i64, i16::MAX as i64, "i16")? as i16)
        }
        JsonBinValue::U16 { v } => BinValue::U16(int_of(*v, 0, u16::MAX as i64, "u16")? as u16),
        JsonBinValue::I32 { v } => {
            BinValue::I32(int_of(*v, i32::MIN as i64, i32::MAX as i64, "i32")? as i32)
        }
        JsonBinValue::U32 { v } => BinValue::U32(int_of(*v, 0, u32::MAX as i64, "u32")? as u32),
        JsonBinValue::I64 { v } => BinValue::I64(
            v.trim()
                .parse::<i64>()
                .map_err(|_| Error::InvalidInput(format!("Invalid i64 string: '{}'", v)))?,
        ),
        JsonBinValue::U64 { v } => BinValue::U64(
            v.trim()
                .parse::<u64>()
                .map_err(|_| Error::InvalidInput(format!("Invalid u64 string: '{}'", v)))?,
        ),
        JsonBinValue::F32 { v } => BinValue::F32(*v as f32),
        JsonBinValue::Vec2 { v } => BinValue::Vec2(*v),
        JsonBinValue::Vec3 { v } => BinValue::Vec3(*v),
        JsonBinValue::Vec4 { v } => BinValue::Vec4(*v),
        JsonBinValue::Rgba { v } => BinValue::Rgba([
            int_of(v[0], 0, 255, "rgba")? as u8,
            int_of(v[1], 0, 255, "rgba")? as u8,
            int_of(v[2], 0, 255, "rgba")? as u8,
            int_of(v[3], 0, 255, "rgba")? as u8,
        ]),
        JsonBinValue::String { v } => BinValue::String(v.clone()),
        JsonBinValue::Hash { v } => BinValue::Hash(hash32_of(v)?),
        JsonBinValue::File { v } => BinValue::File(hash64_of(v)?),
        JsonBinValue::List { item, items } => {
            let ty = bintype_from_tag(item).ok_or_else(|| {
                Error::InvalidInput(format!("Unknown list item type: '{}'", item))
            })?;
            if ty.is_container() {
                return Err(Error::InvalidInput(format!(
                    "List items cannot be containers ('{}')",
                    item
                )));
            }
            let mut vals = Vec::with_capacity(items.len());
            for it in items {
                let v = json_to_bin(it)?;
                if v.ty() != ty {
                    return Err(Error::InvalidInput(format!(
                        "List item type mismatch: list holds {}, item is {}",
                        bintype_tag(ty),
                        bintype_tag(v.ty())
                    )));
                }
                vals.push(v);
            }
            BinValue::List {
                is_list2: false,
                item: ty,
                items: vals,
            }
        }
        JsonBinValue::Pointer { class, fields } => BinValue::Pointer {
            class: hash32_of(class)?,
            fields: fields_of(fields)?,
        },
        JsonBinValue::Embed { class, fields } => BinValue::Embed {
            class: hash32_of(class)?,
            fields: fields_of(fields)?,
        },
        JsonBinValue::Option { inner, value } => {
            let ty = bintype_from_tag(inner).ok_or_else(|| {
                Error::InvalidInput(format!("Unknown option inner type: '{}'", inner))
            })?;
            if ty.is_container() {
                return Err(Error::InvalidInput(format!(
                    "Option inner type cannot be a container ('{}')",
                    inner
                )));
            }
            let val = match value {
                Some(b) => {
                    let v = json_to_bin(b)?;
                    if v.ty() != ty {
                        return Err(Error::InvalidInput(format!(
                            "Option value type mismatch: option holds {}, value is {}",
                            bintype_tag(ty),
                            bintype_tag(v.ty())
                        )));
                    }
                    Some(Box::new(v))
                }
                None => None,
            };
            BinValue::Option {
                item: ty,
                value: val,
            }
        }
        JsonBinValue::Flag { v } => BinValue::Flag(*v),
        JsonBinValue::Unsupported { desc } => {
            return Err(Error::InvalidInput(format!(
                "Unsupported value kind '{}' (map/mtx44/link) is read-only",
                desc
            )));
        }
    })
}

// ── BinValue -> JSON ─────────────────────────────────────────────────────────

pub fn bin_to_json(v: &BinValue, m: &HashMapper) -> JsonBinValue {
    match v {
        BinValue::None => JsonBinValue::None,
        BinValue::Bool(b) => JsonBinValue::Bool { v: *b },
        BinValue::I8(n) => JsonBinValue::I8 { v: *n as f64 },
        BinValue::U8(n) => JsonBinValue::U8 { v: *n as f64 },
        BinValue::I16(n) => JsonBinValue::I16 { v: *n as f64 },
        BinValue::U16(n) => JsonBinValue::U16 { v: *n as f64 },
        BinValue::I32(n) => JsonBinValue::I32 { v: *n as f64 },
        BinValue::U32(n) => JsonBinValue::U32 { v: *n as f64 },
        BinValue::I64(n) => JsonBinValue::I64 { v: n.to_string() },
        BinValue::U64(n) => JsonBinValue::U64 { v: n.to_string() },
        BinValue::F32(n) => JsonBinValue::F32 { v: *n as f64 },
        BinValue::Vec2(a) => JsonBinValue::Vec2 { v: *a },
        BinValue::Vec3(a) => JsonBinValue::Vec3 { v: *a },
        BinValue::Vec4(a) => JsonBinValue::Vec4 { v: *a },
        BinValue::Rgba(a) => JsonBinValue::Rgba {
            v: [a[0] as f64, a[1] as f64, a[2] as f64, a[3] as f64],
        },
        BinValue::String(s) => JsonBinValue::String { v: s.clone() },
        BinValue::Hash(h) => JsonBinValue::Hash { v: name32(*h, m) },
        BinValue::File(h) => JsonBinValue::File { v: name64(*h, m) },
        // List2 flavor is dropped here by design; `apply` re-instates the
        // original is_list2 from the node being overwritten.
        BinValue::List { item, items, .. } => JsonBinValue::List {
            item: bintype_tag(*item).to_string(),
            items: items.iter().map(|it| bin_to_json(it, m)).collect(),
        },
        BinValue::Pointer { class, fields } => JsonBinValue::Pointer {
            class: name32(*class, m),
            fields: fields
                .iter()
                .map(|(k, v)| (name32(*k, m), bin_to_json(v, m)))
                .collect(),
        },
        BinValue::Embed { class, fields } => JsonBinValue::Embed {
            class: name32(*class, m),
            fields: fields
                .iter()
                .map(|(k, v)| (name32(*k, m), bin_to_json(v, m)))
                .collect(),
        },
        BinValue::Option { item, value } => JsonBinValue::Option {
            inner: bintype_tag(*item).to_string(),
            value: value.as_ref().map(|b| Box::new(bin_to_json(b, m))),
        },
        BinValue::Flag(b) => JsonBinValue::Flag { v: *b },
        BinValue::Map { .. } => JsonBinValue::Unsupported {
            desc: "map".to_string(),
        },
        BinValue::Mtx44(_) => JsonBinValue::Unsupported {
            desc: "mtx44".to_string(),
        },
        BinValue::Link(_) => JsonBinValue::Unsupported {
            desc: "link".to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_names_and_hex_parse() {
        assert_eq!(hash32_of("0x1234abcd").unwrap(), 0x1234abcd);
        assert_eq!(hash32_of("blendMode").unwrap(), fnv1a("blendmode"));
        assert_eq!(hash64_of("0x00000000deadbeef").unwrap(), 0xdeadbeef);
        assert_eq!(
            hash64_of("ASSETS/Foo.dds").unwrap(),
            xxh64("assets/foo.dds")
        );
        assert!(hash32_of("0xzz").is_err());
    }

    #[test]
    fn json_roundtrip_scalars() {
        let j: JsonBinValue = serde_json::from_str(r#"{ "t": "f32", "v": 1.5 }"#).unwrap();
        assert!(matches!(json_to_bin(&j).unwrap(), BinValue::F32(v) if v == 1.5));

        let j: JsonBinValue = serde_json::from_str(r#"{ "t": "u64", "v": "123" }"#).unwrap();
        assert!(matches!(json_to_bin(&j).unwrap(), BinValue::U64(123)));

        let j: JsonBinValue = serde_json::from_str(r#"{ "t": "u8", "v": 300 }"#).unwrap();
        assert!(json_to_bin(&j).is_err());

        let j: JsonBinValue = serde_json::from_str(r#"{ "t": "vec3", "v": [1, 2, 3.5] }"#).unwrap();
        assert!(matches!(json_to_bin(&j).unwrap(), BinValue::Vec3(a) if a == [1.0, 2.0, 3.5]));

        let j: JsonBinValue = serde_json::from_str(r#"{ "t": "none" }"#).unwrap();
        assert!(matches!(json_to_bin(&j).unwrap(), BinValue::None));
    }

    #[test]
    fn json_structs_and_lists() {
        let j: JsonBinValue = serde_json::from_str(
            r#"{ "t": "pointer", "class": "VfxShape", "fields": { "radius": { "t": "f32", "v": 2 } } }"#,
        )
        .unwrap();
        let v = json_to_bin(&j).unwrap();
        match v {
            BinValue::Pointer { class, fields } => {
                assert_eq!(class, fnv1a("VfxShape"));
                assert!(
                    matches!(fields.get(&fnv1a("radius")), Some(BinValue::F32(r)) if *r == 2.0)
                );
            }
            other => panic!("expected pointer, got {:?}", other),
        }

        let j: JsonBinValue = serde_json::from_str(
            r#"{ "t": "list", "item": "f32", "items": [{ "t": "f32", "v": 1 }, { "t": "u8", "v": 2 }] }"#,
        )
        .unwrap();
        assert!(json_to_bin(&j).is_err(), "item tag mismatch must error");

        let j: JsonBinValue = serde_json::from_str(
            r#"{ "t": "option", "inner": "f32", "value": { "t": "f32", "v": 3 } }"#,
        )
        .unwrap();
        assert!(matches!(
            json_to_bin(&j).unwrap(),
            BinValue::Option {
                item: BinType::F32,
                value: Some(_)
            }
        ));

        let j: JsonBinValue =
            serde_json::from_str(r#"{ "t": "option", "inner": "f32", "value": null }"#).unwrap();
        assert!(matches!(
            json_to_bin(&j).unwrap(),
            BinValue::Option { value: None, .. }
        ));
    }

    #[test]
    fn unsupported_rejected_on_write() {
        let j: JsonBinValue =
            serde_json::from_str(r#"{ "t": "unsupported", "desc": "map" }"#).unwrap();
        assert!(json_to_bin(&j).is_err());
    }

    #[test]
    fn bin_to_json_projects_unsupported() {
        let m = HashMapper::new();
        assert!(matches!(
            bin_to_json(&BinValue::Mtx44([0.0; 16]), &m),
            JsonBinValue::Unsupported { .. }
        ));
        assert!(matches!(
            bin_to_json(&BinValue::Link(1), &m),
            JsonBinValue::Unsupported { .. }
        ));
    }
}
