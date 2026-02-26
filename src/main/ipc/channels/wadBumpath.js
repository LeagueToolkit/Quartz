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
  loadWadModule,
  loadJsRitoModule,
  loadBumpathModule,
  loadWadClassModule,
  loadBinModule,
  loadBinHasherModule,
  loadWadHasherModule,
}) {
  let warmCacheInFlight = null;
  let warmCacheCancelFlag = { cancelled: false };

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
        console.warn('[wad:extract] Native extractor failed, falling back:', nativeResult?.error);
      }

      const { unpackWAD } = await loadWadModule();
      const { loadHashtables } = await loadJsRitoModule();

      let hashtables = null;
      if (hashPath && fs.existsSync(hashPath)) {
        try {
          hashtables = await loadHashtables(hashPath);
          console.log('Hashtables loaded successfully');
        } catch (e) {
          console.warn('[wad:extract] Hashtable load failed:', e.message);
        }
      }

      let lastProgress = 0;
      const progressCallback = (count, message) => {
        if (count > lastProgress + 50 || message) {
          console.log(`[WAD Progress] ${message || `Extracted ${count} files...`}`);
          lastProgress = count;
        }
      };

      const replaceExisting = await askReplaceExistingForOutput(_event?.sender, data.outputDir, 'WAD');
      const result = await unpackWAD(
        data.wadPath,
        data.outputDir,
        hashtables,
        null,
        progressCallback,
        { replaceExisting }
      );
      console.log('WAD extraction completed:', { extractedCount: result.extractedCount, outputDir: result.outputDir });
      return {
        success: true,
        extractedCount: result.extractedCount,
        skippedCount: result.skippedCount || 0,
        outputDir: result.outputDir,
        hashedFiles: result.hashedFiles || {},
        native: false,
      };
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
        preserveHudIcons2D = true,
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
      const outputDir = chromaId
        ? path.join(extractionPath, `${championFileName}_extracted_${skinNameSafe}_chroma_${chromaId}`)
        : path.join(extractionPath, `${championFileName}_extracted_${skinNameSafe}`);

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
      const { unpackWAD } = await loadWadModule();
      const progressCallback = (count, message) => sendProgress(count, message);
      const nativeAddon = tryLoadNativeWadIndexer();
      if (nativeAddon && typeof nativeAddon.primeHashTables === 'function' && hashPath) {
        try {
          nativeAddon.primeHashTables(hashPath);
        } catch (e) {
          console.warn('[wad:extractBundle] Native prime failed:', e.message);
        }
      }

      const replaceExisting = await askReplaceExistingForOutput(event?.sender, outputDir, 'bundle');

      // Extract main WAD
      sendProgress(0, 'Extracting WAD file...');
      let normalResult;
      if (nativeAddon && typeof nativeAddon.extractWadAsync === 'function') {
        const nativeMain = await nativeAddon.extractWadAsync(wadFilePath, outputDir, hashPath || null, replaceExisting);
        if (nativeMain?.error) {
          throw new Error(nativeMain.error);
        }
        normalResult = {
          success: true,
          extractedCount: Number(nativeMain?.extractedCount || 0),
          skippedCount: Number(nativeMain?.skippedCount || 0),
          outputDir,
          hashedFiles: {},
          native: true,
        };
      } else {
        normalResult = await unpackWAD(
          wadFilePath,
          outputDir,
          hashtables,
          null,
          progressCallback,
          { replaceExisting }
        );
      }
      sendProgress(normalResult.extractedCount, `Extracted ${normalResult.extractedCount} files successfully!`);

      // Extract voiceover WADs (different files, different namespaces — no collision risk)
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
            } else {
              await unpackWAD(
                voPath,
                outputDir,
                hashtables,
                null,
                progressCallback,
                { replaceExisting }
              );
            }
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
              if (skinMatch && parseInt(skinMatch[1], 10) === skinId) {
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
        await bum.addSourceDirs([data.sourceDir]);

        const binSelections = {};
        for (const key in bum.sourceBins) binSelections[key] = false;

        let selectedCount = 0;
        for (const key in bum.sourceBins) {
          const fileInfo = bum.sourceFiles[key];
          if (fileInfo?.relPath?.toLowerCase().endsWith('.bin')) {
            const skinMatch = fileInfo.relPath.toLowerCase().match(/\/skins\/skin(\d+)\.bin/);
            if (skinMatch && skinIdsForPass.includes(parseInt(skinMatch[1], 10))) {
              binSelections[key] = true;
              selectedCount++;
              console.log(`  Selected: ${fileInfo.relPath}`);
            }
          }
        }

        bum.updateBinSelection(binSelections);
        console.log(`[bumpath:repath] Marked ${selectedCount} BIN files for skins [${skinIdsForPass.join(', ')}]`);

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
      if (!outputDir) return { error: 'Missing outputDir' };
      if (items.length === 0) return { success: true, extractedCount: 0, skippedCount: 0 };

      const replaceExisting = typeof replaceExistingInput === 'boolean'
        ? replaceExistingInput
        : await askReplaceExistingForOutput(event?.sender, outputDir, 'selected extraction');
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

      const result = await nativeAddon.extractSelectedAsync(nativeItems, outputDir, replaceExisting);
      if (result?.error) {
        return { error: result.error };
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
          console.warn('[wad:loadAllIndexes] Native indexer returned non-array, falling back');
        } catch (e) {
          console.warn('[wad:loadAllIndexes] Native addon failed, falling back:', e.message);
        }
      }
      console.log('[wad:loadAllIndexes] Using JS fallback');

      // Load hash tables once for the whole batch (big speed win vs per-WAD load).
      let preloadedTables = null;
      if (resolvedHashPath && fs.existsSync(resolvedHashPath)) {
        try {
          const { loadHashtables } = await loadJsRitoModule();
          preloadedTables = await loadHashtables(resolvedHashPath, {
            tables: ['hashes.game.txt', 'hashes.lcu.txt', 'hashes.extracted.txt'],
          });
        } catch (e) {
          console.warn('[wad:loadAllIndexes] Hashtable preload failed:', e.message);
        }
      }

      const results = new Array(wadPaths.length);
      let idx = 0;

      async function worker() {
        while (true) {
          const i = idx++;
          if (i >= wadPaths.length) break;
          const wadPath = wadPaths[i];
          try {
            const r = await readWadMetadata({
              wadPath,
              rawHashPath,
              flatOnly: true,
              preloadedTables,
            });
            if (r?.error) {
              results[i] = { path: wadPath, error: r.error, paths: [], chunkCount: 0 };
            } else {
              results[i] = {
                path: wadPath,
                error: null,
                paths: Array.isArray(r.paths) ? r.paths : [],
                chunkCount: r.chunkCount || 0,
              };
            }
          } catch (e) {
            results[i] = { path: wadPath, error: e.message, paths: [], chunkCount: 0 };
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, worker));
      return { results };
    } catch (error) {
      console.error('[wad:loadAllIndexes] Error:', error);
      return { error: error.message, results: [] };
    }
  });

  // ---------------------------------------------------------------------------
  // hashtable:warmCache — staged preload with progress events.
  // Called from FrogChanger when user enables warm cache mode.
  // ---------------------------------------------------------------------------
  ipcMain.handle('hashtable:warmCache', async (event, payload) => {
    try {
      const hashPathInput = typeof payload === 'string' ? payload : payload?.hashPath;
      const hashPath = getHashPath(hashPathInput);
      if (!hashPath || !fs.existsSync(hashPath)) {
        return { success: false, error: 'Invalid hash path' };
      }

      if (USE_DB_HASHING) {
        // SQLite doesn't need warming — lookups are indexed and instant.
        return { success: true };
      }

      const { loadHashtables } = await loadJsRitoModule();
      const sendStage = (stage, index, total) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('hashtable:warmProgress', { stage, index, total });
          }
        } catch (_) { /* ignore */ }
      };

      if (warmCacheInFlight) {
        await warmCacheInFlight;
        return { success: true, reused: true };
      }

      const steps = [
        { label: 'Loading bin fields', tables: ['hashes.binfields.txt'] },
        { label: 'Loading bin types', tables: ['hashes.bintypes.txt'] },
        { label: 'Loading bin hashes', tables: ['hashes.binhashes.txt'] },
        { label: 'Loading bin entries', tables: ['hashes.binentries.txt'] },
      ];

      const cancelFlag = warmCacheCancelFlag;
      warmCacheInFlight = (async () => {
        const total = steps.length;
        for (let i = 0; i < steps.length; i++) {
          if (cancelFlag.cancelled) return;
          const step = steps[i];
          sendStage(step.label, i + 1, total);
          // Yield to the event loop between each step so IPC calls remain responsive.
          await new Promise(r => setImmediate(r));
          if (cancelFlag.cancelled) return;
          await loadHashtables(hashPath, { tables: step.tables });
          await new Promise(r => setImmediate(r));
        }
        if (!cancelFlag.cancelled) sendStage('Hash preload complete', total, total);
      })();

      await warmCacheInFlight;
      warmCacheInFlight = null;
      return { success: true };
    } catch (e) {
      warmCacheInFlight = null;
      console.warn('[hashtable:warmCache] Error:', e.message);
      return { success: false, error: e.message };
    }
  });

  // ---------------------------------------------------------------------------
  // hashtable:primeWad — lightweight preload for WAD explorer indexing.
  // Loads only game/lcu tables, unlike warmCache which loads all hash sets.
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
        try {
          nativeAddon.primeHashTables(hashPath);
          console.log('[hashtable:primeWad] Using native hashtable prime (buildHashDb)');
          return { success: true, native: true };
        } catch (e) {
          console.warn('[hashtable:primeWad] Native prime failed, falling back:', e.message);
        }
      }


      const { loadHashtables } = await loadJsRitoModule();
      await loadHashtables(hashPath, { tables: ['hashes.game.txt', 'hashes.lcu.txt'] });
      console.log('[hashtable:primeWad] Using JS hashtable prime');
      return { success: true, native: false };
    } catch (e) {
      console.warn('[hashtable:primeWad] Error:', e.message);
      return { success: false, error: e.message };
    }
  });

  // ---------------------------------------------------------------------------
  // hashtable:setKeepAlive — enable/disable cache pinning (disables 30s TTL when enabled).
  // ---------------------------------------------------------------------------
  ipcMain.handle('hashtable:setKeepAlive', async (_event, enabled) => {
    try {
      const { setHashtablesCachePinned } = await loadJsRitoModule();
      setHashtablesCachePinned(enabled === true);
      return { success: true };
    } catch (e) {
      console.warn('[hashtable:setKeepAlive] Error:', e.message);
      return { success: false, error: e.message };
    }
  });

  // ---------------------------------------------------------------------------
  // hashtable:clearCache — called from renderer when user leaves FrogChanger.
  // Clears the main-process hashtablesCache immediately and requests a GC.
  // ---------------------------------------------------------------------------
  ipcMain.handle('hashtable:clearCache', async () => {
    try {
      // Cancel any in-flight warm cache loop so it doesn't reload tables after we clear
      warmCacheCancelFlag.cancelled = true;
      warmCacheCancelFlag = { cancelled: false };
      warmCacheInFlight = null;

      const nativeAddon = tryLoadNativeWadIndexer();
      if (nativeAddon && typeof nativeAddon.clearHashTables === 'function') {
        try {
          nativeAddon.clearHashTables();
        } catch (e) {
          console.warn('[hashtable:clearCache] Native clear failed:', e.message);
        }
      }
      const { clearHashtablesCache } = await loadJsRitoModule();
      clearHashtablesCache();
      if (typeof global.gc === 'function') {
        global.gc();
        console.log('[hashtable:clearCache] Cache cleared + GC triggered');
      } else {
        console.log('[hashtable:clearCache] Cache cleared');
      }
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

      // Invalidate only hashes.extracted.txt — keeps hashes.game.txt/lcu.txt warm.
      if (hashDir) {
        try {
          const { invalidateHashtableTable } = await loadJsRitoModule();
          invalidateHashtableTable(hashDir, 'hashes.extracted.txt');
        } catch (e) {
          console.warn('[wad:extractHashes] Failed to invalidate cache:', e.message);
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
      const { filesDir, skinKey = 'base', characterFolder = '', hashPath: rawHashPath } = data || {};
      if (!filesDir || !fs.existsSync(filesDir)) return { materialTextureHints: {}, defaultTextureBySkn: {} };
      if (!loadBinModule || !loadBinHasherModule || !loadWadHasherModule) {
        return { materialTextureHints: {}, defaultTextureBySkn: {} };
      }

      const { discoverMaterialTextureHints } = require('./modelInspect');
      const hashPath = getHashPath(rawHashPath);
      let hashtables = null;
      if (hashPath && fs.existsSync(hashPath)) {
        try {
          const { loadHashtables } = await loadJsRitoModule();
          hashtables = await loadHashtables(hashPath, {
            tables: ['hashes.game.txt', 'hashes.lcu.txt', 'hashes.binentries.txt', 'hashes.binhashes.txt', 'hashes.bintypes.txt', 'hashes.binfields.txt'],
          });
        } catch (_) { }
      }

      const skinId = skinKey === 'base' ? 0 : (parseInt(skinKey.replace(/^skin0*/i, ''), 10) || 0);
      const result = await discoverMaterialTextureHints({
        fs,
        filesDir,
        hashtables,
        skinId,
        skinKey,
        characterFolder,
        loadBinModule,
        loadBinHasherModule,
        loadWadHasherModule,
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
