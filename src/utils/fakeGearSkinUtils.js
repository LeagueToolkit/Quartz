/**
 * FakeGearSkin Utilities
 * 
 * Converts VFX systems into toggle-able variants using stencil filtering.
 * Creates two child variants per selected system:
 * - variant1: stencilMode 3 (visible when toggle OFF)
 * - variant2: stencilMode 2 (visible when toggle ON)
 */

// Import string-aware bracket counting from binEditor
import { parsePyFile } from './binEditor/parser.js';
import { SKL } from '../jsritofile/skl.js';
import { SKN } from '../jsritofile/skn.js';
import { insertOrUpdatePersistentEffect } from './persistentEffectsManager.js';

// Stencil configuration
const STENCIL_REFERENCE_ID = '0xe6deedc4';
const STENCIL_MODE_BLOCKED_WHEN_ON = 3;  // Render when stencil DOESN'T match
const STENCIL_MODE_VISIBLE_WHEN_ON = 2;  // Render when stencil MATCHES

// Default variant folder paths
const VARIANT1_FOLDER = 'assets/variant1';
const VARIANT2_FOLDER = 'assets/variant2';

// Variant bin file names
const VARIANT1_BIN_NAME = 'variant1';
const VARIANT2_BIN_NAME = 'variant2';

/**
 * Extract skeleton and simpleSkin paths from .py content
 * @param {string} pyContent - .py file content
 * @returns {{skeleton: string|null, simpleSkin: string|null}}
 */
function extractMeshPaths(pyContent) {
    const skeletonMatch = pyContent.match(/skeleton:\s*string\s*=\s*"([^"]+)"/i);
    const simpleSkinMatch = pyContent.match(/simpleSkin:\s*string\s*=\s*"([^"]+)"/i);

    return {
        skeleton: skeletonMatch ? skeletonMatch[1] : null,
        simpleSkin: simpleSkinMatch ? simpleSkinMatch[1] : null
    };
}

/**
 * Find file path case-insensitively from project root
 * @param {string} assetPath - Path from .py (e.g., "ASSETS/Characters/...")
 * @param {string} projectRoot - Project root directory
 * @returns {string|null} - Actual file path or null if not found
 */
function resolveAssetPath(assetPath, projectRoot) {
    const fs = window.require('fs');
    const path = window.require('path');

    // Normalize the asset path
    const parts = assetPath.split(/[\/\\]/);

    // Try to find the file case-insensitively
    let currentPath = projectRoot;

    for (const part of parts) {
        if (!part) continue;

        try {
            const entries = fs.readdirSync(currentPath);
            const match = entries.find(entry => entry.toLowerCase() === part.toLowerCase());

            if (!match) {
                console.warn(`[FakeGearSkin] Path part not found: ${part} in ${currentPath}`);
                return null;
            }

            currentPath = path.join(currentPath, match);
        } catch (error) {
            console.error(`[FakeGearSkin] Error reading directory: ${currentPath}`, error);
            return null;
        }
    }

    return fs.existsSync(currentPath) ? currentPath : null;
}

/**
 * Process SKL/SKN files to add minimal mesh for animation
 * @param {string} pyContent - .py file content
 * @param {string} binPath - Full path to the bin file
 * @returns {{status: string, message: string}}
 */
export function processMinimalMesh(pyContent, binPath) {
    try {
        const path = window.require('path');

        // Extract paths
        const { skeleton, simpleSkin } = extractMeshPaths(pyContent);

        if (!skeleton || !simpleSkin) {
            return {
                status: 'skip',
                message: 'No skeleton/simpleSkin paths found'
            };
        }

        console.log('[FakeGearSkin] Found mesh paths:', { skeleton, simpleSkin });

        const fs = window.require('fs');

        // Walk up from bin directory to find where ASSETS folder exists
        let projectRoot = path.dirname(binPath);
        const assetDir = skeleton.split('/')[0]; // Usually "ASSETS" or "assets"

        while (projectRoot) {
            // Check if this directory contains the asset folder (case-insensitive)
            try {
                const entries = fs.readdirSync(projectRoot);
                const hasAssets = entries.some(e => e.toLowerCase() === assetDir.toLowerCase());
                if (hasAssets) break;
            } catch (e) { /* ignore */ }

            const parent = path.dirname(projectRoot);
            if (parent === projectRoot) break; // Reached filesystem root
            projectRoot = parent;
        }

        console.log('[FakeGearSkin] Project root:', projectRoot);

        // Resolve actual paths
        const sklPath = resolveAssetPath(skeleton, projectRoot);
        const sknPath = resolveAssetPath(simpleSkin, projectRoot);

        if (!sklPath || !sknPath) {
            return {
                status: 'error',
                message: `Could not find files: SKL=${!!sklPath}, SKN=${!!sknPath}`
            };
        }

        console.log('[FakeGearSkin] Resolved paths:', { sklPath, sknPath });

        // Load SKN first to see what bones are actually used
        const skn = new SKN();
        skn.read(sknPath);

        // Load SKL for debug names
        const skl = new SKL();
        let sklLoaded = false;
        try {
            skl.read(sklPath);
            sklLoaded = true;
        } catch (e) { console.warn('[FakeGearSkin] Failed to read SKL:', e); }

        // Strategy: Bind to the same bone as the first valid vertex
        // This guarantees the bone exists and is valid for this mesh
        let targetBoneIndex = 0;

        if (skn.vertices.length > 0) {
            targetBoneIndex = skn.vertices[0].influences[0];
            console.log(`[FakeGearSkin] piggybacking off existing vertex bone index: ${targetBoneIndex}`);
        } else if (sklLoaded) {
            // Fallback to searching for root in SKL
            targetBoneIndex = skl.joints.findIndex(j => j.parent === -1);
            if (targetBoneIndex === -1) targetBoneIndex = 0;
            console.log(`[FakeGearSkin] empty mesh, falling back to root bone index: ${targetBoneIndex}`);
        }

        const boneName = (sklLoaded && skl.joints[targetBoneIndex]) ? skl.joints[targetBoneIndex].name : `Index ${targetBoneIndex}`;
        console.log(`[FakeGearSkin] Using bone ${boneName} for minimal mesh`);

        // Check if MinimalMesh already exists
        const hasMinimalMesh = skn.submeshes.some(s => s.name.toLowerCase() === 'minimalmesh');

        if (hasMinimalMesh) {
            return {
                status: 'skip',
                message: 'MinimalMesh already exists'
            };
        }

        // Add minimal mesh bound to the target bone index
        skn.addMinimalSubmesh('MinimalMesh', targetBoneIndex, 0.001);

        // Save modified SKN
        skn.write(sknPath);

        console.log('[FakeGearSkin] Added MinimalMesh to SKN');

        return {
            status: 'success',
            message: `Added MinimalMesh bound to '${boneName}'`
        };

    } catch (error) {
        console.error('[FakeGearSkin] Error processing minimal mesh:', error);
        return {
            status: 'error',
            message: error.message
        };
    }
}

function extractLinkedList(pyContent) {
    const match = pyContent.match(/linked:\s*list\[string\]\s*=\s*\{([^}]*)\}/);
    if (!match) return [];

    const linkedContent = match[1];
    const links = [];
    const linkPattern = /"([^"]+)"/g;
    let linkMatch;

    while ((linkMatch = linkPattern.exec(linkedContent)) !== null) {
        links.push(linkMatch[1]);
    }

    return links;
}

/**
 * Check if variant bins are already linked
 */
function hasVariantBinsLinked(pyContent) {
    const links = extractLinkedList(pyContent);
    const hasVariant1 = links.some(l => l.toLowerCase().includes('variant1'));
    const hasVariant2 = links.some(l => l.toLowerCase().includes('variant2'));
    return { hasVariant1, hasVariant2, links };
}

/**
 * Add variant bins to the linked list
 * @param {string} pyContent - Main skin .py content
 * @param {string} variant1BinPath - Path to variant1.bin (e.g., "DATA/Characters/Talon/Skins/Skin12/variant1.bin")
 * @param {string} variant2BinPath - Path to variant2.bin
 */
function addToLinkedList(pyContent, variant1BinPath, variant2BinPath) {
    const existingLinks = extractLinkedList(pyContent);

    // Add new links if not already present
    const newLinks = [...existingLinks];
    if (!existingLinks.some(l => l.toLowerCase().includes('variant1'))) {
        newLinks.push(variant1BinPath);
    }
    if (!existingLinks.some(l => l.toLowerCase().includes('variant2'))) {
        newLinks.push(variant2BinPath);
    }

    // Build new linked list string
    const linkedContent = newLinks.map(l => `    "${l}"`).join('\n');
    const newLinkedList = `linked: list[string] = {\n${linkedContent}\n}`;

    // Replace existing linked list
    const updatedContent = pyContent.replace(
        /linked:\s*list\[string\]\s*=\s*\{[^}]*\}/,
        newLinkedList
    );

    return updatedContent;
}

/**
 * Generate the variant bin path based on the main skin bin path
 * Variant bins are placed directly in the data folder
 * @param {string} mainBinPath - e.g., "C:/project/data/Characters/Talon/Skins/Skin12/Talon12.bin"
 * @param {string} variantName - "variant1" or "variant2"
 * @returns {Object} { absolutePath, dataRelativePath }
 */
function getVariantBinPaths(mainBinPath, variantName) {
    const path = window.require('path');
    const fs = window.require('fs');

    // Find the data folder in the path
    const normalizedPath = mainBinPath.replace(/\\/g, '/');
    const dataMatch = normalizedPath.match(/(.+[\/\\]data)[\/\\]/i);

    let dataFolder;
    if (dataMatch) {
        dataFolder = dataMatch[1];
    } else {
        // Fallback: look for data folder by walking up
        let current = path.dirname(mainBinPath);
        while (current && current !== path.dirname(current)) {
            if (fs.existsSync(path.join(current, 'data'))) {
                dataFolder = path.join(current, 'data');
                break;
            }
            if (path.basename(current).toLowerCase() === 'data') {
                dataFolder = current;
                break;
            }
            current = path.dirname(current);
        }
    }

    if (!dataFolder) {
        // Last resort: put alongside the bin
        dataFolder = path.dirname(mainBinPath);
    }

    // Variant bins go directly in the data folder
    const absolutePath = path.join(dataFolder, `${variantName}.bin`);

    // For the linked list, use "DATA/variant1.bin" format
    const dataRelativePath = `DATA/${variantName}.bin`;

    return { absolutePath, dataRelativePath };
}

/**
 * Generate a minimal .py file for variant systems
 * @param {Array} systems - Array of VFX system contents
 * @returns {string} Complete .py file content
 */
function generateVariantPyFile(systems) {
    const header = `#PROP_text
type: string = "PROP"
version: u32 = 3
linked: list[string] = {}
entries: map[hash,embed] = {
`;

    const footer = `
}
`;

    return header + systems.join('\n') + footer;
}

/**
 * Load existing variant bin and extract its VFX systems
 * @param {string} variantBinPath - Path to variant1.bin or variant2.bin
 * @param {string} ritobinPath - Path to ritobin executable
 * @returns {Array} Array of existing VFX system contents, or empty array if doesn't exist
 */
function loadExistingVariantSystems(variantBinPath, ritobinPath) {
    const fs = window.require('fs');
    const path = window.require('path');
    const { execSync } = window.require('child_process');

    // Check if bin exists
    if (!fs.existsSync(variantBinPath)) {
        console.log(`[fakeGearSkinUtils] No existing variant bin: ${variantBinPath}`);
        return [];
    }

    const pyPath = variantBinPath.replace('.bin', '.py');

    // Convert to .py if needed
    if (!fs.existsSync(pyPath) || fs.statSync(variantBinPath).mtime > fs.statSync(pyPath).mtime) {
        try {
            execSync(`"${ritobinPath}" "${variantBinPath}"`, {
                cwd: path.dirname(variantBinPath),
                timeout: 30000
            });
        } catch (e) {
            console.warn(`[fakeGearSkinUtils] Could not convert existing variant bin: ${e.message}`);
            return [];
        }
    }

    if (!fs.existsSync(pyPath)) {
        return [];
    }

    // Read and extract systems
    const pyContent = fs.readFileSync(pyPath, 'utf8');
    const systems = extractVfxSystems(pyContent);

    console.log(`[fakeGearSkinUtils] Loaded ${systems.length} existing systems from ${variantBinPath}`);

    return systems.map(s => s.rawContent);
}

/**
 * Create a timestamped backup of a file
 * @param {string} filePath - Path to file to backup
 * @returns {string|null} Path to backup file, or null if failed
 */
export function createBackup(filePath) {
    const fs = window.require('fs');
    const path = window.require('path');

    if (!fs.existsSync(filePath)) {
        return null;
    }

    // Generate timestamp: YYYYMMDD_HHMMSS
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');

    const backupPath = `${filePath}.bak_${timestamp}`;

    try {
        fs.copyFileSync(filePath, backupPath);
        console.log(`[fakeGearSkinUtils] Created backup: ${backupPath}`);
        return backupPath;
    } catch (e) {
        console.error(`[fakeGearSkinUtils] Failed to create backup: ${e.message}`);
        return null;
    }
}

/**
 * Merge new variant systems with existing ones
 * @param {Array} newSystems - New VFX system contents to add
 * @param {string} variantBinPath - Path to existing variant bin
 * @param {string} ritobinPath - Path to ritobin
 * @returns {Array} Merged array of all systems
 */
function mergeVariantSystems(newSystems, variantBinPath, ritobinPath) {
    const existingSystems = loadExistingVariantSystems(variantBinPath, ritobinPath);

    // Get keys of existing systems to avoid duplicates
    const existingKeys = new Set();
    for (const content of existingSystems) {
        const match = content.match(/^\s*"([^"]+)"\s*=\s*VfxSystemDefinitionData/m);
        if (match) {
            existingKeys.add(match[1]);
        }
    }

    // Filter out duplicates from new systems
    const uniqueNewSystems = newSystems.filter(content => {
        const match = content.match(/^\s*"([^"]+)"\s*=\s*VfxSystemDefinitionData/m);
        if (match && existingKeys.has(match[1])) {
            console.log(`[fakeGearSkinUtils] Skipping duplicate system: ${match[1]}`);
            return false;
        }
        return true;
    });

    console.log(`[fakeGearSkinUtils] Merging ${uniqueNewSystems.length} new + ${existingSystems.length} existing systems`);

    return [...existingSystems, ...uniqueNewSystems];
}

/**
 * Extract all asset paths (textures, meshes, etc.) from VFX content
 * Simply finds any quoted string ending with a known asset extension
 * Not dependent on property names - catches all asset references
 */
function extractAssetPaths(content) {
    const assets = new Set();

    // Match any quoted string with known asset extensions
    // This catches: texture, mSimpleMeshName, erosionMapName, etc. - any property
    const assetPattern = /"([^"]+\.(dds|tex|png|jpg|jpeg|tga|scb|sco|skn|skl|anm))"/gi;

    let match;
    while ((match = assetPattern.exec(content)) !== null) {
        if (match[1] && match[1].trim()) {
            assets.add(match[1].trim());
        }
    }

    return Array.from(assets);
}

/**
 * Get filename from path
 */
function getFilename(assetPath) {
    return assetPath.split('/').pop() || assetPath.split('\\').pop() || assetPath;
}

/**
 * Repath all assets in content to a specific variant folder
 * @param {string} content - VFX system content
 * @param {string} variantFolder - e.g., 'assets/variant1' or 'assets/variant2'
 * @returns {Object} { content: string, assetMappings: [{original, repathed}] }
 */
function repathAssetsToVariant(content, variantFolder) {
    const assetPaths = extractAssetPaths(content);
    const assetMappings = [];
    let updatedContent = content;

    for (const originalPath of assetPaths) {
        const filename = getFilename(originalPath);
        const newPath = `${variantFolder}/${filename}`;

        // Replace all occurrences of this path
        // Need to escape special regex characters in the path
        const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`"${escapedPath}"`, 'g');
        updatedContent = updatedContent.replace(pattern, `"${newPath}"`);

        assetMappings.push({
            original: originalPath,
            repathed: newPath,
            filename: filename
        });
    }

    return { content: updatedContent, assetMappings };
}

/**
 * Count brackets in a line, ignoring those inside string literals
 * (Copied from binEditor/parser.js for standalone use)
 */
function countBrackets(line) {
    let opens = 0;
    let closes = 0;
    let inString = false;
    let stringChar = null;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const prevChar = i > 0 ? line[i - 1] : '';

        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
                stringChar = null;
            }
        }

        if (!inString) {
            if (char === '{') opens++;
            if (char === '}') closes++;
        }
    }

    return { opens, closes };
}

/**
 * Find the end line of a block starting at startLine using string-aware bracket counting
 */
function findBlockEnd(lines, startLine) {
    let bracketDepth = 0;
    let foundFirstBracket = false;

    for (let i = startLine; i < lines.length; i++) {
        const { opens, closes } = countBrackets(lines[i]);
        bracketDepth += opens - closes;

        if (opens > 0) foundFirstBracket = true;

        if (foundFirstBracket && bracketDepth === 0) {
            return i;
        }

        if (i - startLine > 10000) {
            console.warn(`Block parsing exceeded 10000 lines`);
            return i;
        }
    }

    return lines.length - 1;
}

/**
 * Extract all VfxSystemDefinitionData blocks from the content
 */
export function extractVfxSystems(pyContent) {
    if (!pyContent) return [];

    const lines = pyContent.split('\n');
    const systems = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match VfxSystemDefinitionData header
        const match = line.match(/^\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData\s*\{/);
        if (match) {
            const key = match[1] || match[2];
            const startLine = i;
            const endLine = findBlockEnd(lines, i);
            const rawContent = lines.slice(startLine, endLine + 1).join('\n');

            // Extract particleName for display
            const particleNameMatch = rawContent.match(/particleName:\s*string\s*=\s*"([^"]+)"/);
            const particleName = particleNameMatch ? particleNameMatch[1] : null;

            // Extract emitter count
            const emitterMatches = rawContent.match(/VfxEmitterDefinitionData\s*\{/gi);
            const emitterCount = emitterMatches ? emitterMatches.length : 0;

            systems.push({
                key,
                name: particleName || key.split('/').pop() || key,
                fullPath: key,
                startLine,
                endLine,
                rawContent,
                emitterCount
            });

            i = endLine;
        }
    }

    return systems;
}

/**
 * Extract detailed emitter info from a VFX system
 * @param {string} systemContent - The content of the VFX system
 * @returns {Array} Array of emitter objects with name, hasStencil, hasGroundLayer, etc.
 */
export function extractEmittersFromSystem(systemContent) {
    const lines = systemContent.split('\n');
    const emitters = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/VfxEmitterDefinitionData/i.test(line)) {
            const blockEndIndex = findBlockEnd(lines, i);
            const blockContent = lines.slice(i, blockEndIndex + 1).join('\n');

            // Extract emitter name
            const nameMatch = blockContent.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
            const emitterName = nameMatch ? nameMatch[1] : `Emitter_${emitters.length + 1}`;

            // Check for stencil properties
            const hasStencil = /stencilMode:\s*u8\s*=/i.test(blockContent) || /StencilReferenceId:\s*hash\s*=/i.test(blockContent);

            // Check for isGroundLayer (can be bool or flag type)
            const hasGroundLayer = /isGroundLayer:\s*(?:bool|flag)\s*=\s*true/i.test(blockContent);

            // Check for renderPhaseOverride
            const hasRenderPhaseOverride = /renderPhaseOverride:\s*u8\s*=/i.test(blockContent);

            // Check blend mode
            const blendModeMatch = blockContent.match(/blendMode:\s*u8\s*=\s*(\d+)/);
            const blendMode = blendModeMatch ? parseInt(blendModeMatch[1]) : 0;

            emitters.push({
                name: emitterName,
                startLine: i,
                endLine: blockEndIndex,
                hasStencil,
                hasGroundLayer,
                hasRenderPhaseOverride,
                blendMode,
                rawContent: blockContent
            });

            i = blockEndIndex;
        }
    }

    return emitters;
}

/**
 * Analyze a VFX system content to count existing stencil properties
 * @param {string} systemContent - The content of the VFX system
 * @returns {number} Number of emitters with existing stencil properties
 */
export function countExistingStencilEmitters(systemContent) {
    const emitters = extractEmittersFromSystem(systemContent);
    return emitters.filter(e => e.hasStencil).length;
}

/**
 * Count emitters with isGroundLayer = true
 * @param {string} systemContent - The content of the VFX system
 * @returns {number} Number of emitters with isGroundLayer
 */
export function countGroundLayerEmitters(systemContent) {
    const emitters = extractEmittersFromSystem(systemContent);
    return emitters.filter(e => e.hasGroundLayer).length;
}

/**
 * Duplicate specific emitters as inline variants within a system
 * @param {string} pyContent - Full .py file content
 * @param {string} systemKey - The system key to modify
 * @param {Array<string>} emitterNames - Array of emitter names to duplicate
 * @param {string} stencilId - The stencil ID to use
 * @returns {string} Modified .py content
 */
export function duplicateEmittersAsInline(pyContent, systemKey, emitterNames, stencilId = STENCIL_REFERENCE_ID) {
    const lines = pyContent.split('\n');
    const result = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Find the target system
        const systemMatch = line.match(/^\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData\s*\{/);
        if (systemMatch) {
            const currentKey = systemMatch[1] || systemMatch[2];

            if (currentKey === systemKey) {
                // Found our target system - process it
                const systemEndLine = findBlockEnd(lines, i);
                const systemLines = lines.slice(i, systemEndLine + 1);

                // Process emitters within this system
                const processedLines = [];
                let j = 0;

                while (j < systemLines.length) {
                    const sysLine = systemLines[j];

                    if (/VfxEmitterDefinitionData/i.test(sysLine)) {
                        const emitterEndIdx = findBlockEnd(systemLines, j);
                        const emitterContent = systemLines.slice(j, emitterEndIdx + 1).join('\n');

                        // Extract emitter name
                        const nameMatch = emitterContent.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
                        const emitterName = nameMatch ? nameMatch[1] : null;

                        // Add original emitter
                        for (let k = j; k <= emitterEndIdx; k++) {
                            processedLines.push(systemLines[k]);
                        }

                        // If this emitter is in the list, create a _Variant2 duplicate
                        if (emitterName && emitterNames.includes(emitterName)) {
                            // Create variant2 copy with modified name and stencil
                            let variant2Content = emitterContent;

                            // Rename to _Variant2
                            variant2Content = variant2Content.replace(
                                /emitterName:\s*string\s*=\s*"([^"]+)"/i,
                                `emitterName: string = "$1_Variant2"`
                            );

                            // Add or update stencil properties
                            if (!variant2Content.includes('stencilMode:')) {
                                // Add stencil properties before the closing brace
                                const lastBraceIdx = variant2Content.lastIndexOf('}');
                                const formattedStencilId = formatHashValue(stencilId);
                                variant2Content = variant2Content.slice(0, lastBraceIdx) +
                                    `                stencilMode: u8 = 2\n` +
                                    `                StencilReferenceId: hash = ${formattedStencilId}\n` +
                                    `            ` + variant2Content.slice(lastBraceIdx);
                            }

                            // Add the variant2 emitter
                            processedLines.push('');
                            processedLines.push(...variant2Content.split('\n'));
                        }

                        j = emitterEndIdx + 1;
                    } else {
                        processedLines.push(sysLine);
                        j++;
                    }
                }

                result.push(...processedLines);
                i = systemEndLine + 1;
                continue;
            }
        }

        result.push(line);
        i++;
    }

    return result.join('\n');
}

/**
 * Format a hash value for inclusion in .py file
 * If it looks like a hex hash (0x...), use it as is.
 * Otherwise, treat it as a string and wrap in quotes.
 */
function formatHashValue(value) {
    // If value is null/undefined/empty, fallback to default hex
    if (!value) return STENCIL_REFERENCE_ID;

    const trimmed = String(value).trim();

    // Check if it already has quotes
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed;
    }

    // Check if it is a hex hash (0x...)
    // Allow any case for hex digits
    if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
        return trimmed;
    }

    // Otherwise treat as string and wrap in quotes
    return `"${trimmed}"`;
}

/**
 * Add stencil properties to all emitters in a VFX system content
 * Skips emitters that already have stencil properties (to preserve champion mechanics)
 */
function addStencilToEmitters(systemContent, stencilMode, stencilReferenceId = STENCIL_REFERENCE_ID) {
    const lines = systemContent.split('\n');
    let outputLines = [];
    const formattedId = formatHashValue(stencilReferenceId);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect start of an emitter block
        if (/VfxEmitterDefinitionData/i.test(line)) {
            // Find the end of this block
            const blockEndIndex = findBlockEnd(lines, i);
            const blockContent = lines.slice(i, blockEndIndex + 1).join('\n');

            // Check if ANY stencil-related property exists in this entire block
            const hasStencil = /stencilMode:\s*u8\s*=/i.test(blockContent) || /StencilReferenceId:\s*hash\s*=/i.test(blockContent);

            if (!hasStencil) {
                outputLines.push(line);
                const indentMatch = line.match(/^(\s*)/);
                const baseIndent = indentMatch ? indentMatch[1] : '';
                const propIndent = baseIndent + '    ';

                outputLines.push(`${propIndent}stencilMode: u8 = ${stencilMode}`);
                outputLines.push(`${propIndent}StencilReferenceId: hash = ${formattedId}`);
                outputLines.push(`${propIndent}renderPhaseOverride: u8 = 4`);
                continue;
            } else {
                console.log('[FakeGearSkin] Skipping stencil add for emitter with existing stencil properties');
            }
        }
        outputLines.push(line);
    }
    return outputLines.join('\n');
}

/**
 * Update existing stencil properties in emitters
 */
function updateStencilInContent(content, stencilMode, stencilReferenceId = STENCIL_REFERENCE_ID) {
    const formattedId = formatHashValue(stencilReferenceId);

    let updated = content.replace(
        /stencilMode:\s*u8\s*=\s*\d+/g,
        `stencilMode: u8 = ${stencilMode}`
    );
    updated = updated.replace(
        /StencilReferenceId:\s*hash\s*=\s*0x[0-9a-fA-F]+/g,
        `StencilReferenceId: hash = ${formattedId}`
    );
    // Also try to replace quoted string version if it exists
    updated = updated.replace(
        /StencilReferenceId:\s*hash\s*=\s*"[^"]+"/g,
        `StencilReferenceId: hash = ${formattedId}`
    );

    return updated;
}

/**
 * Create a child variant VFX system from an original system
 * Also repaths all assets to the variant folder
 */
function createVariantSystem(originalContent, originalKey, variantSuffix, stencilMode, variantFolder, stencilReferenceId = STENCIL_REFERENCE_ID) {
    let variantContent = originalContent;
    const variantKey = `${originalKey}_child_${variantSuffix}`;

    // Update the system header
    variantContent = variantContent.replace(
        /^(\s*)(?:"[^"]+"|0x[0-9a-fA-F]+)\s*=\s*VfxSystemDefinitionData/m,
        `$1"${variantKey}" = VfxSystemDefinitionData`
    );

    // Update particleName and particlePath
    variantContent = variantContent.replace(
        /particleName:\s*string\s*=\s*"[^"]+"/g,
        `particleName: string = "${variantKey}"`
    );
    variantContent = variantContent.replace(
        /particlePath:\s*string\s*=\s*"[^"]+"/g,
        `particlePath: string = "${variantKey}"`
    );

    // Repath all assets
    const repathResult = repathAssetsToVariant(variantContent, variantFolder);
    variantContent = repathResult.content;

    // Add stencil properties
    variantContent = addStencilToEmitters(variantContent, stencilMode, stencilReferenceId);

    return {
        key: variantKey,
        content: variantContent,
        assetMappings: repathResult.assetMappings
    };
}

/**
 * Create the parent spawner system that references both variants
 */
function createSpawnerSystem(originalKey, variant1Key, variant2Key) {
    const spawnerContent = `    "${originalKey}" = VfxSystemDefinitionData {
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = -1
                }
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData {
                    childrenIdentifiers: list[embed] = {
                        VfxChildIdentifier {
                            effectKey: hash = "${variant1Key}"
                        }
                    }
                }
                isSingleParticle: flag = true
                emitterName: string = "variant1"
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = -1
                }
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData {
                    childrenIdentifiers: list[embed] = {
                        VfxChildIdentifier {
                            effectKey: hash = "${variant2Key}"
                        }
                    }
                }
                isSingleParticle: flag = true
                emitterName: string = "variant2"
            }
        }
        visibilityRadius: f32 = 9999
        particleName: string = "${originalKey.split('/').pop() || originalKey}"
        particlePath: string = "${originalKey}"
        flags: u16 = 228
    }`;

    return spawnerContent;
}

/**
 * Add entries to the ResourceResolver
 */
function addToResourceResolver(pyContent, entries) {
    const lines = pyContent.split('\n');
    let result = [...lines];

    // Find the ResourceResolver block
    let resolverStartIdx = -1;
    let resourceMapEndIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('= ResourceResolver {')) {
            resolverStartIdx = i;
            break;
        }
    }

    if (resolverStartIdx === -1) {
        console.log('[fakeGearSkinUtils] No ResourceResolver found, skipping');
        return pyContent;
    }

    // Find the resourceMap closing brace
    let depth = 0;
    let inResourceMap = false;

    for (let i = resolverStartIdx; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('resourceMap: map[hash,link] = {')) {
            inResourceMap = true;
        }

        if (inResourceMap) {
            const { opens, closes } = countBrackets(line);
            depth += opens - closes;

            if (depth <= 0) {
                resourceMapEndIdx = i;
                break;
            }
        }
    }

    if (resourceMapEndIdx === -1) {
        console.log('[fakeGearSkinUtils] Could not find resourceMap end');
        return pyContent;
    }

    // Insert entries before the closing brace
    const indent = '            ';
    const entryLines = entries.map(e => `${indent}"${e.key}" = "${e.value}"`);

    result.splice(resourceMapEndIdx, 0, ...entryLines);

    return result.join('\n');
}

/**
 * Convert selected VFX systems to toggle variants
 * Main function for the FakeGearSkin feature
 * @param {string} pyContent - The .py file content
 * @param {string[]} selectedSystemKeys - Keys of systems to convert
 * @param {string} variant1Folder - Folder path for variant1 assets (default: 'assets/variant1')
 * @param {string} variant2Folder - Folder path for variant2 assets (default: 'assets/variant2')
 */
export function convertToToggleVariants(pyContent, selectedSystemKeys, variant1Folder = VARIANT1_FOLDER, variant2Folder = VARIANT2_FOLDER) {
    if (!pyContent || !selectedSystemKeys || selectedSystemKeys.length === 0) {
        return { success: false, error: 'No systems selected', content: pyContent };
    }

    const systems = extractVfxSystems(pyContent);
    const systemMap = new Map(systems.map(s => [s.key, s]));

    let updatedContent = pyContent;
    const createdVariants = [];
    const resolverEntries = [];
    const allAssetMappings = {
        variant1: [],
        variant2: []
    };

    for (const systemKey of selectedSystemKeys) {
        const system = systemMap.get(systemKey);
        if (!system) {
            console.warn(`[fakeGearSkinUtils] System not found: ${systemKey}`);
            continue;
        }

        console.log(`[fakeGearSkinUtils] Converting system: ${systemKey}`);

        // Create variant 1 (stencilMode 3 - visible when toggle OFF)
        // Assets are repathed to variant1 folder
        const variant1 = createVariantSystem(
            system.rawContent,
            systemKey,
            'variant1',
            STENCIL_MODE_BLOCKED_WHEN_ON,
            variant1Folder
        );

        // Create variant 2 (stencilMode 2 - visible when toggle ON)
        // Assets are repathed to variant2 folder
        const variant2 = createVariantSystem(
            system.rawContent,
            systemKey,
            'variant2',
            STENCIL_MODE_VISIBLE_WHEN_ON,
            variant2Folder
        );

        // Collect asset mappings for later file copying
        if (variant1.assetMappings) {
            allAssetMappings.variant1.push(...variant1.assetMappings);
        }
        if (variant2.assetMappings) {
            allAssetMappings.variant2.push(...variant2.assetMappings);
        }

        // Create the spawner system that replaces the original
        const spawnerContent = createSpawnerSystem(systemKey, variant1.key, variant2.key);

        // Replace the original system with the spawner
        updatedContent = updatedContent.replace(system.rawContent, spawnerContent);

        // Find where to insert the variant systems (after the spawner)
        const spawnerEndMatch = updatedContent.indexOf(spawnerContent);
        if (spawnerEndMatch !== -1) {
            const insertPos = spawnerEndMatch + spawnerContent.length;
            updatedContent =
                updatedContent.slice(0, insertPos) +
                '\n' + variant1.content +
                '\n' + variant2.content +
                updatedContent.slice(insertPos);
        }

        // Add ResourceResolver entries
        resolverEntries.push({ key: variant1.key, value: variant1.key });
        resolverEntries.push({ key: variant2.key, value: variant2.key });

        createdVariants.push({
            original: systemKey,
            variant1: variant1.key,
            variant2: variant2.key
        });
    }

    // Add all resolver entries
    if (resolverEntries.length > 0) {
        updatedContent = addToResourceResolver(updatedContent, resolverEntries);
    }

    return {
        success: true,
        content: updatedContent,
        createdVariants,
        assetMappings: allAssetMappings,
        variant1Folder,
        variant2Folder,
        message: `Converted ${createdVariants.length} system(s) to toggle variants. Assets repathed to ${variant1Folder} and ${variant2Folder}.`
    };
}

/**
 * Convert selected VFX systems to separate variant bin files
 * This is the preferred method - creates clean separation of concerns:
 * - Main skin bin: Contains spawner systems that reference child particles
 * - variant1.bin: Contains all variant1 systems (stencilMode 3)
 * - variant2.bin: Contains all variant2 systems (stencilMode 2)
 * 
 * @param {string} pyContent - Main skin .py file content
 * @param {string[]} selectedSystemKeys - Keys of systems to convert
 * @param {string} mainBinPath - Absolute path to the main .bin file
 * @param {string} variant1Folder - Asset folder for variant1
 * @param {string} variant2Folder - Asset folder for variant2
 */
export function convertToSeparateBins(pyContent, selectedSystemKeys, mainBinPath, stencilReferenceId = STENCIL_REFERENCE_ID, variant1Folder = VARIANT1_FOLDER, variant2Folder = VARIANT2_FOLDER) {
    if (!pyContent || !selectedSystemKeys || selectedSystemKeys.length === 0) {
        return { success: false, error: 'No systems selected', content: pyContent };
    }

    const systems = extractVfxSystems(pyContent);
    const systemMap = new Map(systems.map(s => [s.key, s]));

    let mainContent = pyContent;
    const variant1Systems = [];
    const variant2Systems = [];
    const createdVariants = [];
    const resolverEntries = [];
    const allAssetMappings = {
        variant1: [],
        variant2: []
    };

    for (const systemKey of selectedSystemKeys) {
        const system = systemMap.get(systemKey);
        if (!system) {
            console.warn(`[fakeGearSkinUtils] System not found: ${systemKey}`);
            continue;
        }

        console.log(`[fakeGearSkinUtils] Converting system to separate bins: ${systemKey}`);

        // Create variant 1 (stencilMode 3 - visible when toggle OFF)
        const variant1 = createVariantSystem(
            system.rawContent,
            systemKey,
            'variant1',
            STENCIL_MODE_BLOCKED_WHEN_ON,
            variant1Folder,
            stencilReferenceId
        );

        // Create variant 2 (stencilMode 2 - visible when toggle ON)
        const variant2 = createVariantSystem(
            system.rawContent,
            systemKey,
            'variant2',
            STENCIL_MODE_VISIBLE_WHEN_ON,
            variant2Folder,
            stencilReferenceId
        );

        // Collect variant systems for separate files
        variant1Systems.push(variant1.content);
        variant2Systems.push(variant2.content);

        // Collect asset mappings
        if (variant1.assetMappings) {
            allAssetMappings.variant1.push(...variant1.assetMappings);
        }
        if (variant2.assetMappings) {
            allAssetMappings.variant2.push(...variant2.assetMappings);
        }

        // Create the spawner system that replaces the original in main bin
        const spawnerContent = createSpawnerSystem(systemKey, variant1.key, variant2.key);

        // Replace the original system with the spawner in main content
        mainContent = mainContent.replace(system.rawContent, spawnerContent);

        // Add ResourceResolver entries for the child particles
        resolverEntries.push({ key: variant1.key, value: variant1.key });
        resolverEntries.push({ key: variant2.key, value: variant2.key });

        createdVariants.push({
            original: systemKey,
            variant1: variant1.key,
            variant2: variant2.key
        });
    }

    // Add resolver entries to main content
    if (resolverEntries.length > 0) {
        mainContent = addToResourceResolver(mainContent, resolverEntries);
    }

    // Generate paths for variant bins
    const variant1Paths = getVariantBinPaths(mainBinPath, VARIANT1_BIN_NAME);
    const variant2Paths = getVariantBinPaths(mainBinPath, VARIANT2_BIN_NAME);

    // Add variant bins to the linked list in main content
    mainContent = addToLinkedList(mainContent, variant1Paths.dataRelativePath, variant2Paths.dataRelativePath);

    // Return systems and paths - the caller will handle merging and file writing
    return {
        success: true,
        mainContent,
        variant1Systems,
        variant2Systems,
        variant1BinPath: variant1Paths.absolutePath,
        variant2BinPath: variant2Paths.absolutePath,
        variant1PyPath: variant1Paths.absolutePath.replace('.bin', '.py'),
        variant2PyPath: variant2Paths.absolutePath.replace('.bin', '.py'),
        createdVariants,
        assetMappings: allAssetMappings,
        variant1Folder,
        variant2Folder,
        message: `Created ${createdVariants.length} variant systems in separate bins`
    };
}

/**
 * Write variant bins with merging support
 * @param {Object} conversionResult - Result from convertToSeparateBins
 * @param {string} ritobinPath - Path to ritobin executable
 * @returns {Object} Result with generated py content
 */
export function writeVariantBinsWithMerge(conversionResult, ritobinPath) {
    // Merge new systems with existing ones
    const mergedVariant1 = mergeVariantSystems(
        conversionResult.variant1Systems,
        conversionResult.variant1BinPath,
        ritobinPath
    );

    const mergedVariant2 = mergeVariantSystems(
        conversionResult.variant2Systems,
        conversionResult.variant2BinPath,
        ritobinPath
    );

    // Generate merged .py content
    const variant1PyContent = generateVariantPyFile(mergedVariant1);
    const variant2PyContent = generateVariantPyFile(mergedVariant2);

    return {
        variant1Content: variant1PyContent,
        variant2Content: variant2PyContent,
        variant1Path: conversionResult.variant1PyPath,
        variant2Path: conversionResult.variant2PyPath,
        variant1SystemCount: mergedVariant1.length,
        variant2SystemCount: mergedVariant2.length
    };
}

/**
 * Check if a system already has toggle variants
 * Now checks for spawner signatures in the content instead of just key references
 */
export function hasToggleVariants(pyContent, systemKey, systemContent = null) {
    // If content is provided, check it directly (most robust)
    if (systemContent) {
        return checkSpawnerSignature(systemContent);
    }

    // Otherwise, try to find the system in pyContent
    // This is less efficient and robust against key format changes (hash vs string)
    if (pyContent && systemKey) {
        const systems = extractVfxSystems(pyContent);
        const system = systems.find(s => s.key === systemKey);
        if (system && system.rawContent) {
            return checkSpawnerSignature(system.rawContent);
        }
    }

    // Fallback to legacy string check (flaky if keys are hashed)
    const variant1Key = `${systemKey}_child_variant1`;
    return pyContent && pyContent.includes(`"${variant1Key}"`);
}

/**
 * Helper to check if content looks like our toggle spawner
 */
function checkSpawnerSignature(content) {
    // Check for our specific emitter names
    const hasVariant1 = /emitterName:\s*string\s*=\s*"variant1"/i.test(content);
    const hasVariant2 = /emitterName:\s*string\s*=\s*"variant2"/i.test(content);

    // Check that it's a spawner (references children)
    const hasChildSet = content.includes('childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData');

    return hasVariant1 && hasVariant2 && hasChildSet;
}

/**
 * Copy togglescreen assets (screen.dds, screen.scb) from app bundle to project
 * @param {string} binPath - Path to the .bin file (used to find project root)
 * @returns {Object} Result with success status and paths
 */
export async function copyToggleScreenAssets(binPath) {
    if (!window.require) {
        return { success: false, error: 'Electron environment required' };
    }

    const fs = window.require('fs');
    const path = window.require('path');

    // Find project root (look for ASSETS folder)
    let projectRoot = path.dirname(binPath);
    const maxDepth = 10;

    for (let i = 0; i < maxDepth; i++) {
        try {
            const entries = fs.readdirSync(projectRoot);
            const hasAssets = entries.some(e => e.toLowerCase() === 'assets');
            if (hasAssets) break;
        } catch (e) { /* ignore */ }

        const parent = path.dirname(projectRoot);
        if (parent === projectRoot) break;
        projectRoot = parent;
    }

    // Determine the app's resource path (where public folder contents are)
    // Use the same pattern as ritobin - use IPC handler for production, fallback for dev
    let appResourcePath;

    try {
        // Try IPC handler first (works in both dev and production)
        const { ipcRenderer } = window.require('electron');
        const resourcesPath = await ipcRenderer.invoke('getResourcesPath');
        if (resourcesPath) {
            // In production: resourcesPath is process.resourcesPath
            // In dev: resourcesPath is app.getAppPath()/public
            // screen.scb and screen.dds should be directly in resourcesPath/public or resourcesPath
            const publicPath = path.join(resourcesPath, 'public');
            if (fs.existsSync(publicPath)) {
                appResourcePath = publicPath;
            } else {
                // Try directly in resourcesPath (for production where public might be at root)
                appResourcePath = resourcesPath;
            }
        }
    } catch (e) {
        console.warn('[FakeGearSkin] Could not get resources path via IPC:', e.message);
    }

    // Fallback: Try process.resourcesPath directly (production)
    if (!appResourcePath || !fs.existsSync(appResourcePath)) {
        try {
            if (process.resourcesPath) {
                const publicPath = path.join(process.resourcesPath, 'public');
                if (fs.existsSync(publicPath)) {
                    appResourcePath = publicPath;
                } else if (fs.existsSync(process.resourcesPath)) {
                    appResourcePath = process.resourcesPath;
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    // Fallback paths for development
    if (!appResourcePath || !fs.existsSync(appResourcePath)) {
        // Try common dev paths
        const devPaths = [
            path.join(process.cwd(), 'public'),
            path.join(__dirname, '..', '..', 'public'),
            path.join(__dirname, '..', '..', '..', 'public'),
        ];

        for (const devPath of devPaths) {
            if (fs.existsSync(devPath)) {
                appResourcePath = devPath;
                break;
            }
        }
    }

    if (!appResourcePath || !fs.existsSync(appResourcePath)) {
        console.error('[FakeGearSkin] Could not find app resource path for togglescreen assets');
        return { success: false, error: 'Could not find app resource path' };
    }

    const sourceFiles = [
        { name: 'screen.dds', src: path.join(appResourcePath, 'screen.dds') },
        { name: 'screen.scb', src: path.join(appResourcePath, 'screen.scb') }
    ];

    // Target folder in project
    const targetFolder = path.join(projectRoot, 'assets', 'togglescreen');
    const copiedFiles = [];
    const errors = [];

    // Create target folder if it doesn't exist
    try {
        if (!fs.existsSync(targetFolder)) {
            fs.mkdirSync(targetFolder, { recursive: true });
            console.log('[FakeGearSkin] Created togglescreen folder:', targetFolder);
        }
    } catch (e) {
        return { success: false, error: `Could not create folder: ${e.message}` };
    }

    // Copy files
    for (const file of sourceFiles) {
        const destPath = path.join(targetFolder, file.name);

        // Skip if already exists
        if (fs.existsSync(destPath)) {
            console.log('[FakeGearSkin] File already exists:', destPath);
            copiedFiles.push({ name: file.name, path: destPath, skipped: true });
            continue;
        }

        // Check if source exists
        if (!fs.existsSync(file.src)) {
            console.error('[FakeGearSkin] Source file not found:', file.src);
            errors.push(`Source not found: ${file.name}`);
            continue;
        }

        try {
            fs.copyFileSync(file.src, destPath);
            console.log('[FakeGearSkin] Copied:', file.src, '->', destPath);
            copiedFiles.push({ name: file.name, path: destPath, copied: true });
        } catch (e) {
            console.error('[FakeGearSkin] Failed to copy:', e.message);
            errors.push(`Failed to copy ${file.name}: ${e.message}`);
        }
    }

    return {
        success: errors.length === 0,
        copiedFiles,
        errors,
        targetFolder,
        texturePath: 'assets/togglescreen/screen.dds',
        meshPath: 'assets/togglescreen/screen.scb'
    };
}

/**
 * Get the togglescreen VFX system template
 */
export function getToggleScreenSystem(texturePath = 'assets/togglescreen/screen.dds', meshPath = 'assets/togglescreen/screen.scb', stencilReferenceId = STENCIL_REFERENCE_ID) {
    const formattedId = formatHashValue(stencilReferenceId);

    return `    "togglescreen" = VfxSystemDefinitionData {
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = -1
                }
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                isSingleParticle: flag = true
                emitterName: string = "Overlay_Under"
                SpawnShape: pointer = VfxShapeLegacy {
                    emitOffset: embed = ValueVector3 {
                        dynamics: pointer = VfxAnimatedVector3fVariableData {
                            probabilityTables: list[pointer] = {
                                VfxProbabilityTableData {}
                                VfxProbabilityTableData {}
                                VfxProbabilityTableData {}
                            }
                            times: list[f32] = {
                                0
                            }
                            values: list[vec3] = {
                                { 0, 0, 0 }
                            }
                        }
                    }
                    emitRotationAngles: list[embed] = {
                        ValueFloat {}
                        ValueFloat {}
                    }
                    emitRotationAxes: list[vec3] = {
                        { 0, 0, 0 }
                        { 0, 0, 0 }
                    }
                }
                RenderPhaseOverride: u8 = 4
                EmitterPosition: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {}
                            VfxProbabilityTableData {}
                            VfxProbabilityTableData {}
                        }
                        times: list[f32] = {
                            0
                        }
                        values: list[vec3] = {
                            { 0, 0, 0 }
                        }
                    }
                }
                primitive: pointer = VfxPrimitiveMesh {
                    mMesh: embed = VfxMeshDefinitionData {
                        mSimpleMeshName: string = "${meshPath}"
                    }
                    AlignPitchToCamera: bool = true
                    AlignYawToCamera: bool = true
                    0x6aec9e7a: bool = true
                }
                pass: i16 = -9999
                blendMode: u8 = 4
                stencilMode: u8 = 1
                StencilReferenceId: hash = ${formattedId}
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { 0, -270, 0 }
                }
                texture: string = "${texturePath}"
            }
        }
        visibilityRadius: f32 = 9999
        particleName: string = "togglescreen"
        particlePath: string = "togglescreen"
        flags: u16 = 6
    }`;
}

/**
 * Extract StencilReferenceId from existing togglescreen system
 * @param {string} pyContent 
 * @returns {string|null} The stencil ID string/hash or null if not found
 */
export function extractStencilIdFromToggleScreen(pyContent) {
    if (!pyContent) return null;

    // Use extractVfxSystems to correctly identify the system even if key is hashed
    const systems = extractVfxSystems(pyContent);
    const toggleSystem = systems.find(s =>
        // strictly check particleName or particlePath
        (s.rawContent && /particleName:\s*string\s*=\s*"togglescreen"/i.test(s.rawContent)) ||
        (s.rawContent && /particlePath:\s*string\s*=\s*"togglescreen"/i.test(s.rawContent)) ||
        // Fallback to checking key if it hasn't been hashed
        s.key === "togglescreen"
    );

    if (!toggleSystem || !toggleSystem.rawContent) return null;

    // Extract StencilReferenceId
    // Pattern: StencilReferenceId: hash = "cock" OR StencilReferenceId: hash = 0x1234
    const idMatch = toggleSystem.rawContent.match(/StencilReferenceId:\s*hash\s*=\s*(?:(?:"([^"]+)")|(0x[0-9a-fA-F]+))/);

    if (idMatch) {
        return idMatch[1] || idMatch[2];
    }

    return null;
}

/**
 * Check if togglescreen VFX system exists in content
 * Must be specific to avoid false positives from effectKey references in PersistentEffect
 */
export function hasToggleScreen(pyContent) {
    if (!pyContent) return false;

    // Legacy check: direct string match for definition
    if (pyContent.includes('"togglescreen" = VfxSystemDefinitionData')) return true;

    // Robust check: look for particleName/particlePath inside any VfxSystemDefinitionData
    // We assume extractVfxSystems is reliable enough, or we do a regex check
    const systems = extractVfxSystems(pyContent);
    return systems.some(s =>
        (s.rawContent && /particleName:\s*string\s*=\s*"togglescreen"/i.test(s.rawContent)) ||
        (s.rawContent && /particlePath:\s*string\s*=\s*"togglescreen"/i.test(s.rawContent))
    );
}

/**
 * Insert togglescreen system and its ResourceResolver entry
 * @param {string} pyContent - The .py file content
 * @param {string} binPath - Optional path to bin file (used to copy screen assets to project)
 * @param {string} texturePath - Optional custom texture path
 * @param {string} meshPath - Optional custom mesh path
 * @param {string} stencilReferenceId - Optional custom stencil ID
 */
export async function insertToggleScreen(pyContent, binPath = null, texturePath = null, meshPath = null, stencilReferenceId = STENCIL_REFERENCE_ID) {
    if (hasToggleScreen(pyContent)) {
        return { success: false, error: 'togglescreen already exists', content: pyContent };
    }

    let assetsCopied = null;
    let finalTexturePath = texturePath || 'assets/togglescreen/screen.dds';
    let finalMeshPath = meshPath || 'assets/togglescreen/screen.scb';

    // Copy screen assets to project if binPath provided
    if (binPath) {
        assetsCopied = await copyToggleScreenAssets(binPath);
        if (assetsCopied.success) {
            finalTexturePath = assetsCopied.texturePath;
            finalMeshPath = assetsCopied.meshPath;
            console.log('[FakeGearSkin] Copied togglescreen assets to:', assetsCopied.targetFolder);
        } else {
            console.warn('[FakeGearSkin] Could not copy togglescreen assets:', assetsCopied.error);
        }
    }

    const toggleScreenContent = getToggleScreenSystem(finalTexturePath, finalMeshPath, stencilReferenceId);

    // Find a good insertion point (before ResourceResolver or at end)
    const lines = pyContent.split('\n');
    let insertIdx = lines.length;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('= ResourceResolver {')) {
            insertIdx = i;
            break;
        }
    }

    lines.splice(insertIdx, 0, toggleScreenContent);
    let updatedContent = lines.join('\n');

    // Add ResourceResolver entry
    updatedContent = addToResourceResolver(updatedContent, [
        { key: 'togglescreen', value: 'togglescreen' }
    ]);

    return {
        success: true,
        content: updatedContent,
        assetsCopied,
        message: assetsCopied?.success
            ? 'Added togglescreen system and copied assets to assets/togglescreen/'
            : 'Added togglescreen system'
    };
}

/**
 * Copy assets to variant folders
 * This copies the original assets to both variant1 and variant2 folders
 * so users can then edit the variant2 folder with their alternate textures
 * 
 * @param {string} binPath - Path to the .bin file (used to find project root)
 * @param {Object} assetMappings - Asset mappings from convertToToggleVariants result
 * @param {string} variant1Folder - Folder for variant1 assets
 * @param {string} variant2Folder - Folder for variant2 assets
 * @returns {Object} Result with copied/failed files
 */
export function copyAssetsToVariantFolders(binPath, assetMappings, variant1Folder = VARIANT1_FOLDER, variant2Folder = VARIANT2_FOLDER) {
    if (!window.require) {
        return { success: false, error: 'Electron environment required' };
    }

    const fs = window.require('fs');
    const path = window.require('path');

    // Find project root (look for data/assets folders)
    let projectRoot = path.dirname(binPath);
    let depth = 0;
    const maxDepth = 5;

    while (depth < maxDepth && projectRoot && projectRoot !== path.dirname(projectRoot)) {
        const hasData = fs.existsSync(path.join(projectRoot, 'data')) || fs.existsSync(path.join(projectRoot, 'DATA'));
        const hasAssets = fs.existsSync(path.join(projectRoot, 'assets')) || fs.existsSync(path.join(projectRoot, 'ASSETS'));

        if (hasData || hasAssets) {
            console.log(`[fakeGearSkinUtils] Found project root: ${projectRoot}`);
            break;
        }

        projectRoot = path.dirname(projectRoot);
        depth++;
    }

    const copiedFiles = [];
    const failedFiles = [];
    const skippedFiles = [];

    // Helper to find the source file
    const findSourceFile = (originalPath) => {
        // Normalize path
        const normalizedPath = originalPath.replace(/\//g, path.sep).replace(/\\/g, path.sep);

        // Try different locations
        const candidates = [
            path.join(projectRoot, normalizedPath),
            path.join(projectRoot, 'assets', normalizedPath.replace(/^assets[\/\\]/i, '')),
            path.join(projectRoot, 'ASSETS', normalizedPath.replace(/^assets[\/\\]/i, '')),
            path.join(path.dirname(binPath), normalizedPath),
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        return null;
    };

    // Copy files to variant folders
    const copyToFolder = (assetList, targetFolder) => {
        for (const asset of assetList) {
            const sourcePath = findSourceFile(asset.original);

            if (!sourcePath) {
                console.warn(`[fakeGearSkinUtils] Source not found: ${asset.original}`);
                failedFiles.push(asset.original);
                continue;
            }

            // Build destination path
            const destPath = path.join(projectRoot, targetFolder, asset.filename);
            const destDir = path.dirname(destPath);

            // Check if already exists
            if (fs.existsSync(destPath)) {
                skippedFiles.push(asset.filename);
                continue;
            }

            try {
                // Create directory if needed
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }

                // Copy file
                fs.copyFileSync(sourcePath, destPath);
                copiedFiles.push({ source: sourcePath, dest: destPath, filename: asset.filename });
                console.log(`[fakeGearSkinUtils] Copied: ${sourcePath} -> ${destPath}`);
            } catch (err) {
                console.error(`[fakeGearSkinUtils] Failed to copy: ${err.message}`);
                failedFiles.push(asset.original);
            }
        }
    };

    // Copy to both variant folders
    if (assetMappings.variant1 && assetMappings.variant1.length > 0) {
        copyToFolder(assetMappings.variant1, variant1Folder);
    }

    if (assetMappings.variant2 && assetMappings.variant2.length > 0) {
        copyToFolder(assetMappings.variant2, variant2Folder);
    }

    return {
        success: failedFiles.length === 0,
        copiedFiles,
        skippedFiles,
        failedFiles,
        variant1Path: path.join(projectRoot, variant1Folder),
        variant2Path: path.join(projectRoot, variant2Folder),
        message: `Copied ${copiedFiles.length} files, skipped ${skippedFiles.length}, failed ${failedFiles.length}`
    };
}

/**
 * Find a valid .anm file path from the loaded .py content
 * Searches for mAnimationFilePath entries and validates they exist
 * @param {string} pyContent - The .py file content
 * @param {string} binPath - Path to the bin file (used to find project root)
 * @returns {string|null} A valid .anm path or null if none found
 */
export function findValidAnmPath(pyContent, binPath) {
    const fs = window.require('fs');
    const path = window.require('path');

    // Find all mAnimationFilePath entries
    const anmPattern = /mAnimationFilePath:\s*string\s*=\s*"([^"]+\.anm)"/gi;
    const matches = [];
    let match;

    while ((match = anmPattern.exec(pyContent)) !== null) {
        matches.push(match[1]);
    }

    if (matches.length === 0) {
        console.log('[FakeGearSkin] No animation paths found in .py content');
        return null;
    }

    // Find project root (walk up to find ASSETS folder)
    let projectRoot = path.dirname(binPath);
    const maxDepth = 10;

    for (let i = 0; i < maxDepth; i++) {
        try {
            const entries = fs.readdirSync(projectRoot);
            const hasAssets = entries.some(e => e.toLowerCase() === 'assets');
            if (hasAssets) break;
        } catch (e) { /* ignore */ }

        const parent = path.dirname(projectRoot);
        if (parent === projectRoot) break;
        projectRoot = parent;
    }

    console.log('[FakeGearSkin] Project root for ANM search:', projectRoot);

    // Try to find an existing .anm file
    for (const anmPath of matches) {
        const resolvedPath = resolveAssetPath(anmPath, projectRoot);
        if (resolvedPath && fs.existsSync(resolvedPath)) {
            console.log('[FakeGearSkin] Found valid .anm:', anmPath);
            return anmPath;
        }
    }

    // If no valid file found, return the first path anyway (user will need to fix it)
    console.warn('[FakeGearSkin] No valid .anm file found, using first path:', matches[0]);
    return matches[0];
}

/**
 * Extract the animationGraphData link from skinAnimationProperties
 * @param {string} pyContent - The .py file content
 * @returns {string|null} The animation graph link path or null
 */
export function extractAnimationGraphLink(pyContent) {
    const match = pyContent.match(/skinAnimationProperties:\s*embed\s*=\s*skinAnimationProperties\s*\{[^}]*animationGraphData:\s*link\s*=\s*"([^"]+)"/);
    if (match) {
        return match[1];
    }
    return null;
}

/**
 * Check if animation toggle already exists in the content
 * @param {string} pyContent - The .py file content
 * @returns {boolean}
 */
export function hasAnimationToggle(pyContent) {
    // Check specifically for our Toggle ConditionBoolClipData with SubmeshVisibilityBoolDriver
    // This is more specific than just checking for LogicDriverBoolParametricUpdater
    const hasToggleClip = pyContent.includes('"Toggle" = ConditionBoolClipData');
    const hasToggleTrack = pyContent.includes('"Toggle" = TrackData');
    const hasToggleMask = pyContent.includes('"Toggle" = MaskData');

    // Need at least the clip data to consider it existing
    return hasToggleClip || (hasToggleTrack && hasToggleMask);
}

/**
 * Generate the animation toggle clip data block
 * @param {string} anmPath - Valid .anm file path to use
 * @param {string[]} submeshes - Submeshes to toggle (e.g., ["Weapon2", "Body2"])
 * @returns {string} The clip data entries to inject
 */
function generateToggleClipData(anmPath, submeshes = ["Weapon2", "Body2"]) {
    const submeshList = submeshes.map(s => `                            "${s}"`).join('\n');

    return `            "Toggle" = ConditionBoolClipData {
                Updater: pointer = LogicDriverBoolParametricUpdater {
                    driver: pointer = SubmeshVisibilityBoolDriver {
                        Submeshes: list[hash] = {
                            "MinimalMesh"
                        }
                        VISIBLE: bool = false
                    }
                }
                mTrueConditionClipName: hash = 0xbe8683f0
                mFalseConditionClipName: hash = 0x8aa48b13
            }
            0xbe8683f0 = ParallelClipData {
                mFlags: u32 = 14
                mClipNameList: list[hash] = {
                    0x43191761
                }
            }
            0x43191761 = AtomicClipData {
                mFlags: u32 = 14
                mTrackDataName: hash = "Toggle"
                mMaskDataName: hash = "Default"
                mEventDataMap: map[hash,pointer] = {
                    "fade" = ParticleEventData {
                        mEffectKey: hash = 0xcef6c126
                        mParticleEventDataPairList: list[embed] = {
                            ParticleEventDataPair {
                                mBoneName: hash = "C_Buffbone_GLB_Layout_Loc"
                            }
                        }
                        mIsLoop: bool = false
                        mIsKillEvent: bool = false
                    }
                    0x38503e10 = SubmeshVisibilityEventData {
                        mShowSubmeshList: list[hash] = {
                            "MinimalMesh"
                        }
                        mHideSubmeshList: list[hash] = {
                        }
                    }
                }
                mAnimationResourceData: embed = AnimationResourceData {
                    mAnimationFilePath: string = "${anmPath}"
                }
            }
            0x8aa48b13 = ParallelClipData {
                mFlags: u32 = 14
                mClipNameList: list[hash] = {
                    0x04acc354
                }
            }
            0x04acc354 = AtomicClipData {
                mFlags: u32 = 14
                mTrackDataName: hash = "Toggle"
                mMaskDataName: hash = "Default"
                mEventDataMap: map[hash,pointer] = {
                    "FadeOut" = ParticleEventData {
                        mEffectKey: hash = 0xe271f27c
                        mParticleEventDataPairList: list[embed] = {
                            ParticleEventDataPair {
                                mBoneName: hash = "C_Buffbone_GLB_Layout_Loc"
                            }
                        }
                        mIsLoop: bool = false
                        mIsKillEvent: bool = false
                    }
                    "Hide_Mesh" = SubmeshVisibilityEventData {
                        mHideSubmeshList: list[hash] = {
                            "MinimalMesh"
                        }
                        mShowSubmeshList: list[hash] = {
                        }
                    }
                }
                mAnimationResourceData: embed = AnimationResourceData {
                    mAnimationFilePath: string = "${anmPath}"
                }
            }`;
}

/**
 * Generate the MaskData entries for Toggle
 * @param {number} boneCount - Number of bones (weights) to generate
 * @returns {string} The mask data entries
 */
function generateToggleMaskData(boneCount = 93) {
    const weights = Array(boneCount).fill('                    0').join('\n');

    return `            "Toggle" = MaskData {
                mWeightList: list[f32] = {
${weights}
                }
            }`;
}

/**
 * Generate the Default MaskData entries
 * @param {number} boneCount - Number of bones (weights) to generate
 * @returns {string} The mask data entries
 */
function generateDefaultMaskData(boneCount = 93) {
    const weights = Array(boneCount).fill('                    0').join('\n');

    return `            "Default" = MaskData {
                mWeightList: list[f32] = {
${weights}
                }
            }`;
}

/**
 * Generate the TrackData entry for Toggle
 * @returns {string} The track data entry
 */
function generateToggleTrackData() {
    return `            "Toggle" = TrackData {
            }`;
}

/**
 * Update existing TrackData priorities to make room for Toggle
 * Toggle needs highest priority (no mPriority = priority 0)
 * All other existing TrackData entries get their priority incremented by 1
 * @param {string} pyContent - The .py file content
 * @returns {string} Updated content with adjusted priorities
 */
function adjustTrackDataPriorities(pyContent) {
    let updated = pyContent;

    // Find all TrackData entries with existing mPriority and increment by 1
    // Match: "SomeName" = TrackData { ... mPriority: u8 = X ... }
    updated = updated.replace(
        /(\"[^\"]+\"\s*=\s*TrackData\s*\{[^}]*mPriority:\s*u8\s*=\s*)(\d+)/g,
        (match, prefix, priority) => {
            const newPriority = parseInt(priority) + 1;
            return `${prefix}${newPriority}`;
        }
    );

    // Find TrackData entries without mPriority and add mPriority: u8 = 1
    // But skip our Toggle entry (which should have no priority)
    // Match empty TrackData blocks that aren't Toggle
    const trackDataPattern = /(\"(?!Toggle\")[^\"]+\"\s*=\s*TrackData\s*\{)(\s*\})/g;
    updated = updated.replace(trackDataPattern, '$1\n                mPriority: u8 = 1\n            }');

    return updated;
}

/**
 * Insert PersistentEffectConditions for togglescreen to show when MinimalMesh is visible
 * This creates the stencil filter effect that controls variant visibility
 * @param {string} pyContent - The .py file content
 * @returns {string} Updated content with PersistentEffectConditions
 */
function insertToggleScreenPersistentEffect(pyContent) {
    // Check if PersistentEffectConditions with togglescreen already exists
    if (pyContent.includes('effectKey: hash = "togglescreen"') ||
        pyContent.includes("effectKey: hash = 'togglescreen'")) {
        console.log('[FakeGearSkin] togglescreen PersistentEffect already exists');
        return pyContent;
    }

    const lines = pyContent.split('\n');

    // Locate SkinCharacterDataProperties block
    let skinStart = -1, skinEnd = -1, depth = 0, inSkin = false;
    for (let i = 0; i < lines.length; i++) {
        const t = (lines[i] || '').trim();
        if (t.includes('= SkinCharacterDataProperties {')) {
            inSkin = true;
            depth = 1;
            skinStart = i;
            continue;
        }
        if (!inSkin) continue;
        const opens = (lines[i].match(/\{/g) || []).length;
        const closes = (lines[i].match(/\}/g) || []).length;
        depth += opens - closes;
        if (depth === 0) { skinEnd = i; break; }
    }

    if (skinStart === -1 || skinEnd === -1) {
        console.warn('[FakeGearSkin] SkinCharacterDataProperties not found for PersistentEffect');
        return pyContent;
    }

    // Find existing PersistentEffectConditions section
    let peStart = -1, peEnd = -1, peDepth = 0, inPe = false;
    for (let i = skinStart; i <= skinEnd; i++) {
        const t = (lines[i] || '').trim();
        if (t.startsWith('PersistentEffectConditions:') && t.includes('list2[pointer] = {')) {
            inPe = true;
            peStart = i;
            peDepth = 1;
            continue;
        }
        if (!inPe) continue;
        const opens = (lines[i].match(/\{/g) || []).length;
        const closes = (lines[i].match(/\}/g) || []).length;
        peDepth += opens - closes;
        if (peDepth === 0) { peEnd = i; break; }
    }

    // Build the PersistentEffectConditionData block with AllTrueMaterialDriver
    const indent0 = '        ';
    const indent1 = '            ';
    const indent2 = '                ';
    const indent3 = '                    ';
    const indent4 = '                        ';

    const persistentBlock = `${indent0}PersistentEffectConditionData {
${indent1}OwnerCondition: pointer = AllTrueMaterialDriver {
${indent2}mDrivers: list[pointer] = {
${indent3}SubmeshVisibilityBoolDriver {
${indent4}Submeshes: list[hash] = {
${indent4}    "MinimalMesh"
${indent4}}
${indent4}VISIBLE: bool = true
${indent3}}
${indent2}}
${indent1}}
${indent1}0x09e5cdf8: bool = true
${indent1}PersistentVfxs: list2[embed] = {
${indent2}PersistentVfxData {
${indent3}effectKey: hash = "togglescreen"
${indent3}boneName: string = "BuffBone_Glb_Ground_Loc"
${indent3}0xd543b3fe: bool = true
${indent3}AttachToCamera: bool = true
${indent2}}
${indent1}}
${indent0}}`;

    const out = [...lines];

    if (peStart !== -1 && peEnd !== -1) {
        // Insert into existing PersistentEffectConditions before closing brace
        out.splice(peEnd, 0, persistentBlock);
    } else {
        // Create new PersistentEffectConditions section
        const newSection = [
            `${indent0}PersistentEffectConditions: list2[pointer] = {`,
            persistentBlock,
            `${indent0}}`
        ];
        out.splice(skinEnd, 0, ...newSection);
    }

    return out.join('\n');
}

/**
 * Insert animation toggle into the loaded .py content
 * This adds the Toggle clip data, mask data, and track data to enable Ctrl+5 animation toggle
 * @param {string} pyContent - The .py file content
 * @param {string} binPath - Path to the bin file
 * @param {string[]} submeshes - Submeshes to toggle visibility
 * @returns {Object} Result with success, content, message
 */
export function insertAnimationToggle(pyContent, binPath, submeshes = ["Weapon2", "Body2"]) {
    try {
        // Check if already exists
        if (hasAnimationToggle(pyContent)) {
            return {
                success: false,
                error: 'Animation toggle already exists',
                content: pyContent
            };
        }

        // Find a valid .anm path
        const anmPath = findValidAnmPath(pyContent, binPath);
        if (!anmPath) {
            return {
                success: false,
                error: 'No animation files found in mod. Cannot add animation toggle.',
                content: pyContent
            };
        }

        let updatedContent = pyContent;

        // Get bone count from SKL file
        let boneCount = 93; // Default fallback
        try {
            const { skeleton } = extractMeshPaths(pyContent);
            if (skeleton) {
                const fs = window.require('fs');
                const path = window.require('path');

                // Find project root
                let projectRoot = path.dirname(binPath);
                for (let i = 0; i < 10; i++) {
                    try {
                        const entries = fs.readdirSync(projectRoot);
                        const hasAssets = entries.some(e => e.toLowerCase() === 'assets');
                        if (hasAssets) break;
                    } catch (e) { /* ignore */ }
                    const parent = path.dirname(projectRoot);
                    if (parent === projectRoot) break;
                    projectRoot = parent;
                }

                const sklPath = resolveAssetPath(skeleton, projectRoot);
                if (sklPath && fs.existsSync(sklPath)) {
                    const skl = new SKL();
                    skl.read(sklPath);
                    boneCount = skl.joints.length;
                    console.log('[FakeGearSkin] Read bone count from SKL:', boneCount);
                }
            }
        } catch (e) {
            console.warn('[FakeGearSkin] Could not read bone count from SKL, using default:', e.message);
        }

        // Find the mClipDataMap and inject Toggle clip data
        const clipDataMapMatch = updatedContent.match(/mClipDataMap:\s*map\[hash,pointer\]\s*=\s*\{/);
        if (clipDataMapMatch) {
            const insertPos = clipDataMapMatch.index + clipDataMapMatch[0].length;
            const toggleClipData = '\n' + generateToggleClipData(anmPath, submeshes);
            updatedContent = updatedContent.slice(0, insertPos) + toggleClipData + updatedContent.slice(insertPos);
            console.log('[FakeGearSkin] Injected Toggle clip data');
        } else {
            console.warn('[FakeGearSkin] mClipDataMap not found');
        }

        // Handle MaskData injection
        const maskDataMapMatch = updatedContent.match(/mMaskDataMap:\s*map\[hash,embed\]\s*=\s*\{/);
        const hasDefaultMask = updatedContent.includes('"Default" = MaskData');

        if (maskDataMapMatch) {
            const insertPos = maskDataMapMatch.index + maskDataMapMatch[0].length;

            if (hasDefaultMask) {
                // Default exists, only add Toggle
                const toggleMaskData = '\n' + generateToggleMaskData(boneCount);
                updatedContent = updatedContent.slice(0, insertPos) + toggleMaskData + updatedContent.slice(insertPos);
                console.log('[FakeGearSkin] Injected Toggle mask data with', boneCount, 'bones');
            } else {
                // Default doesn't exist, add both Default and Toggle
                const defaultMaskData = generateDefaultMaskData(boneCount);
                const toggleMaskData = generateToggleMaskData(boneCount);
                const combinedMaskData = '\n' + defaultMaskData + '\n' + toggleMaskData;
                updatedContent = updatedContent.slice(0, insertPos) + combinedMaskData + updatedContent.slice(insertPos);
                console.log('[FakeGearSkin] Injected Default and Toggle mask data with', boneCount, 'bones');
            }
        } else {
            // No mMaskDataMap exists, need to create the whole block
            // Find a good insertion point (after mClipDataMap closing brace)
            console.warn('[FakeGearSkin] mMaskDataMap not found - creating new block');
            const defaultMaskData = generateDefaultMaskData(boneCount);
            const toggleMaskData = generateToggleMaskData(boneCount);
            const fullMaskDataMap = `
        mMaskDataMap: map[hash,embed] = {
${defaultMaskData}
${toggleMaskData}
        }`;

            // Try to insert before mTrackDataMap
            const trackDataMapPos = updatedContent.indexOf('mTrackDataMap:');
            if (trackDataMapPos !== -1) {
                updatedContent = updatedContent.slice(0, trackDataMapPos) + fullMaskDataMap + '\n        ' + updatedContent.slice(trackDataMapPos);
                console.log('[FakeGearSkin] Created new mMaskDataMap block');
            }
        }

        // Find the mTrackDataMap and inject Toggle track data
        const trackDataMapMatch = updatedContent.match(/mTrackDataMap:\s*map\[hash,embed\]\s*=\s*\{/);
        if (trackDataMapMatch) {
            const insertPos = trackDataMapMatch.index + trackDataMapMatch[0].length;
            const toggleTrackData = '\n' + generateToggleTrackData();
            updatedContent = updatedContent.slice(0, insertPos) + toggleTrackData + updatedContent.slice(insertPos);
            console.log('[FakeGearSkin] Injected Toggle track data');
        } else {
            console.warn('[FakeGearSkin] mTrackDataMap not found');
        }

        // Adjust priorities so Toggle has highest priority
        updatedContent = adjustTrackDataPriorities(updatedContent);

        // Add PersistentEffectConditions for togglescreen to show when MinimalMesh is visible
        // This uses AllTrueMaterialDriver with SubmeshVisibilityBoolDriver
        updatedContent = insertToggleScreenPersistentEffect(updatedContent);
        console.log('[FakeGearSkin] Added PersistentEffectConditions for togglescreen');

        return {
            success: true,
            content: updatedContent,
            anmPath: anmPath,
            message: `Added animation toggle using ${anmPath.split('/').pop()}`
        };

    } catch (error) {
        console.error('[FakeGearSkin] Error inserting animation toggle:', error);
        return {
            success: false,
            error: error.message,
            content: pyContent
        };
    }
}

/**
 * ============================================================================
 * INLINE VARIANT EMITTERS FEATURE
 * ============================================================================
 * 
 * Duplicates emitters within the SAME VFX system (not as child particles).
 * - Original emitters get "_Variant1" suffix in emitterName
 * - Duplicated emitters get "_Variant2" suffix in emitterName
 * - Variant1: stencilMode 3 (visible when toggle OFF)
 * - Variant2: stencilMode 2 (visible when toggle ON)
 * - Both get StencilReferenceId and renderPhaseOverride: u8 = 4
 * - Assets are repathed to variant1/variant2 folders
 */

/**
 * Extract all VfxEmitterDefinitionData blocks from a VFX system content
 * @param {string} systemContent - Content of a VfxSystemDefinitionData block
 * @returns {Array<{content: string, startIdx: number, endIdx: number, emitterName: string}>}
 */
function extractEmitterBlocks(systemContent) {
    const emitters = [];
    const lines = systemContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match VfxEmitterDefinitionData start
        if (/VfxEmitterDefinitionData\s*\{/i.test(line)) {
            const startLine = i;
            const endLine = findBlockEnd(lines, i);
            const emitterContent = lines.slice(startLine, endLine + 1).join('\n');

            // Extract emitterName if it exists
            const nameMatch = emitterContent.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
            const emitterName = nameMatch ? nameMatch[1] : `Emitter_${emitters.length}`;

            emitters.push({
                content: emitterContent,
                startLine,
                endLine,
                emitterName
            });

            i = endLine; // Skip to end of this emitter
        }
    }

    return emitters;
}

/**
 * Add stencil properties to an emitter content (for inline variants)
 * SKIPS emitters that already have stencil properties (to preserve champion mechanics)
 * @param {string} emitterContent - Content of VfxEmitterDefinitionData block
 * @param {number} stencilMode - 2 or 3
 * @param {string} stencilReferenceId - The stencil reference ID
 * @returns {{content: string, skipped: boolean}} Modified emitter content and whether it was skipped
 */
function addStencilToEmitter(emitterContent, stencilMode, stencilReferenceId = STENCIL_REFERENCE_ID) {
    // Check if stencil properties already exist
    const hasStencilMode = /stencilMode:\s*u8\s*=/i.test(emitterContent);
    const hasStencilRef = /StencilReferenceId:\s*hash\s*=/i.test(emitterContent);

    // Skip emitters that already have ANY stencil property (preserve champion mechanics)
    if (hasStencilMode || hasStencilRef) {
        console.log('[FakeGearSkin] Skipping emitter with existing stencil properties (preserving champion mechanics)');
        return { content: emitterContent, skipped: true };
    }

    const lines = emitterContent.split('\n');
    const outputLines = [];
    const formattedId = formatHashValue(stencilReferenceId);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        outputLines.push(line);

        // After the opening brace of VfxEmitterDefinitionData, insert properties
        if (i === 0 && /VfxEmitterDefinitionData\s*\{/i.test(line)) {
            const indentMatch = line.match(/^(\s*)/);
            const baseIndent = indentMatch ? indentMatch[1] : '';
            const propIndent = baseIndent + '    ';

            outputLines.push(`${propIndent}stencilMode: u8 = ${stencilMode}`);
            outputLines.push(`${propIndent}StencilReferenceId: hash = ${formattedId}`);
            outputLines.push(`${propIndent}renderPhaseOverride: u8 = 4`);
        }
    }

    return { content: outputLines.join('\n'), skipped: false };
}

/**
 * Add a property to an emitter block
 * @param {string} emitterContent - Content of VfxEmitterDefinitionData block
 * @param {string} propertyLine - The property line to add (e.g., "disableBackfaceCull: bool = true")
 * @returns {string} Modified emitter content
 */
function addPropertyToEmitter(emitterContent, propertyLine) {
    // Extract property name to check if it already exists
    // Match property name (e.g., "disableBackfaceCull" from "disableBackfaceCull: bool = true")
    const propertyNameMatch = propertyLine.trim().match(/^(\w+)\s*:/);
    const propertyName = propertyNameMatch ? propertyNameMatch[1] : null;

    // Check if property already exists in the emitter content (case-insensitive)
    if (propertyName) {
        // Check for property with various formats: "propertyName:", "propertyName :", etc.
        // Use case-insensitive matching and allow for whitespace variations
        const propertyRegex = new RegExp(`^\\s*${propertyName}\\s*:`, 'i');
        const hasProperty = emitterContent.split('\n').some(line => propertyRegex.test(line));
        if (hasProperty) {
            console.log(`[fakeGearSkinUtils] Property ${propertyName} already exists in emitter, skipping`);
            return emitterContent; // Return unchanged
        }
    }

    const lines = emitterContent.split('\n');
    const outputLines = [];

    // Find the opening brace and add property after it
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        outputLines.push(line);

        // After the opening brace of VfxEmitterDefinitionData, insert property
        if (i === 0 && /VfxEmitterDefinitionData\s*\{/i.test(line)) {
            const indentMatch = line.match(/^(\s*)/);
            const baseIndent = indentMatch ? indentMatch[1] : '';
            const propIndent = baseIndent + '    ';

            outputLines.push(`${propIndent}${propertyLine}`);
        }
    }

    return outputLines.join('\n');
}

/**
 * Add a property to all emitters in selected systems
 * @param {string} pyContent - The .py file content
 * @param {string[]} selectedSystemKeys - Keys of systems to modify
 * @param {string} propertyLine - The property line to add (e.g., "disableBackfaceCull: bool = true")
 * @returns {Object} Result with updated content
 */
export function addPropertyToAllEmitters(pyContent, selectedSystemKeys, propertyLine) {
    if (!pyContent || !propertyLine || !propertyLine.trim()) {
        return {
            success: false,
            error: 'No content, property, or systems provided',
            content: pyContent
        };
    }

    const systems = extractVfxSystems(pyContent);
    const systemMap = new Map(systems.map(s => [s.key, s]));

    let updatedContent = pyContent;
    let modifiedCount = 0;
    let emitterCount = 0;

    for (const systemKey of selectedSystemKeys) {
        const system = systemMap.get(systemKey);
        if (!system) {
            console.warn(`[fakeGearSkinUtils] System not found: ${systemKey}`);
            continue;
        }

        // Extract all emitters from this system
        const emitters = extractEmitterBlocks(system.rawContent);

        if (emitters.length === 0) {
            console.warn(`[fakeGearSkinUtils] No emitters found in system: ${systemKey}`);
            continue;
        }

        // Modify each emitter
        const modifiedEmitters = emitters.map(emitter => {
            emitterCount++;
            return addPropertyToEmitter(emitter.content, propertyLine);
        });

        // Rebuild the emitter list
        const emitterListMatch = system.rawContent.match(/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{/i);

        if (emitterListMatch) {
            const lines = system.rawContent.split('\n');
            const listStartLine = lines.findIndex((line, idx) => {
                const before = lines.slice(0, idx).join('\n');
                return /complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{/i.test(before);
            });

            if (listStartLine !== -1) {
                // Find the end of the emitter list
                let braceCount = 0;
                let listEndLine = listStartLine;
                for (let i = listStartLine; i < lines.length; i++) {
                    const line = lines[i];
                    braceCount += (line.match(/\{/g) || []).length;
                    braceCount -= (line.match(/\}/g) || []).length;
                    if (braceCount === 0 && i > listStartLine) {
                        listEndLine = i;
                        break;
                    }
                }

                const baseIndent = lines[listStartLine].match(/^(\s*)/)?.[1] || '';
                const emitterIndent = baseIndent + '    ';

                // Re-indent the modified emitters
                const indentedEmitters = modifiedEmitters.map(e => {
                    const emitterLines = e.split('\n');
                    return emitterLines.map((line, idx) => {
                        if (idx === 0) {
                            return emitterIndent + line.trim();
                        }
                        return line;
                    }).join('\n');
                });

                const newEmitterListContent = '\n' + indentedEmitters.join('\n') + '\n' + baseIndent;

                // Reconstruct the system
                const beforeList = lines.slice(0, listStartLine + 1).join('\n');
                const afterList = lines.slice(listEndLine).join('\n');
                const newSystemContent = beforeList + newEmitterListContent + afterList;

                // Replace in the full content
                updatedContent = updatedContent.replace(system.rawContent, newSystemContent);
                modifiedCount++;
            }
        }
    }

    return {
        success: true,
        content: updatedContent,
        message: `Added property to ${emitterCount} emitters in ${modifiedCount} systems`,
        emitterCount,
        systemCount: modifiedCount
    };
}

/**
 * Rename emitterName in an emitter block
 * @param {string} emitterContent - Content of VfxEmitterDefinitionData block
 * @param {string} newSuffix - Suffix to add (e.g., "_Variant1")
 * @returns {{content: string, newName: string}}
 */
function renameEmitter(emitterContent, newSuffix) {
    const nameMatch = emitterContent.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);

    if (nameMatch) {
        const originalName = nameMatch[1];
        const newName = `${originalName}${newSuffix}`;
        const newContent = emitterContent.replace(
            /emitterName:\s*string\s*=\s*"[^"]+"/i,
            `emitterName: string = "${newName}"`
        );
        return { content: newContent, newName };
    } else {
        // No emitterName exists, add one
        const lines = emitterContent.split('\n');
        const outputLines = [];
        const newName = `Emitter${newSuffix}`;

        for (let i = 0; i < lines.length; i++) {
            outputLines.push(lines[i]);
            if (i === 0 && /VfxEmitterDefinitionData\s*\{/i.test(lines[i])) {
                const indentMatch = lines[i].match(/^(\s*)/);
                const propIndent = (indentMatch ? indentMatch[1] : '') + '    ';
                outputLines.push(`${propIndent}emitterName: string = "${newName}"`);
            }
        }

        return { content: outputLines.join('\n'), newName };
    }
}

/**
 * Convert selected VFX systems to inline variant emitters
 * Duplicates emitters within the SAME system with _Variant1 and _Variant2 suffixes
 * 
 * @param {string} pyContent - The .py file content
 * @param {string[]} selectedSystemKeys - Keys of systems to convert
 * @param {string} stencilReferenceId - Custom stencil reference ID
 * @param {string} variant1Folder - Folder path for variant1 assets
 * @param {string} variant2Folder - Folder path for variant2 assets
 * @returns {Object} Result with updated content
 */
export function convertToInlineVariants(pyContent, selectedSystemKeys, stencilReferenceId = STENCIL_REFERENCE_ID, skipGroundLayer = false, variant1Folder = VARIANT1_FOLDER, variant2Folder = VARIANT2_FOLDER) {
    if (!pyContent || !selectedSystemKeys || selectedSystemKeys.length === 0) {
        return { success: false, error: 'No systems selected', content: pyContent };
    }

    const systems = extractVfxSystems(pyContent);
    const systemMap = new Map(systems.map(s => [s.key, s]));

    let updatedContent = pyContent;
    const processedSystems = [];
    const allAssetMappings = {
        variant1: [],
        variant2: []
    };
    let skippedGroundLayerCount = 0;

    for (const systemKey of selectedSystemKeys) {
        const system = systemMap.get(systemKey);
        if (!system) {
            console.warn(`[fakeGearSkinUtils] System not found: ${systemKey}`);
            continue;
        }

        console.log(`[fakeGearSkinUtils] Converting system to inline variants: ${systemKey}${skipGroundLayer ? ' (skipping ground layer)' : ''}`);

        // Extract all emitters from this system
        const emitters = extractEmitterBlocks(system.rawContent);

        if (emitters.length === 0) {
            console.warn(`[fakeGearSkinUtils] No emitters found in system: ${systemKey}`);
            continue;
        }

        // Check if variant1 already exists (but not variant2)
        const variant1Emitters = emitters.filter(e => {
            const name = e.emitterName.toLowerCase();
            return (name.includes('_variant1') && !name.includes('_variant2'));
        });
        const variant2Emitters = emitters.filter(e => {
            const name = e.emitterName.toLowerCase();
            return name.includes('_variant2');
        });
        const hasVariant1 = variant1Emitters.length > 0;
        const hasVariant2 = variant2Emitters.length > 0;

        console.log(`[fakeGearSkinUtils] Found ${emitters.length} emitters. Has variant1: ${hasVariant1}, Has variant2: ${hasVariant2}`);

        // If both variants already exist, skip this system
        if (hasVariant1 && hasVariant2) {
            console.log(`[fakeGearSkinUtils] System ${systemKey} already has both variants, skipping`);
            continue;
        }

        // Build the new system content with both variant emitters
        let newSystemContent = system.rawContent;
        const finalVariant1Emitters = [];
        const finalVariant2Emitters = [];
        const groundLayerEmitters = []; // Ground layer emitters kept unchanged

        if (hasVariant1 && !hasVariant2) {
            // System already has variant1 but not variant2 - copy variant1 to variant2
            console.log(`[fakeGearSkinUtils] System already has variant1, copying to variant2`);

            // Keep all existing emitters
            for (const emitter of emitters) {
                const emitterNameLower = emitter.emitterName.toLowerCase();

                // If it's a variant1 emitter, keep it as-is and create variant2 from it
                if (emitterNameLower.includes('_variant1') && !emitterNameLower.includes('_variant2')) {
                    // Keep variant1 emitter unchanged
                    finalVariant1Emitters.push(emitter.content);

                    // Create variant2 from variant1 (remove _Variant1, add _Variant2)
                    let variant2Content = emitter.content;

                    // Remove _Variant1 suffix from name to get base name
                    // Match pattern: "Something_Variant1" -> "Something"
                    const nameMatch = emitter.emitterName.match(/^(.+?)(?:_Variant1|_variant1)$/i);
                    const baseName = nameMatch ? nameMatch[1] : emitter.emitterName.replace(/_Variant1$/i, '').replace(/_variant1$/i, '');

                    console.log(`[fakeGearSkinUtils] Converting ${emitter.emitterName} -> ${baseName}_Variant2`);

                    // Replace emitterName: remove _Variant1, add _Variant2
                    variant2Content = variant2Content.replace(
                        /emitterName:\s*string\s*=\s*"[^"]+"/i,
                        `emitterName: string = "${baseName}_Variant2"`
                    );

                    // Repath assets from variant1 folder to variant2 folder
                    // Replace variant1 folder paths with variant2 folder paths
                    const escapedVariant1Folder = variant1Folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    variant2Content = variant2Content.replace(
                        new RegExp(escapedVariant1Folder, 'g'),
                        variant2Folder
                    );

                    // Extract and map assets
                    const variant2Assets = extractAssetPaths(variant2Content);
                    variant2Assets.forEach(path => {
                        if (path.includes(variant2Folder)) {
                            allAssetMappings.variant2.push({
                                original: path.replace(variant2Folder, variant1Folder),
                                repathed: path,
                                filename: path.split('/').pop() || path.split('\\').pop() || path
                            });
                        }
                    });

                    // Check if variant1 emitter has StencilReferenceId and if it matches togglescreen
                    const stencilRefMatch = emitter.content.match(/StencilReferenceId:\s*hash\s*=\s*(?:(?:"([^"]+)")|(0x[0-9a-fA-F]+))/i);
                    const variant1StencilRefId = stencilRefMatch ? (stencilRefMatch[1] || stencilRefMatch[2]) : null;

                    // Get togglescreen's StencilReferenceId
                    const toggleScreenStencilRefId = extractStencilIdFromToggleScreen(pyContent);
                    const formattedToggleScreenId = toggleScreenStencilRefId ? formatHashValue(toggleScreenStencilRefId) : null;
                    const formattedVariant1Id = variant1StencilRefId ? formatHashValue(variant1StencilRefId) : null;

                    // Only modify if variant1 has StencilReferenceId AND it matches togglescreen's
                    if (variant1StencilRefId && formattedVariant1Id === formattedToggleScreenId) {
                        // StencilReferenceId matches togglescreen - we added it, so we can modify it for variant2
                        // Update stencil mode from 3 (variant1) to 2 (variant2)
                        variant2Content = variant2Content.replace(
                            /stencilMode:\s*u8\s*=\s*3/,
                            'stencilMode: u8 = 2'
                        );

                        // Ensure stencil properties are set correctly for variant2
                        const hasStencil = /stencilMode:\s*u8\s*=/i.test(variant2Content);
                        if (!hasStencil) {
                            const stencil2 = addStencilToEmitter(variant2Content, STENCIL_MODE_VISIBLE_WHEN_ON, stencilReferenceId);
                            variant2Content = stencil2.content;
                        } else {
                            // Update StencilReferenceId if needed
                            const formattedId = formatHashValue(stencilReferenceId);
                            variant2Content = variant2Content.replace(
                                /StencilReferenceId:\s*hash\s*=\s*[^\n]+/,
                                `StencilReferenceId: hash = ${formattedId}`
                            );
                        }
                    } else {
                        // No StencilReferenceId or different StencilReferenceId (champion mechanics)
                        // Copy emitter exactly as-is, don't modify anything
                        console.log(`[fakeGearSkinUtils] Preserving emitter as-is (no matching StencilReferenceId) for ${emitter.emitterName} -> ${baseName}_Variant2`);
                        // variant2Content is already a copy of variant1, so just use it without modifications
                    }

                    finalVariant2Emitters.push(variant2Content);
                } else if (!emitterNameLower.includes('_variant2')) {
                    // Keep original emitters that aren't variants (non-variant emitters)
                    finalVariant1Emitters.push(emitter.content);
                }
                // Skip variant2 emitters if they already exist (shouldn't happen in this branch)
            }
        } else {
            // No variant1 exists - create both from originals (original behavior)
            console.log(`[fakeGearSkinUtils] No variant1 found, creating both from originals`);

            // Filter out any existing variant2 emitters
            let originalEmitters = emitters.filter(e =>
                !e.emitterName.includes('_Variant1') &&
                !e.emitterName.includes('_variant1') &&
                !e.emitterName.includes('_Variant2') &&
                !e.emitterName.includes('_variant2')
            );

            // Separate ground layer emitters if skipGroundLayer is enabled
            let emittersToProcess = originalEmitters;

            if (skipGroundLayer) {
                emittersToProcess = [];
                for (const e of originalEmitters) {
                    const hasGroundLayer = /isGroundLayer:\s*(?:bool|flag)\s*=\s*true/i.test(e.content);
                    if (hasGroundLayer) {
                        console.log(`[fakeGearSkinUtils] Keeping ground layer emitter unchanged: ${e.emitterName}`);
                        groundLayerEmitters.push(e.content); // Keep original, no modifications
                        skippedGroundLayerCount++;
                    } else {
                        emittersToProcess.push(e);
                    }
                }
                console.log(`[fakeGearSkinUtils] Ground layer emitters kept unchanged: ${groundLayerEmitters.length}, emitters to process: ${emittersToProcess.length}`);
            }

            for (const emitter of emittersToProcess) {
                // Create Variant1 emitter (original with _Variant1 suffix)
                let variant1Content = emitter.content;

                // Repath assets to variant1 folder
                const repath1 = repathAssetsToVariant(variant1Content, variant1Folder);
                variant1Content = repath1.content;
                allAssetMappings.variant1.push(...repath1.assetMappings);

                // Rename emitter
                const rename1 = renameEmitter(variant1Content, '_Variant1');
                variant1Content = rename1.content;

                // Add stencil properties (mode 3 = blocked when ON)
                const stencil1 = addStencilToEmitter(variant1Content, STENCIL_MODE_BLOCKED_WHEN_ON, stencilReferenceId);
                variant1Content = stencil1.content;

                finalVariant1Emitters.push(variant1Content);

                // Create Variant2 emitter (duplicate with _Variant2 suffix)
                let variant2Content = emitter.content;

                // Repath assets to variant2 folder
                const repath2 = repathAssetsToVariant(variant2Content, variant2Folder);
                variant2Content = repath2.content;
                allAssetMappings.variant2.push(...repath2.assetMappings);

                // Rename emitter
                const rename2 = renameEmitter(variant2Content, '_Variant2');
                variant2Content = rename2.content;

                // Add stencil properties (mode 2 = visible when ON)
                const stencil2 = addStencilToEmitter(variant2Content, STENCIL_MODE_VISIBLE_WHEN_ON, stencilReferenceId);
                variant2Content = stencil2.content;

                finalVariant2Emitters.push(variant2Content);
            }
        }

        // Combine all emitters: ground layer (unchanged) + variant1 + variant2
        const allEmitters = [...groundLayerEmitters, ...finalVariant1Emitters, ...finalVariant2Emitters];

        // Find the complexEmitterDefinitionData list in the system and replace its contents
        const emitterListMatch = newSystemContent.match(/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{/i);

        if (emitterListMatch) {
            // Find the start and end of the emitter list
            const listStartIdx = emitterListMatch.index + emitterListMatch[0].length;
            const lines = newSystemContent.split('\n');
            let listStartLine = 0;
            let charCount = 0;

            for (let i = 0; i < lines.length; i++) {
                if (charCount + lines[i].length >= emitterListMatch.index) {
                    listStartLine = i;
                    break;
                }
                charCount += lines[i].length + 1; // +1 for newline
            }

            // Find the closing brace of the list
            const listEndLine = findBlockEnd(lines, listStartLine);

            // Get the indent level from the original list
            const indentMatch = lines[listStartLine].match(/^(\s*)/);
            const baseIndent = indentMatch ? indentMatch[1] : '        ';
            const emitterIndent = baseIndent + '    ';

            // Rebuild the emitter list with proper indentation
            const indentedEmitters = allEmitters.map(e => {
                // Re-indent the emitter content
                const emitterLines = e.split('\n');
                return emitterLines.map((line, idx) => {
                    if (idx === 0) {
                        return emitterIndent + line.trim();
                    }
                    // Preserve relative indentation
                    const trimmed = line.trimStart();
                    const originalIndent = line.length - trimmed.length;
                    const relativeIndent = Math.max(0, originalIndent - 12); // Adjust based on original
                    return emitterIndent + '    '.repeat(Math.floor(relativeIndent / 4)) + trimmed;
                }).join('\n');
            });

            // Create the new emitter list content
            const newEmitterListContent = '\n' + indentedEmitters.join('\n') + '\n' + baseIndent;

            // Reconstruct the system
            const beforeList = lines.slice(0, listStartLine + 1).join('\n');
            const afterList = lines.slice(listEndLine).join('\n');

            // The beforeList already contains "complexEmitterDefinitionData: list[pointer] = {"
            // So we just append the emitters and the closing part
            newSystemContent = beforeList + newEmitterListContent + afterList;
        }

        // Replace the original system in the content
        updatedContent = updatedContent.replace(system.rawContent, newSystemContent);

        processedSystems.push({
            systemKey,
            emitterCount: emitters.length,
            variant1Count: finalVariant1Emitters.length,
            variant2Count: finalVariant2Emitters.length
        });
    }

    return {
        success: true,
        content: updatedContent,
        processedSystems,
        assetMappings: allAssetMappings,
        variant1Folder,
        variant2Folder,
        skippedGroundLayerCount,
        message: skippedGroundLayerCount > 0
            ? `Duplicated emitters in ${processedSystems.length} system(s), kept ${skippedGroundLayerCount} ground layer emitter(s) unchanged. Assets repathed to ${variant1Folder} and ${variant2Folder}.`
            : `Duplicated emitters in ${processedSystems.length} system(s) as inline variants. Assets repathed to ${variant1Folder} and ${variant2Folder}.`
    };
}

/**
 * Check if a system has inline variant emitters (by checking emitter names for _Variant1/_Variant2 suffixes)
 * @param {string} systemContent - Content of the VFX system
 * @returns {boolean}
 */
export function hasInlineVariants(systemContent) {
    if (!systemContent) return false;

    // Check if any emitter has _Variant1 or _Variant2 in its name
    const hasVariant1 = /emitterName:\s*string\s*=\s*"[^"]*_Variant1"/i.test(systemContent);
    const hasVariant2 = /emitterName:\s*string\s*=\s*"[^"]*_Variant2"/i.test(systemContent);

    return hasVariant1 && hasVariant2;
}

/**
 * Check if a system has variant2 (either as child particle or inline variant)
 * @param {string} pyContent - The .py file content
 * @param {string} systemKey - The system key to check
 * @param {string} systemContent - Optional system content (for performance)
 * @returns {boolean}
 */
export function hasVariant2(pyContent, systemKey, systemContent = null) {
    if (!pyContent || !systemKey) return false;

    // If content provided, use it directly (fast path)
    if (systemContent) {
        // Check for inline variant2 emitters
        const hasInlineVariant2 = /emitterName:\s*string\s*=\s*"[^"]*_Variant2"/i.test(systemContent);
        if (hasInlineVariant2) return true;

        // Check if spawner has variant2 child particle
        const isSpawner = checkSpawnerSignature(systemContent);
        if (isSpawner) {
            const hasVariant2Child = /emitterName:\s*string\s*=\s*"variant2"/i.test(systemContent);
            if (hasVariant2Child) return true;
        }

        // If we have systemContent and didn't find variant2, we can return false early
        // Only need to check for child variant2 system if we don't have the full context
        // For performance, we'll skip the expensive extractVfxSystems call if systemContent is provided
        // The caller should pre-compute this if needed
        return false;
    }

    // Only parse if systemContent not provided (fallback, but should be avoided)
    const systems = extractVfxSystems(pyContent);
    const variant2Key = `${systemKey}_child_variant2`;
    const hasChildVariant2 = systems.some(s => s.key === variant2Key || (s.key.includes('_child_variant2') && s.key.includes(systemKey)));

    return hasChildVariant2;
}

/**
 * Delete variant 2 from a specific VFX system
 * Removes variant2 child particles or inline variant2 emitters for the given system
 * @param {string} pyContent - The .py file content
 * @param {string} systemKey - The system key to delete variant2 from
 * @returns {Object} Result with updated content and deletion info
 */
/**
 * Remove renderPhaseOverride from all emitters in a specific VFX system
 * @param {string} pyContent - The .py file content
 * @param {string} systemKey - The key of the system to modify
 * @returns {{success: boolean, content: string, message?: string, error?: string}}
 */
export function removeRenderPhaseOverrideFromSystem(pyContent, systemKey) {
    if (!pyContent || !systemKey) {
        return { success: false, error: 'No content or system key provided', content: pyContent };
    }

    // Find the target system
    const systems = extractVfxSystems(pyContent);
    const system = systems.find(s => s.key === systemKey);

    if (!system) {
        return { success: false, error: `System not found: ${systemKey}`, content: pyContent };
    }

    const systemContent = system.rawContent;
    const lines = systemContent.split('\n');
    const outputLines = [];
    let removedCount = 0;

    // Remove renderPhaseOverride lines from all emitters in this system
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip lines that contain renderPhaseOverride (case-insensitive)
        if (/renderPhaseOverride:\s*u8\s*=\s*\d+/i.test(line)) {
            removedCount++;
            continue; // Skip this line
        }

        outputLines.push(line);
    }

    const newSystemContent = outputLines.join('\n');
    const updatedContent = pyContent.replace(systemContent, newSystemContent);

    return {
        success: true,
        content: updatedContent,
        message: `Removed ${removedCount} renderPhaseOverride property${removedCount !== 1 ? 'ies' : ''} from ${systemKey}`
    };
}

export function deleteVariant2FromSystem(pyContent, systemKey, customStencilId = null) {
    if (!pyContent || !systemKey) {
        return { success: false, error: 'No content or system key provided', content: pyContent };
    }

    // Try to auto-detect stencil ID from togglescreen if not provided
    let stencilIdToRemove = customStencilId;
    if (!stencilIdToRemove) {
        stencilIdToRemove = extractStencilIdFromToggleScreen(pyContent);
    }
    console.log(`[FakeGearSkin] Stencil ID to remove: ${stencilIdToRemove || 'none (will remove all)'}`);

    let updatedContent = pyContent;
    const deletedSystems = [];
    const deletedEmitters = [];
    const renamedEmitters = [];
    const cleanedEmitters = [];
    const deletedResolverEntries = [];

    // Find the target system
    const systems = extractVfxSystems(pyContent);
    const system = systems.find(s => s.key === systemKey);

    if (!system) {
        return { success: false, error: `System not found: ${systemKey}`, content: pyContent };
    }

    const systemContent = system.rawContent;

    // Check if this is a spawner system (has child particles)
    const isSpawner = checkSpawnerSignature(systemContent);

    if (isSpawner) {
        // This is a spawner system - remove variant2 child particle reference
        console.log(`[FakeGearSkin] Processing spawner system: ${systemKey}`);

        // Extract emitters from spawner to find variant2
        const emitters = extractEmitterBlocks(systemContent);
        const variant2Emitter = emitters.find(e =>
            e.emitterName === 'variant2' || /emitterName:\s*string\s*=\s*"variant2"/i.test(e.content)
        );

        if (variant2Emitter) {
            // Remove the variant2 emitter block from the system
            let newSystemContent = systemContent.replace(variant2Emitter.content, '');
            updatedContent = updatedContent.replace(systemContent, newSystemContent);
            deletedEmitters.push(`${systemKey} (variant2 child particle)`);
            console.log(`[FakeGearSkin] Removed variant2 child particle from ${systemKey}`);
        }

        // Find and remove variant2 child particle system definition
        const variant2Key = `${systemKey}_child_variant2`;
        const variant2System = systems.find(s => s.key === variant2Key || (s.key.includes('_child_variant2') && s.key.includes(systemKey)));

        if (variant2System) {
            // Remove the variant2 system definition
            updatedContent = updatedContent.replace(variant2System.rawContent, '');
            deletedSystems.push(variant2System.key);

            // Remove ResourceResolver entry
            updatedContent = removeResourceResolverEntry(updatedContent, variant2System.key);
            deletedResolverEntries.push(variant2System.key);

            console.log(`[FakeGearSkin] Removed variant2 system: ${variant2System.key}`);
        }
    } else {
        // Check if this system has inline variants
        const hasInline = hasInlineVariants(systemContent);

        if (hasInline) {
            console.log(`[FakeGearSkin] Processing inline variant system: ${systemKey}`);

            // Extract all emitters
            const emitters = extractEmitterBlocks(systemContent);
            let newSystemContent = systemContent;

            for (const emitter of emitters) {
                const isVariant1 = emitter.emitterName.includes('_Variant1') || emitter.emitterName.includes('_variant1');
                const isVariant2 = emitter.emitterName.includes('_Variant2') || emitter.emitterName.includes('_variant2');

                if (isVariant2) {
                    // Delete Variant2 emitters entirely
                    newSystemContent = newSystemContent.replace(emitter.content, '');
                    deletedEmitters.push(emitter.emitterName);
                    console.log(`[FakeGearSkin] Deleted variant2 emitter: ${emitter.emitterName}`);
                } else if (isVariant1) {
                    // Clean up Variant1 emitters: rename and remove our stencil properties
                    let cleanedContent = emitter.content;

                    // Remove _Variant1 suffix from emitter name
                    const originalName = emitter.emitterName.replace(/_Variant1$/i, '').replace(/_variant1$/i, '');
                    cleanedContent = cleanedContent.replace(
                        /emitterName:\s*string\s*=\s*"[^"]+"/i,
                        `emitterName: string = "${originalName}"`
                    );
                    renamedEmitters.push(`${emitter.emitterName} -> ${originalName}`);

                    // Remove stencilMode if it matches our pattern (only remove if we added it)
                    // stencilMode: u8 = 2 or stencilMode: u8 = 3
                    cleanedContent = cleanedContent.replace(/\s*stencilMode:\s*u8\s*=\s*[23]\s*\n?/g, '\n');

                    // Remove StencilReferenceId only if it matches our stencil ID
                    if (stencilIdToRemove) {
                        // Escape special regex characters in stencil ID
                        const escapedId = stencilIdToRemove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        // Match both quoted and unquoted versions
                        const stencilPattern = new RegExp(`\\s*StencilReferenceId:\\s*hash\\s*=\\s*(?:"${escapedId}"|${escapedId})\\s*\\n?`, 'gi');
                        cleanedContent = cleanedContent.replace(stencilPattern, '\n');
                    }

                    // Remove renderPhaseOverride (we always add this)
                    cleanedContent = cleanedContent.replace(/\s*renderPhaseOverride:\s*u8\s*=\s*\d+\s*\n?/g, '\n');

                    // Clean up any double newlines we created
                    cleanedContent = cleanedContent.replace(/\n{2,}/g, '\n');

                    newSystemContent = newSystemContent.replace(emitter.content, cleanedContent);
                    cleanedEmitters.push(originalName);
                    console.log(`[FakeGearSkin] Cleaned variant1 emitter: ${emitter.emitterName} -> ${originalName}`);
                }
            }

            // Replace the system in content
            updatedContent = updatedContent.replace(systemContent, newSystemContent);
        }
    }

    // Clean up extra blank lines
    updatedContent = updatedContent.replace(/\n{3,}/g, '\n\n');

    const totalChanges = deletedSystems.length + deletedEmitters.length + renamedEmitters.length;
    return {
        success: true,
        content: updatedContent,
        deletedSystems,
        deletedEmitters,
        renamedEmitters,
        cleanedEmitters,
        deletedResolverEntries,
        message: totalChanges > 0
            ? `Reverted variants from ${systemKey}: ${deletedEmitters.length} deleted, ${renamedEmitters.length} renamed back to original`
            : `No variants found to revert in ${systemKey}`
    };
}

/**
 * Remove a ResourceResolver entry by key
 * @param {string} pyContent - The .py file content
 * @param {string} key - The key to remove
 * @returns {string} Updated content
 */
function removeResourceResolverEntry(pyContent, key) {
    const lines = pyContent.split('\n');
    let result = [...lines];

    // Find ResourceResolver block
    let resolverStartIdx = -1;
    let resourceMapEndIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('= ResourceResolver {')) {
            resolverStartIdx = i;
            break;
        }
    }

    if (resolverStartIdx === -1) {
        return pyContent;
    }

    // Find resourceMap closing brace
    let depth = 0;
    let inResourceMap = false;

    for (let i = resolverStartIdx; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('resourceMap: map[hash,link] = {')) {
            inResourceMap = true;
        }

        if (inResourceMap) {
            const { opens, closes } = countBrackets(line);
            depth += opens - closes;

            // Check if this line contains the key to remove
            if (line.includes(`"${key}"`)) {
                result.splice(i, 1);
                // Adjust indices since we removed a line
                i--;
                continue;
            }

            if (depth <= 0) {
                resourceMapEndIdx = i;
                break;
            }
        }
    }

    return result.join('\n');
}

// Export extractAssetPaths for use in UI
export { extractAssetPaths, VARIANT1_FOLDER, VARIANT2_FOLDER, hasVariantBinsLinked };
