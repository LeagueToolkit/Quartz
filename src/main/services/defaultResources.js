function createDefaultResourcesService({ app, fs, path, processRef, baseDir, logToFile }) {
  function ensureRitobinCli() {
    try {
      const appDataPath = processRef.env.APPDATA ||
        (processRef.platform === 'darwin'
          ? path.join(processRef.env.HOME, 'Library', 'Application Support')
          : processRef.platform === 'linux'
            ? path.join(processRef.env.HOME, '.local', 'share')
            : path.join(processRef.env.HOME, 'AppData', 'Roaming'));

      const frogToolsDir = path.join(appDataPath, 'FrogTools');
      const ritobinDestPath = path.join(frogToolsDir, 'ritobin_cli.exe');

      if (fs.existsSync(ritobinDestPath)) {
        logToFile('ritobin_cli.exe already exists in FrogTools', 'INFO');
        return;
      }

      const ritobinSrcPath = app.isPackaged
        ? path.join(processRef.resourcesPath, 'ritobin_cli.exe')
        : path.join(baseDir, 'tools', 'ritobin_cli.exe');

      if (!fs.existsSync(frogToolsDir)) {
        fs.mkdirSync(frogToolsDir, { recursive: true });
      }

      if (fs.existsSync(ritobinSrcPath)) {
        fs.copyFileSync(ritobinSrcPath, ritobinDestPath);
        logToFile(`Copied ritobin_cli.exe to FrogTools: ${ritobinDestPath}`, 'INFO');
      } else {
        logToFile(`ritobin_cli.exe not found at ${ritobinSrcPath}, skipping copy`, 'WARN');
      }
    } catch (error) {
      logToFile(`Error ensuring ritobin_cli.exe: ${error.message}`, 'ERROR');
    }
  }

  function ensureDefaultAssets() {
    try {
      const userDataPath = app.getPath('userData');
      const assetsDestDir = path.join(userDataPath, 'assets');

      const assetsSrcDir = app.isPackaged
        ? path.join(processRef.resourcesPath, 'assets')
        : path.join(baseDir, 'public');

      if (!fs.existsSync(assetsDestDir)) {
        fs.mkdirSync(assetsDestDir, { recursive: true });
      }

      const defaultAssets = [
        { src: 'celestia.webp', dest: 'celestia.webp' },
        { src: 'your-logo.gif', dest: 'navbar.gif' },
      ];

      if (!fs.existsSync(assetsSrcDir)) {
        logToFile(`Assets source directory not found at ${assetsSrcDir}, skipping asset copy`, 'WARN');
        return;
      }

      let copiedCount = 0;
      for (const asset of defaultAssets) {
        const srcPath = path.join(assetsSrcDir, asset.src);
        const destPath = path.join(assetsDestDir, asset.dest);

        if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
          try {
            fs.copyFileSync(srcPath, destPath);
            copiedCount++;
            logToFile(`Copied default asset: ${asset.src} -> ${asset.dest} to ${destPath}`, 'INFO');
          } catch (error) {
            logToFile(`Error copying asset ${asset.src}: ${error.message}`, 'WARN');
          }
        }
      }

      if (copiedCount > 0) {
        logToFile(`Copied ${copiedCount} default asset(s) to AppData/Roaming/Quartz/assets`, 'INFO');
      } else {
        logToFile('Default assets already exist or not found, skipping copy', 'INFO');
      }
    } catch (error) {
      logToFile(`Error ensuring default assets: ${error.message}`, 'ERROR');
    }
  }

  function ensureDefaultCursors() {
    try {
      const userDataPath = app.getPath('userData');
      const cursorsDestDir = path.join(userDataPath, 'cursors');

      const cursorsSrcDir = app.isPackaged
        ? path.join(processRef.resourcesPath, 'cursors')
        : path.join(baseDir, 'public', 'cursors');

      if (!fs.existsSync(cursorsDestDir)) {
        fs.mkdirSync(cursorsDestDir, { recursive: true });
      }

      if (!fs.existsSync(cursorsSrcDir)) return;

      const files = fs.readdirSync(cursorsSrcDir);
      for (const file of files) {
        const srcPath = path.join(cursorsSrcDir, file);
        const destPath = path.join(cursorsDestDir, file);
        if (!fs.existsSync(destPath)) {
          try {
            fs.copyFileSync(srcPath, destPath);
            logToFile(`Copied default cursor: ${file}`, 'INFO');
          } catch (error) {
            logToFile(`Error copying cursor ${file}: ${error.message}`, 'WARN');
          }
        }
      }
    } catch (error) {
      logToFile(`Error ensuring default cursors: ${error.message}`, 'ERROR');
    }
  }

  return {
    ensureRitobinCli,
    ensureDefaultAssets,
    ensureDefaultCursors,
  };
}

module.exports = { createDefaultResourcesService };

