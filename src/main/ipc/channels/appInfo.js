function registerAppInfoChannels({
  ipcMain,
  app,
  shell,
  path,
  processRef,
  LOG_DIR,
  LOG_FILE,
  logToFile,
}) {
  ipcMain.handle('get-log-file-path', () => {
    return LOG_FILE;
  });

  ipcMain.handle('log-texture-conversion', async (_event, { level, message, data }) => {
    try {
      const logMessage = `[TEXTURE-${level.toUpperCase()}] ${message}`;
      if (data) {
        logToFile(`${logMessage} - Data: ${JSON.stringify(data)}`, level.toUpperCase());
      } else {
        logToFile(logMessage, level.toUpperCase());
      }
      return { success: true };
    } catch (error) {
      logToFile(`Failed to log texture message: ${error.message}`, 'ERROR');
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-user-data-path', () => {
    return app.getPath('userData');
  });

  ipcMain.handle('getAppPath', () => {
    return app.getAppPath();
  });

  ipcMain.handle('getResourcesPath', () => {
    if (app.isPackaged) {
      return processRef.resourcesPath;
    }
    return path.join(app.getAppPath(), 'public');
  });

  ipcMain.handle('getCursorsPath', () => {
    return path.join(app.getPath('userData'), 'cursors');
  });

  ipcMain.handle('open-log-folder', async () => {
    try {
      await shell.openPath(LOG_DIR);
      return { success: true, path: LOG_DIR };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });


}

module.exports = {
  registerAppInfoChannels,
};
