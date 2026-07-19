/* Shared texture -> data URL resolver.
 *
 * Reuses Port's decode pipeline: resolve a texture rel path to a disk file
 * (`portResolveAssetPath`), decode it (incl. .tex/.dds) to RGBA via the
 * imgrecolor backend (`imgRecolorDecodeTexture`), then paint the pixels onto an
 * offscreen canvas and read a PNG data URL back out. Results are cached per
 * resolved disk path so repeated hovers over the same texture are instant. */

import { imgRecolorDecodeTexture } from '@/lib/api/imgrecolor';
import { portResolveAssetPath } from '@/lib/api/wad';

const CACHE_CAP = 48;
/* assetPath|binPath -> data URL, or null when it can't be resolved/decoded. */
const cache = new Map<string, string | null>();

function cacheSet(key: string, url: string | null): void {
    if (cache.size >= CACHE_CAP) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, url);
}

/* Decode a base64 RGBA8 buffer into a PNG data URL via an offscreen canvas. */
export function rgbaToDataUrl(rgbaB64: string, width: number, height: number): string | null {
    try {
        const bin = atob(rgbaB64);
        const bytes = new Uint8ClampedArray(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.putImageData(new ImageData(bytes, width, height), 0, 0);
        return canvas.toDataURL('image/png');
    } catch {
        return null;
    }
}

/** Decode an already-resolved disk texture to a full-resolution PNG data URL.
 *  Used by the model viewer, which must not stretch the explorer's 96px thumb.
 *  Pass `force` to bypass the cache and re-read the file from disk (needed by the
 *  live texture reload/watcher: the file may have been edited in place). */
export async function resolveDiskTextureDataUrl(diskPath: string, force = false): Promise<string | null> {
    const key = `disk:${diskPath}`;
    if (!force) {
        const hit = cache.get(key);
        if (hit !== undefined) return hit;
    }
    try {
        const decoded = await imgRecolorDecodeTexture(diskPath);
        const url = rgbaToDataUrl(decoded.rgba, decoded.width, decoded.height);
        cacheSet(key, url);
        return url;
    } catch {
        cacheSet(key, null);
        return null;
    }
}

/** Resolve + decode a texture rel path to a PNG data URL (cached). Returns null
 *  if the asset can't be found on disk or fails to decode. */
export async function resolveTextureDataUrl(assetPath: string, binPath: string): Promise<string | null> {
    const key = `${assetPath}|${binPath}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;

    const diskPath = await portResolveAssetPath(assetPath, binPath).catch(() => null);
    if (!diskPath) {
        cacheSet(key, null);
        return null;
    }
    try {
        const url = await resolveDiskTextureDataUrl(diskPath);
        cacheSet(key, url);
        return url;
    } catch {
        cacheSet(key, null);
        return null;
    }
}
