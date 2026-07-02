import { useState } from 'react';
import { Youtube } from 'lucide-react';
import type { ExtractorChampion } from '../types';
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
    offlineMode?: boolean;
    sidebarWidth?: number;
}

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
        <aside className="border-r border-gray-800 p-4 overflow-y-auto flex-shrink-0" style={{ width: sidebarWidth }}>
            <div className="relative mb-4">
                <input
                    placeholder={placeholder}
                    value={activeValue}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && useSkinlineMode) onSearchSkinlines();
                    }}
                    className="w-full pl-4 pr-24 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none"
                    style={{ borderColor: 'rgba(255,255,255,0.16)', boxShadow: 'none' }}
                />
                <button
                    type="button"
                    onClick={handleToggleMode}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-xs font-semibold transition-all duration-150"
                    style={{
                        color: useSkinlineMode ? 'var(--accent2)' : 'var(--accent)',
                        border: `1px solid ${useSkinlineMode
                            ? 'color-mix(in srgb, var(--accent2), transparent 45%)'
                            : 'color-mix(in srgb, var(--accent), transparent 45%)'}`,
                        background: useSkinlineMode
                            ? 'color-mix(in srgb, var(--accent2), transparent 84%)'
                            : 'color-mix(in srgb, var(--accent), transparent 84%)',
                        boxShadow: useSkinlineMode
                            ? '0 0 10px color-mix(in srgb, var(--accent2), transparent 70%)'
                            : '0 0 10px color-mix(in srgb, var(--accent), transparent 70%)',
                    }}
                    title={useSkinlineMode ? 'Skinline mode' : 'Champion mode'}
                >
                    {useSkinlineMode ? 'Skinline' : 'Champion'}
                </button>
            </div>

            {showSkinlineSearch && useSkinlineMode && (
                <button
                    onClick={onClearSkinlineSearch}
                    className="mb-4 text-xs text-gray-400 hover:text-white transition-colors"
                >
                    Clear skinline search
                </button>
            )}

            <div className="space-y-1">
                {filteredChampions.map((champion) => {
                    const isActive = selectedChampion?.id === champion.id;
                    return (
                        <button
                            key={champion.id}
                            onClick={() => onSelectChampion(champion)}
                            className={`relative w-full flex items-center gap-3 p-2 rounded-lg text-left group transition-all duration-200 ${isActive ? 'border' : 'border border-transparent hover:border-gray-600/50'}`}
                            style={isActive
                                ? {
                                    background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent), transparent 90%), color-mix(in srgb, var(--accent2), transparent 90%))',
                                    borderColor: 'color-mix(in srgb, var(--accent), transparent 45%)',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 18px color-mix(in srgb, var(--accent), transparent 72%), 0 10px 26px rgba(0,0,0,0.35)',
                                }
                                : { background: 'rgba(18, 20, 34, 0.65)' }}
                        >
                            {isActive && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: -1,
                                        top: 6,
                                        bottom: 6,
                                        width: 3,
                                        borderRadius: 999,
                                        background: 'linear-gradient(180deg, var(--accent), var(--accent2))',
                                        boxShadow: '0 0 10px color-mix(in srgb, var(--accent), transparent 45%)',
                                    }}
                                />
                            )}

                            {!offlineMode && (champion.cdragonId || champion.championIconUrl) ? (
                                <img
                                    src={champion.championIconUrl || (champion.cdragonId ? getChampionIconUrl(champion.cdragonId) : '')}
                                    alt={champion.name}
                                    className="w-8 h-8 rounded-full transition-all duration-200"
                                    style={isActive
                                        ? {
                                            border: '1px solid color-mix(in srgb, var(--accent), transparent 18%)',
                                            boxShadow: '0 0 14px color-mix(in srgb, var(--accent), transparent 55%)',
                                        }
                                        : undefined}
                                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-700 text-[9px] text-gray-300 flex items-center justify-center">
                                    N/A
                                </div>
                            )}

                            <div>
                                <div className="text-sm font-medium transition-colors" style={{ color: isActive ? 'var(--accent)' : 'var(--text)' }}>
                                    {champion.name}
                                </div>
                                <div className="text-xs transition-colors" style={{ color: isActive ? 'var(--accent2)' : 'rgba(255,255,255,0.62)' }}>
                                    {champion.alias}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onYouTubeChampion?.(champion);
                                }}
                                title={`Search ${champion.name} skins on YouTube`}
                                style={{
                                    marginLeft: 'auto',
                                    width: 28,
                                    height: 24,
                                    borderRadius: 6,
                                    border: '1px solid rgba(255, 77, 77, 0.55)',
                                    background: 'color-mix(in srgb, #ff2c2c, transparent 84%)',
                                    color: '#ff2c2c',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 0 10px rgba(255, 46, 46, 0.22), inset 0 1px 0 rgba(255,255,255,0.16)',
                                }}
                            >
                                <Youtube size={14} color="#ff2c2c" />
                            </button>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}
