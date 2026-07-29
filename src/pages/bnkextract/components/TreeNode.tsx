import React from 'react';
import { Box, Typography } from '@mui/material';
import { ExpandMore, ChevronRight, VolumeUp, ArrowForward } from '@mui/icons-material';
import type { BnkNode, DroppedFile, Pane } from '../types';

/* Pointer-event drag layer.
   Tauri's `dragDropEnabled: true` (needed for OS file drops on other pages)
   hijacks the webview's IDropTarget on Windows, so DOM dragstart/dragover/
   drop never fire for internal element drags. Pointer events are untouched
   by the native layer, so we rebuild "drag a right-pane node onto a left-
   pane node" on top of them. Mirrors the pattern in src/pages/port/usePortDrag. */
const DRAG_THRESHOLD = 5;
interface DragSession {
    sourceIds: string[];
    sourcePane: Pane;
    onDropReplace: (ids: string[], targetId: string) => void;
    lastTargetEl: Element | null;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean; // becomes true only after DRAG_THRESHOLD is crossed
}
let session: DragSession | null = null;

function clearHover() {
    document.querySelectorAll('.bnk-drop-over').forEach((el) => el.classList.remove('bnk-drop-over'));
}
function endSession() {
    if (!session) return;
    clearHover();
    document.body.classList.remove('bnk-dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    session = null;
}
function onMove(e: PointerEvent) {
    if (!session) return;
    if (!session.active) {
        const dx = e.clientX - session.startX;
        const dy = e.clientY - session.startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
        session.active = true;
        document.body.classList.add('bnk-dragging');
    }
    // Hit-test what's under the cursor. Only tree rows tagged with
    // data-node-id[data-pane="left"] are valid targets — right-pane can
    // only be a source.
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const targetRow = el?.closest('[data-node-id][data-pane="left"]') ?? null;
    if (targetRow !== session.lastTargetEl) {
        clearHover();
        if (targetRow) targetRow.classList.add('bnk-drop-over');
        session.lastTargetEl = targetRow;
    }
}
function onUp(e: PointerEvent) {
    if (!session) return;
    const s = session;
    // Only commit a drop if we actually crossed the drag threshold, otherwise
    // this was a click — let the click handler on the row deal with it.
    if (s.active) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const targetRow = el?.closest('[data-node-id][data-pane="left"]') as HTMLElement | null;
        const targetId = targetRow?.getAttribute('data-node-id');
        if (targetId && s.sourcePane === 'right') {
            s.onDropReplace(s.sourceIds, targetId);
        }
    }
    endSession();
}

const formatSize = (bytes?: number): string => {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
};

interface TreeNodeProps {
    node: BnkNode;
    level?: number;
    selectedNodes: Set<string>;
    isSelected?: boolean;
    onSelect: (node: BnkNode, ctrl: boolean, shift: boolean, pane: Pane) => void;
    onPlay: (node: BnkNode) => void;
    onContextMenu: (e: React.MouseEvent, node: BnkNode, pane: Pane) => void;
    expandedNodes?: Set<string>;
    isExpanded?: boolean;
    onToggleExpand: (id: string, shift: boolean, pane: Pane) => void;
    pane?: Pane;
    onDropReplace: (ids: string[], targetId: string) => void;
    onExternalFileDrop: (files: DroppedFile[], targetId: string, pane: Pane) => void;
    renderChildren?: boolean;
}

const TreeNode = React.memo<TreeNodeProps>(({
    node,
    level = 0,
    selectedNodes,
    isSelected: isSelectedProp,
    onSelect,
    onPlay,
    onContextMenu,
    expandedNodes,
    isExpanded: isExpandedProp,
    onToggleExpand,
    pane = 'left',
    onDropReplace,
    onExternalFileDrop,
    renderChildren = true,
}) => {
    const isExpanded = typeof isExpandedProp === 'boolean' ? isExpandedProp : expandedNodes?.has(node.id);
    const isSelected = typeof isSelectedProp === 'boolean' ? isSelectedProp : selectedNodes?.has(node.id);
    const hasChildren = !!(node.children && node.children.length > 0);
    const isAudioFile = node.audioData != null;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // If a pointer drag was in progress and just completed, the "click"
        // that browsers synthesise afterward isn't a real click — swallow it
        // so we don't select/play right after a successful drop.
        if (document.body.classList.contains('bnk-dragging')) return;
        onSelect(node, e.ctrlKey || e.metaKey, e.shiftKey, pane);
        if (isAudioFile) {
            onPlay(node);
        }
    };

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleExpand(node.id, e.shiftKey, pane);
    };

    /* Start a pointer drag from a right-pane draggable row. Left-pane rows are
       drop targets, not sources. We defer "is this actually a drag?" until the
       pointer crosses DRAG_THRESHOLD so clicks on the row still work normally. */
    const handlePointerDown = (e: React.PointerEvent) => {
        if (pane !== 'right') return;
        if (!isAudioFile && !hasChildren) return;
        // Only main-button presses; ignore right-click (context menu) etc.
        if (e.button !== 0) return;
        const sourceIds = selectedNodes.has(node.id) ? Array.from(selectedNodes) : [node.id];
        session = {
            sourceIds,
            sourcePane: pane,
            onDropReplace,
            lastTargetEl: null,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            active: false,
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    };

    return (
        <Box>
            <Box
                data-node-id={node.id}
                data-pane={pane}
                onPointerDown={handlePointerDown}
                onClick={handleClick}
                onContextMenu={(e) => onContextMenu(e, node, pane)}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    paddingLeft: `${level * 18 + 6}px`,
                    cursor: 'pointer',
                    borderRadius: '5px',
                    // Must sit on the draggable row itself. Without it, pressing and
                    // dragging a row starts a native text selection that sweeps the
                    // whole pane instead of an HTML5 drag, so drag-to-replace never
                    // begins. (The .tree-node CSS rule does not apply here - these
                    // rows are MUI Boxes and carry no such class.)
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    border: isSelected ? '1px solid color-mix(in oklab, var(--accent-primary) 38%, transparent)' : '1px solid transparent',
                    background: isSelected ? 'color-mix(in oklab, var(--accent-primary) 16%, transparent)' : 'transparent',
                    marginBottom: '2px',
                    transition: 'background-color 80ms ease, border-color 80ms ease',
                    position: 'relative',
                    '&.bnk-drop-over': {
                        border: '2px dashed var(--accent-primary)',
                        background: 'color-mix(in oklab, var(--accent-primary) 10%, transparent)',
                    },
                    '&:hover': {
                        background: isSelected ? 'color-mix(in oklab, var(--accent-primary) 22%, transparent)' : 'color-mix(in oklab, var(--accent-primary) 10%, transparent)',
                        borderColor: isSelected ? 'color-mix(in oklab, var(--accent-primary) 50%, transparent)' : 'color-mix(in oklab, var(--accent-primary) 25%, transparent)',
                    },
                }}
            >
                {hasChildren ? (
                    <Box
                        role="button"
                        onClick={handleToggle}
                        sx={{
                            width: 20,
                            height: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '2px',
                            color: isExpanded ? 'var(--accent-primary)' : 'var(--text-muted)',
                            '&:hover': { color: 'var(--accent-primary)' },
                            borderRadius: '4px',
                        }}
                    >
                        {isExpanded ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}
                    </Box>
                ) : (
                    <Box sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isAudioFile && <VolumeUp sx={{ fontSize: 12, color: 'var(--accent-primary)', opacity: isSelected ? 1 : 0.6 }} />}
                        {!isAudioFile && !hasChildren && <Box sx={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted)' }} />}
                    </Box>
                )}
                <Typography
                    sx={{
                        fontSize: '0.8rem',
                        fontFamily: 'var(--font-mono)',
                        color: isAudioFile ? 'var(--accent-primary)' : (isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'),
                        marginLeft: '8px',
                        userSelect: 'none',
                        fontWeight: (isSelected || !isAudioFile) ? 600 : 400,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        flex: 1,
                    }}
                >
                    {node.name}
                </Typography>

                {isAudioFile && node.audioData && node.audioData.length !== undefined && (
                    <Typography
                        sx={{
                            fontSize: '0.65rem',
                            color: 'var(--text-muted)',
                            ml: 1,
                            mr: 1,
                            fontFamily: 'var(--font-mono)',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        [{formatSize(node.audioData.length)}]
                    </Typography>
                )}

                {isSelected && pane === 'right' && (
                    <ArrowForward sx={{ fontSize: 10, ml: 'auto', opacity: 0.5, color: 'var(--accent-primary)' }} titleAccess="Drag to Main Bank" />
                )}
            </Box>
            {renderChildren && hasChildren && isExpanded && (
                <Box>
                    {node.children!.map((child, index) => (
                        <TreeNode
                            key={child.id || index}
                            node={child}
                            level={level + 1}
                            selectedNodes={selectedNodes}
                            onSelect={onSelect}
                            onPlay={onPlay}
                            onContextMenu={onContextMenu}
                            expandedNodes={expandedNodes}
                            onToggleExpand={onToggleExpand}
                            pane={pane}
                            onDropReplace={onDropReplace}
                            onExternalFileDrop={onExternalFileDrop}
                        />
                    ))}
                </Box>
            )}
        </Box>
    );
}, (prev, next) => (
    prev.node === next.node
    && prev.level === next.level
    && prev.isSelected === next.isSelected
    && prev.isExpanded === next.isExpanded
    && prev.pane === next.pane
    && prev.renderChildren === next.renderChildren
    && prev.selectedNodes === next.selectedNodes
));

TreeNode.displayName = 'TreeNode';

export default TreeNode;
