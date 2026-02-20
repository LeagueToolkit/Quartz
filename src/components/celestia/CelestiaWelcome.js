import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronRight, Check, Sparkles, MousePointer2, Type, Palette, Monitor, Zap, Stars, Image } from 'lucide-react';
import electronPrefs from '../../utils/core/electronPrefs.js';
import themeManager, { getAvailableThemes, getCurrentTheme } from '../../utils/theme/themeManager.js';
import fontManager from '../../utils/theme/fontManager.js';

const CLICK_EFFECTS = [
  { id: 'water', name: 'Ripple', icon: <MousePointer2 size={16} /> },
  { id: 'particles', name: 'Particles', icon: <Sparkles size={16} /> },
  { id: 'pulse', name: 'Pulse', icon: <Zap size={16} /> },
  { id: 'sparkle', name: 'Sparkle', icon: <Stars size={16} /> },
  { id: 'glitch', name: 'Glitch', icon: <Zap size={16} /> },
  { id: 'galaxy', name: 'Galaxy', icon: <Stars size={16} /> },
  { id: 'firework', name: 'Firework', icon: <Sparkles size={16} /> },
];

const BG_EFFECTS = [
  { id: 'fireflies', name: 'Fireflies', icon: <Sparkles size={16} /> },
  { id: 'starfield', name: 'Starfield', icon: <Stars size={16} /> },
  { id: 'constellation', name: 'Constellation', icon: <Monitor size={16} /> },
  { id: 'divine', name: 'Divine', icon: <Sparkles size={16} /> },
];

const WallpaperStep = () => {
  const [previewing, setPreviewing] = useState(false);
  const prevWallpaper = useRef({ path: '', opacity: 0.15 });

  useEffect(() => {
    // Snapshot whatever wallpaper was active before entering this step
    prevWallpaper.current = {
      path: electronPrefs.obj.WallpaperPath || '',
      opacity: electronPrefs.obj.WallpaperOpacity ?? 0.15,
    };
    return () => {
      // Restore the previous wallpaper state when leaving this step
      const { path, opacity } = prevWallpaper.current;
      electronPrefs.set('WallpaperPath', path);
      electronPrefs.set('WallpaperOpacity', opacity);
      window.dispatchEvent(new CustomEvent('wallpaperChanged', { detail: { path, opacity } }));
    };
  }, []);

  const handlePreview = async () => {
    if (!window.require) return;
    try {
      const { ipcRenderer } = window.require('electron');
      const path = window.require('path');
      const resourcesPath = await ipcRenderer.invoke('getResourcesPath');
      const imgPath = path.join(resourcesPath, 'UxYW2KY_x2.png');
      await electronPrefs.set('WallpaperPath', imgPath);
      await electronPrefs.set('WallpaperOpacity', 0.3);
      window.dispatchEvent(new CustomEvent('wallpaperChanged', { detail: { path: imgPath, opacity: 0.3 } }));
      setPreviewing(true);
    } catch (e) { console.error(e); }
  };

  const handleClear = async () => {
    await electronPrefs.set('WallpaperPath', '');
    window.dispatchEvent(new CustomEvent('wallpaperChanged', { detail: { path: '', opacity: 0.15 } }));
    setPreviewing(false);
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-500 pb-4">
      <div>
        <h2 className="text-2xl font-bold text-[var(--accent)] mb-2">Custom Wallpaper</h2>
        <p className="text-sm text-[var(--text-2)] mb-4">Make Quartz truly yours with a personal background image.</p>
      </div>

      <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--accent)]/20 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
            <Image size={24} />
          </div>
          <div>
            <h3 className="font-bold text-[var(--text)]">Set a Wallpaper</h3>
            <p className="text-xs text-[var(--text-2)]">Any image from your computer</p>
          </div>
        </div>
        <p className="text-sm text-[var(--text-2)] leading-relaxed">
          Set a custom background that covers the entire app. You can adjust its opacity to blend nicely with your theme.
        </p>
      </div>

      <button
        onClick={previewing ? handleClear : handlePreview}
        className={`w-full py-3 rounded-lg font-semibold text-sm transition-all border ${previewing ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--accent)]/30 bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--accent)] hover:text-[var(--bg)]'}`}
      >
        {previewing ? 'Clear Preview' : 'Show Showcase'}
      </button>

      <div className="p-4 rounded-xl bg-[var(--surface-2)]/50 border border-dashed border-[var(--accent)]/30 flex items-center gap-3">
        <div className="text-[var(--accent)] shrink-0">
          <Monitor size={18} />
        </div>
        <p className="text-xs text-[var(--text-2)] leading-relaxed">
          Customize further in <span className="text-[var(--accent)] font-semibold">Settings → Appearance → Wallpaper</span>
        </p>
      </div>
    </div>
  );
};

const CelestiaWelcome = ({ onClose }) => {
  const [step, setStep] = useState(0);
  // 0: Intro (Preparing system)
  // 1: Theme
  // 2: Font
  // 3: Click Effects
  // 4: Wallpaper tip
  // 5: Background Effects
  // 6: Finish

  const [introText, setIntroText] = useState('Welcome to Quartz...');
  const [availableFonts, setAvailableFonts] = useState([]);
  const [availableThemes, setAvailableThemes] = useState([]);
  const [celestiaSrc, setCelestiaSrc] = useState(`${process.env.PUBLIC_URL}/celestia.webp`);

  // Selection States
  const [selectedTheme, setSelectedTheme] = useState('amethyst');
  const [selectedFont, setSelectedFont] = useState('system');
  const [cursorEffectEnabled, setCursorEffectEnabled] = useState(false);
  const [cursorEffectPath, setCursorEffectPath] = useState('');
  const [cursorFiles, setCursorFiles] = useState([]);
  const [clickEffectsEnabled, setClickEffectsEnabled] = useState(false);
  const [clickEffectType, setClickEffectType] = useState('water');
  const [bgEffectsEnabled, setBgEffectsEnabled] = useState(false);
  const [bgEffectType, setBgEffectType] = useState('fireflies');

  // Load Celestia Image
  useEffect(() => {
    const getCelestiaSrc = async () => {
      if (!window.require) return;
      try {
        const path = window.require('path');
        const fs = window.require('fs');
        const { ipcRenderer } = window.require('electron');
        const appDataPath = await ipcRenderer.invoke('get-user-data-path');
        const roamingAssetsPath = path.join(appDataPath, 'assets', 'celestia.webp');

        if (fs.existsSync(roamingAssetsPath)) {
          const fileBuffer = fs.readFileSync(roamingAssetsPath);
          const base64 = fileBuffer.toString('base64');
          setCelestiaSrc(`data:image/webp;base64,${base64}`);
        }
      } catch (e) { console.error(e); }
    };
    getCelestiaSrc();
  }, []);

  // Intro Animation
  useEffect(() => {
    if (step === 0) {
      const texts = [
        'Welcome to Quartz...',
        'In order to enhance your experience...',
        'You will now be guided through our customizations...',
        'Preparing your environment...'
      ];
      let i = 0;
      const interval = setInterval(() => {
        i++;
        if (i < texts.length) setIntroText(texts[i]);
        else {
          clearInterval(interval);
          setTimeout(() => setStep(1), 1000);
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [step]);

  useEffect(() => {
    if (step === 3) loadCursorFiles();
  }, [step]); // eslint-disable-line

  // Load Fonts and Themes on Mount
  useEffect(() => {
    // Fonts
    fontManager.init().then(() => {
      fontManager.refreshFonts().then(fonts => {
        setAvailableFonts(fonts);
      });
    });

    // Themes
    const themes = getAvailableThemes();
    const formattedThemes = themes.map(id => {
      const theme = getCurrentTheme(id);
      // Format ID to Name (e.g. charcoalOlive -> Charcoal Olive)
      const name = id.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      return { id, name, color: theme.accent };
    });
    setAvailableThemes(formattedThemes);
  }, []);

  // Handlers
  const handleThemeSelect = async (id) => {
    setSelectedTheme(id);
    themeManager.applyThemeVariables(id, 'quartz');
    await electronPrefs.set('ThemeVariant', id);
    window.dispatchEvent(new CustomEvent('settingsChanged'));
  };

  const handleFontSelect = async (fontName) => {
    setSelectedFont(fontName);
    await fontManager.applyFont(fontName);
    await electronPrefs.set('SelectedFont', fontName);
  };

  const loadCursorFiles = async () => {
    if (!window.require) return;
    try {
      const { ipcRenderer } = window.require('electron');
      const fs = window.require('fs');
      const path = window.require('path');
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
      }
    } catch (e) { console.error('Failed to load cursor files:', e); }
  };

  const handleCursorToggle = async (enabled) => {
    setCursorEffectEnabled(enabled);
    await electronPrefs.set('CursorEffectEnabled', enabled);
    window.dispatchEvent(new CustomEvent('cursorEffectChanged', { detail: { enabled, path: cursorEffectPath } }));
  };

  const handleCursorSelect = async (fullPath) => {
    setCursorEffectPath(fullPath);
    await electronPrefs.set('CursorEffectPath', fullPath);
    window.dispatchEvent(new CustomEvent('cursorEffectChanged', { detail: { enabled: cursorEffectEnabled, path: fullPath } }));
  };

  const handleClickEffectToggle = async (enabled) => {
    setClickEffectsEnabled(enabled);
    await electronPrefs.set('ClickEffectEnabled', enabled);
    window.dispatchEvent(new CustomEvent('clickEffectChanged', { detail: { enabled, type: clickEffectType } }));
  };

  const handleClickEffectTypeSelect = async (type) => {
    setClickEffectType(type);
    await electronPrefs.set('ClickEffectType', type);
    if (clickEffectsEnabled) {
      window.dispatchEvent(new CustomEvent('clickEffectChanged', { detail: { enabled: true, type } }));
    }
  };

  const handleBgEffectToggle = async (enabled) => {
    setBgEffectsEnabled(enabled);
    await electronPrefs.set('BackgroundEffectEnabled', enabled);
    window.dispatchEvent(new CustomEvent('backgroundEffectChanged', { detail: { enabled, type: bgEffectType } }));
  };

  const handleBgEffectTypeSelect = async (type) => {
    setBgEffectType(type);
    await electronPrefs.set('BackgroundEffectType', type);
    if (bgEffectsEnabled) {
      window.dispatchEvent(new CustomEvent('backgroundEffectChanged', { detail: { enabled: true, type } }));
    }
  };

  const handleFinish = () => {
    onClose();
  };

  // Render Step Content
  const renderContent = () => {
    switch (step) {
      case 1: // Theme
        return (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-500 pb-4">
            <div>
              <h2 className="text-2xl font-bold text-[var(--accent)] mb-2">Choose your Aesthetic</h2>
              <p className="text-sm text-[var(--text-2)] mb-4">Select a theme that resonates with your style.</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {availableThemes.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleThemeSelect(t.id)}
                  className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-all ${selectedTheme === t.id ? 'border-[var(--accent)] bg-[var(--surface-2)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)]' : 'border-transparent hover:bg-[var(--surface-2)]/50'}`}
                >
                  <div className="w-6 h-6 rounded-full shadow-sm" style={{ backgroundColor: t.color }}></div>
                  <div className="font-semibold text-sm text-[var(--text)]">{t.name}</div>
                  {selectedTheme === t.id && <Check className="ml-auto w-4 h-4 text-[var(--accent)]" />}
                </button>
              ))}
            </div>
          </div>
        );
      case 2: // Font
        return (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-500 pb-4">
            <div>
              <h2 className="text-2xl font-bold text-[var(--accent)] mb-2">Typography</h2>
              <p className="text-sm text-[var(--text-2)] mb-4">Select a font for the interface.</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleFontSelect('system')}
                className={`p-3 rounded-lg border text-left flex items-center justify-between ${selectedFont === 'system' ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-transparent hover:bg-[var(--surface-2)]/50'}`}
              >
                <span className="text-[var(--text)]">System Default</span>
                {selectedFont === 'system' && <Check className="w-4 h-4 text-[var(--accent)]" />}
              </button>
              {availableFonts.filter(f => f.name !== 'system').map(f => (
                <button
                  key={f.name}
                  onClick={() => handleFontSelect(f.name)}
                  className={`p-3 rounded-lg border text-left flex items-center justify-between ${selectedFont === f.name ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-transparent hover:bg-[var(--surface-2)]/50'}`}
                  style={{ fontFamily: f.name }}
                >
                  <span className="text-[var(--text)]">{f.displayName || f.name}</span>
                  {selectedFont === f.name && <Check className="w-4 h-4 text-[var(--accent)]" />}
                </button>
              ))}
            </div>
          </div>
        );
      case 3: // Cursor
        return (
          <div className="flex flex-col animate-in fade-in slide-in-from-right-4 duration-500 pb-4">
            <div className="shrink-0 mb-3">
              <h2 className="text-2xl font-bold text-[var(--accent)] mb-1">Custom Cursor</h2>
              <p className="text-sm text-[var(--text-2)]">Replace the default cursor with a custom one.</p>
            </div>

            <div className="shrink-0 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--accent)]/20 flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                  <MousePointer2 size={20} />
                </div>
                <h3 className="font-bold text-[var(--text)] text-sm">Enable Custom Cursor</h3>
              </div>
              <div className="relative inline-flex items-center cursor-pointer" onClick={() => handleCursorToggle(!cursorEffectEnabled)}>
                <div className={`w-11 h-6 rounded-full transition-colors ${cursorEffectEnabled ? 'bg-[var(--accent)]' : 'bg-gray-700'}`}>
                  <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${cursorEffectEnabled ? 'translate-x-5' : ''}`} />
                </div>
              </div>
            </div>

            {cursorEffectEnabled && (
              cursorFiles.length === 0 ? (
                <div className="text-xs text-[var(--text-2)] text-center p-4 border border-dashed border-[var(--accent)]/20 rounded-lg">
                  No cursor files found — add .cur, .png, or .gif files to the cursors folder.
                </div>
              ) : (
                <>
                  <p className="shrink-0 text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-2">Select a Cursor</p>
                  <div className="grid grid-cols-3 gap-2 overflow-y-auto thin-scrollbar" style={{ maxHeight: '200px' }}>
                    {cursorFiles.map(file => {
                      const isSelected = cursorEffectPath === file.fullPath;
                      return (
                        <button
                          key={file.name}
                          title={file.name}
                          onClick={() => handleCursorSelect(file.fullPath)}
                          style={{ cursor: `url("${file.dataUri}") 0 0, auto` }}
                          className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition-all relative ${isSelected ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-transparent hover:bg-[var(--surface-2)]/50'}`}
                        >
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-white flex items-center justify-center">
                              <Check size={8} color="var(--accent)" strokeWidth={3} />
                            </div>
                          )}
                          <img
                            src={file.dataUri}
                            alt={file.name}
                            style={{ width: '28px', height: '28px', objectFit: 'contain', imageRendering: 'pixelated' }}
                          />
                          <span className="text-[9px] text-[var(--text-2)] overflow-hidden text-ellipsis whitespace-nowrap w-full text-center">
                            {file.name.replace(/\.(cur|gif|png)$/i, '')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )
            )}
          </div>
        );
      case 4: // Click Effects
        return (
          <div className="flex flex-col animate-in fade-in slide-in-from-right-4 duration-500 pb-4">
            {/* Header */}
            <div className="shrink-0 mb-3">
              <h2 className="text-2xl font-bold text-[var(--accent)] mb-1">Interactive VFX</h2>
              <p className="text-sm text-[var(--text-2)]">Visual feedback when you interact.</p>
            </div>

            {/* Toggle */}
            <div className="shrink-0 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--accent)]/20 flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                  <MousePointer2 size={20} />
                </div>
                <h3 className="font-bold text-[var(--text)] text-sm">Enable Effects</h3>
              </div>
              <div className="relative inline-flex items-center cursor-pointer" onClick={() => handleClickEffectToggle(!clickEffectsEnabled)}>
                <div className={`w-11 h-6 rounded-full transition-colors ${clickEffectsEnabled ? 'bg-[var(--accent)]' : 'bg-gray-700'}`}>
                  <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${clickEffectsEnabled ? 'translate-x-5' : ''}`} />
                </div>
              </div>
            </div>

            {/* Effects list — scrollable, visible scrollbar */}
            {clickEffectsEnabled && (
              <>
                <p className="shrink-0 text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-2">Effect Style</p>
                <div className="flex flex-col gap-1 mb-3">
                  {CLICK_EFFECTS.map(effect => (
                    <button
                      key={effect.id}
                      onClick={() => handleClickEffectTypeSelect(effect.id)}
                      className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition-all shrink-0 ${clickEffectType === effect.id ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-transparent hover:bg-[var(--surface-2)]/50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`${clickEffectType === effect.id ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'}`}>
                          {effect.icon}
                        </div>
                        <span className="text-[var(--text)] text-sm">{effect.name}</span>
                      </div>
                      {clickEffectType === effect.id && <Check className="w-4 h-4 text-[var(--accent)]" />}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Test area */}
            <div className="shrink-0 h-14 flex items-center justify-center border border-dashed border-[var(--text-2)]/30 rounded-lg text-[var(--text-2)] text-sm hover:bg-[var(--surface-2)]/30 cursor-pointer transition-colors">
              Click anywhere to test!
            </div>
          </div>
        );
      case 5: // Wallpaper tip
        return (
          <WallpaperStep />
        );
      case 6: // Bg Effects
        return (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-500 pb-4">
            <div>
              <h2 className="text-2xl font-bold text-[var(--accent)] mb-2">Atmosphere</h2>
              <p className="text-sm text-[var(--text-2)] mb-4">Animated ambient backgrounds.</p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--accent)]/20 mb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                    <Monitor size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[var(--text)]">Enable Atmosphere</h3>
                  </div>
                </div>
                <div className="relative inline-flex items-center cursor-pointer" onClick={() => handleBgEffectToggle(!bgEffectsEnabled)}>
                  <div className={`w-11 h-6 rounded-full transition-colors ${bgEffectsEnabled ? 'bg-[var(--accent)]' : 'bg-gray-700'}`}>
                    <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${bgEffectsEnabled ? 'translate-x-5' : ''}`} />
                  </div>
                </div>
              </div>
            </div>

            {bgEffectsEnabled && (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-1">Effect Style</h3>
                {BG_EFFECTS.map(effect => (
                  <button
                    key={effect.id}
                    onClick={() => handleBgEffectTypeSelect(effect.id)}
                    className={`p-3 rounded-lg border text-left flex items-center justify-between transition-all ${bgEffectType === effect.id ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-transparent hover:bg-[var(--surface-2)]/50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`text-[var(--text-2)] ${bgEffectType === effect.id ? 'text-[var(--accent)]' : ''}`}>
                        {effect.icon}
                      </div>
                      <span className="text-[var(--text)] text-sm">{effect.name}</span>
                    </div>
                    {bgEffectType === effect.id && <Check className="w-4 h-4 text-[var(--accent)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      case 7: // Finish
        return (
          <div className="flex flex-col items-center justify-center gap-6 h-full text-center animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="w-20 h-20 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)] mb-4 animate-pulse">
              <Check size={40} />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-[var(--accent)] mb-2">All Set!</h2>
              <p className="text-[var(--text-2)]">Your Quartz environment is ready.</p>
            </div>
            <button
              onClick={handleFinish}
              className="mt-8 px-8 py-3 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-muted)] font-bold rounded-lg hover:shadow-lg hover:from-[var(--accent-muted)] hover:to-[var(--accent)] transition-all transform hover:-translate-y-1"
              style={{ color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
            >
              Enter Quartz
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  if (step === 0) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xl flex flex-col items-center justify-center text-white transition-all duration-1000">
        <h1 className="text-4xl font-light tracking-wider animate-pulse mb-8 text-center max-w-2xl px-4 leading-relaxed">{introText}</h1>
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0s' }}></div>
          <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex text-[var(--text)] font-sans">
      {/* Left 70% - Transparent, wallpaper shows through from App.js */}
      <div className="w-[70%] h-full relative">
      </div>

      {/* Right 30% - Sidebar Control Panel */}
      <div className="w-[30%] h-full bg-[var(--surface)]/95 border-l border-[var(--glass-border)] backdrop-blur-xl shadow-2xl flex flex-col relative">
        {/* Celestia Branding/Header */}
        <div className="p-6 pb-2 flex-shrink-0">
          <div className="flex flex-col items-center gap-3 mb-6">
            <div className="w-32 h-32 rounded-full bg-[var(--accent)]/10 flex items-center justify-center overflow-hidden border-2 border-[var(--accent)]/30 shadow-lg shadow-[var(--accent)]/20">
              <img
                src={celestiaSrc}
                alt="Celestia"
                className="w-full h-full object-cover"
                style={{ imageRendering: 'high-quality' }}
              />
            </div>
            <div className="text-center">
              <div className="font-bold text-[var(--accent)] text-xl">Setup Guided</div>
              <div className="text-[10px] text-[var(--text-2)] uppercase tracking-wider">Step {step} of 7</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-1 w-full bg-[var(--surface-2)] rounded-full overflow-hidden mb-6">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-500 ease-out"
              style={{ width: `${(step / 7) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-2 relative thin-scrollbar">
          {renderContent()}
        </div>

        {/* Footer Navigation */}
        {step < 7 && (
          <div className="p-6 pt-4 border-t border-[var(--glass-border)] flex justify-end flex-shrink-0 bg-[var(--surface)]/95 backdrop-blur-md sticky bottom-0 z-10">
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-2 px-6 py-2 bg-[var(--surface-2)] hover:bg-[var(--accent)] hover:text-[var(--bg)] border border-[var(--accent)]/30 rounded-lg transition-all text-sm font-semibold group shadow-md"
            >
              Next <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}
      </div>

      <style>{`
        .theme-scrollbar::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }
        .theme-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
        .thin-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .thin-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .thin-scrollbar::-webkit-scrollbar-thumb {
          background: var(--accent);
          border-radius: 2px;
        }
        .thin-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: var(--accent) transparent;
        }
      `}</style>
    </div>
  );
};

export default CelestiaWelcome;
