function createCliArgsHandler({ app, path, processRef, isDev, fs, spawn, logToFile, baseDir }) {
  function getNativeWadAddon() {
    try {
      // Lazy import to avoid startup cost and circular init timing issues.
      // eslint-disable-next-line global-require
      const { tryLoadNativeWadIndexer } = require('../ipc/channels/wadBumpath');
      return tryLoadNativeWadIndexer();
    } catch (error) {
      logToFile(`[CLI] Failed to load native wad addon: ${error.message}`, 'ERROR');
      return null;
    }
  }

  function getHashDirectorySafe() {
    try {
      // eslint-disable-next-line global-require
      const hashManager = require('../../utils/io/hashManager');
      return hashManager.getHashDirectory();
    } catch (error) {
      logToFile(`[CLI] Failed to resolve hash directory: ${error.message}`, 'ERROR');
      return null;
    }
  }

  function defaultWadOutputDir(wadPath) {
    const dir = path.dirname(wadPath);
    const file = path.basename(wadPath);
    const lower = file.toLowerCase();
    let folderName = file;
    if (lower.endsWith('.wad.client')) folderName = `${file.slice(0, -'.wad.client'.length)}.wad`;
    else if (lower.endsWith('.wad')) folderName = file;

    const preferred = path.join(dir, folderName);
    if (path.resolve(preferred) === path.resolve(wadPath)) {
      return path.join(dir, `${folderName}.unpacked`);
    }
    return preferred;
  }

  async function runContextMenuScript(scriptName, targetFile) {
    try {
      const contextMenuBase = app.isPackaged
        ? path.join(processRef.resourcesPath, 'context_menu')
        : path.join(baseDir, 'context_menu');

      const pythonExePath = path.join(contextMenuBase, 'python', 'python.exe');
      const scriptPath = path.join(contextMenuBase, scriptName);

      if (!fs.existsSync(pythonExePath)) throw new Error(`Python not found at: ${pythonExePath}`);
      if (!fs.existsSync(scriptPath)) throw new Error(`Script not found at: ${scriptPath}`);

      logToFile(`[CLI] Executing: ${scriptName} on ${targetFile}`, 'INFO');

      return new Promise((resolve, reject) => {
        const child = spawn(pythonExePath, [scriptPath, targetFile]);

        child.stdout.on('data', (data) => logToFile(`[${scriptName}] ${data.toString().trim()}`, 'INFO'));
        child.stderr.on('data', (data) => logToFile(`[${scriptName}] ERR: ${data.toString().trim()}`, 'ERROR'));

        child.on('close', (code) => {
          if (code === 0) {
            logToFile(`[CLI] ${scriptName} completed successfully`, 'INFO');
            resolve(true);
          } else {
            logToFile(`[CLI] ${scriptName} failed with code ${code}`, 'ERROR');
            reject(new Error(`Exit code ${code}`));
          }
        });
      });
    } catch (error) {
      logToFile(`[CLI] Execution error: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  async function handleCommandLineArgs() {
    const args = processRef.argv;
    const startIndex = isDev ? 2 : 1;
    const filteredArgs = args.slice(startIndex);

    const noSkinLiteIdx = filteredArgs.indexOf('--noskinlite');
    const separateVfxIdx = filteredArgs.indexOf('--separate-vfx');
    const combineLinkedIdx = filteredArgs.indexOf('--combine-linked');
    const batchSplitVfxIdx = filteredArgs.indexOf('--batch-split-vfx');
    const wadExtractHashesIdx = filteredArgs.indexOf('--wad-extract-hashes');
    const wadUnpackIdx = filteredArgs.indexOf('--wad-unpack');

    if (noSkinLiteIdx !== -1 || separateVfxIdx !== -1 || combineLinkedIdx !== -1 || batchSplitVfxIdx !== -1) {
      const flagIdx = noSkinLiteIdx !== -1 ? noSkinLiteIdx : (separateVfxIdx !== -1 ? separateVfxIdx : (combineLinkedIdx !== -1 ? combineLinkedIdx : batchSplitVfxIdx));
      const scriptName = noSkinLiteIdx !== -1 ? 'noskinlite.py' : (separateVfxIdx !== -1 ? 'separate_vfx.py' : (combineLinkedIdx !== -1 ? 'combine_linked.py' : 'batch_split_vfx.py'));
      const targetFile = filteredArgs[flagIdx - 1];

      if (targetFile && fs.existsSync(targetFile)) {
        try {
          await runContextMenuScript(scriptName, targetFile);
          app.quit();
          return true;
        } catch (_error) {
          app.quit();
          return true;
        }
      }

      logToFile(`[CLI] Target file not found: ${targetFile}`, 'ERROR');
      app.quit();
      return true;
    }

    if (wadExtractHashesIdx !== -1 || wadUnpackIdx !== -1) {
      const isExtractHashes = wadExtractHashesIdx !== -1;
      const flagIdx = isExtractHashes ? wadExtractHashesIdx : wadUnpackIdx;
      const targetFile = filteredArgs[flagIdx + 1];

      if (!targetFile || !fs.existsSync(targetFile)) {
        logToFile(`[CLI] WAD target not found: ${targetFile || '(missing)'}`, 'ERROR');
        app.quit();
        return true;
      }
      const lowerTarget = String(targetFile).toLowerCase();
      if (!(lowerTarget.endsWith('.wad') || lowerTarget.endsWith('.wad.client'))) {
        logToFile(`[CLI] Skipping non-WAD target for WAD context action: ${targetFile}`, 'WARN');
        app.quit();
        return true;
      }

      try {
        const nativeAddon = getNativeWadAddon();
        if (!nativeAddon) {
          throw new Error('Native wad addon unavailable');
        }

        const hashDir = getHashDirectorySafe();
        if (isExtractHashes) {
          if (typeof nativeAddon.extractHashesFromWad !== 'function') {
            throw new Error('extractHashesFromWad not available in native addon');
          }
          const result = nativeAddon.extractHashesFromWad(targetFile, hashDir || null);
          if (!result?.success) {
            throw new Error(result?.error || 'Hash extraction failed');
          }
          logToFile(
            `[CLI] WAD hash extraction complete: ${targetFile} (${result?.newHashCount || 0} new hashes)`,
            'INFO'
          );
        } else {
          if (hashDir && typeof nativeAddon.primeHashTables === 'function') {
            try {
              nativeAddon.primeHashTables(hashDir);
            } catch (error) {
              logToFile(`[CLI] primeHashTables warning: ${error.message}`, 'WARN');
            }
          }

          if (typeof nativeAddon.extractWad !== 'function') {
            throw new Error('extractWad not available in native addon');
          }

          const outputDir = defaultWadOutputDir(targetFile);
          const result = nativeAddon.extractWad(
            targetFile,
            outputDir,
            hashDir || null,
            true
          );
          if (!result?.success) {
            throw new Error(result?.error || 'WAD unpack failed');
          }
          logToFile(
            `[CLI] WAD unpack complete: ${targetFile} -> ${outputDir} (extracted=${result?.extractedCount || 0}, skipped=${result?.skippedCount || 0})`,
            'INFO'
          );
        }
      } catch (error) {
        logToFile(`[CLI] WAD operation failed: ${error.message}`, 'ERROR');
      }

      app.quit();
      return true;
    }

    return false;
  }

  return {
    handleCommandLineArgs,
  };
}

module.exports = { createCliArgsHandler };
