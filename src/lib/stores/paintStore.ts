import { create } from 'zustand';
import type { VfxModel, RecolorModeId } from '@/lib/api';
import ColorHandler from '@/pages/paint/utils/ColorHandler';

/* Resident Paint state. Lives in a store (not component state) so the loaded
   bin and the user's place survive page swaps — App.tsx remounts pages on every
   navigation, so local useState would be wiped. The Rust session stays alive in
   the background; it's freed only when a different bin is opened or the app
   closes. */

export interface HslValues { h: number; s: number; l: number }

function defaultPalette(): ColorHandler[] {
    const def = new ColorHandler();
    def.InputHex('#ecb96a');
    def.time = 0;
    return [def];
}

export interface PaintState {
    // File / resident model
    filePath: string;
    fileName: string;
    fileSaved: boolean;
    statusMessage: string;
    model: VfxModel | null;
    sessionId: number | null;
    canUndo: boolean;
    canRedo: boolean;

    // Selection
    selection: Set<string>;
    lockedSystems: Set<string>;

    // Search / view
    searchQuery: string;
    expandedSystems: Set<string>;
    expandedMaterials: Set<string>;
    autoExpand: boolean;
    variantFilter: 'all' | 'v1' | 'v2';
    searchByTexture: boolean;

    // Mode + recolor settings
    mode: RecolorModeId;
    palette: ColorHandler[];
    colorCount: number;
    ignoreBlackWhite: boolean;
    hslValues: HslValues;
    hueTarget: number;

    // Color filter
    colorFilterEnabled: boolean;
    targetColors: number[][];
    colorTolerance: number;

    // Targets
    targetBC: boolean;
    targetOC: boolean;
    targetLC: boolean;
    targetBaseColor: boolean;

    // Blend mode
    blendModeSelect: number;
    blendModeChance: number;

    set: <K extends keyof PaintState>(key: K, value: PaintState[K]) => void;
    patch: (partial: Partial<PaintState>) => void;
    resetForNewFile: () => void;
}

export const usePaintStore = create<PaintState>((set) => ({
    filePath: '',
    fileName: '',
    fileSaved: true,
    statusMessage: '',
    model: null,
    sessionId: null,
    canUndo: false,
    canRedo: false,

    selection: new Set(),
    lockedSystems: new Set(),

    searchQuery: '',
    expandedSystems: new Set(),
    expandedMaterials: new Set(),
    autoExpand: true,
    variantFilter: 'all',
    searchByTexture: false,

    mode: 'random',
    palette: defaultPalette(),
    colorCount: 1,
    ignoreBlackWhite: true,
    hslValues: { h: 0, s: 0, l: 0 },
    hueTarget: 60,

    colorFilterEnabled: false,
    targetColors: [],
    colorTolerance: 30,

    targetBC: true,
    targetOC: false,
    targetLC: false,
    targetBaseColor: true,

    blendModeSelect: 0,
    blendModeChance: 100,

    set: (key, value) => set({ [key]: value } as Partial<PaintState>),
    patch: (partial) => set(partial),
    resetForNewFile: () => set({ selection: new Set(), canUndo: false, canRedo: false }),
}));
