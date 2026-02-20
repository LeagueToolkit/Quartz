function createPrefsStore({ fs, path, getUserDataPath }) {
  const prefsPath = path.join(getUserDataPath(), 'preferences.json');

  const loadPrefs = () => {
    try {
      if (fs.existsSync(prefsPath)) {
        const data = fs.readFileSync(prefsPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
    return {};
  };

  const savePrefs = (prefs) => {
    try {
      fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  };

  const clearSavedBinPaths = () => {
    try {
      const prefs = loadPrefs();
      // Clear all saved bin paths (shared and individual)
      prefs.SharedLastBinPath = '';
      prefs.PaintLastBinPath = '';
      prefs.PortLastTargetBinPath = '';
      prefs.PortLastDonorBinPath = '';
      prefs.VFXHubLastBinPath = '';
      savePrefs(prefs);
      console.log('🧹 Cleared saved bin paths on app quit');
    } catch (error) {
      console.error('Error clearing saved bin paths:', error);
    }
  };

  return {
    prefsPath,
    loadPrefs,
    savePrefs,
    clearSavedBinPaths,
  };
}

module.exports = {
  createPrefsStore,
};
