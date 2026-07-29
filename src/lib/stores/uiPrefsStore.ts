import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Page } from './navigationStore';

/* Pages that can be toggled in Page Visibility, mapped to their Quartz default.
   Paint and Port are included (Quartz exposes them too). */
export const PAGE_DEFAULTS: Partial<Record<Page, boolean>> = {
    paint: true,
    port: true,
    bineditor: true,
    imgrecolor: true,
    upscale: true,
    rgba: false,
    tools: false,
    filehandler: false,
    soundbanks: true,
    wadexplorer: true,
    bumpath: false,
    aniport: false,
    fakegear: false,
    particlerandomizer: false,
};

// Display labels + order for the Page Visibility list (matches Quartz).
export const PAGE_LABELS: { page: Page; label: string }[] = [
    { page: 'bineditor', label: 'Bin Editor' },
    { page: 'imgrecolor', label: 'Image Recolor' },
    { page: 'upscale', label: 'Upscale' },
    { page: 'rgba', label: 'RGBA' },
    { page: 'tools', label: 'Tools' },
    { page: 'filehandler', label: 'File Randomizer' },
    { page: 'soundbanks', label: 'Sound Banks' },
    { page: 'wadexplorer', label: 'WAD Explorer' },
    { page: 'bumpath', label: 'Bumpath' },
    { page: 'aniport', label: 'AniPort' },
    { page: 'fakegear', label: 'FakeGear' },
    { page: 'particlerandomizer', label: 'Particle Randomizer' },
    { page: 'paint', label: 'Paint' },
    { page: 'port', label: 'Port' },
];

export const TOGGLEABLE_PAGES: Page[] = PAGE_LABELS.map((p) => p.page);

export interface RecentBin {
    path: string;
    name: string;
    lastOpened: string; // ISO timestamp
}

export interface RecentPortDonor {
    championId: string;
    championName: string;
    championAlias: string;
    skinId: number;
    skinName: string;
    tilePath: string | null;
    tempRoot: string | null;
    lastUsed: string; // ISO timestamp
}

const RECENT_BINS_MAX = 12;
const RECENT_PORT_DONORS_MAX = 8;

interface UiPrefs {
    // Appearance
    font: string;
    glassBlur: number;
    performanceMode: boolean;
    sharpButtonCorners: boolean;
    globalGlassSurfaces: boolean;
    // Wallpaper
    wallpaperEnabled: boolean;
    wallpaperId: string;
    wallpaperPath: string;
    wallpaperOpacity: number;
    wallpaperVignetteEnabled: boolean;
    wallpaperVignetteStrength: number;
    // Effects
    clickEffectEnabled: boolean;
    clickEffectType: string;
    backgroundEffectEnabled: boolean;
    backgroundEffectType: string;
    // Navigation / pages
    autoLoadEnabled: boolean;
    expandSystemsOnLoad: boolean;
    sidebarCollapsed: boolean;
    pageVisibility: Partial<Record<Page, boolean>>;
    // External tools
    useNativeFileBrowser: boolean;
    communicateWithJade: boolean;
    jadeExecutablePath: string;
    // Windows integration
    contextMenuEnabled: boolean;
    // GitHub
    githubUsername: string;
    githubToken: string;
    githubRepoUrl: string;
    showGithubToken: boolean;
    // Recently opened bins (Paint / Bin Editor share this list)
    recentBins: RecentBin[];
    // WAD Explorer: WADs the user opened via "Open WADs" (not indexed game files).
    recentWads: RecentBin[];
    // Port keeps a separate recent list per column.
    recentTargetBins: RecentBin[];
    recentDonorBins: RecentBin[];
    // Port "Load Donor From Game" recent selections.
    recentPortDonors: RecentPortDonor[];

    set: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;
    setPageVisible: (page: Page, visible: boolean) => void;
    pushRecentBin: (path: string) => void;
    removeRecentBin: (path: string) => void;
    pushRecentWad: (path: string) => void;
    removeRecentWad: (path: string) => void;
    /* Slot-scoped variants for Port's Target / Donor columns. */
    pushRecentBinFor: (slot: 'target' | 'donor', path: string) => void;
    removeRecentBinFor: (slot: 'target' | 'donor', path: string) => void;
    /* Push a recent donor to the front (dedup by championId_skinId, cap 8).
       Returns the temp roots of evicted entries (dupe + over-cap), excluding
       the incoming entry's own tempRoot, so the caller can clean them up. */
    pushRecentPortDonor: (entry: RecentPortDonor) => string[];
    removeRecentPortDonor: (key: string) => void;
}

const RECENT_KEY = { target: 'recentTargetBins', donor: 'recentDonorBins' } as const;

export const useUiPrefsStore = create<UiPrefs>()(
    persist(
        (set) => ({
            font: 'Segoe UI',
            glassBlur: 6,
            performanceMode: false,
            sharpButtonCorners: false,
            globalGlassSurfaces: false,
            wallpaperEnabled: true,
            wallpaperId: '',
            wallpaperPath: '',
            wallpaperOpacity: 0.15,
            wallpaperVignetteEnabled: false,
            wallpaperVignetteStrength: 0.35,
            clickEffectEnabled: false,
            clickEffectType: 'water',
            // Fresh installs start with no background effect - it is opt-in from
            // Settings. Persisted preferences still win, so an existing user who
            // turned it on keeps it after an update.
            backgroundEffectEnabled: false,
            backgroundEffectType: 'constellation',
            autoLoadEnabled: false,
            expandSystemsOnLoad: false,
            sidebarCollapsed: true,
            pageVisibility: {},
            useNativeFileBrowser: false,
            communicateWithJade: true,
            jadeExecutablePath: '',
            contextMenuEnabled: false,
            githubUsername: '',
            githubToken: '',
            githubRepoUrl: 'https://github.com/FrogCsLoL/Vfx-Hub-Rust',
            showGithubToken: false,
            recentBins: [],
            recentWads: [],
            recentTargetBins: [],
            recentDonorBins: [],
            recentPortDonors: [],
            set: (key, value) => set({ [key]: value } as Pick<UiPrefs, typeof key>),
            setPageVisible: (page, visible) =>
                set((s) => ({ pageVisibility: { ...s.pageVisibility, [page]: visible } })),
            pushRecentBin: (path) =>
                set((s) => {
                    const name = path.split(/[\\/]/).pop() || path;
                    const next = [
                        { path, name, lastOpened: new Date().toISOString() },
                        ...s.recentBins.filter((b) => b.path !== path),
                    ].slice(0, RECENT_BINS_MAX);
                    return { recentBins: next };
                }),
            removeRecentBin: (path) =>
                set((s) => ({ recentBins: s.recentBins.filter((b) => b.path !== path) })),
            pushRecentWad: (path) =>
                set((s) => {
                    const name = path.split(/[\\/]/).pop() || path;
                    const next = [
                        { path, name, lastOpened: new Date().toISOString() },
                        ...s.recentWads.filter((b) => b.path !== path),
                    ].slice(0, RECENT_BINS_MAX);
                    return { recentWads: next };
                }),
            removeRecentWad: (path) =>
                set((s) => ({ recentWads: s.recentWads.filter((b) => b.path !== path) })),
            pushRecentBinFor: (slot, path) =>
                set((s) => {
                    const key = RECENT_KEY[slot];
                    const name = path.split(/[\\/]/).pop() || path;
                    const next = [
                        { path, name, lastOpened: new Date().toISOString() },
                        ...s[key].filter((b) => b.path !== path),
                    ].slice(0, RECENT_BINS_MAX);
                    return { [key]: next } as Pick<UiPrefs, (typeof RECENT_KEY)[typeof slot]>;
                }),
            removeRecentBinFor: (slot, path) =>
                set((s) => {
                    const key = RECENT_KEY[slot];
                    return { [key]: s[key].filter((b) => b.path !== path) } as Pick<UiPrefs, (typeof RECENT_KEY)[typeof slot]>;
                }),
            pushRecentPortDonor: (entry) => {
                const key = `${entry.championId}_${entry.skinId}`;
                let evicted: string[] = [];
                set((s) => {
                    const prev = s.recentPortDonors;
                    const dupes = prev.filter((d) => `${d.championId}_${d.skinId}` === key);
                    const deduped = prev.filter((d) => `${d.championId}_${d.skinId}` !== key);
                    const combined = [entry, ...deduped];
                    const next = combined.slice(0, RECENT_PORT_DONORS_MAX);
                    const overCap = combined.slice(RECENT_PORT_DONORS_MAX);
                    evicted = [...dupes, ...overCap]
                        .map((d) => d.tempRoot)
                        .filter((r): r is string => typeof r === 'string' && r.trim().length > 0 && r !== entry.tempRoot);
                    return { recentPortDonors: next };
                });
                return [...new Set(evicted)];
            },
            removeRecentPortDonor: (key) =>
                set((s) => ({
                    recentPortDonors: s.recentPortDonors.filter(
                        (d) => `${d.championId}_${d.skinId}` !== key,
                    ),
                })),
        }),
        { name: 'quartz-ui-prefs' },
    ),
);

// Resolve a page's visibility, honoring the user override then the Quartz default.
export function isPageVisible(page: Page): boolean {
    const { pageVisibility } = useUiPrefsStore.getState();
    return pageVisibility[page] ?? PAGE_DEFAULTS[page] ?? true;
}

// Apply prefs that affect global CSS. Data attributes keep these rules global
// without forcing every page/component to subscribe to the settings store.
export function applyUiPrefs() {
    const s = useUiPrefsStore.getState();
    const root = document.documentElement;
    root.style.setProperty('--glass-blur', `${s.performanceMode ? Math.min(s.glassBlur, 2) : s.glassBlur}px`);
    root.setAttribute('data-performance', s.performanceMode ? 'on' : 'off');
    root.setAttribute('data-button-corners', s.sharpButtonCorners ? 'sharp' : 'rounded');
    root.setAttribute('data-global-glass', s.globalGlassSurfaces ? 'on' : 'off');
}
