import { FolderOpen as FolderOpenIcon, X as CloseIcon } from 'lucide-react';
import { useUiPrefsStore } from '@/lib/stores';
import { useExistingRecentBins } from '@/lib/util/useExistingRecentBins';
// Reuse the shared recent-bins styling (`.paint2-recent`) so Port matches Paint.
import '../../../paint/Paint.css';

/* "3m ago" / "2h ago" / "5d ago" stamp — mirrors Paint's recent-bins list. */
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

/* Recent-bins list for the Port empty state. Each column keeps its own recent
   history (Target vs Donor). Reuses the shared `.paint2-recent` styling so it
   matches Paint and the Bin Editor. Clicking a row loads it via `onOpen`. */
export default function PortRecentBins({ slot, onOpen }: { slot: 'target' | 'donor'; onOpen: (path: string) => void }) {
    const storedBins = useUiPrefsStore((s) => (slot === 'target' ? s.recentTargetBins : s.recentDonorBins));
    const removeRecentBinFor = useUiPrefsStore((s) => s.removeRecentBinFor);
    // Only show entries whose file still exists; prune vanished ones.
    const recentBins = useExistingRecentBins(storedBins, (path) => removeRecentBinFor(slot, path));

    if (recentBins.length === 0) return null;

    return (
        <div className="paint2-recent">
            <div className="paint2-recent__title">
                <span>Recent Bins</span>
            </div>
            <div className="paint2-recent__list">
                {recentBins.map((bin) => (
                    <div
                        key={bin.path}
                        className="paint2-recent__item"
                        onClick={() => onOpen(bin.path)}
                        title={bin.path}
                    >
                        <div className="paint2-recent__info">
                            <FolderOpenIcon size={15} className="paint2-recent__icon" />
                            <span className="paint2-recent__name">{bin.name}</span>
                        </div>
                        <div className="paint2-recent__actions">
                            <span className="paint2-recent__date">{relativeTime(bin.lastOpened)}</span>
                            <button
                                className="paint2-recent__delete"
                                title="Remove from recent"
                                onClick={(e) => { e.stopPropagation(); removeRecentBinFor(slot, bin.path); }}
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
