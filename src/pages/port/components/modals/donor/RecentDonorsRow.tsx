import { cdragonAssetUrl } from '@/pages/assetextractor/communityDragonApi';
import type { RecentPortDonor } from '@/lib/stores';

interface RecentDonorsRowProps {
    recentDonors: RecentPortDonor[];
    activeKey: string | null;
    onSelect: (donor: RecentPortDonor) => void;
}

export default function RecentDonorsRow({ recentDonors, activeKey, onSelect }: RecentDonorsRowProps) {
    if (!recentDonors || recentDonors.length === 0) return null;

    return (
        <div className="donor-modal__recent">
            <span style={{ color: 'var(--accent-secondary)', fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                Recent
            </span>
            {recentDonors.map((donor) => {
                const key = `${donor.championId}_${donor.skinId}`;
                const art = cdragonAssetUrl(donor.tilePath);
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onSelect(donor)}
                        className={`donor-modal__recent-chip ${activeKey === key ? 'is-active' : ''}`}
                        title={`${donor.championName} — ${donor.skinName} (ID ${donor.skinId})`}
                    >
                        {art ? <img src={art} alt={donor.skinName} loading="lazy" /> : null}
                    </button>
                );
            })}
        </div>
    );
}
