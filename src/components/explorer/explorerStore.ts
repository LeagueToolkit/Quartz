import { create } from 'zustand';
import { explorerFilterExisting } from '@/lib/api/explorer';

/* Recents (per-bucket) + pinned folders for the custom file explorer.
   Persisted to localStorage. One-time migration from old Quartz's
   divinelab_* keys so existing recents/pins carry over. */

const RECENTS_KEY = 'quartz-explorer-recents';
const PINS_KEY = 'quartz-explorer-pins';
const VIEW_KEY = 'quartz-explorer-view';
const LAST_FOLDER_KEY = 'quartz-explorer-last-folder';
const MAX_RECENTS = 10;

type ViewMode = 'grid' | 'list';

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

function loadView(): ViewMode {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
}

interface ExplorerState {
    recents: Recents;
    pins: string[];
    view: ViewMode;
    lastFolder: string;
    addRecent: (bucket: string, path: string) => void;
    removeRecent: (bucket: string, path: string) => void;
    addPin: (path: string) => void;
    removePin: (path: string) => void;
    setView: (view: ViewMode) => void;
    setLastFolder: (path: string) => void;
    /** Drop recents (all buckets) + pins whose paths no longer exist. */
    pruneRecents: () => Promise<void>;
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
    recents: initial.recents,
    pins: initial.pins,
    view: loadView(),
    lastFolder: localStorage.getItem(LAST_FOLDER_KEY) ?? '',
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
    setView: (view) => {
        localStorage.setItem(VIEW_KEY, view);
        set({ view });
    },
    setLastFolder: (path) => {
        if (!path) return;
        localStorage.setItem(LAST_FOLDER_KEY, path);
        set({ lastFolder: path });
    },
    pruneRecents: async () => {
        const { recents, pins } = get();
        // Gather every stored path once, check existence in a single backend
        // call, then rebuild each bucket from the survivors.
        const all = [...new Set([...Object.values(recents).flat(), ...pins])];
        if (all.length === 0) return;
        let alive: Set<string>;
        try {
            alive = new Set(await explorerFilterExisting(all));
        } catch {
            return; // leave lists untouched if the check fails
        }
        if (alive.size === all.length) return; // nothing stale
        const nextRecents: Recents = {};
        for (const [bucket, list] of Object.entries(recents)) {
            nextRecents[bucket] = list.filter((p) => alive.has(p));
        }
        const nextPins = pins.filter((p) => alive.has(p));
        localStorage.setItem(RECENTS_KEY, JSON.stringify(nextRecents));
        localStorage.setItem(PINS_KEY, JSON.stringify(nextPins));
        set({ recents: nextRecents, pins: nextPins });
    },
}));
