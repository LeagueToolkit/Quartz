//! Recolor engine — port of the TS `colorOps.ts` + `ColorHandler.ts`. Operates
//! on the resident tree via the [`super::model::EditIndex`] color targets:
//! reads the current vec4s, computes new ones per mode, writes them back in
//! place (preserving alpha and skipping black/white by default).

use super::model::{ColorSlot, ColorTarget, EditIndex, NodePath};
use ritoshark::bin::BinValue;

/// Recolor modes, matching the TS `RecolorMode`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecolorMode {
    Random,
    RandomKeyframe,
    Linear,
    Shift,
    ShiftHue,
    Materials,
}

impl RecolorMode {
    pub fn from_str(s: &str) -> Option<Self> {
        Some(match s {
            "random" => RecolorMode::Random,
            "random-keyframe" => RecolorMode::RandomKeyframe,
            "linear" => RecolorMode::Linear,
            "shift" => RecolorMode::Shift,
            "shift-hue" => RecolorMode::ShiftHue,
            "materials" => RecolorMode::Materials,
            _ => return None,
        })
    }
    fn is_random(self) -> bool {
        matches!(
            self,
            RecolorMode::Random | RecolorMode::RandomKeyframe | RecolorMode::Materials
        )
    }
}

/// A palette stop: an RGBA color at a normalized time.
#[derive(Debug, Clone, Copy)]
pub struct PaletteStop {
    pub vec4: [f32; 4],
    pub time: f32,
}

/// Recolor parameters, mirroring the TS `RecolorOptions`.
#[derive(Debug, Clone)]
pub struct RecolorOptions {
    pub mode: RecolorMode,
    pub ignore_black_white: bool,
    pub preserve_alpha: bool,
    pub hsl_shift: (f32, f32, f32),
    pub hue_target: Option<f32>,
    /// Seed for the random modes; vary per call so repeated runs differ.
    pub seed: u64,
}

impl Default for RecolorOptions {
    fn default() -> Self {
        RecolorOptions {
            mode: RecolorMode::Random,
            ignore_black_white: true,
            preserve_alpha: true,
            hsl_shift: (0.0, 0.0, 0.0),
            hue_target: None,
            seed: 1,
        }
    }
}

/// Which colors of an emitter to recolor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorTargetSel {
    All,
    Base,
    Birth,
    Fresnel,
    Linger,
}

impl ColorTargetSel {
    fn slots(self) -> &'static [ColorSlot] {
        match self {
            ColorTargetSel::All => &[
                ColorSlot::Color,
                ColorSlot::BirthColor,
                ColorSlot::FresnelColor,
                ColorSlot::LingerColor,
            ],
            ColorTargetSel::Base => &[ColorSlot::Color],
            ColorTargetSel::Birth => &[ColorSlot::BirthColor],
            ColorTargetSel::Fresnel => &[ColorSlot::FresnelColor],
            ColorTargetSel::Linger => &[ColorSlot::LingerColor],
        }
    }
}

/// Recolor the selected emitters' selected color slots. Returns the number of
/// color groups modified. Mutates `bin` in place.
pub fn recolor_emitters(
    bins: &mut [crate::linked_bins::LoadedBin],
    index: &EditIndex,
    emitter_keys: &[String],
    targets: &[ColorTargetSel],
    palette: &[PaletteStop],
    opts: &RecolorOptions,
) -> usize {
    let mut rng = Rng::new(opts.seed);
    let mut modified = 0;

    for emitter_key in emitter_keys {
        let Some(slot_map) = index.emitter_colors.get(emitter_key) else {
            continue;
        };
        for sel in targets {
            for slot in sel.slots() {
                if let Some(target) = slot_map.get(slot) {
                    if recolor_one(bins, target, palette, opts, &mut rng) {
                        modified += 1;
                    }
                }
            }
        }
    }
    modified
}

/// Recolor a single color target (constant + keyframes). Returns true if any
/// node changed.
fn recolor_one(
    bins: &mut [crate::linked_bins::LoadedBin],
    target: &ColorTarget,
    palette: &[PaletteStop],
    opts: &RecolorOptions,
    rng: &mut Rng,
) -> bool {
    // Snapshot the current ordered values (constant first, then keyframes).
    let mut nodes: Vec<NodePath> = Vec::new();
    if let Some(c) = &target.constant {
        nodes.push(c.clone());
    }
    nodes.extend(target.keyframes.iter().cloned());
    if nodes.is_empty() {
        return false;
    }

    let originals: Vec<[f32; 4]> = nodes
        .iter()
        .map(|p| match p.resolve_mut(bins) {
            Some(BinValue::Vec4(v)) => *v,
            _ => [0.0, 0.0, 0.0, 1.0],
        })
        .collect();

    let new_colors = compute_new_colors(&originals, palette, opts, rng);

    let mut changed = false;
    for (i, path) in nodes.iter().enumerate() {
        let original = originals[i];
        if opts.ignore_black_white && is_black_or_white(&original) {
            continue;
        }
        let nc = &new_colors[i];
        let alpha = if opts.preserve_alpha {
            original[3]
        } else {
            nc[3]
        };
        let finalc = [nc[0], nc[1], nc[2], alpha];
        if finalc != original {
            if let Some(BinValue::Vec4(v)) = path.resolve_mut(bins) {
                *v = finalc;
                changed = true;
            }
        }
    }
    changed
}

/// Compute the new color for each input value per mode.
fn compute_new_colors(
    originals: &[[f32; 4]],
    palette: &[PaletteStop],
    opts: &RecolorOptions,
    rng: &mut Rng,
) -> Vec<[f32; 4]> {
    let count = originals.len();
    match opts.mode {
        RecolorMode::Shift | RecolorMode::ShiftHue => originals
            .iter()
            .map(|rgba| {
                if opts.ignore_black_white && is_black_or_white(rgba) {
                    return *rgba;
                }
                if opts.mode == RecolorMode::Shift {
                    let (h, s, l) = opts.hsl_shift;
                    hsl_shift(*rgba, h, s, l)
                } else if let Some(target) = opts.hue_target {
                    let (_, s, l) = to_hsl(*rgba);
                    let mut out = from_hsl(target / 360.0, s, l);
                    out[3] = rgba[3];
                    out
                } else {
                    *rgba
                }
            })
            .collect(),
        _ => {
            // Palette-based: random / random-keyframe / linear / materials.
            if palette.is_empty() {
                return originals.to_vec();
            }
            let use_random = opts.mode.is_random();
            let random_per_keyframe = opts.mode == RecolorMode::RandomKeyframe;
            let single = if use_random && !random_per_keyframe {
                Some(palette[rng.below(palette.len())].vec4)
            } else {
                None
            };
            (0..count)
                .map(|i| {
                    let original = originals[i];
                    if opts.ignore_black_white && is_black_or_white(&original) {
                        return original;
                    }
                    if use_random {
                        if random_per_keyframe {
                            palette[rng.below(palette.len())].vec4
                        } else {
                            single.unwrap()
                        }
                    } else {
                        let t = if count <= 1 {
                            0.0
                        } else {
                            i as f32 / (count - 1) as f32
                        };
                        sample_palette_at(palette, t)
                    }
                })
                .collect()
        }
    }
}

/// Recolor a material color param to a single new color. Returns true if changed.
pub fn recolor_material_param(
    bins: &mut [crate::linked_bins::LoadedBin],
    path: &NodePath,
    new_color: [f32; 4],
    preserve_alpha: bool,
    ignore_black_white: bool,
) -> bool {
    let original = match path.resolve_mut(bins) {
        Some(BinValue::Vec4(v)) => *v,
        _ => return false,
    };
    if ignore_black_white && is_black_or_white(&original) {
        return false;
    }
    let alpha = if preserve_alpha {
        original[3]
    } else {
        new_color[3]
    };
    let finalc = [new_color[0], new_color[1], new_color[2], alpha];
    if finalc == original {
        return false;
    }
    if let Some(BinValue::Vec4(v)) = path.resolve_mut(bins) {
        *v = finalc;
        true
    } else {
        false
    }
}

// ── Color math (port of ColorHandler.ts) ────────────────────────────────────

fn is_black_or_white(rgba: &[f32; 4]) -> bool {
    let (r, g, b) = (rgba[0], rgba[1], rgba[2]);
    (r == 0.0 && g == 0.0 && b == 0.0) || (r == 1.0 && g == 1.0 && b == 1.0)
}

fn to_hsl(rgba: [f32; 4]) -> (f32, f32, f32) {
    let (r, g, b) = (rgba[0], rgba[1], rgba[2]);
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let delta = max - min;
    let l = (max + min) / 2.0;
    if delta == 0.0 {
        return (0.0, 0.0, l);
    }
    let s = if l > 0.5 {
        delta / (2.0 - max - min)
    } else {
        delta / (max + min)
    };
    let mut h = if max == r {
        let mut hue = ((g - b) / delta) % 6.0;
        if g < b {
            hue += 6.0;
        }
        hue
    } else if max == g {
        (b - r) / delta + 2.0
    } else {
        (r - g) / delta + 4.0
    };
    h /= 6.0;
    (h, s, l)
}

fn from_hsl(h: f32, s: f32, l: f32) -> [f32; 4] {
    if s == 0.0 {
        return [l, l, l, 1.0];
    }
    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;
    let conv = |t: f32| -> f32 {
        let mut t = t;
        while t < 0.0 {
            t += 1.0;
        }
        while t > 1.0 {
            t -= 1.0;
        }
        if t < 1.0 / 6.0 {
            p + (q - p) * 6.0 * t
        } else if t < 1.0 / 2.0 {
            q
        } else if t < 2.0 / 3.0 {
            p + (q - p) * (2.0 / 3.0 - t) * 6.0
        } else {
            p
        }
    };
    [conv(h + 1.0 / 3.0), conv(h), conv(h - 1.0 / 3.0), 1.0]
}

fn hsl_shift(rgba: [f32; 4], hue: f32, sat: f32, lig: f32) -> [f32; 4] {
    let (h, s, l) = to_hsl(rgba);
    let mut new_h = h + hue / 360.0;
    if new_h >= 1.0 {
        new_h -= 1.0;
    } else if new_h < 0.0 {
        new_h += 1.0;
    }
    let new_s = (s + sat / 100.0).clamp(0.01, 1.0);
    let new_l = (l + lig / 100.0).clamp(0.01, 1.0);
    let mut out = from_hsl(new_h, new_s, new_l);
    out[3] = rgba[3];
    out
}

/// Linear-interpolate the palette at normalized time `t` (port of samplePaletteAt).
fn sample_palette_at(palette: &[PaletteStop], t_in: f32) -> [f32; 4] {
    if palette.is_empty() {
        return [0.5, 0.5, 0.5, 1.0];
    }
    if palette.len() == 1 {
        return palette[0].vec4;
    }
    let min_t = palette[0].time;
    let max_t = palette[palette.len() - 1].time;
    let t = t_in.clamp(min_t, max_t);

    let mut left = palette[0];
    let mut right = palette[palette.len() - 1];
    for i in 0..palette.len() - 1 {
        if t >= palette[i].time && t <= palette[i + 1].time {
            left = palette[i];
            right = palette[i + 1];
            break;
        }
    }
    let range = right.time - left.time;
    let local = if range == 0.0 {
        0.0
    } else {
        (t - left.time) / range
    };
    [
        left.vec4[0] + (right.vec4[0] - left.vec4[0]) * local,
        left.vec4[1] + (right.vec4[1] - left.vec4[1]) * local,
        left.vec4[2] + (right.vec4[2] - left.vec4[2]) * local,
        left.vec4[3] + (right.vec4[3] - left.vec4[3]) * local,
    ]
}

/// Tiny xorshift PRNG — deterministic per seed so recolor is testable.
struct Rng(u64);
impl Rng {
    fn new(seed: u64) -> Self {
        Rng(seed.max(1))
    }
    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn below(&mut self, n: usize) -> usize {
        if n == 0 {
            0
        } else {
            (self.next_u64() % n as u64) as usize
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hsl_roundtrip(rgba: [f32; 4]) {
        let (h, s, l) = to_hsl(rgba);
        let back = from_hsl(h, s, l);
        for i in 0..3 {
            assert!((back[i] - rgba[i]).abs() < 1e-4, "{:?} != {:?}", back, rgba);
        }
    }

    #[test]
    fn hsl_roundtrips() {
        hsl_roundtrip([0.8, 0.2, 0.3, 1.0]);
        hsl_roundtrip([0.1, 0.6, 0.9, 1.0]);
        hsl_roundtrip([0.5, 0.5, 0.5, 1.0]);
    }

    #[test]
    fn black_and_white_detected() {
        assert!(is_black_or_white(&[0.0, 0.0, 0.0, 1.0]));
        assert!(is_black_or_white(&[1.0, 1.0, 1.0, 0.5]));
        assert!(!is_black_or_white(&[0.5, 0.2, 0.9, 1.0]));
    }

    #[test]
    fn palette_endpoints_and_midpoint() {
        let pal = [
            PaletteStop {
                vec4: [0.0, 0.0, 0.0, 1.0],
                time: 0.0,
            },
            PaletteStop {
                vec4: [1.0, 1.0, 1.0, 1.0],
                time: 1.0,
            },
        ];
        assert_eq!(sample_palette_at(&pal, 0.0), [0.0, 0.0, 0.0, 1.0]);
        assert_eq!(sample_palette_at(&pal, 1.0), [1.0, 1.0, 1.0, 1.0]);
        let mid = sample_palette_at(&pal, 0.5);
        assert!((mid[0] - 0.5).abs() < 1e-6);
    }

    #[test]
    fn shift_hue_preserves_alpha() {
        let out = hsl_shift([0.8, 0.2, 0.2, 0.7], 120.0, 0.0, 0.0);
        assert!((out[3] - 0.7).abs() < 1e-6);
    }
}
