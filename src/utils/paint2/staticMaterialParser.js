/**
 * Paint2 Static Material Parser
 * 
 * Parses StaticMaterialDef structures and identifies color parameters
 * using semantic analysis (suffix patterns + blacklist + value validation)
 */

/**
 * Determine if a parameter is a color parameter
 * Uses semantic suffix matching, blacklist, and value validation
 * 
 * @param {string} paramName - The parameter name
 * @param {number[]} values - The vec4 values [r, g, b, a]
 * @returns {boolean}
 */
export function isColorParameter(paramName, values) {
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
        'intensity', 'amount', 'rate', 'size'
    ];
    
    const isControlParam = controlSuffixes.some(suffix => 
        name.endsWith(suffix) || name.endsWith('_' + suffix)
    );
    
    // 5. VALUE SANITY CHECK - Control params often have:
    //    - Values significantly > 1 (shader multipliers)
    //    - Only first component used (single float packed in vec4)
    const [r, g, b, a] = values;
    
    // If first value is way too high for a color, it's likely a control value
    const hasExtremeValue = r > 2 || g > 2 || b > 2;
    
    // Pattern: only X component used (like { 8.4, 0, 0, 0 } for ToonShadePower)
    const isSingleFloatPattern = (
        r !== 0 && 
        g === 0 && 
        b === 0 && 
        a === 0 &&
        r > 1 // Single floats > 1 are definitely not colors
    );
    
    // Pattern: two-component values (like { 3, 5, 0, 0 } for MinMax)
    const isTwoComponentPattern = (
        r !== 0 && 
        g !== 0 && 
        b === 0 && 
        a === 0 &&
        (r > 1 || g > 1) // If either exceeds 1, not a color
    );
    
    const looksLikeControlValue = hasExtremeValue || isSingleFloatPattern || isTwoComponentPattern;
    
    // DECISION: Accept if it has color indicators AND passes sanity checks
    const hasColorIndicator = endsWithColor || isTintParam || isFgBgColor;
    
    return hasColorIndicator && !isControlParam && !looksLikeControlValue;
}

/**
 * Parse StaticMaterialDef structures from .py content
 * 
 * @param {string} content - Full file content
 * @returns {Object} { materials: Map, materialOrder: [], stats: {} }
 */
export function parseStaticMaterials(content) {
    const lines = content.split('\n');
    
    const result = {
        lines,
        materials: new Map(),    // materialKey -> { name, colorParams: [], lineStart, lineEnd }
        materialOrder: [],       // Preserve order for display
        stats: {
            materialCount: 0,
            colorParamCount: 0
        }
    };
    
    let currentMaterial = null;
    let currentParam = null;
    let bracketDepth = 0;
    let materialBracketDepth = 0;
    let paramBracketDepth = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Count brackets
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
                    colorParams: []
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
            currentParam = {
                lineStart: i,
                lineEnd: i,
                name: null,
                values: null,
                valueLine: null
            };
            paramBracketDepth = bracketDepth;
        }
        
        // === INSIDE PARAM BLOCK ===
        if (currentParam) {
            // Parameter name
            const paramNameMatch = trimmed.match(/^name:\s*string\s*=\s*"([^"]+)"/i);
            if (paramNameMatch) {
                currentParam.name = paramNameMatch[1];
            }
            
            // Parameter value (vec4)
            const valueMatch = trimmed.match(/^[Vv]alue:\s*vec4\s*=\s*\{\s*([^}]+)\}/i);
            if (valueMatch) {
                const vals = valueMatch[1].split(',').map(v => parseFloat(v.trim()));
                if (vals.length >= 4 && vals.every(n => !isNaN(n))) {
                    currentParam.values = vals.slice(0, 4);
                    currentParam.valueLine = i;
                }
            }
            
            // Param block ends
            if (bracketDepth < paramBracketDepth) {
                currentParam.lineEnd = i;
                
                // Add ALL params with vec4 values, marking which are colors
                if (currentParam.name && currentParam.values) {
                    const isColor = isColorParameter(currentParam.name, currentParam.values);
                    currentMaterial.colorParams.push({
                        name: currentParam.name,
                        values: currentParam.values,
                        valueLine: currentParam.valueLine,
                        lineStart: currentParam.lineStart,
                        lineEnd: currentParam.lineEnd,
                        isColor: isColor // Mark whether it's a color or not
                    });
                    if (isColor) {
                        result.stats.colorParamCount++;
                    }
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

/**
 * Check if content has any StaticMaterialDef structures
 * @param {string} content 
 * @returns {boolean}
 */
export function hasStaticMaterials(content) {
    return /StaticMaterialDef\s*\{/i.test(content);
}

/**
 * Get color parameters from a material in display-friendly format
 * @param {Object} material - Material from parsed result
 * @returns {Array} Array of { name, rgba, time, lineNum }
 */
export function getMaterialColors(material) {
    if (!material || !material.colorParams) return [];
    
    return material.colorParams.map(param => ({
        name: param.name,
        rgba: param.values,
        time: 0, // Materials don't have time-based colors
        lineNum: param.valueLine
    }));
}

/**
 * Update a color value in the lines array
 * @param {string[]} lines - The lines array (mutated)
 * @param {number} lineNum - Line number to update
 * @param {number[]} newColor - New [r, g, b, a] values
 * @returns {boolean} Success
 */
export function updateMaterialColorLine(lines, lineNum, newColor) {
    if (!lines || lineNum < 0 || lineNum >= lines.length) return false;
    
    const line = lines[lineNum];
    const [r, g, b, a] = newColor;
    
    // Replace the vec4 value
    const newLine = line.replace(
        /[Vv]alue:\s*vec4\s*=\s*\{[^}]+\}/,
        `value: vec4 = { ${r}, ${g}, ${b}, ${a} }`
    );
    
    if (newLine !== line) {
        lines[lineNum] = newLine;
        return true;
    }
    
    return false;
}

/**
 * Extract a clean display name from material path
 * @param {string} fullPath 
 * @returns {string}
 */
function extractMaterialName(fullPath) {
    if (!fullPath) return 'Unknown Material';
    
    // Handle hex keys
    if (fullPath.startsWith('0x')) return fullPath;
    
    // Get last part of path
    const parts = fullPath.replace(/^"|"$/g, '').split('/');
    let name = parts[parts.length - 1] || fullPath;
    
    // Clean up _Mat suffix
    name = name.replace(/_Mat$/i, '');
    
    // Truncate if too long
    if (name.length > 35) {
        name = name.substring(0, 32) + '...';
    }
    
    return name;
}

/**
 * Get all materials with their colors for UI display
 * @param {Object} parsedResult - Result from parseStaticMaterials
 * @returns {Array} Array of { key, name, colors: [] }
 */
export function getMaterialsForDisplay(parsedResult) {
    if (!parsedResult || !parsedResult.materials) return [];
    
    return parsedResult.materialOrder.map(key => {
        const material = parsedResult.materials.get(key);
        return {
            key,
            name: material.name,
            displayName: material.displayName || material.name,
            colors: getMaterialColors(material)
        };
    });
}
