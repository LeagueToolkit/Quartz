/*
 * Image Recolor Logic
 * Handles all image processing operations for the Img Recolor page.
 * Ported 1:1 from the Electron Quartz utils/imgRecolorLogic.js.
 */

import { pickPath } from '@/components/explorer';
import {
    readFileBase64,
    imgRecolorDecodeTexture,
    imgRecolorSaveTexture,
    imgRecolorScanDir,
} from '@/lib/api';

export interface LoadedFolder {
    folderPath: string;
    images: ImageEntry[];
}

export interface ImageEntry {
    path: string;
    name: string;
    type: string;
}

/*
 * Remembers the on-disk format tag (e.g. "tex:bc3", "dds:bgra8") of each TEX/DDS we
 * decode, keyed by path. saveImageFile reads it back so the re-encode preserves the
 * original container and block format, matching the Electron build's behavior.
 */
const textureFormats = new Map<string, string>();

/* Decode a base64 string into raw bytes. */
function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

/* Encode raw bytes into a base64 string (chunked to avoid call-stack limits). */
function bytesToBase64(bytes: Uint8Array): string {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
}

function extname(p: string): string {
    const m = /\.[^./\\]+$/.exec(p);
    return m ? m[0].toLowerCase() : '';
}

/*
 * Textures that must not be recolored, recognised by name.
 *
 * Distortion maps store a direction vector per texel rather than a color, so shifting their
 * hue corrupts the offsets the shader reads. Cubemaps hold six faces in one file and the
 * single-surface decode path keeps only the first, so a save writes that one face back over
 * all six and permanently loses the rest.
 *
 * Name matching is deliberate: it catches these before anything decodes them, and the naming
 * is consistent enough in League assets to be reliable.
 */
export function isProtectedTextureName(name = ''): boolean {
    const n = String(name).toLowerCase();
    if (n.includes('cubemap') || /(^|[_\-\s.])cube([_\-\s.]|$)/.test(n)) return true;
    return n.includes('distortion') || n.includes('distort') || n.includes('distord')
        || /(^|[_\-\s.])dist([_\-\s.]|$)/.test(n);
}


/*
 * Load a folder and scan for images. When no path is given, prompt for a directory and
 * walk it on the backend (honouring `recursive`), mirroring the Electron scanDirectory.
 */
export async function loadFolder(
    initialPath: string | null = null,
    recursive = false,
): Promise<LoadedFolder | null> {
    try {
        let folderPath = initialPath;

        if (!folderPath) {
            const picked = await pickPath({ mode: 'directory' });
            if (!picked || Array.isArray(picked)) return null;
            folderPath = picked;
        }

        const scanned = await imgRecolorScanDir(folderPath, recursive);
        const images: ImageEntry[] = scanned.map((img) => ({
            path: img.path,
            name: img.name,
            type: img.type,
        }));

        return { folderPath, images };
    } catch (error) {
        console.error('Error loading folder:', error);
        return null;
    }
}

/* Load a single image file into ImageData. */
export async function loadSingleImage(filePath: string): Promise<ImageData | null> {
    try {
        const ext = extname(filePath);

        if (ext === '.tex' || ext === '.dds') {
            const decoded = await imgRecolorDecodeTexture(filePath);
            textureFormats.set(filePath, decoded.format);
            const rgba = base64ToBytes(decoded.rgba);
            return new ImageData(new Uint8ClampedArray(rgba), decoded.width, decoded.height);
        }

        if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
            const base64 = await readFileBase64(filePath);
            const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
            return await loadStandardImage(`data:${mime};base64,${base64}`);
        }

        throw new Error(`Unsupported file format: ${ext}`);
    } catch (error) {
        console.error('Error loading image:', error);
        return null;
    }
}

/* Decode a standard image (PNG/JPG) data URI to ImageData via canvas. */
function loadStandardImage(dataUri: string): Promise<ImageData> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }
            ctx.drawImage(img, 0, 0);
            resolve(ctx.getImageData(0, 0, img.width, img.height));
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUri;
    });
}

/* Pick the format tag for a destination path, preserving a decoded texture's original
   on-disk format when one was remembered, otherwise deriving from the extension. */
function formatForPath(destPath: string, sourcePath: string): string {
    const ext = extname(destPath);
    if (ext === '.tex' || ext === '.dds') {
        return textureFormats.get(sourcePath) ?? (ext === '.dds' ? 'dds:bgra8' : 'tex:bc3');
    }
    if (ext === '.png') return 'png:rgba';
    if (ext === '.jpg' || ext === '.jpeg') return 'jpg:rgb';
    return 'png:rgba';
}

/* Write the recolored pixels to `destPath` in `format`. */
async function writeTexture(imageData: ImageData, destPath: string, format: string): Promise<boolean> {
    const rgba = bytesToBase64(new Uint8Array(imageData.data.buffer.slice(0)));
    await imgRecolorSaveTexture({
        path: destPath,
        width: imageData.width,
        height: imageData.height,
        rgba,
        format,
    });
    return true;
}

/*
 * Save image file, overwriting the original in place. TEX/DDS are re-encoded into their
 * original container/block format (remembered from decode); PNG/JPG are re-encoded as-is.
 */
export async function saveImageFile(imageData: ImageData, originalPath: string): Promise<boolean> {
    try {
        const format = formatForPath(originalPath, originalPath);
        return await writeTexture(imageData, originalPath, format);
    } catch (error) {
        console.error('Error saving image:', error);
        return false;
    }
}

/*
 * Save a single image with a save dialog. Pick a destination, then write the recolored
 * pixels there. When the destination is a TEX/DDS its original format is preserved.
 */
export async function saveImageFileWithDialog(imageData: ImageData, originalPath: string): Promise<boolean> {
    try {
        const ext = extname(originalPath);
        const isTexture = ext === '.tex' || ext === '.dds';
        const defaultPath = isTexture
            ? originalPath
            : originalPath.replace(new RegExp(`${ext}$`), '_recolored.png');

        const dest = await pickPath({
            mode: 'save',
            defaultPath,
            filters: [
                { name: 'Images', extensions: ['tex', 'dds', 'png', 'jpg', 'jpeg'] },
                { name: 'All Files', extensions: ['*'] },
            ],
            recentsKey: 'image',
        });
        if (!dest || Array.isArray(dest)) return false;

        const format = formatForPath(dest, originalPath);
        return await writeTexture(imageData, dest, format);
    } catch (error) {
        console.error('Error saving image:', error);
        return false;
    }
}

/* Convert hex color to RGB. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
    } : null;
}

/* Euclidean distance between two RGB colors. */
export function colorDistance(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

/* Convert RGB (0-255) to HSL (h 0-360, s/l 0-100). */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
}

/* Convert HSL (h 0-360, s/l 0-100) to RGB (0-255). */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h /= 360;
    s /= 100;
    l /= 100;

    let r: number;
    let g: number;
    let b: number;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number): number => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;

        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
    };
}

export interface RecolorParams {
    targetHue: number;
    saturationBoost: number;
    lightnessAdjust: number;
    opacity: number;
    preserveOriginalColors: boolean;
    /* Baked 256-entry Value tone curve. Omit for identity. The preview and the Rust
       batch save both index this table, so they cannot drift apart. */
    curveLut?: Uint8Array;
}

/*
 * Apply the HSL recolor to a pixel buffer in place. This is the exact
 * algorithm from the old imageProcessor.worker.js (target-hue replace, or hue
 * shift when preserving original colors, plus saturation/lightness/opacity).
 */
export function applyAdjustmentInPlace(pixels: Uint8ClampedArray, params: RecolorParams): void {
    const { targetHue, saturationBoost, lightnessAdjust, opacity, preserveOriginalColors } = params;
    const lightnessAdjustment = lightnessAdjust / 100;
    const saturationMultiplier = saturationBoost / 100;
    const opacityMultiplier = opacity / 100;
    // Only a well-formed table is honoured; anything else is treated as identity.
    const lut = params.curveLut && params.curveLut.length === 256 ? params.curveLut : null;

    for (let i = 0; i < pixels.length; i += 4) {
        const a = pixels[i + 3];
        if (a === 0) continue;

        /* Curve first, on raw RGB, so the HSL stage sees curved values. Must stay in
           the same order as apply_adjustment in quartz-lib/src/tex.rs. */
        const r = lut ? lut[pixels[i]] : pixels[i];
        const g = lut ? lut[pixels[i + 1]] : pixels[i + 1];
        const b = lut ? lut[pixels[i + 2]] : pixels[i + 2];

        const hsl = rgbToHsl(r, g, b);

        let newHue: number;
        let newSaturation: number;
        let newLightness: number;

        if (preserveOriginalColors) {
            // Hue SHIFT mode (like GIMP): 180 = no change, slider rotates wheel.
            const hueShift = targetHue - 180;
            newHue = ((hsl.h + hueShift) % 360 + 360) % 360;
            newSaturation = Math.max(0, Math.min(1, (hsl.s / 100) * (saturationMultiplier * 2)));
            newLightness = Math.max(0, Math.min(1, (hsl.l / 100) + lightnessAdjustment));
        } else {
            newHue = targetHue;
            newSaturation = Math.max(0, Math.min(1, saturationMultiplier));
            newLightness = Math.max(0, Math.min(1, (hsl.l / 100) + lightnessAdjustment));
        }

        const rgb = hslToRgb(newHue, newSaturation * 100, newLightness * 100);

        pixels[i] = Math.ceil(Math.max(0, Math.min(255, rgb.r)));
        pixels[i + 1] = Math.ceil(Math.max(0, Math.min(255, rgb.g)));
        pixels[i + 2] = Math.ceil(Math.max(0, Math.min(255, rgb.b)));
        pixels[i + 3] = Math.ceil(Math.max(0, Math.min(255, a * opacityMultiplier)));
    }
}

/* Produce a new ImageData with the recolor applied. */
export function applyAdjustment(source: ImageData, params: RecolorParams): ImageData {
    const out = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
    applyAdjustmentInPlace(out.data, params);
    return out;
}

/*
 * Apply HSL adjustment (FrogImg target-hue approach). Kept for parity with the
 * old exported applyHSLAdjustment; the live preview uses applyAdjustment above.
 */
export function applyHSLAdjustment(
    imageData: ImageData,
    targetHue: number,
    saturationBoost: number,
    lightnessAdjust: number,
): ImageData {
    const newImageData = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height,
    );

    const pixels = newImageData.data;
    const targetHueNormalized = targetHue / 360;
    const lightnessAdjustment = lightnessAdjust / 100;

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];

        if (a === 0) continue;

        const hsl = rgbToHsl(r, g, b);

        const newHue = targetHueNormalized;
        let newSaturation = hsl.s / 100;
        let newLightness = hsl.l / 100;

        const saturationMultiplier = 1 + (saturationBoost / 100);
        newSaturation = Math.max(0, Math.min(1, newSaturation * saturationMultiplier));
        newLightness = Math.max(0, Math.min(1, newLightness + lightnessAdjustment));

        const rgb = hslToRgb(newHue * 360, newSaturation * 100, newLightness * 100);

        pixels[i] = Math.ceil(Math.max(0, Math.min(255, rgb.r)));
        pixels[i + 1] = Math.ceil(Math.max(0, Math.min(255, rgb.g)));
        pixels[i + 2] = Math.ceil(Math.max(0, Math.min(255, rgb.b)));
    }

    return newImageData;
}

/* Pick the hex color at a canvas pixel. */
export function pickColorFromCanvas(canvas: HTMLCanvasElement, x: number, y: number): string {
    const ctx = canvas.getContext('2d');
    if (!ctx) return '#000000';
    const imageData = ctx.getImageData(x, y, 1, 1);
    const [r, g, b] = imageData.data;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/* Extract the dominant colors from an image as hex strings. */
export function extractDominantColors(imageData: ImageData, count = 8): string[] {
    const pixels = imageData.data;
    const colorMap = new Map<string, number>();

    for (let i = 0; i < pixels.length; i += 16) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];

        if (a < 128) continue;

        const qr = Math.floor(r / 32) * 32;
        const qg = Math.floor(g / 32) * 32;
        const qb = Math.floor(b / 32) * 32;
        const key = `${qr},${qg},${qb}`;

        colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }

    return Array.from(colorMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([key]) => {
            const [r, g, b] = key.split(',').map(Number);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        });
}

/* Detect grayscale / colorless images.
 *
 * Filter Grayscale no longer calls this: it runs the same test in Rust via
 * imgRecolorFilterColored, which decodes in parallel and never ships pixels over IPC.
 * Kept for callers that already hold an ImageData. If the rule changes, change
 * rgba_is_colored in quartz-lib/src/tex.rs to match, or the two will disagree. */
export function isGrayscaleImage(imageData: ImageData): boolean {
    const pixels = imageData.data;
    let colorfulPixels = 0;
    let totalPixels = 0;

    for (let i = 0; i < pixels.length; i += 32) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];

        if (a < 128) continue;

        totalPixels++;

        const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
        if (maxDiff > 10) {
            colorfulPixels++;
        }
    }

    if (totalPixels === 0) return true;
    return (colorfulPixels / totalPixels) < 0.05;
}
