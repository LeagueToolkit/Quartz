function createMainWindowService({
  app,
  BrowserWindow,
  dialog,
  path,
  isDev,
  processRef,
  baseDir,
  setUpdateWindow,
  clearSavedBinPaths,
  getQuitState,
  setQuitState,
}) {
  function createWindow() {
    let mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      icon: path.join(baseDir, 'public', 'divinelab.ico'),
      frame: false,
      titleBarStyle: 'hidden',
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: false,
        preload: path.join(baseDir, 'preload.js'),
      },
    });

    if (processRef.platform === 'win32') {
      mainWindow.setMenuBarVisibility(false);
    }

    setUpdateWindow(mainWindow);

    mainWindow.on('maximize', () => {
      mainWindow.webContents.send('window:maximized');
    });
    mainWindow.on('unmaximize', () => {
      mainWindow.webContents.send('window:unmaximized');
    });

    mainWindow.webContents.on('did-finish-load', () => {
      // CLI handling is done by main process bootstrap service.
    });

    const isDevelopment = isDev && !app.isPackaged;
    if (isDevelopment) {
      const devPort = processRef.env.PORT || '3000';
      const devUrl = processRef.env.ELECTRON_START_URL || `http://localhost:${devPort}`;

      const tryLoad = () => {
        mainWindow.loadURL(devUrl).catch(() => {
          setTimeout(tryLoad, 1000);
        });
      };

      mainWindow.webContents.on('did-fail-load', () => {
        setTimeout(() => {
          tryLoad();
        }, 1000);
      });

      tryLoad();
      mainWindow.webContents.openDevTools();
    } else {
      mainWindow.loadFile(path.join(baseDir, 'build', 'index.html'));
      mainWindow.webContents.on('devtools-opened', () => mainWindow.webContents.closeDevTools());
      try { mainWindow.removeMenu(); } catch (_) {}
    }

    mainWindow.on('close', async (e) => {
      try {
        const quitState = getQuitState();
        if (quitState.isQuitting || quitState.isShuttingDown) {
          return;
        }

        e.preventDefault();

        const stateAfterPrevent = getQuitState();
        if (stateAfterPrevent.isShuttingDown) {
          return;
        }

        let hasUnsaved = false;
        try {
          hasUnsaved = await mainWindow.webContents.executeJavaScript('Boolean(window.__DL_unsavedBin)');
        } catch (_) {}

        if (hasUnsaved) {
          const result = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            buttons: ['Exit Without Saving', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
            title: 'Unsaved Changes',
            message: 'You have unsaved BIN changes. Exit without saving?',
            noLink: true,
          });

          if (result.response !== 0) {
            return;
          }
        }

        setQuitState({ isQuitting: true, isShuttingDown: true });

        try {
          await mainWindow.webContents.executeJavaScript('window.__DL_forceClose = true;');
          mainWindow.webContents.send('app:closing');
        } catch (_) {}

        await new Promise((resolve) => setTimeout(resolve, 500));
        clearSavedBinPaths();

        try { mainWindow.destroy(); } catch (_) {}
        app.quit();
      } catch (_) {
        setQuitState({ isQuitting: true, isShuttingDown: true });
        try { mainWindow.destroy(); } catch (_) {}
        app.quit();
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    try {
      mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    } catch (_) {}

    mainWindow.webContents.on('will-navigate', (event, url) => {
      const isFile = typeof url === 'string' && url.startsWith('file://');
      if (!isFile) {
        event.preventDefault();
      }
    });
  }

  return { createWindow };
}

module.exports = { createMainWindowService };

