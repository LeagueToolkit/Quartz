/**
 * Paint2 Color Operations
 * 
 * Directly modify lines[] at known line numbers.
 * No searching, no re-parsing.
 */

import ColorHandler from '../ColorHandler.js';

/**
 * Recolor a single emitter's color property
 * @param {Object} parsedFile - Result from parseVfxFile
 * @param {string} emitterKey - Key of the emitter to modify
 * @param {string} colorType - 'color' | 'birthColor' | 'fresnelColor' | 'lingerColor'
 * @param {Array} newColors - Array of [r,g,b,a] values
 * @param {Object} options - { preserveAlpha: bool, ignoreBlackWhite: bool }
 * @returns {boolean} Success
 */
export function recolorEmitter(parsedFile, emitterKey, colorType, newColors, options = {}) {
    const { preserveAlpha = true, ignoreBlackWhite = true } = options;
    const { lines, emitters } = parsedFile;

    const emitter = emitters.get(emitterKey);
    if (!emitter) {
        console.warn(`[Paint2] Emitter not found: ${emitterKey}`);
        return false;
    }

    const colorData = emitter.colors[colorType];
    if (!colorData) {
        console.warn(`[Paint2] No ${colorType} for emitter: ${emitter.name}`);
        return false;
    }

    // Handle constant value
    if (colorData.constantLine !== null) {
        const originalLine = lines[colorData.constantLine];
        const originalVals = colorData.values[0];

        // Skip black/white if option enabled
        if (ignoreBlackWhite && isBlackOrWhite(originalVals)) {
            // Don't modify
        } else {
            const newColor = Array.isArray(newColors[0]) ? newColors[0] : newColors;
            const alpha = preserveAlpha ? originalVals[3] : (newColor[3] ?? 1);
            const finalColor = [newColor[0], newColor[1], newColor[2], alpha];

            // Preserve indentation and keyword (constantValue or the property name itself for simple vec4)
            const indentMatch = originalLine.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : '';

            if (colorData.isSimpleVec4) {
                // fresnelColor: vec4 = { ... } format
                const keywordMatch = originalLine.match(/^(\s*)([^:=]+)/);
                const keyword = keywordMatch ? keywordMatch[2].trim() : 'fresnelColor';
                lines[colorData.constantLine] = `${indent}${keyword}: vec4 = { ${finalColor.join(', ')} }`;
            } else {
                const caseMatch = originalLine.match(/([Cc]onstantValue)/);
                const keyword = caseMatch ? caseMatch[1] : 'constantValue';
                lines[colorData.constantLine] = `${indent}${keyword}: vec4 = { ${finalColor.join(', ')} }`;
            }

            // Update cache
            colorData.values[0] = finalColor;
        }
    }

    // Handle dynamic values
    if (colorData.valuesLines && colorData.valuesLines.length > 0) {
        const startIdx = colorData.constantLine !== null ? 1 : 0; // Index offset if constant was handled first

        for (let i = 0; i < colorData.valuesLines.length; i++) {
            const valueIdx = startIdx + i;
            const lineNum = colorData.valuesLines[i];
            const originalVals = colorData.values[valueIdx];

            if (!originalVals) continue;

            // Skip black/white if option enabled
            if (ignoreBlackWhite && isBlackOrWhite(originalVals)) {
                continue;
            }

            // Get the corresponding new color
            const newColor = Array.isArray(newColors[0])
                ? (newColors[valueIdx] || newColors[newColors.length - 1])
                : newColors;

            const alpha = preserveAlpha ? originalVals[3] : (newColor[3] ?? 1);
            const finalColor = [newColor[0], newColor[1], newColor[2], alpha];

            // Preserve indentation
            const originalLine = lines[lineNum];
            const indentMatch = originalLine.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : '';

            lines[lineNum] = `${indent}{ ${finalColor.join(', ')} }`;

            // Update cache
            colorData.values[valueIdx] = finalColor;
        }
    }

    return true;
}

/**
 * Apply palette to multiple emitters
 * @param {Object} parsedFile - Result from parseVfxFile
 * @param {Set<string>} emitterKeys - Keys of emitters to recolor
 * @param {string} colorType - 'color' | 'birthColor' | 'fresnelColor' | 'lingerColor' | 'all'
 * @param {Array} palette - Array of ColorHandler or {vec4: [r,g,b,a], time: number}
 * @param {Object} options - { mode, useRandomGradient, ignoreBlackWhite, ... }
 * @returns {number} Number of emitters modified
 */
export function applyPaletteToEmitters(parsedFile, emitterKeys, colorType, palette, options = {}) {
    const {
        mode = 'random',
        ignoreBlackWhite = true,
        hslShift = { h: 0, s: 0, l: 0 },
        hueTarget = null,
        colorFilter = null
    } = options;

    let modifiedCount = 0;

    for (const emitterKey of emitterKeys) {
        const emitter = parsedFile.emitters.get(emitterKey);
        if (!emitter) continue;

        let colorTypes = [];
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

            let newColors;

            switch (mode) {
                case 'shift':
                case 'shift-hue':
                    // HSL shift - modify existing colors
                    newColors = colorData.values.map(rgba => {
                        if (ignoreBlackWhite && isBlackOrWhite(rgba)) return rgba;

                        // Check color filter: if predicate returns true, skip this color
                        if (colorFilter && typeof colorFilter === 'function' && colorFilter(rgba)) {
                            return rgba;
                        }

                        const handler = new ColorHandler(rgba);
                        if (mode === 'shift') {
                            handler.HSLShift(hslShift.h, hslShift.s, hslShift.l);
                        } else if (mode === 'shift-hue' && hueTarget !== null) {
                            const [h, s, l] = handler.ToHSL();
                            handler.InputHSL([hueTarget / 360, s, l]);
                        }
                        return handler.vec4;
                    });
                    break;

                case 'random':
                case 'materials':
                case 'linear':
                default:
                    // Sample from palette
                    newColors = generateColorsFromPalette(palette, colorData.values.length, {
                        useRandom: mode === 'random' || mode === 'materials',
                        originalColors: colorData.values,
                        originalTimes: colorData.times,
                        ignoreBlackWhite,
                        colorFilter
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

/**
 * Generate colors by sampling from a palette
 */
function generateColorsFromPalette(palette, count, options = {}) {
    const { useRandom = true, originalColors = [], originalTimes = [], ignoreBlackWhite = true, colorFilter = null } = options;

    if (!palette || palette.length === 0) return originalColors;

    const result = [];

    // For random mode without gradient, we pick ONE random color for the entire property
    const singleRandomColor = useRandom ? palette[Math.floor(Math.random() * palette.length)] : null;

    for (let i = 0; i < count; i++) {
        // Skip black/white original colors
        const originalRgba = originalColors[i];
        if (ignoreBlackWhite && originalRgba && isBlackOrWhite(originalRgba)) {
            result.push(originalRgba);
            continue;
        }

        // Check color filter: if predicate returns true, skip this color (keep original)
        if (colorFilter && typeof colorFilter === 'function' && originalRgba && colorFilter(originalRgba)) {
            result.push(originalRgba);
            continue;
        }

        if (useRandom) {
            // Use the single random color picked for this property
            const color = singleRandomColor.vec4 || (Array.isArray(singleRandomColor) ? singleRandomColor : [singleRandomColor.r || 0, singleRandomColor.g || 0, singleRandomColor.b || 0, 1]);
            result.push([...color]);
        } else {
            // Linear interpolation across palette - use normalized index for left-to-right gradient
            // Always use i/(count-1) to ensure even distribution from 0 (left) to 1 (right)
            const t = count === 1 ? 0 : i / (count - 1);
            result.push(samplePaletteAt(palette, t));
        }
    }

    return result;
}

/**
 * Sample a color from palette at position t (0-1)
 */
function samplePaletteAt(palette, tIn) {
    if (palette.length === 0) return [0.5, 0.5, 0.5, 1];
    if (palette.length === 1) {
        const c = palette[0];
        return c.vec4 ? [...c.vec4] : [...c];
    }

    // Clamp t to palette range to prevent extrapolation artifacts
    const minTime = palette[0].time;
    const maxTime = palette[palette.length - 1].time;
    const t = Math.max(minTime, Math.min(maxTime, tIn));

    // Find the two stops t is between
    let left = palette[0];
    let right = palette[palette.length - 1];

    for (let i = 0; i < palette.length - 1; i++) {
        if (t >= palette[i].time && t <= palette[i + 1].time) {
            left = palette[i];
            right = palette[i + 1];
            break;
        }
    }

    if (left === right) return left.vec4 ? [...left.vec4] : [...left];

    const range = right.time - left.time;
    const localT = range === 0 ? 0 : (t - left.time) / range;

    const lVec = left.vec4 || left;
    const rVec = right.vec4 || right;

    return [
        lVec[0] + (rVec[0] - lVec[0]) * localT,
        lVec[1] + (rVec[1] - lVec[1]) * localT,
        lVec[2] + (rVec[2] - lVec[2]) * localT,
        lVec[3] + (rVec[3] - lVec[3]) * localT
    ];
}

/**
 * Check if a color is pure black or white
 */
function isBlackOrWhite(rgba) {
    if (!rgba || rgba.length < 3) return false;
    const [r, g, b] = rgba;
    return (r === 0 && g === 0 && b === 0) || (r === 1 && g === 1 && b === 1);
}

// ============================================================
// STATIC MATERIAL OPERATIONS
// ============================================================

/**
 * Recolor a single material's color parameter
 * @param {Object} parsedFile - Result from parseVfxFile
 * @param {string} materialKey - Key of the material
 * @param {string} paramName - Name of the color parameter
 * @param {number[]} newColor - New [r, g, b, a] values
 * @param {Object} options - { preserveAlpha, ignoreBlackWhite }
 * @returns {boolean} Success
 */
export function recolorMaterialParam(parsedFile, materialKey, paramName, newColor, options = {}) {
    const { preserveAlpha = true, ignoreBlackWhite = true } = options;
    const { lines, materials } = parsedFile;

    const material = materials.get(materialKey);
    if (!material) return false;

    const param = material.colorParams.find(p => p.name === paramName);
    if (!param) return false;

    const lineNum = param.valueLine;
    if (lineNum === null || lineNum === undefined) return false;

    const originalVals = param.values;

    // Skip black/white if option enabled
    if (ignoreBlackWhite && isBlackOrWhite(originalVals)) return false;

    const alpha = preserveAlpha ? originalVals[3] : (newColor[3] ?? 1);
    const finalColor = [newColor[0], newColor[1], newColor[2], alpha];

    // Update the line
    const originalLine = lines[lineNum];
    const indentMatch = originalLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';

    lines[lineNum] = `${indent}value: vec4 = { ${finalColor.join(', ')} }`;

    // Update cache
    param.values = finalColor;

    return true;
}

/**
 * Apply palette to selected materials
 * @param {Object} parsedFile - Result from parseVfxFile
 * @param {Set<string>} materialKeys - Keys of materials to recolor (format: "mat::<key>::<paramName>")
 * @param {Array} palette - Array of ColorHandler or {vec4: [r,g,b,a], time: number}
 * @param {Object} options - { mode, ignoreBlackWhite, hslShift, hueTarget, colorFilter }
 * @returns {number} Number of parameters modified
 */
export function applyPaletteToMaterials(parsedFile, materialKeys, palette, options = {}) {
    const {
        mode = 'random',
        ignoreBlackWhite = true,
        hslShift = { h: 0, s: 0, l: 0 },
        hueTarget = null,
        colorFilter = null
    } = options;

    let modifiedCount = 0;

    for (const selectionKey of materialKeys) {
        // Parse the selection key: "mat::<materialKey>::<paramName>"
        const parts = selectionKey.split('::');
        if (parts.length !== 3 || parts[0] !== 'mat') continue;

        const materialKey = parts[1];
        const paramName = parts[2];

        const material = parsedFile.materials.get(materialKey);
        if (!material) continue;

        const param = material.colorParams.find(p => p.name === paramName);
        if (!param) continue;
        
        // Skip non-color params
        if (param.isColor === false) continue;

        const originalRgba = param.values;

        // Skip black/white
        if (ignoreBlackWhite && isBlackOrWhite(originalRgba)) continue;

        // Color filter check
        if (colorFilter && typeof colorFilter === 'function' && colorFilter(originalRgba)) continue;

        let newColor;

        switch (mode) {
            case 'shift':
            case 'shift-hue':
                // HSL shift
                const handler = new ColorHandler(originalRgba);
                if (mode === 'shift') {
                    handler.HSLShift(hslShift.h, hslShift.s, hslShift.l);
                } else if (mode === 'shift-hue' && hueTarget !== null) {
                    const [h, s, l] = handler.ToHSL();
                    handler.InputHSL([hueTarget / 360, s, l]);
                }
                newColor = handler.vec4;
                break;

            case 'random':
            case 'materials':
                // Pick random color from palette
                const randomPick = palette[Math.floor(Math.random() * palette.length)];
                newColor = randomPick.vec4 || randomPick;
                break;

            case 'linear':
            default:
                // Use first color from palette (materials don't have gradient timelines)
                const firstColor = palette[0];
                newColor = firstColor.vec4 || firstColor;
                break;
        }

        if (recolorMaterialParam(parsedFile, materialKey, paramName, newColor, { ignoreBlackWhite })) {
            modifiedCount++;
        }
    }

    return modifiedCount;
}
