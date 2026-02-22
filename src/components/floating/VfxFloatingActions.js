import React, { useState } from 'react';
import { CircularProgress, Tooltip } from '@mui/material';
import {
  Apps as AppsIcon,
  Add as AddIcon,
  Folder as FolderIcon,
  ArrowBack as ArrowBackIcon,
  ChevronRight as ChevronRightIcon,
  ChevronLeft as ChevronLeftIcon,
} from '@mui/icons-material';

const STORAGE_KEY = 'vfx_toolbar_expanded';

const makeBtn = (color, disabled) => ({
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: `1px solid ${disabled ? 'rgba(255,255,255,0.07)' : color + '55'}`,
  background: disabled ? 'rgba(255,255,255,0.03)' : color + '18',
  color: disabled ? 'rgba(255,255,255,0.2)' : color,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: disabled ? 'not-allowed' : 'pointer',
  outline: 'none',
  flexShrink: 0,
  transition: 'all 0.18s ease',
});

function VfxFloatingActions({
  targetPyContent,
  isProcessing,
  handleOpenBackupViewer,
  handleOpenPersistent,
  handleOpenNewSystemModal,
  hasResourceResolver,
  hasSkinCharacterData,
  showPortAllButton = false,
  showNewSystemButton = true,
  showPersistentButton = true,
  onPortAll,
  isPortAllLoading = false,
  disablePortAll = false,
  portAllTooltip = 'Port All VFX Systems',
}) {
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(STORAGE_KEY) !== 'false'
  );

  const toggle = () =>
    setExpanded(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });

  if (!targetPyContent || isProcessing) return null;

  const pDis = !hasResourceResolver || !hasSkinCharacterData;
  const nDis = !hasResourceResolver;
  const paDis = disablePortAll || isPortAllLoading;

  const buttons = [
    ...(showPortAllButton ? [{
      id: 'portAll', color: '#3b82f6',
      title: isPortAllLoading ? 'Porting…' : portAllTooltip,
      icon: isPortAllLoading ? <CircularProgress size={15} sx={{ color: '#3b82f6' }} /> : <ArrowBackIcon sx={{ fontSize: 16 }} />,
      onClick: onPortAll, disabled: paDis,
    }] : []),
    ...(showNewSystemButton ? [{
      id: 'newSystem', color: '#fbbf24',
      title: nDis ? 'New VFX System (needs ResourceResolver)' : 'New VFX System',
      icon: <AddIcon sx={{ fontSize: 18 }} />,
      onClick: handleOpenNewSystemModal, disabled: nDis
    }] : []),
    ...(showPersistentButton ? [{
      id: 'persistent', color: '#4ade80',
      title: pDis ? 'Persistent Effects (needs ResourceResolver + SkinData)' : 'Persistent Effects',
      icon: <AppsIcon sx={{ fontSize: 16 }} />,
      onClick: handleOpenPersistent, disabled: pDis
    }] : []),
    {
      id: 'backup', color: '#c084fc',
      title: 'Backup History',
      icon: <FolderIcon sx={{ fontSize: 16 }} />,
      onClick: handleOpenBackupViewer, disabled: false
    },
  ];

  const ttSx = { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' };

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      bottom: 90,
      zIndex: 4500,
      display: 'flex',
      flexDirection: 'row',   /* horizontal */
      alignItems: 'center',
    }}>

      {/* ── glass pill containing buttons ── slides in/out horizontally */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',   /* buttons in a ROW */
        alignItems: 'center',
        gap: 8,
        overflow: 'hidden',
        maxWidth: expanded ? (buttons.length * 44 + 32) : 0,
        opacity: expanded ? 1 : 0,
        padding: expanded ? '8px 12px 8px 14px' : '8px 0',
        background: 'var(--glass-bg)',
        border: expanded ? '1px solid var(--glass-border)' : '1px solid transparent',
        borderRight: 'none',
        backdropFilter: 'saturate(180%) blur(14px)',
        WebkitBackdropFilter: 'saturate(180%) blur(14px)',
        borderRadius: '12px 0 0 12px',
        boxShadow: expanded ? '0 8px 32px rgba(0,0,0,0.4)' : 'none',
        transition: [
          'max-width 0.35s cubic-bezier(0.4,0,0.2,1)',
          'opacity 0.25s ease',
          'padding 0.3s ease',
          'box-shadow 0.3s ease',
        ].join(', '),
        pointerEvents: expanded ? 'auto' : 'none',
      }}>
        {buttons.map(({ id, title, color, icon, onClick, disabled }) => (
          <Tooltip key={id} title={title} arrow placement="top"
            componentsProps={{ tooltip: { sx: ttSx } }}>
            <button
              onClick={disabled ? undefined : onClick}
              style={makeBtn(color, disabled)}
              onMouseEnter={(e) => {
                if (disabled) return;
                e.currentTarget.style.transform = 'scale(1.12)';
                e.currentTarget.style.background = color + '2a';
                e.currentTarget.style.borderColor = color + '99';
                e.currentTarget.style.boxShadow = `0 0 12px ${color}44`;
              }}
              onMouseLeave={(e) => {
                if (disabled) return;
                e.currentTarget.style.transform = '';
                e.currentTarget.style.background = color + '18';
                e.currentTarget.style.borderColor = color + '55';
                e.currentTarget.style.boxShadow = '';
              }}
            >
              {icon}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* ── toggle tab — always visible ── */}
      <Tooltip title={expanded ? 'Collapse' : 'Tools'} arrow placement="left"
        componentsProps={{ tooltip: { sx: ttSx } }}>
        <div
          onClick={toggle}
          style={{
            width: 16,
            height: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRight: 'none',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: '8px 0 0 8px',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.4)',
            transition: 'background 0.2s ease, color 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'color-mix(in srgb, var(--accent), transparent 78%)';
            e.currentTarget.style.color = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--glass-bg)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
          }}
        >
          {expanded
            ? <ChevronRightIcon sx={{ fontSize: 14 }} />
            : <ChevronLeftIcon sx={{ fontSize: 14 }} />}
        </div>
      </Tooltip>
    </div>
  );
}

export default React.memo(VfxFloatingActions);
