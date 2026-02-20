import React from 'react';
import { RefreshCw, Check, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { FormGroup, Input, ToggleSwitch, Button } from '../SettingsPrimitives';

const ThemeCreatorSection = ({
  customThemeName,
  setCustomThemeName,
  customThemeValues,
  handleThemeColorPickerClick,
  handleCustomThemeValueChange,
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
  wallpaperPath,
  handleDeleteCustomTheme
}) => {
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
          {['accent', 'accent2', 'bg', 'surface', 'text'].map((field) => (
            <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--accent2)', minWidth: '80px' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
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
