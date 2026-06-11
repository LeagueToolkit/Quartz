import { CircularProgress } from '@mui/material';

export default function GlowingSpinner({ text = 'Working...' }: { text?: string }) {
    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 6000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
            }}
        >
            <CircularProgress size={48} sx={{ color: 'var(--accent)' }} />
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem', color: 'var(--accent)' }}>{text}</div>
        </div>
    );
}
