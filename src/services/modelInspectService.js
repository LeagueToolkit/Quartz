export const prepareModelInspectAssets = async ({
  championName,
  skinId,
  chromaId = null,
  skinName,
  leaguePath,
  hashPath,
  onProgress,
}) => {
  if (!window.electronAPI?.modelInspect?.prepareSkinAssets) {
    throw new Error('Model Inspect IPC bridge not available');
  }

  const listener = (_, payload) => {
    onProgress?.(payload?.message || '');
  };

  window.electronAPI.modelInspect.onProgress(listener);
  try {
    const result = await window.electronAPI.modelInspect.prepareSkinAssets({
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
    window.electronAPI.modelInspect.offProgress(listener);
  }
};
