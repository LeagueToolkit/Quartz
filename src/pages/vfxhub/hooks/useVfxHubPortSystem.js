import { useCallback } from 'react';
import { parseVfxEmitters } from '../../../utils/vfx/vfxEmitterParser.js';
import { insertVFXSystemIntoFile } from '../../../utils/vfx/vfxInsertSystem.js';
import { findAssetFiles, copyAssetFiles } from '../../../utils/assets/assetCopier.js';

export default function useVfxHubPortSystem({
  donorSystems,
  setDonorSystems,
  setStatusMessage,
  targetPyContent,
  donorPyContent,
  hasResourceResolver,
  setTargetPyContent,
  setFileSaved,
  targetSystems,
  setTargetSystems,
  download,
  donorPath,
  targetPath,
}) {
  const portVFXSystemToTarget = useCallback(async (donorSystemKey) => {
    try {
      if (!donorSystems[donorSystemKey]) {
        setStatusMessage('Donor system not found');
        return;
      }

      const donorSystem = donorSystems[donorSystemKey];
      setStatusMessage(`Porting VFX system: ${donorSystem.name}`);
      const prevTargetKeys = new Set(Object.keys(targetSystems || {}));

      setDonorSystems(prev => ({
        ...prev,
        [donorSystemKey]: {
          ...prev[donorSystemKey],
          ported: true,
          portedAt: Date.now(),
        },
      }));

      if (targetPyContent && donorPyContent) {
        if (!hasResourceResolver) {
          setStatusMessage('Locked: target bin missing ResourceResolver');
          return;
        }
        try {
          const { extractVFXSystem } = await import('../../../utils/vfx/vfxSystemParser.js');
          const extractedSystem = extractVFXSystem(donorPyContent, donorSystem.name);

          if (extractedSystem && extractedSystem.fullContent) {
            const updatedContent = insertVFXSystemIntoFile(targetPyContent, extractedSystem.fullContent, donorSystem.name);
            setTargetPyContent(updatedContent);
            try { setFileSaved(false); } catch { }

            try {
              const systems = parseVfxEmitters(updatedContent);
              const nowTs = Date.now();
              const entries = Object.entries(systems).map(([key, sys]) => (
                !prevTargetKeys.has(key)
                  ? [key, { ...sys, ported: true, portedAt: nowTs }]
                  : [key, sys]
              ));
              const newEntries = entries.filter(([key]) => !prevTargetKeys.has(key));
              const oldEntries = entries.filter(([key]) => prevTargetKeys.has(key));
              const ordered = Object.fromEntries([...newEntries, ...oldEntries]);
              setTargetSystems(ordered);
            } catch {
              setTargetSystems(targetSystems);
            }

            setStatusMessage(`Ported complete VFX system "${donorSystem.name}" with all emitters and ResourceResolver entry`);
          } else {
            const { addToResourceResolver } = await import('../../../utils/vfx/vfxSystemParser.js');
            const updatedContent = addToResourceResolver(targetPyContent, donorSystem.name);
            setTargetPyContent(updatedContent);
            try { setFileSaved(false); } catch { }
            setStatusMessage(`Ported system "${donorSystem.name}" and added to ResourceResolver (could not extract full system)`);
          }
        } catch (insertError) {
          setStatusMessage(`Failed to insert VFX system "${donorSystem.name}": ${insertError.message}`);
        }
      } else if (targetPyContent) {
        if (!hasResourceResolver) {
          setStatusMessage('Locked: target bin missing ResourceResolver');
          return;
        }
        try {
          const { addToResourceResolver } = await import('../../../utils/vfx/vfxSystemParser.js');
          const updatedContent = addToResourceResolver(targetPyContent, donorSystem.name);
          setTargetPyContent(updatedContent);
          try { setFileSaved(false); } catch { }
          setStatusMessage(`Ported system "${donorSystem.name}" and added to ResourceResolver (no donor content available)`);
        } catch {
          setStatusMessage(`Ported system "${donorSystem.name}" but failed to update ResourceResolver`);
        }
      } else {
        setStatusMessage(`Ported system "${donorSystem.name}" (no target file to update)`);
      }

      try {
        let assetMessage = '';
        if (donorSystem.assets && donorSystem.assets.length > 0) {
          setStatusMessage(`Copying ${donorSystem.assets.length} downloaded assets for "${donorSystem.name}"...`);
          try {
            const copiedAssets = await download.downloadAndCopyAssets(donorSystem.assets, donorSystem.name);
            assetMessage = ` and copied ${copiedAssets.length} assets`;
          } catch {
            assetMessage = ' (asset copy failed)';
          }
        } else {
          const assetFiles = findAssetFiles(donorSystem);
          if (assetFiles.length > 0 && donorPath !== 'VFX Hub - GitHub Collections') {
            const { copiedFiles, skippedFiles } = copyAssetFiles(donorPath, targetPath, assetFiles);
            if (copiedFiles.length > 0 || skippedFiles.length > 0) {
              const actionText = copiedFiles.length > 0 ? `copied ${copiedFiles.length}` : '';
              const skipText = skippedFiles.length > 0 ? `skipped ${skippedFiles.length}` : '';
              const combinedText = [actionText, skipText].filter(Boolean).join(', ');
              assetMessage = ` and ${combinedText} asset files`;
            } else {
              assetMessage = ' but no assets were copied';
            }
          } else {
            assetMessage = ' (no assets to copy)';
          }
        }
        setStatusMessage(`Ported system "${donorSystem.name}"${assetMessage}`);
      } catch {
        setStatusMessage(`Ported system "${donorSystem.name}" but failed to copy some assets`);
      }
    } catch (error) {
      setStatusMessage(`Error porting system: ${error.message}`);
    }
  }, [
    donorSystems,
    setDonorSystems,
    setStatusMessage,
    targetPyContent,
    donorPyContent,
    hasResourceResolver,
    setTargetPyContent,
    setFileSaved,
    targetSystems,
    setTargetSystems,
    download,
    donorPath,
    targetPath,
  ]);

  return { portVFXSystemToTarget };
}
