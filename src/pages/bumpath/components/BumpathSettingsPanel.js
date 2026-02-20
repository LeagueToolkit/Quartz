import React from 'react';
import { Box, FormControlLabel, Switch, Typography } from '@mui/material';

const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': {
    color: '#06b6d4',
    '&:hover': {
      backgroundColor: 'rgba(6, 182, 212, 0.1)'
    }
  },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
    backgroundColor: '#06b6d4',
    opacity: 0.8
  },
  '& .MuiSwitch-track': {
    backgroundColor: 'rgba(107, 114, 128, 0.3)',
    border: '1px solid rgba(107, 114, 128, 0.2)'
  },
  '& .MuiSwitch-thumb': {
    backgroundColor: '#ffffff',
    border: '1px solid rgba(107, 114, 128, 0.2)',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
  }
};

const labelSx = {
  color: 'var(--accent2)',
  fontSize: '0.8rem',
  fontWeight: '500'
};

const BumpathSettingsPanel = React.memo(function BumpathSettingsPanel({
  panelStyle,
  settingsExpanded,
  ignoreMissing,
  setIgnoreMissing,
  combineLinked,
  setCombineLinked,
  hideDataFolderBins,
  setHideDataFolderBins,
  saveSettings,
}) {
  return (
    <Box
      data-bumpath-settings-panel
      sx={{
        ...panelStyle,
        borderTop: '1px solid var(--glass-border)',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        maxHeight: settingsExpanded ? '160px' : '0px',
        opacity: settingsExpanded ? 1 : 0
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
        <FormControlLabel
          control={
            <Switch
              checked={ignoreMissing}
              onChange={(e) => {
                setIgnoreMissing(e.target.checked);
                saveSettings('BumpathIgnoreMissing', e.target.checked);
              }}
              sx={switchSx}
            />
          }
          label={<Typography variant="body2" sx={labelSx}>Ignore Missing Files</Typography>}
        />

        <FormControlLabel
          control={
            <Switch
              checked={combineLinked}
              onChange={(e) => {
                setCombineLinked(e.target.checked);
                saveSettings('BumpathCombineLinked', e.target.checked);
              }}
              sx={switchSx}
            />
          }
          label={<Typography variant="body2" sx={labelSx}>Combine Linked BINs to Source BINs</Typography>}
        />

        <FormControlLabel
          control={
            <Switch
              checked={hideDataFolderBins}
              onChange={(e) => {
                setHideDataFolderBins(e.target.checked);
                saveSettings('BumpathHideDataFolderBins', e.target.checked);
              }}
              sx={switchSx}
            />
          }
          label={<Typography variant="body2" sx={labelSx}>Hide path in bin list</Typography>}
        />
      </Box>
    </Box>
  );
});

export default BumpathSettingsPanel;
