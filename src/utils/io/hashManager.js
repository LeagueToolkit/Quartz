/**
 * Hash Manager - Automatic hash download and management
 * Downloads hash files from CommunityDragon and stores them in AppData
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// Hash files to download from CommunityDragon
const HASH_FILES = [
  'hashes.binentries.txt',
  'hashes.binfields.txt',
  'hashes.binhashes.txt',
  'hashes.bintypes.txt',
  'hashes.lcu.txt'
];

// hashes.game.txt is split into two parts
const GAME_HASH_PART_URLS = [
  'https://raw.githubusercontent.com/CommunityDragon/Data/master/hashes/lol/hashes.game.txt.0',
  'https://raw.githubusercontent.com/CommunityDragon/Data/master/hashes/lol/hashes.game.txt.1'
];

const BASE_URL = 'https://raw.githubusercontent.com/CommunityDragon/Data/master/hashes/lol/';
const META_FILE_NAME = 'hashes-meta.json';

// Cache the hash directory path to avoid redundant checks and logging
let cachedHashDir = null;

/**
 * Get the integrated hash directory path (AppData/Roaming/FrogTools/hashes)
 * Creates the full directory structure: FrogTools/hashes/
 * @returns {string} Path to hash directory
 */
function getHashDirectory() {
  if (cachedHashDir) {
    return cachedHashDir; // Return cached path immediately
  }

  try {
    const appDataPath = process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(process.env.HOME, 'Library', 'Application Support')
        : process.platform === 'linux'
          ? path.join(process.env.HOME, '.local', 'share')
          : path.join(process.env.HOME, 'AppData', 'Roaming'));

    console.log('[hashManager] Resolving hash directory...');
    console.log(`[hashManager]   - APPDATA: ${process.env.APPDATA || 'undefined'}`);
    console.log(`[hashManager]   - HOME: ${process.env.HOME || 'undefined'}`);
    console.log(`[hashManager]   - platform: ${process.platform}`);
    console.log(`[hashManager]   - Resolved appDataPath: ${appDataPath}`);

    // Create FrogTools directory first
    const frogToolsDir = path.join(appDataPath, 'FrogTools');
    if (!fs.existsSync(frogToolsDir)) {
      console.log(`[hashManager] Creating FrogTools directory: ${frogToolsDir}`);
      fs.mkdirSync(frogToolsDir, { recursive: true });
    }

    // Create hashes subfolder inside FrogTools
    const hashDir = path.join(frogToolsDir, 'hashes');
    if (!fs.existsSync(hashDir)) {
      console.log(`[hashManager] Creating hashes directory: ${hashDir}`);
      fs.mkdirSync(hashDir, { recursive: true });
    }

    console.log(`[hashManager] ✓ Hash directory resolved: ${hashDir}`);
    cachedHashDir = hashDir; // Cache the result
    return hashDir;
  } catch (error) {
    console.error('[hashManager] ❌ Error getting hash directory:', error);
    console.error('[hashManager]   - Error message:', error.message);
    console.error('[hashManager]   - Error stack:', error.stack);
    throw error;
  }
}

/**
 * Check if all required hash files exist
 * @returns {Object} { allPresent: boolean, missing: string[], hashDir: string }
 */
function checkHashes() {
  const hashDir = getHashDirectory();
  const required = [...HASH_FILES, 'hashes.game.txt'];
  const missing = [];

  for (const filename of required) {
    const filePath = path.join(hashDir, filename);
    if (!fs.existsSync(filePath)) {
      missing.push(filename);
    }
  }

  return {
    allPresent: missing.length === 0,
    missing,
    hashDir
  };
}

/**
 * Fast-path gate for startup auto-sync.
 * Returns true when required files exist and metadata was updated recently.
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

/**
 * Download a file from URL
 * @param {string} url - URL to download from
 * @param {string} filePath - Local file path to save to
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<void>}
 */
function downloadFile(url, filePath, progressCallback = null) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const file = fs.createWriteStream(filePath);

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        file.close();
        fs.unlinkSync(filePath);
        return downloadFile(response.headers.location, filePath, progressCallback)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(filePath);
        return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (progressCallback && totalSize) {
          progressCallback(downloadedSize, totalSize, url);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(response.headers || {});
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      reject(err);
    });
  });
}

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
  const payload = {
    updatedAt: new Date().toISOString(),
    files: meta,
  };
  fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2));
}

function getMetaFilesMap(hashDir) {
  const raw = readHashesMeta(hashDir);
  if (raw?.files && typeof raw.files === 'object') return raw.files;
  return raw && typeof raw === 'object' ? raw : {};
}

function localFileState(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const s = fs.statSync(filePath);
    return {
      mtimeMs: Number(s.mtimeMs || 0),
      size: Number(s.size || 0),
    };
  } catch {
    return null;
  }
}

function probeRemoteFile(url, previous = {}) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https:') ? https : http;
    const headers = {
      'User-Agent': 'Quartz-HashManager/1.0',
      'Accept': '*/*',
    };
    if (previous?.etag) headers['If-None-Match'] = previous.etag;
    if (previous?.lastModified) headers['If-Modified-Since'] = previous.lastModified;

    const req = protocol.request(url, { method: 'HEAD', headers }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        response.resume();
        const location = response.headers.location;
        if (!location) return resolve({ ok: false, error: 'Redirect without location' });
        return resolve(probeRemoteFile(location, previous));
      }

      const status = Number(response.statusCode || 0);
      const out = {
        ok: status === 200 || status === 304,
        status,
        notModified: status === 304,
        etag: response.headers?.etag || '',
        lastModified: response.headers?.['last-modified'] || '',
        contentLength: Number(response.headers?.['content-length'] || 0),
        finalUrl: url,
      };
      response.resume();
      resolve(out);
    });
    req.on('error', (error) => resolve({ ok: false, error: String(error?.message || error) }));
    req.end();
  });
}

/**
 * Download all hash files
 * @param {Function} progressCallback - Optional progress callback (filename, current, total)
 * @returns {Promise<Object>} { success: boolean, downloaded: string[], errors: string[] }
 */
async function downloadHashes(progressCallback = null) {
  const hashDir = getHashDirectory();
  const downloaded = [];
  const skipped = [];
  const errors = [];
  const meta = getMetaFilesMap(hashDir);

  try {
    // Download simple hash files
    for (let i = 0; i < HASH_FILES.length; i++) {
      const filename = HASH_FILES[i];
      const url = BASE_URL + filename;
      const filePath = path.join(hashDir, filename);
      const previous = meta[filename] || {};
      const local = localFileState(filePath);

      try {
        const remote = await probeRemoteFile(url, previous);
        const shouldSkip =
          remote?.ok &&
          local &&
          (
            remote.notModified ||
            (remote.lastModified && local.mtimeMs >= new Date(remote.lastModified).getTime())
          );

        if (shouldSkip) {
          skipped.push(filename);
          meta[filename] = {
            url,
            etag: remote.etag || previous.etag || '',
            lastModified: remote.lastModified || previous.lastModified || '',
            lastCheckedAt: new Date().toISOString(),
            localMtimeMs: local.mtimeMs,
            localSize: local.size,
          };
          if (progressCallback) {
            progressCallback(`Up to date: ${filename}`, i + 1, HASH_FILES.length + 2);
          }
          continue;
        }

        if (progressCallback) {
          progressCallback(`Downloading ${filename}...`, i + 1, HASH_FILES.length + 2);
        }

        const headers = await downloadFile(url, filePath);
        const after = localFileState(filePath);
        downloaded.push(filename);
        meta[filename] = {
          url,
          etag: headers?.etag || remote?.etag || '',
          lastModified: headers?.['last-modified'] || remote?.lastModified || '',
          lastCheckedAt: new Date().toISOString(),
          localMtimeMs: after?.mtimeMs || 0,
          localSize: after?.size || 0,
        };
      } catch (error) {
        console.error(`Failed to download ${filename}:`, error);
        errors.push(`${filename}: ${error.message}`);
      }
    }

    // Download hashes.game.txt (split into two parts)
    const gameHashPath = path.join(hashDir, 'hashes.game.txt');
    const tempPart0 = path.join(hashDir, 'hashes.game.txt.part0');
    const tempPart1 = path.join(hashDir, 'hashes.game.txt.part1');
    const gameMeta = meta['hashes.game.txt'] || {};
    const gameLocal = localFileState(gameHashPath);

    try {
      const p0Remote = await probeRemoteFile(GAME_HASH_PART_URLS[0], gameMeta.part0 || {});
      const p1Remote = await probeRemoteFile(GAME_HASH_PART_URLS[1], gameMeta.part1 || {});
      const gameShouldSkip =
        gameLocal &&
        p0Remote?.ok &&
        p1Remote?.ok &&
        (p0Remote.notModified || p1Remote.notModified ||
          ((p0Remote.lastModified && gameLocal.mtimeMs >= new Date(p0Remote.lastModified).getTime()) &&
            (p1Remote.lastModified && gameLocal.mtimeMs >= new Date(p1Remote.lastModified).getTime())));

      if (gameShouldSkip) {
        skipped.push('hashes.game.txt');
        meta['hashes.game.txt'] = {
          ...gameMeta,
          lastCheckedAt: new Date().toISOString(),
          localMtimeMs: gameLocal.mtimeMs,
          localSize: gameLocal.size,
          part0: {
            etag: p0Remote.etag || gameMeta?.part0?.etag || '',
            lastModified: p0Remote.lastModified || gameMeta?.part0?.lastModified || '',
          },
          part1: {
            etag: p1Remote.etag || gameMeta?.part1?.etag || '',
            lastModified: p1Remote.lastModified || gameMeta?.part1?.lastModified || '',
          },
        };
        if (progressCallback) {
          progressCallback('Up to date: hashes.game.txt', HASH_FILES.length + 2, HASH_FILES.length + 2);
        }
        writeHashesMeta(hashDir, meta);
        return {
          success: errors.length === 0,
          downloaded,
          skipped,
          errors,
          hashDir
        };
      }

      if (progressCallback) {
        progressCallback('Downloading hashes.game.txt (part 1/2)...', HASH_FILES.length + 1, HASH_FILES.length + 2);
      }
      // Download part 0
      const part0Headers = await downloadFile(GAME_HASH_PART_URLS[0], tempPart0);

      if (progressCallback) {
        progressCallback('Downloading hashes.game.txt (part 2/2)...', HASH_FILES.length + 2, HASH_FILES.length + 2);
      }

      // Download part 1
      const part1Headers = await downloadFile(GAME_HASH_PART_URLS[1], tempPart1);

      // Combine parts
      const part0Data = fs.readFileSync(tempPart0);
      const part1Data = fs.readFileSync(tempPart1);
      fs.writeFileSync(gameHashPath, Buffer.concat([part0Data, part1Data]));

      // Clean up temp files
      fs.unlinkSync(tempPart0);
      fs.unlinkSync(tempPart1);

      downloaded.push('hashes.game.txt');
      const gameAfter = localFileState(gameHashPath);
      meta['hashes.game.txt'] = {
        url: `${GAME_HASH_PART_URLS[0]} + ${GAME_HASH_PART_URLS[1]}`,
        lastCheckedAt: new Date().toISOString(),
        localMtimeMs: gameAfter?.mtimeMs || 0,
        localSize: gameAfter?.size || 0,
        part0: {
          etag: part0Headers?.etag || p0Remote?.etag || '',
          lastModified: part0Headers?.['last-modified'] || p0Remote?.lastModified || '',
        },
        part1: {
          etag: part1Headers?.etag || p1Remote?.etag || '',
          lastModified: part1Headers?.['last-modified'] || p1Remote?.lastModified || '',
        },
      };
    } catch (error) {
      console.error('Failed to download hashes.game.txt:', error);
      errors.push(`hashes.game.txt: ${error.message}`);

      // Clean up temp files if they exist
      try {
        if (fs.existsSync(tempPart0)) fs.unlinkSync(tempPart0);
        if (fs.existsSync(tempPart1)) fs.unlinkSync(tempPart1);
      } catch { }
    }

    writeHashesMeta(hashDir, meta);

    return {
      success: errors.length === 0,
      downloaded,
      skipped,
      errors,
      hashDir
    };
  } catch (error) {
    return {
      success: false,
      downloaded,
      skipped,
      errors: [...errors, `General error: ${error.message}`],
      hashDir
    };
  }
}

/**
 * Get hash directory path (for use in frontend)
 */
function getHashDirPath() {
  return getHashDirectory();
}

module.exports = {
  getHashDirectory,
  getHashDirPath,
  checkHashes,
  isAutoSyncFresh,
  downloadHashes,
  HASH_FILES
};
