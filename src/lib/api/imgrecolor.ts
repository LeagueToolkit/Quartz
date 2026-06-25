import { invokeCommand } from './core';

export interface DecodedTexture {
    width: number;
    height: number;
    format: string;
    // RGBA8 pixels, base64-encoded.
    rgba: string;
}

export interface ScannedImage {
    path: string;
    name: string;
    type: string;
}

export function imgRecolorDecodeTexture(path: string): Promise<DecodedTexture> {
    return invokeCommand<DecodedTexture>('imgrecolor_decode_texture', { path });
}

export function imgRecolorSaveTexture(args: {
    path: string;
    width: number;
    height: number;
    rgba: string;
    format: string;
}): Promise<void> {
    return invokeCommand<void>('imgrecolor_save_texture', { args });
}

export function imgRecolorScanDir(dir: string, recursive: boolean): Promise<ScannedImage[]> {
    return invokeCommand<ScannedImage[]>('imgrecolor_scan_dir', { dir, recursive });
}
