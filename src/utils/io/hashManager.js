/**
 * Hash Manager - Downloads pre-built LMDB hash databases from lmdb-hashes releases.
 * Two separate DBs: hashes-wad.lmdb (WAD xxh64) and hashes-bin.lmdb (BIN FNV1a).
 */

const path = require('path');
const fs = require('fs');
const https = require('https');

const RELEASE_API_URL = 'https://api.github.com/repos/LeagueToolkit/lmdb-hashes/releases/latest';
const ASSETS = [
  { name: 'lol-hashes-wad.zst', lmdbDir: 'hashes-wad.lmdb', label: 'WAD hashes' },
  { name: 'lol-hashes-bin.zst', lmdbDir: 'hashes-bin.lmdb', label: 'BIN hashes' },
];
const META_FILE_NAME = 'hashes-meta.json';

let cachedHashDir = null;
let nativeAddon = null;
let nativeLoadAttempted = false;

function tryLoadNativeAddon() {
  if (nativeLoadAttempted) return nativeAddon;
  nativeLoadAttempted = true;

  const candidates = [];
  try {
    const cwd = process.cwd();
    const devDir = path.join(cwd, 'native', 'wad_indexer');
    candidates.push(path.join(devDir, 'wad_indexer.node'));
    candidates.push(path.join(devDir, 'index.node'));
    if (fs.existsSync(devDir)) {
      for (const file of fs.readdirSync(devDir)) {
        if (file.endsWith('.node')) candidates.push(path.join(devDir, file));
      }
    }
  } catch { }

  try {
    if (process.resourcesPath) {
      const prodDirs = [
        path.join(process.resourcesPath, 'native', 'wad_indexer'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'wad_indexer'),
      ];
      for (const dir of prodDirs) {
        candidates.push(path.join(dir, 'wad_indexer.node'));
        candidates.push(path.join(dir, 'index.node'));
        if (fs.existsSync(dir)) {
          for (const file of fs.readdirSync(dir)) {
            if (file.endsWith('.node')) candidates.push(path.join(dir, file));
          }
        }
      }
    }
  } catch { }

  for (const p of [...new Set(candidates)]) {
    try {
      nativeAddon = require(p);
      return nativeAddon;
    } catch { }
  }
  return null;
}

/**
 * Get the hash directory path (AppData/Roaming/FrogTools/hashes)
 * @returns {string}
 */
function getHashDirectory() {
  if (cachedHashDir) return cachedHashDir;

  try {
    const appDataPath = process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(process.env.HOME, 'Library', 'Application Support')
        : process.platform === 'linux'
          ? path.join(process.env.HOME, '.local', 'share')
          : path.join(process.env.HOME, 'AppData', 'Roaming'));

    const frogToolsDir = path.join(appDataPath, 'FrogTools');
    if (!fs.existsSync(frogToolsDir)) {
      fs.mkdirSync(frogToolsDir, { recursive: true });
    }

    const hashDir = path.join(frogToolsDir, 'hashes');
    if (!fs.existsSync(hashDir)) {
      fs.mkdirSync(hashDir, { recursive: true });
    }

    cachedHashDir = hashDir;
    return hashDir;
  } catch (error) {
    console.error('[hashManager] Error getting hash directory:', error);
    throw error;
  }
}

/**
 * Check if LMDB hash databases exist.
 * @returns {{ allPresent: boolean, missing: string[], hashDir: string }}
 */
function checkHashes() {
  const hashDir = getHashDirectory();
  const missing = [];
  for (const asset of ASSETS) {
    const dataMdb = path.join(hashDir, asset.lmdbDir, 'data.mdb');
    if (!fs.existsSync(dataMdb)) missing.push(asset.name);
  }
  return { allPresent: missing.length === 0, missing, hashDir };
}

/**
 * Fast-path gate for startup auto-sync.
 * Returns true when LMDBs exist and metadata was updated recently.
 * @param {number} maxAgeMinutes
 * @returns {boolean}
 */
function isAutoSyncFresh(maxAgeMinutes = 30) {
  try {
    const status = checkHashes();
    if (!status.allPresent) return false;

    const metaPath = path.join(status.hashDir, META_FILE_NAME);
    if (!fs.existsSync(metaPath)) return false;

    const metaRaw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const updatedAt = new Date(metaRaw?.updatedAt || 0).getTime();
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) return false;

    const ageMs = Date.now() - updatedAt;
    return ageMs >= 0 && ageMs <= (maxAgeMinutes * 60 * 1000);
  } catch {
    return false;
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Quartz-HashManager/1.0',
        'Accept': 'application/vnd.github.v3+json',
      },
    };

    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        return fetchJSON(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`GitHub API HTTP ${res.statusCode}`));
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from GitHub API')); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, filePath, progressCallback = null) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : require('http');
    const options = {
      headers: { 'User-Agent': 'Quartz-HashManager/1.0' },
    };

    protocol.get(url, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        response.resume();
        return downloadFile(response.headers.location, filePath, progressCallback)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }

      const file = fs.createWriteStream(filePath);
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (progressCallback && totalSize) {
          progressCallback(downloadedSize, totalSize);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        file.close();
        try { fs.unlinkSync(filePath); } catch { }
        reject(err);
      });
    }).on('error', (err) => {
      try { fs.unlinkSync(filePath); } catch { }
      reject(err);
    });
  });
}

// ── Metadata persistence ─────────────────────────────────────────────────────

function readHashesMeta(hashDir) {
  const metaPath = path.join(hashDir, META_FILE_NAME);
  try {
    if (!fs.existsSync(metaPath)) return {};
    const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeHashesMeta(hashDir, meta) {
  const metaPath = path.join(hashDir, META_FILE_NAME);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

// ── Main download logic ──────────────────────────────────────────────────────

/**
 * Download pre-built LMDB databases from lmdb-hashes releases.
 * Downloads lol-hashes-wad.zst and lol-hashes-bin.zst separately.
 * @param {Function} progressCallback - (message, current, total)
 * @returns {Promise<{ success: boolean, downloaded: string[], skipped: string[], errors: string[], hashDir: string }>}
 */
async function downloadHashes(progressCallback = null) {
  const hashDir = getHashDirectory();
  const downloaded = [];
  const skipped = [];
  const errors = [];
  const totalSteps = ASSETS.length + 1; // +1 for API fetch

  try {
    // 1. Fetch latest release info
    if (progressCallback) progressCallback('Checking for hash updates...', 0, totalSteps);
    const releaseInfo = await fetchJSON(RELEASE_API_URL);
    if (!releaseInfo || !releaseInfo.tag_name) {
      throw new Error('Failed to fetch release info from GitHub');
    }

    const latestTag = releaseInfo.tag_name;
    const meta = readHashesMeta(hashDir);
    const storedTag = meta.releaseTag || '';

    // Check native addon availability
    const addon = tryLoadNativeAddon();
    if (!addon || typeof addon.decompressZstdFile !== 'function') {
      throw new Error('Native addon not available for zstd decompression. Rebuild wad_indexer.');
    }

    let anyUpdated = false;

    // 2. Download each asset
    for (let i = 0; i < ASSETS.length; i++) {
      const asset = ASSETS[i];
      const step = i + 1;
      const lmdbDir = path.join(hashDir, asset.lmdbDir);
      const dataMdb = path.join(lmdbDir, 'data.mdb');

      // Find the asset in the release
      const releaseAsset = (releaseInfo.assets || []).find(a => a.name === asset.name);
      if (!releaseAsset) {
        errors.push(`Asset ${asset.name} not found in release`);
        continue;
      }

      // Skip if already up to date
      if (latestTag === storedTag && fs.existsSync(dataMdb)) {
        skipped.push(asset.name);
        if (progressCallback) progressCallback(`${asset.label} up to date`, step, totalSteps);
        continue;
      }

      // Download .zst
      if (progressCallback) progressCallback(`Downloading ${asset.label}...`, step, totalSteps);
      const zstPath = path.join(hashDir, asset.name);
      await downloadFile(releaseAsset.browser_download_url, zstPath, (dlBytes, dlTotal) => {
        if (progressCallback) {
          const pct = dlTotal > 0 ? Math.round((dlBytes / dlTotal) * 100) : 0;
          progressCallback(`Downloading ${asset.label}... ${pct}%`, step, totalSteps);
        }
      });

      // Close LMDB before replacing data.mdb
      if (typeof addon.clearHashTables === 'function') {
        addon.clearHashTables();
      }

      // Ensure target dir exists
      if (!fs.existsSync(lmdbDir)) fs.mkdirSync(lmdbDir, { recursive: true });

      // Decompress .zst → data.mdb
      if (progressCallback) progressCallback(`Decompressing ${asset.label}...`, step, totalSteps);
      const ok = addon.decompressZstdFile(zstPath, dataMdb);
      if (!ok) {
        try { fs.unlinkSync(zstPath); } catch { }
        errors.push(`Failed to decompress ${asset.name}`);
        continue;
      }

      // Cleanup temp .zst
      try { fs.unlinkSync(zstPath); } catch { }
      downloaded.push(asset.name);
      anyUpdated = true;
    }

    // 3. Update metadata
    if (anyUpdated || skipped.length > 0) {
      meta.releaseTag = latestTag;
      meta.updatedAt = new Date().toISOString();
    }
    meta.lastCheckedAt = new Date().toISOString();
    writeHashesMeta(hashDir, meta);

    if (progressCallback) {
      const msg = anyUpdated
        ? `Hash databases updated (${downloaded.length} file(s))`
        : 'Hash databases are up to date';
      progressCallback(msg, totalSteps, totalSteps);
    }

    return { success: errors.length === 0, downloaded, skipped, errors, hashDir };
  } catch (error) {
    console.error('[hashManager] Download error:', error);
    return {
      success: false,
      downloaded,
      skipped,
      errors: [...errors, error.message],
      hashDir,
    };
  }
}

// ── Legacy hash migration ─────────────────────────────────────────────────────

const LEGACY_FILES = [
  'hashes.binentries.txt',
  'hashes.binentries.txt.v8cache',
  'hashes.binfields.txt',
  'hashes.binfields.txt.v8cache',
  'hashes.binhashes.txt',
  'hashes.binhashes.txt.v8cache',
  'hashes.bintypes.txt',
  'hashes.bintypes.txt.v8cache',
  'hashes.game.txt',
  'hashes.game.txt.v8cache',
  'hashes.lcu.txt',
  'hashes.lcu.txt.v8cache',
];
const LEGACY_DIRS = [
  'hashes.lmdb',
];

/**
 * Remove old txt/v8cache hash files and old hashes.lmdb dir from a previous version.
 * Never touches hashes.extracted.txt, hashes-wad.lmdb, hashes-bin.lmdb, or hashes-meta.json.
 * @returns {number} number of items removed
 */
function migrateLegacyHashes() {
  try {
    const hashDir = getHashDirectory();
    let removed = 0;
    for (const name of LEGACY_FILES) {
      const p = path.join(hashDir, name);
      if (fs.existsSync(p)) { fs.unlinkSync(p); removed++; }
    }
    for (const name of LEGACY_DIRS) {
      const p = path.join(hashDir, name);
      if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); removed++; }
    }
    return removed;
  } catch (err) {
    console.error('[hashManager] Legacy migration error:', err.message);
    return 0;
  }
}

module.exports = {
  getHashDirectory,
  getHashDirPath: getHashDirectory,
  checkHashes,
  isAutoSyncFresh,
  downloadHashes,
  migrateLegacyHashes,
};
