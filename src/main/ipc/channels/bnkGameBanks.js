const path = require('path');
const os = require('os');

const CHAMPION_SPECIAL_CASES = {
  wukong: 'monkeyking',
  monkeyking: 'monkeyking',
  'nunu & willump': 'nunu',
  nunu: 'nunu',
};

function logBnkGame(message, extra) {
  const ts = new Date().toISOString();
  if (typeof extra === 'undefined') {
    console.log(`[BNK-GAME ${ts}] ${message}`);
    return;
  }
  console.log(`[BNK-GAME ${ts}] ${message}`, extra);
}

function getChampionFileName(championName) {
  const lower = String(championName || '').toLowerCase();
  return CHAMPION_SPECIAL_CASES[lower] || lower.replace(/[^a-z0-9]/g, '');
}

function normalizeSkinSelectionId(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num >= 1000 ? num % 1000 : num;
}

function normalizeRelPathLower(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function extractSkinSegment(relLower) {
  const rel = String(relLower || '');
  // Supports both folder form (.../skins/skin07/...) and file form (.../skins/skin0.bin).
  const m = rel.match(/\/skins\/([^/]+?)(?:\/|\.|$)/i);
  return m ? String(m[1] || '').toLowerCase() : '';
}

function skinSegmentToNumber(segment) {
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
}

function skinSegmentToKey(segment) {
  const n = skinSegmentToNumber(segment);
  if (Number.isFinite(n)) return `skin${n}`;
  return String(segment || '').toLowerCase().trim();
}

function findChampionVoiceoverWadFiles(fs, leaguePath, championFileName) {
  try {
    const files = fs.readdirSync(leaguePath);
    return files.filter((file) => {
      const lower = String(file || '').toLowerCase();
      return lower.startsWith(championFileName) &&
        lower.endsWith('.wad.client') &&
        lower !== `${championFileName}.wad.client` &&
        (file.charAt(championFileName.length) === '.' || file.charAt(championFileName.length) === '_');
    });
  } catch (error) {
    logBnkGame('Could not scan voiceover WAD files', { error: error?.message });
    return [];
  }
}

function walkFiles(fs, rootDir, out = []) {
  if (!rootDir || !fs.existsSync(rootDir)) return out;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fs, abs, out);
      continue;
    }
    if (entry.isFile()) out.push(abs);
  }
  return out;
}

function groupBanks(filesAbs, outputDir) {
  const scoreBinRel = (relLower) => {
    let score = 0;
    const low = String(relLower || '');
    if (low.includes('data/')) score += 1;
    if (low.includes('characters/')) score += 2;
    if (low.includes('skins/')) score += 2;
    if (low.includes('/data/')) score += 1;
    if (low.includes('/skins/')) score += 1;
    if (low.includes('/characters/')) score += 1;
    return score;
  };

  const groups = new Map();
  const skinToBin = new Map();
  const allBins = [];
  for (const abs of filesAbs) {
    const rel = normalizeRelPathLower(path.relative(outputDir, abs));
    const base = path.basename(rel);
    const lower = base.toLowerCase();
    const skinSeg = extractSkinSegment(rel);
    const skinKey = skinSegmentToKey(skinSeg);

    if (/\.bin$/i.test(lower)) {
      allBins.push({ abs, rel, score: scoreBinRel(rel), skinSeg });
      if (skinKey && !skinToBin.has(skinKey)) skinToBin.set(skinKey, abs);
      continue;
    }
    if (!/\.(bnk|wpk)$/i.test(lower)) continue;

    let key = lower;
    key = key.replace(/_audio\.(bnk|wpk)$/i, '');
    key = key.replace(/_events\.bnk$/i, '');
    key = key.replace(/\.(bnk|wpk)$/i, '');

    const existing = groups.get(key) || {
      key,
      name: key,
      eventsBnk: '',
      audioBnk: '',
      audioWpk: '',
      binPath: '',
      skinSegment: skinKey,
      files: [],
    };

    existing.files.push(abs);
    if (/_events\.bnk$/i.test(lower)) existing.eventsBnk = abs;
    else if (/_audio\.wpk$/i.test(lower)) existing.audioWpk = abs;
    else if (/_audio\.bnk$/i.test(lower)) existing.audioBnk = abs;
    else if (/\.bnk$/i.test(lower) && !existing.audioBnk) existing.audioBnk = abs;
    else if (/\.wpk$/i.test(lower) && !existing.audioWpk) existing.audioWpk = abs;

    groups.set(key, existing);
  }

  allBins.sort((a, b) => b.score - a.score);
  const globalBestBin = allBins[0]?.abs || '';

  const out = Array.from(groups.values()).map((group) => ({
    ...group,
    binPath: group.skinSegment
      ? (skinToBin.get(group.skinSegment) || globalBestBin)
      : globalBestBin,
  }));
  return out;
}

function registerBnkGameBanksChannels({
  ipcMain,
  fs,
  getHashPath,
  getNativeAddon,
  loadWadClassModule,
}) {
  const createdCacheRoots = new Set();
  const cleanupQueue = new Set();
  let cleanupWorkerRunning = false;

  const runCleanupWorker = () => {
    if (cleanupWorkerRunning || cleanupQueue.size === 0) return;
    cleanupWorkerRunning = true;

    setImmediate(async () => {
      try {
        while (cleanupQueue.size > 0) {
          const roots = Array.from(cleanupQueue);
          cleanupQueue.clear();
          await Promise.all(roots.map(async (root) => {
            try {
              if (typeof root === 'string' && root.trim()) {
                await fs.promises.rm(root, { recursive: true, force: true });
              }
            } catch (_) { }
          }));
        }
      } finally {
        cleanupWorkerRunning = false;
        if (cleanupQueue.size > 0) runCleanupWorker();
      }
    });
  };

  ipcMain.handle('bnk:extractBanksFromGame', async (event, payload = {}) => {
    const sendProgress = (message) => {
      try {
        if (event?.sender && !event.sender.isDestroyed()) {
          event.sender.send('bnk:gameProgress', { message });
        }
      } catch (_) { }
    };

    try {
      const championName = String(payload?.championName || '');
      const leaguePath = String(payload?.leaguePath || '');
      const includeVoiceover = payload?.includeVoiceover !== false;
      const includeSfx = payload?.includeSfx !== false;
      const rawSkinIds = Array.isArray(payload?.skinIds) ? payload.skinIds : [];

      const selectedSkinIds = [...new Set(
        rawSkinIds.map(normalizeSkinSelectionId).filter((n) => Number.isFinite(n))
      )];

      logBnkGame('Request received', {
        championName,
        selectedSkinIds,
        includeVoiceover,
        includeSfx,
        leaguePath,
        providedHashPath: String(payload?.hashPath || ''),
      });

      if (!championName || !leaguePath || selectedSkinIds.length === 0) {
        logBnkGame('Validation failed: missing required params');
        return { success: false, error: 'Missing required params: championName, leaguePath, skinIds' };
      }
      if (!includeVoiceover && !includeSfx) {
        logBnkGame('Validation failed: VO and SFX both disabled');
        return { success: false, error: 'Enable at least one bank type: VO or SFX' };
      }

      const championFileName = getChampionFileName(championName);
      const wadFilePath = path.join(leaguePath, `${championFileName}.wad.client`);
      logBnkGame('Resolved champion WAD path', { championFileName, wadFilePath });
      if (!fs.existsSync(wadFilePath)) {
        logBnkGame('WAD not found', { wadFilePath });
        return { success: false, error: `WAD not found: ${wadFilePath}` };
      }

      const nativeAddon = getNativeAddon?.();
      if (!nativeAddon || typeof nativeAddon.extractSelectedAsync !== 'function' || typeof nativeAddon.resolveHashes !== 'function') {
        logBnkGame('Native addon missing required methods', {
          hasAddon: Boolean(nativeAddon),
          hasExtractSelectedAsync: Boolean(nativeAddon && typeof nativeAddon.extractSelectedAsync === 'function'),
          hasResolveHashes: Boolean(nativeAddon && typeof nativeAddon.resolveHashes === 'function'),
        });
        return { success: false, error: 'Native extractSelectedAsync + resolveHashes are required.' };
      }

      const hashPath = getHashPath(payload?.hashPath);
      logBnkGame('Resolved hash path', { hashPath, exists: Boolean(hashPath && fs.existsSync(hashPath)) });
      if (!hashPath || !fs.existsSync(hashPath)) {
        return { success: false, error: 'Hash directory missing. Download hashes first.' };
      }

      const voiceoverWadFiles = includeVoiceover
        ? findChampionVoiceoverWadFiles(fs, leaguePath, championFileName)
        : [];
      const wadPaths = [
        wadFilePath,
        ...voiceoverWadFiles.map((file) => path.join(leaguePath, file)),
      ].filter((value, index, arr) => arr.indexOf(value) === index);
      logBnkGame('WAD selection', {
        baseWad: wadFilePath,
        voiceoverWads: voiceoverWadFiles,
        totalWads: wadPaths.length,
      });

      sendProgress(`Reading WAD table of contents (${wadPaths.length} file(s))...`);
      const { WAD } = await loadWadClassModule();

      const selectedSkinSet = new Set(selectedSkinIds.map((n) => Number(n)));
      const wanted = [];

      const champSfxPrefix = `sounds/wwise2016/sfx/characters/${championFileName}/skins/`;
      const champVoPrefix = 'sounds/wwise2016/vo/';
      const champVoContains = `/characters/${championFileName}/skins/`;
      const champBinPrefixA = `assets/characters/${championFileName}/skins/`;
      const champBinPrefixB = `data/characters/${championFileName}/skins/`;

      for (const currentWadPath of wadPaths) {
        const fd = await fs.promises.open(currentWadPath, 'r');
        let wad;
        try {
          const stat = await fd.stat();
          const tocSize = Math.min(4 * 1024 * 1024, stat.size);
          const tocBuffer = Buffer.alloc(tocSize);
          const { bytesRead } = await fd.read(tocBuffer, 0, tocSize, 0);
          const buf = bytesRead < tocSize ? tocBuffer.subarray(0, bytesRead) : tocBuffer;
          wad = await new WAD().read(buf);
          logBnkGame('WAD TOC read complete', {
            wadFilePath: currentWadPath,
            tocBytesRead: bytesRead,
            chunkCount: Array.isArray(wad?.chunks) ? wad.chunks.length : 0,
          });
        } finally {
          await fd.close().catch(() => { });
        }

        for (const chunk of wad.chunks) {
          if (!chunk.path_hash_hex) chunk.path_hash_hex = chunk.hash;
        }
        const resolved = nativeAddon.resolveHashes(wad.chunks.map((c) => c.hash), hashPath);
        for (let i = 0; i < wad.chunks.length; i++) {
          const p = resolved?.[i];
          if (p && p !== wad.chunks[i].hash) wad.chunks[i].hash = p;
        }
        logBnkGame('Hash resolution applied', {
          wadFilePath: currentWadPath,
          chunkCount: wad.chunks.length,
        });

        let localWantedCount = 0;
        for (const chunk of wad.chunks) {
          const rel = normalizeRelPathLower(chunk.hash);
          if (!rel) continue;

          const isBank = rel.endsWith('.bnk') || rel.endsWith('.wpk');
          const isBin = rel.endsWith('.bin');
          if (!isBank && !isBin) continue;

          let keep = false;
          const skinSeg = extractSkinSegment(rel);
          const skinNum = skinSegmentToNumber(skinSeg);

          if (isBank) {
            if (includeSfx && rel.includes(champSfxPrefix)) {
              if (Number.isFinite(skinNum) && selectedSkinSet.has(skinNum)) keep = true;
            }

            if (!keep && includeVoiceover && rel.includes(champVoPrefix) && rel.includes(champVoContains)) {
              if (skinNum === 0) {
                keep = true;
              } else {
                if (Number.isFinite(skinNum) && selectedSkinSet.has(skinNum)) keep = true;
              }
            }
          }

          if (!keep && isBin && (rel.includes(champBinPrefixA) || rel.includes(champBinPrefixB))) {
            keep = Number.isFinite(skinNum) && selectedSkinSet.has(skinNum);
          }

          if (!keep) continue;

          const hashHex = String(chunk.path_hash_hex || '').toLowerCase();
          if (!/^[0-9a-f]{16}$/i.test(hashHex)) continue;
          wanted.push({
            wadPath: currentWadPath,
            pathHash: hashHex,
            relPath: rel,
          });
          localWantedCount++;
        }

        logBnkGame('WAD candidate scan complete', {
          wadFilePath: currentWadPath,
          localWantedCount,
        });
      }

      logBnkGame('Candidate matching complete', {
        wantedCount: wanted.length,
        banksCount: wanted.filter((x) => /\.(bnk|wpk)$/i.test(String(x.relPath || ''))).length,
        binsCount: wanted.filter((x) => /\.bin$/i.test(String(x.relPath || ''))).length,
        sample: wanted.slice(0, 10).map((x) => x.relPath),
      });
      const wantedBinCount = wanted.filter((x) => /\.bin$/i.test(String(x.relPath || ''))).length;

      if (wanted.length === 0) {
        logBnkGame('No matching banks after filtering', {
          championName,
          selectedSkinIds,
          includeVoiceover,
          includeSfx,
        });
        return {
          success: false,
          error: `No matching banks found for ${championName} skins [${selectedSkinIds.join(', ')}]`,
        };
      }

      const wadStats = [];
      for (const p of wadPaths) {
        try {
          const st = await fs.promises.stat(p);
          wadStats.push(`${path.basename(p)}:${Number(st.size || 0)}:${Math.floor(Number(st.mtimeMs || 0))}`);
        } catch (_) { }
      }
      const wadTagSource = wadStats.sort().join('|');
      let wadTagHash = 0;
      for (let i = 0; i < wadTagSource.length; i++) {
        wadTagHash = ((wadTagHash * 31) + wadTagSource.charCodeAt(i)) >>> 0;
      }
      const wadTag = `h${wadTagHash.toString(16)}_n${wadPaths.length}`;
      const skinTag = selectedSkinIds.slice().sort((a, b) => a - b).join('-');
      const modeTag = `${includeSfx ? 'sfx' : ''}${includeVoiceover ? 'vo' : ''}`;
      const outputDir = path.join(
        process.env.TEMP || process.env.TMP || os.tmpdir(),
        'Quartz',
        'bnk-game-cache',
        `${championFileName}_skins_${skinTag}_${modeTag}_${wadTag}`
      );
      createdCacheRoots.add(outputDir);
      logBnkGame('Output directory resolved', { outputDir });

      // Fast cache hit when files already exist.
      const existingFiles = walkFiles(fs, outputDir).filter((p) => /\.(bnk|wpk|bin)$/i.test(p));
      const existingBankCount = existingFiles.filter((p) => /\.(bnk|wpk)$/i.test(p)).length;
      if (existingBankCount > 0) {
        const groups = groupBanks(existingFiles, outputDir);
        const hasAnyBin = groups.some((g) => Boolean(g.binPath));
        const cacheHasRequiredBin = wantedBinCount === 0 || hasAnyBin;
        if (!cacheHasRequiredBin) {
          logBnkGame('Cache miss: stale bank-only cache detected, forcing re-extract', {
            outputDir,
            existingFileCount: existingFiles.length,
            existingBankCount,
            wantedBinCount,
          });
        } else {
        logBnkGame('Cache hit: using existing extracted banks', {
          outputDir,
          existingFileCount: existingFiles.length,
          existingBankCount,
          groupCount: groups.length,
          hasAnyBin,
        });
        return {
          success: true,
          cacheHit: true,
          outputDir,
          groups,
          extractedCount: existingBankCount,
        };
        }
      }

      sendProgress(`Extracting ${wanted.length} bank file(s) from game...`);
      if (fs.existsSync(outputDir)) {
        logBnkGame('Clearing stale output dir before extraction', { outputDir });
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      fs.mkdirSync(outputDir, { recursive: true });

      const result = await nativeAddon.extractSelectedAsync(wanted, outputDir, true, true);
      logBnkGame('Native extraction finished', {
        result,
        outputDir,
      });
      if (result?.error) {
        return { success: false, error: result.error };
      }

      const files = walkFiles(fs, outputDir).filter((p) => /\.(bnk|wpk|bin)$/i.test(p));
      const bankFiles = files.filter((p) => /\.(bnk|wpk)$/i.test(p));
      if (bankFiles.length === 0) {
        logBnkGame('Extraction produced no BNK/WPK files', { outputDir });
        return { success: false, error: 'Extraction succeeded but no .bnk/.wpk files were produced' };
      }
      const groups = groupBanks(files, outputDir);
      logBnkGame('Extraction complete and grouped', {
        extractedFileCount: files.length,
        extractedBankCount: bankFiles.length,
        groupCount: groups.length,
        groups: groups.map((g) => ({
          key: g.key,
          hasEvents: Boolean(g.eventsBnk),
          hasAudioBnk: Boolean(g.audioBnk),
          hasAudioWpk: Boolean(g.audioWpk),
          hasBin: Boolean(g.binPath),
          fileCount: Array.isArray(g.files) ? g.files.length : 0,
        })),
      });

      return {
        success: true,
        cacheHit: false,
        outputDir,
        groups,
        extractedCount: bankFiles.length,
      };
    } catch (error) {
      console.error('[bnk:extractBanksFromGame] Error:', error);
      logBnkGame('Unhandled error', {
        message: error?.message,
        stack: error?.stack,
      });
      return { success: false, error: error.message, stack: error.stack };
    }
  });

  ipcMain.handle('bnk:cleanupGameCache', async (_event, payload = {}) => {
    try {
      const cleanupAll = payload?.cleanupAll !== false;
      const requestedRoots = Array.isArray(payload?.roots) ? payload.roots : [];
      const cacheBaseDir = path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'Quartz', 'bnk-game-cache');
      const toDelete = new Set();

      if (cleanupAll) {
        toDelete.add(cacheBaseDir);
        for (const root of createdCacheRoots) toDelete.add(root);
      } else {
        for (const root of requestedRoots) {
          if (typeof root === 'string' && root.trim()) toDelete.add(root);
        }
      }

      for (const root of toDelete) {
        cleanupQueue.add(root);
        createdCacheRoots.delete(root);
      }

      runCleanupWorker();
      logBnkGame('Queued BNK cache cleanup', { queued: toDelete.size, cleanupAll });
      return { success: true, queued: toDelete.size };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerBnkGameBanksChannels };
