/**
 * RitobinWarningModal - Reusable warning modal for missing ritobin configuration
 * 
 * Shows a styled warning dialog and navigates to Settings > External Tools
 * with the ritobin path input highlighted.
 * 
 * Can auto-detect hashed content if content prop is provided.
 */

import React, { useMemo } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SettingsIcon from '@mui/icons-material/Settings';

/**
 * Detect if the parsed content is mostly hashed (missing hash database)
 * @param {string} content - The .py file content
 * @returns {boolean} - True if content appears to be hashed
 */
function detectHashedContent(content) {
    if (!content) return false;

    // Common readable field names that should appear in a properly parsed file
    const readableFields = [
        'type:', 'version:', 'linked:', 'entries:', 'particleName:', 'emitterName:',
        'texture:', 'color:', 'birthColor:', 'fresnelColor:', 'lingerColor:',
        'blendMode:', 'constantValue:', 'values:', 'times:', 'VfxSystemDefinitionData',
        'VfxEmitterDefinitionData', 'ValueColor', 'list[', 'map[', 'embed =',
        'string =', 'u32 =', 'f32 =', 'vec4 =', 'vec3 =', 'vec2 =', 'bool ='
    ];

    // Pattern for hashed field names: 0x followed by 8 hex digits, then colon
    const hashedFieldPattern = /0x[0-9a-fA-F]{8}\s*:/g;
    
    // Count hashed fields
    const hashedMatches = content.match(hashedFieldPattern) || [];
    const hashedCount = hashedMatches.length;

    // Count readable fields
    let readableCount = 0;
    for (const field of readableFields) {
        const regex = new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        if (regex.test(content)) {
            readableCount++;
        }
    }

    // If we have a significant number of hashed fields and very few readable fields, it's likely hashed
    // Threshold: if hashed fields > 10 and readable fields < 5, consider it hashed
    // Or if hashed fields significantly outnumber readable field occurrences
    const totalReadableOccurrences = readableFields.reduce((count, field) => {
        const regex = new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = content.match(regex);
        return count + (matches ? matches.length : 0);
    }, 0);

    // More sophisticated check: if hashed fields are more than 30% of all field-like patterns
    // and we have at least 10 hashed fields, it's likely hashed
    if (hashedCount >= 10) {
        // Check ratio of hashed to readable
        if (hashedCount > totalReadableOccurrences * 0.3) {
            return true;
        }
        // Also check if readable fields are very sparse
        if (readableCount < 3 && hashedCount > 20) {
            return true;
        }
    }

    return false;
}

function RitobinWarningModal({ open, onClose, navigate, isHashedContent: isHashedContentProp = false, content = null, onContinueAnyway = null }) {
    // Auto-detect hashed content if content is provided, otherwise use prop
    const isHashedContent = useMemo(() => {
        if (content !== null) {
            return detectHashedContent(content);
        }
        return isHashedContentProp;
    }, [content, isHashedContentProp]);

    const handleContinueAnyway = () => {
        if (onContinueAnyway) {
            onContinueAnyway();
        }
        onClose();
    };
    const handleOpenSettings = () => {
        // Set flags for Settings to open External Tools and highlight ritobin
        localStorage.setItem('settings:open-section', 'tools');
        localStorage.setItem('settings:highlight-ritobin', 'true');
        
        onClose();
        
        // Navigate to settings
        if (navigate) {
            navigate('/settings');
        } else {
            // Fallback navigation methods
            try {
                window.dispatchEvent(new CustomEvent('celestia:navigate', { detail: { path: '/settings' } }));
            } catch {
                window.location.hash = '#/settings';
            }
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    background: 'var(--surface)',
                    border: '1px solid var(--accent)',
                    borderRadius: '12px',
                    backdropFilter: 'blur(20px)',
                    minWidth: 400,
                    maxWidth: 500
                }
            }}
        >
            <DialogTitle sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                borderBottom: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
                background: 'color-mix(in srgb, var(--accent), transparent 92%)',
                py: 2
            }}>
                <WarningAmberIcon sx={{ color: 'var(--accent)', fontSize: 28 }} />
                <Typography sx={{
                    color: 'var(--text)',
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    fontFamily: 'JetBrains Mono, monospace'
                }}>
                    {isHashedContent ? 'Hashed Content Detected' : 'Ritobin Not Configured'}
                </Typography>
            </DialogTitle>

            <DialogContent sx={{ pt: 3, pb: 2 }}>
                {isHashedContent ? (
                    <>
                        <Typography sx={{
                            color: 'var(--text)',
                            fontFamily: 'JetBrains Mono, monospace',
                            lineHeight: 1.6,
                            fontSize: '0.9rem',
                            mb: 2
                        }}>
                            The parsed file contains <Box component="span" sx={{ color: 'var(--accent)', fontWeight: 600 }}>hashed field names</Box> (e.g., <Box component="span" sx={{ color: 'var(--accent2)', fontFamily: 'monospace' }}>0xc7952e6b</Box>) instead of readable names.
                        </Typography>
                        
                        <Typography sx={{
                            color: 'var(--text-2)',
                            fontFamily: 'JetBrains Mono, monospace',
                            lineHeight: 1.6,
                            fontSize: '0.85rem',
                            mb: 2
                        }}>
                            This usually means:
                        </Typography>

                        <Box component="ul" sx={{
                            color: 'var(--text-2)',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '0.85rem',
                            pl: 3,
                            mb: 2,
                            '& li': { mb: 1 }
                        }}>
                            <li>The <Box component="span" sx={{ color: 'var(--accent)' }}>ritobin path</Box> is incorrect</li>
                            <li>The <Box component="span" sx={{ color: 'var(--accent)' }}>hashes folder</Box> is missing or not configured</li>
                            <li>Ritobin cannot find the hash database to resolve field names</li>
                        </Box>

                        <Box sx={{
                            mt: 3,
                            p: 2,
                            background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
                            border: '1px solid color-mix(in srgb, var(--accent2), transparent 70%)',
                            borderRadius: '8px'
                        }}>
                            <Typography sx={{
                                color: 'var(--text-2)',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.8rem'
                            }}>
                                Please verify your Ritobin path and ensure the hashes folder is correctly placed in the same folder with ritobin_cli, Settings → External Tools.
                            </Typography>
                        </Box>
                    </>
                ) : (
                    <>
                        <Typography sx={{
                            color: 'var(--text)',
                            fontFamily: 'JetBrains Mono, monospace',
                            lineHeight: 1.6,
                            fontSize: '0.9rem',
                            mb: 2
                        }}>
                            Ritobin CLI is required to open and convert <Box component="span" sx={{ color: 'var(--accent)', fontWeight: 600 }}>.bin</Box> files.
                        </Typography>
                        
                        <Typography sx={{
                            color: 'var(--text-2)',
                            fontFamily: 'JetBrains Mono, monospace',
                            lineHeight: 1.6,
                            fontSize: '0.85rem'
                        }}>
                            Please configure the path to <Box component="span" sx={{ color: 'var(--accent)' }}>ritobin_cli.exe</Box> in Settings → External Tools.
                        </Typography>

                        <Box sx={{
                            mt: 3,
                            p: 2,
                            background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
                            border: '1px solid color-mix(in srgb, var(--accent2), transparent 70%)',
                            borderRadius: '8px'
                        }}>
                            <Typography sx={{
                                color: 'var(--text-2)',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.8rem'
                            }}>
                                Ritobin is usually located in your FrogTools folder or can be downloaded from the Github.
                            </Typography>
                        </Box>
                    </>
                )}
            </DialogContent>

            <DialogActions sx={{
                p: 2,
                gap: 1,
                borderTop: '1px solid color-mix(in srgb, var(--accent), transparent 80%)'
            }}>
                <Button
                    onClick={onClose}
                    sx={{
                        color: 'var(--text-2)',
                        textTransform: 'none',
                        fontFamily: 'JetBrains Mono, monospace',
                        '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 90%)' }
                    }}
                >
                    Cancel
                </Button>
                {isHashedContent && onContinueAnyway && (
                    <Button
                        onClick={handleContinueAnyway}
                        sx={{
                            color: 'var(--text-2)',
                            textTransform: 'none',
                            fontFamily: 'JetBrains Mono, monospace',
                            border: '1px solid color-mix(in srgb, var(--accent), transparent 50%)',
                            '&:hover': { 
                                background: 'color-mix(in srgb, var(--accent), transparent 90%)',
                                borderColor: 'var(--accent)'
                            }
                        }}
                    >
                        Continue Anyway
                    </Button>
                )}
                <Button
                    variant="contained"
                    onClick={handleOpenSettings}
                    startIcon={<SettingsIcon sx={{ color: 'var(--bg)', opacity: 0.9 }} />}
                    sx={{
                        background: 'color-mix(in srgb, var(--accent), var(--bg) 30%)',
                        color: 'var(--bg)',
                        fontWeight: 700,
                        textTransform: 'none',
                        fontFamily: 'JetBrains Mono, monospace',
                        px: 3,
                        '&:hover': {
                            background: 'color-mix(in srgb, var(--accent), var(--bg) 20%)'
                        },
                        '& .MuiSvgIcon-root': {
                            color: 'var(--bg)',
                            opacity: 0.95
                        }
                    }}
                >
                    Open Settings
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default RitobinWarningModal;
export { detectHashedContent };
