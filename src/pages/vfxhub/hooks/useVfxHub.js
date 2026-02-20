import { useState } from 'react';
import useGitHubCollections from './useGitHubCollections';
import useVfxDownload from './useVfxDownload';
import useVfxUpload from './useVfxUpload';

export default function useVfxHub() {
  const [targetPath, setTargetPath] = useState('This will show target bin');
  const [donorPath, setDonorPath] = useState('VFX Hub - GitHub Collections');
  const [targetSystems, setTargetSystems] = useState({});
  const [donorSystems, setDonorSystems] = useState({});
  const [targetPyContent, setTargetPyContent] = useState('');
  const [donorPyContent, setDonorPyContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState('');
  const [statusMessage, setStatusMessage] = useState(
    'Ready - Open target bin and browse VFX Hub'
  );

  const collections = useGitHubCollections({
    setStatusMessage,
    isProcessing,
  });

  const download = useVfxDownload({
    targetPath,
    donorSystems,
    setStatusMessage,
    setIsProcessing,
    setProcessingText,
    setDonorSystems,
    setDonorPyContent,
    setDonorPath,
    setShowDownloadModal: collections.setShowDownloadModal,
  });

  const upload = useVfxUpload({
    targetSystems,
    targetPath,
    targetPyContent,
    setStatusMessage,
    setIsProcessing,
    setProcessingText,
    loadVFXCollections: collections.loadVFXCollections,
    findProjectRoot: download.findProjectRoot,
  });

  return {
    targetPath,
    setTargetPath,
    donorPath,
    setDonorPath,
    targetSystems,
    setTargetSystems,
    donorSystems,
    setDonorSystems,
    targetPyContent,
    setTargetPyContent,
    donorPyContent,
    setDonorPyContent,
    isProcessing,
    setIsProcessing,
    processingText,
    setProcessingText,
    statusMessage,
    setStatusMessage,
    collections,
    download,
    upload,
  };
}
