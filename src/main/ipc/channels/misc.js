function registerMiscChannels({
  ipcMain,
  fs,
  path,
  processRef,
  shell,
  getUpdateVersionInfo,
}) {


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
