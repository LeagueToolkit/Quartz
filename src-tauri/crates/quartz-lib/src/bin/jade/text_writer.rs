use super::types::*;
use std::fmt::Write;

const INDENT_SIZE: usize = 4;

struct TextWriter {
    buf: String,
    indent: usize,
}

impl TextWriter {
    fn new() -> Self {
        Self { buf: String::with_capacity(65536), indent: 0 }
    }

    fn into_string(self) -> String { self.buf }

    fn raw(&mut self, s: &str) { self.buf.push_str(s); }

    fn pad(&mut self) {
        for _ in 0..self.indent { self.buf.push(' '); }
    }

    fn indent(&mut self) { self.indent += INDENT_SIZE; }
    fn dedent(&mut self) { self.indent = self.indent.saturating_sub(INDENT_SIZE); }

    fn write_float(&mut self, v: f32) {
        // Match C# InvariantCulture float formatting
        if v == v.trunc() && v.abs() < 1e15 && !v.is_infinite() {
            write!(self.buf, "{}", v as i64).ok();
        } else {
            write!(self.buf, "{}", v).ok();
        }
    }

    fn write_hex32(&mut self, v: u32) {
        write!(self.buf, "0x{:08x}", v).ok();
    }

    fn write_hex64(&mut self, v: u64) {
        write!(self.buf, "0x{:016x}", v).ok();
    }

    fn write_hash_value_fnv(&mut self, h: &FNV1a) {
        if let Some(ref s) = h.string {
            write!(self.buf, "\"{}\"", s).ok();
        } else {
            self.write_hex32(h.hash);
        }
    }

    fn write_hash_value_xxh(&mut self, h: &XXH64) {
        if let Some(ref s) = h.string {
            write!(self.buf, "\"{}\"", s).ok();
        } else {
            self.write_hex64(h.hash);
        }
    }

    fn write_hash_name(&mut self, h: &FNV1a) {
        if let Some(ref s) = h.string {
            self.raw(s);
        } else {
            self.write_hex32(h.hash);
        }
    }

    fn write_string(&mut self, s: &str) {
        self.buf.push('"');
        for c in s.chars() {
            match c {
                '"' => self.raw("\\\""),
                '\\' => self.raw("\\\\"),
                '\n' => self.raw("\\n"),
                '\r' => self.raw("\\r"),
                '\t' => self.raw("\\t"),
                '\x07' => self.raw("\\a"),
                '\x08' => self.raw("\\b"),
                '\x0C' => self.raw("\\f"),
                c if (c as u32) < 0x20 => {
                    self.raw(&format!("\\x{:02x}", c as u32));
                }
                _ => self.buf.push(c),
            }
        }
        self.buf.push('"');
    }

    fn write_type(&mut self, value: &BinValue) {
        match value {
            BinValue::List { value_type, .. } => {
                self.raw("list[");
                self.raw(value_type.name());
                self.raw("]");
            }
            BinValue::List2 { value_type, .. } => {
                self.raw("list2[");
                self.raw(value_type.name());
                self.raw("]");
            }
            BinValue::Option { value_type, .. } => {
                self.raw("option[");
                self.raw(value_type.name());
                self.raw("]");
            }
            BinValue::Map { key_type, value_type, .. } => {
                self.raw("map[");
                self.raw(key_type.name());
                self.raw(",");
                self.raw(value_type.name());
                self.raw("]");
            }
            _ => self.raw(value.bin_type().name()),
        }
    }

    fn write_value(&mut self, value: &BinValue) {
        match value {
            BinValue::None => self.raw("null"),
            BinValue::Bool(v) => self.raw(if *v { "true" } else { "false" }),
            BinValue::I8(v) => { write!(self.buf, "{}", v).ok(); }
            BinValue::U8(v) => { write!(self.buf, "{}", v).ok(); }
            BinValue::I16(v) => { write!(self.buf, "{}", v).ok(); }
            BinValue::U16(v) => { write!(self.buf, "{}", v).ok(); }
            BinValue::I32(v) => { write!(self.buf, "{}", v).ok(); }
            BinValue::U32(v) => { write!(self.buf, "{}", v).ok(); }
            BinValue::I64(v) => { write!(self.buf, "{}", v).ok(); }
            BinValue::U64(v) => { write!(self.buf, "{}", v).ok(); }
            BinValue::F32(v) => self.write_float(*v),
            BinValue::Vec2(v) => {
                self.raw("{ "); self.write_float(v[0]); self.raw(", "); self.write_float(v[1]); self.raw(" }");
            }
            BinValue::Vec3(v) => {
                self.raw("{ "); self.write_float(v[0]); self.raw(", "); self.write_float(v[1]); self.raw(", "); self.write_float(v[2]); self.raw(" }");
            }
            BinValue::Vec4(v) => {
                self.raw("{ "); self.write_float(v[0]); self.raw(", "); self.write_float(v[1]); self.raw(", "); self.write_float(v[2]); self.raw(", "); self.write_float(v[3]); self.raw(" }");
            }
            BinValue::Mtx44(m) => {
                self.raw("{\n"); self.indent();
                for row in 0..4 {
                    self.pad();
                    for col in 0..4 {
                        self.write_float(m[row * 4 + col]);
                        if col < 3 { self.raw(", "); }
                    }
                    self.raw("\n");
                }
                self.dedent(); self.pad(); self.raw("}");
            }
            BinValue::Rgba(r, g, b, a) => {
                write!(self.buf, "{{ {}, {}, {}, {} }}", r, g, b, a).ok();
            }
            BinValue::String(s) => self.write_string(s),
            BinValue::Hash(h) => self.write_hash_value_fnv(h),
            BinValue::File(f) => self.write_hash_value_xxh(f),
            BinValue::Link(l) => self.write_hash_value_fnv(l),
            BinValue::Flag(v) => self.raw(if *v { "true" } else { "false" }),

            BinValue::List { items, .. } | BinValue::List2 { items, .. } | BinValue::Option { items, .. } => {
                self.write_item_list(items);
            }
            BinValue::Map { items, .. } => self.write_map_items(items),

            BinValue::Pointer { name, fields } => {
                if name.hash == 0 && name.string.is_none() {
                    self.raw("null");
                } else {
                    self.write_hash_name(name);
                    self.raw(" ");
                    self.write_fields(fields);
                }
            }
            BinValue::Embed { name, fields } => {
                self.write_hash_name(name);
                self.raw(" ");
                self.write_fields(fields);
            }
        }
    }

    fn write_item_list(&mut self, items: &[BinValue]) {
        if items.is_empty() {
            self.raw("{}");
            return;
        }
        self.raw("{\n"); self.indent();
        for item in items {
            self.pad();
            self.write_value(item);
            self.raw("\n");
        }
        self.dedent(); self.pad(); self.raw("}");
    }

    fn write_map_items(&mut self, items: &[(BinValue, BinValue)]) {
        if items.is_empty() {
            self.raw("{}");
            return;
        }
        self.raw("{\n"); self.indent();
        for (k, v) in items {
            self.pad();
            self.write_value(k);
            self.raw(" = ");
            self.write_value(v);
            self.raw("\n");
        }
        self.dedent(); self.pad(); self.raw("}");
    }

    fn write_fields(&mut self, fields: &[BinField]) {
        if fields.is_empty() {
            self.raw("{}");
            return;
        }
        self.raw("{\n"); self.indent();
        for field in fields {
            self.pad();
            self.write_hash_name(&field.key);
            self.raw(": ");
            self.write_type(&field.value);
            self.raw(" = ");
            self.write_value(&field.value);
            self.raw("\n");
        }
        self.dedent(); self.pad(); self.raw("}");
    }

    fn write_section(&mut self, name: &str, value: &BinValue) {
        self.raw(name);
        self.raw(": ");
        self.write_type(value);
        self.raw(" = ");
        self.write_value(value);
        self.raw("\n");
    }
}

/// Convert a Bin structure to ritobin text format.
pub fn write(bin: &Bin) -> String {
    let mut w = TextWriter::new();
    w.raw("#PROP_text\n");
    for (name, value) in &bin.sections {
        w.write_section(name, value);
    }
    w.into_string()
}
