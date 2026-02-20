function registerHashChannels({
  ipcMain,
  hashManager,
  logToFile,
  processRef,
  path,
  fs,
  clearBackendHashCache,
  getHomeDir,
}) {
  ipcMain.handle('hashes:check', async () => {
    try {
      return hashManager.checkHashes();
    } catch (error) {
      console.error('❌ Hash check error:', error);
      return { allPresent: false, missing: [], hashDir: '', error: error.message };
    }
  });

  ipcMain.handle('hashes:download', async (_event, progressCallback) => {
    try {
      const result = await hashManager.downloadHashes((message, current, total) => {
        if (progressCallback) {
          progressCallback(message, current, total);
        }
        logToFile(`Hash download: ${message}`, 'INFO');
      });

      if (result.success) {
        logToFile(`Hash download completed: ${result.downloaded.length} files, ${result.errors.length} errors`, 'INFO');
        try {
          await clearBackendHashCache();
          logToFile('Backend hashtables cache cleared', 'INFO');
        } catch (cacheError) {
          logToFile(`Failed to clear backend hashtables cache: ${cacheError.message}`, 'WARN');
        }
      } else {
        logToFile(`Hash download failed: ${result.errors.length} errors`, 'ERROR');
      }

      return result;
    } catch (error) {
      console.error('❌ Hash download error:', error);
      logToFile(`Hash download error: ${error.message}`, 'ERROR');
      return { success: false, downloaded: [], errors: [error.message], hashDir: hashManager.getHashDirectory() };
    }
  });

  ipcMain.handle('hashes:get-directory', async () => {
    try {
      const hashDir = hashManager.getHashDirectory();
      logToFile(`Hash directory requested: ${hashDir}`, 'INFO');
      logToFile(`  - process.env.APPDATA: ${processRef.env.APPDATA || 'undefined'}`, 'INFO');
      logToFile(`  - process.env.HOME: ${processRef.env.HOME || 'undefined'}`, 'INFO');
      logToFile(`  - process.platform: ${processRef.platform}`, 'INFO');
      logToFile(`  - os.homedir(): ${getHomeDir()}`, 'INFO');

      if (fs.existsSync(hashDir)) {
        try {
          const testFile = path.join(hashDir, '.write-test');
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          logToFile('  - Directory is writable: YES', 'INFO');
        } catch (writeError) {
          logToFile(`  - Directory is writable: NO - ${writeError.message}`, 'WARN');
        }
      } else {
        logToFile('  - Directory exists: NO', 'WARN');
      }

      return { hashDir };
    } catch (error) {
      logToFile(`❌ Get hash directory error: ${error.message}`, 'ERROR');
      logToFile(`  - Stack: ${error.stack}`, 'ERROR');
      console.error('❌ Get hash directory error:', error);
      return { hashDir: '', error: error.message };
    }
  });
}

module.exports = {
  registerHashChannels,
};
