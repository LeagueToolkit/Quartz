import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';

interface CelestiaTriggerButtonProps {
    showCelestiaGuide: boolean;
    setShowCelestiaGuide: (value: boolean) => void;
    settingsExpanded: boolean;
}

const CelestiaTriggerButton = React.memo(function CelestiaTriggerButton({
    showCelestiaGuide,
    setShowCelestiaGuide,
    settingsExpanded,
}: CelestiaTriggerButtonProps) {
    if (showCelestiaGuide) return null;

    return (
        <Tooltip title="Celestia guide" placement="left" arrow>
            <IconButton
                onClick={() => setShowCelestiaGuide(true)}
                aria-label="Open Celestia guide"
                sx={{
                    position: 'fixed',
                    bottom: settingsExpanded ? 150 : 90,
                    right: 24,
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    zIndex: 4500,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--accent-muted)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    '&:hover': {
                        background: 'var(--bg-tertiary)',
                        borderColor: 'var(--accent-primary)',
                        boxShadow: '0 0 0 3px color-mix(in oklab, var(--accent-primary) 25%, transparent)',
                    },
                    transition: 'all 0.2s ease',
                }}
            >
                <Box component="span" sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>!</Box>
            </IconButton>
        </Tooltip>
    );
});

export default CelestiaTriggerButton;
