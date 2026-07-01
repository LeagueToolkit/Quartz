import type { SxProps, Theme } from '@mui/material';

export const containerStyle: SxProps<Theme> = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'transparent',
    color: 'var(--text)',
    fontFamily: 'JetBrains Mono, monospace',
};

export const headerStyle: SxProps<Theme> = {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    background: 'var(--bg)',
    backdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(120%)',
    WebkitBackdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(120%)',
    borderBottom: '1px solid var(--glass-border)',
};

export const mainContentStyle: SxProps<Theme> = {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    background: 'var(--bg)',
    backdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(120%)',
    WebkitBackdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(120%)',
    borderTop: '1px solid var(--glass-border)',
};

export const treeViewStyle: Record<string, unknown> = {
    flex: 1,
    overflow: 'auto',
    background: 'var(--bg)',
    backdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(125%)',
    WebkitBackdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(125%)',
    border: '1px solid var(--glass-border)',
    borderRadius: '10px',
    margin: '1rem',
    padding: '0.75rem',
};

export const sidebarStyle: SxProps<Theme> = {
    width: '240px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '1rem',
    paddingLeft: 0,
    overflow: 'hidden',
    minHeight: 0,
    background: 'var(--bg)',
    backdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(122%)',
    WebkitBackdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(122%)',
};
