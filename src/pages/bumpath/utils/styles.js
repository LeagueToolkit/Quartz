export const panelStyle = {
  background: 'transparent',
  border: 'none',
  boxShadow: 'none',
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
  borderRadius: 0,
};

export const celestialButtonStyle = {
  background: 'var(--bg-2)',
  border: '1px solid var(--accent-muted)',
  color: 'var(--text)',
  borderRadius: '5px',
  transition: 'all 200ms ease',
  textTransform: 'none',
  fontFamily: 'JetBrains Mono, monospace',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  '&:hover': {
    background: 'var(--surface-2)',
    borderColor: 'var(--accent)',
    boxShadow: '0 0 15px color-mix(in srgb, var(--accent), transparent 60%)'
  },
  '&:disabled': {
    background: 'var(--bg-2)',
    borderColor: 'var(--text-2)',
    color: 'var(--text-2)',
    opacity: 0.6,
    cursor: 'not-allowed'
  },
};

export const getActionButtonSx = (tone, options = {}) => {
  const {
    height = '34px',
    fontSize = '0.8rem',
    px = 1.5,
    minWidth = 'auto',
    iconOnly = false,
    prominent = false,
  } = options;

  return {
    ...celestialButtonStyle,
    height,
    fontSize,
    px,
    minWidth: iconOnly ? '40px' : minWidth,
    width: iconOnly ? '40px' : 'auto',
    borderColor: `${tone} !important`,
    color: `${tone} !important`,
    background: `linear-gradient(180deg, color-mix(in srgb, ${tone}, transparent 90%), color-mix(in srgb, var(--bg-2), black 8%))`,
    boxShadow: prominent
      ? `0 0 0 1px color-mix(in srgb, ${tone}, transparent 60%), 0 6px 14px rgba(0,0,0,0.28)`
      : `0 2px 6px rgba(0,0,0,0.24), inset 0 1px 0 color-mix(in srgb, ${tone}, transparent 85%)`,
    '&:hover': {
      ...celestialButtonStyle['&:hover'],
      borderColor: `${tone} !important`,
      color: `${tone} !important`,
      transform: 'translateY(-1px) scale(1.02)',
      filter: 'brightness(1.06)',
      boxShadow: prominent
        ? `0 0 0 1px color-mix(in srgb, ${tone}, transparent 40%), 0 0 18px color-mix(in srgb, ${tone}, transparent 55%), 0 10px 20px rgba(0,0,0,0.35)`
        : `0 0 14px color-mix(in srgb, ${tone}, transparent 62%), 0 8px 18px rgba(0,0,0,0.3)`,
    },
    '&:active': {
      transform: 'translateY(0) scale(0.99)',
      filter: 'brightness(0.98)',
    },
    '&:disabled': {
      ...celestialButtonStyle['&:disabled'],
      transform: 'none',
      filter: 'none',
      boxShadow: 'none',
    }
  };
};
