import { Youtube } from 'lucide-react';
import type { Chroma } from '../types';
import type { SkinlineGroup } from '../communityDragonApi';
import { getDefaultChromaColor } from '../communityDragonApi';
import { getRarityIconUrl } from '../mediaService';

type SkinlineSkin = SkinlineGroup['skins'][number];
type SkinlineChampion = SkinlineGroup['champion'];

interface Props {
    skinlineSearchTerm: string;
    skinlineSearchResults: SkinlineGroup[];
    loading: boolean;
    selectedSkins: Array<{ name: string; champion?: { name: string } }>;
    chromaData: Record<string, Chroma[]>;
    selectedChromas: Record<string, Chroma>;
    onSkinClick: (champion: SkinlineChampion, skin: SkinlineSkin) => void;
    onChromaClick: (chroma: Chroma, skin: SkinlineSkin, championName: string) => void;
    onDownloadSplashArt: (championName: string, championAlias: string, skinNumber: number, skinName: string) => void;
    onYouTubeSkin: (championName: string, skinName: string) => void;
    offlineMode?: boolean;
}

export function SkinlineResultsPanel({
    skinlineSearchTerm,
    skinlineSearchResults,
    loading,
    selectedSkins,
    chromaData,
    selectedChromas,
    onSkinClick,
    onChromaClick,
    onDownloadSplashArt,
    onYouTubeSkin,
    offlineMode = false,
}: Props) {
    if (loading) {
        return (
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
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Searching Community Dragon skins data...</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>Loading all skins and filtering results</p>
                </div>
            </div>
        );
    }

    if (skinlineSearchResults.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <div style={{ fontSize: 18, color: 'var(--text-secondary)', marginBottom: 8 }}>No skins found</div>
                <p style={{ color: 'var(--text-muted)' }}>Try searching for skinlines like "Coven", "Star Guardian", "K/DA", etc.</p>
            </div>
        );
    }

    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>Skinline Search: "{skinlineSearchTerm}"</h2>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>Found {skinlineSearchResults.length} champions with matching skins</p>
            </div>

            <div className="ae-grid">
                {skinlineSearchResults.flatMap(({ champion, skins }) =>
                    skins.map((skin) => {
                        const isSelected = selectedSkins.some((s) => s.name === skin.name && s.champion?.name === champion.name);
                        const skinKey = `${champion.name}_${skin.skinNumber}`;
                        const chromas = chromaData[skinKey] || [];

                        return (
                            <div
                                key={`${champion.name}-${skin.id}`}
                                onClick={() => onSkinClick(champion, skin)}
                                className={`ae-card ${isSelected ? 'ae-card--selected' : ''}`}
                            >
                                <div className="ae-card__media">
                                    {!offlineMode ? (
                                        <img
                                            src={`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${skin.championAlias}_${skin.skinNumber}.jpg`}
                                            alt={skin.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            draggable={false}
                                            onError={(e) => {
                                                e.currentTarget.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${skin.championAlias}_0.jpg`;
                                            }}
                                        />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', textAlign: 'center', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 12 }}>
                                            Image unavailable offline
                                        </div>
                                    )}
                                    <div className="ae-card__overlay" />

                                    <div style={{ position: 'absolute', top: 8, left: 8 }}>
                                        {!offlineMode ? (
                                            <img src={getRarityIconUrl(skin)} alt={skin.rarity || 'No Rarity'} style={{ width: 24, height: 24, borderRadius: 4 }} title={skin.rarity || 'No Rarity'} />
                                        ) : (
                                            <div style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }} title={skin.rarity || 'No Rarity'}>
                                                {skin.rarity || 'Base'}
                                            </div>
                                        )}
                                    </div>

                                    <span className="dl-badge dl-badge--success" style={{ position: 'absolute', top: 8, left: 40 }}>{champion.name}</span>

                                    {isSelected && (
                                        <span className="dl-badge" style={{ position: 'absolute', top: 8, right: 8 }}>
                                            <span className="dl-badge__dot" />SELECTED
                                        </span>
                                    )}

                                    {!offlineMode && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDownloadSplashArt(champion.name, skin.championAlias, skin.skinNumber, skin.name);
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
                                            onYouTubeSkin?.(champion.name, skin.name);
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
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Skin ID: {skin.skinNumber}</p>

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
                                                                onChromaClick(chroma, skin, champion.name);
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
                                                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Chroma ID: {chroma.id}</div>
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
                    }),
                )}
            </div>
        </div>
    );
}
