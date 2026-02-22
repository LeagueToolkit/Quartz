import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Typography,
    Button,
    IconButton,
    CircularProgress,
    Collapse,
} from '@mui/material';
import {
    SystemUpdateAlt as UpdateIcon,
    Close as CloseIcon,
    CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';

const DEV_SIMULATE_UPDATE_AVAILABLE = false;

const GlobalUpdateNotification = () => {
    const navigate = useNavigate();
    const [updateStatus, setUpdateStatus] = useState(DEV_SIMULATE_UPDATE_AVAILABLE ? 'available' : 'idle');
    const [currentVersion, setCurrentVersion] = useState(DEV_SIMULATE_UPDATE_AVAILABLE ? '2.1.0' : '');
    const [newVersion, setNewVersion] = useState(DEV_SIMULATE_UPDATE_AVAILABLE ? '2.6.4' : '');
    const [releaseNotes, setReleaseNotes] = useState('');
    const [updateError, setUpdateError] = useState('');
    const [showUpdateNotification, setShowUpdateNotification] = useState(true);
    const [showUpToDateMessage, setShowUpToDateMessage] = useState(false);
    const [dismissedVersion, setDismissedVersion] = useState(() => {
        try { return localStorage.getItem('update:dismissed-version') || ''; } catch { return ''; }
    });

    const fetchReleaseNotes = async (version) => {
        try {
            const v = version.startsWith('v') ? version : `v${version}`;
            const response = await fetch(`https://api.github.com/repos/RitoShark/Quartz/releases/tags/${v}`);
            if (response.ok) {
                const data = await response.json();
                setReleaseNotes(data.body || '');
            }
        } catch (error) {
            console.error('Error fetching release notes:', error);
        }
    };

    useEffect(() => {
        if (DEV_SIMULATE_UPDATE_AVAILABLE) {
            fetchReleaseNotes('2.6.4');
        }
    }, []);

    const handleDismissUpdate = () => {
        const toDismiss = newVersion || '';
        try { if (toDismiss) localStorage.setItem('update:dismissed-version', toDismiss); } catch { }
        setDismissedVersion(toDismiss);
        setShowUpdateNotification(false);
    };

    useEffect(() => {
        const setupUpdateListeners = async () => {
            if (!window.require) return;
            const { ipcRenderer } = window.require('electron');

            let isDev = false;
            try {
                const versionResult = await ipcRenderer.invoke('update:get-version');
                if (versionResult.success) {
                    setCurrentVersion(versionResult.version);
                    isDev = versionResult.isDev;
                }
            } catch (error) { console.error('Error getting version:', error); }

            if (isDev) return;

            ipcRenderer.on('update:checking', () => {
                if (!DEV_SIMULATE_UPDATE_AVAILABLE) { setUpdateStatus('checking'); setUpdateError(''); }
            });

            if (!DEV_SIMULATE_UPDATE_AVAILABLE) {
                try {
                    setUpdateStatus('checking');
                    ipcRenderer.invoke('update:check').catch(err => {
                        console.error('Error triggering update check:', err);
                        setUpdateStatus('idle');
                    });
                } catch (error) {
                    console.error('Error checking for updates:', error);
                    setUpdateStatus('idle');
                }
            }

            ipcRenderer.on('update:available', (event, data) => {
                if (!DEV_SIMULATE_UPDATE_AVAILABLE) {
                    const incomingVersion = data?.version || '';
                    setUpdateStatus('available');
                    setNewVersion(incomingVersion);
                    setUpdateError('');
                    if (!dismissedVersion || dismissedVersion !== incomingVersion) {
                        setShowUpdateNotification(true);
                    } else {
                        setShowUpdateNotification(false);
                    }
                    fetchReleaseNotes(incomingVersion);
                }
            });

            ipcRenderer.on('update:not-available', (event, data) => {
                if (!DEV_SIMULATE_UPDATE_AVAILABLE) {
                    setUpdateStatus('not-available');
                    setNewVersion(data.version);
                    setUpdateError('');
                    setShowUpdateNotification(false);
                    setShowUpToDateMessage(true);
                    setTimeout(() => { setShowUpToDateMessage(false); setUpdateStatus('idle'); }, 3000);
                }
            });

            ipcRenderer.on('update:error', (event, data) => {
                if (!DEV_SIMULATE_UPDATE_AVAILABLE) { setUpdateStatus('idle'); setUpdateError(data.message || 'Unknown error'); }
            });

            ipcRenderer.on('update:download-progress', () => {
                if (!DEV_SIMULATE_UPDATE_AVAILABLE) setShowUpdateNotification(false);
            });

            ipcRenderer.on('update:downloaded', () => {
                if (!DEV_SIMULATE_UPDATE_AVAILABLE) setShowUpdateNotification(false);
            });

            return () => {
                ipcRenderer.removeAllListeners('update:checking');
                ipcRenderer.removeAllListeners('update:available');
                ipcRenderer.removeAllListeners('update:not-available');
                ipcRenderer.removeAllListeners('update:error');
                ipcRenderer.removeAllListeners('update:download-progress');
                ipcRenderer.removeAllListeners('update:downloaded');
            };
        };
        setupUpdateListeners();
    }, [dismissedVersion]);

    return (
        <Box sx={{
            position: 'fixed',
            bottom: 24, right: 24,
            zIndex: 10000,
            display: 'flex', flexDirection: 'column', gap: 1.5,
            alignItems: 'flex-end',
            pointerEvents: 'none'
        }}>
            {/* Update: checking */}
            <Collapse in={updateStatus === 'checking'}>
                <Box sx={{
                    pointerEvents: 'auto',
                    background: 'rgba(255,255,255,0.026)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.055)',
                    borderRadius: '12px',
                    p: 1.5, px: 2,
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}>
                    <CircularProgress size={18} sx={{ color: 'var(--accent)' }} />
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                        Checking for updates...
                    </Typography>
                </Box>
            </Collapse>

            {/* Update: up to date */}
            <Collapse in={showUpToDateMessage}>
                <Box sx={{
                    pointerEvents: 'auto',
                    background: 'rgba(255,255,255,0.026)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(34,197,94,0.2)',
                    borderRadius: '12px',
                    p: 1.5, px: 2,
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}>
                    <CheckCircleIcon sx={{ color: '#4ade80', fontSize: 18 }} />
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                        Version is up to date
                    </Typography>
                </Box>
            </Collapse>

            {/* Update: available */}
            <Collapse in={showUpdateNotification && updateStatus === 'available'}>
                <Box sx={{
                    pointerEvents: 'auto',
                    background: 'rgba(255,255,255,0.026)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                    borderRadius: '14px',
                    p: 2,
                    width: { xs: 'calc(100vw - 48px)', sm: 340, md: 380 },
                    boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
                    position: 'relative',
                    overflow: 'hidden',
                    '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 40%, transparent), transparent)' }
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1.5 }}>
                        <Box sx={{
                            width: 36, height: 36, borderRadius: '8px',
                            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)'
                        }}>
                            <UpdateIcon />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Typography sx={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem', lineHeight: 1.1, mb: 0.5 }}>
                                Update Available
                            </Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', fontWeight: 500, lineHeight: 1.3 }}>
                                Quartz {newVersion} is now available. Go to settings to download and install.
                            </Typography>
                        </Box>
                        <IconButton size="small" onClick={handleDismissUpdate} sx={{ mt: -0.5, color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#fff' } }}>
                            <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Box>

                    {releaseNotes && (
                        <Box sx={{
                            mb: 2, p: 1.25,
                            maxHeight: 120, overflow: 'auto',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            '&::-webkit-scrollbar': { width: 4 },
                            '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.2)', borderRadius: 2 }
                        }}>
                            <Typography sx={{
                                fontSize: '0.68rem',
                                color: 'rgba(255,255,255,0.85)',
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'JetBrains Mono, monospace',
                                lineHeight: 1.5
                            }}>
                                {releaseNotes.length > 500 ? releaseNotes.substring(0, 500) + '...' : releaseNotes}
                            </Typography>
                        </Box>
                    )}

                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            fullWidth size="small" variant="contained"
                            onClick={() => {
                                try {
                                    localStorage.setItem('settings:highlight-update', 'true');
                                    localStorage.setItem('settings:open-section', 'tools');
                                    if (newVersion) localStorage.setItem('update:dismissed-version', newVersion);
                                } catch { }
                                setDismissedVersion(newVersion || '');
                                setShowUpdateNotification(false);
                                navigate('/settings');
                            }}
                            sx={{
                                background: 'var(--accent)', color: '#000', borderRadius: '7px', fontWeight: 700, fontSize: '0.75rem', textTransform: 'none', py: 0.8,
                                '&:hover': { background: 'var(--accent)', opacity: 0.9 }
                            }}
                        >
                            Go to Settings
                        </Button>
                    </Box>
                </Box>
            </Collapse>
        </Box>
    );
};

export default GlobalUpdateNotification;
