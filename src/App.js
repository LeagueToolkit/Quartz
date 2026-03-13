import React, { useEffect, useState, useMemo, useLayoutEffect, useCallback } from 'react';
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
import WadExplorer from './pages/wadexplorer/WadExplorer';
import FakeGearSkin from './pages/fakegearskin/FakeGearSkin';
import ParticleRandomizer from './pages/ParticleRandomizer';
import HashReminderModal from './components/modals/HashReminderModal';
import WindowsIntegrationReminderModal from './components/modals/WindowsIntegrationReminderModal';
import AssetPreviewModal from './components/modals/AssetPreviewModal';
import JadeInstallModal from './components/modals/JadeInstallModal';
import ScbInspectModalHost from './components/model-inspect/ScbInspectModalHost';
import InlineModelInspectHost, { OPEN_INLINE_MODEL_INSPECT_EVENT } from './components/model-inspect/InlineModelInspectHost';
import GlobalClickEffect from './components/ClickEffects/GlobalClickEffect';
import GlobalBackgroundEffect from './components/BackgroundEffects/GlobalBackgroundEffect';
import GlobalCursorEffect from './components/CursorEffects/GlobalCursorEffect';
import GlobalUpdateNotification from './components/app-shell/GlobalUpdateNotification';
import GlobalHashSyncNotification from './components/app-shell/GlobalHashSyncNotification';
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

const QuartzInteropBridge = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    const fs = window.require('fs');
    let active = true;

    const emitHandoff = (handoff) => {
      window.__QUARTZ_PENDING_HANDOFF = handoff;
      window.dispatchEvent(new CustomEvent('quartz-interop-handoff', { detail: handoff }));
    };

    const processHandoff = (handoff) => {
      if (!handoff || handoff.error) return;
      if ((handoff.target_app || '').toLowerCase() !== 'quartz') return;
      if (!handoff.bin_path) return;

      const mode = String(handoff.mode || 'paint').toLowerCase();
      const route =
        mode === 'port' ? '/port' :
        mode === 'bineditor' ? '/bineditor' :
        mode === 'vfxhub' ? '/vfx-hub' :
        '/paint';
      const currentHash = window.location.hash || '#/';

      if (currentHash !== `#${route}`) {
        navigate(route);
        setTimeout(() => emitHandoff(handoff), 220);
      } else {
        emitHandoff(handoff);
      }
    };

    const consume = async () => {
      if (!active) return;
      try {
        const result = await ipcRenderer.invoke('interop:consumeHandoff');
        if (!result) return;
        const rawMessages = Array.isArray(result) ? result : [result];
        const messages = rawMessages
          .filter((m) => m && !m.error && (m.target_app || '').toLowerCase() === 'quartz' && m.bin_path)
          .sort((a, b) => Number(a?.created_at_unix || 0) - Number(b?.created_at_unix || 0));

        // Keep only the latest handoff per bin so stale older actions don't override route/mode.
        const byBin = new Map();
        for (const handoff of messages) {
          const key = String(handoff.bin_path).toLowerCase();
          const prev = byBin.get(key);
          if (!prev) {
            byBin.set(key, handoff);
            continue;
          }
          const prevTs = Number(prev?.created_at_unix || 0);
          const curTs = Number(handoff?.created_at_unix || 0);
          if (curTs > prevTs) {
            byBin.set(key, handoff);
            continue;
          }
          if (curTs === prevTs) {
            const prevAction = String(prev?.action || '').toLowerCase();
            const curAction = String(handoff?.action || '').toLowerCase();
            // Prefer reload over open on equal timestamp.
            if (curAction === 'reload-bin' && prevAction !== 'reload-bin') {
              byBin.set(key, handoff);
            }
          }
        }

        const latestMessages = Array.from(byBin.values()).sort(
          (a, b) => Number(a?.created_at_unix || 0) - Number(b?.created_at_unix || 0)
        );
        for (const handoff of latestMessages) processHandoff(handoff);
      } catch {}
    };

    let watcher = null;
    let watchDebounce = null;
    ipcRenderer.invoke('interop:getWatchDir')
      .then((watchDir) => {
        if (!active || !watchDir) return;
        try {
          if (!fs.existsSync(watchDir)) {
            fs.mkdirSync(watchDir, { recursive: true });
          }
          watcher = fs.watch(watchDir, { persistent: false }, (_eventType, filename) => {
            if (!filename || !filename.startsWith('handoff-')) return;
            clearTimeout(watchDebounce);
            watchDebounce = setTimeout(consume, 80);
          });
          watcher.on('error', () => {});
        } catch {}
      })
      .catch(() => {
        // Main process may not have interop channel registered yet.
        // Fallback poll still runs via consume() + setInterval.
      });

    const onCheckNow = () => consume();
    ipcRenderer.on('interop:check-now', onCheckNow);

    consume();
    const timer = setInterval(consume, 5000);

    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(watchDebounce);
      ipcRenderer.removeListener('interop:check-now', onCheckNow);
      try {
        watcher?.close();
      } catch {}
    };
  }, [navigate]);

  return null;
};

// Dynamic theme generator using computed CSS variables
function createDynamicTheme(fontFamily, interfaceStyle = 'quartz') {
  // Get computed CSS variable values for MUI
  const getCSSVar = (varName, fallback = '#8b5cf6') => {
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      return value || fallback;
    }
    return fallback;
  };

  const isLiquid = interfaceStyle === 'liquid';

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
            backgroundColor: isLiquid ? 'var(--liquid-surface, rgba(255,255,255,0.08))' : 'var(--glass-bg)',
            border: isLiquid ? '1px solid var(--liquid-border, rgba(255,255,255,0.22))' : '1px solid var(--glass-border)',
            backdropFilter: isLiquid ? 'blur(18px) saturate(132%)' : 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: isLiquid ? 'blur(18px) saturate(132%)' : 'saturate(180%) blur(16px)',
            boxShadow: isLiquid ? 'inset 0 1px 0 rgba(255,255,255,0.25), 0 10px 26px rgba(0,0,0,0.3)' : undefined,
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
            backgroundColor: isLiquid ? 'var(--liquid-button-bg, rgba(255,255,255,0.1))' : 'var(--glass-bg)',
            border: isLiquid ? '1px solid var(--liquid-border-strong, rgba(255,255,255,0.3))' : '1px solid var(--glass-border)',
            backdropFilter: isLiquid ? 'blur(var(--liquid-button-blur, 14px)) saturate(130%)' : 'saturate(180%) blur(12px)',
            WebkitBackdropFilter: isLiquid ? 'blur(var(--liquid-button-blur, 14px)) saturate(130%)' : 'saturate(180%) blur(12px)',
            boxShadow: isLiquid ? 'inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 20px rgba(0,0,0,0.28)' : undefined,
            color: isLiquid ? 'var(--text)' : undefined,
            '&:hover': isLiquid ? {
              backgroundColor: 'var(--liquid-button-hover-bg, rgba(255,255,255,0.15))',
              borderColor: 'rgba(255,255,255,0.42)',
            } : undefined,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: isLiquid ? {
            background: 'var(--liquid-surface, rgba(255,255,255,0.08))',
            border: '1px solid var(--liquid-border, rgba(255,255,255,0.2))',
            backdropFilter: 'blur(18px) saturate(128%)',
            WebkitBackdropFilter: 'blur(18px) saturate(128%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 10px 26px rgba(0,0,0,0.3)',
          } : {},
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: isLiquid ? {
            background: 'var(--liquid-input-bg, rgba(255,255,255,0.06))',
            borderRadius: 10,
            backdropFilter: 'blur(12px) saturate(125%)',
            WebkitBackdropFilter: 'blur(12px) saturate(125%)',
            '& fieldset': {
              borderColor: 'rgba(255,255,255,0.22)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255,255,255,0.34)',
            },
            '&.Mui-focused fieldset': {
              borderColor: 'var(--accent)',
            },
          } : {},
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: isLiquid ? {
            border: '1px solid rgba(255,255,255,0.16)',
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(var(--liquid-button-blur, 14px)) saturate(120%)',
            WebkitBackdropFilter: 'blur(var(--liquid-button-blur, 14px)) saturate(120%)',
            '&:hover': {
              background: 'rgba(255,255,255,0.12)',
              borderColor: 'rgba(255,255,255,0.28)',
            },
          } : {},
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: isLiquid ? 'rgba(255,255,255,0.12)' : 'var(--surface-2)',
            },
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: isLiquid ? {
            background: 'rgba(18,22,30,0.45)',
            border: '1px solid rgba(255,255,255,0.22)',
            backdropFilter: 'blur(18px) saturate(132%)',
            WebkitBackdropFilter: 'blur(18px) saturate(132%)',
          } : {},
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
  const [wallpaperVignetteEnabled, setWallpaperVignetteEnabled] = useState(false);
  const [wallpaperVignetteStrength, setWallpaperVignetteStrength] = useState(0.35);
  const [glassBlur, setGlassBlur] = useState(6);
  const [clickEffectEnabled, setClickEffectEnabled] = useState(false);
  const [clickEffectType, setClickEffectType] = useState('water');
  const [backgroundEffectEnabled, setBackgroundEffectEnabled] = useState(false);
  const [backgroundEffectType, setBackgroundEffectType] = useState('fireflies');
  const [cursorEffectEnabled, setCursorEffectEnabled] = useState(false);
  const [cursorEffectPath, setCursorEffectPath] = useState('');
  const [cursorEffectSize, setCursorEffectSize] = useState(32);
  const applyLiquidButtonVars = useCallback((values = {}) => {
    const root = document.documentElement;
    const setOpt = (name, value) => {
      const raw = String(value ?? '').trim();
      if (!raw) root.style.removeProperty(name);
      else root.style.setProperty(name, raw);
    };
    const setBlur = (name, value) => {
      const n = Number.parseFloat(String(value ?? ''));
      if (!Number.isFinite(n)) {
        root.style.removeProperty(name);
        return;
      }
      root.style.setProperty(name, `${n}px`);
    };
    setOpt('--liquid-button-bg', values.liquidTint);
    setOpt('--liquid-button-hover-bg', values.liquidHoverTint);
    setBlur('--liquid-button-blur', values.liquidBlur);
  }, []);

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
          const safeStyle =
            electronPrefs.obj.InterfaceStyle === 'cs16' ? 'quartz'
              : electronPrefs.obj.InterfaceStyle === 'fluid' ? 'liquid'
                : electronPrefs.obj.InterfaceStyle;
          if (safeStyle !== electronPrefs.obj.InterfaceStyle) {
            electronPrefs.obj.InterfaceStyle = safeStyle;
            await electronPrefs.save();
          }
          setInterfaceStyle(safeStyle);
        }

        // Load wallpaper settings
        const wallpaperEnabled = electronPrefs.obj.WallpaperEnabled !== false;
        if (wallpaperEnabled && electronPrefs.obj.WallpaperPath) {
          setWallpaperPath(electronPrefs.obj.WallpaperPath);
        } else {
          setWallpaperPath('');
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
        if (electronPrefs.obj.GlassBlur !== undefined) {
          setGlassBlur(electronPrefs.obj.GlassBlur);
        }

        if (electronPrefs.obj.PerformanceMode === true) {
          setClickEffectEnabled(false);
          setBackgroundEffectEnabled(false);
          setCursorEffectEnabled(false);
          if ((electronPrefs.obj.GlassBlur ?? 6) > 2) {
            setGlassBlur(2);
          }
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
          const nextStyle =
            electronPrefs.obj.InterfaceStyle === 'cs16' ? 'quartz'
              : electronPrefs.obj.InterfaceStyle === 'fluid' ? 'liquid'
                : electronPrefs.obj.InterfaceStyle;
          setInterfaceStyle(nextStyle);
        }
      } catch { }
    };
    window.addEventListener('settingsChanged', onSettingsChanged);

    // Listen for wallpaper changes
    const onWallpaperChanged = (event) => {
      const { path, opacity, vignetteEnabled, vignetteStrength } = event.detail || {};
      if (path !== undefined) setWallpaperPath(path);
      if (opacity !== undefined) setWallpaperOpacity(opacity);
      if (vignetteEnabled !== undefined) setWallpaperVignetteEnabled(vignetteEnabled === true);
      if (vignetteStrength !== undefined) setWallpaperVignetteStrength(vignetteStrength);
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

    const onGlassButtonStyleChanged = (event) => {
      applyLiquidButtonVars(event.detail || {});
    };
    window.addEventListener('glassButtonStyleChanged', onGlassButtonStyleChanged);

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
    applyLiquidButtonVars({
      liquidTint: electronPrefs.obj.LiquidButtonTint,
      liquidHoverTint: electronPrefs.obj.LiquidButtonHoverTint,
      liquidBlur: electronPrefs.obj.LiquidButtonBlur
    });

    if (electronPrefs.obj.PerformanceMode === true) {
      setClickEffectEnabled(false);
      setBackgroundEffectEnabled(false);
      setCursorEffectEnabled(false);
      if ((electronPrefs.obj.GlassBlur ?? 6) > 2) {
        setGlassBlur(2);
      }
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
      ipcRenderer.on('app:open-model-inspect', (_event, payload) => {
        console.log('[ModelInspectLaunch][Renderer] IPC received app:open-model-inspect', payload);
        try {
          window.dispatchEvent(new CustomEvent(OPEN_INLINE_MODEL_INSPECT_EVENT, {
            detail: payload || {},
          }));
        } catch (_) {}
      });
    }

    // Robust startup fallback for file-association launches:
    // parse process argv in renderer too, so modal opens even if main IPC arrives too early.
    try {
      const argv = (window.process && Array.isArray(window.process.argv)) ? window.process.argv : [];
      let inspectPath = '';
      const flagIdx = argv.indexOf('--inspect-model');
      if (flagIdx !== -1 && typeof argv[flagIdx + 1] === 'string') {
        // In dev, Chromium flags can appear right after our custom flag.
        const tail = argv.slice(flagIdx + 1);
        inspectPath = tail.find((a) => typeof a === 'string' && a.toLowerCase().endsWith('.skn')) || '';
        if (!inspectPath && typeof argv[flagIdx + 1] === 'string' && !argv[flagIdx + 1].startsWith('--')) {
          inspectPath = argv[flagIdx + 1];
        }
      } else {
        const sknArg = argv.find((a) => typeof a === 'string' && a.toLowerCase().endsWith('.skn'));
        if (sknArg) inspectPath = sknArg;
      }

      if (inspectPath) {
        console.log('[ModelInspectLaunch][Renderer] argv inspect target detected:', inspectPath, 'argv=', argv);
        setTimeout(() => {
          try {
            console.log('[ModelInspectLaunch][Renderer] dispatching OPEN_INLINE_MODEL_INSPECT_EVENT from argv');
            window.dispatchEvent(new CustomEvent(OPEN_INLINE_MODEL_INSPECT_EVENT, {
              detail: { path: inspectPath },
            }));
          } catch (_) {}
        }, 350);
      } else {
        console.log('[ModelInspectLaunch][Renderer] no inspect target in argv', argv);
      }
    } catch (_) {}

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
      window.removeEventListener('glassButtonStyleChanged', onGlassButtonStyleChanged);
      window.removeEventListener('globalFontChange', handleGlobalFontChange);
      document.removeEventListener('fontChanged', handleFontChange);

      // Cleanup IPC listener
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.removeListener('app:closing', handleAppClosing);
        ipcRenderer.removeAllListeners('app:open-model-inspect');
      }
    };
  }, [applyLiquidButtonVars]);

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

    return createDynamicTheme(themeFontFamily, interfaceStyle);
  }, [currentFont, fontFamily, themeVariant, interfaceStyle]);

  return (
    themeReady && (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <HashReminderModal />
          <WindowsIntegrationReminderModal />
          <AssetPreviewModal />
          <JadeInstallModal />
          <ScbInspectModalHost />
          <InlineModelInspectHost />
          <FontPersistenceHandler />
          <CelestiaNavigationBridge />
          <QuartzInteropBridge />
          <GlobalUpdateNotification />
          <GlobalHashSyncNotification />
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
              <>
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
                {wallpaperVignetteEnabled && (
                  <Box
                    sx={{
                      position: 'fixed',
                      inset: 0,
                      zIndex: 0,
                      pointerEvents: 'none',
                      background: `radial-gradient(circle at center, rgba(0,0,0,0) 38%, rgba(0,0,0,${Math.min(0.95, Math.max(0, wallpaperVignetteStrength))}) 100%)`
                    }}
                  />
                )}
              </>
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
                <Route path="/wad-explorer" element={<WadExplorer />} />
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
