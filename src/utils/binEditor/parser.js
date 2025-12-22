/**
 * BinEditor Parser - Clean parsing of ritobin .py files
 * 
 * Key principle: Parse into structured data while preserving raw content blocks
 * for safe, targeted editing without corrupting other parts of the file.
 */

/**
 * Parse a .py file content into structured data
 * @param {string} content - The full .py file content
 * @returns {Object} Structured data with systems, emitters, and properties
 */
export function parsePyFile(content) {
    const lines = content.split('\n');

    const result = {
        header: '',           // Content before first VfxSystem
        systems: {},          // Map of system name -> system data
        systemOrder: [],      // Array of system names in order (to preserve order during serialization)
        footer: '',           // Content after last VfxSystem
        rawContent: content   // Keep original for reference
    };

    let lastSystemEndLine = -1;

    // Find all VfxSystemDefinitionData blocks
    const systemBlocks = findSystemBlocks(lines);

    if (systemBlocks.length === 0) {
        // No systems found, entire content is header
        result.header = content;
        return result;
    }

    // Extract header (everything before first system)
    const headerEndLine = systemBlocks[0].startLine;
    result.header = lines.slice(0, headerEndLine).join('\n');
    if (result.header) result.header += '\n';

    // Parse each system, capturing any content between systems
    for (let i = 0; i < systemBlocks.length; i++) {
        const block = systemBlocks[i];
        const systemLines = lines.slice(block.startLine, block.endLine + 1);
        const rawContent = systemLines.join('\n');

        const system = parseSystem(rawContent, block.name, block.startLine);

        // Capture any content between the previous system and this one (non-VFX entries)
        // This preserves ResourceResolver, animationGraphData, SkinCharacterDataProperties etc.
        if (i > 0) {
            const prevBlock = systemBlocks[i - 1];
            const gapStart = prevBlock.endLine + 1;
            const gapEnd = block.startLine;
            if (gapEnd > gapStart) {
                const gapContent = lines.slice(gapStart, gapEnd).join('\n');
                if (gapContent.trim()) {
                    system.prefix = '\n' + gapContent + '\n';
                }
            }
        }

        result.systems[block.name] = system;
        result.systemOrder.push(block.name);

        lastSystemEndLine = block.endLine;
    }

    // Extract footer (everything after last system)
    if (lastSystemEndLine < lines.length - 1) {
        result.footer = '\n' + lines.slice(lastSystemEndLine + 1).join('\n');
    }

    return result;
}

/**
 * Find all VfxSystemDefinitionData blocks in the file
 * @param {string[]} lines - Array of lines
 * @returns {Array} Array of {name, startLine, endLine}
 */
function findSystemBlocks(lines) {
    const blocks = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match VfxSystemDefinitionData header
        const match = line.match(/^\s*"?([^"=]+)"?\s*=\s*VfxSystemDefinitionData\s*\{/);
        if (match) {
            const name = match[1].trim().replace(/"/g, '');
            const startLine = i;

            // Find the end of this system using bracket counting
            const endLine = findBlockEnd(lines, i);

            blocks.push({ name, startLine, endLine });

            // Skip to end of this block
            i = endLine;
        }
    }

    return blocks;
}

/**
 * Find the end line of a block starting at startLine
 * Uses bracket counting with string literal awareness
 * @param {string[]} lines - Array of lines
 * @param {number} startLine - Starting line index
 * @returns {number} End line index
 */
function findBlockEnd(lines, startLine) {
    let bracketDepth = 0;
    let foundFirstBracket = false;

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        const { opens, closes } = countBrackets(line);

        bracketDepth += opens - closes;

        if (opens > 0) foundFirstBracket = true;

        // Block ends when we return to depth 0 after seeing first bracket
        if (foundFirstBracket && bracketDepth === 0) {
            return i;
        }

        // Safety: prevent runaway parsing
        if (i - startLine > 10000) {
            console.warn(`Block parsing exceeded 10000 lines, stopping at line ${i}`);
            return i;
        }
    }

    // If we didn't find the end, return last line
    return lines.length - 1;
}

/**
 * Count brackets in a line, ignoring those inside string literals
 * @param {string} line - Line to count
 * @returns {{opens: number, closes: number}}
 */
function countBrackets(line) {
    let opens = 0;
    let closes = 0;
    let inString = false;
    let stringChar = null;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const prevChar = i > 0 ? line[i - 1] : '';

        // Handle string literals
        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
                stringChar = null;
            }
        }

        // Only count brackets outside strings
        if (!inString) {
            if (char === '{') opens++;
            if (char === '}') closes++;
        }
    }

    return { opens, closes };
}

/**
 * Parse a single VfxSystemDefinitionData block
 * @param {string} rawContent - Raw content of the system block
 * @param {string} name - System name
 * @param {number} globalStartLine - Starting line in the original file
 * @returns {Object} Parsed system data
 */
function parseSystem(rawContent, name, globalStartLine) {
    const lines = rawContent.split('\n');

    // Try to read particleName for a friendlier display name (like Port.js does)
    let particleName = null;
    const particleNameMatch = rawContent.match(/particleName:\s*string\s*=\s*"([^"]+)"/i);
    if (particleNameMatch) {
        particleName = particleNameMatch[1];
    }

    const system = {
        name,
        displayName: particleName || getShortName(name), // Prefer particleName, fallback to path
        particleName, // Store separately for reference
        rawContent,
        globalStartLine,
        emitters: []
    };

    // Find all VfxEmitterDefinitionData blocks within this system
    const emitterBlocks = findEmitterBlocks(lines);

    for (const block of emitterBlocks) {
        const emitterLines = lines.slice(block.startLine, block.endLine + 1);
        const emitterRawContent = emitterLines.join('\n');

        const emitter = parseEmitter(emitterRawContent, block.startLine);
        emitter.localStartLine = block.startLine;
        emitter.localEndLine = block.endLine;

        system.emitters.push(emitter);
    }

    return system;
}

/**
 * Find all VfxEmitterDefinitionData blocks within a system
 * @param {string[]} lines - Lines of the system
 * @returns {Array} Array of {startLine, endLine}
 */
function findEmitterBlocks(lines) {
    const blocks = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/VfxEmitterDefinitionData\s*\{/.test(line)) {
            const startLine = i;
            const endLine = findBlockEnd(lines, i);

            blocks.push({ startLine, endLine });

            // Skip to end of this block
            i = endLine;
        }
    }

    return blocks;
}

/**
 * Parse a single VfxEmitterDefinitionData block
 * @param {string} rawContent - Raw content of the emitter block
 * @param {number} localStartLine - Start line within parent system
 * @returns {Object} Parsed emitter data
 */
function parseEmitter(rawContent, localStartLine) {
    const emitter = {
        name: parseEmitterName(rawContent),
        rawContent,
        localStartLine,

        // Scale properties
        birthScale0: parseVec3Property(rawContent, 'birthScale0'),
        scale0: parseVec3Property(rawContent, 'scale0'),

        // Weight and position
        bindWeight: parseFloatProperty(rawContent, 'bindWeight'),
        translationOverride: parseSimpleVec3(rawContent, 'translationOverride'),

        // Lifetime properties
        particleLifetime: parseFloatProperty(rawContent, 'particleLifetime'),
        lifetime: parseOptionFloat(rawContent, 'lifetime'),
        particleLinger: parseOptionFloat(rawContent, 'particleLinger')
    };

    return emitter;
}

/**
 * Parse emitter name from content
 * @param {string} content - Emitter raw content
 * @returns {string} Emitter name or 'Unnamed'
 */
function parseEmitterName(content) {
    const match = content.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
    return match ? match[1] : 'Unnamed';
}

/**
 * Parse a ValueVector3 property (like birthScale0, scale0)
 * @param {string} content - Content to search
 * @param {string} propName - Property name
 * @returns {Object|null} Parsed property or null
 */
function parseVec3Property(content, propName) {
    // Match pattern: propName: embed = ValueVector3 { ... }
    const propRegex = new RegExp(
        `${propName}:\\s*embed\\s*=\\s*ValueVector3\\s*\\{`,
        'i'
    );

    const match = content.match(propRegex);
    if (!match) return null;

    // Find the start of this property block
    const startIndex = match.index;

    // Extract the block content
    const blockContent = extractBlock(content, startIndex + match[0].length - 1);
    if (!blockContent) return null;

    const result = {
        constantValue: null,
        dynamicsValues: [],
        rawBlock: blockContent
    };

    // Parse constantValue
    const constMatch = blockContent.match(/constantValue:\s*vec3\s*=\s*\{\s*([^}]+)\}/i);
    if (constMatch) {
        const values = constMatch[1].split(',').map(v => parseFloat(v.trim()));
        if (values.length >= 3) {
            result.constantValue = { x: values[0], y: values[1], z: values[2] };
        }
    }

    // Parse dynamics values (list of vec3) - improved pattern
    // Look for "values: list[vec3] = {" followed by vec3 entries within dynamics block
    const dynamicsSection = blockContent.match(/dynamics:\s*pointer\s*=\s*VfxAnimatedVector3fVariableData\s*\{[\s\S]*?values:\s*list\[vec3\]\s*=\s*\{([\s\S]*?)\}\s*\}/i);
    if (dynamicsSection) {
        const valuesContent = dynamicsSection[1];
        // Match individual vec3 values: { x, y, z }
        const vectorMatches = valuesContent.matchAll(/\{\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\}/g);
        for (const vm of vectorMatches) {
            result.dynamicsValues.push({
                x: parseFloat(vm[1]),
                y: parseFloat(vm[2]),
                z: parseFloat(vm[3])
            });
        }
    }

    // Fallback to simpler pattern if the above didn't match
    if (result.dynamicsValues.length === 0) {
        const simpleMatch = blockContent.match(/values:\s*list\[vec3\]\s*=\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/i);
        if (simpleMatch) {
            const vectorMatches = simpleMatch[1].matchAll(/\{\s*([^}]+)\}/g);
            for (const vm of vectorMatches) {
                const values = vm[1].split(',').map(v => parseFloat(v.trim()));
                if (values.length >= 3 && !isNaN(values[0])) {
                    result.dynamicsValues.push({ x: values[0], y: values[1], z: values[2] });
                }
            }
        }
    }

    return result;
}

/**
 * Parse a simple vec3 property (like translationOverride: vec3 = { x, y, z })
 * @param {string} content - Content to search
 * @param {string} propName - Property name
 * @returns {Object|null}
 */
function parseSimpleVec3(content, propName) {
    const regex = new RegExp(
        `${propName}:\\s*vec3\\s*=\\s*\\{\\s*([^}]+)\\}`,
        'i'
    );

    const match = content.match(regex);
    if (!match) return null;

    const values = match[1].split(',').map(v => parseFloat(v.trim()));
    if (values.length < 3) return null;

    return {
        constantValue: { x: values[0], y: values[1], z: values[2] }
    };
}

/**
 * Parse a ValueFloat property (like bindWeight)
 * @param {string} content - Content to search
 * @param {string} propName - Property name
 * @returns {Object|null}
 */
function parseFloatProperty(content, propName) {
    // Match pattern: propName: embed = ValueFloat { ... }
    const propRegex = new RegExp(
        `${propName}:\\s*embed\\s*=\\s*ValueFloat\\s*\\{`,
        'i'
    );

    const match = content.match(propRegex);
    if (!match) return null;

    const startIndex = match.index;
    const blockContent = extractBlock(content, startIndex + match[0].length - 1);
    if (!blockContent) return null;

    const result = {
        constantValue: null,
        dynamicsValues: [],
        rawBlock: blockContent
    };

    // Parse constantValue
    const constMatch = blockContent.match(/constantValue:\s*f32\s*=\s*(-?[\d.]+)/i);
    if (constMatch) {
        result.constantValue = parseFloat(constMatch[1]);
    }

    // Parse dynamics values
    const dynamicsMatch = blockContent.match(/values:\s*list\[f32\]\s*=\s*\{([^}]+)\}/i);
    if (dynamicsMatch) {
        const values = dynamicsMatch[1].split(/\n/).map(line => {
            const num = line.trim();
            return num ? parseFloat(num) : null;
        }).filter(v => v !== null && !isNaN(v));
        result.dynamicsValues = values;
    }

    return result;
}

/**
 * Parse an option[f32] property (like lifetime, particleLinger)
 * Format: propName: option[f32] = { value }
 * @param {string} content - Content to search
 * @param {string} propName - Property name
 * @returns {Object|null}
 */
function parseOptionFloat(content, propName) {
    const regex = new RegExp(
        `${propName}:\\s*option\\[f32\\]\\s*=\\s*\\{\\s*([\\d.\\-]+)\\s*\\}`,
        'i'
    );

    const match = content.match(regex);
    if (!match) return null;

    return {
        value: parseFloat(match[1])
    };
}

/**
 * Extract a { } block starting at the given position
 * @param {string} content - Full content
 * @param {number} startPos - Position of opening {
 * @returns {string|null} Block content including braces
 */
function extractBlock(content, startPos) {
    if (content[startPos] !== '{') {
        // Find the next {
        const nextBrace = content.indexOf('{', startPos);
        if (nextBrace === -1) return null;
        startPos = nextBrace;
    }

    let depth = 0;
    let inString = false;
    let stringChar = null;

    for (let i = startPos; i < content.length; i++) {
        const char = content[i];
        const prevChar = i > 0 ? content[i - 1] : '';

        // Handle strings
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
            if (char === '{') depth++;
            if (char === '}') depth--;

            if (depth === 0) {
                return content.substring(startPos, i + 1);
            }
        }
    }

    return null;
}

/**
 * Get short display name from full path
 * @param {string} fullPath - Full system path
 * @returns {string} Short name
 */
function getShortName(fullPath) {
    if (!fullPath) return 'Unknown';

    const parts = fullPath.split('/');
    let name = parts[parts.length - 1];

    // Remove common prefixes like "Champion_Base_" or "Champion_Skin01_"
    name = name.replace(/^[A-Z][a-z]+_(Base_|Skin\d+_)/i, '');

    // Truncate if too long
    if (name.length > 35) {
        name = name.substring(0, 32) + '...';
    }

    return name;
}

/**
 * Get summary statistics for parsed data
 * @param {Object} data - Parsed data from parsePyFile
 * @returns {Object} Statistics
 */
export function getParseStats(data) {
    const systemCount = Object.keys(data.systems).length;
    let emitterCount = 0;
    let withBirthScale = 0;
    let withScale0 = 0;
    let withBindWeight = 0;
    let withTranslationOverride = 0;

    for (const system of Object.values(data.systems)) {
        emitterCount += system.emitters.length;
        for (const emitter of system.emitters) {
            if (emitter.birthScale0) withBirthScale++;
            if (emitter.scale0) withScale0++;
            if (emitter.bindWeight) withBindWeight++;
            if (emitter.translationOverride) withTranslationOverride++;
        }
    }

    return {
        systemCount,
        emitterCount,
        withBirthScale,
        withScale0,
        withBindWeight,
        withTranslationOverride
    };
}
