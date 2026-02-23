export const prepareModelInspectAssets = async ({
  championName,
  skinId,
  chromaId = null,
  skinName,
  leaguePath,
  hashPath,
  onProgress,
}) => {
  const getBridge = () => {
    if (window.electronAPI?.modelInspect?.prepareSkinAssets) {
      return window.electronAPI.modelInspect;
    }

    // Fallback for cases where preload bridge is unavailable in packaged builds.
    if (typeof window.require === 'function') {
      try {
        const { ipcRenderer } = window.require('electron');
        return {
          prepareSkinAssets: (params) => ipcRenderer.invoke('modelInspect:prepareSkinAssets', params),
          onProgress: (callback) => ipcRenderer.on('modelInspect:progress', callback),
          offProgress: (callback) => ipcRenderer.removeListener('modelInspect:progress', callback),
        };
      } catch (_) {
        // no-op
      }
    }

    return null;
  };

  const bridge = getBridge();
  if (!bridge?.prepareSkinAssets) {
    throw new Error('Model Inspect IPC bridge not available');
  }

  const listener = (_, payload) => {
    onProgress?.(payload?.message || '');
  };

  bridge.onProgress(listener);
  try {
    const result = await bridge.prepareSkinAssets({
      championName,
      skinId,
      chromaId,
      skinName,
      leaguePath,
      hashPath,
    });

    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  } finally {
    bridge.offProgress(listener);
  }
};
