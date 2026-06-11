/*
 * Color Filtering System.
 * Allows selective color replacement based on target colors and tolerance.
 * Ported 1:1 from the Electron Quartz colorFilter util.
 */

import ColorHandler from './ColorHandler';
import type { ColorFilterFn } from './colorOps';

const calculateColorDistance = (color1: number[], color2: number[]): number => {
    const [r1, g1, b1] = color1;
    const [r2, g2, b2] = color2;

    return Math.sqrt(
        Math.pow(r1 - r2, 2) +
        Math.pow(g1 - g2, 2) +
        Math.pow(b1 - b2, 2)
    );
};

export const matchesColorFilter = (color: number[], targetColors: number[][], tolerance: number): boolean => {
    if (!Array.isArray(targetColors) || targetColors.length === 0) {
        return true;
    }

    if (!Array.isArray(color) || color.length < 3) {
        return false;
    }

    const [r, g, b] = color;

    for (const targetColor of targetColors) {
        if (!Array.isArray(targetColor) || targetColor.length < 3) continue;

        const [tr, tg, tb] = targetColor;

        if (tolerance === 0) {
            const colorHandler = new ColorHandler([r, g, b, 1]);
            const targetHandler = new ColorHandler([tr, tg, tb, 1]);

            const [h1, s1] = colorHandler.ToHSL();
            const [h2, s2] = targetHandler.ToHSL();

            const hueDiff = Math.abs(h1 - h2);
            const hueDistance = Math.min(hueDiff, 1 - hueDiff);

            if (hueDistance < 0.08 && s1 > 0.1 && s2 > 0.1) {
                return true;
            }

            const rgbDistance = calculateColorDistance([r, g, b], targetColor);
            if (rgbDistance < 0.1) {
                return true;
            }
            continue;
        }

        const distance = calculateColorDistance([r, g, b], targetColor);
        const maxDistance = (tolerance / 100) * 1.5;

        if (distance <= maxDistance) {
            return true;
        }
    }

    return false;
};

export const createColorFilter = (targetColors: number[][], tolerance: number): ColorFilterFn => {
    return (color: number[]) => {
        // Return true to SKIP colors that DON'T match the filter.
        return !matchesColorFilter(color, targetColors, tolerance);
    };
};

export const getColorDescription = (color: number[]): string => {
    if (!Array.isArray(color) || color.length < 3) return 'Invalid Color';

    const [r, g, b] = color;
    const handler = new ColorHandler([r, g, b, 1]);
    const [h, s, l] = handler.ToHSL();

    if (l < 0.1) return 'Black';
    if (l > 0.9) return 'White';
    if (s < 0.1) return 'Gray';

    const hue = h * 360;
    if (hue < 15 || hue > 345) return 'Red';
    if (hue < 45) return 'Orange';
    if (hue < 75) return 'Yellow';
    if (hue < 150) return 'Green';
    if (hue < 210) return 'Cyan';
    if (hue < 270) return 'Blue';
    if (hue < 330) return 'Purple';

    return 'Unknown';
};
