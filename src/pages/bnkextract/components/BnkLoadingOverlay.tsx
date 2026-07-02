import { Backdrop, CircularProgress, LinearProgress, Typography } from '@mui/material';

interface Props {
    isLoading: boolean;
    autoExtractOpen: boolean;
    statusMessage: string;
}

export default function BnkLoadingOverlay({ isLoading, autoExtractOpen, statusMessage }: Props) {
    return (
        <>
            {isLoading && <LinearProgress sx={{ height: 2 }} />}
            <Backdrop
                sx={{
                    color: 'var(--accent-primary)',
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    flexDirection: 'column',
                    gap: 2,
                    backdropFilter: 'blur(8px)',
                    background: 'color-mix(in oklab, var(--bg-primary) 70%, transparent)',
                }}
                open={isLoading && autoExtractOpen === false}
            >
                <CircularProgress color="inherit" />
                <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {statusMessage}
                </Typography>
            </Backdrop>
        </>
    );
}
