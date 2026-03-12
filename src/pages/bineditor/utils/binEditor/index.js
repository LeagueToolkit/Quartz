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
    updateRate,
    updatePass,
    updateMiscRenderFlags,
    insertMiscRenderFlags
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
    scalePass,
    setParticleLifetime,
    setLifetime,
    setParticleLinger,
    setPass,
    addPass,
    setMiscRenderFlags,
    addMiscRenderFlags,
    // Utilities
    filterEmitters,
    searchEmitters,
    getEmittersWithProperty,
    createEmitterKey,
    parseEmitterKey
} from './operations.js';
