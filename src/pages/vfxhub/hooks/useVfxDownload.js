import { useCallback } from 'react';
import githubApi from '../services/githubApi.js';
import { parseVfxEmitters, loadEmitterData } from '../../../utils/vfx/vfxEmitterParser.js';
import { parseIndividualVFXSystems } from '../../../utils/vfx/vfxSystemParser.js';
import { findProjectRoot } from '../utils/assetDetection.js';

const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

const formatRateLimitMessage = (error) => {
  const resetTime = error.headers?.['x-ratelimit-reset'] || Date.now() + 3600000;
  const minutesUntilReset = Math.ceil((resetTime * 1000 - Date.now()) / 60000);
  return `GitHub rate limit exceeded. Please authenticate in Settings or wait ${minutesUntilReset} minutes.`;
};

export default function useVfxDownload({
  targetPath,
  donorSystems,
  setStatusMessage,
  setIsProcessing,
  setProcessingText,
  setDonorSystems,
  setDonorPyContent,
  setDonorPath,
  setShowDownloadModal,
}) {
  const downloadAndCopyAssets = useCallback(
    async (assets, systemName) => {
      if (!targetPath) throw new Error('No target file loaded - cannot copy assets');
      if (!fs || !path) throw new Error('File system APIs are unavailable');

      const projectRoot = findProjectRoot(path.dirname(targetPath));
      if (!projectRoot) {
        throw new Error('Could not find a valid project root (folder containing data). Open a target bin inside your mod project.');
      }
      const assetsDir = path.join(projectRoot, 'assets');
      const vfxhubDir = path.join(assetsDir, 'vfxhub');

      if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
      if (!fs.existsSync(vfxhubDir)) fs.mkdirSync(vfxhubDir, { recursive: true });

      const copiedAssets = [];
      for (const asset of assets) {
        try {
          let assetBuffer;
          try {
            assetBuffer = await githubApi.getRawBinaryFile(asset.path);
          } catch (apiError) {
            const response = await fetch(asset.downloadUrl);
            if (!response.ok) continue;
            const arrayBuffer = await response.arrayBuffer();
            assetBuffer = Buffer.from(arrayBuffer);
          }

          const outputPath = path.join(vfxhubDir, asset.name);
          fs.writeFileSync(outputPath, assetBuffer);

          copiedAssets.push({
            originalName: asset.name,
            path: outputPath,
            size: assetBuffer.length,
          });
        } catch (error) {
          console.error(`Failed to copy asset ${asset?.name || 'unknown'} for ${systemName}:`, error);
        }
      }

      return copiedAssets;
    },
    [targetPath]
  );

  const downloadVFXSystem = useCallback(
    async (system) => {
      try {
        setIsProcessing(true);
        setProcessingText('Downloading...');
        setStatusMessage(`Downloading VFX system: ${system.displayName || system.name}...`);

        const { assets, pythonContent } = await githubApi.downloadVFXSystem(
          system.name,
          `vfx collection/${system.collection}`
        );

        setStatusMessage('Parsing VFX system...');
        const parsedSystems = parseVfxEmitters(pythonContent);
        const downloadedAt = Date.now();
        // Preserve GitHub asset metadata on downloaded donor entries so
        // emitter-level port actions can copy assets later too.
        const enrichedSystems = Object.fromEntries(
          Object.entries(parsedSystems || {}).map(([key, value]) => [
            key,
            {
              ...value,
              downloaded: true,
              downloadedAt,
              assets: Array.isArray(assets) ? assets : [],
              collection: system.collection,
            },
          ])
        );
        setDonorSystems(enrichedSystems);
        setDonorPyContent(pythonContent);
        setDonorPath(`VFX Hub: ${system.displayName || system.name}`);

        if (Array.isArray(assets) && assets.length > 0) {
          setStatusMessage(`Downloading ${assets.length} associated assets...`);
          try {
            const copiedAssets = await downloadAndCopyAssets(assets, system.name);
            setStatusMessage(`Downloaded ${copiedAssets.length} assets for ${system.name}`);
          } catch (assetError) {
            setStatusMessage('Downloaded VFX system but failed to download assets');
          }
        }

        setStatusMessage(
          `VFX system loaded: ${Object.keys(enrichedSystems).length} systems available for porting`
        );
        if (typeof setShowDownloadModal === 'function') {
          setShowDownloadModal(false);
        }
      } catch (error) {
        if (
          /rate\s*limit/i.test(error.message) ||
          /429/.test(error.message) ||
          error.status === 429
        ) {
          setStatusMessage(formatRateLimitMessage(error));
        } else {
          setStatusMessage(`Error downloading VFX system: ${error.message}`);
        }
      } finally {
        setIsProcessing(false);
        setProcessingText('');
      }
    },
    [
      downloadAndCopyAssets,
      setDonorPath,
      setDonorPyContent,
      setDonorSystems,
      setIsProcessing,
      setProcessingText,
      setShowDownloadModal,
      setStatusMessage,
    ]
  );

  const handleDownloadVFXSystem = useCallback(
    async (system) => {
      try {
        setIsProcessing(true);
        setProcessingText('Downloading...');
        setStatusMessage(`Downloading VFX system: ${system.name}...`);

        const downloadedSystem = await githubApi.downloadVFXSystem(system.name, system.file);
        if (!downloadedSystem || !downloadedSystem.system) {
          setStatusMessage(`Error: No system data received for ${system.name}`);
          return;
        }

        const parsedSystems = parseIndividualVFXSystems(downloadedSystem.pythonContent);
        const parsedSystem = parsedSystems.find((entry) => entry.name === system.name);
        if (!parsedSystem) {
          setStatusMessage(`Error: Could not parse downloaded system ${system.name}`);
          return;
        }

        let assetMessage = '';
        if (Array.isArray(downloadedSystem.assets) && downloadedSystem.assets.length > 0) {
          setStatusMessage(
            `Downloading ${downloadedSystem.assets.length} assets for ${system.name}...`
          );
          try {
            const copiedAssets = await downloadAndCopyAssets(downloadedSystem.assets, system.name);
            assetMessage = ` and copied ${copiedAssets.length} assets`;
          } catch (assetError) {
            assetMessage = ' (asset copy failed)';
          }
        }

        const fullEmitters = [];
        if (Array.isArray(parsedSystem.emitters) && parsedSystem.emitters.length > 0) {
          parsedSystem.emitters.forEach((emitter) => {
            const fullData = loadEmitterData(
              { rawContent: downloadedSystem.pythonContent, name: system.name },
              emitter.name
            );
            fullEmitters.push(fullData || emitter);
          });
        }

        const nextDonorSystems = { ...donorSystems };
        const systemKey = `${system.name}_downloaded_${Date.now()}`;
        nextDonorSystems[systemKey] = {
          key: systemKey,
          name: system.name,
          content: downloadedSystem.pythonContent,
          emitters: fullEmitters,
          rawContent: downloadedSystem.pythonContent,
          downloaded: true,
          downloadedAt: Date.now(),
          collection: system.collection,
          category: system.category,
          assets: downloadedSystem.assets || [],
        };

        setDonorSystems(nextDonorSystems);
        setStatusMessage(`Downloaded ${system.name}${assetMessage} - now available in donor list`);
      } catch (error) {
        if (
          /rate\s*limit/i.test(error.message) ||
          /429/.test(error.message) ||
          error.status === 429
        ) {
          setStatusMessage(formatRateLimitMessage(error));
        } else {
          setStatusMessage(`Error downloading ${system.name}: ${error.message}`);
        }
      } finally {
        setIsProcessing(false);
        setProcessingText('');
      }
    },
    [
      donorSystems,
      downloadAndCopyAssets,
      setDonorSystems,
      setIsProcessing,
      setProcessingText,
      setStatusMessage,
    ]
  );

  return {
    findProjectRoot,
    downloadAndCopyAssets,
    downloadVFXSystem,
    handleDownloadVFXSystem,
  };
}
