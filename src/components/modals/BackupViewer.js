import React, { useState, useEffect } from 'react';
import { Restore as RestoreIcon, Info as InfoIcon } from '@mui/icons-material';
import { listBackups, restoreBackup } from '../../utils/io/backupManager.js';

/* ── shared button tokens ── */
const ghostBtn = {
  padding: '6px 14px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 6,
  color: 'rgba(255,255,255,0.85)',
  cursor: 'pointer',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '0.75rem',
  fontWeight: 600,
  transition: 'all 0.22s ease',
  outline: 'none',
  display: 'inline-flex',
  alignItems: 'center',
};

const accentBtn = (color) => ({
  padding: '6px 14px',
  background: `color-mix(in srgb, ${color}, transparent 90%)`,
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  color,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '0.75rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.22s ease',
  outline: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
});

const compColor = (c) => {
  if (c === 'paint') return '#4ade80';
  if (c === 'port') return '#c084fc';
  return '#60a5fa';
};

const BackupViewer = ({ open, onClose, filePath, component }) => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [restoring, setRestoring] = useState(null); // holds path being restored

  useEffect(() => {
    if (open && filePath) loadBackups();
  }, [open, filePath, component]);

  const loadBackups = () => {
    try {
      setLoading(true); setError(null);
      setBackups(listBackups(filePath, component));
    } catch (err) {
      setError(`Error loading backups: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (backupPath) => {
    try {
      setRestoring(backupPath);
      const ok = restoreBackup(backupPath, filePath);
      if (ok) { onClose(true); }
      else { setError('Failed to restore backup'); }
    } catch (err) {
      setError(`Error restoring backup: ${err.message}`);
    } finally {
      setRestoring(null);
    }
  };

  const fmt = (d) => new Date(d).toLocaleString();
  const shortName = filePath
    ? (filePath.split('\\').pop() || filePath.split('/').pop())
    : null;

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      {/* backdrop */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        onClick={() => onClose(false)}
      />

      {/* modal */}
      <div
        style={{
          position: 'relative',
          width: '100%', maxWidth: 740,
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px rgba(192,132,252,0.12)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* shimmer accent bar */}
        <div style={{
          height: 3, flexShrink: 0,
          background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s linear infinite',
        }} />

        {/* header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{
              margin: 0,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '1.05rem', letterSpacing: '0.08em',
              textTransform: 'uppercase', fontWeight: 700,
              color: 'var(--text)',
            }}>Backup History</h2>
            {component && (
              <span style={{
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: '0.7rem',
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 700,
                background: `color-mix(in srgb, ${compColor(component)}, transparent 85%)`,
                border: `1px solid color-mix(in srgb, ${compColor(component)}, transparent 60%)`,
                color: compColor(component),
              }}>{component}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => onClose(false)}
              style={{
                width: 28, height: 28, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, color: 'rgba(255,255,255,0.5)',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
                cursor: 'pointer', transition: 'all 0.22s ease', outline: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)';
                e.currentTarget.style.color = 'var(--accent2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
              }}
            >{'\u2715'}</button>
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>

          {/* error banner */}
          {error && (
            <div style={{
              margin: '12px 16px', padding: '10px 14px',
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.28)',
              borderRadius: 8, color: '#fca5a5',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.78rem',
            }}>{error}</div>
          )}

          {/* loading */}
          {loading && (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: 48, gap: 14,
            }}>
              <div style={{
                width: 200, height: 3, borderRadius: 2,
                background: 'rgba(192,132,252,0.15)',
                overflow: 'hidden', position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', left: '-60%', width: '60%', height: '100%',
                  background: 'linear-gradient(90deg, transparent, #c084fc, transparent)',
                  animation: 'shimmer 1.2s linear infinite',
                }} />
              </div>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.8rem', color: '#c084fc',
              }}>Loading backups…</span>
            </div>
          )}

          {/* empty */}
          {!loading && !error && backups.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: 48, gap: 12,
            }}>
              <InfoIcon sx={{ fontSize: 40, color: 'rgba(255,255,255,0.25)' }} />
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.88rem', color: 'rgba(255,255,255,0.5)',
                fontWeight: 600,
              }}>No backups found</div>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.74rem', color: 'rgba(255,255,255,0.32)',
                textAlign: 'center', maxWidth: 320, lineHeight: 1.6,
              }}>
                Backups are created automatically when you load .py files
                in {component || 'this component'}.
              </div>
            </div>
          )}

          {/* backup list */}
          {!loading && backups.length > 0 && (
            <>
              {backups.map((backup, i) => {
                const col = compColor(backup.component);
                const isRestoring = restoring === backup.path;
                return (
                  <div
                    key={backup.path}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '16px 20px',
                      borderBottom: i < backups.length - 1
                        ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      background: i % 2 === 0
                        ? 'rgba(255,255,255,0.01)' : 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'}
                  >
                    {/* info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.9rem', fontWeight: 600,
                        color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {backup.name.length > 42 ? backup.name.slice(0, 39) + '…' : backup.name}
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap',
                      }}>
                        <span style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '0.7rem', color: 'rgba(255,255,255,0.38)',
                        }}>{fmt(backup.modified)}</span>
                        <span style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '0.76rem', color: 'rgba(255,255,255,0.28)',
                        }}>·</span>
                        <span style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '0.7rem', color: 'rgba(255,255,255,0.38)',
                        }}>{backup.sizeFormatted}</span>
                        <span style={{
                          padding: '1px 6px',
                          borderRadius: 3,
                          fontSize: '0.65rem',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 700,
                          background: `color-mix(in srgb, ${col}, transparent 85%)`,
                          border: `1px solid color-mix(in srgb, ${col}, transparent 65%)`,
                          color: col,
                        }}>{backup.component}</span>
                      </div>
                    </div>

                    {/* restore button */}
                    <button
                      onClick={() => !isRestoring && handleRestore(backup.path)}
                      disabled={!!restoring}
                      style={{
                        width: 40, height: 40, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: restoring ? 'rgba(255,255,255,0.04)' : 'rgba(74,222,128,0.12)',
                        border: restoring ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(74,222,128,0.28)',
                        color: restoring ? 'rgba(255,255,255,0.2)' : '#4ade80',
                        cursor: restoring ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                        outline: 'none', flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        if (restoring) return;
                        e.currentTarget.style.background = 'rgba(74,222,128,0.22)';
                        e.currentTarget.style.boxShadow = '0 0 12px rgba(74,222,128,0.3)';
                        e.currentTarget.style.transform = 'scale(1.08)';
                      }}
                      onMouseLeave={(e) => {
                        if (restoring) return;
                        e.currentTarget.style.background = 'rgba(74,222,128,0.12)';
                        e.currentTarget.style.boxShadow = '';
                        e.currentTarget.style.transform = '';
                      }}
                      title={isRestoring ? 'Restoring…' : 'Restore this backup'}
                    >
                      <RestoreIcon sx={{ fontSize: 20 }} />
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* sticky bottom note — always visible */}
        {backups.length > 0 && (
          <div style={{
            padding: '10px 20px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(192,132,252,0.05)',
            flexShrink: 0,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.72rem',
            color: 'rgba(255,255,255,0.35)',
            lineHeight: 1.5,
          }}>
            Only the 10 most recent backups are kept. Older backups are automatically deleted.
          </div>
        )}

      </div>
    </div>
  );
};

export default BackupViewer;
