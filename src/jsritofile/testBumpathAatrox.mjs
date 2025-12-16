/**
 * Test bumpath with Aatrox extracted directory
 */

import { BumpathCore } from '../utils/bumpath/bumpathCore.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    console.log('=== Testing Bumpath with Aatrox extracted directory ===\n');
    
    const bumpath = new BumpathCore();
    
    // Test directory
    const sourceDir = join(__dirname, 'aatrox_extracted_Aatrox');
    const outputDir = join(__dirname, 'aatrox_test_output');
    const hashtablesPath = join(__dirname, '..', '..', 'hashes'); // Adjust if needed
    
    console.log(`Source directory: ${sourceDir}`);
    console.log(`Output directory: ${outputDir}`);
    console.log(`Hashtables path: ${hashtablesPath}\n`);
    
    try {
        // Step 1: Add source directory
        console.log('Step 1: Adding source directory...');
        const result = await bumpath.addSourceDirs([sourceDir]);
        console.log(`Found ${Object.keys(result.source_files).length} source files`);
        console.log(`Found ${Object.keys(result.source_bins).length} BIN files\n`);
        
        // Step 2: Select the main BIN file (skin0.bin)
        console.log('Step 2: Selecting BIN files...');
        const binSelections = {};
        for (const [unify, data] of Object.entries(result.source_bins)) {
            const relPath = data.rel_path || '';
            // Select skin0.bin
            if (relPath.includes('skins/skin0.bin') || relPath.endsWith('skin0.bin')) {
                binSelections[unify] = true;
                console.log(`  Selected: ${relPath} (${unify})`);
            } else {
                binSelections[unify] = false;
            }
        }
        bumpath.updateBinSelection(binSelections);
        console.log(`Selected ${Object.values(binSelections).filter(v => v).length} BIN files\n`);
        
        // Step 3: Scan
        console.log('Step 3: Scanning BIN files...');
        const scanned = await bumpath.scan(hashtablesPath);
        console.log(`Scanned ${Object.keys(scanned.entries).length} entries\n`);
        
        // Step 4: Process
        console.log('Step 4: Processing files...');
        const processResult = await bumpath.process(
            outputDir,
            true,  // ignoreMissing (skip missing files)
            true   // combineLinked
        );
        
        console.log('\n=== Results ===');
        console.log(`Processed ${processResult.totalProcessed || 0} files`);
        console.log(`Output directory: ${outputDir}`);
        
    } catch (error) {
        console.error('Error:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

main();

