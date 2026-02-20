export {
  parseVfxEmitters,
  loadEmitterData,
  loadEmitterDataFromAllSystems,
  loadMultipleEmitterData,
  cleanSystemName,
  parseEmittersInVfxSystem,
  parseVfxEmitter,
  generateEmitterPython,
  generateColorPython,
  generateVector3Python,
  replaceEmittersInSystem,
  generateModifiedPythonFromSystems,
  findAllTexturesInContent
} from './vfxEmitterParser.js';
export {
  cleanMalformedEntries,
  parseIndividualVFXSystems,
  parseCompleteVFXSystems,
  extractResourceResolverEntries,
  parseEmitterInContext,
  extractAssetReferences,
  parseSystemMetadata,
  parsePreHeaderMetadata,
  validateBrackets,
  getShortSystemName,
  extractVFXSystem,
  updateVFXSystemNames,
  addToResourceResolver,
  createMetadataHeader
} from './vfxSystemParser.js';
export { indexVfxSystems } from './vfxIndexParser.js';
export { insertVFXSystemIntoFile, generateUniqueSystemName, insertVFXSystemWithPreservedNames } from './vfxInsertSystem.js';
export { cleanVfxSystemContent, cleanAllVfxSystems } from './vfxContentCleaner.js';
export { default as vfxAssetManager } from './vfxAssetManager.js';
export {
  detectVFXSystemAssets,
  renameAssetsForVFXHub,
  generateVFXHubAssetPath,
  generateVFXHubAssetFilename,
  updateAssetPathsInVFXSystem,
  findAssetsForVFXSystem,
  getAssetType,
  getFilenameFromPath,
  getExtensionFromPath,
  resolveAssetPath,
  checkAssetExists,
  copyAsset,
  prepareAssetsForUpload,
  validateAssetForUpload
} from './vfxAssetManager.js';

export * from './mutations/index.js';
