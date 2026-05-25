/**
 * fixVfxShape — port of ltmao's FixVfxShape (LtMAO/actualScript.py).
 *
 * For every Shape pointer inside a VfxEmitterDefinitionData (under either
 * ComplexEmitterDefinitionData or SimpleEmitterDefinitionData of a
 * VfxSystemDefinitionData entry), this rewrites the legacy Shape pointer to
 * one of three new shape pointer types based on the legacy contents, and
 * extracts BirthTranslation onto a new sibling NewBirthTranslation field.
 *
 * Returns a stats object so callers can surface what was changed.
 */

import { FNV1a } from '../../jsritofile/helper.js';
import { BINField } from '../../jsritofile/binReader.js';
import { BINType } from '../../jsritofile/binTypes.js';

const H = {}; // hex-hash cache (field name -> 8-char lowercase hex)
function h(name) {
    if (!H[name]) H[name] = (FNV1a(name) >>> 0).toString(16).padStart(8, '0');
    return H[name];
}

// Hex type-hashes the original script hardcodes (these are pre-computed,
// presumably FNV1a hashes of unknown structure names — kept verbatim).
const HASH_TYPE_RADIUS_SHAPE = '3dbe415d'; // shape with Radius (+ optional Height) + Flags
const HASH_TYPE_VEC3_SHAPE   = 'ee39916f'; // shape with single vec3 EmitOffset
const HASH_TYPE_EMPTY_SHAPE  = '4f4e2ed7'; // default empty shape (fallback)
const HASH_TYPE_BIRTH_TRANSLATION = '68dc32b6'; // new BirthTranslation embed type

function eq(a, b) {
    return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

function isEmitterListHash(hash) {
    return eq(hash, h('ComplexEmitterDefinitionData')) || eq(hash, h('SimpleEmitterDefinitionData'));
}

function findSubField(field, name) {
    if (!field || !Array.isArray(field.data)) return null;
    const target = h(name);
    return field.data.find((f) => f && eq(f.hash, target)) || null;
}

// Mutates `emitter.data` in place. Returns 1 if this shape attribute was
// rewritten, 0 otherwise.
function fixShapeAttribute(emitter, attribute, stats) {
    if (!Array.isArray(attribute.data) || attribute.data.length === 0) return 0;

    const facts = {
        EmitRotationAnglesKeyValues: false,
        EmitRotationAxesShit: false,
        Flags: false,
        KeepItAs4f4e2ed7: false,
        Radius: undefined,
        Height: undefined,
    };

    for (const sub of attribute.data) {
        if (!sub || !sub.hash) continue;

        // BirthTranslation: extract first ConstantValue Vec3 and promote it to
        // a new sibling field on the emitter.
        if (eq(sub.hash, h('BirthTranslation')) && Array.isArray(sub.data)) {
            for (let i = 0; i < sub.data.length; i++) {
                const inner = sub.data[i];
                if (!inner) continue;
                if (eq(inner.hash, h('ConstantValue')) && inner.type === BINType.VEC3) {
                    const newField = new BINField();
                    newField.hash = h('NewBirthTranslation');
                    newField.type = BINType.EMBED;
                    newField.hashType = HASH_TYPE_BIRTH_TRANSLATION;
                    newField.data = [inner]; // wrap the ConstantValue vec3 as the embed's sole sub-field
                    emitter.data.push(newField);
                    sub.data = [];
                    stats.birthTranslationsLifted++;
                    break;
                }
            }
            sub.data = [];
            continue;
        }

        // EmitOffset: read Radius from ConstantValue.x; check Dynamics flags.
        if (eq(sub.hash, h('EmitOffset'))) {
            for (const innerEmit of (sub.data || [])) {
                if (!innerEmit || !innerEmit.hash) continue;
                if (eq(innerEmit.hash, h('ConstantValue')) && Array.isArray(innerEmit.data) && innerEmit.data.length >= 2) {
                    facts.Radius = innerEmit.data[0]; // x
                    facts.Height = innerEmit.data[1]; // y (matches Python's quirky "lmao?" comment)
                }
                if (eq(innerEmit.hash, h('Dynamics'))) {
                    for (const tableData of (innerEmit.data || [])) {
                        if (eq(tableData?.hash, h('ProbabilityTables'))) {
                            for (const tbl of (tableData.data || [])) {
                                for (const inner of (tbl.data || [])) {
                                    if (eq(inner?.hash, h('KeyValues')) && Array.isArray(inner.data) && inner.data.length >= 2) {
                                        if (inner.data[0] === 0 && inner.data[1] >= 1) facts.Flags = true;
                                        else if (inner.data[0] === -1 && inner.data[1] === 1) facts.KeepItAs4f4e2ed7 = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            continue;
        }

        // EmitRotationAngles: ValueFloat[] -> Dynamics -> ProbabilityTables -> KeyValues
        if (eq(sub.hash, h('EmitRotationAngles'))) {
            for (const valueFloat of (sub.data || [])) {
                for (const stuff of (valueFloat?.data || [])) {
                    if (eq(stuff?.hash, h('Dynamics'))) {
                        for (const tableData of (stuff.data || [])) {
                            if (eq(tableData?.hash, h('ProbabilityTables'))) {
                                for (const tbl of (tableData.data || [])) {
                                    for (const inner of (tbl.data || [])) {
                                        if (eq(inner?.hash, h('KeyValues')) && Array.isArray(inner.data) && inner.data.length >= 2) {
                                            if (inner.data[0] === 0 && inner.data[1] > 1) facts.EmitRotationAnglesKeyValues = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            continue;
        }

        // EmitRotationAxes: canonical Y/Z axis pair detection
        if (eq(sub.hash, h('EmitRotationAxes'))) {
            if (Array.isArray(sub.data) && sub.data.length === 2) {
                const a = sub.data[0], b = sub.data[1];
                if (Array.isArray(a) && Array.isArray(b) && Math.trunc(a[1]) === 1 && Math.trunc(b[2]) === 1) {
                    facts.EmitRotationAxesShit = true;
                }
            }
            continue;
        }
    }

    // Decision matrix (mirrors the original script).
    const originalLen = attribute.data.length;
    const originalSole = attribute.data[0];

    if (!facts.KeepItAs4f4e2ed7 && facts.EmitRotationAnglesKeyValues && facts.EmitRotationAxesShit) {
        attribute.hash = h('NewShapeHash');
        attribute.type = BINType.POINTER;
        attribute.hashType = HASH_TYPE_RADIUS_SHAPE;
        attribute.data = [];

        const radius = new BINField();
        radius.type = BINType.F32;
        radius.hash = h('Radius');
        radius.data = Number(facts.Radius ?? 0);
        attribute.data.push(radius);

        // Bugfix: original Python appends `radius` twice here; we append the actual height.
        if (facts.Height) {
            const height = new BINField();
            height.type = BINType.F32;
            height.hash = h('Height');
            height.data = Number(facts.Height);
            attribute.data.push(height);
        }

        if (facts.Flags) {
            const flags = new BINField();
            flags.type = BINType.U8;
            flags.hash = h('Flags');
            flags.data = 1;
            attribute.data.push(flags);
        }
        stats.shapesRewrittenRadius++;
        return 1;
    }

    if (
        originalLen === 1 &&
        originalSole &&
        eq(originalSole.hash, h('EmitOffset')) &&
        Array.isArray(originalSole.data) &&
        originalSole.data[0] &&
        originalSole.data[0].type === BINType.EMBED && // ConstantValue wrapper is an embed
        Array.isArray(originalSole.data[0].data) &&
        originalSole.data[0].data[0] &&
        originalSole.data[0].data[0].type === BINType.VEC3
    ) {
        // Original: takes attribute.data[0].data[0] which is the ConstantValue field
        // whose .data is the vec3 array.
        attribute.hash = h('NewShapeHash');
        attribute.type = BINType.POINTER;
        attribute.hashType = HASH_TYPE_VEC3_SHAPE;

        const constantValueField = originalSole.data[0].data[0];
        const emitoffset = new BINField();
        emitoffset.type = BINType.VEC3;
        emitoffset.hash = h('EmitOffset');
        emitoffset.data = constantValueField.data; // [x, y, z]
        attribute.data = [emitoffset];
        stats.shapesRewrittenVec3++;
        return 1;
    }

    // Fallback: default empty shape.
    attribute.hash = h('NewShapeHash');
    attribute.type = BINType.POINTER;
    attribute.hashType = HASH_TYPE_EMPTY_SHAPE;
    stats.shapesRewrittenEmpty++;
    return 1;
}

/**
 * Walk a parsed BIN and fix every Shape attribute under VfxEmitterDefinitionData.
 * Mutates `bin` in place. Returns a stats object.
 */
export function fixVfxShapeInBin(bin) {
    const stats = {
        shapesRewrittenRadius: 0,
        shapesRewrittenVec3: 0,
        shapesRewrittenEmpty: 0,
        birthTranslationsLifted: 0,
    };
    if (!bin || !Array.isArray(bin.entries)) return stats;

    const VFX_SYSTEM = h('VfxSystemDefinitionData');
    const SHAPE = h('Shape');

    for (const entry of bin.entries) {
        if (!entry || !eq(entry.type, VFX_SYSTEM)) continue;
        for (const data of (entry.data || [])) {
            if (!data || !isEmitterListHash(data.hash)) continue;
            for (const emitter of (data.data || [])) {
                if (!emitter || !Array.isArray(emitter.data)) continue;
                // Snapshot before push: appending NewBirthTranslation while iterating
                // would otherwise risk re-processing it (it isn't Shape so safe, but
                // we snapshot to be defensive against future field-name collisions).
                const attributes = emitter.data.slice();
                for (const attribute of attributes) {
                    if (!attribute || !attribute.hash) continue;
                    if (!eq(attribute.hash, SHAPE)) continue;
                    fixShapeAttribute(emitter, attribute, stats);
                }
            }
        }
    }
    return stats;
}

export default fixVfxShapeInBin;
