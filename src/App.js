import React, { useEffect, useState, useMemo, useLayoutEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import './styles/theme-variables.css';
import ModernNavigation from './components/app-shell/ModernNavigation';
import CustomTitleBar, { TITLE_BAR_HEIGHT } from './components/app-shell/CustomTitleBar';
import MainPage from './pages/MainPage';
import Paint2 from './pages/paint2';
import Port from './pages/port2';
import VFXHub from './pages/vfxhub/VFXHub';
import RGBA from './pages/RGBA';

import ImgRecolor from './pages/imgrecolor/ImgRecolor';
import BinEditorV2 from './pages/bineditor/BinEditorV2';
import Tools from './pages/Tools';
import Settings from './pages/settings';
// HUD Editor moved to archived/removed-features/hud-editor/
import Upscale from './pages/Upscale';
import UniversalFileRandomizer from './pages/UniversalFileRandomizer';
import Bumpath from './pages/bumpath';
import AniPort from './pages/aniport/AniPortSimple';
import FrogChanger from './pages/frogchanger/FrogChanger';
import BnkExtract from './pages/bnkextract/BnkExtract';
import FakeGearSkin from './pages/fakegearskin/FakeGearSkin';
import ParticleRandomizer from './pages/ParticleRandomizer';
import HashReminderModal from './components/modals/HashReminderModal';
import AssetPreviewModal from './components/modals/AssetPreviewModal';
import ScbInspectModalHost from './components/model-inspect/ScbInspectModalHost';
import InlineModelInspectHost from './components/model-inspect/InlineModelInspectHost';
import GlobalClickEffect from './components/ClickEffects/GlobalClickEffect';
import GlobalBackgroundEffect from './components/BackgroundEffects/GlobalBackgroundEffect';
import GlobalCursorEffect from './components/CursorEffects/GlobalCursorEffect';
import GlobalUpdateNotification from './components/app-shell/GlobalUpdateNotification';
import AppModalWheel from './components/debug/AppModalWheel';

import fontManager from './utils/theme/fontManager.js';
import electronPrefs from './utils/core/electronPrefs.js';
import themeManager from './utils/theme/themeManager.js';

// Component to handle font persistence on route changes
const FontPersistenceHandler = () => {
  const location = useLocation();

  useEffect(() => {
    // Ensure font persistence when route changes
    console.log('🔄 Route changed to:', location.pathname);
    fontManager.ensureFontPersistence();

    // Also check font persistence after a short delay to catch any late resets
    const timeoutId = setTimeout(() => {
      console.log('⏰ Delayed font persistence check for route:', location.pathname);
      fontManager.ensureFontPersistence();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [location]);

  return null;
};

// Bridge Celestia guide CTA navigation into the router
const CelestiaNavigationBridge = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event) => {
      const path = event?.detail?.path;
      if (typeof path === 'string' && path.length > 0) {
        navigate(path);
      }
    };
    window.addEventListener('celestia:navigate', handler);
    return () => window.removeEventListener('celestia:navigate', handler);
  }, [navigate]);
  return null;
};

// Dynamic theme generator using computed CSS variables
function createDynamicTheme(fontFamily) {
  // Get computed CSS variable values for MUI
  const getCSSVar = (varName, fallback = '#8b5cf6') => {
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      return value || fallback;
    }
    return fallback;
  };

  return createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: getCSSVar('--accent', '#8b5cf6'),
        light: getCSSVar('--accent', '#a78bfa'),
        dark: getCSSVar('--accent-muted', '#6d28d9'),
      },
      secondary: {
        main: getCSSVar('--accent2', '#c084fc'),
        light: getCSSVar('--accent2', '#d8b4fe'),
        dark: getCSSVar('--accent2', '#7c3aed'),
      },
      background: {
        default: getCSSVar('--bg', '#121212'),
        paper: getCSSVar('--surface', '#1a1a1a'),
      },
      text: {
        primary: getCSSVar('--text', '#ffffff'),
        secondary: getCSSVar('--text-2', '#b3b3b3'),
      },
      divider: getCSSVar('--bg', '#333'),
    },
    typography: {
      fontFamily: fontFamily,
      h1: {
        fontSize: '2.5rem',
        fontWeight: 300,
      },
      h2: {
        fontSize: '2.0rem',
        fontWeight: 300,
      },
      h3: {
        fontSize: '1.75rem',
        fontWeight: 400,
      },
      h4: {
        fontSize: '1.5rem',
        fontWeight: 400,
      },
      h5: {
        fontSize: '1.25rem',
        fontWeight: 400,
      },
      h6: {
        fontSize: '1rem',
        fontWeight: 500,
      },
    },
    components: {
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'saturate(180%) blur(14px)',
            WebkitBackdropFilter: 'saturate(180%) blur(14px)',
          },
          arrow: {
            color: 'var(--glass-bg)'
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: 'var(--glass-bg)',
            borderRight: '1px solid var(--glass-border)',
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: 'var(--glass-bg)',
            borderBottom: '1px solid var(--glass-border)',
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 999,
            backgroundColor: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'saturate(180%) blur(12px)',
            WebkitBackdropFilter: 'saturate(180%) blur(12px)',
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: 'var(--surface-2)',
            },
          },
        },
      },
    },
  });
}

function App() {
  const [currentFont, setCurrentFont] = useState('system');
  const [fontFamily, setFontFamily] = useState('');
  const [themeVariant, setThemeVariant] = useState('onyx');
  const [interfaceStyle, setInterfaceStyle] = useState('quartz');
  const [themeReady, setThemeReady] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [wallpaperPath, setWallpaperPath] = useState('');
  const [wallpaperOpacity, setWallpaperOpacity] = useState(0.15);
  const [glassBlur, setGlassBlur] = useState(6);
  const [clickEffectEnabled, setClickEffectEnabled] = useState(false);
  const [clickEffectType, setClickEffectType] = useState('water');
  const [backgroundEffectEnabled, setBackgroundEffectEnabled] = useState(false);
  const [backgroundEffectType, setBackgroundEffectType] = useState('fireflies');
  const [cursorEffectEnabled, setCursorEffectEnabled] = useState(false);
  const [cursorEffectPath, setCursorEffectPath] = useState('');
  const [cursorEffectSize, setCursorEffectSize] = useState(32);

  useEffect(() => {
    // Load theme preference and wallpaper
    (async () => {
      try {
        await electronPrefs.initPromise;

        // If ThemeVariant is not set (first run), set it to amethyst and save it
        if (electronPrefs.obj.ThemeVariant === undefined) {
          electronPrefs.obj.ThemeVariant = 'amethyst';
          await electronPrefs.save();
          setThemeVariant('amethyst');
        } else {
          // Use saved theme (no fallback - if it's saved, use it)
          setThemeVariant(electronPrefs.obj.ThemeVariant);
        }

        // Load Interface Style
        if (electronPrefs.obj.InterfaceStyle) {
          setInterfaceStyle(electronPrefs.obj.InterfaceStyle);
        }

        // Load wallpaper settings
        if (electronPrefs.obj.WallpaperPath) {
          setWallpaperPath(electronPrefs.obj.WallpaperPath);
        }
        if (electronPrefs.obj.WallpaperOpacity !== undefined) {
          setWallpaperOpacity(electronPrefs.obj.WallpaperOpacity);
        }
        if (electronPrefs.obj.GlassBlur !== undefined) {
          setGlassBlur(electronPrefs.obj.GlassBlur);
        }
      } catch { }
    })();

    // Listen for settings changes to update theme live
    const onSettingsChanged = () => {
      try {
        // Use saved theme directly (no fallback)
        if (electronPrefs.obj.ThemeVariant) {
          setThemeVariant(electronPrefs.obj.ThemeVariant);
        }
        // Check for style change
        if (electronPrefs.obj.InterfaceStyle) {
          setInterfaceStyle(electronPrefs.obj.InterfaceStyle);
        }
      } catch { }
    };
    window.addEventListener('settingsChanged', onSettingsChanged);

    // Listen for wallpaper changes
    const onWallpaperChanged = (event) => {
      const { path, opacity } = event.detail || {};
      if (path !== undefined) setWallpaperPath(path);
      if (opacity !== undefined) setWallpaperOpacity(opacity);
    };
    window.addEventListener('wallpaperChanged', onWallpaperChanged);

    // Listen for glass blur changes
    const onGlassBlurChanged = (event) => {
      const { amount } = event.detail || {};
      if (amount !== undefined) setGlassBlur(amount);
    };
    window.addEventListener('glassBlurChanged', onGlassBlurChanged);

    // Listen for click effect changes
    const onClickEffectChanged = (event) => {
      const { enabled, type } = event.detail || {};
      if (enabled !== undefined) setClickEffectEnabled(enabled);
      if (type !== undefined) setClickEffectType(type);
    };
    window.addEventListener('clickEffectChanged', onClickEffectChanged);

    // Listen for background effect changes
    const onBackgroundEffectChanged = (event) => {
      const { enabled, type } = event.detail || {};
      if (enabled !== undefined) setBackgroundEffectEnabled(enabled);
      if (type !== undefined) setBackgroundEffectType(type);
    };
    window.addEventListener('backgroundEffectChanged', onBackgroundEffectChanged);

    // Listen for cursor effect changes
    const onCursorEffectChanged = (event) => {
      const { enabled, path, size } = event.detail || {};
      if (enabled !== undefined) setCursorEffectEnabled(enabled);
      if (path !== undefined) setCursorEffectPath(path);
      if (size !== undefined) setCursorEffectSize(size);
    };
    window.addEventListener('cursorEffectChanged', onCursorEffectChanged);

    // Load click effect setting
    if (electronPrefs.obj.ClickEffectEnabled !== undefined) {
      setClickEffectEnabled(electronPrefs.obj.ClickEffectEnabled);
    }
    if (electronPrefs.obj.ClickEffectType !== undefined) {
      setClickEffectType(electronPrefs.obj.ClickEffectType);
    }

    // Load background effect setting
    if (electronPrefs.obj.BackgroundEffectEnabled !== undefined) {
      setBackgroundEffectEnabled(electronPrefs.obj.BackgroundEffectEnabled);
    }
    if (electronPrefs.obj.BackgroundEffectType !== undefined) {
      setBackgroundEffectType(electronPrefs.obj.BackgroundEffectType);
    }

    // Load cursor effect setting
    if (electronPrefs.obj.CursorEffectEnabled !== undefined) {
      setCursorEffectEnabled(electronPrefs.obj.CursorEffectEnabled);
    }
    if (electronPrefs.obj.CursorEffectPath !== undefined) {
      setCursorEffectPath(electronPrefs.obj.CursorEffectPath);
    }
    if (electronPrefs.obj.CursorEffectSize !== undefined) {
      setCursorEffectSize(electronPrefs.obj.CursorEffectSize);
    }

    // Listen for global font changes from fontManager
    const handleGlobalFontChange = (event) => {
      console.log('🎯 Global font change received:', event.detail);
      const { fontName, fontFamily: newFontFamily } = event.detail;
      setCurrentFont(fontName);
      setFontFamily(newFontFamily || '');
    };

    // Listen for legacy font change events (for backward compatibility)
    const handleFontChange = (event) => {
      console.log('📢 Legacy font change event received:', event.detail);
      setCurrentFont(event.detail.fontName);
    };

    window.addEventListener('globalFontChange', handleGlobalFontChange);
    document.addEventListener('fontChanged', handleFontChange);

    // Listen for app closing event
    const handleAppClosing = () => {
      console.log('🔄 App is closing, showing shutdown message...');
      setIsClosing(true);
    };

    // Add IPC listener for app closing
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.on('app:closing', handleAppClosing);
    }

    // Initialize fonts on app startup AFTER listeners are attached
    fontManager.init().then(async () => {
      // Ensure font persistence after initialization
      await fontManager.ensureFontPersistence();
      // Proactively emit current font so theme syncs even if init fired events before listeners
      try {
        const applied = fontManager.getCurrentlyAppliedFont();
        const appliedFamily = applied === 'system'
          ? 'var(--app-font-family), "Roboto", "Helvetica", "Arial", sans-serif'
          : `'${applied}', 'Courier New', monospace`;
        window.dispatchEvent(new CustomEvent('globalFontChange', {
          detail: { fontName: applied || 'system', fontFamily: appliedFamily }
        }));
      } catch { }
    });

    return () => {
      window.removeEventListener('settingsChanged', onSettingsChanged);
      window.removeEventListener('wallpaperChanged', onWallpaperChanged);
      window.removeEventListener('glassBlurChanged', onGlassBlurChanged);
      window.removeEventListener('clickEffectChanged', onClickEffectChanged);
      window.removeEventListener('backgroundEffectChanged', onBackgroundEffectChanged);
      window.removeEventListener('cursorEffectChanged', onCursorEffectChanged);
      window.removeEventListener('globalFontChange', handleGlobalFontChange);
      document.removeEventListener('fontChanged', handleFontChange);

      // Cleanup IPC listener
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.removeListener('app:closing', handleAppClosing);
      }
    };
  }, []);

  // Pre-apply CSS variables synchronously before paint to prevent flash with wrong colors
  useLayoutEffect(() => {
    try {
      themeManager.applyThemeVariables(themeVariant, interfaceStyle);
    } finally {
      setThemeReady(true);
    }
  }, [themeVariant, interfaceStyle]);

  // Apply glass blur intensity to CSS variable
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--glass-blur', `${glassBlur}px`);
  }, [glassBlur]);

  // Create theme with current font
  const theme = useMemo(() => {
    let themeFontFamily;

    if (currentFont === 'system' || !fontFamily) {
      // Use system fonts or CSS variable fallback
      themeFontFamily = 'var(--app-font-family), "Roboto", "Helvetica", "Arial", sans-serif';
    } else {
      // Use the specific font family from fontManager
      themeFontFamily = fontFamily;
    }

    console.log('🎨 Creating theme with variant:', themeVariant, 'style:', interfaceStyle, 'font:', currentFont, 'family:', themeFontFamily);

    // Ensure variables also applied when theme object rebuilds (idempotent)
    try { themeManager.applyThemeVariables(themeVariant, interfaceStyle); } catch { }

    return createDynamicTheme(themeFontFamily);
  }, [currentFont, fontFamily, themeVariant, interfaceStyle]);

  return (
    themeReady && (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <HashReminderModal />
          <AssetPreviewModal />
          <ScbInspectModalHost />
          <InlineModelInspectHost />
          <FontPersistenceHandler />
          <CelestiaNavigationBridge />
          <GlobalUpdateNotification />
          {false && <AppModalWheel />}
          <GlobalClickEffect enabled={clickEffectEnabled} type={clickEffectType} />
          <GlobalBackgroundEffect enabled={backgroundEffectEnabled} type={backgroundEffectType} />
          <GlobalCursorEffect enabled={cursorEffectEnabled} path={cursorEffectPath} size={cursorEffectSize} />
          <Box
            className={wallpaperPath ? 'has-wallpaper' : ''}
            sx={{
              position: 'relative',
              height: '100vh',
              width: '100vw',
              bgcolor: 'var(--mui-background)',
              overflow: 'hidden'
            }}
          >
            {/* Global Wallpaper Background */}
            {wallpaperPath && (
              <Box
                sx={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 0,
                  pointerEvents: 'none',
                  backgroundImage: `url("local-file:///${wallpaperPath.replace(/\\/g, '/')}")`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  opacity: wallpaperOpacity,
                  filter: 'blur(var(--glass-blur))',
                  transform: 'scale(1.05)', // Prevent white edges when blurring
                }}
              />
            )}



            {/* Custom Title Bar */}
            <CustomTitleBar />

            {/* Navbar as floating overlay */}
            <ModernNavigation />

            {/* Main content positioned after navbar */}
            <Box
              className="main-content-area"
              sx={{
                position: 'absolute',
                top: `${TITLE_BAR_HEIGHT}px`, // Start below title bar
                left: '60px', // Start after collapsed navbar
                right: 0,
                bottom: 0,
                background: wallpaperPath ? 'transparent' : 'var(--mui-background)',
                overflow: 'auto', // Allow scrolling if content exceeds container
                zIndex: 1,
              }}
            >
              <Routes>
                <Route path="/" element={<MainPage />} />
                <Route path="/main" element={<MainPage />} />
                <Route path="/paint" element={<Paint2 />} />
                <Route path="/port" element={<Port />} />
                <Route path="/vfx-hub" element={<VFXHub />} />
                <Route path="/ " element={<div>  feature removed</div>} />
                <Route path="/rgba" element={<RGBA />} />

                <Route path="/img-recolor" element={<ImgRecolor />} />
                {/* Old BinEditor archived - using BinEditorV2 now */}
                <Route path="/bineditor" element={<BinEditorV2 />} />
                <Route path="/bineditor-v2" element={<BinEditorV2 />} />
                <Route path="/upscale" element={<Upscale />} />
                <Route path="/file-randomizer" element={<UniversalFileRandomizer />} />
                {/* HUD Editor removed - moved to archived/removed-features/hud-editor/ */}
                <Route path="/tools" element={<Tools />} />
                <Route path="/bumpath" element={<Bumpath />} />
                <Route path="/aniport" element={<AniPort />} />
                <Route path="/frogchanger" element={<FrogChanger />} />
                <Route path="/bnk-extract" element={<BnkExtract />} />
                <Route path="/fakegear" element={<FakeGearSkin />} />
                <Route path="/particle-randomizer" element={<ParticleRandomizer />} />


                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Box>

            {/* Closing Overlay */}
            {isClosing && (
              <Box sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.9)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 999999,
                color: 'var(--accent)',
                fontFamily: 'JetBrains Mono, monospace'
              }}>
                <Box sx={{
                  textAlign: 'center',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%'
                }}>
                  <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center', width: '100%' }}>
                    <img
                      src={`${process.env.PUBLIC_URL}/your-logo.gif`}
                      alt="Quartz Logo"
                      style={{
                        height: '80px',
                        width: 'auto',
                        display: 'block',
                        margin: '0 auto',
                        filter: 'drop-shadow(0 0 10px rgba(139, 92, 246, 0.5))'
                      }}
                    />
                  </Box>
                  <Box sx={{ fontSize: '1.5rem', mb: 1, fontWeight: 'bold' }}>
                    Closing Quartz...
                  </Box>
                  <Box sx={{ fontSize: '1rem', opacity: 0.8 }}>
                    Stopping backends and cleaning up processes
                  </Box>
                </Box>
              </Box>
            )}

            {/* Loading Overlay */}
          </Box>
        </Router>
      </ThemeProvider>
    )
  );
}

export default App; 
