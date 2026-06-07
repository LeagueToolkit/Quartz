import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Page } from './navigationStore';

export type InterfaceStyle = 'quartz' | 'winforms' | 'liquid' | 'minecraft';

// Pages that can be toggled in Page Visibility (paint/port are always shown).
export const TOGGLEABLE_PAGES: Page[] = [
    'vfxhub', 'bineditor', 'imgrecolor', 'upscale', 'rgba', 'tools',
    'filehandler', 'aniport', 'bumpath', 'extractor', 'wadexplorer',
];

interface UiPrefs {
    font: string;
    interfaceStyle: InterfaceStyle;
    glassBlur: number;
    performanceMode: boolean;
    autoLoadEnabled: boolean;
    expandSystemsOnLoad: boolean;
    useNativeFileBrowser: boolean;
    communicateWithJade: boolean;
    jadeExecutablePath: string;
    contextMenuEnabled: boolean;
    pageVisibility: Partial<Record<Page, boolean>>;
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
            font: 'system',
            interfaceStyle: 'quartz',
            glassBlur: 12,
            performanceMode: false,
            autoLoadEnabled: false,
            expandSystemsOnLoad: false,
            useNativeFileBrowser: false,
            communicateWithJade: true,
            jadeExecutablePath: '',
            contextMenuEnabled: false,
            pageVisibility: {},
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

// Apply prefs that affect global CSS (glass blur).
export function applyUiPrefs() {
    const { glassBlur } = useUiPrefsStore.getState();
    document.documentElement.style.setProperty('--glass-blur', `${glassBlur}px`);
}
