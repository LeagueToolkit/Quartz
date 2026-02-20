function createAutoUpdaterService({ autoUpdater, app, isDev, processRef, https, logToFile }) {
  let updateWindow = null;
  let cachedUpdateInfo = null;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.logger = {
    info: (message) => logToFile(`[AUTO-UPDATER] ${message}`, 'INFO'),
    warn: (message) => logToFile(`[AUTO-UPDATER] ${message}`, 'WARNING'),
    error: (message) => logToFile(`[AUTO-UPDATER] ${message}`, 'ERROR'),
    debug: (message) => logToFile(`[AUTO-UPDATER] ${message}`, 'INFO'),
  };

  if (processRef.env.ENABLE_AUTO_UPDATER === 'true') {
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.updateConfigPath = null;
  }

  function setUpdateWindow(win) {
    updateWindow = win;
  }

  function getUpdateWindow() {
    return updateWindow;
  }

  function getCachedUpdateInfo() {
    return cachedUpdateInfo;
  }

  async function checkUpdatesViaGitHubAPI() {
    return new Promise((resolve, reject) => {
      try {
        logToFile('Checking updates via GitHub API (fallback)...', 'INFO');
        const currentVersion = app.getVersion();

        const options = {
          hostname: 'api.github.com',
          path: '/repos/RitoShark/Quartz/releases/latest',
          method: 'GET',
          headers: {
            'User-Agent': 'Quartz-App',
            Accept: 'application/vnd.github.v3+json',
          },
        };

        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                throw new Error(`GitHub API returned ${res.statusCode}`);
              }

              const release = JSON.parse(data);
              const latestVersion = release.tag_name.replace(/^v/, '');

              logToFile(`GitHub API - Current: ${currentVersion}, Latest: ${latestVersion}`, 'INFO');

              const compareVersions = (v1, v2) => {
                const parts1 = v1.split('.').map(Number);
                const parts2 = v2.split('.').map(Number);
                for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
                  const a = parts1[i] || 0;
                  const b = parts2[i] || 0;
                  if (a < b) return -1;
                  if (a > b) return 1;
                }
                return 0;
              };

              if (compareVersions(currentVersion, latestVersion) < 0) {
                logToFile(`Update available via GitHub API: ${latestVersion}`, 'INFO');
                if (updateWindow) {
                  updateWindow.webContents.send('update:available', {
                    version: latestVersion,
                    releaseDate: release.published_at,
                    releaseNotes: release.body || '',
                  });
                }
                resolve({ updateAvailable: true, version: latestVersion });
              } else {
                logToFile('No update available via GitHub API', 'INFO');
                if (updateWindow) {
                  updateWindow.webContents.send('update:not-available', {
                    version: latestVersion,
                  });
                }
                resolve({ updateAvailable: false, version: latestVersion });
              }
            } catch (parseError) {
              logToFile(`Failed to parse GitHub API response: ${parseError.message}`, 'ERROR');
              reject(parseError);
            }
          });
        });

        req.on('error', (error) => {
          logToFile(`GitHub API request failed: ${error.message}`, 'ERROR');
          reject(error);
        });

        req.end();
      } catch (error) {
        logToFile(`GitHub API check failed: ${error.message}`, 'ERROR');
        reject(error);
      }
    });
  }

  function setupAutoUpdater() {
    const enableInDev = processRef.env.ENABLE_AUTO_UPDATER === 'true';
    if ((isDev || !app.isPackaged) && !enableInDev) {
      logToFile('Auto-updater disabled in development mode', 'INFO');
      logToFile('To enable for testing, set ENABLE_AUTO_UPDATER=true', 'INFO');
      return;
    }

    if (enableInDev) {
      logToFile('AUTO-UPDATER ENABLED IN DEV MODE (FOR TESTING ONLY)', 'WARNING');
    }

    logToFile('Setting up auto-updater', 'INFO');

    autoUpdater.on('checking-for-update', () => {
      logToFile('Checking for update...', 'INFO');
      if (updateWindow) {
        updateWindow.webContents.send('update:checking');
      }
    });

    autoUpdater.on('update-available', (info) => {
      logToFile(`Update available: ${info.version}`, 'INFO');
      cachedUpdateInfo = info;
      autoUpdater.updateInfo = info;
      if (updateWindow) {
        updateWindow.webContents.send('update:available', {
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes: info.releaseNotes || '',
        });
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      logToFile(`Update not available. Current version: ${info.version}`, 'INFO');
      if (updateWindow) {
        updateWindow.webContents.send('update:not-available', {
          version: info.version,
        });
      }
    });

    autoUpdater.on('error', (err) => {
      logToFile(`Auto-updater error: ${err.message}`, 'ERROR');
      logToFile(`Auto-updater error details: ${JSON.stringify(err)}`, 'ERROR');
      if (updateWindow) {
        updateWindow.webContents.send('update:error', {
          message: err.message,
        });
      }
      if (!enableInDev) {
        logToFile('Attempting fallback GitHub API check...', 'INFO');
        checkUpdatesViaGitHubAPI().catch((fallbackErr) => {
          logToFile(`Fallback check also failed: ${fallbackErr.message}`, 'ERROR');
        });
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
      logToFile(message, 'INFO');
      if (updateWindow) {
        updateWindow.webContents.send('update:download-progress', {
          percent: progressObj.percent,
          transferred: progressObj.transferred,
          total: progressObj.total,
          bytesPerSecond: progressObj.bytesPerSecond,
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      logToFile(`Update downloaded: ${info.version}. Will install on app quit.`, 'INFO');
      if (updateWindow) {
        updateWindow.webContents.send('update:downloaded', {
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes: info.releaseNotes || '',
        });
      }
    });

    setTimeout(() => {
      try {
        logToFile('Checking for updates...', 'INFO');
        logToFile(`Current version: ${app.getVersion()}`, 'INFO');
        logToFile(`isDev: ${isDev}, isPackaged: ${app.isPackaged}`, 'INFO');

        if (enableInDev) {
          autoUpdater.setFeedURL({
            provider: 'github',
            owner: 'RitoShark',
            repo: 'Quartz',
          });
          autoUpdater.forceDevUpdateConfig = true;
          logToFile('Calling checkForUpdatesAndNotify (dev mode)...', 'INFO');
          autoUpdater.checkForUpdatesAndNotify().catch((err) => {
            logToFile(`Update check error: ${err.message}`, 'ERROR');
            logToFile(`Stack trace: ${err.stack}`, 'ERROR');
          });
        } else {
          logToFile('Production mode - checking for updates via electron-updater', 'INFO');
          autoUpdater.checkForUpdates().catch((err) => {
            logToFile(`Update check failed: ${err.message}`, 'ERROR');
            logToFile('Trying fallback GitHub API check...', 'INFO');
            checkUpdatesViaGitHubAPI().catch((fallbackErr) => {
              logToFile(`Fallback check failed: ${fallbackErr.message}`, 'ERROR');
            });
          });
        }
      } catch (err) {
        logToFile(`Failed to check for updates: ${err.message}`, 'ERROR');
        logToFile(`Stack trace: ${err.stack}`, 'ERROR');
      }
    }, 3000);
  }

  return {
    setupAutoUpdater,
    checkUpdatesViaGitHubAPI,
    setUpdateWindow,
    getUpdateWindow,
    getCachedUpdateInfo,
  };
}

module.exports = { createAutoUpdaterService };

