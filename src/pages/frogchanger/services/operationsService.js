import { BumpathCore } from '../../../utils/bumpath/index.js';

const ICONS2D_RELATIVE_PATTERN = /^assets\/characters\/[^/]+\/hud\/icons2d(\/|$)/i;

const toPosixRel = (value) => String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');

const isPreservedIcons2DPath = (relativePath) => ICONS2D_RELATIVE_PATTERN.test(toPosixRel(relativePath));

const copyPreservedHudIcons2D = async (sourceDir, targetDir) => {
  if (!window.require) return 0;
  const fs = window.require('fs');
  const path = window.require('path');

  if (!sourceDir || !targetDir || !fs.existsSync(sourceDir)) return 0;

  let copied = 0;

  const walk = async (absDir, relDir = '') => {
    const entries = await fs.promises.readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryRel = relDir ? path.join(relDir, entry.name) : entry.name;
      const entryAbs = path.join(absDir, entry.name);

      if (entry.isDirectory()) {
        await walk(entryAbs, entryRel);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!isPreservedIcons2DPath(entryRel)) continue;

      const outAbs = path.join(targetDir, entryRel);
      await fs.promises.mkdir(path.dirname(outAbs), { recursive: true });
      await fs.promises.copyFile(entryAbs, outAbs);
      copied++;
    }
  };

  await walk(sourceDir);
  return copied;
};

export const getChampionFileName = (championName) => {
  const specialCases = {
    wukong: 'monkeyking',
    monkeyking: 'monkeyking',
    'nunu & willump': 'nunu',
    nunu: 'nunu',
  };

  const lowerName = championName.toLowerCase();
  if (specialCases[lowerName]) {
    return specialCases[lowerName];
  }

  return lowerName.replace(/['"\s]/g, '');
};

export const findChampionWadFiles = async (championName, leaguePath) => {
  if (window.require) {
    try {
      const fs = window.require('fs');
      // P1-11: async readdir — was readdirSync which blocked the renderer
      const files = await fs.promises.readdir(leaguePath);
      const championFileName = getChampionFileName(championName);

      return files.filter(file => {
        const lowerCaseFile = file.toLowerCase();
        return lowerCaseFile.startsWith(championFileName) &&
          lowerCaseFile.endsWith('.wad.client') &&
          lowerCaseFile !== `${championFileName}.wad.client` &&
          (file.charAt(championFileName.length) === '.' || file.charAt(championFileName.length) === '_');
      });
    } catch (error) {
      console.warn('Could not scan for voiceover WAD files:', error);
      return [];
    }
  }

  const commonLanguages = ['en_US', 'en_GB', 'de_DE', 'es_ES', 'fr_FR'];
  return commonLanguages.map(lang => `${championName}.${lang}.wad.client`);
};

const buildBinSelections = (bumInstance, selectedSkinIds) => {
  const binSelections = {};
  for (const unifyFile in bumInstance.sourceBins) {
    binSelections[unifyFile] = false;
  }

  let selectedCount = 0;
  for (const unifyFile in bumInstance.sourceBins) {
    const fileInfo = bumInstance.sourceFiles[unifyFile];
    if (!fileInfo || !fileInfo.relPath.toLowerCase().endsWith('.bin')) {
      continue;
    }

    const relPath = fileInfo.relPath.toLowerCase();
    if (!relPath.includes('skin')) {
      continue;
    }

    const skinMatch = relPath.match(/\/skins\/skin(\d+)\.bin/);
    if (!skinMatch) {
      continue;
    }

    const skinId = parseInt(skinMatch[1], 10);
    if (selectedSkinIds.includes(skinId)) {
      binSelections[unifyFile] = true;
      selectedCount++;
    }
  }

  return { binSelections, selectedCount };
};

const runSingleBumpathPass = async ({
  sourceDir,
  outputDir,
  skinIdsForPass,
  hashPath,
  customPrefix,
  ignoreMissing,
  combineLinked,
  progressCallback,
  preserveHudIcons2D = true,
  skipSfxRepath = true,
}) => {
  const bumInstance = new BumpathCore();
  bumInstance.skipSfxRepath = skipSfxRepath;
  await bumInstance.addSourceDirs([sourceDir]);

  const { binSelections } = buildBinSelections(bumInstance, skinIdsForPass);
  bumInstance.updateBinSelection(binSelections);

  await bumInstance.scan(hashPath);

  if (customPrefix !== 'bum') {
    const allEntryHashes = Object.keys(bumInstance.entryPrefix).filter(hash => hash !== 'All_BINs');
    bumInstance.applyPrefix(allEntryHashes, customPrefix);
  }

  await bumInstance.process(outputDir, ignoreMissing, combineLinked, progressCallback);
  if (preserveHudIcons2D) {
    const copied = await copyPreservedHudIcons2D(sourceDir, outputDir);
    if (copied > 0) {
      console.log(`[Bumpath] Preserved ${copied} icons2d file(s) from source`);
    }
  }
};

export const runBumpathRepath = async ({
  sourceDir,
  outputDir,
  selectedSkinIds,
  hashPath,
  prefix = 'bum',
  processTogether = false,
  preserveHudIcons2D = true,
  skipSfxRepath = true,
}) => {
  try {
    if (window.require) {
      const fs = window.require('fs');
      if (!fs.existsSync(sourceDir)) {
        return { success: false, error: `Source directory not found: ${sourceDir}` };
      }
    }

    const ignoreMissing = true;
    const combineLinked = true;
    const customPrefix = prefix;

    let lastProgress = 0;
    const progressCallback = (count, message) => {
      if (count > lastProgress + 10 || message) {
        lastProgress = count;
        console.log(`[Bumpath Progress] ${message || `Processed ${count} files...`}`);
      }
    };

    if (processTogether) {
      await runSingleBumpathPass({
        sourceDir,
        outputDir,
        skinIdsForPass: selectedSkinIds,
        hashPath,
        customPrefix,
        ignoreMissing,
        combineLinked,
        progressCallback,
        preserveHudIcons2D,
        skipSfxRepath,
      });

      return {
        success: true,
        message: `Processed ${selectedSkinIds.length} skins together`,
      };
    }

    const results = [];
    for (const skinId of selectedSkinIds) {
      await runSingleBumpathPass({
        sourceDir,
        outputDir,
        skinIdsForPass: [skinId],
        hashPath,
        customPrefix,
        ignoreMissing,
        combineLinked,
        progressCallback,
        preserveHudIcons2D,
        skipSfxRepath,
      });
      results.push({ skinId, success: true });
    }

    return {
      success: true,
      message: `Processed ${selectedSkinIds.length} skins individually`,
      results,
    };
  } catch (error) {
    console.error('Bumpath repath error:', error);
    return { success: false, error: error.message, stack: error.stack };
  }
};
