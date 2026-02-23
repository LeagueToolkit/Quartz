import React, { useState } from 'react';
import { IconButton, Tooltip, Box } from '@mui/material';

const SettingsModal = ({
  open,
  onClose,
  onCloseAndHideGuide,
  leaguePathRef,
  extractionPathRef,
  showLeaguePathTooltip,
  setShowLeaguePathTooltip,
  showExtractionPathTooltip,
  setShowExtractionPathTooltip,
  leaguePath,
  extractionPath,
  hashPath,
  onAutoDetectLeaguePath,
  onBrowseLeaguePath,
  onBrowseExtractionPath,
  onLeaguePathChange,
  onExtractionPathChange,
  warmHashCache,
  onWarmHashCacheChange,
  showCelestiaGuide,
  onOpenGuide,
}) => {
  const [autoDetectStatus, setAutoDetectStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [autoDetectMessage, setAutoDetectMessage] = useState('');

  if (!open) return null;

  const handleAutoDetect = async () => {
    setAutoDetectStatus('loading');
    setAutoDetectMessage('Scanning...');
    const result = await onAutoDetectLeaguePath();
    if (result?.success) {
      setAutoDetectStatus('success');
      setAutoDetectMessage('Found!');
    } else {
      setAutoDetectStatus('error');
      setAutoDetectMessage(result?.error || 'Not found');
    }
    setTimeout(() => {
      setAutoDetectStatus(null);
      setAutoDetectMessage('');
    }, 3000);
  };

  const styles = {
    overlay: {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
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
      maxWidth: 680,
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      backdropFilter: 'saturate(180%) blur(40px)',
      WebkitBackdropFilter: 'saturate(180%) blur(16px)',
      borderRadius: 16,
      boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)',
      overflow: 'hidden',
    },
    accentBar: {
      height: 3,
      background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
      backgroundSize: '200% 100%',
      animation: 'shimmer 3s linear infinite',
    },
    body: {
      padding: 20,
    },
    header: {
      marginBottom: 20,
    },
    title: {
      fontSize: '0.95rem',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      fontWeight: 700,
      color: 'var(--text)',
      fontFamily: 'inherit',
      margin: 0,
    },
    section: {
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.02)',
      padding: 14,
      marginBottom: 12,
    },
    sectionLabel: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    sectionTitle: {
      color: 'var(--accent2)',
      fontFamily: 'inherit',
      fontSize: '0.76rem',
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      margin: 0,
    },
    infoBtn: {
      cursor: 'help',
      fontSize: 11,
      color: 'var(--accent2)',
      background: 'color-mix(in srgb, var(--accent2), transparent 88%)',
      border: '1px solid color-mix(in srgb, var(--accent2), transparent 72%)',
      borderRadius: 999,
      width: 18,
      height: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      transition: 'all 0.15s ease',
    },
    tooltip: {
      position: 'absolute',
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginBottom: 8,
      padding: '8px 12px',
      fontSize: 12,
      zIndex: 10,
      maxWidth: 260,
      borderRadius: 8,
      border: '1px solid var(--glass-border)',
      background: 'var(--surface)',
      color: 'var(--text)',
      boxShadow: 'var(--glass-shadow)',
      whiteSpace: 'normal',
    },
    buttonRow: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    },
    pathInput: {
      width: '100%',
      boxSizing: 'border-box',
      borderRadius: 6,
      border: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(255,255,255,0.03)',
      padding: '8px 12px',
      fontSize: '0.74rem',
      color: 'var(--text)',
      opacity: 1,
      fontFamily: 'inherit',
      outline: 'none',
      transition: 'all 0.2s ease',
      marginTop: 8,
    },
    hint: {
      fontSize: 11,
      color: 'var(--text)',
      opacity: 0.8,
      marginTop: 6,
    },
    checkboxRow: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 10,
    },
    checkbox: {
      marginTop: 2,
      accentColor: 'var(--accent2)',
      width: 14,
      height: 14,
      cursor: 'pointer',
    },
    checkboxLabel: {
      fontSize: '0.78rem',
      color: 'var(--text)',
      lineHeight: 1.4,
      fontFamily: 'inherit',
      cursor: 'pointer',
    },
  };

  const btnBase = {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
    color: 'var(--accent2)',
    fontFamily: 'inherit',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    textTransform: 'none',
  };

  const hoverBtn = (e) => {
    e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 72%)';
    e.currentTarget.style.boxShadow = '0 0 14px color-mix(in srgb, var(--accent2), transparent 65%)';
    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent2), transparent 50%)';
  };
  const leaveBtn = (e) => {
    e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 90%)';
    e.currentTarget.style.boxShadow = 'none';
    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
  };

  const focusInput = (e) => {
    e.currentTarget.style.borderColor = 'var(--accent)';
    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
    e.currentTarget.style.boxShadow = '0 0 12px color-mix(in srgb, var(--accent), transparent 75%)';
    e.currentTarget.style.opacity = '1';
  };
  const blurInput = (e) => {
    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
    e.currentTarget.style.boxShadow = 'none';
    e.currentTarget.style.opacity = '0.8';
  };

  const statusColor = autoDetectStatus === 'success'
    ? 'var(--accent-green)'
    : autoDetectStatus === 'error'
      ? '#ef4444'
      : 'var(--accent2)';

  return (
    <div style={styles.overlay}>
      <div style={styles.backdrop} onClick={onClose} />
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.accentBar} />

        <div style={styles.body}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={styles.title}>Settings</h2>
            <button
              onClick={onCloseAndHideGuide}
              style={{
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
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)';
                e.currentTarget.style.boxShadow = '0 0 12px color-mix(in srgb, var(--accent2), transparent 70%)';
                e.currentTarget.style.color = 'var(--accent2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
              }}
            >
              ✕
            </button>
          </div>

          {/* League Champions Path */}
          <div style={styles.section} ref={leaguePathRef} data-league-path>
            <div style={styles.sectionLabel}>
              <h3 style={styles.sectionTitle}>League Champions Path</h3>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowLeaguePathTooltip(!showLeaguePathTooltip)}
                  style={styles.infoBtn}
                >
                  i
                </button>
                {showLeaguePathTooltip && (
                  <div style={styles.tooltip}>
                    Select the Champions folder inside your League of Legends directory
                  </div>
                )}
              </div>
            </div>
            <div style={styles.buttonRow}>
              <button
                style={{
                  ...btnBase,
                  ...(autoDetectStatus === 'loading' ? { opacity: 0.8, pointerEvents: 'none' } : {}),
                }}
                onClick={handleAutoDetect}
                onMouseEnter={autoDetectStatus ? undefined : hoverBtn}
                onMouseLeave={autoDetectStatus ? undefined : leaveBtn}
                title="Automatically detect League of Legends Champions folder"
              >
                {autoDetectStatus === 'loading' ? 'Scanning...' : 'Auto Detect'}
              </button>
              <button
                style={btnBase}
                onClick={onBrowseLeaguePath}
                onMouseEnter={hoverBtn}
                onMouseLeave={leaveBtn}
                title="Browse for Champions folder"
              >
                Browse
              </button>
              {autoDetectMessage && autoDetectStatus !== 'loading' && (
                <span style={{
                  fontSize: 12,
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  color: statusColor,
                  transition: 'opacity 0.3s ease',
                }}>
                  {autoDetectMessage}
                </span>
              )}
            </div>
            <input
              type="text"
              style={styles.pathInput}
              value={leaguePath}
              onChange={(e) => onLeaguePathChange(e.target.value)}
              onFocus={focusInput}
              onBlur={blurInput}
              placeholder="No path selected"
              spellCheck={false}
            />
          </div>

          {/* WAD Output Path */}
          <div style={styles.section} ref={extractionPathRef} data-extraction-path>
            <div style={styles.sectionLabel}>
              <h3 style={styles.sectionTitle}>WAD Output Path</h3>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowExtractionPathTooltip(!showExtractionPathTooltip)}
                  style={styles.infoBtn}
                >
                  i
                </button>
                {showExtractionPathTooltip && (
                  <div style={styles.tooltip}>
                    Select where extracted WAD files should be saved
                  </div>
                )}
              </div>
            </div>
            <div style={styles.buttonRow}>
              <button
                style={btnBase}
                onClick={onBrowseExtractionPath}
                onMouseEnter={hoverBtn}
                onMouseLeave={leaveBtn}
                title="Browse for output folder"
              >
                Browse
              </button>
            </div>
            <input
              type="text"
              style={styles.pathInput}
              value={extractionPath}
              onChange={(e) => onExtractionPathChange(e.target.value)}
              onFocus={focusInput}
              onBlur={blurInput}
              placeholder="No path selected"
              spellCheck={false}
            />
          </div>

          {/* Hash Tables Path */}
          <div style={styles.section} data-hash-path>
            <h3 style={styles.sectionTitle}>Hash Tables Path (Automatic)</h3>
            <input
              type="text"
              style={styles.pathInput}
              value={hashPath || ''}
              readOnly
              placeholder="Loading..."
              spellCheck={false}
            />
            <p style={styles.hint}>
              Hash files are automatically downloaded from CommunityDragon.
            </p>
            <div style={styles.checkboxRow}>
              <input
                id="frogchanger-warm-hash-cache"
                type="checkbox"
                style={styles.checkbox}
                checked={warmHashCache === true}
                onChange={(e) => onWarmHashCacheChange?.(e.target.checked)}
              />
              <label htmlFor="frogchanger-warm-hash-cache" style={styles.checkboxLabel}>
                Warm hash cache on page enter and clear it on leave. Useful on stronger PCs.
              </label>
            </div>
          </div>

        </div>
      </div>

      {!showCelestiaGuide && (
        <Tooltip title="Celestia guide" placement="left" arrow>
          <IconButton
            onClick={onOpenGuide}
            aria-label="Open Celestia guide"
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              width: 40,
              height: 40,
              borderRadius: '50%',
              zIndex: 4500,
              background: 'linear-gradient(135deg, var(--accent2), color-mix(in srgb, var(--accent2), transparent 35%))',
              color: 'var(--text)',
              border: '1px solid rgba(255,255,255,0.6)',
              boxShadow: '0 8px 22px rgba(0,0,0,0.35), 0 0 8px color-mix(in srgb, var(--accent2), transparent 45%)',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 10px 26px rgba(0,0,0,0.45), 0 0 12px color-mix(in srgb, var(--accent2), transparent 30%)',
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent2), transparent 10%), var(--accent2))',
              },
              transition: 'all 0.2s ease',
            }}
          >
            <Box component="span" sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>!</Box>
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
};

export default SettingsModal;

