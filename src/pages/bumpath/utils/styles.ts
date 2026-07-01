// Shared bumpath layout style. The panel surface stays wallpaper-aware by
// keeping the container fully transparent so page tokens show through.

export const panelStyle = {
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    borderRadius: 0,
} as const;
