import { useEffect, useState } from 'react';
import { invokeCommand } from '@/lib/api';
import type { RecentBin } from '@/lib/stores';

/*
 * Filter a recent-bins list down to files that still exist on disk. Recent
 * entries are just remembered paths — a file can be moved/deleted between
 * sessions, and showing a dead row that errors on click is confusing. This
 * probes each path once (and whenever the list changes) via the `paths_exist`
 * backend command, prunes the ones that are gone from the store via `remove`,
 * and returns only the survivors.
 *
 * If the check throws (e.g. outside Tauri) it fails open — every entry is kept —
 * so the list never silently empties in a non-Tauri/dev context.
 */
export function useExistingRecentBins(
    recent: RecentBin[],
    remove: (path: string) => void,
): RecentBin[] {
    const [existing, setExisting] = useState<RecentBin[]>(recent);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (recent.length === 0) {
                setExisting([]);
                return;
            }
            let flags: boolean[];
            try {
                flags = await invokeCommand<boolean[]>('paths_exist', {
                    paths: recent.map((b) => b.path),
                });
            } catch {
                // Backend unavailable: keep everything rather than blank the list.
                if (!cancelled) setExisting(recent);
                return;
            }
            if (cancelled) return;
            const kept = recent.filter((_, i) => flags[i]);
            setExisting(kept);
            // Prune the vanished ones from persisted history.
            recent.forEach((b, i) => {
                if (!flags[i]) remove(b.path);
            });
        })();
        return () => { cancelled = true; };
        // Re-run when the set of paths changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recent.map((b) => b.path).join('|')]);

    return existing;
}
