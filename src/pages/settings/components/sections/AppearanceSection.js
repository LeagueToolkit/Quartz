import React from 'react';
import { Type, Folder, Palette, RefreshCw, Check, Trash2 } from 'lucide-react';
import { FormGroup, CustomSelect, ThemeCard, Button } from '../SettingsPrimitives';

const AppearanceSection = ({
  safeSelectedFont,
  handleFontChange,
  isLoadingFonts,
  availableFonts,
  handleOpenFontsFolder,
  interfaceStyles,
  settings,
  handleStyleChange,
  builtInThemes,
  customThemesMap,
  handleThemeChange,
  STYLES,
  wallpaperPath,
  wallpaperOpacity,
  handleWallpaperPathChange,
  handleBrowseWallpaper,
  handleClearWallpaper,
  handleWallpaperOpacityChange,
  handleGlassBlurChange,
  clickEffectEnabled,
  handleClickEffectToggle,
  clickEffectType,
  handleClickEffectTypeChange,
  backgroundEffectEnabled,
  handleBackgroundEffectToggle,
  backgroundEffectType,
  handleBackgroundEffectTypeChange,
  cursorEffectEnabled,
  handleCursorEffectToggle,
  handleOpenCursorsFolder,
  loadCursorFiles,
  cursorFiles,
  cursorEffectPath,
  handleSelectCursorFile,
  cursorEffectSize,
  handleCursorSizeChange
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <FormGroup label="Font Family" description="Select the interface font">
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
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
          </div>
          <Button
            icon={<Folder size={16} />}
            variant="secondary"
            onClick={handleOpenFontsFolder}
            title="Open Fonts Folder"
          />
        </div>
      </FormGroup>

      <FormGroup label="Interface Style" description="Select the application's visual layout">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
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

      <FormGroup
        label="Color Theme"
        description={settings.interfaceStyle === STYLES.CS16
          ? 'Color selection is disabled in 1.6 style'
          : 'Choose your preferred color scheme'}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '12px',
            opacity: settings.interfaceStyle === STYLES.CS16 ? 0.5 : 1,
            pointerEvents: settings.interfaceStyle === STYLES.CS16 ? 'none' : 'auto'
          }}
        >
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
              theme={{ id: `custom:${name}`, name, desc: 'Custom Theme' }}
              selected={settings.themeVariant === `custom:${name}`}
              onClick={() => handleThemeChange(`custom:${name}`)}
            />
          ))}
        </div>
      </FormGroup>

      <FormGroup label="Wallpaper" description="Set a background image that covers the entire app">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {wallpaperPath && (
            <div style={{ width: '100%', height: '120px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)', position: 'relative' }}>
              <img
                src={`local-file:///${wallpaperPath.replace(/\\/g, '/')}`}
                alt="Wallpaper preview"
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: wallpaperOpacity }}
              />
              <div
                style={{
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
                }}
              >
                {wallpaperPath.split(/[/\\]/).pop()}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={wallpaperPath}
              onChange={(e) => handleWallpaperPathChange(e.target.value)}
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
            <Button icon={<Folder size={16} />} variant="secondary" onClick={handleBrowseWallpaper}>
              Browse
            </Button>
            {wallpaperPath && (
              <Button icon={<Trash2 size={16} />} variant="secondary" onClick={handleClearWallpaper} style={{ padding: '8px 12px' }} />
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
              style={{ flex: 1, accentColor: 'var(--accent)' }}
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
              onChange={(e) => handleGlassBlurChange(parseInt(e.target.value, 10))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Click Effect" description="Show interactive visual effects on click">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={clickEffectEnabled}
              onChange={(e) => handleClickEffectToggle(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
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

      <FormGroup label="Background Effect" description="Show animated background effects">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={backgroundEffectEnabled}
              onChange={(e) => handleBackgroundEffectToggle(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>
              Enable background effects
            </span>
          </label>

          <CustomSelect
            icon={<Palette size={16} />}
            value={backgroundEffectType}
            onChange={handleBackgroundEffectTypeChange}
            disabled={!backgroundEffectEnabled}
            options={[
              { value: 'fireflies', label: 'Swirling Fireflies' },
              { value: 'starfield', label: 'Starfield' },
              { value: 'constellation', label: 'Constellation' },
              { value: 'divine', label: 'Divine Stars' }
            ]}
          />
        </div>
      </FormGroup>

      <FormGroup label="Cursor Effect" description="Replace the system cursor with a custom style">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={cursorEffectEnabled}
              onChange={(e) => handleCursorEffectToggle(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>
              Enable cursor effects
            </span>
          </label>

          {cursorEffectEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button icon={<Folder size={16} />} variant="secondary" onClick={handleOpenCursorsFolder}>
                  Open Folder
                </Button>
                <Button icon={<RefreshCw size={16} />} variant="secondary" onClick={loadCursorFiles}>
                  Refresh
                </Button>
              </div>

              {cursorFiles.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-2)', textAlign: 'center', padding: '20px 16px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.1)', lineHeight: 1.5 }}>
                  No cursors found - drop <strong>.cur</strong>, <strong>.png</strong>, or <strong>.gif</strong> files into the cursors folder, then hit Refresh.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', maxHeight: '260px', overflowY: 'auto', paddingRight: '2px' }}>
                  {cursorFiles.map(file => {
                    const isSelected = cursorEffectPath === file.fullPath;
                    return (
                      <button
                        key={file.name}
                        title={file.name}
                        onClick={() => handleSelectCursorFile(file.fullPath)}
                        style={{
                          cursor: `url("${file.dataUri}") 0 0, auto`,
                          padding: '10px 6px 6px',
                          background: isSelected ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)',
                          border: `2px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease',
                          position: 'relative'
                        }}
                      >
                        {isSelected && (
                          <div style={{ position: 'absolute', top: '4px', right: '4px', background: 'var(--accent)', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={10} color="#fff" strokeWidth={3} />
                          </div>
                        )}
                        <div style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <img src={file.dataUri} alt={file.name} style={{ maxWidth: '32px', maxHeight: '32px', objectFit: 'contain', imageRendering: 'pixelated' }} />
                        </div>
                        <span style={{ fontSize: '9px', color: isSelected ? 'var(--accent)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'center' }}>
                          {file.name.replace(/\.(cur|gif|png)$/i, '')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <span style={{ fontSize: '11px', color: 'var(--text-2)' }}>
                Hover a card to preview the cursor - Supports .cur, .png, .gif
              </span>
            </div>
          )}
        </div>
        {cursorEffectEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>Size</span>
            <input
              type="range"
              min={16}
              max={128}
              step={4}
              value={cursorEffectSize}
              onChange={e => handleCursorSizeChange(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-2)', minWidth: '34px', textAlign: 'right' }}>
              {cursorEffectSize}px
            </span>
          </div>
        )}
      </FormGroup>
    </div>
  );
};

export default AppearanceSection;
