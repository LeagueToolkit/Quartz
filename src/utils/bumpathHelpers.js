/**
 * Bumpath Helper Functions
 * Utility functions for path handling, hashing, etc.
 */

import { WADHasher } from '../jsritofile/index.js';

/**
 * Unify path to hash format (like Python's unify_path)
 * @param {string} filePath - File path
 * @returns {string} - Unified hash or path
 */
export function unifyPath(filePath) {
    // Normalize path separators
    filePath = filePath.replace(/\\/g, '/');
    
    // If path is already a hash
    if (WADHasher.isHash(filePath)) {
        return filePath;
    }
    
    // If basename is a hash
    const pathParts = filePath.split('/');
    const basename = pathParts[pathParts.length - 1];
    const basenameWithoutExt = basename.split('.')[0];
    if (WADHasher.isHash(basenameWithoutExt)) {
        return basenameWithoutExt;
    }
    
    // Convert raw path to hash
    return WADHasher.rawToHex(filePath);
}

/**
 * Add prefix to path (like Python's bum_path)
 * @param {string} filePath - File path
 * @param {string} prefix - Prefix to add
 * @returns {string} - Path with prefix
 */
export function bumPath(filePath, prefix) {
    if (!filePath || !prefix) {
        return filePath;
    }
    
    filePath = filePath.trim();
    
    // Check if prefix is already applied
    if (filePath.includes(`/${prefix}/`) || filePath.startsWith(`${prefix}/`)) {
        return filePath;
    }
    
    // Add prefix after first folder
    if (filePath.includes('/')) {
        const firstSlash = filePath.indexOf('/');
        return filePath.substring(0, firstSlash) + `/${prefix}` + filePath.substring(firstSlash);
    } else {
        return `${prefix}/${filePath}`;
    }
}

/**
 * Check if path is a character BIN file
 * @param {string} filePath - File path
 * @returns {boolean}
 */
export function isCharacterBin(filePath) {
    const lower = filePath.toLowerCase();
    if (lower.includes('characters/') && lower.endsWith('.bin')) {
        const parts = lower.split('characters/')[1].replace('.bin', '').split('/');
        return parts.length >= 2 && parts[0] === parts[1];
    }
    return false;
}

/**
 * Normalize path to lowercase with forward slashes
 * @param {string} filePath - File path
 * @returns {string} - Normalized path
 */
export function normalizePath(filePath) {
    return filePath.toLowerCase().replace(/\\/g, '/');
}




