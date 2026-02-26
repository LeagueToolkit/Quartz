/**
 * WAD Tool — Canonical implementation
 * Unpacks WAD.client files to a directory structure.
 * Works in Electron renderer (window.require) and Node.js main process (ESM dynamic import).
 *
 * Fixes applied vs original:
 *   P0-1  gunzipSync → async gunzip (wadChunk.js)
 *   P0-2  fd-based reads: never loads full ~200MB WAD into memory
 *   P0-4  True pipeline: decompress and write overlap via independent concurrency pools
 *   P1-7  Progress reported from write completion, throttled by time (not batch index)
 *   P1-8  Empty-dir cleanup uses rmdir (ENOTEMPTY = skip) — no readdir per dir
 *   P1-9  Path traversal validation before any write
 *   P1-12 Path-too-long threshold raised to 248 (was 200)
 *   P2-14 Removed cargo-cult null-assignment GC "help"
 *   P2-15 Simplified concurrency config (no navigator.deviceMemory guessing)
 */

import { WAD } from '../../jsritofile/wad.js';
import { WADHasher } from '../../jsritofile/wadHasher.js';
import { initCompressionModules } from '../../jsritofile/wadChunk.js';

let fs = null;
let path = null;

async function initNodeModules() {
    if (fs && path) return;

    if (typeof window !== 'undefined' && window.require) {
        // Electron renderer
        fs = window.require('fs');
        path = window.require('path');
        return;
    }

    if (typeof process !== 'undefined' && process.versions?.node && typeof __webpack_require__ === 'undefined') {
        // Node.js / Electron main process (ESM)
        const { createRequire } = await import('module');
        const nodeRequire = createRequire(import.meta.url);
        fs = nodeRequire('fs');
        path = nodeRequire('path');
    }
}

// ---------------------------------------------------------------------------
// Semaphore — bounds concurrent writes independently of decompress concurrency
// ---------------------------------------------------------------------------
class Semaphore {
    constructor(n) { this.slots = n; this.queue = []; }
    acquire() {
        if (this.slots > 0) { this.slots--; return Promise.resolve(); }
        return new Promise(resolve => this.queue.push(resolve));
    }
    release() {
        if (this.queue.length > 0) this.queue.shift()();
        else this.slots++;
    }
}

// ---------------------------------------------------------------------------
// mapWithConcurrency — run worker(item) with at most `concurrency` in flight
// ---------------------------------------------------------------------------
async function mapWithConcurrency(items, concurrency, worker) {
    if (items.length === 0) return [];
    const results = new Array(items.length);
    let nextIndex = 0;
    const runWorker = async () => {
        while (nextIndex < items.length) {
            const i = nextIndex++;
            results[i] = await worker(items[i], i);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
    return results;
}

function joinPath(...parts) {
    if (!path) return parts.filter(Boolean).join('/');
    return path.join(...parts);
}

// ---------------------------------------------------------------------------
// unpackWAD
// ---------------------------------------------------------------------------

/**
 * Unpack a WAD.client file to a directory.
 *
 * @param {string} wadFilePath
 * @param {string} outputDir
 * @param {Object|null} hashtables
 * @param {Function|null} filter  - (hash: string, chunk: object) => boolean
 * @param {Function|null} progressCallback - (count: number, message: string) => void
 * @returns {Promise<{ success: boolean, extractedCount: number, hashedFiles: Object, outputDir: string }>}
 */
export async function unpackWAD(wadFilePath, outputDir, hashtables = null, filter = null, progressCallback = null, options = {}) {
    const totalStart = Date.now();
    console.log('[WADTool] unpackWAD starting...');

    await initNodeModules();
    if (!fs || !path) throw new Error('fs/path not available — requires Node.js/Electron.');

    // -------------------------------------------------------------------------
    // 1. Open fd and read only the header + TOC (P0-2)
    //    A 4 MB slice is enough for any realistic WAD (<125 k chunks × 32 B each).
    //    Chunk data is read later at its absolute offset — the full file is never
    //    loaded into memory.
    // -------------------------------------------------------------------------
    const fd = await fs.promises.open(wadFilePath, 'r');
    try {
        const stat = await fd.stat();
        const tocReadSize = Math.min(4 * 1024 * 1024, stat.size);
        const tocBuffer = Buffer.alloc(tocReadSize);
        const { bytesRead } = await fd.read(tocBuffer, 0, tocReadSize, 0);
        console.log(`[WADTool] TOC read ${(Date.now() - totalStart)}ms (file: ${(stat.size / 1024 / 1024).toFixed(1)} MB)`);

        // -------------------------------------------------------------------------
        // 2. Parse WAD structure from the TOC slice
        // -------------------------------------------------------------------------
        const parseStart = Date.now();
        const wad = await new WAD().read(bytesRead < tocReadSize ? tocBuffer.slice(0, bytesRead) : tocBuffer);
        console.log(`[WADTool] Parsed ${wad.chunks.length} chunks in ${Date.now() - parseStart}ms`);

        // Step 0 — compression stats (always logged; helps diagnose Gzip presence)
        const cStats = { raw: 0, gzip: 0, zstd: 0, zstdChunked: 0, satellite: 0, unknown: 0 };
        for (const c of wad.chunks) {
            if      (c.compression_type === 0) cStats.raw++;
            else if (c.compression_type === 1) cStats.gzip++;
            else if (c.compression_type === 2) cStats.satellite++;
            else if (c.compression_type === 3) cStats.zstd++;
            else if (c.compression_type === 4) cStats.zstdChunked++;
            else                               cStats.unknown++;
        }
        console.table(cStats);

        // -------------------------------------------------------------------------
        // 3. Unhash
        // options.hashResolver(hexHashes) => string[] — native LMDB path (skips JS hashtable load)
        // hashtables                                  — legacy JS in-memory path
        // -------------------------------------------------------------------------
        const { hashResolver } = options || {};
        if (typeof hashResolver === 'function') {
            const t = Date.now();
            const hexHashes = wad.chunks.map(c => String(c.hash));
            const resolved = hashResolver(hexHashes);
            let resolvedCount = 0;
            for (let i = 0; i < wad.chunks.length; i++) {
                if (resolved?.[i]) {
                    wad.chunks[i].hash = resolved[i];
                    resolvedCount++;
                }
            }
            console.log(`[WADTool] hashResolver: ${resolvedCount}/${wad.chunks.length} resolved in ${Date.now() - t}ms`);
        } else if (hashtables) {
            const t = Date.now();
            wad.unHash(hashtables);
            console.log(`[WADTool] Unhash ${Date.now() - t}ms`);
        }

        progressCallback?.(0, `Starting WAD extraction: ${path.basename(wadFilePath)}`);

        // -------------------------------------------------------------------------
        // 4. Apply optional filter
        // -------------------------------------------------------------------------
        const chunksToProcess = filter ? wad.chunks.filter(c => filter(c.hash, c)) : wad.chunks;
        console.log(`[WADTool] Chunks to process: ${chunksToProcess.length}`);

        // OneDrive / long-path warnings
        const isOneDrivePath = outputDir.toLowerCase().includes('onedrive');
        if (isOneDrivePath) console.warn('[WADTool] OneDrive path detected — extraction will be slower');
        if (outputDir.length > 248) console.warn(`[WADTool] Long output path (${outputDir.length} chars)`);

        const resolvedOutputDir = path.resolve(outputDir);
        const resolvedOutputDirSlash = resolvedOutputDir + path.sep;

        // -------------------------------------------------------------------------
        // 5. Pre-compute file paths (with path traversal guard) (P1-9, P1-12)
        // -------------------------------------------------------------------------
        const filePaths = new Map();   // chunk → absolute filePath
        const allDirs   = new Set();
        const hashedFiles = {};

        for (const chunk of chunksToProcess) {
            let filePath = joinPath(outputDir, chunk.hash);

            // Append extension when chunk.hash is still a raw hex hash
            if (WADHasher.isHash(chunk.hash) && chunk.extension) {
                const ext = '.' + chunk.extension;
                if (!filePath.endsWith(ext)) filePath += ext;
            }

            // P1-9: Path traversal guard
            const resolved = path.resolve(filePath);
            if (resolved !== resolvedOutputDir && !resolved.startsWith(resolvedOutputDirSlash)) {
                console.warn(`[WADTool] Path traversal blocked for chunk ${chunk.id}: ${chunk.hash}`);
                continue;
            }

            // P1-12: Hash fallback for paths that are too long or have repeated segments
            let needsHashPath = false;
            if (path.basename(filePath).length > 255) needsHashPath = true;
            if (filePath.length > 248) needsHashPath = true;

            if (!needsHashPath) {
                const parts = filePath.split(/[/\\]/);
                const seen = {};
                for (const part of parts) {
                    if (part) {
                        seen[part] = (seen[part] || 0) + 1;
                        if (seen[part] > 2) { needsHashPath = true; break; }
                    }
                }
            }

            if (needsHashPath) {
                const hexName = WADHasher.isHash(chunk.hash) ? chunk.hash : WADHasher.rawToHex(chunk.hash);
                const hashBasename = chunk.extension ? `${hexName}.${chunk.extension}` : hexName;
                filePath = joinPath(outputDir, hashBasename);
                hashedFiles[hashBasename] = chunk.hash;
            }

            filePaths.set(chunk, filePath);
            allDirs.add(path.dirname(filePath));
        }

        // -------------------------------------------------------------------------
        // 6. Create directories up front (parallel)
        // -------------------------------------------------------------------------
        const mkdirStart = Date.now();
        await Promise.all(Array.from(allDirs).map(async dir => {
            await fs.promises.mkdir(dir, { recursive: true }).catch(err => {
                if (err.code !== 'EEXIST') console.warn(`[WADTool] mkdir failed ${dir}: ${err.message}`);
            });
            // Tiny delay for OneDrive dirs to avoid sync-trigger races
            if (isOneDrivePath) await new Promise(r => setTimeout(r, 5));
        }));
        console.log(`[WADTool] Directories created: ${Date.now() - mkdirStart}ms`);

        // -------------------------------------------------------------------------
        // 7. Init compression once before the hot loop
        // -------------------------------------------------------------------------
        await initCompressionModules();

        // -------------------------------------------------------------------------
        // 8. True pipeline: decompress (CPU) + write (IO) with independent pools
        //
        //    DECOMPRESS_CONCURRENCY goroutines run readData(fd) in parallel.
        //    Each one acquires a write semaphore slot before firing the writeFile.
        //    This means:
        //      - At most DECOMPRESS_CONCURRENCY chunks are being decompressed at once
        //      - At most WRITE_CONCURRENCY writes are in-flight at once
        //      - Decompression and writes genuinely overlap (P0-4)
        //      - Memory is bounded: max (DECOMPRESS_CONCURRENCY + WRITE_CONCURRENCY) chunks live at once
        //
        //    On NVMe:  write is fast, mostly CPU-bound → DECOMPRESS_CONCURRENCY is the bottleneck
        //    On HDD:   write is slow, IO-bound → WRITE_CONCURRENCY > DECOMPRESS_CONCURRENCY gives overlap
        //    OneDrive: write is very slow → large WRITE_CONCURRENCY wastes nothing (semaphore queues)
        // -------------------------------------------------------------------------
        const DECOMPRESS_CONCURRENCY = 8;
        const WRITE_CONCURRENCY = 16;

        const writeSem = new Semaphore(WRITE_CONCURRENCY);
        const writePromises = [];
        let extractedCount = 0;
        let lastProgressTime = Date.now();

        const replaceExisting = options?.replaceExisting !== false;

        // Write helper with hash-fallback on path errors
        const writeChunk = async (filePath, chunk) => {
            try {
                // For unresolved hash names, extension can be discovered only after readData().
                // Ensure final write path carries guessed extension (e.g. PROP/PTCH -> .bin).
                if (WADHasher.isHash(chunk.hash) && chunk.extension) {
                    const ext = `.${String(chunk.extension).toLowerCase()}`;
                    if (!filePath.toLowerCase().endsWith(ext)) {
                        filePath = `${filePath}${ext}`;
                        await fs.promises.mkdir(path.dirname(filePath), { recursive: true }).catch(() => {});
                    }
                }
                if (isOneDrivePath && filePath.toLowerCase().endsWith('.bin')) {
                    await new Promise(r => setTimeout(r, 10));
                }
                if (!replaceExisting) {
                    try {
                        await fs.promises.access(filePath, fs.constants.F_OK);
                        chunk.freeData();
                        return false;
                    } catch (_) {}
                }
                await fs.promises.writeFile(filePath, chunk.data);
                chunk.freeData();
                return true;
            } catch (error) {
                const isPathError = error.code === 'ENAMETOOLONG' || error.code === 'ENOENT' || filePath.length > 248;
                if (isPathError && chunk.data) {
                    try {
                        const hexName = WADHasher.isHash(chunk.hash) ? chunk.hash : WADHasher.rawToHex(chunk.hash);
                        const hashBasename = chunk.extension ? `${hexName}.${chunk.extension}` : hexName;
                        const shortPath = joinPath(outputDir, hashBasename);
                        await fs.promises.mkdir(path.dirname(shortPath), { recursive: true }).catch(() => {});
                        if (!replaceExisting) {
                            try {
                                await fs.promises.access(shortPath, fs.constants.F_OK);
                                chunk.freeData();
                                return false;
                            } catch (_) {}
                        }
                        await fs.promises.writeFile(shortPath, chunk.data);
                        hashedFiles[hashBasename] = chunk.hash;
                        chunk.freeData();
                        return true;
                    } catch (e2) {
                        console.error(`[WADTool] Write failed even with hash fallback: ${e2.message}`);
                    }
                } else {
                    console.warn(`[WADTool] Write failed ${filePath}: ${error.message}`);
                }
                chunk.freeData();
                return false;
            }
        };

        const processStart = Date.now();
        const validChunks = Array.from(filePaths.keys());
        let skippedCount = 0;

        await mapWithConcurrency(validChunks, DECOMPRESS_CONCURRENCY, async (chunk) => {
            // Decompress (CPU + libuv thread pool for fd.read)
            try {
                await chunk.readData(fd);
            } catch (err) {
                console.warn(`[WADTool] Decompress failed chunk ${chunk.id}: ${err.message}`);
                if (chunk.data) chunk.freeData();
                return;
            }

            if (!chunk.data) return;

            const filePath = filePaths.get(chunk);

            // Acquire a write slot — this is the backpressure mechanism.
            // If 16 writes are already in-flight, decompressors queue here
            // rather than decompressing into unbounded memory.
            await writeSem.acquire();

            // Fire write without awaiting — decompressor slot is freed immediately
            const p = writeChunk(filePath, chunk)
                .then(success => {
                    if (success) {
                        extractedCount++;
                        // P1-7: progress from write completion, throttled by time not batch index
                        const now = Date.now();
                        if (now - lastProgressTime > 200) {
                            lastProgressTime = now;
                            progressCallback?.(extractedCount, `Extracted ${extractedCount}/${chunksToProcess.length} files...`);
                        }
                    } else {
                        skippedCount++;
                    }
                })
                .finally(() => writeSem.release());

            writePromises.push(p);
        });

        // Drain all in-flight writes
        await Promise.all(writePromises);

        const processMs = Date.now() - processStart;
        console.log(`[WADTool] Extraction: ${(processMs / 1000).toFixed(2)}s — ${extractedCount} files @ ${(extractedCount / (processMs / 1000)).toFixed(0)}/s`);

        // -------------------------------------------------------------------------
        // 9. Remove empty directories (P1-8)
        //    Sort deepest first, try rmdir — ENOTEMPTY means the dir has files, skip.
        //    Avoids a readdir call per directory.
        // -------------------------------------------------------------------------
        const dirsDeepestFirst = Array.from(allDirs).sort((a, b) =>
            (b.match(/[/\\]/g) || []).length - (a.match(/[/\\]/g) || []).length
        );
        await Promise.all(dirsDeepestFirst.map(dir => fs.promises.rmdir(dir).catch(() => {})));

        // -------------------------------------------------------------------------
        // 10. Write hashed_files.json if any hashed names were used
        // -------------------------------------------------------------------------
        if (Object.keys(hashedFiles).length > 0) {
            await fs.promises.writeFile(
                joinPath(outputDir, 'hashed_files.json'),
                JSON.stringify(hashedFiles, null, 2),
                'utf-8'
            );
        }

        const totalMs = Date.now() - totalStart;
        console.log(`[WADTool] Total: ${(totalMs / 1000).toFixed(2)}s — ${extractedCount} files extracted`);

        progressCallback?.(extractedCount, `Extracted ${extractedCount} files from WAD`);

        return { success: true, extractedCount, skippedCount, hashedFiles, outputDir };

    } finally {
        // Always release the file descriptor
        await fd.close().catch(() => {});
    }
}
