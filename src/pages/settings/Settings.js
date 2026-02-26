import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Github, Eye, Terminal, Palette, HardDrive
} from 'lucide-react';
// Import theme management
import themeManager, { applyThemeFromObject, setCustomTheme, getCustomThemes, deleteCustomTheme, getCurrentTheme, STYLES } from '../../utils/theme/themeManager.js';
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


  // DEV: Set to true to simulate update highlight for testing
  const DEV_SIMULATE_UPDATE_HIGHLIGHT = false;

  // Wallpaper state
  const [wallpaperPath, setWallpaperPath] = useState('');
  const [wallpaperOpacity, setWallpaperOpacity] = useState(0.15);

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
        default:
          // For other settings, try to save with the key name
          await electronPrefs.set(key, value);
      }

      // Dispatch settings changed event for navigation updates (matching Settings4.js)
      if (['themeVariant', 'interfaceStyle', 'paintEnabled', 'portEnabled', 'vfxHubEnabled', 'rgbaEnabled', 'imgRecolorEnabled', 'binEditorEnabled', 'toolsEnabled', 'fileRandomizerEnabled', 'bnkExtractEnabled', 'bumpathEnabled', 'aniportEnabled', 'frogchangerEnabled', 'fakeGearEnabled', 'UpscaleEnabled', 'particleRandomizerEnabled', 'wadExplorerEnabled'].includes(key)) {
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
    { id: 'neon', name: 'Neon', desc: 'Cyan + Pink' },
    { id: 'aurora', name: 'Aurora', desc: 'Mint + Lime' },
    { id: 'solar', name: 'Solar', desc: 'Orange + Gold' },
    { id: 'charcoalOlive', name: 'Charcoal Olive', desc: 'Graphite + Olive' },
    { id: 'quartz', name: 'Quartz', desc: 'Flask + Galaxy' },
    { id: 'futuristQuartz', name: 'Futurist Quartz', desc: 'Rose + Smoky' },
    { id: 'cyberQuartz', name: 'Cyber Quartz', desc: 'Cyan + Purple' },
    { id: 'crystal', name: 'Crystal', desc: 'White + Blue Iridescent' },
    { id: 'classicGray', name: 'Classic Gray', desc: 'Windows Dark Mode' },
    { id: 'divine', name: 'Divine', desc: 'Purple + Gold (Divine Skins)' },
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

  const handleWallpaperPathChange = async (newPath) => {
    setWallpaperPath(newPath);
    await electronPrefs.set('WallpaperPath', newPath);
    window.dispatchEvent(new CustomEvent('wallpaperChanged', {
      detail: { path: newPath, opacity: wallpaperOpacity }
    }));
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

  useEffect(() => {
    if (cursorEffectEnabled) loadCursorFiles();
  }, [cursorEffectEnabled]); // eslint-disable-line

  // Render section content based on selected section
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
            STYLES={STYLES}
            wallpaperPath={wallpaperPath}
            wallpaperOpacity={wallpaperOpacity}
            handleWallpaperPathChange={handleWallpaperPathChange}
            handleBrowseWallpaper={handleBrowseWallpaper}
            handleClearWallpaper={handleClearWallpaper}
            handleWallpaperOpacityChange={handleWallpaperOpacityChange}
            handleGlassBlurChange={handleGlassBlurChange}
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
            hashStatus={hashStatus}
            downloadingHashes={downloadingHashes}
            handleDownloadHashes={handleDownloadHashes}
            updateSectionRef={updateSectionRef}
            highlightUpdateSection={highlightUpdateSection}
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
            handleThemeColorPickerClick={handleThemeColorPickerClick}
            handleCustomThemeValueChange={handleCustomThemeValueChange}
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
            wallpaperPath={wallpaperPath}
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

export default ModernSettings;








