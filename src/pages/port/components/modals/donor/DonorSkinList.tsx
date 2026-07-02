import { Youtube } from 'lucide-react';
import { cdragonAssetUrl } from '@/pages/assetextractor/communityDragonApi';
import type { DonorSkin } from './types';

interface DonorSkinListProps {
    skins: DonorSkin[];
    loading: boolean;
    hasChampion: boolean;
    selectedSkinId: number | null;
    championName: string;
    onSelect: (skin: DonorSkin) => void;
    onYouTubeSkin: (skinName: string) => void;
}

export default function DonorSkinList({
    skins,
    loading,
    hasChampion,
    selectedSkinId,
    championName,
    onSelect,
    onYouTubeSkin,
}: DonorSkinListProps) {
    const centerMsg = (msg: string) => (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {msg}
        </div>
    );

    return (
        <div className="donor-modal__col">
            {loading ? (
                centerMsg('Loading skins…')
            ) : !hasChampion ? (
                centerMsg('Select a champion first')
            ) : skins.length === 0 ? (
                centerMsg('No skins found')
            ) : (
                <div className="donor-modal__list">
                    <div className="donor-modal__skingrid">
                        {skins.map((skin) => {
                            const isActive = selectedSkinId === skin.id;
                            const art = cdragonAssetUrl(skin.tilePath);
                            return (
                                <div
                                    key={skin.id}
                                    onClick={() => onSelect(skin)}
                                    className={`donor-modal__skincard ${isActive ? 'is-active' : ''}`}
                                >
                                    <div className="donor-modal__skincard-media">
                                        {art ? (
                                            <img src={art} alt={skin.name} loading="lazy" decoding="async" draggable={false} />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                                                No art
                                            </div>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onYouTubeSkin(skin.name); }}
                                            className="dl-btn dl-btn--icon dl-btn--ghost dl-btn--sm"
                                            style={{ position: 'absolute', bottom: 6, left: 6 }}
                                            title={`Search "${skin.name}" spotlight on YouTube`}
                                        >
                                            <span className="dl-icon"><Youtube size={13} /></span>
                                        </button>
                                        {isActive && (
                                            <span className="dl-badge" style={{ position: 'absolute', top: 6, right: 6 }}>
                                                <span className="dl-badge__dot" />DONOR
                                            </span>
                                        )}
                                    </div>
                                    <div className="donor-modal__skincard-body">
                                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isActive ? 'var(--accent-secondary)' : 'var(--text-primary)' }}>
                                            {skin.name}
                                        </div>
                                        <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>ID {skin.id}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            <div style={{ paddingTop: 8, color: 'var(--text-muted)', fontSize: '0.68rem', flexShrink: 0 }}>
                {hasChampion ? `Skins: ${championName}` : ''}
            </div>
        </div>
    );
}
