function registerUpdateChannels({
  ipcMain,
  isDev,
  app,
  processRef,
  autoUpdater,
  logToFile,
  checkUpdatesViaGitHubAPI,
  shell,
  getCachedUpdateInfo,
}) {
  ipcMain.handle('update:check', async () => {
    try {
      if (isDev || !app.isPackaged) {
        // In dev mode, use GitHub API fallback
        if (processRef.env.ENABLE_AUTO_UPDATER === 'true') {
          const result = await checkUpdatesViaGitHubAPI();
          return { success: true, updateAvailable: result.updateAvailable };
        }
        return { success: false, error: 'Update checking is only available in production builds' };
      }
      // checkForUpdates returns a Promise, handle it properly
      autoUpdater.checkForUpdates().catch(async (err) => {
        logToFile(`electron-updater check failed, trying GitHub API: ${err.message}`, 'WARNING');
        try {
          await checkUpdatesViaGitHubAPI();
        } catch (fallbackErr) {
          logToFile(`Fallback also failed: ${fallbackErr.message}`, 'ERROR');
        }
      });
      return { success: true };
    } catch (error) {
      logToFile(`Update check error: ${error.message}`, 'ERROR');
      // Try fallback on error
      try {
        await checkUpdatesViaGitHubAPI();
        return { success: true, usedFallback: true };
      } catch {
        return { success: false, error: error.message };
      }
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      if (isDev || !app.isPackaged) {
        return { success: false, error: 'Update downloading is only available in production builds' };
      }

      // Check if update info is available - use cached version if available
      const cachedUpdateInfo = getCachedUpdateInfo();
      if (cachedUpdateInfo) {
        autoUpdater.updateInfo = cachedUpdateInfo;
        logToFile(`Using cached update info: ${cachedUpdateInfo.version}`, 'INFO');
      }

      // Check if update info is available, if not, wait for it
      // The update-available event should have already fired, but updateInfo might not be set immediately
      if (!autoUpdater.updateInfo) {
        let retries = 0;
        const maxRetries = 10;

        while (!autoUpdater.updateInfo && retries < maxRetries) {
          logToFile(`Waiting for update info... (${retries + 1}/${maxRetries})`, 'INFO');
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
        }
      }

      // If still no update info, try checking again
      if (!autoUpdater.updateInfo) {
        logToFile('Update info still not available, triggering check...', 'INFO');
        try {
          await autoUpdater.checkForUpdates();
          // Wait for update-available event
          await new Promise(resolve => setTimeout(resolve, 3000));
          // Check cached again
          const cachedUpdateInfoAfterCheck = getCachedUpdateInfo();
          if (cachedUpdateInfoAfterCheck) {
            autoUpdater.updateInfo = cachedUpdateInfoAfterCheck;
          }
        } catch (checkError) {
          logToFile(`Update check failed: ${checkError.message}`, 'ERROR');
        }
      }

      // If still no update info, use fallback
      if (!autoUpdater.updateInfo) {
        logToFile('No update info from electron-updater, using fallback...', 'WARNING');
        const fallbackResult = await checkUpdatesViaGitHubAPI();
        if (fallbackResult.updateAvailable) {
          const fallbackUrl = fallbackResult.releaseUrl
            || `https://github.com/${fallbackResult.owner || 'LeagueToolkit'}/${fallbackResult.repo || 'Quartz'}/releases/tag/v${fallbackResult.version}`;
          await shell.openExternal(fallbackUrl);
          return {
            success: true,
            manualDownload: true,
            message: 'Opening GitHub release page for manual download (electron-updater not available)',
          };
        }
        return { success: false, error: 'No update information available' };
      }

      logToFile(`Downloading update: ${autoUpdater.updateInfo.version}`, 'INFO');
      // Try to download with electron-updater
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      logToFile(`Update download error: ${error.message}`, 'ERROR');

      // If download fails, offer manual download as fallback
      if (error.message.includes('check update first') || error.message.includes('latest.yml') || !autoUpdater.updateInfo) {
        try {
          const fallbackResult = await checkUpdatesViaGitHubAPI();
          if (fallbackResult.updateAvailable) {
            const fallbackUrl = fallbackResult.releaseUrl
              || `https://github.com/${fallbackResult.owner || 'LeagueToolkit'}/${fallbackResult.repo || 'Quartz'}/releases/tag/v${fallbackResult.version}`;
            await shell.openExternal(fallbackUrl);
            return {
              success: true,
              manualDownload: true,
              message: 'Opening GitHub release page for manual download',
            };
          }
        } catch (fallbackError) {
          logToFile(`Fallback also failed: ${fallbackError.message}`, 'ERROR');
        }
      }

      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('update:install', async () => {
    try {
      if (isDev || !app.isPackaged) {
        return { success: false, error: 'Update installation is only available in production builds' };
      }
      // Quit and install - this will trigger the installation
      autoUpdater.quitAndInstall(false, true);
      return { success: true };
    } catch (error) {
      logToFile(`Update install error: ${error.message}`, 'ERROR');
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerUpdateChannels,
};
