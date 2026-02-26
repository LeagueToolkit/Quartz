function getSenderWindow(BrowserWindow, sender) {
  let window = BrowserWindow.fromWebContents(sender);
  if (!window) {
    window = BrowserWindow.getFocusedWindow();
  }
  return window;
}

function registerDialogChannels({
  ipcMain,
  BrowserWindow,
  dialog,
  shell,
  getUpscaleInstallDir,
  logToFile,
}) {
  ipcMain.handle('dialog:openFile', async (event, options) => {
    try {
      const window = getSenderWindow(BrowserWindow, event.sender);
      const result = await dialog.showOpenDialog(window, {
        title: options?.title || 'Open File',
        properties: options?.properties || ['openFile'],
        filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
        ...(options?.defaultPath ? { defaultPath: options.defaultPath } : {}),
      });
      return result;
    } catch (error) {
      console.error('Error opening file dialog:', error);
      return { canceled: true, error: error.message };
    }
  });

  ipcMain.handle('dialog:saveFile', async (event, options) => {
    try {
      const window = getSenderWindow(BrowserWindow, event.sender);
      const result = await dialog.showSaveDialog(window, {
        title: options?.title || 'Save File',
        defaultPath: options?.defaultPath,
        filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
      });
      return result;
    } catch (error) {
      console.error('Error opening save dialog:', error);
      return { canceled: true, error: error.message };
    }
  });

  ipcMain.handle('dialog:openDirectory', async (event, options) => {
    try {
      const window = getSenderWindow(BrowserWindow, event.sender);
      const result = await dialog.showOpenDialog(window, {
        title: options?.title || 'Select Folder',
        properties: options?.properties || ['openDirectory'],
      });
      return result;
    } catch (error) {
      console.error('Error opening directory dialog:', error);
      return { canceled: true, error: error.message };
    }
  });

  ipcMain.handle('openExternal', async (_event, url) => {
    try {
      console.log('Opening external URL:', url);
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Error opening external URL:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('openInstallDirectory', async () => {
    try {
      const installDir = getUpscaleInstallDir();
      console.log('Opening installation directory:', installDir);
      await shell.openPath(installDir);
      return { success: true, path: installDir };
    } catch (error) {
      console.error('Error opening installation directory:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dialog:openFiles', async (event, options) => {
    try {
      const window = getSenderWindow(BrowserWindow, event.sender);
      const result = await dialog.showOpenDialog(window, {
        properties: ['openFile', 'multiSelections'],
        filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
      });
      return result;
    } catch (error) {
      console.error('Error opening files dialog:', error);
      return { canceled: true, error: error.message };
    }
  });

  ipcMain.handle('dialog:openRitobinExe', async (event) => {
    try {
      const window = getSenderWindow(BrowserWindow, event.sender);
      const result = await dialog.showOpenDialog(window || undefined, {
        title: 'Select ritobin_cli.exe',
        properties: ['openFile'],
        filters: [{ name: 'Executable', extensions: ['exe'] }],
      });
      return result;
    } catch (error) {
      console.error('Error opening ritobin exe dialog:', error);
      logToFile(`Error opening ritobin exe dialog: ${error.message}`, 'ERROR');
      return { canceled: true, error: error.message };
    }
  });

  // Keep legacy sync channel unchanged for compatibility; migrate callers later.
  ipcMain.on('FileSelect', (event, [title, fileType]) => {
    const filters = fileType === 'Bin'
      ? [{ name: 'Bin Files', extensions: ['bin'] }]
      : [{ name: 'All Files', extensions: ['*'] }];
    const window = getSenderWindow(BrowserWindow, event.sender);

    dialog.showOpenDialog(window, {
      title: title || 'Select File',
      properties: ['openFile'],
      filters,
    }).then((result) => {
      event.returnValue = result.canceled ? '' : result.filePaths[0];
    }).catch((error) => {
      console.error('File selection error:', error);
      event.returnValue = '';
    });
  });
}

module.exports = {
  registerDialogChannels,
};
