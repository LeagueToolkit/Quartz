const { ipcRenderer } = require('electron');

// contextIsolation is false in this app — direct window assignment works.
// If contextIsolation is ever enabled, switch to contextBridge.exposeInMainWorld.
window.electronAPI = {

  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
  },

  wad: {
    /**
     * Extract a full champion WAD bundle (main + optional voiceover WADs).
     * All fs operations run in the main process — no window.require('fs') in renderer.
     * Progress events arrive via wad.onProgress(); unsubscribe with wad.offProgress().
     *
     * @param {Object} params
     * @returns {Promise<Object>} result
     */
    extractBundle: (params) => ipcRenderer.invoke('wad:extractBundle', params),

    /**
     * Subscribe to live progress events pushed from the main process.
     * Callback receives (event, { count: number, message: string }).
     * Keep the reference — you need it to call offProgress().
     */
    onProgress: (callback) => ipcRenderer.on('wad:progress', callback),

    /**
     * Unsubscribe a specific progress callback.
     */
    offProgress: (callback) => ipcRenderer.removeListener('wad:progress', callback),
  },

  hashtable: {
    /**
     * Eagerly load hash tables into main-process cache.
     */
    warmCache: (hashPath, options = {}) => ipcRenderer.invoke('hashtable:warmCache', { hashPath, ...options }),
    onWarmProgress: (callback) => ipcRenderer.on('hashtable:warmProgress', callback),
    offWarmProgress: (callback) => ipcRenderer.removeListener('hashtable:warmProgress', callback),
    setKeepAlive: (enabled) => ipcRenderer.invoke('hashtable:setKeepAlive', enabled),
    /**
     * Clear the main-process hashtables cache immediately.
     * Call this when the user navigates away from a page that triggered extractions.
     */
    clearCache: () => ipcRenderer.invoke('hashtable:clearCache'),
  },

  modelInspect: {
    prepareSkinAssets: (params) => ipcRenderer.invoke('modelInspect:prepareSkinAssets', params),
    onProgress: (callback) => ipcRenderer.on('modelInspect:progress', callback),
    offProgress: (callback) => ipcRenderer.removeListener('modelInspect:progress', callback),
  },

};
