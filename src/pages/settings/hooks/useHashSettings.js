import { useState, useCallback } from 'react';

const useHashSettings = () => {
  const [hashDirectory, setHashDirectory] = useState('');
  const [hashStatus, setHashStatus] = useState(null);
  const [downloadingHashes, setDownloadingHashes] = useState(false);

  const handleDownloadHashes = useCallback(async () => {
    setDownloadingHashes(true);
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('hashes:download');

        if (result.success) {
          const statusResult = await ipcRenderer.invoke('hashes:check');
          setHashStatus(statusResult);

          try {
            const { clearHashtablesCache } = await import('../../../jsritofile/index.js');
            clearHashtablesCache();
          } catch (e) {
            console.warn('Failed to clear hashtables cache:', e);
          }
        } else {
          console.warn(`Download completed with ${result.errors.length} error(s): ${result.errors.join(', ')}`);
        }
      }
    } catch (error) {
      console.error('Error downloading hashes:', error);
    } finally {
      setDownloadingHashes(false);
    }
  }, []);

  return {
    hashDirectory,
    setHashDirectory,
    hashStatus,
    setHashStatus,
    downloadingHashes,
    handleDownloadHashes
  };
};

export default useHashSettings;
