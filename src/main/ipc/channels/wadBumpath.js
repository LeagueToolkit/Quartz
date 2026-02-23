/**
 * WAD + Bumpath IPC channels
 *
 * wad:extract        — single WAD extraction (legacy, kept for compatibility)
 * wad:extractBundle  — full champion bundle: main WAD + voiceover WADs, with
 *                      live progress events pushed to renderer via 'wad:progress'
 * bumpath:repath     — Bumpath repath
 */

const path = require('path');
const ICONS2D_RELATIVE_PATTERN = /^assets\/characters\/[^/]+\/hud\/icons2d(\/|$)/i;

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

function registerWadBumpathChannels({
  ipcMain,
  fs,
  getHashPath,
  loadWadModule,
  loadJsRitoModule,
  loadBumpathModule,
}) {
  let warmCacheInFlight = null;
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

      const result = await unpackWAD(data.wadPath, data.outputDir, hashtables, null, progressCallback);
      console.log('WAD extraction completed:', { extractedCount: result.extractedCount, outputDir: result.outputDir });
      return {
        success: true,
        extractedCount: result.extractedCount,
        outputDir: result.outputDir,
        hashedFiles: result.hashedFiles || {},
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

      // Load hashtables
      const hashPath = getHashPath(rawHashPath);
      let hashtables = null;
      if (hashPath && fs.existsSync(hashPath)) {
        try {
          const { loadHashtables } = await loadJsRitoModule();
          const htStart = Date.now();
          hashtables = await loadHashtables(hashPath, {
            tables: ['hashes.game.txt', 'hashes.lcu.txt'],
          });
          console.log(`[wad:extractBundle] Hashtables loaded in ${Date.now() - htStart}ms`);
        } catch (hashErr) {
          console.warn('[wad:extractBundle] Failed to load hashtables:', hashErr.message);
        }
      }

      const { unpackWAD } = await loadWadModule();
      const progressCallback = (count, message) => sendProgress(count, message);

      // Extract main WAD
      sendProgress(0, 'Extracting WAD file...');
      const normalResult = await unpackWAD(wadFilePath, outputDir, hashtables, null, progressCallback);
      sendProgress(normalResult.extractedCount, `Extracted ${normalResult.extractedCount} files successfully!`);

      // Extract voiceover WADs (different files, different namespaces — no collision risk)
      let successfulVoiceovers = 0;
      let failedVoiceovers = 0;

      if (voiceoverWadFiles.length > 0 && extractVoiceover) {
        sendProgress(0, `Extracting ${voiceoverWadFiles.length} voiceover WAD(s)...`);
        for (const voFile of voiceoverWadFiles) {
          try {
            await unpackWAD(path.join(leaguePath, voFile), outputDir, hashtables, null, progressCallback);
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

          // Swap: delete full extraction, rename clean dir to final outputDir
          sendProgress(0, 'Finalizing...');
          fs.rmSync(outputDir, { recursive: true, force: true });
          fs.renameSync(cleanDir, outputDir);
          sendProgress(0, 'Skin files ready!');
          console.log(`[wad:extractBundle] Clean complete: ${outputDir}`);
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
        { label: 'Loading game hashes', tables: ['hashes.game.txt'] },
        { label: 'Loading lcu hashes', tables: ['hashes.lcu.txt'] },
        { label: 'Loading bin fields', tables: ['hashes.binfields.txt'] },
        { label: 'Loading bin types', tables: ['hashes.bintypes.txt'] },
        { label: 'Loading bin hashes', tables: ['hashes.binhashes.txt'] },
        { label: 'Loading bin entries', tables: ['hashes.binentries.txt'] },
      ];

      warmCacheInFlight = (async () => {
        const total = steps.length;
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          sendStage(step.label, i + 1, total);
          await loadHashtables(hashPath, { tables: step.tables });
        }
        sendStage('Hash preload complete', total, total);
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
}

module.exports = { registerWadBumpathChannels };
