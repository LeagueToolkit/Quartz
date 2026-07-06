import React, { useEffect, useRef, useState } from 'react';
import { iconFor } from './fileIcons';
import { textureQueue } from './textureQueue';
import { explorerThumbnail, type FsEntry } from '@/lib/api/explorer';

const THUMBNAIL_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'tex', 'dds']);

/** One explorer entry. Lazily decodes a thumbnail (via IntersectionObserver +
 *  the shared texture queue) for image / game-texture files; everything else
 *  shows a typed icon. */
export function FileTile({ entry, selected, checked, view, showCheckbox, onClick, onDoubleClick, onToggleCheck, onContextMenu }: {
    entry: FsEntry;
    selected: boolean;
    checked: boolean;
    view: 'grid' | 'list';
    showCheckbox: boolean;
    onClick: () => void;
    onDoubleClick: () => void;
    onToggleCheck: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
}) {
    const { Icon, color } = iconFor(entry);
    const ref = useRef<HTMLDivElement>(null);
    const [thumb, setThumb] = useState<string | null>(null);

    useEffect(() => {
        if (entry.isDirectory || !THUMBNAIL_EXTS.has(entry.extension)) return;
        const el = ref.current;
        if (!el) return;
        let alive = true;
        const obs = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting) return;
            obs.disconnect();
            void textureQueue
                .add(() => explorerThumbnail(entry.path))
                .then((url) => { if (alive) setThumb(url); })
                .catch(() => { /* fall back to icon */ });
        }, { rootMargin: '160px', threshold: 0.01 });
        obs.observe(el);
        return () => { alive = false; obs.disconnect(); };
    }, [entry.path, entry.extension, entry.isDirectory]);

    const iconSize = view === 'grid' ? 34 : 18;

    return (
        <div
            ref={ref}
            className={`dl-explorer-tile dl-explorer-tile--${view} ${selected ? 'is-selected' : ''}`}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            title={entry.path}
            data-name={entry.name}
        >
            {showCheckbox && (
                <input
                    type="checkbox"
                    className="dl-explorer-tile__check"
                    checked={checked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={onToggleCheck}
                />
            )}
            <div className="dl-explorer-tile__icon">
                {thumb
                    ? <img src={thumb} alt={entry.name} />
                    : <Icon size={iconSize} style={{ color }} />}
                {entry.isShortcut && <span className="dl-explorer-tile__shortcut" title="Shortcut">↗</span>}
            </div>
            <span className="dl-explorer-tile__name">{entry.name}</span>
        </div>
    );
}
