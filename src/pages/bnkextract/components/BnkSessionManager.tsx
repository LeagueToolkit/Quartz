import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { Box, Typography, Checkbox, FormControlLabel } from '@mui/material';
import {
    Save as SaveIcon, Delete as DeleteIcon, FileOpen as FileOpenIcon, Bookmark as BookmarkIcon,
} from '@mui/icons-material';
import { saveSession, loadAllSessions, deleteSession, loadSessionDetail, type SessionDetail } from '../utils/sessionManager';
import type { SessionMeta, SessionState } from '../types';

const modalStyles: Record<string, CSSProperties> = {
    overlay: { position: 'fixed', inset: 0, zIndex: 1350, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' },
    backdrop: { position: 'absolute', inset: 0, background: 'color-mix(in oklab, var(--bg-primary) 75%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' },
    modal: {
        position: 'relative', width: '100%', maxWidth: 860, height: 720, display: 'flex', flexDirection: 'column',
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        borderRadius: 16, boxShadow: '0 30px 70px color-mix(in oklab, var(--bg-primary) 55%, transparent)', overflow: 'hidden',
    },
    accentBar: { height: 3, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite' },
    body: { padding: 20, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 0 },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    title: { fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text)', margin: 0, fontFamily: 'JetBrains Mono, monospace' },
    closeBtn: { width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-secondary)', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', cursor: 'pointer', transition: 'all 0.25s ease', outline: 'none' },
    section: { borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: 14, marginBottom: 12 },
    sectionTitle: { color: 'var(--accent-secondary)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0, marginBottom: 10, fontFamily: 'JetBrains Mono, monospace' },
    input: { width: '100%', boxSizing: 'border-box', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: '8px 12px', fontSize: '0.82rem', color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', outline: 'none', transition: 'all 0.2s ease' },
    footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' },
};

const btnBase: CSSProperties = {
    padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'color-mix(in oklab, var(--accent-secondary) 10%, transparent)',
    color: 'var(--accent-secondary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.25s ease', display: 'inline-flex', alignItems: 'center', gap: 5, outline: 'none',
};
const btnGhost: CSSProperties = { ...btnBase, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' };
const btnDanger: CSSProperties = { ...btnBase, padding: '6px 12px', minWidth: 36, justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' };

interface Props {
    open: boolean;
    onClose: () => void;
    currentState: SessionState;
    onLoadSession: (session: SessionDetail) => void;
    autoSaveEnabled: boolean;
    setAutoSaveEnabled: (v: boolean) => void;
}

export default function BnkSessionManager({
    open, onClose, currentState, onLoadSession, autoSaveEnabled, setAutoSaveEnabled,
}: Props) {
    const [sessions, setSessions] = useState<SessionMeta[]>([]);
    const [sessionName, setSessionName] = useState('');

    const defaultSessionName = useMemo(
        () => `Session_${new Date().toLocaleDateString().replace(/\//g, '-')}_${new Date().toLocaleTimeString().replace(/:/g, '-')}`,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [open]
    );

    useEffect(() => {
        if (open) {
            loadAllSessions().then(setSessions);
            setSessionName(defaultSessionName);
        }
    }, [open, defaultSessionName]);

    const handleSaveManual = async () => {
        const name = sessionName.trim() || defaultSessionName;
        await saveSession(currentState, name);
        setSessions(await loadAllSessions());
        setSessionName(defaultSessionName);
    };

    const handleDelete = async (filename: string) => {
        await deleteSession(filename);
        setSessions(await loadAllSessions());
    };

    const handleLoad = async (filename: string) => {
        const detail = await loadSessionDetail(filename);
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
                                        sx={{ color: 'var(--text-muted)', padding: '4px', '&.Mui-checked': { color: 'var(--accent-primary)' } }}
                                    />
                                }
                                label={<Typography sx={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>AUTO-SAVE ON EXIT</Typography>}
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
                                <Typography sx={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', py: 4 }}>
                                    No sessions found
                                </Typography>
                            )}
                            {sessions.map((s, idx) => (
                                <div key={s.filename} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: idx < sessions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                    <BookmarkIcon style={{ fontSize: 16, color: 'var(--accent-primary)' }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <Typography sx={{ color: 'var(--text)', fontSize: '0.84rem', fontFamily: 'JetBrains Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {s.name}
                                        </Typography>
                                        <Typography sx={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                            {new Date(s.created).toLocaleString()}
                                        </Typography>
                                    </div>
                                    <button onClick={() => handleLoad(s.filename)} style={{ ...btnBase, background: 'color-mix(in oklab, var(--accent-primary) 10%, transparent)' }}>
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
