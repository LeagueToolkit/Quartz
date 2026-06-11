/*
 * Palette Manager - Save and load color palettes.
 *
 * The Electron build wrote JSON files to %APPDATA%/Quartz/palette via fs.
 * There is no generic file-write wrapper in the Tauri api surface yet, so
 * palettes are persisted in localStorage with the same serialized shape.
 */

import ColorHandler from './ColorHandler';
import type { RecolorMode } from './colorOps';

const STORAGE_KEY = 'Paint2SavedPalettes';

interface SerializedColor {
    r: number;
    g: number;
    b: number;
    a: number;
    time: number;
    hex: string;
}

interface SerializedPalette {
    name: string;
    mode: string;
    created: string;
    colors: SerializedColor[];
    filename: string;
}

export interface LoadedPalette {
    name: string;
    mode: string;
    created: string;
    colors: ColorHandler[];
    filename: string;
}

const readStore = (): SerializedPalette[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const writeStore = (list: SerializedPalette[]): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
        console.error('[PaletteManager] Failed to persist palettes', e);
    }
};

const serializePalette = (palette: ColorHandler[], name: string, mode: string, filename: string): SerializedPalette => ({
    name,
    mode,
    created: new Date().toISOString(),
    colors: palette.map(colorHandler => ({
        r: colorHandler.vec4 ? colorHandler.vec4[0] : 0,
        g: colorHandler.vec4 ? colorHandler.vec4[1] : 0,
        b: colorHandler.vec4 ? colorHandler.vec4[2] : 0,
        a: colorHandler.vec4 ? colorHandler.vec4[3] : 1,
        time: colorHandler.time || 0,
        hex: colorHandler.ToHEX(),
    })),
    filename,
});

export const savePalette = (palette: ColorHandler[], name: string, mode: RecolorMode | string): { success: boolean; filename: string } => {
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${sanitizedName}_${Date.now()}.json`;

    const list = readStore();
    list.push(serializePalette(palette, name, String(mode), filename));
    writeStore(list);

    return { success: true, filename };
};

export const loadAllPalettes = (Handler: typeof ColorHandler): LoadedPalette[] => {
    const list = readStore();

    const palettes: LoadedPalette[] = list.map(sp => ({
        name: sp.name,
        mode: sp.mode,
        created: sp.created,
        filename: sp.filename,
        colors: sp.colors.map(colorData => {
            const colorHandler = new Handler();
            if (colorData.hex) {
                colorHandler.InputHex(colorData.hex);
            } else if (colorData.r !== undefined && colorData.g !== undefined && colorData.b !== undefined) {
                colorHandler.vec4 = [
                    colorData.r,
                    colorData.g,
                    colorData.b,
                    colorData.a !== undefined ? colorData.a : 1,
                ];
            }
            colorHandler.time = colorData.time || 0;
            return colorHandler;
        }),
    }));

    palettes.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
    return palettes;
};

export const deletePalette = (filename: string): boolean => {
    const list = readStore();
    const next = list.filter(p => p.filename !== filename);
    writeStore(next);
    return next.length !== list.length;
};
