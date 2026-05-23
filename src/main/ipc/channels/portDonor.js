const path = require('path');
const os = require('os');

const CHAMPION_SPECIAL_CASES = {
  wukong: 'monkeyking',
  monkeyking: 'monkeyking',
  'nunu & willump': 'nunu',
  nunu: 'nunu',
  'renata glasc': 'renata',
};

function getChampionFileName(championName) {
  const lower = String(championName || '').toLowerCase();
  return CHAMPION_SPECIAL_CASES[lower] || lower.replace(/[^a-z0-9]/g, '');
}

// Returns ordered list of WAD filename candidates to try (without extension).
// Riot's filename conventions are inconsistent — some champs use the full
// sanitized name (Kai'Sa → kaisa), others use just the first word (Renata
// Glasc → Renata). Try the special-case mapping, then sanitized, then first
// space-separated token, then the literal lowercased input.
function getChampionFileNameCandidates(championName) {
  const lower = String(championName || '').toLowerCase();
  const candidates = [];
  if (CHAMPION_SPECIAL_CASES[lower]) candidates.push(CHAMPION_SPECIAL_CASES[lower]);
  const sanitized = lower.replace(/[^a-z0-9]/g, '');
  if (sanitized) candidates.push(sanitized);
  const firstWord = lower.split(/\s+/)[0]?.replace(/[^a-z0-9]/g, '');
  if (firstWord) candidates.push(firstWord);
  if (lower) candidates.push(lower);
  return [...new Set(candidates)].filter(Boolean);
}

function findChampionWadPath(leaguePath, championName, fs) {
  const candidates = getChampionFileNameCandidates(championName);
  for (const name of candidates) {
    const wadPath = path.join(leaguePath, `${name}.wad.client`);
    if (fs.existsSync(wadPath)) return wadPath;
  }
  return null;
}

function normalizeSkinSelectionId(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num >= 1000 ? num % 1000 : num;
}

function normalizeRelPathLower(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function toAbsFromRel(rootDir, relPathLower) {
  return path.join(rootDir, ...String(relPathLower || '').split('/'));
}

function normalizeLinkCandidate(linkValue) {
  const raw = normalizeRelPathLower(linkValue);
  if (!raw) return [];
  const candidates = [raw];
  if (!raw.endsWith('.bin')) candidates.push(`${raw}.bin`);
  return [...new Set(candidates)];
}

function registerPortDonorChannels({
  ipcMain,
  fs,
  getHashPath,
  getNativeAddon,
  loadWadClassModule,
  loadBinModule,
  loadBumpathModule,
  loadAssetConsolidatorModule,
}) {
  const createdTempRoots = new Set();
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

  ipcMain.handle('port:prepareDonorFromSkin', async (event, data) => {
    const sendProgress = (message) => {
      try {
        if (event?.sender && !event.sender.isDestroyed()) {
          event.sender.send('port:donorProgress', { message });
        }
      } catch (_) { }
    };

    const safeRmDir = (dirPath) => {
      try {
        if (dirPath && fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      } catch (_) { }
    };

    try {
      const {
        championName,
        skinId,
        chromaId = null,
        leaguePath,
        hashPath: rawHashPath,
        isTftMode = false,
      } = data || {};

      if (!championName || skinId == null || !leaguePath) {
        return { success: false, error: 'Missing required parameters: championName, skinId, leaguePath' };
      }

      // TFT tacticians live in Game/DATA/FINAL/Companions.wad.client. The caller
      // passes the per-skin tactician alias as championName so downstream BIN
      // selection (data/characters/<alias>/skins/skin<N>.bin) still matches.
      let wadFilePath;
      if (isTftMode) {
        const tftWadDir = path.dirname(leaguePath);
        const candidate = path.join(tftWadDir, 'Companions.wad.client');
        if (fs.existsSync(candidate)) wadFilePath = candidate;
        if (!wadFilePath) {
          return { success: false, error: `Companions.wad.client not found at ${candidate}` };
        }
      } else {
        wadFilePath = findChampionWadPath(leaguePath, championName, fs);
        if (!wadFilePath) {
          const tried = getChampionFileNameCandidates(championName)
            .map(n => `${n}.wad.client`).join(', ');
          return { success: false, error: `WAD file not found in ${leaguePath} (tried: ${tried})` };
        }
      }
      // For TFT, championFileName is the tactician alias (e.g. petchibiahri),
      // NOT the WAD filename ("companions") — needed for skin BIN path matching.
      const championFileName = isTftMode
        ? String(championName).toLowerCase()
        : path.basename(wadFilePath, '.wad.client').toLowerCase();

      const normalizedSkinId = normalizeSkinSelectionId(chromaId != null ? chromaId : skinId);
      if (normalizedSkinId == null) {
        return { success: false, error: `Invalid skin selection id: ${skinId}` };
      }

      const hashPath = getHashPath(rawHashPath);
      const nativeAddon = getNativeAddon?.();
      if (!nativeAddon || typeof nativeAddon.extractSelectedAsync !== 'function') {
        return {
          success: false,
          error: 'Native extractSelectedAsync is required for Port donor pipeline. Rebuild wad_indexer.',
        };
      }
      if (typeof nativeAddon.resolveHashes !== 'function') {
        return {
          success: false,
          error: 'Native LMDB resolveHashes is required for Port donor pipeline. Rebuild wad_indexer.',
        };
      }
      if (!hashPath || !fs.existsSync(hashPath)) {
        return {
          success: false,
          error: 'Integrated hash directory is missing. Download hashes before using Port donor from game.',
        };
      }

      sendProgress('Preparing selective donor extraction...');

      const { WAD } = await loadWadClassModule();
      const { BIN } = await loadBinModule();
      const { BumpathCore } = await loadBumpathModule();

      const hashResolver = (hexHashes) => nativeAddon.resolveHashes(hexHashes, hashPath);

      sendProgress('Reading WAD table of contents...');
      const fd = await fs.promises.open(wadFilePath, 'r');
      let wad;
      try {
        const stat = await fd.stat();
        const tocSize = Math.min(4 * 1024 * 1024, stat.size);
        const tocBuffer = Buffer.alloc(tocSize);
        const { bytesRead } = await fd.read(tocBuffer, 0, tocSize, 0);
        const buf = bytesRead < tocSize ? tocBuffer.subarray(0, bytesRead) : tocBuffer;
        wad = await new WAD().read(buf);
      } finally {
        await fd.close().catch(() => { });
      }

      // Preserve original chunk hash value for native extraction (path hash hex)
      for (const chunk of wad.chunks) {
        if (!chunk.path_hash_hex) chunk.path_hash_hex = chunk.hash;
      }

      const hexHashes = wad.chunks.map(c => c.hash);
      const resolved = hashResolver(hexHashes);
      for (let i = 0; i < wad.chunks.length; i++) {
        const current = wad.chunks[i];
        const resolvedPath = resolved?.[i];
        if (resolvedPath && resolvedPath !== current.hash) {
          current.hash = resolvedPath;
        }
      }

      const chunkByPath = new Map();
      const chunkByPathHashHex = new Map();
      for (const chunk of wad.chunks) {
        const relPath = normalizeRelPathLower(chunk.hash);
        if (!relPath || chunkByPath.has(relPath)) continue;
        chunkByPath.set(relPath, {
          relPath,
          pathHashHex: String(chunk.path_hash_hex || chunk.hash || ''),
        });
        const hashHex = String(chunk.path_hash_hex || '').toLowerCase();
        if (/^[0-9a-f]{16}$/i.test(hashHex) && !chunkByPathHashHex.has(hashHex)) {
          chunkByPathHashHex.set(hashHex, relPath);
        }
      }

      const champPrefixA = `assets/characters/${championFileName}/skins/`;
      const champPrefixB = `data/characters/${championFileName}/skins/`;
      const skinNum = Number(normalizedSkinId);
      const skinA = `skin${skinNum}.bin`;
      const skinB = `skin${String(skinNum).padStart(2, '0')}.bin`;
      const candidateMainBins = [
        `${champPrefixA}${skinA}`,
        `${champPrefixA}${skinB}`,
        `${champPrefixB}${skinA}`,
        `${champPrefixB}${skinB}`,
      ].map(normalizeRelPathLower);

      const mainBinPath = candidateMainBins.find(p => chunkByPath.has(p));
      if (!mainBinPath) {
        return {
          success: false,
          error: `Could not locate skin BIN in TOC for ${championName} skin ${skinNum}`,
        };
      }

      const cacheRoot = path.join(
        process.env.TEMP || process.env.TMP || os.tmpdir(),
        'Quartz',
        'port-donor-cache'
      );
      const wadStat = await fs.promises.stat(wadFilePath);
      const wadVersionTag = `w${Number(wadStat.size || 0)}_m${Math.floor(Number(wadStat.mtimeMs || 0))}`;
      // ONE cache dir per (champ, skin, wadVersion). Target-specific
      // suffixes live INSIDE the consolidated folder name within the bin,
      // not in the cache path — so switching targets reuses the same
      // extraction and just re-runs consolidate (fast) + binToPy.
      const tempRoot = path.join(cacheRoot, `${championFileName}_skin${skinNum}_${wadVersionTag}`);
      const stageBinsDir = path.join(tempRoot, 'bins');
      const combinedDir = path.join(tempRoot, 'combined');
      const combinedMainBinPath = toAbsFromRel(combinedDir, mainBinPath);
      const donorPyPath = combinedMainBinPath.replace(/\.bin$/i, '.py');

      const requestedPrefix = String(data?.consolidatePrefix || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

      if (fs.existsSync(combinedMainBinPath) && fs.existsSync(donorPyPath)) {
        sendProgress('Using cached donor from previous extraction...');
        createdTempRoots.add(tempRoot);

        // Cache holds the combined bin + previously-consolidated assets.
        // Re-run consolidate with the current prefix — if it matches what's
        // already on disk, the consolidator is a no-op and the existing py
        // is reused. If it differs (user switched porting prefix), the
        // particles folder gets renamed and bin strings get rewritten.
        let changed = false;
        try {
          if (typeof loadAssetConsolidatorModule === 'function' && requestedPrefix) {
            const consolidator = await loadAssetConsolidatorModule();
            const result = await consolidator.consolidateAssetsInDir(combinedDir, {
              aggressive: true,
              portingPrefix: requestedPrefix,
            });
            const moved = (result?.results || []).reduce((s, r) => s + (r.moved || 0), 0);
            const rewritten = (result?.results || []).reduce((s, r) => s + (r.rewritten || 0), 0);
            changed = moved > 0 || rewritten > 0;
            if (changed) {
              sendProgress(`Reconsolidated ${moved} asset(s) for new prefix.`);
            }
          }
        } catch (e) {
          console.warn('[port:prepareDonorFromSkin] cache-hit consolidate failed:', e?.message);
        }

        if (changed && nativeAddon && typeof nativeAddon.binToPy === 'function') {
          sendProgress('Regenerating donor py...');
          try {
            nativeAddon.binToPy(combinedMainBinPath, donorPyPath, hashPath || null);
          } catch (e) {
            console.warn('[port:prepareDonorFromSkin] cache-hit binToPy failed:', e?.message);
          }
        }

        const donorPyContent = await fs.promises.readFile(donorPyPath, 'utf8');
        sendProgress('Donor is ready.');
        return {
          success: true,
          championFileName,
          skinId: skinNum,
          selectedBinCount: 0,
          extractedAssetCount: 0,
          tempRoot,
          combinedBinPath: combinedMainBinPath,
          donorPyPath,
          donorPyContent,
          cacheHit: true,
        };
      }

      safeRmDir(tempRoot);
      fs.mkdirSync(stageBinsDir, { recursive: true });
      fs.mkdirSync(combinedDir, { recursive: true });
      createdTempRoots.add(tempRoot);

      const runSelectiveExtract = async (outputDir, wantedPathsLower, preservePaths = true) => {
        if (!wantedPathsLower || wantedPathsLower.size === 0) return;

        const nativeItems = [];
        for (const rel of wantedPathsLower) {
          const info = chunkByPath.get(rel);
          if (!info) continue;
          const hashHex = String(info.pathHashHex || '').toLowerCase();
          if (!/^[0-9a-f]{16}$/i.test(hashHex)) continue;
          nativeItems.push({
            wadPath: wadFilePath,
            pathHash: hashHex,
            relPath: info.relPath,
          });
        }
        if (nativeItems.length === 0) return;

        const result = await nativeAddon.extractSelectedAsync(nativeItems, outputDir, true, preservePaths);
        if (result?.error) {
          throw new Error(result.error);
        }
      };

      sendProgress('Extracting selected BIN graph...');
      const selectedBinPaths = new Set([mainBinPath]);
      const parsedBinPaths = new Set();
      const pendingQueue = [mainBinPath];
      const linkResolutionStats = {
        direct: 0,
        hashMap: 0,
        hashExt: 0,
        unresolved: 0,
      };
      const unresolvedLinkSamples = [];

      const resolveLinkedBinPath = (linkValue) => {
        const directCandidates = normalizeLinkCandidate(linkValue);
        for (const candidate of directCandidates) {
          if (chunkByPath.has(candidate)) return { relPath: candidate, via: 'direct' };
        }
        const rawNorm = normalizeRelPathLower(linkValue);
        const hashLike = rawNorm.replace(/\.bin$/i, '');
        if (/^[0-9a-f]{16}$/i.test(hashLike)) {
          const fromHash = chunkByPathHashHex.get(hashLike);
          if (fromHash) return { relPath: fromHash, via: 'hash-map' };
          const withExt = `${hashLike}.bin`;
          if (chunkByPath.has(withExt)) return { relPath: withExt, via: 'hash-ext' };
        }
        return null;
      };

      while (pendingQueue.length > 0) {
        const relPath = pendingQueue.shift();
        if (parsedBinPaths.has(relPath)) continue;

        await runSelectiveExtract(stageBinsDir, new Set([relPath]));
        parsedBinPaths.add(relPath);

        const absBinPath = toAbsFromRel(stageBinsDir, relPath);
        if (!fs.existsSync(absBinPath)) continue;

        try {
          const raw = await fs.promises.readFile(absBinPath);
          const binObj = await new BIN().read(raw);
          const links = Array.isArray(binObj?.links) ? binObj.links : [];
          for (const link of links) {
            const resolved = resolveLinkedBinPath(link);
            if (!resolved) {
              linkResolutionStats.unresolved++;
              if (unresolvedLinkSamples.length < 80) {
                unresolvedLinkSamples.push({
                  from: relPath,
                  link: String(link || ''),
                });
              }
              continue;
            }
            if (resolved.via === 'direct') linkResolutionStats.direct++;
            if (resolved.via === 'hash-map') linkResolutionStats.hashMap++;
            if (resolved.via === 'hash-ext') linkResolutionStats.hashExt++;
            const resolvedLinkPath = resolved.relPath;
            if (!resolvedLinkPath.endsWith('.bin')) continue;
            if (selectedBinPaths.has(resolvedLinkPath)) continue;
            selectedBinPaths.add(resolvedLinkPath);
            pendingQueue.push(resolvedLinkPath);
          }
        } catch (_) { }
      }

      try {
        const diagnosticsDir = path.join(tempRoot, 'diagnostics');
        fs.mkdirSync(diagnosticsDir, { recursive: true });
        const payload = {
          champion: championName,
          skinId: skinNum,
          mainBinPath,
          selectedBinCount: selectedBinPaths.size,
          parsedBinCount: parsedBinPaths.size,
          stats: linkResolutionStats,
          unresolvedSample: unresolvedLinkSamples,
          selectedBins: Array.from(selectedBinPaths).sort(),
        };
        await fs.promises.writeFile(
          path.join(diagnosticsDir, 'link-resolution.json'),
          JSON.stringify(payload, null, 2),
          'utf8'
        );
      } catch (_) { }

      sendProgress('Combining linked BINs...');
      const bum = new BumpathCore();
      if (nativeAddon && typeof bum.setNativeAddon === 'function') {
        bum.setNativeAddon(nativeAddon);
      }
      await bum.addSourceDirs([stageBinsDir]);

      const binSelections = {};
      for (const key of Object.keys(bum.sourceBins)) {
        const rel = normalizeRelPathLower(bum.sourceFiles[key]?.relPath || '');
        binSelections[key] = selectedBinPaths.has(rel);
      }
      bum.updateBinSelection(binSelections);
      await bum.scan(hashPath);

      const referencedAssetPaths = new Set();
      for (const [entryHash, files] of Object.entries(bum.scannedTree || {})) {
        if (entryHash === 'All_BINs') continue;
        for (const fileInfo of Object.values(files || {})) {
          const rel = normalizeRelPathLower(fileInfo?.path || '');
          if (!rel || rel.endsWith('.bin')) continue;
          if (chunkByPath.has(rel)) referencedAssetPaths.add(rel);
        }
      }

      // For donor BIN combine, process only selected BIN graph.
      // Scanned non-BIN references can include very long synthetic link paths that
      // are irrelevant for merge and can trigger Windows copy path failures.
      bum.scannedTree = { All_BINs: bum.scannedTree?.All_BINs || {} };

      await bum.process(combinedDir, true, true, null, true, { copyAssets: false });

      if (!fs.existsSync(combinedMainBinPath)) {
        safeRmDir(tempRoot);
        return { success: false, error: 'Combined main BIN was not produced' };
      }

      if (referencedAssetPaths.size > 0) {
        sendProgress(`Extracting ${referencedAssetPaths.size} referenced assets...`);
        await runSelectiveExtract(combinedDir, referencedAssetPaths);
      }

      // Consolidate VFX assets into a single per-skin folder before generating
      // the py. Runs by default (no toggle) — donors loaded from game always
      // ship clean, predictable asset paths so emitters ported into the target
      // bin reference `assets/skin<N>_<champ>_particles/<basename>` instead of
      // the deep original directory structure.
      //
      // `aggressive: true` skips the shared-with-non-VFX safety because this
      // bin is throwaway scaffolding — only the rewritten VFX strings get
      // carried into the user's target bin when they port an emitter. The
      // donor's SkinMeshDataProperties / gearskin entries here are never
      // shipped, so we don't need to preserve their texture references.
      try {
        if (typeof loadAssetConsolidatorModule === 'function' && requestedPrefix) {
          sendProgress('Consolidating VFX assets...');
          const consolidator = await loadAssetConsolidatorModule();
          const result = await consolidator.consolidateAssetsInDir(combinedDir, {
            aggressive: true,
            portingPrefix: requestedPrefix,
          });
          const moved = (result?.results || []).reduce((s, r) => s + (r.moved || 0), 0);
          if (moved > 0) {
            sendProgress(`Consolidated ${moved} VFX asset(s).`);
          }
        }
      } catch (consolidateErr) {
        console.warn('[port:prepareDonorFromSkin] consolidate failed:', consolidateErr?.message);
      }

      sendProgress('Converting donor BIN to py...');
      if (!nativeAddon || typeof nativeAddon.binToPy !== 'function') {
        safeRmDir(tempRoot);
        return {
          success: false,
          error: 'Native binToPy is unavailable. Rebuild native addon first.',
        };
      }

      const converted = nativeAddon.binToPy(combinedMainBinPath, donorPyPath, hashPath || null);
      if (!converted || !fs.existsSync(donorPyPath)) {
        safeRmDir(tempRoot);
        return { success: false, error: 'binToPy conversion failed for combined donor BIN' };
      }

      const donorPyContent = await fs.promises.readFile(donorPyPath, 'utf8');
      sendProgress('Donor is ready.');

      return {
        success: true,
        championFileName,
        skinId: skinNum,
        selectedBinCount: selectedBinPaths.size,
        extractedAssetCount: referencedAssetPaths.size,
        tempRoot,
        combinedBinPath: combinedMainBinPath,
        donorPyPath,
        donorPyContent,
      };
    } catch (error) {
      console.error('[port:prepareDonorFromSkin] Error:', error);
      return { success: false, error: error.message, stack: error.stack };
    }
  });

  ipcMain.handle('port:cleanupDonorTemp', async (_event, payload) => {
    try {
      const cleanupAll = payload?.cleanupAll === true;
      const requested = Array.isArray(payload?.tempRoots) ? payload.tempRoots : [];
      const toDelete = new Set();

      if (cleanupAll) {
        for (const root of createdTempRoots) toDelete.add(root);
      } else {
        for (const root of requested) {
          if (typeof root === 'string' && root.trim()) toDelete.add(root);
        }
      }

      for (const root of toDelete) {
        cleanupQueue.add(root);
        createdTempRoots.delete(root);
      }

      runCleanupWorker();
      return { success: true, queued: toDelete.size };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerPortDonorChannels };
