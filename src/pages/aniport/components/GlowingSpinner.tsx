import { CircularProgress } from '@mui/material';

export default function GlowingSpinner() {
    return <CircularProgress size={56} sx={{ color: 'var(--accent)' }} />;
}
