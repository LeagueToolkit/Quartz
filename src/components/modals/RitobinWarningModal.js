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

function RitobinWarningModal({
    open,
    onClose,
    navigate,
    isHashedContent: isHashedContentProp = false,
    content = null,
    onContinueAnyway = null,
    onReparseFromBin = null,
}) {
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
    const handleReparseFromBin = () => {
        if (onReparseFromBin) {
            onReparseFromBin();
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

    const hashedPaperSx = {
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--bg, #0b0d12), black 8%) 0%, color-mix(in srgb, var(--surface, #11131a), var(--accent2, #8b5cf6) 16%) 55%, color-mix(in srgb, var(--surface, #11131a), var(--accent, #7c3aed) 22%) 100%)',
        border: '1px solid color-mix(in srgb, var(--accent2, #8b5cf6), transparent 45%)',
        borderRadius: '18px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 24px color-mix(in srgb, var(--accent2, #8b5cf6), transparent 75%)',
        minWidth: 420,
        maxWidth: 560,
        overflow: 'hidden',
        position: 'relative',
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    ...hashedPaperSx
                }
            }}
        >
            <Box
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, var(--accent, #7c3aed), var(--accent2, #8b5cf6), var(--accent, #7c3aed))',
                    backgroundSize: '200% 100%',
                    animation: 'ritobinShimmer 3s linear infinite',
                    zIndex: 10,
                    '@keyframes ritobinShimmer': {
                        '0%': { backgroundPosition: '200% 0' },
                        '100%': { backgroundPosition: '-200% 0' },
                    },
                }}
            />
            <DialogTitle sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                borderBottom: '1px solid rgba(255,255,255,0.14)',
                background: 'color-mix(in srgb, var(--bg, #0b0d12), transparent 20%)',
                py: 2,
                px: 2.4,
            }}>
                <Box
                    sx={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--accent, #7c3aed), var(--accent2, #8b5cf6))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 16px rgba(139, 92, 246, 0.55)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '1.05rem',
                        animation: 'warningBounce 1.8s ease-in-out infinite',
                        '@keyframes warningBounce': {
                            '0%, 100%': { transform: 'translateY(0)' },
                            '50%': { transform: 'translateY(-4px)' },
                        },
                    }}>
                    !
                </Box>
                <Typography sx={{
                    color: 'var(--text)',
                    fontSize: '1.1rem',
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
                            Parsed output contains <Box component="span" sx={{ color: 'var(--accent)', fontWeight: 600 }}>hashed field names</Box> (example: <Box component="span" sx={{ color: 'var(--accent2)', fontFamily: 'monospace' }}>0xc7952e6b</Box>) instead of readable names.
                        </Typography>
                        
                        <Typography sx={{
                            color: 'var(--text)',
                            fontWeight: 600,
                            fontFamily: 'JetBrains Mono, monospace',
                            lineHeight: 1.6,
                            fontSize: '0.85rem',
                            mb: 2
                        }}>
                            Quick checks:
                        </Typography>

                        <Box sx={{ mb: 2, display: 'grid', gap: 1 }}>
                            <Typography sx={{ color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }}>
                                - <Box component="span" sx={{ color: 'var(--accent)' }}>ritobin path</Box> is incorrect
                            </Typography>
                            <Typography sx={{ color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }}>
                                - <Box component="span" sx={{ color: 'var(--accent)' }}>hashes folder</Box> is missing or not configured
                            </Typography>
                            <Typography sx={{ color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }}>
                                - Hash database could not be loaded by ritobin
                            </Typography>
                        </Box>

                        <Box sx={{
                            mt: 3,
                            p: 2,
                            background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
                            border: '1px solid color-mix(in srgb, var(--accent2), transparent 70%)',
                            borderRadius: '8px'
                        }}>
                            <Typography sx={{
                                color: 'var(--text)',
                                fontWeight: 500,
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.8rem',
                                lineHeight: 1.55
                            }}>
                                Verify the Ritobin path and ensure the hashes folder is in the same directory as ritobin_cli (Settings -> External Tools).
                            </Typography>
                        </Box>
                        <Box sx={{
                            mt: 1.5,
                            p: 2,
                            background: 'rgba(239, 68, 68, 0.06)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: '8px'
                        }}>
                            <Typography sx={{
                                color: 'var(--text)',
                                fontWeight: 500,
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.8rem',
                                lineHeight: 1.55
                            }}>
                                Important: fixing hashes does not auto-fix this already parsed file.
                                Re-open or reparse the original .bin to regenerate readable field names.
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
                            Please configure the path to <Box component="span" sx={{ color: 'var(--accent)' }}>ritobin_cli.exe</Box> in Settings -> External Tools.
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
                borderTop: '1px solid rgba(255,255,255,0.08)'
            }}>
                {(!isHashedContent || !onContinueAnyway) && (
                    <Button
                        onClick={onClose}
                        sx={{
                            color: '#ffffff',
                            textTransform: 'none',
                            fontFamily: 'JetBrains Mono, monospace',
                            border: '1px solid rgba(255,255,255,0.3)',
                            background: 'rgba(18, 20, 28, 0.55)',
                            borderRadius: '10px',
                            px: 2,
                            '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 90%)' }
                        }}
                    >
                        Cancel
                    </Button>
                )}
                {isHashedContent && typeof onReparseFromBin === 'function' && (
                    <Button
                        onClick={handleReparseFromBin}
                        sx={{
                            color: '#ffffff',
                            textTransform: 'none',
                            fontFamily: 'JetBrains Mono, monospace',
                            border: '1px solid rgba(255,255,255,0.3)',
                            background: 'rgba(18, 20, 28, 0.55)',
                            borderRadius: '10px',
                            px: 2,
                            transition: 'transform 160ms ease, box-shadow 220ms ease, background 220ms ease',
                            '&:hover': {
                                background: 'rgba(34, 38, 52, 0.62)',
                                transform: 'translateY(-2px) scale(1.035)',
                                boxShadow: '0 10px 22px rgba(0,0,0,0.35), 0 0 14px rgba(255,255,255,0.22)',
                            },
                            '&:active': {
                                transform: 'translateY(0) scale(1.01)',
                            }
                        }}
                    >
                        Reparse from .bin
                    </Button>
                )}
                {isHashedContent && onContinueAnyway && (
                    <Button
                        onClick={handleContinueAnyway}
                        sx={{
                            color: isHashedContent ? '#f5f3ff' : 'var(--text-2)',
                            textTransform: 'none',
                            fontFamily: 'JetBrains Mono, monospace',
                            border: isHashedContent
                                ? '1px solid rgba(168, 85, 247, 0.7)'
                                : '1px solid color-mix(in srgb, var(--accent), transparent 50%)',
                            borderRadius: isHashedContent ? '10px' : undefined,
                            background: isHashedContent ? 'rgba(17, 19, 26, 0.35)' : 'transparent',
                            transition: 'transform 160ms ease, box-shadow 220ms ease, background 220ms ease',
                            '&:hover': { 
                                background: 'color-mix(in srgb, var(--accent), transparent 88%)',
                                transform: 'translateY(-2px) scale(1.035)',
                                boxShadow: '0 12px 24px color-mix(in srgb, var(--accent2), transparent 72%), 0 0 14px color-mix(in srgb, var(--accent2), transparent 60%)'
                            },
                            '&:active': {
                                transform: 'translateY(0) scale(1.01)',
                            },
                        }}
                    >
                        Use Hashed Fields
                    </Button>
                )}
                <Button
                    variant="contained"
                    onClick={handleOpenSettings}
                    startIcon={<SettingsIcon sx={{ color: 'var(--bg)', opacity: 0.9 }} />}
                    sx={{
                        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.62), rgba(16, 185, 129, 0.5))',
                        color: '#ffffff',
                        border: '1px solid rgba(167, 243, 208, 0.82)',
                        fontWeight: 700,
                        textTransform: 'none',
                        fontFamily: 'JetBrains Mono, monospace',
                        px: 3,
                        transition: 'transform 160ms ease, box-shadow 220ms ease, filter 220ms ease, background 220ms ease',
                        '&:hover': {
                            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.82), rgba(16, 185, 129, 0.72))',
                            transform: 'translateY(-2px) scale(1.035)',
                            boxShadow: '0 14px 30px rgba(16, 185, 129, 0.42), 0 0 18px rgba(110, 231, 183, 0.35)',
                            filter: 'brightness(1.08)',
                        },
                        '&:active': {
                            transform: 'translateY(0) scale(1.01)',
                        },
                        '& .MuiSvgIcon-root': {
                            color: '#ffffff',
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

