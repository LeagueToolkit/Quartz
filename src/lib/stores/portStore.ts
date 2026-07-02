import { create } from 'zustand';
import type { VfxPortModel } from '@/lib/api/vfxSession';

/* Holds the Port page's loaded-session state so swapping pages (App remounts
   each page via <div key={page}>) doesn't nuke the target/donor bins. The
   resident Rust sessions stay alive in the background; usePort seeds its local
   state from here and mirrors changes back. Mirrors paintStore. */

export interface PortResidentState {
    targetPath: string;
    donorPath: string;
    targetSessionId: number | null;
    donorSessionId: number | null;
    targetModel: VfxPortModel | null;
    donorModel: VfxPortModel | null;
    donorTempRoot: string | null;
    fileSaved: boolean;
    canUndo: boolean;
    canRedo: boolean;
    /* Collapse state survives page swaps (stored as key arrays; Sets don't
       round-trip through the mirror as cleanly). */
    collapsedTargetKeys: string[];
    collapsedDonorKeys: string[];
}

interface PortStore extends PortResidentState {
    set: <K extends keyof PortResidentState>(key: K, value: PortResidentState[K]) => void;
    hydrate: (s: Partial<PortResidentState>) => void;
}

export const PORT_DEFAULTS: PortResidentState = {
    targetPath: 'This will show target bin',
    donorPath: 'This will show donor bin',
    targetSessionId: null,
    donorSessionId: null,
    targetModel: null,
    donorModel: null,
    donorTempRoot: null,
    fileSaved: true,
    canUndo: false,
    canRedo: false,
    collapsedTargetKeys: [],
    collapsedDonorKeys: [],
};

export const usePortStore = create<PortStore>((set) => ({
    ...PORT_DEFAULTS,
    set: (key, value) => set({ [key]: value } as Partial<PortResidentState>),
    hydrate: (s) => set(s),
}));
