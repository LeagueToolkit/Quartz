'use strict';

// ─── BIN type constants (mirror src/jsritofile/binTypes.js) ─────────────────
const T_NONE = 0, T_BOOL = 1, T_VEC4 = 13, T_RGBA = 15;
const T_LIST = 128, T_LIST2 = 129, T_POINTER = 130, T_EMBED = 131;
const T_OPTION = 133, T_MAP = 134;

// FNV1a — matches src/jsritofile/helper.js so we can hash field names locally.
function fnv1a(s) {
    let h = 0x811c9dc5;
    const lower = s.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
        h = Math.imul(h ^ lower.charCodeAt(i), 0x01000193) >>> 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

// LoL VFX bin color field names. RGBA-typed fields are always copied; VEC4
// fields are only copied if their field-name hash is in this set, since VEC4
// is also used for positions, scales, etc.
const VFX_COLOR_FIELD_NAMES = [
    'color', 'startColor', 'endColor', 'peakColor', 'lingerColor',
    'color0', 'color1', 'color2', 'color3', 'color4', 'color5', 'color6', 'color7',
    'colorOverTime', 'colorOverLifetime',
    'colorStart', 'colorMid', 'colorEnd',
    'particleColor', 'tintColor', 'colorTint',
    'reflectionColor', 'emissiveColor', 'diffuseColor', 'baseColor',
    'edgeColor', 'fresnelColor', 'rimColor',
    'mEmissiveColor', 'mDiffuseColor',
    'colorMin', 'colorMax',
];
const VFX_COLOR_HASH_SET = new Set(VFX_COLOR_FIELD_NAMES.map(fnv1a));

function isWhitelistedColorHash(hash) {
    return !!hash && VFX_COLOR_HASH_SET.has(String(hash).toLowerCase());
}

function copy4(srcArr, dstArr) {
    if (!Array.isArray(srcArr) || !Array.isArray(dstArr) || srcArr.length < 4 || dstArr.length < 4) return false;
    for (let i = 0; i < 4; i++) dstArr[i] = srcArr[i];
    return true;
}

// Recursively walk paired source/target BINFields and copy color values.
// `containerHash` is the parent field's hash (used so the LIST<VEC4>
// `colorOverTime` children — which have no hash of their own — inherit
// their parent's name for the whitelist check).
function walkAndCopyField(srcField, dstField, stats, containerHash) {
    if (!srcField || !dstField) return;
    if (srcField.type !== dstField.type) { stats.mismatches++; return; }
    const t = srcField.type;
    const hashForWhitelist = (srcField.hash || containerHash || '').toLowerCase();

    if (t === T_RGBA) {
        if (copy4(srcField.data, dstField.data)) stats.fieldsCopied++;
        return;
    }
    if (t === T_VEC4) {
        if (isWhitelistedColorHash(hashForWhitelist) && copy4(srcField.data, dstField.data)) {
            stats.fieldsCopied++;
        }
        return;
    }
    if (t === T_LIST || t === T_LIST2) {
        if (srcField.valueType !== dstField.valueType) { stats.mismatches++; return; }
        const vt = srcField.valueType;
        const sa = srcField.data, da = dstField.data;
        if (!Array.isArray(sa) || !Array.isArray(da)) return;
        const len = Math.min(sa.length, da.length);
        if (vt === T_RGBA) {
            for (let i = 0; i < len; i++) if (copy4(sa[i], da[i])) stats.fieldsCopied++;
            return;
        }
        if (vt === T_VEC4) {
            if (!isWhitelistedColorHash(hashForWhitelist)) return;
            for (let i = 0; i < len; i++) if (copy4(sa[i], da[i])) stats.fieldsCopied++;
            return;
        }
        if (vt === T_POINTER || vt === T_EMBED) {
            for (let i = 0; i < len; i++) walkAndCopyContainer(sa[i], da[i], stats);
            return;
        }
        // primitive non-color list — skip
        return;
    }
    if (t === T_MAP) {
        const vt = srcField.valueType;
        const sm = srcField.data, dm = dstField.data;
        if (!sm || !dm) return;
        for (const k of Object.keys(sm)) {
            if (!(k in dm)) continue;
            if (vt === T_RGBA) { if (copy4(sm[k], dm[k])) stats.fieldsCopied++; }
            else if (vt === T_POINTER || vt === T_EMBED) walkAndCopyContainer(sm[k], dm[k], stats);
        }
        return;
    }
    if (t === T_OPTION) {
        if (srcField.data == null || dstField.data == null) return;
        const vt = srcField.valueType;
        if (vt === T_RGBA && copy4(srcField.data, dstField.data)) { stats.fieldsCopied++; return; }
        if (vt === T_VEC4 && isWhitelistedColorHash(hashForWhitelist) && copy4(srcField.data, dstField.data)) {
            stats.fieldsCopied++; return;
        }
        if (vt === T_POINTER || vt === T_EMBED) walkAndCopyContainer(srcField.data, dstField.data, stats);
        return;
    }
    if (t === T_POINTER || t === T_EMBED) {
        walkAndCopyContainer(srcField, dstField, stats);
        return;
    }
    // Scalar/non-color types — nothing to do.
}

// `srcContainer` and `dstContainer` are objects with a `.data` array of
// BINFields. Used for entries, POINTER/EMBED, and LIST items of those types.
function walkAndCopyContainer(srcContainer, dstContainer, stats) {
    if (!srcContainer || !dstContainer) return;
    const sd = srcContainer.data, dd = dstContainer.data;
    if (!Array.isArray(sd) || !Array.isArray(dd)) return;
    const dstByHash = new Map();
    for (const f of dd) {
        if (f && f.hash) dstByHash.set(String(f.hash).toLowerCase(), f);
    }
    for (const sf of sd) {
        if (!sf || !sf.hash) continue;
        const df = dstByHash.get(String(sf.hash).toLowerCase());
        if (df) walkAndCopyField(sf, df, stats);
    }
}

function copyBinColors(srcBin, dstBin) {
    const stats = { entriesMatched: 0, entriesSkipped: 0, fieldsCopied: 0, mismatches: 0 };
    const srcByHash = new Map();
    for (const e of srcBin.entries || []) {
        if (e && e.hash) srcByHash.set(String(e.hash).toLowerCase(), e);
    }
    for (const dstEntry of dstBin.entries || []) {
        if (!dstEntry || !dstEntry.hash) continue;
        const key = String(dstEntry.hash).toLowerCase();
        const srcEntry = srcByHash.get(key);
        if (!srcEntry) { stats.entriesSkipped++; continue; }
        if (srcEntry.type !== dstEntry.type) { stats.entriesSkipped++; continue; }
        stats.entriesMatched++;
        walkAndCopyContainer(srcEntry, dstEntry, stats);
    }
    return stats;
}


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

function registerBinToolsChannels({ ipcMain, fs, path, loadBinModule }) {
    const loadBinCtor = async () => {
        if (typeof loadBinModule === 'function') {
            const mod = await loadBinModule();
            if (mod?.BIN) return mod.BIN;
        }
        const mod = await import('../../../jsritofile/bin.js');
        return mod.BIN;
    };

    ipcMain.handle('bin:getLinkCount', async (_, { filePath } = {}) => {
        try {
            if (!filePath || !fs.existsSync(filePath)) {
                return { success: false, linkCount: 0 };
            }
            const BIN = await loadBinCtor();
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

            const BIN = await loadBinCtor();
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
            // Resolve direct links before any delete, so cleanup can be accurate.
            const directLinkResolved = new Map();
            for (const link of (mainBin.links || [])) {
                if (typeof link !== 'string') continue;
                const resolved = resolveLink(link, projectRoot, hashedReverse, fs, path);
                if (resolved) {
                    directLinkResolved.set(link, path.resolve(resolved));
                }
            }
            const linkedPaths = await collectAllLinkedPaths(mainBin, projectRoot, hashedReverse, BIN, fs, path, championBaseBinName);

            if (linkedPaths.length === 0) {
                return { success: true, merged: 0 };
            }

            const existingHashes = new Set(mainBin.entries.map(e => e.hash.toLowerCase()));
            let merged = 0;
            const mergedPathSet = new Set();

            for (const linkedPath of linkedPaths) {
                try {
                    const linkedBin = await new BIN().read(fs.readFileSync(linkedPath));
                    let addedAny = false;
                    for (const entry of linkedBin.entries) {
                        const hash = entry.hash.toLowerCase();
                        if (!existingHashes.has(hash)) {
                            mainBin.entries.push(entry);
                            existingHashes.add(hash);
                            addedAny = true;
                        }
                    }
                    // Only delete a linked file when we actually merged at least one entry from it.
                    if (addedAny) {
                        fs.unlinkSync(linkedPath);
                        mergedPathSet.add(path.resolve(linkedPath));
                        merged++;
                    }
                } catch (e) {
                    console.error('[bin:combineLinkedBins] Failed to merge', linkedPath, e.message);
                }
            }

            // Keep links that weren't successfully merged. Always keep champion base link.
            mainBin.links = (mainBin.links || []).filter((link) => {
                if (isBlockedChampionBaseLink(link, championBaseBinName, path)) return true;
                const resolved = directLinkResolved.get(link);
                if (!resolved) return true; // unresolved at start => keep
                return !mergedPathSet.has(resolved);
            });
            await mainBin.write(filePath);

            return { success: true, merged };
        } catch (e) {
            console.error('[bin:combineLinkedBins]', e.message);
            return { success: false, merged: 0, error: e.message };
        }
    });

    ipcMain.handle('bin:copyColors', async (_, { sourcePath, targetPath, outputPath, createBackup } = {}) => {
        try {
            if (!sourcePath || !fs.existsSync(sourcePath)) {
                return { success: false, error: 'Source bin not found' };
            }
            if (!targetPath || !fs.existsSync(targetPath)) {
                return { success: false, error: 'Target bin not found' };
            }

            const BIN = await loadBinCtor();
            const srcBin = await new BIN().read(fs.readFileSync(sourcePath));
            const dstBin = await new BIN().read(fs.readFileSync(targetPath));

            const stats = copyBinColors(srcBin, dstBin);

            const writePath = outputPath || targetPath;
            if (writePath === targetPath && createBackup) {
                const bak = `${targetPath}.bak`;
                if (!fs.existsSync(bak)) fs.copyFileSync(targetPath, bak);
            }
            await dstBin.write(writePath);

            return { success: true, outputPath: writePath, ...stats };
        } catch (e) {
            console.error('[bin:copyColors]', e.message);
            return { success: false, error: e.message };
        }
    });
}

module.exports = { registerBinToolsChannels };
