import React from 'react';
import {
    IconButton,
    Menu,
    MenuItem
} from '@mui/material';
import {
    MoreHoriz as MoreHorizIcon,
    Delete as DeleteIcon,
    AddCircleOutline as AddIcon,
    GridOn as MatrixIcon
} from '@mui/icons-material';
import { parseSystemMatrix } from '../../../utils/vfx/mutations/matrixUtils.js';

const SystemActionsButton = React.memo(({
    system,
    hasResourceResolver,
    hasSkinCharacterData,
    menuAnchorEl,
    setActionsMenuAnchor,
    setShowMatrixModal,
    setMatrixModalState,
    handleAddIdleParticles,
    handleAddChildParticles,
    handleDeleteAllEmitters
}) => {
    const isOpen = Boolean(menuAnchorEl);
    const requiresResolverData = !hasResourceResolver || !hasSkinCharacterData;

    const handleOpen = (e) => {
        e.stopPropagation();
        setActionsMenuAnchor({ element: e.currentTarget, systemKey: system.key });
    };

    const handleClose = (e) => {
        if (e) e.stopPropagation();
        setActionsMenuAnchor(null);
    };

    const handleAction = (cb) => (e) => {
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
        fontFamily: 'JetBrains Mono, monospace',
        textTransform: 'uppercase',
        fontWeight: 600,
        letterSpacing: '0.06em',
        color: isDestructive ? '#ff7a7a' : 'var(--text)',
        transition: 'all 0.2s ease',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        '&:hover': {
            background: isDestructive
                ? 'rgba(239,68,68,0.16)'
                : 'color-mix(in srgb, var(--accent2), transparent 88%)',
            color: isDestructive ? '#ff8f8f' : 'var(--accent2)',
        },
        '&.Mui-disabled': {
            opacity: 0.35,
            cursor: 'not-allowed',
        },
        '& .MuiSvgIcon-root': {
            fontSize: 16,
            color: isDestructive ? '#ff7a7a' : 'var(--accent2)',
        },
        '&:last-of-type': {
            borderBottom: 'none',
        },
    });

    return (
        <>
            <IconButton
                onClick={handleOpen}
                size="small"
                sx={{
                    width: 30,
                    height: 30,
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: isOpen ? 'var(--accent2)' : 'rgba(255,255,255,0.56)',
                    background: isOpen
                        ? 'color-mix(in srgb, var(--accent2), transparent 72%)'
                        : 'color-mix(in srgb, var(--accent2), transparent 90%)',
                    transition: 'all 0.25s ease',
                    '&:hover': {
                        background: 'color-mix(in srgb, var(--accent2), transparent 72%)',
                        borderColor: 'color-mix(in srgb, var(--accent2), transparent 50%)',
                        boxShadow: '0 0 14px color-mix(in srgb, var(--accent2), transparent 65%)',
                        color: 'var(--accent2)',
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
                    sx: {
                        mt: 1,
                        width: '200px',
                        background: 'var(--glass-bg, rgba(20, 20, 24, 0.94))',
                        backdropFilter: 'saturate(180%) blur(16px)',
                        WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                        border: '1px solid var(--glass-border, rgba(255,255,255,0.12))',
                        borderRadius: '12px',
                        boxShadow: '0 20px 48px rgba(0,0,0,0.5), 0 0 16px color-mix(in srgb, var(--accent2), transparent 80%)',
                        overflow: 'hidden',
                        '& .MuiList-root': {
                            padding: 0,
                        }
                    }
                }}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
                {system.emitters && system.emitters.length > 0 && (
                    <MenuItem
                        key="delete-all"
                        onClick={handleAction(() => handleDeleteAllEmitters(system.key))}
                        sx={menuItemSx(true)}
                    >
                        <DeleteIcon />
                        Delete All
                    </MenuItem>
                )}

                <div style={{ padding: 0 }}>
                    <MenuItem
                        disabled={requiresResolverData}
                        onClick={handleAction(() => handleAddIdleParticles(system.key, system.name))}
                        sx={menuItemSx()}
                        title={requiresResolverData ? "Requires ResourceResolver and SkinData" : ""}
                    >
                        <AddIcon />
                        Add Idle
                    </MenuItem>

                    <MenuItem
                        disabled={requiresResolverData}
                        onClick={handleAction(() => handleAddChildParticles(system.key, system.name))}
                        sx={menuItemSx()}
                        title={requiresResolverData ? "Requires ResourceResolver and SkinData" : ""}
                    >
                        <AddIcon />
                        Add Child
                    </MenuItem>

                    <MenuItem
                        onClick={handleAction(() => {
                            try {
                                const sysText = system.rawContent || '';
                                const parsed = parseSystemMatrix(sysText);
                                setMatrixModalState({
                                    systemKey: system.key,
                                    initial: parsed.matrix || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
                                });
                                setShowMatrixModal(true);
                            } catch (err) { console.error(err); }
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
});

export default SystemActionsButton;
