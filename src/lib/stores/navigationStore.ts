import { create } from 'zustand';

/* Page ids for the sidebar. Most are placeholders until their feature slice
   lands in a later phase; Home and Settings are real in Phase 1. */
export type Page =
    | 'home'
    | 'paint'
    | 'port'
    | 'vfxhub'
    | 'extractor'
    | 'wadexplorer'
    | 'bineditor'
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

interface NavigationState {
    page: Page;
    setPage: (page: Page) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
    page: 'home',
    setPage: (page) => set({ page }),
}));
