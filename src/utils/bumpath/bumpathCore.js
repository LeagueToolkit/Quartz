/**
 * Bumpath Core - Main bumpath logic
 * Native JavaScript implementation using jsritofile
 */

import { BIN, BINType, BINHasher, loadHashtables } from '../../jsritofile/index.js';
import { unifyPath, bumPath, isCharacterBin, normalizePath } from './bumpathHelpers.js';
import { scanBinForAssets, copyAsset } from './bumpathAssetScanner.js';

// Get Node.js modules (Electron or Node.js environment)
// This will be set dynamically based on environment
let fs = null;
let path = null;
let initPromise = null;

// Initialize fs/path - call this function to set them up (async for ES modules)
async function initNodeModules() {
    if (fs && path) return; // Already initialized
    if (initPromise) return initPromise; // Already initializing

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
                console.error('[BumpathCore] Failed to initialize fs/path:', e);
                // fs/path will remain null
            }
        }
    })();

    return initPromise;
}

// Try to initialize immediately if we're in Node.js (non-blocking)
if (typeof window === 'undefined') {
    initNodeModules().catch(() => {
        // Will be initialized later when needed
    });
}

/**
 * Bumpath class - Main bumpath functionality
 */
export class BumpathCore {
    constructor() {
        this.sourceDirs = [];
        this.sourceFiles = {}; // Map: unifyPath -> {fullPath, relPath}
        this.sourceBins = {}; // Map: unifyPath -> bool (selected state, like Python)
        this.scannedTree = {}; // Map: entryHash -> {unifyPath -> {exists, path}}
        this.entryPrefix = {}; // Map: entryHash -> prefix
        this.entryName = {}; // Map: entryHash -> name
        this.entryTypeName = {}; // Map: entryHash -> type name
        this.hashtables = null; // Loaded hashtables for hash lookup
        this.hashtablesPath = null; // Path to hashtables directory
        this.nativeAddon = null; // Native addon for hash resolution
        this.skipSfxRepath = false; // Optional: bypass SFX path repathing
    }

    /**
     * Set native addon for hash resolution
     * @param {Object} addon - Native addon object
     */
    setNativeAddon(addon) {
        this.nativeAddon = addon;
    }

    /**
     * Reset all state
     */
    reset() {
        this.sourceDirs = [];
        this.sourceFiles = {};
        this.sourceBins = {};
        this.scannedTree = {};
        this.entryPrefix = {};
        this.entryName = {};
        this.entryTypeName = {};
        this.skipSfxRepath = false;
    }

    _isBlockedSfxPath(value) {
        if (!this.skipSfxRepath || typeof value !== 'string') return false;
        const norm = value.replace(/\\/g, '/').toLowerCase();
        return /(^|\/)sounds\/wwise2016\/sfx(\/|$)/i.test(norm);
    }

    /**
     * Add source directories and discover files
     * @param {string[]} sourceDirs - Array of source directory paths
     * @returns {Object} - {source_files, source_bins}
     */
    async addSourceDirs(sourceDirs) {
        // Initialize fs/path if not already done
        if (!fs || !path) {
            await initNodeModules();
        }

        this.sourceDirs = [...new Set([...this.sourceDirs, ...sourceDirs])];

        // Discover all files in source directories
        for (const sourceDir of sourceDirs) {
            // Normalize the source directory path
            const normalizedSourceDir = path.resolve(sourceDir);
            await this._discoverFiles(normalizedSourceDir, normalizedSourceDir);
        }

        // Convert to frontend format (like Python backend does)
        const sourceBinsFormatted = {};
        for (const [unify, selected] of Object.entries(this.sourceBins)) {
            const fileInfo = this.sourceFiles[unify];
            if (fileInfo) {
                sourceBinsFormatted[unify] = {
                    selected: selected,
                    rel_path: fileInfo.relPath
                };
            }
        }

        return {
            source_files: this.sourceFiles,
            source_bins: sourceBinsFormatted
        };
    }

    /**
     * Discover files in a directory recursively
     * @param {string} currentDir - Current directory being scanned
     * @param {string} baseSourceDir - Original source directory (for relative path calculation)
     * @private
     */
    async _discoverFiles(currentDir, baseSourceDir) {
        if (!fs || !path) {
            await initNodeModules();
        }
        if (!fs || !fs.existsSync(currentDir)) return;

        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory()) {
                    await this._discoverFiles(fullPath, baseSourceDir);
                } else if (entry.isFile()) {
                    // Calculate relative path from the BASE source directory, not current directory
                    const relPath = path.relative(baseSourceDir, fullPath);
                    const normalizedRelPath = normalizePath(relPath);
                    const unify = unifyPath(normalizedRelPath);

                    // Don't overwrite existing entries (priority: first found)
                    if (!this.sourceFiles[unify]) {
                        this.sourceFiles[unify] = {
                            fullPath,
                            relPath: normalizedRelPath
                        };

                        // Track BIN files (just boolean like Python)
                        if (entry.name.toLowerCase().endsWith('.bin')) {
                            this.sourceBins[unify] = false;
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error discovering files in ${currentDir}:`, error);
        }
    }

    /**
     * Update BIN selection
     * @param {Object} binSelections - Map: unifyPath -> selected (bool)
     */
    updateBinSelection(binSelections) {
        for (const [unifyPathKey, selected] of Object.entries(binSelections)) {
            if (unifyPathKey in this.sourceBins) {
                this.sourceBins[unifyPathKey] = selected;
            }
        }
    }

    /**
     * Scan selected BIN files and extract asset references
     * @param {string} hashtablesPath - Path to hashtables directory (optional)
     * @returns {Promise<Object>} - Scanned data
     */
    async scan(hashtablesPath = null) {
        this.scannedTree = {};
        this.entryPrefix = {};
        this.entryName = {};
        this.entryTypeName = {};

        // Load hashtables if path provided
        if (hashtablesPath && fs && fs.existsSync(hashtablesPath)) {
            this.hashtablesPath = hashtablesPath;
            try {
                // Only load small BIN hashtables into JS memory (~20MB total)
                // mammoth tables (game.txt/lcu.txt) are handled by the native LMDB cache
                this.hashtables = await loadHashtables(hashtablesPath, {
                    tables: [
                        'hashes.binentries.txt',
                        'hashes.binhashes.txt',
                        'hashes.bintypes.txt',
                        'hashes.binfields.txt'
                    ]
                });
            } catch (error) {
                console.error(`Error loading hashtables from ${hashtablesPath}:`, error);
                this.hashtables = null;
            }
        } else {
            this.hashtables = null;
            this.hashtablesPath = null;
        }

        // Add All_BINs entry
        this.scannedTree['All_BINs'] = {};
        this.entryPrefix['All_BINs'] = 'Uneditable';
        this.entryName['All_BINs'] = 'All_BINs';

        // Get selected BIN files (sourceBins is just boolean like Python)
        const selectedBins = Object.entries(this.sourceBins)
            .filter(([_, selected]) => selected)
            .map(([unifyPath, _]) => unifyPath);

        if (selectedBins.length === 0) {
            throw new Error('No BIN files selected');
        }

        // Scan each selected BIN and its linked BINs recursively
        const scannedBins = new Set();
        const binsToScan = [...selectedBins];

        while (binsToScan.length > 0) {
            const unifyPathKey = binsToScan.shift();
            if (scannedBins.has(unifyPathKey)) continue;

            const fileInfo = this.sourceFiles[unifyPathKey];
            if (!fileInfo) continue;

            try {
                // Scan this BIN
                await this._scanBin(fileInfo.fullPath);
                scannedBins.add(unifyPathKey);

                // Read the BIN to get its links
                const binObj = await new BIN().read(fs.readFileSync(fileInfo.fullPath), this.hashtables);
                if (binObj && Array.isArray(binObj.links) && binObj.links.length > 0) {
                    // Find linked BINs and add them to the scan queue
                    for (const link of binObj.links) {
                        if (!link || typeof link !== 'string') continue;
                        if (isCharacterBin(link)) continue; // Skip character BINs

                        // Normalize the link path before unifying
                        const normalizedLink = normalizePath(link);
                        const linkUnify = unifyPath(normalizedLink);

                        // Try to find the linked BIN in source files
                        if (this.sourceFiles[linkUnify] && !scannedBins.has(linkUnify)) {
                            console.log(`[BumpathCore] Found linked BIN: ${link} -> ${linkUnify}`);
                            binsToScan.push(linkUnify);
                        } else {
                            // Try alternative matching - sometimes links might be in different format
                            // Check if any source file matches the link path
                            for (const [unify, fileInfo] of Object.entries(this.sourceFiles)) {
                                if (fileInfo.relPath && normalizePath(fileInfo.relPath) === normalizedLink) {
                                    if (!scannedBins.has(unify)) {
                                        console.log(`[BumpathCore] Found linked BIN (alternative match): ${link} -> ${unify}`);
                                        binsToScan.push(unify);
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`Error scanning BIN ${unifyPathKey}:`, error);
            }
        }

        console.log(`[BumpathCore] Scan complete. Found ${Object.keys(this.scannedTree).length - 1} entries (excluding All_BINs)`);
        console.log(`[BumpathCore] Entry types found:`, Object.values(this.entryTypeName).filter((v, i, a) => a.indexOf(v) === i));

        // Convert to frontend format
        return this._convertScannedData();
    }

    /**
     * Scan a single BIN file
     * @private
     */
    async _scanBin(binPath) {
        // Initialize fs/path if not already done
        if (!fs || !path) {
            await initNodeModules();
        }
        try {
            // Initialize fs/path if not already done
            if (!fs || !path) {
                await initNodeModules();
            }
            const binObj = await new BIN().read(fs.readFileSync(binPath), this.hashtables);

            // Check if binObj is valid
            if (!binObj || !binObj.entries) {
                console.error(`[BumpathCore] Invalid BIN object from ${binPath}`);
                return;
            }

            // Track this BIN in All_BINs
            const relPath = this._getRelPath(binPath);
            const unify = unifyPath(normalizePath(relPath));
            if (!this.scannedTree['All_BINs']) {
                this.scannedTree['All_BINs'] = {};
            }
            this.scannedTree['All_BINs'][unify] = {
                exists: true,
                path: relPath
            };

            console.log(`[BumpathCore] Scanning BIN: ${binPath}, found ${binObj.entries.length} entries`);

            // Scan entries
            const entries = binObj.entries || [];
            for (const entry of entries) {
                const entryHash = entry.hash.toLowerCase();

                if (!this.scannedTree[entryHash]) {
                    this.scannedTree[entryHash] = {};
                    this.entryPrefix[entryHash] = 'bum';

                    // Unhash entry name using hashtables or native addon
                    this.entryName[entryHash] = await this._resolveHash(entryHash);

                    if (this.hashtables && entry.type && entry.type !== '00000000') {
                        const typeHash = entry.type.toLowerCase();
                        this.entryTypeName[entryHash] = this.hashtables['hashes.bintypes.txt']?.[typeHash] || entry.type;
                    } else if (entry.type === '00000000') {
                        if (this.hashtables && this.hashtables['hashes.bintypes.txt']?.['00000000']) {
                            this.entryTypeName[entryHash] = this.hashtables['hashes.bintypes.txt']['00000000'];
                        } else {
                            this.entryTypeName[entryHash] = '0x00000000';
                        }
                    } else {
                        // Try native resolution for type as well if requested
                        this.entryTypeName[entryHash] = await this._resolveHash(entry.type) || entry.type;
                    }
                }

                // Scan entry fields for asset references
                this._scanEntry(entry, entryHash);
            }
        } catch (error) {
            console.error(`[BumpathCore] Error scanning BIN ${binPath}:`, error);
            throw error;
        }
    }

    /**
     * Resolve a hash to name using JS hashtables or native addon
     * @private
     */
    async _resolveHash(hex) {
        if (!hex) return hex;
        const hexLower = hex.toLowerCase();

        // 1. Try JS hashtables (BIN tables)
        if (this.hashtables) {
            const resolved = BINHasher.hexToRaw(this.hashtables, hexLower);
            if (resolved !== hexLower) return resolved;
        }

        // 2. Try native addon (WAD tables in LMDB)
        if (this.nativeAddon && this.hashtablesPath) {
            try {
                // WAD hashes are 16 chars, BIN hashes are 8 chars. 
                // Currently buildHashDb only indexes 16-char hashes.
                if (hexLower.length === 16) {
                    const results = this.nativeAddon.resolveHashes([hexLower], this.hashtablesPath);
                    if (results && results[0] && results[0] !== hexLower) {
                        return results[0];
                    }
                }
            } catch (e) {
                console.error(`[BumpathCore] Native resolveHashes failed for ${hexLower}:`, e);
            }
        }

        return hexLower.length === 8 ? `Entry_${hexLower}` : hexLower;
    }

    /**
     * Scan an entry for asset references
     * @private
     */
    _scanEntry(entry, entryHash) {
        for (const field of entry.data) {
            this._scanField(field, entryHash);
        }
    }

    /**
     * Scan a field for asset references
     * @private
     */
    _scanField(field, entryHash) {
        if (!field) return;

        if (field.type === BINType.STRING && typeof field.data === 'string') {
            const valueLower = field.data.toLowerCase();
            // Check if it's an asset/data path (not just any string)
            if (valueLower.includes('assets/') || valueLower.includes('data/') ||
                valueLower.includes('characters/') || valueLower.includes('particles/') ||
                valueLower.includes('materials/') || valueLower.endsWith('.tex') ||
                valueLower.endsWith('.anm') || valueLower.endsWith('.dds') ||
                valueLower.endsWith('.png') || valueLower.endsWith('.jpg')) {
                const unify = unifyPath(valueLower);
                const exists = unify in this.sourceFiles;
                // Ensure entryHash exists in scannedTree
                if (!this.scannedTree[entryHash]) {
                    this.scannedTree[entryHash] = {};
                }
                this.scannedTree[entryHash][unify] = {
                    exists,
                    path: field.data
                };
            }
        } else if (field.type === BINType.LIST || field.type === BINType.LIST2) {
            // LIST/LIST2: field.data is an array of values
            if (field.data && Array.isArray(field.data)) {
                for (const item of field.data) {
                    // item is a direct value, not a BINField
                    this._scanValue(item, field.valueType, entryHash);
                }
            }
        } else if (field.type === BINType.POINTER || field.type === BINType.EMBED) {
            if (field.data && Array.isArray(field.data)) {
                for (const subField of field.data) {
                    this._scanField(subField, entryHash);
                }
            }
        } else if (field.type === BINType.MAP) {
            if (field.data && typeof field.data === 'object') {
                for (const [key, val] of Object.entries(field.data)) {
                    this._scanValue(key, field.keyType, entryHash);
                    this._scanValue(val, field.valueType, entryHash);
                }
            }
        } else if (field.type === BINType.OPTION && field.valueType === BINType.STRING) {
            if (field.data !== null && field.data !== undefined) {
                this._scanValue(field.data, field.valueType, entryHash);
            }
        } else {
            this._scanValue(field.data, field.type, entryHash);
        }
    }

    /**
     * Scan a value for asset references
     * @private
     */
    _scanValue(value, valueType, entryHash) {
        if (valueType === BINType.STRING && typeof value === 'string') {
            const valueLower = value.toLowerCase();
            // Check if it's an asset/data path (not just any string)
            if (valueLower.includes('assets/') || valueLower.includes('data/') ||
                valueLower.includes('characters/') || valueLower.includes('particles/') ||
                valueLower.includes('materials/') || valueLower.endsWith('.tex') ||
                valueLower.endsWith('.anm') || valueLower.endsWith('.dds') ||
                valueLower.endsWith('.png') || valueLower.endsWith('.jpg')) {
                const unify = unifyPath(valueLower);
                const exists = unify in this.sourceFiles;
                // Ensure entryHash exists in scannedTree
                if (!this.scannedTree[entryHash]) {
                    this.scannedTree[entryHash] = {};
                }
                this.scannedTree[entryHash][unify] = {
                    exists,
                    path: value
                };
            }
        } else if (valueType === BINType.LIST || valueType === BINType.LIST2) {
            // LIST/LIST2 as a value: value is a BINField with data array
            if (value && typeof value === 'object' && value.data && Array.isArray(value.data)) {
                for (const item of value.data) {
                    this._scanValue(item, value.valueType, entryHash);
                }
            }
        } else if (valueType === BINType.POINTER || valueType === BINType.EMBED) {
            // POINTER/EMBED as a value: value is a BINField with data array of fields
            if (value && typeof value === 'object' && value.data && Array.isArray(value.data)) {
                for (const field of value.data) {
                    this._scanField(field, entryHash);
                }
            }
        }
    }

    /**
     * Apply prefix to entries
     * @param {string[]} entryHashes - Array of entry hashes
     * @param {string} prefix - Prefix to apply
     */
    applyPrefix(entryHashes, prefix) {
        for (const entryHash of entryHashes) {
            if (this.entryPrefix[entryHash] && this.entryPrefix[entryHash] !== 'Uneditable') {
                this.entryPrefix[entryHash] = prefix;
            }
        }
    }

    /**
     * Process (bum) files - repath and copy
     * @param {string} outputDir - Output directory
     * @param {boolean} ignoreMissing - Ignore missing files
     * @param {boolean} combineLinked - Combine linked BINs
     * @param {Function} progressCallback - Progress callback (optional)
     * @returns {Object} - Process result
     */
    async process(outputDir, ignoreMissing = false, combineLinked = false, progressCallback = null, skipRepath = false) {
        console.log(`[BumpathCore] Starting process:`);
        console.log(`  OutputDir: ${outputDir}`);
        console.log(`  IgnoreMissing: ${ignoreMissing}`);
        console.log(`  CombineLinked: ${combineLinked}`);
        console.log(`  SkipRepath: ${skipRepath}`);
        // Store for use in private methods (_copyAssetFiles)
        this._skipRepath = skipRepath;

        if (Object.keys(this.scannedTree).length === 0) {
            throw new Error('No entries scanned. Please scan first.');
        }

        // Ensure output directory exists
        if (!fs || !path) {
            await initNodeModules();
        }

        try {
            if (!fs.existsSync(outputDir)) {
                console.log(`[BumpathCore] Creating output directory: ${outputDir}`);
                fs.mkdirSync(outputDir, { recursive: true });
            } else {
                console.log(`[BumpathCore] Output directory exists: ${outputDir}`);
            }
        } catch (error) {
            console.error(`[BumpathCore] Error ensuring output directory exists:`, error);
            throw error;
        }

        console.log(`[BumpathCore] Starting process. Scanned tree has ${Object.keys(this.scannedTree).length} entries`);

        // Check for missing files
        if (!ignoreMissing) {
            for (const [entryHash, files] of Object.entries(this.scannedTree)) {
                if (entryHash === 'All_BINs') continue;
                for (const [unify, fileInfo] of Object.entries(files)) {
                    if (!fileInfo.exists) {
                        throw new Error(`Missing file: ${fileInfo.path} (entry: ${entryHash})`);
                    }
                }
            }
        }

        // Process files - EXACTLY like Python
        // Python: for entry_hash in self.scanned_tree: ... for unify_file in self.scanned_tree[entry_hash]: ...
        const processedFiles = new Map(); // Like Python's bum_files = {}
        let totalProcessed = 0;

        // Process all files from scanned_tree (like Python)
        for (const [entryHash, files] of Object.entries(this.scannedTree)) {
            if (entryHash === 'All_BINs') continue; // Skip All_BINs entry

            const prefix = this.entryPrefix[entryHash] || 'bum';

            for (const [unify, fileInfo] of Object.entries(files)) {
                // Python: existed, short_file = self.scanned_tree[entry_hash][unify_file]
                const existed = fileInfo.exists;
                const shortFile = fileInfo.path;

                // Python: if not existed: continue
                if (!existed) continue;

                // Python: if not short_file.endswith('.bin'): short_file = bum_path(short_file, prefix)
                // skipRepath: keep original paths, no prefix transformation
                let outputRelPath = shortFile;
                if (!skipRepath && !shortFile.toLowerCase().endsWith('.bin')) {
                    outputRelPath = bumPath(shortFile, prefix);
                }

                // Get source file - Python: source_file = self.source_files[unify_file][0]
                const sourceInfo = this.sourceFiles[unify];
                if (!sourceInfo) {
                    console.log(`[BumpathCore] Warning: unify_file '${unify}' not found in source_files. Skipping.`);
                    continue;
                }

                const sourcePath = sourceInfo.fullPath;

                // Python: output_file = os.path.join(output_dir, short_file.lower()).replace('\\', '/')
                const normalizedRelPath = normalizePath(outputRelPath);
                const outputPath = path.join(outputDir, normalizedRelPath).replace(/\\/g, '/');
                const outputDirPath = path.dirname(outputPath).replace(/\\/g, '/');

                console.log(`[BumpathCore] Processing: ${shortFile} -> ${outputPath}`);

                // Python: os.makedirs(os.path.dirname(output_file), exist_ok=True)
                try {
                    fs.mkdirSync(outputDirPath, { recursive: true });
                } catch (error) {
                    console.error(`[BumpathCore] Error creating directory ${outputDirPath}:`, error);
                    throw error;
                }

                // Python: shutil.copy(source_file, output_file)
                try {
                    fs.copyFileSync(sourcePath, outputPath);
                } catch (error) {
                    console.error(`[BumpathCore] Error copying file:`, error);
                    throw error;
                }

                // Python: if output_file.endswith('.bin'): bum_bin(output_file)
                if (!skipRepath && outputPath.toLowerCase().endsWith('.bin')) {
                    await this._repathBin(outputPath, entryHash);
                }

                // Python: bum_files[unify_file] = output_file
                processedFiles.set(unify, outputPath);
                totalProcessed++;

                if (progressCallback) {
                    progressCallback(totalProcessed, `Processed: ${shortFile}`);
                }
            }
        }

        // Process selected BIN files themselves (even if not in scanned_tree entries)
        // Python processes everything in scanned_tree, but BIN files might only be in All_BINs
        // So we need to process selected BINs separately
        const selectedBins = Object.entries(this.sourceBins)
            .filter(([_, selected]) => selected === true)
            .map(([unifyPath, _]) => unifyPath);

        for (const unifyPathKey of selectedBins) {
            // Skip if already processed
            if (processedFiles.has(unifyPathKey)) continue;

            const sourceInfo = this.sourceFiles[unifyPathKey];
            if (!sourceInfo) continue;

            const sourcePath = sourceInfo.fullPath;
            const relPath = sourceInfo.relPath;

            // Python: output_file = os.path.join(output_dir, short_file.lower()).replace('\\', '/')
            const normalizedRelPath = normalizePath(relPath);
            const outputPath = path.join(outputDir, normalizedRelPath).replace(/\\/g, '/');
            const outputDirPath = path.dirname(outputPath).replace(/\\/g, '/');

            console.log(`[BumpathCore] Processing selected BIN: ${relPath} -> ${outputPath}`);

            // Create output directory
            try {
                fs.mkdirSync(outputDirPath, { recursive: true });
            } catch (error) {
                console.error(`[BumpathCore] Error creating directory ${outputDirPath}:`, error);
                throw error;
            }

            // Copy BIN file
            try {
                fs.copyFileSync(sourcePath, outputPath);
            } catch (error) {
                console.error(`[BumpathCore] Error copying BIN file:`, error);
                throw error;
            }

            // Repath BIN file (modify paths inside) — skipped when skipRepath=true
            if (!skipRepath) {
                await this._repathBin(outputPath, null);
            }

            processedFiles.set(unifyPathKey, outputPath);
            totalProcessed++;

            if (progressCallback) {
                progressCallback(totalProcessed, `Processed BIN: ${relPath}`);
            }
        }

        console.log(`[BumpathCore] Processed ${totalProcessed} files`);

        // Copy linked BINs to output directory (needed for combining)
        await this._copyLinkedBins(outputDir, processedFiles, progressCallback);

        // Combine linked BINs if requested
        if (combineLinked) {
            await this._combineLinkedBins(outputDir, processedFiles, progressCallback);
        }

        // Scan and copy asset files
        await this._copyAssetFiles(outputDir, processedFiles, progressCallback);

        return {
            success: true,
            total_files: totalProcessed,
            output_dir: outputDir
        };
    }

    /**
     * Copy asset files referenced in BIN files
     * @private
     */
    async _copyAssetFiles(outputDir, processedFiles, progressCallback) {
        if (!fs || !path) return;

        if (progressCallback) {
            progressCallback(0, 'Scanning BIN files for asset references...');
        }

        // Map asset paths to entry hashes (to determine prefix)
        const assetToEntryMap = new Map(); // assetPath -> entryHash

        // Build map from scanned tree
        for (const [entryHash, files] of Object.entries(this.scannedTree)) {
            if (entryHash === 'All_BINs') continue;
            for (const [unify, fileInfo] of Object.entries(files)) {
                if (!fileInfo.path.toLowerCase().endsWith('.bin')) {
                    const assetPath = fileInfo.path;
                    if (!assetToEntryMap.has(assetPath.toLowerCase())) {
                        assetToEntryMap.set(assetPath.toLowerCase(), entryHash);
                    }
                }
            }
        }

        // Collect all BIN files to scan for additional assets
        const binsToScan = [];

        // Get all processed BIN files
        for (const [unify, outputPath] of processedFiles.entries()) {
            if (unify.toLowerCase().endsWith('.bin') && fs.existsSync(outputPath)) {
                try {
                    const binObj = await new BIN().read(fs.readFileSync(outputPath), this.hashtables);
                    binsToScan.push(binObj);
                } catch (error) {
                    console.error(`Error reading BIN for asset scan: ${outputPath}`, error);
                }
            }
        }

        // Also scan original source BINs (before repathing)
        for (const [unify, fileInfo] of Object.entries(this.sourceFiles)) {
            if (unify.toLowerCase().endsWith('.bin') && fs.existsSync(fileInfo.fullPath)) {
                try {
                    const binObj = await new BIN().read(fs.readFileSync(fileInfo.fullPath));
                    binsToScan.push(binObj);
                } catch (error) {
                    console.error(`Error reading source BIN for asset scan: ${fileInfo.fullPath}`, error);
                }
            }
        }

        // Scan all BINs for asset references
        const allAssetPaths = new Set();
        for (const binObj of binsToScan) {
            const assets = scanBinForAssets(binObj);
            for (const asset of assets) {
                allAssetPaths.add(asset);
            }
        }

        if (progressCallback) {
            progressCallback(0, `Found ${allAssetPaths.size} unique asset references`);
        }

        // Copy each asset file with appropriate prefix
        let copiedCount = 0;
        let notFoundCount = 0;
        const processedAssets = new Set();

        for (const assetPath of allAssetPaths) {
            if (processedAssets.has(assetPath.toLowerCase())) {
                continue;
            }
            processedAssets.add(assetPath.toLowerCase());

            // Determine prefix from entry that references this asset
            const entryHash = assetToEntryMap.get(assetPath.toLowerCase());
            const prefix = entryHash ? (this.entryPrefix[entryHash] || 'bum') : 'bum';

            const outputPath = await copyAsset(assetPath, outputDir, this._skipRepath ? null : prefix, this.sourceDirs, this.sourceFiles);
            if (outputPath) {
                copiedCount++;
                if (copiedCount % 50 === 0 && progressCallback) {
                    progressCallback(copiedCount, `Copied ${copiedCount} assets...`);
                }
            } else {
                notFoundCount++;
            }
        }

        if (progressCallback) {
            progressCallback(copiedCount, `Copied ${copiedCount} asset files${notFoundCount > 0 ? ` (${notFoundCount} not found)` : ''}`);
        }
    }

    /**
     * Repath a BIN file (modify paths inside)
     * @private
     */
    async _repathBin(binPath, defaultEntryHash) {
        // Initialize fs/path if not already done
        if (!fs || !path) {
            await initNodeModules();
        }
        const binObj = await new BIN().read(fs.readFileSync(binPath));

        // Modify entries - use entry's own hash to get prefix
        for (const entry of binObj.entries) {
            const entryHash = entry.hash.toLowerCase();
            const prefix = this.entryPrefix[entryHash] || this.entryPrefix[defaultEntryHash] || 'bum';

            for (const field of entry.data) {
                this._bumField(field, prefix, entryHash);
            }
        }

        // Write back
        await binObj.write(binPath);
    }

    /**
     * Apply prefix to a field
     * @private
     */
    _bumField(field, prefix, entryHash = null) {
        if (!field) return;

        if (field.type === BINType.STRING && typeof field.data === 'string') {
            if (this._isBlockedSfxPath(field.data)) {
                return;
            }
            const valueLower = field.data.toLowerCase();
            if (valueLower.includes('assets/') || valueLower.includes('data/')) {
                const unify = unifyPath(valueLower);
                // Check if this file exists in our scanned tree or source files
                let shouldRepath = false;
                if (entryHash && this.scannedTree[entryHash] && unify in this.scannedTree[entryHash]) {
                    shouldRepath = this.scannedTree[entryHash][unify].exists;
                } else {
                    // Fallback: check all entries or source files
                    for (const [eh, files] of Object.entries(this.scannedTree)) {
                        if (eh === 'All_BINs') continue;
                        if (unify in files && files[unify].exists) {
                            shouldRepath = true;
                            break;
                        }
                    }
                    if (!shouldRepath && unify in this.sourceFiles) {
                        shouldRepath = true;
                    }
                }
                if (shouldRepath) {
                    field.data = bumPath(field.data, prefix);
                }
            }
        } else if (field.type === BINType.LIST || field.type === BINType.LIST2) {
            if (field.data && Array.isArray(field.data)) {
                field.data = field.data.map(item => this._bumValue(item, field.valueType, prefix, entryHash));
            }
        } else if (field.type === BINType.POINTER || field.type === BINType.EMBED) {
            if (field.data && Array.isArray(field.data)) {
                for (const subField of field.data) {
                    this._bumField(subField, prefix, entryHash);
                }
            }
        } else if (field.type === BINType.MAP) {
            if (field.data && typeof field.data === 'object') {
                const newMap = {};
                for (const [key, val] of Object.entries(field.data)) {
                    newMap[this._bumValue(key, field.keyType, prefix, entryHash)] =
                        this._bumValue(val, field.valueType, prefix, entryHash);
                }
                field.data = newMap;
            }
        } else if (field.type === BINType.OPTION && field.valueType === BINType.STRING) {
            if (field.data !== null && field.data !== undefined) {
                field.data = this._bumValue(field.data, field.valueType, prefix, entryHash);
            }
        } else {
            field.data = this._bumValue(field.data, field.type, prefix, entryHash);
        }
    }

    /**
     * Apply prefix to a value
     * @private
     */
    _bumValue(value, valueType, prefix, currentEntryHash = null) {
        if (valueType === BINType.STRING && typeof value === 'string') {
            if (this._isBlockedSfxPath(value)) {
                return value;
            }
            const valueLower = value.toLowerCase();
            if (valueLower.includes('assets/') || valueLower.includes('data/')) {
                const unify = unifyPath(valueLower);
                // Check if this file exists in our scanned tree or source files
                let shouldRepath = false;
                if (currentEntryHash && this.scannedTree[currentEntryHash] && unify in this.scannedTree[currentEntryHash]) {
                    shouldRepath = this.scannedTree[currentEntryHash][unify].exists;
                } else {
                    // Fallback: check all entries
                    for (const [eh, files] of Object.entries(this.scannedTree)) {
                        if (eh === 'All_BINs') continue;
                        if (unify in files && files[unify].exists) {
                            shouldRepath = true;
                            break;
                        }
                    }
                    if (!shouldRepath && unify in this.sourceFiles) {
                        shouldRepath = true;
                    }
                }
                if (shouldRepath) {
                    return bumPath(value, prefix);
                }
            }
        } else if (valueType === BINType.LIST || valueType === BINType.LIST2) {
            if (value && value.data && Array.isArray(value.data)) {
                value.data = value.data.map(item => this._bumValue(item, value.valueType, prefix, currentEntryHash));
            }
        } else if (valueType === BINType.POINTER || valueType === BINType.EMBED) {
            if (value && value.data && Array.isArray(value.data)) {
                for (const field of value.data) {
                    this._bumField(field, prefix, currentEntryHash);
                }
            }
        }
        return value;
    }

    /**
     * Copy linked BINs to output directory
     * @private
     */
    async _copyLinkedBins(outputDir, processedFiles, progressCallback) {
        // Get all selected BIN files (sourceBins is just boolean like Python)
        const selectedBins = Object.entries(this.sourceBins)
            .filter(([_, selected]) => selected === true)
            .map(([unify, _]) => unify);

        for (const unify of selectedBins) {
            const outputPath = processedFiles.get(unify);
            if (!outputPath || !fs.existsSync(outputPath)) continue;

            try {
                // Read main BIN to get links
                const mainBin = await new BIN().read(fs.readFileSync(outputPath), this.hashtables);

                for (const link of mainBin.links || []) {
                    if (!link || typeof link !== 'string') continue;
                    if (isCharacterBin(link)) continue;

                    // Skip if already processed
                    const linkUnify = unifyPath(normalizePath(link));
                    if (processedFiles.has(linkUnify)) continue;

                    // Find source file for this linked BIN
                    // Try exact match first
                    let sourceInfo = this.sourceFiles[linkUnify];

                    // If not found, try alternative matching
                    // Links might be in different format (e.g., DATA/Aatrox_Skins... vs data/aatrox_skins...)
                    if (!sourceInfo) {
                        const normalizedLink = normalizePath(link);
                        // Extract key parts from link (e.g., "aatrox_skins_skin0_skins_skin1" from "DATA/Aatrox_Skins_Skin0_Skins_Skin1.bin")
                        const linkParts = normalizedLink.replace(/^data\//, '').replace(/\.bin$/, '').split('/');
                        const linkKey = linkParts.join('_').replace(/_/g, '_');

                        // Try matching by key parts
                        for (const [unify, fileInfo] of Object.entries(this.sourceFiles)) {
                            const normalizedRelPath = normalizePath(fileInfo.relPath);
                            const fileKey = normalizedRelPath.replace(/^data\//, '').replace(/\.bin$/, '').replace(/\//g, '_');

                            // Check if keys match (handles different path formats)
                            if (fileKey === linkKey ||
                                fileKey.includes(linkKey) ||
                                linkKey.includes(fileKey)) {
                                sourceInfo = fileInfo;
                                console.log(`[BumpathCore] Matched linked BIN: ${link} -> ${fileInfo.relPath}`);
                                break;
                            }
                        }
                    }

                    if (!sourceInfo) {
                        console.log(`[BumpathCore] Linked BIN not found in source: ${link} (unify: ${linkUnify})`);
                        continue;
                    }

                    // Copy linked BIN to output (same relative path structure)
                    // Like Python: os.path.join(output_dir, short_file.lower()).replace('\\', '/')
                    const normalizedLinkedRelPath = normalizePath(sourceInfo.relPath);
                    const linkedOutputPath = path.join(outputDir, normalizedLinkedRelPath).replace(/\\/g, '/');
                    const linkedOutputDir = path.dirname(linkedOutputPath).replace(/\\/g, '/');

                    fs.mkdirSync(linkedOutputDir, { recursive: true });
                    fs.copyFileSync(sourceInfo.fullPath, linkedOutputPath);

                    // Repath the linked BIN (await to ensure it's fully written before combining)
                    await this._repathBin(linkedOutputPath, null);

                    // Track it as processed
                    processedFiles.set(linkUnify, linkedOutputPath);

                    if (progressCallback) {
                        progressCallback(0, `Copied linked BIN: ${sourceInfo.relPath}`);
                    }
                }
            } catch (error) {
                console.error(`[BumpathCore] Error copying linked BINs for ${unify}:`, error);
            }
        }
    }

    /**
     * Combine linked BINs into main BINs
     * @private
     */
    async _combineLinkedBins(outputDir, processedFiles, progressCallback) {
        // Get all selected BIN files (sourceBins is just boolean like Python)
        const selectedBins = Object.entries(this.sourceBins)
            .filter(([_, selected]) => selected === true)
            .map(([unify, _]) => unify);

        for (const unify of selectedBins) {
            const outputPath = processedFiles.get(unify);
            if (!outputPath || !fs.existsSync(outputPath)) {
                console.log(`[BumpathCore] Skipping combine for ${unify}: output path not found`);
                continue;
            }

            try {
                // Initialize fs/path if not already done
                if (!fs || !path) {
                    await initNodeModules();
                }
                const mainBin = await new BIN().read(fs.readFileSync(outputPath), this.hashtables);
                console.log(`[BumpathCore] Main BIN has ${mainBin.links.length} links`);
                const linkedBins = await this._getAllLinkedBins(mainBin, outputDir, processedFiles);
                console.log(`[BumpathCore] Found ${linkedBins.length} linked BINs to combine`);

                if (linkedBins.length > 0) {
                    console.log(`[BumpathCore] Starting combine: main has ${mainBin.entries.length} entries, ${mainBin.links.length} links`);

                    // Combine entries
                    const existingHashes = new Set(
                        mainBin.entries.map(e => e.hash.toLowerCase())
                    );
                    let totalAdded = 0;

                    for (const linkedBinPath of linkedBins) {
                        const linkedBin = await new BIN().read(fs.readFileSync(linkedBinPath), this.hashtables);

                        if (!linkedBin || !Array.isArray(linkedBin.entries)) {
                            console.error(`[BumpathCore] Invalid linked BIN at ${linkedBinPath}`);
                            continue;
                        }

                        console.log(`[BumpathCore] Combining linked BIN: ${path.basename(linkedBinPath)} with ${linkedBin.entries.length} entries`);

                        for (const entry of linkedBin.entries) {
                            const hash = entry.hash.toLowerCase();
                            if (!existingHashes.has(hash)) {
                                mainBin.entries.push(entry);
                                existingHashes.add(hash);
                                totalAdded++;
                            }
                        }

                        // Remove linked bin file
                        if (fs.existsSync(linkedBinPath)) {
                            fs.unlinkSync(linkedBinPath);
                        }
                    }

                    console.log(`[BumpathCore] Added ${totalAdded} new entries. Main now has ${mainBin.entries.length} entries`);

                    // Remove linked bins from links array
                    // We need to match the link paths from mainBin.links to the linked bins we found
                    // Create a map of linked bin paths to their original link strings
                    const linkedBinPathToLink = new Map();
                    for (const link of mainBin.links) {
                        const linkUnify = unifyPath(normalizePath(link));
                        // Try to find which linked bin path corresponds to this link
                        for (const linkedBinPath of linkedBins) {
                            const linkedBinRelPath = path.relative(outputDir, linkedBinPath);
                            const linkedBinUnify = unifyPath(normalizePath(linkedBinRelPath));

                            // Also try matching by source file
                            const sourceInfo = this.sourceFiles[linkUnify];
                            if (sourceInfo) {
                                const sourceRelPath = normalizePath(sourceInfo.relPath);
                                if (normalizePath(linkedBinRelPath) === sourceRelPath) {
                                    linkedBinPathToLink.set(linkedBinPath, link);
                                    break;
                                }
                            }

                            // Try direct unify match
                            if (linkUnify === linkedBinUnify) {
                                linkedBinPathToLink.set(linkedBinPath, link);
                                break;
                            }
                        }
                    }

                    // Create set of links to remove
                    const linksToRemove = new Set(Array.from(linkedBinPathToLink.values()));

                    const originalLinkCount = mainBin.links.length;
                    mainBin.links = mainBin.links.filter(link => {
                        const normalizedLink = normalizePath(link);
                        const shouldRemove = linksToRemove.has(link) ||
                            linksToRemove.has(normalizedLink);
                        if (shouldRemove) {
                            console.log(`[BumpathCore] Removing link: ${link}`);
                        }
                        return !shouldRemove;
                    });

                    console.log(`[BumpathCore] Removed ${originalLinkCount - mainBin.links.length} links. Main now has ${mainBin.links.length} links`);

                    // Write combined BIN
                    await mainBin.write(outputPath);
                    console.log(`[BumpathCore] Wrote combined BIN to ${outputPath}`);

                    if (progressCallback) {
                        progressCallback(0, `Combined ${linkedBins.length} linked BINs into ${path.basename(outputPath)}`);
                    }
                } else {
                    console.log(`[BumpathCore] No linked BINs found to combine`);
                }
            } catch (error) {
                console.error(`Error combining linked BINs for ${unify}:`, error);
            }
        }
    }

    /**
     * Get all linked BINs recursively
     * @private
     */
    async _getAllLinkedBins(mainBin, outputDir, processedFiles, processed) {
        const linkedBins = [];

        // Initialize processed set if not provided
        if (!processed) {
            processed = new Set();
        }

        if (!mainBin || !Array.isArray(mainBin.links)) {
            return linkedBins;
        }

        for (const link of mainBin.links) {
            if (!link || typeof link !== 'string') continue;
            if (isCharacterBin(link)) continue;

            const linkUnify = unifyPath(normalizePath(link));
            if (processed.has(linkUnify)) continue;
            processed.add(linkUnify);

            // Try to find linked bin in output directory first (where it should be after processing)
            let linkedBinPath = processedFiles.get(linkUnify);

            // If not in processedFiles, try to find it in output directory by link path
            if (!linkedBinPath) {
                // The link might be a relative path, try to find it in output directory
                // Like Python: case-insensitive matching with lowercase paths
                const normalizedLink = normalizePath(link);
                const possibleOutputPath = path.join(outputDir, normalizedLink).replace(/\\/g, '/');
                if (fs.existsSync(possibleOutputPath)) {
                    linkedBinPath = possibleOutputPath;
                }
            }

            // If still not found, try source files with flexible matching
            if (!linkedBinPath) {
                // Try exact match first
                let sourceInfo = this.sourceFiles[linkUnify];

                // If not found, try alternative matching
                if (!sourceInfo) {
                    const normalizedLink = normalizePath(link);
                    for (const [unify, fileInfo] of Object.entries(this.sourceFiles)) {
                        const normalizedRelPath = normalizePath(fileInfo.relPath);
                        if (normalizedRelPath === normalizedLink ||
                            normalizedRelPath.endsWith(normalizedLink.split('/').pop())) {
                            sourceInfo = fileInfo;
                            break;
                        }
                    }
                }

                if (sourceInfo && fs.existsSync(sourceInfo.fullPath)) {
                    linkedBinPath = sourceInfo.fullPath;
                }
            }

            if (linkedBinPath && fs.existsSync(linkedBinPath)) {
                // Verify file is not empty and has valid BIN signature before adding
                try {
                    const fileBuffer = fs.readFileSync(linkedBinPath);
                    if (fileBuffer.length === 0) {
                        console.warn(`[BumpathCore] Linked BIN is empty: ${linkedBinPath}`);
                        continue;
                    }

                    // Check BIN signature (first 4 bytes should be 'PROP' or 'PTCH')
                    const signature = fileBuffer.toString('utf-8', 0, 4);
                    if (signature !== 'PROP' && signature !== 'PTCH') {
                        console.warn(`[BumpathCore] Linked BIN has invalid signature '${signature}': ${linkedBinPath}`);
                        // If it's in processedFiles (output), try reading from source instead
                        if (processedFiles.has(linkUnify)) {
                            const sourceInfo = this.sourceFiles[linkUnify];
                            if (sourceInfo && fs.existsSync(sourceInfo.fullPath)) {
                                console.log(`[BumpathCore] Using source file instead: ${sourceInfo.fullPath}`);
                                linkedBinPath = sourceInfo.fullPath;
                            } else {
                                continue; // Skip this linked BIN
                            }
                        } else {
                            continue; // Skip this linked BIN
                        }
                    }

                    linkedBins.push(linkedBinPath);
                    console.log(`[BumpathCore] Found linked BIN: ${link} -> ${linkedBinPath}`);

                    // Recursively get links from this linked bin
                    // For nested links, prefer source files to avoid reading repathed files recursively
                    try {
                        const linkedBin = await new BIN().read(fileBuffer, this.hashtables);
                        const nestedLinkedBins = await this._getAllLinkedBins(linkedBin, outputDir, processedFiles, processed);
                        linkedBins.push(...nestedLinkedBins);
                    } catch (error) {
                        console.error(`[BumpathCore] Error reading linked BIN ${linkedBinPath}:`, error);
                    }
                } catch (error) {
                    console.error(`[BumpathCore] Error accessing linked BIN ${linkedBinPath}:`, error);
                }
            } else {
                console.log(`[BumpathCore] Linked BIN not found: ${link} (unify: ${linkUnify})`);
            }
        }

        return linkedBins;
    }

    /**
     * Get relative path from source directory
     * @private
     */
    _getRelPath(fullPath) {
        for (const sourceDir of this.sourceDirs) {
            try {
                const rel = path.relative(sourceDir, fullPath);
                if (!rel.startsWith('..')) {
                    return normalizePath(rel);
                }
            } catch (error) {
                // Ignore
            }
        }
        return normalizePath(path.basename(fullPath));
    }

    /**
     * Convert scanned data to frontend format
     * @private
     */
    _convertScannedData() {
        const entries = {};

        for (const [entryHash, files] of Object.entries(this.scannedTree)) {
            if (entryHash === 'All_BINs') continue;

            const referencedFiles = [];
            for (const [unify, fileInfo] of Object.entries(files)) {
                referencedFiles.push({
                    path: fileInfo.path,
                    exists: fileInfo.exists,
                    unify_file: unify
                });
            }

            entries[entryHash] = {
                name: this.entryName[entryHash] || `Entry_${entryHash}`,
                type_name: this.entryTypeName[entryHash],
                prefix: this.entryPrefix[entryHash] || 'bum',
                referenced_files: referencedFiles
            };
        }

        const allBins = {};
        if (this.scannedTree['All_BINs']) {
            for (const [unify, fileInfo] of Object.entries(this.scannedTree['All_BINs'])) {
                allBins[unify] = {
                    path: fileInfo.path,
                    exists: fileInfo.exists
                };
            }
        }

        return {
            entries,
            all_bins: allBins
        };
    }
}
