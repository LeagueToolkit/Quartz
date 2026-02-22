'use strict';


function findProjectRoot(startDir, fs, path) {
    let cur = startDir;
    while (cur && cur !== path.dirname(cur)) {
        if (fs.existsSync(path.join(cur, 'data')) || fs.existsSync(path.join(cur, 'DATA'))) {
            return cur;
        }
        cur = path.dirname(cur);
    }
    return null;
}

function getChampionBaseBinName(filePath, path) {
    const normalized = filePath.replace(/\\/g, '/');
    const match = normalized.match(/\/characters\/([^/]+)\//i);
    if (!match) return null;
    return `${match[1].toLowerCase()}.bin`;
}

function isBlockedChampionBaseLink(link, championBaseBinName, path) {
    if (!championBaseBinName || typeof link !== 'string') return false;
    return path.basename(link).toLowerCase() === championBaseBinName;
}

function loadHashedFilesReverse(projectRoot, fs, path) {
    const jsonPath = path.join(projectRoot, 'hashed_files.json');
    if (!fs.existsSync(jsonPath)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const reverse = new Map();
        for (const [hashedName, origPath] of Object.entries(raw)) {
            if (typeof origPath !== 'string') continue;
            const normalized = origPath.replace(/\\/g, '/').toLowerCase();
            reverse.set(normalized, path.join(projectRoot, hashedName));
        }
        return reverse;
    } catch {
        return null;
    }
}

function resolveLink(link, projectRoot, hashedReverse, fs, path) {
    const forward = link.replace(/\\/g, '/');
    const lower = forward.toLowerCase();
    // Try direct path (lowercase then original case)
    const c1 = path.join(projectRoot, lower);
    if (fs.existsSync(c1)) return c1;
    const c2 = path.join(projectRoot, forward);
    if (fs.existsSync(c2)) return c2;
    // Fall back to hashed filename if hashed_files.json was present
    if (hashedReverse) {
        const hashedPath = hashedReverse.get(lower);
        if (hashedPath && fs.existsSync(hashedPath)) return hashedPath;
    }
    return null;
}

async function collectAllLinkedPaths(bin, projectRoot, hashedReverse, BIN, fs, path, championBaseBinName = null, visited = new Set()) {
    const result = [];
    for (const link of (bin.links || [])) {
        if (isBlockedChampionBaseLink(link, championBaseBinName, path)) continue;

        const key = link.toLowerCase();
        if (visited.has(key)) continue;
        visited.add(key);

        const linkedPath = resolveLink(link, projectRoot, hashedReverse, fs, path);
        if (!linkedPath) continue;

        result.push(linkedPath);
        try {
            const nestedBin = await new BIN().read(fs.readFileSync(linkedPath));
            const nested = await collectAllLinkedPaths(nestedBin, projectRoot, hashedReverse, BIN, fs, path, championBaseBinName, visited);
            result.push(...nested);
        } catch {
        }
    }
    return result;
}

function registerBinToolsChannels({ ipcMain, fs, path }) {
    ipcMain.handle('bin:getLinkCount', async (_, { filePath } = {}) => {
        try {
            if (!filePath || !fs.existsSync(filePath)) {
                return { success: false, linkCount: 0 };
            }
            const { BIN } = await import('../../../jsritofile/bin.js');
            const buf = fs.readFileSync(filePath);
            const bin = await new BIN().read(buf);
            const championBaseBinName = getChampionBaseBinName(filePath, path);
            const filteredLinks = (bin.links || []).filter((link) => !isBlockedChampionBaseLink(link, championBaseBinName, path));
            return { success: true, linkCount: filteredLinks.length };
        } catch (e) {
            console.error('[bin:getLinkCount]', e.message);
            return { success: false, linkCount: 0 };
        }
    });

    ipcMain.handle('bin:combineLinkedBins', async (_, { filePath } = {}) => {
        try {
            if (!filePath || !fs.existsSync(filePath)) {
                return { success: false, merged: 0, error: 'File not found' };
            }

            const { BIN } = await import('../../../jsritofile/bin.js');
            const projectRoot = findProjectRoot(path.dirname(filePath), fs, path);
            const championBaseBinName = getChampionBaseBinName(filePath, path);

            if (!projectRoot) {
                console.warn('[bin:combineLinkedBins] Could not find project root for', filePath);
                return { success: false, merged: 0, error: 'Could not find project root (no data/ folder)' };
            }

            const mainBuf = fs.readFileSync(filePath);
            const mainBin = await new BIN().read(mainBuf);

            if ((mainBin.links || []).length === 0) {
                return { success: true, merged: 0 };
            }

            const hashedReverse = loadHashedFilesReverse(projectRoot, fs, path);
            const linkedPaths = await collectAllLinkedPaths(mainBin, projectRoot, hashedReverse, BIN, fs, path, championBaseBinName);

            if (linkedPaths.length === 0) {
                return { success: true, merged: 0 };
            }

            const existingHashes = new Set(mainBin.entries.map(e => e.hash.toLowerCase()));
            let merged = 0;

            for (const linkedPath of linkedPaths) {
                try {
                    const linkedBin = await new BIN().read(fs.readFileSync(linkedPath));
                    for (const entry of linkedBin.entries) {
                        const hash = entry.hash.toLowerCase();
                        if (!existingHashes.has(hash)) {
                            mainBin.entries.push(entry);
                            existingHashes.add(hash);
                        }
                    }
                    fs.unlinkSync(linkedPath);
                    merged++;
                } catch (e) {
                    console.error('[bin:combineLinkedBins] Failed to merge', linkedPath, e.message);
                }
            }

            mainBin.links = [];
            await mainBin.write(filePath);

            return { success: true, merged };
        } catch (e) {
            console.error('[bin:combineLinkedBins]', e.message);
            return { success: false, merged: 0, error: e.message };
        }
    });
}

module.exports = { registerBinToolsChannels };
