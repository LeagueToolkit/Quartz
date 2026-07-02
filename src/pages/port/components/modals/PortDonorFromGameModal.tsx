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
// Reuse the Asset Extractor's ae-* card/sidebar styles + the dl-* primitives so
// this modal reads as the same design system.
import '@/pages/assetextractor/assetextractor.css';
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
    const showSkinlineResults = searchMode === 'skinline' && skinlineResults.length > 0;
    const rightSkins: DonorSkin[] = showSkinlineResults ? skinlineResults.map((r) => r.skin) : skins;
    const rightHasChampion = showSkinlineResults || !!selectedChampion;
    const rightSelectedId = selectedSkin?.id ?? null;
    const emptyLabel = searchMode === 'skinline' ? 'Search a skinline, then pick a skin' : 'Select a champion first';
    const onRightSelect = (skin: DonorSkin) => {
        if (showSkinlineResults) {
            const entry = skinlineResults.find((r) => r.skin.id === skin.id && r.skin.name === skin.name);
            if (entry) { handleSelectSkinlineResult(entry); return; }
        }
        setSelectedSkin(skin);
    };

    return createPortal(
        <div className="dl-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}>
            <div className="dl-modal dl-modal--large" style={{ height: 'min(760px, calc(100vh - 48px))' }}>
                <div className="dl-modal__head">
                    <h3 className="dl-modal__title">Load Donor From Game</h3>
                    <button className="dl-modal__close" onClick={() => !loading && onClose()} aria-label="Close">
                        <span className="dl-icon"><CloseIcon size={16} /></span>
                    </button>
                </div>

                <DonorPrefixField value={prefix} sanitized={sanitized} onChange={setPrefix} disabled={loading} />

                <RecentDonorsRow recentDonors={recentDonors} activeKey={activeRecentKey} onSelect={handleSelectRecent} />

                <div className="dl-modal__body donor-body">
                    <div className="donor-cols">
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
                            emptyLabel={emptyLabel}
                            onSelect={onRightSelect}
                            onYouTubeSkin={(skinName) => openYouTube(`${selectedChampion?.name ?? ''} ${skinName} skin spotlight League of Legends`)}
                        />
                    </div>
                </div>

                {(errorText || progressText) && (
                    <div className={`donor-progress ${errorText ? 'donor-progress--error' : 'donor-progress--info'}`}>
                        {errorText || progressText}
                    </div>
                )}

                <div className="dl-modal__foot">
                    <button type="button" onClick={onClose} disabled={loading} className="dl-btn dl-btn--secondary">
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
                        className={`dl-btn dl-btn--primary ${loading ? 'dl-btn--loading' : ''}`}
                    >
                        {loading ? 'Preparing' : 'Use As Donor'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
