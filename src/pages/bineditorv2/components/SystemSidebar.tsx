import { useMemo } from 'react';
import type { EditorSystem } from '@/lib/api/bineditor';
import { getShortSystemName } from '@/pages/port/utils/nameUtils';

/* Left sidebar: system search + the multi-selectable system list with emitter
   counts and dirty dots. Rows use the shared Settings-rail styling (matches the
   Asset Extractor champion list). Systems are keyed by (bin, key) since a
   system's path_hash can repeat across the resident bins. */

/** Selection/dirty identity for a system: `${bin}:${key}`. */
export function systemId(sys: EditorSystem): string {
    return `${sys.bin}:${sys.key}`;
}

interface SystemSidebarProps {
    systems: EditorSystem[];
    selectedKeys: Set<string>;
    dirtyKeys: Set<string>;
    search: string;
    onSearch: (q: string) => void;
    onToggleSystem: (id: string) => void;
    onCreateSystem?: () => void;
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
    onCreateSystem,
}: SystemSidebarProps) {
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return systems;
        return systems.filter((s) =>
            s.name.toLowerCase().includes(q) ||
            s.emitters.some((e) => e.name.toLowerCase().includes(q)),
        );
    }, [systems, search]);

    // Only surface the bin tag once linked bins are actually resident.
    const multiBin = useMemo(() => systems.some((s) => s.bin > 0), [systems]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
            <input
                className="dl-input"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search systems…"
                style={{ flexShrink: 0 }}
            />
            {onCreateSystem && (
                <button type="button" className="dl-btn dl-btn--secondary dl-btn--sm bev2-newsystem" onClick={onCreateSystem}>
                    + New system
                </button>
            )}

            <div className="biev2-syslist-divider" />

            <div className="biev2-syslist" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }} onMouseMove={onRowMove}>
                {filtered.map((sys) => {
                    const id = systemId(sys);
                    const selected = selectedKeys.has(id);
                    const dirty = dirtyKeys.has(id);
                    return (
                        <div
                            key={id}
                            className={`biev2-row${selected ? ' is-active' : ''}`}
                            onClick={() => onToggleSystem(id)}
                        >
                            <span className="biev2-row__name" title={sys.name}>
                                {getShortSystemName(sys.name)}
                            </span>
                            {multiBin && (
                                <span
                                    className="biev2-row__bin"
                                    title={sys.bin === 0 ? 'Main bin' : `Linked bin ${sys.bin}`}
                                >
                                    {sys.bin === 0 ? 'main' : `linked ${sys.bin}`}
                                </span>
                            )}
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
