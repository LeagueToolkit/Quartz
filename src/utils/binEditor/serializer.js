/**
 * BinEditor Serializer - Convert structured data back to .py file format
 * 
 * Key principle: Make targeted edits to emitter rawContent, then reassemble
 * the file from the preserved raw blocks.
 */

/**
 * Serialize parsed data back to .py file content
 * @param {Object} data - Parsed data from parser.js
 * @returns {string} Complete .py file content
 */
export function serializeToFile(data) {
    let output = data.header;

    // Use systemOrder to preserve the original order of systems
    // Fall back to Object.keys if systemOrder is not available (backwards compatibility)
    const systemNames = data.systemOrder && data.systemOrder.length > 0
        ? data.systemOrder
        : Object.keys(data.systems);

    // Add each system (with any prefix content like ResourceResolver, animationGraphData, etc.)
    for (const systemName of systemNames) {
        const system = data.systems[systemName];
        if (!system) continue;

        // Output any content that appeared before this system (non-VFX entries)
        if (system.prefix) {
            output += system.prefix;
        }

        output += serializeSystem(system);
        output += '\n';
    }

    // Add footer (but avoid double newlines)
    if (data.footer) {
        output = output.trimEnd() + data.footer;
    }

    return output;
}


/**
 * Serialize a single system back to text
 * @param {Object} system - System data
 * @returns {string} System content
 */
function serializeSystem(system) {
    // If no emitters were modified, return original rawContent
    if (!system._modified) {
        return system.rawContent;
    }

    // Otherwise, rebuild the system from its parts
    const lines = system.rawContent.split('\n');
    let result = [];
    let lastProcessedLine = -1;

    // Sort emitters by their position in the file
    const sortedEmitters = [...system.emitters].sort((a, b) => a.localStartLine - b.localStartLine);

    for (const emitter of sortedEmitters) {
        // Add any lines between last processed and this emitter
        for (let i = lastProcessedLine + 1; i < emitter.localStartLine; i++) {
            result.push(lines[i]);
        }

        // Add the emitter's (potentially modified) rawContent
        result.push(emitter.rawContent);

        lastProcessedLine = emitter.localEndLine;
    }

    // Add any remaining lines after the last emitter
    for (let i = lastProcessedLine + 1; i < lines.length; i++) {
        result.push(lines[i]);
    }

    return result.join('\n');
}

/**
 * Update birthScale0 constantValue in an emitter's rawContent
 * Also updates dynamics values if present
 * @param {Object} emitter - Emitter object
 * @param {{x: number, y: number, z: number}} newValue - New scale values
 * @returns {boolean} Success
 */
export function updateBirthScale(emitter, newValue) {
    if (!emitter.birthScale0) return false;

    let content = emitter.rawContent;
    let modified = false;

    // 1. Update constantValue
    const pattern = /(birthScale0:\s*embed\s*=\s*ValueVector3\s*\{[^}]*constantValue:\s*vec3\s*=\s*\{)\s*[^}]+(\})/i;
    const replacement = `$1 ${newValue.x}, ${newValue.y}, ${newValue.z} $2`;

    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
        content = newContent;
        modified = true;
    }

    if (modified) {
        emitter.rawContent = content;
        emitter.birthScale0.constantValue = { ...newValue };
        return true;
    }

    return false;
}


/**
 * Update scale0 constantValue in an emitter's rawContent
 * @param {Object} emitter - Emitter object
 * @param {{x: number, y: number, z: number}} newValue - New scale values
 * @returns {boolean} Success
 */
export function updateScale0(emitter, newValue) {
    if (!emitter.scale0) return false;

    let content = emitter.rawContent;
    let modified = false;

    // 1. Update constantValue
    const pattern = /(scale0:\s*embed\s*=\s*ValueVector3\s*\{[^}]*constantValue:\s*vec3\s*=\s*\{)\s*[^}]+(\})/i;
    const replacement = `$1 ${newValue.x}, ${newValue.y}, ${newValue.z} $2`;

    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
        content = newContent;
        modified = true;
    }

    if (modified) {
        emitter.rawContent = content;
        emitter.scale0.constantValue = { ...newValue };
        return true;
    }

    return false;
}


/**
 * Update scale0 dynamics values in an emitter's rawContent
 */
export function updateScale0Dynamics(emitter, newValues) {
    if (!emitter.scale0 || !emitter.scale0.dynamicsValues || newValues.length === 0) return false;
    return updateGenericVec3List(emitter, 'scale0', newValues);
}

export function updateBirthScaleDynamics(emitter, newValues) {
    if (!emitter.birthScale0 || !emitter.birthScale0.dynamicsValues || newValues.length === 0) return false;
    return updateGenericVec3List(emitter, 'birthScale0', newValues);
}

/**
 * Generic helper to update a values: list[vec3] block using bracket counting
 */
function updateGenericVec3List(emitter, propName, newValues) {
    let content = emitter.rawContent;

    // 1. Find the property block (birthScale0 or scale0)
    const blockMatch = content.match(new RegExp(`${propName}:\\s*embed\\s*=\\s*ValueVector3\\s*\\{`, 'i'));
    if (!blockMatch) return false;

    const blockStart = blockMatch.index;
    const blockEnd = findClosingBrace(content, blockStart);
    if (blockEnd === -1) return false;

    const blockContent = content.substring(blockStart, blockEnd);

    // 2. Find the values: list[vec3] section within that block
    const valuesMatch = blockContent.match(/(values:\s*list\[vec3\]\s*=\s*\{)/i);
    if (!valuesMatch) return false;

    const listRelStart = valuesMatch.index;
    const listRelEnd = findClosingBrace(blockContent, listRelStart);
    if (listRelEnd === -1) return false;

    // 3. Construct new list content
    const header = valuesMatch[1];
    const valueStrings = newValues.map(v => `                            { ${v.x}, ${v.y}, ${v.z} }`);
    const newListContent = `${header}\n${valueStrings.join('\n')}\n                        }`;

    // 4. Update the emitter content by replacing only the relevant slice
    const globalListStart = blockStart + listRelStart;
    const globalListEnd = blockStart + listRelEnd;

    emitter.rawContent = content.substring(0, globalListStart) + newListContent + content.substring(globalListEnd);

    if (emitter[propName] && emitter[propName].dynamicsValues) {
        emitter[propName].dynamicsValues = newValues.map(v => ({ ...v }));
    }

    return true;
}

/**
 * Helper to find the matching closing brace for a block starting before or at index
 */
function findClosingBrace(text, startIndex) {
    let depth = 0;
    let foundStart = false;

    for (let i = startIndex; i < text.length; i++) {
        const char = text[i];
        if (char === '{') {
            depth++;
            foundStart = true;
        } else if (char === '}') {
            depth--;
            if (foundStart && depth === 0) return i + 1;
        }
    }
    return -1;
}


/**
 * Update bindWeight constantValue
 * @param {Object} emitter - Emitter object
 * @param {number} newValue - New value (0-1)
 * @returns {boolean} Success
 */
export function updateBindWeight(emitter, newValue) {
    if (!emitter.bindWeight) return false;

    const pattern = /(bindWeight:\s*embed\s*=\s*ValueFloat\s*\{[^}]*constantValue:\s*f32\s*=\s*)(-?[\d.]+)/i;

    const replacement = `$1${newValue}`;

    const newContent = emitter.rawContent.replace(pattern, replacement);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.bindWeight.constantValue = newValue;
        return true;
    }

    return false;
}

/**
 * Insert a new bindWeight property into an emitter that doesn't have one
 * @param {Object} emitter - Emitter object
 * @param {number} value - Initial value (default 1)
 * @returns {boolean} Success
 */
export function insertBindWeight(emitter, value = 1) {
    if (emitter.bindWeight) return false; // Already has bindWeight

    // Find emitterName line to insert after
    const emitterNamePattern = /(emitterName:\s*string\s*=\s*"[^"]+"\n)/i;

    const match = emitter.rawContent.match(emitterNamePattern);
    if (!match) return false;

    // Build the bindWeight block
    const bindWeightBlock = `                bindWeight: embed = ValueFloat {\n                    constantValue: f32 = ${value}\n                }\n`;

    // Insert after emitterName
    const newContent = emitter.rawContent.replace(emitterNamePattern, `$1${bindWeightBlock}`);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.bindWeight = {
            constantValue: value,
            dynamicsValues: [],
            rawBlock: bindWeightBlock
        };
        return true;
    }

    return false;
}

/**
 * Update translationOverride values
 * @param {Object} emitter - Emitter object
 * @param {{x: number, y: number, z: number}} newValue - New values
 * @returns {boolean} Success
 */
export function updateTranslationOverride(emitter, newValue) {
    if (!emitter.translationOverride) return false;

    const pattern = /(translationOverride:\s*vec3\s*=\s*\{)\s*[^}]+(\})/i;
    const replacement = `$1 ${newValue.x}, ${newValue.y}, ${newValue.z} $2`;

    const newContent = emitter.rawContent.replace(pattern, replacement);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.translationOverride.constantValue = { ...newValue };
        return true;
    }

    return false;
}

/**
 * Insert a new translationOverride property
 * @param {Object} emitter - Emitter object  
 * @param {{x: number, y: number, z: number}} value - Initial value
 * @returns {boolean} Success
 */
export function insertTranslationOverride(emitter, value = { x: 0, y: 0, z: 0 }) {
    if (emitter.translationOverride) return false; // Already has it

    // Find emitterName line to insert after
    const emitterNamePattern = /(emitterName:\s*string\s*=\s*"[^"]+"\n)/i;

    const match = emitter.rawContent.match(emitterNamePattern);
    if (!match) return false;

    // Build the translationOverride line
    const toLine = `                translationOverride: vec3 = { ${value.x}, ${value.y}, ${value.z} }\n`;

    // Insert after emitterName
    const newContent = emitter.rawContent.replace(emitterNamePattern, `$1${toLine}`);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.translationOverride = {
            constantValue: { ...value }
        };
        return true;
    }

    return false;
}

/**
 * Helper: Create a regex pattern to match a vec3 constantValue
 */
function createVec3ReplacePattern(propName, oldValue) {
    // Escape special regex chars in numbers
    const x = String(oldValue.x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const y = String(oldValue.y).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const z = String(oldValue.z).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return new RegExp(
        `(${propName}:[\\s\\S]*?constantValue:\\s*vec3\\s*=\\s*\\{)\\s*${x}\\s*,\\s*${y}\\s*,\\s*${z}\\s*(\\})`,
        'i'
    );
}

/**
 * Helper: Create replacement string for vec3
 */
function createVec3Replacement(propName, newValue) {
    return `$1 ${newValue.x}, ${newValue.y}, ${newValue.z} $2`;
}

/**
 * Update particleLifetime constantValue
 * @param {Object} emitter - Emitter object
 * @param {number} newValue - New value
 * @returns {boolean} Success
 */
export function updateParticleLifetime(emitter, newValue) {
    if (!emitter.particleLifetime) return false;

    let content = emitter.rawContent;
    let modified = false;

    // Update constantValue
    const constantPattern = /(particleLifetime:\s*embed\s*=\s*ValueFloat\s*\{[^}]*constantValue:\s*f32\s*=\s*)(-?[\d.]+)/i;
    const constantReplacement = `$1${newValue}`;

    content = content.replace(constantPattern, constantReplacement);
    if (content !== emitter.rawContent) {
        modified = true;
    }

    // Also update the dynamics values list if it exists
    // Pattern: values: list[f32] = { value }
    // This appears within the particleLifetime block
    const dynamicsPattern = /(particleLifetime:[\s\S]*?values:\s*list\[f32\]\s*=\s*\{\s*)(-?[\d.]+)(\s*\})/i;

    if (dynamicsPattern.test(content)) {
        const dynamicsReplacement = `$1${newValue}$3`;
        content = content.replace(dynamicsPattern, dynamicsReplacement);
        modified = true;
    }

    if (modified) {
        emitter.rawContent = content;
        emitter.particleLifetime.constantValue = newValue;
        return true;
    }

    return false;
}

/**
 * Update lifetime (option[f32] format)
 * @param {Object} emitter - Emitter object
 * @param {number} newValue - New value
 * @returns {boolean} Success
 */
export function updateLifetime(emitter, newValue) {
    if (!emitter.lifetime) return false;

    const pattern = /(lifetime:\s*option\[f32\]\s*=\s*\{\s*)[\d.\-]+(\s*\})/i;

    const replacement = `$1${newValue}$2`;

    const newContent = emitter.rawContent.replace(pattern, replacement);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.lifetime.value = newValue;
        return true;
    }

    return false;
}

/**
 * Update particleLinger (option[f32] format)
 * @param {Object} emitter - Emitter object
 * @param {number} newValue - New value
 * @returns {boolean} Success
 */
export function updateParticleLinger(emitter, newValue) {
    if (!emitter.particleLinger) return false;

    const pattern = /(particleLinger:\s*option\[f32\]\s*=\s*\{\s*)[\d.\-]+(\s*\})/i;

    const replacement = `$1${newValue}$2`;

    const newContent = emitter.rawContent.replace(pattern, replacement);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.particleLinger.value = newValue;
        return true;
    }

    return false;
}

/**
 * Update rate constantValue and dynamics values
 * Rate controls the emission rate of particles
 * @param {Object} emitter - Emitter object
 * @param {number} newValue - New value
 * @returns {boolean} Success
 */
export function updateRate(emitter, newValue) {
    if (!emitter.rate) return false;

    let content = emitter.rawContent;
    let modified = false;

    // Update constantValue
    const constantPattern = /(rate:\s*embed\s*=\s*ValueFloat\s*\{[^}]*constantValue:\s*f32\s*=\s*)(-?[\d.]+)/i;
    const constantReplacement = `$1${newValue}`;

    content = content.replace(constantPattern, constantReplacement);
    if (content !== emitter.rawContent) {
        modified = true;
    }

    // Also update the dynamics values list if it exists
    // For rate, we need to update ALL values in the list, not just the first one
    // Pattern: values: list[f32] = { value1 value2 ... }
    const dynamicsMatch = content.match(/rate:[\s\S]*?dynamics:[\s\S]*?values:\s*list\[f32\]\s*=\s*\{([^}]+)\}/i);

    if (dynamicsMatch) {
        const oldValuesList = dynamicsMatch[1];
        // Parse existing values to maintain the number of entries
        const existingValues = oldValuesList.split(/\n/).map(line => {
            const num = line.trim();
            return num ? parseFloat(num) : null;
        }).filter(v => v !== null && !isNaN(v));

        if (existingValues.length > 0) {
            // Calculate the ratio to scale all dynamics values proportionally
            const oldConstant = emitter.rate.constantValue;
            const ratio = oldConstant !== 0 ? newValue / oldConstant : 1;

            // Scale each dynamics value by the same ratio
            const newValues = existingValues.map(v => {
                const scaled = v * ratio;
                // Format nicely - use integer if whole number, otherwise 2 decimal places
                return Number.isInteger(scaled) ? scaled : parseFloat(scaled.toFixed(2));
            });

            // Build new values list with proper formatting
            const newValuesList = newValues.map(v => `                            ${v}`).join('\n');

            // Replace the old values list with the new one
            const dynamicsPattern = /(rate:[\s\S]*?dynamics:[\s\S]*?values:\s*list\[f32\]\s*=\s*\{)[^}]+(\})/i;
            const dynamicsReplacement = `$1\n${newValuesList}\n                        $2`;

            const newContentWithDynamics = content.replace(dynamicsPattern, dynamicsReplacement);
            if (newContentWithDynamics !== content) {
                content = newContentWithDynamics;
                modified = true;
            }
        }
    }

    if (modified) {
        emitter.rawContent = content;
        emitter.rate.constantValue = newValue;
        return true;
    }

    return false;
}

/**
 * Mark a system as modified (for serialization)
 * @param {Object} data - Parsed data
 * @param {string} systemName - System name
 */
export function markSystemModified(data, systemName) {
    if (data.systems[systemName]) {
        data.systems[systemName]._modified = true;
    }
}
