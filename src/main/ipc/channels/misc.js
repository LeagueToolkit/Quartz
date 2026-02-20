function registerMiscChannels({
  ipcMain,
  fs,
  path,
  processRef,
  shell,
  getUpdateVersionInfo,
}) {
  ipcMain.handle('ritobin:get-default-path', async () => {
    try {
      const appDataPath = processRef.env.APPDATA ||
        (processRef.platform === 'darwin'
          ? path.join(processRef.env.HOME, 'Library', 'Application Support')
          : processRef.platform === 'linux'
            ? path.join(processRef.env.HOME, '.local', 'share')
            : path.join(processRef.env.HOME, 'AppData', 'Roaming'));

      const ritobinPath = path.join(appDataPath, 'FrogTools', 'ritobin_cli.exe');
      const exists = fs.existsSync(ritobinPath);

      return {
        path: ritobinPath,
        exists,
        isDefault: true,
      };
    } catch (error) {
      console.error('❌ Get default ritobin path error:', error);
      return { path: '', exists: false, error: error.message };
    }
  });

  ipcMain.handle('file:open-folder', async (_event, folderPath) => {
    try {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return { success: false, error: 'Path does not exist' };
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
}

module.exports = {
  registerMiscChannels,
};
