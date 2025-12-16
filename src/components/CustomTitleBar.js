import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './CustomTitleBar.css';

const TITLE_BAR_HEIGHT = 48;

const CustomTitleBar = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [iconSrc, setIconSrc] = useState(process.env.PUBLIC_URL + '/divinelab.ico');
  const [gifSrc, setGifSrc] = useState('');
  const navigate = useNavigate();

  // Function to get the navbar gif source (same logic as ModernNavigation)
  const getNavbarGifSrc = async () => {
    if (!window.require) {
      return `${process.env.PUBLIC_URL}/your-logo.gif`;
    }

    try {
      const path = window.require('path');
      const fs = window.require('fs');
      const os = window.require('os');
      
      // Get AppData/Roaming/Quartz/assets path (persists across reinstalls)
      let appDataPath;
      if (window.require) {
        try {
          const { ipcRenderer } = window.require('electron');
          appDataPath = await ipcRenderer.invoke('get-user-data-path');
        } catch {
          // Fallback: construct path manually
          const platform = process.platform;
          if (platform === 'win32') {
            appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
          } else if (platform === 'darwin') {
            appDataPath = path.join(os.homedir(), 'Library', 'Application Support');
          } else {
            appDataPath = path.join(os.homedir(), '.local', 'share');
          }
          // Append app name if not already in path
          if (!appDataPath.includes('Quartz')) {
            appDataPath = path.join(appDataPath, 'Quartz');
          }
        }
      }

      // Check AppData/Roaming/Quartz/assets (user customizations, persists across reinstalls)
      if (appDataPath) {
        const roamingGifPath = path.join(appDataPath, 'assets', 'navbar.gif');
        if (fs.existsSync(roamingGifPath)) {
          try {
            const fileBuffer = fs.readFileSync(roamingGifPath);
            const ext = path.extname(roamingGifPath).toLowerCase();
            const mimeType = ext === '.gif' ? 'image/gif' :
              ext === '.png' ? 'image/png' :
                ext === '.webp' ? 'image/webp' : 'image/gif';
            const base64 = fileBuffer.toString('base64');
            return `data:${mimeType};base64,${base64}`;
          } catch (error) {
            console.error('Error reading AppData gif:', error);
            return `file://${roamingGifPath.replace(/\\/g, '/')}`;
          }
        }
      }

      return `${process.env.PUBLIC_URL}/your-logo.gif`;
    } catch (error) {
      console.error('Error getting navbar gif source:', error);
      return `${process.env.PUBLIC_URL}/your-logo.gif`;
    }
  };

  useEffect(() => {
    // Load icon - logic preserved from original component
    if (window.require) {
      try {
        const path = window.require('path');
        const fs = window.require('fs');
        
        const appPath = path.dirname(process.execPath);
        const iconPath = path.join(appPath, 'resources', 'app', 'public', 'divinelab.ico');
        
        if (fs.existsSync(iconPath)) {
          const fileBuffer = fs.readFileSync(iconPath);
          const base64 = fileBuffer.toString('base64');
          setIconSrc(`data:image/x-icon;base64,${base64}`);
          return;
        }
        
        if (process.resourcesPath) {
          const resourcesIconPath = path.join(process.resourcesPath, 'app', 'public', 'divinelab.ico');
          if (fs.existsSync(resourcesIconPath)) {
            const fileBuffer = fs.readFileSync(resourcesIconPath);
            const base64 = fileBuffer.toString('base64');
            setIconSrc(`data:image/x-icon;base64,${base64}`);
            return;
          }
        }
        
        setIconSrc(process.env.PUBLIC_URL + '/divinelab.ico');
      } catch (error) {
        console.error('Error loading icon:', error);
        setIconSrc(process.env.PUBLIC_URL + '/divinelab.ico');
      }
    }
  }, []);

  useEffect(() => {
    const loadGifSrc = async () => {
      const src = await getNavbarGifSrc();
      setGifSrc(src);
    };
    loadGifSrc();
    const interval = setInterval(async () => {
      const newSrc = await getNavbarGifSrc();
      if (newSrc !== gifSrc) {
        setGifSrc(newSrc);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [gifSrc]);

  useEffect(() => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      
      ipcRenderer.invoke('window:isMaximized').then((maximized) => {
        setIsMaximized(maximized);
      });

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

  const handleHomeClick = () => {
    try {
      const hasUnsaved = Boolean(window.__DL_unsavedBin);
      if (hasUnsaved && !window.__DL_forceClose) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('navigation-blocked', {
            detail: { path: '/main' },
            bubbles: true,
            cancelable: true
          }));
        }, 0);
        return;
      }
    } catch (err) {
      console.error('Error checking unsaved changes:', err);
      return;
    }
    navigate('/main');
  };

  return (
    <div className="app-grid-statusbar">
      <div className="figma-logo-section">
        <div 
          className="header-logo-container home-button"
          onClick={handleHomeClick}
          style={{ cursor: 'pointer' }}
        >
          <img 
            src={gifSrc || getNavbarGifSrc() || iconSrc} 
            alt="Home" 
            className="header-logo"
            onError={(e) => {
              // Fallback to ico if gif fails
              if (gifSrc && e.target.src !== iconSrc) {
                e.target.src = iconSrc;
              } else {
                console.error('Failed to load icon:', iconSrc);
                e.target.style.display = 'none';
              }
            }}
          />
        </div>
        <h1 className="app-title">Quartz</h1>
      </div>

      <div className="figma-window-controls-container">
        <div className="figma-window-controls">
          <button 
            type="button"
            className="figma-window-control" 
            onClick={handleMinimize}
            title="Minimize"
          >
            <MinimizeIcon />
          </button>

          <button 
            type="button"
            className="figma-window-control" 
            onClick={handleMaximize}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>

          <button 
            type="button"
            className="figma-window-control close" 
            onClick={handleClose}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
};

// Simple SVG Icons
function MinimizeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 17V9a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M15 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default CustomTitleBar;
export { TITLE_BAR_HEIGHT };
