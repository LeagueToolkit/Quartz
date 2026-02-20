/**
 * Mod Auto Processor Utility
 * Handles automatic finding and processing of files in a mod folder structure
 */

const getModFiles = async (modPath, skinId) => {
    if (!window.require) return null;
    const fs = window.require('fs');
    const path = window.require('path');

    console.log(`[ModAutoProcessor] Scanning mod path: ${modPath}`);

    const files = {
        bin: null,
        audio: null,
        events: null
    };

    // Helper to find files recursively with patterns
    const findFiles = (dir) => {
        const results = [];
        if (!fs.existsSync(dir)) return results;

        const list = fs.readdirSync(dir);
        for (const file of list) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat && stat.isDirectory()) {
                results.push(...findFiles(fullPath));
            } else {
                results.push(fullPath);
            }
        }
        return results;
    };

    const allFiles = findFiles(modPath);
    console.log(`[ModAutoProcessor] Found ${allFiles.length} total files in mod folder.`);

    // Helper for precise skin matching (skin0 should not match skin02)
    const getSkinRegex = (id) => new RegExp(`skin${id}(?![0-9])`, 'i');

    // 1. Find the BIN files (Global candidates)
    const binFiles = allFiles.filter(f => f.toLowerCase().endsWith('.bin'));

    // Score paths to find the most "standard" BIN location
    const scoredBins = binFiles.map(f => {
        let score = 0;
        const low = f.toLowerCase();
        if (low.includes('data')) score += 1;
        if (low.includes('characters')) score += 2;
        if (low.includes('skins')) score += 2;
        if (low.includes('\\data\\') || low.includes('/data/')) score += 1;
        if (low.includes('\\skins\\') || low.includes('/skins/')) score += 1;
        if (low.includes('\\characters\\') || low.includes('/characters/')) score += 1;
        return { path: f, score };
    }).sort((a, b) => b.score - a.score);

    const prioritizedBins = scoredBins.map(b => b.path);
    let selectedBin = null;

    if (skinId) {
        const skinRegex = getSkinRegex(skinId);
        selectedBin = prioritizedBins.find(f => skinRegex.test(path.basename(f))) ||
            prioritizedBins.find(f => skinRegex.test(f)) ||
            prioritizedBins[0];
    } else {
        selectedBin = prioritizedBins[0];
    }
    console.log(`[ModAutoProcessor] Selected BIN: ${selectedBin || 'None'}`);

    // 2. Find the BNK/WPK files
    const bnkFiles = allFiles.filter(f => f.toLowerCase().endsWith('.bnk') || f.toLowerCase().endsWith('.wpk'));

    // Filter by skin ID or "base" if skinId is 0
    let relevantFiles = bnkFiles;
    if (skinId) {
        const skinRegex = getSkinRegex(skinId);
        relevantFiles = bnkFiles.filter(f => {
            if (skinRegex.test(f)) return true;
            if (skinId === '0' && (f.toLowerCase().includes('\\base\\') || f.toLowerCase().includes('/base/') || f.toLowerCase().includes('_base'))) {
                return true;
            }
            return false;
        });

        // If skin ID not found, fallback to "base" folder files first
        if (relevantFiles.length === 0) {
            console.log(`[ModAutoProcessor] Skin ${skinId} not found, falling back to base folder...`);
            relevantFiles = bnkFiles.filter(f =>
                f.toLowerCase().includes('\\base\\') ||
                f.toLowerCase().includes('/base/') ||
                f.toLowerCase().includes('_base')
            );
        }

        // If still nothing, then fallback to all (but log warning)
        if (relevantFiles.length === 0) {
            console.warn(`[ModAutoProcessor] No base folder found either, using all banks.`);
            relevantFiles = bnkFiles;
        }
    }

    // 3. Group files into sets (SFX, VO, etc.)
    const sets = [];

    // Audio candidates: _audio.bnk, .wpk, or contains 'audio' in name
    const audioFiles = relevantFiles.filter(f =>
        f.toLowerCase().endsWith('_audio.bnk') ||
        f.toLowerCase().endsWith('.wpk') ||
        (f.toLowerCase().includes('audio') && !f.toLowerCase().includes('events'))
    );

    // If no clear audio files, try anything not 'events' as a fallback
    if (audioFiles.length === 0 && relevantFiles.length > 0) {
        audioFiles.push(...relevantFiles.filter(f => !f.toLowerCase().includes('events')));
    }

    audioFiles.forEach(audio => {
        let events = null;
        const lowAudio = audio.toLowerCase();
        const dir = path.dirname(audio);
        const base = path.basename(audio).toLowerCase();

        // Rule 1: Replace _audio.bnk with _events.bnk
        if (lowAudio.endsWith('_audio.bnk')) {
            const target = audio.slice(0, -10) + '_events.bnk';
            events = relevantFiles.find(f => f.toLowerCase() === target.toLowerCase());
        }

        // Rule 2: Replace .wpk with _events.bnk
        if (!events && lowAudio.endsWith('.wpk')) {
            const target = audio.slice(0, -4) + '_events.bnk';
            events = relevantFiles.find(f => f.toLowerCase() === target.toLowerCase());
        }

        // Rule 3: Direct string replacement 'audio' -> 'events'
        if (!events && lowAudio.includes('audio')) {
            const target = audio.replace(/audio/i, 'events');
            events = relevantFiles.find(f => f.toLowerCase() === target.toLowerCase());
        }

        // Rule 4: Look for ANY events file in the same directory
        if (!events) {
            events = relevantFiles.find(f => path.dirname(f) === dir && f.toLowerCase().endsWith('_events.bnk'));
        }

        // Determine Type (VO, SFX, or Folder Name)
        let type = '';
        if (lowAudio.includes('\\vo\\') || lowAudio.includes('/vo/') || lowAudio.includes('_vo')) type = 'VO';
        else if (lowAudio.includes('\\sfx\\') || lowAudio.includes('/sfx/') || lowAudio.includes('_sfx')) type = 'SFX';
        else {
            // Use directory name as type if it's distinctive
            const dirName = path.basename(dir);
            if (dirName.toLowerCase() !== 'skins' && dirName.toLowerCase() !== 'sounds') {
                type = dirName.toUpperCase();
            }
        }

        // Helper to check if a file is non-empty (> 150 bytes for header overhead)
        const isNonEmpty = (f) => {
            if (!f || !fs.existsSync(f)) return false;
            try {
                return fs.statSync(f).size > 150;
            } catch (e) { return false; }
        };

        if (isNonEmpty(audio)) {
            sets.push({
                bin: selectedBin,
                audio: audio,
                events: events,
                type: type
            });
        }
    });

    // 4. Final filter to remove sets with non-functional event files if audio is present but events are useless
    // (Optional: keep audio only sets if that's desired, but usually we want both for rename)
    const validSets = sets.filter(s => {
        const audioSize = fs.statSync(s.audio).size;
        return audioSize > 150;
    });

    console.log(`[ModAutoProcessor] Detected ${validSets.length} valid file sets.`);
    validSets.forEach((s, i) => {
        console.log(`Set ${i + 1} [${s.type || 'Combined'}]: Audio=${path.basename(s.audio)} (${fs.statSync(s.audio).size} bytes), Events=${s.events ? path.basename(s.events) : 'None'}`);
    });

    return validSets;
};

export { getModFiles };
