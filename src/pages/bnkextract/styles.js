export const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'transparent',
    color: 'var(--text)',
    fontFamily: 'JetBrains Mono, monospace',
};

export const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    background: 'var(--bg)',
    backdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(120%)',
    WebkitBackdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(120%)',
    borderBottom: '1px solid var(--glass-border)',
};

export const mainContentStyle = {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    background: 'var(--bg)',
    backdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(120%)',
    WebkitBackdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(120%)',
    borderTop: '1px solid var(--glass-border)',
};

export const treeViewStyle = {
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

export const sidebarStyle = {
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

export const buttonStyle = {
    background: 'var(--bg)',
    backgroundColor: 'var(--bg)',
    backdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)',
    WebkitBackdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)',
    color: 'var(--text)',
    border: '1px solid var(--glass-border)',
    borderRadius: '6px',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.8rem',
    textTransform: 'none',
    justifyContent: 'flex-start',
    padding: '0.5rem 0.8rem',
    minHeight: '36px',
    boxShadow: 'none',
    '&:hover': {
        background: 'var(--bg)',
        backgroundColor: 'var(--bg)',
        borderColor: 'var(--accent)',
        boxShadow: 'none',
    },
    '&:disabled': {
        opacity: 0.4,
        color: 'var(--text-2)',
    },
    '&.MuiButton-contained': {
        background: 'var(--bg)',
        backgroundColor: 'var(--bg)',
        boxShadow: 'none',
    },
    '&.MuiButton-contained:hover': {
        background: 'var(--bg)',
        backgroundColor: 'var(--bg)',
        boxShadow: 'none',
    },
    '&.MuiButton-contained.Mui-disabled': {
        background: 'var(--bg)',
        backgroundColor: 'var(--bg)',
        color: 'var(--text-2)',
        opacity: 0.4,
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
        background: 'var(--bg)',
        backdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)',
        WebkitBackdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)',
        borderRadius: '6px',
        fontSize: '0.8rem',
        fontFamily: 'JetBrains Mono, monospace',
        color: 'var(--text)',
        height: '36px',
        '& fieldset': { borderColor: 'var(--glass-border)' },
        '&:hover fieldset': {
            borderColor: 'rgba(255, 255, 255, 0.26)',
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
