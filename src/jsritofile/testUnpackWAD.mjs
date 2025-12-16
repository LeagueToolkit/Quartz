/**
 * Test script to unpack WAD.client file
 */

import { WAD } from './wad.js';
import { unpackWAD } from '../utils/wad/index.js';
import { loadHashtables } from './index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('=== WAD Unpack Test ===\n');
    
    // Path to WAD file
    const wadFilePath = path.join(__dirname, 'Aatrox.wad.client');
    
    if (!fs.existsSync(wadFilePath)) {
        console.error(`WAD file not found: ${wadFilePath}`);
        process.exit(1);
    }
    
    console.log(`Reading WAD file: ${wadFilePath}`);
    console.log(`File size: ${fs.statSync(wadFilePath).size} bytes\n`);
    
    // Output directory
    const outputDir = path.join(__dirname, 'Aatrox_extracted');
    
    // Create output directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Try to load hashtables (optional)
    let hashtables = null;
    try {
        // Try common hashtable locations
        const possibleHashDirs = [
            path.join(process.env.APPDATA || '', 'FrogTools', 'hashes'),
            path.join(__dirname, '..', '..', 'hashes'),
        ];
        
        for (const hashDir of possibleHashDirs) {
            if (fs.existsSync(hashDir)) {
                console.log(`Loading hashtables from: ${hashDir}`);
                hashtables = await loadHashtables(hashDir);
                if (hashtables) {
                    console.log('Hashtables loaded successfully\n');
                    break;
                }
            }
        }
        
        if (!hashtables) {
            console.log('No hashtables found - chunks will use hash names\n');
        }
    } catch (error) {
        console.warn('Failed to load hashtables:', error.message);
        console.log('Continuing without hashtables...\n');
    }
    
    // Progress callback
    let lastProgress = 0;
    const progressCallback = (count, message) => {
        if (count > lastProgress + 50 || message) {
            console.log(`[Progress] ${message || `Extracted ${count} files...`}`);
            lastProgress = count;
        }
    };
    
    try {
        console.log('Starting WAD extraction...\n');
        const startTime = Date.now();
        
        const result = await unpackWAD(
            wadFilePath,
            outputDir,
            hashtables,
            null, // no filter
            progressCallback
        );
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log('\n=== Extraction Complete ===');
        console.log(`Extracted ${result.extractedCount} files`);
        console.log(`Output directory: ${result.outputDir}`);
        console.log(`Time: ${duration.toFixed(2)} seconds`);
        console.log(`Speed: ${(result.extractedCount / duration).toFixed(1)} files/sec`);
        if (Object.keys(result.hashedFiles).length > 0) {
            console.log(`Hashed files: ${Object.keys(result.hashedFiles).length}`);
        }
        console.log('\nDone!');
        
    } catch (error) {
        console.error('\n=== Error ===');
        console.error(error);
        console.error(error.stack);
        process.exit(1);
    }
}

main().catch(console.error);



