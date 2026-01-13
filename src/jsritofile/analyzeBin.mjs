/**
 * Analyze a BIN file structure
 * Run with: node analyzeBin.mjs
 */

import { BIN, loadHashtables } from './bin.js';
import { BINType } from './binTypes.js';
import fs from 'fs';
import path from 'path';

const BIN_PATH = '../pages/skin0.bin';
const HASHES_PATH = 'C:\\Users\\Frog\\AppData\\Roaming\\FrogTools\\hashes';

// Type ID to name mapping
const TYPE_NAMES = {
    [BINType.NONE]: 'NONE',
    [BINType.BOOL]: 'BOOL',
    [BINType.I8]: 'I8',
    [BINType.U8]: 'U8',
    [BINType.I16]: 'I16',
    [BINType.U16]: 'U16',
    [BINType.I32]: 'I32',
    [BINType.U32]: 'U32',
    [BINType.I64]: 'I64',
    [BINType.U64]: 'U64',
    [BINType.F32]: 'F32',
    [BINType.VEC2]: 'VEC2',
    [BINType.VEC3]: 'VEC3',
    [BINType.VEC4]: 'VEC4',
    [BINType.MTX44]: 'MTX44',
    [BINType.RGBA]: 'RGBA',
    [BINType.STRING]: 'STRING',
    [BINType.HASH]: 'HASH',
    [BINType.FILE]: 'FILE',
    [BINType.LIST]: 'LIST',
    [BINType.LIST2]: 'LIST2',
    [BINType.POINTER]: 'POINTER',
    [BINType.EMBED]: 'EMBED',
    [BINType.LINK]: 'LINK',
    [BINType.OPTION]: 'OPTION',
    [BINType.MAP]: 'MAP',
    [BINType.FLAG]: 'FLAG',
};

function getTypeName(typeId) {
    return TYPE_NAMES[typeId] || `UNKNOWN(${typeId})`;
}

// Count field types recursively
function countFieldTypes(fields, counts = {}) {
    if (!Array.isArray(fields)) return counts;

    for (const field of fields) {
        const typeName = getTypeName(field.type);
        counts[typeName] = (counts[typeName] || 0) + 1;

        // Recurse into nested structures
        if (field.data && Array.isArray(field.data)) {
            if (field.type === BINType.POINTER || field.type === BINType.EMBED) {
                countFieldTypes(field.data, counts);
            } else if (field.type === BINType.LIST || field.type === BINType.LIST2) {
                for (const item of field.data) {
                    if (item && item.data && Array.isArray(item.data)) {
                        countFieldTypes(item.data, counts);
                    }
                }
            }
        }
    }

    return counts;
}

// Find VEC4 fields (potential colors)
function findVec4Fields(fields, path = '', results = []) {
    if (!Array.isArray(fields)) return results;

    for (const field of fields) {
        const fieldPath = path ? `${path}.${field.hash}` : field.hash;

        if (field.type === BINType.VEC4) {
            results.push({ path: fieldPath, value: field.data });
        }

        // Recurse into nested structures
        if (field.data && Array.isArray(field.data)) {
            if (field.type === BINType.POINTER || field.type === BINType.EMBED) {
                findVec4Fields(field.data, fieldPath, results);
            } else if (field.type === BINType.LIST || field.type === BINType.LIST2) {
                for (let i = 0; i < field.data.length; i++) {
                    const item = field.data[i];
                    if (item && item.data && Array.isArray(item.data)) {
                        findVec4Fields(item.data, `${fieldPath}[${i}]`, results);
                    }
                }
            }
        }
    }

    return results;
}

async function main() {
    console.log('=== BIN File Analyzer ===\n');

    // Load hashtables
    console.log('Loading hashtables from:', HASHES_PATH);
    let hashtables = null;
    try {
        hashtables = await loadHashtables(HASHES_PATH);
        console.log('Loaded hashtables:', Object.keys(hashtables).join(', '));
    } catch (e) {
        console.log('Could not load hashtables:', e.message);
    }

    // Parse BIN file
    const binPath = path.resolve(import.meta.dirname, BIN_PATH);
    console.log('\nParsing BIN file:', binPath);

    const bin = new BIN();
    await bin.read(binPath, hashtables);

    // Basic stats
    console.log('\n=== Basic Stats ===');
    console.log('Signature:', bin.signature);
    console.log('Version:', bin.version);
    console.log('Is Patch:', bin.isPatch);
    console.log('Links:', bin.links.length);
    console.log('Entries:', bin.entries.length);

    // Entry type distribution
    console.log('\n=== Entry Types (first 20) ===');
    const entryTypes = {};
    for (const entry of bin.entries) {
        entryTypes[entry.type] = (entryTypes[entry.type] || 0) + 1;
    }
    const sortedTypes = Object.entries(entryTypes).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedTypes.slice(0, 20)) {
        console.log(`  ${type}: ${count} entries`);
    }

    // Field type distribution across all entries
    console.log('\n=== Field Types (across all entries) ===');
    const fieldCounts = {};
    for (const entry of bin.entries) {
        countFieldTypes(entry.data, fieldCounts);
    }
    const sortedFieldTypes = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedFieldTypes) {
        console.log(`  ${type}: ${count}`);
    }

    // Sample VEC4 fields (potential colors)
    console.log('\n=== Sample VEC4 Fields (first 30 - potential colors) ===');
    let vec4Count = 0;
    for (const entry of bin.entries) {
        const vec4s = findVec4Fields(entry.data, entry.hash);
        for (const vec4 of vec4s) {
            if (vec4Count < 30) {
                const [r, g, b, a] = vec4.value;
                const isNormalized = r <= 1 && g <= 1 && b <= 1 && a <= 1 && r >= 0 && g >= 0 && b >= 0 && a >= 0;
                console.log(`  ${vec4.path}: [${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}, ${a.toFixed(3)}] ${isNormalized ? '(normalized color)' : ''}`);
            }
            vec4Count++;
        }
    }
    console.log(`\nTotal VEC4 fields: ${vec4Count}`);

    // Sample first entry structure
    console.log('\n=== First Entry Structure ===');
    if (bin.entries.length > 0) {
        const firstEntry = bin.entries[0];
        console.log('Entry Type:', firstEntry.type);
        console.log('Entry Hash:', firstEntry.hash);
        console.log('Field Count:', firstEntry.data.length);
        console.log('Fields (first 10):');
        for (let i = 0; i < Math.min(10, firstEntry.data.length); i++) {
            const field = firstEntry.data[i];
            console.log(`  ${i}: hash=${field.hash}, type=${getTypeName(field.type)}, hasData=${field.data !== null}`);
        }
    }

    // Find VfxSystemDefinitionData entries
    console.log('\n=== Looking for VFX System entries ===');
    // Known hashes for VfxSystemDefinitionData (you may need to verify this)
    const vfxEntries = bin.entries.filter(e => {
        // Check if entry has complexEmitterDefinitionData field (characteristic of VFX systems)
        return e.data.some(f => f.hash === 'ab57dd5d' || f.hash === '0xab57dd5d');
    });
    console.log(`Found ${vfxEntries.length} entries with complexEmitterDefinitionData`);

    if (vfxEntries.length > 0) {
        console.log('\nFirst VFX entry hash:', vfxEntries[0].hash);
        console.log('First VFX entry type:', vfxEntries[0].type);
    }

    // Write sample JSON output
    const outputPath = path.resolve(import.meta.dirname, 'skin0_structure.json');
    const sampleOutput = {
        signature: bin.signature,
        version: bin.version,
        entryCount: bin.entries.length,
        entryTypes: sortedTypes.slice(0, 10),
        fieldTypeCounts: fieldCounts,
        vec4Count,
        sampleEntry: bin.entries.length > 0 ? {
            type: bin.entries[0].type,
            hash: bin.entries[0].hash,
            fieldCount: bin.entries[0].data.length,
            fields: bin.entries[0].data.slice(0, 5).map(f => ({
                hash: f.hash,
                type: getTypeName(f.type),
                valueType: f.valueType ? getTypeName(f.valueType) : null,
                hashType: f.hashType,
            }))
        } : null
    };

    fs.writeFileSync(outputPath, JSON.stringify(sampleOutput, null, 2));
    console.log('\nWrote structure sample to:', outputPath);
}

main().catch(console.error);
