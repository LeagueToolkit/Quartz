import type { RecentPortDonor } from '@/lib/stores';

interface RecentDonorsRowProps {
    recentDonors: RecentPortDonor[];
    activeKey: string | null;
    onSelect: (donor: RecentPortDonor) => void;
}

export default function RecentDonorsRow({ recentDonors, activeKey, onSelect }: RecentDonorsRowProps) {
    if (!recentDonors || recentDonors.length === 0) return null;

    return (
        <div className="donor-recent">
            <span className="donor-recent__label">Recent</span>
            {recentDonors.map((donor) => {
                const key = `${donor.championId}_${donor.skinId}`;
                // tilePath is already a full CDN URL (from the skin's tilePath).
                const art = donor.tilePath;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onSelect(donor)}
                        className={`donor-recent__chip ${activeKey === key ? 'is-active' : ''}`}
                        title={`${donor.championName} — ${donor.skinName} (ID ${donor.skinId})`}
                    >
                        {art ? <img src={art} alt={donor.skinName} loading="lazy" /> : null}
                    </button>
                );
            })}
        </div>
    );
}
