import React, { useState } from 'react';
import { CircularProgress, Tooltip } from '@mui/material';
import {
    Apps as AppsIcon,
    BubbleChart as BubbleChartIcon,
    Add as AddIcon,
    Folder as FolderIcon,
    ArrowBack as ArrowBackIcon,
    ChevronRight as ChevronRightIcon,
    ChevronLeft as ChevronLeftIcon,
} from '@mui/icons-material';

const STORAGE_KEY = 'vfx_toolbar_expanded';

const makeBtn = (color: string, disabled: boolean): React.CSSProperties => ({
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: `1px solid ${disabled ? 'var(--border)' : `color-mix(in oklab, ${color} 35%, transparent)`}`,
    background: disabled ? 'var(--bg-tertiary)' : `color-mix(in oklab, ${color} 12%, transparent)`,
    color: disabled ? 'var(--text-muted)' : color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    outline: 'none',
    flexShrink: 0,
    transition: 'all 0.18s ease',
});

interface VfxFloatingActionsProps {
    targetPyContent: string;
    isProcessing: boolean;
    handleOpenBackupViewer: () => void;
    handleOpenPersistent: () => void;
    handleOpenIdleParticles: () => void;
    handleOpenNewSystemModal: () => void;
    hasResourceResolver: boolean;
    hasSkinCharacterData: boolean;
    showPortAllButton?: boolean;
    showNewSystemButton?: boolean;
    showPersistentButton?: boolean;
    showIdleParticlesButton?: boolean;
    onPortAll?: () => void;
    isPortAllLoading?: boolean;
    disablePortAll?: boolean;
    portAllTooltip?: string;
}

function VfxFloatingActions({
    targetPyContent,
    isProcessing,
    handleOpenBackupViewer,
    handleOpenPersistent,
    handleOpenIdleParticles,
    handleOpenNewSystemModal,
    hasResourceResolver,
    hasSkinCharacterData,
    showPortAllButton = false,
    showNewSystemButton = true,
    showPersistentButton = true,
    showIdleParticlesButton = false,
    onPortAll,
    isPortAllLoading = false,
    disablePortAll = false,
    portAllTooltip = 'Port All VFX Systems',
}: VfxFloatingActionsProps) {
    const [expanded, setExpanded] = useState(() => localStorage.getItem(STORAGE_KEY) !== 'false');

    const toggle = () =>
        setExpanded((prev) => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;
        });

    if (!targetPyContent || isProcessing) return null;

    const pDis = !hasResourceResolver || !hasSkinCharacterData;
    const nDis = !hasResourceResolver;
    const paDis = disablePortAll || isPortAllLoading;

    const buttons = [
        ...(showPortAllButton
            ? [
                  {
                      id: 'portAll',
                      color: 'var(--accent-primary)',
                      title: isPortAllLoading ? 'Porting…' : portAllTooltip,
                      icon: isPortAllLoading ? <CircularProgress size={15} sx={{ color: 'var(--accent-primary)' }} /> : <ArrowBackIcon sx={{ fontSize: 16 }} />,
                      onClick: onPortAll,
                      disabled: paDis,
                  },
              ]
            : []),
        ...(showNewSystemButton
            ? [
                  {
                      id: 'newSystem',
                      color: 'var(--color-warning)',
                      title: nDis ? 'New VFX System (needs ResourceResolver)' : 'New VFX System',
                      icon: <AddIcon sx={{ fontSize: 18 }} />,
                      onClick: handleOpenNewSystemModal,
                      disabled: nDis,
                  },
              ]
            : []),
        ...(showPersistentButton
            ? [
                  {
                      id: 'persistent',
                      color: 'var(--color-success)',
                      title: pDis ? 'Persistent Effects (needs ResourceResolver + SkinData)' : 'Persistent Effects',
                      icon: <AppsIcon sx={{ fontSize: 16 }} />,
                      onClick: handleOpenPersistent,
                      disabled: pDis,
                  },
              ]
            : []),
        ...(showIdleParticlesButton
            ? [
                  {
                      id: 'idleParticles',
                      color: 'var(--color-info)',
                      title: pDis ? 'Idle Particles (needs ResourceResolver + SkinData)' : 'Idle Particles',
                      icon: <BubbleChartIcon sx={{ fontSize: 16 }} />,
                      onClick: handleOpenIdleParticles,
                      disabled: pDis,
                  },
              ]
            : []),
        { id: 'backup', color: 'var(--accent-secondary)', title: 'Backup History', icon: <FolderIcon sx={{ fontSize: 16 }} />, onClick: handleOpenBackupViewer, disabled: false },
    ];

    const ttSx = { fontFamily: 'var(--font-mono)', fontSize: '0.72rem' };

    return (
        <div style={{ position: 'fixed', right: 0, bottom: 90, zIndex: 4500, display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    overflow: 'hidden',
                    maxWidth: expanded ? buttons.length * 44 + 32 : 0,
                    opacity: expanded ? 1 : 0,
                    padding: expanded ? '8px 12px 8px 14px' : '8px 0',
                    background: 'var(--glass-bg)',
                    border: expanded ? '1px solid var(--glass-border)' : '1px solid transparent',
                    borderRight: 'none',
                    backdropFilter: 'saturate(180%) blur(14px)',
                    WebkitBackdropFilter: 'saturate(180%) blur(14px)',
                    borderRadius: '12px 0 0 12px',
                    boxShadow: expanded ? '0 8px 32px rgba(0,0,0,0.4)' : 'none',
                    transition: ['max-width 0.35s cubic-bezier(0.4,0,0.2,1)', 'opacity 0.25s ease', 'padding 0.3s ease', 'box-shadow 0.3s ease'].join(', '),
                    pointerEvents: expanded ? 'auto' : 'none',
                }}
            >
                {buttons.map(({ id, title, color, icon, onClick, disabled }) => (
                    <Tooltip key={id} title={title} arrow placement="top" componentsProps={{ tooltip: { sx: ttSx } }}>
                        <button
                            onClick={disabled ? undefined : onClick}
                            style={makeBtn(color, disabled)}
                            onMouseEnter={(e) => {
                                if (disabled) return;
                                e.currentTarget.style.transform = 'scale(1.12)';
                                e.currentTarget.style.background = `color-mix(in oklab, ${color} 22%, transparent)`;
                                e.currentTarget.style.borderColor = `color-mix(in oklab, ${color} 60%, transparent)`;
                            }}
                            onMouseLeave={(e) => {
                                if (disabled) return;
                                e.currentTarget.style.transform = '';
                                e.currentTarget.style.background = `color-mix(in oklab, ${color} 12%, transparent)`;
                                e.currentTarget.style.borderColor = `color-mix(in oklab, ${color} 35%, transparent)`;
                            }}
                        >
                            {icon}
                        </button>
                    </Tooltip>
                ))}
            </div>

            <Tooltip title={expanded ? 'Collapse' : 'Tools'} arrow placement="left" componentsProps={{ tooltip: { sx: ttSx } }}>
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
                        color: 'var(--text-muted)',
                        transition: 'background 0.2s ease, color 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'color-mix(in oklab, var(--accent-primary) 22%, transparent)';
                        e.currentTarget.style.color = 'var(--accent-primary)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--glass-bg)';
                        e.currentTarget.style.color = 'var(--text-muted)';
                    }}
                >
                    {expanded ? <ChevronRightIcon sx={{ fontSize: 14 }} /> : <ChevronLeftIcon sx={{ fontSize: 14 }} />}
                </div>
            </Tooltip>
        </div>
    );
}

export default React.memo(VfxFloatingActions);
