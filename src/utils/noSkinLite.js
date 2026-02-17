/**
 * NoSkinLite utility
 * Ported from fantome_repath_gui.py
 */

const fs = require('fs');
const path = require('path');

/**
 * Apply NoSkinLite to a BIN file
 * @param {string} sourceBinPath - Path to the source BIN (e.g. Skin0.bin)
 * @param {string} championName - Name of the champion
 * @param {number} sourceSkinIdx - Original skin index (default 0)
 * @param {Object} hashtables - Loaded hashtables
 * @param {string} outputRoot - Root directory for output
 */
async function applyNoSkinLite(sourceBinPath, championName, sourceSkinIdx = 0, hashtables = null, outputRoot = null) {
    // We need to use dynamic import for the ESM jsritofile library
    const { BIN, BINHasher, loadHashtables } = await import('../jsritofile/index.js');

    if (!hashtables) {
        const { getHashDirectory } = require('./hashManager');
        hashtables = await loadHashtables(getHashDirectory());
    }

    if (!fs.existsSync(sourceBinPath)) {
        throw new Error(`Source BIN not found: ${sourceBinPath}`);
    }

    const bin = new BIN();
    await bin.read(sourceBinPath);

    // Get hash values for types
    const scdpTypeHash = BINHasher.rawToHex('SkinCharacterDataProperties');
    const rrTypeHash = BINHasher.rawToHex('ResourceResolver');
    const mrrFieldHash = BINHasher.rawToHex('mResourceResolver');

    // Find base entries
    let baseScdp = null;
    let baseRr = null;
    let baseMrrField = null;

    for (const entry of bin.entries) {
        if (entry.type === scdpTypeHash) {
            baseScdp = entry;
            for (const field of entry.data) {
                if (field.hash === mrrFieldHash) {
                    baseMrrField = field;
                    break;
                }
            }
        } else if (entry.type === rrTypeHash) {
            baseRr = entry;
        }
    }

    if (!baseScdp) {
        throw new Error('SCDP entry not found in source BIN');
    }

    // Get raw paths from hashes
    const baseScdpPath = BINHasher.hexToRaw(hashtables, baseScdp.hash);
    const baseRrPath = baseRr ? BINHasher.hexToRaw(hashtables, baseRr.hash) : null;

    const champ = championName.toLowerCase();
    const results = [];

    // Generate for skins 1-99
    for (let targetIdx = 1; targetIdx < 100; targetIdx++) {
        const targetBin = new BIN();
        // Deep clone is needed. A simple way is to re-read or use a clone method if available.
        // Re-reading is safest for now.
        await targetBin.read(sourceBinPath);

        let targetScdp = null;
        let targetRr = null;
        let targetMrrField = null;

        for (const entry of targetBin.entries) {
            if (entry.type === scdpTypeHash) {
                targetScdp = entry;
                for (const field of entry.data) {
                    if (field.hash === mrrFieldHash) {
                        targetMrrField = field;
                        break;
                    }
                }
            } else if (entry.type === rrTypeHash) {
                targetRr = entry;
            }
        }

        // Update SCDP hash
        let newScdpPath;
        if (baseScdpPath && baseScdpPath !== baseScdp.hash) {
            // Replace skin index in the path
            newScdpPath = baseScdpPath.replace(new RegExp(`skin${sourceSkinIdx}`, 'gi'), `skin${targetIdx}`);
            // Ensure champion name matches if it was a subfolder
            // (Simplified regex from Python)
            newScdpPath = newScdpPath.replace(new RegExp(`(characters?[/\\\\])${champ}([/\\\\])`, 'i'), `$1${championName}$2`);
        } else {
            newScdpPath = `characters/${champ}/skins/skin${targetIdx}`;
        }
        const newScdpHash = BINHasher.rawToHex(newScdpPath.toLowerCase());
        targetScdp.hash = newScdpHash;

        // Update RR hash and link
        if (targetRr && baseRrPath) {
            let newRrPath = baseRrPath.replace(new RegExp(`skin${sourceSkinIdx}`, 'gi'), `skin${targetIdx}`);
            newRrPath = newRrPath.replace(new RegExp(`(characters?[/\\\\])${champ}([/\\\\])`, 'i'), `$1${championName}$2`);
            const newRrHash = BINHasher.rawToHex(newRrPath.toLowerCase());
            targetRr.hash = newRrHash;

            if (targetMrrField) {
                targetMrrField.data = newRrHash;
            }
        }

        // Save
        if (outputRoot) {
            // Determine target folder: characters/champ/skins/skinN/skinN.bin
            const targetSubDir = path.join(outputRoot, 'data', 'characters', champ, 'skins', `skin${targetIdx}`);
            if (!fs.existsSync(targetSubDir)) {
                fs.mkdirSync(targetSubDir, { recursive: true });
            }
            const targetPath = path.join(targetSubDir, `skin${targetIdx}.bin`);
            await targetBin.write(targetPath);
            results.push(targetPath);
        }
    }

    return results;
}

module.exports = { applyNoSkinLite };
