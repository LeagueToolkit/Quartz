import { FolderOpen, X } from 'lucide-react';
import type { RecentBin } from '@/lib/stores';
import './binOpenLanding.css';

function relativeTime(iso: string): string {
    const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export interface BinOpenLandingProps {
    recentBins: RecentBin[];
    busy?: boolean;
    dragActive?: boolean;
    onOpen: () => void;
    onOpenRecent: (path: string) => void;
    onRemoveRecent: (path: string) => void;
    /* Wording overrides so non-bin callers (e.g. the Audio Splitter) get the
       same layout without the bin-specific copy. */
    title?: string;
    description?: string;
    actionLabel?: string;
    recentTitle?: string;
    footnote?: string;
}

/** The same no-document landing and history layout used by Bin Editor. */
export function BinOpenLanding({
    recentBins,
    busy = false,
    dragActive = false,
    onOpen,
    onOpenRecent,
    onRemoveRecent,
    title = 'No Bin Loaded',
    description = 'Drop a .bin here',
    actionLabel = 'Open Bin',
    recentTitle = 'Recent Bins',
    footnote,
}: BinOpenLandingProps) {
    return (
        <div className={`bin-open-landing${dragActive ? ' is-dragging' : ''}`}>
            <div className="bin-open-landing__empty">
                <FolderOpen
                    size={48}
                    color="var(--accent-primary)"
                    strokeWidth={1.5}
                    style={{ display: 'block', marginBottom: 16 }}
                />
                <div className="bin-open-landing__title">{title}</div>
                <div className="bin-open-landing__description">{description}</div>
                <button type="button" className="dl-btn dl-btn--primary" onClick={onOpen} disabled={busy}>
                    <span className="dl-icon"><FolderOpen size={14} /></span>
                    <span>{actionLabel}</span>
                </button>
                {footnote && <div className="bin-open-landing__footnote">{footnote}</div>}
            </div>

            {recentBins.length > 0 && (
                <section className="bin-open-recent" aria-label={recentTitle}>
                    <div className="bin-open-recent__heading">{recentTitle}</div>
                    <div className="bin-open-recent__list">
                        {recentBins.map((bin) => (
                            <div
                                key={bin.path}
                                className="bin-open-recent__item"
                                role="button"
                                tabIndex={busy ? -1 : 0}
                                aria-disabled={busy}
                                onClick={() => { if (!busy) onOpenRecent(bin.path); }}
                                onKeyDown={(event) => {
                                    if (busy || (event.key !== 'Enter' && event.key !== ' ')) return;
                                    event.preventDefault();
                                    onOpenRecent(bin.path);
                                }}
                                title={bin.path}
                            >
                                <span className="bin-open-recent__info">
                                    <FolderOpen size={15} className="bin-open-recent__icon" />
                                    <span className="bin-open-recent__name">{bin.name}</span>
                                </span>
                                <span className="bin-open-recent__actions">
                                    <span className="bin-open-recent__date">{relativeTime(bin.lastOpened)}</span>
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        className="bin-open-recent__remove"
                                        title="Remove from recent"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onRemoveRecent(bin.path);
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key !== 'Enter' && event.key !== ' ') return;
                                            event.preventDefault();
                                            event.stopPropagation();
                                            onRemoveRecent(bin.path);
                                        }}
                                    >
                                        <X size={13} />
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

export default BinOpenLanding;
