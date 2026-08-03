/* Raw field editor for any node in the animation graph.
 *
 * WHY
 * `eventEditRows` only knows the seven event classes the read layer models.
 * Everything else was unreachable: the bone bindings nested inside a particle
 * event (they live on `ParticleEventDataPair` nodes, not on the event), and the
 * classes that project as `unknown` because nothing models them —
 * `JointSnapEventData`, `FadeEventData`, `SpringPhysicsEventData`,
 * `StateLogicEventData` and friends, which rendered as an opaque hash with no
 * editable row at all.
 *
 * This asks the backend what is ACTUALLY at a path and renders it. Nothing here
 * knows any class, so a class Riot adds next patch is editable without a code
 * change.
 *
 * Containers (embeds, pointers, lists, maps) are not edited in place — they are
 * expanded, which fetches their own children. Only leaves get an input, which is
 * also what the backend enforces.
 */

import { useCallback, useEffect, useState } from 'react';
import { vfxAnmRawNode, type RawField, type RawNode } from '@/lib/api/vfxAnm';
import type { JsonBinValue } from '@/lib/api/bineditor';
import type { VfxPath } from '@/lib/api/vfxSession';

interface RawFieldsProps {
    sessionId: number | null;
    /** The node to project. */
    path: VfxPath;
    /** Bumped by the owner after an edit lands, to force a re-read. */
    revision: number;
    busy: boolean;
    editable: boolean;
    onCommit: (path: VfxPath, value: JsonBinValue) => void;
    /** Create a field on the structure at `path`. */
    onAdd: (parent: VfxPath, name: string, value: JsonBinValue) => void;
    /** Delete the field at `path`, restoring its defaulted state. */
    onRemove: (path: VfxPath) => void;
    /** Nesting depth, for the indent. */
    depth?: number;
}

/* The types a new field can be created as. Deliberately the primitives, not
   every BIN type: a structure or list has no meaningful "empty" seed, and one
   built here would be a shape the class does not expect. Those are added by
   editing the parent that already has them. */
const NEW_FIELD_TYPES = [
    { tag: 'bool', label: 'Bool', seed: { t: 'bool', v: false } },
    { tag: 'f32', label: 'Float', seed: { t: 'f32', v: 0 } },
    { tag: 'i32', label: 'Int', seed: { t: 'i32', v: 0 } },
    { tag: 'u32', label: 'UInt', seed: { t: 'u32', v: 0 } },
    { tag: 'string', label: 'String', seed: { t: 'string', v: '' } },
    { tag: 'hash', label: 'Hash', seed: { t: 'hash', v: '0x00000000' } },
    { tag: 'link', label: 'Link', seed: { t: 'link', v: '0x00000000' } },
] as const satisfies ReadonlyArray<{ tag: string; label: string; seed: JsonBinValue }>;

/** Render a leaf value as the text the input shows. */
function textOf(v: JsonBinValue): string {
    switch (v.t) {
        case 'none':
            return '';
        case 'bool':
        case 'flag':
            return v.v ? 'true' : 'false';
        case 'vec2':
        case 'vec3':
        case 'vec4':
        case 'rgba':
            return v.v.join(', ');
        case 'unsupported':
            return v.desc;
        case 'list':
        case 'pointer':
        case 'embed':
        case 'option':
            return '';
        default:
            return String(v.v);
    }
}

/** Rebuild a value of the SAME tag from edited text. Returns null when the text
 *  cannot produce that type, so a bad edit is refused before it reaches IPC. */
function parseInto(original: JsonBinValue, text: string): JsonBinValue | null {
    const t = original.t;
    const trimmed = text.trim();
    switch (t) {
        case 'bool':
        case 'flag': {
            const lower = trimmed.toLowerCase();
            if (lower === 'true') return { t, v: true };
            if (lower === 'false') return { t, v: false };
            return null;
        }
        case 'string':
        case 'hash':
        case 'file':
        case 'link':
            return { t, v: trimmed };
        case 'i64':
        case 'u64':
            return /^-?\d+$/.test(trimmed) ? { t, v: trimmed } : null;
        case 'vec2':
        case 'vec3':
        case 'vec4':
        case 'rgba': {
            const want = t === 'vec2' ? 2 : t === 'vec3' ? 3 : 4;
            const nums = trimmed.split(',').map((s) => Number(s.trim()));
            if (nums.length !== want || nums.some((n) => !Number.isFinite(n))) return null;
            return { t, v: nums } as JsonBinValue;
        }
        case 'none':
        case 'list':
        case 'pointer':
        case 'embed':
        case 'option':
        case 'unsupported':
            return null;
        default: {
            // The numeric tags (i8/u8/.../f32) all carry a plain number.
            const n = Number(trimmed);
            return Number.isFinite(n) ? ({ t, v: n } as JsonBinValue) : null;
        }
    }
}

function isEditableLeaf(f: RawField): boolean {
    if (f.isContainer) return false;
    return f.value.t !== 'none' && f.value.t !== 'unsupported' && f.value.t !== 'option';
}

function RawFieldRow({
    field, sessionId, revision, busy, editable, onCommit, onAdd, onRemove, depth,
}: { field: RawField } & Omit<RawFieldsProps, 'path'>) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<string | null>(null);

    const canEdit = editable && isEditableLeaf(field);
    const shown = draft ?? textOf(field.value);

    const commit = () => {
        if (draft === null) return;
        const next = parseInto(field.value, draft);
        setDraft(null);
        // Refuse silently rather than send junk: the row snaps back to the real
        // value, which is the same feedback a rejected inline edit gives.
        if (next) onCommit(field.path, next);
    };

    return (
        <div className="anm-raw__row" style={{ paddingLeft: (depth ?? 0) * 12 }}>
            <button
                type="button"
                data-no-drag
                className="anm-raw__name"
                disabled={!field.isContainer}
                onClick={() => field.isContainer && setOpen((v) => !v)}
                title={field.isContainer ? 'Expand' : field.name}
            >
                {field.isContainer && <span className="anm-raw__caret">{open ? '▾' : '▸'}</span>}
                {field.name || '—'}
            </button>

            {field.isContainer ? (
                <span className="anm-raw__type">{field.value.t}</span>
            ) : canEdit ? (
                <input
                    data-no-drag
                    className="anm-raw__input"
                    value={shown}
                    disabled={busy}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            commit();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setDraft(null);
                        }
                    }}
                    onBlur={commit}
                />
            ) : (
                <span className="anm-raw__static">{textOf(field.value) || field.value.t}</span>
            )}

            {/* Only a named field can be removed — a list element or map entry
                would renumber its siblings, which is the parent's business. */}
            {editable && field.key !== 0 && (
                <button
                    type="button"
                    data-no-drag
                    className="anm-raw__del"
                    disabled={busy}
                    title={`Remove ${field.name} (League reads an absent field as its default)`}
                    onClick={() => onRemove(field.path)}
                >
                    ×
                </button>
            )}

            {open && field.isContainer && (
                <div className="anm-raw__children">
                    <RawFields
                        sessionId={sessionId}
                        path={field.path}
                        revision={revision}
                        busy={busy}
                        editable={editable}
                        onCommit={onCommit}
                        onAdd={onAdd}
                        onRemove={onRemove}
                        depth={(depth ?? 0) + 1}
                    />
                </div>
            )}
        </div>
    );
}

/** The "add a field" row. Absent from the bin is the normal state for a
 *  defaulted field, so this is the only way most of a class is reachable. */
function AddFieldRow({
    parent, busy, onAdd,
}: { parent: VfxPath; busy: boolean; onAdd: RawFieldsProps['onAdd'] }) {
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [tag, setTag] = useState<string>(NEW_FIELD_TYPES[0].tag);

    if (!adding) {
        return (
            <button
                type="button"
                data-no-drag
                className="anm-raw__add"
                disabled={busy}
                onClick={() => setAdding(true)}
            >
                + Add field
            </button>
        );
    }

    const submit = () => {
        const seed = NEW_FIELD_TYPES.find((t) => t.tag === tag)?.seed;
        if (!name.trim() || !seed) return;
        onAdd(parent, name.trim(), seed as JsonBinValue);
        setName('');
        setAdding(false);
    };

    return (
        <div className="anm-raw__addrow">
            <input
                data-no-drag
                autoFocus
                className="anm-raw__input"
                placeholder="Field name, or 0x… "
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); submit(); }
                    else if (e.key === 'Escape') { e.preventDefault(); setAdding(false); }
                }}
            />
            <select
                data-no-drag
                className="anm-raw__select"
                value={tag}
                disabled={busy}
                onChange={(e) => setTag(e.target.value)}
            >
                {NEW_FIELD_TYPES.map((t) => (
                    <option key={t.tag} value={t.tag}>{t.label}</option>
                ))}
            </select>
            <button type="button" data-no-drag className="anm-raw__addok" disabled={busy} onClick={submit}>
                Add
            </button>
        </div>
    );
}

export default function RawFields({
    sessionId, path, revision, busy, editable, onCommit, onAdd, onRemove, depth = 0,
}: RawFieldsProps) {
    const [node, setNode] = useState<RawNode | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (sessionId === null) return;
        try {
            setError(null);
            setNode(await vfxAnmRawNode(sessionId, path));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        // `path` is a fresh object each render; serialise it so this does not
        // refetch on every parent render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, JSON.stringify(path)]);

    useEffect(() => {
        void load();
    }, [load, revision]);

    if (error) return <div className="anm-raw__error">{error}</div>;
    if (!node) return <div className="anm-raw__loading">Reading…</div>;

    /* Only a struct takes new named fields. A list or map grows by element, which
       renumbers its siblings' paths — a different operation with a different
       undo story, so it is not offered here. `className` is the tell: the
       backend sets it for embeds and pointers only. */
    const isStruct = node.className !== null;

    return (
        <div className="anm-raw">
            {node.className && depth === 0 && (
                <div className="anm-raw__class">{node.className}</div>
            )}
            {node.fields.length === 0 && (
                <div className="anm-raw__loading">No fields</div>
            )}
            {node.fields.map((f, i) => (
                <RawFieldRow
                    key={`${f.key}-${i}`}
                    field={f}
                    sessionId={sessionId}
                    revision={revision}
                    busy={busy}
                    editable={editable}
                    onCommit={onCommit}
                    onAdd={onAdd}
                    onRemove={onRemove}
                    depth={depth}
                />
            ))}
            {editable && isStruct && (
                <AddFieldRow parent={path} busy={busy} onAdd={onAdd} />
            )}
        </div>
    );
}
