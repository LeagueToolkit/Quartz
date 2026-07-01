import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Youtube } from 'lucide-react';
import { getChampions, getChampionSkins, getChampionIconUrl, toCdragonRaw, openYouTubeSearch } from '../utils/gameBanksApi';
import type { GameBanksConfirm, GameChampion, GameSkin } from '../types';

const BANK_OPTIONS_STORAGE_KEY = 'bnk-game-banks-options';

function skinMatchesSearch(skin: GameSkin, query: string): boolean {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const skinName = String(skin.name || '').toLowerCase();
    const normalizedSkinName = skinName.replace(/[^a-z0-9]/g, '');
    const normalizedQuery = q.replace(/[^a-z0-9]/g, '');
    return skinName.includes(q) || (!!normalizedQuery && normalizedSkinName.includes(normalizedQuery)) || String(skin.id).includes(q);
}

const youtubeBtnStyle: CSSProperties = {
    marginLeft: 'auto', width: 28, height: 24, borderRadius: 6, border: '1px solid color-mix(in oklab, var(--color-danger) 55%, transparent)',
    background: 'color-mix(in oklab, var(--color-danger) 16%, transparent)', color: 'var(--color-danger)', fontFamily: 'JetBrains Mono, monospace',
    cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const SkinIcon = memo(function SkinIcon({ tilePath, skinName }: { tilePath?: string | null; skinName: string }) {
    const [src, setSrc] = useState(() => toCdragonRaw(tilePath));
    if (!src) {
        return <div style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', flexShrink: 0 }} />;
    }
    return (
        <img src={src} alt={skinName} width={38} height={38} loading="lazy" onError={() => setSrc('')}
            style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} />
    );
});

interface Props {
    open: boolean;
    loading?: boolean;
    progressText?: string;
    onClose: () => void;
    onConfirm: (req: GameBanksConfirm) => void;
}

function BnkGameBanksModal({ open, loading = false, progressText = '', onClose, onConfirm }: Props) {
    const [champions, setChampions] = useState<GameChampion[]>([]);
    const [skins, setSkins] = useState<GameSkin[]>([]);
    const [loadingChampions, setLoadingChampions] = useState(false);
    const [loadingSkins, setLoadingSkins] = useState(false);
    const [search, setSearch] = useState('');
    const [skinSearch, setSkinSearch] = useState('');
    const [selectedChampion, setSelectedChampion] = useState<GameChampion | null>(null);
    const [selectedSkinIds, setSelectedSkinIds] = useState<Set<number>>(new Set());
    const [includeVoiceover, setIncludeVoiceover] = useState(() => {
        try { const raw = localStorage.getItem(BANK_OPTIONS_STORAGE_KEY); return raw ? JSON.parse(raw).includeVoiceover !== false : true; } catch { return true; }
    });
    const [includeSfx, setIncludeSfx] = useState(() => {
        try { const raw = localStorage.getItem(BANK_OPTIONS_STORAGE_KEY); return raw ? JSON.parse(raw).includeSfx !== false : true; } catch { return true; }
    });
    const [errorText, setErrorText] = useState('');
    const [isNarrow, setIsNarrow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 980 : false));

    useEffect(() => {
        const onResize = () => setIsNarrow(window.innerWidth < 980);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        (async () => {
            setLoadingChampions(true);
            setErrorText('');
            try {
                const list = await getChampions();
                if (!cancelled) setChampions(list);
            } finally {
                if (!cancelled) setLoadingChampions(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open]);

    useEffect(() => {
        if (!open || !selectedChampion) return undefined;
        let cancelled = false;
        (async () => {
            setLoadingSkins(true);
            try {
                const list = await getChampionSkins(selectedChampion.id);
                if (!cancelled) { setSkins(list); setSelectedSkinIds(new Set()); }
            } finally {
                if (!cancelled) setLoadingSkins(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, selectedChampion]);

    useEffect(() => {
        if (!open) {
            setSearch('');
            setSkinSearch('');
            setSelectedChampion(null);
            setSelectedSkinIds(new Set());
            setSkins([]);
            setErrorText('');
        }
    }, [open]);

    useEffect(() => {
        try { localStorage.setItem(BANK_OPTIONS_STORAGE_KEY, JSON.stringify({ includeVoiceover, includeSfx })); } catch { /* ignore */ }
    }, [includeVoiceover, includeSfx]);

    const filteredChampions = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return champions;
        return champions.filter((c) => c.name.toLowerCase().includes(q) || (c.alias || '').toLowerCase().includes(q));
    }, [champions, search]);

    const filteredSkins = useMemo(() => skins.filter((s) => skinMatchesSearch(s, skinSearch)), [skins, skinSearch]);

    const toggleSkin = (skinId: number) => {
        setSelectedSkinIds((prev) => {
            const next = new Set(prev);
            if (next.has(skinId)) next.delete(skinId); else next.add(skinId);
            return next;
        });
    };

    const canConfirm = Boolean(selectedChampion && selectedSkinIds.size > 0 && (includeVoiceover || includeSfx) && !loading && !loadingChampions && !loadingSkins);

    if (!open) return null;

    const panelStyle: CSSProperties = { borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: 10, display: 'flex', flexDirection: 'column', minHeight: 0 };
    const panelTitle: CSSProperties = { marginBottom: 8, color: 'var(--accent-secondary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' };

    return (
        <div style={{ position: 'fixed', top: 32, left: 60, right: 0, bottom: 0, zIndex: 5300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={loading ? undefined : onClose} style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, var(--bg-primary) 78%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />

            <div onClick={(e) => e.stopPropagation()} style={{
                position: 'relative', width: 'min(980px, calc(100% - 16px))', height: 'min(760px, calc(100% - 16px))', maxHeight: 'calc(100% - 16px)',
                display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                borderRadius: 16, boxShadow: '0 30px 70px color-mix(in oklab, var(--bg-primary) 55%, transparent)', overflow: 'hidden',
            }}>
                <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite', flexShrink: 0 }} />

                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text)' }}>
                        Load Sound Banks From Game
                    </h2>
                    <button onClick={loading ? undefined : onClose} type="button"
                        style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-secondary)', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.25s ease' }}>
                        {'✕'}
                    </button>
                </div>

                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button type="button" onClick={() => setIncludeVoiceover((v) => !v)}
                        className={`dl-btn dl-btn--sm ${includeVoiceover ? 'dl-btn--primary' : 'dl-btn--secondary'}`}>
                        Extract VO
                    </button>
                    <button type="button" onClick={() => setIncludeSfx((v) => !v)}
                        className={`dl-btn dl-btn--sm ${includeSfx ? 'dl-btn--primary' : 'dl-btn--secondary'}`}>
                        Extract SFX
                    </button>
                    <div style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem' }}>
                        {selectedChampion ? `${selectedChampion.name} - ${selectedSkinIds.size} skin(s) selected` : 'Select a champion first'}
                    </div>
                </div>

                <div style={{ padding: 16, display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: 14, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <div style={panelStyle}>
                        <div style={panelTitle}>Champions</div>
                        <input className="dl-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search champion..." style={{ marginBottom: 10 }} />
                        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                            {loadingChampions ? (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.74rem' }}>Loading champions...</div>
                            ) : filteredChampions.map((champ) => {
                                const selected = selectedChampion?.id === champ.id;
                                return (
                                    <button key={champ.id} type="button" onClick={() => setSelectedChampion(champ)}
                                        style={{ width: '100%', height: 36, marginBottom: 4, borderRadius: 8, border: selected ? '1px solid var(--accent-secondary)' : '1px solid transparent', background: selected ? 'color-mix(in oklab, var(--accent-secondary) 16%, transparent)' : 'transparent', display: 'flex', alignItems: 'center', gap: 10, color: selected ? 'var(--accent-secondary)' : 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem', cursor: 'pointer', padding: '0 10px', textAlign: 'left', overflow: 'hidden' }}>
                                        <img src={getChampionIconUrl(champ.id)} alt={champ.name} width={26} height={26} loading="lazy" style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{champ.name}</span>
                                        <span role="button" tabIndex={0} title="Search champion skins on YouTube"
                                            onClick={(e) => { e.stopPropagation(); openYouTubeSearch(`ALL ${champ.name} SKINS SPOTLIGHT League of Legends`); }}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openYouTubeSearch(`ALL ${champ.name} SKINS SPOTLIGHT League of Legends`); } }}
                                            style={youtubeBtnStyle}>
                                            <Youtube size={14} color="var(--color-danger)" />
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div style={panelStyle}>
                        <div style={panelTitle}>{selectedChampion ? `Skins: ${selectedChampion.name}` : 'Skins'}</div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                            <input className="dl-input" value={skinSearch} onChange={(e) => setSkinSearch(e.target.value)} placeholder="Filter selected champion skins..." style={{ flex: 1 }} />
                            <button type="button" className="dl-btn dl-btn--secondary dl-btn--sm" onClick={() => setSelectedSkinIds(new Set(filteredSkins.map((s) => s.id)))}>All</button>
                            <button type="button" className="dl-btn dl-btn--secondary dl-btn--sm" onClick={() => setSelectedSkinIds(new Set())}>None</button>
                        </div>
                        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                            {loadingSkins ? (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.74rem' }}>Loading skins...</div>
                            ) : selectedChampion ? (
                                filteredSkins.length > 0 ? filteredSkins.map((skin) => {
                                    const selected = selectedSkinIds.has(skin.id);
                                    return (
                                        <button key={skin.id} type="button" onClick={() => toggleSkin(skin.id)}
                                            style={{ width: '100%', height: 46, marginBottom: 4, borderRadius: 8, border: selected ? '1px solid var(--accent-secondary)' : '1px solid transparent', background: selected ? 'color-mix(in oklab, var(--accent-secondary) 16%, transparent)' : 'transparent', display: 'flex', alignItems: 'center', gap: 10, color: selected ? 'var(--accent-secondary)' : 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', cursor: 'pointer', padding: '0 10px', textAlign: 'left', overflow: 'hidden' }}>
                                            <SkinIcon tilePath={skin.tilePath} skinName={skin.name} />
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{skin.name} (ID {skin.id})</span>
                                            <span role="button" tabIndex={0} title="Search skin on YouTube"
                                                onClick={(e) => { e.stopPropagation(); openYouTubeSearch(`${selectedChampion.name} ${skin.name} skin spotlight League of Legends`); }}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openYouTubeSearch(`${selectedChampion.name} ${skin.name} skin spotlight League of Legends`); } }}
                                                style={youtubeBtnStyle}>
                                                <Youtube size={14} color="var(--color-danger)" />
                                            </span>
                                        </button>
                                    );
                                }) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.74rem' }}>No skins match this search</div>
                                )
                            ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.74rem' }}>Select a champion first</div>
                            )}
                        </div>
                    </div>
                </div>

                {(errorText || progressText) ? (
                    <div style={{ padding: '0 16px 10px', color: errorText ? 'var(--color-danger)' : 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.74rem' }}>
                        {errorText || progressText}
                    </div>
                ) : null}

                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" className="dl-btn dl-btn--secondary" onClick={onClose} disabled={loading}>
                        Cancel
                    </button>
                    <button type="button" className="dl-btn dl-btn--primary" disabled={!canConfirm}
                        onClick={() => onConfirm({ champion: selectedChampion, skinIds: Array.from(selectedSkinIds), includeVoiceover, includeSfx })}>
                        {loading ? 'Extracting...' : 'Load Banks'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default memo(BnkGameBanksModal);
