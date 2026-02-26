// WAD Explorer shared styles — follows ModelInspect inline style convention

export const container = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
};

export const topBar = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  background: 'rgba(0,0,0,0.15)',
  flexShrink: 0,
};

export const topBarLabel = {
  fontSize: 11,
  color: 'var(--text-2)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

export const pathInput = {
  flex: 1,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 12,
  color: 'var(--text)',
  outline: 'none',
  minWidth: 0,
};

export const iconBtn = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 6,
  padding: '4px 8px',
  cursor: 'pointer',
  color: 'var(--text)',
  fontSize: 12,
  gap: 4,
  whiteSpace: 'nowrap',
  transition: 'background 0.15s',
};

export const body = {
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
};

export const leftPanel = {
  width: 320,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid rgba(255,255,255,0.07)',
  background: 'rgba(0,0,0,0.18)',
  overflow: 'hidden',
};

export const unifiedWadRow = {
  display: 'flex',
  alignItems: 'center',
  height: 24,
  paddingLeft: 8,
  paddingRight: 8,
  gap: 5,
  cursor: 'pointer',
  userSelect: 'none',
  fontSize: 12,
  boxSizing: 'border-box',
  background: 'transparent',
};

export const leftPanelHeader = {
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-2)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

export const wadList = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
};

export const groupHeader = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px 4px',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-2)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  cursor: 'pointer',
  userSelect: 'none',
};

export const wadRow = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 12px 4px 20px',
  fontSize: 12,
  cursor: 'pointer',
  borderRadius: 0,
  userSelect: 'none',
  gap: 6,
  minWidth: 0,
  transition: 'background 0.1s',
};

export const rightPanel = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

export const treeHeader = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(0,0,0,0.10)',
  flexShrink: 0,
  fontSize: 12,
  color: 'var(--text-2)',
};

export const searchInput = {
  flex: 1,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 5,
  padding: '3px 8px',
  fontSize: 12,
  color: 'var(--text)',
  outline: 'none',
};

export const treeArea = {
  flex: 1,
  overflow: 'hidden',
};

export const treeRow = {
  display: 'flex',
  alignItems: 'center',
  height: 26,
  paddingRight: 8,
  cursor: 'pointer',
  userSelect: 'none',
  fontSize: 12,
  gap: 4,
  boxSizing: 'border-box',
};

export const emptyState = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 10,
  color: 'var(--text-2)',
  fontSize: 13,
};

export const badge = {
  fontSize: 10,
  padding: '1px 5px',
  borderRadius: 3,
  background: 'rgba(255,255,255,0.07)',
  color: 'var(--text-2)',
  flexShrink: 0,
};

export const spinner = {
  width: 20,
  height: 20,
  border: '2px solid rgba(255,255,255,0.1)',
  borderTop: '2px solid var(--accent)',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
};

export const contextMenuItem = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 14px',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-2)',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'background 0.1s, color 0.1s',
};
