/**
 * Check entries in the output BIN file
 */

import { BIN } from './index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const binPath = path.join(__dirname, 'aatrox_test_output', 'data', 'characters', 'aatrox', 'skins', 'skin0.bin');
    
    if (!fs.existsSync(binPath)) {
        console.error(`BIN file not found: ${binPath}`);
        process.exit(1);
    }
    
    console.log(`Reading BIN: ${binPath}\n`);
    
    const binObj = await new BIN().read(fs.readFileSync(binPath));
    
    console.log(`Entries: ${binObj.entries.length}`);
    console.log(`Links: ${binObj.links.length}\n`);
    
    console.log('Entry details:');
    for (let i = 0; i < Math.min(20, binObj.entries.length); i++) {
        const entry = binObj.entries[i];
        console.log(`\n${i + 1}. Entry Hash: ${entry.hash}`);
        console.log(`   Type: ${entry.type}`);
        console.log(`   Data fields: ${entry.data.length}`);
        
        // Check for string fields that might be the entry name
        for (const field of entry.data.slice(0, 5)) {
            if (field.type === 'STRING' && field.data) {
                const str = String(field.data);
                if (str.length < 200 && (str.includes('/') || str.includes('Particles') || str.includes('Aatrox'))) {
                    console.log(`   Field: ${field.type} = "${str.substring(0, 100)}"`);
                }
            }
        }
    }
}

main();








