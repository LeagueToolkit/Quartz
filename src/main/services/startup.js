function registerLocalFileProtocol({ protocol, path, fs, logToFile }) {
  protocol.registerFileProtocol('local-file', (request, callback) => {
    try {
      const urlString = request.url;
      let filePath = urlString.replace(/^local-file:\/+/i, '');
      filePath = decodeURIComponent(filePath);

      if (/^[a-zA-Z]\//.test(filePath)) {
        filePath = filePath[0] + ':' + filePath.slice(1);
      }

      const absolutePath = path.resolve(filePath);
      logToFile(`[PROTOCOL] Request: ${urlString} -> Resolved: ${absolutePath}`, 'INFO');

      if (!fs.existsSync(absolutePath)) {
        logToFile(`[PROTOCOL] File not found: ${absolutePath}`, 'ERROR');
      }

      return callback({ path: absolutePath });
    } catch (error) {
      logToFile(`[PROTOCOL] Critical error: ${error.message}`, 'ERROR');
      return callback({ error: -6 });
    }
  });
}

function runStartupTasks({
  app,
  isDev,
  logToFile,
  createWindow,
  setupAutoUpdater,
  ensureRitobinCli,
  ensureDefaultAssets,
  ensureDefaultCursors,
  refreshContextMenuIfStale,
  hashManager,
  getMainWindow,
}) {
  const emitHashState = (payload) => {
    try {
      const win = typeof getMainWindow === 'function' ? getMainWindow() : null;
      if (win && !win.isDestroyed() && win.webContents) {
        win.webContents.send('hash:auto-sync-state', payload);
      }
    } catch (_) {}
  };

  try { app.setAppUserModelId('com.github.ritoshark.quartz'); } catch (_) {}
  createWindow();

  setupAutoUpdater();
  ensureRitobinCli();
  ensureDefaultAssets();
  ensureDefaultCursors();
  refreshContextMenuIfStale();

  setTimeout(() => {
    try {
      const result = hashManager.checkHashes();
      if (!result.allPresent && result.missing.length > 0) {
        logToFile(`Hash files missing (${result.missing.length}): ${result.missing.join(', ')}.`, 'INFO');
      } else {
        logToFile('All hash files present', 'INFO');
      }
    } catch (err) {
      logToFile(`Hash check error: ${err.message}`, 'WARNING');
    }
  }, 1000);

  // Auto-run hash sync in background on app startup.
  // Uses metadata-aware skip logic, so unchanged files are not redownloaded.
  setTimeout(async () => {
    try {
      if (typeof hashManager.isAutoSyncFresh === 'function' && hashManager.isAutoSyncFresh(30)) {
        logToFile('Hash auto-sync (startup): skipped, metadata is fresh', 'INFO');
        emitHashState({
          status: 'success',
          message: 'Hashes recently checked - no update needed',
          downloaded: [],
          skipped: [],
          errors: [],
        });
        return;
      }

      logToFile('Hash auto-sync (startup): begin', 'INFO');
      emitHashState({ status: 'checking', message: 'Checking hash updates...' });
      const result = await hashManager.downloadHashes((message, current, total) => {
        emitHashState({
          status: 'downloading',
          message,
          current: Number(current || 0),
          total: Number(total || 0),
        });
      });
      if (!result?.success) {
        logToFile(`Hash auto-sync (startup): failed (${(result?.errors || []).length} errors)`, 'WARN');
        emitHashState({
          status: 'error',
          message: 'Hash auto-sync failed',
          errors: result?.errors || [],
        });
      } else {
        logToFile(
          `Hash auto-sync (startup): downloaded=${(result.downloaded || []).length}, skipped=${(result.skipped || []).length}, errors=${(result.errors || []).length}`,
          'INFO'
        );
        emitHashState({
          status: 'success',
          message: (result.downloaded || []).length > 0
            ? `Hash update complete - updated ${(result.downloaded || []).length} file(s)`
            : 'Hashes are already up to date',
          downloaded: result.downloaded || [],
          skipped: result.skipped || [],
          errors: result.errors || [],
        });
      }
    } catch (err) {
      logToFile(`Hash auto-sync (startup) error: ${err.message}`, 'WARN');
      emitHashState({
        status: 'error',
        message: `Hash auto-sync error: ${err.message}`,
        errors: [err.message],
      });
    }
  }, 2500);

  logToFile('APP: Backend service startup disabled - using JavaScript implementations', 'INFO');
}

module.exports = { registerLocalFileProtocol, runStartupTasks };
