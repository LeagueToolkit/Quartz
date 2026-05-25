import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  TextField,
  IconButton,
  Tooltip,
  FormControlLabel,
  Checkbox,
  CircularProgress,
} from '@mui/material';
import {
  Palette as PaletteIcon,
  FolderOpen as FolderOpenIcon,
  PlayArrow as PlayArrowIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';

const { ipcRenderer } = window.require
  ? window.require('electron')
  : { ipcRenderer: null };
const path = window.require ? window.require('path') : null;

const baseFieldSx = {
  '& .MuiOutlinedInput-root': {
    background: 'rgba(255,255,255,0.03)',
    color: '#fff',
    borderRadius: '8px',
    fontSize: '0.78rem',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
  },
  '& .MuiInputBase-input': { py: 1 },
};

async function pickBinFile(title) {
  if (!ipcRenderer) return null;
  const result = await ipcRenderer.invoke('dialog:openFile', {
    title,
    properties: ['openFile'],
    filters: [{ name: 'BIN Files', extensions: ['bin'] }],
  });
  if (result?.canceled || !result?.filePaths?.length) return null;
  return result.filePaths[0];
}

async function pickSaveBinFile(defaultPath) {
  if (!ipcRenderer) return null;
  const result = await ipcRenderer.invoke('dialog:saveFile', {
    title: 'Save modified BIN as',
    defaultPath,
    filters: [{ name: 'BIN Files', extensions: ['bin'] }],
  });
  if (result?.canceled || !result?.filePath) return null;
  return result.filePath;
}

const BinColorCopyCard = ({ onNotify }) => {
  const [sourcePath, setSourcePath] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [overwriteTarget, setOverwriteTarget] = useState(true);
  const [createBackup, setCreateBackup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const notify = (message, severity = 'info') => {
    if (typeof onNotify === 'function') onNotify({ message, severity });
  };

  const handleRun = async () => {
    if (!ipcRenderer) {
      notify('IPC unavailable — must run inside Electron', 'error');
      return;
    }
    if (!sourcePath || !targetPath) {
      notify('Select both source and target bins first', 'warning');
      return;
    }

    let outputPath = null;
    if (!overwriteTarget) {
      const suggested =
        path && targetPath
          ? path.join(
              path.dirname(targetPath),
              `${path.basename(targetPath, '.bin')}_colored.bin`
            )
          : targetPath;
      outputPath = await pickSaveBinFile(suggested);
      if (!outputPath) return;
    }

    setBusy(true);
    setLastResult(null);
    try {
      const res = await ipcRenderer.invoke('bin:copyColors', {
        sourcePath,
        targetPath,
        outputPath,
        createBackup: overwriteTarget && createBackup,
      });
      if (!res?.success) {
        notify(`Copy failed: ${res?.error || 'unknown error'}`, 'error');
        setLastResult({ ok: false, ...res });
        return;
      }
      const where = res.outputPath || targetPath;
      const baseName = path ? path.basename(where) : where;
      notify(
        `Copied ${res.fieldsCopied} color value(s) across ${res.entriesMatched} entries → ${baseName}`,
        'success'
      );
      setLastResult({ ok: true, ...res });
    } catch (e) {
      notify(`Copy crashed: ${e.message}`, 'error');
      setLastResult({ ok: false, error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const PathPicker = ({ label, value, onChange, onPick }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <TextField
        size="small"
        fullWidth
        placeholder={`${label} .bin path…`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={baseFieldSx}
      />
      <Tooltip title={`Browse for ${label.toLowerCase()} bin`}>
        <IconButton
          size="small"
          onClick={onPick}
          sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: 'var(--accent)' } }}
        >
          <FolderOpenIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {value && (
        <Tooltip title="Clear">
          <IconButton
            size="small"
            onClick={() => onChange('')}
            sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#ff4d4d' } }}
          >
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );

  return (
    <Box
      sx={{
        background: 'rgba(255,255,255,0.026)',
        border: '1px solid rgba(255,255,255,0.055)',
        borderRadius: '12px',
        p: 2,
        mb: 3,
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: '20%',
          right: '20%',
          height: '1px',
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            color: 'var(--accent)',
          }}
        >
          <PaletteIcon fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{ color: '#fff', fontSize: '0.88rem', fontWeight: 700, lineHeight: 1.2 }}
          >
            Copy BIN Colors
          </Typography>
          <Typography
            sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', mt: 0.25 }}
          >
            Copy VFX colors (RGBA + named VEC4 fields) from a source bin into a structurally
            identical target bin. Inspired by ltmao&apos;s hapibin.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mb: 1.5 }}>
        <Box>
          <Typography
            sx={{
              color: 'var(--accent)',
              fontSize: '0.6rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              mb: 0.5,
              opacity: 0.8,
            }}
          >
            Source (donor colors)
          </Typography>
          <PathPicker
            label="Source"
            value={sourcePath}
            onChange={setSourcePath}
            onPick={async () => {
              const p = await pickBinFile('Select source bin (donor)');
              if (p) setSourcePath(p);
            }}
          />
        </Box>
        <Box>
          <Typography
            sx={{
              color: 'var(--accent)',
              fontSize: '0.6rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              mb: 0.5,
              opacity: 0.8,
            }}
          >
            Target (gets recolored)
          </Typography>
          <PathPicker
            label="Target"
            value={targetPath}
            onChange={setTargetPath}
            onPick={async () => {
              const p = await pickBinFile('Select target bin (will be recolored)');
              if (p) setTargetPath(p);
            }}
          />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={overwriteTarget}
              onChange={(e) => setOverwriteTarget(e.target.checked)}
              sx={{
                color: 'rgba(255,255,255,0.3)',
                '&.Mui-checked': { color: 'var(--accent)' },
                py: 0.5,
              }}
            />
          }
          label={
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
              Overwrite target in place
            </Typography>
          }
          sx={{ m: 0 }}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={createBackup}
              disabled={!overwriteTarget}
              onChange={(e) => setCreateBackup(e.target.checked)}
              sx={{
                color: 'rgba(255,255,255,0.3)',
                '&.Mui-checked': { color: 'var(--accent)' },
                py: 0.5,
              }}
            />
          }
          label={
            <Typography
              sx={{
                fontSize: '0.75rem',
                color: overwriteTarget
                  ? 'rgba(255,255,255,0.7)'
                  : 'rgba(255,255,255,0.3)',
              }}
            >
              Create .bak backup
            </Typography>
          }
          sx={{ m: 0 }}
        />

        <Box sx={{ flex: 1 }} />

        {lastResult?.ok && (
          <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)' }}>
            Last run: {lastResult.fieldsCopied} field(s), {lastResult.entriesMatched} entries
            matched, {lastResult.entriesSkipped} skipped
          </Typography>
        )}

        <Button
          size="small"
          variant="contained"
          startIcon={
            busy ? <CircularProgress size={14} sx={{ color: '#000' }} /> : <PlayArrowIcon />
          }
          disabled={busy || !sourcePath || !targetPath}
          onClick={handleRun}
          sx={{
            background: 'var(--accent)',
            color: '#000',
            borderRadius: '8px',
            textTransform: 'none',
            fontSize: '0.75rem',
            fontWeight: 700,
            px: 2,
            boxShadow: 'none',
            '&:hover': { background: 'var(--accent)', opacity: 0.9 },
            '&.Mui-disabled': {
              background: 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.3)',
            },
          }}
        >
          {busy ? 'Copying…' : 'Copy Colors'}
        </Button>
      </Box>
    </Box>
  );
};

export default BinColorCopyCard;
