import type { EditorNode, JsonBinValue, NodePath } from '@/lib/api/bineditor';
import { childByKey, encodeNode, mkValue, vectorComponents } from './nodes';

/* Animated-value (dynamics) editing, ported from bineditorV3/model/dynamics.js.
   V3 spliced ritobin text; V2 builds insert/remove descriptors that the page
   container sends via bin_editor_insert / bin_editor_remove. Pure builders. */

/** A structural edit the container forwards to the session commands. */
export type StructuralOp =
    | { kind: 'insert'; parentPath: NodePath; key?: string; index?: number | null; value: JsonBinValue }
    | { kind: 'remove'; path: NodePath };

// Value-struct -> animated pointer class + keyframe element type.
const ANIM: Record<string, { ptr: string; elem: string; channels: number }> = {
    ValueFloat: { ptr: 'VfxAnimatedFloatVariableData', elem: 'f32', channels: 1 },
    ValueVector2: { ptr: 'VfxAnimatedVector2fVariableData', elem: 'vec2', channels: 2 },
    ValueVector3: { ptr: 'VfxAnimatedVector3fVariableData', elem: 'vec3', channels: 3 },
    ValueColor: { ptr: 'VfxAnimatedColorVariableData', elem: 'vec4', channels: 4 },
    IntegratedValueFloat: { ptr: 'VfxAnimatedFloatVariableData', elem: 'f32', channels: 1 },
    IntegratedValueVector2: { ptr: 'VfxAnimatedVector2fVariableData', elem: 'vec2', channels: 2 },
    IntegratedValueVector3: { ptr: 'VfxAnimatedVector3fVariableData', elem: 'vec3', channels: 3 },
};

export function canAnimate(field: EditorNode | null | undefined): boolean {
    return !!field && field.kind === 'struct' && !!ANIM[field.className ?? ''];
}

export function isAnimated(field: EditorNode | null | undefined): boolean {
    return !!field && !!childByKey(field, 'dynamics');
}

/** The dynamics `times` / `values` lists of an animated field, or nulls. */
export function dynamicsLists(field: EditorNode): {
    dynamics: EditorNode | null;
    times: EditorNode | null;
    values: EditorNode | null;
} {
    const dynamics = childByKey(field, 'dynamics');
    return {
        dynamics,
        times: childByKey(dynamics, 'times'),
        values: childByKey(dynamics, 'values'),
    };
}

/**
 * Turn a Value* field's constant into an animated dynamics curve (1 keyframe at
 * t=0, seeded from constantValue). Exactly the structure V3 spliced as text:
 * pointer VfxAnimatedXVariableData { probabilityTables, times, values }.
 */
export function buildAnimate(field: EditorNode): StructuralOp | null {
    if (!canAnimate(field) || isAnimated(field)) return null;
    const cv = childByKey(field, 'constantValue');
    if (!cv) return null;
    const { ptr, elem, channels } = ANIM[field.className ?? ''];
    const seed =
        cv.kind === 'vector'
            ? mkValue({ t: elem, v: vectorComponents(cv) })
            : mkValue({ t: elem, v: Number(cv.value ?? 0) });
    return {
        kind: 'insert',
        parentPath: field.path,
        key: 'dynamics',
        value: mkValue({
            t: 'pointer',
            class: ptr,
            fields: {
                probabilityTables: mkValue({
                    t: 'list',
                    item: 'pointer',
                    items: Array.from({ length: channels }, () =>
                        mkValue({ t: 'pointer', class: 'VfxProbabilityTableData', fields: {} }),
                    ),
                }),
                times: mkValue({ t: 'list', item: 'f32', items: [mkValue({ t: 'f32', v: 0 })] }),
                values: mkValue({ t: 'list', item: elem, items: [seed] }),
            },
        }),
    };
}

/** Remove a dynamics block without leaving an empty Value* wrapper. Older
 * files often contain dynamics-only values; seed constantValue from the first
 * curve value before removing the curve in that case. */
export function buildDeanimate(field: EditorNode): StructuralOp[] | null {
    const dyn = childByKey(field, 'dynamics');
    if (!dyn) return null;
    const ops: StructuralOp[] = [];
    if (!childByKey(field, 'constantValue')) {
        const values = childByKey(dyn, 'values');
        const first = values?.children?.[0];
        const seed = first ? encodeNode(first) : null;
        if (seed) ops.push({ kind: 'insert', parentPath: field.path, key: 'constantValue', value: seed });
    }
    ops.push({ kind: 'remove', path: dyn.path });
    return ops;
}

/**
 * Append a keyframe (time + value) to an animated field. The new keyframe is
 * blank (zeroed) matching the value shape — never a clone of the last one; its
 * time is last time + 1 (or 0 for an empty curve). Two appends: times, values.
 */
export function buildAddKeyframe(field: EditorNode): StructuralOp[] | null {
    const { times, values } = dynamicsLists(field);
    if (!times || !values) return null;
    const timeKids = times.children ?? [];
    const lastT = timeKids[timeKids.length - 1];
    const newTime = lastT ? Number(lastT.value ?? 0) + 1 : 0;
    const valueKids = values.children ?? [];
    const lastV = valueKids[valueKids.length - 1];
    const elem = ANIM[field.className ?? '']?.elem ?? values.itemType ?? 'f32';
    const newVal =
        lastV && lastV.kind === 'vector'
            ? mkValue({ t: elem, v: vectorComponents(lastV).map(() => 0) })
            : mkValue({ t: elem, v: 0 });
    return [
        { kind: 'insert', parentPath: times.path, index: null, value: mkValue({ t: 'f32', v: newTime }) },
        { kind: 'insert', parentPath: values.path, index: null, value: newVal },
    ];
}

/** Remove keyframe `index` (time + value) from an animated field. */
export function buildRemoveKeyframe(field: EditorNode, index: number): StructuralOp[] | null {
    const { times, values } = dynamicsLists(field);
    const ops: StructuralOp[] = [];
    for (const list of [times, values]) {
        const el = list?.children?.[index];
        if (el) ops.push({ kind: 'remove', path: el.path });
    }
    return ops.length > 0 ? ops : null;
}

/**
 * Clone a list's last element (or a typed default for an empty list) as an
 * append descriptor — V2's "+ item". Returns null when the element type has no
 * safe default and there is nothing to clone.
 */
export function buildAddListItem(
    listNode: EditorNode,
    emptyDefault: JsonBinValue | null,
): StructuralOp | null {
    const kids = listNode.children ?? [];
    const last = kids[kids.length - 1];
    const value = last
        ? encodeNode(last, listNode.itemType === 'pointer' ? 'pointer' : undefined)
        : emptyDefault;
    if (!value) return null;
    return { kind: 'insert', parentPath: listNode.path, index: null, value };
}
