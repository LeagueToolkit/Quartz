/**
 * Test script for JavaScript bumpath implementation
 * Tests the BumpathCore class with a real BIN file
 */

import { BumpathCore } from '../utils/bumpath/index.js';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// Inject fs/path into the modules that need them
// This is a workaround for ES modules not having require
const require = createRequire(import.meta.url);

// Patch the modules to use Node.js fs/path
// We'll need to modify the approach - let's just ensure fs/path are available

// Get Node.js modules
const { fileURLToPath } = await import('url');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('=== Testing JavaScript Bumpath Implementation ===\n');
    
    // Paths
    const binPath = path.join(__dirname, 'aatrox_extracted_Aatrox', 'data', 'characters', 'aatrox', 'skins', 'skin0.bin');
    const sourceDir = path.join(__dirname, 'aatrox_extracted_Aatrox');
    const outputDir = path.join(__dirname, 'test_bumpath_output');
    
    // Check if files exist
    if (!fs.existsSync(binPath)) {
        console.error(`Error: BIN file not found: ${binPath}`);
        process.exit(1);
    }
    
    if (!fs.existsSync(sourceDir)) {
        console.error(`Error: Source directory not found: ${sourceDir}`);
        process.exit(1);
    }
    
    console.log(`BIN file: ${binPath}`);
    console.log(`Source directory: ${sourceDir}`);
    console.log(`Output directory: ${outputDir}`);
    console.log(`BIN exists: ${fs.existsSync(binPath)}`);
    console.log(`Source exists: ${fs.existsSync(sourceDir)}\n`);
    
    // Create BumpathCore instance
    const bumpath = new BumpathCore();
    
    try {
        // Step 1: Add source directory
        console.log('Step 1: Adding source directory...');
        const addResult = await bumpath.addSourceDirs([sourceDir]);
        console.log(`  Found ${Object.keys(addResult.source_files || {}).length} files`);
        console.log(`  Found ${Object.keys(addResult.source_bins || {}).length} BIN files\n`);
        
        // Step 2: Select the BIN file
        console.log('Step 2: Selecting BIN file...');
        const binRelPath = path.relative(sourceDir, binPath).replace(/\\/g, '/').toLowerCase();
        console.log(`  Looking for: ${binRelPath}`);
        console.log(`  Full path: ${binPath}`);
        
        // Find the unify path for this BIN - need to use unifyPath function
        const { unifyPath, normalizePath } = await import('../utils/bumpath/bumpathHelpers.js');
        const normalizedRelPath = normalizePath(binRelPath);
        const expectedUnify = unifyPath(normalizedRelPath);
        console.log(`  Expected unify: ${expectedUnify}`);
        
        // Find the unify path for this BIN
        let binUnify = null;
        if (addResult.source_files[expectedUnify]) {
            binUnify = expectedUnify;
            console.log(`  ✓ Found in source_files with expected unify`);
        } else {
            // Try to find by matching relPath
            console.log(`  Searching by relPath match...`);
            for (const [unify, fileInfo] of Object.entries(addResult.source_files)) {
                if (fileInfo.relPath && normalizePath(fileInfo.relPath) === normalizedRelPath) {
                    binUnify = unify;
                    console.log(`  ✓ Found in source_files by relPath: ${unify}`);
                    break;
                }
            }
        }
        
        // Also check sourceBins
        if (!binUnify) {
            console.log(`  Searching in source_bins...`);
            for (const [unify, binData] of Object.entries(addResult.source_bins)) {
                // Paths in sourceBins should already be normalized, but normalize just in case
                const binPathCheck = normalizePath(binData.path || binData.rel_path || '');
                if (binPathCheck === normalizedRelPath) {
                    binUnify = unify;
                    console.log(`  ✓ Found in source_bins: ${unify}`);
                    break;
                }
            }
        }
        
        // Last resort: search by filename match
        if (!binUnify) {
            console.log(`  Searching by filename match...`);
            const targetFilename = path.basename(binPath).toLowerCase();
            for (const [unify, fileInfo] of Object.entries(addResult.source_files)) {
                if (fileInfo.relPath && fileInfo.relPath.toLowerCase().endsWith(`skins/${targetFilename}`)) {
                    binUnify = unify;
                    console.log(`  ✓ Found by filename match: ${unify} (${fileInfo.relPath})`);
                    break;
                }
            }
        }
        
        if (!binUnify) {
            console.error(`\n✗ Error: Could not find BIN file in source files`);
            console.log(`  Looking for: ${binRelPath}`);
            console.log(`  Normalized: ${normalizedRelPath}`);
            console.log(`  Expected unify: ${expectedUnify}`);
            console.log('\nAvailable BIN files in source_bins (showing path field):');
            let count = 0;
            for (const [unify, data] of Object.entries(addResult.source_bins)) {
                if (count++ >= 20) break;
                const relPath = normalizePath(data.path || data.rel_path || '');
                const fileInfo = addResult.source_files[unify];
                const fileRelPath = fileInfo ? fileInfo.relPath : 'N/A';
                console.log(`  ${relPath || '(empty)'} -> ${unify}`);
                console.log(`    (from source_files: ${fileRelPath})`);
                if (relPath.includes('skins/skin0.bin') || fileRelPath.includes('skins/skin0.bin')) {
                    console.log(`    ^^^ This looks like it might be the one!`);
                }
            }
            
            // Also check source_files directly
            console.log('\nSearching source_files for skins/skin0.bin:');
            let foundAny = false;
            for (const [unify, fileInfo] of Object.entries(addResult.source_files)) {
                if (fileInfo.relPath && fileInfo.relPath.includes('skins/skin0.bin')) {
                    console.log(`  Found: ${unify} -> ${fileInfo.relPath}`);
                    foundAny = true;
                }
            }
            if (!foundAny) {
                console.log('  No files found with "skins/skin0.bin" in path');
                console.log('\nSample source_files entries (first 20):');
                let count = 0;
                for (const [unify, fileInfo] of Object.entries(addResult.source_files)) {
                    if (count++ >= 20) break;
                    console.log(`  ${unify} -> ${fileInfo.relPath}`);
                }
            }
            process.exit(1);
        }
        
        bumpath.updateBinSelection({ [binUnify]: true });
        console.log(`  ✓ Selected: ${binRelPath} (unify: ${binUnify})\n`);
        
        // Step 3: Scan (without hashtables for now)
        console.log('Step 3: Scanning BIN file...');
        console.log('  (This will recursively scan main BIN + all linked BINs)\n');
        const scanned = await bumpath.scan(null); // No hashtables path
        console.log(`\n  ✓ Found ${Object.keys(scanned.entries).length} entries`);
        console.log(`  ✓ Found ${Object.keys(scanned.all_bins).length} linked BINs\n`);
        
        // Display some entries
        console.log('Sample entries (first 10):');
        let count = 0;
        for (const [entryHash, entryData] of Object.entries(scanned.entries)) {
            if (count >= 10) break;
            console.log(`  ${count + 1}. ${entryData.name || entryHash}`);
            console.log(`     Type: ${entryData.type_name || 'Unknown'}`);
            console.log(`     Referenced files: ${entryData.referenced_files?.length || 0}`);
            count++;
        }
        if (Object.keys(scanned.entries).length > 10) {
            console.log(`  ... and ${Object.keys(scanned.entries).length - 10} more entries`);
        }
        console.log();
        
        // Step 4: Process (repath and copy)
        console.log('Step 4: Processing files...');
        if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true, force: true });
        }
        fs.mkdirSync(outputDir, { recursive: true });
        
        const processResult = await bumpath.process(
            outputDir,
            true, // ignoreMissing
            true, // combineLinked
            (count, message) => {
                if (count % 10 === 0 || message.includes('BIN') || message.includes('asset')) {
                    console.log(`  ${message}`);
                }
            }
        );
        
        console.log(`\n  Processed ${processResult.total_files} files`);
        console.log(`  Output: ${processResult.output_dir}\n`);
        
        // Step 5: Verify output
        console.log('Step 5: Verifying output...');
        const outputBinPath = path.join(outputDir, binRelPath);
        if (fs.existsSync(outputBinPath)) {
            console.log(`  ✓ Main BIN file exists: ${outputBinPath}`);
            
            // Check if it was combined (should have more entries)
            const { BIN } = await import('./index.js');
            const outputBin = await new BIN().read(fs.readFileSync(outputBinPath));
            if (outputBin && Array.isArray(outputBin.entries)) {
                console.log(`  ✓ Output BIN has ${outputBin.entries.length} entries`);
            }
            if (outputBin && Array.isArray(outputBin.links)) {
                console.log(`  ✓ Output BIN has ${outputBin.links.length} links`);
            }
        } else {
            console.log(`  ✗ Main BIN file not found: ${outputBinPath}`);
        }
        
        // Check for asset files
        const assetsDir = path.join(outputDir, 'assets');
        if (fs.existsSync(assetsDir)) {
            const assetFiles = [];
            function countFiles(dir) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        countFiles(fullPath);
                    } else {
                        assetFiles.push(fullPath);
                    }
                }
            }
            countFiles(assetsDir);
            console.log(`  ✓ Found ${assetFiles.length} asset files in output`);
        }
        
        console.log('\n=== Test Complete ===');
        console.log(`Output directory: ${outputDir}`);
        
    } catch (error) {
        console.error('\n✗ Error during test:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

main();

