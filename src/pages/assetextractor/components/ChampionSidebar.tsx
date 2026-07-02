import { useState } from 'react';
import { Youtube, Info as InfoIcon } from 'lucide-react';
import type { ExtractorChampion, ViewMode } from '../types';
import { getChampionIconUrl } from '../mediaService';

interface Props {
    searchTerm: string;
    onSearchTermChange: (v: string) => void;
    skinlineSearchTerm: string;
    onSkinlineSearchTermChange: (v: string) => void;
    onSearchSkinlines: () => void;
    showSkinlineSearch: boolean;
    onClearSkinlineSearch: () => void;
    filteredChampions: ExtractorChampion[];
    selectedChampion: ExtractorChampion | null;
    onSelectChampion: (c: ExtractorChampion) => void;
    onYouTubeChampion: (c: ExtractorChampion) => void;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    showSearchInfo: boolean;
    onToggleSearchInfo: () => void;
    offlineMode?: boolean;
    sidebarWidth?: number;
}

const CATEGORIES: Array<{ value: ViewMode; label: string }> = [
    { value: 'champion', label: 'Champions' },
    { value: 'tft', label: 'TFT' },
    { value: 'ward', label: 'Wards' },
    { value: 'emote', label: 'Emotes' },
];

export function ChampionSidebar({
    searchTerm,
    onSearchTermChange,
    skinlineSearchTerm,
    onSkinlineSearchTermChange,
    onSearchSkinlines,
    showSkinlineSearch,
    onClearSkinlineSearch,
    filteredChampions,
    selectedChampion,
    onSelectChampion,
    onYouTubeChampion,
    viewMode,
    onViewModeChange,
    showSearchInfo,
    onToggleSearchInfo,
    offlineMode = false,
    sidebarWidth = 256,
}: Props) {
    const [useSkinlineMode, setUseSkinlineMode] = useState(false);
    const activeValue = useSkinlineMode ? skinlineSearchTerm : searchTerm;
    const placeholder = useSkinlineMode ? 'Search skinline...' : 'Search champions...';

    const handleToggleMode = () => {
        setUseSkinlineMode((prev) => {
            const next = !prev;
            if (!next) onClearSkinlineSearch?.();
            return next;
        });
    };

    const handleInputChange = (value: string) => {
        if (useSkinlineMode) {
            onSkinlineSearchTermChange(value);
            return;
        }
        onSearchTermChange(value);
    };

    return (
        <aside className="ae-sb" style={{ width: sidebarWidth }}>
            <div className="ae-sb__tabs dl-tabs" role="tablist" aria-label="Data source">
                {CATEGORIES.map((cat) => (
                    <button
                        key={cat.value}
                        type="button"
                        role="tab"
                        aria-selected={viewMode === cat.value}
                        className={`dl-tab ${viewMode === cat.value ? 'dl-tab--active' : ''}`}
                        onClick={() => onViewModeChange(cat.value)}
                        title={`Show ${cat.label}`}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            <div className="ae-sb__search">
                <input
                    className="dl-input"
                    placeholder={placeholder}
                    value={activeValue}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && useSkinlineMode) onSearchSkinlines();
                    }}
                    style={{ paddingRight: 132 }}
                />
                <div className="ae-sb__search-actions">
                    <button
                        type="button"
                        onClick={onToggleSearchInfo}
                        className={`dl-btn dl-btn--icon dl-btn--ghost dl-btn--sm ${showSearchInfo ? 'dl-btn--active' : ''}`}
                        title="Search Help"
                        aria-pressed={showSearchInfo}
                    >
                        <span className="dl-icon"><InfoIcon size={15} /></span>
                    </button>
                    <button
                        type="button"
                        onClick={handleToggleMode}
                        className="dl-btn dl-btn--sm"
                        title={useSkinlineMode ? 'Skinline mode' : 'Champion mode'}
                    >
                        {useSkinlineMode ? 'Skinline' : 'Champion'}
                    </button>
                </div>
            </div>

            {showSkinlineSearch && useSkinlineMode && (
                <button
                    onClick={onClearSkinlineSearch}
                    className="dl-btn dl-btn--ghost dl-btn--sm"
                    style={{ marginBottom: 12 }}
                >
                    Clear skinline search
                </button>
            )}

            <div className="ae-sb__list">
                {filteredChampions.map((champion) => {
                    const isActive = selectedChampion?.id === champion.id;
                    const iconSrc = champion.championIconUrl || (champion.cdragonId ? getChampionIconUrl(champion.cdragonId) : '');
                    return (
                        <button
                            key={champion.id}
                            type="button"
                            onClick={(e) => { onSelectChampion(champion); e.currentTarget.blur(); }}
                            className={`ae-sb__row ${isActive ? 'is-active' : ''}`}
                        >
                            {!offlineMode && iconSrc ? (
                                <img
                                    className="ae-sb__avatar"
                                    src={iconSrc}
                                    alt={champion.name}
                                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                                />
                            ) : (
                                <div className="ae-sb__avatar ae-sb__avatar--fallback">N/A</div>
                            )}

                            <div className="ae-sb__meta">
                                <span className="ae-sb__name">{champion.name}</span>
                                <span className="ae-sb__alias">{champion.alias}</span>
                            </div>

                            <span
                                role="button"
                                tabIndex={-1}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onYouTubeChampion?.(champion);
                                }}
                                title={`Search ${champion.name} skins on YouTube`}
                                className="ae-sb__yt"
                            >
                                <Youtube size={14} />
                            </span>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}
