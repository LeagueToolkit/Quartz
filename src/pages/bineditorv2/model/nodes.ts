import type {
    EditorEmitter,
    EditorNode,
    JsonBinValue,
    NodePath,
} from '@/lib/api/bineditor';

/* EditorNode tree helpers, ported from bineditorV3/model/nodes.js.
   V3 walked parsed py-text nodes with byte offsets; V2 walks the EditorModel
   projection and edits by NodePath through the Rust session — never text. */

/** Case-insensitive field-key equality (bin hashes are case-insensitive). */
export function sameKey(a: string | null | undefined, b: string | null | undefined): boolean {
    return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
}

/** Direct child with the given field key (case-insensitive). */
export function childByKey(node: EditorNode | null | undefined, key: string): EditorNode | null {
    return (node?.children ?? []).find((c) => sameKey(c.key, key)) ?? null;
}

/** Deep-first descendant with the given field key (case-insensitive). */
export function findDeep(node: EditorNode | null | undefined, key: string): EditorNode | null {
    for (const c of node?.children ?? []) {
        if (sameKey(c.key, key)) return c;
        const r = findDeep(c, key);
        if (r) return r;
    }
    return null;
}

/** Field of an emitter by key (case-insensitive), or null. */
export function fieldByKey(emitter: EditorEmitter, key: string): EditorNode | null {
    return emitter.fields.find((f) => sameKey(f.key, key)) ?? null;
}

/** Stable string identity for a NodePath (paths are opaque; compare via this). */
export function pathKey(path: NodePath): string {
    return JSON.stringify(path);
}

/** `${bin}:${entry}` identity for a top-level entry, disambiguated across the
 *  resident bins (entry indices repeat between bins). */
export function entryKey(bin: number, entry: number): string {
    return `${bin}:${entry}`;
}

/** `${bin}:${emitterKey}` identity for an emitter, disambiguated across the
 *  resident bins (emitter keys derive from system path_hash, which repeats). */
export function emitterId(bin: number, emitterKey: string): string {
    return `${bin}:${emitterKey}`;
}

/** Format a number for display: integers plain, floats trimmed of trailing zeros. */
export function formatNumber(n: number): string {
    if (Number.isInteger(n)) return String(n);
    let s = n.toFixed(6);
    s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
}

/**
 * A compact, live readout of a field's current value, for the collapsed emitter
 * header. Value* structs show their constantValue; options show their value;
 * vectors show their components; structs/lists show a short shape hint.
 */
export function summarizeField(field: EditorNode | null | undefined): string {
    if (!field) return '-';
    if (field.kind === 'primitive') {
        if (field.valueType === 'number') return formatNumber(Number(field.value));
        if (field.valueType === 'bool') return field.value ? 'true' : 'false';
        return String(field.value ?? '');
    }
    if (field.kind === 'vector') {
        return `(${(field.children ?? []).map((c) => formatNumber(Number(c.value))).join(', ')})`;
    }
    if (field.kind === 'option') {
        return field.children?.[0] ? summarizeField(field.children[0]) : '-';
    }
    if (field.kind === 'struct') {
        const cv = childByKey(field, 'constantValue');
        if (cv) return summarizeField(cv);
        // purely animated value (no constantValue): summarize the first dynamics value
        const values = findDeep(field, 'values');
        if (values && values.children?.length) return `${summarizeField(values.children[0])}…`;
        return '-';
    }
    if (field.kind === 'list') return `[${(field.children ?? []).length}]`;
    return '-';
}

/** Depth-first walk of a node tree. */
export function walk(node: EditorNode, fn: (n: EditorNode) => void): void {
    fn(node);
    for (const c of node.children ?? []) walk(c, fn);
}

/** All primitive leaves under a node (value-bearing). */
export function collectLeaves(node: EditorNode): EditorNode[] {
    const out: EditorNode[] = [];
    walk(node, (n) => {
        if (n.kind === 'primitive') out.push(n);
    });
    return out;
}

/** All texture paths referenced by an emitter's fields: [{ path, label }] (deduped). */
export function collectTextures(emitter: EditorEmitter): Array<{ path: string; label: string }> {
    const out: Array<{ path: string; label: string }> = [];
    const seen = new Set<string>();
    for (const f of emitter.fields) {
        for (const leaf of collectLeaves(f)) {
            if (
                leaf.valueType === 'string' &&
                typeof leaf.value === 'string' &&
                /\.(tex|dds|tga|png|jpg|jpeg|bmp)$/i.test(leaf.value) &&
                !seen.has(leaf.value)
            ) {
                seen.add(leaf.value);
                out.push({ path: leaf.value, label: f.key ?? '' });
            }
        }
    }
    return out;
}

function vecToCss(comps: number[]): string {
    const [r = 0, g = 0, b = 0, a = 1] = comps;
    return `rgba(${Math.ceil(r * 254.9)}, ${Math.ceil(g * 254.9)}, ${Math.ceil(b * 254.9)}, ${a})`;
}

/** Colors used by an emitter, for preview swatches: [{ name, colors: ['rgba(...)', …] }]. */
export function collectEmitterColors(
    emitter: EditorEmitter,
): Array<{ name: string; colors: string[] }> {
    const out: Array<{ name: string; colors: string[] }> = [];
    const seen = new Set<string>();
    for (const f of emitter.fields) {
        const isColor = f.className === 'ValueColor' || /color|tint/i.test(f.key ?? '');
        if (!isColor || seen.has(f.key ?? '')) continue;
        const colors: string[] = [];
        if (f.kind === 'vector' && (f.children?.length ?? 0) >= 3) {
            colors.push(vecToCss(vectorComponents(f)));
        } else {
            const cv = childByKey(f, 'constantValue');
            if (cv && cv.kind === 'vector') colors.push(vecToCss(vectorComponents(cv)));
            const dyn = childByKey(f, 'dynamics');
            const values = dyn ? findDeep(dyn, 'values') : null;
            if (values) {
                for (const el of values.children ?? []) {
                    if (el.kind === 'vector') colors.push(vecToCss(vectorComponents(el)));
                }
            }
        }
        if (colors.length) {
            out.push({ name: f.key ?? 'color', colors });
            seen.add(f.key ?? '');
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Scalable targets (bulk multiply / set)
// ---------------------------------------------------------------------------

/**
 * A numeric edit target. Vectors are whole-node targets: the backend edits a
 * vector as ONE BinValue, so per-axis changes merge into a full-vector set.
 */
export type ScalableTarget =
    | { kind: 'scalar'; node: EditorNode }
    | { kind: 'vector'; node: EditorNode };

/** Keys a "scale" multiply must never touch (times, probability tables, key arrays). */
const EXCLUDE_KEYS = new Set(['times', 'probabilitytables', 'keytimes', 'keyvalues']);

/**
 * Numeric targets a bulk multiply should affect: a field's own value when it is
 * a plain number/vector/option, otherwise its `constantValue` plus its
 * `dynamics.values` entries. Ported from V3 collectScalableLeaves.
 */
export function collectScalableLeaves(field: EditorNode): ScalableTarget[] {
    if (field.kind === 'primitive' && field.valueType === 'number') {
        return [{ kind: 'scalar', node: field }];
    }
    if (field.kind === 'vector') return [{ kind: 'vector', node: field }];
    if (field.kind === 'option' && field.children?.[0]) {
        const v = field.children[0];
        if (v.kind === 'primitive' && v.valueType === 'number') return [{ kind: 'scalar', node: v }];
        if (v.kind === 'vector') return [{ kind: 'vector', node: v }];
        return [];
    }

    const out: ScalableTarget[] = [];
    const rec = (node: EditorNode, underConstant: boolean, underValues: boolean): void => {
        if (node.kind === 'primitive') {
            if (node.valueType === 'number' && (underConstant || underValues)) {
                out.push({ kind: 'scalar', node });
            }
            return;
        }
        if (node.kind === 'vector') {
            if (underConstant || underValues) out.push({ kind: 'vector', node });
            return;
        }
        for (const c of node.children ?? []) {
            if (c.key && EXCLUDE_KEYS.has(c.key.toLowerCase())) continue;
            rec(
                c,
                underConstant || sameKey(c.key, 'constantValue'),
                underValues || sameKey(c.key, 'values'),
            );
        }
    };
    rec(field, false, false);
    return out;
}

// ---------------------------------------------------------------------------
// JsonBinValue encoding (leaf commit payloads)
// ---------------------------------------------------------------------------

/* JsonBinValue is a tagged union built dynamically from node metadata, so a
   single controlled cast lives here instead of scattered `as` in components. */
export function mkValue(v: { t: string } & Record<string, unknown>): JsonBinValue {
    return v as unknown as JsonBinValue;
}

const INT_TYPES = new Set(['i8', 'u8', 'i16', 'u16', 'i32', 'u32']);

/** Numeric components of a vector node. */
export function vectorComponents(vec: EditorNode): number[] {
    return (vec.children ?? []).map((c) => Number(c.value ?? 0));
}

/** Re-tag a number with the node's own numType so the Rust apply keeps the variant. */
export function encodeNumber(node: EditorNode, value: number): JsonBinValue {
    const t = node.numType ?? 'f32';
    if (t === 'i64' || t === 'u64') return mkValue({ t, v: String(Math.round(value)) });
    return mkValue({ t, v: INT_TYPES.has(t) ? Math.round(value) : value });
}

/** Boolean payload; numType carries the flag-vs-bool distinction from the projection. */
export function encodeBool(node: EditorNode, value: boolean): JsonBinValue {
    return mkValue({ t: node.numType === 'flag' ? 'flag' : 'bool', v: value });
}

/** String-ish payload (string / hash / file), re-tagged from the node. */
export function encodeString(node: EditorNode, value: string): JsonBinValue {
    const t = node.numType ?? (node.valueType === 'hash' ? 'hash' : 'string');
    return mkValue({ t, v: value });
}

/** Whole-vector payload for a vector node (rgba components are rounded). */
export function encodeVector(vec: EditorNode, comps: number[]): JsonBinValue {
    const t = vec.vecType ?? `vec${comps.length}`;
    return mkValue({ t, v: t === 'rgba' ? comps.map((c) => Math.round(c)) : comps });
}

/** Whole-vector payload with one axis replaced (per-axis merge). */
export function encodeVectorSet(vec: EditorNode, index: number, value: number): JsonBinValue {
    const comps = vectorComponents(vec);
    comps[index] = value;
    return encodeVector(vec, comps);
}

/** Option payload wrapping an inner value (or null to clear). */
export function encodeOption(option: EditorNode, inner: JsonBinValue | null): JsonBinValue {
    const innerTag = inner ? (inner as unknown as { t: string }).t : null;
    return mkValue({ t: 'option', inner: option.itemType ?? innerTag ?? 'f32', value: inner });
}

/**
 * Encode a whole EditorNode back into a JsonBinValue (used to clone the last
 * list element for "+ item"). Returns null when the subtree contains something
 * that cannot be rebuilt (unsupported nodes, keyless struct fields).
 */
export function encodeNode(node: EditorNode, structTagHint?: 'pointer' | 'embed'): JsonBinValue | null {
    switch (node.kind) {
        case 'primitive': {
            if (node.valueType === 'number') return encodeNumber(node, Number(node.value ?? 0));
            if (node.valueType === 'bool') return encodeBool(node, !!node.value);
            return encodeString(node, String(node.value ?? ''));
        }
        case 'vector':
            return encodeVector(node, vectorComponents(node));
        case 'struct': {
            const t =
                node.numType === 'pointer' || node.numType === 'embed'
                    ? node.numType
                    : structTagHint ?? 'embed';
            const fields: Record<string, JsonBinValue> = {};
            for (const c of node.children ?? []) {
                if (!c.key) return null;
                const v = encodeNode(c);
                if (!v) return null;
                fields[c.key] = v;
            }
            return mkValue({ t, class: node.className ?? '', fields });
        }
        case 'list': {
            const items: JsonBinValue[] = [];
            for (const c of node.children ?? []) {
                const v = encodeNode(c, node.itemType === 'pointer' ? 'pointer' : undefined);
                if (!v) return null;
                items.push(v);
            }
            return mkValue({ t: 'list', item: node.itemType ?? 'f32', items });
        }
        case 'option': {
            const inner = node.children?.[0] ? encodeNode(node.children[0]) : null;
            return encodeOption(node, inner);
        }
        default:
            return null;
    }
}

/** Default JsonBinValue for an empty list's element type ("+ item" on []). */
export function defaultListItem(itemType: string | undefined): JsonBinValue | null {
    const t = itemType ?? 'f32';
    if (t === 'vec2') return mkValue({ t, v: [0, 0] });
    if (t === 'vec3') return mkValue({ t, v: [0, 0, 0] });
    if (t === 'vec4') return mkValue({ t, v: [0, 0, 0, 1] });
    if (t === 'rgba') return mkValue({ t, v: [255, 255, 255, 255] });
    if (t === 'string') return mkValue({ t, v: '' });
    if (t === 'bool' || t === 'flag') return mkValue({ t, v: false });
    if (t === 'hash') return mkValue({ t, v: '0x00000000' });
    if (t === 'i64' || t === 'u64') return mkValue({ t, v: '0' });
    if (t === 'f32' || INT_TYPES.has(t)) return mkValue({ t, v: 0 });
    return null; // pointer/embed/link/map: no safe default
}

// ---------------------------------------------------------------------------
// Dirty tracking + optimistic local mutation
// ---------------------------------------------------------------------------

export type LeafSnapshot = Map<string, unknown>;

/** Snapshot every primitive leaf value of an emitter (baseline for isDirty). */
export function snapshotEmitter(emitter: EditorEmitter): LeafSnapshot {
    const snap: LeafSnapshot = new Map();
    for (const f of emitter.fields) {
        for (const leaf of collectLeaves(f)) snap.set(pathKey(leaf.path), leaf.value);
    }
    return snap;
}

/** An emitter is dirty if any leaf differs from the baseline snapshot (or structure changed). */
export function isDirty(emitter: EditorEmitter, baseline: LeafSnapshot): boolean {
    let count = 0;
    for (const f of emitter.fields) {
        for (const leaf of collectLeaves(f)) {
            count++;
            const key = pathKey(leaf.path);
            if (!baseline.has(key) || baseline.get(key) !== leaf.value) return true;
        }
    }
    return count !== baseline.size;
}

/**
 * Mutate a local EditorNode in place from an applied JsonBinValue, so the
 * container can update its model copy optimistically after bin_editor_apply.
 */
export function applyValueToNode(node: EditorNode, value: JsonBinValue): void {
    const v = value as unknown as { t: string; v?: unknown; value?: unknown };
    if (node.kind === 'vector' && Array.isArray(v.v)) {
        (node.children ?? []).forEach((c, i) => {
            const comp = (v.v as unknown[])[i];
            if (typeof comp === 'number') c.value = comp;
        });
        return;
    }
    if (node.kind === 'option') {
        const inner = node.children?.[0];
        if (inner && v.value) applyValueToNode(inner, v.value as JsonBinValue);
        return;
    }
    if (node.kind === 'primitive') {
        node.value = v.v as number | string | boolean;
    }
}
