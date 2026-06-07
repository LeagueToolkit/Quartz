use super::types::*;

const MAX_ERRORS: usize = 20;

#[derive(Debug, Clone)]
pub struct ParseError {
    pub message: String,
    pub line: usize,
    pub column: usize,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} at line {}, column {}", self.message, self.line, self.column)
    }
}

struct TextReader<'a> {
    text: &'a [u8],
    pos: usize,
    errors: Vec<ParseError>,
}

impl<'a> TextReader<'a> {
    fn new(text: &'a str) -> Self {
        Self { text: text.as_bytes(), pos: 0, errors: Vec::new() }
    }

    fn is_eof(&self) -> bool { self.pos >= self.text.len() }

    fn peek(&self) -> u8 {
        if self.is_eof() { 0 } else { self.text[self.pos] }
    }

    fn read_char(&mut self) -> u8 {
        if self.is_eof() { return 0; }
        let c = self.text[self.pos];
        self.pos += 1;
        c
    }

    fn get_line_column(&self, position: usize) -> (usize, usize) {
        let mut line = 1;
        let mut col = 1;
        for i in 0..position.min(self.text.len()) {
            if self.text[i] == b'\n' { line += 1; col = 1; }
            else { col += 1; }
        }
        (line, col)
    }

    fn add_error(&mut self, message: impl Into<String>) {
        if self.errors.len() < MAX_ERRORS {
            let (line, column) = self.get_line_column(self.pos);
            self.errors.push(ParseError { message: message.into(), line, column });
        }
    }

    fn skip_whitespace(&mut self) {
        while !self.is_eof() {
            let c = self.peek();
            if c == b' ' || c == b'\t' || c == b'\r' { self.read_char(); }
            else { break; }
        }
    }

    fn skip_whitespace_and_comments(&mut self) {
        let mut in_comment = false;
        while !self.is_eof() {
            let c = self.peek();
            if c == b'#' { in_comment = true; self.read_char(); }
            else if c == b'\n' { in_comment = false; self.read_char(); }
            else if in_comment || c == b' ' || c == b'\t' || c == b'\r' { self.read_char(); }
            else { break; }
        }
    }

    fn next_newline(&mut self) -> bool {
        let mut in_comment = false;
        let mut found = false;
        while !self.is_eof() {
            let c = self.peek();
            if c == b'#' { in_comment = true; self.read_char(); }
            else if c == b'\n' { in_comment = false; found = true; self.read_char(); }
            else if in_comment || c == b' ' || c == b'\t' || c == b'\r' { self.read_char(); }
            else { break; }
        }
        found
    }

    fn read_symbol(&mut self, sym: u8) -> bool {
        self.skip_whitespace();
        if self.peek() == sym { self.read_char(); true } else { false }
    }

    fn expect_symbol(&mut self, sym: u8) -> bool {
        if self.read_symbol(sym) { true }
        else { self.add_error(format!("Expected '{}'", sym as char)); false }
    }

    fn read_nested_separator(&mut self) -> bool {
        if self.next_newline() { return true; }
        if self.read_symbol(b',') { self.next_newline(); return true; }
        false
    }

    fn read_nested_separator_or_end(&mut self) -> Option<bool> {
        if self.read_symbol(b'}') { return Some(true); }
        if self.read_nested_separator() {
            return Some(self.read_symbol(b'}'));
        }
        None
    }

    fn read_word(&mut self) -> String {
        self.skip_whitespace();
        let start = self.pos;
        while !self.is_eof() {
            let c = self.peek();
            if c.is_ascii_alphanumeric() || c == b'_' || c == b'+' || c == b'-' || c == b'.' {
                self.read_char();
            } else { break; }
        }
        String::from_utf8_lossy(&self.text[start..self.pos]).to_string()
    }

    fn read_hex_digits(&mut self, count: usize) -> Option<u32> {
        let mut value: u32 = 0;
        for _ in 0..count {
            if self.is_eof() { return None; }
            let c = self.peek();
            let digit = match c {
                b'0'..=b'9' => (c - b'0') as u32,
                b'a'..=b'f' => (c - b'a' + 10) as u32,
                b'A'..=b'F' => (c - b'A' + 10) as u32,
                _ => return None,
            };
            value = (value << 4) | digit;
            self.read_char();
        }
        Some(value)
    }

    fn write_utf8(result: &mut String, code_point: u32) {
        if let Some(c) = char::from_u32(code_point) {
            result.push(c);
        } else {
            result.push('\u{FFFD}');
        }
    }

    fn read_quoted_string(&mut self) -> Option<String> {
        self.skip_whitespace();
        let q = self.peek();
        if q != b'"' && q != b'\'' { self.add_error("Expected string (starting with \" or ')"); return None; }
        self.read_char();
        let mut result = String::new();
        let mut escape = false;
        while !self.is_eof() {
            let c = self.read_char();
            if escape {
                match c {
                    b'n' => result.push('\n'),
                    b'r' => result.push('\r'),
                    b't' => result.push('\t'),
                    b'a' => result.push('\x07'),
                    b'b' => result.push('\x08'),
                    b'f' => result.push('\x0C'),
                    b'\\' => result.push('\\'),
                    b'"' => result.push('"'),
                    b'\'' => result.push('\''),
                    b'x' => {
                        match self.read_hex_digits(2) {
                            Some(v) => Self::write_utf8(&mut result, v),
                            None => { self.add_error("Invalid \\x escape: expected 2 hex digits"); }
                        }
                    }
                    b'u' => {
                        match self.read_hex_digits(4) {
                            Some(v) => {
                                // Handle UTF-16 surrogate pairs
                                if (0xD800..=0xDBFF).contains(&v) {
                                    // High surrogate — look for \uLOW
                                    if !self.is_eof() && self.peek() == b'\\' {
                                        let saved = self.pos;
                                        self.read_char(); // consume '\'
                                        if !self.is_eof() && self.peek() == b'u' {
                                            self.read_char(); // consume 'u'
                                            if let Some(low) = self.read_hex_digits(4) {
                                                if (0xDC00..=0xDFFF).contains(&low) {
                                                    let cp = ((v - 0xD800) << 10 | (low - 0xDC00)) + 0x10000;
                                                    Self::write_utf8(&mut result, cp);
                                                } else {
                                                    // Not a low surrogate, emit high as-is and reparse
                                                    Self::write_utf8(&mut result, v);
                                                    Self::write_utf8(&mut result, low);
                                                }
                                            } else {
                                                Self::write_utf8(&mut result, v);
                                                self.pos = saved + 1; // back to after the '\'
                                            }
                                        } else {
                                            Self::write_utf8(&mut result, v);
                                            self.pos = saved; // back to the '\'
                                        }
                                    } else {
                                        Self::write_utf8(&mut result, v);
                                    }
                                } else {
                                    Self::write_utf8(&mut result, v);
                                }
                            }
                            None => { self.add_error("Invalid \\u escape: expected 4 hex digits"); }
                        }
                    }
                    _ => result.push(c as char),
                }
                escape = false;
            } else if c == b'\\' {
                escape = true;
            } else if c == q {
                return Some(result);
            } else {
                result.push(c as char);
            }
        }
        self.add_error("Unterminated string");
        None
    }

    fn read_hash_or_string(&mut self) -> FNV1a {
        self.skip_whitespace();
        let c = self.peek();
        if c == b'"' || c == b'\'' {
            if let Some(s) = self.read_quoted_string() {
                return FNV1a::from_string(&s);
            }
            return FNV1a::new(0);
        }
        let word = self.read_word();
        if word.len() > 2 && (word.starts_with("0x") || word.starts_with("0X")) {
            if let Ok(hash) = u32::from_str_radix(&word[2..], 16) {
                return FNV1a::new(hash);
            }
            self.add_error(format!("Failed to parse hash '{}'", word));
            return FNV1a::new(0);
        }
        FNV1a::from_string(&word)
    }

    fn read_file_hash_or_string(&mut self) -> XXH64 {
        self.skip_whitespace();
        let c = self.peek();
        if c == b'"' || c == b'\'' {
            if let Some(s) = self.read_quoted_string() {
                return XXH64::with_string(0, s);
            }
            return XXH64::new(0);
        }
        let word = self.read_word();
        if word.len() > 2 && (word.starts_with("0x") || word.starts_with("0X")) {
            if let Ok(hash) = u64::from_str_radix(&word[2..], 16) {
                return XXH64::new(hash);
            }
            self.add_error(format!("Failed to parse file hash '{}'", word));
            return XXH64::new(0);
        }
        XXH64::with_string(0, word)
    }

    fn parse_type_name(name: &str) -> Option<BinType> {
        BinType::from_name(&name.to_ascii_lowercase())
    }

    #[allow(clippy::type_complexity)]
    fn read_type_annotation(&mut self) -> Option<(BinType, Option<BinType>, Option<BinType>, Option<BinType>)> {
        let type_name = self.read_word();
        if type_name.is_empty() { self.add_error("Expected type name"); return None; }
        let lower = type_name.to_ascii_lowercase();

        match lower.as_str() {
            "list" | "list2" => {
                if !self.expect_symbol(b'[') { return None; }
                let elem_name = self.read_word();
                if !self.expect_symbol(b']') { return None; }
                let elem_type = Self::parse_type_name(&elem_name)?;
                let bt = if lower == "list" { BinType::List } else { BinType::List2 };
                Some((bt, Some(elem_type), None, None))
            }
            "option" => {
                if !self.expect_symbol(b'[') { return None; }
                let opt_name = self.read_word();
                if !self.expect_symbol(b']') { return None; }
                let opt_type = Self::parse_type_name(&opt_name)?;
                Some((BinType::Option, Some(opt_type), None, None))
            }
            "map" => {
                if !self.expect_symbol(b'[') { return None; }
                let key_name = self.read_word();
                if !self.expect_symbol(b',') { return None; }
                let val_name = self.read_word();
                if !self.expect_symbol(b']') { return None; }
                let key_type = Self::parse_type_name(&key_name)?;
                let val_type = Self::parse_type_name(&val_name)?;
                Some((BinType::Map, None, Some(key_type), Some(val_type)))
            }
            _ => {
                let t = Self::parse_type_name(&type_name);
                if t.is_none() { self.add_error(format!("Unknown type: {}", type_name)); }
                t.map(|t| (t, None, None, None))
            }
        }
    }

    fn read_section(&mut self, bin: &mut Bin) -> bool {
        let name = self.read_word();
        if name.is_empty() { self.add_error("Expected section name"); return false; }
        if !self.expect_symbol(b':') { return false; }
        let (vt, list_type, map_key, map_val) = match self.read_type_annotation() {
            Some(t) => t,
            None => return false,
        };
        if !self.expect_symbol(b'=') { return false; }
        match self.read_value_of_type(vt, list_type, map_key, map_val) {
            Some(value) => { bin.sections.insert(name, value); self.skip_whitespace_and_comments(); true }
            None => false,
        }
    }

    fn read_value_of_type(&mut self, bt: BinType, list_type: Option<BinType>, map_key: Option<BinType>, map_val: Option<BinType>) -> Option<BinValue> {
        match bt {
            BinType::None => { let w = self.read_word(); if w != "null" { self.add_error(format!("Expected 'null', got '{}'", w)); } Some(BinValue::None) }
            BinType::Bool => { let w = self.read_word(); match w.as_str() { "true" => Some(BinValue::Bool(true)), "false" => Some(BinValue::Bool(false)), _ => { self.add_error(format!("Expected 'true' or 'false', got '{}'", w)); None } } }
            BinType::Flag => { let w = self.read_word(); match w.as_str() { "true" => Some(BinValue::Flag(true)), "false" => Some(BinValue::Flag(false)), _ => { self.add_error(format!("Expected 'true' or 'false', got '{}'", w)); None } } }
            BinType::I8 => self.read_number(|v: i8| BinValue::I8(v)),
            BinType::U8 => self.read_number(|v: u8| BinValue::U8(v)),
            BinType::I16 => self.read_number(|v: i16| BinValue::I16(v)),
            BinType::U16 => self.read_number(|v: u16| BinValue::U16(v)),
            BinType::I32 => self.read_number(|v: i32| BinValue::I32(v)),
            BinType::U32 => self.read_number(|v: u32| BinValue::U32(v)),
            BinType::I64 => self.read_number(|v: i64| BinValue::I64(v)),
            BinType::U64 => self.read_number(|v: u64| BinValue::U64(v)),
            BinType::F32 => self.read_number(|v: f32| BinValue::F32(v)),
            BinType::Vec2 => self.read_vec2(),
            BinType::Vec3 => self.read_vec3(),
            BinType::Vec4 => self.read_vec4(),
            BinType::Mtx44 => self.read_mtx44(),
            BinType::Rgba => self.read_rgba(),
            BinType::String => self.read_quoted_string().map(BinValue::String),
            BinType::Hash => Some(BinValue::Hash(self.read_hash_or_string())),
            BinType::File => Some(BinValue::File(self.read_file_hash_or_string())),
            BinType::Link => Some(BinValue::Link(self.read_hash_or_string())),
            BinType::Pointer => self.read_pointer(),
            BinType::Embed => self.read_embed(),
            BinType::List => self.read_list(list_type.unwrap_or(BinType::None)),
            BinType::List2 => self.read_list2(list_type.unwrap_or(BinType::None)),
            BinType::Option => self.read_option(list_type.unwrap_or(BinType::None)),
            BinType::Map => self.read_map(map_key.unwrap_or(BinType::None), map_val.unwrap_or(BinType::None)),
        }
    }

    fn read_number<T: std::str::FromStr>(&mut self, make: impl Fn(T) -> BinValue) -> Option<BinValue> {
        self.skip_whitespace();
        if self.is_eof() { self.add_error("Expected number but reached EOF"); return None; }
        let c = self.peek();
        if !c.is_ascii_digit() && c != b'-' && c != b'+' && c != b'.' {
            self.add_error(format!("Expected number but found '{}'", c as char));
            return None;
        }
        let word = self.read_word();
        if word.is_empty() { self.add_error("Expected number"); return None; }
        match word.parse::<T>() {
            Ok(v) => Some(make(v)),
            Err(_) => { self.add_error(format!("'{}' is not a valid number", word)); None }
        }
    }

    fn read_float_value(&mut self) -> Option<f32> {
        self.skip_whitespace();
        let word = self.read_word();
        match word.parse::<f32>() {
            Ok(v) => Some(v),
            Err(_) => { self.add_error(format!("'{}' is not a valid float", word)); None }
        }
    }

    fn read_u8_value(&mut self) -> Option<u8> {
        self.skip_whitespace();
        let word = self.read_word();
        match word.parse::<u8>() {
            Ok(v) => Some(v),
            Err(_) => { self.add_error(format!("'{}' is not a valid u8", word)); None }
        }
    }

    fn read_vec2(&mut self) -> Option<BinValue> {
        if !self.expect_symbol(b'{') { return None; }
        self.next_newline();
        if self.read_symbol(b'}') { self.add_error("Vec2 requires 2 values"); return None; }
        let x = self.read_float_value()?;
        match self.read_nested_separator_or_end() { Some(true) => { self.add_error("Vec2 requires 2 values"); return None; } None => { return None; } _ => {} }
        let y = self.read_float_value()?;
        match self.read_nested_separator_or_end() { Some(false) => { self.add_error("Vec2 can only have 2 values"); return None; } None => { return None; } _ => {} }
        Some(BinValue::Vec2([x, y]))
    }

    fn read_vec3(&mut self) -> Option<BinValue> {
        if !self.expect_symbol(b'{') { return None; }
        self.next_newline();
        if self.read_symbol(b'}') { self.add_error("Vec3 requires 3 values"); return None; }
        let x = self.read_float_value()?;
        match self.read_nested_separator_or_end() { Some(true) => { self.add_error("Vec3 requires 3 values"); return None; } None => { return None; } _ => {} }
        let y = self.read_float_value()?;
        match self.read_nested_separator_or_end() { Some(true) => { self.add_error("Vec3 requires 3 values"); return None; } None => { return None; } _ => {} }
        let z = self.read_float_value()?;
        match self.read_nested_separator_or_end() { Some(false) => { self.add_error("Vec3 can only have 3 values"); return None; } None => { return None; } _ => {} }
        Some(BinValue::Vec3([x, y, z]))
    }

    fn read_vec4(&mut self) -> Option<BinValue> {
        if !self.expect_symbol(b'{') { return None; }
        self.next_newline();
        if self.read_symbol(b'}') { self.add_error("Vec4 requires 4 values"); return None; }
        let x = self.read_float_value()?;
        match self.read_nested_separator_or_end() { Some(true) => { self.add_error("Vec4 requires 4 values"); return None; } None => { return None; } _ => {} }
        let y = self.read_float_value()?;
        match self.read_nested_separator_or_end() { Some(true) => { self.add_error("Vec4 requires 4 values"); return None; } None => { return None; } _ => {} }
        let z = self.read_float_value()?;
        match self.read_nested_separator_or_end() { Some(true) => { self.add_error("Vec4 requires 4 values"); return None; } None => { return None; } _ => {} }
        let w = self.read_float_value()?;
        match self.read_nested_separator_or_end() { Some(false) => { self.add_error("Vec4 can only have 4 values"); return None; } None => { return None; } _ => {} }
        Some(BinValue::Vec4([x, y, z, w]))
    }

    fn read_mtx44(&mut self) -> Option<BinValue> {
        if !self.expect_symbol(b'{') { return None; }
        self.next_newline();
        if self.read_symbol(b'}') { self.add_error("Mtx44 requires 16 values"); return None; }
        let mut values = [0.0f32; 16];
        for (i, value) in values.iter_mut().enumerate().take(16) {
            *value = self.read_float_value()?;
            match self.read_nested_separator_or_end() {
                Some(end) => {
                    if i < 15 && end { self.add_error(format!("Mtx44 requires 16 values, only got {}", i + 1)); return None; }
                    if i == 15 && !end { self.add_error("Mtx44 can only have 16 values"); return None; }
                }
                None => { return None; }
            }
        }
        Some(BinValue::Mtx44(values))
    }

    fn read_rgba(&mut self) -> Option<BinValue> {
        if !self.expect_symbol(b'{') { return None; }
        self.next_newline();
        if self.read_symbol(b'}') { self.add_error("RGBA requires 4 values"); return None; }
        let r = self.read_u8_value()?;
        match self.read_nested_separator_or_end() { Some(true) => { self.add_error("RGBA requires 4 values"); return None; } None => { return None; } _ => {} }
        let g = self.read_u8_value()?;
        match self.read_nested_separator_or_end() { Some(true) => { self.add_error("RGBA requires 4 values"); return None; } None => { return None; } _ => {} }
        let b = self.read_u8_value()?;
        match self.read_nested_separator_or_end() { Some(true) => { self.add_error("RGBA requires 4 values"); return None; } None => { return None; } _ => {} }
        let a = self.read_u8_value()?;
        match self.read_nested_separator_or_end() { Some(false) => { self.add_error("RGBA can only have 4 values"); return None; } None => { return None; } _ => {} }
        Some(BinValue::Rgba(r, g, b, a))
    }

    fn read_field(&mut self) -> Option<BinField> {
        let key = self.read_hash_or_string();
        if !self.expect_symbol(b':') { return None; }
        let (bt, list_type, map_key, map_val) = self.read_type_annotation()?;
        if !self.expect_symbol(b'=') { return None; }
        let value = self.read_value_of_type(bt, list_type, map_key, map_val)?;
        Some(BinField { key, value })
    }

    fn read_pointer(&mut self) -> Option<BinValue> {
        let name = self.read_hash_or_string();
        if name.string.as_deref() == Some("null") {
            return Some(BinValue::Pointer { name: FNV1a::new(0), fields: Vec::new() });
        }
        if !self.expect_symbol(b'{') { return None; }
        self.next_newline();
        let mut fields = Vec::new();
        if !self.read_symbol(b'}') {
            loop {
                let field = self.read_field()?;
                fields.push(field);
                match self.read_nested_separator_or_end() {
                    Some(true) => break,
                    Some(false) => {}
                    None => return None,
                }
            }
        }
        Some(BinValue::Pointer { name, fields })
    }

    fn read_embed(&mut self) -> Option<BinValue> {
        let name = self.read_hash_or_string();
        if !self.expect_symbol(b'{') { return None; }
        self.next_newline();
        let mut fields = Vec::new();
        if !self.read_symbol(b'}') {
            loop {
                let field = self.read_field()?;
                fields.push(field);
                match self.read_nested_separator_or_end() {
                    Some(true) => break,
                    Some(false) => {}
                    None => return None,
                }
            }
        }
        Some(BinValue::Embed { name, fields })
    }

    fn read_list(&mut self, elem_type: BinType) -> Option<BinValue> {
        if !self.expect_symbol(b'{') { return None; }
        self.next_newline();
        let mut items = Vec::new();
        if !self.read_symbol(b'}') {
            loop {
                let value = self.read_value_of_type(elem_type, None, None, None)?;
                items.push(value);
                match self.read_nested_separator_or_end() {
                    Some(true) => break,
                    Some(false) => {}
                    None => { self.add_error("Expected separator or '}'"); return None; }
                }
            }
        }
        Some(BinValue::List { value_type: elem_type, items })
    }

    fn read_list2(&mut self, elem_type: BinType) -> Option<BinValue> {
        if !self.expect_symbol(b'{') { return None; }
        self.next_newline();
        let mut items = Vec::new();
        if !self.read_symbol(b'}') {
            loop {
                let value = self.read_value_of_type(elem_type, None, None, None)?;
                items.push(value);
                match self.read_nested_separator_or_end() {
                    Some(true) => break,
                    Some(false) => {}
                    None => { self.add_error("Expected separator or '}'"); return None; }
                }
            }
        }
        Some(BinValue::List2 { value_type: elem_type, items })
    }

    fn read_option(&mut self, val_type: BinType) -> Option<BinValue> {
        if !self.expect_symbol(b'{') { return None; }
        self.next_newline();
        let mut items = Vec::new();
        if !self.read_symbol(b'}') {
            let value = self.read_value_of_type(val_type, None, None, None)?;
            items.push(value);
            match self.read_nested_separator_or_end() {
                Some(true) => {}
                Some(false) => { self.add_error("Option can only contain 0 or 1 elements"); return None; }
                None => { self.add_error("Expected separator or '}'"); return None; }
            }
        }
        Some(BinValue::Option { value_type: val_type, items })
    }

    fn read_map(&mut self, key_type: BinType, val_type: BinType) -> Option<BinValue> {
        if !self.expect_symbol(b'{') { return None; }
        self.next_newline();
        let mut items = Vec::new();
        if !self.read_symbol(b'}') {
            loop {
                let key = self.read_value_of_type(key_type, None, None, None)?;
                if !self.expect_symbol(b'=') { return None; }
                let value = self.read_value_of_type(val_type, None, None, None)?;
                items.push((key, value));
                match self.read_nested_separator_or_end() {
                    Some(true) => break,
                    Some(false) => {}
                    None => { self.add_error("Expected separator or '}'"); return None; }
                }
            }
        }
        Some(BinValue::Map { key_type, value_type: val_type, items })
    }
}

/// Parse ritobin text format into a Bin structure.
/// Returns Ok(bin) on success, Err(errors) with collected parse errors on failure.
pub fn read(text: &str) -> std::result::Result<Bin, Vec<ParseError>> {
    let mut reader = TextReader::new(text);
    let mut bin = Bin::new();

    reader.skip_whitespace_and_comments();
    while !reader.is_eof() {
        if !reader.read_section(&mut bin) {
            if !reader.errors.is_empty() {
                return Err(reader.errors);
            }
            return Err(vec![ParseError { message: "Failed to parse section".to_string(), line: 0, column: 0 }]);
        }
        if !reader.is_eof() {
            reader.skip_whitespace_and_comments();
        }
    }

    if reader.errors.is_empty() {
        Ok(bin)
    } else {
        Err(reader.errors)
    }
}

/// Format parse errors into a human-readable string.
pub fn format_errors(errors: &[ParseError]) -> String {
    let mut s = String::from("Parse errors:\n");
    for e in errors {
        s.push_str(&format!("  {} at line {}, column {}\n", e.message, e.line, e.column));
    }
    s
}
