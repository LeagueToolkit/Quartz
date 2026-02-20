export const sectionStyle = {
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '5px',
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
    boxShadow: '0 0 15px color-mix(in srgb, var(--accent), transparent 60%)',
  },
  '&:disabled': {
    background: 'var(--bg-2)',
    borderColor: 'var(--text-2)',
    color: 'var(--text-2)',
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  '&:active': {
    transform: 'translateY(1px)',
  },
};

export const primaryButtonStyle = {
  ...celestialButtonStyle,
  background: 'var(--bg-2)',
  border: '1px solid var(--accent)',
  color: 'var(--accent)',
  fontWeight: 'bold',
  boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent), transparent 70%), 0 2px 4px rgba(0,0,0,0.2)',
  '&:hover': {
    ...celestialButtonStyle['&:hover'],
    boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent), transparent 50%), 0 2px 4px rgba(0,0,0,0.3)',
  },
};
