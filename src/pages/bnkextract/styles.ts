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
    gap: '20px',
    padding: '12px',
    overflow: 'hidden',
    // Transparent so the app background (atmosphere/wallpaper) shows through.
    background: 'transparent',
    borderTop: '1px solid var(--glass-border)',
};

// Container-less pane (Port-style): the two halves split down the middle with a
// center divider — no bordered/rounded box, no margin. Drag-over highlight is
// applied in the component.
export const treeViewStyle: Record<string, unknown> = {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '8px',
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
