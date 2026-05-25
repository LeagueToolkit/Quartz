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
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  AutoFixHigh as AutoFixHighIcon,
  FolderOpen as FolderOpenIcon,
  PlayArrow as PlayArrowIcon,
  Clear as ClearIcon,
  InsertDriveFile as FileIcon,
  Folder as FolderIcon,
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

async function pickBinFile() {
  if (!ipcRenderer) return null;
  const result = await ipcRenderer.invoke('dialog:openFile', {
    title: 'Select .bin to fix',
    properties: ['openFile'],
    filters: [{ name: 'BIN Files', extensions: ['bin'] }],
  });
  if (result?.canceled || !result?.filePaths?.length) return null;
  return result.filePaths[0];
}

async function pickFolder() {
  if (!ipcRenderer) return null;
  const result = await ipcRenderer.invoke('dialog:openDirectory', {
    title: 'Select folder (recursively scans for .bin)',
    properties: ['openDirectory'],
  });
  if (result?.canceled || !result?.filePaths?.length) return null;
  return result.filePaths[0];
}

const FixVfxShapeCard = ({ onNotify }) => {
  const [mode, setMode] = useState('file'); // 'file' | 'folder'
  const [targetPath, setTargetPath] = useState('');
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
    if (!targetPath) {
      notify(`Select a ${mode} first`, 'warning');
      return;
    }
    setBusy(true);
    setLastResult(null);
    try {
      const payload = { createBackup };
      if (mode === 'file') payload.filePath = targetPath;
      else payload.folderPath = targetPath;

      const res = await ipcRenderer.invoke('bin:fixVfxShape', payload);
      if (!res?.success) {
        notify(`Fix failed: ${res?.error || 'unknown error'}`, 'error');
        setLastResult({ ok: false, ...res });
        return;
      }
      const totalShapes =
        (res.shapesRewrittenRadius || 0) +
        (res.shapesRewrittenVec3 || 0) +
        (res.shapesRewrittenEmpty || 0);
      const baseName = path ? path.basename(targetPath) : targetPath;
      notify(
        `Fixed ${totalShapes} shape(s) (${res.birthTranslationsLifted} BirthTranslation(s) lifted) — ` +
          `${res.filesModified}/${res.filesProcessed} file(s) modified in ${baseName}`,
        totalShapes > 0 || res.birthTranslationsLifted > 0 ? 'success' : 'info'
      );
      setLastResult({ ok: true, ...res });
    } catch (e) {
      notify(`Fix crashed: ${e.message}`, 'error');
      setLastResult({ ok: false, error: e.message });
    } finally {
      setBusy(false);
    }
  };

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
          <AutoFixHighIcon fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{ color: '#fff', fontSize: '0.88rem', fontWeight: 700, lineHeight: 1.2 }}
          >
            Fix VFX Shape
          </Typography>
          <Typography
            sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', mt: 0.25 }}
          >
            Rewrites legacy Shape pointers (and lifts BirthTranslation) in VfxEmitterDefinitionData.
            Ports ltmao&apos;s FixVfxShape script.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, v) => { if (v) { setMode(v); setTargetPath(''); } }}
          sx={{
            '& .MuiToggleButton-root': {
              color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '0.7rem',
              fontWeight: 600,
              textTransform: 'none',
              px: 1.5,
              py: 0.5,
              '&.Mui-selected': {
                background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                color: 'var(--accent)',
                borderColor: 'var(--accent)',
              },
            },
          }}
        >
          <ToggleButton value="file"><FileIcon sx={{ fontSize: 14, mr: 0.5 }} />Single .bin</ToggleButton>
          <ToggleButton value="folder"><FolderIcon sx={{ fontSize: 14, mr: 0.5 }} />Folder (recursive)</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          size="small"
          fullWidth
          placeholder={mode === 'file' ? '.bin file path…' : 'Folder path (scans for .bin)…'}
          value={targetPath}
          onChange={(e) => setTargetPath(e.target.value)}
          sx={baseFieldSx}
        />
        <Tooltip title={`Browse for ${mode}`}>
          <IconButton
            size="small"
            onClick={async () => {
              const p = mode === 'file' ? await pickBinFile() : await pickFolder();
              if (p) setTargetPath(p);
            }}
            sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: 'var(--accent)' } }}
          >
            <FolderOpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {targetPath && (
          <Tooltip title="Clear">
            <IconButton
              size="small"
              onClick={() => setTargetPath('')}
              sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#ff4d4d' } }}
            >
              <ClearIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={createBackup}
              onChange={(e) => setCreateBackup(e.target.checked)}
              sx={{
                color: 'rgba(255,255,255,0.3)',
                '&.Mui-checked': { color: 'var(--accent)' },
                py: 0.5,
              }}
            />
          }
          label={
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
              Create .bak backup before write
            </Typography>
          }
          sx={{ m: 0 }}
        />

        <Box sx={{ flex: 1 }} />

        {lastResult?.ok && (
          <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)' }}>
            Radius:{lastResult.shapesRewrittenRadius} · Vec3:{lastResult.shapesRewrittenVec3} ·
            {' '}Empty:{lastResult.shapesRewrittenEmpty} · BT:{lastResult.birthTranslationsLifted}
          </Typography>
        )}

        <Button
          size="small"
          variant="contained"
          startIcon={
            busy ? <CircularProgress size={14} sx={{ color: '#000' }} /> : <PlayArrowIcon />
          }
          disabled={busy || !targetPath}
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
          {busy ? 'Fixing…' : 'Run Fix'}
        </Button>
      </Box>
    </Box>
  );
};

export default FixVfxShapeCard;
