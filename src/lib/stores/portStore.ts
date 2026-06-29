import { create } from 'zustand';
import type { VfxSystemMap } from '@/pages/port/utils/vfxEmitterParser';

/* Holds the Port page's loaded-bin state so swapping pages (App remounts each
   page via <div key={page}>) doesn't nuke the target/donor bins. usePort seeds
   its local state from here and mirrors changes back. Mirrors paintStore. */

export interface PortResidentState {
    targetPath: string;
    donorPath: string;
    targetPyContent: string;
    donorPyContent: string;
    targetSystems: VfxSystemMap;
    donorSystems: VfxSystemMap;
    fileSaved: boolean;
}

interface PortStore extends PortResidentState {
    set: <K extends keyof PortResidentState>(key: K, value: PortResidentState[K]) => void;
    hydrate: (s: Partial<PortResidentState>) => void;
}

export const PORT_DEFAULTS: PortResidentState = {
    targetPath: 'This will show target bin',
    donorPath: 'This will show donor bin',
    targetPyContent: '',
    donorPyContent: '',
    targetSystems: {},
    donorSystems: {},
    fileSaved: true,
};

export const usePortStore = create<PortStore>((set) => ({
    ...PORT_DEFAULTS,
    set: (key, value) => set({ [key]: value } as Partial<PortResidentState>),
    hydrate: (s) => set(s),
}));
