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
} from '@mui/icons-material';

import AutoExtractDialog from '../components/AutoExtractDialog';
import { getModFiles } from '../utils/modAutoProcessor';
import { parseAudioFile, parseBnkFile, parseWpkFile, writeBnkFile, writeWpkFile, fnv1Hash, parseBinFile, groupAudioFiles, getEventMappings } from '../utils/bnkParser';
import { wemToOgg } from '../utils/wemConverter';
import './BnkExtract.css';

// Styles
const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
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
    onDropReplace
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
        if (!isAudioFile) return;
        // Store node info in dataTransfer
        e.dataTransfer.setData('sourceNode', JSON.stringify({
            id: node.id,
            name: node.name,
            pane: pane
        }));
        // We also want to pass the actual audio data, but it might be too large for text
        // So we'll use a global ref or just the ID to look it up in the parent
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragOver = (e) => {
        if (!isAudioFile || pane === 'right') return; // Only drop on left audio files
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e) => {
        if (!isAudioFile || pane === 'right') return;
        e.preventDefault();
        setIsDragOver(false);
        const sourceData = e.dataTransfer.getData('sourceNode');
        if (sourceData) {
            try {
                const sourceInfo = JSON.parse(sourceData);
                if (sourceInfo.pane === 'right') {
                    onDropReplace(sourceInfo.id, node.id);
                }
            } catch (err) {
                console.error('[TreeNode] Drop failed:', err);
            }
        }
    };

    return (
        <Box
            draggable={isAudioFile}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <Box
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
                        textOverflow: 'ellipsis'
                    }}
                >
                    {node.name}
                </Typography>

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
    const [viewMode, setViewMode] = useState('normal'); // 'normal' | 'split'
    const [activePane, setActivePane] = useState('left');
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Ready');
    const [contextMenu, setContextMenu] = useState(null);
    const [rightTreeData, setRightTreeData] = useState([]);
    const [rightPaneDragOver, setRightPaneDragOver] = useState(false);

    // Settings
    const [autoPlay, setAutoPlay] = useState(true);
    const [extractAsWem, setExtractAsWem] = useState(true);
    const [extractAsOgg, setExtractAsOgg] = useState(true);
    const [multiSelect, setMultiSelect] = useState(true);
    const [settingsAnchor, setSettingsAnchor] = useState(null);
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
    const filteredRightTree = React.useMemo(() => filterTree(rightTreeData, rightSearchDebounced), [rightTreeData, rightSearchDebounced, filterTree]);

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

            // Get WEM data
            const wemData = node.audioData.data;
            let audioData = null;
            let conversionSucceeded = false;

            // Try to convert WEM to OGG
            try {
                audioData = wemToOgg(wemData, codebookDataRef.current);
                conversionSucceeded = true;
                console.log('[BnkExtract] WEM conversion succeeded, output size:', audioData.length);
            } catch (e) {
                console.warn('[BnkExtract] WEM conversion failed:', e.message);
                // We'll show a message but not crash
            }

            if (!conversionSucceeded || !audioData || audioData.length === 0) {
                setStatusMessage(`Cannot play: WEM format not yet decodable (${node.name})`);
                console.log('[BnkExtract] Audio playback skipped - conversion not available');
                return;
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
                setParsedData({ audioFiles: finalAudioFiles, fileCount, type: finalType });
                setTreeData(prev => [...prev, tree]);
            } else {
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
    }, []);

    /**
     * Handle node selection (matches bnk-extract-GUI behavior)
     */
    const handleNodeSelect = useCallback((node, ctrlKey, shiftKey, pane = 'left') => {
        const setSelection = pane === 'left' ? setSelectedNodes : setRightSelectedNodes;
        const currentTree = pane === 'left' ? treeData : rightTreeData;
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
    }, [lastSelectedId, treeData, rightTreeData, expandedNodes, rightExpandedNodes]);

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
    const handleDropReplace = useCallback((sourceId, targetId) => {
        // Find source node in right tree
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

        const sourceNode = findNode(rightTreeData, sourceId);
        if (!sourceNode || !sourceNode.audioData) return;

        // Find the target node to get its audio ID
        const targetNode = findNode(treeData, targetId);
        if (!targetNode || !targetNode.audioData) return;

        const targetAudioId = targetNode.audioData.id;
        let replacedCount = 0;

        // Update ALL nodes in main tree that have the same audioData.id
        // This ensures duplicates (same WEM in multiple events) all get updated
        setTreeData(prev => {
            const updateInTree = (nodes) => nodes.map(n => {
                // Check if this node has the same audio ID as the target
                if (n.audioData && n.audioData.id === targetAudioId) {
                    replacedCount++;
                    // Keep the target's id, offset, and other metadata - only swap the raw WEM data
                    return {
                        ...n,
                        audioData: {
                            ...n.audioData,
                            data: sourceNode.audioData.data,
                            length: sourceNode.audioData.data.length
                        }
                    };
                }
                if (n.children) {
                    return { ...n, children: updateInTree(n.children) };
                }
                return n;
            });
            return updateInTree(prev);
        });

        setStatusMessage(`Replaced ${replacedCount} instance(s) of ${targetAudioId}.wem with data from ${sourceNode.name}`);
    }, [rightTreeData, treeData]);

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

        const fs = window.require('fs');
        const path = window.require('path');

        // Get dropped files
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const wemFiles = Array.from(files).filter(f =>
            f.name.toLowerCase().endsWith('.wem')
        );

        if (wemFiles.length === 0) {
            setStatusMessage('No .wem files found in dropped files');
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
                // Create a container node for the dropped files or add directly
                const containerNode = {
                    id: `dropped-container-${Date.now()}`,
                    name: `Dropped Files (${newNodes.length})`,
                    audioData: null,
                    isRoot: true,
                    children: newNodes
                };

                setRightTreeData(prev => [...prev, containerNode]);

                // Auto-expand the new container
                setRightExpandedNodes(prev => {
                    const next = new Set(prev);
                    next.add(containerNode.id);
                    return next;
                });

                setStatusMessage(`Added ${newNodes.length} WEM file(s) to right pane`);
            }
        } catch (error) {
            console.error('[BnkExtract] File drop error:', error);
            setStatusMessage(`Error loading files: ${error.message}`);
        }
    }, []);

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

        const extractNode = (node, currentPath, isRoot = false) => {
            const fs = window.require('fs');
            const path = window.require('path');

            const sanitizedName = node.name.replace(/[<>:"/\\|?*]/g, '_');
            const targetPath = isRoot ? currentPath : path.join(currentPath, sanitizedName);

            if (node.audioData) {
                const baseFilename = node.name.replace('.wem', '');

                if (extractAsWem) {
                    const wemPath = path.join(currentPath, `${baseFilename}.wem`);
                    try {
                        console.log(`[BnkExtract] Writing WEM: ${wemPath}`);
                        fs.writeFileSync(wemPath, Buffer.from(node.audioData.data));
                        extractedCount++;
                    } catch (e) {
                        console.error(`[BnkExtract] Failed to write WEM ${wemPath}:`, e);
                    }
                }

                if (extractAsOgg) {
                    try {
                        const oggData = wemToOgg(node.audioData.data, codebookDataRef.current);
                        const ext = oggData[0] === 0x52 && oggData[1] === 0x49 ? 'wav' : 'ogg';
                        const oggPath = path.join(currentPath, `${baseFilename}.${ext}`);
                        console.log(`[BnkExtract] Writing ${ext.toUpperCase()}: ${oggPath}`);
                        fs.writeFileSync(oggPath, Buffer.from(oggData));
                        extractedCount++;
                    } catch (e) {
                        console.warn(`[BnkExtract] Failed to convert ${node.name}:`, e);
                    }
                }
            } else if (node.children && node.children.length > 0) {
                if (!isRoot && !fs.existsSync(targetPath)) {
                    fs.mkdirSync(targetPath, { recursive: true });
                }
                for (const child of node.children) {
                    extractNode(child, isRoot ? currentPath : targetPath, false);
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

        for (const node of topSelectedNodes) {
            extractNode(node, outputDir, false);
        }

        setStatusMessage(`Extracted ${extractedCount} file(s)`);
    }, [activePane, treeData, rightTreeData, selectedNodes, rightSelectedNodes, extractAsWem, extractAsOgg]);

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
    }, [treeData, rightTreeData, selectedNodes, rightSelectedNodes, activePane]);

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
        const { id, pane } = contextMenu;
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
     * Copy node name to clipboard
     */
    const handleCopyName = useCallback(() => {
        if (contextMenu?.node) {
            navigator.clipboard.writeText(contextMenu.node.name);
            setStatusMessage('Copied to clipboard');
        }
        handleCloseContextMenu();
    }, [contextMenu, handleCloseContextMenu]);

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

                                const extractAll = (node, curPath, isR = false) => {
                                    const sanitized = node.name.replace(/[<>:"/\\|?*]/g, '_');
                                    const target = isR ? curPath : path.join(curPath, sanitized);

                                    if (node.audioData) {
                                        const base = node.name.replace('.wem', '');
                                        if (extractAsWem) {
                                            fs.writeFileSync(path.join(curPath, `${base}.wem`), Buffer.from(node.audioData.data));
                                            totalExtracted++;
                                        }
                                        if (extractAsOgg) {
                                            try {
                                                const oggData = wemToOgg(node.audioData.data, codebookDataRef.current);
                                                const ext = oggData[0] === 0x52 && oggData[1] === 0x49 ? 'wav' : 'ogg';
                                                fs.writeFileSync(path.join(curPath, `${base}.${ext}`), Buffer.from(oggData));
                                                totalExtracted++;
                                            } catch (e) { }
                                        }
                                    } else if (node.children) {
                                        if (!isR && !fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
                                        node.children.forEach(c => extractAll(c, target));
                                    }
                                };

                                extractAll(tree, modOutputDir, true);
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
                            {rightSearchQuery && (
                                <Typography sx={{ fontSize: '0.55rem', color: 'var(--accent)', opacity: 0.5, fontWeight: 800 }}>{filteredRightTree.length}</Typography>
                            )}
                        </Box>

                        <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }} onClick={() => { setRightSelectedNodes(new Set()); setLastSelectedId({ id: null, pane: 'right' }); }}>
                            {filteredRightTree.length === 0 ? (
                                <Typography sx={{
                                    textAlign: 'center',
                                    marginTop: '3rem',
                                    fontSize: '0.8rem',
                                    color: 'rgba(255, 255, 255, 0.6)',
                                    fontWeight: 500
                                }}>
                                    {rightSearchQuery ? 'No matches' : (
                                        <>
                                            <Box sx={{ mb: 1, opacity: 0.6 }}>📁</Box>
                                            Drop .wem files here
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
                        onClick={(e) => setSettingsAnchor(e.currentTarget)}
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
                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
                <MenuItem onClick={handleDeleteNode} sx={{ color: '#ff6666 !important' }}>
                    <Delete sx={{ fontSize: 14, marginRight: 1 }} /> Remove from tree
                </MenuItem>
                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
                <MenuItem onClick={handleCopyName}>
                    <ContentCopy sx={{ fontSize: 14, marginRight: 1 }} /> Copy name
                </MenuItem>
            </Menu>

            {/* Settings Menu */}
            <Menu
                open={Boolean(settingsAnchor)}
                onClose={() => setSettingsAnchor(null)}
                anchorEl={settingsAnchor}
                PaperProps={{
                    sx: {
                        background: 'rgba(20, 20, 25, 0.95)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        padding: '0.5rem',
                    },
                }}
            >
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={autoPlay}
                            onChange={(e) => setAutoPlay(e.target.checked)}
                            size="small"
                            sx={{ color: 'var(--accent)', '&.Mui-checked': { color: 'var(--accent)' } }}
                        />
                    }
                    label={<Typography sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono' }}>Autoplay on click</Typography>}
                />
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={extractAsWem}
                            onChange={(e) => setExtractAsWem(e.target.checked)}
                            size="small"
                            sx={{ color: 'var(--accent)', '&.Mui-checked': { color: 'var(--accent)' } }}
                        />
                    }
                    label={<Typography sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono' }}>Extract as .wem</Typography>}
                />
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={extractAsOgg}
                            onChange={(e) => setExtractAsOgg(e.target.checked)}
                            size="small"
                            sx={{ color: 'var(--accent)', '&.Mui-checked': { color: 'var(--accent)' } }}
                        />
                    }
                    label={<Typography sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono' }}>Extract as .ogg</Typography>}
                />
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={multiSelect}
                            onChange={(e) => setMultiSelect(e.target.checked)}
                            size="small"
                            sx={{ color: 'var(--accent)', '&.Mui-checked': { color: 'var(--accent)' } }}
                        />
                    }
                    label={<Typography sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono' }}>Multi-select enabled</Typography>}
                />
            </Menu>
        </Box>
    );
}
