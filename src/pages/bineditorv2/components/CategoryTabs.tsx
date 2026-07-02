import { useState } from 'react';
import { prettyName, sameKey } from '../model/categories';

/* Field-category tab strip: 'All' + ranked present categories, ~10 visible with
   a "+N more" expander and a small search filter. Ported from
   bineditorV3/components/CategoryTabs.js. */

const VISIBLE = 10;

interface CategoryTabsProps {
    categories: string[]; // ranked (categoriesPresent output)
    active: string; // 'all' or a field key
    onSelect: (key: string) => void;
    pinned?: string[]; // recently added fields, forced to the front
}

function pillClass(on: boolean): string {
    return on ? 'dl-btn dl-btn--secondary dl-btn--sm dl-btn--active' : 'dl-btn dl-btn--ghost dl-btn--sm';
}

export default function CategoryTabs({ categories, active, onSelect, pinned = [] }: CategoryTabsProps) {
    const [expanded, setExpanded] = useState(false);
    const [query, setQuery] = useState('');

    const front = pinned.filter((p) => categories.some((c) => sameKey(c, p)));
    const ordered = [...front, ...categories.filter((c) => !front.some((p) => sameKey(p, c)))];

    const q = query.trim().toLowerCase();
    const matched = q
        ? ordered.filter((c) => prettyName(c).toLowerCase().includes(q) || c.toLowerCase().includes(q))
        : ordered;
    const overflow = q ? 0 : matched.length - VISIBLE; // searching shows all matches
    const shown = q || expanded ? matched : matched.slice(0, VISIBLE);
    const tabs = [{ key: 'all', label: 'All' }, ...shown.map((c) => ({ key: c, label: prettyName(c) }))];

    return (
        <div
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '3px 4px',
                margin: '8px 0 10px',
            }}
        >
            <input
                className="dl-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="filter…"
                style={{ width: 90, height: 22, padding: '0 7px', marginRight: 4, fontSize: 11 }}
            />
            {tabs.map(({ key, label }) => (
                <button
                    type="button"
                    key={key}
                    className={pillClass(active === key)}
                    onClick={() => onSelect(key)}
                    style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                >
                    {label}
                </button>
            ))}
            {overflow > 0 && (
                <button
                    type="button"
                    className="dl-btn dl-btn--ghost dl-btn--sm"
                    onClick={() => setExpanded((e) => !e)}
                    style={{ height: 24, padding: '0 8px', fontSize: 11, color: 'var(--accent-primary)' }}
                >
                    {expanded ? '− less' : `+ ${overflow} more`}
                </button>
            )}
        </div>
    );
}
