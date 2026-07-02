import { useState, useEffect, useMemo, type CSSProperties } from 'react';
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
    title: { fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text)', margin: 0, fontFamily: 'var(--font-mono)' },
    closeBtn: { width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-secondary)', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', cursor: 'pointer', transition: 'all 0.25s ease', outline: 'none' },
    section: { borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: 14, marginBottom: 12 },
    sectionTitle: { color: 'var(--accent-secondary)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0, marginBottom: 10, fontFamily: 'var(--font-mono)' },
    footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' },
};

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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, cursor: 'pointer' }}>
                                <span className="dl-toggle">
                                    <input type="checkbox" checked={autoSaveEnabled} onChange={(e) => setAutoSaveEnabled(e.target.checked)} />
                                    <span className="dl-toggle__track" />
                                    <span className="dl-toggle__thumb" />
                                </span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>AUTO-SAVE ON EXIT</span>
                            </label>
                            <button onClick={onClose} style={modalStyles.closeBtn}>✕</button>
                        </div>
                    </div>

                    <div style={modalStyles.section}>
                        <h3 style={modalStyles.sectionTitle}>Manual Backup</h3>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <input
                                className="dl-input"
                                type="text"
                                value={sessionName}
                                onChange={(e) => setSessionName(e.target.value)}
                                placeholder="Session name…"
                            />
                            <button className="dl-btn dl-btn--primary" onClick={handleSaveManual}>
                                <span className="dl-icon"><SaveIcon style={{ fontSize: 15 }} /></span>
                                <span>Save</span>
                            </button>
                        </div>
                    </div>

                    <div style={{ ...modalStyles.section, flex: 1, minHeight: 0, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <h3 style={{ ...modalStyles.sectionTitle, padding: '14px 14px 0 14px', marginBottom: 5 }}>Saved Sessions</h3>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px 14px' }}>
                            {sessions.length === 0 && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '32px 0' }}>
                                    No sessions found
                                </div>
                            )}
                            {sessions.map((s, idx) => (
                                <div key={s.filename} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: idx < sessions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                    <BookmarkIcon style={{ fontSize: 16, color: 'var(--accent-primary)' }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ color: 'var(--text)', fontSize: '0.84rem', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {s.name}
                                        </div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                            {new Date(s.created).toLocaleString()}
                                        </div>
                                    </div>
                                    <button className="dl-btn dl-btn--secondary" onClick={() => handleLoad(s.filename)}>
                                        <span className="dl-icon"><FileOpenIcon style={{ fontSize: 14 }} /></span>
                                        <span>Load</span>
                                    </button>
                                    <button className="dl-btn dl-btn--icon dl-btn--sm dl-btn--danger" onClick={() => handleDelete(s.filename)} title="Delete">
                                        <span className="dl-icon"><DeleteIcon style={{ fontSize: 14 }} /></span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={modalStyles.footer}>
                        <button className="dl-btn dl-btn--secondary" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
