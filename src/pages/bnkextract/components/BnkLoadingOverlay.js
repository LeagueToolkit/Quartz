import React from 'react';
import { Backdrop, CircularProgress, LinearProgress, Typography } from '@mui/material';

export default function BnkLoadingOverlay({ isLoading, autoExtractOpen, statusMessage }) {
    return (
        <>
            {isLoading && <LinearProgress sx={{ height: 2 }} />}
            <Backdrop
                sx={{
                    color: 'var(--accent)',
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    flexDirection: 'column',
                    gap: 2,
                    backdropFilter: 'blur(8px)',
                    background: 'rgba(0,0,0,0.7)',
                }}
                open={isLoading && autoExtractOpen === false}
            >
                <CircularProgress color="inherit" />
                <Typography sx={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem', color: 'white' }}>
                    {statusMessage}
                </Typography>
            </Backdrop>
        </>
    );
}
