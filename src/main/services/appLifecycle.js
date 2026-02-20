function registerAppLifecycleHandlers({
  app,
  BrowserWindow,
  dialog,
  processRef,
  createWindow,
  clearTextureCacheOnQuit,
  cleanupMeiFolders,
  clearSavedBinPaths,
  getQuitState,
  setQuitState,
}) {
  app.on('window-all-closed', async () => {
    clearTextureCacheOnQuit();
    cleanupMeiFolders();

    if (processRef.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', async (e) => {
    clearTextureCacheOnQuit();

    try {
      const quitState = getQuitState();
      if (quitState.isQuitting || quitState.isShuttingDown) {
        return;
      }

      const wins = BrowserWindow.getAllWindows();
      const win = wins && wins.length ? wins[0] : null;
      if (!win) {
        setQuitState({ isQuitting: true, isShuttingDown: true });
        clearTextureCacheOnQuit();
        cleanupMeiFolders();
        clearSavedBinPaths();
        return;
      }

      let hasUnsaved = false;
      try {
        hasUnsaved = await win.webContents.executeJavaScript('Boolean(window.__DL_unsavedBin)');
      } catch (_) {}

      if (!hasUnsaved) {
        setQuitState({ isQuitting: true, isShuttingDown: true });
        try { await win.webContents.executeJavaScript('window.__DL_forceClose = true;'); } catch (_) {}
        clearTextureCacheOnQuit();
        cleanupMeiFolders();
        clearSavedBinPaths();
        return;
      }

      e.preventDefault();
      const result = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Exit Without Saving', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Unsaved Changes',
        message: 'You have unsaved BIN changes. Exit without saving?',
        noLink: true,
      });

      if (result.response === 0) {
        setQuitState({ isQuitting: true, isShuttingDown: true });
        try { await win.webContents.executeJavaScript('window.__DL_forceClose = true;'); } catch (_) {}
        clearTextureCacheOnQuit();
        cleanupMeiFolders();
        clearSavedBinPaths();
        const w = win;
        try { w?.destroy?.(); } catch (_) {}
        app.quit();
      }
    } catch (_err) {
      setQuitState({ isQuitting: true, isShuttingDown: true });
      clearTextureCacheOnQuit();
      cleanupMeiFolders();
      clearSavedBinPaths();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

module.exports = { registerAppLifecycleHandlers };

