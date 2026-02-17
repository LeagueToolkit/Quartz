/**
 * WAD Hasher - WAD file hash utilities
 * Uses xxhash for WAD file hashing (64-bit)
 */

// xxh64 implementation (simplified)
function xxh64(input) {
    const PRIME64_1 = 0x9E3779B185EBCA87n;
    const PRIME64_2 = 0xC2B2AE3D27D4EB4Fn;
    const PRIME64_3 = 0x165667919E3779F9n;
    const PRIME64_4 = 0x85EBCA77C2B2AE3Dn;
    const PRIME64_5 = 0x27D4EB2F165667C5n;
    
    let h = 0x9E3779B185EBCA87n; // seed
    const data = Buffer.from(input.toLowerCase(), 'utf-8');
    let i = 0;
    
    // Process 32-byte chunks
    while (i + 32 <= data.length) {
        let v1 = BigInt(data.readUInt32LE(i)) | (BigInt(data.readUInt32LE(i + 4)) << 32n);
        let v2 = BigInt(data.readUInt32LE(i + 8)) | (BigInt(data.readUInt32LE(i + 12)) << 32n);
        let v3 = BigInt(data.readUInt32LE(i + 16)) | (BigInt(data.readUInt32LE(i + 20)) << 32n);
        let v4 = BigInt(data.readUInt32LE(i + 24)) | (BigInt(data.readUInt32LE(i + 28)) << 32n);
        
        v1 = ((v1 * PRIME64_2) & 0xFFFFFFFFFFFFFFFFn) << 13n;
        v1 = v1 ^ (v1 >> 32n);
        v1 = (v1 * PRIME64_1) & 0xFFFFFFFFFFFFFFFFn;
        h = (h ^ v1) & 0xFFFFFFFFFFFFFFFFn;
        h = ((h << 27n) | (h >> 37n)) & 0xFFFFFFFFFFFFFFFFn;
        h = (h * PRIME64_1 + PRIME64_4) & 0xFFFFFFFFFFFFFFFFn;
        
        v2 = ((v2 * PRIME64_2) & 0xFFFFFFFFFFFFFFFFn) << 13n;
        v2 = v2 ^ (v2 >> 32n);
        v2 = (v2 * PRIME64_1) & 0xFFFFFFFFFFFFFFFFn;
        h = (h ^ v2) & 0xFFFFFFFFFFFFFFFFn;
        h = ((h << 27n) | (h >> 37n)) & 0xFFFFFFFFFFFFFFFFn;
        h = (h * PRIME64_1 + PRIME64_4) & 0xFFFFFFFFFFFFFFFFn;
        
        v3 = ((v3 * PRIME64_2) & 0xFFFFFFFFFFFFFFFFn) << 13n;
        v3 = v3 ^ (v3 >> 32n);
        v3 = (v3 * PRIME64_1) & 0xFFFFFFFFFFFFFFFFn;
        h = (h ^ v3) & 0xFFFFFFFFFFFFFFFFn;
        h = ((h << 27n) | (h >> 37n)) & 0xFFFFFFFFFFFFFFFFn;
        h = (h * PRIME64_1 + PRIME64_4) & 0xFFFFFFFFFFFFFFFFn;
        
        v4 = ((v4 * PRIME64_2) & 0xFFFFFFFFFFFFFFFFn) << 13n;
        v4 = v4 ^ (v4 >> 32n);
        v4 = (v4 * PRIME64_1) & 0xFFFFFFFFFFFFFFFFn;
        h = (h ^ v4) & 0xFFFFFFFFFFFFFFFFn;
        h = ((h << 27n) | (h >> 37n)) & 0xFFFFFFFFFFFFFFFFn;
        h = (h * PRIME64_1 + PRIME64_4) & 0xFFFFFFFFFFFFFFFFn;
        
        i += 32;
    }
    
    // Process remaining bytes
    while (i < data.length) {
        let v = BigInt(data[i]);
        v = (v * PRIME64_5) & 0xFFFFFFFFFFFFFFFFn;
        h = (h ^ v) & 0xFFFFFFFFFFFFFFFFn;
        h = ((h << 11n) | (h >> 53n)) & 0xFFFFFFFFFFFFFFFFn;
        h = (h * PRIME64_1) & 0xFFFFFFFFFFFFFFFFn;
        i++;
    }
    
    // Finalize
    h = h ^ BigInt(data.length);
    h = (h ^ (h >> 33n)) & 0xFFFFFFFFFFFFFFFFn;
    h = (h * PRIME64_2) & 0xFFFFFFFFFFFFFFFFn;
    h = (h ^ (h >> 29n)) & 0xFFFFFFFFFFFFFFFFn;
    h = (h * PRIME64_3) & 0xFFFFFFFFFFFFFFFFn;
    h = (h ^ (h >> 32n)) & 0xFFFFFFFFFFFFFFFFn;
    
    return h;
}

export class WADHasher {
    static HASHTABLE_NAMES = [
        'hashes.game.txt',
        'hashes.lcu.txt'
    ];

    /**
     * Convert hex hash to raw name using hashtables
     * @param {Object} hashtables - Hashtable object
     * @param {string} hex - Hex hash string (16 digits for 64-bit)
     * @returns {string} - Raw name or hex if not found
     */
    static hexToRaw(hashtables, hex) {
        if (!hashtables) return hex;
        
        for (let i = WADHasher.HASHTABLE_NAMES.length - 1; i >= 0; i--) {
            const tableName = WADHasher.HASHTABLE_NAMES[i];
            if (hashtables[tableName] && hashtables[tableName][hex.toLowerCase()]) {
                return hashtables[tableName][hex.toLowerCase()];
            }
        }
        return hex;
    }

    /**
     * Convert hash number to hex string (64-bit)
     * @param {BigInt|number} hash - Hash value
     * @returns {string} - Hex string (16 digits)
     */
    static hashToHex(hash) {
        if (typeof hash === 'bigint') {
            return hash.toString(16).padStart(16, '0');
        }
        // For 64-bit, we need to handle it properly
        // JavaScript numbers are 53-bit safe, so we use BigInt
        const bigHash = BigInt(hash);
        return bigHash.toString(16).padStart(16, '0');
    }

    /**
     * Check if string is a hash
     * @param {string} raw - String to check
     * @returns {boolean}
     */
    static isHash(raw) {
        try {
            BigInt('0x' + raw);
            return /^[0-9a-fA-F]+$/.test(raw) && raw.length === 16;
        } catch {
            return false;
        }
    }

    /**
     * Convert raw path to hex hash (64-bit)
     * @param {string} raw - Raw path string
     * @returns {string} - Hex hash (16 digits)
     */
    static rawToHex(raw) {
        const hash = xxh64(raw);
        return hash.toString(16).padStart(16, '0');
    }

    /**
     * Convert raw or hex to hash number
     * @param {string} rawOrHex - Raw name or hex string
     * @returns {BigInt} - Hash value
     */
    static rawOrHexToHash(rawOrHex) {
        try {
            return BigInt('0x' + rawOrHex);
        } catch {
            return xxh64(rawOrHex);
        }
    }
}

