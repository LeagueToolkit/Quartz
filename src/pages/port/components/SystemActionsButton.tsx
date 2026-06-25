import React from 'react';
import { IconButton, Menu, MenuItem } from '@mui/material';
import { MoreHoriz as MoreHorizIcon, Delete as DeleteIcon, AddCircleOutline as AddIcon, GridOn as MatrixIcon } from '@mui/icons-material';
import { parseSystemMatrix } from '../utils/matrixUtils';
import type { VfxSystem } from '../utils/vfxEmitterParser';

interface SystemActionsButtonProps {
    system: VfxSystem;
    hasResourceResolver?: boolean;
    hasSkinCharacterData?: boolean;
    menuAnchorEl: HTMLElement | null;
    setActionsMenuAnchor?: (v: { element: HTMLElement; systemKey: string } | null) => void;
    setShowMatrixModal?: (v: boolean) => void;
    setMatrixModalState?: (v: { systemKey: string; initial: number[] }) => void;
    handleAddIdleParticles?: (systemKey: string, systemName: string) => void;
    handleAddChildParticles?: (systemKey: string, systemName: string) => void;
    handleDeleteAllEmitters?: (systemKey: string) => void;
}

const SystemActionsButton = React.memo(
    ({
        system,
        hasResourceResolver,
        hasSkinCharacterData,
        menuAnchorEl,
        setActionsMenuAnchor,
        setShowMatrixModal,
        setMatrixModalState,
        handleAddIdleParticles,
        handleAddChildParticles,
        handleDeleteAllEmitters,
    }: SystemActionsButtonProps) => {
        const isOpen = Boolean(menuAnchorEl);
        const requiresResolverData = !hasResourceResolver || !hasSkinCharacterData;

        const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
            e.stopPropagation();
            setActionsMenuAnchor?.({ element: e.currentTarget, systemKey: system.key });
        };

        const handleClose = (e?: React.MouseEvent | object) => {
            if (e && 'stopPropagation' in e) (e as React.MouseEvent).stopPropagation();
            setActionsMenuAnchor?.(null);
        };

        const handleAction = (cb: () => void) => (e: React.MouseEvent) => {
            e.stopPropagation();
            cb();
            handleClose();
        };

        const menuItemSx = (isDestructive = false) => ({
            padding: '10px 14px',
            minHeight: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: isDestructive ? 'var(--color-danger)' : 'var(--text-primary)',
            transition: 'all 0.2s ease',
            borderBottom: '1px solid var(--border)',
            '&:hover': {
                background: isDestructive ? 'color-mix(in oklab, var(--color-danger) 16%, transparent)' : 'color-mix(in oklab, var(--accent-secondary) 12%, transparent)',
                color: isDestructive ? 'var(--color-danger)' : 'var(--accent-secondary)',
            },
            '&.Mui-disabled': { opacity: 0.35, cursor: 'not-allowed' },
            '& .MuiSvgIcon-root': { fontSize: 16, color: isDestructive ? 'var(--color-danger)' : 'var(--accent-secondary)' },
            '&:last-of-type': { borderBottom: 'none' },
        });

        return (
            <>
                <IconButton
                    className="port-actions-menu-button"
                    onClick={handleOpen}
                    size="small"
                    sx={{
                        width: 30,
                        height: 30,
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        color: isOpen ? 'var(--accent-secondary)' : 'var(--text-secondary)',
                        background: isOpen ? 'color-mix(in oklab, var(--accent-secondary) 28%, transparent)' : 'color-mix(in oklab, var(--accent-secondary) 10%, transparent)',
                        transition: 'all 0.25s ease',
                        '&:hover': {
                            background: 'color-mix(in oklab, var(--accent-secondary) 28%, transparent)',
                            borderColor: 'color-mix(in oklab, var(--accent-secondary) 50%, transparent)',
                            color: 'var(--accent-secondary)',
                        },
                    }}
                >
                    <MoreHorizIcon sx={{ fontSize: 18 }} />
                </IconButton>

                <Menu
                    anchorEl={menuAnchorEl}
                    open={isOpen}
                    onClose={handleClose}
                    onClick={(e) => e.stopPropagation()}
                    marginThreshold={16}
                    PaperProps={{
                        className: 'port-actions-menu-paper',
                        sx: {
                            mt: 1,
                            width: '200px',
                            background: 'var(--glass-bg)',
                            backdropFilter: 'saturate(180%) blur(16px)',
                            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '12px',
                            boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.3)',
                            overflow: 'hidden',
                            '& .MuiList-root': { padding: 0 },
                        },
                    }}
                    transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                    anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                >
                    {system.emitters && system.emitters.length > 0 && (
                        <MenuItem key="delete-all" onClick={handleAction(() => handleDeleteAllEmitters?.(system.key))} sx={menuItemSx(true)}>
                            <DeleteIcon />
                            Delete All
                        </MenuItem>
                    )}

                    <div style={{ padding: 0 }}>
                        <MenuItem
                            disabled={requiresResolverData}
                            onClick={handleAction(() => handleAddIdleParticles?.(system.key, system.name))}
                            sx={menuItemSx()}
                            title={requiresResolverData ? 'Requires ResourceResolver and SkinData' : ''}
                        >
                            <AddIcon />
                            Add Idle
                        </MenuItem>

                        <MenuItem
                            disabled={requiresResolverData}
                            onClick={handleAction(() => handleAddChildParticles?.(system.key, system.name))}
                            sx={menuItemSx()}
                            title={requiresResolverData ? 'Requires ResourceResolver and SkinData' : ''}
                        >
                            <AddIcon />
                            Add Child
                        </MenuItem>

                        <MenuItem
                            onClick={handleAction(() => {
                                try {
                                    const sysText = system.rawContent || '';
                                    const parsed = parseSystemMatrix(sysText);
                                    setMatrixModalState?.({
                                        systemKey: system.key,
                                        initial: parsed.matrix || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                                    });
                                    setShowMatrixModal?.(true);
                                } catch {
                                    /* noop */
                                }
                            })}
                            sx={menuItemSx()}
                        >
                            <MatrixIcon />
                            Add Matrix
                        </MenuItem>
                    </div>
                </Menu>
            </>
        );
    }
);

export default SystemActionsButton;
