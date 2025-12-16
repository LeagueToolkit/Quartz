import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Tooltip,
    Button,
    TextField,
    Breadcrumbs,
    Link,
    CircularProgress,
    Menu,
    MenuItem,
    ListItemIcon,
    Divider
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
    Add,
    Close,
    Folder as FolderIcon,
    InsertDriveFile as FileIcon,
    ArrowUpward,
    ArrowBack,
    ArrowForward,
    Refresh,
    Search,
    GridView,
    ViewList,
    Image as ImageIcon,
    Description as DescriptionIcon,
    Code as CodeIcon,
    Terminal as TerminalIcon,
    OpenInNew,
    ColorLens
} from '@mui/icons-material';
import { ASSET_PREVIEW_EVENT } from '../utils/assetPreviewEvent';
import { convertTextureToPNG } from '../utils/textureConverter';

// Dynamically import electron modules
const electron = window.require ? window.require('electron') : null;
const { shell, clipboard } = electron || { shell: null, clipboard: null };
// Try to get remote for nativeImage (Main process API usually)
const remote = electron && (electron.remote || electron) ? (electron.remote || electron) : null;
const fs = window.require ? window.require('fs') : null;
const pathModule = window.require ? window.require('path') : null;

// Helper to format file size
const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

import { processDataURL } from '../utils/rgbaDataURL';

// Texture Conversion Queue (prevents UI freeze during scroll)
const textureQueue = {
    queue: [],
    isProcessing: false,

    add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.process();
        });
    },

    async process() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.queue.length > 0) {
            // Process usually LIFO (newest first) for UI responsiveness? 
            // Actually, IntersectionObserver already filters for visibility. 
            // We use FIFO to ensure order, but important: YIELD between tasks.
            const job = this.queue.shift();

            try {
                // Critical: Yield to event loop to allow UI updates/scrolling
                await new Promise(r => setTimeout(r, 16));

                if (job.task) {
                    const result = await job.task();
                    job.resolve(result);
                }
            } catch (e) {
                job.reject(e);
            }
        }
        this.isProcessing = false;
    }
};

const FileThumbnail = ({ item }) => {
    const [src, setSrc] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const containerRef = useRef(null);
    const mountedRef = useRef(true);

    // Lazy Load: Intersection Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect(); // Load once, then stop observing
                }
            },
            {
                rootMargin: '100px', // Start loading slightly before it comes into view
                threshold: 0.01
            }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => observer.disconnect();
    }, []);

    // Actual Content Loading
    useEffect(() => {
        if (!isVisible) return; // Don't load if not visible yet

        mountedRef.current = true;
        let active = true;

        const loadThumbnail = async () => {
            // 1. Standard Images (handled by nativeImage or FS read to bypass file:// restrictions)
            if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico'].includes(item.extension)) {
                let success = false;
                // Try native image loader first (cleanest relative to OS resolution)
                if (remote && remote.nativeImage && remote.nativeImage.createThumbnailFromPath) {
                    try {
                        const thumb = await remote.nativeImage.createThumbnailFromPath(item.path, { width: 64, height: 64 });
                        if (thumb && !thumb.isEmpty()) {
                            if (active && mountedRef.current) {
                                setSrc(thumb.toDataURL());
                                success = true;
                            }
                        }
                    } catch (err) { /* ignore */ }
                }

                // Fallback: Read file manually to base64
                if (!success && fs) {
                    try {
                        const data = fs.readFileSync(item.path);
                        const base64 = data.toString('base64');
                        const mime = item.extension === '.png' ? 'image/png' :
                            item.extension === '.jpg' || item.extension === '.jpeg' ? 'image/jpeg' :
                                item.extension === '.webp' ? 'image/webp' :
                                    item.extension === '.gif' ? 'image/gif' : 'image/png';

                        if (active && mountedRef.current) {
                            setSrc(`data:${mime};base64,${base64}`);
                            success = true;
                        }
                    } catch (e) { console.warn('Failed to read local image:', e); }
                }

                // Last Resort (legacy file:// - likely to be blocked)
                if (!success && active) {
                    setSrc(`file://${item.path.replace(/\\/g, '/')}`);
                }
            }
            // 2. Game Textures (TEX, DDS)
            else if (['.tex', '.dds'].includes(item.extension)) {
                setLoading(true);

                // Strategy A: Try Native Windows Thumbnail (via Electron)
                // This uses the OS shell extensions if the user has them installed (e.g. SageThumbs, Nvidia tools)
                let nativeSuccess = false;
                if (remote && remote.nativeImage && remote.nativeImage.createThumbnailFromPath) {
                    try {
                        const thumb = await remote.nativeImage.createThumbnailFromPath(item.path, { width: 64, height: 64 });
                        if (thumb && !thumb.isEmpty()) {
                            if (active && mountedRef.current) {
                                setSrc(thumb.toDataURL());
                                nativeSuccess = true;
                            }
                        }
                    } catch (nativeErr) {
                        // Native generation failed or not supported, proceed to fallback
                        // console.log("Native thumbnail failed, falling back to JS decoder", nativeErr);
                    }
                }

                // Strategy B: Fallback to Internal JS Decoder
                if (!nativeSuccess) {
                    try {
                        // Heavy conversion - run through queue to prevent UI freeze
                        const url = await textureQueue.add(async () => {
                            // Verification check right before execution
                            if (!active || !mountedRef.current) return null;
                            return await convertTextureToPNG(item.path);
                        });

                        if (active && mountedRef.current && url) {
                            const displayUrl = processDataURL(url);
                            setSrc(displayUrl);
                        }
                    } catch (e) {
                        // console.warn('Thumbnail load failed:', e);
                    }
                }

                if (active && mountedRef.current) setLoading(false);
            }
        };

        loadThumbnail();

        return () => {
            active = false;
            mountedRef.current = false;
        };
    }, [item.path, item.extension, isVisible]);

    if (src) {
        return (
            <Box
                ref={containerRef}
                sx={{
                    width: 64,
                    height: 64,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    borderRadius: '4px',
                    bgcolor: 'rgba(0,0,0,0.2)'
                }}
            >
                <img
                    src={src}
                    alt={item.name}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain'
                    }}
                />
            </Box>
        );
    }

    // Fallback Icon
    let icon = <FileIcon sx={{ fontSize: 40, color: '#cbd5e1' }} />;
    if (item.isDirectory) icon = <FolderIcon sx={{ fontSize: 40, color: '#fbbf24' }} />;
    else if (['.tex', '.dds'].includes(item.extension)) icon = <ImageIcon sx={{ fontSize: 40, color: '#ec4899' }} />; // Distinct color for game textures
    else {
        switch (item.extension) {
            case '.png': case '.jpg': case '.jpeg': case '.webp':
                icon = <ImageIcon sx={{ fontSize: 40, color: '#f472b6' }} />; break;
            case '.js': case '.jsx': case '.ts': case '.tsx': case '.json': case '.py':
                icon = <CodeIcon sx={{ fontSize: 40, color: '#60a5fa' }} />; break;
            case '.txt': case '.md':
                icon = <DescriptionIcon sx={{ fontSize: 40, color: '#94a3b8' }} />; break;
            case '.bin': case '.dll': case '.exe':
                icon = <TerminalIcon sx={{ fontSize: 40, color: '#a78bfa' }} />; break;
        }
    }

    return (
        <Box
            ref={containerRef}
            sx={{
                width: 64,
                height: 64,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
            }}>
            {loading && (
                <CircularProgress
                    size={20}
                    sx={{ position: 'absolute', color: 'var(--accent)' }}
                    thickness={5}
                />
            )}
            {icon}
        </Box>
    );
};

const os = window.require ? window.require('os') : null;

// Helper to shorten path text for display "Windows style"
const getShortPath = (fullPath) => {
    if (!fullPath) return '';
    // Handle both slash types
    const normalized = fullPath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);

    // If short enough, show full
    if (parts.length <= 4) return fullPath;

    // Show: Drive:\...\Last\Three\Segments
    // reconstructing with backslashes for Windows feel
    return `${parts[0]}\\...\\${parts.slice(-3).join('\\')}`;
};

const CustomExplorer = () => {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [currentPath, setCurrentPath] = useState('');
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [items, setItems] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [originalItems, setOriginalItems] = useState([]);
    const [mode, setMode] = useState('browser'); // 'browser' | 'bin'
    const ScrollContainerRef = useRef(null);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState(null);

    const handleContextMenu = (event, item) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 6,
            item: item
        });
    };

    const handleCloseContextMenu = () => {
        setContextMenu(null);
    };

    const handleOpenInExplorer = () => {
        if (contextMenu && contextMenu.item && shell) {
            if (pathModule) {
                const toAdd = contextMenu.item.isDirectory ? contextMenu.item.path : pathModule.dirname(contextMenu.item.path);
                addToRecent(toAdd);
            }
            shell.showItemInFolder(contextMenu.item.path);
        }
        handleCloseContextMenu();
    };

    const handleOpenInImgRecolor = () => {
        if (contextMenu && contextMenu.item && navigate) {
            const itemPath = contextMenu.item.path;
            const dirPath = pathModule ? pathModule.dirname(itemPath) : null;

            if (dirPath) addToRecent(dirPath);

            // Close modal then navigate
            setIsOpen(false);
            navigate('/img-recolor', {
                state: {
                    autoLoadPath: dirPath,
                    autoSelectFile: itemPath
                }
            });
        }
        handleCloseContextMenu();
    };

    // Search Logic
    useEffect(() => {
        if (!searchQuery) {
            if (originalItems.length > 0 && items.length !== originalItems.length) {
                setItems(originalItems);
            }
            return;
        }

        const lowerQuery = searchQuery.toLowerCase();
        const filtered = originalItems.filter(item => item.name.toLowerCase().includes(lowerQuery));
        setItems(filtered);
    }, [searchQuery, originalItems]); // Note: excluding 'items' to avoid loop, we drive from originalItems

    // Define Quick Access Links
    // Custom Quick Access State
    const [customQuickAccess, setCustomQuickAccess] = useState([]);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('divinelab_quick_access');
            if (saved) setCustomQuickAccess(JSON.parse(saved));
        } catch (e) { console.error(e); }
    }, []);

    const addToQuickAccess = () => {
        if (!currentPath) return;
        if (customQuickAccess.includes(currentPath)) return;

        const newAccess = [...customQuickAccess, currentPath];
        setCustomQuickAccess(newAccess);
        localStorage.setItem('divinelab_quick_access', JSON.stringify(newAccess));
    };

    const removeFromQuickAccess = (pathToRemove) => {
        const newAccess = customQuickAccess.filter(p => p !== pathToRemove);
        setCustomQuickAccess(newAccess);
        localStorage.setItem('divinelab_quick_access', JSON.stringify(newAccess));
    };

    // Define Quick Access Links
    const DefaultQuickLinks = [
        { name: 'Desktop', path: pathModule && os ? pathModule.join(os.homedir(), 'Desktop') : null, icon: <FolderIcon /> },
        { name: 'Documents', path: pathModule && os ? pathModule.join(os.homedir(), 'Documents') : null, icon: <FolderIcon /> },
        { name: 'Downloads', path: pathModule && os ? pathModule.join(os.homedir(), 'Downloads') : null, icon: <FolderIcon /> },
    ];

    const QuickLinks = [
        ...DefaultQuickLinks,
        ...customQuickAccess.map(p => ({
            name: pathModule ? pathModule.basename(p) : p,
            path: p,
            icon: <FolderIcon />,
            isCustom: true
        }))
    ];

    // Initial load handler
    useEffect(() => {
        const handleOpen = (event) => {
            const { path, mode: newMode } = event.detail;

            const effectiveMode = newMode || 'browser';
            setMode(effectiveMode);

            // Determine directory and initial selection
            let dirToOpen = path;
            let fileToSelect = null;

            if (!path) {
                // Default to Desktop if no path provided
                if (os && pathModule) {
                    dirToOpen = pathModule.join(os.homedir(), 'Desktop');
                }
            } else if (fs) {
                // If path is a file, open its directory
                // If it's a directory, open it directly
                try {
                    if (fs.existsSync(path)) {
                        const stats = fs.statSync(path);
                        if (stats.isFile()) {
                            dirToOpen = pathModule.dirname(path);
                            fileToSelect = pathModule.basename(path);
                        }
                    } else {
                        // Path might not exist, but let's try to infer if it has extension
                        if (pathModule.extname(path)) {
                            dirToOpen = pathModule.dirname(path);
                        }
                    }
                } catch (e) { console.error(e); }
            }

            if (dirToOpen) {
                setIsOpen(true);
                navigateTo(dirToOpen, true, effectiveMode);

                if (fileToSelect) {
                    setSelectedItem(fileToSelect);
                }
            }
        };

        window.addEventListener(ASSET_PREVIEW_EVENT, handleOpen);

        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) setIsOpen(false);
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener(ASSET_PREVIEW_EVENT, handleOpen);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    // Scroll to selected item AND fix selection case
    useEffect(() => {
        if (selectedItem && items.length > 0) {
            // Find the actual item name matching the selected one (case-insensitive for Windows robustness)
            const matchedItem = items.find(
                item => item.name.toLowerCase() === selectedItem.toLowerCase()
            );

            if (matchedItem) {
                // Fix Highlighting: Ensure state matches exact file case
                if (matchedItem.name !== selectedItem) {
                    setSelectedItem(matchedItem.name);
                }

                // Use a small timeout to allow layout/animations to settle
                setTimeout(() => {
                    const element = document.getElementById(`file-item-${matchedItem.name}`);
                    if (element) {
                        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }
                }, 100);
            }
        }
    }, [items, selectedItem]); // Rerun if items load or selection changes

    const [recentFolders, setRecentFolders] = useState([]);

    // Helper to determine if current mode is bin-related
    // This ensures specific modes (like port, vfxhub, bineditor) all share the "Recent Bins" list
    const isBinMode = (m) => ['bin', 'bineditor-bin', 'port-target', 'port-donor', 'vfxhub-target', 'paint-bin'].includes(m);

    // Load Recents based on Mode
    useEffect(() => {
        try {
            const key = isBinMode(mode) ? 'divinelab_recent_bins' : 'divinelab_recent_folders';
            const saved = localStorage.getItem(key);
            if (saved) {
                setRecentFolders(JSON.parse(saved));
            } else {
                setRecentFolders([]);
            }
        } catch (e) {
            console.error('Failed to load recents', e);
            setRecentFolders([]);
        }
    }, [mode, isOpen]); // Reload when mode changes or modal opens

    const addToRecent = (path, modeOverride = null) => {
        if (!path) return;
        const targetMode = modeOverride || mode;
        const key = isBinMode(targetMode) ? 'divinelab_recent_bins' : 'divinelab_recent_folders';
        const isCurrentMode = !modeOverride || modeOverride === mode;

        if (isCurrentMode) {
            setRecentFolders(prev => {
                const newRecent = prev.filter(p => p !== path);
                newRecent.unshift(path); // Add to top
                const limited = newRecent.slice(0, 10); // Keep max 10
                localStorage.setItem(key, JSON.stringify(limited));
                return limited;
            });
        } else {
            // Update storage directly without touching state (prevents stash/pop issues during mode transition)
            try {
                const saved = localStorage.getItem(key);
                let list = saved ? JSON.parse(saved) : [];
                list = list.filter(p => p !== path);
                list.unshift(path);
                const limited = list.slice(0, 10);
                localStorage.setItem(key, JSON.stringify(limited));
            } catch (e) { console.error(e); }
        }
    };

    const removeFromRecent = (pathToRemove) => {
        const key = isBinMode(mode) ? 'divinelab_recent_bins' : 'divinelab_recent_folders';
        setRecentFolders(prev => {
            const newRecent = prev.filter(p => p !== pathToRemove);
            localStorage.setItem(key, JSON.stringify(newRecent));
            return newRecent;
        });
    };

    // Navigation Logic
    const navigateTo = (newPath, resetHistory = false, overrideMode = null) => {
        if (!fs || !pathModule) return;
        const currentMode = overrideMode || mode;

        // Auto-add to recent folders (unless we are in a Bin mode where we track files instead)
        if (!isBinMode(currentMode)) {
            addToRecent(newPath, currentMode);
        }

        try {
            setLoading(true);
            setError(null);

            // Read Directory
            const dirents = fs.readdirSync(newPath, { withFileTypes: true });

            let fileItems = dirents.map(dirent => {
                try {
                    const fullPath = pathModule.join(newPath, dirent.name);
                    const stats = fs.statSync(fullPath);
                    return {
                        name: dirent.name,
                        path: fullPath,
                        isDirectory: dirent.isDirectory(),
                        size: stats.size,
                        modified: stats.mtime,
                        extension: pathModule.extname(dirent.name).toLowerCase()
                    };
                } catch (e) {
                    return null;
                }
            }).filter(Boolean);

            // Filter for Mode
            if (currentMode === 'bin') {
                fileItems = fileItems.filter(item => item.isDirectory || item.extension === '.bin');
            }

            // Sort: Folders first, then items alpha
            fileItems.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });

            setItems(fileItems);
            setOriginalItems(fileItems);
            setCurrentPath(newPath);
            setSearchQuery(''); // Clear search on nav
            // Don't null selectedItem if we are just reloading the same dir (e.g. initial load)
            // But if navigating to NEW path, we usually clear it. 
            // The initial load handler forces setSelectedItem AFTER calling navigateTo, so we are safe to clear here for nav clicks.
            if (resetHistory) {
                // Initial load or hard reset
                setHistory([newPath]);
                setHistoryIndex(0);
                // Note: We do NOT clear selectedItem here because the caller (handleOpen) sets it immediately after
            } else {
                setSelectedItem(null); // Normal navigation clears selection
            }

        } catch (err) {
            console.error("Failed to load directory:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleHistoryNav = (direction) => {
        const newIndex = historyIndex + direction;
        if (newIndex >= 0 && newIndex < history.length) {
            setHistoryIndex(newIndex);
            navigateTo(history[newIndex], false);
        }
    };

    const handleNavigateRequest = (path) => {
        if (path === currentPath) return;
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(path);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        navigateTo(path, false);
    };

    const handleUp = () => {
        if (!currentPath || !pathModule) return;
        const parent = pathModule.dirname(currentPath);
        if (parent && parent !== currentPath) {
            handleNavigateRequest(parent);
        }
    };

    const handleItemClick = (item) => {
        setSelectedItem(item.name);
    };

    const handleItemDoubleClick = (item) => {
        if (item.isDirectory) {
            handleNavigateRequest(item.path);
        } else {
            // Check Mode
            if (mode !== 'browser') {
                // Select Return for any selection mode
                if (isBinMode(mode)) {
                    addToRecent(item.path);
                } else if (pathModule) {
                    addToRecent(pathModule.dirname(item.path));
                }

                window.dispatchEvent(new CustomEvent('asset-preview-selected', {
                    detail: { path: item.path, mode: mode }
                }));

                setIsOpen(false);
            } else {
                // Browser Mode: Open File
                // Add parent folder to recents
                if (pathModule) {
                    addToRecent(pathModule.dirname(item.path));
                }
                if (shell) shell.openPath(item.path);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <Box
            sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(8px)',
                animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) setIsOpen(false);
            }}
        >
            <style>
                {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes flashHighlight {
            0% { background-color: rgba(var(--accent-rgb), 0.8); box-shadow: 0 0 20px var(--accent); transform: scale(1.05); }
            50% { background-color: rgba(var(--accent-rgb), 0.5); transform: scale(1.02); }
            100% { background-color: rgba(var(--accent-rgb), 0.15); transform: scale(1); }
          }
        `}
            </style>

            <Box
                sx={{
                    width: '1000px',
                    height: '80vh',
                    maxWidth: '95vw',
                    backgroundColor: 'var(--bg-2)',
                    border: '1px solid var(--accent-muted)',
                    borderRadius: '12px',
                    boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                {/* Header / Navigation Bar */}
                <Box sx={{
                    p: 1.5,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    background: 'rgba(0,0,0,0.2)'
                }}>
                    {/* Navigation Controls */}
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                            size="small"
                            disabled={historyIndex <= 0}
                            onClick={() => handleHistoryNav(-1)}
                        >
                            <ArrowBack fontSize="small" />
                        </IconButton>
                        <IconButton
                            size="small"
                            disabled={historyIndex >= history.length - 1}
                            onClick={() => handleHistoryNav(1)}
                        >
                            <ArrowForward fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={handleUp}>
                            <ArrowUpward fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => navigateTo(currentPath, false)}>
                            <Refresh fontSize="small" />
                        </IconButton>
                    </Box>

                    {/* Address Bar */}
                    <Box sx={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px',
                        px: 1,
                        py: 0.5,
                        mr: 1
                    }}>
                        <FolderIcon sx={{ fontSize: 16, mr: 1, color: "var(--accent-muted)" }} />
                        <Typography
                            variant="body2"
                            sx={{
                                fontFamily: 'JetBrains Mono, monospace',
                                color: 'var(--text)',
                                width: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}
                            title={currentPath} // Full path on hover
                        >
                            {getShortPath(currentPath)}
                        </Typography>
                    </Box>

                    {/* Search Bar */}
                    <Box sx={{
                        width: '240px',
                        display: 'flex',
                        alignItems: 'center',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px',
                        px: 1,
                        py: 0.5,
                        '&:focus-within': {
                            border: '1px solid var(--accent)',
                            background: 'rgba(0,0,0,0.3)'
                        }
                    }}>
                        <Search sx={{ fontSize: 18, mr: 1, color: "var(--text-2)" }} />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text)',
                                width: '100%',
                                outline: 'none',
                                fontFamily: 'Inter, sans-serif',
                                fontSize: '0.9rem'
                            }}
                        />
                        {searchQuery && (
                            <IconButton size="small" onClick={() => setSearchQuery('')} sx={{ p: 0.25 }}>
                                <Close fontSize="small" sx={{ fontSize: 14 }} />
                            </IconButton>
                        )}
                    </Box>

                    <Box sx={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', mx: 1 }} />

                    <IconButton size="small" onClick={() => setIsOpen(false)}>
                        <Close fontSize="small" />
                    </IconButton>
                </Box>

                {/* Content Area with Sidebar */}
                <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                    {/* Sidebar */}
                    <Box sx={{
                        width: '200px',
                        borderRight: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(0,0,0,0.15)',
                        p: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5,
                        overflowY: 'auto'
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, mt: 1, mb: 0.5 }}>
                            <Typography variant="overline" sx={{ color: 'var(--text-2)', fontWeight: 600 }}>
                                Quick Access
                            </Typography>
                            <Tooltip title="Add current folder to Quick Access">
                                <IconButton size="small" onClick={addToQuickAccess} sx={{ p: 0.5, color: 'var(--text-2)', '&:hover': { color: 'var(--accent)' } }}>
                                    <Add sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                        </Box>
                        {QuickLinks.map((link) => (
                            <Box
                                key={link.name + link.path}
                                onClick={() => link.path && handleNavigateRequest(link.path)}
                                onContextMenu={(e) => {
                                    if (link.isCustom) {
                                        e.preventDefault();
                                        removeFromQuickAccess(link.path);
                                    }
                                }}
                                title={link.isCustom ? "Right click to remove" : ""}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.5,
                                    p: 1,
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    color: currentPath === link.path ? 'var(--accent)' : 'var(--text)',
                                    background: currentPath === link.path ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                                    '&:hover': {
                                        background: 'rgba(255,255,255,0.05)'
                                    }
                                }}
                            >
                                <Box sx={{
                                    opacity: currentPath === link.path ? 1 : 0.7,
                                    display: 'flex',
                                    '& svg': { fontSize: 20 }
                                }}>
                                    {link.icon}
                                </Box>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                    {link.name}
                                </Typography>
                            </Box>
                        ))}

                        {/* Recent Folders */}
                        {recentFolders.length > 0 && (
                            <>
                                <Box sx={{ height: '1px', background: 'rgba(255,255,255,0.08)', my: 1, mx: 1 }} />
                                <Typography variant="overline" sx={{ color: 'var(--text-2)', px: 1, mt: 1, mb: 0.5, fontWeight: 600 }}>
                                    Recent
                                </Typography>
                                {recentFolders.map((path) => {
                                    const folderName = pathModule ? pathModule.basename(path) : path;
                                    return (
                                        <Box
                                            key={path}
                                            onClick={() => {
                                                const isBinMode = ['bin', 'bineditor-bin', 'port-target', 'port-donor', 'vfxhub-target', 'paint-bin'].includes(mode);
                                                if (isBinMode && pathModule) {
                                                    // Path is a file, open dir and select
                                                    const dir = pathModule.dirname(path);
                                                    const file = pathModule.basename(path);
                                                    handleNavigateRequest(dir);
                                                    setTimeout(() => setSelectedItem(file), 50);
                                                } else {
                                                    handleNavigateRequest(path);
                                                }
                                            }}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                removeFromRecent(path);
                                            }}
                                            title={path + " (Right click to remove)"}
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 1.5,
                                                p: 1,
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                color: currentPath === path ? 'var(--accent)' : 'var(--text)',
                                                background: currentPath === path ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                                                '&:hover': {
                                                    background: 'rgba(255,255,255,0.05)'
                                                }
                                            }}
                                        >
                                            <Box sx={{
                                                opacity: currentPath === path ? 1 : 0.7,
                                                display: 'flex',
                                                '& svg': { fontSize: 20 }
                                            }}>
                                                {mode === 'bin' ? <DescriptionIcon /> : <FolderIcon />}
                                            </Box>
                                            <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {folderName}
                                            </Typography>
                                        </Box>
                                    );
                                })}
                            </>
                        )}
                    </Box>

                    {/* Main File Grid */}
                    <Box
                        ref={ScrollContainerRef}
                        sx={{
                            flex: 1,
                            overflow: 'auto',
                            p: 2,
                            background: 'var(--bg-3)',
                            backgroundImage: `
                                radial-gradient(circle at center, rgba(255,255,255,0.02) 1px, transparent 1px)
                            `,
                            backgroundSize: '24px 24px'
                        }}
                    >
                        {loading ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <CircularProgress size={40} sx={{ color: 'var(--accent)' }} />
                            </Box>
                        ) : error ? (
                            <Box sx={{ color: '#ef4444', textAlign: 'center', mt: 4 }}>
                                <Typography variant="h6">Error loading directory</Typography>
                                <Typography variant="body2">{error}</Typography>
                            </Box>
                        ) : (
                            <Box sx={{
                                display: viewMode === 'grid' ? 'grid' : 'flex',
                                flexDirection: viewMode === 'grid' ? 'row' : 'column',
                                gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(100px, 1fr))' : 'none',
                                gap: viewMode === 'grid' ? 2 : 0.5
                            }}>
                                {items.map((item) => {
                                    const isSelected = selectedItem === item.name;

                                    // Smart Truncate Logic - List Mode Only
                                    // In Grid mode, we prefer multi-line wrapping
                                    let displayName = item.name;
                                    if (viewMode === 'list') {
                                        const charLimit = 60;
                                        if (item.name.length > charLimit) {
                                            const half = Math.floor(charLimit / 2);
                                            displayName = `${item.name.slice(0, half)}...${item.name.slice(-(half))}`;
                                        }
                                    }

                                    if (viewMode === 'list') {
                                        return (
                                            <Box
                                                key={item.name}
                                                id={`file-item-${item.name}`}
                                                onClick={() => handleItemClick(item)}
                                                onDoubleClick={() => handleItemDoubleClick(item)}
                                                onContextMenu={(e) => handleContextMenu(e, item)}
                                                sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 2,
                                                    p: 0.5,
                                                    px: 1,
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    backgroundColor: isSelected ? 'rgba(var(--accent-rgb), 0.15)' : 'transparent',
                                                    border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                                                    // Prevent horizontal scroll
                                                    minWidth: 0,
                                                    width: '100%',
                                                    userSelect: 'none',
                                                    '&:hover': {
                                                        backgroundColor: isSelected ? 'rgba(var(--accent-rgb), 0.25)' : 'rgba(255,255,255,0.05)',
                                                    }
                                                }}
                                            >
                                                {/* Smaller Thumbnail for List */}
                                                <Box sx={{ transform: 'scale(0.5)', transformOrigin: 'left center', width: 32, height: 32, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                                    <FileThumbnail item={item} />
                                                </Box>

                                                <Typography variant="body2" sx={{ flex: 1, fontFamily: 'Inter, sans-serif', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {displayName}
                                                </Typography>

                                                <Typography variant="caption" sx={{ color: 'var(--text-2)', width: '80px', textAlign: 'right', flexShrink: 0 }}>
                                                    {item.isDirectory ? '--' : formatSize(item.size)}
                                                </Typography>
                                            </Box>
                                        );
                                    }

                                    return (
                                        <Box
                                            key={item.name}
                                            id={`file-item-${item.name}`}
                                            onClick={() => handleItemClick(item)}
                                            onDoubleClick={() => handleItemDoubleClick(item)}
                                            onContextMenu={(e) => handleContextMenu(e, item)}
                                            sx={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                p: 1,
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                backgroundColor: isSelected ? 'rgba(var(--accent-rgb), 0.15)' : 'transparent',
                                                border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                                                animation: isSelected ? 'flashHighlight 1.5s ease-out' : 'none',
                                                transition: 'all 0.1s ease',
                                                width: '100%',
                                                userSelect: 'none',
                                                overflow: 'hidden',
                                                '&:hover': {
                                                    backgroundColor: isSelected ? 'rgba(var(--accent-rgb), 0.25)' : 'rgba(255,255,255,0.05)',
                                                }
                                            }}
                                            title={item.name}
                                        >
                                            <Box sx={{ mb: 1, position: 'relative' }}>
                                                <FileThumbnail item={item} />
                                            </Box>

                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    textAlign: 'center',
                                                    color: isSelected ? 'var(--text)' : 'var(--text-2)',
                                                    fontFamily: 'Inter, sans-serif',
                                                    fontSize: '0.8rem',
                                                    width: '100%',
                                                    // Restore Multi-line Wrapping for Grid
                                                    wordBreak: 'break-word',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                    lineHeight: 1.2
                                                }}
                                            >
                                                {item.name}
                                            </Typography>
                                        </Box>
                                    );
                                })}


                            </Box>
                        )}
                    </Box>
                </Box>

                {/* Footer / Status Bar */}
                <Box sx={{
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(0,0,0,0.2)',
                    p: 1,
                    px: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {/* View Toggle */}
                        <Tooltip title={viewMode === 'grid' ? "Switch to List View" : "Switch to Grid View"}>
                            <IconButton
                                size="small"
                                onClick={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}
                                sx={{ color: 'var(--text-2)', '&:hover': { color: 'var(--accent)' } }}
                            >
                                {viewMode === 'grid' ? <ViewList /> : <GridView />}
                            </IconButton>
                        </Tooltip>

                        <Typography variant="caption" sx={{ color: 'var(--text-2)' }}>
                            {items.length} items
                        </Typography>
                    </Box>

                    {selectedItem && (
                        <Typography variant="caption" sx={{ color: 'var(--text-2)' }}>
                            Selected: <span style={{ color: 'var(--accent)' }}>{selectedItem}</span>
                        </Typography>
                    )}
                </Box>
            </Box>

            {/* Context Menu */}
            {/* Context Menu */}
            <Menu
                open={contextMenu !== null}
                onClose={handleCloseContextMenu}
                sx={{ zIndex: 11000 }}
                anchorReference="anchorPosition"
                anchorPosition={
                    contextMenu !== null
                        ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                        : undefined
                }
                PaperProps={{
                    sx: {
                        background: 'var(--bg-2)',
                        border: '1px solid var(--accent-muted)',
                        backdropFilter: 'blur(10px)',
                        minWidth: '200px',
                        '& .MuiMenuItem-root': {
                            fontSize: '0.9rem',
                            gap: 1.5,
                            '&:hover': {
                                background: 'rgba(var(--accent-rgb), 0.1)'
                            }
                        }
                    }
                }}
            >
                <MenuItem onClick={handleOpenInExplorer} disabled={!contextMenu?.item?.path}>
                    <ListItemIcon sx={{ minWidth: 'auto !important' }}>
                        <OpenInNew fontSize="small" sx={{ color: 'var(--text-2)' }} />
                    </ListItemIcon>
                    <Typography variant="body2" sx={{ fontFamily: 'Inter, sans-serif' }}>Show in Explorer</Typography>
                </MenuItem>

                {contextMenu?.item && !contextMenu.item.isDirectory && ['.tex', '.dds', '.png', '.jpg', '.jpeg', '.webp'].includes(contextMenu.item.extension?.toLowerCase()) && (
                    <MenuItem onClick={handleOpenInImgRecolor}>
                        <ListItemIcon sx={{ minWidth: 'auto !important' }}>
                            <ColorLens fontSize="small" sx={{ color: 'var(--accent)' }} />
                        </ListItemIcon>
                        <Typography variant="body2" sx={{ fontFamily: 'Inter, sans-serif' }}>Open in ImgRecolor</Typography>
                    </MenuItem>
                )}
            </Menu>
        </Box>
    );
};

export default CustomExplorer;
