/**
 * BinEditor module - Clean bin/py file editing utilities
 * 
 * Re-exports all utilities for easy import
 */

export { parsePyFile, getParseStats } from './parser.js';
export {
    serializeToFile,
    markSystemModified,
    updateParticleLifetime,
    updateLifetime,
    updateParticleLinger,
    updateRate
} from './serializer.js';
export {
    scaleBirthScale,
    scaleScale0,
    scaleAll,
    setBirthScale,
    setBindWeight,
    addBindWeight,
    setTranslationOverride,
    addTranslationOverride,
    scaleTranslationOverride,
    // Lifetime operations
    scaleParticleLifetime,
    scaleLifetime,
    scaleParticleLinger,
    setParticleLifetime,
    setLifetime,
    setParticleLinger,
    // Utilities
    filterEmitters,
    searchEmitters,
    getEmittersWithProperty,
    createEmitterKey,
    parseEmitterKey
} from './operations.js';
