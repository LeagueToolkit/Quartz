/*
 * RecentBinsList — the shared "Recent Bins" list used by Paint, Port, and the
 * Bin Editor. One implementation so every page looks and behaves identically.
 *
 * Styling lives in paint/Paint.css under the `.paint2-recent*` classes (the
 * original home of this list); this component imports it so consumers don't
 * have to. The folder icon is a real button: clicking it reveals the file in
 * the OS file manager (it stops propagation, so the row's own click still
 * loads the bin).
 */

import { FolderOpen as FolderOpenIcon, X as CloseIcon } from 'lucide-react';
import { explorerReveal } from '@/lib/api/explorer';
import '@/pages/paint/Paint.css';

export interface RecentBinEntry {
    path: string;
    name: string;
    lastOpened: string;
}

/* "3m ago" / "2h ago" / "5d ago" relative stamp. */
function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

export default function RecentBinsList({ bins, onOpen, onRemove, title = 'Recent Bins' }: {
    bins: RecentBinEntry[];
    onOpen: (path: string) => void;
    onRemove: (path: string) => void;
    /** Heading text. Callers listing something other than bins (e.g. WAD
     *  Explorer's recent WADs) override it. */
    title?: string;
}) {
    if (bins.length === 0) return null;

    return (
        <div className="paint2-recent">
            <div className="paint2-recent__title">
                <span>{title}</span>
            </div>
            <div className="paint2-recent__list">
                {bins.map((bin) => (
                    <div
                        key={bin.path}
                        className="paint2-recent__item"
                        onClick={() => onOpen(bin.path)}
                        title={bin.path}
                    >
                        <div className="paint2-recent__info">
                            {/* Folder icon reveals the file in the OS file manager;
                               stopPropagation keeps the row's load-on-click intact. */}
                            <button
                                type="button"
                                className="paint2-recent__reveal"
                                title="Show in file manager"
                                onClick={(e) => { e.stopPropagation(); void explorerReveal(bin.path).catch(() => {}); }}
                            >
                                <FolderOpenIcon size={15} className="paint2-recent__icon" />
                            </button>
                            <span className="paint2-recent__name">{bin.name}</span>
                        </div>
                        <div className="paint2-recent__actions">
                            <span className="paint2-recent__date">{relativeTime(bin.lastOpened)}</span>
                            <button
                                className="paint2-recent__delete"
                                title="Remove from recent"
                                onClick={(e) => { e.stopPropagation(); onRemove(bin.path); }}
                            >
                                <CloseIcon size={13} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
