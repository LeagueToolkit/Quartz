/**
 * Helper functions for hashing (FNV1a, etc.)
 */

/**
 * FNV1a hash function
 * @param {string} s - String to hash
 * @returns {number} - 32-bit hash value
 */
export function FNV1a(s) {
    let h = 0x811c9dc5;
    const lower = s.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
        const b = lower.charCodeAt(i);
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF;
    }
    return h >>> 0; // Ensure unsigned 32-bit
}

/**
 * Check if a string is a valid hex hash
 * @param {string} str - String to check
 * @returns {boolean}
 */
export function isHash(str) {
    try {
        parseInt(str, 16);
        return true;
    } catch {
        return false;
    }
}

/**
 * Convert hash to hex string (8 digits, zero-padded)
 * @param {number} hash - Hash value
 * @returns {string}
 */
export function hashToHex(hash) {
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Convert hex string to number
 * @param {string} hex - Hex string
 * @returns {number}
 */
export function hexToHash(hex) {
    return parseInt(hex, 16) >>> 0;
}

