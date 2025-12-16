import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Brush,
  ArrowLeftRight,
  Github,
  Code,
  FolderInput,
  Waypoints,
  Shuffle,
  Palette,
  Maximize,
  Pipette,
  FileDigit,
  Wrench,
  Settings,
  CircleHelp
} from 'lucide-react';
import electronPrefs from '../utils/electronPrefs.js';
import NavButton from './NavButton';
import './ModernNavigation.css';

const ModernNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [navigationItems, setNavigationItems] = useState([]);

  useEffect(() => {
    const loadNavigationItems = async () => {
      await electronPrefs.initPromise;

      const allItems = [
        { text: 'Paint', icon: Brush, path: '/paint', key: 'paint' },
        { text: 'Port', icon: ArrowLeftRight, path: '/port', key: 'port' },
        { text: 'VFX Hub', icon: Github, path: '/vfx-hub', key: 'vfxHub' },
        { text: 'Bin Editor', icon: Code, path: '/bineditor', key: 'binEditor' },
        { text: 'Img Recolor', icon: Palette, path: '/img-recolor', key: 'imgRecolor' },
        { text: 'Asset Extractor', icon: FolderInput, path: '/frogchanger', key: 'frogchanger' },
        { text: 'Bumpath', icon: Waypoints, path: '/bumpath', key: 'bumpath' },
        { text: 'AniPort', icon: Shuffle, path: '/aniport', key: 'aniport' },
        { text: 'Upscale', icon: Maximize, path: '/upscale', key: 'upscale' },
        { text: 'RGBA', icon: Pipette, path: '/rgba', key: 'rgba' },
        { text: 'File Handler', icon: FileDigit, path: '/file-randomizer', key: 'fileRandomizer' },
        { text: 'Tools', icon: Wrench, path: '/tools', key: 'tools' },
      ];

      const filteredItems = allItems.filter(item => {
        let settingKey;
        switch (item.key) {
          case 'vfxHub': settingKey = 'VFXHubEnabled'; break;
          case 'upscale': settingKey = 'UpscaleEnabled'; break;
          case 'rgba': settingKey = 'RGBAEnabled'; break;
          case 'imgRecolor': settingKey = 'ImgRecolorEnabled'; break;
          case 'binEditor': settingKey = 'BinEditorEnabled'; break;
          case 'aniport': settingKey = 'AniPortEnabled'; break;
          case 'frogchanger': settingKey = 'FrogChangerEnabled'; break;
          default: settingKey = `${item.key.charAt(0).toUpperCase() + item.key.slice(1)}Enabled`;
        }
        return electronPrefs.obj[settingKey] !== false;
      });

      setNavigationItems(filteredItems);
    };

    loadNavigationItems();
    const handleSettingsChange = () => loadNavigationItems();
    window.addEventListener('settingsChanged', handleSettingsChange);
    return () => window.removeEventListener('settingsChanged', handleSettingsChange);
  }, []);

  const isActive = (path) => location.pathname === path;

  const handleNavigation = (path) => {
    try {
      const hasUnsaved = Boolean(window.__DL_unsavedBin);
      if (hasUnsaved && !window.__DL_forceClose) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('navigation-blocked', {
            detail: { path },
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
    navigate(path);
  };


  return (
    <div className="modern-nav-container">
      <div className="modern-nav-top">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavButton
              key={item.key}
              title={item.text}
              isActive={isActive(item.path)}
              onClick={() => handleNavigation(item.path)}
            >
              <Icon size={22} />
            </NavButton>
          );
        })}
      </div>

      <div className="modern-nav-bottom">
        <NavButton
          title="Settings"
          isActive={isActive('/settings')}
          onClick={() => handleNavigation('/settings')}
        >
          <Settings size={22} />
        </NavButton>
      </div>
    </div>
  );
};

export default ModernNavigation;
