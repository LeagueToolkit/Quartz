import React, { useState, useEffect, useMemo } from 'react';
import {
    Box,
    Typography,
    Checkbox,
    FormControlLabel,
} from '@mui/material';
import {
    Save as SaveIcon,
    Delete as DeleteIcon,
    FileOpen as FileOpenIcon,
    Bookmark as BookmarkIcon,
} from '@mui/icons-material';
import { saveSession, loadAllSessions, deleteSession, loadSessionDetail } from '../utils/sessionManager.js';

const modalStyles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        zIndex: 1350,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px',
    },
    backdrop: {
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
    },
    modal: {
        position: 'relative',
        width: '100%',
        maxWidth: 860,
        height: 720,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--glass-bg, rgba(15, 18, 26, 0.95))',
        border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.1))',
        backdropFilter: 'saturate(180%) blur(16px)',
        WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        borderRadius: 16,
        boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2, #8b5cf6), transparent 82%)',
        overflow: 'hidden',
    },
    accentBar: {
        height: 3,
        background: 'linear-gradient(90deg, var(--accent, #7c3aed), var(--accent2, #8b5cf6), var(--accent, #7c3aed))',
        backgroundSize: '200% 100%',
        animation: 'shimmer 3s linear infinite',
    },
    body: {
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        gap: 0,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    title: {
        fontSize: '0.95rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: 700,
        color: 'var(--text)',
        margin: 0,
        fontFamily: 'JetBrains Mono, monospace',
    },
    closeBtn: {
        width: 28,
        height: 28,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.04)',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        outline: 'none',
    },
    section: {
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)',
        padding: 14,
        marginBottom: 12,
    },
    sectionTitle: {
        color: 'var(--accent2, #8b5cf6)',
        fontSize: '0.76rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        margin: 0,
        marginBottom: 10,
        fontFamily: 'JetBrains Mono, monospace',
    },
    input: {
        width: '100%',
        boxSizing: 'border-box',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.03)',
        padding: '8px 12px',
        fontSize: '0.82rem',
        color: 'var(--text)',
        fontFamily: 'JetBrains Mono, monospace',
        outline: 'none',
        transition: 'all 0.2s ease',
    },
    footer: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid rgba(255,255,255,0.08)',
    },
    '@keyframes shimmer': {
        '0%': { backgroundPosition: '200% 0' },
        '100%': { backgroundPosition: '-200% 0' },
    },
};

const btnBase = {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'color-mix(in srgb, var(--accent2, #8b5cf6), transparent 90%)',
    color: 'var(--accent2, #8b5cf6)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    outline: 'none',
};

const btnGhost = {
    ...btnBase,
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(255,255,255,0.18)',
};

const btnDanger = {
    ...btnBase,
    padding: '6px 12px',
    minWidth: 36,
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(255,255,255,0.08)',
};

export default function BnkSessionManager({
    open,
    onClose,
    currentState,
    onLoadSession,
    autoSaveEnabled,
    setAutoSaveEnabled,
}) {
    const [sessions, setSessions] = useState([]);
    const [sessionName, setSessionName] = useState('');

    const defaultSessionName = useMemo(
        () => `Session_${new Date().toLocaleDateString().replace(/\//g, '-')}_${new Date().toLocaleTimeString().replace(/:/g, '-')}`,
        [open]
    );

    useEffect(() => {
        if (open) {
            setSessions(loadAllSessions());
            setSessionName(defaultSessionName);
        }
    }, [open, defaultSessionName]);

    const handleSaveManual = () => {
        const name = sessionName.trim() || defaultSessionName;
        try {
            saveSession(currentState, name);
            setSessions(loadAllSessions());
            setSessionName(defaultSessionName);
        } catch (e) {
            console.error('Failed to save session:', e);
        }
    };

    const handleDelete = (filename) => {
        try {
            deleteSession(filename);
            setSessions(loadAllSessions());
        } catch (e) {
            console.error('Failed to delete session:', e);
        }
    };

    const handleLoad = (filename) => {
        const detail = loadSessionDetail(filename);
        if (detail) {
            onLoadSession(detail);
            onClose();
        }
    };

    if (!open) return null;

    return (
        <div style={modalStyles.overlay}>
            <div style={modalStyles.backdrop} onClick={onClose} />
            <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
                <div style={modalStyles.accentBar} />
                <div style={modalStyles.body}>
                    <div style={modalStyles.header}>
                        <h2 style={modalStyles.title}>Session Manager</h2>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={autoSaveEnabled}
                                        onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                                        size="small"
                                        sx={{
                                            color: 'rgba(255,255,255,0.2)',
                                            padding: '4px',
                                            '&.Mui-checked': { color: 'var(--accent)' }
                                        }}
                                    />
                                }
                                label={
                                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>
                                        AUTO-SAVE ON EXIT
                                    </Typography>
                                }
                                sx={{ margin: 0 }}
                            />
                            <button onClick={onClose} style={modalStyles.closeBtn}>✕</button>
                        </Box>
                    </div>

                    <div style={modalStyles.section}>
                        <h3 style={modalStyles.sectionTitle}>Manual Backup</h3>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <input
                                type="text"
                                value={sessionName}
                                onChange={(e) => setSessionName(e.target.value)}
                                placeholder="Session name…"
                                style={modalStyles.input}
                            />
                            <button onClick={handleSaveManual} style={btnBase}>
                                <SaveIcon style={{ fontSize: 15 }} /> Save
                            </button>
                        </div>
                    </div>


                    <div style={{ ...modalStyles.section, flex: 1, minHeight: 0, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <h3 style={{ ...modalStyles.sectionTitle, padding: '14px 14px 0 14px', marginBottom: 5 }}>Saved Sessions</h3>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px 14px' }}>
                            {sessions.length === 0 && (
                                <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textAlign: 'center', py: 4 }}>
                                    No sessions found
                                </Typography>
                            )}
                            {sessions.map((s, idx) => (
                                <div key={idx} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '8px 0',
                                    borderBottom: idx < sessions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'
                                }}>
                                    <BookmarkIcon style={{ fontSize: 16, color: 'var(--accent)' }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <Typography sx={{ color: 'var(--text)', fontSize: '0.84rem', fontFamily: 'JetBrains Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {s.name}
                                        </Typography>
                                        <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
                                            {new Date(s.created).toLocaleString()}
                                        </Typography>
                                    </div>
                                    <button onClick={() => handleLoad(s.filename)} style={{ ...btnBase, background: 'rgba(var(--accent-rgb), 0.1)' }}>
                                        <FileOpenIcon style={{ fontSize: 14 }} /> Load
                                    </button>
                                    <button onClick={() => handleDelete(s.filename)} style={btnDanger}>
                                        <DeleteIcon style={{ fontSize: 14 }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={modalStyles.footer}>
                        <button onClick={onClose} style={btnGhost}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
