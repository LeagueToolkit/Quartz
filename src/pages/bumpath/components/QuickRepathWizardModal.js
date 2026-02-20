import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { AutoFixHigh as AutoFixHighIcon, FolderOpen as FolderOpenIcon } from '@mui/icons-material';
import { getActionButtonSx } from '../utils/styles';

const stepLabels = [
  'Select Main BIN',
  'Choose Prefix',
  'Choose Output Folder',
];

const QuickRepathWizardModal = React.memo(function QuickRepathWizardModal({
  open,
  step,
  setStep,
  binOptions,
  selectedMainBin,
  setSelectedMainBin,
  quickPrefix,
  setQuickPrefix,
  quickOutputPath,
  setQuickOutputPath,
  ignoreMissing,
  setIgnoreMissing,
  combineLinked,
  setCombineLinked,
  onSelectOutputDir,
  onRunQuickRepath,
  onClose,
  isRunning,
}) {
  const canNextStep1 = Boolean(selectedMainBin);
  const canNextStep2 = Boolean((quickPrefix || '').trim());
  const canRun = Boolean((quickOutputPath || '').trim()) && !isRunning;

  const handleNext = () => {
    if (step === 0 && !canNextStep1) return;
    if (step === 1 && !canNextStep2) return;
    setStep(Math.min(2, step + 1));
  };

  const handleBack = () => {
    setStep(Math.max(0, step - 1));
  };

  return (
    <Dialog
      open={open}
      onClose={isRunning ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--bg), black 10%) 0%, color-mix(in srgb, var(--surface), var(--accent2) 10%) 100%)',
          border: '1px solid color-mix(in srgb, var(--accent2), transparent 55%)',
          borderRadius: '14px',
        }
      }}
    >
      <DialogTitle sx={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
        Quick Repath Wizard
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          {stepLabels.map((label, index) => (
            <Box
              key={label}
              sx={{
                px: 1.25,
                py: 0.5,
                borderRadius: '999px',
                fontSize: '0.72rem',
                fontFamily: 'JetBrains Mono, monospace',
                border: '1px solid',
                borderColor: index === step ? 'var(--accent)' : 'color-mix(in srgb, var(--accent2), transparent 70%)',
                color: index <= step ? 'var(--text)' : 'var(--text-2)',
                background: index === step
                  ? 'color-mix(in srgb, var(--accent), transparent 85%)'
                  : 'transparent',
              }}
            >
              {index + 1}. {label}
            </Box>
          ))}
        </Box>

        {step === 0 && (
          <Box>
            <Typography sx={{ color: 'var(--text-2)', mb: 1.2, fontSize: '0.85rem' }}>
              Pick the main BIN file that should drive repathing.
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: 'var(--text-2)' }}>Main BIN</InputLabel>
              <Select
                value={selectedMainBin}
                label="Main BIN"
                onChange={(e) => setSelectedMainBin(e.target.value)}
                sx={{
                  color: 'var(--text)',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--glass-border)' },
                }}
              >
                {binOptions.map((bin) => (
                  <MenuItem key={bin.value} value={bin.value}>
                    {bin.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        {step === 1 && (
          <Box>
            <Typography sx={{ color: 'var(--text-2)', mb: 1.2, fontSize: '0.85rem' }}>
              Enter the prefix to apply to all editable entries.
            </Typography>
            <TextField
              value={quickPrefix}
              onChange={(e) => setQuickPrefix(e.target.value)}
              fullWidth
              size="small"
              placeholder="e.g. bum"
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: 'var(--text)',
                  '& fieldset': { borderColor: 'var(--glass-border)' },
                }
              }}
            />
          </Box>
        )}

        {step === 2 && (
          <Box>
            <Typography sx={{ color: 'var(--text-2)', mb: 1.2, fontSize: '0.85rem' }}>
              Select or type an output folder. Missing folders will be created.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                value={quickOutputPath}
                onChange={(e) => setQuickOutputPath(e.target.value)}
                fullWidth
                size="small"
                placeholder="Output path"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: 'var(--text)',
                    '& fieldset': { borderColor: 'var(--glass-border)' },
                  }
                }}
              />
              <Button
                startIcon={<FolderOpenIcon />}
                onClick={onSelectOutputDir}
                sx={getActionButtonSx('#06b6d4')}
              >
                Browse
              </Button>
            </Box>
            <Box sx={{ mt: 1.2, display: 'flex', flexDirection: 'column', gap: 0.4 }}>
              <FormControlLabel
                control={(
                  <Switch
                    checked={ignoreMissing}
                    onChange={(e) => setIgnoreMissing(e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': { color: '#06b6d4' },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#06b6d4' },
                    }}
                  />
                )}
                label={<Typography sx={{ color: 'var(--text-2)', fontSize: '0.82rem' }}>Ignore Missing Files</Typography>}
              />
              <FormControlLabel
                control={(
                  <Switch
                    checked={combineLinked}
                    onChange={(e) => setCombineLinked(e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': { color: '#06b6d4' },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#06b6d4' },
                    }}
                  />
                )}
                label={<Typography sx={{ color: 'var(--text-2)', fontSize: '0.82rem' }}>Combine Linked BINs</Typography>}
              />
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={isRunning} sx={getActionButtonSx('var(--text-2)')}>
          Cancel
        </Button>
        <Button onClick={handleBack} disabled={isRunning || step === 0} sx={getActionButtonSx('var(--accent2)')}>
          Back
        </Button>
        {step < 2 ? (
          <Button onClick={handleNext} disabled={isRunning || (step === 0 ? !canNextStep1 : !canNextStep2)} sx={getActionButtonSx('var(--accent)')}>
            Next
          </Button>
        ) : (
          <Button
            startIcon={<AutoFixHighIcon />}
            onClick={onRunQuickRepath}
            disabled={!canRun}
            sx={getActionButtonSx('#f97316', { prominent: true })}
          >
            {isRunning ? 'Running...' : 'Run Quick Repath'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
});

export default QuickRepathWizardModal;
