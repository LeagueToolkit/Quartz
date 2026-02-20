export const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: 'JetBrains Mono, monospace',
};

export const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    background: 'rgba(0, 0, 0, 0.4)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
};

export const mainContentStyle = {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
};

export const treeViewStyle = {
    flex: 1,
    overflow: 'auto',
    background: 'rgba(0, 0, 0, 0.35)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    margin: '1rem',
    padding: '0.75rem',
};

export const sidebarStyle = {
    width: '240px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '1rem',
    paddingLeft: 0,
    overflow: 'hidden',
    minHeight: 0,
};

export const buttonStyle = {
    background: 'rgba(0, 0, 0, 0.4)',
    color: 'var(--text)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '6px',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.8rem',
    textTransform: 'none',
    justifyContent: 'flex-start',
    padding: '0.5rem 0.8rem',
    minHeight: '36px',
    '&:hover': {
        background: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'var(--accent)',
    },
    '&:disabled': {
        opacity: 0.4,
        color: 'var(--text-2)',
    },
};

export const compactButtonStyle = {
    ...buttonStyle,
    padding: '0.25rem 0.5rem',
    minWidth: 'unset',
    minHeight: '24px',
};

export const inputStyle = {
    '& .MuiOutlinedInput-root': {
        background: 'rgba(0, 0, 0, 0.35)',
        borderRadius: '6px',
        fontSize: '0.8rem',
        fontFamily: 'JetBrains Mono, monospace',
        color: 'var(--text)',
        height: '36px',
        '& fieldset': {
            borderColor: 'rgba(255, 255, 255, 0.15)',
        },
        '&:hover fieldset': {
            borderColor: 'rgba(255, 255, 255, 0.25)',
        },
        '&.Mui-focused fieldset': {
            borderColor: 'var(--accent)',
        },
    },
    '& .MuiInputBase-input': {
        padding: '4px 8px',
        color: 'rgba(255, 255, 255, 0.85)',
    },
    '& .MuiInputBase-input::placeholder': {
        color: 'rgba(255, 255, 255, 0.35)',
        opacity: 1,
    },
};

