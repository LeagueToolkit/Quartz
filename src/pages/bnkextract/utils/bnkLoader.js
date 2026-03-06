import { parseAudioFile, parseBinFile, groupAudioFiles, getEventMappings } from './bnkParser';

const sanitizeNodeScope = (value) => String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'root';

export const scopeTreeNodeIds = (node, scopeKey, parentTrail = []) => {
    if (!node) return node;

    const nodeToken = sanitizeNodeScope(node.name || node.id || 'node');
    const scopedTrail = [...parentTrail, nodeToken];
    const scopedId = `${scopeKey}::${scopedTrail.join('::')}`;
    const scopedNode = {
        ...node,
        id: scopedId,
    };

    if (Array.isArray(node.children) && node.children.length > 0) {
        const siblingNameCounts = new Map();
        scopedNode.children = node.children.map((child) => {
            const childToken = sanitizeNodeScope(child.name || child.id || 'node');
            const nextCount = (siblingNameCounts.get(childToken) || 0) + 1;
            siblingNameCounts.set(childToken, nextCount);
            return scopeTreeNodeIds(child, scopeKey, [...scopedTrail, `${childToken}~${nextCount}`]);
        });
    }

    return scopedNode;
};

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

    const scopeKey = sanitizeNodeScope(originalPath || sourceName);
    const tree = scopeTreeNodeIds(groupAudioFiles(finalAudioFiles, stringHashes, sourceName), scopeKey);
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
