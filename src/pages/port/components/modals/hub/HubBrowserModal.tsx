import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, RefreshCw, Upload, Github } from 'lucide-react';
import githubApi, { type HubVfxSystem } from '@/pages/vfxhub/lib/githubApi';
import { Skeleton } from '@/components/ui/Skeleton';
import { HubSystemCard } from './HubSystemCard';
import type { HubPick } from './useHubDonor';
import './hub.css';

interface FlatSystem extends HubVfxSystem {
    collection: string;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const systemKey = (s: FlatSystem) => `${s.collection}::${s.name}`;

/* VFX Hub collection browser. Loads systems from the GitHub hub, filters by
   category + search, and lets the user pick one or more to load as the Port
   donor. Hosts the "Upload to Hub" entry point. */
export function HubBrowserModal({ open, onClose, onPickSystems, onOpenUpload, staging }: {
    open: boolean;
    onClose: () => void;
    onPickSystems: (picks: HubPick[]) => void;
    onOpenUpload: () => void;
    staging: boolean;
}) {
    const [systems, setSystems] = useState<FlatSystem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { collections } = await githubApi.getVFXCollections();
            const flat: FlatSystem[] = [];
            for (const c of collections) {
                for (const s of c.systems) flat.push({ ...s, collection: c.name, category: c.category });
            }
            setSystems(flat);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        setSelected(new Set());
        if (systems.length === 0) void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const categories = useMemo(() => {
        const set = new Set<string>();
        for (const s of systems) if (s.category) set.add(s.category);
        return ['All', ...[...set].sort()];
    }, [systems]);

    const visible = useMemo(() => {
        let list = systems;
        if (category !== 'All') {
            const re = new RegExp(`^${escapeRegex(category)}$`, 'i');
            list = list.filter((s) => typeof s.category === 'string' && re.test(s.category));
        }
        if (search) {
            const re = new RegExp(escapeRegex(search), 'i');
            list = list.filter((s) => re.test(s.displayName || s.name || '') || re.test(s.description || ''));
        }
        return list;
    }, [systems, category, search]);

    if (!open) return null;

    const toggle = (s: FlatSystem) => {
        setSelected((prev) => {
            const next = new Set(prev);
            const k = systemKey(s);
            if (next.has(k)) next.delete(k); else next.add(k);
            return next;
        });
    };

    const confirm = () => {
        const picks: HubPick[] = systems
            .filter((s) => selected.has(systemKey(s)))
            .map((s) => ({ name: s.name, collectionFile: s.collection }));
        if (picks.length) { onPickSystems(picks); onClose(); }
    };

    return createPortal(
        <div className="dl-modal-backdrop" style={{ zIndex: 10000 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="dl-modal hub-modal">
                {/* Bar */}
                <div className="hub-bar">
                    <Github size={18} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                    <div className="dl-search hub-bar__search">
                        <Search size={14} />
                        <input className="dl-input" placeholder="Search VFX systems..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <button className="dl-btn dl-btn--icon dl-btn--sm" onClick={() => void load()} title="Refresh"><RefreshCw size={15} /></button>
                    <button className="dl-btn dl-btn--icon dl-btn--sm" onClick={onClose} title="Close"><X size={16} /></button>
                </div>
                <div className="hub-bar" style={{ borderTop: 'none', paddingTop: 0 }}>
                    <div className="hub-chips">
                        {categories.map((c) => (
                            <button key={c} className={`hub-chip ${category === c ? 'is-active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
                        ))}
                    </div>
                </div>

                {/* Body */}
                <div className="hub-body">
                    {loading ? (
                        <div className="hub-grid">
                            {Array.from({ length: 9 }).map((_, i) => (
                                <div key={i} className="hub-card" style={{ pointerEvents: 'none' }}>
                                    <Skeleton height={0} radius={0} style={{ aspectRatio: '16 / 10', width: '100%' }} delayClass={((i % 3) + 1) as 1 | 2 | 3} />
                                    <div className="hub-card__body">
                                        <Skeleton height={13} radius={4} style={{ width: '70%' }} delayClass={((i % 3) + 1) as 1 | 2 | 3} />
                                        <Skeleton height={10} radius={4} style={{ width: '40%' }} delayClass={((i % 3) + 1) as 1 | 2 | 3} />
                                        <Skeleton height={10} radius={4} style={{ width: '90%' }} delayClass={((i % 3) + 1) as 1 | 2 | 3} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="hub-state hub-state--error">
                            <span>Could not load the VFX Hub.</span>
                            <span style={{ fontSize: 12, opacity: 0.8 }}>{error}</span>
                            <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={() => void load()}>Retry</button>
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="hub-state">{search || category !== 'All' ? 'No systems match' : 'No systems available'}</div>
                    ) : (
                        <div className="hub-grid">
                            {visible.map((s) => (
                                <HubSystemCard key={systemKey(s)} system={s} selected={selected.has(systemKey(s))} onToggle={() => toggle(s)} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="hub-foot">
                    <button className="dl-btn dl-btn--secondary" onClick={onOpenUpload}><Upload size={14} /><span>Upload to Hub</span></button>
                    <div className="hub-foot__spacer" />
                    {selected.size > 0 && <span className="hub-foot__count">{selected.size} selected</span>}
                    <button className="dl-btn dl-btn--primary" disabled={selected.size === 0 || staging} onClick={confirm}>
                        {staging ? 'Loading...' : 'Load as donor'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
