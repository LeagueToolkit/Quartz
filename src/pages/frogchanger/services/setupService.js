export const getUserDesktopPath = () => {
  if (!window.require) return null;

  try {
    const path = window.require('path');
    const os = window.require('os');
    const fs = window.require('fs');

    const homeDir = os.homedir();
    const desktopPaths = [
      path.join(homeDir, 'Desktop'),
      path.join(homeDir, 'OneDrive', 'Desktop'),
      path.join(homeDir, 'OneDrive - Personal', 'Desktop'),
    ];

    const onedriveBusiness = process.env.ONEDRIVE || '';
    if (onedriveBusiness) {
      desktopPaths.push(path.join(onedriveBusiness, 'Desktop'));
    }

    for (const desktopPath of desktopPaths) {
      try {
        if (fs.existsSync(desktopPath) && fs.statSync(desktopPath).isDirectory()) {
          return desktopPath;
        }
      } catch {
        continue;
      }
    }

    return path.join(homeDir, 'Desktop');
  } catch (error) {
    console.error('Error getting Desktop path:', error);
    return null;
  }
};

export const detectChampionsFolder = async () => {
  if (!window.require) return null;

  try {
    const path = window.require('path');
    const fs = window.require('fs');
    const commonPaths = [];

    commonPaths.push(path.join('C:\\', 'Riot Games', 'League of Legends', 'Game', 'DATA', 'FINAL', 'Champions'));
    commonPaths.push(path.join('C:\\', 'Program Files', 'Riot Games', 'League of Legends', 'Game', 'DATA', 'FINAL', 'Champions'));
    commonPaths.push(path.join('C:\\', 'Program Files (x86)', 'Riot Games', 'League of Legends', 'Game', 'DATA', 'FINAL', 'Champions'));
    commonPaths.push(path.join('C:\\', 'Apps', 'Riot Games', 'League of Legends', 'Game', 'DATA', 'FINAL', 'Champions'));

    const drives = ['C:', 'D:', 'E:', 'F:', 'G:', 'H:'];
    for (const drive of drives) {
      commonPaths.push(path.join(drive, 'Riot Games', 'League of Legends', 'Game', 'DATA', 'FINAL', 'Champions'));
      commonPaths.push(path.join(drive, 'Apps', 'Riot Games', 'League of Legends', 'Game', 'DATA', 'FINAL', 'Champions'));
      commonPaths.push(path.join(drive, 'Riot Games', 'League of Legends', 'Game', 'Champions'));
      commonPaths.push(path.join(drive, 'Riot Games', 'League of Legends', 'DATA', 'FINAL', 'Champions'));
      commonPaths.push(path.join(drive, 'Apps', 'Riot Games', 'League of Legends', 'Game', 'Champions'));
      commonPaths.push(path.join(drive, 'Apps', 'Riot Games', 'League of Legends', 'DATA', 'FINAL', 'Champions'));
    }

    for (const testPath of commonPaths) {
      try {
        if (!fs.existsSync(testPath)) continue;
        const files = fs.readdirSync(testPath);
        const hasChampionFolders = files.some(file => {
          try {
            return fs.statSync(path.join(testPath, file)).isDirectory();
          } catch {
            return false;
          }
        });

        if (hasChampionFolders) return testPath;

        if (files.length > 0) {
          const hasGameFiles = files.some(f => {
            const ext = path.extname(f).toLowerCase();
            return ext === '.wad' || ext === '.bin' || ext === '.tex';
          });
          if (hasGameFiles) return testPath;
        }

        if (testPath.toLowerCase().includes('champions') && testPath.toLowerCase().includes('league of legends')) {
          return testPath;
        }
      } catch {
        continue;
      }
    }

    for (const drive of drives) {
      const leagueRoots = [
        path.join(drive, 'Riot Games', 'League of Legends'),
        path.join(drive, 'Program Files', 'Riot Games', 'League of Legends'),
        path.join(drive, 'Program Files (x86)', 'Riot Games', 'League of Legends'),
        path.join(drive, 'Apps', 'Riot Games', 'League of Legends'),
      ];

      for (const root of leagueRoots) {
        try {
          if (!fs.existsSync(root)) continue;
          const possibleChampionsPaths = [
            path.join(root, 'Game', 'DATA', 'FINAL', 'Champions'),
            path.join(root, 'Game', 'Champions'),
            path.join(root, 'DATA', 'FINAL', 'Champions'),
            path.join(root, 'Champions'),
          ];
          for (const championsPath of possibleChampionsPaths) {
            try {
              if (!fs.existsSync(championsPath)) continue;
              const files = fs.readdirSync(championsPath);
              const hasChampionFolders = files.some(file => {
                try {
                  return fs.statSync(path.join(championsPath, file)).isDirectory();
                } catch {
                  return false;
                }
              });
              if (hasChampionFolders) return championsPath;
            } catch {
              continue;
            }
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error detecting Champions folder:', error);
    return null;
  }
};

export const getHashDirectory = async () => {
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    const hashDirResult = await ipcRenderer.invoke('hashes:get-directory');
    return hashDirResult.hashDir || '';
  }
  return 'AppData\\Roaming\\FrogTools\\hashes (Integrated)';
};

export const checkHashStatus = async () => {
  if (!window.require) return null;
  try {
    const { ipcRenderer } = window.require('electron');
    return await ipcRenderer.invoke('hashes:check');
  } catch (error) {
    console.error('Error checking hashes:', error);
    return null;
  }
};

export const loadFrogSettings = async (prefs) => {
  await prefs.initPromise;

  const hashPath = await getHashDirectory();

  let leaguePath = prefs.obj.FrogChangerLeaguePath || '';
  if (!leaguePath && window.require) {
    const detectedPath = await detectChampionsFolder();
    if (detectedPath) {
      leaguePath = detectedPath;
      prefs.obj.FrogChangerLeaguePath = detectedPath;
      await prefs.save();
    }
  }

  let extractionPath = prefs.obj.FrogChangerExtractionPath || '';
  if (!extractionPath && window.require) {
    const desktopPath = getUserDesktopPath();
    if (desktopPath) {
      extractionPath = desktopPath;
      prefs.obj.FrogChangerExtractionPath = desktopPath;
      await prefs.save();
    }
  }

  const extractVoiceover = prefs.obj.FrogChangerExtractVoiceover !== undefined
    ? prefs.obj.FrogChangerExtractVoiceover
    : false;
  const preserveHudIcons2D = prefs.obj.FrogChangerPreserveHudIcons2D !== false;
  const warmHashCache = prefs.obj.FrogChangerWarmHashCache === true;

  const hashStatus = await checkHashStatus();

  return {
    hashPath,
    leaguePath,
    extractionPath,
    extractVoiceover,
    preserveHudIcons2D,
    warmHashCache,
    hashStatus,
  };
};

export const validateFrogSetup = async ({ leaguePath, extractionPath, setHashStatus }) => {
  const issues = [];
  if (!leaguePath || (typeof leaguePath === 'string' && leaguePath.trim() === '')) {
    issues.push('leaguePath');
  }
  if (!extractionPath || (typeof extractionPath === 'string' && extractionPath.trim() === '')) {
    issues.push('extractionPath');
  }

  const status = await checkHashStatus();
  if (status && setHashStatus) {
    setHashStatus((prev) => {
      try {
        if (prev && JSON.stringify(prev) === JSON.stringify(status)) {
          return prev;
        }
      } catch {
        // Fallback: if compare fails, allow update.
      }
      return status;
    });
  }
  if (status && (!status.allPresent || (status.missing && status.missing.length > 0))) {
    issues.push('hashes');
  }

  return { isValid: issues.length === 0, issues };
};
