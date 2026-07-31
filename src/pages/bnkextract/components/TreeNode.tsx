import React from 'react';
import { Box, Typography } from '@mui/material';
import { ExpandMore, ChevronRight, VolumeUp, ArrowForward, Folder } from '@mui/icons-material';
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
    /** Move nodes into a folder within the reference pane (targetId = null moves
     *  them back out to the pane root). */
    onMoveIntoGroup: (ids: string[], targetGroupId: string | null) => void;
    lastTargetEl: Element | null;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean; // becomes true only after DRAG_THRESHOLD is crossed
    /** What is being dragged, shown in the cursor ghost. */
    label: string;
    ghost: HTMLElement | null;
    /** True when every dragged node is a sound, so it may be sorted into a
     *  folder. Folders and bank containers are drag-to-replace only. */
    canMove: boolean;
}

/** What the row under the cursor would do if we dropped right now. */
type DropKind = 'replace' | 'move' | null;

/* A right-pane drag can land two ways:
     - on a LEFT row     -> replace that track's audio (the original behaviour)
     - on a RIGHT folder -> move the dragged sounds into it (sorting)
   Blank space in the reference pane moves them back out to the root.
   `canMove` is false when the dragged selection contains anything that is not a
   sound, so folders and banks cannot be nested. */
function resolveTarget(x: number, y: number, canMove: boolean): { el: Element | null; kind: DropKind } {
    const under = document.elementFromPoint(x, y);
    if (!under) return { el: null, kind: null };

    const leftRow = under.closest('[data-node-id][data-pane="left"]');
    if (leftRow) return { el: leftRow, kind: 'replace' };

    if (!canMove) return { el: null, kind: null };

    const rightFolder = under.closest('[data-node-id][data-pane="right"][data-folder="true"]');
    if (rightFolder) return { el: rightFolder, kind: 'move' };

    if (under.closest('.bnk-extract-tree-right')) return { el: null, kind: 'move' };

    return { el: null, kind: null };
}
let session: DragSession | null = null;

/* Cursor ghost: a small chip that follows the pointer showing what you are
   carrying and whether the row under the cursor will accept it. Without it a
   pointer-event drag gives no feedback at all until you happen to hover a
   valid target. */
function createGhost(label: string): HTMLElement {
    // Sweep any ghost orphaned by a gesture that never got its pointerup (the
    // drop re-renders the tree, which can unmount the row mid-gesture). Without
    // this they stack up on screen.
    document.querySelectorAll('.bnk-drag-ghost').forEach((el) => el.remove());
    const el = document.createElement('div');
    el.className = 'bnk-drag-ghost';
    el.textContent = label;
    document.body.appendChild(el);
    return el;
}
function moveGhost(ghost: HTMLElement | null, x: number, y: number, overTarget: boolean) {
    if (!ghost) return;
    ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
    ghost.classList.toggle('is-valid', overTarget);
}

function clearHover() {
    document.querySelectorAll('.bnk-drop-over').forEach((el) => el.classList.remove('bnk-drop-over'));
}
/* Tear down unconditionally: listeners, highlight, and EVERY ghost in the DOM
   (not just session.ghost, which misses orphans from an interrupted gesture).
   Safe to call when no session is live. */
function endSession() {
    clearHover();
    document.querySelectorAll('.bnk-drag-ghost').forEach((el) => el.remove());
    document.body.classList.remove('bnk-dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', endSession);
    window.removeEventListener('dragend', endSession);
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
        session.ghost = createGhost(session.label);
    }
    const { el: targetRow, kind } = resolveTarget(e.clientX, e.clientY, session.canMove);
    if (targetRow !== session.lastTargetEl) {
        clearHover();
        if (targetRow) targetRow.classList.add('bnk-drop-over');
        session.lastTargetEl = targetRow;
    }
    // A move onto blank space has no row to highlight but is still a valid drop.
    moveGhost(session.ghost, e.clientX, e.clientY, kind !== null);
}
function onUp(e: PointerEvent) {
    if (!session) return;
    const s = session;
    // Only commit a drop if we actually crossed the drag threshold, otherwise
    // this was a click — let the click handler on the row deal with it.
    if (s.active && s.sourcePane === 'right') {
        const { el: targetRow, kind } = resolveTarget(e.clientX, e.clientY, s.canMove);
        const targetId = targetRow?.getAttribute('data-node-id') ?? null;
        if (kind === 'replace' && targetId) {
            s.onDropReplace(s.sourceIds, targetId);
        } else if (kind === 'move') {
            s.onMoveIntoGroup(s.sourceIds, targetId);
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
    onMoveIntoGroup: (ids: string[], targetGroupId: string | null) => void;
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
    onMoveIntoGroup,
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
        // Audio rows, folders, and containers can all be dragged (folders so the
        // whole group can be re-sorted).
        if (!isAudioFile && !hasChildren && !node.isFolder) return;
        // Only main-button presses; ignore right-click (context menu) etc.
        if (e.button !== 0) return;
        // Clear anything left over from a gesture that never completed, so we
        // never end up with two live sessions or a duplicated listener pair.
        endSession();
        const sourceIds = selectedNodes.has(node.id) ? Array.from(selectedNodes) : [node.id];
        // Sorting into a folder is sounds-only. For a multi-select we can only
        // see this row, so fall back to the DOM: a row is a sound when it is not
        // tagged as a folder and has no expander.
        const allSounds = sourceIds.length === 1
            ? isAudioFile
            : sourceIds.every((id) => {
                const row = document.querySelector(`[data-node-id="${CSS.escape(id)}"][data-pane="right"]`);
                return !!row && row.getAttribute('data-folder') !== 'true' && row.getAttribute('data-container') !== 'true';
            });
        session = {
            sourceIds,
            sourcePane: pane,
            onDropReplace,
            onMoveIntoGroup,
            lastTargetEl: null,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            active: false,
            label: sourceIds.length > 1 ? `${sourceIds.length} sounds` : node.name,
            ghost: null,
            canMove: allSounds,
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        // Releasing outside the window never delivers pointerup; these catch it.
        window.addEventListener('blur', endSession, { once: true });
        window.addEventListener('dragend', endSession, { once: true });
    };

    return (
        <Box>
            <Box
                data-node-id={node.id}
                data-pane={pane}
                // Marks a user-created folder as a valid drag-to-sort destination.
                data-folder={node.isFolder ? 'true' : undefined}
                // A parsed bank / event / wem container: neither draggable into a
                // folder nor a drop target.
                data-container={!node.isFolder && hasChildren ? 'true' : undefined}
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
                    // Row that will receive the drop. Keeps the 1px border so the
                    // row does not shift; the ring is drawn with a shadow instead.
                    '&.bnk-drop-over': {
                        border: '1px solid var(--accent-primary)',
                        background: 'color-mix(in oklab, var(--accent-primary) 26%, transparent)',
                        boxShadow: '0 0 0 2px color-mix(in oklab, var(--accent-primary) 35%, transparent)',
                    },
                    '&:hover': {
                        background: isSelected ? 'color-mix(in oklab, var(--accent-primary) 22%, transparent)' : 'color-mix(in oklab, var(--accent-primary) 10%, transparent)',
                        borderColor: isSelected ? 'color-mix(in oklab, var(--accent-primary) 50%, transparent)' : 'color-mix(in oklab, var(--accent-primary) 25%, transparent)',
                    },
                }}
            >
                {/* A folder always gets an expander (even when empty, so it reads
                    as a container you can drop into); other rows only when they
                    actually have children. */}
                {(hasChildren || node.isFolder) ? (
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
                            opacity: !hasChildren && node.isFolder ? 0.35 : 1,
                            '&:hover': { color: 'var(--accent-primary)' },
                            borderRadius: '4px',
                        }}
                    >
                        {isExpanded ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}
                    </Box>
                ) : (
                    <Box sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isAudioFile && <VolumeUp sx={{ fontSize: 12, color: 'var(--accent-primary)', opacity: isSelected ? 1 : 0.6 }} />}
                        {!isAudioFile && <Box sx={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted)' }} />}
                    </Box>
                )}
                {node.isFolder && (
                    <Folder sx={{ fontSize: 13, color: 'var(--accent-primary)', opacity: 0.85, ml: '2px' }} />
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

                {/* How many sounds a folder holds, so its contents are legible
                    while collapsed. */}
                {node.isFolder && (
                    <Typography
                        sx={{
                            fontSize: '0.65rem',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)',
                            ml: 1,
                            mr: 1,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {node.children?.length ?? 0}
                    </Typography>
                )}

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
                            onMoveIntoGroup={onMoveIntoGroup}
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
