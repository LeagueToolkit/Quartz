import React from 'react';
import { Box, Typography, Alert } from '@mui/material';
import { CheckCircle as CheckCircleIcon, Close as CloseIcon } from '@mui/icons-material';

interface BumpathStatusOverlaysProps {
    error: string | null;
    success: string | null;
    setSuccess: (value: string | null) => void;
}

const BumpathStatusOverlays = React.memo(function BumpathStatusOverlays({
    error,
    success,
    setSuccess,
}: BumpathStatusOverlaysProps) {
    return (
        <>
            {error && (
                <Alert
                    severity="error"
                    sx={{
                        position: 'fixed',
                        top: 80,
                        right: 20,
                        zIndex: 1000,
                        background: 'var(--bg-secondary)',
                        border: '1px solid color-mix(in oklab, var(--color-danger) 35%, var(--border))',
                        '& .MuiAlert-message': { color: 'var(--color-danger)', fontFamily: 'JetBrains Mono, monospace' },
                        '& .MuiAlert-icon': { color: 'var(--color-danger)' },
                    }}
                >
                    {error}
                </Alert>
            )}

            {success && (
                <Box
                    sx={{
                        position: 'fixed',
                        top: 80,
                        right: 20,
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 2.5,
                        py: 1.5,
                        borderRadius: '8px',
                        backgroundColor: 'color-mix(in oklab, var(--color-success) 92%, transparent)',
                        border: '1px solid color-mix(in oklab, var(--color-success) 30%, transparent)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        maxWidth: '400px',
                        animation: 'slideIn 0.3s ease-out',
                        transition: 'all 0.3s ease-out',
                    }}
                >
                    <CheckCircleIcon sx={{ color: '#ffffff', fontSize: '1.2rem' }} />
                    <Typography
                        variant="body2"
                        sx={{
                            color: '#ffffff',
                            fontSize: '0.8rem',
                            fontWeight: '500',
                            fontFamily: 'JetBrains Mono, monospace',
                            flex: 1,
                        }}
                    >
                        {success}
                    </Typography>
                    <button
                        type="button"
                        className="dl-btn dl-btn--icon dl-btn--sm dl-btn--ghost"
                        onClick={() => setSuccess(null)}
                        title="Dismiss"
                        style={{ color: '#ffffff' }}
                    >
                        <span className="dl-icon"><CloseIcon sx={{ fontSize: '1rem' }} /></span>
                    </button>
                </Box>
            )}
        </>
    );
});

export default BumpathStatusOverlays;
