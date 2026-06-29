import { invokeCommand } from './core';

export interface AssetFile {
    name: string;
    path: string;
}

export interface WallpaperItem {
    id: string;
    displayName: string;
    filePath: string;
}

export function readFileBase64(path: string): Promise<string> {
    return invokeCommand<string>('read_file_base64', { path });
}

export function getFontsDir(): Promise<string> {
    return invokeCommand<string>('get_fonts_dir');
}
export function listFonts(): Promise<AssetFile[]> {
    return invokeCommand<AssetFile[]>('list_fonts');
}

export function getWallpapersDir(): Promise<string> {
    return invokeCommand<string>('get_wallpapers_dir');
}
export function listWallpapers(): Promise<WallpaperItem[]> {
    return invokeCommand<WallpaperItem[]>('list_wallpapers');
}
export function importWallpaper(srcPath: string): Promise<WallpaperItem> {
    return invokeCommand<WallpaperItem>('import_wallpaper', { srcPath });
}
export function deleteWallpaper(id: string): Promise<void> {
    return invokeCommand<void>('delete_wallpaper', { id });
}
