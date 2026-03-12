import { useCallback } from 'react';
import { parseVfxEmitters } from '../../../utils/vfx/vfxEmitterParser.js';
import { findProjectRoot } from '../utils/assetDetection.js';
import localHubService from '../services/localHubService.js';

const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

export default function useLocalVfxDownload({
  targetPath,
  setStatusMessage,
  setIsProcessing,
  setProcessingText,
  setDonorSystems,
  setDonorPyContent,
  setDonorPath,
  setShowDownloadModal,
}) {
  const downloadAndCopyAssets = useCallback(async (assets, systemName) => {
    if (!targetPath) throw new Error('No target file loaded - cannot copy assets');
    if (!fs || !path) throw new Error('File system APIs are unavailable');

    const projectRoot = findProjectRoot(path.dirname(targetPath));
    if (!projectRoot) {
      throw new Error('Could not find a valid project root (folder containing data)');
    }

    const assetsDir = path.join(projectRoot, 'assets');
    const vfxhubDir = path.join(assetsDir, 'vfxhub');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    if (!fs.existsSync(vfxhubDir)) fs.mkdirSync(vfxhubDir, { recursive: true });

    const copiedAssets = [];
    for (const asset of assets || []) {
      try {
        const sourcePath = asset.localPath || asset.path;
        const fileName = asset.name || (sourcePath ? path.basename(sourcePath) : '');
        if (!sourcePath || !fileName || !fs.existsSync(sourcePath)) continue;
        const outputPath = path.join(vfxhubDir, fileName);
        await fs.promises.copyFile(sourcePath, outputPath);
        copiedAssets.push({ originalName: fileName, path: outputPath });
      } catch (error) {
        console.error(`Failed to copy local asset ${asset?.name || 'unknown'} for ${systemName}:`, error);
      }
    }

    return { copiedAssets, skippedAssets: [] };
  }, [targetPath]);

  const downloadVFXSystem = useCallback(async (system) => {
    try {
      setIsProcessing(true);
      setProcessingText('Loading...');
      setStatusMessage(`Loading local VFX system: ${system.displayName || system.name}...`);

      const { pythonContent, assets } = await localHubService.downloadVFXSystem(
        system.name,
        system.collection
      );
      const parsedSystems = parseVfxEmitters(pythonContent);
      const downloadedAt = Date.now();
      const enriched = Object.fromEntries(
        Object.entries(parsedSystems || {}).map(([key, value]) => [
          key,
          {
            ...value,
            downloaded: true,
            downloadedAt,
            collection: system.collection,
            local: true,
            assets: Array.isArray(assets) ? assets : [],
          },
        ])
      );

      let copiedAssetsCount = 0;
      let skippedAssetsCount = 0;
      if (Array.isArray(assets) && assets.length > 0) {
        try {
          const result = await downloadAndCopyAssets(assets, system.name);
          copiedAssetsCount = result.copiedAssets.length;
          skippedAssetsCount = result.skippedAssets.length;
        } catch (assetError) {
          console.warn('Local asset copy failed:', assetError?.message || assetError);
        }
      }

      setDonorSystems(enriched);
      setDonorPyContent(pythonContent);
      setDonorPath(`Local Hub: ${system.displayName || system.name}`);
      setStatusMessage(
        `Local VFX loaded: ${Object.keys(enriched).length} systems available for porting (${copiedAssetsCount} copied, ${skippedAssetsCount} unchanged)`
      );
      if (typeof setShowDownloadModal === 'function') {
        setShowDownloadModal(false);
      }
    } catch (error) {
      setStatusMessage(`Error loading local VFX system: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  }, [
    setDonorPath,
    setDonorPyContent,
    setDonorSystems,
    setIsProcessing,
    setProcessingText,
    setShowDownloadModal,
    setStatusMessage,
    downloadAndCopyAssets,
  ]);

  return {
    findProjectRoot,
    downloadAndCopyAssets,
    downloadVFXSystem,
  };
}
