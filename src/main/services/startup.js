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
}) {
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
        logToFile(`Hash files missing (${result.missing.length}): ${result.missing.join(', ')}. Auto-download will be triggered on first use.`, 'INFO');
      } else {
        logToFile('All hash files present', 'INFO');
      }
    } catch (err) {
      logToFile(`Hash check error: ${err.message}`, 'WARNING');
    }
  }, 1000);

  logToFile('APP: Backend service startup disabled - using JavaScript implementations', 'INFO');
}

module.exports = { registerLocalFileProtocol, runStartupTasks };

