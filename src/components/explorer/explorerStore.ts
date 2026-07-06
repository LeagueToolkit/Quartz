import { create } from 'zustand';

/* Recents (per-bucket) + pinned folders for the custom file explorer.
   Persisted to localStorage. One-time migration from old Quartz's
   divinelab_* keys so existing recents/pins carry over. */

const RECENTS_KEY = 'quartz-explorer-recents';
const PINS_KEY = 'quartz-explorer-pins';
const MAX_RECENTS = 10;

type Recents = Record<string, string[]>;

function loadJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

/** Migrate from divinelab_* only when the new keys are absent, so fresh data
 *  is never clobbered. */
function migrate(): { recents: Recents; pins: string[] } {
    if (localStorage.getItem(RECENTS_KEY) || localStorage.getItem(PINS_KEY)) {
        return { recents: loadJson(RECENTS_KEY, {}), pins: loadJson(PINS_KEY, []) };
    }
    const bins = loadJson<string[]>('divinelab_recent_bins', []);
    const folders = loadJson<string[]>('divinelab_recent_folders', []);
    const pins = loadJson<string[]>('divinelab_quick_access', []);
    const recents: Recents = {};
    if (bins.length) recents.bin = bins.slice(0, MAX_RECENTS);
    if (folders.length) recents.default = folders.slice(0, MAX_RECENTS);
    return { recents, pins };
}

const initial = migrate();

interface ExplorerState {
    recents: Recents;
    pins: string[];
    addRecent: (bucket: string, path: string) => void;
    removeRecent: (bucket: string, path: string) => void;
    addPin: (path: string) => void;
    removePin: (path: string) => void;
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
    recents: initial.recents,
    pins: initial.pins,
    addRecent: (bucket, path) => {
        if (!path) return;
        const cur = get().recents[bucket] ?? [];
        const next = [path, ...cur.filter((p) => p !== path)].slice(0, MAX_RECENTS);
        const recents = { ...get().recents, [bucket]: next };
        localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
        set({ recents });
    },
    removeRecent: (bucket, path) => {
        const cur = get().recents[bucket] ?? [];
        const recents = { ...get().recents, [bucket]: cur.filter((p) => p !== path) };
        localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
        set({ recents });
    },
    addPin: (path) => {
        if (!path || get().pins.includes(path)) return;
        const pins = [...get().pins, path];
        localStorage.setItem(PINS_KEY, JSON.stringify(pins));
        set({ pins });
    },
    removePin: (path) => {
        const pins = get().pins.filter((p) => p !== path);
        localStorage.setItem(PINS_KEY, JSON.stringify(pins));
        set({ pins });
    },
}));
