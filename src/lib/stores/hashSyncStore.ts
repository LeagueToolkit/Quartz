/* Top-bar indicator state for the background hash-database sync.
 *
 * Adapted from Celestial's activity store, with one difference that matters:
 * that one is STEP-based (mod 3 of 7) while this is BYTE-based, because the
 * hash sync is two large downloads rather than many small units of work. A
 * step counter over two assets would sit at "1/2" for most of a multi-minute
 * download and read as stuck.
 *
 * The sync is fully automatic and non-blocking, so this store only ever
 * REPORTS. Nothing here can start or cancel it: the user does not choose to
 * update hashes, and an indicator that implied otherwise would be lying.
 */

import { create } from 'zustand';

interface HashSyncStore {
    /** Which asset is downloading, e.g. "WAD hashes". */
    label: string | null;
    received: number;
    /** 0 when the server sent no Content-Length, meaning indeterminate. */
    total: number;
    /** Briefly true after a successful update, to show a check before clearing. */
    complete: boolean;
    active: boolean;
    setProgress: (p: { label: string; received: number; total: number }) => void;
    finish: (downloaded: number) => void;
    clear: () => void;
}

let completeTimer: ReturnType<typeof setTimeout> | null = null;
let staleTimer: ReturnType<typeof setTimeout> | null = null;

const clearTimers = () => {
    if (completeTimer) clearTimeout(completeTimer);
    if (staleTimer) clearTimeout(staleTimer);
    completeTimer = null;
    staleTimer = null;
};

export const useHashSyncStore = create<HashSyncStore>((set, get) => ({
    label: null,
    received: 0,
    total: 0,
    complete: false,
    active: false,

    setProgress: ({ label, received, total }) => {
        clearTimers();
        set({ label, received, total, complete: false, active: true });
        /* Self-clear if the backend stops reporting without a done event (a
           panic, or the window reloading mid-download). Reset on every tick, so
           this only fires when progress genuinely stalls. Generous because a
           slow link can legitimately go a while between percent ticks. */
        staleTimer = setTimeout(() => get().clear(), 120_000);
    },

    /* `downloaded === 0` covers "already fresh", "already up to date" and
       "failed offline" alike. None of those deserve a success check: the user
       did not ask for this and nothing changed, so the indicator just goes
       away. Only a real update gets the brief confirmation. */
    finish: (downloaded) => {
        clearTimers();
        if (downloaded <= 0) {
            set({ label: null, received: 0, total: 0, complete: false, active: false });
            return;
        }
        set({ label: 'Hashes updated', complete: true, active: true });
        completeTimer = setTimeout(() => get().clear(), 2500);
    },

    clear: () => {
        clearTimers();
        set({ label: null, received: 0, total: 0, complete: false, active: false });
    },
}));
