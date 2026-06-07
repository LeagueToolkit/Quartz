use indexmap::IndexMap;

/// BinType enum matching C# byte values exactly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum BinType {
    None = 0,
    Bool = 1,
    I8 = 2,
    U8 = 3,
    I16 = 4,
    U16 = 5,
    I32 = 6,
    U32 = 7,
    I64 = 8,
    U64 = 9,
    F32 = 10,
    Vec2 = 11,
    Vec3 = 12,
    Vec4 = 13,
    Mtx44 = 14,
    Rgba = 15,
    String = 16,
    Hash = 17,
    File = 18,
    List = 0x80,
    List2 = 0x81,
    Pointer = 0x82,
    Embed = 0x83,
    Link = 0x84,
    Option = 0x85,
    Map = 0x86,
    Flag = 0x87,
}

impl BinType {
    pub fn from_u8(v: u8) -> Option<BinType> {
        match v {
            0 => Some(BinType::None),
            1 => Some(BinType::Bool),
            2 => Some(BinType::I8),
            3 => Some(BinType::U8),
            4 => Some(BinType::I16),
            5 => Some(BinType::U16),
            6 => Some(BinType::I32),
            7 => Some(BinType::U32),
            8 => Some(BinType::I64),
            9 => Some(BinType::U64),
            10 => Some(BinType::F32),
            11 => Some(BinType::Vec2),
            12 => Some(BinType::Vec3),
            13 => Some(BinType::Vec4),
            14 => Some(BinType::Mtx44),
            15 => Some(BinType::Rgba),
            16 => Some(BinType::String),
            17 => Some(BinType::Hash),
            18 => Some(BinType::File),
            0x80 => Some(BinType::List),
            0x81 => Some(BinType::List2),
            0x82 => Some(BinType::Pointer),
            0x83 => Some(BinType::Embed),
            0x84 => Some(BinType::Link),
            0x85 => Some(BinType::Option),
            0x86 => Some(BinType::Map),
            0x87 => Some(BinType::Flag),
            _ => None,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
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

    pub fn from_name(name: &str) -> Option<BinType> {
        match name {
            "none" => Some(BinType::None),
            "bool" => Some(BinType::Bool),
            "i8" => Some(BinType::I8),
            "u8" => Some(BinType::U8),
            "i16" => Some(BinType::I16),
            "u16" => Some(BinType::U16),
            "i32" => Some(BinType::I32),
            "u32" => Some(BinType::U32),
            "i64" => Some(BinType::I64),
            "u64" => Some(BinType::U64),
            "f32" => Some(BinType::F32),
            "vec2" => Some(BinType::Vec2),
            "vec3" => Some(BinType::Vec3),
            "vec4" => Some(BinType::Vec4),
            "mtx44" => Some(BinType::Mtx44),
            "rgba" => Some(BinType::Rgba),
            "string" => Some(BinType::String),
            "hash" => Some(BinType::Hash),
            "file" => Some(BinType::File),
            "list" => Some(BinType::List),
            "list2" => Some(BinType::List2),
            "pointer" => Some(BinType::Pointer),
            "embed" => Some(BinType::Embed),
            "link" => Some(BinType::Link),
            "option" => Some(BinType::Option),
            "map" => Some(BinType::Map),
            "flag" => Some(BinType::Flag),
            _ => None,
        }
    }
}

/// FNV-1a 32-bit hash with optional resolved string name.
#[derive(Debug, Clone)]
pub struct FNV1a {
    pub hash: u32,
    pub string: Option<String>,
}

impl FNV1a {
    pub fn new(hash: u32) -> Self {
        Self { hash, string: None }
    }

    pub fn from_string(s: &str) -> Self {
        Self {
            hash: Self::calculate(s),
            string: Some(s.to_string()),
        }
    }

    pub fn calculate(text: &str) -> u32 {
        let mut hash: u32 = 0x811c9dc5;
        for c in text.to_lowercase().bytes() {
            hash ^= c as u32;
            hash = hash.wrapping_mul(0x01000193);
        }
        hash
    }
}

/// XXH64 hash with optional resolved string name.
#[derive(Debug, Clone)]
pub struct XXH64 {
    pub hash: u64,
    pub string: Option<String>,
}

impl XXH64 {
    pub fn new(hash: u64) -> Self {
        Self { hash, string: None }
    }

    pub fn with_string(hash: u64, s: String) -> Self {
        Self { hash, string: Some(s) }
    }
}

/// Top-level Bin container — maps section names to values.
#[derive(Debug, Clone)]
pub struct Bin {
    pub sections: IndexMap<String, BinValue>,
}

impl Bin {
    pub fn new() -> Self {
        Self::default()
    }
}

impl Default for Bin {
    fn default() -> Self {
        Self { sections: IndexMap::new() }
    }
}

/// A field inside a Pointer or Embed structure.
#[derive(Debug, Clone)]
pub struct BinField {
    pub key: FNV1a,
    pub value: BinValue,
}

/// All possible bin value types — flat enum, no boxing needed for primitives.
#[derive(Debug, Clone)]
pub enum BinValue {
    None,
    Bool(bool),
    I8(i8),
    U8(u8),
    I16(i16),
    U16(u16),
    I32(i32),
    U32(u32),
    I64(i64),
    U64(u64),
    F32(f32),
    Vec2([f32; 2]),
    Vec3([f32; 3]),
    Vec4([f32; 4]),
    Mtx44([f32; 16]),
    Rgba(u8, u8, u8, u8),
    String(String),
    Hash(FNV1a),
    File(XXH64),
    List { value_type: BinType, items: Vec<BinValue> },
    List2 { value_type: BinType, items: Vec<BinValue> },
    Pointer { name: FNV1a, fields: Vec<BinField> },
    Embed { name: FNV1a, fields: Vec<BinField> },
    Link(FNV1a),
    Option { value_type: BinType, items: Vec<BinValue> },
    Map { key_type: BinType, value_type: BinType, items: Vec<(BinValue, BinValue)> },
    Flag(bool),
}

impl BinValue {
    pub fn bin_type(&self) -> BinType {
        match self {
            BinValue::None => BinType::None,
            BinValue::Bool(_) => BinType::Bool,
            BinValue::I8(_) => BinType::I8,
            BinValue::U8(_) => BinType::U8,
            BinValue::I16(_) => BinType::I16,
            BinValue::U16(_) => BinType::U16,
            BinValue::I32(_) => BinType::I32,
            BinValue::U32(_) => BinType::U32,
            BinValue::I64(_) => BinType::I64,
            BinValue::U64(_) => BinType::U64,
            BinValue::F32(_) => BinType::F32,
            BinValue::Vec2(_) => BinType::Vec2,
            BinValue::Vec3(_) => BinType::Vec3,
            BinValue::Vec4(_) => BinType::Vec4,
            BinValue::Mtx44(_) => BinType::Mtx44,
            BinValue::Rgba(..) => BinType::Rgba,
            BinValue::String(_) => BinType::String,
            BinValue::Hash(_) => BinType::Hash,
            BinValue::File(_) => BinType::File,
            BinValue::List { .. } => BinType::List,
            BinValue::List2 { .. } => BinType::List2,
            BinValue::Pointer { .. } => BinType::Pointer,
            BinValue::Embed { .. } => BinType::Embed,
            BinValue::Link(_) => BinType::Link,
            BinValue::Option { .. } => BinType::Option,
            BinValue::Map { .. } => BinType::Map,
            BinValue::Flag(_) => BinType::Flag,
        }
    }
}
