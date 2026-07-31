import { Box, Youtube } from 'lucide-react';
import type { ExtractorChampion, ExtractorSkin, Chroma } from '../types';
import { getRarityIconUrl } from '../mediaService';
import { getDefaultChromaColor } from '../communityDragonApi';
import { ChromaDot } from './ChromaDot';

interface Props {
    selectedChampion: ExtractorChampion;
    loadingSkins: Record<string, boolean>;
    championSkins: ExtractorSkin[];
    selectedSkins: Array<{ name: string; champion?: { name: string } }>;
    extractingSkins: Record<string, boolean>;
    extractionProgress: Record<string, string>;
    chromaData: Record<string, Chroma[]>;
    selectedChromas: Record<string, Chroma>;
    onSkinClick: (skinName: string) => void;
    onChromaClick: (chroma: Chroma, skin: ExtractorSkin, championName: string) => void;
    onDownloadSplashArt: (championName: string, championAlias: string, skinNumber: number, skinName: string, splashUrlOverride?: string | null) => void;
    onYouTubeSkin: (championName: string, skinName: string) => void;
    onOpenInJade?: (skin: ExtractorSkin) => void;
    onInspectModel?: (skin: ExtractorSkin) => void;
    offlineMode?: boolean;
}

export function ChampionSkinsPanel({
    selectedChampion,
    loadingSkins,
    championSkins,
    selectedSkins,
    extractingSkins,
    extractionProgress,
    chromaData,
    selectedChromas,
    onSkinClick,
    onChromaClick,
    onDownloadSplashArt,
    onYouTubeSkin,
    onOpenInJade,
    onInspectModel,
    offlineMode = false,
}: Props) {
    return (
        <div>
            {loadingSkins[selectedChampion.name] || championSkins.length === 0 ? (
                // Skeleton cards in the real grid so there's no layout shift when
                // the actual skins load.
                <div className="ae-grid">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="ae-card ae-card--skeleton" aria-hidden="true">
                            <div className="ae-skel-media ae-skel-shimmer">
                                <div className="ae-skel-footer">
                                    <div className="ae-skel-line ae-skel-line--title" />
                                    <div className="ae-skel-line ae-skel-line--id" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="ae-grid">
                    {championSkins.map((skin) => {
                        const isSelected = selectedSkins.some((s) => s.name === skin.name);
                        const skinKey = `${selectedChampion.name}_${skin.id}`;
                        const chromas = chromaData[skinKey] || [];
                        const iconOnly = Boolean(skin.iconUrl && !skin.centeredSplashPath);

                        return (
                            <div
                                key={`${selectedChampion.name}-${skin.full_id || skin.id}`}
                                onClick={() => onSkinClick(skin.name)}
                                className={`ae-card ${isSelected ? 'ae-card--selected' : ''}`}
                            >
                                <div className={`ae-card__media ${iconOnly ? 'ae-card__media--icon' : ''}`}>
                                    {!offlineMode ? (
                                        <img
                                            src={skin.iconUrl || skin.centeredSplashPath || `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${selectedChampion.alias}_${skin.id}.jpg`}
                                            alt={skin.name}
                                            style={iconOnly
                                                ? { width: '80%', height: '80%', objectFit: 'contain' }
                                                : { width: '100%', height: '100%', objectFit: 'cover' }}
                                            draggable={false}
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', textAlign: 'center', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 12 }}>
                                            Image unavailable offline
                                        </div>
                                    )}
                                    <div className="ae-card__overlay" />

                                    {!skin.hideRarityIcon && (
                                        <div style={{ position: 'absolute', top: 8, left: 8 }}>
                                            {!offlineMode ? (
                                                <img
                                                    src={getRarityIconUrl(skin)}
                                                    alt={skin.rarity || 'No Rarity'}
                                                    style={{ width: 24, height: 24, borderRadius: 4 }}
                                                    title={skin.rarity || 'No Rarity'}
                                                />
                                            ) : (
                                                <div style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }} title={skin.rarity || 'No Rarity'}>
                                                    {skin.rarity || 'Base'}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isSelected && (
                                        <span className="dl-badge" style={{ position: 'absolute', top: 8, left: 40 }}>
                                            <span className="dl-badge__dot" />SELECTED
                                        </span>
                                    )}

                                    {extractingSkins[skinKey] && (
                                        <span className="dl-badge dl-badge--warn" style={{ position: 'absolute', top: 40, left: 8 }}>
                                            <span className="dl-badge__dot" />Extracting
                                        </span>
                                    )}

                                    <div className="ae-card__toolstack">
                                        {!offlineMode && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDownloadSplashArt(selectedChampion.name, selectedChampion.alias, skin.id, skin.name, skin.centeredSplashPath || skin.iconUrl || null);
                                                }}
                                                className="dl-btn dl-btn--icon dl-btn--ghost dl-btn--sm ae-card__action"
                                                title="Download Splash Art"
                                            >
                                                <span className="dl-icon">
                                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                </span>
                                            </button>
                                        )}

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onYouTubeSkin?.(selectedChampion.name, skin.name);
                                            }}
                                            className="dl-btn dl-btn--icon dl-btn--ghost dl-btn--sm ae-card__action"
                                            title="Search skin spotlight on YouTube"
                                        >
                                            <span className="dl-icon"><Youtube size={14} /></span>
                                        </button>

                                        {onOpenInJade && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onOpenInJade(skin);
                                                }}
                                                disabled={extractingSkins[skinKey]}
                                                className="dl-btn dl-btn--icon dl-btn--ghost dl-btn--sm ae-card__action ae-card__action--persistent ae-card__action--jade"
                                                title="Open combined skin BIN in Jade"
                                                aria-label={`Open ${skin.name} in Jade`}
                                            >
                                                <img src="/jade.webp" alt="" className="ae-card__jade-icon" />
                                            </button>
                                        )}

                                        {onInspectModel && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onInspectModel(skin);
                                                }}
                                                disabled={extractingSkins[skinKey]}
                                                className="dl-btn dl-btn--icon dl-btn--ghost dl-btn--sm ae-card__action ae-card__action--persistent ae-card__action--model"
                                                title="Inspect skin model"
                                                aria-label={`Inspect ${skin.name} model`}
                                            >
                                                <span className="dl-icon"><Box size={14} /></span>
                                            </button>
                                        )}
                                    </div>

                                    <div className="ae-card__footer">
                                        {chromas.length > 0 && (
                                            <div className="chroma-container">
                                                {chromas.map((chroma, index) => (
                                                    <ChromaDot
                                                        key={chroma.id}
                                                        chroma={chroma}
                                                        index={index}
                                                        selected={selectedChromas[skinKey]?.id === chroma.id}
                                                        color={chroma.color || getDefaultChromaColor(index)}
                                                        offlineMode={offlineMode}
                                                        idLabel={String(chroma.id).slice(-2)}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onChromaClick(chroma, skin, selectedChampion.name);
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}

                                        {/* Above the title, in flow, so the footer grows to fit it
                                            instead of the banner covering the name. */}
                                        {extractionProgress[skinKey] && !extractingSkins[skinKey] && (
                                            <div className="ae-card__progress" title={extractionProgress[skinKey]}>
                                                {extractionProgress[skinKey]}
                                            </div>
                                        )}

                                        <h3 className="ae-card__title" style={{ color: isSelected ? 'var(--accent-primary)' : '#fff' }}>
                                            {skin.name}
                                        </h3>
                                        <span className="ae-card__id">Skin ID: {skin.id}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
