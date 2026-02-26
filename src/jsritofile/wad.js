/**
 * WAD File Reader
 * Reads and parses WAD.client files
 */

import { BytesStream } from './stream.js';
import { WADChunk } from './wadChunk.js';
import { WADHasher } from './wadHasher.js';
import { WADCompressionType } from './wadTypes.js';
import { WADExtensioner } from './wadExtensioner.js';

// Get Node.js modules
let fs = null;
let path = null;

async function initNodeModules() {
    if (fs && path) return;
    
    try {
        if (typeof window !== 'undefined' && window.require) {
            // Electron renderer process
            fs = window.require('fs');
            path = window.require('path');
        } else if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof __webpack_require__ === 'undefined') {
            // Pure Node.js (not webpack) - use createRequire
            try {
                const { createRequire } = await import('module');
                const nodeRequire = createRequire(import.meta.url);
                fs = nodeRequire('fs');
                path = nodeRequire('path');
            } catch (e) {
                console.error('[WAD] Failed to load module/createRequire:', e);
            }
        }
    } catch (e) {
        console.error('[WAD] Failed to initialize fs/path:', e);
    }
}

export class WAD {
    constructor() {
        this.signature = null;
        this.version = null;
        this.chunks = [];
    }

    /**
     * Read WAD file
     * @param {string|Buffer} filePath - File path or Buffer
     * @returns {Promise<WAD>}
     */
    async read(filePath) {
        await initNodeModules();
        
        let buffer;
        if (Buffer.isBuffer(filePath)) {
            buffer = filePath;
        } else {
            if (!fs) {
                throw new Error('fs module not available. This code requires Node.js/Electron environment.');
            }
            // Use async readFile to prevent UI blocking
            buffer = await fs.promises.readFile(filePath);
        }
        
        const bs = new BytesStream(buffer);
        
        // Read signature
        this.signature = bs.readString(2, 'ascii');
        if (this.signature !== 'RW') {
            throw new Error(`Wrong file signature: ${this.signature}. Expected 'RW'.`);
        }
        
        // Read version
        const major = bs.readU8();
        const minor = bs.readU8();
        this.version = parseFloat(`${major}.${minor}`);
        
        if (major > 3) {
            throw new Error(`Unsupported WAD version: ${this.version}`);
        }
        
        let wadChecksum = 0;
        
        // Read version-specific header
        if (major === 2) {
            const ecdsaLen = bs.readU8();
            bs.pad(83); // Pad 83 bytes
            wadChecksum = bs.readU64();
        } else if (major === 3) {
            bs.pad(256); // Pad 256 bytes
            wadChecksum = bs.readU64();
        }
        
        // Read TOC info for version 1 and 2
        if (major === 1 || major === 2) {
            const tocStartOffset = bs.readU16();
            const tocFileEntrySize = bs.readU16();
        }
        
        // Read chunk count
        const chunkCount = bs.readU32();
        
        // Read chunks
        this.chunks = [];
        for (let chunkId = 0; chunkId < chunkCount; chunkId++) {
            const chunk = new WADChunk();
            chunk.id = chunkId;
            
            // Read hash (u64)
            const hashValue = bs.readU64();
            chunk.hash = WADHasher.hashToHex(hashValue);
            
            // Read chunk info
            chunk.offset = bs.readU32();
            chunk.compressed_size = bs.readU32();
            chunk.decompressed_size = bs.readU32();
            
            // Read compression type (u8)
            // The byte contains: lower 4 bits = compression type, upper 4 bits = subchunk count
            const compressionByte = bs.readU8();
            // Lower 4 bits = compression type
            chunk.compression_type = compressionByte & 15;
            // Upper 4 bits = subchunk count
            chunk.subchunk_count = (compressionByte >> 4) & 15;
            
            // Read duplicated flag (bool)
            chunk.duplicated = bs.readBool();
            
            // Read subchunk start (u16)
            chunk.subchunk_start = bs.readU16();
            
            // Read checksum (u64) - only for version >= 2
            if (major >= 2) {
                chunk.checksum = bs.readU64();
            } else {
                chunk.checksum = 0;
            }
            
            this.chunks.push(chunk);
        }
        
        return this;
    }

    /**
     * Unhash chunk hashes to file paths using hashtables
     * @param {Object} hashtables - Hashtable object
     */
    unHash(hashtables) {
        if (!hashtables) return;
        
        for (const chunk of this.chunks) {
            if (!chunk.path_hash_hex) chunk.path_hash_hex = chunk.hash;
            chunk.hash = WADHasher.hexToRaw(hashtables, chunk.hash);
            
            // If hash contains a dot and extension is not set, try to get extension from path
            if (chunk.hash.includes('.') && chunk.extension === null) {
                chunk.extension = WADExtensioner.getExtension(chunk.hash);
            }
        }
        
        // Sort chunks by hash (like Python)
        this.chunks.sort((a, b) => {
            if (a.hash < b.hash) return -1;
            if (a.hash > b.hash) return 1;
            return 0;
        });
    }

    /**
     * Async/chunked version of unHash to avoid blocking Electron main thread.
     * @param {Object} hashtables
     * @param {Object} options
     * @param {number} options.batchSize
     */
    async unHashAsync(hashtables, options = {}) {
        if (!hashtables) return;
        const batchSize = Math.max(256, Number(options.batchSize || 1200));

        for (let i = 0; i < this.chunks.length; i++) {
            const chunk = this.chunks[i];
            if (!chunk.path_hash_hex) chunk.path_hash_hex = chunk.hash;
            chunk.hash = WADHasher.hexToRaw(hashtables, chunk.hash);

            if (chunk.hash.includes('.') && chunk.extension === null) {
                chunk.extension = WADExtensioner.getExtension(chunk.hash);
            }

            if ((i + 1) % batchSize === 0) {
                await new Promise((resolve) => setImmediate(resolve));
            }
        }

        this.chunks.sort((a, b) => {
            if (a.hash < b.hash) return -1;
            if (a.hash > b.hash) return 1;
            return 0;
        });
    }

    /**
     * Get chunks matching a filter function
     * @param {Function} compareFunc - Filter function
     * @returns {Array<WADChunk>}
     */
    getItems(compareFunc) {
        return this.chunks.filter(compareFunc);
    }
}






