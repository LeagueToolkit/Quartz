import { memo, type MouseEvent } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { EditorEmitter } from '@/lib/api/bineditor';
import { classify, prettyName, sameKey } from '../model/categories';
import type { SchemaEntry } from '../model/emitterSchema';
import { summarizeField } from '../model/nodes';
import AddFieldMenu from './AddFieldMenu';
import FieldRow, { type FieldRowCallbacks } from './FieldRow';

/* Expandable emitter card: header (select-toggle, live field summary, texture
   preview button) + FieldRow list filtered by the active category + per-emitter
   add-field menu. Ported from bineditorV3/components/EmitterGroup.js. */

interface EmitterGroupProps extends FieldRowCallbacks {
    emitter: EditorEmitter;
    /** Bin-qualified selection/expansion identity for this emitter. */
    emitterId: string;
    selected: boolean;
    open: boolean;
    onToggle: (emitterId: string) => void;
    onToggleOpen: (emitterId: string) => void;
    activeCategory: string;
    advanced: boolean;
    /// Bumped by the page whenever an edit touches this emitter's entry —
    /// leaf edits mutate nodes in place, so this is what invalidates the memo.
    rev: number;
    onAddField?: (emitter: EditorEmitter, entry: SchemaEntry) => void;
    onTextureHover?: (emitter: EditorEmitter, e: MouseEvent<HTMLButtonElement>) => void;
    onTextureLeave?: () => void;
    onTextureOpen?: (emitter: EditorEmitter) => void;
}

function EmitterGroup(props: EmitterGroupProps) {
    const {
        emitter,
        emitterId,
        selected,
        open,
        onToggle,
        onToggleOpen,
        activeCategory,
        advanced,
        rev: _rev, // memo invalidation only — in-place node edits bump this
        onAddField,
        onTextureHover,
        onTextureLeave,
        onTextureOpen,
        ...fieldCallbacks
    } = props;

    const fields =
        activeCategory === 'all'
            ? emitter.fields
            : emitter.fields.filter((f) => sameKey(classify(f), activeCategory));

    // Live readout in the header for the active field (bulk edits visible without expanding).
    let summary: string;
    if (activeCategory === 'all') {
        summary = `${emitter.fields.length} fields`;
    } else {
        const f = emitter.fields.find((x) => sameKey(classify(x), activeCategory));
        summary = f ? `${prettyName(activeCategory)}: ${summarizeField(f)}` : '-';
    }

    return (
        <div
            className={`biev2-emitter${selected ? ' is-selected' : ''}${open ? ' is-open' : ''}`}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
                <span
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleOpen(emitterId);
                    }}
                    style={{
                        cursor: 'pointer',
                        userSelect: 'none',
                        color: 'var(--accent-secondary)',
                        width: 14,
                        textAlign: 'center',
                        flexShrink: 0,
                    }}
                    title={open ? 'Collapse' : 'Expand'}
                >
                    {open ? '▼' : '▶'}
                </span>

                {/* Explicit select box — the row body is still clickable, but the
                    box is what advertises that emitters are selectable at all. */}
                <button
                    type="button"
                    className={`biev2-emitter__check${selected ? ' is-on' : ''}`}
                    role="checkbox"
                    aria-checked={selected}
                    aria-label={`Select ${emitter.name} for bulk edit`}
                    title={selected ? 'Selected — click to deselect' : 'Select for bulk edit'}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle(emitterId);
                    }}
                >
                    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                        <path
                            d="M1.5 6.5L4.5 9.5L10.5 2.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </button>

                {/* Click the row body to highlight it for bulk selection */}
                <div
                    onClick={() => onToggle(emitterId)}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        minWidth: 0,
                    }}
                    title="Click to select for bulk edit"
                >
                    <span
                        style={{
                            fontWeight: 600,
                            color: selected ? 'var(--accent-primary)' : 'var(--text-primary)',
                            flexShrink: 0,
                        }}
                    >
                        {emitter.name}
                    </span>
                    <span
                        style={{
                            flex: 1,
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: 'color-mix(in srgb, var(--accent-primary) 85%, var(--text-primary) 15%)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {summary}
                    </span>
                </div>

                {/* Texture preview: hover to show, click to open */}
                {(onTextureHover || onTextureOpen) && (
                    <button
                        type="button"
                        className="dl-btn dl-btn--secondary dl-btn--sm dl-btn--icon"
                        title="Preview textures"
                        onMouseEnter={(e) => onTextureHover?.(emitter, e)}
                        onMouseLeave={() => onTextureLeave?.()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onTextureOpen?.(emitter);
                        }}
                        style={{ flexShrink: 0 }}
                    >
                        <ImageIcon size={14} />
                    </button>
                )}
            </div>
            {open && (
                <div style={{ padding: '4px 12px 12px', borderTop: '1px solid var(--border)' }}>
                    {fields.length === 0 && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 12, paddingTop: 8 }}>
                            No matching field.
                        </div>
                    )}
                    {fields.map((f, i) => (
                        <FieldRow
                            key={(f.key ?? 'item') + i}
                            node={f}
                            advanced={advanced}
                            {...fieldCallbacks}
                        />
                    ))}
                    {onAddField && (
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                            <AddFieldMenu
                                onAdd={(entry) => onAddField(emitter, entry)}
                                present={emitter.fields.map((f) => f.key)}
                                label="+ Add field to this emitter"
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default memo(EmitterGroup);
