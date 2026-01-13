import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Save, RefreshCw, Folder, Check, AlertTriangle,
  Type, Github, Link, Eye, EyeOff, ChevronDown, ChevronUp,
  Download, Upload, Terminal, Trash2, Palette, HardDrive
} from 'lucide-react';
// Import theme management
import themeManager, { applyThemeFromObject, setCustomTheme, getCustomThemes, deleteCustomTheme, getCurrentTheme, STYLES } from '../utils/themeManager.js';
import electronPrefs from '../utils/electronPrefs.js';
import fontManager from '../utils/fontManager.js';
import { CreatePicker, cleanupColorPickers } from '../utils/colorUtils.js';
import ColorHandler from '../utils/ColorHandler.js';

const ModernSettings = () => {
  const [selectedSection, setSelectedSection] = useState('appearance');

  const [settings, setSettings] = useState({
    selectedFont: 'system',
    themeVariant: 'amethyst', // Changed from 'theme' to 'themeVariant' to match Settings4
    interfaceStyle: 'quartz', // New Interface Style state
    ritobinPath: '',
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
    bumpathEnabled: false,
    aniportEnabled: false, // Default to false on first install
    frogchangerEnabled: false,
    fakeGearEnabled: false, // Default to false (experimental feature)
    glassBlur: 6,
    useNativeFileBrowser: false // Default to custom explorer
  });

  // Theme-related state
  const [customThemesMap, setCustomThemesMap] = useState({});

  // Custom Theme Creator state
  const [customThemeName, setCustomThemeName] = useState('My Theme');
  const [livePreview, setLivePreview] = useState(false);
  const [showAdvancedTheme, setShowAdvancedTheme] = useState(false);
  const [customThemeValues, setCustomThemeValues] = useState({
    accent: '#ecb96a',
    accent2: '#c084fc',
    bg: '#0b0a0f',
    surface: '#0f0d14',
    text: '#ecb96a',
    // advanced optional values
    accentMuted: '',
    bg2: '',
    surface2: '',
    text2: '',
    glassBg: '',
    glassBorder: '',
    glassShadow: ''
  });
  const livePreviewTimer = useRef(null);
  const [advancedStrength, setAdvancedStrength] = useState({
    accentMutedPercent: 35,
    bg2Percent: 15,
    surface2Percent: 15,
    glassBgAlphaPercent: 35,
  });

  // Font-related state
  const [availableFonts, setAvailableFonts] = useState([]);
  const [isLoadingFonts, setIsLoadingFonts] = useState(false);

  // GitHub-related state
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  // Hash-related state
  const [hashDirectory, setHashDirectory] = useState('');
  const [hashStatus, setHashStatus] = useState(null);
  const [downloadingHashes, setDownloadingHashes] = useState(false);

  // Update-related state
  const [updateStatus, setUpdateStatus] = useState('idle'); // idle, checking, available, downloading, downloaded, not-available, error
  const [currentVersion, setCurrentVersion] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [updateProgress, setUpdateProgress] = useState({ percent: 0, transferred: 0, total: 0 });
  const [updateError, setUpdateError] = useState('');
  const [highlightUpdateSection, setHighlightUpdateSection] = useState(false);
  const updateSectionRef = useRef(null);
  const [highlightRitobin, setHighlightRitobin] = useState(false);
  const ritobinRef = useRef(null);

  // DEV: Set to true to simulate update highlight for testing
  const DEV_SIMULATE_UPDATE_HIGHLIGHT = false;

  // Wallpaper state
  const [wallpaperPath, setWallpaperPath] = useState('');
  const [wallpaperOpacity, setWallpaperOpacity] = useState(0.15);

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
        case 'ritobinPath':
          await electronPrefs.set('RitoBinPath', value);
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
        case 'useNativeFileBrowser':
          await electronPrefs.set('UseNativeFileBrowser', value);
          break;
        default:
          // For other settings, try to save with the key name
          await electronPrefs.set(key, value);
      }

      // Dispatch settings changed event for navigation updates (matching Settings4.js)
      if (['themeVariant', 'interfaceStyle', 'paintEnabled', 'portEnabled', 'vfxHubEnabled', 'rgbaEnabled', 'imgRecolorEnabled', 'binEditorEnabled', 'toolsEnabled', 'fileRandomizerEnabled', 'bumpathEnabled', 'aniportEnabled', 'frogchangerEnabled', 'fakeGearEnabled', 'UpscaleEnabled'].includes(key)) {
        window.dispatchEvent(new CustomEvent('settingsChanged'));
      }
    } catch (error) {
      console.error(`Error saving setting ${key}:`, error);
    }
  };

  const handleBrowseRitobin = async () => {
    try {
      if (!window.require) {
        console.error('window.require not available');
        return;
      }

      const newPath = await electronPrefs.RitoBinPath();
      if (newPath) {
        updateSetting('ritobinPath', newPath);
      }
    } catch (error) {
      console.error('Error setting RitoBinPath:', error);
      // Don't let errors cause navigation issues - just log and continue
    }
  };

  // Fonts will be loaded from fontManager

  // Built-in themes list (matching Settings4)
  const builtInThemes = [
    { id: 'onyx', name: 'Onyx', desc: 'Neutral' },
    { id: 'amethyst', name: 'Amethyst', desc: 'Purple + Gold' },
    { id: 'neon', name: 'Neon', desc: 'Cyan + Pink' },
    { id: 'aurora', name: 'Aurora', desc: 'Mint + Lime' },
    { id: 'solar', name: 'Solar', desc: 'Orange + Gold' },
    { id: 'charcoalOlive', name: 'Charcoal Olive', desc: 'Graphite + Olive' },
    { id: 'quartz', name: 'Quartz', desc: 'Flask + Galaxy' },
    { id: 'futuristQuartz', name: 'Futurist Quartz', desc: 'Rose + Smoky' },
    { id: 'cyberQuartz', name: 'Cyber Quartz', desc: 'Cyan + Purple' },
    { id: 'crystal', name: 'Crystal', desc: 'White + Blue Iridescent' },
    { id: 'classicGray', name: 'Classic Gray', desc: 'Windows Dark Mode' },
  ];

  const interfaceStyles = [
    { id: STYLES.QUARTZ, name: 'Quartz', desc: 'Modern Glassy UI' },
    { id: STYLES.WINFORMS, name: 'WinForms', desc: 'Classic Flat UI' },
    { id: STYLES.CS16, name: '1.6', desc: 'Counter-Strike 1.6' }
  ];

  // Load settings (theme, fonts, etc.) from electronPrefs on mount
  useEffect(() => {
    const loadSettings = async () => {
      await electronPrefs.initPromise;

      // Load theme and style
      const savedTheme = electronPrefs.obj.ThemeVariant || 'amethyst';
      const savedStyle = electronPrefs.obj.InterfaceStyle || STYLES.QUARTZ;
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
        setCustomThemeValues(prev => ({
          ...prev,
          accent: getVar('--accent', prev.accent),
          accent2: getVar('--accent2', prev.accent2),
          bg: getVar('--bg', prev.bg),
          surface: getVar('--surface', prev.surface),
          text: getVar('--text', prev.text),
        }));
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
      const fontToUse = currentlyAppliedFont || domFont || savedFont || currentFont || 'system';

      console.log('💾 Loading Settings - DOM font:', domFont, 'Saved font:', savedFont, 'Current font:', currentFont, 'LocalStorage font:', localStorageFont, 'Using:', fontToUse);

      // Load ritobin path
      let ritobinPath = electronPrefs.obj.RitoBinPath || '';

      // If no saved path, check for default location in FrogTools
      if (!ritobinPath && window.require) {
        try {
          const { ipcRenderer } = window.require('electron');
          const defaultRitobin = await ipcRenderer.invoke('ritobin:get-default-path');
          if (defaultRitobin && defaultRitobin.exists) {
            ritobinPath = defaultRitobin.path;
            // Save the default path automatically
            await electronPrefs.set('RitoBinPath', ritobinPath);
            console.log('💾 Auto-detected and saved default ritobin path:', ritobinPath);
          }
        } catch (error) {
          console.error('Error getting default ritobin path:', error);
        }
      }

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

      // Load page visibility settings (matching Settings4.js)
      setSettings(prev => ({
        ...prev,
        selectedFont: fontToUse,
        ritobinPath: ritobinPath,
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
        bumpathEnabled: electronPrefs.obj.BumpathEnabled !== false,
        aniportEnabled: electronPrefs.obj.AniPortEnabled === true, // Default to false on first install
        frogchangerEnabled: electronPrefs.obj.FrogChangerEnabled !== false,
        fakeGearEnabled: electronPrefs.obj.FakeGearEnabled === true, // Default to false (experimental)
        glassBlur: electronPrefs.obj.GlassBlur !== undefined ? electronPrefs.obj.GlassBlur : 6,
        useNativeFileBrowser: electronPrefs.obj.UseNativeFileBrowser === true // Default to false
      }));

      // Load wallpaper settings
      if (electronPrefs.obj.WallpaperPath) {
        setWallpaperPath(electronPrefs.obj.WallpaperPath);
      }
      if (electronPrefs.obj.WallpaperOpacity !== undefined) {
        setWallpaperOpacity(electronPrefs.obj.WallpaperOpacity);
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

  // Check for update/ritobin highlight flag (when user navigates from notifications)
  useEffect(() => {
    const checkHighlightFlag = () => {
      try {
        const shouldHighlight = localStorage.getItem('settings:highlight-update') === 'true' || DEV_SIMULATE_UPDATE_HIGHLIGHT;
        const shouldHighlightRitobin = localStorage.getItem('settings:highlight-ritobin') === 'true';
        const sectionToOpen = localStorage.getItem('settings:open-section');

        if (sectionToOpen === 'tools') {
          // Open the External Tools section first
          setSelectedSection('tools');
          localStorage.removeItem('settings:open-section');
        }

        // Handle ritobin highlight
        if (shouldHighlightRitobin) {
          localStorage.removeItem('settings:highlight-ritobin');
          
          // Ensure tools section is selected
          if (selectedSection !== 'tools') {
            setSelectedSection('tools');
          }
          
          setTimeout(() => {
            setHighlightRitobin(true);
            
            if (ritobinRef.current) {
              ritobinRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
              });
            }
            
            // Remove highlight after 5 seconds
            setTimeout(() => {
              setHighlightRitobin(false);
            }, 5000);
          }, 200);
        }

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

  // Setup update listeners and check version on mount
  useEffect(() => {
    const setupUpdateListeners = async () => {
      if (!window.require) return;

      const { ipcRenderer } = window.require('electron');

      // Get current version
      try {
        const versionResult = await ipcRenderer.invoke('update:get-version');
        if (versionResult.success) {
          setCurrentVersion(versionResult.version);
        }
      } catch (error) {
        console.error('Error getting version:', error);
      }

      // Listen for update events from main process
      ipcRenderer.on('update:checking', () => {
        setUpdateStatus('checking');
        setUpdateError('');
      });

      ipcRenderer.on('update:available', (event, data) => {
        setUpdateStatus('available');
        setNewVersion(data.version);
        setUpdateError('');
      });

      ipcRenderer.on('update:not-available', (event, data) => {
        setUpdateStatus('not-available');
        setNewVersion(data.version);
        setUpdateError('');
      });

      ipcRenderer.on('update:error', (event, data) => {
        setUpdateStatus('error');
        setUpdateError(data.message || 'Unknown error');
      });

      ipcRenderer.on('update:download-progress', (event, data) => {
        setUpdateStatus('downloading');
        setUpdateProgress(data);
      });

      ipcRenderer.on('update:downloaded', (event, data) => {
        setUpdateStatus('downloaded');
        setNewVersion(data.version);
        setUpdateError('');
      });

      // Cleanup listeners on unmount
      return () => {
        ipcRenderer.removeAllListeners('update:checking');
        ipcRenderer.removeAllListeners('update:available');
        ipcRenderer.removeAllListeners('update:not-available');
        ipcRenderer.removeAllListeners('update:error');
        ipcRenderer.removeAllListeners('update:download-progress');
        ipcRenderer.removeAllListeners('update:downloaded');
      };
    };

    setupUpdateListeners();
  }, []);

  // Apply font when selectedFont changes
  useEffect(() => {
    if (settings.selectedFont) {
      const applied = fontManager.getCurrentlyAppliedFont();
      if (settings.selectedFont !== applied) {
        console.log('🔄 Settings page applying font:', settings.selectedFont);
        fontManager.applyFont(settings.selectedFont)
          .then(() => electronPrefs.set('SelectedFont', settings.selectedFont))
          .catch(error => {
            console.error('Error applying font:', error);
            setSettings(prev => ({ ...prev, selectedFont: applied || 'system' }));
          });
      }
    }
  }, [settings.selectedFont]);

  // Handle theme change (Color)
  const handleThemeChange = async (themeId) => {
    let currentStyle;
    setSettings(prev => {
      currentStyle = prev.interfaceStyle || STYLES.QUARTZ; // Preserve current interface style
      return { ...prev, themeVariant: themeId };
    });

    // Save to electronPrefs
    try {
      await electronPrefs.set('ThemeVariant', themeId);
      // Apply the theme with preserved interface style
      themeManager.applyThemeVariables(themeId, currentStyle);
      // Ensure interface style is also saved (preserve it)
      await electronPrefs.set('InterfaceStyle', currentStyle);
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
  const handleCustomThemeValueChange = (field, value) => {
    setCustomThemeValues(prev => ({ ...prev, [field]: value }));
    if (livePreview) {
      // Debounce live preview to reduce lag while sliding
      if (livePreviewTimer.current) {
        clearTimeout(livePreviewTimer.current);
      }
      const next = { ...customThemeValues, [field]: value };
      livePreviewTimer.current = setTimeout(() => {
        try { applyThemeFromObject(next); } catch { }
      }, 120);
    }
  };

  // Handle color picker click - opens custom color picker for theme colors
  const handleThemeColorPickerClick = useCallback((event, field) => {
    // Clean up any existing pickers
    cleanupColorPickers();

    // Get current color value
    const currentHex = customThemeValues[field] || '#ffffff';

    // Create a mock palette structure for the CreatePicker function
    const mockPalette = [{
      ToHEX: () => customThemeValues[field] || '#ffffff',
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
      event.target // clickedColorDot for live preview
    );
  }, [customThemeValues, handleCustomThemeValueChange]);

  // Cleanup color pickers on unmount
  useEffect(() => {
    return () => {
      cleanupColorPickers();
    };
  }, []);

  // Update custom theme creator values when theme changes
  useEffect(() => {
    if (!settings.themeVariant) return;

    try {
      let themeColors = null;

      // Check if it's a custom theme
      if (settings.themeVariant.startsWith('custom:')) {
        const customThemeName = settings.themeVariant.replace('custom:', '');
        const customThemes = getCustomThemes();
        themeColors = customThemes[customThemeName];
      } else {
        // It's a premade theme
        themeColors = getCurrentTheme(settings.themeVariant);
      }

      if (themeColors) {
        // Update custom theme values with the selected theme's colors
        setCustomThemeValues(prev => ({
          ...prev,
          accent: themeColors.accent || prev.accent,
          accent2: themeColors.accent2 || prev.accent2,
          bg: themeColors.bg || prev.bg,
          surface: themeColors.surface || prev.surface,
          text: themeColors.text || prev.text,
        }));
      }
    } catch (error) {
      console.error('Error updating custom theme values from selected theme:', error);
    }
  }, [settings.themeVariant]);

  const handleToggleLivePreview = (enabled) => {
    setLivePreview(enabled);
    try {
      if (enabled) {
        applyThemeFromObject(customThemeValues);
      } else {
        // Restore current theme from settings
        themeManager.applyThemeVariables(settings.themeVariant || 'amethyst');
      }
    } catch { }
  };

  const handleSaveCustomTheme = async () => {
    if (!customThemeName) return;
    await setCustomTheme(customThemeName, customThemeValues);
    const updated = getCustomThemes();
    setCustomThemesMap(updated || {});
    console.log(`Theme '${customThemeName}' saved`);
  };

  const handleApplyCustomTheme = async () => {
    if (!customThemeName) return;
    await setCustomTheme(customThemeName, customThemeValues);
    const variant = `custom:${customThemeName}`;
    await handleThemeChange(variant);
    console.log(`Theme '${customThemeName}' applied`);
  };

  const handleDeleteCustomTheme = async (name) => {
    await deleteCustomTheme(name);
    const updated = getCustomThemes();
    setCustomThemesMap(updated || {});
    console.log(`Theme '${name}' deleted`);
  };

  const handleResetCustomTheme = () => {
    // Reset to Amethyst theme colors
    setCustomThemeValues({
      accent: '#ecb96a',
      accent2: '#c084fc',
      bg: '#0b0a0f',
      surface: '#0f0d14',
      text: '#ecb96a',
      accentMuted: '',
      bg2: '',
      surface2: '',
      text2: '',
      glassBg: '',
      glassBorder: '',
      glassShadow: ''
    });
  };

  // GitHub connection test handler
  const handleTestGitHubConnection = async () => {
    if (!settings.githubUsername || !settings.githubToken) {
      setConnectionStatus({
        type: 'error',
        message: 'Please enter both GitHub username and personal access token.'
      });
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus(null);

    try {
      // Test basic GitHub API access with user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${settings.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'VFXHub-App'
        }
      });

      if (!userResponse.ok) {
        throw new Error(`GitHub API Error: ${userResponse.status} ${userResponse.statusText}`);
      }

      const userData = await userResponse.json();

      // Check if the username matches
      if (userData.login.toLowerCase() !== settings.githubUsername.toLowerCase()) {
        throw new Error(`Username mismatch. Token belongs to '${userData.login}', but you entered '${settings.githubUsername}'.`);
      }

      // Test repository access if repo URL is provided
      if (settings.githubRepoUrl) {
        try {
          const repoMatch = settings.githubRepoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
          if (repoMatch) {
            const [, owner, repo] = repoMatch;
            const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
              headers: {
                'Authorization': `token ${settings.githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'VFXHub-App'
              }
            });

            if (repoResponse.ok) {
              setConnectionStatus({
                type: 'success',
                message: `✅ Successfully connected! Authenticated as '${userData.login}' with access to repository.`
              });
            } else if (repoResponse.status === 404) {
              setConnectionStatus({
                type: 'warning',
                message: `⚠️ Connected to GitHub as '${userData.login}', but repository access is limited (private repo or no access).`
              });
            } else {
              throw new Error(`Repository access error: ${repoResponse.status}`);
            }
          } else {
            setConnectionStatus({
              type: 'success',
              message: `✅ Successfully connected to GitHub as '${userData.login}'!`
            });
          }
        } catch (repoError) {
          setConnectionStatus({
            type: 'warning',
            message: `⚠️ Connected to GitHub as '${userData.login}', but couldn't verify repository access: ${repoError.message}`
          });
        }
      } else {
        setConnectionStatus({
          type: 'success',
          message: `✅ Successfully connected to GitHub as '${userData.login}'!`
        });
      }
    } catch (error) {
      console.error('GitHub connection test failed:', error);
      setConnectionStatus({
        type: 'error',
        message: `❌ Connection failed: ${error.message}`
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Hash download handler
  const handleDownloadHashes = async () => {
    setDownloadingHashes(true);
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('hashes:download');

        if (result.success) {
          console.log(`Successfully downloaded ${result.downloaded.length} hash file(s)!`);
          // Refresh hash status
          const statusResult = await ipcRenderer.invoke('hashes:check');
          setHashStatus(statusResult);

          // Clear cached hashtables so new hashes are loaded
          try {
            const { clearHashtablesCache } = await import('../jsritofile/index.js');
            clearHashtablesCache();
            console.log('Cleared hashtables cache after update');
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
  };

  // Update handlers
  const handleCheckForUpdates = async () => {
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
  };

  const handleDownloadUpdate = async () => {
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
  };

  const handleInstallUpdate = async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('update:install');
        if (!result.success) {
          setUpdateStatus('error');
          setUpdateError(result.error || 'Failed to install update');
        }
        // Note: The app will restart automatically if installation succeeds
      }
    } catch (error) {
      console.error('Error installing update:', error);
      setUpdateStatus('error');
      setUpdateError(error.message);
    }
  };

  // Wallpaper handlers
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
          const newPath = result.filePaths[0];
          setWallpaperPath(newPath);
          await electronPrefs.set('WallpaperPath', newPath);
          window.dispatchEvent(new CustomEvent('wallpaperChanged', {
            detail: { path: newPath, opacity: wallpaperOpacity }
          }));
        }
      }
    } catch (error) {
      console.error('Error selecting wallpaper:', error);
    }
  };

  const handleWallpaperOpacityChange = async (opacity) => {
    setWallpaperOpacity(opacity);
    await electronPrefs.set('WallpaperOpacity', opacity);
    window.dispatchEvent(new CustomEvent('wallpaperChanged', {
      detail: { path: wallpaperPath, opacity }
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
    await electronPrefs.set('WallpaperPath', '');
    window.dispatchEvent(new CustomEvent('wallpaperChanged', {
      detail: { path: '', opacity: wallpaperOpacity }
    }));
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

  // Render section content based on selected section
  const renderSectionContent = () => {
    switch (selectedSection) {
      case 'appearance':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Font Selection */}
            <FormGroup label="Font Family" description="Select the interface font">
              <CustomSelect
                value={safeSelectedFont}
                onChange={handleFontChange}
                icon={<Type size={16} />}
                disabled={isLoadingFonts}
                options={availableFonts.length > 0
                  ? availableFonts.map(font => ({
                    value: font.name,
                    label: font.displayName || font.name,
                    fontFamily: font.name
                  }))
                  : [{ value: 'system', label: 'System Default' }]
                }
              />
            </FormGroup>

            {/* Interface Style Selection */}
            <FormGroup label="Interface Style" description="Select the application's visual layout">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '12px'
              }}>
                {interfaceStyles.map(style => (
                  <ThemeCard
                    key={style.id}
                    theme={style}
                    selected={settings.interfaceStyle === style.id}
                    onClick={() => handleStyleChange(style.id)}
                  />
                ))}
              </div>
            </FormGroup>

            {/* Theme Selection */}
            <FormGroup
              label="Color Theme"
              description={settings.interfaceStyle === STYLES.CS16
                ? "Color selection is disabled in 1.6 style"
                : "Choose your preferred color scheme"}
            >
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '12px',
                opacity: settings.interfaceStyle === STYLES.CS16 ? 0.5 : 1,
                pointerEvents: settings.interfaceStyle === STYLES.CS16 ? 'none' : 'auto'
              }}>
                {builtInThemes.map(theme => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    selected={settings.themeVariant === theme.id}
                    onClick={() => handleThemeChange(theme.id)}
                  />
                ))}
                {Object.keys(customThemesMap).map((name) => (
                  <ThemeCard
                    key={`custom-${name}`}
                    theme={{ id: `custom:${name}`, name: name, desc: 'Custom Theme' }}
                    selected={settings.themeVariant === `custom:${name}`}
                    onClick={() => handleThemeChange(`custom:${name}`)}
                  />
                ))}
              </div>
            </FormGroup>

            {/* Wallpaper */}
            <FormGroup label="Wallpaper" description="Set a background image that covers the entire app">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {wallpaperPath && (
                  <div style={{
                    width: '100%',
                    height: '120px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    position: 'relative'
                  }}>
                    <img
                      src={`local-file:///${wallpaperPath.replace(/\\/g, '/')}`}
                      alt="Wallpaper preview"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: wallpaperOpacity
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      bottom: '8px',
                      left: '8px',
                      right: '8px',
                      fontSize: '11px',
                      color: 'rgba(255, 255, 255, 0.8)',
                      background: 'rgba(0, 0, 0, 0.6)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {wallpaperPath.split(/[/\\]/).pop()}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={wallpaperPath}
                    onChange={(e) => {
                      const newPath = e.target.value;
                      setWallpaperPath(newPath);
                      electronPrefs.set('WallpaperPath', newPath).then(() => {
                        window.dispatchEvent(new CustomEvent('wallpaperChanged', {
                          detail: { path: newPath, opacity: wallpaperOpacity }
                        }));
                      });
                    }}
                    placeholder="No wallpaper selected"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: 'var(--text)',
                      fontSize: '13px'
                    }}
                  />
                  <Button
                    icon={<Folder size={16} />}
                    variant="secondary"
                    onClick={handleBrowseWallpaper}
                  >
                    Browse
                  </Button>
                  {wallpaperPath && (
                    <Button
                      icon={<Trash2 size={16} />}
                      variant="secondary"
                      onClick={handleClearWallpaper}
                      style={{ padding: '8px 12px' }}
                    >
                    </Button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-2)', minWidth: '60px' }}>
                    Opacity: {Math.round(wallpaperOpacity * 100)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={wallpaperOpacity * 100}
                    onChange={(e) => handleWallpaperOpacityChange(parseFloat(e.target.value) / 100)}
                    style={{
                      flex: 1,
                      accentColor: 'var(--accent)'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-2)', minWidth: '60px' }}>
                    UI Blur: {settings.glassBlur}px
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    value={settings.glassBlur}
                    onChange={(e) => handleGlassBlurChange(parseInt(e.target.value))}
                    style={{
                      flex: 1,
                      accentColor: 'var(--accent)'
                    }}
                  />
                </div>
              </div>
            </FormGroup>

            {/* Click Effect */}
            <FormGroup label="Click Effect" description="Show interactive visual effects on click">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}>
                  <input
                    type="checkbox"
                    checked={clickEffectEnabled}
                    onChange={(e) => handleClickEffectToggle(e.target.checked)}
                    style={{
                      width: '18px',
                      height: '18px',
                      accentColor: 'var(--accent)',
                      cursor: 'pointer'
                    }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                    Enable click effects
                  </span>
                </label>

                <CustomSelect
                  icon={<Palette size={16} />}
                  value={clickEffectType}
                  onChange={handleClickEffectTypeChange}
                  disabled={!clickEffectEnabled}
                  options={[
                    { value: 'water', label: 'Water Ripple' },
                    { value: 'particles', label: 'Particle Burst' },
                    { value: 'pulse', label: 'Digital Pulse' },
                    { value: 'sparkle', label: 'Magic Sparkles' },
                    { value: 'glitch', label: 'Cyber Glitch' },
                    { value: 'galaxy', label: 'Cosmic Spiral' },
                    { value: 'firework', label: 'Neon Firework' }
                  ]}
                />
              </div>
            </FormGroup>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                icon={<Folder size={16} />}
                variant="secondary"
                onClick={handleOpenFontsFolder}
              >
                Open Fonts Folder
              </Button>
              <Button
                icon={<RefreshCw size={16} />}
                variant="secondary"
                onClick={handleRefreshFonts}
                disabled={isLoadingFonts}
              >
                {isLoadingFonts ? 'Refreshing...' : 'Refresh Fonts'}
              </Button>
            </div>
          </div>
        );
      case 'tools':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Ritobin Path */}
            <div
              ref={ritobinRef}
              style={{
                background: highlightRitobin
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'transparent',
                border: highlightRitobin
                  ? '2px solid rgba(239, 68, 68, 0.6)'
                  : '2px solid transparent',
                borderRadius: '8px',
                padding: highlightRitobin ? '12px' : '0',
                margin: highlightRitobin ? '-12px' : '0',
                transition: 'all 0.3s ease',
                boxShadow: highlightRitobin
                  ? '0 0 20px rgba(239, 68, 68, 0.3)'
                  : 'none'
              }}
            >
              <FormGroup
                label="Ritobin CLI Path"
                description="Path to ritobin_cli.exe for .bin file conversion"
              >
                <InputWithButton
                  value={settings.ritobinPath}
                  onChange={(e) => updateSetting('ritobinPath', e.target.value)}
                  placeholder="C:\FrogTools\ritobin_cli.exe"
                  buttonIcon={<Folder size={16} />}
                  buttonText="Browse"
                  onButtonClick={handleBrowseRitobin}
                />
              </FormGroup>
            </div>

            {/* File Browser Preference */}
            <FormGroup
              label="File Browser"
              description="Choose between custom or native Windows file browser"
            >
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                userSelect: 'none'
              }}>
                <input
                  type="checkbox"
                  checked={settings.useNativeFileBrowser}
                  onChange={(e) => updateSetting('useNativeFileBrowser', e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    accentColor: 'var(--accent)',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                  Use native Windows file dialog instead of custom explorer
                </span>
              </label>
            </FormGroup>

            {/* Hash Management */}
            <FormGroup
              label="Hash Files"
              description="Manage hash file downloads and updates"
            >
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '16px'
              }}>
                {hashStatus && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px'
                  }}>
                    <StatusBadge
                      status={hashStatus.allPresent ? "success" : "warning"}
                      text={
                        hashStatus.allPresent
                          ? `All hash files present (${hashStatus.missing.length === 0 ? '6/6' : `${6 - hashStatus.missing.length}/6`})`
                          : `Missing ${hashStatus.missing.length} file(s): ${hashStatus.missing.slice(0, 2).join(', ')}${hashStatus.missing.length > 2 ? '...' : ''}`
                      }
                    />
                  </div>
                )}
                <Button
                  icon={<Download size={16} />}
                  fullWidth
                  variant="secondary"
                  onClick={handleDownloadHashes}
                  disabled={downloadingHashes}
                >
                  {downloadingHashes ? 'Downloading...' : 'Download / Update Hashes'}
                </Button>
              </div>
            </FormGroup>

            {/* Update Management */}
            <FormGroup
              label="Application Updates"
              description="Check for and install updates"
            >
              <div
                ref={updateSectionRef}
                style={{
                  background: highlightUpdateSection
                    ? 'rgba(139, 92, 246, 0.15)'
                    : 'rgba(255, 255, 255, 0.02)',
                  border: highlightUpdateSection
                    ? '2px solid rgba(139, 92, 246, 0.6)'
                    : '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '16px',
                  transition: 'all 0.3s ease',
                  boxShadow: highlightUpdateSection
                    ? '0 0 20px rgba(139, 92, 246, 0.3)'
                    : 'none'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                  fontSize: '13px',
                  color: 'var(--accent2)'
                }}>
                  <span>Current Version:</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{currentVersion || 'Unknown'}</span>
                </div>

                {newVersion && newVersion !== currentVersion && (
                  <div style={{
                    marginBottom: '12px',
                    padding: '8px',
                    background: 'rgba(251, 191, 36, 0.1)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <AlertTriangle size={14} />
                    New Version Available: <strong>{newVersion}</strong>
                  </div>
                )}

                {updateStatus === 'downloading' && (
                  <div style={{
                    marginBottom: '12px',
                    fontSize: '12px',
                    color: 'var(--accent2)'
                  }}>
                    Downloading update: {Math.round(updateProgress.percent)}%
                    {updateProgress.total > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--text)', opacity: 0.7, marginTop: '4px' }}>
                        {Math.round(updateProgress.transferred / 1024 / 1024)} MB / {Math.round(updateProgress.total / 1024 / 1024)} MB
                      </div>
                    )}
                  </div>
                )}

                {updateError && (
                  <div style={{
                    marginBottom: '12px',
                    padding: '8px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#ef4444'
                  }}>
                    {updateError}
                  </div>
                )}

                {updateStatus === 'not-available' && (
                  <div style={{
                    marginBottom: '12px',
                    padding: '8px',
                    background: 'rgba(74, 222, 128, 0.1)',
                    border: '1px solid rgba(74, 222, 128, 0.3)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#4ade80',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <Check size={14} />
                    You are using the latest version!
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {updateStatus !== 'downloading' && updateStatus !== 'downloaded' && (
                    <Button
                      icon={updateStatus === 'checking' ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={16} />}
                      onClick={handleCheckForUpdates}
                      disabled={updateStatus === 'checking'}
                      variant="secondary"
                      style={{ flex: 1, minWidth: '150px' }}
                    >
                      {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
                    </Button>
                  )}

                  {updateStatus === 'available' && (
                    <Button
                      icon={<Download size={16} />}
                      onClick={handleDownloadUpdate}
                      variant="secondary"
                      style={{ flex: 1, minWidth: '150px' }}
                    >
                      Download Update
                    </Button>
                  )}

                  {updateStatus === 'downloaded' && (
                    <Button
                      icon={<Check size={16} />}
                      onClick={handleInstallUpdate}
                      variant="secondary"
                      style={{ flex: 1, minWidth: '150px' }}
                    >
                      Install Update
                    </Button>
                  )}
                </div>
              </div>
            </FormGroup>
          </div>
        );
      case 'pages':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Navigation Settings */}
            <FormGroup label="Navigation">
              <ToggleSwitch
                label="Auto-Load Last Bin Files"
                checked={settings.autoLoadEnabled}
                onChange={(checked) => updateSetting('autoLoadEnabled', checked)}
              />
              <ToggleSwitch
                label="Expand VFX Systems When Loading Bins"
                checked={settings.expandSystemsOnLoad}
                onChange={(checked) => updateSetting('expandSystemsOnLoad', checked)}
              />
            </FormGroup>

            {/* Page Toggles */}
            <FormGroup label="Available Pages">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '8px'
              }}>
                <ToggleSwitch
                  label="VFX Hub"
                  checked={settings.vfxHubEnabled}
                  onChange={(checked) => updateSetting('vfxHubEnabled', checked)}
                  compact
                />
                <ToggleSwitch
                  label="Bin Editor"
                  checked={settings.binEditorEnabled}
                  onChange={(checked) => updateSetting('binEditorEnabled', checked)}
                  compact
                />
                <ToggleSwitch
                  label="Img Recolor"
                  checked={settings.imgRecolorEnabled}
                  onChange={(checked) => updateSetting('imgRecolorEnabled', checked)}
                  compact
                />
                <ToggleSwitch
                  label="Upscale"
                  checked={settings.UpscaleEnabled}
                  onChange={(checked) => updateSetting('UpscaleEnabled', checked)}
                  compact
                />
                <ToggleSwitch
                  label="RGBA"
                  checked={settings.rgbaEnabled}
                  onChange={(checked) => updateSetting('rgbaEnabled', checked)}
                  compact
                />
                <ToggleSwitch
                  label="Tools"
                  checked={settings.toolsEnabled}
                  onChange={(checked) => updateSetting('toolsEnabled', checked)}
                  compact
                />
                <ToggleSwitch
                  label="File Randomizer"
                  checked={settings.fileRandomizerEnabled}
                  onChange={(checked) => updateSetting('fileRandomizerEnabled', checked)}
                  compact
                />
                <ToggleSwitch
                  label="Bumpath"
                  checked={settings.bumpathEnabled}
                  onChange={(checked) => updateSetting('bumpathEnabled', checked)}
                  compact
                />
                <ToggleSwitch
                  label="AniPort"
                  checked={settings.aniportEnabled}
                  onChange={(checked) => updateSetting('aniportEnabled', checked)}
                  compact
                />
                <ToggleSwitch
                  label="Frog Changer"
                  checked={settings.frogchangerEnabled}
                  onChange={(checked) => updateSetting('frogchangerEnabled', checked)}
                  compact
                />
                <ToggleSwitch
                  label="FakeGear"
                  checked={settings.fakeGearEnabled}
                  onChange={(checked) => updateSetting('fakeGearEnabled', checked)}
                  compact
                />
              </div>
            </FormGroup>
          </div>
        );
      case 'themeCreator':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Theme Name */}
            <FormGroup label="Theme Name" description="Name your custom theme">
              <Input
                value={customThemeName}
                onChange={(e) => setCustomThemeName(e.target.value)}
                placeholder="My Theme"
              />
            </FormGroup>

            {/* Basic Color Pickers */}
            <FormGroup label="Basic Colors" description="Set the main theme colors">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {['accent', 'accent2', 'bg', 'surface', 'text'].map((field) => (
                  <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: 'var(--accent2)',
                      minWidth: '80px'
                    }}>
                      {field.charAt(0).toUpperCase() + field.slice(1)}
                    </label>
                    <div
                      onClick={(e) => handleThemeColorPickerClick(e, field)}
                      style={{
                        width: '40px',
                        height: '32px',
                        border: '2px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '6px',
                        background: customThemeValues[field] || '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        flexShrink: 0
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    />
                    <Input
                      value={customThemeValues[field] || ''}
                      onChange={(e) => handleCustomThemeValueChange(field, e.target.value)}
                      placeholder="#ffffff"
                      style={{ flex: 1 }}
                    />
                  </div>
                ))}
              </div>
            </FormGroup>

            {/* Advanced Section */}
            <div style={{
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '8px',
              padding: '12px',
              background: 'rgba(255, 255, 255, 0.02)'
            }}>
              <button
                onClick={() => setShowAdvancedTheme(!showAdvancedTheme)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent2)',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: '4px 0',
                  fontFamily: 'inherit'
                }}
              >
                <span>Advanced</span>
                {showAdvancedTheme ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showAdvancedTheme && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '12px'
                  }}>
                    {['accentMuted', 'bg2', 'surface2', 'text2'].map((field) => (
                      <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          onClick={(e) => handleThemeColorPickerClick(e, field)}
                          style={{
                            width: '32px',
                            height: '32px',
                            border: '2px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '6px',
                            background: customThemeValues[field] || '#ffffff',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            flexShrink: 0
                          }}
                        />
                        <Input
                          value={customThemeValues[field] || ''}
                          onChange={(e) => handleCustomThemeValueChange(field, e.target.value)}
                          placeholder={field}
                          style={{ flex: 1 }}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '12px'
                  }}>
                    {['glassBg', 'glassBorder', 'glassShadow'].map((field) => (
                      <Input
                        key={field}
                        value={customThemeValues[field] || ''}
                        onChange={(e) => handleCustomThemeValueChange(field, e.target.value)}
                        placeholder={field}
                      />
                    ))}
                  </div>

                  <div style={{
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.01)'
                  }}>
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--accent2)',
                      marginBottom: '12px',
                      fontWeight: '600'
                    }}>
                      Derived Colors
                    </div>
                    {[
                      { key: 'accentMutedPercent', label: 'Accent Muted (darken %)', max: 60, source: 'accent' },
                      { key: 'bg2Percent', label: 'BG 2 (darken %)', max: 40, source: 'bg' },
                      { key: 'surface2Percent', label: 'Surface 2 (darken %)', max: 40, source: 'surface' },
                      { key: 'glassBgAlphaPercent', label: 'Glass BG alpha (%)', max: 80, source: null }
                    ].map(({ key, label, max, source }) => (
                      <div key={key} style={{ marginBottom: '12px' }}>
                        <div style={{
                          fontSize: '12px',
                          color: 'var(--accent2)',
                          marginBottom: '6px'
                        }}>
                          {label}: {advancedStrength[key]}%
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={max}
                          value={advancedStrength[key]}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setAdvancedStrength(prev => ({ ...prev, [key]: val }));
                            if (source) {
                              const derived = darkenHex(customThemeValues[source], val);
                              handleCustomThemeValueChange(key.replace('Percent', ''), derived);
                            } else {
                              const derived = withAlpha(customThemeValues.surface || customThemeValues.bg, val);
                              handleCustomThemeValueChange('glassBg', derived);
                            }
                          }}
                          style={{
                            width: '100%',
                            accentColor: 'var(--accent)'
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <ToggleSwitch
                label="Live Preview"
                checked={livePreview}
                onChange={(checked) => handleToggleLivePreview(checked)}
                compact
              />
              <Button icon={<RefreshCw size={16} />} variant="secondary" onClick={handleResetCustomTheme} hasWallpaper={!!wallpaperPath}>
                Reset
              </Button>
              <Button icon={<Check size={16} />} variant="secondary" onClick={handleApplyCustomTheme} hasWallpaper={!!wallpaperPath}>
                Save & Apply
              </Button>
              {customThemeName && customThemesMap[customThemeName] && (
                <Button
                  icon={<Trash2 size={16} />}
                  variant="secondary"
                  onClick={() => handleDeleteCustomTheme(customThemeName)}
                  hasWallpaper={!!wallpaperPath}
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        );
      case 'github':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup label="Username" description="Your GitHub username">
              <Input
                value={settings.githubUsername}
                onChange={(e) => updateSetting('githubUsername', e.target.value)}
                placeholder="e.g., frogcslol"
              />
            </FormGroup>

            <FormGroup label="Personal Access Token" description="Token with repo permissions">
              <InputWithToggle
                type={settings.showGithubToken ? 'text' : 'password'}
                value={settings.githubToken}
                onChange={(e) => updateSetting('githubToken', e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                showValue={settings.showGithubToken}
                onToggle={() => setSettings(prev => ({ ...prev, showGithubToken: !prev.showGithubToken }))}
              />
            </FormGroup>

            <FormGroup label="Repository URL" description="VFX Hub repository">
              <Input
                value={settings.githubRepoUrl}
                onChange={(e) => updateSetting('githubRepoUrl', e.target.value)}
                placeholder="https://github.com/..."
                icon={<Link size={16} />}
              />
            </FormGroup>

            {connectionStatus && (
              <div style={{
                padding: '12px',
                background: connectionStatus.type === 'success'
                  ? 'rgba(74, 222, 128, 0.1)'
                  : connectionStatus.type === 'warning'
                    ? 'rgba(251, 191, 36, 0.1)'
                    : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${connectionStatus.type === 'success'
                  ? 'rgba(74, 222, 128, 0.3)'
                  : connectionStatus.type === 'warning'
                    ? 'rgba(251, 191, 36, 0.3)'
                    : 'rgba(239, 68, 68, 0.3)'
                  }`,
                borderRadius: '6px',
                fontSize: '13px',
                color: connectionStatus.type === 'success'
                  ? '#4ade80'
                  : connectionStatus.type === 'warning'
                    ? '#fbbf24'
                    : '#ef4444'
              }}>
                {connectionStatus.message}
              </div>
            )}

            <Button
              icon={isTestingConnection ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Github size={16} />}
              fullWidth
              onClick={handleTestGitHubConnection}
              disabled={isTestingConnection || !settings.githubUsername || !settings.githubToken}
            >
              {isTestingConnection ? 'Testing...' : 'Test Connection'}
            </Button>
          </div>
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
                    ? (wallpaperPath ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.05)')
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
                  backdropFilter: wallpaperPath && selectedSection === section.id ? 'blur(8px) saturate(180%)' : 'none',
                  WebkitBackdropFilter: wallpaperPath && selectedSection === section.id ? 'blur(8px) saturate(180%)' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (selectedSection !== section.id) {
                    e.currentTarget.style.background = wallpaperPath ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.02)';
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
          background: wallpaperPath ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '24px',
          backdropFilter: wallpaperPath ? 'blur(16px) saturate(180%)' : 'none',
          WebkitBackdropFilter: wallpaperPath ? 'blur(16px) saturate(180%)' : 'none',
          boxShadow: wallpaperPath ? '0 4px 30px rgba(0, 0, 0, 0.3)' : 'none'
        }}>
          {renderSectionContent()}
        </div>
      </div>
    </div>
  );
};

// Reusable Components
const SettingsCard = ({ title, icon, expanded, onToggle, children, hasWallpaper = false }) => (
  <div style={{
    background: hasWallpaper ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    overflow: 'visible',
    transition: 'all 0.2s ease',
    height: 'fit-content',
    maxHeight: 'none',
    backdropFilter: hasWallpaper ? 'blur(16px) saturate(180%)' : 'none',
    WebkitBackdropFilter: hasWallpaper ? 'blur(16px) saturate(180%)' : 'none',
    zIndex: expanded ? 10 : 1,
    position: 'relative', // Ensure z-index works
    boxShadow: hasWallpaper ? '0 4px 30px rgba(0, 0, 0, 0.3)' : 'none'
  }}>
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onToggle) {
          onToggle();
        }
      }}
      type="button"
      style={{
        width: '100%',
        padding: '16px 20px',
        background: 'transparent',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        color: 'var(--accent)',
        fontFamily: 'inherit',
        fontSize: '16px',
        fontWeight: 'bold'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {icon}
        <span>{title}</span>
      </div>
      {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
    </button>
    {expanded && (
      <div style={{
        padding: '0 20px 20px 20px',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        overflow: 'visible'
      }}>
        {children}
      </div>
    )}
  </div>
);

const FormGroup = ({ label, description, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <div>
      <label style={{
        fontSize: '13px',
        fontWeight: '600',
        color: 'var(--accent2)',
        display: 'block'
      }}>
        {label}
      </label>
      {description && (
        <span style={{
          fontSize: '11px',
          color: 'var(--text)',
          opacity: 0.5,
          display: 'block',
          marginTop: '2px'
        }}>
          {description}
        </span>
      )}
    </div>
    {children}
  </div>
);

const Input = ({ icon, wrapperStyle, ...props }) => (
  <div style={{ position: 'relative', ...wrapperStyle }}>
    {icon && (
      <div style={{
        position: 'absolute',
        left: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--accent2)',
        pointerEvents: 'none'
      }}>
        {icon}
      </div>
    )}
    <input
      {...props}
      style={{
        width: '100%',
        padding: icon ? '10px 12px 10px 36px' : '10px 12px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '6px',
        color: 'var(--accent)',
        fontSize: '13px',
        fontFamily: 'inherit',
        outline: 'none',
        transition: 'all 0.2s ease',
        ...props.style
      }}
      onFocus={(e) => {
        e.target.style.borderColor = 'var(--accent)';
        e.target.style.background = 'rgba(255, 255, 255, 0.05)';
      }}
      onBlur={(e) => {
        e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        e.target.style.background = 'rgba(255, 255, 255, 0.03)';
      }}
    />
  </div>
);

const CustomSelect = ({ value, onChange, options, icon, disabled, placeholder = "Select..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div ref={containerRef} style={{ position: 'relative', opacity: disabled ? 0.6 : 1 }}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: icon ? '10px 32px 10px 36px' : '10px 32px 10px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: isOpen ? '1px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '6px',
          color: 'var(--accent)',
          fontSize: '13px',
          fontFamily: 'inherit',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          textAlign: 'left',
          transition: 'all 0.2s ease',
          position: 'relative'
        }}
      >
        {icon && (
          <div style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--accent2)',
            pointerEvents: 'none'
          }}>
            {icon}
          </div>
        )}
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selectedOption ? (selectedOption.label || selectedOption.value) : placeholder}
        </span>
        <ChevronDown
          size={16}
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--accent2)',
            pointerEvents: 'none',
            transition: 'transform 0.2s ease',
            transform: isOpen ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)'
          }}
        />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: '#121212', // Opaque background
          border: '1px solid var(--accent)',
          borderRadius: '6px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          maxHeight: '250px',
          overflowY: 'auto'
        }}
          className="theme-scrollbar"
        >
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                color: value === option.value ? 'var(--accent)' : 'var(--text)',
                background: value === option.value ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                transition: 'background 0.1s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: option.fontFamily || 'inherit', // Preview font if available
                borderBottom: '1px solid rgba(255, 255, 255, 0.03)'
              }}
              onMouseEnter={(e) => {
                if (value !== option.value) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              }}
              onMouseLeave={(e) => {
                if (value !== option.value) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span>{option.label || option.value}</span>
              {value === option.value && <Check size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const InputWithButton = ({ buttonIcon, buttonText, onButtonClick, ...props }) => (
  <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
    <Input {...props} wrapperStyle={{ flex: 1 }} />
    <Button icon={buttonIcon} variant="secondary" onClick={onButtonClick}>
      {buttonText}
    </Button>
  </div>
);

const InputWithToggle = ({ showValue, onToggle, ...props }) => (
  <div style={{ position: 'relative' }}>
    <Input {...props} />
    <button
      onClick={onToggle}
      style={{
        position: 'absolute',
        right: '8px',
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        padding: '4px',
        cursor: 'pointer',
        color: 'var(--accent2)',
        display: 'flex',
        alignItems: 'center',
        transition: 'color 0.2s ease'
      }}
      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--accent2)'}
    >
      {showValue ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  </div>
);

const Button = ({ icon, children, variant = 'primary', fullWidth, hasWallpaper = false, ...props }) => {
  // Check if parent has wallpaper by checking if we're inside a SettingsCard with hasWallpaper
  // For now, we'll use the hasWallpaper prop directly
  const isInWallpaperContext = hasWallpaper;

  return (
    <button
      {...props}
      style={{
        padding: '10px 16px',
        background: variant === 'primary'
          ? 'var(--accent)'
          : isInWallpaperContext
            ? 'rgba(0, 0, 0, 0.6)'
            : 'rgba(255, 255, 255, 0.03)',
        color: variant === 'primary' ? 'var(--bg)' : 'var(--accent2)',
        border: variant === 'primary' ? 'none' : '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '600',
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'all 0.2s ease',
        width: fullWidth ? '100%' : 'auto',
        whiteSpace: 'nowrap',
        opacity: props.disabled ? 0.6 : 1,
        pointerEvents: props.disabled ? 'none' : 'auto',
        backdropFilter: isInWallpaperContext ? 'blur(12px) saturate(180%)' : 'none',
        WebkitBackdropFilter: isInWallpaperContext ? 'blur(12px) saturate(180%)' : 'none',
        boxShadow: isInWallpaperContext ? '0 2px 12px rgba(0, 0, 0, 0.4)' : 'none',
        ...(props.style || {})
      }}
      onMouseEnter={(e) => {
        if (variant === 'primary') {
          e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 90%, black)';
        } else {
          e.currentTarget.style.background = isInWallpaperContext ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.borderColor = 'var(--accent)';
        }
      }}
      onMouseLeave={(e) => {
        if (variant === 'primary') {
          e.currentTarget.style.background = 'var(--accent)';
        } else {
          e.currentTarget.style.background = isInWallpaperContext ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.03)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        }
      }}
    >
      {icon}
      {children}
    </button>
  );
};

const ToggleSwitch = ({ label, checked, onChange, compact }) => (
  <label style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    cursor: 'pointer',
    padding: compact ? '6px 0' : '10px 0',
    userSelect: 'none'
  }}>
    <span style={{
      fontSize: compact ? '12px' : '13px',
      color: 'var(--text)',
      fontWeight: '400',
      flex: 1
    }}>
      {label}
    </span>
    <div
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      style={{
        width: '44px',
        height: '24px',
        background: checked
          ? 'var(--accent)'
          : 'rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        position: 'relative',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        flexShrink: 0,
        border: checked
          ? 'none'
          : '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: checked
          ? '0 0 0 2px rgba(139, 92, 246, 0.2), 0 2px 8px rgba(139, 92, 246, 0.3)'
          : 'inset 0 2px 4px rgba(0, 0, 0, 0.1)',
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => {
        if (!checked) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }
      }}
      onMouseLeave={(e) => {
        if (!checked) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        }
      }}
    >
      <div style={{
        width: '18px',
        height: '18px',
        background: checked ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
        borderRadius: '50%',
        position: 'absolute',
        top: '3px',
        left: checked ? '23px' : '3px',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: checked
          ? '0 2px 6px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)'
          : '0 1px 3px rgba(0, 0, 0, 0.2)'
      }} />
    </div>
  </label>
);

const ThemeCard = ({ theme, selected, onClick }) => {
  // Handle both object format { id, name, desc } and string format
  const themeId = typeof theme === 'string' ? theme : theme.id;
  const themeName = typeof theme === 'string' ? theme : theme.name;
  const themeDesc = typeof theme === 'string' ? 'Custom Theme' : theme.desc;
  const isCustom = typeof themeId === 'string' && themeId.startsWith('custom:');

  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px',
        background: selected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
        border: `2px solid ${selected ? 'var(--accent)' : 'rgba(255, 255, 255, 0.06)'}`,
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textAlign: 'left',
        fontFamily: 'inherit'
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
        }
      }}
    >
      <div style={{
        fontSize: '13px',
        fontWeight: 'bold',
        color: 'var(--accent)',
        marginBottom: '4px'
      }}>
        {themeName}
      </div>
      <div style={{
        fontSize: '11px',
        color: 'var(--accent2)',
        opacity: 0.7
      }}>
        {themeDesc}
      </div>
    </button>
  );
};

const StatusBadge = ({ status, text }) => (
  <div style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: status === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 191, 36, 0.1)',
    border: `1px solid ${status === 'success' ? 'rgba(74, 222, 128, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`,
    borderRadius: '6px',
    fontSize: '12px',
    color: status === 'success' ? '#4ade80' : '#fbbf24'
  }}>
    {status === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
    {text}
  </div>
);

export default ModernSettings;