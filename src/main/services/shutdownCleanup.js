function createShutdownCleanup({ fs, path, logToFile }) {
  let textureCacheCleared = false;

  function clearTextureCacheOnQuit() {
    if (textureCacheCleared) {
      return;
    }
    textureCacheCleared = true;

    try {
      const os = require('os');
      const appDataCacheDir = path.join(os.homedir(), 'AppData', 'Local', 'Quartz', 'TextureCache');

      if (fs.existsSync(appDataCacheDir)) {
        const files = fs.readdirSync(appDataCacheDir);
        let deletedCount = 0;

        for (const file of files) {
          if (file.endsWith('.png')) {
            const filePath = path.join(appDataCacheDir, file);
            try {
              fs.unlinkSync(filePath);
              deletedCount++;
            } catch (error) {
              logToFile(`Failed to delete cache file ${file}: ${error.message}`, 'WARN');
            }
          }
        }

        if (deletedCount > 0) {
          logToFile(`Cleared ${deletedCount} cached texture files from TextureCache`, 'INFO');
        } else {
          logToFile('Texture cache directory was empty, nothing to clear', 'INFO');
        }
      } else {
        logToFile('Texture cache directory does not exist, nothing to clear', 'INFO');
      }
    } catch (error) {
      logToFile(`Error clearing texture cache: ${error.message}`, 'ERROR');
    }
  }

  function cleanupMeiFolders() {
    try {
      const os = require('os');
      const tempDir = os.tmpdir();

      if (!fs.existsSync(tempDir)) {
        return;
      }

      const entries = fs.readdirSync(tempDir, { withFileTypes: true });
      const meiFolders = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('_MEI'))
        .map((entry) => path.join(tempDir, entry.name));

      if (meiFolders.length === 0) {
        return;
      }

      console.log(`Found ${meiFolders.length} _MEI* folder(s) to clean up...`);
      logToFile(`Found ${meiFolders.length} _MEI* folder(s) to clean up`, 'INFO');

      let totalSize = 0;
      let deletedCount = 0;

      for (const meiFolder of meiFolders) {
        try {
          let folderSize = 0;
          const calculateSize = (dir) => {
            try {
              const items = fs.readdirSync(dir, { withFileTypes: true });
              for (const item of items) {
                const itemPath = path.join(dir, item.name);
                try {
                  if (item.isDirectory()) {
                    calculateSize(itemPath);
                  } else {
                    const stats = fs.statSync(itemPath);
                    folderSize += stats.size;
                  }
                } catch (_error) {
                  // skip files/folders we can't access
                }
              }
            } catch (_error) {
              // skip dirs we can't read
            }
          };

          calculateSize(meiFolder);

          try {
            fs.rmSync(meiFolder, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
            totalSize += folderSize;
            deletedCount++;
            const sizeMB = (folderSize / (1024 * 1024)).toFixed(2);
            console.log(`Deleted: ${path.basename(meiFolder)} (${sizeMB} MB)`);
            logToFile(`Deleted _MEI folder: ${path.basename(meiFolder)} (${sizeMB} MB)`, 'INFO');
          } catch (deleteError) {
            console.log(`Could not delete ${path.basename(meiFolder)}: ${deleteError.message}`);
            logToFile(`Could not delete _MEI folder ${path.basename(meiFolder)}: ${deleteError.message}`, 'WARN');
          }
        } catch (error) {
          console.log(`Error processing ${path.basename(meiFolder)}: ${error.message}`);
          logToFile(`Error processing _MEI folder ${path.basename(meiFolder)}: ${error.message}`, 'WARN');
        }
      }

      if (deletedCount > 0) {
        const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
        console.log(`Cleanup complete: Deleted ${deletedCount} folder(s), freed ${totalMB} MB`);
        logToFile(`_MEI cleanup complete: Deleted ${deletedCount} folder(s), freed ${totalMB} MB`, 'INFO');
      } else {
        console.log('No _MEI* folders were deleted (may be in use)');
        logToFile('No _MEI* folders were deleted (may be in use)', 'INFO');
      }
    } catch (error) {
      console.error(`Error during _MEI* cleanup: ${error.message}`);
      logToFile(`Error during _MEI* cleanup: ${error.message}`, 'ERROR');
    }
  }

  return {
    clearTextureCacheOnQuit,
    cleanupMeiFolders,
  };
}

module.exports = { createShutdownCleanup };

