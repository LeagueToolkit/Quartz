import { create } from 'zustand';

/* Page ids for the sidebar. Most are placeholders until their feature slice
   lands in a later phase; Home and Settings are real in Phase 1. */
export type Page =
    | 'home'
    | 'paint'
    | 'port'
    | 'vfxhub'
    | 'bineditor'
    | 'assetextractor'
    | 'imgrecolor'
    | 'upscale'
    | 'rgba'
    | 'aniport'
    | 'tools'
    | 'filehandler'
    | 'soundbanks'
    | 'bumpath'
    | 'fakegear'
    | 'particlerandomizer'
    | 'settings';

/* Optional deep-link target for the Settings page: which section to open and an
   optional element key to briefly highlight. Set by a caller right before it
   navigates to 'settings'; Settings consumes + clears it on mount. */
export interface SettingsTarget {
    section: string;
    highlight?: string;
}

interface NavigationState {
    page: Page;
    settingsTarget: SettingsTarget | null;
    setPage: (page: Page) => void;
    /* Navigate to Settings, optionally opening a specific section and flagging an
       element to highlight (e.g. from the Upscaler's "Install in Settings"). */
    goToSettings: (target?: SettingsTarget) => void;
    clearSettingsTarget: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
    page: 'home',
    settingsTarget: null,
    setPage: (page) => set({ page }),
    goToSettings: (target) => set({ page: 'settings', settingsTarget: target ?? null }),
    clearSettingsTarget: () => set({ settingsTarget: null }),
}));
