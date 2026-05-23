/**
 * Asset consolidator — pulls every asset-path string referenced by
 * `VfxSystemDefinitionData` entries into a single shared folder per skin
 * (`assets/<prefix>/skin<N>_particles/`), moves the files on disk, rewrites
 * the strings inside the bins, and cleans up empty folders left behind.
 *
 * Runs AFTER bin splitting so it sees VFX entries wherever they ended up
 * (still in the skin bin if split was off, or in `<champ>_vfx_skin<N>.bin`
 * if split was on — both are scanned).
 */

import { BIN, BINType } from '../../jsritofile/index.js';
import { FNV1a, hashToHex } from '../../jsritofile/helper.js';

let fs = null;
let path = null;
let initPromise = null;

async function initNodeModules() {
    if (fs && path) return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
        if (typeof window !== 'undefined' && window.require) {
            fs = window.require('fs');
            path = window.require('path');
        } else if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof __webpack_require__ === 'undefined') {
            try {
                const getModuleName = () => 'module';
                const { createRequire } = await import(getModuleName());
                const nodeRequire = createRequire(import.meta.url);
                fs = nodeRequire('fs');
                path = nodeRequire('path');
            } catch (e) {
                console.error('[assetConsolidator] Failed to initialize fs/path:', e);
            }
        }
    })();
    return initPromise;
}

if (typeof window === 'undefined') {
    initNodeModules().catch(() => { });
}

const VFX_CLASS_HASH = hashToHex(FNV1a('VfxSystemDefinitionData'));

function isAssetPathString(s) {
    if (typeof s !== 'string' || !s) return false;
    const lower = s.replace(/\\/g, '/').toLowerCase();
    return lower.startsWith('assets/') || lower.includes('/assets/');
}

function normalizeAssetPath(s) {
    return String(s).replace(/\\/g, '/');
}

/**
 * Build the new path for a consolidated asset.
 *
 * Two layouts depending on whether `portingPrefix` is supplied:
 *  - portingPrefix set  → `<ASSETS>/<portingPrefix>/portedparticles/<basename>`
 *    (port-donor-from-game flow: one shared folder for all donors loaded
 *    under the same prefix)
 *  - portingPrefix not set → `<ASSETS>[/<prefix>]/skin<N>_<champ>_particles[_<suffix>]/<basename>`
 *    (FrogChanger extract/repath flow, per-skin folders)
 */
function buildNewPath(originalPath, prefix, champ, skinNum, basenameOverride, folderSuffix, portingPrefix) {
    const norm = normalizeAssetPath(originalPath);
    const parts = norm.split('/').filter(Boolean);
    const i = parts.findIndex((p) => p.toLowerCase() === 'assets');
    if (i < 0) return null;
    const assetsLiteral = parts[i]; // preserve original casing (`ASSETS` vs `assets`)

    if (portingPrefix) {
        return [assetsLiteral, portingPrefix, 'portedparticles', basenameOverride].join('/');
    }

    const segments = [assetsLiteral];
    if (prefix) segments.push(prefix);
    const suffix = folderSuffix ? `_${String(folderSuffix).toLowerCase()}` : '';
    segments.push(`skin${skinNum}_${String(champ || '').toLowerCase()}_particles${suffix}`);
    segments.push(basenameOverride);
    return segments.join('/');
}

/**
 * Walk a field, calling `visit(stringValue)` for every asset-looking string.
 */
function visitAssetStrings(field, visit) {
    if (!field) return;
    if (field.type === BINType.STRING && typeof field.data === 'string') {
        if (isAssetPathString(field.data)) visit(field.data);
        return;
    }
    if (field.type === BINType.LIST || field.type === BINType.LIST2) {
        if (!Array.isArray(field.data)) return;
        for (const item of field.data) {
            if (typeof item === 'string') {
                if (field.valueType === BINType.STRING && isAssetPathString(item)) visit(item);
            } else if (item && typeof item === 'object') {
                visitAssetStrings(item, visit);
            }
        }
        return;
    }
    if (field.type === BINType.POINTER || field.type === BINType.EMBED) {
        if (!Array.isArray(field.data)) return;
        for (const sub of field.data) visitAssetStrings(sub, visit);
        return;
    }
    if (field.type === BINType.MAP) {
        if (!field.data || typeof field.data !== 'object') return;
        for (const [k, v] of Object.entries(field.data)) {
            if (typeof k === 'string' && field.keyType === BINType.STRING && isAssetPathString(k)) visit(k);
            if (typeof v === 'string') {
                if (field.valueType === BINType.STRING && isAssetPathString(v)) visit(v);
            } else if (v && typeof v === 'object') {
                visitAssetStrings(v, visit);
            }
        }
        return;
    }
    if (field.type === BINType.OPTION && field.valueType === BINType.STRING) {
        if (typeof field.data === 'string' && isAssetPathString(field.data)) visit(field.data);
    }
}

/**
 * Walk a field, replacing string values via `mapper(oldString) => newString|null`.
 */
function rewriteAssetStrings(field, mapper) {
    if (!field) return;
    if (field.type === BINType.STRING && typeof field.data === 'string') {
        const m = mapper(field.data);
        if (m != null) field.data = m;
        return;
    }
    if (field.type === BINType.LIST || field.type === BINType.LIST2) {
        if (!Array.isArray(field.data)) return;
        for (let i = 0; i < field.data.length; i++) {
            const item = field.data[i];
            if (typeof item === 'string') {
                if (field.valueType === BINType.STRING) {
                    const m = mapper(item);
                    if (m != null) field.data[i] = m;
                }
            } else if (item && typeof item === 'object') {
                rewriteAssetStrings(item, mapper);
            }
        }
        return;
    }
    if (field.type === BINType.POINTER || field.type === BINType.EMBED) {
        if (!Array.isArray(field.data)) return;
        for (const sub of field.data) rewriteAssetStrings(sub, mapper);
        return;
    }
    if (field.type === BINType.MAP) {
        if (!field.data || typeof field.data !== 'object') return;
        const newData = {};
        for (const [k, v] of Object.entries(field.data)) {
            let newK = k;
            if (typeof k === 'string' && field.keyType === BINType.STRING) {
                const m = mapper(k);
                if (m != null) newK = m;
            }
            let newV = v;
            if (typeof v === 'string') {
                if (field.valueType === BINType.STRING) {
                    const m = mapper(v);
                    if (m != null) newV = m;
                }
            } else if (v && typeof v === 'object') {
                rewriteAssetStrings(v, mapper);
            }
            newData[newK] = newV;
        }
        field.data = newData;
        return;
    }
    if (field.type === BINType.OPTION && field.valueType === BINType.STRING) {
        if (typeof field.data === 'string') {
            const m = mapper(field.data);
            if (m != null) field.data = m;
        }
    }
}

/** Resolve a posix asset path string (e.g. `ASSETS/foo/bar.tex`) to an absolute fs path under `outputDir`. */
function assetPathToAbs(outputDir, assetPath) {
    const segs = normalizeAssetPath(assetPath).split('/').filter(Boolean);
    return path.join(outputDir, ...segs);
}

/** Walk `data/characters/<champ>/skins/skin<N>.bin` files in `outputDir`. */
async function findSkinBins(outputDir) {
    if (!fs || !path) await initNodeModules();
    const charactersDir = path.join(outputDir, 'data', 'characters');
    if (!fs.existsSync(charactersDir)) return [];
    const out = [];
    let champEntries;
    try {
        champEntries = await fs.promises.readdir(charactersDir, { withFileTypes: true });
    } catch (_) {
        return out;
    }
    for (const champEnt of champEntries) {
        if (!champEnt.isDirectory()) continue;
        const skinsDir = path.join(charactersDir, champEnt.name, 'skins');
        let skinEntries;
        try {
            skinEntries = await fs.promises.readdir(skinsDir, { withFileTypes: true });
        } catch (_) {
            continue;
        }
        for (const skinEnt of skinEntries) {
            if (!skinEnt.isFile()) continue;
            const m = skinEnt.name.match(/^skin(\d+)\.bin$/i);
            if (m) {
                out.push({
                    binAbs: path.join(skinsDir, skinEnt.name),
                    champ: champEnt.name,
                    skinNum: m[1],
                });
            }
        }
    }
    return out;
}

/**
 * Remove a directory if it's empty. Non-recursive — caller decides whether
 * to walk up. Crucially does NOT recurse into siblings we didn't touch
 * (which would be O(entire output tree) and stall the IPC).
 */
async function rmdirIfEmpty(dir) {
    try {
        const remaining = await fs.promises.readdir(dir);
        if (remaining.length === 0) {
            await fs.promises.rmdir(dir);
            return true;
        }
    } catch (_) { /* ignore */ }
    return false;
}

/**
 * Consolidate VFX assets for a single skin bin in the output dir.
 *
 * @param {boolean} aggressive  When true, skip the "shared with non-VFX
 *   entries" protection and move every VFX-referenced asset unconditionally.
 *   Use for donor-from-game where the donor bin is throwaway scaffolding
 *   and only the consolidated VFX strings travel into the user's target.
 */
async function consolidateForSkin(outputDir, champ, skinNum, prefix, aggressive = false, folderSuffix = '', portingPrefix = '') {
    const c = champ.toLowerCase();
    const candidateBins = [
        path.join(outputDir, 'data', 'characters', c, 'skins', `skin${skinNum}.bin`),
        path.join(outputDir, 'data', `${c}_vfx_skin${skinNum}.bin`),
    ].filter((p) => fs.existsSync(p));

    if (candidateBins.length === 0) return { moved: 0, rewritten: 0 };

    // Pass 1a: collect asset paths referenced by NON-VFX entries (e.g.
    // SkinMeshDataProperties, SkinCharacterDataProperties, gearskin data).
    // These are "protected": if a path is shared with one of these, we must
    // not move the file, otherwise the mesh/gearskin material reference is
    // dangling and the model loses its texture in-game. The VFX reference
    // is left pointing at the original path (which still exists).
    const protectedRefs = new Set(); // lowercased original paths
    // Pass 1b: collect VFX references.
    const vfxRefs = new Set();
    const binCache = new Map(); // binPath -> BIN

    for (const binPath of candidateBins) {
        let bin;
        try {
            bin = await new BIN().read(binPath);
        } catch (e) {
            console.log(`[assetConsolidator] read failed ${binPath}: ${e.message}`);
            continue;
        }
        binCache.set(binPath, bin);
        for (const entry of bin.entries || []) {
            if (!entry) continue;
            const isVfx = entry.type === VFX_CLASS_HASH;
            for (const f of entry.data || []) {
                visitAssetStrings(f, (s) => {
                    if (isVfx) vfxRefs.add(s);
                    else protectedRefs.add(s.toLowerCase());
                });
            }
        }
    }

    // Filter: only consolidate VFX-exclusive paths. Aggressive mode skips
    // this — every VFX-referenced asset gets moved even if a mesh entry
    // also points at it (safe only when the source bin is throwaway).
    const referenced = new Set();
    let skippedShared = 0;
    for (const s of vfxRefs) {
        if (!aggressive && protectedRefs.has(s.toLowerCase())) {
            skippedShared += 1;
            continue;
        }
        referenced.add(s);
    }

    if (referenced.size === 0) {
        if (skippedShared > 0) {
            console.log(
                `[assetConsolidator] champ=${champ} skin=${skinNum} skipped=${skippedShared} (all VFX refs shared with mesh/gearskin)`
            );
        }
        return { moved: 0, rewritten: 0 };
    }

    // Pass 2: build mapping from oldPath -> newPath.
    // Collisions on basename are resolved by suffixing _2, _3, etc. to the
    // basename before its extension.
    const usedNames = new Set();
    const pathMap = new Map(); // lowercased oldPath -> newPath (preserves asset-original casing)

    function uniqueBasename(originalAbsBasename) {
        // originalAbsBasename: e.g. "Aatrox_Base_E_buff.tex"
        const lower = originalAbsBasename.toLowerCase();
        if (!usedNames.has(lower)) {
            usedNames.add(lower);
            return originalAbsBasename;
        }
        const dot = originalAbsBasename.lastIndexOf('.');
        const stem = dot >= 0 ? originalAbsBasename.slice(0, dot) : originalAbsBasename;
        const ext = dot >= 0 ? originalAbsBasename.slice(dot) : '';
        let n = 2;
        while (true) {
            const candidate = `${stem}_${n}${ext}`;
            if (!usedNames.has(candidate.toLowerCase())) {
                usedNames.add(candidate.toLowerCase());
                return candidate;
            }
            n += 1;
        }
    }

    for (const original of referenced) {
        const norm = normalizeAssetPath(original);
        const baseName = norm.split('/').pop();
        if (!baseName) continue;
        const finalName = uniqueBasename(baseName);
        const newPath = buildNewPath(original, prefix, champ, skinNum, finalName, folderSuffix, portingPrefix);
        if (!newPath) continue;
        pathMap.set(original.toLowerCase(), newPath);
    }

    // Pass 3: move files on disk. Track which source dirs we touched so we
    // can later prune them if they go empty.
    //
    // SAFETY: every src and dst path is hard-clamped to `outputDir` before
    // ANY fs mutation. A malformed asset string in a bin (e.g. one with
    // `..` segments) must never let us read/move/delete a file that lives
    // outside the user's mod output folder. Out-of-bounds paths are silently
    // skipped — the rewrite of the bin string still happens so the link
    // graph stays consistent.
    const outputDirAbs = path.resolve(outputDir);
    const outputDirPrefix = (outputDirAbs + path.sep).toLowerCase();
    const isInsideOutput = (p) => {
        const abs = path.resolve(p);
        if (abs === outputDirAbs) return false; // never the root itself
        return (abs + path.sep).toLowerCase().startsWith(outputDirPrefix);
    };

    let moved = 0;
    const sourceDirs = new Set();
    for (const [origLower, newPath] of pathMap.entries()) {
        // origLower is the lowercased KEY; we need the original-case path for
        // path resolution. The keys of pathMap and the original strings are
        // the same except for case — fs is case-insensitive on Windows so
        // either works. Using the lowercased path is fine here.
        const srcAbs = assetPathToAbs(outputDir, origLower);
        const dstAbs = assetPathToAbs(outputDir, newPath);
        if (!isInsideOutput(srcAbs) || !isInsideOutput(dstAbs)) {
            console.log(`[assetConsolidator] refused (outside outputDir): ${srcAbs} -> ${dstAbs}`);
            continue;
        }
        if (!fs.existsSync(srcAbs)) {
            // File doesn't exist in output (likely a cross-skin reference or
            // missing asset) — nothing to move, but the bin will still be
            // rewritten. The string mapping is preserved.
            continue;
        }
        if (path.resolve(srcAbs).toLowerCase() === path.resolve(dstAbs).toLowerCase()) {
            continue; // already in place (re-run idempotency)
        }
        // If dst already exists from a previous consolidate (same suffix +
        // same basename), drop the new source — the existing file at dst
        // wins and the bin still gets rewritten to point at dst.
        if (fs.existsSync(dstAbs)) {
            try { await fs.promises.unlink(srcAbs); } catch (_) { /* ignore */ }
            sourceDirs.add(path.dirname(srcAbs));
            continue;
        }
        try {
            await fs.promises.mkdir(path.dirname(dstAbs), { recursive: true });
            await fs.promises.rename(srcAbs, dstAbs);
            moved += 1;
            sourceDirs.add(path.dirname(srcAbs));
        } catch (e) {
            // EXDEV (cross-device) → fall back to copy + delete.
            try {
                await fs.promises.copyFile(srcAbs, dstAbs);
                await fs.promises.unlink(srcAbs);
                moved += 1;
                sourceDirs.add(path.dirname(srcAbs));
            } catch (e2) {
                console.log(`[assetConsolidator] move failed ${srcAbs} -> ${dstAbs}: ${e2.message}`);
            }
        }
    }

    // Pass 4: rewrite bin entries with mapping.
    let rewritten = 0;
    const mapper = (str) => {
        const lower = String(str).toLowerCase();
        return pathMap.has(lower) ? pathMap.get(lower) : null;
    };
    for (const [binPath, bin] of binCache.entries()) {
        let touched = false;
        for (const entry of bin.entries || []) {
            if (!entry || entry.type !== VFX_CLASS_HASH) continue;
            for (const f of entry.data || []) {
                rewriteAssetStrings(f, (s) => {
                    const m = mapper(s);
                    if (m != null) touched = true;
                    return m;
                });
            }
        }
        if (touched) {
            try {
                await bin.write(binPath);
                rewritten += 1;
            } catch (e) {
                console.log(`[assetConsolidator] write failed ${binPath}: ${e.message}`);
            }
        }
    }

    // Pass 5: prune the source folders we moved out of, walking up only the
    // chain we touched. rmdirIfEmpty is non-recursive so we never traverse
    // siblings — the output tree could be huge and we'd stall the IPC.
    //
    // CRITICAL: reuses isInsideOutput from Pass 3 so we never climb past
    // `outputDir`. Without this clamp, a fully-emptied output tree could let
    // `walker` reach the user's Desktop and delete the mod folder itself.
    for (const dir of sourceDirs) {
        let walker = dir;
        for (let i = 0; i < 6; i++) {
            if (!isInsideOutput(walker)) break;
            const parent = path.dirname(walker);
            if (!parent || parent === walker) break;
            const removed = await rmdirIfEmpty(walker);
            if (!removed) break; // stop climbing once a dir still has content
            walker = parent;
        }
    }

    console.log(
        `[assetConsolidator] champ=${champ} skin=${skinNum} referenced=${referenced.size} moved=${moved} bins_rewritten=${rewritten} skipped_shared=${skippedShared}`
    );

    return { moved, rewritten, referenced: referenced.size, skippedShared };
}

/**
 * Public entry point.
 *
 * @param {string} dir              Output dir (the user's mod folder).
 * @param {{ prefix?: string }}     options.prefix is the repath custom prefix
 *                                  (e.g. "bum", "testebay"). Empty for raw
 *                                  extract output (no prefix in paths).
 * @returns {Promise<{ scanned: number, results: Array }>}
 */
export async function consolidateAssetsInDir(dir, options = {}) {
    if (!fs || !path) await initNodeModules();
    const prefix = options.prefix || '';
    const aggressive = options.aggressive === true;
    const folderSuffix = options.folderSuffix || '';
    const portingPrefix = options.portingPrefix || '';
    const skinBins = await findSkinBins(dir);
    const results = [];
    for (const { champ, skinNum } of skinBins) {
        const r = await consolidateForSkin(dir, champ, skinNum, prefix, aggressive, folderSuffix, portingPrefix);
        results.push({ champ, skinNum, ...r });
    }
    return { scanned: skinBins.length, results };
}
