import { useCallback, useEffect, useState } from 'react';

const useUpdateSettings = () => {
  const [updateStatus, setUpdateStatus] = useState('idle');
  const [currentVersion, setCurrentVersion] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [updateProgress, setUpdateProgress] = useState({ percent: 0, transferred: 0, total: 0 });
  const [updateError, setUpdateError] = useState('');

  useEffect(() => {
    if (!window.require) return undefined;

    const { ipcRenderer } = window.require('electron');

    ipcRenderer.on('update:checking', () => {
      setUpdateStatus('checking');
      setUpdateError('');
    });

    ipcRenderer.on('update:available', (_event, data) => {
      setUpdateStatus('available');
      setNewVersion(data.version);
      setUpdateError('');
    });

    ipcRenderer.on('update:not-available', (_event, data) => {
      setUpdateStatus('not-available');
      setNewVersion(data.version);
      setUpdateError('');
    });

    ipcRenderer.on('update:error', (_event, data) => {
      setUpdateStatus('error');
      setUpdateError(data.message || 'Unknown error');
    });

    ipcRenderer.on('update:download-progress', (_event, data) => {
      setUpdateStatus('downloading');
      setUpdateProgress(data);
    });

    ipcRenderer.on('update:downloaded', (_event, data) => {
      setUpdateStatus('downloaded');
      setNewVersion(data.version);
      setUpdateError('');
    });

    (async () => {
      try {
        const versionResult = await ipcRenderer.invoke('update:get-version');
        if (versionResult.success) {
          setCurrentVersion(versionResult.version);
        }
      } catch (error) {
        console.error('Error getting version:', error);
      }
    })();

    return () => {
      ipcRenderer.removeAllListeners('update:checking');
      ipcRenderer.removeAllListeners('update:available');
      ipcRenderer.removeAllListeners('update:not-available');
      ipcRenderer.removeAllListeners('update:error');
      ipcRenderer.removeAllListeners('update:download-progress');
      ipcRenderer.removeAllListeners('update:downloaded');
    };
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        setUpdateStatus('checking');
        setUpdateError('');
        const result = await ipcRenderer.invoke('update:check');
        if (!result.success) {
          setUpdateStatus('error');
          setUpdateError(result.error || 'Failed to check for updates');
        }
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      setUpdateStatus('error');
      setUpdateError(error.message);
    }
  }, []);

  const handleDownloadUpdate = useCallback(async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        setUpdateStatus('downloading');
        setUpdateError('');
        const result = await ipcRenderer.invoke('update:download');
        if (!result.success) {
          setUpdateStatus('error');
          setUpdateError(result.error || 'Failed to download update');
        }
      }
    } catch (error) {
      console.error('Error downloading update:', error);
      setUpdateStatus('error');
      setUpdateError(error.message);
    }
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('update:install');
        if (!result.success) {
          setUpdateStatus('error');
          setUpdateError(result.error || 'Failed to install update');
        }
      }
    } catch (error) {
      console.error('Error installing update:', error);
      setUpdateStatus('error');
      setUpdateError(error.message);
    }
  }, []);

  return {
    updateStatus,
    currentVersion,
    newVersion,
    updateProgress,
    updateError,
    handleCheckForUpdates,
    handleDownloadUpdate,
    handleInstallUpdate
  };
};

export default useUpdateSettings;
