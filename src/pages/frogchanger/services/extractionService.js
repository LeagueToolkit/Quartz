import { unpackWAD } from '../utils/wad/index.js';
import { loadHashtables } from '../../../jsritofile/index.js';
import { findChampionWadFiles, getChampionFileName } from './operationsService.js';

export const extractSkinWadBundle = async ({
  championName,
  skinId,
  skinName = null,
  chromaId = null,
  leaguePath,
  extractionPath,
  hashPath,
  extractVoiceover,
  onProgress,
}) => {
  const championFileName = getChampionFileName(championName);
  const wadFileName = `${championFileName}.wad.client`;
  const wadFilePath = `${leaguePath}\\${wadFileName}`;
  const voiceoverWadFiles = await findChampionWadFiles(championName, leaguePath);

  const skinNameSafe = skinName ? skinName.replace(/[^a-zA-Z0-9]/g, '_') : skinId;
  const outputDir = chromaId
    ? `${extractionPath}\\${championFileName}_extracted_${skinNameSafe}_chroma_${chromaId}`
    : `${extractionPath}\\${championFileName}_extracted_${skinNameSafe}`;

  onProgress?.('Reading WAD files...');

  let hashtables = null;
  try {
    if (hashPath && window.require) {
      const fs = window.require('fs');
      try {
        await fs.promises.access(hashPath);
        try {
          hashtables = await loadHashtables(hashPath, {
            tables: ['hashes.game.txt', 'hashes.lcu.txt'],
          });
        } catch (hashError) {
          console.warn('Failed to load hashtables, continuing without them:', hashError.message);
        }
      } catch (_) {
        // Hashtable path missing; continue without hashtables.
      }
    }

    if (window.require) {
      const fs = window.require('fs');
      await fs.promises.access(wadFilePath);
    }

    let lastProgressUpdate = 0;
    const progressCallback = (count, message) => {
      const now = Date.now();
      if (message && (now - lastProgressUpdate > 500 || message.includes('Complete') || message.includes('Starting'))) {
        lastProgressUpdate = now;
        onProgress?.(message);
      }
    };

    onProgress?.('Extracting WAD file...');
    const normalResult = await unpackWAD(wadFilePath, outputDir, hashtables, null, progressCallback);
    onProgress?.(`Extracted ${normalResult.extractedCount} files successfully!`);

    let successfulVoiceoverExtractions = 0;
    let failedVoiceoverExtractions = 0;
    let finalMessage = `Extracted ${normalResult.extractedCount} files successfully!`;

    if (voiceoverWadFiles.length > 0 && extractVoiceover) {
      onProgress?.(`Normal WAD extracted, extracting ${voiceoverWadFiles.length} voiceover WAD(s)...`);

      for (const voiceoverWadFileName of voiceoverWadFiles) {
        const voiceoverWadFilePath = `${leaguePath}\\${voiceoverWadFileName}`;
        try {
          await unpackWAD(voiceoverWadFilePath, outputDir, hashtables, null, progressCallback);
          successfulVoiceoverExtractions++;
        } catch (_) {
          failedVoiceoverExtractions++;
        }
      }

      if (successfulVoiceoverExtractions > 0 && failedVoiceoverExtractions === 0) {
        finalMessage = `Normal WAD + ${successfulVoiceoverExtractions} voiceover WAD(s) extracted successfully!`;
      } else if (successfulVoiceoverExtractions > 0) {
        finalMessage = `Normal WAD + ${successfulVoiceoverExtractions}/${voiceoverWadFiles.length} voiceover WAD(s) extracted`;
      } else {
        finalMessage = 'Normal WAD extracted, voiceover WADs failed';
      }
    } else if (voiceoverWadFiles.length > 0 && !extractVoiceover) {
      finalMessage = 'Normal WAD extracted successfully! (Voiceover extraction disabled)';
    } else {
      finalMessage = 'Normal WAD extracted successfully!';
    }

    onProgress?.(finalMessage);

    return {
      championFileName,
      wadFilePath,
      outputDir,
      normalResult,
      voiceoverWadFiles,
      successfulVoiceoverExtractions,
      failedVoiceoverExtractions,
      finalMessage,
    };
  } finally {
    // Release local reference; keep shared cache warm while user stays on FrogChanger page.
    hashtables = null;
  }
};
