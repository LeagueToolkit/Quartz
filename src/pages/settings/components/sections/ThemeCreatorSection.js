import React from 'react';
import { RefreshCw, Check, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { FormGroup, Input, ToggleSwitch, Button, CustomSelect } from '../SettingsPrimitives';

const ThemeCreatorSection = ({
  customThemeName,
  setCustomThemeName,
  customThemeValues,
  customThemeBehavior,
  handleThemeColorPickerClick,
  handleCustomThemeValueChange,
  handleCustomThemeBehaviorChange,
  showAdvancedTheme,
  setShowAdvancedTheme,
  advancedStrength,
  setAdvancedStrength,
  darkenHex,
  withAlpha,
  livePreview,
  handleToggleLivePreview,
  handleResetCustomTheme,
  handleApplyCustomTheme,
  customThemesMap,
  wallpaperItems,
  wallpaperPath,
  handleDeleteCustomTheme
}) => {
  const normalizePreviewColor = (value, fallback = '#ffffff') => {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    const hex3 = raw.match(/^#?([0-9a-fA-F]{3})$/);
    if (hex3) {
      const h = hex3[1].toUpperCase();
      return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    }
    const hex6 = raw.match(/^#?([0-9a-fA-F]{6})$/);
    if (hex6) return `#${hex6[1].toUpperCase()}`;
    const hex8 = raw.match(/^#?([0-9a-fA-F]{8})$/);
    if (hex8) return `#${hex8[1].toUpperCase()}`;
    return raw;
  };
  const parseBlur = (value, fallback) => {
    const n = Number.parseFloat(String(value ?? ''));
    return Number.isFinite(n) ? n : fallback;
  };
  const liquidBlur = parseBlur(customThemeValues.liquidButtonBlur, 14);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <FormGroup label="Theme Name" description="Name your custom theme">
        <Input
          value={customThemeName}
          onChange={(e) => setCustomThemeName(e.target.value)}
          placeholder="My Theme"
        />
      </FormGroup>

      <FormGroup label="Basic Colors" description="Set the main theme colors">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { key: 'accent', label: 'Accent' },
            { key: 'accent2', label: 'Accent 2' },
            { key: 'bg', label: 'BG' },
            { key: 'surface', label: 'Surface' },
            { key: 'text', label: 'Text' },
            { key: 'navIconColor', label: 'Nav Icons' },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--accent2)', minWidth: '80px' }}>
                {label}
              </label>
              <div
                onClick={(e) => handleThemeColorPickerClick(e, key)}
                style={{
                  width: '40px',
                  height: '32px',
                  border: '2px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  backgroundColor: normalizePreviewColor(customThemeValues[key], '#ffffff'),
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
                value={customThemeValues[key] || ''}
                onChange={(e) => handleCustomThemeValueChange(key, e.target.value)}
                placeholder="#ffffff"
                style={{ flex: 1 }}
              />
            </div>
          ))}
        </div>
      </FormGroup>

      <FormGroup label="Theme Behavior" description="Define what happens when this custom theme is selected">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <CustomSelect
            value={customThemeBehavior?.preferredStyle || ''}
            onChange={(value) => handleCustomThemeBehaviorChange('preferredStyle', value)}
            options={[
              { value: '', label: 'No Style Override' },
              { value: 'quartz', label: 'Quartz' },
              { value: 'winforms', label: 'WinForms' },
              { value: 'liquid', label: 'Liquid Glass' },
            ]}
          />

          <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px' }}>
            <ToggleSwitch
              label="Override Click Effect"
              checked={!!customThemeBehavior?.click?.override}
              onChange={(checked) => handleCustomThemeBehaviorChange('click.override', checked)}
              compact
            />
            {customThemeBehavior?.click?.override && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <ToggleSwitch
                  label="Enable"
                  checked={!!customThemeBehavior?.click?.enabled}
                  onChange={(checked) => handleCustomThemeBehaviorChange('click.enabled', checked)}
                  compact
                />
                <div style={{ flex: 1 }}>
                  <CustomSelect
                    value={customThemeBehavior?.click?.type || 'water'}
                    onChange={(value) => handleCustomThemeBehaviorChange('click.type', value)}
                    disabled={!customThemeBehavior?.click?.enabled}
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
              </div>
            )}
          </div>

          <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px' }}>
            <ToggleSwitch
              label="Override Background Effect"
              checked={!!customThemeBehavior?.background?.override}
              onChange={(checked) => handleCustomThemeBehaviorChange('background.override', checked)}
              compact
            />
            {customThemeBehavior?.background?.override && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <ToggleSwitch
                  label="Enable"
                  checked={!!customThemeBehavior?.background?.enabled}
                  onChange={(checked) => handleCustomThemeBehaviorChange('background.enabled', checked)}
                  compact
                />
                <div style={{ flex: 1 }}>
                  <CustomSelect
                    value={customThemeBehavior?.background?.type || 'fireflies'}
                    onChange={(value) => handleCustomThemeBehaviorChange('background.type', value)}
                    disabled={!customThemeBehavior?.background?.enabled}
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
              </div>
            )}
          </div>

          <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px' }}>
            <ToggleSwitch
              label="Override Wallpaper Enabled"
              checked={!!customThemeBehavior?.wallpaper?.override}
              onChange={(checked) => handleCustomThemeBehaviorChange('wallpaper.override', checked)}
              compact
            />
            {customThemeBehavior?.wallpaper?.override && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                <ToggleSwitch
                  label="Wallpaper Enabled"
                  checked={!!customThemeBehavior?.wallpaper?.enabled}
                  onChange={(checked) => handleCustomThemeBehaviorChange('wallpaper.enabled', checked)}
                  compact
                />
                <CustomSelect
                  value={customThemeBehavior?.wallpaper?.id || ''}
                  onChange={(value) => handleCustomThemeBehaviorChange('wallpaper.id', value)}
                  disabled={!customThemeBehavior?.wallpaper?.enabled}
                  placeholder="Use current wallpaper"
                  options={[
                    { value: '', label: 'Use Current Wallpaper' },
                    ...((wallpaperItems || []).map((item) => ({
                      value: item.id,
                      label: item.displayName || item.id
                    })))
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      </FormGroup>

      <div style={{ border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '12px', background: 'rgba(255, 255, 255, 0.02)' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
              {[
                { key: 'accentMuted', label: 'Accent Muted' },
                { key: 'bg2', label: 'BG 2' },
                { key: 'surface2', label: 'Surface 2' },
                { key: 'text2', label: 'Text 2' },
              ].map(({ key, label }) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--accent2)', textTransform: 'uppercase' }}>
                    {label}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    onClick={(e) => handleThemeColorPickerClick(e, key)}
                    style={{
                      width: '32px',
                      height: '32px',
                      border: '2px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '6px',
                      backgroundColor: normalizePreviewColor(customThemeValues[key], '#ffffff'),
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      flexShrink: 0
                    }}
                  />
                  <Input
                    value={customThemeValues[key] || ''}
                    onChange={(e) => handleCustomThemeValueChange(key, e.target.value)}
                    placeholder={label}
                    style={{ flex: 1 }}
                  />
                </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {['glassBg', 'glassBorder', 'glassShadow'].map((field) => (
                <Input
                  key={field}
                  value={customThemeValues[field] || ''}
                  onChange={(e) => handleCustomThemeValueChange(field, e.target.value)}
                  placeholder={field}
                />
              ))}
            </div>

            <div style={{ border: '1px dashed rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '12px', background: 'rgba(255, 255, 255, 0.01)' }}>
              <div style={{ fontSize: '12px', color: 'var(--accent2)', marginBottom: '12px', fontWeight: '600' }}>
                Glass Button Tuning
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                <Input
                  value={customThemeValues.liquidButtonTint || ''}
                  onChange={(e) => handleCustomThemeValueChange('liquidButtonTint', e.target.value)}
                  placeholder="Liquid tint (e.g. rgba(255,255,255,0.10))"
                />
                <Input
                  value={customThemeValues.liquidButtonHoverTint || ''}
                  onChange={(e) => handleCustomThemeValueChange('liquidButtonHoverTint', e.target.value)}
                  placeholder="Liquid hover tint"
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--accent2)', marginBottom: '6px' }}>
                  Liquid Button Blur: {liquidBlur}px
                </div>
                <input
                  type="range"
                  min="0"
                  max="36"
                  value={liquidBlur}
                  onChange={(e) => handleCustomThemeValueChange('liquidButtonBlur', String(parseInt(e.target.value, 10)))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>

            </div>

            <div style={{ border: '1px dashed rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '12px', background: 'rgba(255, 255, 255, 0.01)' }}>
              <div style={{ fontSize: '12px', color: 'var(--accent2)', marginBottom: '12px', fontWeight: '600' }}>
                Derived Colors
              </div>
              {[
                { key: 'accentMutedPercent', label: 'Accent Muted (darken %)', max: 60, source: 'accent' },
                { key: 'bg2Percent', label: 'BG 2 (darken %)', max: 40, source: 'bg' },
                { key: 'surface2Percent', label: 'Surface 2 (darken %)', max: 40, source: 'surface' },
                { key: 'glassBgAlphaPercent', label: 'Glass BG alpha (%)', max: 80, source: null }
              ].map(({ key, label, max, source }) => (
                <div key={key} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--accent2)', marginBottom: '6px' }}>
                    {label}: {advancedStrength[key]}%
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={max}
                    value={advancedStrength[key]}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setAdvancedStrength(prev => ({ ...prev, [key]: val }));
                      if (source) {
                        const derived = darkenHex(customThemeValues[source], val);
                        handleCustomThemeValueChange(key.replace('Percent', ''), derived);
                      } else {
                        const derived = withAlpha(customThemeValues.surface || customThemeValues.bg, val);
                        handleCustomThemeValueChange('glassBg', derived);
                      }
                    }}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
};

export default ThemeCreatorSection;
