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
  wallpaperPath,
  wallpaperEnabled,
  wallpaperId,
  wallpaperItems,
  wallpaperOpacity,
  wallpaperVignetteEnabled,
  wallpaperVignetteStrength,
  handleBrowseWallpaper,
  handleSelectWallpaper,
  handleDeleteWallpaper,
  handleDeleteActiveWallpaper,
  handleWallpaperEnabledChange,
  handleWallpaperOpacityChange,
  handleWallpaperVignetteEnabledChange,
  handleWallpaperVignetteStrengthChange,
  handleGlassBlurChange,
  liquidButtonTint,
  liquidButtonHoverTint,
  liquidButtonBlur,
  handleLiquidButtonTintChange,
  handleLiquidButtonHoverTintChange,
  handleLiquidButtonBlurChange,
  handleGlassTintColorPickerClick,
  performanceMode,
  handlePerformanceModeToggle,
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
  const parseColorAlpha = (value, fallbackHex, fallbackAlpha) => {
    const raw = String(value || '').trim();
    if (!raw) return { hex: fallbackHex, alpha: fallbackAlpha };
    const rgba = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i);
    if (!rgba) return { hex: fallbackHex, alpha: fallbackAlpha };
    const r = Math.max(0, Math.min(255, parseInt(rgba[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(rgba[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(rgba[3], 10)));
    const a = rgba[4] === undefined ? 1 : Math.max(0, Math.min(1, parseFloat(rgba[4])));
    const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    return { hex, alpha: a };
  };
  const toRgba = (hex, alpha) => {
    const cleaned = String(hex || '').replace('#', '');
    if (cleaned.length !== 6) return '';
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    const a = Math.max(0, Math.min(1, Number(alpha)));
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
  };
  const isGlassStyle = settings.interfaceStyle === 'liquid';
  const liquidTintParsed = parseColorAlpha(liquidButtonTint, '#ffffff', 0.1);
  const liquidHoverParsed = parseColorAlpha(liquidButtonHoverTint, '#ffffff', 0.16);
  const liquidBlurValue = Number.isFinite(Number.parseFloat(liquidButtonBlur)) ? Number.parseFloat(liquidButtonBlur) : 14;

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

      <FormGroup label="Performance Mode" description="Reduce heavy visual effects for smoother performance on weaker hardware">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={performanceMode}
              onChange={(e) => handlePerformanceModeToggle(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>
              Enable performance mode
            </span>
          </label>
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
              preventLiquidArtifact
            />
          ))}
        </div>
      </FormGroup>
      {isGlassStyle && (
        <FormGroup label="Glass Button Tuning" description="Adjust tint and blur for Liquid button style">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Liquid Tint</div>
              <div
                onClick={(e) => handleGlassTintColorPickerClick(e, 'liquidButtonTint')}
                style={{
                  width: '100%',
                  height: '34px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.24)',
                  background: toRgba(liquidTintParsed.hex, liquidTintParsed.alpha),
                  cursor: 'pointer'
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Liquid Hover Tint</div>
              <div
                onClick={(e) => handleGlassTintColorPickerClick(e, 'liquidButtonHoverTint')}
                style={{
                  width: '100%',
                  height: '34px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.24)',
                  background: toRgba(liquidHoverParsed.hex, liquidHoverParsed.alpha),
                  cursor: 'pointer'
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>
                Liquid Tint Opacity: {Math.round(liquidTintParsed.alpha * 100)}%
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(liquidTintParsed.alpha * 100)}
                onChange={(e) => handleLiquidButtonTintChange(toRgba(liquidTintParsed.hex, parseInt(e.target.value, 10) / 100))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>
                Liquid Hover Opacity: {Math.round(liquidHoverParsed.alpha * 100)}%
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(liquidHoverParsed.alpha * 100)}
                onChange={(e) => handleLiquidButtonHoverTintChange(toRgba(liquidHoverParsed.hex, parseInt(e.target.value, 10) / 100))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>
                Liquid Button Blur: {Math.round(liquidBlurValue)}px
              </div>
              <input
                type="range"
                min="0"
                max="36"
                value={Math.round(liquidBlurValue)}
                onChange={(e) => handleLiquidButtonBlurChange(String(parseInt(e.target.value, 10)))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
          </div>
        </FormGroup>
      )}

      <FormGroup
        label="Color Theme"
        description="Choose your preferred color scheme"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '12px'
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
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={wallpaperEnabled}
              onChange={(e) => handleWallpaperEnabledChange(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>
              Enable wallpaper
            </span>
          </label>

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

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button icon={<Folder size={16} />} variant="secondary" onClick={handleBrowseWallpaper}>
              Add Wallpaper
            </Button>
            {wallpaperPath && (
              <Button icon={<Trash2 size={16} />} variant="secondary" onClick={handleDeleteActiveWallpaper} style={{ padding: '8px 12px' }}>
                Delete Active
              </Button>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '10px',
              maxHeight: '220px',
              overflowY: 'auto',
              paddingRight: '2px'
            }}
          >
            {wallpaperItems.length === 0 && (
              <div style={{ gridColumn: '1 / -1', fontSize: '12px', color: 'var(--text-2)', opacity: 0.8, padding: '12px 4px' }}>
                No wallpapers yet. Click `Add Wallpaper` to import into your Quartz roaming gallery.
              </div>
            )}
            {wallpaperItems.map((item) => {
              const isActive = wallpaperId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectWallpaper(item.id)}
                  style={{
                    border: isActive ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.12)',
                    background: isActive ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    padding: 0,
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                  title={item.displayName}
                >
                  <div style={{ width: '100%', height: '76px', background: 'rgba(0,0,0,0.35)' }}>
                    <img
                      src={item.previewSrc}
                      alt={item.displayName}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.displayName}
                    </span>
                    {item.source !== 'bundled' && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteWallpaper(item.id);
                        }}
                        style={{ fontSize: '11px', color: 'rgba(255,120,120,0.9)', padding: '0 2px' }}
                        title="Delete wallpaper"
                      >
                        x
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
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

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={wallpaperVignetteEnabled}
              onChange={(e) => handleWallpaperVignetteEnabledChange(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>
              Enable vignette
            </span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: wallpaperVignetteEnabled ? 1 : 0.6 }}>
            <span style={{ fontSize: '12px', color: 'var(--text-2)', minWidth: '120px' }}>
              Vignette: {Math.round(wallpaperVignetteStrength * 100)}%
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(wallpaperVignetteStrength * 100)}
              onChange={(e) => handleWallpaperVignetteStrengthChange(parseFloat(e.target.value) / 100)}
              disabled={!wallpaperVignetteEnabled}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: performanceMode ? 0.6 : 1 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={clickEffectEnabled}
              onChange={(e) => handleClickEffectToggle(e.target.checked)}
              disabled={performanceMode}
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
            disabled={!clickEffectEnabled || performanceMode}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: performanceMode ? 0.6 : 1 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={backgroundEffectEnabled}
              onChange={(e) => handleBackgroundEffectToggle(e.target.checked)}
              disabled={performanceMode}
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
            disabled={!backgroundEffectEnabled || performanceMode}
            options={[
              { value: 'fireflies', label: 'Swirling Fireflies' },
              { value: 'starfield', label: 'Starfield' },
              { value: 'constellation', label: 'Constellation' },
              { value: 'divine', label: 'Divine Stars' },
              { value: 'bubbles', label: 'Water Bubbles' },
              { value: 'leaves', label: 'Falling Leaves' },
              { value: 'sakuraLeaves', label: 'Sakura Leaves' },
              { value: 'rain', label: 'Rain' },
              { value: 'sparkleSymbol', label: 'Sparkle Symbol' }
            ]}
          />
        </div>
      </FormGroup>

      <FormGroup label="Cursor Effect" description="Replace the system cursor with a custom style">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: performanceMode ? 0.6 : 1 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={cursorEffectEnabled}
              onChange={(e) => handleCursorEffectToggle(e.target.checked)}
              disabled={performanceMode}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>
              Enable cursor effects
            </span>
          </label>

          {cursorEffectEnabled && !performanceMode && (
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
        {cursorEffectEnabled && !performanceMode && (
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
