//! Lua 5.1 bytecode (luabin64) parser — converts compiled Lua data files
//! back to readable Lua source text.
//!
//! Riot's `.luabin64` files are standard Lua 5.1 bytecode with 64-bit size_t.
//! They are simple data definition files that set global variables to
//! strings, numbers, booleans, and tables. This module simulates execution
//! of the bytecode to reconstruct the original Lua assignments.

use std::io::{self, Cursor, Read};

// ── Lua 5.1 header constants ────────────────────────────────────────────────

const LUA_SIGNATURE: &[u8] = b"\x1bLua";
const LUA_VERSION_51: u8 = 0x51; // 'Q'

// ── Lua 5.1 opcodes (only the ones we need) ────────────────────────────────

const OP_MOVE: u8 = 0;
const OP_LOADK: u8 = 1;
const OP_LOADBOOL: u8 = 2;
const OP_LOADNIL: u8 = 3;
const OP_GETGLOBAL: u8 = 5;
const OP_SETTABLE: u8 = 9;
const OP_NEWTABLE: u8 = 10;
const OP_SETGLOBAL: u8 = 7;
const OP_SETLIST: u8 = 34;
const OP_RETURN: u8 = 30;
const OP_CLOSURE: u8 = 36;
const OP_CALL: u8 = 28;
const OP_CONCAT: u8 = 21;
const OP_ADD: u8 = 12;
const OP_SUB: u8 = 13;
const OP_MUL: u8 = 14;
const OP_DIV: u8 = 15;
const OP_MOD: u8 = 16;
const OP_POW: u8 = 17;
const OP_UNM: u8 = 18;
const OP_NOT: u8 = 19;

// ── Constant types ─────────────────────────────────────────────────────────

const LUA_TNIL: u8 = 0;
const LUA_TBOOLEAN: u8 = 1;
const LUA_TNUMBER: u8 = 3;
const LUA_TSTRING: u8 = 4;

// ── Value types for simulation ─────────────────────────────────────────────

#[derive(Clone, Debug)]
enum LuaValue {
    Nil,
    Bool(bool),
    Number(f64),
    String(String),
    Table(Vec<(LuaValue, LuaValue)>), // key-value pairs
}

impl LuaValue {
    fn to_lua_source(&self, indent: usize) -> String {
        match self {
            LuaValue::Nil => "nil".to_string(),
            LuaValue::Bool(b) => if *b { "true" } else { "false" }.to_string(),
            LuaValue::Number(n) => format_number(*n),
            LuaValue::String(s) => format!("\"{}\"", escape_lua_string(s)),
            LuaValue::Table(entries) => {
                if entries.is_empty() {
                    return "{}".to_string();
                }

                let inner_indent = indent + 2;
                let pad = " ".repeat(inner_indent);
                let outer_pad = " ".repeat(indent);

                // Check if this is a sequential array (keys are 1, 2, 3...)
                let is_array = entries.iter().enumerate().all(|(i, (k, _))| {
                    matches!(k, LuaValue::Number(n) if *n == (i + 1) as f64)
                });

                let mut out = String::from("{\n");
                for (key, val) in entries {
                    if is_array {
                        out.push_str(&format!(
                            "{}{},\n",
                            pad,
                            val.to_lua_source(inner_indent)
                        ));
                    } else {
                        let key_str = match key {
                            LuaValue::String(s) if is_valid_identifier(s) => s.clone(),
                            LuaValue::String(s) => format!("[\"{}\"]", escape_lua_string(s)),
                            LuaValue::Number(n) => format!("[{}]", format_number(*n)),
                            _ => format!("[{}]", key.to_lua_source(0)),
                        };
                        out.push_str(&format!(
                            "{}{} = {},\n",
                            pad,
                            key_str,
                            val.to_lua_source(inner_indent)
                        ));
                    }
                }
                out.push_str(&format!("{}}}", outer_pad));
                out
            }
        }
    }
}

fn format_number(n: f64) -> String {
    if n == n.floor() && n.abs() < 1e15 {
        // Integer-like
        format!("{}", n as i64)
    } else {
        format!("{}", n)
    }
}

fn escape_lua_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\0' => out.push_str("\\0"),
            _ => out.push(ch),
        }
    }
    out
}

fn is_valid_identifier(s: &str) -> bool {
    if s.is_empty() { return false; }
    let first = s.as_bytes()[0];
    if !(first.is_ascii_alphabetic() || first == b'_') { return false; }
    s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}

// ── Binary reader ──────────────────────────────────────────────────────────

struct Reader {
    cursor: Cursor<Vec<u8>>,
    size_t_len: u8,
    int_len: u8,
    number_len: u8,
    is_integral: bool,
}

impl Reader {
    fn new(data: Vec<u8>) -> Self {
        Self {
            cursor: Cursor::new(data),
            size_t_len: 8,
            int_len: 4,
            number_len: 8,
            is_integral: false,
        }
    }

    fn read_bytes(&mut self, n: usize) -> io::Result<Vec<u8>> {
        let mut buf = vec![0u8; n];
        self.cursor.read_exact(&mut buf)?;
        Ok(buf)
    }

    fn read_u8(&mut self) -> io::Result<u8> {
        let mut b = [0u8; 1];
        self.cursor.read_exact(&mut b)?;
        Ok(b[0])
    }

    fn read_u32(&mut self) -> io::Result<u32> {
        let mut b = [0u8; 4];
        self.cursor.read_exact(&mut b)?;
        Ok(u32::from_le_bytes(b))
    }

    fn read_int(&mut self) -> io::Result<i32> {
        // int_len is always 4 in practice
        let mut b = [0u8; 4];
        self.cursor.read_exact(&mut b)?;
        Ok(i32::from_le_bytes(b))
    }

    fn read_size_t(&mut self) -> io::Result<u64> {
        if self.size_t_len == 8 {
            let mut b = [0u8; 8];
            self.cursor.read_exact(&mut b)?;
            Ok(u64::from_le_bytes(b))
        } else {
            let mut b = [0u8; 4];
            self.cursor.read_exact(&mut b)?;
            Ok(u32::from_le_bytes(b) as u64)
        }
    }

    fn read_number(&mut self) -> io::Result<f64> {
        if self.is_integral {
            if self.number_len == 8 {
                let mut b = [0u8; 8];
                self.cursor.read_exact(&mut b)?;
                Ok(i64::from_le_bytes(b) as f64)
            } else {
                let mut b = [0u8; 4];
                self.cursor.read_exact(&mut b)?;
                Ok(i32::from_le_bytes(b) as f64)
            }
        } else {
            if self.number_len == 8 {
                let mut b = [0u8; 8];
                self.cursor.read_exact(&mut b)?;
                Ok(f64::from_le_bytes(b))
            } else {
                let mut b = [0u8; 4];
                self.cursor.read_exact(&mut b)?;
                Ok(f32::from_le_bytes(b) as f64)
            }
        }
    }

    fn read_string(&mut self) -> io::Result<Option<String>> {
        let len = self.read_size_t()? as usize;
        if len == 0 {
            return Ok(None);
        }
        let bytes = self.read_bytes(len)?;
        // Lua strings include trailing \0 — strip it
        let s = if bytes.last() == Some(&0) {
            &bytes[..bytes.len() - 1]
        } else {
            &bytes
        };
        Ok(Some(String::from_utf8_lossy(s).into_owned()))
    }
}

// ── Lua 5.1 instruction decoding ───────────────────────────────────────────

#[derive(Clone, Copy, Debug)]
struct Instruction {
    opcode: u8,
    a: u16,
    b: u16,
    c: u16,
    bx: u32,
    sbx: i32,
}

fn decode_instruction(raw: u32) -> Instruction {
    let opcode = (raw & 0x3F) as u8;
    let a = ((raw >> 6) & 0xFF) as u16;
    let c = ((raw >> 14) & 0x1FF) as u16;
    let b = ((raw >> 23) & 0x1FF) as u16;
    let bx = (raw >> 14) & 0x3FFFF;
    let sbx = bx as i32 - 131071;
    Instruction { opcode, a, b, c, bx, sbx }
}

// ── Function prototype ─────────────────────────────────────────────────────

#[derive(Debug)]
struct FunctionProto {
    constants: Vec<LuaValue>,
    instructions: Vec<Instruction>,
    prototypes: Vec<FunctionProto>,
    num_params: u8,
    is_vararg: u8,
    max_stack: u8,
}

fn read_function(r: &mut Reader) -> io::Result<FunctionProto> {
    // Source name
    let _source = r.read_string()?;

    // Line info
    let _line_defined = r.read_int()?;
    let _last_line_defined = r.read_int()?;

    let _nups = r.read_u8()?;
    let num_params = r.read_u8()?;
    let is_vararg = r.read_u8()?;
    let max_stack = r.read_u8()?;

    // Instructions
    let code_size = r.read_int()? as usize;
    let mut instructions = Vec::with_capacity(code_size);
    for _ in 0..code_size {
        instructions.push(decode_instruction(r.read_u32()?));
    }

    // Constants
    let const_size = r.read_int()? as usize;
    let mut constants = Vec::with_capacity(const_size);
    for _ in 0..const_size {
        let t = r.read_u8()?;
        let val = match t {
            LUA_TNIL => LuaValue::Nil,
            LUA_TBOOLEAN => LuaValue::Bool(r.read_u8()? != 0),
            LUA_TNUMBER => LuaValue::Number(r.read_number()?),
            LUA_TSTRING => {
                let s = r.read_string()?.unwrap_or_default();
                LuaValue::String(s)
            }
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("Unknown constant type: {}", t),
                ));
            }
        };
        constants.push(val);
    }

    // Function prototypes
    let proto_size = r.read_int()? as usize;
    let mut prototypes = Vec::with_capacity(proto_size);
    for _ in 0..proto_size {
        prototypes.push(read_function(r)?);
    }

    // Source line positions (skip)
    let line_info_size = r.read_int()? as usize;
    for _ in 0..line_info_size {
        let _ = r.read_int()?;
    }

    // Local variables (skip)
    let locals_size = r.read_int()? as usize;
    for _ in 0..locals_size {
        let _ = r.read_string()?;
        let _ = r.read_int()?;
        let _ = r.read_int()?;
    }

    // Upvalue names (skip)
    let upval_size = r.read_int()? as usize;
    for _ in 0..upval_size {
        let _ = r.read_string()?;
    }

    Ok(FunctionProto {
        constants,
        instructions,
        prototypes,
        num_params,
        is_vararg,
        max_stack,
    })
}

// ── Bytecode simulation ────────────────────────────────────────────────────

const FIELDS_PER_FLUSH: usize = 50; // LFIELDS_PER_FLUSH in Lua 5.1

fn simulate_function(func: &FunctionProto) -> Vec<(String, LuaValue)> {
    let mut registers: Vec<LuaValue> = vec![LuaValue::Nil; func.max_stack as usize + 256];
    let mut globals: Vec<(String, LuaValue)> = Vec::new();
    let pc_max = func.instructions.len();

    // Helper: get constant or register value. In Lua 5.1, if B/C >= 256,
    // it indexes the constant table (B/C - 256). Otherwise it's a register.
    let rk = |idx: u16, regs: &[LuaValue], consts: &[LuaValue]| -> LuaValue {
        if idx >= 256 {
            let ki = (idx - 256) as usize;
            consts.get(ki).cloned().unwrap_or(LuaValue::Nil)
        } else {
            regs.get(idx as usize).cloned().unwrap_or(LuaValue::Nil)
        }
    };

    let mut pc = 0usize;
    let mut safety = 0u32;
    let max_iterations = 100_000u32;

    while pc < pc_max && safety < max_iterations {
        safety += 1;
        let inst = func.instructions[pc];
        pc += 1;

        match inst.opcode {
            OP_MOVE => {
                let val = registers.get(inst.b as usize).cloned().unwrap_or(LuaValue::Nil);
                registers[inst.a as usize] = val;
            }

            OP_LOADK => {
                let val = func.constants.get(inst.bx as usize)
                    .cloned()
                    .unwrap_or(LuaValue::Nil);
                registers[inst.a as usize] = val;
            }

            OP_LOADBOOL => {
                registers[inst.a as usize] = LuaValue::Bool(inst.b != 0);
                if inst.c != 0 {
                    pc += 1; // skip next instruction
                }
            }

            OP_LOADNIL => {
                let a = inst.a as usize;
                let b = inst.b as usize;
                for i in a..=b {
                    if i < registers.len() {
                        registers[i] = LuaValue::Nil;
                    }
                }
            }

            OP_NEWTABLE => {
                registers[inst.a as usize] = LuaValue::Table(Vec::new());
            }

            OP_SETTABLE => {
                let key = rk(inst.b, &registers, &func.constants);
                let val = rk(inst.c, &registers, &func.constants);
                let a = inst.a as usize;
                if let LuaValue::Table(ref mut entries) = registers[a] {
                    // Check if key already exists
                    let mut found = false;
                    for (k, v) in entries.iter_mut() {
                        if matches!((&*k, &key), (LuaValue::String(a), LuaValue::String(b)) if a == b)
                            || matches!((&*k, &key), (LuaValue::Number(a), LuaValue::Number(b)) if a == b)
                        {
                            *v = val.clone();
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        entries.push((key, val));
                    }
                }
            }

            OP_SETLIST => {
                let a = inst.a as usize;
                let mut b = inst.b as usize;
                let c = inst.c as usize;

                // C=0 means next instruction holds the real block number
                let block = if c == 0 {
                    // Next instruction's raw value is the block number
                    if pc < pc_max {
                        let raw = func.instructions[pc];
                        pc += 1;
                        // The entire instruction word is used as the value
                        ((raw.opcode as u32)
                            | ((raw.a as u32) << 6)
                            | ((raw.c as u32) << 14)
                            | ((raw.b as u32) << 23)) as usize
                    } else {
                        1
                    }
                } else {
                    c
                };

                // B=0 means set up to top of stack (we approximate with what's available)
                if b == 0 {
                    // Count non-nil registers from a+1 upward
                    b = 0;
                    for i in (a + 1)..registers.len() {
                        if matches!(registers[i], LuaValue::Nil) { break; }
                        b += 1;
                    }
                }

                let base_index = (block - 1) * FIELDS_PER_FLUSH;

                // Collect values first to avoid borrow conflict
                let mut items: Vec<(usize, LuaValue)> = Vec::with_capacity(b);
                for i in 1..=b {
                    let reg_idx = a + i;
                    let table_idx = base_index + i;
                    let val = registers.get(reg_idx).cloned().unwrap_or(LuaValue::Nil);
                    items.push((table_idx, val));
                }

                if let LuaValue::Table(ref mut entries) = registers[a] {
                    for (table_idx, val) in items {
                        let key = LuaValue::Number(table_idx as f64);
                        let mut found = false;
                        for (k, v) in entries.iter_mut() {
                            if matches!(k, LuaValue::Number(n) if *n == table_idx as f64) {
                                *v = val.clone();
                                found = true;
                                break;
                            }
                        }
                        if !found {
                            entries.push((key, val));
                        }
                    }
                }
            }

            OP_SETGLOBAL => {
                let name = match func.constants.get(inst.bx as usize) {
                    Some(LuaValue::String(s)) => s.clone(),
                    _ => format!("_G[{}]", inst.bx),
                };
                let val = registers.get(inst.a as usize).cloned().unwrap_or(LuaValue::Nil);
                globals.push((name, val));
            }

            OP_GETGLOBAL => {
                // Load a global into a register — for data files this rarely
                // matters, but handle it for completeness: store as string ref.
                let name = match func.constants.get(inst.bx as usize) {
                    Some(LuaValue::String(s)) => s.clone(),
                    _ => format!("_G[{}]", inst.bx),
                };
                // We can't resolve globals at compile time; store the name
                registers[inst.a as usize] = LuaValue::String(format!("<global:{}>", name));
            }

            OP_CONCAT => {
                // R(A) = R(B) .. ... .. R(C)
                let b = inst.b as usize;
                let c = inst.c as usize;
                let mut result = String::new();
                for i in b..=c {
                    match registers.get(i) {
                        Some(LuaValue::String(s)) => result.push_str(s),
                        Some(LuaValue::Number(n)) => result.push_str(&format_number(*n)),
                        _ => result.push_str("nil"),
                    }
                }
                registers[inst.a as usize] = LuaValue::String(result);
            }

            OP_ADD | OP_SUB | OP_MUL | OP_DIV | OP_MOD | OP_POW => {
                let lhs = rk(inst.b, &registers, &func.constants);
                let rhs = rk(inst.c, &registers, &func.constants);
                let result = match (&lhs, &rhs) {
                    (LuaValue::Number(a), LuaValue::Number(b)) => {
                        let v = match inst.opcode {
                            OP_ADD => a + b,
                            OP_SUB => a - b,
                            OP_MUL => a * b,
                            OP_DIV => a / b,
                            OP_MOD => a % b,
                            OP_POW => a.powf(*b),
                            _ => 0.0,
                        };
                        LuaValue::Number(v)
                    }
                    _ => LuaValue::Nil,
                };
                registers[inst.a as usize] = result;
            }

            OP_UNM => {
                let val = registers.get(inst.b as usize).cloned().unwrap_or(LuaValue::Nil);
                registers[inst.a as usize] = match val {
                    LuaValue::Number(n) => LuaValue::Number(-n),
                    _ => LuaValue::Nil,
                };
            }

            OP_NOT => {
                let val = registers.get(inst.b as usize).cloned().unwrap_or(LuaValue::Nil);
                let is_false = matches!(val, LuaValue::Nil | LuaValue::Bool(false));
                registers[inst.a as usize] = LuaValue::Bool(is_false);
            }

            OP_CLOSURE => {
                // For data files, closures are uncommon but can appear.
                // We store a placeholder.
                registers[inst.a as usize] =
                    LuaValue::String(format!("<function:{}>", inst.bx));
            }

            OP_CALL => {
                // Can't execute function calls in a static decompiler.
                // For Riot data files, calls are very rare. Skip.
            }

            OP_RETURN => {
                break;
            }

            _ => {
                // Unknown/unhandled opcode — skip
            }
        }
    }

    globals
}

// ── Public API ─────────────────────────────────────────────────────────────

/// Parse a Lua 5.1 bytecode buffer (luabin or luabin64) and return
/// reconstructed Lua source text.
pub fn convert_luabin(data: &[u8]) -> Result<String, String> {
    if data.len() < 12 {
        return Err("File too small to be Lua bytecode".into());
    }

    // Verify signature
    if &data[0..4] != LUA_SIGNATURE {
        return Err("Not a Lua bytecode file (bad signature)".into());
    }
    if data[4] != LUA_VERSION_51 {
        return Err(format!(
            "Unsupported Lua version: 0x{:02X} (expected 0x{:02X} for Lua 5.1)",
            data[4], LUA_VERSION_51
        ));
    }

    let mut r = Reader::new(data.to_vec());

    // Skip signature (4) + version (1) = 5 bytes
    r.read_bytes(5).map_err(|e| e.to_string())?;

    // Format byte
    let _format = r.read_u8().map_err(|e| e.to_string())?;

    // Endianness: 1 = little-endian, 0 = big-endian
    let endian = r.read_u8().map_err(|e| e.to_string())?;
    if endian != 1 {
        return Err("Big-endian Lua bytecode is not supported".into());
    }

    // Sizes
    r.int_len = r.read_u8().map_err(|e| e.to_string())?;
    r.size_t_len = r.read_u8().map_err(|e| e.to_string())?;
    let instr_size = r.read_u8().map_err(|e| e.to_string())?;
    r.number_len = r.read_u8().map_err(|e| e.to_string())?;
    r.is_integral = r.read_u8().map_err(|e| e.to_string())? != 0;

    if instr_size != 4 {
        return Err(format!("Unexpected instruction size: {} (expected 4)", instr_size));
    }

    // Parse main function
    let func = read_function(&mut r).map_err(|e| e.to_string())?;

    // Simulate and collect global assignments
    let globals = simulate_function(&func);

    // Format output
    let mut output = String::new();
    for (name, value) in &globals {
        output.push_str(&format!("{} = {}\n", name, value.to_lua_source(0)));
    }

    Ok(output)
}
