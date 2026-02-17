/**
 * BIN Hasher - Hash lookup and conversion utilities
 */

import { FNV1a, hashToHex, isHash } from './helper.js';

export class BINHasher {
    static HASHTABLE_NAMES = [
        'hashes.binentries.txt',
        'hashes.binhashes.txt',
        'hashes.bintypes.txt',
        'hashes.binfields.txt',
        'hashes.game.txt',
        'hashes.lcu.txt'
    ];

    /**
     * Convert hex hash to raw name using hashtables
     * @param {Object} hashtables - Hashtable object with loaded hash files
     * @param {string} hex - Hex hash string
     * @returns {string} - Raw name or hex if not found
     */
    static hexToRaw(hashtables, hex) {
        if (!hashtables) return hex;
        
        // Check hashtables in reverse order (priority)
        for (let i = BINHasher.HASHTABLE_NAMES.length - 1; i >= 0; i--) {
            const tableName = BINHasher.HASHTABLE_NAMES[i];
            if (hashtables[tableName] && hashtables[tableName][hex.toLowerCase()]) {
                return hashtables[tableName][hex.toLowerCase()];
            }
        }
        return hex;
    }

    /**
     * Convert raw name to hex hash
     * @param {string} raw - Raw name string
     * @returns {string} - Hex hash (8 digits)
     */
    static rawToHex(raw) {
        return hashToHex(FNV1a(raw));
    }

    /**
     * Convert hash number to hex string
     * @param {number} hash - Hash value
     * @returns {string} - Hex string (8 digits)
     */
    static hashToHex(hash) {
        return hashToHex(hash);
    }

    /**
     * Check if string is a hash
     * @param {string} raw - String to check
     * @returns {boolean}
     */
    static isHash(raw) {
        return isHash(raw);
    }

    /**
     * Convert raw or hex to hash number
     * @param {string} rawOrHex - Raw name or hex string
     * @returns {number} - Hash value
     */
    static rawOrHexToHash(rawOrHex) {
        if (isHash(rawOrHex)) {
            return parseInt(rawOrHex, 16) >>> 0;
        }
        return FNV1a(rawOrHex);
    }
}

