/**
 * WAD Tool
 * Unpacks WAD.client files to directory structure
 */

import { WAD } from '../../jsritofile/wad.js';
import { WADHasher } from '../../jsritofile/wadHasher.js';
import { BytesStream } from '../../jsritofile/stream.js';
import { initCompressionModules } from '../../jsritofile/wadChunk.js';

// Get Node.js modules
let fs = null;
let path = null;

function initNodeModules() {
    // Fast path: already initialized
    if (fs && path) return;
    
    // In Electron renderer, this is synchronous and fast
    if (typeof window !== 'undefined' && window.require) {
        try {
            fs = window.require('fs');
            path = window.require('path');
            return;
        } catch (e) {
            console.error('[WADTool] Failed to require fs/path:', e);
        }
    }
    
    // For pure Node.js (not webpack), we'd need async, but Electron renderer should use window.require
    // This path should rarely be hit in Electron
    if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof __webpack_require__ === 'undefined') {
        console.warn('[WADTool] Using Node.js path (not Electron renderer) - this may be slow');
    }
}

/**
 * Join path components (like Python's lepath.join)
 * @param {...string} parts - Path parts
 * @returns {string}
 */
function joinPath(...parts) {
    if (!path) {
        // Fallback: simple join with forward slashes
        return parts.filter(p => p).join('/');
    }
    return path.join(...parts);
}

/**
 * Get relative path (like Python's lepath.rel)
 * @param {string} fullPath - Full path
 * @param {string} basePath - Base path
 * @returns {string}
 */
function getRelativePath(fullPath, basePath) {
    if (!path) {
        // Fallback: simple relative path
        if (fullPath.startsWith(basePath)) {
            return fullPath.substring(basePath.length).replace(/^[\/\\]/, '');
        }
        return fullPath;
    }
    return path.relative(basePath, fullPath);
}

/**
 * Unpack WAD file to directory
 * @param {string} wadFilePath - Path to WAD file
 * @param {string} outputDir - Output directory
 * @param {Object} hashtables - Hashtables for unhash (optional)
 * @param {Function|null} filter - Filter function (optional)
 * @param {Function|null} progressCallback - Progress callback (count, message)
 * @returns {Promise<Object>} - Result with extracted files info
 */
export async function unpackWAD(wadFilePath, outputDir, hashtables = null, filter = null, progressCallback = null) {
    const totalStart = Date.now();
    console.log(`[WADTool] unpackWAD called - starting...`);
    
    // Initialize modules synchronously (fast in Electron)
    initNodeModules();
    
    if (!fs || !path) {
        throw new Error('fs/path modules not available. This code requires Node.js/Electron environment.');
    }
    
    // Read WAD file asynchronously to prevent UI blocking
    console.log(`[WADTool] Reading WAD file from disk...`);
    const readStart = Date.now();
    const wadBuffer = await fs.promises.readFile(wadFilePath);
    const readTime1 = Date.now() - readStart;
    console.log(`[WADTool] File read from disk: ${(readTime1 / 1000).toFixed(2)}s (${(wadBuffer.length / 1024 / 1024).toFixed(1)} MB)`);
    
    console.log(`[WADTool] Parsing WAD structure...`);
    const parseStart = Date.now();
    const wad = await new WAD().read(wadBuffer);
    const parseTime = Date.now() - parseStart;
    console.log(`[WADTool] WAD parsed: ${(parseTime / 1000).toFixed(2)}s`);
    
    const readTime = readTime1 + parseTime;
    
    if (progressCallback) {
        progressCallback(0, `Starting WAD extraction: ${path.basename(wadFilePath)}`);
    }
    
    // Minimal logging to reduce overhead
    console.log(`[WADTool] Unpacking ${wad.chunks.length} chunks from ${path.basename(wadFilePath)}`);
    
    // Unhash chunk hashes using hashtables
    const unhashStart = Date.now();
    if (hashtables) {
        wad.unHash(hashtables);
    }
    const unhashTime = Date.now() - unhashStart;
    if (hashtables) {
        console.log(`[WADTool] Unhash took: ${(unhashTime / 1000).toFixed(2)}s`);
    }
    
    const hashedFiles = {};
    
    // Filter chunks if needed
    const chunksToProcess = filter 
        ? wad.chunks.filter(chunk => filter(chunk.hash))
        : wad.chunks;
    
    // Check for OneDrive and path length issues (warnings only)
    const outputDirLower = outputDir.toLowerCase();
    const isOneDrivePath = outputDirLower.includes('onedrive');
    if (isOneDrivePath) {
        console.warn(`[WADTool] WARNING: OneDrive path detected: ${outputDir}`);
        console.warn(`[WADTool] OneDrive can cause sync delays and file creation issues`);
        console.warn(`[WADTool] Consider using a local path for better performance`);
    }
    if (outputDir.length > 200) {
        console.warn(`[WADTool] WARNING: Long output path detected (${outputDir.length} chars)`);
        console.warn(`[WADTool] This may cause Windows path length issues`);
    }
    
    // Pre-calculate all file paths and collect directories (like Python)
    const filePaths = new Map();
    const allDirs = new Set();
    
    for (const chunk of chunksToProcess) {
        let filePath = joinPath(outputDir, chunk.hash);
        
        // Add extension if known and hash is still a hash
        if (WADHasher.isHash(chunk.hash) && chunk.extension) {
            const ext = '.' + chunk.extension;
            if (!filePath.endsWith(ext)) {
                filePath += ext;
            }
        }
        
        // Windows path handling: Check if file should use hash-based name
        // Based on Python implementation: basename > 255, full path > 200, or malformed paths
        const basename = path.basename(filePath);
        const basenameLen = basename.length;
        const fullPathLen = filePath.length;
        let needsHashPath = false;
        
        // Check if basename is too long (Windows limit: 255 chars)
        if (basenameLen > 255) {
            needsHashPath = true;
        }
        
        // Check if full path is approaching Windows limit (use 200 as safety margin)
        if (fullPathLen > 200) {
            needsHashPath = true;
        }
        
        // Check if path looks malformed (multiple repeated segments)
        const pathParts = filePath.split(/[\/\\]/);
        const partCounts = {};
        for (const part of pathParts) {
            if (part) {
                partCounts[part] = (partCounts[part] || 0) + 1;
                if (partCounts[part] > 2) {
                    console.warn(`[WADTool] WARNING: Path has repeated segments, using hash fallback: ${filePath}`);
                    needsHashPath = true;
                    break;
                }
            }
        }
        
        // Use hash-based name if needed (flat structure to avoid path length issues)
        if (needsHashPath) {
            let hashBasename;
            if (WADHasher.isHash(chunk.hash)) {
                // Already a hash, use it directly
                hashBasename = chunk.hash;
            } else {
                // Convert to hex hash
                hashBasename = WADHasher.rawToHex(chunk.hash);
            }
            
            // Add extension if present
            if (chunk.extension) {
                hashBasename += '.' + chunk.extension;
            }
            
            // Put in flat structure (root of outputDir) to avoid path length issues
            const hashedFilePath = joinPath(outputDir, hashBasename);
            hashedFiles[hashBasename] = chunk.hash;
            filePath = hashedFilePath;
        }
        
        filePaths.set(chunk, filePath);
        allDirs.add(path.dirname(filePath));
    }
    
    // Create all directories upfront (parallel) - like Python's first pass
    // OneDrive-aware directory creation (optimized)
    const mkdirStart = Date.now();
    await Promise.all(Array.from(allDirs).map(async (dirPath) => {
        try {
            await fs.promises.mkdir(dirPath, { recursive: true });
            
            // OneDrive sync delay for .bin file directories (like Python)
            if (isOneDrivePath) {
                const dirPathLower = dirPath.toLowerCase();
                // Check if this directory will contain .bin files (heuristic: check if any chunk path uses this dir)
                const hasBinFiles = Array.from(filePaths.values()).some(fp => 
                    path.dirname(fp) === dirPath && fp.toLowerCase().endsWith('.bin')
                );
                if (hasBinFiles) {
                    // Minimal delay only for critical .bin file directories (10ms)
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
        } catch (error) {
            // Log directory creation errors with context
            if (error.code !== 'EEXIST') {
                console.warn(`[WADTool] Warning: Failed to create directory ${dirPath}: ${error.message}`);
                console.warn(`[WADTool] Directory path length: ${dirPath.length} chars`);
                console.warn(`[WADTool] OneDrive path: ${isOneDrivePath ? 'Yes' : 'No'}`);
            }
            // Continue anyway - the file creation will handle it
        }
    }));
    const mkdirTime = Date.now() - mkdirStart;
    console.log(`[WADTool] Created directories: ${(mkdirTime / 1000).toFixed(2)}s`);
    
    // Pre-initialize compression modules ONCE before processing
    const initStart = Date.now();
    await initCompressionModules();
    const initTime = Date.now() - initStart;
    console.log(`[WADTool] Init compression: ${(initTime / 1000).toFixed(2)}s`);
    
    // OPTIMIZED: Pipeline approach - parallel reads/decompression with overlapped writes
    // Read batch N+1 while writing batch N to maximize CPU and I/O utilization
    let extractedCount = 0;
    const processStart = Date.now();
    
    const PIPELINE_BATCH = 250; // Read/decompress in batches of 250
    const WRITE_BATCH = 150;    // Write in batches of 150
    
    // Helper function to write a batch of files
    // Use synchronous writes for small files (<1MB) to reduce async overhead
    // Includes OneDrive handling and Windows path fallbacks
    const writeBatch = async (writeQueue) => {
        if (writeQueue.length === 0) return 0;
        
        const writePromises = writeQueue.map(async ({ filePath, data, chunk }) => {
            try {
                // OneDrive sync delay for .bin files (like Python implementation)
                const filePathLower = filePath.toLowerCase();
                if (isOneDrivePath && filePathLower.endsWith('.bin')) {
                    // Minimal delay only for critical .bin files (10ms)
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                
                // Check if file exists as directory (name collision)
                try {
                    const stats = await fs.promises.stat(filePath).catch(() => null);
                    if (stats && stats.isDirectory()) {
                        throw new Error('File path exists as directory');
                    }
                } catch (statError) {
                    // Ignore if file doesn't exist (expected)
                }
                
                // Use sync writes for small files (faster for many small files)
                if (data.length < 1024 * 1024) {
                    fs.writeFileSync(filePath, data);
                } else {
                    await fs.promises.writeFile(filePath, data);
                }
                chunk.freeData();
                return true;
            } catch (error) {
                // Enhanced error handling with hash fallback (like Python)
                const errorCode = error.code || '';
                const isPathError = errorCode === 'ENAMETOOLONG' || 
                                   errorCode === 'ENOENT' ||
                                   error.message.includes('path') ||
                                   error.message.includes('directory');
                
                // Log error details
                console.warn(`[WADTool] Warning: Failed to write ${filePath}: ${error.message}`);
                console.warn(`[WADTool] Path length: ${filePath.length} chars, OneDrive: ${isOneDrivePath ? 'Yes' : 'No'}`);
                
                // Try with shorter path by using hash (if path > 200 chars or path error)
                if (filePath.length > 200 || isPathError) {
                    try {
                        if (chunk.data) {
                            console.log(`[WADTool] Attempting fallback with shorter path...`);
                            
                            let hashBasename;
                            if (WADHasher.isHash(chunk.hash)) {
                                hashBasename = chunk.hash;
                            } else {
                                hashBasename = WADHasher.rawToHex(chunk.hash);
                            }
                            
                            if (chunk.extension) {
                                hashBasename += '.' + chunk.extension;
                            }
                            
                            const shortFilePath = joinPath(outputDir, hashBasename);
                            console.log(`[WADTool] Fallback path: ${shortFilePath} (length: ${shortFilePath.length} chars)`);
                            
                            // Ensure directory exists
                            await fs.promises.mkdir(path.dirname(shortFilePath), { recursive: true }).catch(() => {});
                            
                            // OneDrive delay for .bin files in fallback too
                            if (isOneDrivePath && hashBasename.endsWith('.bin')) {
                                await new Promise(resolve => setTimeout(resolve, 10));
                            }
                            
                            // Write with fallback path
                            if (chunk.data.length < 1024 * 1024) {
                                fs.writeFileSync(shortFilePath, chunk.data);
                            } else {
                                await fs.promises.writeFile(shortFilePath, chunk.data);
                            }
                            
                            hashedFiles[hashBasename] = chunk.hash;
                            console.log(`[WADTool] Fallback: Unpack: ${hashBasename} (original: ${chunk.hash})`);
                            chunk.freeData();
                            return true;
                        }
                    } catch (e2) {
                        console.error(`[WADTool] Error: Failed to write even with short path: ${e2.message}`);
                        console.error(`[WADTool] This may indicate OneDrive sync issues or permission problems`);
                    }
                } else {
                    console.error(`[WADTool] Error: Failed to write ${filePath}: ${error.message}`);
                    console.error(`[WADTool] This may be due to OneDrive sync delays or permission issues`);
                }
                
                chunk.freeData();
                return false;
            }
        });
        
        const results = await Promise.all(writePromises);
        return results.filter(r => r).length;
    };
    
    let writeQueue = [];
    let writePendingPromise = Promise.resolve();
    
    // Process in pipeline batches
    for (let i = 0; i < chunksToProcess.length; i += PIPELINE_BATCH) {
        const batchEnd = Math.min(i + PIPELINE_BATCH, chunksToProcess.length);
        const batch = chunksToProcess.slice(i, batchEnd);
        
        // Parallel read/decompress for this batch
        // Each chunk needs its own BytesStream since they seek to different offsets
        const readPromises = batch.map(async (chunk) => {
            try {
                const chunkBs = new BytesStream(wadBuffer);
                await chunk.readData(chunkBs);
                return chunk;
            } catch (error) {
                if (chunk.data) {
                    chunk.freeData();
                }
                return null;
            }
        });
        
        await Promise.all(readPromises);
        
        // Add successfully read chunks to write queue
        for (const chunk of batch) {
            if (chunk.data) {
                const filePath = filePaths.get(chunk);
                writeQueue.push({ filePath, data: chunk.data, chunk });
            }
        }
        
        // Write in parallel batches (non-blocking pipeline)
        // Start writing when queue is full or at the end
        if (writeQueue.length >= WRITE_BATCH || batchEnd >= chunksToProcess.length) {
            // Wait for previous writes to complete
            await writePendingPromise;
            
            // Start new write batch (don't await - pipeline it)
            const currentWriteQueue = writeQueue.slice();
            writeQueue = [];
            
            writePendingPromise = writeBatch(currentWriteQueue).then(count => {
                extractedCount += count;
                return count;
            });
        }
        
        // Progress updates
        if (progressCallback && i % 500 === 0) {
            progressCallback(extractedCount, `Extracted ${extractedCount}/${chunksToProcess.length} files...`);
        }
    }
    
    // Wait for final writes to complete
    await writePendingPromise;
    
    // Write any remaining files
    if (writeQueue.length > 0) {
        extractedCount += await writeBatch(writeQueue);
    }
    
    const processTime = Date.now() - processStart;
    console.log(`[WADTool] Processed all chunks: ${(processTime / 1000).toFixed(2)}s (${(extractedCount / (processTime / 1000)).toFixed(0)} chunks/s)`);
    
    if (progressCallback) {
        progressCallback(extractedCount, `Extracted ${extractedCount}/${chunksToProcess.length} files...`);
    }
    
    // Remove empty directories (optimized - only check directories we created, bottom-up)
    const removeEmptyDirsStart = Date.now();
    if (allDirs.size > 0) {
        // Convert to array and sort by depth (deepest first) for bottom-up processing
        const dirsArray = Array.from(allDirs);
        dirsArray.sort((a, b) => {
            // Count path separators to determine depth
            const depthA = (a.match(/[\/\\]/g) || []).length;
            const depthB = (b.match(/[\/\\]/g) || []).length;
            return depthB - depthA; // Deeper directories first
        });
        
        // Process directories in parallel batches (but check sequentially to avoid race conditions)
        // Only check directories we created - much faster than recursive walk
        for (const dirPath of dirsArray) {
            try {
                const entries = await fs.promises.readdir(dirPath).catch(() => []);
                if (entries.length === 0) {
                    await fs.promises.rmdir(dirPath).catch(() => {});
                }
            } catch (error) {
                // Ignore errors (directory might not exist or be inaccessible)
            }
        }
    }
    const removeEmptyDirsTime = Date.now() - removeEmptyDirsStart;
    console.log(`[WADTool] removeEmptyDirs took ${(removeEmptyDirsTime / 1000).toFixed(2)}s`);
    
    // Write hashed_files.json if needed
    const jsonStart = Date.now();
    if (Object.keys(hashedFiles).length > 0) {
        const hashedFilesPath = joinPath(outputDir, 'hashed_files.json');
        await fs.promises.writeFile(hashedFilesPath, JSON.stringify(hashedFiles, null, 4), 'utf-8');
    }
    const jsonTime = Date.now() - jsonStart;
    if (Object.keys(hashedFiles).length > 0) {
        console.log(`[WADTool] Wrote hashed_files.json: ${(jsonTime / 1000).toFixed(2)}s`);
    }
    
    const totalTime = Date.now() - totalStart;
    console.log(`[WADTool] Total time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`[WADTool] Breakdown: read=${(readTime / 1000).toFixed(2)}s, unhash=${(unhashTime / 1000).toFixed(2)}s, mkdir=${(mkdirTime / 1000).toFixed(2)}s, init=${(initTime / 1000).toFixed(2)}s, process=${(processTime / 1000).toFixed(2)}s, cleanup=${(removeEmptyDirsTime / 1000).toFixed(2)}s, json=${(jsonTime / 1000).toFixed(2)}s`);
    
    if (progressCallback) {
        progressCallback(extractedCount, `Extracted ${extractedCount} files from WAD`);
    }
    
    console.log(`[WADTool] Done: ${extractedCount} files`);
    
    // MEMORY CLEANUP: Explicitly clear large objects to help garbage collection
    // Clear references to help GC reclaim memory immediately (non-blocking)
    filePaths.clear();
    allDirs.clear();
    
    // Note: wadBuffer (~185MB for main WAD, ~28MB for voiceover) and wad object 
    // will be eligible for GC when this function returns. Memory will be reclaimed
    // by Node.js GC automatically when needed - no need to force it (which is slow).
    
    return {
        success: true,
        extractedCount,
        hashedFiles,
        outputDir
    };
}








