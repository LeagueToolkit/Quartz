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
import type { DonorChampion, DonorSkin, DonorConfirmArgs, BanksConfirmArgs } from './donor/types';
// Reuse the Asset Extractor's ae-* card/sidebar styles + the dl-* primitives so
// this modal reads as the same design system.
import '@/pages/assetextractor/assetextractor.css';
import './donor/donorModal.css';

const PREFIX_KEY = 'port_donor_porting_prefix';
const BANK_OPTIONS_KEY = 'bnk-game-banks-options';
const sanitizePrefix = (v: string) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

function openYouTube(query: string) {
    const q = query.trim();
    if (!q) return;
    try { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, '_blank', 'noopener,noreferrer'); } catch { /* ignore */ }
}

/* One modal, two modes:
   - 'donor' (Port): pick ONE skin + a porting prefix → emits DonorConfirmArgs.
   - 'banks' (BNK Extract): pick MANY skins + VO/SFX toggles → emits BanksConfirmArgs.
   Both share the champion list, skin grid, skinline search, and dl-modal shell. */
type LoadFromGameModalProps = {
    open: boolean;
    loading: boolean;
    progressText: string;
    onClose: () => void;
} & (
    | {
        mode?: 'donor';
        recentDonors: RecentPortDonor[];
        onConfirm: (args: DonorConfirmArgs) => void;
    }
    | {
        mode: 'banks';
        recentDonors?: never;
        onConfirm: (args: BanksConfirmArgs) => void;
    }
);

export default function PortDonorFromGameModal(props: LoadFromGameModalProps) {
    const { open, loading, progressText, onClose } = props;
    const mode = props.mode ?? 'donor';
    const isBanks = mode === 'banks';
    const title = isBanks ? 'Load Sound Banks From Game' : 'Load Donor From Game';

    const [champions, setChampions] = useState<DonorChampion[]>([]);
    const [loadingChampions, setLoadingChampions] = useState(false);
    const [skins, setSkins] = useState<DonorSkin[]>([]);
    const [loadingSkins, setLoadingSkins] = useState(false);
    const [searchMode, setSearchMode] = useState<'champion' | 'skinline'>('champion');
    const [search, setSearch] = useState('');
    const [skinlineResults, setSkinlineResults] = useState<Array<{ champion: DonorChampion; skin: DonorSkin }>>([]);
    const [selectedChampion, setSelectedChampion] = useState<DonorChampion | null>(null);
    // donor mode: single skin; banks mode: many skins (by id).
    const [selectedSkin, setSelectedSkin] = useState<DonorSkin | null>(null);
    const [selectedSkinIds, setSelectedSkinIds] = useState<Set<number>>(new Set());
    const [prefix, setPrefix] = useState(() => {
        try { return localStorage.getItem(PREFIX_KEY) || ''; } catch { return ''; }
    });
    const [includeVoiceover, setIncludeVoiceover] = useState(() => {
        try { const raw = localStorage.getItem(BANK_OPTIONS_KEY); return raw ? JSON.parse(raw).includeVoiceover !== false : true; } catch { return true; }
    });
    const [includeSfx, setIncludeSfx] = useState(() => {
        try { const raw = localStorage.getItem(BANK_OPTIONS_KEY); return raw ? JSON.parse(raw).includeSfx !== false : true; } catch { return true; }
    });
    const [errorText, setErrorText] = useState('');

    const sanitized = sanitizePrefix(prefix);
    useEffect(() => {
        try { localStorage.setItem(PREFIX_KEY, prefix); } catch { /* ignore */ }
    }, [prefix]);
    useEffect(() => {
        try { localStorage.setItem(BANK_OPTIONS_KEY, JSON.stringify({ includeVoiceover, includeSfx })); } catch { /* ignore */ }
    }, [includeVoiceover, includeSfx]);

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

    // Cursor-following glow on skin cards + champion rows (matches the Asset
    // Extractor page; the .ae-card/.ae-sb__row ::after glow reads --mx/--my).
    useEffect(() => {
        if (!open) return;
        const onMove = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            for (const sel of ['.ae-card', '.ae-sb__row']) {
                const el = target.closest<HTMLElement>(sel);
                if (el) {
                    const r = el.getBoundingClientRect();
                    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
                    el.style.setProperty('--my', `${e.clientY - r.top}px`);
                }
            }
        };
        document.addEventListener('mousemove', onMove);
        return () => document.removeEventListener('mousemove', onMove);
    }, [open]);

    // Reset transient state when closed.
    useEffect(() => {
        if (open) return;
        setSearchMode('champion');
        setSearch('');
        setSkinlineResults([]);
        setSelectedChampion(null);
        setSelectedSkin(null);
        setSelectedSkinIds(new Set());
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
        setSelectedSkinIds(new Set());
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
    const canConfirm = isBanks
        ? Boolean(selectedChampion && selectedSkinIds.size > 0 && (includeVoiceover || includeSfx) && !loading && !loadingChampions && !loadingSkins)
        : Boolean(selectedChampion && selectedSkin && sanitized && !loading && !loadingChampions);

    if (!open) return null;

    // In skinline mode with results, the right column shows the flat result list
    // as skin cards; otherwise it shows the selected champion's skins.
    const showSkinlineResults = searchMode === 'skinline' && skinlineResults.length > 0;
    const rightSkins: DonorSkin[] = showSkinlineResults ? skinlineResults.map((r) => r.skin) : skins;
    const rightHasChampion = showSkinlineResults || !!selectedChampion;
    // Banks mode multi-selects; donor mode is the single selected skin as a 0/1 set.
    const rightSelectedIds = isBanks
        ? selectedSkinIds
        : (selectedSkin ? new Set([selectedSkin.id]) : new Set<number>());
    const emptyLabel = searchMode === 'skinline' ? 'Search a skinline, then pick a skin' : 'Select a champion first';
    const onRightSelect = (skin: DonorSkin) => {
        if (showSkinlineResults) {
            const entry = skinlineResults.find((r) => r.skin.id === skin.id && r.skin.name === skin.name);
            if (entry) {
                // A skinline result carries its own champion; select it, then in
                // banks mode toggle that skin into the multi-select set.
                handleSelectSkinlineResult(entry);
                if (isBanks) {
                    setSelectedSkinIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(skin.id)) next.delete(skin.id); else next.add(skin.id);
                        return next;
                    });
                }
                return;
            }
        }
        if (isBanks) {
            setSelectedSkinIds((prev) => {
                const next = new Set(prev);
                if (next.has(skin.id)) next.delete(skin.id); else next.add(skin.id);
                return next;
            });
        } else {
            setSelectedSkin(skin);
        }
    };

    const handleConfirm = () => {
        if (!selectedChampion) return;
        const champion = { id: selectedChampion.id, name: selectedChampion.name, alias: selectedChampion.alias };
        if (props.mode === 'banks') {
            if (selectedSkinIds.size === 0) return;
            props.onConfirm({ champion, skinIds: Array.from(selectedSkinIds), includeVoiceover, includeSfx });
        } else {
            if (!selectedSkin) return;
            props.onConfirm({
                champion,
                skin: { id: selectedSkin.id, name: selectedSkin.name, tilePath: selectedSkin.tilePath },
                portingPrefix: sanitized,
            });
        }
    };

    return createPortal(
        <div className="dl-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}>
            <div className="dl-modal dl-modal--large" style={{ height: 'min(760px, calc(100vh - 48px))' }}>
                <div className="dl-modal__head">
                    <h3 className="dl-modal__title">{title}</h3>
                    <button className="dl-modal__close" onClick={() => !loading && onClose()} aria-label="Close">
                        <span className="dl-icon"><CloseIcon size={16} /></span>
                    </button>
                </div>

                {isBanks ? (
                    <div className="donor-banks-opts">
                        <button type="button" onClick={() => setIncludeVoiceover((v) => !v)}
                            className={`dl-btn dl-btn--sm ${includeVoiceover ? 'dl-btn--primary' : 'dl-btn--secondary'}`}>
                            Extract VO
                        </button>
                        <button type="button" onClick={() => setIncludeSfx((v) => !v)}
                            className={`dl-btn dl-btn--sm ${includeSfx ? 'dl-btn--primary' : 'dl-btn--secondary'}`}>
                            Extract SFX
                        </button>
                        <span className="donor-banks-opts__hint">
                            {selectedChampion ? `${selectedChampion.name} · ${selectedSkinIds.size} skin(s) selected` : 'Select a champion first'}
                        </span>
                    </div>
                ) : (
                    <>
                        <DonorPrefixField value={prefix} sanitized={sanitized} onChange={setPrefix} disabled={loading} />
                        <RecentDonorsRow recentDonors={props.recentDonors ?? []} activeKey={activeRecentKey} onSelect={handleSelectRecent} />
                    </>
                )}

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
                            selectedSkinIds={rightSelectedIds}
                            badgeLabel={isBanks ? 'PICKED' : 'DONOR'}
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
                        onClick={handleConfirm}
                        className={`dl-btn dl-btn--primary ${loading ? 'dl-btn--loading' : ''}`}
                    >
                        {isBanks ? (loading ? 'Extracting…' : 'Load Banks') : (loading ? 'Preparing' : 'Use As Donor')}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
