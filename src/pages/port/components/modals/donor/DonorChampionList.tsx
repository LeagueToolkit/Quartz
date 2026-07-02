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
        <div className="donor-modal__col">
            <div style={{ position: 'relative', marginBottom: 10 }}>
                <input
                    className="dl-input"
                    placeholder={placeholder}
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && searchMode === 'skinline') onSubmitSkinline();
                    }}
                    style={{ width: '100%', paddingRight: 96, boxSizing: 'border-box' }}
                />
                <button
                    type="button"
                    onClick={onToggleMode}
                    className="dl-btn dl-btn--sm"
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}
                    title={searchMode === 'skinline' ? 'Skinline mode' : 'Champion mode'}
                >
                    {searchMode === 'skinline' ? 'Skinline' : 'Champion'}
                </button>
            </div>

            {loading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    Loading champions…
                </div>
            ) : (
                <div className="donor-modal__list">
                    {champions.map((champion) => {
                        const isActive = selectedChampionId === champion.id;
                        return (
                            <button
                                key={champion.id}
                                type="button"
                                onClick={() => onSelect(champion)}
                                className={`donor-modal__row ${isActive ? 'is-active' : ''}`}
                            >
                                <img
                                    src={getChampionIconUrl(champion.id)}
                                    alt={champion.name}
                                    loading="lazy"
                                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                                />
                                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {champion.name}
                                </span>
                                <span
                                    role="button"
                                    tabIndex={-1}
                                    onClick={(e) => { e.stopPropagation(); onYouTubeChampion(champion); }}
                                    title={`Search ${champion.name} skins on YouTube`}
                                    className="dl-btn dl-btn--icon dl-btn--ghost dl-btn--sm"
                                    style={{ flexShrink: 0 }}
                                >
                                    <span className="dl-icon"><Youtube size={14} /></span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
