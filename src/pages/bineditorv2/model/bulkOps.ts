import type { EditOp, EditorEmitter, EditorNode } from '@/lib/api/bineditor';
import { classify, sameKey } from './categories';
import {
    childByKey,
    collectScalableLeaves,
    encodeBool,
    encodeNumber,
    encodeVector,
    vectorComponents,
} from './nodes';

/* Bulk operations, ported from bineditorV3/model/bulkOps.js. V3 mutated parsed
   text nodes in place; V2 is PURE — every op returns the EditOp[] batch for one
   bin_editor_apply call plus the affected counts. No API calls here. */

export interface BulkCount {
    fields: number;
    emitters: number;
}

export interface BulkResult extends BulkCount {
    edits: EditOp[];
}

/** Fields of an emitter that belong to `category` ('all' = every field; otherwise the field key). */
function fieldsInCategory(emitter: EditorEmitter, category: string): EditorNode[] {
    if (category === 'all') return emitter.fields;
    return emitter.fields.filter((f) => sameKey(classify(f), category));
}

const isLifetimeField = (f: EditorNode): boolean => /lifetime/i.test(f.key ?? '');

/**
 * Multiply every scalable numeric target of the active field (category) across
 * `emitters`. 'all' scales every scalable field. Skips the -1 infinite sentinel
 * for lifetime fields. Vector targets become one whole-vector set each.
 */
export function applyMultiply(
    emitters: EditorEmitter[],
    category: string,
    multiplier: number,
): BulkResult {
    const edits: EditOp[] = [];
    let fields = 0;
    let touched = 0;
    for (const em of emitters) {
        let emitterTouched = false;
        for (const f of fieldsInCategory(em, category)) {
            const targets = collectScalableLeaves(f);
            if (targets.length === 0) continue;
            const skipSentinel = isLifetimeField(f);
            let changed = false;
            for (const t of targets) {
                if (t.kind === 'scalar') {
                    const v = Number(t.node.value ?? 0);
                    if (skipSentinel && v === -1) continue; // infinite/forever sentinel
                    edits.push({ path: t.node.path, value: encodeNumber(t.node, v * multiplier) });
                    changed = true;
                } else {
                    const comps = vectorComponents(t.node);
                    if (skipSentinel && comps.every((c) => c === -1)) continue;
                    const next = comps.map((c) => (skipSentinel && c === -1 ? c : c * multiplier));
                    edits.push({ path: t.node.path, value: encodeVector(t.node, next) });
                    changed = true;
                }
            }
            if (changed) {
                fields++;
                emitterTouched = true;
            }
        }
        if (emitterTouched) touched++;
    }
    return { edits, fields, emitters: touched };
}

/** The editable vector of a field (the field itself, or its constantValue), or null. */
function primaryVector(field: EditorNode): EditorNode | null {
    if (field.kind === 'vector') return field;
    const cv = childByKey(field, 'constantValue');
    if (cv && cv.kind === 'vector') return cv;
    return null;
}

/** How many inputs a "Set" needs for this field: vector arity (3/4) or 1 for scalars. */
export function fieldArity(field: EditorNode): number {
    const v = primaryVector(field);
    return v ? (v.children?.length ?? 1) : 1;
}

/** Arity for the active category across `emitters` (first matching field; default 1). */
export function categoryArity(emitters: EditorEmitter[], category: string): number {
    if (category === 'all') return 1;
    for (const em of emitters) {
        const f = em.fields.find((x) => sameKey(classify(x), category));
        if (f) return fieldArity(f);
    }
    return 1;
}

/**
 * Set the active field across emitters. `values` is an array (1 entry for
 * scalars, X/Y/Z[/W] for vectors; NaN entries leave that axis untouched).
 * Vectors merge per-axis into one whole-vector set; scalars set every scalable
 * target to values[0].
 */
export function applySetVector(
    emitters: EditorEmitter[],
    category: string,
    values: number[],
): BulkResult {
    const edits: EditOp[] = [];
    let fields = 0;
    let touched = 0;
    for (const em of emitters) {
        let emitterTouched = false;
        for (const f of fieldsInCategory(em, category)) {
            const vec = primaryVector(f);
            if (vec) {
                const comps = vectorComponents(vec);
                const next = comps.map((c, i) =>
                    values[i] != null && !Number.isNaN(values[i]) ? values[i] : c,
                );
                edits.push({ path: vec.path, value: encodeVector(vec, next) });
                fields++;
                emitterTouched = true;
            } else {
                const targets = collectScalableLeaves(f);
                if (targets.length === 0) continue;
                for (const t of targets) {
                    if (t.kind === 'scalar') {
                        edits.push({ path: t.node.path, value: encodeNumber(t.node, values[0]) });
                    } else {
                        const next = vectorComponents(t.node).map(() => values[0]);
                        edits.push({ path: t.node.path, value: encodeVector(t.node, next) });
                    }
                }
                fields++;
                emitterTouched = true;
            }
        }
        if (emitterTouched) touched++;
    }
    return { edits, fields, emitters: touched };
}

/** Set boolean fields to `value` across emitters, scoped to `category` ('all' = every flag). */
export function applySetFlag(
    emitters: EditorEmitter[],
    category: string,
    value: boolean,
): BulkResult {
    const edits: EditOp[] = [];
    let fields = 0;
    let touched = 0;
    for (const em of emitters) {
        let emitterTouched = false;
        const targets = fieldsInCategory(em, category).filter(
            (f) => f.kind === 'primitive' && f.valueType === 'bool',
        );
        for (const f of targets) {
            edits.push({ path: f.path, value: encodeBool(f, value) });
            fields++;
            emitterTouched = true;
        }
        if (emitterTouched) touched++;
    }
    return { edits, fields, emitters: touched };
}

/** How many fields / emitters a multiply in `category` would touch (preview; no edits). */
export function countAffected(emitters: EditorEmitter[], category: string): BulkCount {
    let fields = 0;
    let touched = 0;
    for (const em of emitters) {
        let emitterTouched = false;
        for (const f of fieldsInCategory(em, category)) {
            if (collectScalableLeaves(f).length > 0) {
                fields++;
                emitterTouched = true;
            }
        }
        if (emitterTouched) touched++;
    }
    return { fields, emitters: touched };
}
