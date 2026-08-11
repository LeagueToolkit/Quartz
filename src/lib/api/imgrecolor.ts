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

export interface RecolorBatchResult {
    saved: number;
    // [path, error] for each file that could not be recolored.
    failures: [string, string][];
}

/* Recolor every path in place. Decode, adjust and re-encode all happen in Rust, in
   parallel, so no pixel data crosses the IPC bridge. */
export function imgRecolorBatch(args: {
    paths: string[];
    targetHue: number;
    saturationBoost: number;
    lightnessAdjust: number;
    opacity: number;
    preserveOriginalColors: boolean;
    // 256-entry Value tone curve LUT, or null for identity.
    curve?: number[] | null;
}): Promise<RecolorBatchResult> {
    return invokeCommand<RecolorBatchResult>('imgrecolor_recolor_batch', { args });
}

/* Decode a texture straight to a downscaled PNG for the selection grid. Returns raw
   bytes, so a small PNG crosses the bridge instead of a full-size RGBA buffer. */
export function imgRecolorThumbnail(path: string, maxDimension: number): Promise<ArrayBuffer> {
    return invokeCommand<ArrayBuffer>('imgrecolor_thumbnail', { path, maxDimension });
}

/* Return the subset of `paths` whose textures carry real color. The decode and the
   test both happen in Rust, in parallel, so no pixel data crosses the IPC bridge. */
export function imgRecolorFilterColored(paths: string[]): Promise<string[]> {
    return invokeCommand<string[]>('imgrecolor_filter_colored', { paths });
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
