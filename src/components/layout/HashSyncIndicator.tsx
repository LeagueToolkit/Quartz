/* Top-bar pill for the background hash-database sync.
 *
 * Shape borrowed from Celestial's activity indicator (spinner, label, count,
 * slim progress bar) but styled with Quartz's own tokens rather than ported
 * Tailwind, since the two apps do not share a theme.
 *
 * Renders NOTHING when idle. The sync is automatic, silent, and runs at most
 * once a day, so this is a transient status readout and not a permanent
 * control: when there is nothing to report it takes up no space in the bar.
 */

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Check, Loader2 } from 'lucide-react';
import { useHashSyncStore } from '@/lib/stores/hashSyncStore';

interface HashProgress {
    label: string;
    received: number;
    total: number;
}

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(0)} MB`;

export function HashSyncIndicator() {
    const label = useHashSyncStore((s) => s.label);
    const received = useHashSyncStore((s) => s.received);
    const total = useHashSyncStore((s) => s.total);
    const complete = useHashSyncStore((s) => s.complete);
    const active = useHashSyncStore((s) => s.active);

    useEffect(() => {
        /* `listen` resolves to its unlisten fn asynchronously, so a component
           that unmounts before it resolves would otherwise leak the listener.
           The flag makes the late resolution clean up after itself. */
        let disposed = false;
        const unlisteners: Array<() => void> = [];
        const track = (p: Promise<() => void>) => {
            void p.then((un) => (disposed ? un() : unlisteners.push(un)));
        };

        const { setProgress, finish } = useHashSyncStore.getState();
        track(listen<HashProgress>('hash-sync-progress', (e) => setProgress(e.payload)));
        track(listen<number>('hash-sync-done', (e) => finish(e.payload)));

        return () => {
            disposed = true;
            for (const un of unlisteners) un();
        };
    }, []);

    if (!active) return null;

    // A chunked response reports no total; show the bytes so far rather than a
    // percentage computed from zero.
    const indeterminate = total <= 0;
    const percent = complete ? 100 : indeterminate ? 0 : Math.round((received / total) * 100);

    return (
        <div className="q-hashsync" title="Updating the hash database in the background">
            {complete ? (
                <Check size={13} className="q-hashsync__done" />
            ) : (
                <Loader2 size={13} className="q-hashsync__spin" />
            )}
            <span className="q-hashsync__label">{label}</span>
            {!complete && (
                <span className="q-hashsync__count">
                    {indeterminate ? mb(received) : `${percent}%`}
                </span>
            )}
            {!complete && !indeterminate && (
                <span className="q-hashsync__bar">
                    <span className="q-hashsync__fill" style={{ width: `${percent}%` }} />
                </span>
            )}
        </div>
    );
}
