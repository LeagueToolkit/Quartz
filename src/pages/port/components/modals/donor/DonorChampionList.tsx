import { Youtube } from 'lucide-react';
import { getChampionIconUrl } from '@/pages/assetextractor/mediaService';
import type { DonorChampion } from './types';

interface DonorChampionListProps {
    champions: DonorChampion[];
    loading: boolean;
    selectedChampionId: string | null;
    searchMode: 'champion' | 'skinline';
    searchValue: string;
    onSearchChange: (v: string) => void;
    onToggleMode: () => void;
    onSubmitSkinline: () => void;
    onSelect: (champion: DonorChampion) => void;
    onYouTubeChampion: (champion: DonorChampion) => void;
}

/* Champion sidebar for the donor modal. Mirrors the Asset Extractor's
   ChampionSidebar (ae-sb* classes, champion/skinline search-mode toggle) so the
   two browsers read as one design. */
export default function DonorChampionList({
    champions,
    loading,
    selectedChampionId,
    searchMode,
    searchValue,
    onSearchChange,
    onToggleMode,
    onSubmitSkinline,
    onSelect,
    onYouTubeChampion,
}: DonorChampionListProps) {
    const placeholder = searchMode === 'skinline' ? 'Search skinline…' : 'Search champions…';

    return (
        <div className="donor-cols__side">
            <div className="ae-sb__search">
                <input
                    className="dl-input"
                    placeholder={placeholder}
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && searchMode === 'skinline') onSubmitSkinline();
                    }}
                    style={{ paddingRight: 96 }}
                />
                <div className="ae-sb__search-actions">
                    <button
                        type="button"
                        onClick={onToggleMode}
                        className="dl-btn dl-btn--sm"
                        title={searchMode === 'skinline' ? 'Skinline mode' : 'Champion mode'}
                    >
                        {searchMode === 'skinline' ? 'Skinline' : 'Champion'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="donor-empty">Loading champions…</div>
            ) : (
                <div className="ae-sb__list">
                    {champions.map((champion) => {
                        const isActive = selectedChampionId === champion.id;
                        return (
                            <button
                                key={champion.id}
                                type="button"
                                onClick={(e) => { onSelect(champion); e.currentTarget.blur(); }}
                                className={`ae-sb__row ${isActive ? 'is-active' : ''}`}
                            >
                                <img
                                    className="ae-sb__avatar"
                                    src={getChampionIconUrl(champion.id)}
                                    alt={champion.name}
                                    loading="lazy"
                                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                                />
                                <div className="ae-sb__meta">
                                    <span className="ae-sb__name">{champion.name}</span>
                                    <span className="ae-sb__alias">{champion.alias}</span>
                                </div>
                                <span
                                    role="button"
                                    tabIndex={-1}
                                    onClick={(e) => { e.stopPropagation(); onYouTubeChampion(champion); }}
                                    title={`Search ${champion.name} skins on YouTube`}
                                    className="ae-sb__yt"
                                >
                                    <Youtube size={14} />
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
