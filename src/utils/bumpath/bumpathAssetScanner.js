/**
 * Bumpath Asset Scanner
 * Scans BIN files for asset references and copies them
 */

import { BINType } from '../../jsritofile/index.js';
import { unifyPath, bumPath, normalizePath } from './bumpathHelpers.js';

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
                console.error('[BumpathAssetScanner] Failed to initialize fs/path:', e);
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
 * Scan BIN for asset references
 * @param {BIN} binObj - BIN object
 * @returns {Set<string>} - Set of asset paths
 */
export function scanBinForAssets(binObj) {
    const assetPaths = new Set();
    
    function scanValue(value, valueType) {
        if (valueType === BINType.STRING && typeof value === 'string') {
            const valueLower = value.toLowerCase();
            if (valueLower.includes('assets/') || valueLower.includes('data/')) {
                assetPaths.add(value);
            }
        } else if (valueType === BINType.LIST || valueType === BINType.LIST2) {
            if (value && value.data && Array.isArray(value.data)) {
                for (const item of value.data) {
                    scanValue(item, value.valueType);
                }
            }
        } else if (valueType === BINType.POINTER || valueType === BINType.EMBED) {
            if (value && value.data && Array.isArray(value.data)) {
                for (const field of value.data) {
                    scanField(field);
                }
            }
        }
    }
    
    function scanField(field) {
        if (!field) return;
        
        if (field.type === BINType.LIST || field.type === BINType.LIST2) {
            if (field.data && Array.isArray(field.data)) {
                for (const item of field.data) {
                    scanValue(item, field.valueType);
                }
            }
        } else if (field.type === BINType.POINTER || field.type === BINType.EMBED) {
            if (field.data && Array.isArray(field.data)) {
                for (const subField of field.data) {
                    scanField(subField);
                }
            }
        } else if (field.type === BINType.MAP) {
            if (field.data && typeof field.data === 'object') {
                for (const [key, val] of Object.entries(field.data)) {
                    scanValue(key, field.keyType);
                    scanValue(val, field.valueType);
                }
            }
        } else if (field.type === BINType.OPTION && field.valueType === BINType.STRING) {
            if (field.data !== null && field.data !== undefined) {
                scanValue(field.data, field.valueType);
            }
        } else {
            scanValue(field.data, field.type);
        }
    }
    
    for (const entry of binObj.entries) {
        for (const field of entry.data) {
            scanField(field);
        }
    }
    
    return assetPaths;
}

/**
 * Copy asset file to output with repathed structure
 * @param {string} assetPath - Asset path from BIN
 * @param {string} outputDir - Output directory
 * @param {string} prefix - Prefix to add
 * @param {string[]} sourceDirs - Source directories to search
 * @param {Object} sourceFiles - Map of source files (unifyPath -> {fullPath, relPath})
 * @returns {string|null} - Output path if copied, null if not found
 */
export async function copyAsset(assetPath, outputDir, prefix, sourceDirs, sourceFiles) {
    // Initialize fs/path if not already done
    if (!fs || !path) {
        await initNodeModules();
    }
    if (!fs || !path) return null;
    
    const assetPathLower = assetPath.toLowerCase();
    
    // Skip BIN files (they're handled separately)
    if (assetPathLower.endsWith('.bin')) {
        return null;
    }
    
    // Normalize path to lowercase (like bumpath does)
    const normalizedPath = assetPathLower;
    
    // Create repathed output path (using normalized lowercase path)
    const repathedPath = bumPath(normalizedPath, prefix);
    // Use forward slashes for cross-platform compatibility like bumpath
    const outputPath = path.join(outputDir, repathedPath).replace(/\\/g, '/');
    const outputDirPath = path.dirname(outputPath);
    
    // Find source file
    let sourcePath = null;
    
    // Try unified path first
    const unify = unifyPath(assetPathLower);
    if (sourceFiles[unify]) {
        sourcePath = sourceFiles[unify].fullPath;
    } else {
        // Try to find in source directories
        for (const sourceDir of sourceDirs) {
            const possiblePaths = [
                path.join(sourceDir, assetPath),
                path.join(sourceDir, assetPathLower),
                path.join(sourceDir, assetPath.replace(/\\/g, '/')),
                path.join(sourceDir, assetPathLower.replace(/\\/g, '/'))
            ];
            
            // Also try with unified hash
            if (unify.length === 16) { // Is a hash
                const ext = path.extname(assetPath);
                possiblePaths.push(
                    path.join(sourceDir, unify + ext),
                    path.join(sourceDir, unify.toLowerCase() + ext)
                );
            }
            
            // Search recursively for the file
            for (const possiblePath of possiblePaths) {
                if (fs.existsSync(possiblePath)) {
                    sourcePath = possiblePath;
                    break;
                }
            }
            
            if (sourcePath) break;
            
            // If not found, try recursive search by filename
            if (!sourcePath) {
                const fileName = path.basename(assetPath);
                const fileNameLower = fileName.toLowerCase();
                try {
                    function findFile(dir) {
                        const entries = fs.readdirSync(dir, { withFileTypes: true });
                        for (const entry of entries) {
                            const fullPath = path.join(dir, entry.name);
                            if (entry.isDirectory()) {
                                const found = findFile(fullPath);
                                if (found) return found;
                            } else if (entry.isFile() && 
                                       (entry.name === fileName || entry.name.toLowerCase() === fileNameLower)) {
                                return fullPath;
                            }
                        }
                        return null;
                    }
                    sourcePath = findFile(sourceDir);
                    if (sourcePath) break;
                } catch (error) {
                    // Ignore search errors
                }
            }
        }
    }
    
    if (!sourcePath || !fs.existsSync(sourcePath)) {
        return null; // File not found
    }
    
    // Create output directory
    fs.mkdirSync(outputDirPath, { recursive: true });
    
    // Copy file
    fs.copyFileSync(sourcePath, outputPath);
    
    return outputPath;
}

