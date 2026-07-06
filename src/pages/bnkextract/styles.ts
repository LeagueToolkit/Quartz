import type { SxProps, Theme } from '@mui/material';

export const containerStyle: SxProps<Theme> = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'transparent',
    color: 'var(--text)',
    fontFamily: 'var(--font-mono)',
};

export const mainContentStyle: SxProps<Theme> = {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    // Transparent so the app background (atmosphere/wallpaper) shows through.
    background: 'transparent',
    borderTop: '1px solid var(--glass-border)',
};

export const treeViewStyle: Record<string, unknown> = {
    flex: 1,
    overflow: 'auto',
    // Transparent fill; panels stay legible via their border + radius.
    background: 'transparent',
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
    background: 'transparent',
};
