import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Github, Eye, Terminal, Palette, HardDrive
} from 'lucide-react';
// Import theme management
import themeManager, { applyThemeFromObject, setCustomTheme, getCustomThemes, deleteCustomTheme, getCurrentTheme, getThemeBehavior, STYLES } from '../../utils/theme/themeManager.js';
import electronPrefs from '../../utils/core/electronPrefs.js';
import fontManager from '../../utils/theme/fontManager.js';
import { CreatePicker, cleanupColorPickers } from '../../utils/colors/colorUtils.js';
import ColorHandler from '../../utils/colors/ColorHandler.js';
import PageVisibilitySection from './components/sections/PageVisibilitySection';
import GitHubSection from './components/sections/GitHubSection';
import ThemeCreatorSection from './components/sections/ThemeCreatorSection';
import ToolsSection from './components/sections/ToolsSection';
import WindowsIntegrationSection from './components/sections/WindowsIntegrationSection';
import AppearanceSection from './components/sections/AppearanceSection';
import useGitHubSettings from './hooks/useGitHubSettings';
import useHashSettings from './hooks/useHashSettings';
import useUpdateSettings from './hooks/useUpdateSettings';
import useWindowsIntegrationSettings from './hooks/useWindowsIntegrationSettings';
import wallpaperManager from '../../utils/wallpapers/wallpaperManager';

const SETTINGS_SECTION_IDS = [
  'appearance',
  'tools',
  'windowsIntegration',
  'pages',
  'themeCreator',
  'github',
];

const DEFAULT_CUSTOM_THEME_VALUES = {
  accent: '#ecb96a',
  accent2: '#c084fc',
  bg: '#0b0a0f',
  surface: '#0f0d14',
  text: '#ecb96a',
  navIconColor: '#c084fc',
  accentMuted: '',
  bg2: '',
  surface2: '',
  text2: '',
  glassBg: '',
  glassBorder: '',
  glassShadow: ''
};

const DEFAULT_CUSTOM_THEME_BEHAVIOR = {
  preferredStyle: '',
  click: { override: false, enabled: false, type: 'water' },
  background: { override: false, enabled: false, type: 'fireflies' },
  wallpaper: { override: false, enabled: false, id: '' },
};

const ModernSettings = () => {
  const [selectedSection, setSelectedSection] = useState('appearance');

  const [settings, setSettings] = useState({
    selectedFont: 'Segoe UI',
    themeVariant: 'amethyst', // Changed from 'theme' to 'themeVariant' to match Settings4
    interfaceStyle: 'quartz', // New Interface Style state

    autoLoadEnabled: false, // Disabled by default, only enabled when user changes it
    expandSystemsOnLoad: false, // Keep systems collapsed by default when loading bins
    showGithubToken: false,
    githubUsername: '',
    githubToken: '',
    githubRepoUrl: 'https://github.com/FrogCsLoL/VFXHub',
    // Page visibility settings (individual properties like Settings4.js)
    paintEnabled: true,
    portEnabled: true,
    vfxHubEnabled: true,
    binEditorEnabled: true,
    imgRecolorEnabled: true,
    UpscaleEnabled: true,
    rgbaEnabled: false,
    toolsEnabled: false,
    fileRandomizerEnabled: false,
    bnkExtractEnabled: true,
    bumpathEnabled: false,
    aniportEnabled: false, // Default to false on first install
    frogchangerEnabled: false,
    wadExplorerEnabled: true,
    fakeGearEnabled: false, // Default to false (experimental feature)
    particleRandomizerEnabled: false,
    glassBlur: 6,
    useNativeFileBrowser: false, // Default to custom explorer
    communicateWithJade: true,
    jadeExecutablePath: ''
  });

  // Theme-related state
  const [customThemesMap, setCustomThemesMap] = useState({});

  // Custom Theme Creator state
  const [customThemeName, setCustomThemeName] = useState('My Theme');
  const [livePreview, setLivePreview] = useState(false);
  const [showAdvancedTheme, setShowAdvancedTheme] = useState(false);
  const [isThemeCreatorDirty, setIsThemeCreatorDirty] = useState(false);
  const [customThemeValues, setCustomThemeValues] = useState(DEFAULT_CUSTOM_THEME_VALUES);
  const [customThemeBehavior, setCustomThemeBehavior] = useState(DEFAULT_CUSTOM_THEME_BEHAVIOR);
  const livePreviewTimer = useRef(null);
  const customThemeValuesRef = useRef(customThemeValues);
  const customThemeBehaviorRef = useRef(customThemeBehavior);
  const isSyncingThemeCreatorRef = useRef(false);
  const settingsLoadedRef = useRef(false);
  const [advancedStrength, setAdvancedStrength] = useState({
    accentMutedPercent: 35,
    bg2Percent: 15,
    surface2Percent: 15,
    glassBgAlphaPercent: 35,
  });

  // Font-related state
  const [availableFonts, setAvailableFonts] = useState([]);
  const [isLoadingFonts, setIsLoadingFonts] = useState(false);

  const {
    isTestingConnection,
    connectionStatus,
    setConnectionStatus,
    handleTestGitHubConnection
  } = useGitHubSettings(settings);

  const {
    hashDirectory,
    setHashDirectory,
    hashStatus,
    setHashStatus,
    downloadingHashes,
    handleDownloadHashes
  } = useHashSettings();

  const {
    updateStatus,
    currentVersion,
    newVersion,
    updateProgress,
    updateError,
    handleCheckForUpdates,
    handleDownloadUpdate,
    handleInstallUpdate
  } = useUpdateSettings();
  const [highlightUpdateSection, setHighlightUpdateSection] = useState(false);
  const updateSectionRef = useRef(null);
  const [highlightJadePathSection, setHighlightJadePathSection] = useState(false);
  const jadePathSectionRef = useRef(null);
  const [highlightWindowsIntegrationSection, setHighlightWindowsIntegrationSection] = useState(false);
  const windowsIntegrationSectionRef = useRef(null);


  // DEV: Set to true to simulate update highlight for testing
  const DEV_SIMULATE_UPDATE_HIGHLIGHT = false;

  // Wallpaper state
  const [wallpaperPath, setWallpaperPath] = useState('');
  const [wallpaperId, setWallpaperId] = useState('');
  const [wallpaperItems, setWallpaperItems] = useState([]);
  const [wallpaperEnabled, setWallpaperEnabled] = useState(true);
  const [wallpaperOpacity, setWallpaperOpacity] = useState(0.15);
  const [wallpaperVignetteEnabled, setWallpaperVignetteEnabled] = useState(false);
  const [wallpaperVignetteStrength, setWallpaperVignetteStrength] = useState(0.35);
  const [performanceMode, setPerformanceMode] = useState(false);

  const {
    contextMenuEnabled,
    contextMenuLoading,
    handleToggleContextMenu
  } = useWindowsIntegrationSettings();


  // Color helper functions
  const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
  const isHexColor = (value) => typeof value === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test((value || '').trim());
  const hexToRgb = (hex) => {
    let h = (hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const num = parseInt(h || '000000', 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  };
  const rgbToHex = (r, g, b) => {
    const toHex = (v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };
  const darkenHex = (hex, amountPercent) => {
    if (!isHexColor(hex)) return hex;
    const factor = clamp01((amountPercent || 0) / 100);
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(Math.round(r * (1 - factor)), Math.round(g * (1 - factor)), Math.round(b * (1 - factor)));
  };
  const withAlpha = (hex, alphaPercent) => {
    if (!isHexColor(hex)) return hex;
    const { r, g, b } = hexToRgb(hex);
    const a = clamp01((alphaPercent || 0) / 100);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  // Section definitions for sidebar
  const sections = [
    { id: 'appearance', name: 'Appearance', icon: Palette },
    { id: 'tools', name: 'External Tools', icon: Terminal },
    { id: 'windowsIntegration', name: 'Windows Integration', icon: HardDrive },
    { id: 'pages', name: 'Page Visibility', icon: Eye },
    { id: 'themeCreator', name: 'Custom Theme Creator', icon: Palette },
    { id: 'github', name: 'GitHub Integration', icon: Github }
  ];

  // Auto-save settings to electronPrefs
  const updateSetting = async (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));

    // Auto-save to electronPrefs
    try {
      switch (key) {
        case 'selectedFont':
          await electronPrefs.set('SelectedFont', value);
          break;
        case 'interfaceStyle':
          await electronPrefs.set('InterfaceStyle', value);
          // Apply immediately when changed via updateSetting (if not handled elsewhere)
          // But usually we have a specific handler. Let's rely on the specific handler.
          break;

        case 'autoLoadEnabled':
          await electronPrefs.set('AutoLoadEnabled', value);
          break;
        case 'expandSystemsOnLoad':
          await electronPrefs.set('ExpandSystemsOnLoad', value);
          break;
        case 'githubUsername':
          await electronPrefs.set('GitHubUsername', value);
          setConnectionStatus(null); // Reset connection status when username changes
          break;
        case 'githubToken':
          await electronPrefs.set('GitHubToken', value);
          setConnectionStatus(null); // Reset connection status when token changes
          break;
        case 'githubRepoUrl':
          await electronPrefs.set('GitHubRepoUrl', value);
          setConnectionStatus(null); // Reset connection status when repo URL changes
          break;
        case 'showGithubToken':
          // Don't save this to electronPrefs, it's just UI state
          // State is already updated at the beginning of updateSetting, so just return
          return; // Early return to avoid saving
        // Page visibility settings
        case 'paintEnabled':
          await electronPrefs.set('paintEnabled', value);
          break;
        case 'portEnabled':
          await electronPrefs.set('portEnabled', value);
          break;
        case 'vfxHubEnabled':
          await electronPrefs.set('VFXHubEnabled', value);
          break;
        case 'rgbaEnabled':
          await electronPrefs.set('RGBAEnabled', value);
          break;
        case 'imgRecolorEnabled':
          await electronPrefs.set('ImgRecolorEnabled', value);
          break;
        case 'binEditorEnabled':
          await electronPrefs.set('BinEditorEnabled', value);
          break;
        case 'UpscaleEnabled':
          await electronPrefs.set('UpscaleEnabled', value);
          break;
        case 'toolsEnabled':
          await electronPrefs.set('ToolsEnabled', value);
          break;
        case 'fileRandomizerEnabled':
          await electronPrefs.set('FileRandomizerEnabled', value);
          break;
        case 'bnkExtractEnabled':
          await electronPrefs.set('BnkExtractEnabled', value);
          break;
        case 'bumpathEnabled':
          await electronPrefs.set('BumpathEnabled', value);
          break;
        case 'aniportEnabled':
          await electronPrefs.set('AniPortEnabled', value);
          break;
        case 'frogchangerEnabled':
          await electronPrefs.set('FrogChangerEnabled', value);
          break;
        case 'fakeGearEnabled':
          await electronPrefs.set('FakeGearEnabled', value);
          break;
        case 'particleRandomizerEnabled':
          await electronPrefs.set('ParticleRandomizerEnabled', value);
          break;
        case 'wadExplorerEnabled':
          await electronPrefs.set('WadExplorerEnabled', value);
          break;
        case 'useNativeFileBrowser':
          await electronPrefs.set('UseNativeFileBrowser', value);
          break;
        case 'communicateWithJade':
          await electronPrefs.set('CommunicateWithJade', value);
          break;
        case 'jadeExecutablePath':
          await electronPrefs.set('JadeExecutablePath', value);
          break;
        default:
          // For other settings, try to save with the key name
          await electronPrefs.set(key, value);
      }

      // Dispatch settings changed event for navigation updates (matching Settings4.js)
      if (['themeVariant', 'interfaceStyle', 'paintEnabled', 'portEnabled', 'vfxHubEnabled', 'rgbaEnabled', 'imgRecolorEnabled', 'binEditorEnabled', 'toolsEnabled', 'fileRandomizerEnabled', 'bnkExtractEnabled', 'bumpathEnabled', 'aniportEnabled', 'frogchangerEnabled', 'fakeGearEnabled', 'UpscaleEnabled', 'particleRandomizerEnabled', 'wadExplorerEnabled', 'communicateWithJade'].includes(key)) {
        window.dispatchEvent(new CustomEvent('settingsChanged'));
      }
    } catch (error) {
      console.error(`Error saving setting ${key}:`, error);
    }
  };



  // Fonts will be loaded from fontManager

  // Built-in themes list (matching Settings4)
  const builtInThemes = [
    { id: 'onyx', name: 'Onyx', desc: 'Neutral' },
    { id: 'amethyst', name: 'Amethyst', desc: 'Purple + Gold' },
    { id: 'ocean', name: 'Ocean', desc: 'Liquid Blue' },
    { id: 'empress', name: 'Empress', desc: 'Liquid White' },
    { id: 'forest', name: 'Forest', desc: 'Misty Green' },
    { id: 'amogus', name: 'Amogus', desc: 'Space Gray + Blue' },
    { id: 'city', name: 'Neon City', desc: 'Neon Rain' },
    { id: 'cafe', name: 'Cafe', desc: 'Rose Neon Night' },
    { id: 'starSky', name: 'Star Sky', desc: 'Night Blue' },
    { id: 'charcoalOlive', name: 'Charcoal Olive', desc: 'Graphite + Olive' },
    { id: 'quartz', name: 'Quartz', desc: 'Flask + Galaxy' },
    { id: 'crystal', name: 'Crystal', desc: 'White + Blue Iridescent' },
    { id: 'classicGray', name: 'Classic Gray', desc: 'Windows Dark Mode' },
  ];

  const interfaceStyles = [
    { id: STYLES.QUARTZ, name: 'Quartz', desc: 'Modern Glassy UI' },
    { id: STYLES.WINFORMS, name: 'WinForms', desc: 'Classic Flat UI' },
    { id: STYLES.LIQUID, name: 'Liquid Glass', desc: 'High-fidelity refractive glass UI' }
  ];

  // Load settings (theme, fonts, etc.) from electronPrefs on mount
  useEffect(() => {
    const loadSettings = async () => {
      await electronPrefs.initPromise;

      // Load theme and style
      const savedThemeRaw = electronPrefs.obj.ThemeVariant || 'amethyst';
      const savedTheme = (
        typeof savedThemeRaw === 'string' &&
        !savedThemeRaw.startsWith('custom:') &&
        !builtInThemes.some((theme) => theme.id === savedThemeRaw)
      )
        ? 'amethyst'
        : savedThemeRaw;
      if (savedTheme !== savedThemeRaw) {
        await electronPrefs.set('ThemeVariant', savedTheme);
      }
      const savedStyleRaw = electronPrefs.obj.InterfaceStyle || STYLES.QUARTZ;
      const savedStyle = savedStyleRaw === 'cs16' ? STYLES.QUARTZ : savedStyleRaw;
      if (savedStyle !== savedStyleRaw) {
        await electronPrefs.set('InterfaceStyle', savedStyle);
      }
      setSettings(prev => ({
        ...prev,
        themeVariant: savedTheme,
        interfaceStyle: savedStyle
      }));

      // Load saved custom themes
      try {
        const savedCustomThemes = getCustomThemes();
        setCustomThemesMap(savedCustomThemes || {});
      } catch (error) {
        console.error('Error loading custom themes:', error);
      }

      // Initialize Custom Theme defaults from current CSS variables
      try {
        const getVar = (name, fb) => {
          const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
          return v || fb;
        };
        const initialValues = {
          ...DEFAULT_CUSTOM_THEME_VALUES,
          accent: getVar('--accent', DEFAULT_CUSTOM_THEME_VALUES.accent),
          accent2: getVar('--accent2', DEFAULT_CUSTOM_THEME_VALUES.accent2),
          bg: getVar('--bg', DEFAULT_CUSTOM_THEME_VALUES.bg),
          surface: getVar('--surface', DEFAULT_CUSTOM_THEME_VALUES.surface),
          text: getVar('--text', DEFAULT_CUSTOM_THEME_VALUES.text),
          navIconColor: getVar('--nav-icon-color', getVar('--text-2', DEFAULT_CUSTOM_THEME_VALUES.navIconColor)),
          accentMuted: getVar('--accent-muted', ''),
          bg2: getVar('--bg-2', ''),
          surface2: getVar('--surface-2', ''),
          text2: getVar('--text-2', ''),
          glassBg: getVar('--glass-bg', ''),
          glassBorder: getVar('--glass-border', ''),
          glassShadow: getVar('--glass-shadow', ''),
        };
        setCustomThemeValues(initialValues);
        customThemeValuesRef.current = initialValues;
      } catch (error) {
        console.error('Error initializing custom theme values:', error);
      }

      // Apply the theme and style
      try {
        themeManager.applyThemeVariables(savedTheme, savedStyle);
      } catch (error) {
        console.error('Error applying theme:', error);
      }

      // Load fonts
      // Wait for fontManager to be fully initialized
      if (!fontManager.initialized) {
        await fontManager.init();
      }

      // Ensure font persistence before reading settings
      await fontManager.ensureFontPersistence();

      // Force reapply font if it seems to have been reset
      const savedFont = electronPrefs.obj.SelectedFont;
      const currentlyAppliedFont = fontManager.getCurrentlyAppliedFont();

      // If we have a saved font but it's not currently applied, force reapply it
      if (savedFont && savedFont !== 'system' && currentlyAppliedFont !== savedFont) {
        console.log('🔄 Force reapplying font in Settings load:', savedFont);
        await fontManager.forceReapplyCurrentFont();
      }

      // Get the current font from multiple sources for better detection
      const currentFont = fontManager.getCurrentFont();
      const domFont = document.documentElement.getAttribute('data-current-font');
      const localStorageFont = typeof localStorage !== 'undefined' ? localStorage.getItem('frogsaw-current-font') : null;

      // Use the most reliable source (currently applied > DOM > saved > current > system)
      const fontToUse = currentlyAppliedFont || domFont || savedFont || currentFont || 'Segoe UI';

      console.log('💾 Loading Settings - DOM font:', domFont, 'Saved font:', savedFont, 'Current font:', currentFont, 'LocalStorage font:', localStorageFont, 'Using:', fontToUse);



      // Load hash settings
      const loadHashSettings = async () => {
        try {
          if (window.require) {
            const { ipcRenderer } = window.require('electron');
            // Get hash directory (check for custom first, then use integrated)
            const customHashDir = electronPrefs.obj.CustomHashDirectory;
            if (customHashDir) {
              setHashDirectory(customHashDir);
            } else {
              const hashDirResult = await ipcRenderer.invoke('hashes:get-directory');
              setHashDirectory(hashDirResult.hashDir || '');
            }

            // Check hash status
            const statusResult = await ipcRenderer.invoke('hashes:check');
            setHashStatus(statusResult);
          }
        } catch (error) {
          console.error('Error loading hash settings:', error);
        }
      };
      loadHashSettings();

      // Mark settings as loaded so the font effect won't fire with stale initial state
      settingsLoadedRef.current = true;

      // Load page visibility settings (matching Settings4.js)
      setSettings(prev => ({
        ...prev,
        selectedFont: fontToUse,

        autoLoadEnabled: electronPrefs.obj.AutoLoadEnabled === true, // Default to false, only enabled when user sets it
        expandSystemsOnLoad: electronPrefs.obj.ExpandSystemsOnLoad === true, // Default to false (collapsed)
        githubUsername: electronPrefs.obj.GitHubUsername || '',
        githubToken: electronPrefs.obj.GitHubToken || '',
        githubRepoUrl: electronPrefs.obj.GitHubRepoUrl || 'https://github.com/FrogCsLoL/VFXHub',
        // Page visibility settings
        paintEnabled: electronPrefs.obj.paintEnabled !== false, // Default to true
        portEnabled: electronPrefs.obj.portEnabled !== false,
        vfxHubEnabled: electronPrefs.obj.VFXHubEnabled !== false,
        binEditorEnabled: electronPrefs.obj.BinEditorEnabled !== false,
        imgRecolorEnabled: electronPrefs.obj.ImgRecolorEnabled !== false,
        UpscaleEnabled: electronPrefs.obj.UpscaleEnabled !== false,
        rgbaEnabled: electronPrefs.obj.RGBAEnabled !== false,
        toolsEnabled: electronPrefs.obj.ToolsEnabled !== false,
        fileRandomizerEnabled: electronPrefs.obj.FileRandomizerEnabled !== false,
        bnkExtractEnabled: electronPrefs.obj.BnkExtractEnabled !== false,
        bumpathEnabled: electronPrefs.obj.BumpathEnabled === true,
        aniportEnabled: electronPrefs.obj.AniPortEnabled === true, // Default to false on first install
        frogchangerEnabled: electronPrefs.obj.FrogChangerEnabled !== false,
        wadExplorerEnabled: electronPrefs.obj.WadExplorerEnabled !== false,
        fakeGearEnabled: electronPrefs.obj.FakeGearEnabled === true, // Default to false (experimental)
        particleRandomizerEnabled: electronPrefs.obj.ParticleRandomizerEnabled === true,
        glassBlur: electronPrefs.obj.GlassBlur !== undefined ? electronPrefs.obj.GlassBlur : 6,
        useNativeFileBrowser: electronPrefs.obj.UseNativeFileBrowser === true, // Default to false
        communicateWithJade: electronPrefs.obj.CommunicateWithJade !== false,
        jadeExecutablePath: electronPrefs.obj.JadeExecutablePath || ''
      }));

      // Load/migrate wallpaper settings and gallery
      setPerformanceMode(electronPrefs.obj.PerformanceMode === true);
      try {
        const allWallpapers = await wallpaperManager.listWallpapers();
        setWallpaperItems(allWallpapers);
        setWallpaperEnabled(electronPrefs.obj.WallpaperEnabled !== false);

        let selectedId = electronPrefs.obj.WallpaperId || '';
        let selectedItem = selectedId ? allWallpapers.find((item) => item.id === selectedId) : null;

        if (!selectedItem && electronPrefs.obj.WallpaperPath) {
          const migrated = await wallpaperManager.migrateLegacyWallpaperPath(electronPrefs.obj.WallpaperPath);
          if (migrated) {
            selectedId = migrated.id;
            selectedItem = migrated;
          }
        }

        if (selectedItem) {
          setWallpaperId(selectedItem.id);
          setWallpaperPath(selectedItem.filePath);
          await electronPrefs.set('WallpaperId', selectedItem.id);
          await electronPrefs.set('WallpaperPath', selectedItem.filePath);
        } else {
          setWallpaperId('');
          setWallpaperPath('');
        }
      } catch (error) {
        console.error('Error loading wallpaper gallery:', error);
        setWallpaperEnabled(electronPrefs.obj.WallpaperEnabled !== false);
        if (electronPrefs.obj.WallpaperPath) {
          setWallpaperPath(electronPrefs.obj.WallpaperPath);
        }
      }

      if (electronPrefs.obj.WallpaperOpacity !== undefined) {
        setWallpaperOpacity(electronPrefs.obj.WallpaperOpacity);
      }
      if (electronPrefs.obj.WallpaperVignetteEnabled !== undefined) {
        setWallpaperVignetteEnabled(electronPrefs.obj.WallpaperVignetteEnabled === true);
      }
      if (electronPrefs.obj.WallpaperVignetteStrength !== undefined) {
        setWallpaperVignetteStrength(electronPrefs.obj.WallpaperVignetteStrength);
      }

      // Load available fonts (one fresh scan on settings open)
      setIsLoadingFonts(true);
      try {
        const fonts = await fontManager.refreshFonts();
        // Ensure system font is always first and available
        const systemFont = { name: 'system', displayName: 'System Default' };
        const otherFonts = fonts.filter(f => f.name !== 'system');
        let allFonts = [systemFont, ...otherFonts];
        // Ensure the currently selected font is present to avoid warnings
        if (fontToUse && !allFonts.some(f => f.name === fontToUse)) {
          allFonts = [systemFont, { name: fontToUse, displayName: fontToUse }, ...otherFonts];
        }

        setAvailableFonts(allFonts);
        console.log('📝 Available fonts loaded:', allFonts.length);

        // Only apply if different from already applied
        if (fontToUse && fontToUse !== 'system') {
          const applied = fontManager.getCurrentlyAppliedFont();
          if (applied !== fontToUse) {
            console.log('🔄 Applying font on settings load:', fontToUse);
            await fontManager.applyFont(fontToUse);
          }
        }
      } catch (error) {
        console.error('Error loading fonts:', error);
        // Fallback to just system font if there's an error
        setAvailableFonts([{ name: 'system', displayName: 'System Default' }]);
      } finally {
        setIsLoadingFonts(false);
      }
    };
    loadSettings();
  }, []);

  // Honor external request to open a specific settings section.
  useEffect(() => {
    const requestedSection = localStorage.getItem('settings:open-section');
    if (requestedSection && SETTINGS_SECTION_IDS.includes(requestedSection)) {
      setSelectedSection(requestedSection);
      localStorage.removeItem('settings:open-section');
    }
  }, []);

  // Check for update/ritobin highlight flag (when user navigates from notifications)
  useEffect(() => {
    const checkHighlightFlag = () => {
      try {
        const shouldHighlight = localStorage.getItem('settings:highlight-update') === 'true' || DEV_SIMULATE_UPDATE_HIGHLIGHT;


        if (shouldHighlight) {
          // Clear the flag
          localStorage.removeItem('settings:highlight-update');

          // Ensure tools section is selected
          if (selectedSection !== 'tools') {
            setSelectedSection('tools');
          }

          // Set highlight state after a short delay to ensure section is rendered
          setTimeout(() => {
            setHighlightUpdateSection(true);

            // Scroll to update section
            if (updateSectionRef.current) {
              updateSectionRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
              });
            }

            // Optionally trigger check for updates if update is available
            if (updateStatus === 'available' || updateStatus === 'idle') {
              // Small delay before triggering to ensure UI is ready
              setTimeout(() => {
                if (window.require) {
                  const { ipcRenderer } = window.require('electron');
                  ipcRenderer.invoke('update:check').catch(err => {
                    console.error('Error triggering update check:', err);
                  });
                }
              }, 500);
            }
          }, 200);

          // Remove highlight after 5 seconds
          setTimeout(() => {
            setHighlightUpdateSection(false);
          }, 5000);
        }
      } catch (e) {
        console.error('Error checking highlight flag:', e);
      }
    };

    // Check after a brief delay to ensure component is mounted
    const timer = setTimeout(checkHighlightFlag, 100);
    return () => clearTimeout(timer);
  }, [DEV_SIMULATE_UPDATE_HIGHLIGHT, selectedSection, updateStatus]);

  // Check for windows integration highlight flag (when user navigates from modal).
  useEffect(() => {
    const shouldHighlight = localStorage.getItem('settings:highlight-windows-integration') === 'true';
    if (!shouldHighlight) return;

    localStorage.removeItem('settings:highlight-windows-integration');

    if (selectedSection !== 'windowsIntegration') {
      setSelectedSection('windowsIntegration');
    }

    const activateTimer = setTimeout(() => {
      setHighlightWindowsIntegrationSection(true);
      if (windowsIntegrationSectionRef.current) {
        windowsIntegrationSectionRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }, 220);

    const clearTimer = setTimeout(() => {
      setHighlightWindowsIntegrationSection(false);
    }, 5000);

    return () => {
      clearTimeout(activateTimer);
      clearTimeout(clearTimer);
    };
  }, [selectedSection]);

  // Check for jade executable path highlight flag (when user navigates from Jade modal).
  useEffect(() => {
    const shouldHighlight = localStorage.getItem('settings:highlight-jade-path') === 'true';
    if (!shouldHighlight) return;

    localStorage.removeItem('settings:highlight-jade-path');

    if (selectedSection !== 'tools') {
      setSelectedSection('tools');
    }

    const activateTimer = setTimeout(() => {
      setHighlightJadePathSection(true);
      if (jadePathSectionRef.current) {
        jadePathSectionRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }, 220);

    const clearTimer = setTimeout(() => {
      setHighlightJadePathSection(false);
    }, 5000);

    return () => {
      clearTimeout(activateTimer);
      clearTimeout(clearTimer);
    };
  }, [selectedSection]);

  // Apply font when selectedFont changes (skip initial mount render with stale 'system' default)
  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    if (settings.selectedFont) {
      const applied = fontManager.getCurrentlyAppliedFont();
      if (settings.selectedFont !== applied) {
        console.log('🔄 Settings page applying font:', settings.selectedFont);
        fontManager.applyFont(settings.selectedFont)
          .then(() => electronPrefs.set('SelectedFont', settings.selectedFont))
          .catch(error => {
            console.error('Error applying font:', error);
            setSettings(prev => ({ ...prev, selectedFont: applied || 'Segoe UI' }));
          });
      }
    }
  }, [settings.selectedFont]);

  const findThemePresetWallpaper = useCallback(async (wallpaperPreset) => {
    if (!wallpaperPreset) return null;
    const wallpapers = await wallpaperManager.listWallpapers();
    return wallpapers.find((item) => {
      const display = String(item?.displayName || '').toLowerCase();
      const fileName = String(item?.filePath || '').split(/[\\/]/).pop()?.toLowerCase() || '';

      const displayMatch = wallpaperPreset.displayName
        ? display === String(wallpaperPreset.displayName).toLowerCase()
        : false;

      const fileNamePrefixMatch = wallpaperPreset.fileNamePrefix
        ? fileName.startsWith(String(wallpaperPreset.fileNamePrefix).toLowerCase())
        : false;

      const fileNameListMatch = Array.isArray(wallpaperPreset.fileNames)
        ? wallpaperPreset.fileNames.some((name) => fileName === String(name).toLowerCase())
        : false;

      return displayMatch || fileNamePrefixMatch || fileNameListMatch;
    }) || null;
  }, []);

  // Handle theme change (Color)
  const handleThemeChange = async (themeId) => {
    const behavior = getThemeBehavior(themeId) || null;
    let currentStyle;

    setSettings(prev => {
      currentStyle = behavior?.preferredStyle || (prev.interfaceStyle || STYLES.QUARTZ);
      return {
        ...prev,
        themeVariant: themeId,
        ...(behavior?.preferredStyle ? { interfaceStyle: behavior.preferredStyle } : {})
      };
    });

    // Save to electronPrefs
    try {
      await electronPrefs.set('ThemeVariant', themeId);
      // Apply the theme with preserved interface style
      themeManager.applyThemeVariables(themeId, currentStyle);
      // Ensure interface style is also saved (preserve it)
      await electronPrefs.set('InterfaceStyle', currentStyle);

      if (behavior?.effects?.click) {
        const { enabled, type } = behavior.effects.click;
        setClickEffectEnabled(enabled);
        await electronPrefs.set('ClickEffectEnabled', enabled);
        if (type !== undefined) {
          setClickEffectType(type);
          await electronPrefs.set('ClickEffectType', type);
        }
        window.dispatchEvent(new CustomEvent('clickEffectChanged', {
          detail: { enabled, ...(type !== undefined ? { type } : {}) }
        }));
      }

      if (behavior?.effects?.background) {
        const { enabled, type } = behavior.effects.background;
        setBackgroundEffectEnabled(enabled);
        await electronPrefs.set('BackgroundEffectEnabled', enabled);
        if (type !== undefined) {
          setBackgroundEffectType(type);
          await electronPrefs.set('BackgroundEffectType', type);
        }
        window.dispatchEvent(new CustomEvent('backgroundEffectChanged', {
          detail: { enabled, ...(type !== undefined ? { type } : {}) }
        }));
      }

      if (behavior?.wallpaper) {
        try {
          const wallpaperEnabledByPreset = behavior.wallpaper.enabled;
          if (wallpaperEnabledByPreset === false) {
            setWallpaperEnabled(false);
            await electronPrefs.set('WallpaperEnabled', false);
            window.dispatchEvent(new CustomEvent('wallpaperChanged', {
              detail: { path: '', opacity: wallpaperOpacity }
            }));
          } else {
            if (wallpaperEnabledByPreset === true) {
              setWallpaperEnabled(true);
              await electronPrefs.set('WallpaperEnabled', true);
            }

            let presetWallpaper = null;
            if (behavior.wallpaper.id) {
              const selectedById = wallpaperItems.find((item) => item.id === behavior.wallpaper.id)
                || await wallpaperManager.resolveById(behavior.wallpaper.id);
              presetWallpaper = selectedById || null;
            }
            if (!presetWallpaper) {
              presetWallpaper = await findThemePresetWallpaper(behavior.wallpaper);
            }
            if (presetWallpaper) {
              await applyWallpaperSelection(presetWallpaper);
            }
          }
        } catch (wallpaperError) {
          console.error(`Error applying ${themeId} wallpaper preset:`, wallpaperError);
        }
      }

      if (performanceMode) {
        await enforcePerformanceModeConstraints(true);
      }

      window.dispatchEvent(new CustomEvent('settingsChanged'));
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  // Handle style change (Interface)
  const handleStyleChange = async (styleId) => {
    setSettings(prev => ({ ...prev, interfaceStyle: styleId }));

    try {
      await electronPrefs.set('InterfaceStyle', styleId);
      // Apply the style with current theme
      themeManager.applyThemeVariables(settings.themeVariant, styleId);
      window.dispatchEvent(new CustomEvent('settingsChanged'));
    } catch (error) {
      console.error('Error saving style:', error);
    }
  };

  // Handle font change
  const handleFontChange = async (fontName) => {
    setSettings(prev => ({ ...prev, selectedFont: fontName }));
    // Font will be applied via useEffect when selectedFont changes
  };

  // Handle opening fonts folder
  const handleOpenFontsFolder = () => {
    const success = fontManager.openFontsFolder();
    if (success) {
      // Could show a message here if CreateMessage is available
      console.log('Fonts folder opened');
    } else {
      console.error('Unable to open fonts folder. This feature requires the Electron environment.');
    }
  };

  // Handle refreshing fonts
  const handleRefreshFonts = async () => {
    setIsLoadingFonts(true);
    try {
      const fonts = await fontManager.refreshFonts();
      // Ensure system font is always first
      const systemFont = { name: 'system', displayName: 'System Default' };
      const otherFonts = fonts.filter(f => f.name !== 'system');
      const allFonts = [systemFont, ...otherFonts];

      setAvailableFonts(allFonts);
      console.log('📝 Fonts refreshed:', allFonts.length);
    } catch (error) {
      console.error('Error refreshing fonts:', error);
    } finally {
      setIsLoadingFonts(false);
    }
  };

  // Ensure selected font is valid
  const safeSelectedFont = availableFonts.some(f => f.name === settings.selectedFont)
    ? settings.selectedFont
    : 'system';

  // Custom Theme handlers
  const normalizeThemeColorValue = (raw) => {
    const value = String(raw ?? '').trim();
    const hex3 = value.match(/^#?([0-9a-fA-F]{3})$/);
    if (hex3) {
      const h = hex3[1].toUpperCase();
      return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    }
    const hex6 = value.match(/^#?([0-9a-fA-F]{6})$/);
    if (hex6) return `#${hex6[1].toUpperCase()}`;
    const hex8 = value.match(/^#?([0-9a-fA-F]{8})$/);
    if (hex8) return `#${hex8[1].toUpperCase()}`;
    return value;
  };

  const createThemeCreatorValuesFromTheme = useCallback((themeColors = {}) => ({
    ...DEFAULT_CUSTOM_THEME_VALUES,
    accent: normalizeThemeColorValue(themeColors.accent || DEFAULT_CUSTOM_THEME_VALUES.accent),
    accent2: normalizeThemeColorValue(themeColors.accent2 || DEFAULT_CUSTOM_THEME_VALUES.accent2),
    bg: normalizeThemeColorValue(themeColors.bg || DEFAULT_CUSTOM_THEME_VALUES.bg),
    surface: normalizeThemeColorValue(themeColors.surface || DEFAULT_CUSTOM_THEME_VALUES.surface),
    text: normalizeThemeColorValue(themeColors.text || DEFAULT_CUSTOM_THEME_VALUES.text),
    navIconColor: normalizeThemeColorValue(
      themeColors.navIconColor || themeColors.text2 || DEFAULT_CUSTOM_THEME_VALUES.navIconColor
    ),
    accentMuted: normalizeThemeColorValue(themeColors.accentMuted || ''),
    bg2: normalizeThemeColorValue(themeColors.bg2 || ''),
    surface2: normalizeThemeColorValue(themeColors.surface2 || ''),
    text2: normalizeThemeColorValue(themeColors.text2 || ''),
    glassBg: String(themeColors.glassBg || '').trim(),
    glassBorder: String(themeColors.glassBorder || '').trim(),
    glassShadow: String(themeColors.glassShadow || '').trim(),
  }), []);

  const getThemeCreatorSourceByVariant = useCallback((themeVariant) => {
    if (!themeVariant) return null;
    if (themeVariant.startsWith('custom:')) {
      const customName = themeVariant.replace('custom:', '');
      const customThemes = getCustomThemes();
      const customTheme = customThemes[customName];
      return customTheme ? { theme: customTheme, customName, behavior: customTheme.__behavior || getThemeBehavior(themeVariant) || null } : null;
    }
    return { theme: getCurrentTheme(themeVariant), customName: null, behavior: getThemeBehavior(themeVariant) || null };
  }, []);

  const normalizeThemeCreatorBehavior = useCallback((behavior) => ({
    preferredStyle: behavior?.preferredStyle === 'cs16' ? '' : (behavior?.preferredStyle || ''),
    click: {
      override: !!behavior?.effects?.click,
      enabled: behavior?.effects?.click?.enabled === true,
      type: behavior?.effects?.click?.type || 'water',
    },
    background: {
      override: !!behavior?.effects?.background,
      enabled: behavior?.effects?.background?.enabled === true,
      type: behavior?.effects?.background?.type || 'fireflies',
    },
    wallpaper: {
      override: typeof behavior?.wallpaper?.enabled === 'boolean',
      enabled: behavior?.wallpaper?.enabled === true,
      id: String(behavior?.wallpaper?.id || ''),
    },
  }), []);

  const buildThemeBehaviorPayload = useCallback((editorBehavior) => {
    const next = {};
    if (editorBehavior?.preferredStyle) next.preferredStyle = editorBehavior.preferredStyle;

    const effects = {};
    if (editorBehavior?.click?.override) {
      effects.click = {
        enabled: editorBehavior.click.enabled === true,
        ...(editorBehavior.click.type ? { type: editorBehavior.click.type } : {}),
      };
    }
    if (editorBehavior?.background?.override) {
      effects.background = {
        enabled: editorBehavior.background.enabled === true,
        ...(editorBehavior.background.type ? { type: editorBehavior.background.type } : {}),
      };
    }
    if (Object.keys(effects).length) next.effects = effects;

    if (editorBehavior?.wallpaper?.override) {
      next.wallpaper = {
        enabled: editorBehavior.wallpaper.enabled === true,
        ...(editorBehavior.wallpaper.id ? { id: editorBehavior.wallpaper.id } : {})
      };
    }

    return Object.keys(next).length ? next : null;
  }, []);

  const applyThemeCreatorLivePreview = useCallback(async (values, behavior) => {
    applyThemeFromObject(values);

    const previewStyle = behavior?.preferredStyle || settings.interfaceStyle || STYLES.QUARTZ;
    document.documentElement.setAttribute('data-style', previewStyle);

    if (behavior?.click?.override) {
      window.dispatchEvent(new CustomEvent('clickEffectChanged', {
        detail: {
          enabled: behavior.click.enabled === true,
          type: behavior.click.type || 'water'
        }
      }));
    }

    if (behavior?.background?.override) {
      window.dispatchEvent(new CustomEvent('backgroundEffectChanged', {
        detail: {
          enabled: behavior.background.enabled === true,
          type: behavior.background.type || 'fireflies'
        }
      }));
    }

    if (behavior?.wallpaper?.override) {
      let previewPath = '';
      if (behavior.wallpaper.enabled === true) {
        const selectedId = String(behavior.wallpaper.id || '');
        if (selectedId) {
          const selected = wallpaperItems.find((item) => item.id === selectedId) || await wallpaperManager.resolveById(selectedId);
          previewPath = selected?.filePath || '';
        }
        if (!previewPath) {
          previewPath = wallpaperEnabled ? wallpaperPath : '';
        }
      }
      window.dispatchEvent(new CustomEvent('wallpaperChanged', {
        detail: { path: previewPath, opacity: wallpaperOpacity }
      }));
    }
  }, [settings.interfaceStyle, wallpaperEnabled, wallpaperItems, wallpaperOpacity, wallpaperPath]);

  const restoreFromThemeCreatorLivePreview = () => {
    themeManager.applyThemeVariables(settings.themeVariant || 'amethyst', settings.interfaceStyle || STYLES.QUARTZ);
    window.dispatchEvent(new CustomEvent('clickEffectChanged', {
      detail: { enabled: clickEffectEnabled, type: clickEffectType }
    }));
    window.dispatchEvent(new CustomEvent('backgroundEffectChanged', {
      detail: { enabled: backgroundEffectEnabled, type: backgroundEffectType }
    }));
    window.dispatchEvent(new CustomEvent('wallpaperChanged', {
      detail: { path: wallpaperEnabled ? wallpaperPath : '', opacity: wallpaperOpacity }
    }));
  };

  const syncThemeCreatorValuesFromVariant = useCallback((themeVariant) => {
    const source = getThemeCreatorSourceByVariant(themeVariant);
    if (!source?.theme) return;
    const nextValues = createThemeCreatorValuesFromTheme(source.theme);
    const nextBehavior = normalizeThemeCreatorBehavior(source.behavior);
    isSyncingThemeCreatorRef.current = true;
    setCustomThemeValues(nextValues);
    setCustomThemeBehavior(nextBehavior);
    customThemeValuesRef.current = nextValues;
    customThemeBehaviorRef.current = nextBehavior;
    if (source.customName) {
      setCustomThemeName(source.customName);
    }
    setTimeout(() => {
      isSyncingThemeCreatorRef.current = false;
    }, 0);
  }, [createThemeCreatorValuesFromTheme, getThemeCreatorSourceByVariant, normalizeThemeCreatorBehavior]);

  const handleCustomThemeValueChange = useCallback((field, value) => {
    const normalizedValue = normalizeThemeColorValue(value);
    const nextValues = {
      ...customThemeValuesRef.current,
      [field]: normalizedValue
    };
    customThemeValuesRef.current = nextValues;
    setCustomThemeValues(nextValues);
    if (!isSyncingThemeCreatorRef.current) {
      setIsThemeCreatorDirty(true);
    }
    if (livePreview) {
      if (livePreviewTimer.current) {
        clearTimeout(livePreviewTimer.current);
      }
      livePreviewTimer.current = setTimeout(() => {
        applyThemeCreatorLivePreview(nextValues, customThemeBehaviorRef.current).catch(() => { });
      }, 120);
    }
  }, [applyThemeCreatorLivePreview, livePreview]);

  const handleCustomThemeBehaviorChange = useCallback((path, value) => {
    const nextBehavior = {
      ...customThemeBehaviorRef.current,
      click: { ...customThemeBehaviorRef.current.click },
      background: { ...customThemeBehaviorRef.current.background },
      wallpaper: { ...customThemeBehaviorRef.current.wallpaper },
    };

    const [root, key] = String(path || '').split('.');
    if (root === 'preferredStyle') {
      nextBehavior.preferredStyle = String(value || '');
    } else if (root === 'click' && key) {
      nextBehavior.click[key] = value;
    } else if (root === 'background' && key) {
      nextBehavior.background[key] = value;
    } else if (root === 'wallpaper' && key) {
      nextBehavior.wallpaper[key] = value;
    }

    customThemeBehaviorRef.current = nextBehavior;
    setCustomThemeBehavior(nextBehavior);
    if (!isSyncingThemeCreatorRef.current) {
      setIsThemeCreatorDirty(true);
    }
    if (livePreview) {
      applyThemeCreatorLivePreview(customThemeValuesRef.current, nextBehavior).catch(() => { });
    }
  }, [applyThemeCreatorLivePreview, livePreview]);

  useEffect(() => {
    customThemeValuesRef.current = customThemeValues;
  }, [customThemeValues]);

  useEffect(() => {
    customThemeBehaviorRef.current = customThemeBehavior;
  }, [customThemeBehavior]);

  useEffect(() => {
    return () => {
      if (livePreviewTimer.current) {
        clearTimeout(livePreviewTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!livePreview) return;
    applyThemeCreatorLivePreview(customThemeValuesRef.current, customThemeBehaviorRef.current).catch(() => { });
  }, [applyThemeCreatorLivePreview, livePreview, wallpaperItems]);

  // Handle color picker click - opens custom color picker for theme colors
  const handleThemeColorPickerClick = useCallback((event, field) => {
    // Clean up any existing pickers
    cleanupColorPickers();

    // Get current color value
    const currentHex = customThemeValuesRef.current?.[field] || '#ffffff';

    // Create a mock palette structure for the CreatePicker function
    const mockPalette = [{
      ToHEX: () => customThemeValuesRef.current?.[field] || '#ffffff',
      InputHex: (hex) => {
        // Update the theme value when color is committed from picker
        handleCustomThemeValueChange(field, hex.toUpperCase());
      },
      vec4: (() => {
        const handler = new ColorHandler();
        handler.InputHex(currentHex);
        return handler.vec4;
      })()
    }];

    // Create the custom color picker
    CreatePicker(
      0, // paletteIndex
      event, // event for positioning
      mockPalette, // mock palette
      null, // setPalette (not needed)
      'theme', // mode
      null, // savePaletteForMode (not needed)
      null, // setColors (not needed)
      event.target, // clickedColorDot for live preview
      {
        onLivePreview: (hex) => handleCustomThemeValueChange(field, String(hex || '').toUpperCase()),
        onCommit: (hex) => handleCustomThemeValueChange(field, String(hex || '').toUpperCase()),
      }
    );
  }, [handleCustomThemeValueChange]);

  // Cleanup color pickers on unmount
  useEffect(() => {
    return () => {
      cleanupColorPickers();
    };
  }, []);

  // Sync creator values from selected theme while creator is clean.
  useEffect(() => {
    if (!settings.themeVariant) return;
    if (selectedSection !== 'themeCreator') return;
    if (isThemeCreatorDirty) return;
    syncThemeCreatorValuesFromVariant(settings.themeVariant);
  }, [isThemeCreatorDirty, selectedSection, settings.themeVariant, syncThemeCreatorValuesFromVariant]);

  const handleToggleLivePreview = (enabled) => {
    setLivePreview(enabled);
    try {
      if (enabled) {
        applyThemeCreatorLivePreview(customThemeValuesRef.current, customThemeBehaviorRef.current).catch(() => { });
      } else {
        restoreFromThemeCreatorLivePreview();
      }
    } catch { }
  };

  const handleApplyCustomTheme = async () => {
    if (!customThemeName) return;
    const behaviorPayload = buildThemeBehaviorPayload(customThemeBehaviorRef.current);
    await setCustomTheme(customThemeName, {
      ...customThemeValuesRef.current,
      ...(behaviorPayload ? { __behavior: behaviorPayload } : {})
    });
    const variant = `custom:${customThemeName}`;
    await handleThemeChange(variant);
    setIsThemeCreatorDirty(false);
    console.log(`Theme '${customThemeName}' applied`);
  };

  const handleDeleteCustomTheme = async (name) => {
    await deleteCustomTheme(name);
    const updated = getCustomThemes();
    setCustomThemesMap(updated || {});
    console.log(`Theme '${name}' deleted`);
  };

  const handleResetCustomTheme = () => {
    const resetValues = createThemeCreatorValuesFromTheme(getCurrentTheme('amethyst'));
    const resetBehavior = normalizeThemeCreatorBehavior(getThemeBehavior('amethyst'));
    setCustomThemeValues(resetValues);
    setCustomThemeBehavior(resetBehavior);
    customThemeValuesRef.current = resetValues;
    customThemeBehaviorRef.current = resetBehavior;
    setIsThemeCreatorDirty(false);
    if (livePreview) {
      applyThemeCreatorLivePreview(resetValues, resetBehavior).catch(() => { });
    }
  };

  // Wallpaper handlers
  const refreshWallpaperGallery = useCallback(async () => {
    try {
      const all = await wallpaperManager.listWallpapers();
      setWallpaperItems(all);
      return all;
    } catch (error) {
      console.error('Error refreshing wallpaper gallery:', error);
      return [];
    }
  }, []);

  const applyWallpaperSelection = useCallback(async (item) => {
    const nextPath = item?.filePath || '';
    const nextId = item?.id || '';
    setWallpaperPath(nextPath);
    setWallpaperId(nextId);
    setWallpaperEnabled(true);
    await electronPrefs.set('WallpaperId', nextId);
    await electronPrefs.set('WallpaperPath', nextPath);
    await electronPrefs.set('WallpaperEnabled', true);
    window.dispatchEvent(new CustomEvent('wallpaperChanged', {
      detail: {
        path: nextPath,
        opacity: wallpaperOpacity,
        vignetteEnabled: wallpaperVignetteEnabled,
        vignetteStrength: wallpaperVignetteStrength
      }
    }));
  }, [wallpaperOpacity, wallpaperVignetteEnabled, wallpaperVignetteStrength]);

  const handleBrowseWallpaper = async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('dialog:openFile', {
          title: 'Select Wallpaper Image',
          filters: [
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }
          ],
          properties: ['openFile']
        });

        if (result && result.filePaths && result.filePaths.length > 0) {
          const imported = await wallpaperManager.importWallpaper(result.filePaths[0]);
          if (imported) {
            await refreshWallpaperGallery();
            await applyWallpaperSelection(imported);
          }
        }
      }
    } catch (error) {
      console.error('Error selecting wallpaper:', error);
    }
  };

  const handleBrowseJadeExecutable = async () => {
    try {
      if (!window.require) return;
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('dialog:openFile', {
        title: 'Select Jade Executable',
        filters: [
          { name: 'Executable', extensions: ['exe'] }
        ],
        properties: ['openFile']
      });
      if (result && result.filePaths && result.filePaths.length > 0) {
        await updateSetting('jadeExecutablePath', result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error selecting Jade executable:', error);
    }
  };

  const handleSelectWallpaper = async (id) => {
    if (!id) return;
    const selected = wallpaperItems.find((item) => item.id === id) || await wallpaperManager.resolveById(id);
    if (!selected) return;
    await applyWallpaperSelection(selected);
  };

  const handleDeleteWallpaper = async (id) => {
    if (!id) return;
    const ok = await wallpaperManager.deleteWallpaper(id);
    if (!ok) return;
    const refreshed = await refreshWallpaperGallery();
    if (wallpaperId === id) {
      const fallback = refreshed[0] || null;
      await applyWallpaperSelection(fallback);
    }
  };

  const handleWallpaperOpacityChange = async (opacity) => {
    setWallpaperOpacity(opacity);
    await electronPrefs.set('WallpaperOpacity', opacity);
    window.dispatchEvent(new CustomEvent('wallpaperChanged', {
      detail: {
        path: wallpaperEnabled ? wallpaperPath : '',
        opacity,
        vignetteEnabled: wallpaperVignetteEnabled,
        vignetteStrength: wallpaperVignetteStrength
      }
    }));
  };

  const handleWallpaperVignetteEnabledChange = async (enabled) => {
    setWallpaperVignetteEnabled(enabled);
    await electronPrefs.set('WallpaperVignetteEnabled', enabled);
    window.dispatchEvent(new CustomEvent('wallpaperChanged', {
      detail: {
        path: wallpaperEnabled ? wallpaperPath : '',
        opacity: wallpaperOpacity,
        vignetteEnabled: enabled,
        vignetteStrength: wallpaperVignetteStrength
      }
    }));
  };

  const handleWallpaperVignetteStrengthChange = async (strength) => {
    setWallpaperVignetteStrength(strength);
    await electronPrefs.set('WallpaperVignetteStrength', strength);
    window.dispatchEvent(new CustomEvent('wallpaperChanged', {
      detail: {
        path: wallpaperEnabled ? wallpaperPath : '',
        opacity: wallpaperOpacity,
        vignetteEnabled: wallpaperVignetteEnabled,
        vignetteStrength: strength
      }
    }));
  };

  const handleWallpaperEnabledChange = async (enabled) => {
    setWallpaperEnabled(enabled);
    await electronPrefs.set('WallpaperEnabled', enabled);
    window.dispatchEvent(new CustomEvent('wallpaperChanged', {
      detail: {
        path: enabled ? wallpaperPath : '',
        opacity: wallpaperOpacity,
        vignetteEnabled: wallpaperVignetteEnabled,
        vignetteStrength: wallpaperVignetteStrength
      }
    }));
  };

  const handleGlassBlurChange = async (amount) => {
    setSettings(prev => ({ ...prev, glassBlur: amount }));
    await electronPrefs.set('GlassBlur', amount);
    window.dispatchEvent(new CustomEvent('glassBlurChanged', {
      detail: { amount }
    }));
  };

  const handleClearWallpaper = async () => {
    setWallpaperPath('');
    setWallpaperId('');
    setWallpaperEnabled(false);
    await electronPrefs.set('WallpaperId', '');
    await electronPrefs.set('WallpaperPath', '');
    await electronPrefs.set('WallpaperEnabled', false);
    window.dispatchEvent(new CustomEvent('wallpaperChanged', {
      detail: {
        path: '',
        opacity: wallpaperOpacity,
        vignetteEnabled: wallpaperVignetteEnabled,
        vignetteStrength: wallpaperVignetteStrength
      }
    }));
  };

  const handleDeleteActiveWallpaper = async () => {
    if (wallpaperId) {
      await handleDeleteWallpaper(wallpaperId);
      return;
    }
    await handleClearWallpaper();
  };

  // Click effect state
  const [clickEffectEnabled, setClickEffectEnabled] = useState(false);
  const [clickEffectType, setClickEffectType] = useState('water');

  // Load click effect setting on mount
  useEffect(() => {
    const loadClickEffect = async () => {
      await electronPrefs.initPromise;
      if (electronPrefs.obj.ClickEffectEnabled !== undefined) {
        setClickEffectEnabled(electronPrefs.obj.ClickEffectEnabled);
      }
      if (electronPrefs.obj.ClickEffectType !== undefined) {
        setClickEffectType(electronPrefs.obj.ClickEffectType);
      }
    };
    loadClickEffect();
  }, []);

  const handleClickEffectToggle = async (enabled) => {
    setClickEffectEnabled(enabled);
    await electronPrefs.set('ClickEffectEnabled', enabled);
    window.dispatchEvent(new CustomEvent('clickEffectChanged', {
      detail: { enabled }
    }));
  };

  const handleClickEffectTypeChange = async (type) => {
    setClickEffectType(type);
    await electronPrefs.set('ClickEffectType', type);
    window.dispatchEvent(new CustomEvent('clickEffectChanged', {
      detail: { type }
    }));
  };

  // Background effect state
  const [backgroundEffectEnabled, setBackgroundEffectEnabled] = useState(false);
  const [backgroundEffectType, setBackgroundEffectType] = useState('fireflies');

  // Cursor effect state
  const [cursorEffectEnabled, setCursorEffectEnabled] = useState(false);
  const [cursorEffectPath, setCursorEffectPath] = useState('');
  const [cursorEffectSize, setCursorEffectSize] = useState(32);
  const [cursorFiles, setCursorFiles] = useState([]);

  // Load background effect setting on mount
  useEffect(() => {
    const loadBackgroundEffect = async () => {
      await electronPrefs.initPromise;
      if (electronPrefs.obj.BackgroundEffectEnabled !== undefined) {
        setBackgroundEffectEnabled(electronPrefs.obj.BackgroundEffectEnabled);
      }
      if (electronPrefs.obj.BackgroundEffectType !== undefined) {
        setBackgroundEffectType(electronPrefs.obj.BackgroundEffectType);
      }
    };
    loadBackgroundEffect();
  }, []);

  const handleBackgroundEffectToggle = async (enabled) => {
    setBackgroundEffectEnabled(enabled);
    await electronPrefs.set('BackgroundEffectEnabled', enabled);
    window.dispatchEvent(new CustomEvent('backgroundEffectChanged', {
      detail: { enabled }
    }));
  };

  const handleBackgroundEffectTypeChange = async (type) => {
    setBackgroundEffectType(type);
    await electronPrefs.set('BackgroundEffectType', type);
    window.dispatchEvent(new CustomEvent('backgroundEffectChanged', {
      detail: { type }
    }));
  };

  // Load cursor effect setting on mount
  useEffect(() => {
    const loadCursorEffect = async () => {
      await electronPrefs.initPromise;
      if (electronPrefs.obj.CursorEffectEnabled !== undefined) {
        setCursorEffectEnabled(electronPrefs.obj.CursorEffectEnabled);
      }
      if (electronPrefs.obj.CursorEffectPath !== undefined) {
        setCursorEffectPath(electronPrefs.obj.CursorEffectPath);
      }
      if (electronPrefs.obj.CursorEffectSize !== undefined) {
        setCursorEffectSize(electronPrefs.obj.CursorEffectSize);
      }
    };
    loadCursorEffect();
  }, []);

  const handleCursorEffectToggle = async (enabled) => {
    setCursorEffectEnabled(enabled);
    await electronPrefs.set('CursorEffectEnabled', enabled);
    window.dispatchEvent(new CustomEvent('cursorEffectChanged', {
      detail: { enabled }
    }));
  };

  const loadCursorFiles = async () => {
    if (!window.require) return;
    try {
      const { ipcRenderer } = window.require('electron');
      const path = window.require('path');
      const fs = window.require('fs');
      const MIME = { cur: 'image/vnd.microsoft.icon', png: 'image/png', gif: 'image/gif' };
      const cursorsDir = await ipcRenderer.invoke('getCursorsPath');
      if (fs.existsSync(cursorsDir)) {
        const files = fs.readdirSync(cursorsDir)
          .filter(f => /\.(cur|gif|png)$/i.test(f))
          .map(name => {
            const fullPath = path.join(cursorsDir, name);
            const ext = name.split('.').pop().toLowerCase();
            const mime = MIME[ext] || 'image/png';
            const base64 = fs.readFileSync(fullPath).toString('base64');
            const dataUri = `data:${mime};base64,${base64}`;
            return { name, fullPath, dataUri };
          });
        setCursorFiles(files);
      } else {
        setCursorFiles([]);
      }
    } catch (e) {
      console.error('Failed to load cursor files:', e);
      setCursorFiles([]);
    }
  };

  const handleOpenCursorsFolder = async () => {
    if (!window.require) return;
    try {
      const { ipcRenderer } = window.require('electron');
      const cursorsDir = await ipcRenderer.invoke('getCursorsPath');
      await ipcRenderer.invoke('file:open-folder', cursorsDir);
    } catch (e) {
      console.error('Failed to open cursors folder:', e);
    }
  };

  const handleSelectCursorFile = async (fullPath) => {
    setCursorEffectPath(fullPath);
    await electronPrefs.set('CursorEffectPath', fullPath);
    window.dispatchEvent(new CustomEvent('cursorEffectChanged', {
      detail: { path: fullPath, size: cursorEffectSize }
    }));
  };

  const handleCursorSizeChange = async (size) => {
    setCursorEffectSize(size);
    await electronPrefs.set('CursorEffectSize', size);
    window.dispatchEvent(new CustomEvent('cursorEffectChanged', {
      detail: { size }
    }));
  };

  const enforcePerformanceModeConstraints = async (force = false) => {
    if (!force && !performanceMode) return;

    setClickEffectEnabled(false);
    await electronPrefs.set('ClickEffectEnabled', false);
    window.dispatchEvent(new CustomEvent('clickEffectChanged', {
      detail: { enabled: false }
    }));

    setBackgroundEffectEnabled(false);
    await electronPrefs.set('BackgroundEffectEnabled', false);
    window.dispatchEvent(new CustomEvent('backgroundEffectChanged', {
      detail: { enabled: false }
    }));

    setCursorEffectEnabled(false);
    await electronPrefs.set('CursorEffectEnabled', false);
    window.dispatchEvent(new CustomEvent('cursorEffectChanged', {
      detail: { enabled: false }
    }));

    const cappedBlur = Math.min(settings.glassBlur || 0, 2);
    if (cappedBlur !== settings.glassBlur) {
      setSettings(prev => ({ ...prev, glassBlur: cappedBlur }));
      await electronPrefs.set('GlassBlur', cappedBlur);
      window.dispatchEvent(new CustomEvent('glassBlurChanged', {
        detail: { amount: cappedBlur }
      }));
    }
  };

  const handlePerformanceModeToggle = async (enabled) => {
    setPerformanceMode(enabled);
    await electronPrefs.set('PerformanceMode', enabled);
    if (enabled) {
      await enforcePerformanceModeConstraints(true);
    }
    window.dispatchEvent(new CustomEvent('settingsChanged'));
  };

  useEffect(() => {
    if (cursorEffectEnabled) loadCursorFiles();
  }, [cursorEffectEnabled]); // eslint-disable-line

  useEffect(() => {
    if (!performanceMode) return;
    enforcePerformanceModeConstraints(true).catch(() => { });
  }, [performanceMode]); // eslint-disable-line

  // Render section content based on selected section
  const activeWallpaperPath = wallpaperEnabled ? wallpaperPath : '';

  const renderSectionContent = () => {
    switch (selectedSection) {
      case 'appearance':
        return (
          <AppearanceSection
            safeSelectedFont={safeSelectedFont}
            handleFontChange={handleFontChange}
            isLoadingFonts={isLoadingFonts}
            availableFonts={availableFonts}
            handleOpenFontsFolder={handleOpenFontsFolder}
            interfaceStyles={interfaceStyles}
            settings={settings}
            handleStyleChange={handleStyleChange}
            builtInThemes={builtInThemes}
            customThemesMap={customThemesMap}
            handleThemeChange={handleThemeChange}
            wallpaperPath={wallpaperPath}
            wallpaperEnabled={wallpaperEnabled}
            wallpaperId={wallpaperId}
            wallpaperItems={wallpaperItems}
            wallpaperOpacity={wallpaperOpacity}
            wallpaperVignetteEnabled={wallpaperVignetteEnabled}
            wallpaperVignetteStrength={wallpaperVignetteStrength}
            handleBrowseWallpaper={handleBrowseWallpaper}
            handleSelectWallpaper={handleSelectWallpaper}
            handleDeleteWallpaper={handleDeleteWallpaper}
            handleDeleteActiveWallpaper={handleDeleteActiveWallpaper}
            handleWallpaperEnabledChange={handleWallpaperEnabledChange}
            handleWallpaperOpacityChange={handleWallpaperOpacityChange}
            handleWallpaperVignetteEnabledChange={handleWallpaperVignetteEnabledChange}
            handleWallpaperVignetteStrengthChange={handleWallpaperVignetteStrengthChange}
            handleGlassBlurChange={handleGlassBlurChange}
            performanceMode={performanceMode}
            handlePerformanceModeToggle={handlePerformanceModeToggle}
            clickEffectEnabled={clickEffectEnabled}
            handleClickEffectToggle={handleClickEffectToggle}
            clickEffectType={clickEffectType}
            handleClickEffectTypeChange={handleClickEffectTypeChange}
            backgroundEffectEnabled={backgroundEffectEnabled}
            handleBackgroundEffectToggle={handleBackgroundEffectToggle}
            backgroundEffectType={backgroundEffectType}
            handleBackgroundEffectTypeChange={handleBackgroundEffectTypeChange}
            cursorEffectEnabled={cursorEffectEnabled}
            handleCursorEffectToggle={handleCursorEffectToggle}
            handleOpenCursorsFolder={handleOpenCursorsFolder}
            loadCursorFiles={loadCursorFiles}
            cursorFiles={cursorFiles}
            cursorEffectPath={cursorEffectPath}
            handleSelectCursorFile={handleSelectCursorFile}
            cursorEffectSize={cursorEffectSize}
            handleCursorSizeChange={handleCursorSizeChange}
          />
        );
      case 'tools':
        return (
          <ToolsSection
            settings={settings}
            updateSetting={updateSetting}
            handleBrowseJadeExecutable={handleBrowseJadeExecutable}
            jadePathSectionRef={jadePathSectionRef}
            hashStatus={hashStatus}
            downloadingHashes={downloadingHashes}
            handleDownloadHashes={handleDownloadHashes}
            updateSectionRef={updateSectionRef}
            highlightUpdateSection={highlightUpdateSection}
            highlightJadePathSection={highlightJadePathSection}
            currentVersion={currentVersion}
            newVersion={newVersion}
            updateStatus={updateStatus}
            updateProgress={updateProgress}
            updateError={updateError}
            handleCheckForUpdates={handleCheckForUpdates}
            handleDownloadUpdate={handleDownloadUpdate}
            handleInstallUpdate={handleInstallUpdate}
          />
        );
      case 'windowsIntegration':
        return (
          <WindowsIntegrationSection
            contextMenuEnabled={contextMenuEnabled}
            handleToggleContextMenu={handleToggleContextMenu}
            contextMenuLoading={contextMenuLoading}
            windowsIntegrationSectionRef={windowsIntegrationSectionRef}
            highlightWindowsIntegrationSection={highlightWindowsIntegrationSection}
          />
        );
      case 'pages':
        return <PageVisibilitySection settings={settings} updateSetting={updateSetting} />;
      case 'themeCreator':
        return (
          <ThemeCreatorSection
            customThemeName={customThemeName}
            setCustomThemeName={setCustomThemeName}
            customThemeValues={customThemeValues}
            customThemeBehavior={customThemeBehavior}
            handleThemeColorPickerClick={handleThemeColorPickerClick}
            handleCustomThemeValueChange={handleCustomThemeValueChange}
            handleCustomThemeBehaviorChange={handleCustomThemeBehaviorChange}
            showAdvancedTheme={showAdvancedTheme}
            setShowAdvancedTheme={setShowAdvancedTheme}
            advancedStrength={advancedStrength}
            setAdvancedStrength={setAdvancedStrength}
            darkenHex={darkenHex}
            withAlpha={withAlpha}
            livePreview={livePreview}
            handleToggleLivePreview={handleToggleLivePreview}
            handleResetCustomTheme={handleResetCustomTheme}
            handleApplyCustomTheme={handleApplyCustomTheme}
            customThemesMap={customThemesMap}
            wallpaperItems={wallpaperItems}
            wallpaperPath={activeWallpaperPath}
            handleDeleteCustomTheme={handleDeleteCustomTheme}
          />
        );
      case 'github':
        return (
          <GitHubSection
            settings={settings}
            updateSetting={updateSetting}
            setSettings={setSettings}
            connectionStatus={connectionStatus}
            isTestingConnection={isTestingConnection}
            handleTestGitHubConnection={handleTestGitHubConnection}
            wallpaperPath={activeWallpaperPath}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="settings-container" style={{
      width: '100%',
      minHeight: '100%',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: "'JetBrains Mono', monospace",
      padding: '24px'
    }}>
      {/* Sidebar + Content Layout */}
      <div style={{
        display: 'flex',
        gap: '24px',
        maxWidth: '1400px',
        width: '100%',
        margin: '0 auto'
      }}>
        {/* Left Sidebar */}
        <div style={{
          width: '240px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {sections.map((section) => {
            const IconComponent = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setSelectedSection(section.id)}
                style={{
                  padding: '12px 16px',
                  background: selectedSection === section.id
                    ? (activeWallpaperPath
                      ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.026))'
                      : 'rgba(255, 255, 255, 0.05)')
                    : 'transparent',
                  border: selectedSection === section.id
                    ? '1px solid var(--accent)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  color: selectedSection === section.id ? 'var(--accent)' : 'var(--accent2)',
                  fontSize: '14px',
                  fontWeight: selectedSection === section.id ? '600' : '500',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'all 0.2s ease',
                  textAlign: 'left',
                  backdropFilter: activeWallpaperPath ? 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)' : 'none',
                  WebkitBackdropFilter: activeWallpaperPath ? 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (selectedSection !== section.id) {
                    e.currentTarget.style.background = activeWallpaperPath
                      ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.016))'
                      : 'rgba(255, 255, 255, 0.02)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedSection !== section.id) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  }
                }}
              >
                <IconComponent size={18} />
                <span>{section.name}</span>
              </button>
            );
          })}
        </div>

        {/* Right Content Area */}
        <div style={{
          flex: 1,
          minWidth: 0,
          background: activeWallpaperPath
            ? 'transparent'
            : 'rgba(255, 255, 255, 0.02)',
          border: activeWallpaperPath ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '24px',
          backdropFilter: activeWallpaperPath ? 'none' : 'none',
          WebkitBackdropFilter: activeWallpaperPath ? 'none' : 'none',
          boxShadow: activeWallpaperPath ? 'none' : 'none',
          position: 'relative',
          ...(activeWallpaperPath ? {
            '--settings-ink': 'var(--text)',
            '--settings-subtle-ink': 'var(--text)',
            '--settings-muted': 'var(--text-2)',
            '--settings-control-bg': 'linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.07))',
            '--settings-control-bg-focus': 'linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.1))',
            '--settings-control-border': 'rgba(255, 255, 255, 0.3)',
            '--settings-control-border-strong': 'rgba(255, 255, 255, 0.42)',
            '--settings-card-bg': 'linear-gradient(180deg, rgba(255, 255, 255, 0.038), rgba(255, 255, 255, 0.014))',
            '--settings-card-bg-selected': 'linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.026))',
            '--settings-card-border': 'rgba(255, 255, 255, 0.1)',
            '--settings-card-border-selected': 'rgba(255, 255, 255, 0.15)',
            '--settings-card-shadow': '0 10px 28px rgba(0, 0, 0, 0.24)',
            '--settings-card-shadow-selected': '0 14px 34px rgba(0, 0, 0, 0.28)',
            '--settings-btn-bg': 'color-mix(in srgb, var(--accent) 12%, transparent)',
            '--settings-btn-bg-hover': 'color-mix(in srgb, var(--accent) 22%, transparent)',
            '--settings-btn-border': 'color-mix(in srgb, var(--accent) 45%, transparent)'
          } : {})
        }}>
          {renderSectionContent()}
          {activeWallpaperPath && (
            <style>{`
              .settings-container input::placeholder {
                color: color-mix(in srgb, var(--settings-muted, var(--text-2)) 88%, white 12%);
                opacity: 0.95;
              }
            `}</style>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModernSettings;
