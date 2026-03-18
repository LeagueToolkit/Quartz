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

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/');

const skinSegToNumber = (segment) => {
    const seg = String(segment || '').toLowerCase().trim();
    if (!seg) return null;
    if (seg === 'base' || seg === 'root') return 0;

    let m = seg.match(/^skin0*(\d+)$/i);
    if (m) {
        const n = Number(m[1]);
        return Number.isFinite(n) ? n : null;
    }

    m = seg.match(/^0*(\d+)$/);
    if (m) {
        const n = Number(m[1]);
        return Number.isFinite(n) ? n : null;
    }

    return null;
};

const inferBinCandidatesFromAudioPath = (audioPath) => {
    if (!audioPath) return [];
    const path = window.require('path');
    const normalized = normalizeSlashes(audioPath);
    const skinMatch = normalized.match(/\/characters\/([^/]+)\/skins\/([^/]+)\//i);
    if (!skinMatch) return [];

    const champion = String(skinMatch[1] || '').toLowerCase();
    const skinSegRaw = String(skinMatch[2] || '').toLowerCase();
    const skinNum = skinSegToNumber(skinSegRaw);
    const lower = normalized.toLowerCase();

    const assetsIdx = lower.indexOf('/assets/');
    const dataIdx = lower.indexOf('/data/');
    let root = '';
    if (assetsIdx >= 0) root = audioPath.slice(0, assetsIdx);
    else if (dataIdx >= 0) root = audioPath.slice(0, dataIdx);
    else root = path.dirname(audioPath);

    const candidates = [];
    const push = (p) => { if (p && !candidates.includes(p)) candidates.push(p); };
    const dataSkins = path.join(root, 'data', 'characters', champion, 'skins');
    const dataChampion = path.join(root, 'data', 'characters', champion);

    if (Number.isFinite(skinNum)) {
        push(path.join(dataSkins, `skin${skinNum}.bin`));
        push(path.join(dataSkins, `skin${String(skinNum).padStart(2, '0')}.bin`));
    }
    if (skinSegRaw) push(path.join(dataSkins, `${skinSegRaw}.bin`));
    push(path.join(dataSkins, 'root.bin'));
    push(path.join(dataChampion, `${champion}.bin`));
    push(path.join(dataChampion, 'animations', `skin${Number.isFinite(skinNum) ? skinNum : 0}.bin`));

    return candidates;
};

export const loadBanks = async ({ bnkPath, wpkPath, binPath }) => {
    if (!window.require) throw new Error('File system access not available');
    const fs = window.require('fs');
    const path = window.require('path');

    const sourceAudioPath = wpkPath || bnkPath || '';
    const inferredBinCandidates = inferBinCandidatesFromAudioPath(sourceAudioPath);
    const binCandidates = [];
    const pushBinCandidate = (candidate) => {
        if (!candidate || typeof candidate !== 'string') return;
        if (!fs.existsSync(candidate)) return;
        if (!binCandidates.includes(candidate)) binCandidates.push(candidate);
    };
    pushBinCandidate(binPath);
    inferredBinCandidates.forEach(pushBinCandidate);

    let usedBinPath = '';
    let stringHashes = [];

    // First pass: BIN + events BNK mapping (best quality). If one BIN fails/empty, try next candidate.
    if (bnkPath && fs.existsSync(bnkPath) && binCandidates.length > 0) {
        let bnkData = null;
        try {
            bnkData = fs.readFileSync(bnkPath);
        } catch (error) {
            console.warn('[BnkLoader] Failed to read events BNK:', error);
        }

        if (bnkData) {
            for (const candidate of binCandidates) {
                try {
                    const binData = fs.readFileSync(candidate);
                    const binStrings = parseBinFile(binData);
                    const mapped = getEventMappings(binStrings, bnkData);
                    if (Array.isArray(mapped) && mapped.length > 0) {
                        stringHashes = mapped;
                        usedBinPath = candidate;
                        break;
                    }
                } catch (error) {
                    console.warn('[BnkLoader] Enhanced mapping failed for candidate BIN:', candidate, error);
                }
            }
        }
    }

    // Second pass: plain BIN strings fallback (still useful when events object mapping is absent).
    if (stringHashes.length === 0 && binCandidates.length > 0) {
        for (const candidate of binCandidates) {
            try {
                const binData = fs.readFileSync(candidate);
                const parsed = parseBinFile(binData);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    stringHashes = parsed;
                    usedBinPath = candidate;
                    break;
                }
            } catch (error) {
                console.warn('[BnkLoader] Failed to parse BIN candidate:', candidate, error);
            }
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
    tree.binPath = usedBinPath || (binPath && fs.existsSync(binPath) ? binPath : '');
    tree.originalAudioFiles = finalAudioFiles;

    return {
        tree,
        audioFiles: finalAudioFiles,
        fileCount,
        type: finalType
    };
};
