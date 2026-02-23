/**
 * Paint2 Parser - Efficient line-indexed parsing
 * 
 * Key design principles:
 * 1. Parse ONCE on file load
 * 2. Store LINE NUMBERS, not content copies
 * 3. Update colors by directly modifying lines[lineNum]
 * 4. Never re-parse the entire file
 */

import { parseStaticMaterials, hasStaticMaterials } from './staticMaterialParser.js';

/**
 * Parse a .py file into an indexed structure
 * @param {string} content - Full file content
 * @returns {Object} { lines: string[], systems: Map, emitters: Map, materials: Map, stats: Object }
 */
export function parseVfxFile(content) {
    const startTime = performance.now();
    const lines = content.split('\n');

    const result = {
        lines,                    // The actual file content (single source of truth)
        systems: new Map(),       // systemKey -> { name, lineStart, lineEnd, emitterKeys: [] }
        emitters: new Map(),      // emitterKey -> { name, systemKey, lineStart, lineEnd, colors: {} }
        materials: new Map(),     // materialKey -> { name, colorParams: [], lineStart, lineEnd }
        systemOrder: [],          // Preserve order for display
        materialOrder: [],        // Preserve material order for display
        stats: {
            totalLines: lines.length,
            systemCount: 0,
            emitterCount: 0,
            materialCount: 0,
            colorParamCount: 0,
            parseTimeMs: 0
        }
    };

    let currentSystem = null;
    let currentEmitter = null;
    let currentColor = null;
    let bracketDepth = 0;
    let systemBracketDepth = 0;
    let emitterBracketDepth = 0;
    let colorBracketDepth = 0;
    let inColorValues = false;
    let colorValueLineNums = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Count brackets (simple counting, ignoring strings for speed)
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        bracketDepth += opens - closes;

        // === SYSTEM DETECTION ===
        if (/=\s*VfxSystemDefinitionData\s*\{/i.test(trimmed)) {
            const keyMatch = trimmed.match(/^"?([^"=]+)"?\s*=\s*VfxSystemDefinitionData/i);
            if (keyMatch) {
                const systemKey = keyMatch[1].trim().replace(/^"|"$/g, '');
                currentSystem = {
                    key: systemKey,
                    name: extractShortName(systemKey),
                    particleName: null,
                    lineStart: i,
                    lineEnd: i,
                    emitterKeys: [],
                    bracketStart: bracketDepth
                };
                systemBracketDepth = bracketDepth;
                result.systems.set(systemKey, currentSystem);
                result.systemOrder.push(systemKey);
                result.stats.systemCount++;
            }
        }

        // === PARTICLE NAME (friendly display name) ===
        if (currentSystem && !currentSystem.particleName) {
            const particleMatch = trimmed.match(/particleName:\s*string\s*=\s*"([^"]+)"/i);
            if (particleMatch) {
                currentSystem.particleName = particleMatch[1];
                currentSystem.name = particleMatch[1];
            }
        }

        // === EMITTER DETECTION ===
        if (currentSystem && /VfxEmitterDefinitionData\s*\{/i.test(trimmed)) {
            const emitterKey = `${currentSystem.key}__emitter_${currentSystem.emitterKeys.length}`;
            currentEmitter = {
                key: emitterKey,
                name: 'Unnamed',
                systemKey: currentSystem.key,
                lineStart: i,
                lineEnd: i,
                bracketStart: bracketDepth,
                texturePath: null,
                textures: [],
                meshes: [],
                blendMode: 0,
                colors: {
                    color: null,
                    birthColor: null,
                    fresnelColor: null,
                    lingerColor: null
                }
            };
            emitterBracketDepth = bracketDepth;
            currentSystem.emitterKeys.push(emitterKey);
            result.emitters.set(emitterKey, currentEmitter);
            result.stats.emitterCount++;
        }

        // === EMITTER PROPERTIES ===
        if (currentEmitter) {
            // Emitter name
            const nameMatch = trimmed.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
            if (nameMatch) {
                currentEmitter.name = nameMatch[1];
            }

            // Texture path (Main)
            if (!currentEmitter.texturePath) {
                const texMatch = trimmed.match(/^texture:\s*string\s*=\s*"([^"]+)"/i);
                if (texMatch) {
                    currentEmitter.texturePath = texMatch[1];
                    currentEmitter.textures.push({ label: 'Main Texture', path: texMatch[1] });
                }
            }

            // Other Textures
            const texturePatterns = [
                { regex: /^particleColorTexture:\s*string\s*=\s*"([^"]+)"/i, label: 'Color Texture' },
                { regex: /^erosionMapName:\s*string\s*=\s*"([^"]+)"/i, label: 'Erosion Map' },
                { regex: /^textureMult:\s*string\s*=\s*"([^"]+)"/i, label: 'Mult Texture' },
                { regex: /^paletteTexture:\s*string\s*=\s*"([^"]+)"/i, label: 'Palette' },
                { regex: /^(normalMap|normalMapTexture):\s*string\s*=\s*"([^"]+)"/i, label: 'Normal Map' }
            ];

            for (const { regex, label } of texturePatterns) {
                const match = trimmed.match(regex);
                if (match) {
                    const path = match[match.length - 1]; // Last group is usually the path
                    // Avoid duplicates
                    if (!currentEmitter.textures.some(t => t.path === path && t.label === label)) {
                        currentEmitter.textures.push({ label, path });
                    }
                }
            }

            // Primitive mesh path (SCB/SCO)
            const simpleMeshMatch = trimmed.match(/mSimpleMeshName:\s*string\s*=\s*"([^"]+\.(?:scb|sco))"/i);
            if (simpleMeshMatch) {
                const meshPath = simpleMeshMatch[1];
                if (!currentEmitter.meshes.some(m => m.path === meshPath)) {
                    currentEmitter.meshes.push({ label: 'Primitive Mesh', path: meshPath, meshKind: 'static', skeletonPath: '', animationPath: '' });
                }
            }

            // Full primitive/skinned mesh support
            const meshNameMatch = trimmed.match(/mMeshName:\s*string\s*=\s*"([^"]+\.(?:skn|scb|sco))"/i);
            if (meshNameMatch) {
                const meshPath = meshNameMatch[1];
                const lower = meshPath.toLowerCase();
                const isSkinned = lower.endsWith('.skn');
                if (!currentEmitter.meshes.some(m => m.path === meshPath)) {
                    currentEmitter.meshes.push({
                        label: isSkinned ? 'Skinned Mesh' : 'Primitive Mesh',
                        path: meshPath,
                        meshKind: isSkinned ? 'skinned' : 'static',
                        skeletonPath: '',
                        animationPath: ''
                    });
                }
            }

            const meshSkeletonMatch = trimmed.match(/mMeshSkeletonName:\s*string\s*=\s*"([^"]+\.skl)"/i);
            if (meshSkeletonMatch && currentEmitter.meshes.length > 0) {
                currentEmitter.meshes[currentEmitter.meshes.length - 1].skeletonPath = meshSkeletonMatch[1];
            }

            const meshAnimationMatch = trimmed.match(/mAnimationName:\s*string\s*=\s*"([^"]+\.anm)"/i);
            if (meshAnimationMatch && currentEmitter.meshes.length > 0) {
                currentEmitter.meshes[currentEmitter.meshes.length - 1].animationPath = meshAnimationMatch[1];
            }

            // Blend mode
            const blendMatch = trimmed.match(/blendMode:\s*u8\s*=\s*(\d+)/i);
            if (blendMatch) {
                currentEmitter.blendMode = parseInt(blendMatch[1]) || 0;
                currentEmitter.blendModeLine = i; // Store line number for editing
            }

            // === COLOR DETECTION ===
            // birthColor
            if (/^birthColor:\s*embed\s*=\s*ValueColor\s*\{/i.test(trimmed)) {
                currentColor = { type: 'birthColor', lineStart: i, constantLine: null, valuesLines: [], timesLines: [], values: [], times: [] };
                colorBracketDepth = bracketDepth;
                currentEmitter.colors.birthColor = currentColor;
            }
            // color (but not birthColor or fresnelColor)  
            else if (/^color:\s*embed\s*=\s*ValueColor\s*\{/i.test(trimmed) && !/birth|fresnel/i.test(trimmed)) {
                currentColor = { type: 'color', lineStart: i, constantLine: null, valuesLines: [], timesLines: [], values: [], times: [] };
                colorBracketDepth = bracketDepth;
                currentEmitter.colors.color = currentColor;
            }
            // fresnelColor (embed version)
            else if (/^fresnelColor:\s*embed\s*=\s*ValueColor\s*\{/i.test(trimmed)) {
                currentColor = { type: 'fresnelColor', lineStart: i, constantLine: null, valuesLines: [], timesLines: [], values: [], times: [] };
                colorBracketDepth = bracketDepth;
                currentEmitter.colors.fresnelColor = currentColor;
            }
            // fresnelColor / outlineColor (simple vec4 version)
            else if (/^(fresnelColor|outlineColor):\s*vec4\s*=/i.test(trimmed)) {
                const vecMatch = trimmed.match(/^(fresnelColor|outlineColor):\s*vec4\s*=\s*\{\s*([^}]+)\}/i);
                if (vecMatch) {
                    const vals = vecMatch[2].split(',').map(v => parseFloat(v.trim()));
                    if (vals.length >= 4 && vals.every(n => !isNaN(n))) {
                        currentEmitter.colors.fresnelColor = {
                            type: 'fresnelColor',
                            lineStart: i,
                            constantLine: i,
                            valuesLines: [],
                            timesLines: [],
                            values: [vals],
                            times: [0],
                            isSimpleVec4: true
                        };
                    }
                }
            }
            // lingerColor / SeparateLingerColor
            else if (/^(SeparateLingerColor|lingerColor):\s*embed\s*=\s*ValueColor\s*\{/i.test(trimmed)) {
                currentColor = { type: 'lingerColor', lineStart: i, constantLine: null, valuesLines: [], timesLines: [], values: [], times: [] };
                colorBracketDepth = bracketDepth;
                currentEmitter.colors.lingerColor = currentColor;
            }
            // lingerColor (simple vec4 version)
            else if (/^lingerColor:\s*vec4\s*=/i.test(trimmed)) {
                const vecMatch = trimmed.match(/^lingerColor:\s*vec4\s*=\s*\{\s*([^}]+)\}/i);
                if (vecMatch) {
                    const vals = vecMatch[1].split(',').map(v => parseFloat(v.trim()));
                    if (vals.length >= 4 && vals.every(n => !isNaN(n))) {
                        currentEmitter.colors.lingerColor = {
                            type: 'lingerColor', lineStart: i, constantLine: i, valuesLines: [], timesLines: [], values: [vals], times: [0], isSimpleVec4: true
                        };
                    }
                }
            }
        }

        // === INSIDE COLOR BLOCK ===
        if (currentColor && !currentColor.isSimpleVec4) {
            // constantValue
            if (/constantValue:\s*vec4\s*=/i.test(trimmed)) {
                currentColor.constantLine = i;
                const vecMatch = trimmed.match(/vec4\s*=\s*\{\s*([^}]+)\}/i);
                if (vecMatch) {
                    const vals = vecMatch[1].split(',').map(v => parseFloat(v.trim()));
                    if (vals.length >= 4 && vals.every(n => !isNaN(n))) {
                        currentColor.values.unshift(vals); // constantValue goes first
                        currentColor.times.unshift(0);
                    }
                }
            }

            // Dynamic values list start
            if (/values:\s*list\[vec4\]\s*=\s*\{/i.test(trimmed)) {
                inColorValues = true;
                colorValueLineNums = [];
                // Check for single-line values
                const singleLineMatch = trimmed.match(/values:\s*list\[vec4\]\s*=\s*\{(.+)\}\s*$/i);
                if (singleLineMatch) {
                    const inner = singleLineMatch[1];
                    const vec4Pattern = /\{\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*\}/g;
                    let match;
                    while ((match = vec4Pattern.exec(inner)) !== null) {
                        const vals = [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]), parseFloat(match[4])];
                        if (vals.every(n => !isNaN(n))) {
                            currentColor.values.push(vals);
                            currentColor.valuesLines.push(i); // All on same line
                        }
                    }
                    inColorValues = false;
                }
            }
            // Individual vec4 values
            else if (inColorValues) {
                const vecMatch = trimmed.match(/^\{\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*\}/);
                if (vecMatch) {
                    const vals = [parseFloat(vecMatch[1]), parseFloat(vecMatch[2]), parseFloat(vecMatch[3]), parseFloat(vecMatch[4])];
                    if (vals.every(n => !isNaN(n))) {
                        currentColor.values.push(vals);
                        currentColor.valuesLines.push(i);
                    }
                }
                // End of values list
                if (trimmed === '}' || (trimmed.includes('}') && !trimmed.includes('{'))) {
                    inColorValues = false;
                }
            }

            // Dynamic times list
            if (/times:\s*list\[f32\]\s*=\s*\{/i.test(trimmed)) {
                const timesMatch = trimmed.match(/times:\s*list\[f32\]\s*=\s*\{([^}]*)\}/i);
                if (timesMatch) {
                    const timeVals = timesMatch[1].split(',').map(v => parseFloat(v.trim())).filter(n => !isNaN(n));
                    currentColor.times.push(...timeVals);
                }
            }

            // Color block ends
            if (currentColor && bracketDepth < colorBracketDepth) {
                currentColor.lineEnd = i;
                currentColor = null;
            }
        }

        // === EMITTER ENDS ===
        if (currentEmitter && bracketDepth < emitterBracketDepth) {
            currentEmitter.lineEnd = i;
            currentEmitter = null;
            currentColor = null;
        }

        // === SYSTEM ENDS ===
        if (currentSystem && bracketDepth < systemBracketDepth) {
            currentSystem.lineEnd = i;
            currentSystem = null;
            currentEmitter = null;
            currentColor = null;
        }
    }

    // === STATIC MATERIALS PARSING ===
    if (hasStaticMaterials(content)) {
        const materialsResult = parseStaticMaterials(content);
        
        // Copy materials data to result (reuse same lines array)
        result.materials = materialsResult.materials;
        result.materialOrder = materialsResult.materialOrder;
        result.stats.materialCount = materialsResult.stats.materialCount;
        result.stats.colorParamCount = materialsResult.stats.colorParamCount;
    }

    result.stats.parseTimeMs = performance.now() - startTime;
    console.log(`[Paint2 Parser] Parsed ${result.stats.totalLines} lines, ${result.stats.systemCount} systems, ${result.stats.emitterCount} emitters, ${result.stats.materialCount} materials in ${result.stats.parseTimeMs.toFixed(2)}ms`);

    return result;
}

/**
 * Get all colors for an emitter in a display-friendly format
 * @param {Object} emitter - Emitter from the parsed index
 * @returns {Object} { color: [], birthColor: [], fresnelColor: [], lingerColor: [] }
 */
export function getEmitterColors(emitter) {
    const result = {
        color: [],
        birthColor: [],
        fresnelColor: [],
        lingerColor: []
    };

    if (!emitter || !emitter.colors) return result;

    for (const [type, colorData] of Object.entries(emitter.colors || {})) {
        if (colorData && colorData.values && colorData.values.length > 0) {
            result[type] = colorData.values.map((vals, idx) => ({
                rgba: vals,
                time: colorData.times[idx] ?? (colorData.values.length === 1 ? 0 : idx / (colorData.values.length - 1)),
                lineNum: colorData.valuesLines[idx] ?? colorData.constantLine
            }));
        }
    }

    return result;
}

/**
 * Extract short display name from system path
 */
function extractShortName(fullPath) {
    if (!fullPath) return 'Unknown';
    if (fullPath.startsWith('0x')) return fullPath;

    const parts = fullPath.replace(/^"|"$/g, '').split('/');
    let name = parts[parts.length - 1] || fullPath;

    // Clean up common prefixes
    name = name.replace(/^[A-Z][a-z]+_(Base_|Skin\d+_)/i, '');

    if (name.length > 40) {
        name = name.substring(0, 37) + '...';
    }

    return name;
}
