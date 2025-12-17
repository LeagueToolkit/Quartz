/**
 * BinEditor Operations - Batch operations for editing VFX data
 * 
 * These are higher-level functions that operate on selections
 * and handle the bulk of the editing logic.
 */

import {
    updateBirthScale,
    updateScale0,
    updateBirthScaleDynamics,
    updateScale0Dynamics,
    updateBindWeight,
    insertBindWeight,
    updateTranslationOverride,
    insertTranslationOverride,
    updateParticleLifetime,
    updateLifetime,
    updateParticleLinger,
    markSystemModified
} from './serializer.js';

/**
 * Scale birthScale0 for selected emitters
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Set of "systemName:emitterName" keys
 * @param {number} multiplier - Scale multiplier
 * @returns {{modified: number, errors: string[]}}
 */
export function scaleBirthScale(data, selectedKeys, multiplier) {
    let modified = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (emitter.birthScale0?.constantValue) {
                const oldValue = emitter.birthScale0.constantValue;
                const newValue = {
                    x: oldValue.x * multiplier,
                    y: oldValue.y * multiplier,
                    z: oldValue.z * multiplier
                };

                if (updateBirthScale(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to update birthScale0 for ${emitter.name}`);
                }
            }

            // Also scale dynamics if present
            if (emitter.birthScale0?.dynamicsValues?.length > 0) {
                const newDynamics = emitter.birthScale0.dynamicsValues.map(v => ({
                    x: v.x * multiplier,
                    y: v.y * multiplier,
                    z: v.z * multiplier
                }));

                if (updateBirthScaleDynamics(emitter, newDynamics)) {
                    markSystemModified(data, system.name);
                    // Don't increment modified again, same emitter
                }
            }
        }
    }

    return { modified, errors };
}

/**
 * Scale scale0 for selected emitters
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Set of "systemName:emitterName" keys
 * @param {number} multiplier - Scale multiplier
 * @returns {{modified: number, errors: string[]}}
 */
export function scaleScale0(data, selectedKeys, multiplier) {
    let modified = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (emitter.scale0?.constantValue) {
                const oldValue = emitter.scale0.constantValue;
                const newValue = {
                    x: oldValue.x * multiplier,
                    y: oldValue.y * multiplier,
                    z: oldValue.z * multiplier
                };

                if (updateScale0(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to update scale0 for ${emitter.name}`);
                }
            }

            // Also scale dynamics if present
            if (emitter.scale0?.dynamicsValues?.length > 0) {
                const newDynamics = emitter.scale0.dynamicsValues.map(v => ({
                    x: v.x * multiplier,
                    y: v.y * multiplier,
                    z: v.z * multiplier
                }));

                if (updateScale0Dynamics(emitter, newDynamics)) {
                    markSystemModified(data, system.name);
                    // Don't increment modified again, same emitter
                }
            }
        }
    }

    return { modified, errors };
}

/**
 * Scale both birthScale0 and scale0 for selected emitters
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Set of "systemName:emitterName" keys
 * @param {number} multiplier - Scale multiplier
 * @returns {{modified: number, errors: string[]}}
 */
export function scaleAll(data, selectedKeys, multiplier) {
    const r1 = scaleBirthScale(data, selectedKeys, multiplier);
    const r2 = scaleScale0(data, selectedKeys, multiplier);

    return {
        modified: r1.modified + r2.modified,
        errors: [...r1.errors, ...r2.errors]
    };
}

/**
 * Set birthScale0 constantValue to specific values
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Selected emitter keys
 * @param {{x: number, y: number, z: number}} value - New value
 * @returns {{modified: number, errors: string[]}}
 */
export function setBirthScale(data, selectedKeys, value) {
    let modified = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (emitter.birthScale0?.constantValue) {
                if (updateBirthScale(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to set birthScale0 for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

/**
 * Set bindWeight to a specific value
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Selected emitter keys
 * @param {number} value - New value (0-1)
 * @returns {{modified: number, errors: string[]}}
 */
export function setBindWeight(data, selectedKeys, value) {
    let modified = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (emitter.bindWeight) {
                if (updateBindWeight(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to update bindWeight for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

/**
 * Add bindWeight to selected emitters that don't have it
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Selected emitter keys
 * @param {number} value - Initial value (default 1)
 * @returns {{added: number, errors: string[]}}
 */
export function addBindWeight(data, selectedKeys, value = 1) {
    let added = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (!emitter.bindWeight) {
                if (insertBindWeight(emitter, value)) {
                    markSystemModified(data, system.name);
                    added++;
                } else {
                    errors.push(`Failed to add bindWeight to ${emitter.name}`);
                }
            }
        }
    }

    return { added, errors };
}

/**
 * Set translationOverride to specific values
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Selected emitter keys
 * @param {{x: number, y: number, z: number}} value - New value
 * @returns {{modified: number, errors: string[]}}
 */
export function setTranslationOverride(data, selectedKeys, value) {
    let modified = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (emitter.translationOverride) {
                if (updateTranslationOverride(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to update translationOverride for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

/**
 * Add translationOverride to selected emitters that don't have it
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Selected emitter keys
 * @param {{x: number, y: number, z: number}} value - Initial value
 * @returns {{added: number, errors: string[]}}
 */
export function addTranslationOverride(data, selectedKeys, value = { x: 0, y: 0, z: 0 }) {
    let added = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (!emitter.translationOverride) {
                if (insertTranslationOverride(emitter, value)) {
                    markSystemModified(data, system.name);
                    added++;
                } else {
                    errors.push(`Failed to add translationOverride to ${emitter.name}`);
                }
            }
        }
    }

    return { added, errors };
}

/**
 * Scale translationOverride for selected emitters
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Selected emitter keys
 * @param {number} multiplier - Scale multiplier
 * @returns {{modified: number, errors: string[]}}
 */
export function scaleTranslationOverride(data, selectedKeys, multiplier) {
    let modified = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (emitter.translationOverride?.constantValue) {
                const oldValue = emitter.translationOverride.constantValue;
                const newValue = {
                    x: oldValue.x * multiplier,
                    y: oldValue.y * multiplier,
                    z: oldValue.z * multiplier
                };

                if (updateTranslationOverride(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to scale translationOverride for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

/**
 * Scale particleLifetime for selected emitters
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Selected emitter keys
 * @param {number} multiplier - Scale multiplier
 * @returns {{modified: number, errors: string[]}}
 */
export function scaleParticleLifetime(data, selectedKeys, multiplier) {
    let modified = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (emitter.particleLifetime?.constantValue != null) {
                // Skip -1 (infinite/forever) - it's a special value
                if (emitter.particleLifetime.constantValue === -1) {
                    continue;
                }

                const newValue = emitter.particleLifetime.constantValue * multiplier;

                if (updateParticleLifetime(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to scale particleLifetime for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

/**
 * Scale lifetime (emitter duration) for selected emitters
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Selected emitter keys
 * @param {number} multiplier - Scale multiplier
 * @returns {{modified: number, errors: string[]}}
 */
export function scaleLifetime(data, selectedKeys, multiplier) {
    let modified = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (emitter.lifetime?.value != null) {
                // Skip -1 (infinite/forever) - it's a special value
                if (emitter.lifetime.value === -1) {
                    continue;
                }

                const newValue = emitter.lifetime.value * multiplier;

                if (updateLifetime(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to scale lifetime for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

/**
 * Scale particleLinger for selected emitters
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Selected emitter keys
 * @param {number} multiplier - Scale multiplier
 * @returns {{modified: number, errors: string[]}}
 */
export function scaleParticleLinger(data, selectedKeys, multiplier) {
    let modified = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (emitter.particleLinger?.value != null) {
                const newValue = emitter.particleLinger.value * multiplier;

                if (updateParticleLinger(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to scale particleLinger for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

/**
 * Set particleLifetime to a specific value
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Selected emitter keys
 * @param {number} value - New value
 * @returns {{modified: number, errors: string[]}}
 */
export function setParticleLifetime(data, selectedKeys, value) {
    let modified = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (emitter.particleLifetime) {
                if (updateParticleLifetime(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to set particleLifetime for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

/**
 * Set lifetime to a specific value
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Selected emitter keys
 * @param {number} value - New value
 * @returns {{modified: number, errors: string[]}}
 */
export function setLifetime(data, selectedKeys, value) {
    let modified = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (emitter.lifetime) {
                if (updateLifetime(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to set lifetime for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

/**
 * Set particleLinger to a specific value
 * @param {Object} data - Parsed data
 * @param {Set<string>} selectedKeys - Selected emitter keys
 * @param {number} value - New value
 * @returns {{modified: number, errors: string[]}}
 */
export function setParticleLinger(data, selectedKeys, value) {
    let modified = 0;
    const errors = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;

            if (!selectedKeys.has(key)) continue;

            if (emitter.particleLinger) {
                if (updateParticleLinger(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to set particleLinger for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

/**
 * Get all emitters matching a filter
 * @param {Object} data - Parsed data
 * @param {Function} filterFn - Filter function (emitter) => boolean
 * @returns {Array<{systemName: string, emitter: Object}>}
 */
export function filterEmitters(data, filterFn) {
    const results = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            if (filterFn(emitter)) {
                results.push({ systemName: system.name, emitter });
            }
        }
    }

    return results;
}

/**
 * Search emitters by name
 * @param {Object} data - Parsed data
 * @param {string} query - Search query (case-insensitive)
 * @returns {Array<{systemName: string, emitter: Object}>}
 */
export function searchEmitters(data, query) {
    const lowerQuery = query.toLowerCase();

    return filterEmitters(data, emitter =>
        emitter.name.toLowerCase().includes(lowerQuery)
    );
}

/**
 * Get all emitters with a specific property
 * @param {Object} data - Parsed data
 * @param {string} property - Property name (birthScale0, scale0, bindWeight, translationOverride)
 * @returns {Array<{systemName: string, emitter: Object}>}
 */
export function getEmittersWithProperty(data, property) {
    return filterEmitters(data, emitter => !!emitter[property]);
}

/**
 * Create selection key for an emitter
 * @param {string} systemName - System name
 * @param {string} emitterName - Emitter name
 * @returns {string} Selection key
 */
export function createEmitterKey(systemName, emitterName) {
    return `${systemName}:${emitterName}`;
}

/**
 * Parse selection key
 * @param {string} key - Selection key
 * @returns {{systemName: string, emitterName: string}}
 */
export function parseEmitterKey(key) {
    const colonIndex = key.indexOf(':');
    return {
        systemName: key.substring(0, colonIndex),
        emitterName: key.substring(colonIndex + 1)
    };
}
