/* One animation event.
 *
 * Adapted from the legacy AniPort's `event-item` shape, which was the right
 * shape: an icon + class-name header, then ONE monospace detail line on an inset
 * background carrying that class's actual fields. Adapted to Quartz's tokens
 * rather than copied - the legacy CSS used its own palette variables.
 *
 * Why the detail line instead of a label/value grid: the fields per class are
 * few (2-4) and short, and a `Key: value | Key: value` line stays readable while
 * scrolling a long clip. A grid turned every event into a tall block and pushed
 * the next event off-screen.
 *
 * Editing keeps that: the summary line IS the collapsed state, and opening the
 * event swaps it for the editable rows. So a clip you are only reading costs
 * exactly what it cost before, and only the event you are working on is tall.
 *
 * `actions` is a slot so the same card serves the read-only view and the
 * editable one without changing shape.
 */

import React, { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { confirm } from '@tauri-apps/plugin-dialog';
import AnmFieldRow from './AnmFieldRow';
import RawFields from './RawFields';
import { useAnmEditContext } from './AnmEditContext';
import { eventEditRows } from '../eventEditFields';
import type { AnmValue, EventField } from '@/lib/api/vfxAnm';
import type { JsonBinValue } from '@/lib/api/bineditor';
import type { VfxPath } from '@/lib/api/vfxSession';
import type { AnmEmitter, AnimEventType } from '../anmModel';

/* Monochrome geometric glyphs, tinted per class, rather than the legacy page's
   emoji: they inherit the theme's colours instead of forcing the OS emoji
   palette into a dark UI, and they sit on the text baseline so the header line
   doesn't shift height per event type. */
const ICONS: Record<AnimEventType, { glyph: string; tint: string }> = {
    particle: { glyph: '✦', tint: 'var(--accent-primary)' },
    sound: { glyph: '♪', tint: '#67e8f9' },
    submeshVisibility: { glyph: '◐', tint: '#a78bfa' },
    faceTarget: { glyph: '☉', tint: '#fbbf24' },
    conformToPath: { glyph: '⤳', tint: '#4ade80' },
    lockRootOrientation: { glyph: '⚓', tint: '#f472b6' },
    stopAnimation: { glyph: '⏹', tint: '#fb7185' },
    unknown: { glyph: '?', tint: 'var(--text-muted)' },
};

interface EventItemProps {
    emitter: AnmEmitter;
    /** Row actions (delete, edit); rendered right of the card. */
    actions?: ReactNode;
    /** Index within the owning clip, for a reorder drop. */
    index?: number;
    /** True when this event was just created, so the card can explain why its
     *  name came back as a hash. */
    justCreated?: boolean;
    /** Begins a pointer drag of this event. Owned by the clip card, which knows
     *  its own key. */
    onDragStart?: (emitter: AnmEmitter, index: number, e: React.PointerEvent) => void;
    /** Drop indicator position relative to this row while a drag hovers it. */
    dropEdge?: 'before' | 'after' | null;
}

function EventItem({ emitter, actions, index = 0, justCreated, onDragStart, dropEdge }: EventItemProps) {
    const meta = emitter.anm;
    const icon = ICONS[meta.eventType] ?? ICONS.unknown;
    const edit = useAnmEditContext();
    const [open, setOpen] = useState(false);

    // `Label: value | Label: value` — the legacy detail line, built from the
    // per-class field list so every class shows what it actually carries.
    const details = meta.fields.map((f) => `${f.label}: ${f.value}`).join('  |  ');

    const rows = open ? eventEditRows(meta.event) : [];
    const rowKey = `event:${emitter.key}`;
    const busy = edit?.busyKey === rowKey;
    const editable = !!edit && !edit.disabled;

    const commit = useCallback(
        (field: EventField, value: AnmValue) => {
            void edit?.setEventField(rowKey, meta.event.addr, field, value);
        },
        [edit, rowKey, meta.event.addr],
    );

    /* Raw edits go straight to the session rather than through `setEventField`,
       which only speaks the typed `EventField` vocabulary. Bumping the revision
       re-reads the node: the projection is what tells the rows what is actually
       in the tree now, and a landed write can change more than the one field
       (a list write renumbers the indices after it). */
    const [rawRevision, setRawRevision] = useState(0);
    const commitRaw = useCallback(
        (path: VfxPath, value: JsonBinValue) => {
            if (!edit?.setRawNode) return;
            void edit.setRawNode(rowKey, path, value).then(() => setRawRevision((r) => r + 1));
        },
        [edit, rowKey],
    );
    const addRaw = useCallback(
        (parent: VfxPath, name: string, value: JsonBinValue) => {
            if (!edit?.addRawField) return;
            void edit.addRawField(rowKey, parent, name, value).then(() => setRawRevision((r) => r + 1));
        },
        [edit, rowKey],
    );
    const removeRaw = useCallback(
        (path: VfxPath) => {
            if (!edit?.removeRawField) return;
            void edit.removeRawField(rowKey, path).then(() => setRawRevision((r) => r + 1));
        },
        [edit, rowKey],
    );

    const handleDelete = useCallback(async () => {
        if (!edit) return;
        // A one-step confirm: the event map is positional, so a mis-click here
        // renumbers every later event as well as losing this one.
        // Tauri blocks window.confirm; the plugin dialog is the supported path.
        const ok = await confirm('This removes the event from the clip.', {
            title: `Delete the ${meta.typeLabel} event "${meta.eventKey}"?`,
            kind: 'warning',
        });
        if (!ok) return;
        void edit.deleteEvent(rowKey, meta.event.addr);
    }, [edit, rowKey, meta.typeLabel, meta.eventKey, meta.event.addr]);

    return (
        <div
            className={`anm-ev${dropEdge ? ` anm-ev--drop-${dropEdge}` : ''}${busy ? ' is-busy' : ''}`}
            data-anm-event-index={index}
            onPointerDown={(e) => {
                if (!onDragStart) return;
                // Never start a drag from a control: the expander, the delete
                // button and every field editor live inside this row.
                const tgt = e.target as HTMLElement;
                if (tgt.closest('button') || tgt.closest('input') || tgt.closest('[data-no-drag]')) return;
                // Stop before the clip card's own pointerdown sees it, matching
                // EmitterItem: both call startDrag and the last write wins.
                e.stopPropagation();
                onDragStart(emitter, index, e);
            }}
            style={onDragStart ? { cursor: 'grab' } : undefined}
        >
            <div className="anm-ev__content">
                <div className="anm-ev__head">
                    {rows.length > 0 || editable ? (
                        <button
                            type="button"
                            data-no-drag
                            className="anm-ev__expander"
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpen((v) => !v);
                            }}
                            title={open ? 'Collapse event' : 'Edit event fields'}
                        >
                            {open ? '▾' : '▸'}
                        </button>
                    ) : null}
                    <span className="anm-ev__icon" style={{ color: icon.tint }} aria-hidden>
                        {icon.glyph}
                    </span>
                    <span className="anm-ev__type">{meta.typeLabel}</span>
                    <span className="anm-ev__key" title={meta.eventKey}>
                        {meta.eventKey}
                    </span>
                    {meta.isLoop && <span className="anm-ev__loop">LOOP</span>}
                    {editable && (
                        <button
                            type="button"
                            data-no-drag
                            className="anm-ev__del"
                            disabled={busy}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDelete();
                            }}
                            title="Delete this event"
                        >
                            <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                        </button>
                    )}
                </div>

                {justCreated && (
                    <div className="anm-ev__hashnote">
                        The event map is keyed by hash, so this event is stored as its name&apos;s
                        hash and reads back as {meta.eventKey}.
                    </div>
                )}

                {!open && details && (
                    <div className="anm-ev__details" title={details}>
                        {details}
                    </div>
                )}

                {open && (
                    <div className="anm-ev__fields">
                        <AnmFieldRow
                            label="Name"
                            value={meta.eventKey}
                            type="text"
                            busy={busy}
                            editable={editable}
                            title="Rekeys the event in its clip's event map."
                            onCommit={(v) => {
                                if (typeof v === 'string' && v) {
                                    void edit?.renameEvent(rowKey, meta.event.addr, v);
                                }
                            }}
                        />
                        {rows.map((r) => (
                            <AnmFieldRow
                                key={r.field}
                                label={r.label}
                                value={r.value}
                                type={r.type}
                                busy={busy}
                                editable={editable}
                                onCommit={(v) => commit(r.field, v)}
                            />
                        ))}
                        {/* Everything the typed rows above do not cover: the
                            nested bone pairs on a particle event, and every
                            field of a class nothing models — which used to be
                            the whole event, shown as an un-editable hash.
                            Always offered, because even a modelled class can
                            carry fields the read layer does not name. */}
                        <details className="anm-ev__raw" open={rows.length === 0}>
                            <summary className="anm-ev__raw-summary">
                                {rows.length === 0 ? 'All fields' : 'Advanced'}
                            </summary>
                            <RawFields
                                sessionId={edit?.sessionId ?? null}
                                path={meta.event.addr}
                                revision={rawRevision}
                                busy={busy}
                                editable={editable}
                                onCommit={commitRaw}
                                onAdd={addRaw}
                                onRemove={removeRaw}
                            />
                        </details>
                    </div>
                )}
            </div>
            {actions && <div className="anm-ev__actions">{actions}</div>}
        </div>
    );
}

export default React.memo(EventItem);
