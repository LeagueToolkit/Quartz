import React from 'react';
import { Box, Button, FormControlLabel, Switch, Typography } from '@mui/material';
import { Folder as FolderIcon, CheckBox as CheckBoxIcon, Clear as ClearIcon } from '@mui/icons-material';
import { getActionButtonSx } from '../utils/styles';

const BumpathTopBar = React.memo(function BumpathTopBar({
  handleSelectSourceDir,
  handleSelectAll,
  handleDeselectAll,
  scannedData,
  selectedEntriesSize,
  showMissingOnly,
  setShowMissingOnly,
}) {
  return (
    <Box
      sx={{
        p: 1.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        minHeight: '60px'
      }}
    >
      <Button
        startIcon={<FolderIcon />}
        onClick={handleSelectSourceDir}
        sx={getActionButtonSx('#ecb96a')}
      >
        Add Source Folders
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Button
          startIcon={<CheckBoxIcon />}
          onClick={handleSelectAll}
          disabled={!scannedData || Object.keys(scannedData.entries).length === 0}
          data-bumpath-select-all
          sx={getActionButtonSx('#10b981')}
        >
          Select All
        </Button>

        <Button
          startIcon={<ClearIcon />}
          onClick={handleDeselectAll}
          disabled={!scannedData || selectedEntriesSize === 0}
          sx={getActionButtonSx('#ef4444')}
        >
          Deselect All
        </Button>
      </Box>

      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={showMissingOnly}
            onChange={(e) => setShowMissingOnly(e.target.checked)}
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--accent)' },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--accent)' },
            }}
          />
        }
        label={
          <Typography variant="body2" sx={{ color: 'var(--accent2)', fontSize: '0.7rem', fontWeight: '500' }}>
            Show Missing Files Only
          </Typography>
        }
      />
    </Box>
  );
});

export default BumpathTopBar;
