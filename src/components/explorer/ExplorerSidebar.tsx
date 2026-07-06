import { useEffect, useState } from 'react';
import { Folder, HardDrive, Clock, Star, X, Plus } from 'lucide-react';
import { explorerQuickLinks, type QuickLink } from '@/lib/api/explorer';
import { useExplorerStore } from './explorerStore';

const basename = (p: string) => p.replace(/[\\/]+$/, '').replace(/^.*[\\/]/, '') || p;

// Stable reference so the recents selector never returns a fresh array (which
// would make Zustand's getSnapshot differ every render -> infinite loop).
const EMPTY: string[] = [];

/** Left rail: OS quick links (Desktop/Docs/Downloads/Home + drives), pinned
 *  folders, and this call site's recents bucket. */
export function ExplorerSidebar({ recentsKey, currentPath, onNavigate }: {
    recentsKey: string;
    currentPath: string;
    onNavigate: (path: string) => void;
}) {
    const [links, setLinks] = useState<QuickLink[]>([]);
    const pins = useExplorerStore((s) => s.pins);
    const addPin = useExplorerStore((s) => s.addPin);
    const removePin = useExplorerStore((s) => s.removePin);
    const recents = useExplorerStore((s) => s.recents[recentsKey] ?? EMPTY);
    const removeRecent = useExplorerStore((s) => s.removeRecent);

    useEffect(() => {
        explorerQuickLinks().then(setLinks).catch(() => setLinks([]));
    }, []);

    return (
        <aside className="dl-explorer-sidebar">
            <div className="dl-explorer-sidebar__group">
                <div className="dl-explorer-sidebar__title">Quick access</div>
                {links.map((l) => (
                    <button key={l.path} className="dl-explorer-sidebar__item" onClick={() => onNavigate(l.path)} title={l.path}>
                        {l.kind === 'drive' ? <HardDrive size={14} /> : <Folder size={14} />}
                        <span>{l.name}</span>
                    </button>
                ))}
            </div>

            {pins.length > 0 && (
                <div className="dl-explorer-sidebar__group">
                    <div className="dl-explorer-sidebar__title">Pinned</div>
                    {pins.map((p) => (
                        <div key={p} className="dl-explorer-sidebar__row" title={p}>
                            <button className="dl-explorer-sidebar__item dl-explorer-sidebar__item--main" onClick={() => onNavigate(p)}>
                                <Star size={14} /><span>{basename(p)}</span>
                            </button>
                            <button className="dl-explorer-sidebar__remove" onClick={() => removePin(p)} title="Unpin"><X size={12} /></button>
                        </div>
                    ))}
                </div>
            )}

            {recents.length > 0 && (
                <div className="dl-explorer-sidebar__group">
                    <div className="dl-explorer-sidebar__title">Recent</div>
                    {recents.map((p) => (
                        <div key={p} className="dl-explorer-sidebar__row" title={p}>
                            <button className="dl-explorer-sidebar__item dl-explorer-sidebar__item--main" onClick={() => onNavigate(p)}>
                                <Clock size={14} /><span>{basename(p)}</span>
                            </button>
                            <button className="dl-explorer-sidebar__remove" onClick={() => removeRecent(recentsKey, p)} title="Remove"><X size={12} /></button>
                        </div>
                    ))}
                </div>
            )}

            {currentPath && !pins.includes(currentPath) && (
                <button className="dl-explorer-sidebar__pin-cur" onClick={() => addPin(currentPath)}>
                    <Plus size={13} /><span>Pin current folder</span>
                </button>
            )}
        </aside>
    );
}
