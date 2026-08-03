/* Full clip editor, opened by the pencil on a clip card.
 *
 * WHY A BUFFERED MODAL AND NOT THE INLINE ROWS
 * The card used to carry the whole field block, which made an expanded clip read
 * as a form with its events buried underneath. The fields live here now and the
 * card keeps a one-line summary, so expanding a clip shows what a clip actually
 * is: a list of events.
 *
 * Edits collect in local state and land only on Save. Nothing is written while
 * you type, so an abandoned edit costs nothing and closing discards.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CloseIcon from '@mui/icons-material/Close';
import type { AnmValue, ClipField } from '@/lib/api/vfxAnm';

/** The editable state of one clip, as strings the inputs can hold directly.
 *  `null` in the model becomes '' here; Save turns '' back into null so an
 *  emptied box REMOVES the field rather than writing an empty string. */
export interface ClipDraft {
    name: string;
    trackDataName: string;
    maskDataName: string;
    anmPath: string;
    startFrame: string;
    endFrame: string;
    loops: boolean;
    trueClip: string;
    falseClip: string;
}

/** One field the caller must write, already resolved to its final value. */
export interface ClipEdit {
    field: ClipField;
    value: AnmValue;
}

export interface ClipSavePlan {
    /** Non-name field writes, in declaration order. */
    edits: ClipEdit[];
    /** The new name, when it changed. Applied LAST by the caller: a rename
     *  rekeys the clip and invalidates its address, so a field write issued
     *  after it would target a path that no longer resolves. */
    rename: string | null;
}

const str = (v: string | null | undefined) => (v == null ? '' : String(v));
const num = (v: number | null | undefined) => (v == null ? '' : String(v));

export function draftOf(source: {
    name: string;
    trackDataName: string | null;
    maskDataName: string | null;
    anmPath: string | null;
    startFrame: number | null;
    endFrame: number | null;
    loops: boolean;
    trueClip?: string | null;
    falseClip?: string | null;
}): ClipDraft {
    return {
        name: source.name,
        trackDataName: str(source.trackDataName),
        maskDataName: str(source.maskDataName),
        anmPath: str(source.anmPath),
        startFrame: num(source.startFrame),
        endFrame: num(source.endFrame),
        loops: source.loops,
        trueClip: str(source.trueClip),
        falseClip: str(source.falseClip),
    };
}

/** Diff a draft against the clip it was seeded from. Only changed fields are
 *  written, so saving a clip you merely looked at is a no-op. */
export function planOf(before: ClipDraft, after: ClipDraft, isCondition: boolean): ClipSavePlan {
    const edits: ClipEdit[] = [];

    const text = (field: ClipField, a: string, b: string) => {
        if (a === b) return;
        const trimmed = b.trim();
        edits.push({ field, value: trimmed === '' ? null : trimmed });
    };
    const number = (field: ClipField, a: string, b: string) => {
        if (a === b) return;
        const trimmed = b.trim();
        if (trimmed === '') {
            edits.push({ field, value: null });
            return;
        }
        const n = Number(trimmed);
        // Junk is dropped rather than written; the row still shows what the user
        // typed, and Save simply does not carry it.
        if (Number.isFinite(n)) edits.push({ field, value: n });
    };

    text('trackDataName', before.trackDataName, after.trackDataName);
    text('maskDataName', before.maskDataName, after.maskDataName);
    text('anmPath', before.anmPath, after.anmPath);
    number('startFrame', before.startFrame, after.startFrame);
    number('endFrame', before.endFrame, after.endFrame);
    if (before.loops !== after.loops) edits.push({ field: 'loops', value: after.loops });
    if (isCondition) {
        text('trueClip', before.trueClip, after.trueClip);
        text('falseClip', before.falseClip, after.falseClip);
    }

    const nextName = after.name.trim();
    const rename = nextName && nextName !== before.name ? nextName : null;
    return { edits, rename };
}

interface ClipEditModalProps {
    open: boolean;
    /** The clip's state when the modal opened; also the diff baseline. */
    initial: ClipDraft;
    /** Condition clips are the only ones with true/false branches. */
    isCondition: boolean;
    /** Shown in the header so it is obvious which clip is being edited. */
    kindLabel: string;
    busy: boolean;
    error: string | null;
    onSave: (plan: ClipSavePlan) => void;
    onClose: () => void;
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: '0.82rem',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 5,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.66rem',
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
};

export default function ClipEditModal({
    open,
    initial,
    isCondition,
    kindLabel,
    busy,
    error,
    onSave,
    onClose,
}: ClipEditModalProps) {
    const [draft, setDraft] = useState<ClipDraft>(initial);

    /* Re-seed on OPEN only.
     *
     * `initial` is rebuilt from the model, so it is a new object every time the
     * model republishes. Keeping it in the deps meant any landed edit — including
     * the modal's own first field write — pushed a fresh `initial` in and wiped
     * whatever was typed but not yet saved. Renaming was the visible casualty:
     * the new name was replaced by the old one before Save ever read it.
     *
     * `open` alone is the correct trigger: it flips false→true exactly when a
     * clip is opened, which is the only moment the draft should be reset. */
    const seeded = useRef(false);
    useEffect(() => {
        if (!open) {
            seeded.current = false;
            return;
        }
        if (seeded.current) return;
        seeded.current = true;
        setDraft(initial);
    }, [open, initial]);

    const dirty = useMemo(() => {
        const plan = planOf(initial, draft, isCondition);
        return plan.edits.length > 0 || plan.rename !== null;
    }, [initial, draft, isCondition]);

    if (!open) return null;

    const set = <K extends keyof ClipDraft>(key: K, value: ClipDraft[K]) =>
        setDraft((d) => ({ ...d, [key]: value }));

    const save = () => onSave(planOf(initial, draft, isCondition));

    const field = (label: string, key: keyof ClipDraft, type: 'text' | 'number', title?: string) => (
        <div title={title}>
            <label style={labelStyle}>{label}</label>
            <input
                style={inputStyle}
                type={type}
                value={draft[key] as string}
                disabled={busy}
                placeholder="Empty removes the field"
                onChange={(e) => set(key, e.target.value as ClipDraft[typeof key])}
            />
        </div>
    );

    /* Portalled to <body>. This modal is rendered from inside a clip card, and
       `.particle-div` sets `contain: layout style` (plus a hover transform),
       which makes the card a containing block for fixed-position descendants —
       so `position: fixed; inset: 0` resolved to the CARD and the modal appeared
       squeezed inside the row instead of centred on the viewport. */
    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div
                style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, black 65%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
                onClick={onClose}
            />
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 520,
                    maxHeight: '86vh',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    backdropFilter: 'saturate(180%) blur(16px)',
                    WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                    borderRadius: 16,
                    boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        height: 3,
                        flexShrink: 0,
                        background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 3s linear infinite',
                    }}
                />

                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <h2
                        style={{
                            margin: 0,
                            minWidth: 0,
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.9rem',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                        title={initial.name}
                    >
                        Edit Clip — {initial.name}
                    </h2>
                    <span
                        style={{
                            flexShrink: 0,
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.62rem',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'var(--text-muted)',
                        }}
                    >
                        {kindLabel}
                    </span>
                    <button
                        onClick={onClose}
                        title="Close without saving"
                        style={{
                            width: 28,
                            height: 28,
                            flexShrink: 0,
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                        }}
                    >
                        <CloseIcon style={{ fontSize: 16 }} />
                    </button>
                </div>

                <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'grid', gap: 14 }}>
                    {field('Name', 'name', 'text', 'Rekeys the clip. References to the old name are not updated.')}
                    {field('Track', 'trackDataName', 'text')}
                    {field('Mask', 'maskDataName', 'text')}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {field('Start Frame', 'startFrame', 'number')}
                        {field('End Frame', 'endFrame', 'number')}
                    </div>
                    {field('Animation', 'anmPath', 'text', 'The .anm this clip plays.')}

                    <div>
                        <label style={labelStyle}>Loops</label>
                        <button
                            type="button"
                            className={`anm-field__toggle${draft.loops ? ' is-on' : ''}`}
                            disabled={busy}
                            aria-pressed={draft.loops}
                            onClick={() => set('loops', !draft.loops)}
                        >
                            <span className="anm-field__toggle-knob" />
                            <span className="anm-field__toggle-text">{draft.loops ? 'true' : 'false'}</span>
                        </button>
                    </div>

                    {isCondition && (
                        <>
                            {field('True Clip', 'trueClip', 'text')}
                            {field('False Clip', 'falseClip', 'text')}
                        </>
                    )}

                    {error && (
                        <div style={{ color: 'var(--color-danger, #f87171)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                            {error}
                        </div>
                    )}
                </div>

                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
                    <button
                        className="dl-btn dl-btn--primary"
                        disabled={busy || !dirty}
                        title={dirty ? 'Write these changes to the bin' : 'Nothing changed'}
                        onClick={save}
                    >
                        {busy ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
