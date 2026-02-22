/**
 * Extraction service
 *
 * P0-5: All fs operations moved to the main process via IPC (wad:extractBundle).
 *       No window.require('fs') calls remain here.
 * P1-13: Path construction (path.join, backslash literals) now done in main process.
 */

export const extractSkinWadBundle = async ({
  championName,
  skinId,
  skinName = null,
  chromaId = null,
  leaguePath,
  extractionPath,
  hashPath,
  extractVoiceover,
  cleanAfterExtract = false,
  onProgress,
}) => {
  if (!window.electronAPI?.wad?.extractBundle) {
    throw new Error('WAD IPC bridge not available — check preload.js.');
  }

  onProgress?.('Reading WAD files...');

  // Register progress listener before invoking so no early events are missed.
  const progressListener = (_, { message }) => {
    onProgress?.(message);
  };
  window.electronAPI.wad.onProgress(progressListener);

  try {
    const result = await window.electronAPI.wad.extractBundle({
      championName,
      skinId,
      skinName,
      chromaId,
      leaguePath,
      extractionPath,
      hashPath,
      extractVoiceover,
      cleanAfterExtract,
    });

    if (result.error) {
      throw new Error(result.error);
    }

    onProgress?.(result.finalMessage);
    return result;
  } finally {
    window.electronAPI.wad.offProgress(progressListener);
  }
};
