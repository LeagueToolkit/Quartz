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
  Image,
  Maximize,
  Pipette,
  FileDigit,
  Wrench,
  Settings,
  CircleHelp,
  Music,
  Sparkles,
  Dices,
  FolderSearch,
} from 'lucide-react';
import electronPrefs from '../../utils/core/electronPrefs.js';
import NavButton from './NavButton';
import './ModernNavigation.css';

const ModernNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [navigationItems, setNavigationItems] = useState([]);
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);

  useEffect(() => {
    const loadNavigationItems = async () => {
      await electronPrefs.initPromise;

      const allItems = [
        { text: 'Paint', icon: Brush, path: '/paint', key: 'paint' },
        { text: 'Port', icon: ArrowLeftRight, path: '/port', key: 'port' },
        { text: 'VFX Hub', icon: Github, path: '/vfx-hub', key: 'vfxHub' },
        { text: 'Bin Editor', icon: Code, path: '/bineditor', key: 'binEditor' },
        { text: 'Img Recolor', icon: Image, path: '/img-recolor', key: 'imgRecolor' },
        { text: 'Asset Extractor', icon: FolderInput, path: '/frogchanger', key: 'frogchanger' },
        { text: 'WAD Explorer', icon: FolderSearch, path: '/wad-explorer', key: 'wadExplorer' },
        { text: 'Sound Banks', icon: Music, path: '/bnk-extract', key: 'bnkExtract' },
        { text: 'Bumpath', icon: Waypoints, path: '/bumpath', key: 'bumpath' },
        { text: 'AniPort', icon: Shuffle, path: '/aniport', key: 'aniport' },
        { text: 'Upscale', icon: Maximize, path: '/upscale', key: 'upscale' },
        { text: 'RGBA', icon: Pipette, path: '/rgba', key: 'rgba' },
        { text: 'File Handler', icon: FileDigit, path: '/file-randomizer', key: 'fileRandomizer' },
        { text: 'FakeGear', icon: Sparkles, path: '/fakegear', key: 'fakeGear' },
        { text: 'Randomizer', icon: Dices, path: '/particle-randomizer', key: 'particleRandomizer' },
        { text: 'Tools', icon: Wrench, path: '/tools', key: 'tools' },
      ];

      const filteredItems = allItems.filter(item => {
        let settingKey;
        // Always show Paint and Port
        if (item.key === 'paint' || item.key === 'port') return true;

        switch (item.key) {
          case 'vfxHub': settingKey = 'VFXHubEnabled'; break; // Fixed case from 'vfxHub' to 'VFXHubEnabled' (already correct below but ensuring clarity)
          case 'upscale': settingKey = 'UpscaleEnabled'; break;
          case 'rgba': settingKey = 'RGBAEnabled'; break;
          case 'imgRecolor': settingKey = 'ImgRecolorEnabled'; break;
          case 'binEditor': settingKey = 'BinEditorEnabled'; break;
          case 'aniport': settingKey = 'AniPortEnabled'; break;
          case 'frogchanger': settingKey = 'FrogChangerEnabled'; break;
          case 'bnkExtract': settingKey = 'BnkExtractEnabled'; break;
          case 'fakeGear': settingKey = 'FakeGearEnabled'; break;
          default: settingKey = `${item.key.charAt(0).toUpperCase() + item.key.slice(1)}Enabled`;
        }
        // FakeGear and Particle Randomizer default to hidden
        if (item.key === 'fakeGear' || item.key === 'particleRandomizer' || item.key === 'aniport' || item.key === 'bumpath') {
          return electronPrefs.obj[settingKey] === true;
        }
        return electronPrefs.obj[settingKey] !== false;
      });


      // Apply saved navigation order if it exists
      const savedOrder = electronPrefs.obj.NavOrder;
      if (Array.isArray(savedOrder)) {
        filteredItems.sort((a, b) => {
          const indexA = savedOrder.indexOf(a.key);
          const indexB = savedOrder.indexOf(b.key);

          // If both are in the saved order, sort by their saved position
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          // If only one is in the saved order, put the saved one first
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          // If neither is saved, keep their default order
          return 0;
        });
      }

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

  const handleDragStart = (e, index) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;

    const newItems = [...navigationItems];
    const draggedItem = newItems[draggedItemIndex];
    newItems.splice(draggedItemIndex, 1);
    newItems.splice(index, 0, draggedItem);

    setDraggedItemIndex(index);
    setNavigationItems(newItems);
  };

  const handleDragEnd = async () => {
    setDraggedItemIndex(null);
    const newOrder = navigationItems.map(item => item.key);
    await electronPrefs.set('NavOrder', newOrder);
  };

  return (
    <div className="modern-nav-container">
      <div className="modern-nav-top">
        {navigationItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`nav-item-wrapper ${draggedItemIndex === index ? 'dragging' : ''}`}
            >
              <NavButton
                title={item.text}
                isActive={isActive(item.path)}
                onClick={() => handleNavigation(item.path)}
              >
                <Icon size={22} />
              </NavButton>
            </div>
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
