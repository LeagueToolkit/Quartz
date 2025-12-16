import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Save, RefreshCw, Folder, Check, AlertTriangle,
  Type, Github, Link, Eye, EyeOff, ChevronDown, ChevronUp,
  Download, Upload, Terminal, Trash2, Palette, HardDrive
} from 'lucide-react';
// Import theme management
import themeManager, { applyThemeFromObject, setCustomTheme, getCustomThemes, deleteCustomTheme, STYLES } from '../utils/themeManager.js';
import electronPrefs from '../utils/electronPrefs.js';
import fontManager from '../utils/fontManager.js';
import { CreatePicker, cleanupColorPickers } from '../utils/colorUtils.js';
import ColorHandler from '../utils/ColorHandler.js';

const ModernSettings = () => {
  const [expandedSections, setExpandedSections] = useState({
    appearance: false,
    tools: false,
    pages: false,
    github: false,
    themeCreator: false
  });

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
    aniportEnabled: true,
    frogchangerEnabled: false
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

  const toggleSection = useCallback((section) => {
    setExpandedSections(prev => {
      // Create a completely new object to avoid any reference issues
      return {
        appearance: section === 'appearance' ? !prev.appearance : prev.appearance,
        tools: section === 'tools' ? !prev.tools : prev.tools,
        pages: section === 'pages' ? !prev.pages : prev.pages,
        github: section === 'github' ? !prev.github : prev.github,
        themeCreator: section === 'themeCreator' ? !prev.themeCreator : prev.themeCreator,
      };
    });
  }, []);

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
        default:
          // For other settings, try to save with the key name
          await electronPrefs.set(key, value);
      }

      // Dispatch settings changed event for navigation updates (matching Settings4.js)
      if (['themeVariant', 'interfaceStyle', 'paintEnabled', 'portEnabled', 'vfxHubEnabled', 'rgbaEnabled', 'imgRecolorEnabled', 'binEditorEnabled', 'toolsEnabled', 'fileRandomizerEnabled', 'bumpathEnabled', 'aniportEnabled', 'frogchangerEnabled', 'UpscaleEnabled'].includes(key)) {
        window.dispatchEvent(new CustomEvent('settingsChanged'));
      }
    } catch (error) {
      console.error(`Error saving setting ${key}:`, error);
    }
  };

  const handleBrowseRitobin = async () => {
    try {
      const newPath = await electronPrefs.RitoBinPath();
      if (newPath) {
        updateSetting('ritobinPath', newPath);
      }
    } catch (error) {
      console.error('Error setting RitoBinPath:', error);
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
        aniportEnabled: electronPrefs.obj.AniPortEnabled !== false,
        frogchangerEnabled: electronPrefs.obj.FrogChangerEnabled !== false
      }));

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
    setSettings(prev => ({ ...prev, themeVariant: themeId }));

    // Save to electronPrefs
    try {
      await electronPrefs.set('ThemeVariant', themeId);
      // Apply the theme with current style
      themeManager.applyThemeVariables(themeId, settings.interfaceStyle);
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

  return (
    <div style={{
      width: '100%',
      minHeight: '100%',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: "'JetBrains Mono', monospace",
      padding: '24px'
    }}>
      {/* Main Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
        gap: '20px',
        maxWidth: '1400px',
        width: '100%',
        overflow: 'visible'
      }}>
        {/* Appearance Section */}
        <SettingsCard
          key="appearance-card"
          title="Appearance"
          icon={<Palette size={20} />}
          expanded={expandedSections.appearance}
          onToggle={() => toggleSection('appearance')}
        >
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
                    fontFamily: font.name // Pass font family for preview
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
                {/* Custom themes */}
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
        </SettingsCard>

        {/* External Tools */}
        <SettingsCard
          key="tools-card"
          title="External Tools"
          icon={<Terminal size={20} />}
          expanded={expandedSections.tools}
          onToggle={() => toggleSection('tools')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Ritobin Path */}
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
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '16px'
              }}>
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
                      style={{ flex: 1, minWidth: '150px' }}
                    >
                      Install Update
                    </Button>
                  )}
                </div>
              </div>
            </FormGroup>
          </div>
        </SettingsCard>

        {/* Page Visibility */}
        <SettingsCard
          title="Page Visibility"
          icon={<Eye size={20} />}
          expanded={expandedSections.pages}
          onToggle={() => toggleSection('pages')}
        >
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
                  label="Paint Page"
                  checked={settings.paintEnabled}
                  onChange={(checked) => updateSetting('paintEnabled', checked)}
                  compact
                />
                <ToggleSwitch
                  label="Port"
                  checked={settings.portEnabled}
                  onChange={(checked) => updateSetting('portEnabled', checked)}
                  compact
                />
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
              </div>
            </FormGroup>
          </div>
        </SettingsCard>

        {/* Custom Theme Creator */}
        <SettingsCard
          title="Custom Theme Creator"
          icon={<Palette size={20} />}
          expanded={expandedSections.themeCreator}
          onToggle={() => toggleSection('themeCreator')}
        >
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
                  {/* Advanced Color Fields */}
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

                  {/* Glass Properties */}
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

                  {/* Derived Color Sliders */}
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
              <Button icon={<RefreshCw size={16} />} variant="secondary" onClick={handleResetCustomTheme}>
                Reset
              </Button>
              <Button icon={<Save size={16} />} variant="secondary" onClick={handleSaveCustomTheme}>
                Save
              </Button>
              <Button icon={<Check size={16} />} onClick={handleApplyCustomTheme}>
                Save & Apply
              </Button>
              {customThemeName && customThemesMap[customThemeName] && (
                <Button
                  icon={<Trash2 size={16} />}
                  variant="secondary"
                  onClick={() => handleDeleteCustomTheme(customThemeName)}
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        </SettingsCard>

        {/* GitHub Integration */}
        <SettingsCard
          title="GitHub Integration"
          icon={<Github size={20} />}
          expanded={expandedSections.github}
          onToggle={() => toggleSection('github')}
        >
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
        </SettingsCard>
      </div>

    </div>
  );
};

// Reusable Components
const SettingsCard = ({ title, icon, expanded, onToggle, children }) => (
  <div style={{
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    overflow: 'visible',
    transition: 'all 0.2s ease',
    height: 'fit-content',
    maxHeight: 'none'
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
          background: 'var(--surface)',
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

const Button = ({ icon, children, variant = 'primary', fullWidth, ...props }) => (
  <button
    {...props}
    style={{
      padding: '10px 16px',
      background: variant === 'primary' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.03)',
      color: variant === 'primary' ? 'var(--bg)' : 'var(--accent2)',
      border: variant === 'primary' ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
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
      whiteSpace: 'nowrap'
    }}
    onMouseEnter={(e) => {
      if (variant === 'primary') {
        e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 90%, black)';
      } else {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        e.currentTarget.style.borderColor = 'var(--accent)';
      }
    }}
    onMouseLeave={(e) => {
      if (variant === 'primary') {
        e.currentTarget.style.background = 'var(--accent)';
      } else {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      }
    }}
  >
    {icon}
    {children}
  </button>
);

const ToggleSwitch = ({ label, checked, onChange, compact }) => (
  <label style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    cursor: 'pointer',
    padding: compact ? '8px' : '12px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '6px',
    transition: 'background 0.2s ease'
  }}
    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
  >
    <span style={{
      fontSize: compact ? '12px' : '13px',
      color: 'var(--accent2)',
      fontWeight: '500'
    }}>
      {label}
    </span>
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '40px',
        height: '22px',
        background: checked ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)',
        borderRadius: '11px',
        position: 'relative',
        transition: 'background 0.2s ease',
        flexShrink: 0
      }}
    >
      <div style={{
        width: '18px',
        height: '18px',
        background: 'white',
        borderRadius: '50%',
        position: 'absolute',
        top: '2px',
        left: checked ? '20px' : '2px',
        transition: 'left 0.2s ease',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
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