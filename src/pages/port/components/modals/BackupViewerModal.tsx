import { useEffect, useState } from 'react';
import RestoreIcon from '@mui/icons-material/Restore';
import InfoIcon from '@mui/icons-material/Info';
import { backupList, backupRestore, type BackupInfo } from '@/lib/api/wad';

interface BackupViewerModalProps {
    open: boolean;
    filePath: string;
    component: string;
    onClose: (restored?: { backupPath: string; content: string }) => void;
}

const compColor = (c: string) => {
    if (c === 'paint') return 'var(--color-success)';
    if (c === 'port') return 'var(--accent-secondary)';
    return 'var(--accent-primary)';
};

function formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function BackupViewerModal({ open, filePath, component, onClose }: BackupViewerModalProps) {
    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [restoring, setRestoring] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !filePath) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        backupList(filePath)
            .then((list) => {
                if (!cancelled) setBackups(list);
            })
            .catch((e) => {
                if (!cancelled) setError(`Error loading backups: ${String(e)}`);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, filePath, component]);

    const handleRestore = async (backupPath: string) => {
        try {
            setRestoring(backupPath);
            const content = await backupRestore(backupPath, filePath);
            onClose({ backupPath, content });
        } catch (e) {
            setError(`Error restoring backup: ${String(e)}`);
        } finally {
            setRestoring(null);
        }
    };

    if (!open) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, black 65%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={() => onClose()} />
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative', width: '100%', maxWidth: 740, maxHeight: '80vh',
                    display: 'flex', flexDirection: 'column',
                    background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                    backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                    borderRadius: 16, boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                }}
            >
                <div style={{ height: 3, flexShrink: 0, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite' }} />
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <h2 style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '1.05rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-primary)' }}>Backup History</h2>
                        {component && (
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontFamily: 'var(--font-mono)', fontWeight: 700, background: `color-mix(in oklab, ${compColor(component)} 15%, transparent)`, border: `1px solid color-mix(in oklab, ${compColor(component)} 40%, transparent)`, color: compColor(component) }}>{component}</span>
                        )}
                    </div>
                    <button
                        onClick={() => onClose()}
                        style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', cursor: 'pointer', outline: 'none' }}
                    >
                        {'✕'}
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {error && (
                        <div style={{ margin: '12px 16px', padding: '10px 14px', background: 'color-mix(in oklab, var(--color-danger) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--color-danger) 28%, transparent)', borderRadius: 8, color: 'var(--color-danger)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{error}</div>
                    )}

                    {loading && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-secondary)' }}>Loading backups…</span>
                        </div>
                    )}

                    {!loading && !error && backups.length === 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 }}>
                            <InfoIcon sx={{ fontSize: 40, color: 'var(--text-muted)' }} />
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>No backups found</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
                                Backups are created automatically when you load or save .py files in {component || 'this component'}.
                            </div>
                        </div>
                    )}

                    {!loading && backups.map((backup, i) => {
                        const col = compColor(backup.component);
                        const isRestoring = restoring === backup.path;
                        return (
                            <div key={backup.path} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: i < backups.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 0 ? 'color-mix(in oklab, var(--bg-tertiary) 60%, transparent)' : 'transparent' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {backup.name.length > 42 ? backup.name.slice(0, 39) + '…' : backup.name}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(backup.modified).toLocaleString()}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>·</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatSize(backup.size)}</span>
                                        <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 700, background: `color-mix(in oklab, ${col} 15%, transparent)`, border: `1px solid color-mix(in oklab, ${col} 35%, transparent)`, color: col }}>{backup.component}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => !restoring && handleRestore(backup.path)}
                                    disabled={!!restoring}
                                    title={isRestoring ? 'Restoring…' : 'Restore this backup'}
                                    style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: restoring ? 'var(--bg-tertiary)' : 'color-mix(in oklab, var(--color-success) 12%, transparent)', border: restoring ? '1px solid var(--border)' : '1px solid color-mix(in oklab, var(--color-success) 28%, transparent)', color: restoring ? 'var(--text-muted)' : 'var(--color-success)', cursor: restoring ? 'not-allowed' : 'pointer', outline: 'none', flexShrink: 0 }}
                                >
                                    <RestoreIcon sx={{ fontSize: 20 }} />
                                </button>
                            </div>
                        );
                    })}
                </div>

                {backups.length > 0 && (
                    <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'color-mix(in oklab, var(--accent-secondary) 5%, transparent)', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Only the 10 most recent backups are kept. Older backups are automatically deleted.
                    </div>
                )}
            </div>
        </div>
    );
}
