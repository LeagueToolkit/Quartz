import { useCallback, useEffect, useState } from 'react';

const useWindowsIntegrationSettings = () => {
  const [contextMenuEnabled, setContextMenuEnabled] = useState(false);
  const [contextMenuLoading, setContextMenuLoading] = useState(false);

  useEffect(() => {
    const checkContextMenuStatus = async () => {
      if (!window.require) return;

      try {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('contextMenu:isEnabled');
        setContextMenuEnabled(result.enabled || false);
      } catch (error) {
        console.error('Error checking context menu status:', error);
      }
    };

    checkContextMenuStatus();
  }, []);

  const handleToggleContextMenu = useCallback(async (enabled) => {
    if (!window.require) {
      console.error('Context menu integration requires Electron');
      return;
    }

    setContextMenuLoading(true);
    try {
      const { ipcRenderer } = window.require('electron');

      if (enabled) {
        const result = await ipcRenderer.invoke('contextMenu:enable');
        if (result.success) {
          setContextMenuEnabled(true);
          console.log('Context menu enabled successfully');
        } else {
          console.error('Failed to enable context menu:', result.error);
          setContextMenuEnabled(false);
        }
      } else {
        const result = await ipcRenderer.invoke('contextMenu:disable');
        if (result.success) {
          setContextMenuEnabled(false);
          console.log('Context menu disabled successfully');
        } else {
          console.error('Failed to disable context menu:', result.error);
        }
      }
    } catch (error) {
      console.error('Error toggling context menu:', error);
      setContextMenuEnabled(!enabled);
    } finally {
      setContextMenuLoading(false);
    }
  }, []);

  return {
    contextMenuEnabled,
    contextMenuLoading,
    handleToggleContextMenu
  };
};

export default useWindowsIntegrationSettings;
