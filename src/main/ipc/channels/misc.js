function registerMiscChannels({
  ipcMain,
  app,
  fs,
  path,
  processRef,
  shell,
  getUpdateVersionInfo,
}) {
  const getFontsDir = () => {
    return path.join(app.getPath('userData'), 'fonts');
  };


  ipcMain.handle('file:open-folder', async (_event, folderPath) => {
    try {
      if (!folderPath) {
        return { success: false, error: 'Path is empty' };
      }

      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const stats = fs.statSync(folderPath);
      if (stats.isFile()) {
        shell.showItemInFolder(folderPath);
      } else {
        await shell.openPath(folderPath);
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Open folder error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('update:get-version', async () => {
    try {
      return getUpdateVersionInfo();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('fonts:list-files', async () => {
    try {
      const fontsDir = getFontsDir();
      if (!fs.existsSync(fontsDir)) {
        fs.mkdirSync(fontsDir, { recursive: true });
      }
      const files = fs.readdirSync(fontsDir)
        .filter((file) => /\.(ttf|otf|woff|woff2)$/i.test(file));
      return { success: true, fontsDir, files };
    } catch (error) {
      return { success: false, error: error.message, files: [] };
    }
  });

  ipcMain.handle('fonts:read-file-base64', async (_event, fileName) => {
    try {
      const fontsDir = getFontsDir();
      if (!fs.existsSync(fontsDir)) {
        return { success: false, error: 'Fonts directory does not exist' };
      }

      const safeName = String(fileName || '').replace(/[\\/]+/g, '');
      if (!safeName) {
        return { success: false, error: 'Invalid file name' };
      }

      const fullPath = path.resolve(fontsDir, safeName);
      const normalizedDir = path.resolve(fontsDir).toLowerCase();
      const normalizedFile = fullPath.toLowerCase();
      if (!normalizedFile.startsWith(normalizedDir + path.sep)) {
        return { success: false, error: 'Path traversal blocked' };
      }

      if (!fs.existsSync(fullPath)) {
        return { success: false, error: 'Font file not found' };
      }

      const data = fs.readFileSync(fullPath).toString('base64');
      return { success: true, base64: data, fileName: safeName };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerMiscChannels,
};
