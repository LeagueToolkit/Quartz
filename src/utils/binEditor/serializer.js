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

    // Find and replace the constantValue in the birthScale0 block
    const pattern = /(birthScale0:\s*embed\s*=\s*ValueVector3\s*\{[^}]*constantValue:\s*vec3\s*=\s*\{)\s*[^}]+(\})/i;
    const replacement = `$1 ${newValue.x}, ${newValue.y}, ${newValue.z} $2`;

    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
        content = newContent;
        modified = true;
    }

    // Also update the dynamics values: list[vec3] if present WITHIN birthScale0 block only
    // Don't rely on parser - check raw content for dynamics block
    const birthScaleBlockMatch = content.match(/birthScale0:\s*embed\s*=\s*ValueVector3\s*\{/i);
    if (birthScaleBlockMatch) {
        const blockStart = birthScaleBlockMatch.index;

        // Find where birthScale0 block ends using bracket counting
        let depth = 0;
        let blockEnd = blockStart;
        let foundFirstBrace = false;

        for (let i = blockStart; i < content.length; i++) {
            const char = content[i];
            if (char === '{') {
                depth++;
                foundFirstBrace = true;
            } else if (char === '}') {
                depth--;
                if (foundFirstBrace && depth === 0) {
                    blockEnd = i + 1;
                    break;
                }
            }
        }

        // Extract just the birthScale0 block
        const birthScaleBlock = content.substring(blockStart, blockEnd);

        // Check if this block has dynamics with values: list[vec3]
        if (birthScaleBlock.includes('dynamics:') && birthScaleBlock.includes('values: list[vec3]')) {
            // Update dynamics values only within this block
            const dynamicsPattern = /(values:\s*list\[vec3\]\s*=\s*\{[\s\S]*?)(\{\s*)-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+(\s*\})/gi;

            const updatedBlock = birthScaleBlock.replace(dynamicsPattern, `$1$2${newValue.x}, ${newValue.y}, ${newValue.z}$3`);

            if (updatedBlock !== birthScaleBlock) {
                content = content.substring(0, blockStart) + updatedBlock + content.substring(blockEnd);
                modified = true;
            }
        }
    }

    if (modified) {
        emitter.rawContent = content;
        emitter.birthScale0.constantValue = { ...newValue };
        // Also update dynamicsValues if present
        if (emitter.birthScale0.dynamicsValues && emitter.birthScale0.dynamicsValues.length > 0) {
            emitter.birthScale0.dynamicsValues = emitter.birthScale0.dynamicsValues.map(() => ({ ...newValue }));
        }
        return true;
    }

    // Fallback: Try simpler pattern if the block structure is different
    if (emitter.birthScale0.constantValue) {
        const simplePattern = createVec3ReplacePattern('birthScale0', emitter.birthScale0.constantValue);
        const simpleReplacement = createVec3Replacement('birthScale0', newValue);

        const fallbackContent = content.replace(simplePattern, simpleReplacement);
        if (fallbackContent !== content) {
            emitter.rawContent = fallbackContent;
            emitter.birthScale0.constantValue = { ...newValue };
            return true;
        }
    }

    return false;
}


/**
 * Update scale0 constantValue in an emitter's rawContent
 * Also updates dynamics values if present
 * @param {Object} emitter - Emitter object
 * @param {{x: number, y: number, z: number}} newValue - New scale values
 * @returns {boolean} Success
 */
export function updateScale0(emitter, newValue) {
    if (!emitter.scale0) return false;

    let content = emitter.rawContent;
    let modified = false;

    const pattern = /(scale0:\s*embed\s*=\s*ValueVector3\s*\{[^}]*constantValue:\s*vec3\s*=\s*\{)\s*[^}]+(\})/i;
    const replacement = `$1 ${newValue.x}, ${newValue.y}, ${newValue.z} $2`;

    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
        content = newContent;
        modified = true;
    }

    // Also update the dynamics values: list[vec3] if present WITHIN scale0 block only
    const scale0BlockMatch = content.match(/scale0:\s*embed\s*=\s*ValueVector3\s*\{/i);
    if (scale0BlockMatch) {
        const blockStart = scale0BlockMatch.index;

        // Find where scale0 block ends using bracket counting
        let depth = 0;
        let blockEnd = blockStart;
        let foundFirstBrace = false;

        for (let i = blockStart; i < content.length; i++) {
            const char = content[i];
            if (char === '{') {
                depth++;
                foundFirstBrace = true;
            } else if (char === '}') {
                depth--;
                if (foundFirstBrace && depth === 0) {
                    blockEnd = i + 1;
                    break;
                }
            }
        }

        // Extract just the scale0 block
        const scale0Block = content.substring(blockStart, blockEnd);

        // Check if this block has dynamics with values: list[vec3]
        if (scale0Block.includes('dynamics:') && scale0Block.includes('values: list[vec3]')) {
            // Update dynamics values only within this block
            const dynamicsPattern = /(values:\s*list\[vec3\]\s*=\s*\{[\s\S]*?)(\{\s*)-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+(\s*\})/gi;

            const updatedBlock = scale0Block.replace(dynamicsPattern, `$1$2${newValue.x}, ${newValue.y}, ${newValue.z}$3`);

            if (updatedBlock !== scale0Block) {
                content = content.substring(0, blockStart) + updatedBlock + content.substring(blockEnd);
                modified = true;
            }
        }
    }

    if (modified) {
        emitter.rawContent = content;
        emitter.scale0.constantValue = { ...newValue };
        if (emitter.scale0.dynamicsValues && emitter.scale0.dynamicsValues.length > 0) {
            emitter.scale0.dynamicsValues = emitter.scale0.dynamicsValues.map(() => ({ ...newValue }));
        }
        return true;
    }

    // Fallback
    if (emitter.scale0.constantValue) {
        const simplePattern = createVec3ReplacePattern('scale0', emitter.scale0.constantValue);
        const simpleReplacement = createVec3Replacement('scale0', newValue);

        const fallbackContent = content.replace(simplePattern, simpleReplacement);
        if (fallbackContent !== content) {
            emitter.rawContent = fallbackContent;
            emitter.scale0.constantValue = { ...newValue };
            return true;
        }
    }

    return false;
}


/**
 * Update scale0 dynamics values in an emitter's rawContent
 * @param {Object} emitter - Emitter object
 * @param {Array<{x: number, y: number, z: number}>} newValues - New values array
 * @returns {boolean} Success
 */
export function updateScale0Dynamics(emitter, newValues) {
    if (!emitter.scale0 || !emitter.scale0.dynamicsValues || newValues.length === 0) return false;

    let content = emitter.rawContent;
    let modified = false;

    // Find the values: list[vec3] section within scale0's dynamics block
    const valuesPattern = /(scale0:[\s\S]*?dynamics:\s*pointer\s*=\s*VfxAnimatedVector3fVariableData\s*\{[\s\S]*?values:\s*list\[vec3\]\s*=\s*\{)([\s\S]*?)(\}\s*\})/i;

    const match = content.match(valuesPattern);
    if (match) {
        // Build new values string - match original indentation
        const valueStrings = newValues.map(v => `                            { ${v.x}, ${v.y}, ${v.z} }`);
        const newValuesSection = '\n' + valueStrings.join('\n') + '\n                        ';

        content = content.replace(valuesPattern, `$1${newValuesSection}$3`);
        modified = content !== emitter.rawContent;
    }

    if (modified) {
        emitter.rawContent = content;
        emitter.scale0.dynamicsValues = newValues.map(v => ({ ...v }));
    }

    return modified;
}

/**
 * Update birthScale0 dynamics values in an emitter's rawContent
 * @param {Object} emitter - Emitter object
 * @param {Array<{x: number, y: number, z: number}>} newValues - New values array
 * @returns {boolean} Success
 */
export function updateBirthScaleDynamics(emitter, newValues) {
    if (!emitter.birthScale0 || !emitter.birthScale0.dynamicsValues || newValues.length === 0) return false;

    let content = emitter.rawContent;
    let modified = false;

    // Find the values: list[vec3] section within birthScale0's dynamics block
    // Pattern: look for birthScale0 -> dynamics -> values: list[vec3] = { ... }
    const valuesPattern = /(birthScale0:[\s\S]*?dynamics:\s*pointer\s*=\s*VfxAnimatedVector3fVariableData\s*\{[\s\S]*?values:\s*list\[vec3\]\s*=\s*\{)([\s\S]*?)(\}\s*\})/i;

    const match = content.match(valuesPattern);
    if (match) {
        // Build new values string - match original indentation
        const valueStrings = newValues.map(v => `                            { ${v.x}, ${v.y}, ${v.z} }`);
        const newValuesSection = '\n' + valueStrings.join('\n') + '\n                        ';

        content = content.replace(valuesPattern, `$1${newValuesSection}$3`);
        modified = content !== emitter.rawContent;
    }

    if (modified) {
        emitter.rawContent = content;
        emitter.birthScale0.dynamicsValues = newValues.map(v => ({ ...v }));
    }

    return modified;
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
 * Mark a system as modified (for serialization)
 * @param {Object} data - Parsed data
 * @param {string} systemName - System name
 */
export function markSystemModified(data, systemName) {
    if (data.systems[systemName]) {
        data.systems[systemName]._modified = true;
    }
}
