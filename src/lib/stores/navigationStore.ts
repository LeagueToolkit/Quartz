import { create } from 'zustand';

/* Page ids for the sidebar. Most are placeholders until their feature slice
   lands in a later phase; Home and Settings are real in Phase 1. */
export type Page =
    | 'home'
    | 'paint'
    | 'port'
    | 'bineditor'
    | 'assetextractor'
    | 'wadexplorer'
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

/* A file handed to a target page (e.g. from the file explorer's "Open in ..."
   context menu). The destination page consumes + clears it on mount. */
export interface PendingFile {
    page: Page;
    path: string;
}

interface NavigationState {
    page: Page;
    settingsTarget: SettingsTarget | null;
    pendingFile: PendingFile | null;
    setPage: (page: Page) => void;
    /* Navigate to Settings, optionally opening a specific section and flagging an
       element to highlight (e.g. from the Upscaler's "Install in Settings"). */
    goToSettings: (target?: SettingsTarget) => void;
    clearSettingsTarget: () => void;
    /* Navigate to `page` and stash `path` for it to auto-load on mount. */
    openInTool: (page: Page, path: string) => void;
    /* Take the pending file for `page`. Returns the path on every call until
       `clearPendingFile` confirms it was loaded — pages remount (App keys them
       on `page`), and a cold-start handoff can arrive while the main window is
       still hidden behind the startup window, so a read-once-and-drop would
       lose the path to a remount. */
    consumePendingFile: (page: Page) => string | null;
    /* Drop the pending file once the destination page has actually loaded it. */
    clearPendingFile: (page: Page) => void;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
    page: 'home',
    settingsTarget: null,
    pendingFile: null,
    setPage: (page) => set({ page }),
    goToSettings: (target) => set({ page: 'settings', settingsTarget: target ?? null }),
    clearSettingsTarget: () => set({ settingsTarget: null }),
    openInTool: (page, path) => set({ page, pendingFile: { page, path } }),
    consumePendingFile: (page) => {
        const pf = get().pendingFile;
        if (!pf || pf.page !== page) return null;
        return pf.path;
    },
    clearPendingFile: (page) => {
        const pf = get().pendingFile;
        if (pf && pf.page === page) set({ pendingFile: null });
    },
}));
