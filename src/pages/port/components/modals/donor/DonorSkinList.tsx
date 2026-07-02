import { Youtube } from 'lucide-react';
import type { DonorSkin } from './types';

interface DonorSkinListProps {
    skins: DonorSkin[];
    loading: boolean;
    hasChampion: boolean;
    selectedSkinId: number | null;
    onSelect: (skin: DonorSkin) => void;
    onYouTubeSkin: (skinName: string) => void;
    emptyLabel: string;
}

/* Skin grid for the donor modal. Reuses the Asset Extractor's ae-card grid so
   the splash-tile cards, hover-lift, and accent-selected state match. */
export default function DonorSkinList({
    skins,
    loading,
    hasChampion,
    selectedSkinId,
    onSelect,
    onYouTubeSkin,
    emptyLabel,
}: DonorSkinListProps) {
    if (loading) return <div className="donor-cols__main"><div className="donor-empty">Loading skins…</div></div>;
    if (!hasChampion) return <div className="donor-cols__main"><div className="donor-empty">{emptyLabel}</div></div>;
    if (skins.length === 0) return <div className="donor-cols__main"><div className="donor-empty">No skins found</div></div>;

    return (
        <div className="donor-cols__main">
            <div className="ae-grid">
                {skins.map((skin) => {
                    const isSelected = selectedSkinId === skin.id;
                    // tilePath from getCDragonChampionSkins is already a full CDN URL.
                    const art = skin.tilePath;
                    return (
                        <div
                            key={skin.id}
                            onClick={() => onSelect(skin)}
                            className={`ae-card ${isSelected ? 'ae-card--selected' : ''}`}
                        >
                            <div className="ae-card__media">
                                {art ? (
                                    <img src={art} alt={skin.name} loading="lazy" decoding="async" draggable={false} />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, background: 'var(--bg-tertiary)' }}>
                                        No art
                                    </div>
                                )}
                                <div className="ae-card__overlay" />

                                {isSelected && (
                                    <span className="dl-badge" style={{ position: 'absolute', top: 8, right: 8 }}>
                                        <span className="dl-badge__dot" />DONOR
                                    </span>
                                )}

                                <button
                                    onClick={(e) => { e.stopPropagation(); onYouTubeSkin(skin.name); }}
                                    className="dl-btn dl-btn--icon dl-btn--ghost dl-btn--sm ae-card__action"
                                    style={{ position: 'absolute', bottom: 8, left: 8 }}
                                    title={`Search "${skin.name}" spotlight on YouTube`}
                                >
                                    <span className="dl-icon"><Youtube size={14} /></span>
                                </button>
                            </div>
                            <div className="ae-card__body">
                                <h3 style={{ fontWeight: 500, margin: 0, fontSize: 13, color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                                    {skin.name}
                                </h3>
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>ID: {skin.id}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
