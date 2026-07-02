import { useMemo } from 'react';
import type { EditorSystem } from '@/lib/api/bineditor';
import { getShortSystemName } from '@/pages/port/utils/nameUtils';

/* Left sidebar: system search + the multi-selectable system list with emitter
   counts and dirty dots. Rows use the shared Settings-rail styling (matches the
   Asset Extractor champion list). */

interface SystemSidebarProps {
    systems: EditorSystem[];
    selectedKeys: Set<string>;
    dirtyKeys: Set<string>;
    search: string;
    onSearch: (q: string) => void;
    onToggleSystem: (key: string) => void;
}

/* Cursor-following glow: set --mx/--my on the hovered row. */
function onRowMove(e: React.MouseEvent<HTMLDivElement>) {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.biev2-row');
    if (!row) return;
    const r = row.getBoundingClientRect();
    row.style.setProperty('--mx', `${e.clientX - r.left}px`);
    row.style.setProperty('--my', `${e.clientY - r.top}px`);
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
                style={{ flexShrink: 0 }}
            />

            <div className="biev2-syslist-divider" />

            <div className="biev2-syslist" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }} onMouseMove={onRowMove}>
                {filtered.map((sys) => {
                    const selected = selectedKeys.has(sys.key);
                    const dirty = dirtyKeys.has(sys.key);
                    return (
                        <div
                            key={sys.key}
                            className={`biev2-row${selected ? ' is-active' : ''}`}
                            onClick={() => onToggleSystem(sys.key)}
                        >
                            <span className="biev2-row__name" title={sys.name}>
                                {getShortSystemName(sys.name)}
                            </span>
                            {dirty && <span className="biev2-row__dot" title="Modified" />}
                            <span className="biev2-row__count">{sys.emitters.length}</span>
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
