import { useCallback, useMemo, useState } from 'react';
import githubApi from '../services/githubApi.js';
import { parseIndividualVFXSystems } from '../../../utils/vfx/vfxSystemParser.js';
import { prepareAssetsForUpload } from '../../../utils/vfx/vfxAssetManager.js';

const defaultMetadata = {
  name: '',
  description: '',
  category: 'auras',
};

export default function useVfxUpload({
  targetSystems,
  targetPath,
  targetPyContent,
  setStatusMessage,
  setIsProcessing,
  setProcessingText,
  loadVFXCollections,
  findProjectRoot,
}) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedDonorSystems, setSelectedDonorSystems] = useState(new Set());
  const [selectedTargetSystems, setSelectedTargetSystems] = useState(new Set());
  const [selectedTargetCollection, setSelectedTargetCollection] = useState('auravfx.py');
  const [uploadMetadata, setUploadMetadata] = useState(defaultMetadata);
  const [uploadAssets, setUploadAssets] = useState([]);
  const [uploadPreparation, setUploadPreparation] = useState(null);

  const targetSystemEntries = useMemo(
    () => Object.entries(targetSystems || {}),
    [targetSystems]
  );

  const resetUploadState = useCallback(() => {
    setSelectedDonorSystems(new Set());
    setSelectedTargetSystems(new Set());
    setUploadMetadata(defaultMetadata);
    setUploadAssets([]);
    setUploadPreparation(null);
  }, []);

  const handleUploadToVFXHub = useCallback(() => {
    if (!targetSystems || Object.keys(targetSystems).length === 0) {
      setStatusMessage('No VFX systems loaded to upload - Please open a target bin file first');
      return;
    }
    resetUploadState();
    setShowUploadModal(true);
    setStatusMessage('Upload VFX systems from target bin to VFX Hub');
  }, [resetUploadState, setStatusMessage, targetSystems]);

  const handleCloseUploadModal = useCallback(() => {
    setShowUploadModal(false);
    setStatusMessage('Upload modal closed');
  }, [setStatusMessage]);

  const handleDonorSystemSelection = useCallback((systemKey, isSelected) => {
    setSelectedDonorSystems((previous) => {
      const next = new Set(previous);
      if (isSelected) next.add(systemKey);
      else next.delete(systemKey);
      return next;
    });
  }, []);

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
      const projectPath =
        targetPath && typeof findProjectRoot === 'function'
          ? (findProjectRoot(window.require('path').dirname(targetPath)) || '')
          : '';

      const completeVFXSystems = parseIndividualVFXSystems(targetPyContent || '');
      const completeSystem = completeVFXSystems.find(
        (entry) => entry.name === system.key || entry.name === system.name
      );

      const systemContent =
        completeSystem?.fullContent || system.rawContent || system.content || '';
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

      if (preparation.allAssets.length === 0) {
        setStatusMessage(`Upload prepared: No assets detected for ${uploadMetadata.name}`);
      } else {
        setStatusMessage(
          `Upload prepared: ${preparation.existingAssets.length} assets found, ${preparation.missingAssets.length} missing`
        );
      }
    } catch (error) {
      setStatusMessage(`Error preparing upload: ${error.message}`);
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
      return;
    }

    try {
      setIsProcessing(true);
      setProcessingText('Uploading...');
      setStatusMessage('Uploading VFX system to GitHub...');

      const metadata = {
        name: uploadMetadata.name,
        description: uploadMetadata.description,
        category: uploadMetadata.category,
        emitters: uploadPreparation.originalSystem.emitterCount || 0,
      };

      const result = await githubApi.uploadVFXSystem(
        uploadPreparation,
        selectedTargetCollection,
        uploadPreparation.allAssets,
        metadata
      );

      if (result.success) {
        setStatusMessage(
          `Upload successful! Uploaded ${result.uploadedAssets}/${result.totalAssets} assets to VFX Hub`
        );
        setTimeout(() => {
          setShowUploadModal(false);
          if (typeof loadVFXCollections === 'function') {
            loadVFXCollections();
          }
        }, 2000);
      } else {
        setStatusMessage('Upload completed with some issues - check console for details');
      }
    } catch (error) {
      setStatusMessage(`Upload failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  }, [
    loadVFXCollections,
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
    setShowUploadModal,
    selectedDonorSystems,
    selectedTargetSystems,
    selectedTargetCollection,
    setSelectedTargetCollection,
    uploadMetadata,
    setUploadMetadata,
    uploadAssets,
    uploadPreparation,
    targetSystemEntries,
    handleUploadToVFXHub,
    handleCloseUploadModal,
    handleDonorSystemSelection,
    handleTargetSystemSelection,
    prepareUpload,
    executeUpload,
    resetUploadState,
  };
}
