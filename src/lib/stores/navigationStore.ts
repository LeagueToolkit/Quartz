import { create } from 'zustand';

export type Page = 'Home' | 'Settings';

interface NavigationState {
    page: Page;
    setPage: (page: Page) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
    page: 'Home',
    setPage: (page) => set({ page }),
}));
