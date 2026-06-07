import { create } from 'zustand';

interface ConfigState {
    leaguePath: string | null;
    setLeaguePath: (path: string | null) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
    leaguePath: null,
    setLeaguePath: (leaguePath) => set({ leaguePath }),
}));
