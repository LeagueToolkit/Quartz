function registerPrefsChannels({ ipcMain, loadPrefs, savePrefs }) {
  ipcMain.handle('prefs:get', async (_event, key) => {
    const prefs = loadPrefs();
    return prefs[key];
  });

  ipcMain.handle('prefs:set', async (_event, key, value) => {
    const prefs = loadPrefs();
    prefs[key] = value;
    savePrefs(prefs);
    return true;
  });

  ipcMain.handle('prefs:getAll', async () => {
    return loadPrefs();
  });

  ipcMain.handle('prefs:reset', async () => {
    savePrefs({});
    return true;
  });
}

module.exports = {
  registerPrefsChannels,
};
