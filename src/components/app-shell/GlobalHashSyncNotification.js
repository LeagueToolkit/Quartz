import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Collapse,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  ErrorOutline as ErrorOutlineIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

const GlobalHashSyncNotification = () => {
  const [state, setState] = useState({
    visible: false,
    status: 'idle',
    message: '',
    current: 0,
    total: 0,
    downloaded: 0,
    skipped: 0,
    errors: [],
  });

  const progressLabel = useMemo(() => {
    if (state.total > 0 && state.current > 0) {
      return `${state.current}/${state.total}`;
    }
    return '';
  }, [state.current, state.total]);

  useEffect(() => {
    if (!window.require) return undefined;
    const { ipcRenderer } = window.require('electron');

    const onHashState = (_event, payload) => {
      const status = payload?.status || 'idle';
      if (status === 'checking' || status === 'downloading') {
        setState((prev) => ({
          ...prev,
          visible: true,
          status,
          message: payload?.message || (status === 'checking' ? 'Checking hash updates...' : 'Updating hashes...'),
          current: Number(payload?.current || 0),
          total: Number(payload?.total || 0),
        }));
        return;
      }

      if (status === 'success') {
        setState({
          visible: true,
          status: 'success',
          message: payload?.message || 'Hashes are up to date',
          current: 0,
          total: 0,
          downloaded: Array.isArray(payload?.downloaded) ? payload.downloaded.length : 0,
          skipped: Array.isArray(payload?.skipped) ? payload.skipped.length : 0,
          errors: Array.isArray(payload?.errors) ? payload.errors : [],
        });
        setTimeout(() => {
          setState((prev) => ({ ...prev, visible: false }));
        }, 4200);
        return;
      }

      if (status === 'error') {
        setState({
          visible: true,
          status: 'error',
          message: payload?.message || 'Hash auto-sync failed',
          current: 0,
          total: 0,
          downloaded: 0,
          skipped: 0,
          errors: Array.isArray(payload?.errors) ? payload.errors : [],
        });
      }
    };

    ipcRenderer.on('hash:auto-sync-state', onHashState);
    return () => {
      ipcRenderer.removeListener('hash:auto-sync-state', onHashState);
    };
  }, []);

  if (!state.visible) return null;

  const isBusy = state.status === 'checking' || state.status === 'downloading';
  const isSuccess = state.status === 'success';
  const isError = state.status === 'error';

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 72,
        right: 24,
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    >
      <Collapse in={state.visible}>
        <Box
          sx={{
            pointerEvents: 'auto',
            background: 'rgba(255,255,255,0.026)',
            backdropFilter: 'blur(20px)',
            border: isError
              ? '1px solid rgba(239,68,68,0.35)'
              : isSuccess
                ? '1px solid rgba(34,197,94,0.3)'
                : '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            borderRadius: '14px',
            p: 2,
            width: { xs: 'calc(100vw - 48px)', sm: 340, md: 380 },
            boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: isSuccess
                  ? 'rgba(34,197,94,0.14)'
                  : isError
                    ? 'rgba(239,68,68,0.12)'
                    : 'color-mix(in srgb, var(--accent) 15%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: isSuccess
                  ? '1px solid rgba(34,197,94,0.35)'
                  : isError
                    ? '1px solid rgba(239,68,68,0.35)'
                    : '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
              }}
            >
              {isBusy && <CircularProgress size={18} sx={{ color: 'var(--accent)' }} />}
              {isSuccess && <CheckCircleIcon sx={{ color: '#4ade80', fontSize: 18 }} />}
              {isError && <ErrorOutlineIcon sx={{ color: '#ef4444', fontSize: 18 }} />}
            </Box>

            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem', lineHeight: 1.1, mb: 0.5 }}>
                Hash Update
              </Typography>
              <Typography sx={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.76)', fontWeight: 500, lineHeight: 1.35 }}>
                {state.message}
              </Typography>
              {isBusy && progressLabel && (
                <Typography sx={{ mt: 0.5, fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)' }}>
                  {progressLabel}
                </Typography>
              )}
              {isSuccess && (
                <Typography sx={{ mt: 0.5, fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)' }}>
                  Updated: {state.downloaded} - Up to date: {state.skipped}
                </Typography>
              )}
              {isError && state.errors.length > 0 && (
                <Typography sx={{ mt: 0.5, fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)' }}>
                  {state.errors[0]}
                </Typography>
              )}
            </Box>

            <IconButton
              size="small"
              onClick={() => setState((prev) => ({ ...prev, visible: false }))}
              sx={{ mt: -0.5, color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#fff' } }}
            >
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>

        </Box>
      </Collapse>
    </Box>
  );
};

export default GlobalHashSyncNotification;

