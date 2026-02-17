/**
 * BnkExtract - Audio Bank Extraction and Editing Tool
 * React page for extracting, playing, replacing, and saving audio from BNK/WPK files
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    Box,
    Typography,
    Button,
    TextField,
    IconButton,
    Checkbox,
    FormControlLabel,
    LinearProgress,
    Tooltip,
    Menu,
    MenuItem,
    Divider,
    Slider,
    Backdrop,
    CircularProgress,
} from '@mui/material';
import {
    FolderOpen,
    PlayArrow,
    Stop,
    Download,
    Upload,
    Save,
    Delete,
    ExpandMore,
    ChevronRight,
    Refresh,
    VolumeUp,
    Settings,
    ContentCopy,
    History,
    AutoFixHigh,
    VerticalSplit,
    ViewStream,
    ArrowForward,
    CompareArrows,
    Search,
    Close,
    ContentCut,
    Sort,
    VolumeOff,
    Undo,
    Redo,
} from '@mui/icons-material';

import AutoExtractDialog from '../components/AutoExtractDialog';
import AudioSplitter from '../components/AudioSplitter';
import { getModFiles } from '../utils/modAutoProcessor';
import { parseAudioFile, parseBnkFile, parseWpkFile, writeBnkFile, writeWpkFile, fnv1Hash, parseBinFile, groupAudioFiles, getEventMappings } from '../utils/bnkParser';
import { wemToOgg, wemToWav, wemToMp3 } from '../utils/wemConverter';
import './BnkExtract.css';

// Styles
const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: 'JetBrains Mono, monospace',
};

const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    background: 'rgba(0, 0, 0, 0.4)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
};

const mainContentStyle = {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
};

const treeViewStyle = {
    flex: 1,
    overflow: 'auto',
    background: 'rgba(0, 0, 0, 0.35)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    margin: '1rem',
    padding: '0.75rem',
};

const sidebarStyle = {
    width: '240px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '1rem',
    paddingLeft: 0,
    overflow: 'hidden',
    minHeight: 0,
};

const buttonStyle = {
    background: 'rgba(0, 0, 0, 0.4)',
    color: 'var(--text)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '6px',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.8rem',
    textTransform: 'none',
    justifyContent: 'flex-start',
    padding: '0.5rem 0.8rem',
    minHeight: '36px',
    '&:hover': {
        background: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'var(--accent)',
    },
    '&:disabled': {
        opacity: 0.4,
        color: 'var(--text-2)',
    },
};

const compactButtonStyle = {
    ...buttonStyle,
    padding: '0.25rem 0.5rem',
    minWidth: 'unset',
    minHeight: '24px',
};

const inputStyle = {
    '& .MuiOutlinedInput-root': {
        background: 'rgba(0, 0, 0, 0.35)',
        borderRadius: '6px',
        fontSize: '0.8rem',
        fontFamily: 'JetBrains Mono, monospace',
        color: 'var(--text)',
        height: '36px',
        '& fieldset': {
            borderColor: 'rgba(255, 255, 255, 0.15)',
        },
        '&:hover fieldset': {
            borderColor: 'rgba(255, 255, 255, 0.25)',
        },
        '&.Mui-focused fieldset': {
            borderColor: 'var(--accent)',
        },
    },
    '& .MuiInputBase-input': {
        padding: '4px 8px',
        color: 'rgba(255, 255, 255, 0.85)',
    },
    '& .MuiInputBase-input::placeholder': {
        color: 'rgba(255, 255, 255, 0.35)',
        opacity: 1,
    },
};


const formatSize = (bytes) => {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
};

/**
 * Tree Node Component
 */
const TreeNode = React.memo(({
    node,
    level = 0,
    selectedNodes,
    onSelect,
    onPlay,
    onContextMenu,
    expandedNodes,
    onToggleExpand,
    pane = 'left',
    onDropReplace,
    onExternalFileDrop
}) => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isAudioFile = node.audioData !== null;

    const [isDragOver, setIsDragOver] = useState(false);

    const handleClick = (e) => {
        e.stopPropagation();
        onSelect(node, e.ctrlKey || e.metaKey, e.shiftKey, pane);
        if (isAudioFile) {
            onPlay(node);
        }
    };

    const handleToggle = (e) => {
        e.stopPropagation();
        onToggleExpand(node.id, e.shiftKey, pane);
    };

    const handleDragStart = (e) => {
        if (!isAudioFile && !hasChildren) return;
        e.stopPropagation();

        // If current node is selected, drag all selected nodes. Otherwise just this one.
        const sourceIds = selectedNodes.has(node.id) ? Array.from(selectedNodes) : [node.id];

        e.dataTransfer.setData('sourceNode', JSON.stringify({
            ids: sourceIds,
            pane: pane
        }));
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragOver = (e) => {
        // Accept drops on audio leaf nodes OR container/parent nodes
        if (!isAudioFile && !hasChildren) return;

        const isExternal = e.dataTransfer?.types?.includes('Files');
        const isInternalNode = e.dataTransfer?.types?.some(t => t.toLowerCase() === 'sourcenode');

        // Right pane ONLY accepts external file drops
        if (pane === 'right' && !isExternal) return;

        // Left pane accepts both, but only if we have source data
        if (!isExternal && !isInternalNode) return;

        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = (e) => {
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDrop = (e) => {
        if (!isAudioFile && !hasChildren) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        // External file drop from Windows Explorer / desktop
        if (e.dataTransfer?.files?.length > 0) {
            const VALID_EXTS = ['wem', 'wav', 'mp3', 'ogg'];
            const validFiles = Array.from(e.dataTransfer.files)
                .filter(f => VALID_EXTS.includes(f.name.toLowerCase().split('.').pop()))
                .map(f => ({ path: f.path, name: f.name }));
            if (validFiles.length > 0) {
                onExternalFileDrop(validFiles, node.id, pane);
            }
            return;
        }

        // Internal drop: right pane node onto left pane
        if (pane === 'right') return;
        const sourceData = e.dataTransfer.getData('sourceNode');
        if (sourceData) {
            try {
                const sourceInfo = JSON.parse(sourceData);
                if (sourceInfo.pane === 'right') {
                    const ids = sourceInfo.ids || [sourceInfo.id];
                    onDropReplace(ids, node.id);
                }
            } catch (err) {
                console.error('[TreeNode] Drop failed:', err);
            }
        }
    };

    return (
        <Box>
            <Box
                draggable={isAudioFile || hasChildren}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClick}
                onContextMenu={(e) => onContextMenu(e, node, pane)}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    paddingLeft: `${level * 18 + 6}px`,
                    cursor: 'pointer',
                    borderRadius: '5px',
                    border: isDragOver ? '2px dashed var(--accent)' : (isSelected ? '1px solid var(--accent)' : '1px solid transparent'),
                    background: isSelected ? 'rgba(var(--accent-rgb), 0.15)' : 'transparent',
                    marginBottom: '2px',
                    transition: 'all 0.1s ease',
                    position: 'relative',
                    '&:hover': {
                        background: isSelected ? 'rgba(var(--accent-rgb), 0.25)' : 'rgba(255, 255, 255, 0.05)',
                        borderColor: isSelected ? 'var(--accent)' : 'rgba(255, 255, 255, 0.15)',
                    },
                }}
            >
                {hasChildren ? (
                    <IconButton
                        size="small"
                        onClick={handleToggle}
                        sx={{
                            padding: '2px',
                            color: isExpanded ? 'var(--accent)' : 'rgba(255, 255, 255, 0.4)',
                            '&:hover': { color: 'var(--accent)' }
                        }}
                    >
                        {isExpanded ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}
                    </IconButton>
                ) : (
                    <Box sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isAudioFile && <VolumeUp sx={{ fontSize: 12, color: 'var(--accent)', opacity: isSelected ? 1 : 0.6 }} />}
                        {!isAudioFile && !hasChildren && <Box sx={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />}
                    </Box>
                )}
                <Typography
                    sx={{
                        fontSize: '0.8rem',
                        fontFamily: 'JetBrains Mono, monospace',
                        color: isAudioFile ? 'var(--accent)' : (isSelected ? 'white' : 'rgba(255, 255, 255, 0.7)'),
                        marginLeft: '8px',
                        userSelect: 'none',
                        fontWeight: (isSelected || !isAudioFile) ? 600 : 400,
                        textShadow: isSelected ? '0 0 10px rgba(var(--accent-rgb), 0.5)' : 'none',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        flex: 1
                    }}
                >
                    {node.name}
                </Typography>

                {isAudioFile && node.audioData && node.audioData.length !== undefined && (
                    <Typography
                        sx={{
                            fontSize: '0.65rem',
                            color: 'rgba(255, 255, 255, 0.35)',
                            ml: 1,
                            mr: 1,
                            fontFamily: 'JetBrains Mono, monospace',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        [{formatSize(node.audioData.length)}]
                    </Typography>
                )}

                {isSelected && pane === 'right' && (
                    <ArrowForward sx={{ fontSize: 10, ml: 'auto', opacity: 0.5, color: 'var(--accent)' }} titleAccess="Drag to Main Bank" />
                )}
            </Box>
            {hasChildren && isExpanded && (
                <Box>
                    {node.children.map((child, index) => (
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
});

/**
 * Main BnkExtract Component
 */
export default function BnkExtract() {
    // File paths
    const [bnkPath, setBnkPath] = useState('');
    const [wpkPath, setWpkPath] = useState('');
    const [binPath, setBinPath] = useState('');

    // Parsed data
    const [parsedData, setParsedData] = useState(null);
    const [treeData, setTreeData] = useState([]);

    // Selection state
    const [selectedNodes, setSelectedNodes] = useState(new Set());
    const [expandedNodes, setExpandedNodes] = useState(new Set());
    const [rightSelectedNodes, setRightSelectedNodes] = useState(new Set());
    const [rightExpandedNodes, setRightExpandedNodes] = useState(new Set());
    const [lastSelectedId, setLastSelectedId] = useState({ id: null, pane: 'left' });

    // UI state
    const [viewMode, setViewMode] = useState('split'); // 'normal' | 'split'
    const [activePane, setActivePane] = useState('left');
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Ready');
    const [contextMenu, setContextMenu] = useState(null);
    const [rightTreeData, setRightTreeData] = useState([]);
    const [rightPaneDragOver, setRightPaneDragOver] = useState(false);
    const [rightSortMode, setRightSortMode] = useState('none'); // 'none', 'size-asc', 'size-desc'

    // Undo/Redo state
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    // Wwise conversion state
    const [isWwiseInstalled, setIsWwiseInstalled] = useState(false);
    const [showInstallModal, setShowInstallModal] = useState(false);
    const [showConvertOverlay, setShowConvertOverlay] = useState(false);
    const [convertStatus, setConvertStatus] = useState('');
    const [installProgress, setInstallProgress] = useState('');
    const [isInstalling, setIsInstalling] = useState(false);

    /**
     * SnapShot current state for undo
     */
    const pushToHistory = useCallback(() => {
        setUndoStack(prev => {
            const next = [...prev, { left: treeData, right: rightTreeData }];
            return next.slice(-30); // Keep last 30
        });
        setRedoStack([]);
    }, [treeData, rightTreeData]);

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return;
        const last = undoStack[undoStack.length - 1];
        setRedoStack(prev => [...prev, { left: treeData, right: rightTreeData }].slice(-30));
        setTreeData(last.left);
        setRightTreeData(last.right);
        setUndoStack(prev => prev.slice(0, -1));
        setStatusMessage('Undo performed');
    }, [undoStack, treeData, rightTreeData]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0) return;
        const last = redoStack[redoStack.length - 1];
        setUndoStack(prev => [...prev, { left: treeData, right: rightTreeData }].slice(-30));
        setTreeData(last.left);
        setRightTreeData(last.right);
        setRedoStack(prev => prev.slice(0, -1));
        setStatusMessage('Redo performed');
    }, [redoStack, treeData, rightTreeData]);

    // Pending conversion: { filePath, targetNodeId } — used when install completes mid-drop
    const pendingConversion = useRef(null);

    // Gain / volume state
    const [showGainDialog, setShowGainDialog] = useState(false);
    const [gainDb, setGainDb] = useState('3');
    const [gainTargetNodeId, setGainTargetNodeId] = useState(null);
    const [gainTargetPane, setGainTargetPane] = useState('left');

    // Audio Splitter state
    const [showAudioSplitter, setShowAudioSplitter] = useState(false);
    const [splitterInitialFile, setSplitterInitialFile] = useState(null);

    // Settings
    const [autoPlay, setAutoPlay] = useState(true);
    const [extractFormats, setExtractFormats] = useState(() => {
        const saved = localStorage.getItem('bnk-extract-formats');
        return saved ? new Set(JSON.parse(saved)) : new Set(['wem', 'ogg']);
    });
    const [multiSelect, setMultiSelect] = useState(true);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [mp3Bitrate, setMp3Bitrate] = useState(() => {
        const saved = localStorage.getItem('bnk-extract-mp3-bitrate');
        return saved ? parseInt(saved, 10) : 192;
    });
    const [historyAnchor, setHistoryAnchor] = useState(null);
    const [autoExtractOpen, setAutoExtractOpen] = useState(false);

    // Search state
    const [leftSearchQuery, setLeftSearchQuery] = useState('');
    const [rightSearchQuery, setRightSearchQuery] = useState('');
    const [leftSearchDebounced, setLeftSearchDebounced] = useState('');
    const [rightSearchDebounced, setRightSearchDebounced] = useState('');

    // Debounce effects
    useEffect(() => {
        const timer = setTimeout(() => setLeftSearchDebounced(leftSearchQuery), 350);
        return () => clearTimeout(timer);
    }, [leftSearchQuery]);

    useEffect(() => {
        const timer = setTimeout(() => setRightSearchDebounced(rightSearchQuery), 350);
        return () => clearTimeout(timer);
    }, [rightSearchQuery]);

    // Check Wwise installation on mount
    useEffect(() => {
        if (!window.require) return;
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.invoke('wwise:check').then(({ installed }) => {
            setIsWwiseInstalled(installed);
            if (!installed) setShowInstallModal(true);
        }).catch(() => { });
    }, []);

    // Listen for install progress events from backend
    useEffect(() => {
        if (!window.require) return;
        const { ipcRenderer } = window.require('electron');
        const handler = (_, msg) => setInstallProgress(msg);
        ipcRenderer.on('wwise:install-progress', handler);
        return () => ipcRenderer.removeListener('wwise:install-progress', handler);
    }, []);

    /**
     * Convert a wav/mp3/ogg file to .wem via the backend, then inject it into the
     * right pane as a new node (mimicking a direct WEM drop).
     */
    const convertAndInjectToRightPane = useCallback(async (filePath, fileName) => {
        if (!window.require) return;
        pushToHistory();
        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');
        const path = window.require('path');

        setShowConvertOverlay(true);
        setConvertStatus('Synthesizing WEM from Audio Source...');

        try {
            const result = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: filePath });
            if (!result.success) {
                setShowConvertOverlay(false);
                setStatusMessage(`Conversion failed: ${result.error}`);
                return;
            }

            // Read the generated .wem bytes
            const wemData = new Uint8Array(fs.readFileSync(result.wemPath));
            const baseName = path.basename(fileName, path.extname(fileName));
            const audioId = Date.now();

            const audioNode = {
                id: `converted-${audioId}`,
                name: `${baseName}.wem`,
                audioData: { id: audioId, data: wemData, offset: 0, length: wemData.length },
                children: []
            };

            setRightTreeData(prev => {
                const rootIdx = prev.findIndex(n => n.id === '__converted-root__');
                if (rootIdx !== -1) {
                    const newTree = [...prev];
                    newTree[rootIdx] = { ...newTree[rootIdx], children: [...newTree[rootIdx].children, audioNode] };
                    return newTree;
                }
                const rootNode = { id: '__converted-root__', name: 'Converted', audioData: null, isRoot: true, children: [audioNode] };
                return [rootNode, ...prev];
            });
            setRightExpandedNodes(prev => { const s = new Set(prev); s.add('__converted-root__'); return s; });

            // Cleanup the .wem temp file — it's now in memory
            try { fs.unlinkSync(result.wemPath); } catch (_) { }

            setStatusMessage(`Converted and loaded: ${baseName}.wem`);
        } catch (err) {
            setStatusMessage(`Conversion error: ${err.message}`);
        } finally {
            setShowConvertOverlay(false);
            setConvertStatus('');
        }
    }, []);

    /**
     * Apply dB gain to all audio leaf nodes under gainTargetNodeId.
     * WEM → vgmstream WAV → amplify → WwiseConsole WEM.
     */
    const handleApplyGain = useCallback(async () => {
        const gainDbNum = parseFloat(gainDb);
        if (isNaN(gainDbNum) || gainDbNum === 0) { setShowGainDialog(false); return; }
        if (!isWwiseInstalled) { setShowGainDialog(false); setStatusMessage('Wwise tools required — install them first'); return; }
        if (!window.require) return;

        pushToHistory();
        setShowGainDialog(false);

        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');
        const os = window.require('os');
        const pathMod = window.require('path');

        // Collect all audio leaf nodes under (and including) the target
        const sourceTree = gainTargetPane === 'left' ? treeData : rightTreeData;
        const collectLeaves = (nodes, targetId, inside = false) => {
            const found = [];
            for (const n of nodes) {
                const hit = inside || n.id === targetId;
                if (hit && n.audioData) found.push({ id: n.id, data: n.audioData.data });
                if (n.children?.length) found.push(...collectLeaves(n.children, targetId, hit));
            }
            return found;
        };
        const audioNodes = collectLeaves(sourceTree, gainTargetNodeId);
        if (audioNodes.length === 0) { setStatusMessage('No audio nodes found under selection'); return; }

        setShowConvertOverlay(true);
        const tmpDir = os.tmpdir();
        const updates = new Map();
        try {
            for (let i = 0; i < audioNodes.length; i++) {
                const node = audioNodes[i];
                setConvertStatus(`Adjusting volume: ${i + 1} / ${audioNodes.length}`);
                const tmpWemPath = pathMod.join(tmpDir, `quartz_gain_${Date.now()}_${i}.wem`);
                fs.writeFileSync(tmpWemPath, Buffer.from(node.data));
                const result = await ipcRenderer.invoke('audio:amplify-wem', { inputWemPath: tmpWemPath, gainDb: gainDbNum });
                try { fs.unlinkSync(tmpWemPath); } catch (_) { }
                if (!result.success) { setStatusMessage(`Failed: ${result.error}`); return; }
                const newWem = new Uint8Array(fs.readFileSync(result.wemPath));
                try { fs.unlinkSync(result.wemPath); } catch (_) { }
                updates.set(node.id, newWem);
            }
            const setTreeDataFn = gainTargetPane === 'left' ? setTreeData : setRightTreeData;
            setTreeDataFn(prev => {
                const update = (nodes) => nodes.map(n => {
                    if (updates.has(n.id)) { const d = updates.get(n.id); return { ...n, audioData: { ...n.audioData, data: d, length: d.length } }; }
                    if (n.children) return { ...n, children: update(n.children) };
                    return n;
                });
                return update(prev);
            });
            const sign = gainDbNum > 0 ? '+' : '';
            setStatusMessage(`Applied ${sign}${gainDbNum} dB to ${audioNodes.length} audio file(s)`);
        } catch (err) {
            setStatusMessage(`Volume adjust error: ${err.message}`);
        } finally {
            setShowConvertOverlay(false);
            setConvertStatus('');
        }
    }, [gainDb, gainTargetNodeId, gainTargetPane, isWwiseInstalled, treeData, rightTreeData, setTreeData, setRightTreeData]);

    /**
     * Handle external file (from OS) dropped directly onto a tree node.
     * .wem → inject immediately. .wav/.mp3/.ogg → convert then inject.
     */
    const handleExternalFileDrop = useCallback(async (files, targetNodeId, pane) => {
        pushToHistory();
        // files = Array<{ path, name }>
        if (!window.require || !files?.length) return;
        const fs = window.require('fs');
        const CONVERT_EXTS = ['wav', 'mp3', 'ogg'];

        const needsConversion = files.some(f => CONVERT_EXTS.includes(f.name.toLowerCase().split('.').pop()));
        if (needsConversion && !isWwiseInstalled) {
            pendingConversion.current = { files, targetNodeId, pane, mode: 'replace' };
            setShowInstallModal(true);
            return;
        }

        // Collect all audio leaf node IDs under (and including) the target node
        const collectAudioLeaves = (nodes, targetId, inside = false) => {
            const ids = [];
            for (const n of nodes) {
                const hit = inside || n.id === targetId;
                if (hit && n.audioData) ids.push(n.id);
                if (n.children?.length) ids.push(...collectAudioLeaves(n.children, targetId, hit));
            }
            return ids;
        };
        const sourceTree = pane === 'left' ? treeData : rightTreeData;
        const audioNodeIds = collectAudioLeaves(sourceTree, targetNodeId);
        if (audioNodeIds.length === 0) {
            setStatusMessage('No audio entries found under target node');
            return;
        }

        // Process each file: read .wem directly or convert .wav/.mp3/.ogg
        const { ipcRenderer } = window.require('electron');
        setShowConvertOverlay(true);
        const wemDataArray = [];
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const ext = file.name.toLowerCase().split('.').pop();
                setConvertStatus(`Processing ${i + 1} / ${files.length}: ${file.name}`);
                if (ext === 'wem') {
                    wemDataArray.push(new Uint8Array(fs.readFileSync(file.path)));
                } else {
                    const result = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: file.path });
                    if (!result.success) { setStatusMessage(`Failed to convert ${file.name}: ${result.error}`); return; }
                    wemDataArray.push(new Uint8Array(fs.readFileSync(result.wemPath)));
                    try { fs.unlinkSync(result.wemPath); } catch (_) { }
                }
            }

            // Fisher-Yates shuffle the loaded WEM data
            const shuffled = [...wemDataArray];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            // Map each audio node to a shuffled file (cycling if more nodes than files)
            const assignments = new Map(audioNodeIds.map((id, i) => [id, shuffled[i % shuffled.length]]));

            const setTreeDataFn = pane === 'left' ? setTreeData : setRightTreeData;
            setTreeDataFn(prev => {
                const update = (nodes) => nodes.map(n => {
                    if (assignments.has(n.id)) {
                        const wemData = assignments.get(n.id);
                        return { ...n, audioData: { ...n.audioData, data: wemData, length: wemData.length } };
                    }
                    if (n.children) return { ...n, children: update(n.children) };
                    return n;
                });
                return update(prev);
            });

            setStatusMessage(`Assigned ${files.length} file(s) randomly across ${audioNodeIds.length} audio slot(s)`);
        } catch (err) {
            setStatusMessage(`Drop error: ${err.message}`);
        } finally {
            setShowConvertOverlay(false);
            setConvertStatus('');
        }
    }, [isWwiseInstalled, treeData, rightTreeData, setTreeData, setRightTreeData]);

    /**
     * Kick off Wwise tools installation, then resume a pending conversion.
     */
    const handleInstallWwise = useCallback(async () => {
        if (!window.require) return;
        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');

        setIsInstalling(true);
        setInstallProgress('Starting download...');

        const result = await ipcRenderer.invoke('wwise:install');

        setIsInstalling(false);
        if (!result.success) {
            setInstallProgress(`Failed: ${result.error}`);
            return;
        }

        setIsWwiseInstalled(true);
        setShowInstallModal(false);
        setInstallProgress('');

        // Resume pending conversion if one was queued
        if (!pendingConversion.current) return;
        const pending = pendingConversion.current;
        pendingConversion.current = null;

        if (pending.mode === 'replace') {
            // Inline convert+inject (bypasses stale isWwiseInstalled closure)
            const CONVERT_EXTS = ['wav', 'mp3', 'ogg'];
            const files = pending.files;
            setShowConvertOverlay(true);
            const wemDataArray = [];
            try {
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const ext = file.name.toLowerCase().split('.').pop();
                    setConvertStatus(`Processing ${i + 1} / ${files.length}: ${file.name}`);
                    if (ext === 'wem') {
                        wemDataArray.push(new Uint8Array(fs.readFileSync(file.path)));
                    } else if (CONVERT_EXTS.includes(ext)) {
                        const convResult = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: file.path });
                        if (!convResult.success) { setStatusMessage(`Failed: ${convResult.error}`); return; }
                        wemDataArray.push(new Uint8Array(fs.readFileSync(convResult.wemPath)));
                        try { fs.unlinkSync(convResult.wemPath); } catch (_) { }
                    }
                }
                if (wemDataArray.length === 0) return;

                // Collect audio leaves under target and assign shuffled files
                const collectLeaves = (nodes, targetId, inside = false) => {
                    const ids = [];
                    for (const n of nodes) {
                        const hit = inside || n.id === targetId;
                        if (hit && n.audioData) ids.push(n.id);
                        if (n.children?.length) ids.push(...collectLeaves(n.children, targetId, hit));
                    }
                    return ids;
                };
                const shuffled = [...wemDataArray];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                const setTreeDataFn = pending.pane === 'left' ? setTreeData : setRightTreeData;
                setTreeDataFn(prev => {
                    const audioIds = collectLeaves(prev, pending.targetNodeId);
                    const assignments = new Map(audioIds.map((id, i) => [id, shuffled[i % shuffled.length]]));
                    const update = (nodes) => nodes.map(n => {
                        if (assignments.has(n.id)) {
                            const wemData = assignments.get(n.id);
                            return { ...n, audioData: { ...n.audioData, data: wemData, length: wemData.length } };
                        }
                        if (n.children) return { ...n, children: update(n.children) };
                        return n;
                    });
                    return update(prev);
                });
                setStatusMessage(`Assigned ${files.length} file(s) randomly across audio slots`);
            } catch (err) {
                setStatusMessage(`Conversion error: ${err.message}`);
            } finally {
                setShowConvertOverlay(false);
                setConvertStatus('');
            }
        } else if (pending.mode === 'inject') {
            // Process multiple files for injection
            const files = pending.files;
            setShowConvertOverlay(true);
            try {
                const newAudioNodes = [];
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    setConvertStatus(`Converting ${i + 1} / ${files.length}: ${file.name}`);
                    const result = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: file.path });
                    if (!result.success) continue;

                    const wemData = new Uint8Array(fs.readFileSync(result.wemPath));
                    const baseName = path.basename(file.name, path.extname(file.name));
                    const audioId = Date.now() + i;

                    newAudioNodes.push({
                        id: `converted-${audioId}`,
                        name: `${baseName}.wem`,
                        audioData: { id: audioId, data: wemData, offset: 0, length: wemData.length },
                        children: []
                    });
                    try { fs.unlinkSync(result.wemPath); } catch (_) { }
                }

                if (newAudioNodes.length > 0) {
                    setRightTreeData(prev => {
                        const rootIdx = prev.findIndex(n => n.id === '__converted-root__');
                        if (rootIdx !== -1) {
                            const newTree = [...prev];
                            newTree[rootIdx] = { ...newTree[rootIdx], children: [...newTree[rootIdx].children, ...newAudioNodes] };
                            return newTree;
                        }
                        const rootNode = { id: '__converted-root__', name: 'Converted', audioData: null, isRoot: true, children: newAudioNodes };
                        return [rootNode, ...prev];
                    });
                    setRightExpandedNodes(prev => { const s = new Set(prev); s.add('__converted-root__'); return s; });
                }
            } catch (err) {
                console.error(err);
            } finally {
                setShowConvertOverlay(false);
                setConvertStatus('');
            }
        } else {
            // Legacy/Single file fallback
            await convertAndInjectToRightPane(pending.filePath, pending.fileName);
        }
    }, [convertAndInjectToRightPane, setTreeData, setRightTreeData]);

    // Persistent state
    const [history, setHistory] = useState(() => {
        const saved = localStorage.getItem('bnk-extract-history');
        return saved ? JSON.parse(saved) : [];
    });

    /**
     * Recursive tree filtering
     */
    const filterTree = useCallback((nodes, query) => {
        if (!query) return nodes;
        const lowerQuery = query.toLowerCase();

        return nodes.map(node => {
            const nodeMatch = node.name.toLowerCase().includes(lowerQuery);

            // If the node itself matches, we include it and all its children (unfiltered)
            if (nodeMatch) {
                return node;
            }

            // Otherwise, we see if any children match
            if (node.children) {
                const filteredChildren = filterTree(node.children, query);
                if (filteredChildren.length > 0) {
                    return { ...node, children: filteredChildren };
                }
            }

            return null;
        }).filter(Boolean);
    }, []);

    const filteredLeftTree = React.useMemo(() => filterTree(treeData, leftSearchDebounced), [treeData, leftSearchDebounced, filterTree]);

    const filteredRightTree = React.useMemo(() => {
        let data = [...rightTreeData];

        // Sorting logic
        if (rightSortMode !== 'none') {
            const sortNodes = (nodes) => {
                return [...nodes].map(node => {
                    if (node.children && node.children.length > 0) {
                        return { ...node, children: sortNodes(node.children) };
                    }
                    return node;
                }).sort((a, b) => {
                    const sizeA = a.audioData?.length || 0;
                    const sizeB = b.audioData?.length || 0;
                    if (rightSortMode === 'size-asc') return sizeA - sizeB;
                    if (rightSortMode === 'size-desc') return sizeB - sizeA;
                    return 0;
                });
            };
            data = sortNodes(data);
        }

        return filterTree(data, rightSearchDebounced);
    }, [rightTreeData, rightSearchDebounced, rightSortMode, filterTree]);

    // Store expansion state before search (Left)
    const leftPreSearchExpansion = useRef(null);

    // Auto-expand on search (Left)
    useEffect(() => {
        if (leftSearchDebounced) {
            // Starting a new search - save current expansion if not already saved
            if (leftPreSearchExpansion.current === null) {
                leftPreSearchExpansion.current = new Set(expandedNodes);
            }

            const expandMatches = (nodes, expansionSet, query) => {
                const lowerQuery = query.toLowerCase();

                const traverse = (list) => {
                    list.forEach(node => {
                        if (node.children && node.children.length > 0) {
                            const hasDescendantMatch = (n) => {
                                if (n.name.toLowerCase().includes(lowerQuery)) return true;
                                if (n.children) return n.children.some(hasDescendantMatch);
                                return false;
                            };

                            if (hasDescendantMatch(node)) {
                                expansionSet.add(node.id);
                                traverse(node.children);
                            }
                        }
                    });
                };
                traverse(nodes);
            };

            const nextLeft = new Set(expandedNodes);
            expandMatches(treeData, nextLeft, leftSearchDebounced);
            setExpandedNodes(nextLeft);
        } else {
            // Search cleared - restore pre-search expansion state
            if (leftPreSearchExpansion.current !== null) {
                setExpandedNodes(leftPreSearchExpansion.current);
                leftPreSearchExpansion.current = null;
            }
        }
    }, [leftSearchDebounced, treeData]);

    // Store expansion state before search (Right)
    const rightPreSearchExpansion = useRef(null);

    // Auto-expand on search (Right)
    useEffect(() => {
        if (rightSearchDebounced) {
            // Starting a new search - save current expansion if not already saved
            if (rightPreSearchExpansion.current === null) {
                rightPreSearchExpansion.current = new Set(rightExpandedNodes);
            }

            const expandMatches = (nodes, expansionSet, query) => {
                const lowerQuery = query.toLowerCase();

                const traverse = (list) => {
                    list.forEach(node => {
                        if (node.children && node.children.length > 0) {
                            const hasDescendantMatch = (n) => {
                                if (n.name.toLowerCase().includes(lowerQuery)) return true;
                                if (n.children) return n.children.some(hasDescendantMatch);
                                return false;
                            };

                            if (hasDescendantMatch(node)) {
                                expansionSet.add(node.id);
                                traverse(node.children);
                            }
                        }
                    });
                };
                traverse(nodes);
            };

            const nextRight = new Set(rightExpandedNodes);
            expandMatches(rightTreeData, nextRight, rightSearchDebounced);
            setRightExpandedNodes(nextRight);
        } else {
            // Search cleared - restore pre-search expansion state
            if (rightPreSearchExpansion.current !== null) {
                setRightExpandedNodes(rightPreSearchExpansion.current);
                rightPreSearchExpansion.current = null;
            }
        }
    }, [rightSearchDebounced, rightTreeData]);

    // Auto-load last used paths
    useEffect(() => {
        const lastPaths = localStorage.getItem('bnk-extract-last-paths');
        if (lastPaths) {
            try {
                const { bin, wpk, bnk } = JSON.parse(lastPaths);
                if (bin) setBinPath(bin);
                if (wpk) setWpkPath(wpk);
                if (bnk) setBnkPath(bnk);
            } catch (e) {
                console.error('[BnkExtract] Failed to load last paths:', e);
            }
        }
    }, []);

    // Save history to localStorage
    useEffect(() => {
        localStorage.setItem('bnk-extract-history', JSON.stringify(history));
    }, [history]);

    // Volume
    const [volume, setVolume] = useState(() => {
        const saved = localStorage.getItem('bnk-extract-volume');
        return saved !== null ? parseInt(saved, 10) : 100;
    });

    // Audio
    const audioContextRef = useRef(null);
    const currentSourceRef = useRef(null);
    const currentGainRef = useRef(null);
    const currentAudioRef = useRef(null);
    const codebookDataRef = useRef(null);

    // Save volume and update active streams
    useEffect(() => {
        localStorage.setItem('bnk-extract-volume', volume.toString());
        if (currentGainRef.current) {
            currentGainRef.current.gain.value = volume / 100;
        }
        if (currentAudioRef.current) {
            currentAudioRef.current.volume = volume / 100;
        }
    }, [volume]);


    // Load codebook data on mount
    useEffect(() => {
        const loadCodebook = async () => {
            console.log('[BnkExtract] Loading codebook...');

            try {
                // Try to load the codebook.bin from the app directory using fs
                if (window.require) {
                    const fs = window.require('fs');
                    const path = window.require('path');

                    // Get resources path (where extraResources files are in production)
                    let resourcesPath = null;
                    try {
                        const { ipcRenderer } = window.require('electron');
                        // Get resources path (where extraResources files are in production)
                        const resourcesPathResult = await ipcRenderer.invoke('getResourcesPath');
                        if (resourcesPathResult) {
                            resourcesPath = resourcesPathResult;
                        } else {
                            // Fallback: try to calculate resources path
                            const appPathResult = await ipcRenderer.invoke('getAppPath');
                            if (appPathResult) {
                                resourcesPath = path.join(appPathResult, '..', 'resources');
                            }
                        }
                    } catch (e) {
                        console.log('[BnkExtract] Could not get resources path via IPC:', e);
                    }

                    // Only check resources folder (for production testing)
                    const possiblePaths = [
                        resourcesPath ? path.join(resourcesPath, 'codebook.bin') : null,
                    ].filter(p => p !== null); // Remove null entries

                    console.log('[BnkExtract] Checking resources folder for codebook.bin, resourcesPath:', resourcesPath);

                    for (const codebookPath of possiblePaths) {
                        try {
                            if (fs.existsSync(codebookPath)) {
                                const data = fs.readFileSync(codebookPath);
                                codebookDataRef.current = new Uint8Array(data);
                                console.log('[BnkExtract] ✓ Loaded codebook from:', codebookPath, 'size:', data.length);
                                setStatusMessage('Codebook loaded - ready');
                                return;
                            }
                        } catch (e) {
                            // Try next path
                        }
                    }
                    console.log('[BnkExtract] No codebook found in resources folder');
                    console.warn('[BnkExtract] ✗ Could not load codebook from resources folder - audio playback will not work');
                    setStatusMessage('Warning: Codebook not found in resources - audio playback disabled');
                } else {
                    console.warn('[BnkExtract] ✗ Could not load codebook - window.require not available');
                    setStatusMessage('Warning: Codebook not found - audio playback disabled');
                }
            } catch (error) {
                console.warn('[BnkExtract] Could not load codebook:', error);
                setStatusMessage('Warning: Codebook load error');
            }
        };

        loadCodebook();
    }, []);


    /**
     * Stop audio
     */
    const stopAudio = useCallback(() => {
        if (currentSourceRef.current) {
            try {
                currentSourceRef.current.stop();
            } catch (e) {
                // Already stopped
            }
            currentSourceRef.current = null;
        }
        currentGainRef.current = null;
        currentAudioRef.current = null;
        setStatusMessage('Playback stopped');
    }, []);

    /**
     * Play audio
     */
    const playAudio = useCallback(async (node) => {
        if (!autoPlay || !node.audioData) return;

        stopAudio();

        try {
            setStatusMessage(`Playing ${node.name}...`);

            // Get audio data - check if it's already a playable format (WAV/OGG)
            const rawData = node.audioData.data;
            let audioData = null;
            let conversionNeeded = true;

            const nameLower = node.name.toLowerCase();
            if (nameLower.endsWith('.wav') || nameLower.endsWith('.ogg')) {
                // If it starts with RIFF (WAV) or OggS (OGG), bypass conversion
                const magic = String.fromCharCode(rawData[0], rawData[1], rawData[2], rawData[3]);
                if (magic === 'RIFF' || magic === 'OggS') {
                    audioData = rawData;
                    conversionNeeded = false;
                }
            }

            if (conversionNeeded) {
                // Try to convert WEM to OGG
                try {
                    audioData = wemToOgg(rawData, codebookDataRef.current);
                    if (!audioData || audioData.length === 0) {
                        throw new Error('Conversion result empty');
                    }
                } catch (e) {
                    console.warn('[BnkExtract] WEM conversion failed:', e.message);
                    setStatusMessage(`Cannot play: WEM format not yet decodable (${node.name})`);
                    return;
                }
            }

            // Create audio context
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }

            const audioCtx = audioContextRef.current;

            // Try Web Audio API first
            try {
                const arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                const source = audioCtx.createBufferSource();
                const gainNode = audioCtx.createGain();

                gainNode.gain.value = volume / 100;
                source.buffer = audioBuffer;

                source.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                source.start(0);
                currentSourceRef.current = source;
                currentGainRef.current = gainNode;

                source.onended = () => {
                    setStatusMessage('Ready');
                    currentGainRef.current = null;
                };
                return;
            } catch (decodeError) {
                console.warn('[BnkExtract] Web Audio decode failed, trying HTML5 Audio:', decodeError.message);
            }

            // Fallback: try HTML5 Audio with blob
            try {
                // Check if it's OGG or WAV based on header
                const isWav = audioData[0] === 0x52 && audioData[1] === 0x49 && audioData[2] === 0x46 && audioData[3] === 0x46;
                const mimeType = isWav ? 'audio/wav' : 'audio/ogg';

                const blob = new Blob([audioData], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const audio = new Audio();

                // Set up error handler before setting src
                audio.onerror = (e) => {
                    URL.revokeObjectURL(url);
                    setStatusMessage(`Cannot play: format not supported (${node.name})`);
                    console.warn('[BnkExtract] HTML5 Audio failed:', e);
                };

                audio.onended = () => {
                    URL.revokeObjectURL(url);
                    setStatusMessage('Ready');
                };

                audio.oncanplaythrough = () => {
                    audio.volume = volume / 100;
                    audio.play().catch(err => {
                        setStatusMessage(`Playback failed: ${err.message}`);
                    });
                };

                audio.src = url;
                currentAudioRef.current = audio;
                currentSourceRef.current = {
                    stop: () => {
                        audio.pause();
                        currentAudioRef.current = null;
                        URL.revokeObjectURL(url);
                    }
                };
            } catch (htmlAudioError) {
                setStatusMessage(`Cannot play audio: ${htmlAudioError.message}`);
            }
        } catch (error) {
            console.error('[BnkExtract] Playback error:', error);
            setStatusMessage(`Playback error: ${error.message}`);
        }
    }, [autoPlay, stopAudio, volume]);

    /**
     * Handle file selection
     */
    const handleSelectFile = useCallback(async (type) => {
        if (!window.require) return;

        const { ipcRenderer } = window.require('electron');

        let extensions = ['*'];
        let name = 'All Files';

        if (type === 'bnk') { extensions = ['bnk']; name = 'BNK Files'; }
        else if (type === 'wpk') { extensions = ['wpk', 'bnk']; name = 'Audio Files'; }
        else if (type === 'bin') { extensions = ['bin']; name = 'Bin Files'; }

        const filters = [{ name, extensions }, { name: 'All Files', extensions: ['*'] }];

        try {
            const result = await ipcRenderer.invoke('dialog:openFile', {
                properties: ['openFile'],
                filters,
            });

            if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                const filePath = result.filePaths[0];
                if (type === 'bnk') setBnkPath(filePath);
                else if (type === 'wpk') setWpkPath(filePath);
                else if (type === 'bin') setBinPath(filePath);
            }
        } catch (error) {
            console.error('[BnkExtract] File selection error:', error);
            setStatusMessage(`Error selecting file: ${error.message}`);
        }
    }, []);

    /**
     * Build tree structure with unique IDs
     */
    const buildTreeFromAudioFiles = useCallback((audioFiles, filePath) => {
        let idCounter = 0;

        const rootNode = {
            id: `root-${idCounter++}`,
            name: filePath,
            audioData: null,
            isRoot: true,
            originalAudioFiles: audioFiles,
            children: audioFiles.map(audio => ({
                id: `audio-${idCounter++}`,
                name: `${audio.id}.wem`,
                audioData: audio,
                children: [],
            })),
        };

        return [rootNode];
    }, []);

    /**
     * Parse audio files
     */
    const handleParseFiles = useCallback(async () => {
        if (!bnkPath && !wpkPath) {
            setStatusMessage('Please select at least a BNK or WPK file');
            return;
        }

        setIsLoading(true);
        setStatusMessage('Parsing files...');
        pushToHistory();

        try {
            if (!window.require) {
                throw new Error('File system access not available');
            }

            const fs = window.require('fs');

            // 1. Get event-to-wem mappings
            let stringHashes = [];
            if (binPath && bnkPath && fs.existsSync(binPath) && fs.existsSync(bnkPath)) {
                try {
                    const binData = fs.readFileSync(binPath);
                    const bnkData = fs.readFileSync(bnkPath);
                    const binStrings = parseBinFile(binData);
                    stringHashes = getEventMappings(binStrings, bnkData);
                    console.log(`[BnkExtract] Mapped ${stringHashes.length} events using BIN and Events BNK`);
                } catch (e) {
                    console.warn('[BnkExtract] Failed to map events via BNK:', e);
                    setStatusMessage('Warning: Enhanced mapping failed, falling back to direct mapping');
                }
            }

            // Fallback to direct BIN mapping if enhanced mapping didn't yield results or bnkPath missing
            if (stringHashes.length === 0 && binPath && fs.existsSync(binPath)) {
                try {
                    const binData = fs.readFileSync(binPath);
                    stringHashes = parseBinFile(binData);
                    console.log('[BnkExtract] Using direct mapping from BIN file');
                } catch (e) {
                    console.warn('[BnkExtract] Failed to parse BIN:', e);
                }
            }

            // 2. Parse Audio source (WPK/BNK)
            let wpkResult = null;
            if (wpkPath && fs.existsSync(wpkPath)) {
                const wpkData = fs.readFileSync(wpkPath);
                wpkResult = parseAudioFile(wpkData, wpkPath);
            }

            // 3. Parse BNK file as audio source if no WPK given
            let bnkResult = null;
            if (!wpkResult && bnkPath && fs.existsSync(bnkPath)) {
                const bnkData = fs.readFileSync(bnkPath);
                bnkResult = parseAudioFile(bnkData, bnkPath);
            }

            // Determine which audio files to use
            let finalAudioFiles = [];
            let fileCount = 0;
            let finalType = '';

            if (wpkResult) {
                finalAudioFiles = wpkResult.audioFiles;
                fileCount = wpkResult.fileCount;
                finalType = 'wpk';
            } else if (bnkResult) {
                finalAudioFiles = bnkResult.audioFiles;
                fileCount = bnkResult.fileCount;
                finalType = 'bnk';
            }

            if (wpkResult && bnkPath) {
                finalType = 'bnk+wpk';
            }

            const path = window.require('path');
            const sourceName = wpkPath ? path.basename(wpkPath) : (bnkPath ? path.basename(bnkPath) : 'root');
            const originalPath = wpkPath || bnkPath;

            // Group files using matched hashes
            const tree = groupAudioFiles(finalAudioFiles, stringHashes, sourceName);
            tree.isRoot = true;
            tree.originalPath = originalPath;
            tree.originalAudioFiles = finalAudioFiles; // Store flat list for saving without duplicates

            // Set data
            if (activePane === 'left') {
                pushToHistory();
                setParsedData({ audioFiles: finalAudioFiles, fileCount, type: finalType });
                setTreeData(prev => [...prev, tree]);
            } else {
                pushToHistory();
                setRightTreeData(prev => [...prev, tree]);
            }

            // Keep collapsed by default (removed auto-expand logic)

            // Save to "Last used"
            localStorage.setItem('bnk-extract-last-paths', JSON.stringify({ bin: binPath, wpk: wpkPath, bnk: bnkPath }));

            // Add to history if not duplicate
            const pathSet = { bin: binPath, wpk: wpkPath, bnk: bnkPath };
            const label = wpkPath ? path.basename(wpkPath) : (bnkPath ? path.basename(bnkPath) : 'Unnamed Bank');

            setHistory(prev => {
                // Remove if existing (to move to top)
                const filtered = prev.filter(h =>
                    h.paths.bin !== pathSet.bin ||
                    h.paths.wpk !== pathSet.wpk ||
                    h.paths.bnk !== pathSet.bnk
                );
                const newEntry = {
                    id: Date.now().toString(),
                    label,
                    paths: pathSet,
                    timestamp: Date.now()
                };
                return [newEntry, ...filtered].slice(0, 10); // Keep last 10
            });

            setStatusMessage(`Parsed ${fileCount} audio files (${finalType.toUpperCase()})`);
        } catch (error) {
            console.error('[BnkExtract] Parse error:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [bnkPath, wpkPath, binPath, activePane, parseBinFile, getEventMappings, parseAudioFile, groupAudioFiles]);

    /**
     * Clear specific tree
     */
    const handleClearPane = useCallback((pane) => {
        pushToHistory();
        if (pane === 'left') {
            setTreeData([]);
            setSelectedNodes(new Set());
            setExpandedNodes(new Set());
            setParsedData(null);
        } else {
            setRightTreeData([]);
            setRightSelectedNodes(new Set());
            setRightExpandedNodes(new Set());
        }
        setStatusMessage(`${pane.charAt(0).toUpperCase() + pane.slice(1)} pane cleared`);
    }, [pushToHistory]);

    /**
     * Handle node selection (matches bnk-extract-GUI behavior)
     */
    const handleNodeSelect = useCallback((node, ctrlKey, shiftKey, pane = 'left') => {
        const setSelection = pane === 'left' ? setSelectedNodes : setRightSelectedNodes;
        const currentTree = pane === 'left' ? filteredLeftTree : filteredRightTree;
        const currentExpanded = pane === 'left' ? expandedNodes : rightExpandedNodes;
        const lastId = lastSelectedId.pane === pane ? lastSelectedId.id : null;

        // Helper: Get all visible nodes in order (expanded children included)
        const getVisibleNodes = () => {
            const visible = [];
            const collect = (nodes) => {
                for (const n of nodes) {
                    visible.push(n.id);
                    if (currentExpanded.has(n.id) && n.children) {
                        collect(n.children);
                    }
                }
            };
            collect(currentTree);
            return visible;
        };

        if (ctrlKey && !shiftKey) {
            // Ctrl+Click: Toggle this item, keep others
            setSelection(prev => {
                const next = new Set(prev);
                if (next.has(node.id)) {
                    next.delete(node.id);
                } else {
                    next.add(node.id);
                }
                return next;
            });
            setLastSelectedId({ id: node.id, pane });
        } else if (shiftKey && lastId) {
            // Shift+Click: Select range from lastSelectedId to clicked item
            const visibleNodes = getVisibleNodes();
            const startIdx = visibleNodes.indexOf(lastId);
            const endIdx = visibleNodes.indexOf(node.id);

            if (startIdx !== -1 && endIdx !== -1) {
                const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
                const rangeIds = visibleNodes.slice(min, max + 1);

                if (ctrlKey) {
                    // Ctrl+Shift: Add range to existing selection
                    setSelection(prev => new Set([...prev, ...rangeIds]));
                } else {
                    // Shift only: Clear and select range
                    setSelection(new Set(rangeIds));
                }
            }
            // Don't update lastSelectedId on shift-click
        } else {
            // Normal click: Clear all, select this item only
            setSelection(new Set([node.id]));
            setLastSelectedId({ id: node.id, pane });
        }
    }, [lastSelectedId, filteredLeftTree, filteredRightTree, expandedNodes, rightExpandedNodes]);

    /**
     * Toggle node expansion
     */
    const handleToggleExpand = useCallback((nodeId, recursive = false, pane = 'left') => {
        const setExpansion = pane === 'left' ? setExpandedNodes : setRightExpandedNodes;
        const currentTree = pane === 'left' ? treeData : rightTreeData;

        setExpansion(prev => {
            const next = new Set(prev);
            const isExpanding = !next.has(nodeId);

            if (recursive) {
                const findNode = (nodes, id) => {
                    for (const n of nodes) {
                        if (n.id === id) return n;
                        if (n.children) {
                            const found = findNode(n.children, id);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                const targetNode = findNode(currentTree, nodeId);
                if (targetNode) {
                    const collectIds = (n, list) => {
                        if (n.children && n.children.length > 0) {
                            list.push(n.id);
                            n.children.forEach(c => collectIds(c, list));
                        }
                    };
                    const idsToChange = [];
                    collectIds(targetNode, idsToChange);
                    idsToChange.forEach(id => isExpanding ? next.add(id) : next.delete(id));
                }
            }

            if (isExpanding) next.add(nodeId);
            else next.delete(nodeId);
            return next;
        });
    }, [treeData, rightTreeData]);

    /**
     * Drop Replace Logic (Split View)
     * Replaces ALL nodes with the same audio ID to handle duplicates in the tree
     */
    const handleDropReplace = useCallback((sourceIds, targetId) => {
        pushToHistory();
        const ids = Array.isArray(sourceIds) ? sourceIds : [sourceIds];

        // Helper: Collect all audio leaf nodes under given IDs in the right tree
        const collectSourceAudio = (idList) => {
            const leaves = [];
            const collect = (nodes) => {
                for (const n of nodes) {
                    if (idList.includes(n.id)) {
                        const getLeaves = (node) => {
                            const res = [];
                            if (node.audioData) res.push(node);
                            if (node.children) node.children.forEach(c => res.push(...getLeaves(c)));
                            return res;
                        };
                        leaves.push(...getLeaves(n));
                    } else if (n.children) {
                        collect(n.children);
                    }
                }
            };
            collect(rightTreeData);
            return leaves;
        };

        const sourceNodes = collectSourceAudio(ids);
        if (sourceNodes.length === 0) return;

        // Helper: Collect all audio leaf nodes under targetId in the left tree
        const collectTargetLeaves = (nodes, tid, inside = false) => {
            const leaves = [];
            for (const n of nodes) {
                const hit = inside || n.id === tid;
                if (hit && n.audioData) leaves.push(n);
                if (n.children?.length) leaves.push(...collectTargetLeaves(n.children, tid, hit));
            }
            return leaves;
        };

        const targetAudioNodes = collectTargetLeaves(treeData, targetId);
        if (targetAudioNodes.length === 0) {
            setStatusMessage('No audio entries found under target node');
            return;
        }

        let replacedCount = 0;
        const updates = new Map();

        for (let i = 0; i < targetAudioNodes.length; i++) {
            const targetNode = targetAudioNodes[i];
            const sourceNode = sourceNodes[i % sourceNodes.length];
            const targetAudioId = targetNode.audioData.id;

            if (!updates.has(targetAudioId)) {
                updates.set(targetAudioId, sourceNode.audioData.data);
            }
        }

        setTreeData(prev => {
            const updateInTree = (nodes, inside = false) => nodes.map(n => {
                const isTargetOrDescendant = inside || n.id === targetId;

                if (isTargetOrDescendant && n.audioData && updates.has(n.audioData.id)) {
                    replacedCount++;
                    const newData = updates.get(n.audioData.id);
                    return {
                        ...n,
                        audioData: {
                            ...n.audioData,
                            data: newData,
                            length: newData.length
                        }
                    };
                }
                if (n.children) return { ...n, children: updateInTree(n.children, isTargetOrDescendant) };
                return n;
            });
            return updateInTree(prev);
        });

        setStatusMessage(`Replaced audio in ${replacedCount} instance(s) using ${sourceNodes.length} source file(s)`);
    }, [rightTreeData, treeData, pushToHistory]);

    /**
     * Handle WEM files dropped into right pane
     */
    const handleRightPaneFileDrop = useCallback(async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setRightPaneDragOver(false);

        if (!window.require) {
            setStatusMessage('Electron not available for file reading');
            return;
        }

        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');
        const path = window.require('path');

        // Get dropped files
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const AUDIO_EXTS = ['.wav', '.mp3', '.ogg'];
        const wemFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.wem'));
        const convertibleFiles = Array.from(files).filter(f =>
            AUDIO_EXTS.some(ext => f.name.toLowerCase().endsWith(ext))
        );

        // Handle convertible audio files (wav/mp3/ogg)
        if (wemFiles.length === 0 && convertibleFiles.length > 0) {
            if (!isWwiseInstalled) {
                pendingConversion.current = { files: convertibleFiles, mode: 'inject' };
                setShowInstallModal(true);
            } else {
                // Process all convertible files
                setShowConvertOverlay(true);
                try {
                    const newAudioNodes = [];
                    for (let i = 0; i < convertibleFiles.length; i++) {
                        const file = convertibleFiles[i];
                        setConvertStatus(`Converting ${i + 1} / ${convertibleFiles.length}: ${file.name}`);
                        const result = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: file.path });
                        if (!result.success) {
                            setStatusMessage(`Failed to convert ${file.name}: ${result.error}`);
                            continue;
                        }

                        const wemData = new Uint8Array(fs.readFileSync(result.wemPath));
                        const baseName = path.basename(file.name, path.extname(file.name));
                        const audioId = Date.now() + i;

                        newAudioNodes.push({
                            id: `converted-${audioId}`,
                            name: `${baseName}.wem`,
                            audioData: { id: audioId, data: wemData, offset: 0, length: wemData.length },
                            children: []
                        });

                        try { fs.unlinkSync(result.wemPath); } catch (_) { }
                    }

                    if (newAudioNodes.length > 0) {
                        setRightTreeData(prev => {
                            const rootIdx = prev.findIndex(n => n.id === '__converted-root__');
                            if (rootIdx !== -1) {
                                const newTree = [...prev];
                                newTree[rootIdx] = { ...newTree[rootIdx], children: [...newTree[rootIdx].children, ...newAudioNodes] };
                                return newTree;
                            }
                            const rootNode = { id: '__converted-root__', name: 'Converted', audioData: null, isRoot: true, children: newAudioNodes };
                            return [rootNode, ...prev];
                        });
                        setRightExpandedNodes(prev => { const s = new Set(prev); s.add('__converted-root__'); return s; });
                    }
                    setStatusMessage(`Converted and loaded ${convertibleFiles.length} audio file(s)`);
                } catch (err) {
                    setStatusMessage(`Conversion error: ${err.message}`);
                } finally {
                    setShowConvertOverlay(false);
                    setConvertStatus('');
                }
            }
            return;
        }

        if (wemFiles.length === 0) {
            setStatusMessage('Drop .wem, .wav, .mp3, or .ogg files here');
            return;
        }

        setStatusMessage(`Loading ${wemFiles.length} WEM file(s)...`);

        try {
            let idCounter = Date.now(); // Use timestamp as base for unique IDs
            const newNodes = [];

            for (const file of wemFiles) {
                try {
                    // Read file data - file.path gives us the full path in Electron
                    const filePath = file.path;
                    const fileData = fs.readFileSync(filePath);
                    const wemData = new Uint8Array(fileData);

                    // Create audio node
                    const audioId = idCounter++;
                    const audioNode = {
                        id: `dropped-${audioId}`,
                        name: file.name,
                        audioData: {
                            id: audioId,
                            data: wemData,
                            offset: 0,
                            length: wemData.length
                        },
                        children: []
                    };

                    newNodes.push(audioNode);
                } catch (err) {
                    console.error(`[BnkExtract] Failed to read ${file.name}:`, err);
                }
            }

            if (newNodes.length > 0) {
                setRightTreeData(prev => {
                    const rootIdx = prev.findIndex(n => n.id === '__converted-root__');
                    if (rootIdx !== -1) {
                        const newTree = [...prev];
                        newTree[rootIdx] = { ...newTree[rootIdx], children: [...newTree[rootIdx].children, ...newNodes] };
                        return newTree;
                    }
                    const rootNode = { id: '__converted-root__', name: 'Converted', audioData: null, isRoot: true, children: newNodes };
                    return [rootNode, ...prev];
                });
                setRightExpandedNodes(prev => { const s = new Set(prev); s.add('__converted-root__'); return s; });
                setStatusMessage(`Added ${newNodes.length} WEM file(s) to right pane`);
            }
        } catch (error) {
            console.error('[BnkExtract] File drop error:', error);
            setStatusMessage(`Error loading files: ${error.message}`);
        }
    }, [isWwiseInstalled, convertAndInjectToRightPane]);

    const handleRightPaneDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        // Check if files are being dragged (not internal tree nodes)
        if (e.dataTransfer?.types?.includes('Files')) {
            setRightPaneDragOver(true);
        }
    }, []);

    const handleRightPaneDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setRightPaneDragOver(false);
    }, []);

    /**
     * Play selected audio
     */
    const handlePlaySelected = useCallback(() => {
        const targetTree = activePane === 'left' ? treeData : rightTreeData;
        const targetSelection = activePane === 'left' ? selectedNodes : rightSelectedNodes;

        const allNodes = [];
        const collectNodes = (nodes) => {
            for (const node of nodes) {
                allNodes.push(node);
                if (node.children) collectNodes(node.children);
            }
        };
        collectNodes(targetTree);

        const selectedNode = allNodes.find(n => targetSelection.has(n.id) && n.audioData);
        if (selectedNode) {
            playAudio(selectedNode);
        }
    }, [treeData, rightTreeData, selectedNodes, rightSelectedNodes, activePane, playAudio]);

    /**
     * Extract selected files
     */
    const handleExtract = useCallback(async () => {
        const targetTree = activePane === 'left' ? treeData : rightTreeData;
        const targetSelection = activePane === 'left' ? selectedNodes : rightSelectedNodes;

        if (targetSelection.size === 0) {
            setStatusMessage('No selection in active pane');
            return;
        }

        if (!window.require) return;

        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');
        const path = window.require('path');

        const result = await ipcRenderer.invoke('dialog:openDirectory');

        if (!result || result.canceled || !result.filePaths?.length) return;

        const outputDir = result.filePaths[0];
        console.log(`[BnkExtract] Starting batch extraction to: ${outputDir}`);
        let extractedCount = 0;
        const needsWav = extractFormats.has('wav');
        const needsMp3 = extractFormats.has('mp3');
        const needsOgg = extractFormats.has('ogg');
        const needsWem = extractFormats.has('wem');

        const extractNode = async (node, currentPath, isRoot = false) => {
            const fs = window.require('fs');
            const path = window.require('path');

            const sanitizedName = node.name.replace(/[<>:"/\\|?*]/g, '_');
            const targetPath = isRoot ? currentPath : path.join(currentPath, sanitizedName);

            if (node.audioData) {
                const baseFilename = node.name.replace(/\.(wem|wav|ogg|mp3)$/i, '');
                const baseLower = node.name.toLowerCase();
                const isAlreadyPlayable = baseLower.endsWith('.wav') || baseLower.endsWith('.ogg');
                const rawData = node.audioData.data;

                // Extract as WEM (raw)
                if (needsWem) {
                    const wemExt = isAlreadyPlayable ? '' : '.wem';
                    const wemPath = path.join(currentPath, baseFilename + wemExt);
                    try {
                        fs.writeFileSync(wemPath, Buffer.from(rawData));
                        extractedCount++;
                    } catch (e) { }
                }

                // Extract as OGG
                if (needsOgg) {
                    try {
                        let finalData = null;
                        let finalExt = 'ogg';

                        if (isAlreadyPlayable) {
                            const magic = String.fromCharCode(rawData[0], rawData[1], rawData[2], rawData[3]);
                            if (magic === 'RIFF' || magic === 'OggS') {
                                finalData = rawData;
                                finalExt = magic === 'RIFF' ? 'wav' : 'ogg';
                            }
                        }

                        if (!finalData) {
                            const oggData = wemToOgg(rawData, codebookDataRef.current);
                            finalExt = oggData[0] === 0x52 && oggData[1] === 0x49 ? 'wav' : 'ogg';
                            finalData = oggData;
                        }

                        const oggPath = path.join(currentPath, `${baseFilename}.${finalExt}`);
                        fs.writeFileSync(oggPath, Buffer.from(finalData));
                        extractedCount++;
                    } catch (e) { }
                }

                // Extract as WAV (decoded PCM)
                if (needsWav) {
                    try {
                        const wavData = await wemToWav(rawData, codebookDataRef.current);
                        const wavPath = path.join(currentPath, `${baseFilename}.wav`);
                        fs.writeFileSync(wavPath, Buffer.from(wavData));
                        extractedCount++;
                    } catch (e) {
                        console.warn('[BnkExtract] WAV conversion failed for', baseFilename, e.message);
                    }
                }

                // Extract as MP3
                if (needsMp3) {
                    try {
                        const mp3Data = await wemToMp3(rawData, codebookDataRef.current, mp3Bitrate);
                        const mp3Path = path.join(currentPath, `${baseFilename}.mp3`);
                        fs.writeFileSync(mp3Path, Buffer.from(mp3Data));
                        extractedCount++;
                    } catch (e) {
                        console.warn('[BnkExtract] MP3 conversion failed for', baseFilename, e.message);
                    }
                }
            } else if (node.children && node.children.length > 0) {
                if (!isRoot && !fs.existsSync(targetPath)) {
                    fs.mkdirSync(targetPath, { recursive: true });
                }
                for (const child of node.children) {
                    await extractNode(child, isRoot ? currentPath : targetPath, false);
                }
            }
        };

        const allNodesMap = new Map();
        const collectAll = (nodes) => {
            for (const n of nodes) {
                allNodesMap.set(n.id, n);
                if (n.children) collectAll(n.children);
            }
        };
        collectAll(targetTree);

        const selectedIds = Array.from(targetSelection);
        const topSelectedNodes = selectedIds.filter(id => {
            const findAncestorSelected = (nodes, targetId) => {
                for (const n of nodes) {
                    if (n.id === targetId) return false;
                    if (targetSelection.has(n.id)) {
                        const isDescendant = (parent, tid) => {
                            if (!parent.children) return false;
                            for (const c of parent.children) {
                                if (c.id === tid) return true;
                                if (isDescendant(c, tid)) return true;
                            }
                            return false;
                        };
                        if (isDescendant(n, targetId)) return true;
                    }
                    if (n.children && findAncestorSelected(n.children, targetId)) return true;
                }
                return false;
            };
            return !findAncestorSelected(targetTree, id);
        }).map(id => allNodesMap.get(id));

        setIsLoading(true);
        setStatusMessage('Extracting...');
        try {
            for (const node of topSelectedNodes) {
                await extractNode(node, outputDir, false);
            }
            setStatusMessage(`Extracted ${extractedCount} file(s)`);
        } catch (err) {
            setStatusMessage(`Extract error: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [activePane, treeData, rightTreeData, selectedNodes, rightSelectedNodes, extractFormats, mp3Bitrate]);

    /**
     * Replace WEM data
     */
    const handleReplace = useCallback(async () => {
        const targetTree = activePane === 'left' ? treeData : rightTreeData;
        const targetSelection = activePane === 'left' ? selectedNodes : rightSelectedNodes;
        const setTreeDataFn = activePane === 'left' ? setTreeData : setRightTreeData;

        if (targetSelection.size === 0) {
            setStatusMessage('No selection in active pane');
            return;
        }

        if (!window.require) return;

        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');

        const result = await ipcRenderer.invoke('dialog:openFile', {
            title: 'Select Replacement WEM Files',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'WEM Files', extensions: ['wem'] }, { name: 'All Files', extensions: ['*'] }],
        });

        if (!result || result.canceled || !result.filePaths?.length) return;

        pushToHistory();
        const selectedAudioNodes = [];
        const processedIds = new Set();

        const collectSelectedAudio = (nodes, selSet, isParentSelected = false) => {
            for (const node of nodes) {
                const nodeSelected = selSet.has(node.id) || isParentSelected;
                if (nodeSelected && node.audioData && !processedIds.has(node.id)) {
                    selectedAudioNodes.push(node);
                    processedIds.add(node.id);
                }
                if (node.children) collectSelectedAudio(node.children, selSet, nodeSelected);
            }
        };

        collectSelectedAudio(targetTree, targetSelection);

        if (selectedAudioNodes.length === 0) {
            setStatusMessage('No audio files found in selection');
            return;
        }

        let replacedCount = 0;
        const replacementPaths = result.filePaths;

        setTreeDataFn(prev => {
            const updateInTree = (nodes) => nodes.map(n => {
                const match = selectedAudioNodes.find(an => an.id === n.id);
                if (match) {
                    try {
                        const fileIndex = selectedAudioNodes.indexOf(match) % replacementPaths.length;
                        const srcPath = replacementPaths[fileIndex];
                        console.log(`[BnkExtract] Replacing ${n.name} (ID: ${n.audioData?.id}) with: ${srcPath}`);
                        const newData = fs.readFileSync(srcPath);
                        replacedCount++;
                        return { ...n, audioData: { ...n.audioData, data: new Uint8Array(newData), length: newData.length } };
                    } catch (e) {
                        console.error(`[BnkExtract] Failed to replace ${n.name}:`, e);
                        return n;
                    }
                }
                if (n.children) return { ...n, children: updateInTree(n.children) };
                return n;
            });
            return updateInTree(prev);
        });

        setStatusMessage(`Replaced ${selectedAudioNodes.length} file(s) successfully`);
    }, [treeData, rightTreeData, selectedNodes, rightSelectedNodes, activePane, setTreeData, setRightTreeData]);

    /**
     * Make selection silent using silence.wem
     */
    const handleMakeSilent = useCallback(async () => {
        const targetTree = activePane === 'left' ? treeData : rightTreeData;
        const targetSelection = activePane === 'left' ? selectedNodes : rightSelectedNodes;
        const setTreeDataFn = activePane === 'left' ? setTreeData : setRightTreeData;

        if (targetSelection.size === 0) {
            setStatusMessage('No selection in active pane');
            return;
        }

        if (!window.require) return;

        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');
        const path = window.require('path');

        try {
            pushToHistory();
            // Resolve path to silence.wem
            let resourcesPath = null;
            const resourcesPathResult = await ipcRenderer.invoke('getResourcesPath');
            if (resourcesPathResult) {
                resourcesPath = resourcesPathResult;
            } else {
                const appPathResult = await ipcRenderer.invoke('getAppPath');
                if (appPathResult) {
                    resourcesPath = path.join(appPathResult, '..', 'resources');
                }
            }

            if (!resourcesPath) {
                setStatusMessage('Failed to locate app resources');
                return;
            }

            const silencePath = path.join(resourcesPath, 'silence.wem');
            if (!fs.existsSync(silencePath)) {
                // Try production fallback
                const prodSilencePath = path.join(resourcesPath, 'app', 'public', 'silence.wem');
                if (fs.existsSync(prodSilencePath)) {
                    const silenceData = new Uint8Array(fs.readFileSync(prodSilencePath));
                    applySilence(silenceData);
                    return;
                }

                setStatusMessage(`silence.wem not found at: ${silencePath}`);
                return;
            }

            const silenceData = new Uint8Array(fs.readFileSync(silencePath));
            applySilence(silenceData);

            function applySilence(data) {
                const selectedAudioNodes = [];
                const processedIds = new Set();
                const collectSelectedAudio = (nodes, selSet, isParentSelected = false) => {
                    for (const node of nodes) {
                        const nodeSelected = selSet.has(node.id) || isParentSelected;
                        if (nodeSelected && node.audioData && !processedIds.has(node.id)) {
                            selectedAudioNodes.push(node);
                            processedIds.add(node.id);
                        }
                        if (node.children) collectSelectedAudio(node.children, selSet, nodeSelected);
                    }
                };
                collectSelectedAudio(targetTree, targetSelection);

                if (selectedAudioNodes.length === 0) {
                    setStatusMessage('No audio files found in selection');
                    return;
                }

                let replacedCount = 0;
                setTreeDataFn(prev => {
                    const updateInTree = (nodes) => nodes.map(n => {
                        const match = selectedAudioNodes.find(an => an.id === n.id);
                        if (match) {
                            replacedCount++;
                            return { ...n, audioData: { ...n.audioData, data: data, length: data.length } };
                        }
                        if (n.children) return { ...n, children: updateInTree(n.children) };
                        return n;
                    });
                    return updateInTree(prev);
                });

                setStatusMessage(`Silenced ${selectedAudioNodes.length} file(s)`);
            }
        } catch (error) {
            console.error('[BnkExtract] Silence error:', error);
            setStatusMessage(`Error making silent: ${error.message}`);
        }
    }, [treeData, rightTreeData, selectedNodes, rightSelectedNodes, activePane, setTreeData, setRightTreeData]);

    /**
     * Save BNK/WPK file
     */
    const handleSave = useCallback(async () => {
        const targetTree = activePane === 'left' ? treeData : rightTreeData;
        const targetSelection = activePane === 'left' ? selectedNodes : rightSelectedNodes;

        const allNodes = [];
        const collectNodes = (nodes) => {
            for (const node of nodes) {
                allNodes.push(node);
                if (node.children) collectNodes(node.children);
            }
        };
        collectNodes(targetTree);

        const rootNode = allNodes.find(n => targetSelection.has(n.id) && n.isRoot);
        if (!rootNode) {
            setStatusMessage('Select a root node in active pane to save');
            return;
        }

        if (!window.require) return;

        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');

        const result = await ipcRenderer.invoke('dialog:saveFile', {
            defaultPath: rootNode.originalPath || rootNode.name,
            filters: [{ name: 'Audio Files', extensions: ['bnk', 'wpk'] }],
        });

        if (!result || result.canceled || !result.filePath) return;

        try {
            // Collect audio from tree - de-duplicate by ID to avoid duplicates
            // This captures any edits/replacements made to the audio data
            const audioFiles = [];
            const seenIds = new Set();
            const collectAudio = (n) => {
                if (n.audioData && !seenIds.has(n.audioData.id)) {
                    seenIds.add(n.audioData.id);
                    audioFiles.push(n.audioData);
                }
                if (n.children) n.children.forEach(collectAudio);
            };
            collectAudio(rootNode);

            if (audioFiles.length === 0) {
                setStatusMessage('No audio data found in this root');
                return;
            }

            console.log(`[BnkExtract] Saving ${audioFiles.length} audio files to: ${result.filePath}`);

            let outputData;
            if (result.filePath.toLowerCase().endsWith('.wpk')) {
                outputData = writeWpkFile(audioFiles);
            } else {
                outputData = writeBnkFile(audioFiles);
            }

            fs.writeFileSync(result.filePath, Buffer.from(outputData));
            setStatusMessage(`Saved ${audioFiles.length} files to ${result.filePath}`);
        } catch (error) {
            console.error('[BnkExtract] Save error:', error);
            setStatusMessage(`Save error: ${error.message}`);
        }
    }, [treeData, rightTreeData, selectedNodes, rightSelectedNodes, activePane]);

    /**
     * Context menu
     */
    const handleContextMenu = useCallback((e, node, pane = 'left') => {
        e.preventDefault();
        setContextMenu({
            mouseX: e.clientX,
            mouseY: e.clientY,
            node,
            pane
        });
    }, []);

    const handleCloseContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    /**
     * Delete node from tree
     */
    const handleDeleteNode = useCallback(() => {
        if (!contextMenu?.node) return;
        pushToHistory();
        const id = contextMenu.node.id;
        const pane = contextMenu.pane;
        const setTreeFn = pane === 'left' ? setTreeData : setRightTreeData;
        const setSelectionFn = pane === 'left' ? setSelectedNodes : setRightSelectedNodes;

        setTreeFn(prev => {
            const removeFromList = (list) => {
                return list
                    .filter(node => node.id !== id)
                    .map(node => ({
                        ...node,
                        children: node.children ? removeFromList(node.children) : node.children
                    }));
            };
            return removeFromList(prev);
        });

        setSelectionFn(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });

        setStatusMessage(`Removed ${contextMenu.node.name} from tree`);
        handleCloseContextMenu();
    }, [contextMenu, handleCloseContextMenu]);

    /**
     * Delete all selected nodes in active pane
     */
    const handleDeleteSelected = useCallback(() => {
        const pane = activePane;
        const selected = pane === 'left' ? selectedNodes : rightSelectedNodes;
        if (selected.size === 0) return;

        pushToHistory();
        const setTreeFn = pane === 'left' ? setTreeData : setRightTreeData;
        const setSelectionFn = pane === 'left' ? setSelectedNodes : setRightSelectedNodes;

        setTreeFn(prev => {
            const removeFromList = (list) => {
                return list
                    .filter(node => !selected.has(node.id))
                    .map(node => ({
                        ...node,
                        children: node.children ? removeFromList(node.children) : node.children
                    }));
            };
            return removeFromList(prev);
        });

        setSelectionFn(new Set());
        setStatusMessage(`Successfully removed ${selected.size} node(s) from tree`);
    }, [activePane, selectedNodes, rightSelectedNodes]);

    // Keyboard shortcuts
    useEffect(() => {
        const onKey = (e) => {
            // Ignore if typing in an input or if Audio Splitter is open
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || showAudioSplitter) return;

            if (e.code === 'Delete' || e.code === 'Backspace') {
                handleDeleteSelected();
            }
            if (e.code === 'Space') {
                e.preventDefault();
                handlePlaySelected();
            }
            if (e.ctrlKey && e.code === 'KeyZ') {
                e.preventDefault();
                handleUndo();
            }
            if (e.ctrlKey && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showAudioSplitter, handleDeleteSelected, handlePlaySelected, handleUndo, handleRedo]);

    /**
     * Copy node name to clipboard
     */
    const handleCopyName = useCallback(() => {
        if (contextMenu?.node) {
            navigator.clipboard.writeText(contextMenu.node.name);
            setStatusMessage('Copied to clipboard');
        }
        handleCloseContextMenu();
    }, [contextMenu, handleCloseContextMenu]);

    const handleOpenInSplitter = useCallback(async () => {
        const node = contextMenu?.node;
        handleCloseContextMenu();
        if (!node?.audioData) { setShowAudioSplitter(true); setSplitterInitialFile(null); return; }

        if (!isWwiseInstalled) {
            setStatusMessage('vgmstream required — install audio tools first');
            return;
        }

        setShowConvertOverlay(true);
        setConvertStatus('Decoding audio for splitter…');
        try {
            const { ipcRenderer } = window.require('electron');
            const fs = window.require('fs');
            const path = window.require('path');
            const os = window.require('os');

            const tmpDir = path.join(os.tmpdir(), 'QuartzSplitter');
            fs.mkdirSync(tmpDir, { recursive: true });
            const uid = Date.now();
            const wemTmp = path.join(tmpDir, `spl_${uid}.wem`);
            fs.writeFileSync(wemTmp, Buffer.from(node.audioData.data));

            const res = await ipcRenderer.invoke('audio:decode-to-wav', { inputPath: wemTmp });
            try { fs.unlinkSync(wemTmp); } catch (_) { }

            setShowConvertOverlay(false);
            if (!res.success) { setStatusMessage(`Splitter decode error: ${res.error}`); return; }

            setSplitterInitialFile({
                path: res.wavPath,
                name: (node.name || 'audio') + '.wav',
                nodeId: node.id,
                pane: contextMenu.pane,
                isWem: node.name.toLowerCase().endsWith('.wem')
            });
            setShowAudioSplitter(true);
        } catch (err) {
            setShowConvertOverlay(false);
            setStatusMessage(`Splitter error: ${err.message}`);
        }
    }, [contextMenu, handleCloseContextMenu, isWwiseInstalled]);

    const handleSplitterReplace = useCallback((newData, nodeId, pane) => {
        pushToHistory();
        const setTreeFn = pane === 'left' ? setTreeData : setRightTreeData;
        setTreeFn(prev => {
            const updateInTree = (nodes) => nodes.map(n => {
                if (n.id === nodeId) {
                    return { ...n, audioData: { ...n.audioData, data: newData, length: newData.length } };
                }
                if (n.children) return { ...n, children: updateInTree(n.children) };
                return n;
            });
            return updateInTree(prev);
        });
        setStatusMessage('Updated audio in tree from splitter');
    }, [setTreeData, setRightTreeData, pushToHistory]);

    /**
     * Handle segments exported from Audio Splitter
     */
    const handleSplitterExportSegments = useCallback(async (segments) => {
        if (!segments || segments.length === 0) return;
        if (!window.require) return;

        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');
        const path = window.require('path');
        const os = window.require('os');
        const tmpDir = path.join(os.tmpdir(), 'QuartzSplitter');
        fs.mkdirSync(tmpDir, { recursive: true });

        pushToHistory();
        setShowConvertOverlay(true);

        try {
            const timestamp = Date.now();
            const audioNodes = [];

            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                setConvertStatus(`Converting segment ${i + 1} / ${segments.length}: ${seg.name}`);

                // Write WAV to temp file
                const uid = `${timestamp}_${i}`;
                const tmpWav = path.join(tmpDir, `seg_${uid}.wav`);
                fs.writeFileSync(tmpWav, Buffer.from(seg.data));

                // Convert WAV → WEM
                const res = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: tmpWav });
                try { fs.unlinkSync(tmpWav); } catch (_) { }

                if (!res.success) {
                    console.warn(`[Splitter] Failed to convert ${seg.name}:`, res.error);
                    continue;
                }

                const wemData = new Uint8Array(fs.readFileSync(res.wemPath));
                try { fs.unlinkSync(res.wemPath); } catch (_) { }

                const baseName = seg.name.replace(/\.\w+$/, '');
                audioNodes.push({
                    id: `split-segment-${timestamp}-${i}`,
                    name: `${baseName}.wem`,
                    audioData: {
                        id: timestamp + i,
                        data: wemData,
                        offset: 0,
                        length: wemData.length
                    },
                    children: []
                });
            }

            if (audioNodes.length === 0) {
                setStatusMessage('No segments could be converted');
                return;
            }

            // Ensure split view is enabled so the user can see the results
            setViewMode('split');

            setRightTreeData(prev => {
                const rootIdx = prev.findIndex(n => n.id === '__split-segments-root__');
                if (rootIdx !== -1) {
                    const newTree = [...prev];
                    newTree[rootIdx] = {
                        ...newTree[rootIdx],
                        children: [...newTree[rootIdx].children, ...audioNodes]
                    };
                    return newTree;
                }
                const rootNode = {
                    id: '__split-segments-root__',
                    name: 'Split Segments',
                    audioData: null,
                    isRoot: true,
                    children: audioNodes
                };
                return [rootNode, ...prev];
            });

            setRightExpandedNodes(prev => {
                const s = new Set(prev);
                s.add('__split-segments-root__');
                return s;
            });

            setStatusMessage(`Converted and exported ${audioNodes.length} segment(s) to Reference Pane`);
        } catch (err) {
            setStatusMessage(`Export error: ${err.message}`);
        } finally {
            setShowConvertOverlay(false);
            setConvertStatus('');
        }
    }, [pushToHistory]);

    // Check if any audio node is selected
    // Check if any audio is part of current selection (recursive)
    const hasAudioSelection = useCallback(() => {
        const checkNodes = (nodes, selSet, isParentSelected = false) => {
            for (const node of nodes) {
                const nodeSelected = selSet.has(node.id) || isParentSelected;
                if (nodeSelected && node.audioData) return true;
                if (node.children && checkNodes(node.children, selSet, nodeSelected)) return true;
            }
            return false;
        };
        return checkNodes(treeData, selectedNodes) || checkNodes(rightTreeData, rightSelectedNodes);
    }, [treeData, rightTreeData, selectedNodes, rightSelectedNodes]);

    // Check if any root node is selected
    const hasRootSelection = useCallback(() => {
        return treeData.some(n => selectedNodes.has(n.id)) || rightTreeData.some(n => rightSelectedNodes.has(n.id));
    }, [treeData, rightTreeData, selectedNodes, rightSelectedNodes]);

    return (
        <Box className="bnk-extract-container" sx={containerStyle}>

            {/* ── Wwise Install Modal ── */}
            <Backdrop open={showInstallModal} sx={{ zIndex: 1400, backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.6)' }}>
                <Box sx={{
                    background: 'rgba(16,16,24,0.92)',
                    border: '1px solid rgba(var(--accent-rgb),0.35)',
                    borderRadius: '14px',
                    boxShadow: '0 8px 48px rgba(0,0,0,0.7)',
                    padding: '2rem 2.5rem',
                    maxWidth: 420,
                    width: '90%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    fontFamily: 'JetBrains Mono, monospace',
                }}>
                    <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em' }}>
                        Audio Conversion Tools
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                        Converting <strong style={{ color: 'var(--text)' }}>.wav / .mp3 / .ogg</strong> to WEM
                        requires the Wwise engine (~200 MB). Install it once to your AppData folder.
                    </Typography>

                    {isInstalling ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <LinearProgress sx={{ borderRadius: 4, height: 4, background: 'rgba(255,255,255,0.1)', '& .MuiLinearProgress-bar': { background: 'var(--accent)' } }} />
                            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>{installProgress}</Typography>
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <Button
                                onClick={() => { setShowInstallModal(false); pendingConversion.current = null; }}
                                sx={{ ...buttonStyle, fontSize: '0.75rem' }}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleInstallWwise}
                                variant="contained"
                                sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace', textTransform: 'none', background: 'var(--accent)', '&:hover': { background: 'var(--accent)', filter: 'brightness(1.15)' } }}
                            >
                                Install Wwise Tools
                            </Button>
                        </Box>
                    )}
                </Box>
            </Backdrop>

            {/* ── WEM Conversion Overlay ── */}
            <Backdrop open={showConvertOverlay} sx={{ zIndex: 1500, backdropFilter: 'blur(12px)', background: 'rgba(0,0,0,0.55)', flexDirection: 'column', gap: '1.25rem' }}>
                <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '1rem',
                    '@keyframes wwise-pulse': {
                        '0%': { opacity: 1, transform: 'scale(1)' },
                        '50%': { opacity: 0.55, transform: 'scale(0.92)' },
                        '100%': { opacity: 1, transform: 'scale(1)' },
                    },
                }}>
                    <CircularProgress size={48} sx={{ color: 'var(--accent)', animation: 'wwise-pulse 1.6s ease-in-out infinite' }} />
                    <Typography sx={{ fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)', letterSpacing: '0.1em', fontWeight: 600 }}>
                        Synthesizing WEM from Audio Source...
                    </Typography>
                    <Typography sx={{ fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.4)' }}>
                        {convertStatus}
                    </Typography>
                </Box>
            </Backdrop>

            {/* ── Gain / Volume Dialog ── */}
            <Backdrop open={showGainDialog} onClick={() => setShowGainDialog(false)} sx={{ zIndex: 1400, backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.55)' }}>
                <Box onClick={e => e.stopPropagation()} sx={{
                    background: 'rgba(16,16,24,0.95)',
                    border: '1px solid rgba(var(--accent-rgb),0.3)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
                    padding: '1.5rem 2rem',
                    width: 320,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    fontFamily: 'JetBrains Mono, monospace',
                }}>
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em' }}>
                        Adjust Volume
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                        Applies to <strong style={{ color: 'var(--text)' }}>{gainTargetNodeId ? 'selected node and all audio below it' : 'selection'}</strong>.<br />
                        Requires WEM → WAV → WEM re-encode (minor quality loss).
                    </Typography>

                    {/* dB Slider */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <Slider
                            min={-24} max={24} step={0.5}
                            value={parseFloat(gainDb) || 0}
                            onChange={(_, v) => setGainDb(String(v))}
                            sx={{
                                flex: 1,
                                color: 'var(--accent)',
                                '& .MuiSlider-thumb': { width: 14, height: 14 },
                                '& .MuiSlider-rail': { opacity: 0.2 },
                            }}
                        />
                        <TextField
                            value={gainDb}
                            onChange={e => setGainDb(e.target.value)}
                            size="small"
                            inputProps={{ style: { textAlign: 'center', width: 52, fontFamily: 'JetBrains Mono', fontSize: '0.8rem', padding: '4px 6px' } }}
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    background: 'rgba(0,0,0,0.3)',
                                    '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                                    '&:hover fieldset': { borderColor: 'var(--accent)' },
                                },
                                '& .MuiInputBase-input': { color: 'var(--text)' },
                            }}
                        />
                        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', minWidth: 20 }}>dB</Typography>
                    </Box>

                    {/* Quick presets */}
                    <Box sx={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {['-12', '-6', '-3', '+3', '+6', '+12'].map(v => (
                            <Button key={v} onClick={() => setGainDb(v.replace('+', ''))}
                                sx={{ ...compactButtonStyle, fontSize: '0.65rem', minWidth: 40, color: parseFloat(gainDb) === parseFloat(v) ? 'var(--accent)' : 'var(--text-2)', borderColor: parseFloat(gainDb) === parseFloat(v) ? 'var(--accent)' : 'rgba(255,255,255,0.1)' }}>
                                {v} dB
                            </Button>
                        ))}
                    </Box>

                    <Box sx={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <Button onClick={() => setShowGainDialog(false)} sx={{ ...buttonStyle, fontSize: '0.75rem' }}>Cancel</Button>
                        <Button onClick={handleApplyGain} variant="contained"
                            sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace', textTransform: 'none', background: 'var(--accent)', '&:hover': { filter: 'brightness(1.15)', background: 'var(--accent)' } }}>
                            Apply
                        </Button>
                    </Box>
                </Box>
            </Backdrop>

            {/* Header */}
            <Box className="bnk-extract-header" sx={headerStyle}>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 1 }}>
                    BNK EXTRACT
                    <Box component="span" sx={{ fontSize: '0.6rem', background: 'rgba(var(--accent-rgb), 0.2)', color: 'var(--accent)', px: 1, borderRadius: '4px', verticalAlign: 'middle' }}>
                        PRO
                    </Box>
                </Typography>

                <Box sx={{ flex: 1 }} />

                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mr: 2 }}>
                    <Tooltip title="Audio Splitter — cut audio into segments">
                        <Button
                            size="small"
                            onClick={() => { setSplitterInitialFile(null); setShowAudioSplitter(true); }}
                            sx={{
                                minWidth: '32px',
                                padding: '4px',
                                background: 'rgba(255,255,255,0.05)',
                                color: showAudioSplitter ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                '&:hover': { background: 'rgba(255,255,255,0.1)', color: 'var(--accent)' }
                            }}
                        >
                            <ContentCut sx={{ fontSize: 18 }} />
                        </Button>
                    </Tooltip>
                    <Tooltip title={viewMode === 'normal' ? "Switch to Split View" : "Switch to Single View"}>
                        <Button
                            size="small"
                            onClick={() => setViewMode(prev => prev === 'normal' ? 'split' : 'normal')}
                            sx={{
                                minWidth: '32px',
                                padding: '4px',
                                background: 'rgba(255,255,255,0.05)',
                                color: viewMode === 'split' ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                '&:hover': { background: 'rgba(255,255,255,0.1)' }
                            }}
                        >
                            {viewMode === 'normal' ? <ViewStream sx={{ fontSize: 18 }} /> : <VerticalSplit sx={{ fontSize: 18 }} />}
                        </Button>
                    </Tooltip>
                </Box>

                <Typography sx={{ fontSize: '0.65rem', opacity: 0.6, color: 'var(--text-2)' }}>
                    {statusMessage}
                </Typography>
            </Box>

            {/* Compact File Selection (Order matching original bnk-extract-GUI) */}
            <Box sx={{
                padding: '0.5rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                background: 'rgba(0, 0, 0, 0.2)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
                <Box sx={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {viewMode === 'split' && (
                        <Box sx={{ display: 'flex', background: 'rgba(0,0,0,0.3)', p: '2px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <Button
                                onClick={() => setActivePane('left')}
                                sx={{
                                    fontSize: '0.6rem',
                                    py: '2px',
                                    minWidth: '50px',
                                    background: activePane === 'left' ? 'var(--accent)' : 'transparent',
                                    color: activePane === 'left' ? 'black' : 'white',
                                    '&:hover': { background: activePane === 'left' ? 'var(--accent)' : 'rgba(255,255,255,0.1)' }
                                }}
                            >
                                LEFT
                            </Button>
                            <Button
                                onClick={() => setActivePane('right')}
                                sx={{
                                    fontSize: '0.6rem',
                                    py: '2px',
                                    minWidth: '50px',
                                    background: activePane === 'right' ? 'var(--accent)' : 'transparent',
                                    color: activePane === 'right' ? 'black' : 'white',
                                    '&:hover': { background: activePane === 'right' ? 'var(--accent)' : 'rgba(255,255,255,0.1)' }
                                }}
                            >
                                RIGHT
                            </Button>
                        </Box>
                    )}
                    {/* BIN File (Names) */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}>
                        <Tooltip title="Select BIN File (Event Names)">
                            <IconButton
                                size="small"
                                onClick={() => handleSelectFile('bin')}
                                sx={{
                                    color: binPath ? 'var(--accent)' : 'var(--text)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { background: 'rgba(var(--accent-rgb), 0.2)', borderColor: 'var(--accent)' }
                                }}
                            >
                                <FolderOpen sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                        <TextField
                            value={binPath}
                            onChange={(e) => setBinPath(e.target.value)}
                            placeholder="BIN File (Names)"
                            size="small"
                            sx={{ ...inputStyle, flex: 1 }}
                        />
                    </Box>

                    {/* Audio File (WPK/BNK) */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}>
                        <Tooltip title="Select Audio File (.wpk/.bnk)">
                            <IconButton
                                size="small"
                                onClick={() => handleSelectFile('wpk')}
                                sx={{
                                    color: wpkPath ? 'var(--accent)' : 'var(--text)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { background: 'rgba(var(--accent-rgb), 0.2)', borderColor: 'var(--accent)' }
                                }}
                            >
                                <FolderOpen sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                        <TextField
                            value={wpkPath}
                            onChange={(e) => setWpkPath(e.target.value)}
                            placeholder="Audio File (WPK/BNK)"
                            size="small"
                            sx={{ ...inputStyle, flex: 1 }}
                        />
                    </Box>

                    {/* Events File (BNK) */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}>
                        <Tooltip title="Select BNK File (Events Structure)">
                            <IconButton
                                size="small"
                                onClick={() => handleSelectFile('bnk')}
                                sx={{
                                    color: bnkPath ? 'var(--accent)' : 'var(--text)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { background: 'rgba(var(--accent-rgb), 0.2)', borderColor: 'var(--accent)' }
                                }}
                            >
                                <FolderOpen sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                        <TextField
                            value={bnkPath}
                            onChange={(e) => setBnkPath(e.target.value)}
                            placeholder="Events File (BNK)"
                            size="small"
                            sx={{ ...inputStyle, flex: 1 }}
                        />
                    </Box>

                    {/* Action Buttons */}
                    <Box sx={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        <Button
                            variant="contained"
                            size="small"
                            onClick={handleParseFiles}
                            disabled={isLoading || (!wpkPath && !bnkPath)}
                            startIcon={<Refresh sx={{ fontSize: 12 }} />}
                            sx={{
                                ...buttonStyle,
                                background: 'rgba(var(--accent-rgb), 0.25)',
                                color: 'var(--accent)',
                                fontWeight: 600
                            }}
                        >
                            Parse
                        </Button>
                        <Tooltip title="Clear tree">
                            <IconButton
                                size="small"
                                onClick={() => handleClearPane(viewMode === 'split' ? activePane : 'left')}
                                sx={{
                                    color: 'rgba(255,255,255,0.5)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { background: 'rgba(255, 80, 80, 0.2)', color: '#ff6666' }
                                }}
                            >
                                <Delete sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>

                        {viewMode === 'split' && (
                            <Tooltip title="Clear all trees">
                                <IconButton
                                    size="small"
                                    onClick={() => { handleClearPane('left'); handleClearPane('right'); }}
                                    sx={{
                                        color: 'rgba(255,255,255,0.5)',
                                        background: 'rgba(0, 0, 0, 0.3)',
                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                        borderRadius: '4px',
                                        padding: '4px',
                                        '&:hover': { background: 'rgba(255, 80, 80, 0.2)', color: '#ff6666' }
                                    }}
                                >
                                    <CompareArrows sx={{ fontSize: 14 }} />
                                </IconButton>
                            </Tooltip>
                        )}

                        <Tooltip title="Recent files">
                            <IconButton
                                size="small"
                                onClick={(e) => setHistoryAnchor(e.currentTarget)}
                                sx={{
                                    color: 'rgba(255,255,255,0.5)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { background: 'rgba(var(--accent-rgb), 0.2)', color: 'var(--accent)' }
                                }}
                            >
                                <History sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Mod Auto-Extract">
                            <IconButton
                                size="small"
                                onClick={() => setAutoExtractOpen(true)}
                                sx={{
                                    color: 'rgba(255,255,255,0.5)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { background: 'rgba(var(--accent-rgb), 0.2)', color: 'var(--accent)' }
                                }}
                            >
                                <AutoFixHigh sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
            </Box>



            <AutoExtractDialog
                open={autoExtractOpen}
                onClose={() => setAutoExtractOpen(false)}
                onProcess={async (data) => {
                    const { batchFiles, outputPath, loadToTree } = data;
                    console.log(`[BnkExtract] Starting batch process for ${batchFiles.length} mods. Output path: ${outputPath || 'None (Parse Only)'}`);

                    setIsLoading(true);
                    if (loadToTree !== false) pushToHistory();

                    // Small helper to yield the thread so UI can update/render
                    const yieldThread = () => new Promise(resolve => setTimeout(resolve, 50));

                    try {
                        const fs = window.require('fs');
                        const path = window.require('path');

                        let totalExtracted = 0;

                        for (const mod of batchFiles) {
                            const { bin, audio, events, modFolderName } = mod;
                            setStatusMessage(`Processing: ${modFolderName}...`);
                            await yieldThread();

                            // 1. Get String Hashes
                            let binStrings = [];
                            if (bin && fs.existsSync(bin)) {
                                const binData = fs.readFileSync(bin);
                                binStrings = parseBinFile(binData);
                            }

                            let stringHashes = [];
                            if (events && fs.existsSync(events)) {
                                const bnkData = fs.readFileSync(events);
                                stringHashes = getEventMappings(binStrings, bnkData);
                            } else {
                                stringHashes = binStrings;
                            }

                            // 2. Parse Audio
                            if (!audio || !fs.existsSync(audio)) continue;
                            const audioData = fs.readFileSync(audio);
                            const audioResult = parseAudioFile(audioData, audio);

                            const tree = groupAudioFiles(audioResult.audioFiles, stringHashes, modFolderName);
                            tree.isRoot = true;
                            tree.originalPath = audio; // Store the original WPK/BNK path for quick save
                            tree.originalAudioFiles = audioResult.audioFiles; // Store flat list for saving without duplicates

                            if (loadToTree !== false) {
                                if (activePane === 'left') {
                                    setTreeData(prev => [...prev, tree]);
                                } else {
                                    setRightTreeData(prev => [...prev, tree]);
                                }
                            }

                            // 3. Extract to mod-specific subfolder
                            if (outputPath) {
                                const modOutputDir = path.join(outputPath, modFolderName.replace(/[<>:"/\\|?*]/g, '_'));
                                if (!fs.existsSync(modOutputDir)) {
                                    fs.mkdirSync(modOutputDir, { recursive: true });
                                }

                                setStatusMessage(`Extracting: ${modFolderName}...`);
                                await yieldThread();

                                const extractAll = async (node, curPath, isR = false) => {
                                    const sanitized = node.name.replace(/[<>:"/\\|?*]/g, '_');
                                    const target = isR ? curPath : path.join(curPath, sanitized);

                                    if (node.audioData) {
                                        const base = node.name.replace('.wem', '');
                                        if (extractFormats.has('wem')) {
                                            fs.writeFileSync(path.join(curPath, `${base}.wem`), Buffer.from(node.audioData.data));
                                            totalExtracted++;
                                        }
                                        if (extractFormats.has('ogg')) {
                                            try {
                                                const oggData = wemToOgg(node.audioData.data, codebookDataRef.current);
                                                const ext = oggData[0] === 0x52 && oggData[1] === 0x49 ? 'wav' : 'ogg';
                                                fs.writeFileSync(path.join(curPath, `${base}.${ext}`), Buffer.from(oggData));
                                                totalExtracted++;
                                            } catch (e) { }
                                        }
                                        if (extractFormats.has('wav')) {
                                            try {
                                                const wavData = await wemToWav(node.audioData.data, codebookDataRef.current);
                                                fs.writeFileSync(path.join(curPath, `${base}.wav`), Buffer.from(wavData));
                                                totalExtracted++;
                                            } catch (e) { }
                                        }
                                        if (extractFormats.has('mp3')) {
                                            try {
                                                const mp3Data = await wemToMp3(node.audioData.data, codebookDataRef.current, mp3Bitrate);
                                                fs.writeFileSync(path.join(curPath, `${base}.mp3`), Buffer.from(mp3Data));
                                                totalExtracted++;
                                            } catch (e) { }
                                        }
                                    } else if (node.children) {
                                        if (!isR && !fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
                                        for (const c of node.children) {
                                            await extractAll(c, target);
                                        }
                                    }
                                };

                                await extractAll(tree, modOutputDir, true);
                            }
                        }

                        setStatusMessage(outputPath
                            ? `Successfully batch extracted ${totalExtracted} files.`
                            : `Successfully parsed ${batchFiles.length} mods into tree.`
                        );
                    } catch (e) {
                        console.error(e);
                        setStatusMessage(`Batch processing failed: ${e.message}`);
                    } finally {
                        setIsLoading(false);
                    }
                }}
            />

            <Menu
                anchorEl={historyAnchor}
                open={Boolean(historyAnchor)}
                onClose={() => setHistoryAnchor(null)}
                PaperProps={{
                    sx: {
                        background: 'rgba(30,30,35,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        backdropFilter: 'blur(10px)',
                        color: 'white',
                        maxWidth: '400px',
                        '& .MuiMenuItem-root': {
                            fontSize: '0.7rem',
                            fontFamily: 'JetBrains Mono, monospace',
                            py: 1,
                            '&:hover': { background: 'rgba(var(--accent-rgb), 0.2)' }
                        }
                    }
                }}
            >
                <Typography sx={{ px: 2, pt: 1, pb: 0.5, fontSize: '0.6rem', opacity: 0.5, letterSpacing: '0.1em' }}>
                    RECENT FILES
                </Typography>
                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 0.5 }} />
                {history.length === 0 ? (
                    <MenuItem disabled>No recent files</MenuItem>
                ) : (
                    history.map((entry) => (
                        <MenuItem
                            key={entry.id}
                            onClick={() => {
                                setBinPath(entry.paths.bin);
                                setWpkPath(entry.paths.wpk);
                                setBnkPath(entry.paths.bnk);
                                setHistoryAnchor(null);
                            }}
                        >
                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                <Typography sx={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
                                    {entry.label}
                                </Typography>
                                <Typography sx={{ fontSize: '0.6rem', opacity: 0.4 }}>
                                    {new Date(entry.timestamp).toLocaleString()}
                                </Typography>
                            </Box>
                        </MenuItem>
                    ))
                )}
                {history.length > 0 && (
                    <>
                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                        <MenuItem onClick={() => { setHistory([]); setHistoryAnchor(null); }} sx={{ color: '#ff6666' }}>
                            Clear History
                        </MenuItem>
                    </>
                )}
            </Menu>

            {isLoading && <LinearProgress sx={{ height: 2 }} />}

            <Backdrop
                sx={{
                    color: 'var(--accent)',
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    flexDirection: 'column',
                    gap: 2,
                    backdropFilter: 'blur(8px)',
                    background: 'rgba(0,0,0,0.7)'
                }}
                open={isLoading && autoExtractOpen === false} // Only show if we are actually processing beyond the dialog
            >
                <CircularProgress color="inherit" />
                <Typography sx={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem', color: 'white' }}>
                    {statusMessage}
                </Typography>
            </Backdrop>

            {/* Main Content */}
            <Box sx={mainContentStyle}>
                <Box className="bnk-extract-tree" sx={{
                    ...treeViewStyle,
                    border: viewMode === 'split' && activePane === 'left' ? '1px solid var(--accent)' : treeViewStyle.border,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {/* Pane Search */}
                    <Box sx={{ p: 1, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField
                            placeholder="Filter left..."
                            size="small"
                            variant="standard"
                            value={leftSearchQuery}
                            onChange={(e) => setLeftSearchQuery(e.target.value)}
                            InputProps={{
                                disableUnderline: true,
                                startAdornment: <Search sx={{ fontSize: 14, mr: 0.5, color: 'var(--accent)', opacity: 0.5 }} />,
                                endAdornment: leftSearchQuery && (
                                    <IconButton size="small" onClick={() => setLeftSearchQuery('')} sx={{ p: 0.2 }}>
                                        <Close sx={{ fontSize: 12, opacity: 0.5 }} />
                                    </IconButton>
                                )
                            }}
                            sx={{
                                flex: 1,
                                background: 'rgba(0,0,0,0.2)',
                                px: 1,
                                py: '2px',
                                borderRadius: '4px',
                                '& .MuiInputBase-input': { fontSize: '0.65rem', fontFamily: 'JetBrains Mono' }
                            }}
                        />
                        {leftSearchQuery && (
                            <Typography sx={{ fontSize: '0.55rem', color: 'var(--accent)', opacity: 0.5, fontWeight: 800 }}>{filteredLeftTree.length}</Typography>
                        )}
                    </Box>

                    <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }} onClick={() => { setSelectedNodes(new Set()); setLastSelectedId({ id: null, pane: 'left' }); }}>
                        {filteredLeftTree.length === 0 ? (
                            <Typography sx={{
                                textAlign: 'center',
                                marginTop: '3rem',
                                fontSize: '0.8rem',
                                color: 'rgba(255, 255, 255, 0.6)',
                                fontWeight: 500
                            }}>
                                {leftSearchQuery ? 'No matches' : 'Select a .bnk or .wpk file and click "Parse"'}
                            </Typography>
                        ) : (
                            filteredLeftTree.map((node, index) => (
                                <TreeNode
                                    key={node.id || index}
                                    node={node}
                                    level={0}
                                    selectedNodes={selectedNodes}
                                    onSelect={handleNodeSelect}
                                    onPlay={playAudio}
                                    onContextMenu={handleContextMenu}
                                    expandedNodes={expandedNodes}
                                    onToggleExpand={handleToggleExpand}
                                    pane="left"
                                    onDropReplace={handleDropReplace}
                                    onExternalFileDrop={handleExternalFileDrop}
                                />
                            ))
                        )}
                    </Box>

                    {viewMode === 'split' && (
                        <Box sx={{ position: 'absolute', top: 4, right: 8, zIndex: 5, pointerEvents: 'none' }}>
                            <Typography sx={{ fontSize: '0.6rem', color: 'var(--accent)', fontWeight: 800, opacity: 0.6 }}>MAIN BANK</Typography>
                        </Box>
                    )}
                </Box>

                {/* Right Tree View (Reference Banks) */}
                {viewMode === 'split' && (
                    <Box
                        className="bnk-extract-tree-right"
                        onDragOver={handleRightPaneDragOver}
                        onDragLeave={handleRightPaneDragLeave}
                        onDrop={handleRightPaneFileDrop}
                        sx={{
                            ...treeViewStyle,
                            marginLeft: 0,
                            border: rightPaneDragOver
                                ? '2px dashed var(--accent)'
                                : (activePane === 'right' ? '1px solid var(--accent)' : treeViewStyle.border),
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            background: rightPaneDragOver
                                ? 'rgba(var(--accent-rgb), 0.1)'
                                : treeViewStyle.background,
                            transition: 'all 0.2s ease'
                        }}
                    >
                        {/* Pane Search */}
                        <Box sx={{ p: 1, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TextField
                                placeholder="Filter right..."
                                size="small"
                                variant="standard"
                                value={rightSearchQuery}
                                onChange={(e) => setRightSearchQuery(e.target.value)}
                                InputProps={{
                                    disableUnderline: true,
                                    startAdornment: <Search sx={{ fontSize: 14, mr: 0.5, color: 'var(--accent)', opacity: 0.5 }} />,
                                    endAdornment: rightSearchQuery && (
                                        <IconButton size="small" onClick={() => setRightSearchQuery('')} sx={{ p: 0.2 }}>
                                            <Close sx={{ fontSize: 12, opacity: 0.5 }} />
                                        </IconButton>
                                    )
                                }}
                                sx={{
                                    flex: 1,
                                    background: 'rgba(0,0,0,0.2)',
                                    px: 1,
                                    py: '2px',
                                    borderRadius: '4px',
                                    '& .MuiInputBase-input': { fontSize: '0.65rem', fontFamily: 'JetBrains Mono' }
                                }}
                            />
                            <Tooltip title={`Sort by size: ${rightSortMode === 'none' ? 'None' : (rightSortMode === 'size-asc' ? 'Low to High' : 'High to Low')}`}>
                                <IconButton
                                    size="small"
                                    onClick={() => setRightSortMode(prev => prev === 'none' ? 'size-desc' : (prev === 'size-desc' ? 'size-asc' : 'none'))}
                                    sx={{
                                        color: rightSortMode !== 'none' ? 'var(--accent)' : 'rgba(255,255,255,0.3)',
                                        background: rightSortMode !== 'none' ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                                        p: '4px'
                                    }}
                                >
                                    <Sort sx={{ fontSize: 14, transform: rightSortMode === 'size-asc' ? 'scaleY(-1)' : 'none' }} />
                                </IconButton>
                            </Tooltip>
                            {rightSearchQuery && (
                                <Typography sx={{ fontSize: '0.55rem', color: 'var(--accent)', opacity: 0.5, fontWeight: 800 }}>{filteredRightTree.length}</Typography>
                            )}
                        </Box>

                        <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }} onClick={() => { setRightSelectedNodes(new Set()); setLastSelectedId({ id: null, pane: 'right' }); }}>
                            {filteredRightTree.length === 0 ? (
                                <Typography component="div" sx={{
                                    textAlign: 'center',
                                    marginTop: '3rem',
                                    fontSize: '0.8rem',
                                    color: 'rgba(255, 255, 255, 0.6)',
                                    fontWeight: 500
                                }}>
                                    {rightSearchQuery ? 'No matches' : (
                                        <>
                                            <Box sx={{ mb: 1, opacity: 0.6 }}>📁</Box>
                                            Drop .wem .wav .mp3 files here, autoconvert
                                            <Box sx={{ fontSize: '0.65rem', mt: 0.5, opacity: 0.5 }}>
                                                or load banks to drag replacement audio
                                            </Box>
                                        </>
                                    )}
                                </Typography>
                            ) : (
                                filteredRightTree.map((node, index) => (
                                    <TreeNode
                                        key={node.id || index}
                                        node={node}
                                        level={0}
                                        selectedNodes={rightSelectedNodes}
                                        onSelect={handleNodeSelect}
                                        onPlay={playAudio}
                                        onContextMenu={handleContextMenu}
                                        expandedNodes={rightExpandedNodes}
                                        onToggleExpand={handleToggleExpand}
                                        pane="right"
                                        onDropReplace={handleDropReplace}
                                        onExternalFileDrop={handleExternalFileDrop}
                                    />
                                ))
                            )}
                        </Box>

                        <Box sx={{ position: 'absolute', top: 4, right: 8, zIndex: 5, pointerEvents: 'none' }}>
                            <Typography sx={{ fontSize: '0.6rem', color: 'var(--accent)', fontWeight: 800, opacity: 0.6 }}>REFERENCE BANKS</Typography>
                        </Box>
                    </Box>
                )}

                {/* Sidebar */}
                <Box sx={sidebarStyle}>
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                        <Tooltip title="Undo (Ctrl+Z)">
                            <Button
                                fullWidth
                                variant="contained"
                                onClick={handleUndo}
                                disabled={undoStack.length === 0}
                                sx={{ ...compactButtonStyle, flex: 1, justifyContent: 'center', opacity: undoStack.length > 0 ? 1 : 0.3 }}
                            >
                                <Undo sx={{ fontSize: 16 }} />
                            </Button>
                        </Tooltip>
                        <Tooltip title="Redo (Ctrl+Y)">
                            <Button
                                fullWidth
                                variant="contained"
                                onClick={handleRedo}
                                disabled={redoStack.length === 0}
                                sx={{ ...compactButtonStyle, flex: 1, justifyContent: 'center', opacity: redoStack.length > 0 ? 1 : 0.3 }}
                            >
                                <Redo sx={{ fontSize: 16 }} />
                            </Button>
                        </Tooltip>
                    </Box>

                    <Button
                        variant="contained"
                        onClick={handleExtract}
                        disabled={selectedNodes.size === 0}
                        startIcon={<Download sx={{ fontSize: 12 }} />}
                        sx={{ ...buttonStyle, color: 'rgba(255, 255, 255, 0.9)' }}
                    >
                        Extract
                    </Button>

                    <Button
                        variant="contained"
                        onClick={handleReplace}
                        disabled={!hasAudioSelection()}
                        startIcon={<Upload sx={{ fontSize: 12 }} />}
                        sx={{ ...buttonStyle, color: 'rgba(255, 255, 255, 0.9)' }}
                    >
                        Replace
                    </Button>

                    <Button
                        variant="contained"
                        onClick={handleMakeSilent}
                        disabled={!hasAudioSelection()}
                        startIcon={<VolumeOff sx={{ fontSize: 12 }} />}
                        sx={{ ...buttonStyle, color: 'rgba(255, 255, 255, 0.9)' }}
                    >
                        Make Silent
                    </Button>

                    <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', margin: '0.25rem 0' }} />

                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={!hasRootSelection()}
                        startIcon={<Save sx={{ fontSize: 12 }} />}
                        sx={{ ...buttonStyle, color: 'rgba(255, 255, 255, 0.9)' }}
                    >
                        Save as BNK/WPK
                    </Button>

                    <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', margin: '0.25rem 0' }} />

                    <Button
                        variant="contained"
                        onClick={handlePlaySelected}
                        disabled={!hasAudioSelection()}
                        startIcon={<PlayArrow sx={{ fontSize: 12 }} />}
                        sx={{ ...buttonStyle, color: 'var(--accent)' }}
                    >
                        Play
                    </Button>

                    <Button
                        variant="contained"
                        onClick={stopAudio}
                        startIcon={<Stop sx={{ fontSize: 12 }} />}
                        sx={{ ...buttonStyle, color: 'rgba(255, 255, 255, 0.7)' }}
                    >
                        Stop
                    </Button>

                    <Box sx={{ mt: 'auto', pt: 2 }}>
                        <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', mb: 1.5 }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.75rem', px: 0.5 }}>
                            <VolumeUp sx={{ fontSize: 16, opacity: 0.6 }} />
                            <Slider
                                size="small"
                                value={volume}
                                onChange={(e, newValue) => setVolume(newValue)}
                                aria-label="Volume"
                                sx={{
                                    color: 'var(--accent)',
                                    '& .MuiSlider-thumb': {
                                        width: 12,
                                        height: 12,
                                        backgroundColor: 'var(--accent)',
                                        '&:hover, &.Mui-focusVisible': {
                                            boxShadow: '0 0 0 8px rgba(var(--accent-rgb), 0.16)',
                                        },
                                    },
                                    '& .MuiSlider-rail': {
                                        opacity: 0.2,
                                    },
                                }}
                            />
                        </Box>
                        <Typography sx={{ fontSize: '0.6rem', opacity: 0.4, textAlign: 'center', mt: 0.5 }}>
                            Volume: {volume}%
                        </Typography>
                    </Box>

                    <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', margin: '0.25rem 0' }} />

                    <Button
                        variant="contained"
                        onClick={() => setShowSettingsModal(true)}
                        startIcon={<Settings sx={{ fontSize: 12 }} />}
                        sx={{ ...buttonStyle, color: 'rgba(255, 255, 255, 0.6)' }}
                    >
                        Settings
                    </Button>
                </Box>
            </Box>

            {/* Context Menu */}
            <Menu
                open={contextMenu !== null}
                onClose={handleCloseContextMenu}
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
                <MenuItem onClick={() => { if (contextMenu?.node?.audioData) playAudio(contextMenu.node); handleCloseContextMenu(); }}>
                    <PlayArrow sx={{ fontSize: 14, marginRight: 1 }} /> Play audio
                </MenuItem>
                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
                <MenuItem onClick={handleExtract}>
                    <Download sx={{ fontSize: 14, marginRight: 1 }} /> Extract selection
                </MenuItem>
                <MenuItem onClick={handleReplace}>
                    <Upload sx={{ fontSize: 14, marginRight: 1 }} /> Replace wem data
                </MenuItem>
                <MenuItem onClick={handleMakeSilent}>
                    <VolumeOff sx={{ fontSize: 14, marginRight: 1 }} /> Make Silent
                </MenuItem>
                <MenuItem
                    onClick={() => {
                        setGainTargetNodeId(contextMenu?.node?.id ?? null);
                        setGainTargetPane(contextMenu?.pane ?? 'left');
                        handleCloseContextMenu();
                        setShowGainDialog(true);
                    }}
                    sx={{ opacity: isWwiseInstalled ? 1 : 0.45 }}
                >
                    <VolumeUp sx={{ fontSize: 14, marginRight: 1 }} /> Adjust Volume...
                    {!isWwiseInstalled && <Typography component="span" sx={{ fontSize: '0.6rem', ml: 'auto', color: 'rgba(255,255,255,0.3)' }}>needs tools</Typography>}
                </MenuItem>
                <MenuItem onClick={handleOpenInSplitter} sx={{ opacity: contextMenu?.node?.audioData && !isWwiseInstalled ? 0.45 : 1 }}>
                    <ContentCut sx={{ fontSize: 14, marginRight: 1 }} /> Open in Audio Splitter...
                    {contextMenu?.node?.audioData && !isWwiseInstalled && <Typography component="span" sx={{ fontSize: '0.6rem', ml: 'auto', color: 'rgba(255,255,255,0.3)' }}>needs tools</Typography>}
                </MenuItem>
                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
                <MenuItem onClick={handleDeleteNode} sx={{ color: '#ff6666 !important' }}>
                    <Delete sx={{ fontSize: 14, marginRight: 1 }} /> Remove from tree
                </MenuItem>
                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
                <MenuItem onClick={handleCopyName}>
                    <ContentCopy sx={{ fontSize: 14, marginRight: 1 }} /> Copy name
                </MenuItem>
            </Menu>

            {/* Settings Modal */}
            <Backdrop open={showSettingsModal} sx={{ zIndex: 1400, backdropFilter: 'blur(10px)', background: 'rgba(0,0,0,0.5)' }}>
                <Box sx={{
                    width: 420,
                    background: 'rgba(18, 18, 22, 0.97)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    padding: '2rem',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
                    fontFamily: 'JetBrains Mono, monospace',
                }}>
                    {/* Header */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Settings sx={{ fontSize: 20, color: 'var(--accent)', opacity: 0.8 }} />
                            <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em', fontFamily: 'JetBrains Mono' }}>
                                Extract Settings
                            </Typography>
                        </Box>
                        <IconButton onClick={() => setShowSettingsModal(false)} sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: 'rgba(255,255,255,0.8)' } }}>
                            <Close sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Box>

                    {/* Divider */}
                    <Box sx={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)', mb: 2 }} />

                    {/* Extraction Formats */}
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', mb: 1.2, fontFamily: 'JetBrains Mono' }}>
                        Export Formats
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', mb: 2 }}>
                        {[
                            { key: 'wem', label: '.wem', desc: 'Raw Wwise audio' },
                            { key: 'ogg', label: '.ogg', desc: 'Vorbis (fast)' },
                            { key: 'wav', label: '.wav', desc: 'PCM lossless' },
                            { key: 'mp3', label: '.mp3', desc: `Lossy ${mp3Bitrate}kbps` },
                        ].map(fmt => (
                            <Box
                                key={fmt.key}
                                onClick={() => {
                                    setExtractFormats(prev => {
                                        const next = new Set(prev);
                                        if (next.has(fmt.key)) next.delete(fmt.key);
                                        else next.add(fmt.key);
                                        localStorage.setItem('bnk-extract-formats', JSON.stringify([...next]));
                                        return next;
                                    });
                                }}
                                sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    padding: '0.75rem 0.5rem',
                                    borderRadius: '10px',
                                    border: extractFormats.has(fmt.key)
                                        ? '1px solid var(--accent)'
                                        : '1px solid rgba(255,255,255,0.08)',
                                    background: extractFormats.has(fmt.key)
                                        ? 'rgba(var(--accent-rgb), 0.12)'
                                        : 'rgba(255,255,255,0.02)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        background: extractFormats.has(fmt.key)
                                            ? 'rgba(var(--accent-rgb), 0.18)'
                                            : 'rgba(255,255,255,0.05)',
                                        borderColor: extractFormats.has(fmt.key)
                                            ? 'var(--accent)'
                                            : 'rgba(255,255,255,0.15)',
                                    },
                                }}
                            >
                                <Typography sx={{
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    color: extractFormats.has(fmt.key) ? 'var(--accent)' : 'rgba(255,255,255,0.5)',
                                    fontFamily: 'JetBrains Mono',
                                    transition: 'color 0.2s ease',
                                }}>
                                    {fmt.label}
                                </Typography>
                                <Typography sx={{
                                    fontSize: '0.6rem',
                                    color: extractFormats.has(fmt.key) ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)',
                                    fontFamily: 'JetBrains Mono',
                                    mt: 0.3,
                                }}>
                                    {fmt.desc}
                                </Typography>
                            </Box>
                        ))}
                    </Box>

                    {/* MP3 Bitrate - only show if mp3 is selected */}
                    {extractFormats.has('mp3') && (
                        <Box sx={{ mb: 2 }}>
                            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', mb: 0.8, fontFamily: 'JetBrains Mono' }}>
                                MP3 Bitrate
                            </Typography>
                            <Box sx={{ display: 'flex', gap: '0.4rem' }}>
                                {[64, 128, 192, 256, 320].map(rate => (
                                    <Box
                                        key={rate}
                                        onClick={() => {
                                            setMp3Bitrate(rate);
                                            localStorage.setItem('bnk-extract-mp3-bitrate', rate.toString());
                                        }}
                                        sx={{
                                            flex: 1,
                                            textAlign: 'center',
                                            padding: '0.35rem 0',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            border: mp3Bitrate === rate
                                                ? '1px solid var(--accent)'
                                                : '1px solid rgba(255,255,255,0.06)',
                                            background: mp3Bitrate === rate
                                                ? 'rgba(var(--accent-rgb), 0.12)'
                                                : 'rgba(255,255,255,0.02)',
                                            transition: 'all 0.15s ease',
                                            '&:hover': { borderColor: 'rgba(255,255,255,0.2)' },
                                        }}
                                    >
                                        <Typography sx={{
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            color: mp3Bitrate === rate ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                                            fontFamily: 'JetBrains Mono',
                                        }}>
                                            {rate}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    )}

                    {/* Divider */}
                    <Box sx={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)', mb: 2 }} />

                    {/* General */}
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', mb: 1, fontFamily: 'JetBrains Mono' }}>
                        General
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={autoPlay}
                                    onChange={(e) => setAutoPlay(e.target.checked)}
                                    size="small"
                                    sx={{ color: 'rgba(255,255,255,0.25)', '&.Mui-checked': { color: 'var(--accent)' }, padding: '4px 8px' }}
                                />
                            }
                            label={<Typography sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono', color: 'rgba(255,255,255,0.65)' }}>Autoplay on click</Typography>}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={multiSelect}
                                    onChange={(e) => setMultiSelect(e.target.checked)}
                                    size="small"
                                    sx={{ color: 'rgba(255,255,255,0.25)', '&.Mui-checked': { color: 'var(--accent)' }, padding: '4px 8px' }}
                                />
                            }
                            label={<Typography sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono', color: 'rgba(255,255,255,0.65)' }}>Multi-select enabled</Typography>}
                        />
                    </Box>

                    {/* Footer hint */}
                    <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', fontFamily: 'JetBrains Mono', textAlign: 'center' }}>
                            {extractFormats.size === 0 ? 'No formats selected — extraction disabled' : `Extracting as: ${[...extractFormats].map(f => '.' + f).join(', ')}`}
                        </Typography>
                    </Box>
                </Box>
            </Backdrop>

            {/* Audio Splitter overlay */}
            <AudioSplitter
                open={showAudioSplitter}
                onClose={() => setShowAudioSplitter(false)}
                initialFile={splitterInitialFile}
                onReplace={handleSplitterReplace}
                onExportSegments={handleSplitterExportSegments}
            />
        </Box>
    );
}