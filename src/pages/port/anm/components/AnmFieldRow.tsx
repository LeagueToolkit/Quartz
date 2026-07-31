/* One editable field row, shared by the clip card and the event card.
 *
 * Click-to-edit rather than a permanently open input. A clip card can show a
 * dozen fields and an open bin holds 100+ clips; rendering every field as a
 * live input made the column read as a form, and the user asked for a card that
 * still scans. Text reverts to text the moment the row commits.
 *
 * Commit rules, matching the legacy property-row the user endorsed:
 *   Enter or blur commits, Escape reverts, and an emptied box commits null,
 *   which is how a field is REMOVED. Empty string and absent are different
 *   things in the bin, so an emptied text box has to mean "delete the field",
 *   not "write \"\"".
 *
 * Booleans skip all of that and commit on click: a toggle that needed a
 * confirm keystroke would be worse than the checkbox it replaces.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { AnmValue } from '@/lib/api/vfxAnm';
import type { AnmFieldType } from '../eventEditFields';

interface AnmFieldRowProps {
    label: string;
    value: string | number | boolean | null;
    type: AnmFieldType;
    /** Disabled while this row's own write is in flight. */
    busy?: boolean;
    /** Read-only when there is no session to write to. */
    editable?: boolean;
    onCommit: (value: AnmValue) => void;
    /** Shown under the row, e.g. the hash-name note on a fresh event. */
    note?: string;
    title?: string;
}

const EMPTY = '—';

function displayOf(value: string | number | boolean | null): string {
    if (value === null || value === undefined) return EMPTY;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    const s = String(value);
    return s.length ? s : EMPTY;
}

function AnmFieldRow({ label, value, type, busy, editable = true, onCommit, note, title }: AnmFieldRowProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    /* Blur fires after Escape moves focus away, so without this the revert
       would immediately be followed by a commit of the reverted draft. */
    const cancelled = useRef(false);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    // A landed edit replaces the whole model, so close the editor rather than
    // leave a stale draft sitting over a value that already changed.
    useEffect(() => {
        if (!busy) return;
        setEditing(false);
    }, [busy]);

    const isHash = typeof value === 'string' && /^0x[0-9a-f]{8}$/i.test(value);

    if (type === 'bool') {
        const on = value === true;
        return (
            <div className="anm-field" title={title}>
                <span className="anm-field__label">{label}</span>
                <button
                    type="button"
                    data-no-drag
                    className={`anm-field__toggle${on ? ' is-on' : ''}`}
                    disabled={busy || !editable}
                    aria-pressed={on}
                    onClick={(e) => {
                        e.stopPropagation();
                        onCommit(!on);
                    }}
                >
                    <span className="anm-field__toggle-knob" />
                    <span className="anm-field__toggle-text">{on ? 'true' : 'false'}</span>
                </button>
                {note && <span className="anm-field__note">{note}</span>}
            </div>
        );
    }

    const commit = () => {
        if (cancelled.current) {
            cancelled.current = false;
            return;
        }
        setEditing(false);
        const trimmed = draft.trim();
        // An emptied box removes the field. See the header note.
        if (!trimmed) {
            if (value !== null && value !== '') onCommit(null);
            return;
        }
        if (type === 'number') {
            const n = Number(trimmed);
            if (!Number.isFinite(n)) return; // Reject junk silently; the row already reverted.
            if (n !== value) onCommit(n);
            return;
        }
        if (trimmed !== value) onCommit(trimmed);
    };

    return (
        <div className="anm-field" title={title}>
            <span className="anm-field__label">{label}</span>
            {editing ? (
                <input
                    ref={inputRef}
                    data-no-drag
                    className="anm-field__input"
                    type={type === 'number' ? 'number' : 'text'}
                    value={draft}
                    disabled={busy}
                    onChange={(e) => setDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            commit();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelled.current = true;
                            setEditing(false);
                        }
                    }}
                    onBlur={commit}
                    placeholder={type === 'list' ? 'Comma separated' : 'Empty removes the field'}
                />
            ) : (
                <button
                    type="button"
                    data-no-drag
                    className={`anm-field__value${isHash ? ' is-hash' : ''}${editable ? '' : ' is-static'}`}
                    disabled={busy || !editable}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!editable) return;
                        setDraft(value === null || value === undefined ? '' : String(value));
                        setEditing(true);
                    }}
                >
                    {displayOf(value)}
                </button>
            )}
            {note && <span className="anm-field__note">{note}</span>}
        </div>
    );
}

export default React.memo(AnmFieldRow);
