import React, { useState, useEffect } from 'react';
import { Box, IconButton } from '@mui/material';
import {
  Minimize as MinimizeIcon,
  CropFree as MaximizeIcon,
  Close as CloseIcon,
  FilterNone as RestoreIcon,
} from '@mui/icons-material';

const TITLE_BAR_HEIGHT = 32;

const CustomTitleBar = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [iconSrc, setIconSrc] = useState(process.env.PUBLIC_URL + '/divinelab.ico');

  useEffect(() => {
    // Load icon - try different paths for Electron
    if (window.require) {
      try {
        const path = window.require('path');
        const fs = window.require('fs');
        
        // Try app installation directory first
        const appPath = path.dirname(process.execPath);
        const iconPath = path.join(appPath, 'resources', 'app', 'public', 'divinelab.ico');
        
        if (fs.existsSync(iconPath)) {
          const fileBuffer = fs.readFileSync(iconPath);
          const base64 = fileBuffer.toString('base64');
          setIconSrc(`data:image/x-icon;base64,${base64}`);
          return;
        }
        
        // Try resources path
        if (process.resourcesPath) {
          const resourcesIconPath = path.join(process.resourcesPath, 'app', 'public', 'divinelab.ico');
          if (fs.existsSync(resourcesIconPath)) {
            const fileBuffer = fs.readFileSync(resourcesIconPath);
            const base64 = fileBuffer.toString('base64');
            setIconSrc(`data:image/x-icon;base64,${base64}`);
            return;
          }
        }
        
        // Fallback to public URL
        setIconSrc(process.env.PUBLIC_URL + '/divinelab.ico');
      } catch (error) {
        console.error('Error loading icon:', error);
        setIconSrc(process.env.PUBLIC_URL + '/divinelab.ico');
      }
    }
  }, []);

  useEffect(() => {
    // Check initial window state
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      
      // Get initial maximized state
      ipcRenderer.invoke('window:isMaximized').then((maximized) => {
        setIsMaximized(maximized);
      });

      // Listen for window state changes
      const handleMaximized = () => setIsMaximized(true);
      const handleUnmaximized = () => setIsMaximized(false);

      ipcRenderer.on('window:maximized', handleMaximized);
      ipcRenderer.on('window:unmaximized', handleUnmaximized);

      return () => {
        ipcRenderer.removeListener('window:maximized', handleMaximized);
        ipcRenderer.removeListener('window:unmaximized', handleUnmaximized);
      };
    }
  }, []);

  const handleMinimize = () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.invoke('window:minimize');
    }
  };

  const handleMaximize = () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.invoke('window:maximize');
    }
  };

  const handleClose = () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.invoke('window:close');
    }
  };


  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: `${TITLE_BAR_HEIGHT}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--glass-bg)',
        borderBottom: '1px solid var(--glass-border)',
        backdropFilter: 'saturate(180%) blur(16px)',
        WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        WebkitAppRegion: 'drag', // Enable dragging for the entire title bar
        zIndex: 10000,
        userSelect: 'none',
        paddingLeft: '16px',
        paddingRight: '8px',
      }}
    >
      {/* App Icon */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flex: 1,
          WebkitAppRegion: 'drag',
        }}
      >
        <Box
          component="img"
          src={iconSrc}
          alt="DivineLab"
          sx={{
            width: '20px',
            height: '20px',
            WebkitAppRegion: 'drag',
            pointerEvents: 'none',
            objectFit: 'contain',
          }}
        />
      </Box>

      {/* Window Controls */}
      <Box
        className="title-bar-controls"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          WebkitAppRegion: 'no-drag', // Disable dragging for controls
        }}
      >
        <IconButton
          size="small"
          onClick={handleMinimize}
          sx={{
            width: '32px',
            height: '32px',
            color: 'var(--text-2)',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'var(--text)',
            },
          }}
        >
          <MinimizeIcon sx={{ fontSize: '16px' }} />
        </IconButton>

        <IconButton
          size="small"
          onClick={handleMaximize}
          sx={{
            width: '32px',
            height: '32px',
            color: 'var(--text-2)',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'var(--text)',
            },
          }}
        >
          {isMaximized ? (
            <RestoreIcon sx={{ fontSize: '16px' }} />
          ) : (
            <MaximizeIcon sx={{ fontSize: '16px' }} />
          )}
        </IconButton>

        <IconButton
          size="small"
          onClick={handleClose}
          sx={{
            width: '32px',
            height: '32px',
            color: 'var(--text-2)',
            '&:hover': {
              backgroundColor: '#e81123',
              color: '#ffffff',
            },
          }}
        >
          <CloseIcon sx={{ fontSize: '16px' }} />
        </IconButton>
      </Box>
    </Box>
  );
};

export default CustomTitleBar;
export { TITLE_BAR_HEIGHT };

