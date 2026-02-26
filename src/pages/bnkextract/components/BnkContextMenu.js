import React from 'react';
import { Menu, MenuItem, Divider, Typography } from '@mui/material';
import { PlayArrow, Download, Upload, VolumeOff, VolumeUp, ContentCut, Delete, ContentCopy, CreateNewFolder } from '@mui/icons-material';

export default function BnkContextMenu({
    contextMenu,
    onClose,
    onPlay,
    onExtract,
    onReplace,
    onMakeSilent,
    onAdjustGain,
    onOpenInSplitter,
    onDeleteNode,
    onCopyName,
    onCreateGroup,
    showCreateGroup,
    onAddToGroup,
    showAddToGroup,
    onRemoveFromGroup,
    showRemoveFromGroup,
    isWwiseInstalled,
}) {
    return (
        <Menu
            open={contextMenu !== null}
            onClose={onClose}
            anchorReference="anchorPosition"
            anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
            PaperProps={{
                sx: {
                    background: 'rgba(20, 20, 25, 0.95)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    '& .MuiMenuItem-root': {
                        fontSize: '0.75rem',
                        fontFamily: 'JetBrains Mono, monospace',
                        color: 'var(--accent)',
                    },
                },
            }}
        >
            <MenuItem onClick={onPlay}>
                <PlayArrow sx={{ fontSize: 14, marginRight: 1 }} /> Play audio
            </MenuItem>
            <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
            <MenuItem onClick={onExtract}>
                <Download sx={{ fontSize: 14, marginRight: 1 }} /> Extract selection
            </MenuItem>
            <MenuItem onClick={onReplace}>
                <Upload sx={{ fontSize: 14, marginRight: 1 }} /> Replace wem data
            </MenuItem>
            <MenuItem onClick={onMakeSilent}>
                <VolumeOff sx={{ fontSize: 14, marginRight: 1 }} /> Make Silent
            </MenuItem>
            <MenuItem onClick={onAdjustGain} sx={{ opacity: isWwiseInstalled ? 1 : 0.45 }}>
                <VolumeUp sx={{ fontSize: 14, marginRight: 1 }} /> Adjust Volume...
                {!isWwiseInstalled && <Typography component="span" sx={{ fontSize: '0.6rem', ml: 'auto', color: 'rgba(255,255,255,0.3)' }}>needs tools</Typography>}
            </MenuItem>
            <MenuItem onClick={onOpenInSplitter} sx={{ opacity: contextMenu?.node?.audioData && !isWwiseInstalled ? 0.45 : 1 }}>
                <ContentCut sx={{ fontSize: 14, marginRight: 1 }} /> Open in Audio Splitter...
                {contextMenu?.node?.audioData && !isWwiseInstalled && <Typography component="span" sx={{ fontSize: '0.6rem', ml: 'auto', color: 'rgba(255,255,255,0.3)' }}>needs tools</Typography>}
            </MenuItem>
            <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
            <MenuItem onClick={onDeleteNode} sx={{ color: '#ff6666 !important' }}>
                <Delete sx={{ fontSize: 14, marginRight: 1 }} /> Remove from tree
            </MenuItem>
            <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
            <MenuItem onClick={onCopyName}>
                <ContentCopy sx={{ fontSize: 14, marginRight: 1 }} /> Copy name
            </MenuItem>
            {(showCreateGroup || showAddToGroup || showRemoveFromGroup) && (
                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
            )}
            {showRemoveFromGroup && (
                <MenuItem onClick={onRemoveFromGroup}>
                    <CreateNewFolder sx={{ fontSize: 14, marginRight: 1, opacity: 0.5 }} /> Remove from Group
                </MenuItem>
            )}
            {showAddToGroup && (
                <MenuItem onClick={onAddToGroup}>
                    <CreateNewFolder sx={{ fontSize: 14, marginRight: 1, opacity: 0.7 }} /> Add to Group…
                </MenuItem>
            )}
            {showCreateGroup && (
                <MenuItem onClick={onCreateGroup}>
                    <CreateNewFolder sx={{ fontSize: 14, marginRight: 1 }} /> Create Group
                </MenuItem>
            )}
        </Menu>
    );
}
