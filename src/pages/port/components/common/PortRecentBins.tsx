import { useUiPrefsStore } from '@/lib/stores';
import { useExistingRecentBins } from '@/lib/util/useExistingRecentBins';
import RecentBinsList from '@/components/ui/RecentBinsList';

/* Recent-bins list for the Port empty state. Each column keeps its own recent
   history (Target vs Donor). Delegates to the shared RecentBinsList so it
   matches Paint and the Bin Editor. Clicking a row loads it via `onOpen`. */
export default function PortRecentBins({ slot, onOpen }: { slot: 'target' | 'donor'; onOpen: (path: string) => void }) {
    const storedBins = useUiPrefsStore((s) => (slot === 'target' ? s.recentTargetBins : s.recentDonorBins));
    const removeRecentBinFor = useUiPrefsStore((s) => s.removeRecentBinFor);
    // Only show entries whose file still exists; prune vanished ones.
    const recentBins = useExistingRecentBins(storedBins, (path) => removeRecentBinFor(slot, path));

    return (
        <RecentBinsList
            bins={recentBins}
            onOpen={onOpen}
            onRemove={(path) => removeRecentBinFor(slot, path)}
        />
    );
}
