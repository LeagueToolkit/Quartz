import type { EditorNode } from '@/lib/api/bineditor';

/* Widget dispatch, ported from bineditorV3/model/widgets.js onto EditorNode. */

const VALUE_STRUCTS = new Set(['ValueFloat', 'ValueVector2', 'ValueVector3', 'ValueColor']);

export type WidgetKind =
    | 'number'
    | 'vec'
    | 'bool'
    | 'color'
    | 'string'
    | 'texture'
    | 'enum'
    | 'valueStruct'
    | 'struct'
    | 'list'
    | 'unsupported';

// u8 enum label tables (value -> "n - Label"), keyed by lowercased field name.
// Unknown values fall back to a number input.
export const ENUM_LABELS: Record<string, Record<number, string>> = {
    meshrenderflags: { 0: '0 - None', 1: '1 - Ground', 2: '2 - Decal' },
    miscrenderflags: { 0: '0 - None', 1: '1 - Glow', 2: '2 - Distortion' },
    colorlookuptypex: { 0: '0 - Constant', 1: '1 - Particle Lifetime', 2: '2 - Map', 3: '3 - Distance' },
    colorlookuptypey: { 0: '0 - Constant', 1: '1 - Particle Lifetime', 2: '2 - Map', 3: '3 - Distance' },
};

export function enumLabelsFor(key: string | null | undefined): Record<number, string> | null {
    if (!key) return null;
    return ENUM_LABELS[key.toLowerCase()] ?? null;
}

/** Pick a widget kind for a node. */
export function widgetFor(node: EditorNode): WidgetKind {
    if (node.kind === 'vector') {
        const len = node.children?.length ?? 0;
        if (node.vecType === 'vec4' || node.vecType === 'rgba' || len === 4) return 'color';
        return 'vec';
    }
    if (node.kind === 'struct') {
        return VALUE_STRUCTS.has(node.className ?? '') ? 'valueStruct' : 'struct';
    }
    if (node.kind === 'option') {
        const inner = node.children?.[0];
        if (inner && inner.kind === 'vector') {
            return (inner.children?.length ?? 0) === 4 ? 'color' : 'vec';
        }
        return 'number'; // option[f32] etc.
    }
    if (node.kind === 'list') return 'list';
    if (node.kind === 'unsupported') return 'unsupported';

    // primitive
    if (node.valueType === 'bool') return 'bool';
    if (node.valueType === 'string') {
        return typeof node.value === 'string' && /\.(tex|dds|png|tga)$/i.test(node.value)
            ? 'texture'
            : 'string';
    }
    if (node.valueType === 'number') {
        if (node.numType === 'u8' && enumLabelsFor(node.key)) return 'enum';
        return 'number';
    }
    return 'string'; // hash / ident
}
