function createCliArgsHandler({ app, path, processRef, isDev, fs, spawn, logToFile, baseDir }) {
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

    return false;
  }

  return {
    handleCommandLineArgs,
  };
}

module.exports = { createCliArgsHandler };
