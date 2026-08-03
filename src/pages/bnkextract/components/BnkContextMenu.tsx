import { Menu, MenuItem, Divider } from '@mui/material';
import { PlayArrow, Download, Upload, VolumeOff, VolumeUp, ContentCut, Delete, ContentCopy, CreateNewFolder } from '@mui/icons-material';
import type { ContextMenuState } from '../types';

interface Props {
    contextMenu: ContextMenuState | null;
    onClose: () => void;
    onPlay: () => void;
    onExtract: () => void;
    onReplace: () => void;
    onMakeSilent: () => void;
    onAdjustGain: () => void;
    onOpenInSplitter: () => void;
    onDeleteNode: () => void;
    onCopyName: () => void;
    onCreateGroup: () => void;
    showCreateGroup: boolean;
    onAddToGroup: () => void;
    showAddToGroup: boolean;
    onRemoveFromGroup: () => void;
    showRemoveFromGroup: boolean;
}

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
}: Props) {
    return (
        <Menu
            open={contextMenu !== null}
            onClose={onClose}
            anchorReference="anchorPosition"
            anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
            PaperProps={{
                sx: {
                    background: 'color-mix(in oklab, var(--bg-secondary) 95%, transparent)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    '& .MuiMenuItem-root': {
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-primary)',
                        '&:hover': {
                            background: 'color-mix(in oklab, var(--accent-primary) 16%, transparent)',
                            color: 'color-mix(in oklab, var(--accent-primary) 12%, var(--text-primary))',
                        },
                    },
                },
            }}
        >
            {/* Everything here acts on a specific row. A right-click on empty pane
                space has no node, so only the pane-level actions below are shown. */}
            {contextMenu?.node && [
                <MenuItem key="play" onClick={onPlay}>
                    <PlayArrow sx={{ fontSize: 14, marginRight: 1 }} /> Play audio
                </MenuItem>,
                <Divider key="d1" sx={{ borderColor: 'var(--border)' }} />,
                <MenuItem key="extract" onClick={onExtract}>
                    <Download sx={{ fontSize: 14, marginRight: 1 }} /> Extract selection
                </MenuItem>,
                <MenuItem key="replace" onClick={onReplace}>
                    <Upload sx={{ fontSize: 14, marginRight: 1 }} /> Replace wem data
                </MenuItem>,
                <MenuItem key="silent" onClick={onMakeSilent}>
                    <VolumeOff sx={{ fontSize: 14, marginRight: 1 }} /> Make Silent
                </MenuItem>,
                <MenuItem key="gain" onClick={onAdjustGain}>
                    <VolumeUp sx={{ fontSize: 14, marginRight: 1 }} /> Adjust Volume...
                </MenuItem>,
                <MenuItem key="splitter" onClick={onOpenInSplitter}>
                    <ContentCut sx={{ fontSize: 14, marginRight: 1 }} /> Open in Audio Splitter...
                </MenuItem>,
                <Divider key="d2" sx={{ borderColor: 'var(--border)' }} />,
                <MenuItem key="delete" onClick={onDeleteNode} sx={{ color: 'var(--color-danger) !important', '&:hover': { background: 'var(--color-danger) !important', color: '#fff !important' } }}>
                    <Delete sx={{ fontSize: 14, marginRight: 1 }} /> Remove from tree
                </MenuItem>,
                <Divider key="d3" sx={{ borderColor: 'var(--border)' }} />,
                <MenuItem key="copy" onClick={onCopyName}>
                    <ContentCopy sx={{ fontSize: 14, marginRight: 1 }} /> Copy name
                </MenuItem>,
            ]}
            {contextMenu?.node && (showCreateGroup || showAddToGroup || showRemoveFromGroup) && (
                <Divider sx={{ borderColor: 'var(--border)' }} />
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
