/**
 * WAD + Bumpath IPC channels
 *
 * wad:extract        — single WAD extraction (legacy, kept for compatibility)
 * wad:extractBundle  — full champion bundle: main WAD + voiceover WADs, with
 *                      live progress events pushed to renderer via 'wad:progress'
 * bumpath:repath     — Bumpath repath
 */

const path = require('path');
const nodeFs = require('fs');
const { BrowserWindow, dialog } = require('electron');
const ICONS2D_RELATIVE_PATTERN = /^assets\/characters\/[^/]+\/hud\/icons2d(\/|$)/i;

let nativeWadIndexer = null;
let nativeWadIndexerLoadAttempted = false;

function tryLoadNativeWadIndexer() {
  if (nativeWadIndexerLoadAttempted) return nativeWadIndexer;
  nativeWadIndexerLoadAttempted = true;

  const candidates = [];
  try {
    const cwd = process.cwd();
    candidates.push(path.join(cwd, 'native', 'wad_indexer', 'index.node'));
    candidates.push(path.join(cwd, 'native', 'wad_indexer', 'wad_indexer.node'));
    const devNativeDir = path.join(cwd, 'native', 'wad_indexer');
    if (nodeFs.existsSync(devNativeDir)) {
      for (const file of nodeFs.readdirSync(devNativeDir)) {
        if (file.toLowerCase().endsWith('.node')) {
          candidates.push(path.join(devNativeDir, file));
        }
      }
    }
  } catch (_) { }

  try {
    if (process.resourcesPath) {
      candidates.push(path.join(process.resourcesPath, 'native', 'wad_indexer', 'index.node'));
      candidates.push(path.join(process.resourcesPath, 'native', 'wad_indexer', 'wad_indexer.node'));
      candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'wad_indexer', 'index.node'));
      candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'wad_indexer', 'wad_indexer.node'));
      const prodDirs = [
        path.join(process.resourcesPath, 'native', 'wad_indexer'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'wad_indexer'),
      ];
      for (const dir of prodDirs) {
        if (!nodeFs.existsSync(dir)) continue;
        for (const file of nodeFs.readdirSync(dir)) {
          if (file.toLowerCase().endsWith('.node')) {
            candidates.push(path.join(dir, file));
          }
        }
      }
    }
  } catch (_) { }

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = require(candidate);
      if (mod && typeof mod.loadAllIndexes === 'function') {
        nativeWadIndexer = mod;
        console.log(`[wad:indexer] Loaded native addon: ${candidate}`);
        return nativeWadIndexer;
      }
    } catch (_) { }
  }

  console.log('[wad:indexer] Native addon not found, using JS fallback');
  return null;
}

function toPosixRel(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function isPreservedIcons2DPath(relativePath) {
  return ICONS2D_RELATIVE_PATTERN.test(toPosixRel(relativePath));
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

function getUniqueOutputDir(fs, baseDir) {
  let target = baseDir.replace(/[\\/]+$/, '');
  if (!fs.existsSync(target)) return target;

  const parent = path.dirname(target);
  let name = path.basename(target);
  
  // Detect if name already has a counter prefix like "2_", "3_", etc.
  let counter = 2;
  const match = name.match(/^(\d+)_/);
  if (match) {
    counter = parseInt(match[1], 10) + 1;
    name = name.slice(match[0].length);
  }

  while (true) {
    const candidate = path.join(parent, `${counter}_${name}`);
    if (!fs.existsSync(candidate)) return candidate;
    counter++;
  }
}

function copyPreservedHudIcons2D(fs, sourceDir, targetDir) {
  if (!sourceDir || !targetDir || !fs.existsSync(sourceDir)) return 0;

  let copied = 0;

  const walk = (absDir, relDir = '') => {
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryRel = relDir ? path.join(relDir, entry.name) : entry.name;
      const entryAbs = path.join(absDir, entry.name);

      if (entry.isDirectory()) {
        walk(entryAbs, entryRel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!isPreservedIcons2DPath(entryRel)) continue;

      const outAbs = path.join(targetDir, entryRel);
      if (fs.existsSync(outAbs)) continue;
      fs.mkdirSync(path.dirname(outAbs), { recursive: true });
      fs.copyFileSync(entryAbs, outAbs);
      copied++;
    }
  };

  walk(sourceDir);
  return copied;
}

// Mirrors operationsService.getChampionFileName in the renderer
const CHAMPION_SPECIAL_CASES = {
  wukong: 'monkeyking',
  monkeyking: 'monkeyking',
  'nunu & willump': 'nunu',
  nunu: 'nunu',
};

function getChampionFileName(championName) {
  const lower = championName.toLowerCase();
  return CHAMPION_SPECIAL_CASES[lower] || lower.replace(/['"\s]/g, '');
}

// ---------------------------------------------------------------------------
// buildWadTree — convert flat chunk list into a nested directory tree
// Dirs sorted before files, both sorted alphabetically within their group.
// ---------------------------------------------------------------------------
function buildWadTree(chunks) {
  // node = { name, path, type:'dir'|'file', children:Map, ...fileFields }
  const root = { children: new Map() };

  for (const chunk of chunks) {
    const rawPath = chunk.hash;
    const parts = rawPath.split('/');
    let node = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        const dirPath = parts.slice(0, i + 1).join('/');
        node.children.set(part, {
          type: 'dir',
          name: part,
          path: dirPath,
          children: new Map(),
        });
      }
      node = node.children.get(part);
    }

    const filename = parts[parts.length - 1];
    node.children.set(filename + '\0' + chunk.id, {
      type: 'file',
      chunkId: chunk.id,
      pathHash: chunk.path_hash_hex || chunk.hash || null,
      name: filename,
      path: rawPath,
      hash: rawPath,
      compressedSize: chunk.compressed_size,
      decompressedSize: chunk.decompressed_size,
      compressionType: chunk.compression_type,
      extension: chunk.extension || null,
    });
  }

  function toArray(node) {
    const dirs = [];
    const files = [];
    for (const child of node.children.values()) {
      if (child.type === 'dir') {
        dirs.push({ ...child, children: toArray(child) });
      } else {
        files.push(child);
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
  }

  return toArray(root);
}

function registerWadBumpathChannels({
  ipcMain,
  fs,
  getHashPath,
  loadBumpathModule,
  loadWadClassModule,
  loadBinModule,
}) {
  async function askReplaceExistingForOutput(webContents, outputDir, label = 'extraction') {
    try {
      if (!outputDir || !fs.existsSync(outputDir)) return true;
      let hasAnyEntry = false;
      try {
        const entries = fs.readdirSync(outputDir);
        hasAnyEntry = Array.isArray(entries) && entries.length > 0;
      } catch (_) { }
      if (!hasAnyEntry) return true;

      const parent = webContents && !webContents.isDestroyed()
        ? BrowserWindow.fromWebContents(webContents) || undefined
        : undefined;
      const result = await dialog.showMessageBox(parent, {
        type: 'question',
        buttons: ['Yes', 'No'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: 'Replace Existing Files?',
        message: `Existing files were found in the ${label} output directory.`,
        detail: 'Do you want to replace files with the same path?\n\nYes = overwrite existing files\nNo = keep existing files',
      });
      return result.response === 0;
    } catch (_) {
      return false;
    }
  }

  async function readWadMetadata({ wadPath, rawHashPath, flatOnly, preloadedTables = null }) {
    if (!wadPath || !fs.existsSync(wadPath)) {
      return { error: `WAD file not found: ${wadPath}` };
    }

    const start = Date.now();

    // Read only the TOC (first 4MB — enough for any realistic WAD)
    const fd = await fs.promises.open(wadPath, 'r');
    let wad;
    try {
      const stat = await fd.stat();
      const tocSize = Math.min(4 * 1024 * 1024, stat.size);
      const tocBuffer = Buffer.alloc(tocSize);
      const { bytesRead } = await fd.read(tocBuffer, 0, tocSize, 0);
      const buf = bytesRead < tocSize ? tocBuffer.subarray(0, bytesRead) : tocBuffer;

      const { WAD } = await loadWadClassModule();
      wad = await new WAD().read(buf);
    } finally {
      await fd.close().catch(() => { });
    }

    console.log(`[wad:mountTree] Parsed ${wad.chunks.length} chunks in ${Date.now() - start}ms`);

    // Unhash using hashtables if available
    if (preloadedTables) {
      try {
        if (typeof wad.unHash === 'function') {
          wad.unHash(preloadedTables);
        } else if (typeof wad.unHashAsync === 'function') {
          await wad.unHashAsync(preloadedTables, { batchSize: 1200 });
        }
        console.log(`[wad:mountTree] Unhashed in ${Date.now() - start}ms`);
      } catch (e) {
        console.warn('[wad:mountTree] Hashtable use failed:', e.message);
      }
    } else {
      const hashPath = getHashPath(rawHashPath);
      console.log(`[wad:mountTree] rawHashPath=${rawHashPath} → hashPath=${hashPath}, exists=${hashPath ? fs.existsSync(hashPath) : false}`);
      if (hashPath && fs.existsSync(hashPath)) {
        const nativeAddon = tryLoadNativeWadIndexer();
        if (nativeAddon && typeof nativeAddon.resolveHashes === 'function') {
          try {
            const tStart = Date.now();
            const hexHashes = wad.chunks.map(c => c.hash);
            const resolved = nativeAddon.resolveHashes(hexHashes, hashPath);
            let resolvedCount = 0;
            for (let i = 0; i < wad.chunks.length; i++) {
              const path = resolved[i];
              if (!wad.chunks[i].path_hash_hex) {
                wad.chunks[i].path_hash_hex = wad.chunks[i].hash;
              }
              if (path && path !== wad.chunks[i].hash) {
                wad.chunks[i].hash = path;
                resolvedCount++;
              }
              if (wad.chunks[i].hash.includes('.')) {
                const parts = wad.chunks[i].hash.split('.');
                wad.chunks[i].extension = parts[parts.length - 1];
              }
            }
            console.log(`[wad:mountTree] Native resolveHashes: ${resolvedCount}/${wad.chunks.length} resolved in ${Date.now() - tStart}ms`);
          } catch (e) {
            console.warn('[wad:mountTree] Native resolveHashes failed:', e.message);
          }
        }
      }
    }

    if (flatOnly) {
      const paths = [];
      for (const chunk of wad.chunks) {
        if (chunk?.hash) paths.push(chunk.hash);
      }
      console.log(`[wad:mountTree] Flat index built in ${Date.now() - start}ms total`);
      return {
        flatOnly: true,
        paths,
        chunkCount: wad.chunks.length,
        wadVersion: wad.version,
      };
    }

    const tree = buildWadTree(wad.chunks);
    console.log(`[wad:mountTree] Tree built in ${Date.now() - start}ms total`);
    return {
      flatOnly: false,
      tree,
      chunkCount: wad.chunks.length,
      wadVersion: wad.version,
    };
  }
  // ---------------------------------------------------------------------------
  // wad:extract — single WAD (legacy, kept working now that loadWadModule resolves)
  // ---------------------------------------------------------------------------
  ipcMain.handle('wad:extract', async (_event, data) => {
    try {
      console.log('WAD extraction request received:', JSON.stringify(data, null, 2));

      if (!data?.wadPath || !data?.outputDir || data.skinId == null) {
        return { error: 'Missing required parameters: wadPath, outputDir, skinId' };
      }
      if (!fs.existsSync(data.wadPath)) {
        return { error: `WAD file not found: ${data.wadPath}` };
      }

      const hashPath = getHashPath(data.hashPath);
      console.log('Using hash path:', hashPath);

      const nativeAddon = tryLoadNativeWadIndexer();
      if (nativeAddon && typeof nativeAddon.extractWad === 'function') {
        const replaceExisting = await askReplaceExistingForOutput(_event?.sender, data.outputDir, 'WAD');
        const nativeResult = nativeAddon.extractWad(
          data.wadPath,
          data.outputDir,
          hashPath || null,
          replaceExisting
        );
        if (!nativeResult?.error) {
          return {
            success: true,
            extractedCount: Number(nativeResult?.extractedCount || 0),
            skippedCount: Number(nativeResult?.skippedCount || 0),
            outputDir: data.outputDir,
            hashedFiles: {},
            native: true,
          };
        }
        return { error: `Native extractor failed: ${nativeResult?.error}` };
      }

      return { error: 'Native addon (wad_indexer) is required for WAD extraction. Rebuild wad_indexer.' };
    } catch (error) {
      console.error('[wad:extract] Error:', error);
      return { error: error.message, stack: error.stack };
    }
  });

  // ---------------------------------------------------------------------------
  // wad:extractBundle — full champion bundle with voiceover + live progress
  //
  // Progress is pushed to the renderer window via event.sender.send('wad:progress').
  // The renderer subscribes with window.electronAPI.wad.onProgress(cb).
  // ---------------------------------------------------------------------------
  ipcMain.handle('wad:extractBundle', async (event, data) => {
    try {
      const {
        championName,
        skinId,
        skinName = null,
        chromaId = null,
        leaguePath,
        extractionPath,
        hashPath: rawHashPath,
        extractVoiceover,
        cleanAfterExtract = false,
        fastSkinOnly = false,
        preserveHudIcons2D = true,
        isRepathExtract = false, // USER REQUEST: Prefix folder if for repath
      } = data || {};

      if (!championName || !leaguePath || !extractionPath) {
        return { error: 'Missing required parameters: championName, leaguePath, extractionPath' };
      }

      // Safe progress sender — renderer may have navigated away
      const sendProgress = (count, message) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('wad:progress', { count, message });
          }
        } catch (_) { /* ignore */ }
      };

      sendProgress(0, 'Reading WAD files...');

      // P1-13: path.join — no hardcoded backslash concatenation
      const championFileName = getChampionFileName(championName);
      const wadFileName = `${championFileName}.wad.client`;
      const wadFilePath = path.join(leaguePath, wadFileName);

      const skinNameSafe = skinName ? skinName.replace(/[^a-zA-Z0-9]/g, '_') : String(skinId);
      const effectiveSkinId = normalizeSkinSelectionId(chromaId != null ? chromaId : skinId);

      let folderName = chromaId
        ? `extracted_${skinNameSafe}_chroma_${chromaId}`
        : `extracted_${skinNameSafe}`;

      // USER REQUEST: Prefix folder if part of repath workflow
      if (isRepathExtract) {
        folderName = `repath_${folderName}`;
      }

      let outputDir = path.join(extractionPath, folderName);

      // USER REQUEST: Add _clean suffix for Skin Files Only
      if (fastSkinOnly) {
        outputDir += '_clean';
      }

      // USER REQUEST: Auto-version if directory exists
      outputDir = getUniqueOutputDir(fs, outputDir);

      // Find voiceover WADs (sync readdir is fine in main process)
      let voiceoverWadFiles = [];
      try {
        const dirEntries = fs.readdirSync(leaguePath);
        const wadFilenameLower = wadFileName.toLowerCase();
        voiceoverWadFiles = dirEntries.filter(file => {
          const lower = file.toLowerCase();
          return lower.startsWith(championFileName) &&
            lower.endsWith('.wad.client') &&
            lower !== wadFilenameLower &&
            (file[championFileName.length] === '.' || file[championFileName.length] === '_');
        });
      } catch (err) {
        console.warn('[wad:extractBundle] Could not scan voiceover WADs:', err.message);
      }

      // Validate main WAD exists
      if (!fs.existsSync(wadFilePath)) {
        return { error: `WAD file not found: ${wadFilePath}` };
      }

      const hashPath = getHashPath(rawHashPath);
      const nativeAddon = tryLoadNativeWadIndexer();
      if (nativeAddon && typeof nativeAddon.primeHashTables === 'function' && hashPath) {
        try {
          nativeAddon.primeHashTables(hashPath);
        } catch (e) {
          console.warn('[wad:extractBundle] Native prime failed:', e.message);
        }
      }

      const replaceExisting = await askReplaceExistingForOutput(event?.sender, outputDir, 'bundle');

      // Fast skin-only path for repath: TOC + linked BIN graph + native selected extraction.
      if (fastSkinOnly) {
        if (!nativeAddon || typeof nativeAddon.extractSelectedAsync !== 'function' || typeof nativeAddon.resolveHashes !== 'function') {
          return { error: 'Fast skin-only extraction requires native extractSelectedAsync + resolveHashes.' };
        }
        if (!hashPath || !fs.existsSync(hashPath)) {
          return { error: 'Integrated hash path is required for fast skin-only extraction.' };
        }

        sendProgress(0, 'Reading WAD table of contents...');
        const { WAD } = await loadWadClassModule();
        const { BIN } = await loadBinModule();
        const { BumpathCore } = await loadBumpathModule();

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

        for (const chunk of wad.chunks) {
          if (!chunk.path_hash_hex) chunk.path_hash_hex = chunk.hash;
        }
        const resolved = nativeAddon.resolveHashes(wad.chunks.map(c => c.hash), hashPath);
        for (let i = 0; i < wad.chunks.length; i++) {
          const resolvedPath = resolved?.[i];
          if (resolvedPath && resolvedPath !== wad.chunks[i].hash) {
            wad.chunks[i].hash = resolvedPath;
          }
        }

        const chunkByPath = new Map();
        const chunkByPathHashHex = new Map();
        for (const chunk of wad.chunks) {
          const relPath = normalizeRelPathLower(chunk.hash);
          if (!relPath || chunkByPath.has(relPath)) continue;
          const pathHashHex = String(chunk.path_hash_hex || chunk.hash || '').toLowerCase();
          chunkByPath.set(relPath, { relPath, pathHashHex });
          if (/^[0-9a-f]{16}$/i.test(pathHashHex) && !chunkByPathHashHex.has(pathHashHex)) {
            chunkByPathHashHex.set(pathHashHex, relPath);
          }
        }

        const skinNum = Number(effectiveSkinId);
        // Scan entire TOC for ALL character folders that have a matching skin BIN.
        // A champion's WAD contains the main character + any subcharacters (e.g.
        // annie + annietibbers), so every characters/*/skins/skinN.bin is relevant.
        const skinBinPattern = new RegExp(
          `^(?:assets|data)/characters/([^/]+)/skins/skin0*${skinNum}\\.bin$`
        );
        const allSeedBins = [];
        let mainBinPath = null;
        for (const relPath of chunkByPath.keys()) {
          if (skinBinPattern.test(relPath)) {
            allSeedBins.push(relPath);
            // Prefer the main champion's BIN as the "main" one
            const folder = relPath.match(skinBinPattern)[1];
            if (folder === championFileName && !mainBinPath) {
              mainBinPath = relPath;
            }
          }
        }
        if (!mainBinPath) mainBinPath = allSeedBins[0] || null;
        if (!mainBinPath) {
          return { error: `Could not locate skin BIN in WAD TOC for skin ${skinNum}` };
        }
        if (allSeedBins.length > 1) {
          console.log(`[wad:extractBundle] Found ${allSeedBins.length} skin BINs (main + subcharacters):`, allSeedBins);
        }

        const runSelectiveExtract = async (wantedPathsLower) => {
          if (!wantedPathsLower || wantedPathsLower.size === 0) return { extractedCount: 0, skippedCount: 0 };
          const nativeItems = [];
          for (const rel of wantedPathsLower) {
            const info = chunkByPath.get(rel);
            if (!info) continue;
            if (!/^[0-9a-f]{16}$/i.test(info.pathHashHex)) continue;
            nativeItems.push({
              wadPath: wadFilePath,
              pathHash: info.pathHashHex,
              relPath: info.relPath,
            });
          }
          if (nativeItems.length === 0) return { extractedCount: 0, skippedCount: 0 };
          const result = await nativeAddon.extractSelectedAsync(nativeItems, outputDir, replaceExisting, true);
          if (result?.error) throw new Error(result.error);
          return {
            extractedCount: Number(result?.extractedCount || 0),
            skippedCount: Number(result?.skippedCount || 0),
          };
        };

        const stageBinsDir = path.join(
          extractionPath,
          `__fast_skin_stage_${championFileName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        );
        if (fs.existsSync(stageBinsDir)) fs.rmSync(stageBinsDir, { recursive: true, force: true });
        fs.mkdirSync(stageBinsDir, { recursive: true });
        try {
          const runSelectiveExtractToStage = async (wantedPathsLower) => {
            if (!wantedPathsLower || wantedPathsLower.size === 0) return;
            const nativeItems = [];
            for (const rel of wantedPathsLower) {
              const info = chunkByPath.get(rel);
              if (!info) continue;
              if (!/^[0-9a-f]{16}$/i.test(info.pathHashHex)) continue;
              nativeItems.push({
                wadPath: wadFilePath,
                pathHash: info.pathHashHex,
                relPath: info.relPath,
              });
            }
            if (nativeItems.length === 0) return;
            const stageResult = await nativeAddon.extractSelectedAsync(nativeItems, stageBinsDir, true, true);
            if (stageResult?.error) throw new Error(stageResult.error);
          };

          sendProgress(0, 'Building linked BIN graph...');
          const selectedBinPaths = new Set(allSeedBins);
          const parsedBinPaths = new Set();
          const pendingQueue = [...allSeedBins];
          const resolveLinkedBinPath = (linkValue) => {
            const directCandidates = normalizeLinkCandidate(linkValue);
            for (const candidate of directCandidates) {
              if (chunkByPath.has(candidate)) return candidate;
            }
            const rawNorm = normalizeRelPathLower(linkValue);
            const hashLike = rawNorm.replace(/\.bin$/i, '');
            if (/^[0-9a-f]{16}$/i.test(hashLike)) {
              const fromHash = chunkByPathHashHex.get(hashLike);
              if (fromHash) return fromHash;
              const withExt = `${hashLike}.bin`;
              if (chunkByPath.has(withExt)) return withExt;
            }
            return null;
          };

          while (pendingQueue.length > 0) {
            const relPath = pendingQueue.shift();
            if (parsedBinPaths.has(relPath)) continue;
            await runSelectiveExtractToStage(new Set([relPath]));
            parsedBinPaths.add(relPath);

            const absBinPath = toAbsFromRel(stageBinsDir, relPath);
            if (!fs.existsSync(absBinPath)) continue;
            try {
              const raw = await fs.promises.readFile(absBinPath);
              const binObj = await new BIN().read(raw);
              const links = Array.isArray(binObj?.links) ? binObj.links : [];
              for (const link of links) {
                const resolvedLinkPath = resolveLinkedBinPath(link);
                if (!resolvedLinkPath || !resolvedLinkPath.endsWith('.bin')) continue;
                if (selectedBinPaths.has(resolvedLinkPath)) continue;
                selectedBinPaths.add(resolvedLinkPath);
                pendingQueue.push(resolvedLinkPath);
              }
            } catch (_) { }
          }

          sendProgress(0, 'Combining selected skin BINs...');
          if (replaceExisting && fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true, force: true });
          }
          fs.mkdirSync(outputDir, { recursive: true });

          const bum = new BumpathCore();
          if (typeof bum.setNativeAddon === 'function') bum.setNativeAddon(nativeAddon);
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
          if (preserveHudIcons2D) {
            const iconsPrefix = `assets/characters/${championFileName}/hud/icons2d/`;
            for (const rel of chunkByPath.keys()) {
              if (rel.startsWith(iconsPrefix)) referencedAssetPaths.add(rel);
            }
          }

          bum.scannedTree = { All_BINs: bum.scannedTree?.All_BINs || {} };
          await bum.process(outputDir, true, true, null, true, { copyAssets: false });

          // Prune deadweight BIN files after combine:
          // keep main skin BIN and any BINs still linked from the combined main BIN.
          try {
            const keepBinPaths = new Set(allSeedBins);
            const combinedMainBinAbs = toAbsFromRel(outputDir, mainBinPath);
            if (fs.existsSync(combinedMainBinAbs)) {
              const mainRaw = await fs.promises.readFile(combinedMainBinAbs);
              const combinedMainBin = await new BIN().read(mainRaw);
              const remainingLinks = Array.isArray(combinedMainBin?.links) ? combinedMainBin.links : [];
              for (const link of remainingLinks) {
                const linkedRel = resolveLinkedBinPath(link);
                if (!linkedRel || !linkedRel.endsWith('.bin')) continue;
                const linkedAbs = toAbsFromRel(outputDir, linkedRel);
                if (fs.existsSync(linkedAbs)) {
                  keepBinPaths.add(linkedRel);
                }
              }
            }

            const deleteDeadBins = async (dirAbs) => {
              const entries = await fs.promises.readdir(dirAbs, { withFileTypes: true });
              for (const entry of entries) {
                const childAbs = path.join(dirAbs, entry.name);
                if (entry.isDirectory()) {
                  await deleteDeadBins(childAbs);
                  continue;
                }
                if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.bin')) continue;
                const rel = normalizeRelPathLower(path.relative(outputDir, childAbs));
                if (!keepBinPaths.has(rel)) {
                  await fs.promises.unlink(childAbs).catch(() => { });
                }
              }
            };

            await deleteDeadBins(outputDir);

            // USER REQUEST: Delete base champion BIN (redundant after combine)
            // Also covers subcharacter base BINs discovered from the seed scan.
            const baseBinCandidates = new Set();
            for (const seedBin of allSeedBins) {
              const m = seedBin.match(/^((?:assets|data)\/characters\/([^/]+))\//);
              if (m) {
                baseBinCandidates.add(normalizeRelPathLower(`${m[1]}/${m[2]}.bin`));
              }
            }
            for (const rel of baseBinCandidates) {
              // Always delete base champion BINs — the combined skin BIN keeps
              // the link reference, repath handles it. The file itself is deadweight.
              const abs = toAbsFromRel(outputDir, rel);
              if (nodeFs.existsSync(abs)) {
                await fs.promises.unlink(abs).catch(() => { });
              }
            }
          } catch (pruneErr) {
            console.warn('[wad:extractBundle] Fast BIN prune skipped:', pruneErr.message);
          }

          const assetResult = await runSelectiveExtract(referencedAssetPaths);

          // Optional VO extraction preserved for parity.
          let successfulVoiceovers = 0;
          let failedVoiceovers = 0;
          if (voiceoverWadFiles.length > 0 && extractVoiceover) {
            sendProgress(0, `Extracting ${voiceoverWadFiles.length} voiceover WAD(s)...`);
            for (const voFile of voiceoverWadFiles) {
              try {
                const voPath = path.join(leaguePath, voFile);
                if (nativeAddon && typeof nativeAddon.extractWadAsync === 'function') {
                  const nativeVo = await nativeAddon.extractWadAsync(voPath, outputDir, hashPath || null, replaceExisting);
                  if (nativeVo?.error) throw new Error(nativeVo.error);
                } else if (nativeAddon && typeof nativeAddon.extractWad === 'function') {
                  const nativeVo = nativeAddon.extractWad(voPath, outputDir, hashPath || null, replaceExisting);
                  if (nativeVo?.error) throw new Error(nativeVo.error);
                }
                successfulVoiceovers++;
              } catch (err) {
                console.warn(`[wad:extractBundle] Voiceover failed (${voFile}):`, err.message);
                failedVoiceovers++;
              }
            }
          }

          const finalMessage = 'Skin files extracted successfully (fast selected mode).';
          sendProgress(assetResult.extractedCount, finalMessage);
          return {
            success: true,
            championFileName,
            wadFilePath,
            outputDir,
            normalResult: {
              success: true,
              extractedCount: Number(selectedBinPaths.size + assetResult.extractedCount),
              skippedCount: Number(assetResult.skippedCount || 0),
              outputDir,
              hashedFiles: {},
              native: true,
            },
            voiceoverWadFiles,
            successfulVoiceovers,
            failedVoiceovers,
            finalMessage,
          };
        } finally {
          if (fs.existsSync(stageBinsDir)) fs.rmSync(stageBinsDir, { recursive: true, force: true });
        }
      }

      // Extract main WAD (native only)
      sendProgress(0, 'Extracting WAD file...');
      if (!nativeAddon || typeof nativeAddon.extractWadAsync !== 'function') {
        throw new Error('Native addon (wad_indexer) is required for WAD extraction. Rebuild wad_indexer.');
      }
      const nativeMain = await nativeAddon.extractWadAsync(wadFilePath, outputDir, hashPath || null, replaceExisting);
      if (nativeMain?.error) {
        throw new Error(nativeMain.error);
      }
      const normalResult = {
        success: true,
        extractedCount: Number(nativeMain?.extractedCount || 0),
        skippedCount: Number(nativeMain?.skippedCount || 0),
        outputDir,
        hashedFiles: {},
        native: true,
      };
      sendProgress(normalResult.extractedCount, `Extracted ${normalResult.extractedCount} files successfully!`);

      // Extract voiceover WADs (different files, different namespaces — no collision risk)
      let successfulVoiceovers = 0;
      let failedVoiceovers = 0;

      if (voiceoverWadFiles.length > 0 && extractVoiceover) {
        sendProgress(0, `Extracting ${voiceoverWadFiles.length} voiceover WAD(s)...`);
        for (const voFile of voiceoverWadFiles) {
          try {
            const voPath = path.join(leaguePath, voFile);
            const nativeVo = await nativeAddon.extractWadAsync(voPath, outputDir, hashPath || null, replaceExisting);
            if (nativeVo?.error) throw new Error(nativeVo.error);
            successfulVoiceovers++;
          } catch (err) {
            console.warn(`[wad:extractBundle] Voiceover failed (${voFile}):`, err.message);
            failedVoiceovers++;
          }
        }
      }

      // Final status message
      let finalMessage;
      if (voiceoverWadFiles.length > 0 && extractVoiceover) {
        if (successfulVoiceovers > 0 && failedVoiceovers === 0) {
          finalMessage = `Normal WAD + ${successfulVoiceovers} voiceover WAD(s) extracted successfully!`;
        } else if (successfulVoiceovers > 0) {
          finalMessage = `Normal WAD + ${successfulVoiceovers}/${voiceoverWadFiles.length} voiceover WAD(s) extracted`;
        } else {
          finalMessage = 'Normal WAD extracted, voiceover WADs failed';
        }
      } else if (voiceoverWadFiles.length > 0 && !extractVoiceover) {
        finalMessage = 'Normal WAD extracted successfully! (Voiceover disabled)';
      } else {
        finalMessage = 'Normal WAD extracted successfully!';
      }

      sendProgress(normalResult.extractedCount, finalMessage);

      // ── Skin-files-only clean step ────────────────────────────────────────
      // Runs BumpathCore in skipRepath mode: filters referenced assets,
      // merges linked BINs, keeps original paths. Then swaps directories.
      if (cleanAfterExtract) {
        try {
          sendProgress(0, 'Filtering skin files...');
          const { BumpathCore } = await loadBumpathModule();
          const cleanDir = outputDir + '_clean';
          if (fs.existsSync(cleanDir)) {
            fs.rmSync(cleanDir, { recursive: true, force: true });
          }

          const bum = new BumpathCore();
          if (tryLoadNativeWadIndexer) {
            const native = tryLoadNativeWadIndexer();
            if (native) {
              bum.setNativeAddon(native);
              console.log('[wad:extractBundle] Clean: using native addon for hash resolution');
            }
          }
          await bum.addSourceDirs([outputDir]);

          // Select only the BIN for the target skinId
          const binSelections = {};
          for (const key in bum.sourceBins) binSelections[key] = false;

          for (const key in bum.sourceBins) {
            const fileInfo = bum.sourceFiles[key];
            if (fileInfo?.relPath?.toLowerCase().endsWith('.bin')) {
              const skinMatch = fileInfo.relPath.toLowerCase().match(/\/skins\/skin(\d+)\.bin/);
              if (skinMatch && parseInt(skinMatch[1], 10) === effectiveSkinId) {
                binSelections[key] = true;
                console.log(`[wad:extractBundle] Clean: selected ${fileInfo.relPath}`);
              }
            }
          }

          bum.updateBinSelection(binSelections);
          await bum.scan(hashPath);
          console.log(`[wad:extractBundle] Clean: ${Object.keys(bum.scannedTree).length} entries found`);

          await bum.process(cleanDir, true, true, progressCallback, true);

          if (preserveHudIcons2D) {
            const copied = copyPreservedHudIcons2D(fs, outputDir, cleanDir);
            if (copied > 0) {
              console.log(`[wad:extractBundle] Preserved ${copied} icons2d file(s)`);
            }
          }

          // Non-destructive finalization: keep original extraction and place cleaned output separately.
          sendProgress(0, 'Finalizing...');
          sendProgress(0, 'Skin files ready!');
          console.log(`[wad:extractBundle] Clean complete: ${cleanDir}`);
        } catch (cleanErr) {
          console.error('[wad:extractBundle] Clean step failed:', cleanErr);
          sendProgress(0, `Warning: clean step failed — ${cleanErr.message}`);
        }
      }

      return {
        success: true,
        championFileName,
        wadFilePath,
        outputDir,
        normalResult,
        voiceoverWadFiles,
        successfulVoiceovers,
        failedVoiceovers,
        finalMessage,
      };
    } catch (error) {
      console.error('[wad:extractBundle] Error:', error);
      return { error: error.message, stack: error.stack };
    }
  });

  // ---------------------------------------------------------------------------
  // bumpath:repath
  // ---------------------------------------------------------------------------
  ipcMain.handle('bumpath:repath', async (_event, data) => {
    try {
      console.log('Bumpath repath request received:', JSON.stringify(data, null, 2));

      if (!data?.sourceDir || !data?.outputDir || !data?.selectedSkinIds) {
        return { error: 'Missing required parameters: sourceDir, outputDir, selectedSkinIds' };
      }
      if (!fs.existsSync(data.sourceDir)) {
        return { error: `Source directory not found: ${data.sourceDir}` };
      }

      const hashPath = getHashPath(data.hashPath);
      const ignoreMissing = data.ignoreMissing !== false;
      const combineLinked = data.combineLinked !== false;
      const customPrefix = data.customPrefix || 'bum';
      const processTogether = data.processTogether || false;
      const preserveHudIcons2D = data.preserveHudIcons2D !== false;
      const skipSfxRepath = data.skipSfxRepath !== false;
      const skipVoiceoverRepath = data.skipVoiceoverRepath !== false;

      // USER REQUEST: Auto-version if directory exists
      data.outputDir = getUniqueOutputDir(fs, data.outputDir);

      const { BumpathCore } = await loadBumpathModule();

      let lastProgress = 0;
      const progressCallback = (count, message) => {
        if (count > lastProgress + 10 || message) {
          console.log(`[Bumpath Progress] ${message || `Processed ${count} files...`}`);
          lastProgress = count;
        }
      };

      const runPass = async (skinIdsForPass) => {
        const bum = new BumpathCore();
        bum.skipSfxRepath = skipSfxRepath;
        bum.skipVoiceoverRepath = skipVoiceoverRepath;
        await bum.addSourceDirs([data.sourceDir]);
        const normalizedSkinIds = skinIdsForPass
          .map(normalizeSkinSelectionId)
          .filter((value) => value != null);

        const binSelections = {};
        for (const key in bum.sourceBins) binSelections[key] = false;

        let selectedCount = 0;
        for (const key in bum.sourceBins) {
          const fileInfo = bum.sourceFiles[key];
          if (fileInfo?.relPath?.toLowerCase().endsWith('.bin')) {
            const skinMatch = fileInfo.relPath.toLowerCase().match(/\/skins\/skin(\d+)\.bin/);
            if (skinMatch && normalizedSkinIds.includes(parseInt(skinMatch[1], 10))) {
              binSelections[key] = true;
              selectedCount++;
              console.log(`  Selected: ${fileInfo.relPath}`);
            }
          }
        }

        bum.updateBinSelection(binSelections);
        console.log(`[bumpath:repath] Marked ${selectedCount} BIN files for skins [${skinIdsForPass.join(', ')}] -> normalized [${normalizedSkinIds.join(', ')}]`);

        await bum.scan(hashPath);
        console.log(`Found ${Object.keys(bum.scannedTree).length} entries`);

        if (customPrefix !== 'bum') {
          const hashes = Object.keys(bum.entryPrefix).filter(h => h !== 'All_BINs');
          bum.applyPrefix(hashes, customPrefix);
          console.log(`Applied prefix '${customPrefix}' to ${hashes.length} entries`);
        }

        await bum.process(data.outputDir, ignoreMissing, combineLinked, progressCallback);
        if (preserveHudIcons2D) {
          const copied = copyPreservedHudIcons2D(fs, data.sourceDir, data.outputDir);
          if (copied > 0) {
            console.log(`[bumpath:repath] Preserved ${copied} icons2d file(s)`);
          }
        }
      };

      if (processTogether) {
        console.log(`Processing ${data.selectedSkinIds.length} skins together...`);
        await runPass(data.selectedSkinIds);
        return { success: true, message: `Processed ${data.selectedSkinIds.length} skins together` };
      }

      console.log(`Processing ${data.selectedSkinIds.length} skins individually...`);
      const results = [];
      for (let i = 0; i < data.selectedSkinIds.length; i++) {
        const skinId = data.selectedSkinIds[i];
        console.log(`\n--- Skin ${skinId} (${i + 1}/${data.selectedSkinIds.length}) ---`);
        await runPass([skinId]);
        results.push({ skinId, success: true });
      }

      return {
        success: true,
        message: `Processed ${data.selectedSkinIds.length} skins individually`,
        results,
      };
    } catch (error) {
      console.error('[bumpath:repath] Error:', error);
      return { error: error.message, stack: error.stack };
    }
  });

  // ---------------------------------------------------------------------------
  // wad:scanAll — recursively scan Game/DATA/FINAL/ for all .wad.client files.
  //
  // Input: { gamePath: string }  — the League "Game" folder
  //   e.g. C:\Riot Games\League of Legends\Game
  //
  // Returns groups keyed by their subdirectory within FINAL (Champions, Maps, etc.)
  // plus a flat 'other' bucket for anything that doesn't fit.
  // ---------------------------------------------------------------------------
  ipcMain.handle('wad:scanAll', async (_event, data) => {
    const EMPTY = { Champions: [], Maps: [], Global: [], Levels: [], Other: [] };
    try {
      const gamePath = data?.gamePath;
      if (!gamePath || !fs.existsSync(gamePath)) {
        return { error: 'Invalid game path', groups: EMPTY, total: 0 };
      }

      // Walk down to DATA/FINAL — this is where all WADs live
      const finalDir = path.join(gamePath, 'DATA', 'FINAL');
      if (!fs.existsSync(finalDir)) {
        return { error: `DATA/FINAL not found inside: ${gamePath}`, groups: EMPTY, total: 0 };
      }

      // Language code suffixes used in voiceover WADs (e.g. aatrox.en_US.wad.client)
      const LANG_CODES = new Set([
        'en_us', 'en_gb', 'de_de', 'es_es', 'fr_fr', 'it_it', 'pt_br', 'ro_ro', 'el_gr',
        'hu_hu', 'cs_cz', 'pl_pl', 'ru_ru', 'tr_tr', 'zh_tw', 'zh_cn', 'ko_kr', 'ja_jp',
        'ar_ae', 'en_au', 'es_mx', 'vi_vn', 'id_id', 'th_th', 'ms_my', 'en_sg',
      ]);

      // Recursive walk — stay within FINAL, collect .wad.client files
      const groups = {};
      let total = 0;

      function walk(dir, relDir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }

        for (const entry of entries) {
          const entryPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(entryPath, relDir ? `${relDir}/${entry.name}` : entry.name);
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.wad.client')) {
            // Determine group from top-level subdirectory of FINAL
            const topLevel = (relDir || '').split('/')[0] || 'Root';
            if (!groups[topLevel]) groups[topLevel] = [];

            // Detect voiceover by language code suffix
            const nameLower = entry.name.toLowerCase().replace(/\.wad\.client$/, '');
            const dotIdx = nameLower.lastIndexOf('.');
            const underIdx = nameLower.lastIndexOf('_');
            const dotSuffix = dotIdx !== -1 ? nameLower.slice(dotIdx + 1) : null;
            const underSuffix = underIdx !== -1 ? nameLower.slice(underIdx + 1) : null;
            const isVoiceover = (dotSuffix && LANG_CODES.has(dotSuffix)) || (underSuffix && LANG_CODES.has(underSuffix));

            let size = 0;
            try { size = fs.statSync(entryPath).size; } catch (_) { }

            groups[topLevel].push({
              name: entry.name,
              path: entryPath,
              relPath: relDir ? `${relDir}/${entry.name}` : entry.name,
              size,
              isVoiceover,
            });
            total++;
          }
        }
      }

      walk(finalDir, '');

      // Sort each group alphabetically, voiceovers last within group
      for (const arr of Object.values(groups)) {
        arr.sort((a, b) => {
          if (a.isVoiceover !== b.isVoiceover) return a.isVoiceover ? 1 : -1;
          return a.name.localeCompare(b.name);
        });
      }

      console.log(`[wad:scanAll] Found ${total} WAD files in ${finalDir}`);
      return { groups, finalDir, total };
    } catch (error) {
      console.error('[wad:scanAll] Error:', error);
      return { error: error.message, groups: EMPTY, total: 0 };
    }
  });

  // ---------------------------------------------------------------------------
  // wad:mountTree — parse WAD TOC (no extraction) and return either:
  // - full nested tree (default)
  // - flat path list only (flatOnly = true) for low-memory indexing
  // ---------------------------------------------------------------------------
  ipcMain.handle('wad:mountTree', async (_event, data) => {
    try {
      const { wadPath, hashPath: rawHashPath, flatOnly } = data || {};
      return await readWadMetadata({ wadPath, rawHashPath, flatOnly: !!flatOnly });
    } catch (error) {
      console.error('[wad:mountTree] Error:', error);
      return { error: error.message };
    }
  });

  // ---------------------------------------------------------------------------
  // wad:readChunkData — read/decompress one chunk payload from a WAD by chunk id.
  // Returns base64 payload for renderer-side decoding/preview.
  // ---------------------------------------------------------------------------
  ipcMain.handle('wad:readChunkData', async (_event, data) => {
    let fd = null;
    try {
      const wadPath = data?.wadPath;
      const chunkId = Number(data?.chunkId);
      if (!wadPath || !fs.existsSync(wadPath)) {
        return { error: `WAD file not found: ${wadPath || '(missing)'}` };
      }
      if (!Number.isInteger(chunkId) || chunkId < 0) {
        return { error: 'Invalid chunkId' };
      }

      fd = await fs.promises.open(wadPath, 'r');
      const stat = await fd.stat();
      const tocSize = Math.min(4 * 1024 * 1024, stat.size);
      const tocBuffer = Buffer.alloc(tocSize);
      const { bytesRead } = await fd.read(tocBuffer, 0, tocSize, 0);
      const buf = bytesRead < tocSize ? tocBuffer.subarray(0, bytesRead) : tocBuffer;

      const { WAD } = await loadWadClassModule();
      const wad = await new WAD().read(buf);
      const chunk = wad.chunks.find(c => c.id === chunkId);
      if (!chunk) {
        return { error: `Chunk ${chunkId} not found` };
      }

      await chunk.readData(fd);
      const payload = chunk.data ? Buffer.from(chunk.data) : Buffer.alloc(0);
      return {
        chunkId,
        size: payload.length,
        extension: chunk.extension || null,
        dataBase64: payload.toString('base64'),
      };
    } catch (error) {
      console.error('[wad:readChunkData] Error:', error);
      return { error: error.message };
    } finally {
      if (fd) await fd.close().catch(() => { });
    }
  });

  // ---------------------------------------------------------------------------
  // wad:extractSelected — extract selected files only (folder/file checkbox flow).
  // Uses native rust extractor when available.
  // ---------------------------------------------------------------------------
  ipcMain.handle('wad:extractSelected', async (event, data) => {
    try {
      const items = Array.isArray(data?.items) ? data.items : [];
      const outputDir = data?.outputDir;
      const replaceExistingInput = data?.replaceExisting;
      const preservePathsInput = data?.preservePaths;
      if (!outputDir) return { error: 'Missing outputDir' };
      if (items.length === 0) return { success: true, extractedCount: 0, skippedCount: 0 };

      const replaceExisting = typeof replaceExistingInput === 'boolean'
        ? replaceExistingInput
        : await askReplaceExistingForOutput(event?.sender, outputDir, 'selected extraction');
      const preservePaths = typeof preservePathsInput === 'boolean' ? preservePathsInput : true;
      const nativeAddon = tryLoadNativeWadIndexer();
      if (!nativeAddon || typeof nativeAddon.extractSelected !== 'function') {
        return { error: 'Native extractSelected is unavailable. Rebuild native addon.' };
      }

      const nativeItems = items
        .filter(x => x?.wadPath && x?.pathHash && x?.relPath)
        .map(x => ({
          wadPath: String(x.wadPath),
          pathHash: String(x.pathHash),
          relPath: String(x.relPath).replace(/\\/g, '/'),
        }));

      if (nativeItems.length === 0) {
        return { success: true, extractedCount: 0, skippedCount: items.length };
      }

      const result = await nativeAddon.extractSelectedAsync(nativeItems, outputDir, replaceExisting, preservePaths);
      if (result?.error) {
        return { error: result.error };
      }

      // Guard: if native code guessed a .bin extension on an extensionless file,
      // rename it back to match the original relPath the tree showed.
      for (const item of nativeItems) {
        const rel = item.relPath;
        const lastSlash = rel.lastIndexOf('/');
        const filename = lastSlash >= 0 ? rel.slice(lastSlash + 1) : rel;
        if (filename.includes('.')) continue; // already has extension — skip
        const expected = path.join(outputDir, rel);
        const wrong = expected + '.bin';
        try {
          if (!fs.existsSync(expected) && fs.existsSync(wrong)) {
            fs.renameSync(wrong, expected);
          }
        } catch (_) { /* best effort */ }
      }

      return {
        success: true,
        extractedCount: Number(result?.extractedCount || 0),
        skippedCount: Number(result?.skippedCount || 0),
        native: true,
      };
    } catch (error) {
      console.error('[wad:extractSelected] Error:', error);
      return { error: error.message };
    }
  });

  // ---------------------------------------------------------------------------
  // wad:loadAllIndexes — batch-load flat WAD indexes for cross-WAD search.
  // Returns compact path lists only (no tree), with bounded concurrency.
  // ---------------------------------------------------------------------------
  ipcMain.handle('wad:loadAllIndexes', async (_event, data) => {
    try {
      const wadPaths = Array.isArray(data?.wadPaths) ? data.wadPaths : [];
      const rawHashPath = data?.hashPath;
      const requested = Number(data?.concurrency);
      const concurrency = Number.isFinite(requested)
        ? Math.max(1, Math.min(3, requested))
        : 2;

      if (wadPaths.length === 0) return { results: [] };

      const resolvedHashPath = getHashPath(rawHashPath);
      console.log('[wad:loadAllIndexes] rawHashPath:', rawHashPath, '→ resolved:', resolvedHashPath);
      const nativeAddon = tryLoadNativeWadIndexer();
      if (nativeAddon && typeof nativeAddon.loadAllIndexes === 'function') {
        try {
          console.log('[wad:loadAllIndexes] Using native indexer');
          const nativeStart = Date.now();
          const results = nativeAddon.loadAllIndexes(wadPaths, resolvedHashPath || null, concurrency);
          if (Array.isArray(results)) {
            // Normalize result shape to exactly match requested wadPaths.
            // This prevents renderer progress from getting stuck if native returns partial output.
            const byPath = new Map();
            for (const r of results) {
              if (!r?.path || byPath.has(r.path)) continue;
              byPath.set(r.path, r);
            }
            const normalized = wadPaths.map((wadPath) => {
              const r = byPath.get(wadPath);
              if (!r) {
                return { path: wadPath, error: 'Native indexer returned no result', paths: [], chunkCount: 0 };
              }
              return {
                path: wadPath,
                error: r.error || null,
                paths: Array.isArray(r.paths) ? r.paths : [],
                chunkCount: Number(r.chunkCount || 0),
              };
            });
            console.log(`[wad:loadAllIndexes] Native indexer completed ${normalized.length} WADs in ${Date.now() - nativeStart}ms`);
            return { results: normalized };
          }
          console.warn('[wad:loadAllIndexes] Native indexer returned non-array');
        } catch (e) {
          console.warn('[wad:loadAllIndexes] Native addon failed:', e.message);
        }
      }

      return { error: 'Native addon (wad_indexer) is required for loadAllIndexes. Rebuild wad_indexer.', results: [] };
    } catch (error) {
      console.error('[wad:loadAllIndexes] Error:', error);
      return { error: error.message, results: [] };
    }
  });

  // ---------------------------------------------------------------------------
  // hashtable:warmCache — no-op with LMDB (memory-mapped, always warm).
  // ---------------------------------------------------------------------------
  ipcMain.handle('hashtable:warmCache', async () => {
    return { success: true };
  });

  // ---------------------------------------------------------------------------
  // hashtable:primeWad — verify LMDB is openable.
  // ---------------------------------------------------------------------------
  ipcMain.handle('hashtable:primeWad', async (_event, payload) => {
    try {
      const hashPathInput = typeof payload === 'string' ? payload : payload?.hashPath;
      const hashPath = getHashPath(hashPathInput);
      if (!hashPath || !fs.existsSync(hashPath)) {
        return { success: false, error: 'Invalid hash path' };
      }

      const nativeAddon = tryLoadNativeWadIndexer();
      if (nativeAddon && typeof nativeAddon.primeHashTables === 'function') {
        nativeAddon.primeHashTables(hashPath);
        return { success: true, native: true };
      }
      return { success: false, error: 'Native addon required' };
    } catch (e) {
      console.warn('[hashtable:primeWad] Error:', e.message);
      return { success: false, error: e.message };
    }
  });

  // ---------------------------------------------------------------------------
  // hashtable:setKeepAlive — no-op with LMDB (memory-mapped, no TTL).
  // ---------------------------------------------------------------------------
  ipcMain.handle('hashtable:setKeepAlive', async () => {
    return { success: true };
  });

  // ---------------------------------------------------------------------------
  // hashtable:clearCache — drops cached LMDB envs from memory.
  // ---------------------------------------------------------------------------
  ipcMain.handle('hashtable:clearCache', async () => {
    try {
      const nativeAddon = tryLoadNativeWadIndexer();
      if (nativeAddon && typeof nativeAddon.clearHashTables === 'function') {
        nativeAddon.clearHashTables();
      }
      if (typeof global.gc === 'function') global.gc();
      return { success: true };
    } catch (e) {
      console.warn('[hashtable:clearCache] Error:', e.message);
      return { success: false };
    }
  });

  // ---------------------------------------------------------------------------
  // wad:extractHashes — scan BIN/SKN chunks inside a WAD for embedded path strings.
  // Writes discovered hashes to hash_dir/hashes.extracted.txt and invalidates cache.
  // Synchronous in the main process (Rust handles decompression + scanning).
  // ---------------------------------------------------------------------------
  ipcMain.handle('wad:extractHashes', async (_event, data) => {
    try {
      const { wadPath, hashDir } = data || {};
      if (!wadPath) return { success: false, error: 'Missing wadPath' };

      const nativeAddon = tryLoadNativeWadIndexer();
      if (!nativeAddon || typeof nativeAddon.extractHashesFromWad !== 'function') {
        return { success: false, error: 'Native addon unavailable — rebuild wad_indexer' };
      }

      console.log(`[wad:extractHashes] Scanning ${wadPath}, hashDir=${hashDir}`);
      const result = nativeAddon.extractHashesFromWad(wadPath, hashDir || null);
      console.log(`[wad:extractHashes] Done — ${result?.newHashCount || 0} hashes extracted, success=${result?.success}, error=${result?.error}`);

      // Log first few lines of hashes.extracted.txt so we can verify format
      if (hashDir) {
        try {
          const extractedPath = path.join(hashDir, 'hashes.extracted.txt');
          const content = nodeFs.readFileSync(extractedPath, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim()).slice(0, 8);
          console.log(`[wad:extractHashes] hashes.extracted.txt (${extractedPath}) first lines:`, lines);
        } catch (e) {
          console.log(`[wad:extractHashes] Could not read hashes.extracted.txt:`, e.message);
        }
      }

      return {
        success: result?.success ?? false,
        newHashCount: Number(result?.newHashCount || 0),
        error: result?.error || null,
      };
    } catch (e) {
      console.error('[wad:extractHashes] Error:', e);
      return { success: false, error: e.message };
    }
  });

  // ---------------------------------------------------------------------------
  // wad:readBinAsText — read a .bin chunk from a WAD and return it as ritobin
  // text (fake-python format). Writes to a temp file, converts via native addon,
  // reads output, then cleans up.
  // ---------------------------------------------------------------------------
  ipcMain.handle('wad:readBinAsText', async (_event, data) => {
    const os = require('os');
    let fd = null;
    let tempBin = null;
    let tempPy = null;
    try {
      const { wadPath, chunkId } = data || {};
      if (!wadPath || !nodeFs.existsSync(wadPath)) {
        return { error: `WAD file not found: ${wadPath || '(missing)'}` };
      }
      const chunkIdNum = Number(chunkId);
      if (!Number.isInteger(chunkIdNum) || chunkIdNum < 0) {
        return { error: 'Invalid chunkId' };
      }

      // Read and decompress the chunk
      fd = await nodeFs.promises.open(wadPath, 'r');
      const stat = await fd.stat();
      const tocSize = Math.min(4 * 1024 * 1024, stat.size);
      const tocBuffer = Buffer.alloc(tocSize);
      const { bytesRead } = await fd.read(tocBuffer, 0, tocSize, 0);
      const buf = bytesRead < tocSize ? tocBuffer.subarray(0, bytesRead) : tocBuffer;

      const { WAD } = await loadWadClassModule();
      const wad = await new WAD().read(buf);
      const chunk = wad.chunks.find(c => c.id === chunkIdNum);
      if (!chunk) return { error: `Chunk ${chunkIdNum} not found in WAD` };

      await chunk.readData(fd);
      await fd.close();
      fd = null;

      const payload = chunk.data ? Buffer.from(chunk.data) : Buffer.alloc(0);
      if (payload.length === 0) return { error: 'Chunk payload is empty' };

      // Write to temp .bin file
      const tmpDir = os.tmpdir();
      const uid = `wadbin_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      tempBin = path.join(tmpDir, `${uid}.bin`);
      tempPy  = path.join(tmpDir, `${uid}.py`);
      nodeFs.writeFileSync(tempBin, payload);

      // Convert via native addon
      const nativeAddon = tryLoadNativeWadIndexer();
      if (!nativeAddon || typeof nativeAddon.binToPy !== 'function') {
        return { error: 'Native addon unavailable — rebuild wad_indexer' };
      }
      let converted = false;
      try {
        let hashDir = null;
        const appDataPath = process.env.APPDATA || (process.platform === 'darwin'
          ? process.env.HOME + '/Library/Application Support'
          : process.env.HOME + '/.config');
        const candidateHashDir = path.join(appDataPath, 'FrogTools', 'hashes');
        if (nodeFs.existsSync(candidateHashDir)) hashDir = candidateHashDir;
        converted = nativeAddon.binToPy(tempBin, tempPy, hashDir);
      } catch (e) {
        return { error: `binToPy failed: ${e.message}` };
      }

      if (!converted || !nodeFs.existsSync(tempPy)) {
        return { error: 'Conversion to ritobin text failed' };
      }

      const text = nodeFs.readFileSync(tempPy, 'utf-8');
      return { text };
    } catch (e) {
      console.error('[wad:readBinAsText] Error:', e);
      return { error: e.message };
    } finally {
      if (fd) await fd.close().catch(() => {});
      try { if (tempBin && nodeFs.existsSync(tempBin)) nodeFs.unlinkSync(tempBin); } catch (_) {}
      try { if (tempPy  && nodeFs.existsSync(tempPy))  nodeFs.unlinkSync(tempPy);  } catch (_) {}
    }
  });

  // ---------------------------------------------------------------------------
  // wad:readTroybinAsText — read a .troybin chunk from a WAD and return INI text.
  // ---------------------------------------------------------------------------
  ipcMain.handle('wad:readTroybinAsText', async (_event, data) => {
    let fd = null;
    try {
      const { wadPath, chunkId } = data || {};
      if (!wadPath || !nodeFs.existsSync(wadPath)) {
        return { error: `WAD file not found: ${wadPath || '(missing)'}` };
      }
      const chunkIdNum = Number(chunkId);
      if (!Number.isInteger(chunkIdNum) || chunkIdNum < 0) {
        return { error: 'Invalid chunkId' };
      }

      fd = await nodeFs.promises.open(wadPath, 'r');
      const stat = await fd.stat();
      const tocSize = Math.min(4 * 1024 * 1024, stat.size);
      const tocBuffer = Buffer.alloc(tocSize);
      const { bytesRead } = await fd.read(tocBuffer, 0, tocSize, 0);
      const buf = bytesRead < tocSize ? tocBuffer.subarray(0, bytesRead) : tocBuffer;

      const { WAD } = await loadWadClassModule();
      const wad = await new WAD().read(buf);
      const chunk = wad.chunks.find(c => c.id === chunkIdNum);
      if (!chunk) return { error: `Chunk ${chunkIdNum} not found in WAD` };

      await chunk.readData(fd);
      await fd.close();
      fd = null;

      const payload = chunk.data instanceof ArrayBuffer
        ? Buffer.from(chunk.data)
        : Buffer.from(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);

      const nativeAddon = tryLoadNativeWadIndexer();
      if (!nativeAddon || typeof nativeAddon.troybinToText !== 'function') {
        return { error: 'Native addon unavailable — rebuild wad_indexer' };
      }

      const text = nativeAddon.troybinToText(payload);
      return { text };
    } catch (e) {
      console.error('[wad:readTroybinAsText] Error:', e);
      return { error: e.message };
    } finally {
      if (fd) await fd.close().catch(() => {});
    }
  });

  // ---------------------------------------------------------------------------
  // wad:readLuabinAsText — read a .luabin/.luabin64 chunk from a WAD and
  // return decompiled Lua source text.
  // ---------------------------------------------------------------------------
  ipcMain.handle('wad:readLuabinAsText', async (_event, data) => {
    let fd = null;
    try {
      const { wadPath, chunkId } = data || {};
      if (!wadPath || !nodeFs.existsSync(wadPath)) {
        return { error: `WAD file not found: ${wadPath || '(missing)'}` };
      }
      const chunkIdNum = Number(chunkId);
      if (!Number.isInteger(chunkIdNum) || chunkIdNum < 0) {
        return { error: 'Invalid chunkId' };
      }

      fd = await nodeFs.promises.open(wadPath, 'r');
      const stat = await fd.stat();
      const tocSize = Math.min(4 * 1024 * 1024, stat.size);
      const tocBuffer = Buffer.alloc(tocSize);
      const { bytesRead } = await fd.read(tocBuffer, 0, tocSize, 0);
      const buf = bytesRead < tocSize ? tocBuffer.subarray(0, bytesRead) : tocBuffer;

      const { WAD } = await loadWadClassModule();
      const wad = await new WAD().read(buf);
      const chunk = wad.chunks.find(c => c.id === chunkIdNum);
      if (!chunk) return { error: `Chunk ${chunkIdNum} not found in WAD` };

      await chunk.readData(fd);
      await fd.close();
      fd = null;

      const payload = chunk.data instanceof ArrayBuffer
        ? Buffer.from(chunk.data)
        : Buffer.from(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);

      const nativeAddon = tryLoadNativeWadIndexer();
      if (!nativeAddon || typeof nativeAddon.luabinToText !== 'function') {
        return { error: 'Native addon unavailable — rebuild wad_indexer' };
      }

      const text = nativeAddon.luabinToText(payload);
      return { text };
    } catch (e) {
      console.error('[wad:readLuabinAsText] Error:', e);
      return { error: e.message };
    } finally {
      if (fd) await fd.close().catch(() => {});
    }
  });

  // ---------------------------------------------------------------------------
  // texture:decodeToDataUrl — decode TEX/DDS via native addon (ltk_texture)
  // and return PNG data URL for renderer usage.
  // ---------------------------------------------------------------------------
  ipcMain.handle('texture:decodeToDataUrl', async (_event, data) => {
    try {
      const filePath = String(data?.filePath || '');
      if (!filePath) return { success: false, error: 'Missing filePath' };
      if (!fs.existsSync(filePath)) return { success: false, error: `File not found: ${filePath}` };

      const nativeAddon = tryLoadNativeWadIndexer();
      if (!nativeAddon || typeof nativeAddon.decodeTextureToPng !== 'function') {
        const exportsList = nativeAddon ? Object.keys(nativeAddon).sort() : [];
        console.warn('[texture:decodeToDataUrl] Native decoder missing decodeTextureToPng export', {
          filePath,
          hasAddon: Boolean(nativeAddon),
          exports: exportsList,
        });
        return {
          success: false,
          error: `Native texture decoder unavailable (decodeTextureToPng missing). Exports: ${exportsList.join(', ')}`,
        };
      }

      const decoded = nativeAddon.decodeTextureToPng(filePath);
      if (!decoded || !decoded.png) {
        console.warn('[texture:decodeToDataUrl] Native decoder returned empty payload', { filePath });
        return { success: false, error: 'Native decoder returned empty payload' };
      }

      const pngBuffer = Buffer.from(decoded.png);
      return {
        success: true,
        method: 'native',
        width: Number(decoded.width || 0),
        height: Number(decoded.height || 0),
        decodeMs: Number(decoded.decodeMs || 0),
        encodeMs: Number(decoded.encodeMs || 0),
        nativeTotalMs: Number(decoded.totalMs || 0),
        dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      };
    } catch (e) {
      console.error('[texture:decodeToDataUrl] Native decode failed', {
        filePath: String(data?.filePath || ''),
        error: String(e?.message || e),
        stack: e?.stack || '',
      });
      return { success: false, error: String(e?.message || e) };
    }
  });

  // ---------------------------------------------------------------------------
  // ritobin:toPy — convert .bin to .py using native Rust addon or fallback exe
  // ---------------------------------------------------------------------------
  ipcMain.handle('ritobin:toPy', async (_event, { filePath }) => {
    try {
      const nativeAddon = tryLoadNativeWadIndexer();
      const pyFilePath = filePath.replace(/\.bin$/i, '.py');

      if (nativeAddon && typeof nativeAddon.binToPy === 'function') {
        let hashDir = null;
        try {
          // Attempt to get hash directory for unhashing
          const appDataPath = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
          const frogToolsDir = path.join(appDataPath, 'FrogTools');
          const hashesDir = path.join(frogToolsDir, 'hashes');
          if (nodeFs.existsSync(hashesDir)) {
            hashDir = hashesDir;
          }
        } catch (_) { }

        const success = nativeAddon.binToPy(filePath, pyFilePath, hashDir);
        if (success) {
          return { success: true, method: 'native', pyPath: pyFilePath };
        }
      }

      return { success: false, error: 'Native RitoBin addon failed or is not available' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ---------------------------------------------------------------------------
  // ritobin:toBin — convert .py to .bin using native Rust addon or fallback exe
  // ---------------------------------------------------------------------------
  ipcMain.handle('ritobin:toBin', async (_event, { pyPath, binPath }) => {
    try {
      const nativeAddon = tryLoadNativeWadIndexer();
      if (nativeAddon && typeof nativeAddon.pyToBin === 'function') {
        const success = nativeAddon.pyToBin(pyPath, binPath);
        if (success) {
          return { success: true, method: 'native', binPath };
        }
      }

      return { success: false, error: 'Native RitoBin addon failed or is not available' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ---------------------------------------------------------------------------
  // wad:parseSknBins — parse extracted BIN files for accurate material→texture hints.
  // Called from WAD Explorer after extracting skin files to a temp dir.
  // ---------------------------------------------------------------------------
  ipcMain.handle('wad:parseSknBins', async (_event, data) => {
    try {
      const { filesDir, skinKey = 'base', characterFolder = '', exactBinName = '', hashPath: rawHashPath } = data || {};
      if (!filesDir || !fs.existsSync(filesDir)) return { materialTextureHints: {}, defaultTextureBySkn: {} };
      if (!loadBinModule) {
        return { materialTextureHints: {}, defaultTextureBySkn: {} };
      }

      const { discoverMaterialTextureHints } = require('./modelInspect');
      const hashPath = getHashPath(rawHashPath);
      const skinId = skinKey === 'base' ? 0 : (parseInt(skinKey.replace(/^skin0*/i, ''), 10) || 0);
      const result = await discoverMaterialTextureHints({
        fs,
        filesDir,
        hashPath,
        getNativeAddon: tryLoadNativeWadIndexer,
        skinId,
        skinKey,
        characterFolder,
        exactBinName,
        loadBinModule,
      });

      return {
        materialTextureHints: result.materialTextureHints || {},
        defaultTextureBySkn: result.defaultTextureBySkn || {},
      };
    } catch (e) {
      console.warn('[wad:parseSknBins] Error:', e.message);
      return { materialTextureHints: {}, defaultTextureBySkn: {} };
    }
  });

}

module.exports = { registerWadBumpathChannels, tryLoadNativeWadIndexer };
