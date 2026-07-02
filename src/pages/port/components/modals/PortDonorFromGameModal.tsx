import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X as CloseIcon } from 'lucide-react';
import {
    getCDragonChampions,
    getCDragonChampionSkins,
    fetchAllChromaData,
    searchSkinlines,
    type CDragonChampion,
} from '@/pages/assetextractor/communityDragonApi';
import type { RecentPortDonor } from '@/lib/stores';
import DonorChampionList from './donor/DonorChampionList';
import DonorSkinList from './donor/DonorSkinList';
import RecentDonorsRow from './donor/RecentDonorsRow';
import DonorPrefixField from './donor/DonorPrefixField';
import type { DonorChampion, DonorSkin, DonorConfirmArgs } from './donor/types';
import './donor/donorModal.css';

const PREFIX_KEY = 'port_donor_porting_prefix';
const sanitizePrefix = (v: string) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

function openYouTube(query: string) {
    const q = query.trim();
    if (!q) return;
    try { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, '_blank', 'noopener,noreferrer'); } catch { /* ignore */ }
}

interface PortDonorFromGameModalProps {
    open: boolean;
    loading: boolean;
    progressText: string;
    recentDonors: RecentPortDonor[];
    onClose: () => void;
    onConfirm: (args: DonorConfirmArgs) => void;
}

export default function PortDonorFromGameModal({
    open,
    loading,
    progressText,
    recentDonors,
    onClose,
    onConfirm,
}: PortDonorFromGameModalProps) {
    const [champions, setChampions] = useState<DonorChampion[]>([]);
    const [loadingChampions, setLoadingChampions] = useState(false);
    const [skins, setSkins] = useState<DonorSkin[]>([]);
    const [loadingSkins, setLoadingSkins] = useState(false);
    const [searchMode, setSearchMode] = useState<'champion' | 'skinline'>('champion');
    const [search, setSearch] = useState('');
    const [skinlineResults, setSkinlineResults] = useState<Array<{ champion: DonorChampion; skin: DonorSkin }>>([]);
    const [selectedChampion, setSelectedChampion] = useState<DonorChampion | null>(null);
    const [selectedSkin, setSelectedSkin] = useState<DonorSkin | null>(null);
    const [prefix, setPrefix] = useState(() => {
        try { return localStorage.getItem(PREFIX_KEY) || ''; } catch { return ''; }
    });
    const [errorText, setErrorText] = useState('');

    const sanitized = sanitizePrefix(prefix);
    useEffect(() => {
        try { localStorage.setItem(PREFIX_KEY, prefix); } catch { /* ignore */ }
    }, [prefix]);

    // Load champions on open.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoadingChampions(true);
        setErrorText('');
        getCDragonChampions()
            .then((list: CDragonChampion[]) => {
                if (cancelled) return;
                setChampions(list.map((c) => ({ id: c.id, name: c.name, alias: c.alias })));
            })
            .catch((e) => { if (!cancelled) setErrorText(`Failed to load champions: ${(e as Error).message}`); })
            .finally(() => { if (!cancelled) setLoadingChampions(false); });
        return () => { cancelled = true; };
    }, [open]);

    // Reset transient state when closed.
    useEffect(() => {
        if (open) return;
        setSearchMode('champion');
        setSearch('');
        setSkinlineResults([]);
        setSelectedChampion(null);
        setSelectedSkin(null);
        setSkins([]);
        setErrorText('');
    }, [open]);

    // Load skins for the selected champion.
    useEffect(() => {
        if (!open || !selectedChampion) return;
        let cancelled = false;
        setLoadingSkins(true);
        getCDragonChampionSkins(selectedChampion.id)
            .then((list) => {
                if (cancelled) return;
                setSkins(list.map((s) => ({ id: s.id, name: s.name, tilePath: s.tilePath, rarity: s.rarity })));
            })
            .catch((e) => { if (!cancelled) setErrorText(`Failed to load skins: ${(e as Error).message}`); })
            .finally(() => { if (!cancelled) setLoadingSkins(false); });
        return () => { cancelled = true; };
    }, [open, selectedChampion]);

    const filteredChampions = useMemo(() => {
        if (searchMode !== 'champion' || !search.trim()) return champions;
        const q = search.trim().toLowerCase();
        return champions.filter((c) => c.name.toLowerCase().includes(q) || c.alias.toLowerCase().includes(q));
    }, [champions, search, searchMode]);

    const runSkinlineSearch = () => {
        const q = search.trim();
        if (!q) { setSkinlineResults([]); return; }
        setErrorText('');
        fetchAllChromaData()
            .then((allSkins) => {
                const cdragonChamps: CDragonChampion[] = champions.map((c) => ({ id: c.id, name: c.name, alias: c.alias }));
                const groups = searchSkinlines(q, allSkins, cdragonChamps);
                const flat: Array<{ champion: DonorChampion; skin: DonorSkin }> = [];
                for (const g of groups) {
                    const champ = champions.find((c) => c.id === g.champion.id) || { id: g.champion.id, name: g.champion.name, alias: g.champion.alias };
                    for (const s of g.skins) {
                        flat.push({ champion: champ, skin: { id: s.skinNumber, name: s.name, tilePath: null, rarity: s.rarity } });
                    }
                }
                setSkinlineResults(flat);
            })
            .catch((e) => setErrorText(`Skinline search failed: ${(e as Error).message}`));
    };

    const handleToggleMode = () => {
        setSearchMode((prev) => {
            const next = prev === 'champion' ? 'skinline' : 'champion';
            if (next === 'champion') setSkinlineResults([]);
            setSearch('');
            return next;
        });
    };

    const handleSelectChampion = (champion: DonorChampion) => {
        setSelectedChampion(champion);
        setSelectedSkin(null);
    };

    const handleSelectRecent = (donor: RecentPortDonor) => {
        setSearchMode('champion');
        setSearch('');
        setSkinlineResults([]);
        const champ: DonorChampion = { id: donor.championId, name: donor.championName, alias: donor.championAlias };
        setSelectedChampion(champ);
        setSelectedSkin({ id: donor.skinId, name: donor.skinName, tilePath: donor.tilePath });
    };

    const handleSelectSkinlineResult = (entry: { champion: DonorChampion; skin: DonorSkin }) => {
        setSelectedChampion(entry.champion);
        setSelectedSkin(entry.skin);
    };

    const activeRecentKey = selectedChampion && selectedSkin ? `${selectedChampion.id}_${selectedSkin.id}` : null;
    const canConfirm = Boolean(selectedChampion && selectedSkin && sanitized && !loading && !loadingChampions);

    if (!open) return null;

    // In skinline mode with results, the right column shows the flat result list
    // as skin cards; otherwise it shows the selected champion's skins.
    const rightSkins: DonorSkin[] = searchMode === 'skinline' && skinlineResults.length > 0
        ? skinlineResults.map((r) => r.skin)
        : skins;
    const rightHasChampion = searchMode === 'skinline' ? skinlineResults.length > 0 : !!selectedChampion;
    const rightSelectedId = selectedSkin?.id ?? null;
    const rightChampionName = searchMode === 'skinline' ? 'Skinline results' : (selectedChampion?.name ?? '');
    const onRightSelect = (skin: DonorSkin) => {
        if (searchMode === 'skinline') {
            const entry = skinlineResults.find((r) => r.skin.id === skin.id && r.skin.name === skin.name);
            if (entry) { handleSelectSkinlineResult(entry); return; }
        }
        setSelectedSkin(skin);
    };

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 5300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div
                style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, black 65%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
                onClick={() => !loading && onClose()}
            />
            <div className="donor-modal" onClick={(e) => e.stopPropagation()}>
                <div style={{ height: 3, flexShrink: 0, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite' }} />

                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Load Donor From Game
                    </h2>
                    <button
                        onClick={() => !loading && onClose()}
                        className="dl-btn dl-btn--icon dl-btn--ghost dl-btn--sm"
                        title="Close"
                    >
                        <span className="dl-icon"><CloseIcon size={15} /></span>
                    </button>
                </div>

                <DonorPrefixField value={prefix} sanitized={sanitized} onChange={setPrefix} disabled={loading} />

                <RecentDonorsRow recentDonors={recentDonors} activeKey={activeRecentKey} onSelect={handleSelectRecent} />

                <div className="donor-modal__cols">
                    <DonorChampionList
                        champions={filteredChampions}
                        loading={loadingChampions}
                        selectedChampionId={selectedChampion?.id ?? null}
                        searchMode={searchMode}
                        searchValue={search}
                        onSearchChange={setSearch}
                        onToggleMode={handleToggleMode}
                        onSubmitSkinline={runSkinlineSearch}
                        onSelect={handleSelectChampion}
                        onYouTubeChampion={(c) => openYouTube(`ALL ${c.name} SKINS SPOTLIGHT League of Legends`)}
                    />
                    <DonorSkinList
                        skins={rightSkins}
                        loading={loadingSkins}
                        hasChampion={rightHasChampion}
                        selectedSkinId={rightSelectedId}
                        championName={rightChampionName}
                        onSelect={onRightSelect}
                        onYouTubeSkin={(skinName) => openYouTube(`${selectedChampion?.name ?? ''} ${skinName} skin spotlight League of Legends`)}
                    />
                </div>

                {(errorText || progressText) && (
                    <div style={{ padding: '0 16px 8px', color: errorText ? 'var(--color-error, #ff7a7a)' : 'var(--accent-primary)', fontSize: '0.74rem' }}>
                        {errorText || progressText}
                    </div>
                )}

                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" onClick={onClose} disabled={loading} className="dl-btn dl-btn--ghost dl-btn--sm">
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!canConfirm}
                        onClick={() => {
                            if (!selectedChampion || !selectedSkin) return;
                            onConfirm({
                                champion: { id: selectedChampion.id, name: selectedChampion.name, alias: selectedChampion.alias },
                                skin: { id: selectedSkin.id, name: selectedSkin.name, tilePath: selectedSkin.tilePath },
                                portingPrefix: sanitized,
                            });
                        }}
                        className="dl-btn dl-btn--sm"
                        style={{ opacity: canConfirm ? 1 : 0.5, cursor: canConfirm ? 'pointer' : 'not-allowed' }}
                    >
                        {loading ? 'Preparing…' : 'Use As Donor'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
