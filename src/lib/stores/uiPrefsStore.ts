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

    set: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;
    setPageVisible: (page: Page, visible: boolean) => void;
}

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
            pageVisibility: {},
            useNativeFileBrowser: false,
            communicateWithJade: true,
            jadeExecutablePath: '',
            contextMenuEnabled: false,
            githubUsername: '',
            githubToken: '',
            githubRepoUrl: 'https://github.com/FrogCsLoL/VFXHub',
            showGithubToken: false,
            set: (key, value) => set({ [key]: value } as Pick<UiPrefs, typeof key>),
            setPageVisible: (page, visible) =>
                set((s) => ({ pageVisibility: { ...s.pageVisibility, [page]: visible } })),
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
