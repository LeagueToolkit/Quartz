import React from 'react';
import { FormGroup, ToggleSwitch } from '../SettingsPrimitives';

const PageVisibilitySection = ({ settings, updateSetting }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <FormGroup label="Navigation">
        <ToggleSwitch
          label="Auto-Load Last Bin Files"
          checked={settings.autoLoadEnabled}
          onChange={(checked) => updateSetting('autoLoadEnabled', checked)}
        />
        <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
        <ToggleSwitch
          label="Expand VFX Systems When Loading Bins"
          checked={settings.expandSystemsOnLoad}
          onChange={(checked) => updateSetting('expandSystemsOnLoad', checked)}
        />
      </FormGroup>

      <FormGroup label="Available Pages">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
          <ToggleSwitch label="VFX Hub" checked={settings.vfxHubEnabled} onChange={(checked) => updateSetting('vfxHubEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="Bin Editor" checked={settings.binEditorEnabled} onChange={(checked) => updateSetting('binEditorEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="Img Recolor" checked={settings.imgRecolorEnabled} onChange={(checked) => updateSetting('imgRecolorEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="Upscale" checked={settings.UpscaleEnabled} onChange={(checked) => updateSetting('UpscaleEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="RGBA" checked={settings.rgbaEnabled} onChange={(checked) => updateSetting('rgbaEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="Tools" checked={settings.toolsEnabled} onChange={(checked) => updateSetting('toolsEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="File Randomizer" checked={settings.fileRandomizerEnabled} onChange={(checked) => updateSetting('fileRandomizerEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="Sound Banks" checked={settings.bnkExtractEnabled} onChange={(checked) => updateSetting('bnkExtractEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="Bumpath" checked={settings.bumpathEnabled} onChange={(checked) => updateSetting('bumpathEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="AniPort" checked={settings.aniportEnabled} onChange={(checked) => updateSetting('aniportEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="Asset Extractor" checked={settings.frogchangerEnabled} onChange={(checked) => updateSetting('frogchangerEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="WAD Explorer" checked={settings.wadExplorerEnabled} onChange={(checked) => updateSetting('wadExplorerEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="FakeGear" checked={settings.fakeGearEnabled} onChange={(checked) => updateSetting('fakeGearEnabled', checked)} compact />
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '8px 0' }} />
          <ToggleSwitch label="Particle Randomizer" checked={settings.particleRandomizerEnabled} onChange={(checked) => updateSetting('particleRandomizerEnabled', checked)} compact />
        </div>
      </FormGroup>
    </div>
  );
};

export default PageVisibilitySection;
