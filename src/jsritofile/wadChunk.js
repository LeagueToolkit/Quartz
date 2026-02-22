/**
 * WAD Chunk
 * Represents a single chunk in a WAD file.
 *
 * readData() now takes a FileHandle (fs.promises.open) rather than a BytesStream.
 * This eliminates the need to load the full WAD buffer into memory.
 */

import { WADCompressionType } from './wadTypes.js';
import { WADExtensioner } from './wadExtensioner.js';
import { WADHasher } from './wadHasher.js';

let zlib = null;
let gunzip = null;        // promisified async version (no UI freeze)
let zstdDecompress = null;
let compressionInitialized = false;
let compressionInitPromise = null;

export async function initCompressionModules() {
    if (compressionInitialized) return;
    if (compressionInitPromise) return compressionInitPromise;

    compressionInitPromise = (async () => {
        try {
            let nodeRequire;
            if (typeof window !== 'undefined' && window.require) {
                nodeRequire = window.require;
            } else if (typeof process !== 'undefined' && process.versions?.node && typeof __webpack_require__ === 'undefined') {
                const { createRequire } = await import('module');
                nodeRequire = createRequire(import.meta.url);
            } else {
                throw new Error('Cannot load compression modules in this environment');
            }

            zlib = nodeRequire('zlib');
            // P0-1: Use promisified async gunzip — never blocks the event loop
            const { promisify } = nodeRequire('util');
            gunzip = promisify(zlib.gunzip);

            try {
                const mongodbZstd = nodeRequire('@mongodb-js/zstd');
                zstdDecompress = mongodbZstd.decompress;
                console.log('[WADChunk] Using @mongodb-js/zstd for Zstd decompression');
            } catch (e) {
                throw new Error(`@mongodb-js/zstd not available: ${e.message}`);
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
     * Read and decompress chunk data using a file descriptor.
     * P0-2: reads only the bytes for this chunk at its offset — no full-file buffer needed.
     *
     * @param {import('fs').promises.FileHandle} fd
     */
    async readData(fd) {
        await initCompressionModules();

        if (this.compressed_size === 0) {
            this.data = Buffer.alloc(0);
            return;
        }

        // Read compressed bytes directly at the chunk's absolute file offset
        const raw = Buffer.alloc(this.compressed_size);
        try {
            const { bytesRead } = await fd.read(raw, 0, this.compressed_size, this.offset);
            if (bytesRead < this.compressed_size) {
                console.warn(`[WADChunk] Short read on chunk ${this.id}: expected ${this.compressed_size}, got ${bytesRead}`);
            }
        } catch (readErr) {
            throw new Error(`Failed to read chunk ${this.id} at offset ${this.offset}: ${readErr.message}`);
        }

        // Decompress
        if (this.compression_type === WADCompressionType.Raw) {
            this.data = raw;
        } else if (this.compression_type === WADCompressionType.Gzip) {
            if (!gunzip) throw new Error('zlib not available for Gzip decompression');
            // P0-1: async — does not block the renderer event loop
            this.data = await gunzip(raw);
        } else if (this.compression_type === WADCompressionType.Satellite) {
            this.data = null;
            console.warn(`[WADChunk] Satellite compression not supported (chunk ${this.id})`);
        } else if (this.compression_type === WADCompressionType.Zstd) {
            if (!zstdDecompress) throw new Error(`Zstd not available (chunk ${this.id})`);
            this.data = await zstdDecompress(raw);
        } else if (this.compression_type === WADCompressionType.ZstdChunked) {
            if (raw.length >= 4 && raw[0] === 0x28 && raw[1] === 0xB5 && raw[2] === 0x2F && raw[3] === 0xFD) {
                if (!zstdDecompress) throw new Error(`Zstd not available (chunk ${this.id})`);
                this.data = await zstdDecompress(raw);
            } else {
                this.data = raw;
            }
        } else {
            throw new Error(`Unknown compression type ${this.compression_type} on chunk ${this.id}`);
        }

        // Size validation
        if (this.data && this.data.length !== this.decompressed_size) {
            console.warn(`[WADChunk] Size mismatch on chunk ${this.id}: expected ${this.decompressed_size}, got ${this.data.length}`);
        }

        // Guess extension from magic bytes if not already known
        if (this.extension === null && this.data) {
            this.extension = WADExtensioner.guessExtension(this.data);
        }
    }

    freeData() {
        this.data = null;
    }
}
