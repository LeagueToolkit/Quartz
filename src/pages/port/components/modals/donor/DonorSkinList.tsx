import { Youtube } from 'lucide-react';
import type { DonorSkin } from './types';

interface DonorSkinListProps {
    skins: DonorSkin[];
    loading: boolean;
    hasChampion: boolean;
    /** Ids of the currently-selected skins. Single-select callers pass a 0/1 set. */
    selectedSkinIds: Set<number>;
    onSelect: (skin: DonorSkin) => void;
    onYouTubeSkin: (skinName: string) => void;
    emptyLabel: string;
    /** Text on the corner badge shown on selected cards (e.g. "DONOR" / "PICKED"). */
    badgeLabel?: string;
}

/* Skin grid for the load-from-game modal. Reuses the Asset Extractor's ae-card
   grid so the splash-tile cards, hover-lift, and accent-selected state match.
   Supports single- or multi-select via `selectedSkinIds`. */
export default function DonorSkinList({
    skins,
    loading,
    hasChampion,
    selectedSkinIds,
    onSelect,
    onYouTubeSkin,
    emptyLabel,
    badgeLabel = 'DONOR',
}: DonorSkinListProps) {
    if (loading) return <div className="donor-cols__main"><div className="donor-empty">Loading skins…</div></div>;
    if (!hasChampion) return <div className="donor-cols__main"><div className="donor-empty">{emptyLabel}</div></div>;
    if (skins.length === 0) return <div className="donor-cols__main"><div className="donor-empty">No skins found</div></div>;

    return (
        <div className="donor-cols__main">
            <div className="ae-grid">
                {skins.map((skin) => {
                    const isSelected = selectedSkinIds.has(skin.id);
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
                                        <span className="dl-badge__dot" />{badgeLabel}
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
