/*
 * Paint2 Static Material Parser
 *
 * Parses StaticMaterialDef structures and identifies color parameters
 * using semantic analysis (suffix patterns + blacklist + value validation)
 */

export interface MaterialColorParam {
    name: string;
    values: number[];
    valueLine: number | null;
    lineStart: number;
    lineEnd: number;
    isColor: boolean;
}

export interface StaticMaterial {
    key: string;
    name: string;
    displayName?: string;
    lineStart: number;
    lineEnd: number;
    colorParams: MaterialColorParam[];
}

export interface StaticMaterialsResult {
    lines: string[];
    materials: Map<string, StaticMaterial>;
    materialOrder: string[];
    stats: { materialCount: number; colorParamCount: number };
}

// Determine if a parameter is a color parameter using semantic suffix
// matching, a blacklist, and value validation.
export function isColorParameter(paramName: string, values: number[]): boolean {
    if (!paramName || !values || values.length < 3) return false;

    const name = paramName.toLowerCase();

    // 1. SUFFIX CHECK - Must END with 'color' (more precise than contains)
    const endsWithColor = /color$/i.test(paramName);

    // 2. TINT prefix is always a color
    const isTintParam = name.startsWith('tint');

    // 3. FG/BG Color patterns (FGColor, BGColor)
    const isFgBgColor = /^(fg|bg)color$/i.test(paramName);

    // 4. BLACKLIST - Control parameter suffixes that are NOT colors
    const controlSuffixes = [
        'strength', 'factor', 'power', 'control',
        'speed', 'tile', 'modifier', 'input',
        'activation', 'minmax', 'mask', 'scale',
        'mult', 'offset', 'range', 'threshold',
        'intensity', 'amount', 'rate', 'size',
    ];

    const isControlParam = controlSuffixes.some(
        (suffix) => name.endsWith(suffix) || name.endsWith('_' + suffix)
    );

    /* 5. VALUE SANITY CHECK - Control params often have values significantly > 1
       (shader multipliers) or only the first component used. */
    const [r, g, b, a] = values;

    // If first value is way too high for a color, it's likely a control value
    const hasExtremeValue = r > 2 || g > 2 || b > 2;

    // Pattern: only X component used (like { 8.4, 0, 0, 0 } for ToonShadePower)
    const isSingleFloatPattern = r !== 0 && g === 0 && b === 0 && a === 0 && r > 1;

    // Pattern: two-component values (like { 3, 5, 0, 0 } for MinMax)
    const isTwoComponentPattern =
        r !== 0 && g !== 0 && b === 0 && a === 0 && (r > 1 || g > 1);

    const looksLikeControlValue =
        hasExtremeValue || isSingleFloatPattern || isTwoComponentPattern;

    const hasColorIndicator = endsWithColor || isTintParam || isFgBgColor;

    return hasColorIndicator && !isControlParam && !looksLikeControlValue;
}

// Parse StaticMaterialDef structures from .py content.
export function parseStaticMaterials(content: string): StaticMaterialsResult {
    const lines = content.split('\n');

    const result: StaticMaterialsResult = {
        lines,
        materials: new Map(),
        materialOrder: [],
        stats: { materialCount: 0, colorParamCount: 0 },
    };

    let currentMaterial: StaticMaterial | null = null;
    let currentParam: {
        lineStart: number;
        lineEnd: number;
        name: string | null;
        values: number[] | null;
        valueLine: number | null;
    } | null = null;
    let bracketDepth = 0;
    let materialBracketDepth = 0;
    let paramBracketDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        bracketDepth += opens - closes;

        // === MATERIAL DETECTION ===
        if (/=\s*StaticMaterialDef\s*\{/i.test(trimmed)) {
            const keyMatch = trimmed.match(/^"?([^"=]+)"?\s*=\s*StaticMaterialDef/i);
            if (keyMatch) {
                const materialKey = keyMatch[1].trim().replace(/^"|"$/g, '');
                currentMaterial = {
                    key: materialKey,
                    name: extractMaterialName(materialKey),
                    lineStart: i,
                    lineEnd: i,
                    colorParams: [],
                };
                materialBracketDepth = bracketDepth;
                result.materials.set(materialKey, currentMaterial);
                result.materialOrder.push(materialKey);
                result.stats.materialCount++;
            }
        }

        // === MATERIAL NAME (from name: string = "...") ===
        if (currentMaterial) {
            const nameMatch = trimmed.match(/^name:\s*string\s*=\s*"([^"]+)"/i);
            if (nameMatch && !currentMaterial.displayName) {
                currentMaterial.displayName = nameMatch[1];
                currentMaterial.name = extractMaterialName(nameMatch[1]);
            }
        }

        // === PARAM DETECTION (StaticMaterialShaderParamDef) ===
        if (currentMaterial && /StaticMaterialShaderParamDef\s*\{/i.test(trimmed)) {
            currentParam = { lineStart: i, lineEnd: i, name: null, values: null, valueLine: null };
            paramBracketDepth = bracketDepth;
        }

        // === INSIDE PARAM BLOCK ===
        if (currentParam) {
            const paramNameMatch = trimmed.match(/^name:\s*string\s*=\s*"([^"]+)"/i);
            if (paramNameMatch) {
                currentParam.name = paramNameMatch[1];
            }

            const valueMatch = trimmed.match(/^[Vv]alue:\s*vec4\s*=\s*\{\s*([^}]+)\}/i);
            if (valueMatch) {
                const vals = valueMatch[1].split(',').map((v) => parseFloat(v.trim()));
                if (vals.length >= 4 && vals.every((n) => !isNaN(n))) {
                    currentParam.values = vals.slice(0, 4);
                    currentParam.valueLine = i;
                }
            }

            // Param block ends
            if (bracketDepth < paramBracketDepth) {
                currentParam.lineEnd = i;

                if (currentParam.name && currentParam.values && currentMaterial) {
                    const isColor = isColorParameter(currentParam.name, currentParam.values);
                    currentMaterial.colorParams.push({
                        name: currentParam.name,
                        values: currentParam.values,
                        valueLine: currentParam.valueLine,
                        lineStart: currentParam.lineStart,
                        lineEnd: currentParam.lineEnd,
                        isColor,
                    });
                    if (isColor) result.stats.colorParamCount++;
                }
                currentParam = null;
            }
        }

        // === MATERIAL ENDS ===
        if (currentMaterial && bracketDepth < materialBracketDepth) {
            currentMaterial.lineEnd = i;
            currentMaterial = null;
            currentParam = null;
        }
    }

    return result;
}

// Check if content has any StaticMaterialDef structures.
export function hasStaticMaterials(content: string): boolean {
    return /StaticMaterialDef\s*\{/i.test(content);
}

// Extract a clean display name from a material path.
function extractMaterialName(fullPath: string): string {
    if (!fullPath) return 'Unknown Material';
    if (fullPath.startsWith('0x')) return fullPath;

    const parts = fullPath.replace(/^"|"$/g, '').split('/');
    let name = parts[parts.length - 1] || fullPath;

    name = name.replace(/_Mat$/i, '');

    if (name.length > 35) {
        name = name.substring(0, 32) + '...';
    }

    return name;
}
