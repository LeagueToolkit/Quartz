import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Page } from './navigationStore';

/* Pages that can be toggled in Page Visibility, mapped to their Quartz default.
   Paint and Port are included (Quartz exposes them too). */
export const PAGE_DEFAULTS: Partial<Record<Page, boolean>> = {
    paint: true,
    port: true,
    vfxhub: true,
    bineditor: true,
    imgrecolor: true,
    upscale: true,
    rgba: false,
    tools: false,
    filehandler: false,
    soundbanks: true,
    bumpath: false,
    aniport: false,
    fakegear: false,
    particlerandomizer: false,
};

// Display labels + order for the Page Visibility list (matches Quartz).
export const PAGE_LABELS: { page: Page; label: string }[] = [
    { page: 'vfxhub', label: 'VFX Hub' },
    { page: 'bineditor', label: 'Bin Editor' },
    { page: 'imgrecolor', label: 'Image Recolor' },
    { page: 'upscale', label: 'Upscale' },
    { page: 'rgba', label: 'RGBA' },
    { page: 'tools', label: 'Tools' },
    { page: 'filehandler', label: 'File Randomizer' },
    { page: 'soundbanks', label: 'Sound Banks' },
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

const RECENT_BINS_MAX = 12;

interface UiPrefs {
    // Appearance
    font: string;
    glassBlur: number;
    performanceMode: boolean;
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
    // Port keeps a separate recent list per column.
    recentTargetBins: RecentBin[];
    recentDonorBins: RecentBin[];

    set: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;
    setPageVisible: (page: Page, visible: boolean) => void;
    pushRecentBin: (path: string) => void;
    removeRecentBin: (path: string) => void;
    /* Slot-scoped variants for Port's Target / Donor columns. */
    pushRecentBinFor: (slot: 'target' | 'donor', path: string) => void;
    removeRecentBinFor: (slot: 'target' | 'donor', path: string) => void;
}

const RECENT_KEY = { target: 'recentTargetBins', donor: 'recentDonorBins' } as const;

export const useUiPrefsStore = create<UiPrefs>()(
    persist(
        (set) => ({
            font: 'Segoe UI',
            glassBlur: 6,
            performanceMode: false,
            wallpaperEnabled: true,
            wallpaperId: '',
            wallpaperPath: '',
            wallpaperOpacity: 0.15,
            wallpaperVignetteEnabled: false,
            wallpaperVignetteStrength: 0.35,
            clickEffectEnabled: false,
            clickEffectType: 'water',
            backgroundEffectEnabled: false,
            backgroundEffectType: 'fireflies',
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
            githubRepoUrl: 'https://github.com/FrogCsLoL/VFXHub',
            showGithubToken: false,
            recentBins: [],
            recentTargetBins: [],
            recentDonorBins: [],
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
        }),
        { name: 'quartz-ui-prefs' },
    ),
);

// Resolve a page's visibility, honoring the user override then the Quartz default.
export function isPageVisible(page: Page): boolean {
    const { pageVisibility } = useUiPrefsStore.getState();
    return pageVisibility[page] ?? PAGE_DEFAULTS[page] ?? true;
}

// Apply prefs that affect global CSS (glass blur, performance mode).
export function applyUiPrefs() {
    const s = useUiPrefsStore.getState();
    const root = document.documentElement;
    root.style.setProperty('--glass-blur', `${s.performanceMode ? Math.min(s.glassBlur, 2) : s.glassBlur}px`);
    root.setAttribute('data-performance', s.performanceMode ? 'on' : 'off');
}
