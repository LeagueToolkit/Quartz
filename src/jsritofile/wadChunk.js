/**
 * WAD Chunk
 * Represents a single chunk in a WAD file
 */

import { WADCompressionType } from './wadTypes.js';
import { WADExtensioner } from './wadExtensioner.js';
import { BytesStream } from './stream.js';
import { WADHasher } from './wadHasher.js';

// Get Node.js modules for compression (cached after first init)
let zlib = null;
let zstdDecompress = null;
let compressionInitialized = false;
let compressionInitPromise = null;

// Initialize compression modules (only runs ONCE, cached)
// Exported so it can be called once before processing many chunks
export async function initCompressionModules() {
    // Fast path: already initialized
    if (compressionInitialized) return;
    
    // Prevent multiple concurrent initializations
    if (compressionInitPromise) return compressionInitPromise;
    
    compressionInitPromise = (async () => {
        try {
            // zlib is built-in Node.js
            if (typeof process !== 'undefined' && process.versions && process.versions.node) {
                // In Electron, use window.require if available
                if (typeof window !== 'undefined' && window.require) {
                    // Electron renderer process
                    zlib = window.require('zlib');
                    
                    // Use @mongodb-js/zstd (recommended)
                    try {
                        const mongodbZstd = window.require('@mongodb-js/zstd');
                        zstdDecompress = mongodbZstd.decompress;
                        console.log('[WADChunk] Using @mongodb-js/zstd for Zstd decompression');
                    } catch (e) {
                        console.error('[WADChunk] Failed to load @mongodb-js/zstd:', e.message);
                        throw new Error('@mongodb-js/zstd not available. Install with: npm install @mongodb-js/zstd');
                    }
                } else if (typeof __webpack_require__ === 'undefined') {
                    // Pure Node.js (not webpack) - use createRequire
                    const { createRequire } = await import('module');
                    const nodeRequire = createRequire(import.meta.url);
                    zlib = nodeRequire('zlib');
                    
                    // Use @mongodb-js/zstd (recommended)
                    try {
                        const mongodbZstd = nodeRequire('@mongodb-js/zstd');
                        zstdDecompress = mongodbZstd.decompress;
                        console.log('[WADChunk] Using @mongodb-js/zstd for Zstd decompression');
                    } catch (e) {
                        console.error('[WADChunk] Failed to load @mongodb-js/zstd:', e.message);
                        throw new Error('@mongodb-js/zstd not available. Install with: npm install @mongodb-js/zstd');
                    }
                } else {
                    // Webpack environment - cannot load native modules
                    throw new Error('Cannot load compression modules in webpack environment');
                }
            }
            compressionInitialized = true;
        } catch (e) {
            console.error('[WADChunk] Failed to initialize compression modules:', e);
            throw e;
        }
    })();
    
    return compressionInitPromise;
}

export class WADChunk {
    constructor() {
        this.id = null;
        this.hash = null;
        this.offset = 0;
        this.compressed_size = 0;
        this.decompressed_size = 0;
        this.compression_type = WADCompressionType.Raw;
        this.duplicated = false;
        this.subchunk_start = 0;
        this.subchunk_count = 0;
        this.checksum = 0;
        this.data = null;
        this.extension = null;
    }

    /**
     * Read and decompress chunk data
     * @param {BytesStream} bs - BytesStream positioned at chunk data
     */
    async readData(bs) {
        // Initialize compression modules if needed
        await initCompressionModules();
        
        // Save current position
        const savedOffset = bs.tell();
        
        // Seek to chunk offset
        bs.seek(this.offset);
        
        // Read compressed data
        const raw = bs.read(this.compressed_size);
        
        // Decompress based on compression type
        if (this.compression_type === WADCompressionType.Raw) {
            this.data = raw;
        } else if (this.compression_type === WADCompressionType.Gzip) {
            if (!zlib) {
                throw new Error('zlib module not available for Gzip decompression');
            }
            this.data = zlib.gunzipSync(raw);
        } else if (this.compression_type === WADCompressionType.Satellite) {
            // Satellite is not supported
            this.data = null;
            console.warn(`[WADChunk] Satellite compression not supported for chunk ${this.id}`);
        } else if (this.compression_type === WADCompressionType.Zstd) {
            if (!zstdDecompress) {
                throw new Error(`Zstd decompression not available for chunk ${this.id}. Install @mongodb-js/zstd: npm install @mongodb-js/zstd`);
            }
            try {
                // @mongodb-js/zstd.decompress returns a Promise
                this.data = await zstdDecompress(raw);
            } catch (error) {
                throw new Error(`Failed to decompress Zstd chunk ${this.id}: ${error.message}`);
            }
        } else if (this.compression_type === WADCompressionType.ZstdChunked) {
            // Check if it starts with zstd magic
            if (raw.length >= 4 && raw[0] === 0x28 && raw[1] === 0xB5 && raw[2] === 0x2F && raw[3] === 0xFD) {
                if (!zstdDecompress) {
                    throw new Error(`Zstd decompression not available for chunk ${this.id}. Install @mongodb-js/zstd: npm install @mongodb-js/zstd`);
                }
                try {
                    // @mongodb-js/zstd.decompress returns a Promise
                    this.data = await zstdDecompress(raw);
                } catch (error) {
                    throw new Error(`Failed to decompress ZstdChunked chunk ${this.id}: ${error.message}`);
                }
            } else {
                // Not actually compressed
                this.data = raw;
            }
        } else {
            throw new Error(`Unknown compression type: ${this.compression_type}`);
        }
        
        // Verify decompressed size
        if (this.data && this.data.length !== this.decompressed_size) {
            console.warn(`[WADChunk] Decompressed size mismatch: expected ${this.decompressed_size}, got ${this.data.length}`);
        }
        
        // Guess extension if not set
        if (this.extension === null && this.data) {
            this.extension = WADExtensioner.guessExtension(this.data);
        }
        
        // Restore position
        bs.seek(savedOffset);
    }

    /**
     * Free chunk data to save memory
     */
    freeData() {
        this.data = null;
    }
}







