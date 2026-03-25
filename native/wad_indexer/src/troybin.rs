//! Troybin binary parser — converts .troybin files to INI-like text.
//!
//! Ported from Leischii's Troygrade (TroybinConverter/Main.jsx).
//! Format: version byte (1=old, 2=new), then typed sections keyed by u32 hashes.
//! Hash resolution uses the "ihash" algorithm (65599-based rolling hash).

use std::io::{self, Cursor, Read};

// ── ihash ────────────────────────────────────────────────────────────────────

fn ihash(value: &str, init: u32) -> u32 {
    let mut ret = init;
    for ch in value.chars() {
        let lower = ch.to_ascii_lowercase() as u32;
        ret = lower.wrapping_add(ret.wrapping_mul(65599));
    }
    ret
}

fn a_ihash(sections: &[String], names: &[String]) -> Vec<(String, String, u32)> {
    let comments = ["", "'"];
    let mut result = Vec::new();
    for section in sections {
        let section_hash = ihash("*", ihash(section, 0));
        for name in names {
            for c in &comments {
                let name_entry = format!("{}{}", c, name);
                let ret = ihash(&name_entry, section_hash);
                result.push((section.clone(), name_entry, ret));
            }
        }
    }
    result
}

// ── Binary reader ────────────────────────────────────────────────────────────

struct BinReader {
    cursor: Cursor<Vec<u8>>,
}

impl BinReader {
    fn new(data: Vec<u8>) -> Self {
        Self { cursor: Cursor::new(data) }
    }

    fn read_u8(&mut self) -> io::Result<u8> {
        let mut b = [0u8; 1];
        self.cursor.read_exact(&mut b)?;
        Ok(b[0])
    }
    fn read_u16_le(&mut self) -> io::Result<u16> {
        let mut b = [0u8; 2];
        self.cursor.read_exact(&mut b)?;
        Ok(u16::from_le_bytes(b))
    }
    fn read_i16_le(&mut self) -> io::Result<i16> {
        let mut b = [0u8; 2];
        self.cursor.read_exact(&mut b)?;
        Ok(i16::from_le_bytes(b))
    }
    fn read_u32_le(&mut self) -> io::Result<u32> {
        let mut b = [0u8; 4];
        self.cursor.read_exact(&mut b)?;
        Ok(u32::from_le_bytes(b))
    }
    fn read_i32_le(&mut self) -> io::Result<i32> {
        let mut b = [0u8; 4];
        self.cursor.read_exact(&mut b)?;
        Ok(i32::from_le_bytes(b))
    }
    fn read_f32_le(&mut self) -> io::Result<f32> {
        let mut b = [0u8; 4];
        self.cursor.read_exact(&mut b)?;
        Ok(f32::from_le_bytes(b))
    }
    fn read_bytes(&mut self, n: usize) -> io::Result<Vec<u8>> {
        let mut buf = vec![0u8; n];
        self.cursor.read_exact(&mut buf)?;
        Ok(buf)
    }
    fn skip(&mut self, n: usize) -> io::Result<()> {
        let mut buf = vec![0u8; n];
        self.cursor.read_exact(&mut buf)?;
        Ok(())
    }
}

// ── Value types ──────────────────────────────────────────────────────────────

#[derive(Clone)]
enum TroybinValue {
    Int(i32),
    Float(f64),
    Str(String),
    Vec(Vec<f64>),
}

impl TroybinValue {
    fn format_value(&self) -> String {
        match self {
            TroybinValue::Int(v) => v.to_string(),
            TroybinValue::Float(v) => {
                if v.is_nan() { "NaN".to_string() }
                else { format!("{}", v) }
            }
            TroybinValue::Str(s) => {
                // Check if it's numeric
                if s.parse::<f64>().is_ok() { s.clone() }
                else { format!("\"{}\"", s) }
            }
            TroybinValue::Vec(vals) => {
                vals.iter()
                    .map(|v| format!("{:.1}", v))
                    .collect::<Vec<_>>()
                    .join(" ")
            }
        }
    }
}

#[derive(Clone)]
struct HashEntry {
    hash: u32,
    value: TroybinValue,
}

// ── Old format reader (version 1) ───────────────────────────────────────────

fn read_old(r: &mut BinReader) -> io::Result<Vec<HashEntry>> {
    r.skip(3)?; // 3 unknown bytes
    let entry_count = r.read_u32_le()? as usize;
    let data_count = r.read_u32_le()? as usize;

    let mut offsets = Vec::with_capacity(entry_count);
    for _ in 0..entry_count {
        let h = r.read_u32_le()?;
        let o = r.read_u32_le()?;
        offsets.push((h, o as usize));
    }

    let data = r.read_bytes(data_count)?;
    let mut result = Vec::with_capacity(entry_count);

    for &(hash, offset) in &offsets {
        let mut o = offset;
        let mut s = String::new();
        while o < data.len() && data[o] != 0 {
            s.push(data[o] as char);
            o += 1;
        }
        result.push(HashEntry { hash, value: sanitize_str(&s) });
    }
    Ok(result)
}

fn sanitize_str(s: &str) -> TroybinValue {
    if s == "true" { return TroybinValue::Int(1); }
    if s == "false" { return TroybinValue::Int(0); }
    if s.eq_ignore_ascii_case("nan") { return TroybinValue::Float(f64::NAN); }

    // Try parsing as space-separated numbers (vectors)
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() > 1 {
        let nums: Vec<f64> = parts.iter().filter_map(|p| p.parse().ok()).collect();
        if nums.len() == parts.len() {
            return TroybinValue::Vec(nums);
        }
    }

    // Single number
    if let Ok(v) = s.parse::<f64>() {
        return TroybinValue::Float(v);
    }

    TroybinValue::Str(s.to_string())
}

// ── New format reader (version 2) ───────────────────────────────────────────

fn read_bools(r: &mut BinReader) -> io::Result<Vec<HashEntry>> {
    let num = r.read_u16_le()? as usize;
    let mut keys = Vec::with_capacity(num);
    for _ in 0..num {
        keys.push(r.read_u32_le()?);
    }
    let bytes_count = num / 8 + if num % 8 > 0 { 1 } else { 0 };
    let bools = r.read_bytes(bytes_count)?;
    let mut result = Vec::with_capacity(num);
    for j in 0..num {
        let bit = (bools[j / 8] >> (j % 8)) & 1;
        result.push(HashEntry { hash: keys[j], value: TroybinValue::Int(bit as i32) });
    }
    Ok(result)
}

fn read_numbers(r: &mut BinReader, fmt: NumFmt, count: usize, mul: f64) -> io::Result<Vec<HashEntry>> {
    let num = r.read_u16_le()? as usize;
    let mut keys = Vec::with_capacity(num);
    for _ in 0..num {
        keys.push(r.read_u32_le()?);
    }
    let mut result = Vec::with_capacity(num);
    for j in 0..num {
        let mut vals = Vec::with_capacity(count);
        for _ in 0..count {
            let raw: f64 = match fmt {
                NumFmt::I32 => r.read_i32_le()? as f64,
                NumFmt::F32 => r.read_f32_le()? as f64,
                NumFmt::U8  => r.read_u8()? as f64,
                NumFmt::I16 => r.read_i16_le()? as f64,
                NumFmt::U16 => r.read_u16_le()? as f64,
            };
            vals.push(raw * mul);
        }
        let value = if count == 1 && mul == 1.0 {
            // Keep as-is (int or float depending on format)
            match fmt {
                NumFmt::I32 | NumFmt::I16 | NumFmt::U16 => TroybinValue::Int(vals[0] as i32),
                _ => TroybinValue::Float(vals[0]),
            }
        } else if count == 1 {
            TroybinValue::Float(vals[0])
        } else {
            TroybinValue::Vec(vals)
        };
        result.push(HashEntry { hash: keys[j], value });
    }
    Ok(result)
}

fn read_strings(r: &mut BinReader, strings_length: usize) -> io::Result<Vec<HashEntry>> {
    // Offsets are stored as u16 numbers
    let offsets = read_numbers(r, NumFmt::U16, 1, 1.0)?;
    let data = r.read_bytes(strings_length)?;
    let mut result = Vec::with_capacity(offsets.len());
    for entry in &offsets {
        let o = match &entry.value {
            TroybinValue::Int(v) => *v as usize,
            TroybinValue::Float(v) => *v as usize,
            _ => 0,
        };
        let mut s = String::new();
        let mut idx = o;
        while idx < data.len() && data[idx] != 0 {
            s.push(data[idx] as char);
            idx += 1;
        }
        result.push(HashEntry { hash: entry.hash, value: sanitize_str(&s) });
    }
    Ok(result)
}

#[derive(Copy, Clone)]
enum NumFmt { I32, F32, U8, I16, U16 }

fn read_new(r: &mut BinReader) -> io::Result<Vec<HashEntry>> {
    let strings_length = r.read_u16_le()? as usize;
    let mut flags = r.read_u16_le()?;
    if flags == 0 {
        flags = r.read_u16_le()?;
    }

    // Read configs for each flag bit (0..15)
    // Format: (NumFmt, count, multiplier) or special cases for bools (5) and strings (12)
    let mut target = Vec::new();

    for i in 0u16..16 {
        if flags & (1 << i) == 0 { continue; }
        let entries = match i {
            0  => read_numbers(r, NumFmt::I32, 1, 1.0)?,
            1  => read_numbers(r, NumFmt::F32, 1, 1.0)?,
            2  => read_numbers(r, NumFmt::U8,  1, 0.1)?,
            3  => read_numbers(r, NumFmt::I16, 1, 1.0)?,
            4  => read_numbers(r, NumFmt::U8,  1, 1.0)?,
            5  => read_bools(r)?,
            6  => read_numbers(r, NumFmt::U8,  3, 0.1)?,
            7  => read_numbers(r, NumFmt::F32, 3, 1.0)?,
            8  => read_numbers(r, NumFmt::U8,  2, 0.1)?,
            9  => read_numbers(r, NumFmt::F32, 2, 1.0)?,
            10 => read_numbers(r, NumFmt::U8,  4, 0.1)?,
            11 => read_numbers(r, NumFmt::F32, 4, 1.0)?,
            12 => read_strings(r, strings_length)?,
            13 => read_numbers(r, NumFmt::I32, 1, 1.0)?,
            _  => Vec::new(),
        };
        target.extend(entries);
    }
    Ok(target)
}

// ── Dictionary ───────────────────────────────────────────────────────────────

fn generate_list(base: &[&str], start: Option<usize>, end: Option<usize>) -> Vec<String> {
    let mut result = Vec::new();
    for &item in base {
        if item.contains("%PLACEHOLDER%") {
            if let (Some(s), Some(e)) = (start, end) {
                for k in s..e {
                    result.push(item.replace("%PLACEHOLDER%", &k.to_string()));
                }
            }
        } else {
            result.push(item.to_string());
        }
    }
    result
}

fn rand_names(mods: &[&str], args: &[String]) -> Vec<String> {
    let mut result: Vec<String> = args.to_vec();
    for arg in args {
        for j in 0..10 {
            result.push(format!("{}{}", arg, j));
        }
        for m in mods {
            result.push(format!("{}{}P", arg, m));
            for l in 0..10 {
                result.push(format!("{}{}P{}", arg, m, l));
            }
        }
    }
    result
}

fn color_names(mods: &[&str], args: &[String]) -> Vec<String> {
    let mut result: Vec<String> = args.to_vec();
    for arg in args {
        for j in 0..25 {
            result.push(format!("{}{}", arg, j));
        }
        for m in mods {
            result.push(format!("{}{}P", arg, m));
            for l in 0..25 {
                result.push(format!("{}{}P{}", arg, m, l));
            }
        }
    }
    result
}

fn flex_names(args: &[&str]) -> Vec<String> {
    let mut result = Vec::new();
    for &a in args {
        result.push(a.to_string());
        result.push(format!("{}_flex", a));
        for j in 0..4 {
            result.push(format!("{}_flex{}", a, j));
        }
    }
    result
}

fn rand_float(args: &[String]) -> Vec<String> { rand_names(&["X", ""], args) }
fn rand_vec2(args: &[String]) -> Vec<String> { rand_names(&["X", "Y"], args) }
fn rand_vec3(args: &[String]) -> Vec<String> { rand_names(&["X", "Y", "Z"], args) }
fn rand_color(args: &[String]) -> Vec<String> { rand_names(&["R", "G", "B", "A"], args) }
fn rand_color_amount(args: &[String]) -> Vec<String> { color_names(&["R", "G", "B", "A"], args) }

fn flex_rand_float(args: &[&str]) -> Vec<String> { rand_float(&flex_names(args)) }
fn flex_rand_vec2(args: &[&str]) -> Vec<String> { rand_vec2(&flex_names(args)) }
fn flex_rand_vec3(args: &[&str]) -> Vec<String> { rand_vec3(&flex_names(args)) }

fn s(v: &[&str]) -> Vec<String> { v.iter().map(|s| s.to_string()).collect() }

const MATERIAL_NAMES: &[&str] = &[
    "MaterialOverrideTransMap", "MaterialOverrideTransSource", "p-trans-sample",
    "MaterialOverride%PLACEHOLDER%BlendMode", "MaterialOverride%PLACEHOLDER%GlossTexture",
    "MaterialOverride%PLACEHOLDER%EmissiveTexture", "MaterialOverride%PLACEHOLDER%FixedAlphaScrolling",
    "MaterialOverride%PLACEHOLDER%Priority", "MaterialOverride%PLACEHOLDER%RenderingMode",
    "MaterialOverride%PLACEHOLDER%SubMesh", "MaterialOverride%PLACEHOLDER%Texture",
    "MaterialOverride%PLACEHOLDER%UVScroll",
];

const PART_FLUID_NAMES: &[&str] = &["fluid-params"];
const PART_GROUP_NAMES: &[&str] = &["GroupPart%PLACEHOLDER%"];
const PART_FIELD_NAMES: &[&str] = &[
    "field-accel-%PLACEHOLDER%", "field-attract-%PLACEHOLDER%",
    "field-drag-%PLACEHOLDER%", "field-noise-%PLACEHOLDER%",
    "field-orbit-%PLACEHOLDER%",
];

const FIELD_NAMES: &[&str] = &["f-localspace", "f-axisfrac"];

fn get_system_names() -> Vec<String> {
    let base: &[&str] = &[
        "AudioFlexValueParameterName", "AudioParameterFlexID", "build-up-time",
        "group-vis", "group-scale-cap",
        "GroupPart%PLACEHOLDER%", "GroupPart%PLACEHOLDER%Type", "GroupPart%PLACEHOLDER%Importance",
        "Override-Offset%PLACEHOLDER%", "Override-Rotation%PLACEHOLDER%", "Override-Scale%PLACEHOLDER%",
        "KeepOrientationAfterSpellCast", "PersistThruDeath", "PersistThruRevive",
        "SelfIllumination", "SimulateEveryFrame", "SimulateOncePerFrame", "SimulateWhileOffScreen",
        "SoundEndsOnEmitterEnd", "SoundOnCreate", "SoundPersistent", "SoundsPlayWhileOffScreen",
        "VoiceOverOnCreate", "VoiceOverPersistent",
    ];
    let mut r = generate_list(base, Some(0), Some(50));
    r.extend(generate_list(MATERIAL_NAMES, Some(0), Some(5)));
    r
}

fn get_group_names() -> Vec<String> {
    let base: &[&str] = &[
        "ExcludeAttachmentType", "KeywordsExcluded", "KeywordsIncluded", "KeywordsRequired",
        "Particle-ScaleAlongMovementVector", "SoundOnCreate", "SoundPersistent",
        "VoiceOverOnCreate", "VoiceOverPersistent",
        "dont-scroll-alpha-UV",
        "e-active", "e-alpharef", "e-beam-segments", "e-censor-policy", "e-disabled",
        "e-life", "e-life-scale", "e-linger", "e-local-orient", "e-period",
        "e-shape-name", "e-shape-scale", "e-shape-use-normal-for-birth",
        "e-soft-in-depth", "e-soft-out-depth", "e-soft-in-depth-delta", "e-soft-out-depth-delta",
        "e-timeoffset", "e-trail-cutoff", "e-trail-smoothing", "e-uvscroll", "e-uvscroll-mult",
        "flag-brighter-in-fow", "flag-disable-z", "flag-disable-y", "flag-groundlayer",
        "flag-ground-layer", "flag-force-animated-mesh-z-write", "flag-projected",
        "p-alphaslicerange", "p-animation", "p-backfaceon", "p-beammode", "p-bindtoemitter",
        "p-coloroffset", "p-colorscale", "p-colortype", "p-distortion-mode", "p-distortion-power",
        "p-falloff-texture", "p-fixedorbit", "p-fixedorbittype", "p-flexoffset", "p-flexscale",
        "p-followterrain", "p-frameRate", "p-frameRate-mult", "p-fresnel",
        "p-life-scale", "p-life-scale-offset", "p-life-scale-symX", "p-life-scale-symY", "p-life-scale-symZ",
        "p-linger", "p-local-orient", "p-lockedtoemitter", "p-mesh", "p-meshtex", "p-meshtex-mult",
        "p-normal-map", "p-numframes", "p-numframes-mult", "p-offsetbyheight", "p-offsetbyradius",
        "p-orientation", "p-projection-fading", "p-projection-y-range",
        "p-randomstartframe", "p-randomstartframe-mult",
        "p-reflection-fresnel", "p-reflection-map",
        "p-reflection-opacity-direct", "p-reflection-opacity-glancing",
        "p-rgba", "p-scalebias", "p-scalebyheight", "p-scalebyradius", "p-scaleupfromorigin",
        "p-shadow", "p-simpleorient", "p-skeleton", "p-skin",
        "p-startframe", "p-startframe-mult", "p-texdiv", "p-texdiv-mult",
        "p-texture", "p-texture-mode", "p-texture-mult", "p-texture-mult-mode", "p-texture-pixelate",
        "p-trailmode", "p-type", "p-uvmode", "p-uvparallax-scale",
        "p-uvscroll-alpha-mult", "p-uvscroll-no-alpha",
        "p-uvscroll-rgb", "p-uvscroll-rgb-clamp", "p-uvscroll-rgb-clamp-mult",
        "p-vec-velocity-minscale", "p-vec-velocity-scale", "p-vecalign", "p-xquadrot-on",
        "pass", "rendermode", "single-particle", "submesh-list", "teamcolor-correction", "uniformscale",
        "ChildParticleName", "ChildSpawnAtBone", "ChildEmitOnDeath", "p-childProb",
        "ChildParticleName%PLACEHOLDER%", "ChildSpawnAtBone%PLACEHOLDER%", "ChildEmitOnDeath%PLACEHOLDER%",
    ];
    let mut r = generate_list(base, Some(0), Some(10));
    r.extend(generate_list(MATERIAL_NAMES, Some(0), Some(5)));
    r.extend(rand_color_amount(&s(&["e-rgba", "p-xrgba"])));
    r.extend(flex_names(&["p-scale", "p-scaleEmitOffset"]));
    r.extend(flex_rand_float(&["e-rate", "p-life", "p-rotvel"]));
    r.extend(flex_rand_vec2(&["e-uvoffset"]));
    r.extend(flex_rand_vec3(&["p-offset", "p-postoffset", "p-vel"]));
    r.extend(rand_color(&s(&["e-censor-modulate", "p-fresnel-color", "p-reflection-fresnel-color"])));
    r.extend(rand_float(&s(&[
        "e-color-modulate", "e-framerate", "p-bindtoemitter", "p-life",
        "p-quadrot", "p-rotvel", "p-scale", "p-xquadrot", "p-xscale", "e-rate",
    ])));
    r.extend(rand_vec2(&s(&[
        "e-ratebyvel", "e-uvoffset", "e-uvoffset-mult", "p-uvscroll-rgb", "p-uvscroll-rgb-mult",
    ])));
    r.extend(rand_vec3(&s(&[
        "Emitter-BirthRotationalAcceleration", "Particle-Acceleration", "Particle-Drag",
        "Particle-Velocity", "e-tilesize", "p-accel", "p-drag", "p-offset", "p-orbitvel",
        "p-postoffset", "p-quadrot", "p-rotvel", "p-scale", "p-vel", "p-worldaccel",
        "p-xquadrot", "p-xrgba-beam-bind-distance", "p-xscale",
    ])));
    r.extend(rand_float(&generate_list(&["e-rotation%PLACEHOLDER%"], Some(0), Some(10))));
    r.extend(generate_list(&["e-rotation%PLACEHOLDER%-axis"], Some(0), Some(10)));
    r.extend(generate_list(PART_FIELD_NAMES, Some(1), Some(10)));
    r.extend(PART_FLUID_NAMES.iter().map(|s| s.to_string()));
    r
}

fn get_field_names() -> Vec<String> {
    let mut r: Vec<String> = FIELD_NAMES.iter().map(|s| s.to_string()).collect();
    r.extend(rand_float(&s(&[
        "f-accel", "f-drag", "f-freq", "f-frequency", "f-period", "f-radius", "f-veldelta",
    ])));
    r.extend(rand_vec3(&s(&["f-accel", "f-direction", "f-pos", "f-axisfrac"])));
    r
}

fn get_fluid_names() -> Vec<String> {
    let base: &[&str] = &[
        "f-accel", "f-buoyancy", "f-denseforce", "f-diffusion", "f-dissipation",
        "f-life", "f-initdensity", "f-movement-x", "f-movement-y", "f-viscosity",
        "f-startkick", "f-rate", "f-rendersize",
        "f-jetdir%PLACEHOLDER%", "f-jetdirdiff%PLACEHOLDER%",
        "f-jetpos%PLACEHOLDER%", "f-jetspeed%PLACEHOLDER%",
    ];
    generate_list(base, Some(0), Some(4))
}

// ── Resolve hashes via dictionary ────────────────────────────────────────────

fn get_values(entries: &[HashEntry], sections: &[String], names: &[String]) -> Vec<String> {
    let h = a_ihash(sections, names);
    let mut found = Vec::new();
    for (_, _, ret) in &h {
        for e in entries {
            if e.hash == *ret {
                match &e.value {
                    TroybinValue::Str(s) => found.push(s.clone()),
                    TroybinValue::Int(v) => found.push(v.to_string()),
                    TroybinValue::Float(v) => found.push(format!("{}", v)),
                    TroybinValue::Vec(v) => found.push(
                        v.iter().map(|x| format!("{}", x)).collect::<Vec<_>>().join(" ")
                    ),
                }
                break;
            }
        }
    }
    found
}

struct ResolvedEntry {
    section: String,
    name: String,
    hash: u32,
}

fn get_fixdict(entries: &[HashEntry]) -> Vec<ResolvedEntry> {
    let groups = get_values(entries, &[String::from("System")],
        &generate_list(PART_GROUP_NAMES, Some(0), Some(50)));
    let fields = get_values(entries, &groups,
        &generate_list(PART_FIELD_NAMES, Some(1), Some(10)));
    let fluids = get_values(entries, &groups, &PART_FLUID_NAMES.iter().map(|s| s.to_string()).collect::<Vec<_>>());

    let dict: Vec<(Vec<String>, Vec<String>)> = vec![
        (groups.clone(), get_group_names()),
        (fields, get_field_names()),
        (fluids, get_fluid_names()),
        (vec![String::from("System")], get_system_names()),
    ];

    let mut result: Vec<ResolvedEntry> = Vec::new();
    for (sections, names) in &dict {
        for (section, name_entry, ret) in a_ihash(sections, names) {
            result.push(ResolvedEntry { section, name: name_entry, hash: ret });
        }
    }
    result
}

struct FixedTroybin {
    values: Vec<Group>,
    unknown_hashes: Vec<HashEntry>,
}

struct Group {
    name: String,
    properties: Vec<Property>,
}

struct Property {
    name: String,
    value: TroybinValue,
}

fn fix(entries: Vec<HashEntry>) -> FixedTroybin {
    let fixd = get_fixdict(&entries);
    let mut groups: Vec<Group> = Vec::new();
    let mut found_hashes: Vec<u32> = Vec::new();

    for fd in &fixd {
        if found_hashes.contains(&fd.hash) { continue; }
        let entry = match entries.iter().find(|e| e.hash == fd.hash) {
            Some(e) => e,
            None => continue,
        };
        let prop = Property { name: fd.name.clone(), value: entry.value.clone() };
        if let Some(g) = groups.iter_mut().find(|g| g.name == fd.section) {
            g.properties.push(prop);
        } else {
            groups.push(Group { name: fd.section.clone(), properties: vec![prop] });
        }
        found_hashes.push(fd.hash);
    }

    let unknown_hashes: Vec<HashEntry> = entries.iter()
        .filter(|e| !found_hashes.contains(&e.hash))
        .cloned()
        .collect();

    FixedTroybin { values: groups, unknown_hashes }
}

// ── Output writer ────────────────────────────────────────────────────────────

fn write_ini(troybin: FixedTroybin) -> String {
    let mut output = String::new();

    let mut groups = troybin.values;
    groups.sort_by(|a, b| a.name.cmp(&b.name));

    for group in &groups {
        output.push_str(&format!("[{}]\r\n", group.name));
        let mut props = group.properties.clone();
        props.sort_by(|a, b| a.name.cmp(&b.name));
        for prop in &props {
            let val = prop.value.format_value();
            output.push_str(&format!("{}={}\r\n", prop.name, val));
        }
        output.push_str("\r\n");
    }

    if !troybin.unknown_hashes.is_empty() {
        output.push_str("[UNKNOWN_HASHES]\r\n");
        for unk in &troybin.unknown_hashes {
            let val = unk.value.format_value();
            output.push_str(&format!("{}={}\r\n", unk.hash, val));
        }
    }

    output
}

// ── Public API ───────────────────────────────────────────────────────────────

impl Clone for Property {
    fn clone(&self) -> Self {
        Property { name: self.name.clone(), value: self.value.clone() }
    }
}

/// Parse a troybin binary buffer and return INI-like text.
pub fn convert_troybin(data: &[u8]) -> Result<String, String> {
    if data.is_empty() {
        return Err("Empty troybin data".to_string());
    }

    let mut reader = BinReader::new(data.to_vec());
    let version = reader.read_u8().map_err(|e| format!("Failed to read version: {}", e))?;

    let entries = match version {
        2 => read_new(&mut reader).map_err(|e| format!("Failed to read v2 troybin: {}", e))?,
        1 => read_old(&mut reader).map_err(|e| format!("Failed to read v1 troybin: {}", e))?,
        _ => return Err(format!("Unknown troybin version: {}", version)),
    };

    let fixed = fix(entries);
    Ok(write_ini(fixed))
}
