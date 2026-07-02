import { Youtube } from 'lucide-react';
import type { ExtractorChampion, ExtractorSkin, Chroma } from '../types';
import { getRarityIconUrl } from '../mediaService';
import { getDefaultChromaColor } from '../communityDragonApi';

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
    onDownloadSplashArt: (champion: ExtractorChampion, skin: ExtractorSkin) => void;
    onYouTubeSkin: (championName: string, skinName: string) => void;
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
    offlineMode = false,
}: Props) {
    return (
        <div>
            {loadingSkins[selectedChampion.name] || championSkins.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div
                            style={{
                                width: 48, height: 48, margin: '0 auto 16px',
                                borderRadius: '50%',
                                border: '3px solid var(--border)',
                                borderTopColor: 'var(--accent-primary)',
                                animation: 'dl-spin 0.9s linear infinite',
                            }}
                        />
                        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{`Loading ${selectedChampion.name} skins...`}</p>
                    </div>
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
                                        <span className="dl-badge" style={{ position: 'absolute', top: 8, right: 8 }}>
                                            <span className="dl-badge__dot" />SELECTED
                                        </span>
                                    )}

                                    {extractingSkins[skinKey] && (
                                        <span className="dl-badge dl-badge--warn" style={{ position: 'absolute', top: 40, left: 8 }}>
                                            <span className="dl-badge__dot" />Extracting
                                        </span>
                                    )}

                                    {extractionProgress[skinKey] && !extractingSkins[skinKey] && (
                                        <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>
                                            {extractionProgress[skinKey]}
                                        </div>
                                    )}

                                    {!offlineMode && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDownloadSplashArt(selectedChampion, skin);
                                            }}
                                            className="dl-btn dl-btn--icon dl-btn--ghost dl-btn--sm ae-card__action"
                                            style={{ position: 'absolute', bottom: 8, right: 8 }}
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
                                        style={{ position: 'absolute', bottom: 8, left: 8 }}
                                        title="Search skin spotlight on YouTube"
                                    >
                                        <span className="dl-icon"><Youtube size={14} /></span>
                                    </button>
                                </div>

                                <div className="ae-card__body">
                                    <h3 style={{ fontWeight: 500, margin: 0, color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                                        {skin.name}
                                    </h3>
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>ID: {skin.id}</p>

                                    {chromas.length > 0 && (
                                        <div className="chroma-container">
                                            {chromas.map((chroma, index) => {
                                                const chromaSelected = selectedChromas[skinKey]?.id === chroma.id;
                                                return (
                                                    <div key={chroma.id} style={{ position: 'relative' }}>
                                                        <div
                                                            className={`chroma-dot ${chromaSelected ? 'selected' : ''}`}
                                                            style={{ backgroundColor: chroma.color || getDefaultChromaColor(index) }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onChromaClick(chroma, skin, selectedChampion.name);
                                                            }}
                                                        >
                                                            <div className="chroma-tooltip">
                                                                <div className="chroma-preview-image">
                                                                    {!offlineMode ? (
                                                                        <img
                                                                            src={chroma.image_url}
                                                                            alt={chroma.name || `Chroma ${index + 1}`}
                                                                            style={{ width: 128, height: 128, objectFit: 'cover', borderRadius: 4 }}
                                                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                                        />
                                                                    ) : (
                                                                        <div style={{ width: 128, height: 128, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 8px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 12 }}>
                                                                            No image (offline)
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="chroma-preview-name">{chroma.name || `Chroma ${index + 1}`}</div>
                                                                <div className="chroma-preview-ids">
                                                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Chroma ID: {String(chroma.id).slice(-2)}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
