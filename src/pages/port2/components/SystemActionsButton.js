import React from 'react';
import { IconButton, Menu, MenuItem } from '@mui/material';
import { MoreHoriz as MoreHorizIcon, Delete as DeleteIcon } from '@mui/icons-material';
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

    return (
        <>
            <IconButton
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (isOpen) {
                        setActionsMenuAnchor(null);
                    } else {
                        setActionsMenuAnchor({ element: e.currentTarget, systemKey: system.key });
                    }
                }}
                disabled={!hasResourceResolver || !hasSkinCharacterData}
                title="Actions menu"
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
                sx={{
                    color: (!hasResourceResolver || !hasSkinCharacterData) ? 'rgba(255,255,255,0.35)' : 'var(--accent2)',
                    padding: '4px',
                    minWidth: '32px',
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    marginLeft: 'auto',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                        color: (!hasResourceResolver || !hasSkinCharacterData) ? 'rgba(255,255,255,0.35)' : 'var(--accent)',
                        backgroundColor: 'rgba(255,255,255,0.05)'
                    },
                    '&.Mui-disabled': {
                        opacity: 0.5
                    }
                }}
            >
                <MoreHorizIcon />
            </IconButton>
            <Menu
                anchorEl={menuAnchorEl}
                open={isOpen}
                onClose={(e) => {
                    if (e) e.stopPropagation();
                    setActionsMenuAnchor(null);
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                TransitionProps={{ timeout: 200, enter: true, exit: true }}
                PaperProps={{
                    onClick: (e) => e.stopPropagation(),
                    onMouseDown: (e) => e.stopPropagation(),
                    sx: {
                        background: 'var(--surface-2)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        minWidth: '180px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        mt: 0.5,
                        transition: 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out',
                        '&.MuiMenu-paper': { transformOrigin: 'top right' }
                    }
                }}
            >
                {system.emitters && system.emitters.length > 0 && (
                    <MenuItem
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAllEmitters(system.key);
                            setActionsMenuAnchor(null);
                        }}
                        sx={{
                            color: '#ef4444',
                            fontSize: '0.875rem',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            mb: 0.5,
                            pb: 1,
                            '&:hover': { backgroundColor: 'rgba(239, 68, 68, 0.1)' }
                        }}
                    >
                        <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                        Delete All Emitters
                    </MenuItem>
                )}
                <MenuItem
                    onClick={(e) => {
                        e.stopPropagation();
                        handleAddIdleParticles(system.key, system.name);
                        setActionsMenuAnchor(null);
                    }}
                    disabled={!hasResourceResolver || !hasSkinCharacterData}
                    sx={{
                        color: 'var(--accent)',
                        fontSize: '0.875rem',
                        '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' }
                    }}
                >
                    Add Idle
                </MenuItem>
                <MenuItem
                    onClick={(e) => {
                        e.stopPropagation();
                        handleAddChildParticles(system.key, system.name);
                        setActionsMenuAnchor(null);
                    }}
                    disabled={!hasResourceResolver || !hasSkinCharacterData}
                    sx={{
                        color: 'var(--accent)',
                        fontSize: '0.875rem',
                        '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' }
                    }}
                >
                    Add Child
                </MenuItem>
                <MenuItem
                    onClick={(e) => {
                        e.stopPropagation();
                        try {
                            const sysText = system.rawContent || '';
                            const parsed = parseSystemMatrix(sysText);
                            setMatrixModalState({
                                systemKey: system.key,
                                initial: parsed.matrix || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
                            });
                            setShowMatrixModal(true);
                        } catch (err) { console.error(err); }
                        setActionsMenuAnchor(null);
                    }}
                    sx={{
                        color: 'var(--accent)',
                        fontSize: '0.875rem',
                        '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' }
                    }}
                >
                    Add Matrix
                </MenuItem>
            </Menu>
        </>
    );
});

export default SystemActionsButton;
