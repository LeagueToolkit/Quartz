import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseIndividualVFXSystems } from '../../../utils/vfx/vfxSystemParser.js';
import { prepareAssetsForUpload } from '../../../utils/vfx/vfxAssetManager.js';
import localHubService from '../services/localHubService.js';

const defaultMetadata = {
  name: '',
  description: '',
  category: 'auras',
};

export default function useLocalVfxUpload({
  targetSystems,
  targetPath,
  targetPyContent,
  setStatusMessage,
  setIsProcessing,
  setProcessingText,
  loadLocalCollections,
  findProjectRoot,
  collectionFiles = [],
}) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedTargetSystems, setSelectedTargetSystems] = useState(new Set());
  const [selectedTargetCollection, setSelectedTargetCollection] = useState('');
  const [uploadMetadata, setUploadMetadata] = useState(defaultMetadata);
  const [uploadAssets, setUploadAssets] = useState([]);
  const [uploadPreparation, setUploadPreparation] = useState(null);

  const targetSystemEntries = useMemo(
    () => Object.entries(targetSystems || {}),
    [targetSystems]
  );

  const collectionOptions = useMemo(
    () =>
      Array.from(new Set(collectionFiles || []))
        .filter((value) => String(value || '').toLowerCase().endsWith('.py'))
        .map((value) => ({ value, label: value.replace(/\.py$/i, '') })),
    [collectionFiles]
  );
  const categoryOptions = useMemo(
    () =>
      collectionOptions.map((option) => ({
        value: String(option.value || '').replace(/\.py$/i, '').toLowerCase(),
        label: option.label,
      })),
    [collectionOptions]
  );

  const hasCollectionOption = useMemo(
    () => collectionOptions.some((option) => option.value === selectedTargetCollection),
    [collectionOptions, selectedTargetCollection]
  );

  // Keep selected collection valid when local files change.
  // If nothing exists locally yet, leave it empty.
  useEffect(() => {
    if (hasCollectionOption) return;
    const first = collectionOptions[0]?.value || '';
    setSelectedTargetCollection(first);
  }, [collectionOptions, hasCollectionOption]);

  const resetUploadState = useCallback(() => {
    setSelectedTargetSystems(new Set());
    setUploadMetadata(defaultMetadata);
    setUploadAssets([]);
    setUploadPreparation(null);
  }, []);

  const handleUploadToLocalHub = useCallback(() => {
    resetUploadState();
    setShowUploadModal(true);
    if (!targetSystems || Object.keys(targetSystems).length === 0) {
      setStatusMessage('No VFX systems loaded yet - open a target bin to prepare local upload');
    } else {
      setStatusMessage('Upload VFX systems from target bin to Local Hub');
    }
  }, [resetUploadState, setStatusMessage, targetSystems]);

  const handleCloseUploadModal = useCallback(() => {
    setShowUploadModal(false);
    setStatusMessage('Local upload modal closed');
  }, [setStatusMessage]);

  const handleTargetSystemSelection = useCallback((systemKey, isSelected) => {
    setSelectedTargetSystems((previous) => {
      const next = new Set(previous);
      if (isSelected) next.add(systemKey);
      else next.delete(systemKey);
      return next;
    });
  }, []);

  const prepareUpload = useCallback(async () => {
    if (selectedTargetSystems.size === 0) {
      setStatusMessage('Please select at least one VFX system to upload');
      return;
    }
    if (!uploadMetadata.name.trim()) {
      setStatusMessage('Please enter a name for the VFX effect');
      return;
    }

    try {
      setIsProcessing(true);
      setProcessingText('Analyzing VFX...');
      setStatusMessage('Analyzing VFX systems and detecting assets...');

      const systemsToUpload = Array.from(selectedTargetSystems)
        .map((key) => targetSystems[key])
        .filter(Boolean);
      if (systemsToUpload.length !== 1) {
        setStatusMessage('Multiple system upload not yet implemented');
        return;
      }

      const system = systemsToUpload[0];
      let projectPath = '';
      if (targetPath && window.require) {
        const path = window.require('path');
        const targetDir = path.dirname(targetPath);
        projectPath = typeof findProjectRoot === 'function'
          ? findProjectRoot(targetDir) || targetDir
          : targetDir;
      }

      const completeVFXSystems = parseIndividualVFXSystems(targetPyContent || '');
      const completeSystem = completeVFXSystems.find(
        (entry) => entry.name === system.key || entry.name === system.name
      );
      const systemContent = completeSystem?.fullContent || system.rawContent || system.content || '';
      if (!systemContent || !systemContent.trim()) {
        throw new Error(`No valid content found for VFX system "${system.key || system.name}"`);
      }

      const preparation = await prepareAssetsForUpload(
        {
          name: system.key || system.name,
          fullContent: systemContent,
          emitterCount: system.emitters?.length || completeSystem?.emitterCount || 0,
        },
        uploadMetadata.name,
        projectPath
      );
      setUploadPreparation(preparation);
      setUploadAssets(preparation.allAssets);
      setStatusMessage(
        preparation.allAssets.length === 0
          ? `Local upload prepared: No assets detected for ${uploadMetadata.name}`
          : `Local upload prepared: ${preparation.existingAssets.length} assets found, ${preparation.missingAssets.length} missing`
      );
    } catch (error) {
      setStatusMessage(`Error preparing local upload: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  }, [
    findProjectRoot,
    selectedTargetSystems,
    setIsProcessing,
    setProcessingText,
    setStatusMessage,
    targetPath,
    targetPyContent,
    targetSystems,
    uploadMetadata.name,
  ]);

  const executeUpload = useCallback(async () => {
    if (!uploadPreparation) {
      setStatusMessage('No upload preparation found');
      return false;
    }
    try {
      setIsProcessing(true);
      setProcessingText('Uploading...');
      setStatusMessage('Uploading VFX system to Local Hub...');
      const metadata = {
        name: uploadMetadata.name,
        description: uploadMetadata.description,
        category: uploadMetadata.category,
        emitters: uploadPreparation.originalSystem.emitterCount || 0,
      };
      const result = await localHubService.uploadVFXSystem(
        uploadPreparation,
        selectedTargetCollection,
        uploadPreparation.allAssets,
        metadata
      );
      if (result.success) {
        setStatusMessage(
          `Local upload successful! Saved ${result.uploadedAssets}/${result.totalAssets} assets`
        );
        if (typeof loadLocalCollections === 'function') {
          await loadLocalCollections();
        }
        setTimeout(() => setShowUploadModal(false), 400);
        return true;
      }
      setStatusMessage('Local upload completed with issues');
      return false;
    } catch (error) {
      setStatusMessage(`Local upload failed: ${error.message}`);
      return false;
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  }, [
    loadLocalCollections,
    selectedTargetCollection,
    setIsProcessing,
    setProcessingText,
    setStatusMessage,
    uploadMetadata.category,
    uploadMetadata.description,
    uploadMetadata.name,
    uploadPreparation,
  ]);

  return {
    showUploadModal,
    selectedTargetSystems,
    selectedTargetCollection,
    setSelectedTargetCollection,
    uploadMetadata,
    setUploadMetadata,
    uploadAssets,
    uploadPreparation,
    targetSystemEntries,
    collectionOptions,
    categoryOptions,
    handleUploadToLocalHub,
    handleCloseUploadModal,
    handleTargetSystemSelection,
    prepareUpload,
    executeUpload,
  };
}
