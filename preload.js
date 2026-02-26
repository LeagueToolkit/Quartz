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

    /** Scan a directory for all .wad.client files, grouped by type. */
    scanAll: (params) => ipcRenderer.invoke('wad:scanAll', params),

    /** Parse WAD TOC and return a hierarchical file tree (no extraction). */
    mountTree: (params) => ipcRenderer.invoke('wad:mountTree', params),

    /** Batch-load compact path indexes for many WADs (cross-WAD search). */
    loadAllIndexes: (params) => ipcRenderer.invoke('wad:loadAllIndexes', params),

    /** Read/decompress one chunk payload by chunk id. */
    readChunkData: (params) => ipcRenderer.invoke('wad:readChunkData', params),

    /** Extract selected file entries (native rust backend). */
    extractSelected: (params) => ipcRenderer.invoke('wad:extractSelected', params),

    /** Parse already-extracted BIN files for accurate material→texture hints. */
    parseSknBins: (params) => ipcRenderer.invoke('wad:parseSknBins', params),

    /** Scan BIN/SKN chunks in a WAD for embedded paths; writes hashes.extracted.txt. */
    extractHashes: (params) => ipcRenderer.invoke('wad:extractHashes', params),

    /** Read a .bin chunk from a WAD and return ritobin text (fake-python format). */
    readBinAsText: (params) => ipcRenderer.invoke('wad:readBinAsText', params),
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
    primeWad: (hashPath) => ipcRenderer.invoke('hashtable:primeWad', { hashPath }),
  },

  modelInspect: {
    prepareSkinAssets: (params) => ipcRenderer.invoke('modelInspect:prepareSkinAssets', params),
    onProgress: (callback) => ipcRenderer.on('modelInspect:progress', callback),
    offProgress: (callback) => ipcRenderer.removeListener('modelInspect:progress', callback),
  },



};
