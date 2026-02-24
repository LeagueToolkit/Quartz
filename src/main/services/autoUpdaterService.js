function createAutoUpdaterService({ autoUpdater, app, isDev, processRef, https, logToFile }) {
  let updateWindow = null;
  let cachedUpdateInfo = null;
  const UPDATE_REPOS = [
    { owner: 'LeagueToolkit', repo: 'Quartz' },
  ];

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

    const fetchLatestFromRepo = (owner, repo) => new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/releases/latest`,
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
          if (res.statusCode !== 200) {
            reject(new Error(`${owner}/${repo} returned ${res.statusCode}`));
            return;
          }
          try {
            const release = JSON.parse(data);
            resolve({
              owner,
              repo,
              release,
              version: String(release.tag_name || '').replace(/^v/, ''),
            });
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => reject(error));
      req.end();
    });

    try {
      logToFile('Checking updates via GitHub API (fallback)...', 'INFO');
      const currentVersion = app.getVersion();
      let bestRelease = null;

      for (const candidate of UPDATE_REPOS) {
        try {
          const repoRelease = await fetchLatestFromRepo(candidate.owner, candidate.repo);
          logToFile(
            `GitHub API candidate: ${candidate.owner}/${candidate.repo} -> ${repoRelease.version}`,
            'INFO'
          );
          if (!bestRelease || compareVersions(bestRelease.version, repoRelease.version) < 0) {
            bestRelease = repoRelease;
          }
        } catch (error) {
          logToFile(`GitHub API candidate failed (${candidate.owner}/${candidate.repo}): ${error.message}`, 'WARNING');
        }
      }

      if (!bestRelease || !bestRelease.version) {
        throw new Error('No valid GitHub releases found in configured repositories');
      }

      logToFile(
        `GitHub API - Current: ${currentVersion}, Latest: ${bestRelease.version} from ${bestRelease.owner}/${bestRelease.repo}`,
        'INFO'
      );

      if (compareVersions(currentVersion, bestRelease.version) < 0) {
        logToFile(`Update available via GitHub API: ${bestRelease.version}`, 'INFO');
        if (updateWindow) {
          updateWindow.webContents.send('update:available', {
            version: bestRelease.version,
            releaseDate: bestRelease.release.published_at,
            releaseNotes: bestRelease.release.body || '',
          });
        }
        return {
          updateAvailable: true,
          version: bestRelease.version,
          owner: bestRelease.owner,
          repo: bestRelease.repo,
          releaseUrl: bestRelease.release.html_url,
        };
      }

      logToFile('No update available via GitHub API', 'INFO');
      if (updateWindow) {
        updateWindow.webContents.send('update:not-available', {
          version: bestRelease.version,
        });
      }
      return {
        updateAvailable: false,
        version: bestRelease.version,
        owner: bestRelease.owner,
        repo: bestRelease.repo,
        releaseUrl: bestRelease.release.html_url,
      };
    } catch (error) {
      logToFile(`GitHub API check failed: ${error.message}`, 'ERROR');
      throw error;
    }
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
            owner: 'LeagueToolkit',
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
