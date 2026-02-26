import { parseAudioFile, parseBinFile, groupAudioFiles, getEventMappings } from './bnkParser';

export const loadBanks = async ({ bnkPath, wpkPath, binPath }) => {
    if (!window.require) throw new Error('File system access not available');
    const fs = window.require('fs');
    const path = window.require('path');

    let stringHashes = [];
    if (binPath && bnkPath && fs.existsSync(binPath) && fs.existsSync(bnkPath)) {
        try {
            const binData = fs.readFileSync(binPath);
            const bnkData = fs.readFileSync(bnkPath);
            const binStrings = parseBinFile(binData);
            stringHashes = getEventMappings(binStrings, bnkData);
        } catch (error) {
            console.warn('[BnkLoader] Enhanced mapping failed:', error);
        }
    }

    if (stringHashes.length === 0 && binPath && fs.existsSync(binPath)) {
        try {
            const binData = fs.readFileSync(binPath);
            stringHashes = parseBinFile(binData);
        } catch (error) {
            console.warn('[BnkLoader] Failed to parse BIN:', error);
        }
    }

    let wpkResult = null;
    if (wpkPath && fs.existsSync(wpkPath)) {
        const wpkData = fs.readFileSync(wpkPath);
        wpkResult = parseAudioFile(wpkData, wpkPath);
    }

    let bnkResult = null;
    if (!wpkResult && bnkPath && fs.existsSync(bnkPath)) {
        const bnkData = fs.readFileSync(bnkPath);
        bnkResult = parseAudioFile(bnkData, bnkPath);
    }

    let finalAudioFiles = [];
    let fileCount = 0;
    let finalType = '';

    if (wpkResult) {
        finalAudioFiles = wpkResult.audioFiles;
        fileCount = wpkResult.fileCount;
        finalType = 'wpk';
    } else if (bnkResult) {
        finalAudioFiles = bnkResult.audioFiles;
        fileCount = bnkResult.fileCount;
        finalType = 'bnk';
    }

    if (wpkResult && bnkPath) {
        finalType = 'bnk+wpk';
    }

    if (finalAudioFiles.length === 0) {
        return null;
    }

    const sourceName = wpkPath ? path.basename(wpkPath) : (bnkPath ? path.basename(bnkPath) : 'root');
    const originalPath = wpkPath || bnkPath;

    const tree = groupAudioFiles(finalAudioFiles, stringHashes, sourceName);
    tree.isRoot = true;
    tree.originalPath = originalPath;
    tree.bnkPath = bnkPath;
    tree.wpkPath = wpkPath;
    tree.binPath = binPath;
    tree.originalAudioFiles = finalAudioFiles;

    return {
        tree,
        audioFiles: finalAudioFiles,
        fileCount,
        type: finalType
    };
};
