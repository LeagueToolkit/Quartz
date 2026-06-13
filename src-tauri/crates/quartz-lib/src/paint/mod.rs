//! Paint — native in-memory VFX bin editing.
//!
//! A `.bin` (or `.py`/`.ritobin` text) is parsed once into a resident
//! `ritoshark::bin::Bin` tree held in [`session`]'s registry. The tree is the
//! single source of truth: [`model`] projects it into the VFX view the Paint UI
//! consumes (systems → emitters → colors, plus static materials), and
//! [`recolor`] mutates color/blend nodes in place. Saving serializes the tree
//! back in its original format — no `.bin → text` round-trip for binary files.
//!
//! Replaces the old TypeScript `parser.ts` / `staticMaterialParser.ts` /
//! `colorOps.ts` / `ColorHandler.ts`, which parsed and mutated ritobin *text*.

pub mod model;
pub mod recolor;
pub mod session;

/// FNV-1a 32-bit over the lowercased input — the BIN hash convention for both
/// class names and field names (matches `bin::bin_editor::fnv1a_lower`).
pub(crate) fn fnv1a_lower(s: &str) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for b in s.to_lowercase().bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}
