/**
 * Bin splitter — pure-JS port of quartz_cli `separate-vfx` / `separate-anm`.
 *
 * Operates on a single skin*.bin (the same way the right-click context menu
 * does). FrogChanger calls this after repath / Skin Files Only extract, both
 * of which combine all linked bin content into the skin bin already, so every
 * top-level entry we care about is already in that one file.
 */

import { BIN } from '../../jsritofile/index.js';
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
                console.error('[binSplitter] Failed to initialize fs/path:', e);
            }
        }
    })();
    return initPromise;
}

if (typeof window === 'undefined') {
    initNodeModules().catch(() => { });
}

const ANM_CLASS_HASH = hashToHex(FNV1a('AnimationGraphData'));
const VFX_CLASS_HASH = hashToHex(FNV1a('VfxSystemDefinitionData'));

const KIND_TO_CLASS = {
    vfx: VFX_CLASS_HASH,
    anm: ANM_CLASS_HASH,
};

function capitalizeFirst(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Champion name from a path that contains `/characters/<champ>/`. */
function detectChampName(absPath) {
    const posix = String(absPath || '').replace(/\\/g, '/').toLowerCase();
    const m = posix.match(/\/characters\/([^/]+)\//);
    return m ? m[1] : null;
}

/** Walk up to find `data/`'s parent, same as Rust `find_root_dir`. */
function findRootDir(binAbsPath) {
    let cur = path.dirname(binAbsPath);
    const seen = new Set();
    while (cur && !seen.has(cur)) {
        seen.add(cur);
        if (path.basename(cur).toLowerCase() === 'data') return path.dirname(cur);
        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
    }
    return path.dirname(binAbsPath);
}

/**
 * Split a single bin by class hash — mirrors Rust `separate_<kind>::run()`.
 *
 * Reads `binAbsPath`, pulls every entry whose class hash matches the target
 * into a fresh sibling `data/<champ>_<kind>_<stem>.bin`, removes them from
 * the source bin, and adds the dependency link.
 */
async function splitOne(binAbsPath, kind) {
    const classHash = KIND_TO_CLASS[kind];
    if (!classHash) return { status: 'error', error: `unknown kind: ${kind}` };

    let bin;
    try {
        bin = await new BIN().read(binAbsPath);
    } catch (e) {
        return { status: 'error', error: `read failed: ${e.message}` };
    }

    if (!Array.isArray(bin.entries) || bin.entries.length === 0) {
        return { status: 'no-target' };
    }

    // Already-split guard so re-runs on a pure split bin are a no-op.
    if (bin.entries.every((e) => e && e.type === classHash)) {
        return { status: 'already-split' };
    }

    const targetEntries = bin.entries.filter((e) => e && e.type === classHash);
    console.log(
        `[binSplitter] ${kind}: ${binAbsPath} entries=${bin.entries.length} matches=${targetEntries.length}`
    );
    if (targetEntries.length === 0) return { status: 'no-target' };

    const champ = detectChampName(binAbsPath);
    const stemLower = path.basename(binAbsPath, path.extname(binAbsPath)).toLowerCase();
    const champLower = champ ? champ.toLowerCase() : null;
    const fileNameLower = champLower
        ? `${champLower}_${kind}_${stemLower}.bin`
        : `${stemLower}_${kind}.bin`;
    const linkName = champ
        ? `${capitalizeFirst(champ)}_${kind}_${stemLower}.bin`
        : `${capitalizeFirst(stemLower)}_${kind}.bin`;
    const linkStr = `DATA/${linkName}`;

    const rootDir = findRootDir(binAbsPath);
    const newBinAbs = path.join(rootDir, 'data', fileNameLower);

    try {
        await fs.promises.mkdir(path.dirname(newBinAbs), { recursive: true });
    } catch (e) {
        return { status: 'error', error: `mkdir failed: ${e.message}` };
    }

    const splitBin = new BIN();
    splitBin.signature = 'PROP';
    splitBin.version = bin.version || 3;
    splitBin.isPatch = false;
    splitBin.links = [];
    splitBin.entries = targetEntries;
    splitBin.patches = [];

    try {
        await splitBin.write(newBinAbs);
    } catch (e) {
        return { status: 'error', error: `write split failed: ${e.message}` };
    }

    bin.entries = bin.entries.filter((e) => !e || e.type !== classHash);
    if (!Array.isArray(bin.links)) bin.links = [];
    const already = bin.links.some(
        (l) => typeof l === 'string' && l.toLowerCase() === linkStr.toLowerCase()
    );
    if (!already) bin.links.push(linkStr);

    try {
        await bin.write(binAbsPath);
    } catch (e) {
        return { status: 'error', error: `rewrite source failed: ${e.message}` };
    }

    return { status: 'split', count: targetEntries.length, link: linkStr, file: newBinAbs };
}

// Find every canonical skin bin under <dir>/data/characters/<champ>/skins/.
async function findSkinBins(dir) {
    if (!fs || !path) await initNodeModules();
    const charactersDir = path.join(dir, 'data', 'characters');
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
            if (/^skin\d+\.bin$/i.test(skinEnt.name)) {
                out.push(path.join(skinsDir, skinEnt.name));
            }
        }
    }
    return out;
}

/**
 * Split every skin*.bin under `dir` for the requested kinds.
 *
 * @param {string} dir
 * @param {{ splitVfx?: boolean, splitAnm?: boolean }} options
 */
export async function splitSkinBinsInDir(dir, options = {}) {
    const { splitVfx = false, splitAnm = false } = options;
    if (!splitVfx && !splitAnm) return { scanned: 0, results: [] };
    if (!fs || !path) await initNodeModules();

    const skinBins = await findSkinBins(dir);
    const results = [];

    for (const binPath of skinBins) {
        if (splitVfx) {
            const r = await splitOne(binPath, 'vfx');
            results.push({ binPath, kind: 'vfx', ...r });
        }
        if (splitAnm) {
            const r = await splitOne(binPath, 'anm');
            results.push({ binPath, kind: 'anm', ...r });
        }
    }

    return { scanned: skinBins.length, results };
}
