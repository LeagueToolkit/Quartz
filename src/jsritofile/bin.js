/**
 * BIN - Main BIN file parser
 */

import { BytesStream } from './stream.js';
import { BINHasher } from './binHasher.js';
import { BINReader, BINEntry } from './binReader.js';
import { BINWriter } from './binWriter.js';
import { fixBINType } from './binTypes.js';

// Get Node.js modules (Electron or Node.js environment)
// Lazy initialization to avoid webpack trying to resolve 'module'
let fs = null;
let path = null;
let initPromise = null;

async function initNodeModules() {
    if (fs && path) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        if (typeof window !== 'undefined' && window.require) {
            // Electron environment
            fs = window.require('fs');
            path = window.require('path');
        } else if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof __webpack_require__ === 'undefined') {
            // Node.js environment (not webpack) - use createRequire from module
            // Skip in webpack environment to avoid static analysis
            try {
                const getModuleName = () => 'module';
                const { createRequire } = await import(getModuleName());
                const nodeRequire = createRequire(import.meta.url);
                fs = nodeRequire('fs');
                path = nodeRequire('path');
            } catch (e) {
                // Will be initialized later when needed
                fs = null;
                path = null;
            }
        }
    })();

    return initPromise;
}

// Try to initialize immediately if we're in Node.js (non-blocking)
if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions && process.versions.node) {
    initNodeModules().catch(() => {
        // Will be initialized later when needed
    });
}

export class BINPatch {
    constructor(hash = null, path = null, type = null, data = null) {
        this.hash = hash;
        this.path = path;
        this.type = type;
        this.data = data;
    }
}

export class BIN {
    constructor() {
        this.signature = null;
        this.version = null;
        this.isPatch = false;
        this.links = [];
        this.entries = [];
        this.patches = [];
    }

    /**
     * Read a BIN file
     * @param {string|Buffer} filePath - Path to BIN file or Buffer
     * @param {Object} hashtables - Optional hashtables for hash lookup
     * @returns {BIN}
     */
    async read(filePath, hashtables = null) {
        // Initialize fs/path if not already done
        if (!fs || !path) {
            await initNodeModules();
        }
        let buffer;
        if (Buffer.isBuffer(filePath)) {
            buffer = filePath;
        } else {
            if (!fs) throw new Error('fs module not available. This code requires Node.js/Electron environment.');
            // Use async readFile to prevent UI blocking
            buffer = await fs.promises.readFile(filePath);
        }

        const bs = BytesStream.from(buffer);

        // Read signature
        this.signature = bs.readString(4, 'utf-8');
        if (this.signature !== 'PROP' && this.signature !== 'PTCH') {
            throw new Error(`Wrong file signature: ${this.signature}`);
        }

        if (this.signature === 'PTCH') {
            this.isPatch = true;
            bs.pad(8); // patch header
            const magic = bs.readString(4, 'utf-8');
            if (magic !== 'PROP') {
                throw new Error('Missing PROP after PTCH signature');
            }
        }

        // Read version
        this.version = bs.readU32();
        if (this.version < 1 || this.version > 3) {
            throw new Error(`Unsupported file version: ${this.version}`);
        }

        // Read links (version >= 2)
        this.links = [];
        if (this.version >= 2) {
            const linkCount = bs.readU32();
            for (let i = 0; i < linkCount; i++) {
                this.links.push(bs.readStringSized16('utf-8'));
            }
        }

        // Read entries
        const entryCount = bs.readU32();
        const entryTypesRaw = bs.readU32(entryCount);
        // Ensure entryTypes is always an array (readU32 returns single value when count=1)
        const entryTypes = Array.isArray(entryTypesRaw) ? entryTypesRaw : [entryTypesRaw];
        const entryOffset = bs.tell();

        this.entries = [];

        try {
            // Try reading as new BIN format
            bs.legacyRead = false;
            for (let i = 0; i < entryCount; i++) {
                const entry = new BINEntry();
                entry.type = BINHasher.hashToHex(entryTypes[i]);
                bs.pad(4); // size
                entry.hash = BINHasher.hashToHex(bs.readU32());
                const fieldCount = bs.readU16();
                entry.data = [];
                for (let j = 0; j < fieldCount; j++) {
                    entry.data.push(BINReader.readField(bs));
                }
                this.entries.push(entry);
            }
        } catch (error) {
            // Fall back to legacy format
            if (error.name === 'ValueError' || error.message.includes('ValueError')) {
                bs.seek(entryOffset);
                bs.legacyRead = true;
                for (let i = 0; i < entryCount; i++) {
                    const entry = new BINEntry();
                    entry.type = BINHasher.hashToHex(entryTypes[i]);
                    bs.pad(4); // size
                    entry.hash = BINHasher.hashToHex(bs.readU32());
                    const fieldCount = bs.readU16();
                    entry.data = [];
                    for (let j = 0; j < fieldCount; j++) {
                        entry.data.push(BINReader.readField(bs));
                    }
                    this.entries.push(entry);
                }
            } else {
                // Re-throw other errors
                throw error;
            }
        }

        // Read patches (for PTCH files with version >= 3)
        if (this.isPatch && this.version >= 3) {
            const patchCount = bs.readU32();
            this.patches = [];
            for (let i = 0; i < patchCount; i++) {
                const patch = new BINPatch();
                patch.hash = BINHasher.hashToHex(bs.readU32());
                bs.pad(4); // size
                const patchType = bs.readU8();
                patch.type = fixBINType(bs, patchType);
                patch.path = bs.readStringSized16('utf-8');
                patch.data = BINReader.readValue(bs, patch.type);
                this.patches.push(patch);
            }
        }

        return this;
    }

    /**
     * Write BIN file
     * @param {string} filePath - Path to write BIN file
     * @param {boolean} raw - If true, return buffer instead of writing to file
     * @returns {Promise<Buffer|null>} - Buffer if raw=true, null otherwise
     */
    async write(filePath, raw = false) {
        // Initialize fs/path if not already done
        if (!fs || !path) {
            await initNodeModules();
        }
        const bs = BytesStream.writer();
        bs.sizeOffsets = []; // Track size offsets to fill in later

        // Write header
        if (this.isPatch) {
            bs.writeString('PTCH', 'utf-8');
            bs.writeU32(1); // patch header
        }
        bs.writeString('PROP', 'utf-8');
        bs.writeU32(this.version || 3); // version

        // Write links
        bs.writeU32(this.links.length);
        for (const link of this.links) {
            bs.writeStringSized16(link, 'utf-8');
        }

        // Write entry types + entries
        bs.writeU32(this.entries.length);
        for (const entry of this.entries) {
            bs.writeU32(BINHasher.rawOrHexToHash(entry.type));
        }

        // Write entries with size placeholders
        for (const entry of this.entries) {
            const sizeOffset = bs.tell();
            bs.writeU32(0); // size placeholder
            let entrySize = 4 + 2; // hash + field count

            bs.writeU32(BINHasher.rawOrHexToHash(entry.hash));
            bs.writeU16(entry.data.length);
            for (const field of entry.data) {
                entrySize += BINWriter.writeField(bs, field, true);
            }

            // Update size
            const currentPos = bs.tell();
            bs.seek(sizeOffset);
            bs.writeU32(entrySize);
            bs.seek(currentPos);
        }

        // Write patches (for PTCH files with version >= 3)
        if (this.isPatch && this.version >= 3) {
            bs.writeU32(this.patches.length);
            for (const patch of this.patches) {
                bs.writeU32(BINHasher.rawOrHexToHash(patch.hash));

                const sizeOffset = bs.tell();
                bs.writeU32(0); // size placeholder
                let patchSize = 1 + 2 + Buffer.from(patch.path, 'utf-8').length; // type + path size + path

                bs.writeU8(patch.type);
                bs.writeStringSized16(patch.path, 'utf-8');
                patchSize += BINWriter.writeValue(bs, patch.data, patch.type, false);

                // Update size
                const currentPos = bs.tell();
                bs.seek(sizeOffset);
                bs.writeU32(patchSize);
                bs.seek(currentPos);
            }
        }

        const buffer = bs.raw();

        if (raw) {
            return buffer;
        } else {
            if (!fs) throw new Error('fs module not available. This code requires Node.js/Electron environment.');
            // Use async writeFile to prevent UI blocking
            await fs.promises.writeFile(filePath, buffer);
            return null;
        }
    }

    /**
     * Get entry by hash
     * @param {string} hash - Entry hash (hex string)
     * @returns {BINEntry|null}
     */
    getEntryByHash(hash) {
        const hashLower = hash.toLowerCase();
        return this.entries.find(e => e.hash.toLowerCase() === hashLower) || null;
    }

    /**
     * Convert to JSON (for debugging)
     * @returns {Object}
     */
    toJSON() {
        return {
            signature: this.signature,
            version: this.version,
            isPatch: this.isPatch,
            links: this.links,
            entries: this.entries.map(e => ({
                type: e.type,
                hash: e.hash,
                data: e.data
            }))
        };
    }
}

const DEFAULT_TABLE_NAMES = [
    'hashes.binentries.txt',
    'hashes.binhashes.txt',
    'hashes.bintypes.txt',
    'hashes.binfields.txt',
    'hashes.game.txt',
    'hashes.lcu.txt'
];
const WAD_HASHES = ['hashes.game.txt', 'hashes.lcu.txt'];
const hashtablesCache = new Map();

// ---------------------------------------------------------------------------
// Idle TTL: cache stays warm across consecutive extractions in a session,
// but is freed 30 s after the last call to loadHashtables.
// ---------------------------------------------------------------------------
const HASHTABLE_IDLE_TTL_MS = 30_000;
let _ttlTimer = null;

function _resetHashtableTTL() {
    if (_ttlTimer !== null) clearTimeout(_ttlTimer);
    _ttlTimer = setTimeout(() => {
        hashtablesCache.clear();
        _ttlTimer = null;
        console.log('[bin.js] Hashtables cache cleared after idle TTL');
        // Request V8 to return freed pages to the OS immediately.
        // Only available when Electron/Node is launched with --expose-gc.
        if (typeof global !== 'undefined' && typeof global.gc === 'function') {
            global.gc();
            console.log('[bin.js] global.gc() called to return heap pages to OS');
        }
    }, HASHTABLE_IDLE_TTL_MS);
}

/**
 * Load hashtables from directory (optimized for speed - Python-style fixed slicing)
 * @param {string} hashtablesPath - Path to hashtables directory
 * @param {Object} options - Optional settings
 * @param {string[]} options.tables - Subset of table names to load
 * @returns {Promise<Object>} - Hashtables object
 */
export async function loadHashtables(hashtablesPath, options = {}) {
    const requestedTables = Array.isArray(options.tables) && options.tables.length > 0
        ? options.tables
        : DEFAULT_TABLE_NAMES;
    const tableNames = Array.from(new Set(requestedTables)).sort();
    const cacheKey = `${hashtablesPath}::${tableNames.join('|')}`;

    // Reset idle timer on every call — keeps cache alive during active use
    _resetHashtableTTL();

    if (hashtablesCache.has(cacheKey)) {
        return hashtablesCache.get(cacheKey);
    }

    const hashtables = {};

    // Initialize fs/path if not already done
    if (!fs || !path) {
        await initNodeModules();
    }
    if (!path || !fs) throw new Error('path/fs modules not available. This code requires Node.js/Electron environment.');

    // Process all files in parallel for better performance
    const loadPromises = tableNames.map(async (tableName) => {
        const tablePath = path.join(hashtablesPath, tableName);
        try {
            // Read file asynchronously
            const content = await fs.promises.readFile(tablePath, 'utf-8');
            const table = {};

            // Use fixed-position slicing like Python (MUCH faster than parsing)
            // Format: "XXXXXXXX path/to/file" (8 chars for BIN, 16 chars for WAD)
            const sep = WAD_HASHES.includes(tableName) ? 16 : 8;

            let pos = 0;
            const len = content.length;

            while (pos < len) {
                // Find line end
                let lineEnd = content.indexOf('\n', pos);
                if (lineEnd === -1) lineEnd = len;

                // Skip short lines and comments
                if (lineEnd - pos > sep && content[pos] !== '#') {
                    // Direct slice like Python: line[:sep] = hash, line[sep+1:-1] = name
                    const hash = content.substring(pos, pos + sep);
                    // Skip separator (space) and get name (exclude trailing \r if present)
                    let nameEnd = lineEnd;
                    if (nameEnd > 0 && content[nameEnd - 1] === '\r') nameEnd--;
                    const name = content.substring(pos + sep + 1, nameEnd);

                    if (hash && name) {
                        table[hash] = name;
                    }
                }

                pos = lineEnd + 1;
            }

            return { tableName, table };
        } catch (error) {
            // File doesn't exist or can't be read, skip it
            return { tableName, table: null };
        }
    });

    // Wait for all files to load in parallel
    const results = await Promise.all(loadPromises);

    // Build hashtables object
    for (const { tableName, table } of results) {
        if (table) {
            hashtables[tableName] = table;
        }
    }

    hashtablesCache.set(cacheKey, hashtables);
    return hashtables;
}

/**
 * Clear the internal hashtables cache
 * Useful when hashes are updated at runtime
 */
export function clearHashtablesCache() {
    hashtablesCache.clear();
    console.log('[bin.js] Hashtables cache cleared');
}
