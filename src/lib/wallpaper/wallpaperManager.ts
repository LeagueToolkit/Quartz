import {
    listWallpapers as apiList,
    importWallpaper as apiImport,
    deleteWallpaper as apiDelete,
    getWallpapersDir,
    type WallpaperItem,
} from '@/lib/api';
import type { ThemeBehavior } from '@/lib/theme/types';

export type { WallpaperItem };

export async function listWallpapers(): Promise<WallpaperItem[]> {
    return apiList();
}

export async function importWallpaper(srcPath: string): Promise<WallpaperItem> {
    return apiImport(srcPath);
}

export async function deleteWallpaper(id: string): Promise<void> {
    return apiDelete(id);
}

export async function wallpapersDir(): Promise<string> {
    return getWallpapersDir();
}

export async function resolveById(id: string): Promise<WallpaperItem | null> {
    if (!id) return null;
    const all = await apiList();
    return all.find((w) => w.id === id) ?? null;
}

/* Matches a theme's wallpaper preset (by display name / filename prefix / explicit
   filenames) against the installed wallpapers — mirrors Quartz's preset matching. */
export async function findPreset(preset: ThemeBehavior['wallpaper']): Promise<WallpaperItem | null> {
    if (!preset) return null;
    const all = await apiList();
    const want = (s?: string) => String(s || '').toLowerCase();
    return all.find((item) => {
        const display = want(item.displayName);
        const fileName = want(item.filePath.split(/[\\/]/).pop());
        const displayMatch = preset.displayName ? display === want(preset.displayName) : false;
        const prefixMatch = preset.fileNamePrefix ? fileName.startsWith(want(preset.fileNamePrefix)) : false;
        const listMatch = Array.isArray(preset.fileNames)
            ? preset.fileNames.some((n) => fileName === want(n))
            : false;
        return displayMatch || prefixMatch || listMatch;
    }) ?? null;
}
