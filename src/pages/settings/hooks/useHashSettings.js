import { useState, useCallback, useEffect, useRef } from 'react';

const useHashSettings = () => {
  const [hashDirectory, setHashDirectory] = useState('');
  const [hashStatus, setHashStatus] = useState(null);
  const [downloadingHashes, setDownloadingHashes] = useState(false);
  // Transient feedback for the "Download / Update Hashes" button. The button
  // would otherwise just briefly flicker when there's nothing to download —
  // users couldn't tell whether anything happened.
  const [hashSyncMessage, setHashSyncMessage] = useState(null);
  const messageTimerRef = useRef(null);

  const showMessage = useCallback((text, kind = 'info', durationMs = 4500) => {
    setHashSyncMessage({ text, kind });
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    messageTimerRef.current = setTimeout(() => {
      setHashSyncMessage(null);
      messageTimerRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => () => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
  }, []);

  const handleDownloadHashes = useCallback(async () => {
    setDownloadingHashes(true);
    try {
      if (!window.require) {
        showMessage('Hash sync requires the desktop app.', 'error');
        return;
      }
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('hashes:download');

      if (result?.success) {
        const statusResult = await ipcRenderer.invoke('hashes:check');
        setHashStatus(statusResult);

        const downloadedCount = result.downloaded?.length || 0;
        const skippedCount = result.skipped?.length || 0;
        if (downloadedCount > 0) {
          showMessage(`Updated ${downloadedCount} hash database${downloadedCount === 1 ? '' : 's'}.`, 'success');
        } else if (skippedCount > 0) {
          showMessage('Hashes are already up to date.', 'success');
        } else {
          showMessage('Hash check complete.', 'info');
        }
      } else {
        const errs = result?.errors?.length ? `: ${result.errors.slice(0, 1).join(', ')}` : '';
        console.warn('Hash sync failed', result?.errors);
        showMessage(`Hash sync failed${errs}`, 'error');
      }
    } catch (error) {
      console.error('Error downloading hashes:', error);
      showMessage(`Hash sync error: ${error?.message || error}`, 'error');
    } finally {
      setDownloadingHashes(false);
    }
  }, [showMessage]);

  return {
    hashDirectory,
    setHashDirectory,
    hashStatus,
    setHashStatus,
    downloadingHashes,
    handleDownloadHashes,
    hashSyncMessage,
  };
};

export default useHashSettings;
