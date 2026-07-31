/* One animation clip card.
 *
 * Mirrors ParticleSystemItem's chrome exactly - same `.particle-div` card, same
 * 40px expander column with the same ▶/▼ and hover tint, same title row height -
 * so the two modes are visually interchangeable and the columns don't shift when
 * you flip the toggle. Only the middle content differs.
 *
 * What a clip row adds over a system row:
 *   - a type badge (Atomic / Sequencer / Selector / ...)
 *   - a subtitle: .anm file, track name, mask name
 *   - a validation strip when this clip's references don't resolve
 *
 * All three were computable in the legacy page and none were shown; the mask and
 * track names in particular required expanding the clip to discover.
 *
 * Editing lives INSIDE the expanded body, never in a modal. The collapsed row is
 * unchanged, so a 100-clip list still scans the way it did before; the fields
 * only appear for the one clip you opened. Field rows are AnmFieldRow, so the
 * clip's own fields and its events' fields behave identically.
 */

import React, { useCallback, useRef, useState } from 'react';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { confirm } from '@tauri-apps/plugin-dialog';
import EventItem from './EventItem';
import AnmFieldRow from './AnmFieldRow';
import ClipFields from './ClipFields';
import { useAnmEditContext } from './AnmEditContext';
import { NEW_EVENT_KINDS } from '../eventEditFields';
import { usePortDrag, usePortDropZone } from '../../usePortDrag';
import type { AnmValue, ClipField } from '@/lib/api/vfxAnm';
import type { AnmSystem } from '../anmModel';
import { isAnmEmitter } from '../anmModel';

interface ClipItemProps {
    system: AnmSystem;
    isCollapsed: boolean;
    toggleCollapse: (key: string) => void;
}

/* The event currently being dragged.
 *
 * Module scope, deliberately. A drop is handled by the card the cursor is OVER,
 * which is a different component instance than the one the drag started from,
 * so per-card state cannot carry the payload across. PortDragPayload itself
 * only carries names, and a name is not enough: an event has to be addressed by
 * its BinAddr. One drag can be in flight at a time, so one slot is sufficient.
 *
 * `sessionId` is what makes a CROSS-COLUMN drop detectable. A BinAddr is only
 * meaningful inside the session it came from, and this slot is shared by both
 * columns, so without it a donor event dropped on a target clip sent the
 * donor's address into the target's session and failed deep in Rust with
 * "Event no longer resolves". */
let dragged: {
    path: AnmSystem['path'];
    sourceClipKey: string;
    index: number;
    sessionId: number | null;
} | null = null;

/** The clip currently being dragged, for the same reason as `dragged` above:
 *  the drop lands on a component that never saw the drag start. */
export let draggedClip: { path: AnmSystem['path']; sessionId: number | null } | null = null;

/** Clear the clip handoff once a drop has consumed it. */
export function takeDraggedClip() {
    const carried = draggedClip;
    draggedClip = null;
    return carried;
}

/** An unresolved key renders as its hash; mark it so it reads as "unnamed"
 *  rather than as corrupt data. */
function ClipName({ name }: { name: string }) {
    const isHash = /^0x[0-9a-f]{8}$/i.test(name);
    return <span className={isHash ? 'anm-clip__hash' : undefined}>{name}</span>;
}

function ClipItem({ system, isCollapsed, toggleCollapse }: ClipItemProps) {
    const meta = system.anm;
    const edit = useAnmEditContext();
    const editable = !!edit && !edit.disabled;
    const rowKey = `clip:${system.key}`;
    const busy = edit?.busyKey === rowKey;

    const [adding, setAdding] = useState(false);
    /* Events created in this card's lifetime, so only THEY carry the hash-name
       note. Keyed by the event's map key, which is what the note is about. */
    const [createdKeys, setCreatedKeys] = useState<Set<string>>(new Set());

    /* Drag bookkeeping. Port cannot use the HTML5 drag API: on WebView2 Tauri's
       native drag-drop owns the webview's IDropTarget and eats DOM dragstart /
       dragover / drop. usePortDrag is the pointer-based replacement every other
       Port row already uses, so events reuse it rather than inventing a second
       convention that would silently not fire. */
    const { startDrag, dragging } = usePortDrag();
    const cardRef = useRef<HTMLDivElement>(null);
    const [isDropOver, setIsDropOver] = useState(false);

    const anmFile = meta.anmPath ? meta.anmPath.split(/[\\/]/).pop() : null;

    const commit = useCallback(
        (field: ClipField, value: AnmValue) => {
            void edit?.setClipField(rowKey, system.path, field, value);
        },
        [edit, rowKey, system.path],
    );

    const handleRename = useCallback(
        (value: AnmValue) => {
            if (typeof value !== 'string' || !value || value === system.name) return;
            /* Renaming rekeys the clip but does NOT rewrite the references to
               it, so another clip's mClipNameList or condition branch can be
               left pointing at a name that no longer exists. Confirm only when
               there is actually something to dangle. */
            const risky = meta.memberCount > 0 || meta.warnings.length > 0;
            const run = async () => {
                if (risky) {
                    const ok = await confirm(
                        'References to the old name are not updated, so any clip that ' +
                            'sequences or branches to this one will dangle until you fix it. ' +
                            'The card will flag the dangling reference afterwards.',
                        { title: `Rename "${system.name}" to "${value}"?`, kind: 'warning' },
                    );
                    if (!ok) return;
                }
                await edit?.renameClip(rowKey, system.path, value);
            };
            void run();
        },
        [edit, rowKey, system.path, system.name, meta.memberCount, meta.warnings.length],
    );

    const handleDelete = useCallback(() => {
        if (!edit) return;
        const extra =
            meta.memberCount > 0
                ? `It sequences ${meta.memberCount} clip${meta.memberCount === 1 ? '' : 's'}; those clips stay, but this queue is lost.`
                : 'This removes the clip and every event on it.';
        void confirm(extra, { title: `Delete the clip "${system.name}"?`, kind: 'warning' }).then(
            (ok) => {
                if (ok) void edit.deleteClip(rowKey, system.path);
            },
        );
    }, [edit, rowKey, system.name, system.path, meta.memberCount]);

    const handleAddEvent = useCallback(
        async (kind: string) => {
            if (!edit) return;
            setAdding(false);
            /* Named automatically rather than prompted. Tauri blocks
               `window.prompt` (as it does `window.confirm`), and there is no
               plugin equivalent for text entry. Auto-naming is also the better
               behaviour: the map is hash-keyed, so a typed name is only
               recoverable if it happens to be in the hash dictionary, and a
               freshly invented one never is. The row is renameable in place
               afterwards, which is the same edit without the dead end. */
            const name = `${kind}_${Date.now().toString(36)}`;
            const ok = await edit.createEvent(rowKey, system.path, { name, kind });
            if (!ok) return;
            /* fnv1a32 of the name, lowercase, which is exactly how the read
               layer will present the key it could not resolve. Computing it
               here is what lets the note attach to the right row. */
            setCreatedKeys((prev) => {
                const next = new Set(prev);
                next.add(`0x${fnv1a32(name).toString(16).padStart(8, '0')}`);
                return next;
            });
        },
        [edit, rowKey, system.path],
    );

    /* A clip card accepts an event drop: from another clip it is a move, from
       this clip it is a reorder. Registered even when read-only so the zone id
       stays stable; `accepts` is what gates it. */
    usePortDropZone(
        `anm-clip-${system.key}`,
        cardRef,
        (payload) => editable && payload.kind === 'emitter',
        (payload) => {
            if (payload.kind !== 'emitter') return;
            /* Read the address from the module-scoped handoff, not from this
               card: the drop fires on the DESTINATION card, which never saw the
               drag start and has no way to know what is being carried. */
            const carried = dragged;
            dragged = null;
            if (!carried) return;

            /* A drop from the OTHER column is a port, not a move: `move_event`
               relocates a map entry within one session, while a port copies the
               donor's subtree across and brings the VFX systems its particle
               events reference. Distinguished by session, since a BinAddr is
               only meaningful inside the session it came from. */
            if (carried.sessionId !== edit?.sessionId) {
                if (!edit?.portEventIn) {
                    edit?.reportError('Load both a target and a donor bin to port events.');
                    return;
                }
                void edit.portEventIn(rowKey, carried.path, system.path);
                return;
            }

            if (carried.sourceClipKey === system.key) {
                // Within the clip: the card-level zone can only mean "to the
                // end" unambiguously; a precise slot needs a per-row zone.
                const last = system.emitters.length - 1;
                if (carried.index !== last && last >= 0) {
                    void edit?.reorderEvent(rowKey, carried.path, last);
                }
                return;
            }
            void edit?.moveEvent(rowKey, carried.path, system.path);
        },
        setIsDropOver,
    );

    const onEventDragStart = useCallback(
        (emitter: AnmSystem['emitters'][number], index: number, e: React.PointerEvent) => {
            dragged = {
                path: emitter.path,
                sourceClipKey: system.key,
                index,
                sessionId: edit?.sessionId ?? null,
            };
            startDrag(
                {
                    kind: 'emitter',
                    sourceType: 'target',
                    sourceSystemKey: system.key,
                    emitterName: emitter.key,
                    label: emitter.name || 'event',
                },
                e,
            );
        },
        [startDrag, system.key],
    );

    /* Clip-level rows. Only the fields the class actually has: true/false clip
       exist on a conditionBool and nowhere else, and offering them everywhere
       would invite writes the backend has to reject. */
    const condition = meta.kind.type === 'conditionBool' ? meta.kind : null;

    /* Read structurally rather than off the type. `AnmSystemMeta` does not
       declare the clip's frame span yet, but `ClipInfo` carries it, so the day
       anmModel.ts forwards the two fields these rows start reading without
       another change here. */
    const framed = meta as unknown as { startFrame?: number | null; endFrame?: number | null };
    const clipStartFrame = framed.startFrame ?? null;
    const clipEndFrame = framed.endFrame ?? null;
    const isDragSource = dragging?.kind === 'emitter' && dragging.sourceSystemKey === system.key;

    return (
        <div
            ref={cardRef}
            className={`particle-div${isDropOver ? ' port-drop-active' : ''}`}
            style={{ userSelect: 'none', opacity: isDragSource ? 0.85 : 1 }}
        >
            <div
                className="particle-title-div"
                /* The header is the clip's drag handle, matching how a VFX
                   system row drags. Interactive controls opt out via
                   `data-no-drag` so the chevron and the field inputs still
                   behave as controls rather than starting a drag. */
                onPointerDown={(e) => {
                    const tgt = e.target as HTMLElement;
                    if (
                        tgt.closest('button') ||
                        tgt.closest('input') ||
                        tgt.closest('[data-no-drag]')
                    ) {
                        return;
                    }
                    draggedClip = { path: system.path, sessionId: edit?.sessionId ?? null };
                    startDrag({ kind: 'system', systemKey: system.key, label: system.name }, e);
                }}
                style={{ cursor: 'default', padding: 0, display: 'flex', alignItems: 'stretch', minHeight: '42px' }}
            >
                <div
                    data-no-drag
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleCollapse(system.key);
                    }}
                    style={{
                        width: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        borderRight: '1px solid var(--border)',
                        backgroundColor: 'color-mix(in oklab, var(--bg-hover) 30%, transparent)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'color-mix(in oklab, var(--bg-hover) 30%, transparent)')}
                    title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                    <span style={{ fontSize: '14px', opacity: 0.9, color: 'var(--accent-primary)' }}>
                        {isCollapsed ? '▶' : '▼'}
                    </span>
                </div>

                <div
                    className="flex-1 flex items-center"
                    style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}
                >
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                            className="ellipsis"
                            style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem' }}
                        >
                            <ClipName name={system.name} />
                        </div>
                    </div>

                    <span className="anm-clip__kind">{meta.kindLabel}</span>
                    {meta.loops && <span className="port-relation-badge">LOOP</span>}
                    {/* A composite sequences other clips and holds no events of
                        its own, so report members instead of a count of zero. */}
                    <span
                        style={{
                            flexShrink: 0,
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.72rem',
                        }}
                        title={
                            meta.memberCount > 0
                                ? `${meta.memberCount} clip${meta.memberCount === 1 ? '' : 's'} sequenced`
                                : `${meta.eventCount} event${meta.eventCount === 1 ? '' : 's'}`
                        }
                    >
                        {meta.memberCount > 0 ? `${meta.memberCount}▸` : meta.eventCount}
                    </span>
                    {editable && (
                        <button
                            type="button"
                            data-no-drag
                            className="anm-clip__del"
                            disabled={busy}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDelete();
                            }}
                            title="Delete this clip"
                        >
                            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </button>
                    )}
                </div>
            </div>

            {meta.warnings.map((w, i) => (
                <div className="anm-clip__warn" key={i}>
                    <span aria-hidden>⚠</span>
                    <span>{w}</span>
                </div>
            ))}

            {!isCollapsed && edit?.lastError && edit.busyKey === null && (
                <div className="anm-clip__warn anm-clip__warn--error">
                    <span aria-hidden>✕</span>
                    <span>{edit.lastError}</span>
                </div>
            )}

            {/* Clip-level properties, above the events, matching the bin: the
                clip writes mTrackDataName / mMaskDataName before mEventDataMap. */}
            {!isCollapsed && (
                <ClipFields
                    name={system.name}
                    trackDataName={meta.trackDataName}
                    maskDataName={meta.maskDataName}
                    startFrame={clipStartFrame}
                    endFrame={clipEndFrame}
                    loops={meta.loops}
                    isCondition={!!condition}
                    trueClip={condition?.trueClip ?? null}
                    falseClip={condition?.falseClip ?? null}
                    busy={busy}
                    editable={editable}
                    onCommit={commit}
                    onRename={handleRename}
                />
            )}

            {!isCollapsed &&
                system.emitters.map((emitter, i) =>
                    isAnmEmitter(emitter) ? (
                        <EventItem
                            key={emitter.key}
                            emitter={emitter}
                            index={i}
                            justCreated={createdKeys.has(emitter.anm.eventKey)}
                            onDragStart={editable ? onEventDragStart : undefined}
                        />
                    ) : null,
                )}

            {!isCollapsed && system.emitters.length === 0 && (
                <div
                    style={{
                        padding: '0.5rem 0.75rem',
                        margin: '0.25rem 0.5rem',
                        color: 'var(--text-muted)',
                        fontSize: '0.8rem',
                    }}
                >
                    {meta.memberCount > 0
                        ? `Sequences ${meta.memberCount} clip${meta.memberCount === 1 ? '' : 's'}; its events live on those clips.`
                        : 'No events in this clip'}
                </div>
            )}

            {!isCollapsed && editable && (
                <div className="anm-clip__add">
                    {adding ? (
                        NEW_EVENT_KINDS.map((k) => (
                            <button
                                key={k.kind}
                                type="button"
                                data-no-drag
                                className="anm-clip__add-kind"
                                disabled={busy}
                                onClick={() => void handleAddEvent(k.kind)}
                            >
                                {k.label}
                            </button>
                        ))
                    ) : (
                        <button
                            type="button"
                            data-no-drag
                            className="anm-clip__add-btn"
                            disabled={busy}
                            onClick={() => setAdding(true)}
                        >
                            <AddIcon sx={{ fontSize: 14 }} /> Add event
                        </button>
                    )}
                    {adding && (
                        <button
                            type="button"
                            data-no-drag
                            className="anm-clip__add-kind"
                            onClick={() => setAdding(false)}
                        >
                            Cancel
                        </button>
                    )}
                </div>
            )}

            {/* Last, as in the bin: mAnimationResourceData is written after the
                event map. Full path in the tooltip, filename inline. */}
            {!isCollapsed && (anmFile || editable) && (
                <div className="anm-clip__anm" title={meta.anmPath ?? undefined}>
                    <AnmFieldRow
                        label="Animation"
                        value={meta.anmPath}
                        type="text"
                        busy={busy}
                        editable={editable}
                        title={meta.anmPath ?? undefined}
                        onCommit={(v) => commit('anmPath', v)}
                    />
                </div>
            )}
        </div>
    );
}

/* fnv1a32 over the lowercased name, the hash the bin's clip and event maps are
   keyed by. Here only to predict what a just-created entry will read back as,
   so the note can attach to the right row; nothing depends on it being right. */
function fnv1a32(name: string): number {
    let h = 0x811c9dc5;
    const s = name.toLowerCase();
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i) & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

export default React.memo(ClipItem);
