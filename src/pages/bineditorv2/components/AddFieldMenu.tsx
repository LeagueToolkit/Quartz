import { useEffect, useRef, useState } from 'react';
import { prettyName, sameKey } from '../model/categories';
import { ADD_GROUPS, type SchemaEntry } from '../model/emitterSchema';

/* Styled, grouped, filterable "+ Add field" dropdown, ported from
   bineditorV3/components/AddFieldMenu.js. Fixed-position panel anchored to the
   button so it isn't clipped by the emitter card / scroll container. */

interface AddFieldMenuProps {
    onAdd: (entry: SchemaEntry) => void;
    present?: Array<string | null>;
    label?: string;
}

interface PanelPos {
    left: number;
    top?: number;
    bottom?: number;
    maxH: number;
}

export default function AddFieldMenu({ onAdd, present = [], label = '+ Add field' }: AddFieldMenuProps) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [pos, setPos] = useState<PanelPos | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const place = () => {
            const r = btnRef.current?.getBoundingClientRect();
            if (!r) return;
            const below = window.innerHeight - r.bottom;
            if (below < 240 && r.top > below) {
                setPos({ left: r.left, bottom: window.innerHeight - r.top + 4, maxH: Math.min(360, r.top - 12) });
            } else {
                setPos({ left: r.left, top: r.bottom + 4, maxH: Math.min(360, below - 12) });
            }
        };
        place();
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open]);

    const query = q.trim().toLowerCase();
    const groups = ADD_GROUPS.map((g) => ({
        group: g.group,
        items: g.items.filter(
            (it) =>
                !query ||
                prettyName(it.name).toLowerCase().includes(query) ||
                it.name.toLowerCase().includes(query),
        ),
    })).filter((g) => g.items.length > 0);

    const has = (key: string) => present.some((p) => sameKey(p, key));

    return (
        <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                ref={btnRef}
                className="dl-btn dl-btn--secondary dl-btn--sm"
                onClick={() => setOpen((o) => !o)}
                style={{ fontFamily: 'var(--font-mono)' }}
            >
                {label} ▾
            </button>
            {open && pos && (
                <div
                    style={{
                        position: 'fixed',
                        left: pos.left,
                        top: pos.top,
                        bottom: pos.bottom,
                        zIndex: 1000,
                        width: 260,
                        maxHeight: pos.maxH,
                        overflow: 'auto',
                        background: 'var(--bg-secondary)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: 6,
                        boxShadow: 'var(--dl-shadow-lg)',
                    }}
                >
                    <input
                        autoFocus
                        className="dl-input"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="search fields…"
                        style={{ height: 28, fontSize: 12, marginBottom: 6 }}
                    />
                    {groups.length === 0 && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 6 }}>No matches.</div>
                    )}
                    {groups.map((g) => (
                        <div key={g.group} style={{ marginBottom: 4 }}>
                            <div
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    color: 'var(--accent-secondary)',
                                    padding: '4px 6px 2px',
                                }}
                            >
                                {g.group}
                            </div>
                            {g.items.map((it) => {
                                const exists = has(it.name);
                                return (
                                    <div
                                        key={it.name}
                                        onClick={() => {
                                            if (!exists) {
                                                onAdd(it);
                                                setOpen(false);
                                            }
                                        }}
                                        title={exists ? 'Already present' : `Add ${prettyName(it.name)}`}
                                        className={exists ? undefined : 'bineditorv2-addfield-item'}
                                        style={{
                                            padding: '6px 8px',
                                            borderRadius: 4,
                                            fontSize: 13,
                                            cursor: exists ? 'default' : 'pointer',
                                            color: exists ? 'var(--text-muted)' : 'var(--text-primary)',
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!exists)
                                                e.currentTarget.style.background =
                                                    'color-mix(in srgb, var(--accent-primary), transparent 82%)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'transparent';
                                        }}
                                    >
                                        {prettyName(it.name)}
                                        {exists && ' ✓'}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
