import { useMemo } from 'react';
import type { EditorSystem } from '@/lib/api/bineditor';
import { getShortSystemName } from '@/pages/port/utils/nameUtils';

/* Left sidebar: system search + the multi-selectable system list with emitter
   counts and dirty dots. */

interface SystemSidebarProps {
    systems: EditorSystem[];
    selectedKeys: Set<string>;
    dirtyKeys: Set<string>;
    search: string;
    onSearch: (q: string) => void;
    onToggleSystem: (key: string) => void;
}

export default function SystemSidebar({
    systems,
    selectedKeys,
    dirtyKeys,
    search,
    onSearch,
    onToggleSystem,
}: SystemSidebarProps) {
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return systems;
        return systems.filter((s) =>
            s.name.toLowerCase().includes(q) ||
            s.emitters.some((e) => e.name.toLowerCase().includes(q)),
        );
    }, [systems, search]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
            <input
                className="dl-input"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search systems…"
                style={{ marginBottom: 10, flexShrink: 0 }}
            />

            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {filtered.map((sys) => {
                    const selected = selectedKeys.has(sys.key);
                    const dirty = dirtyKeys.has(sys.key);
                    return (
                        <div key={sys.key} style={{ marginBottom: 8 }}>
                            <div
                                onClick={() => onToggleSystem(sys.key)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    height: 42,
                                    padding: '0 12px',
                                    borderRadius: 'var(--dl-radius-sm)',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    overflow: 'hidden',
                                    background: 'var(--bg-tertiary)',
                                    border: selected
                                        ? '1px solid color-mix(in oklab, var(--accent-primary) 45%, var(--border))'
                                        : '1px solid var(--border)',
                                    boxShadow: selected ? 'inset 3px 0 0 var(--accent-primary)' : 'inset 3px 0 0 transparent',
                                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                                }}
                            >
                                <span
                                    style={{
                                        flex: 1,
                                        fontWeight: 600,
                                        color: selected ? 'var(--accent-primary)' : 'var(--text-primary)',
                                        fontSize: 13,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                    title={sys.name}
                                >
                                    {getShortSystemName(sys.name)}
                                </span>
                                {dirty && (
                                    <span
                                        title="Modified"
                                        style={{
                                            width: 7,
                                            height: 7,
                                            borderRadius: '50%',
                                            background: 'var(--accent-primary)',
                                            flexShrink: 0,
                                        }}
                                    />
                                )}
                                <span
                                    style={{
                                        marginLeft: 'auto',
                                        opacity: 1,
                                        fontSize: '12px',
                                        background: 'var(--bg-hover)',
                                        padding: '1px 7px',
                                        borderRadius: '12px',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--border)',
                                        fontWeight: 600,
                                        flexShrink: 0,
                                    }}
                                >
                                    {sys.emitters.length}
                                </span>
                            </div>
                        </div>
                    );
                })}
                {filtered.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 2px' }}>
                        No systems match.
                    </div>
                )}
            </div>
        </div>
    );
}
