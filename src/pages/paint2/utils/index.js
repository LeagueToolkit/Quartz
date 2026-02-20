/**
 * Paint2 Utilities
 * 
 * Optimized parsing and color operations for large VFX files.
 * Key improvements over original Paint.js:
 * - Line-indexed parsing (parse once, update by line number)
 * - No content duplication in memory
 * - Direct line edits without re-parsing
 */

export { parseVfxFile, getEmitterColors } from './parser.js';
export { recolorEmitter, applyPaletteToEmitters, applyPaletteToMaterials } from './colorOps.js';
