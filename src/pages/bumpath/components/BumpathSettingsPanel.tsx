import React from 'react';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';

interface BumpathSettingsPanelProps {
    panelStyle: SxProps<Theme>;
    settingsExpanded: boolean;
    ignoreMissing: boolean;
    setIgnoreMissing: (value: boolean) => void;
    combineLinked: boolean;
    setCombineLinked: (value: boolean) => void;
    splitVfx: boolean;
    setSplitVfx: (value: boolean) => void;
    consolidateAssets: boolean;
    setConsolidateAssets: (value: boolean) => void;
    hideDataFolderBins: boolean;
    setHideDataFolderBins: (value: boolean) => void;
    saveSettings: (key: string, value: boolean) => void;
}

const toggleRow = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            userSelect: 'none',
        }}
    >
        <span className="dl-toggle">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span className="dl-toggle__track" />
            <span className="dl-toggle__thumb" />
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>
            {label}
        </span>
    </label>
);

const BumpathSettingsPanel = React.memo(function BumpathSettingsPanel({
    panelStyle,
    settingsExpanded,
    ignoreMissing,
    setIgnoreMissing,
    combineLinked,
    setCombineLinked,
    splitVfx,
    setSplitVfx,
    consolidateAssets,
    setConsolidateAssets,
    hideDataFolderBins,
    setHideDataFolderBins,
    saveSettings,
}: BumpathSettingsPanelProps) {
    return (
        <Box
            data-bumpath-settings-panel
            sx={{
                ...(panelStyle as object),
                borderTop: '1px solid var(--border)',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                maxHeight: settingsExpanded ? '160px' : '0px',
                opacity: settingsExpanded ? 1 : 0,
            }}
        >
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                {toggleRow('Ignore Missing Files', ignoreMissing, (v) => {
                    setIgnoreMissing(v);
                    saveSettings('BumpathIgnoreMissing', v);
                })}
                {toggleRow('Combine Linked BINs to Source BINs', combineLinked, (v) => {
                    setCombineLinked(v);
                    saveSettings('BumpathCombineLinked', v);
                })}
                {toggleRow('Split VFX into separate BINs', splitVfx, (v) => {
                    setSplitVfx(v);
                    saveSettings('BumpathSplitVfx', v);
                })}
                {toggleRow('Organize VFX assets into particle folders', consolidateAssets, (v) => {
                    setConsolidateAssets(v);
                    saveSettings('BumpathConsolidateAssets', v);
                })}
                {toggleRow('Hide path in bin list', hideDataFolderBins, (v) => {
                    setHideDataFolderBins(v);
                    saveSettings('BumpathHideDataFolderBins', v);
                })}
            </Box>
        </Box>
    );
});

export default BumpathSettingsPanel;
