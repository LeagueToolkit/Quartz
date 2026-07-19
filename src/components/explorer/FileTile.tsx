import React, { useEffect, useRef, useState } from 'react';
import { iconFor } from './fileIcons';
import { textureQueue } from './textureQueue';
import { explorerThumbnail, type FsEntry } from '@/lib/api/explorer';

const THUMBNAIL_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'tex', 'dds']);

const formatSize = (bytes: number): string => {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${bytes} B`;
};

const formatDate = (timestamp: number): string => timestamp > 0
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp))
    : '';

/** One explorer entry. Lazily decodes a thumbnail (via IntersectionObserver +
 *  the shared texture queue) for image / game-texture files; everything else
 *  shows a typed icon. */
export function FileTile({ entry, selected, checked, view, showCheckbox, onClick, onDoubleClick, onToggleCheck, onContextMenu }: {
    entry: FsEntry;
    selected: boolean;
    checked: boolean;
    view: 'grid' | 'list';
    showCheckbox: boolean;
    onClick: (event: React.MouseEvent) => void;
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
            data-path={entry.path}
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
            {view === 'list' && (
                <>
                    <span className="dl-explorer-tile__modified">{formatDate(entry.modified)}</span>
                    <span className="dl-explorer-tile__type">
                        {entry.isDirectory ? 'File folder' : (entry.extension ? `${entry.extension.toUpperCase()} file` : 'File')}
                    </span>
                    <span className="dl-explorer-tile__size">{entry.isDirectory ? '' : formatSize(entry.size)}</span>
                </>
            )}
        </div>
    );
}
