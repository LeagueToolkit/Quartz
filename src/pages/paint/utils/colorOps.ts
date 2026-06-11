/*
 * Paint Color Operations.
 *
 * Directly modify lines[] at known line numbers. No searching, no re-parsing.
 * Ported 1:1 from the Electron Quartz paint2 colorOps.
 */

import ColorHandler from './ColorHandler';
import type { ParsedFile, ColorType } from './parser';

export type RecolorMode = 'random' | 'random-keyframe' | 'linear' | 'shift' | 'shift-hue' | 'materials';

export interface PaletteStop {
    vec4: number[];
    time: number;
}

export type ColorFilterFn = (rgba: number[]) => boolean;

export interface RecolorOptions {
    mode?: RecolorMode;
    ignoreBlackWhite?: boolean;
    hslShift?: { h: number; s: number; l: number };
    hueTarget?: number | null;
    colorFilter?: ColorFilterFn | null;
}

function recolorEmitter(
    parsedFile: ParsedFile,
    emitterKey: string,
    colorType: ColorType,
    newColors: number[] | number[][],
    options: { preserveAlpha?: boolean; ignoreBlackWhite?: boolean } = {}
): boolean {
    const { preserveAlpha = true, ignoreBlackWhite = true } = options;
    const { lines, emitters } = parsedFile;

    const emitter = emitters.get(emitterKey);
    if (!emitter) return false;

    const colorData = emitter.colors[colorType];
    if (!colorData) return false;

    const colorsArr = newColors as number[][];
    const isNested = Array.isArray(newColors[0]);

    // Handle constant value
    if (colorData.constantLine !== null) {
        const originalLine = lines[colorData.constantLine];
        const originalVals = colorData.values[0];

        if (ignoreBlackWhite && isBlackOrWhite(originalVals)) {
            // Don't modify
        } else {
            const newColor = (isNested ? colorsArr[0] : (newColors as number[]));
            const alpha = preserveAlpha ? originalVals[3] : (newColor[3] ?? 1);
            const finalColor = [newColor[0], newColor[1], newColor[2], alpha];

            const indentMatch = originalLine.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : '';

            if (colorData.isSimpleVec4) {
                const keywordMatch = originalLine.match(/^(\s*)([^:=]+)/);
                const keyword = keywordMatch ? keywordMatch[2].trim() : 'fresnelColor';
                lines[colorData.constantLine] = `${indent}${keyword}: vec4 = { ${finalColor.join(', ')} }`;
            } else {
                const caseMatch = originalLine.match(/([Cc]onstantValue)/);
                const keyword = caseMatch ? caseMatch[1] : 'constantValue';
                lines[colorData.constantLine] = `${indent}${keyword}: vec4 = { ${finalColor.join(', ')} }`;
            }

            colorData.values[0] = finalColor;
        }
    }

    // Handle dynamic values
    if (colorData.valuesLines && colorData.valuesLines.length > 0) {
        const startIdx = colorData.constantLine !== null ? 1 : 0;

        for (let i = 0; i < colorData.valuesLines.length; i++) {
            const valueIdx = startIdx + i;
            const lineNum = colorData.valuesLines[i];
            const originalVals = colorData.values[valueIdx];

            if (!originalVals) continue;

            if (ignoreBlackWhite && isBlackOrWhite(originalVals)) {
                continue;
            }

            const newColor = isNested
                ? (colorsArr[valueIdx] || colorsArr[colorsArr.length - 1])
                : (newColors as number[]);

            const alpha = preserveAlpha ? originalVals[3] : (newColor[3] ?? 1);
            const finalColor = [newColor[0], newColor[1], newColor[2], alpha];

            const originalLine = lines[lineNum];
            const indentMatch = originalLine.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : '';

            lines[lineNum] = `${indent}{ ${finalColor.join(', ')} }`;

            colorData.values[valueIdx] = finalColor;
        }
    }

    return true;
}

export function applyPaletteToEmitters(
    parsedFile: ParsedFile,
    emitterKeys: Set<string>,
    colorType: ColorType | ColorType[] | 'all',
    palette: PaletteStop[],
    options: RecolorOptions = {}
): number {
    const {
        mode = 'random',
        ignoreBlackWhite = true,
        hslShift = { h: 0, s: 0, l: 0 },
        hueTarget = null,
        colorFilter = null,
    } = options;

    let modifiedCount = 0;

    for (const emitterKey of emitterKeys) {
        const emitter = parsedFile.emitters.get(emitterKey);
        if (!emitter) continue;

        let colorTypes: ColorType[] = [];
        if (colorType === 'all') {
            colorTypes = ['color', 'birthColor', 'fresnelColor', 'lingerColor'];
        } else if (Array.isArray(colorType)) {
            colorTypes = colorType;
        } else {
            colorTypes = [colorType];
        }

        for (const cType of colorTypes) {
            const colorData = emitter.colors[cType];
            if (!colorData || colorData.values.length === 0) continue;

            let newColors: number[][];

            switch (mode) {
                case 'shift':
                case 'shift-hue':
                    newColors = colorData.values.map(rgba => {
                        if (ignoreBlackWhite && isBlackOrWhite(rgba)) return rgba;

                        if (colorFilter && typeof colorFilter === 'function' && colorFilter(rgba)) {
                            return rgba;
                        }

                        const handler = new ColorHandler(rgba);
                        if (mode === 'shift') {
                            handler.HSLShift(hslShift.h, hslShift.s, hslShift.l);
                        } else if (mode === 'shift-hue' && hueTarget !== null) {
                            const [, s, l] = handler.ToHSL();
                            handler.InputHSL([hueTarget / 360, s, l]);
                        }
                        return handler.vec4;
                    });
                    break;

                case 'random':
                case 'random-keyframe':
                case 'materials':
                case 'linear':
                default:
                    newColors = generateColorsFromPalette(palette, colorData.values.length, {
                        useRandom: mode === 'random' || mode === 'random-keyframe' || mode === 'materials',
                        randomPerKeyframe: mode === 'random-keyframe',
                        originalColors: colorData.values,
                        ignoreBlackWhite,
                        colorFilter,
                    });
                    break;
            }

            if (recolorEmitter(parsedFile, emitterKey, cType, newColors, { ignoreBlackWhite })) {
                modifiedCount++;
            }
        }
    }

    return modifiedCount;
}

interface GenerateOptions {
    useRandom?: boolean;
    randomPerKeyframe?: boolean;
    originalColors?: number[][];
    ignoreBlackWhite?: boolean;
    colorFilter?: ColorFilterFn | null;
}

function generateColorsFromPalette(palette: PaletteStop[], count: number, options: GenerateOptions = {}): number[][] {
    const { useRandom = true, randomPerKeyframe = false, originalColors = [], ignoreBlackWhite = true, colorFilter = null } = options;

    if (!palette || palette.length === 0) return originalColors;

    const result: number[][] = [];

    const singleRandomColor = useRandom && !randomPerKeyframe
        ? palette[Math.floor(Math.random() * palette.length)]
        : null;

    for (let i = 0; i < count; i++) {
        const originalRgba = originalColors[i];
        if (ignoreBlackWhite && originalRgba && isBlackOrWhite(originalRgba)) {
            result.push(originalRgba);
            continue;
        }

        if (colorFilter && typeof colorFilter === 'function' && originalRgba && colorFilter(originalRgba)) {
            result.push(originalRgba);
            continue;
        }

        if (useRandom) {
            const randomPick = randomPerKeyframe
                ? palette[Math.floor(Math.random() * palette.length)]
                : singleRandomColor!;
            const color = randomPick.vec4 || (Array.isArray(randomPick) ? randomPick : [0, 0, 0, 1]);
            result.push([...color]);
        } else {
            const t = count === 1 ? 0 : i / (count - 1);
            result.push(samplePaletteAt(palette, t));
        }
    }

    return result;
}

function samplePaletteAt(palette: PaletteStop[], tIn: number): number[] {
    if (palette.length === 0) return [0.5, 0.5, 0.5, 1];
    if (palette.length === 1) {
        const c = palette[0];
        return c.vec4 ? [...c.vec4] : [...(c as unknown as number[])];
    }

    const minTime = palette[0].time;
    const maxTime = palette[palette.length - 1].time;
    const t = Math.max(minTime, Math.min(maxTime, tIn));

    let left = palette[0];
    let right = palette[palette.length - 1];

    for (let i = 0; i < palette.length - 1; i++) {
        if (t >= palette[i].time && t <= palette[i + 1].time) {
            left = palette[i];
            right = palette[i + 1];
            break;
        }
    }

    if (left === right) return left.vec4 ? [...left.vec4] : [...(left as unknown as number[])];

    const range = right.time - left.time;
    const localT = range === 0 ? 0 : (t - left.time) / range;

    const lVec = left.vec4;
    const rVec = right.vec4;

    return [
        lVec[0] + (rVec[0] - lVec[0]) * localT,
        lVec[1] + (rVec[1] - lVec[1]) * localT,
        lVec[2] + (rVec[2] - lVec[2]) * localT,
        lVec[3] + (rVec[3] - lVec[3]) * localT,
    ];
}

function isBlackOrWhite(rgba: number[] | undefined): boolean {
    if (!rgba || rgba.length < 3) return false;
    const [r, g, b] = rgba;
    return (r === 0 && g === 0 && b === 0) || (r === 1 && g === 1 && b === 1);
}

// ============================================================
// STATIC MATERIAL OPERATIONS
// ============================================================

function recolorMaterialParam(
    parsedFile: ParsedFile,
    materialKey: string,
    paramName: string,
    newColor: number[],
    options: { preserveAlpha?: boolean; ignoreBlackWhite?: boolean } = {}
): boolean {
    const { preserveAlpha = true, ignoreBlackWhite = true } = options;
    const { lines, materials } = parsedFile;

    const material = materials.get(materialKey);
    if (!material) return false;

    const param = material.colorParams.find(p => p.name === paramName);
    if (!param) return false;

    const lineNum = param.valueLine;
    if (lineNum === null || lineNum === undefined) return false;

    const originalVals = param.values;

    if (ignoreBlackWhite && isBlackOrWhite(originalVals)) return false;

    const alpha = preserveAlpha ? originalVals[3] : (newColor[3] ?? 1);
    const finalColor = [newColor[0], newColor[1], newColor[2], alpha];

    const originalLine = lines[lineNum];
    const indentMatch = originalLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';

    lines[lineNum] = `${indent}value: vec4 = { ${finalColor.join(', ')} }`;

    param.values = finalColor;

    return true;
}

export function applyPaletteToMaterials(
    parsedFile: ParsedFile,
    materialKeys: Set<string>,
    palette: PaletteStop[],
    options: RecolorOptions = {}
): number {
    const {
        mode = 'random',
        ignoreBlackWhite = true,
        hslShift = { h: 0, s: 0, l: 0 },
        hueTarget = null,
        colorFilter = null,
    } = options;

    let modifiedCount = 0;

    for (const selectionKey of materialKeys) {
        const parts = selectionKey.split('::');
        if (parts.length !== 3 || parts[0] !== 'mat') continue;

        const materialKey = parts[1];
        const paramName = parts[2];

        const material = parsedFile.materials.get(materialKey);
        if (!material) continue;

        const param = material.colorParams.find(p => p.name === paramName);
        if (!param) continue;

        if (param.isColor === false) continue;

        const originalRgba = param.values;

        if (ignoreBlackWhite && isBlackOrWhite(originalRgba)) continue;

        if (colorFilter && typeof colorFilter === 'function' && colorFilter(originalRgba)) continue;

        let newColor: number[];

        switch (mode) {
            case 'shift':
            case 'shift-hue': {
                const handler = new ColorHandler(originalRgba);
                if (mode === 'shift') {
                    handler.HSLShift(hslShift.h, hslShift.s, hslShift.l);
                } else if (mode === 'shift-hue' && hueTarget !== null) {
                    const [, s, l] = handler.ToHSL();
                    handler.InputHSL([hueTarget / 360, s, l]);
                }
                newColor = handler.vec4;
                break;
            }
            case 'random':
            case 'random-keyframe':
            case 'materials': {
                const randomPick = palette[Math.floor(Math.random() * palette.length)];
                newColor = randomPick.vec4;
                break;
            }
            case 'linear':
            default: {
                const firstColor = palette[0];
                newColor = firstColor.vec4;
                break;
            }
        }

        if (recolorMaterialParam(parsedFile, materialKey, paramName, newColor, { ignoreBlackWhite })) {
            modifiedCount++;
        }
    }

    return modifiedCount;
}
