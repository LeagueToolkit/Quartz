/*
 * Image Recolor Logic
 * Handles all image processing operations for the Img Recolor page.
 * Ported 1:1 from the Electron Quartz utils/imgRecolorLogic.js.
 */

import { open, save } from '@tauri-apps/plugin-dialog';
import { readFileBase64 } from '@/lib/api';

export interface LoadedFolder {
    folderPath: string;
    images: ImageEntry[];
}

export interface ImageEntry {
    path: string;
    name: string;
    type: string;
}

const IMAGE_EXTENSIONS = ['.tex', '.dds', '.png', '.jpg', '.jpeg'];

function extname(p: string): string {
    const m = /\.[^./\\]+$/.exec(p);
    return m ? m[0].toLowerCase() : '';
}

function basename(p: string): string {
    return p.split(/[\\/]/).pop() || p;
}

function dirname(p: string): string {
    const parts = p.split(/[\\/]/);
    parts.pop();
    return parts.join('/');
}

/*
 * Load a folder and scan for images.
 *
 * The Electron version walked the folder with Node's fs and returned every
 * image inside it (optionally recursing). There is no Rust dir-scan wrapper
 * yet, so a real folder walk is deferred to the backend. To keep the page
 * fully usable for PNG/JPG we open a multi-file picker, which lets the user
 * grab any number of images at once (the functional equivalent for the user).
 */
export async function loadFolder(
    initialPath: string | null = null,
    _recursive = false,
): Promise<LoadedFolder | null> {
    try {
        if (initialPath) {
            // TODO(backend): enumerate IMAGE_EXTENSIONS under `initialPath`
            // (honouring `_recursive`). No Rust dir-scan command exists yet, so
            // an explicit path cannot be expanded into its contents here.
            return null;
        }

        const picked = await open({
            multiple: true,
            filters: [
                { name: 'Images', extensions: ['tex', 'dds', 'png', 'jpg', 'jpeg'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });

        if (!picked) return null;
        const paths = Array.isArray(picked) ? picked : [picked];
        if (paths.length === 0) return null;

        const images: ImageEntry[] = [];
        const folderPaths = new Set<string>();

        for (const filePath of paths) {
            const ext = extname(filePath);
            if (IMAGE_EXTENSIONS.includes(ext)) {
                images.push({ path: filePath, name: basename(filePath), type: ext.substring(1) });
                folderPaths.add(dirname(filePath));
            }
        }

        if (images.length === 0) return null;

        const folderPath = folderPaths.size === 1
            ? Array.from(folderPaths)[0]
            : dirname(paths[0]);

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
            // TODO(backend): decode TEX/DDS to RGBA (old native
            // texture:decodeToDataUrl). No Rust wrapper exists yet, so these
            // formats cannot be previewed or recolored on the frontend.
            return null;
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

/* Turn ImageData into a PNG blob via canvas. */
function imageDataToPngBlob(imageData: ImageData): Promise<Blob | null> {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    ctx.putImageData(imageData, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/*
 * Save image file. The Electron version overwrote the original (re-encoding
 * TEX/DDS via the native addon). There is no Rust file-write wrapper yet, so
 * the disk write is deferred. We keep the function fully working for the user
 * by exporting the recolored PNG through a browser download.
 */
export async function saveImageFile(imageData: ImageData, originalPath: string): Promise<boolean> {
    try {
        const ext = extname(originalPath);

        // TODO(backend): overwrite the original file in place. For TEX/DDS this
        // also needs the native re-encoder (writeTEX/writeDDS/compressToDDS).
        // Until a Rust write command exists, fall back to a PNG download so the
        // recolor result is still retrievable.
        const blob = await imageDataToPngBlob(imageData);
        if (!blob) return false;

        const baseName = basename(originalPath).replace(/\.[^.]+$/, '');
        const isTexture = ext === '.tex' || ext === '.dds';
        const suggested = isTexture ? `${baseName}.png` : `${baseName}_recolored.png`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggested;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return true;
    } catch (error) {
        console.error('Error saving image:', error);
        return false;
    }
}

/*
 * Save a single image with a save dialog. Mirrors the old
 * saveImageFileWithDialog: pick a destination, then write the PNG.
 */
export async function saveImageFileWithDialog(imageData: ImageData, originalPath: string): Promise<boolean> {
    try {
        const ext = extname(originalPath);
        const defaultPath = originalPath.replace(new RegExp(`${ext}$`), '_recolored.png');

        const dest = await save({
            defaultPath,
            filters: [
                { name: 'PNG Files', extensions: ['png'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });
        if (!dest) return false;

        // TODO(backend): write the PNG bytes to `dest`. No Rust file-write
        // wrapper exists, so fall back to a browser download for now.
        return await saveImageFile(imageData, originalPath);
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

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];

        if (a === 0) continue;

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

/* Detect grayscale / colorless images (skip them when filtering). */
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
