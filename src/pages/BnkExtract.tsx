/* BnkExtract - Audio Bank Extraction and Editing Tool.
   Faithful port of the Electron Quartz page: BIN/WPK/BNK inputs, parse, single
   and split tree views with an active-pane toggle, dual multi-select tree panes,
   the audio splitter overlay, the session / auto-extract / game-banks toolbar,
   the playback footer, per-format extract and the full context-menu + modal set.

   Backend: BNK/WPK parsing, WEM decode and the external Wwise/vgmstream tooling
   live behind the bnk_* / wwise_* / audio_* Tauri commands, wrapped by
   ./bnkextract/utils/backend.ts. The audio splitter renders its waveform with
   wavesurfer.js — see AudioSplitter.tsx. */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Box } from '@mui/material';
import { pickPath } from '@/components/explorer';
import { log } from '@/lib/util/logger';

import AutoExtractDialog from './bnkextract/components/AutoExtractDialog';
import AudioSplitter from './bnkextract/components/AudioSplitter';
import BnkMainContent from './bnkextract/components/BnkMainContent';
import BnkSettingsModal from './bnkextract/components/BnkSettingsModal';
import BnkInstallModal from './bnkextract/components/BnkInstallModal';
import BnkConvertOverlay from './bnkextract/components/BnkConvertOverlay';
import BnkGainModal from './bnkextract/components/BnkGainModal';
import BnkContextMenu from './bnkextract/components/BnkContextMenu';
import BnkHeaderPanel from './bnkextract/components/BnkHeaderPanel';
import BnkLoadingOverlay from './bnkextract/components/BnkLoadingOverlay';
import BnkAutoMatchConfirmModal from './bnkextract/components/BnkAutoMatchConfirmModal';
import BnkSessionManager from './bnkextract/components/BnkSessionManager';
import BnkModDropModal from './bnkextract/components/BnkModDropModal';
import BnkGroupNameModal from './bnkextract/components/BnkGroupNameModal';
import BnkAddToGroupModal from './bnkextract/components/BnkAddToGroupModal';
import BnkGameBanksModal from './bnkextract/components/BnkGameBanksModal';

import { saveSession, type SessionDetail } from './bnkextract/utils/sessionManager';
import {
    loadBanks, wemToPlayable, extractNodes, saveBank, checkWwiseInstalled, installWwise,
    getModFiles, extractBnkBanksFromGame, loadCodebook, pickDirectory,
    convertToWem, amplifyWem, silenceWem, readFileBytes,
} from './bnkextract/utils/backend';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
    containerStyle, headerStyle, mainContentStyle, treeViewStyle, sidebarStyle,
} from './bnkextract/styles';
import type {
    AutoExtractRequest, BnkNode, ContextMenuState, ExtractFormat, GameBanksConfirm, GameBanksSelection,
    HistoryEntry, LastSelected, ModFileSet, Pane, SortMode, SplitterFile, SplitterSegment, ViewMode,
} from './bnkextract/types';
import './bnkextract/BnkExtract.css';

const VOLUME_KEY = 'bnk-extract-volume';
const FORMATS_KEY = 'bnk-extract-formats';
const MP3_KEY = 'bnk-extract-mp3-bitrate';

// ── tree helpers ─────────────────────────────────────────────────────────────
function findNode(nodes: BnkNode[], id: string): BnkNode | null {
    for (const n of nodes) {
        if (n.id === id) return n;
        if (n.children) {
            const found = findNode(n.children, id);
            if (found) return found;
        }
    }
    return null;
}

function collectAudioUnder(node: BnkNode, out: BnkNode[] = []): BnkNode[] {
    if (node.audioData) out.push(node);
    node.children?.forEach((c) => collectAudioUnder(c, out));
    return out;
}

function sortTree(nodes: BnkNode[], mode: SortMode): BnkNode[] {
    if (mode === 'none') return nodes;
    const dir = mode === 'name-asc' ? 1 : -1;
    return [...nodes]
        .map((n) => (n.children ? { ...n, children: sortTree(n.children, mode) } : n))
        .sort((a, b) => dir * a.name.localeCompare(b.name));
}

function filterTree(nodes: BnkNode[], query: string): BnkNode[] {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    const walk = (list: BnkNode[]): BnkNode[] => {
        const out: BnkNode[] = [];
        for (const n of list) {
            const kids = n.children ? walk(n.children) : [];
            if (n.name.toLowerCase().includes(q) || kids.length > 0) {
                out.push(kids.length > 0 ? { ...n, children: kids } : n);
            }
        }
        return out;
    };
    return walk(nodes);
}

function countNodes(nodes: BnkNode[]): number {
    return nodes.reduce((acc, n) => acc + 1 + (n.children ? countNodes(n.children) : 0), 0);
}

export function BnkExtract() {
    // ── Persisted inputs / settings ───────────────────────────────────────────
    const [bnkPath, setBnkPath] = useState('');
    const [wpkPath, setWpkPath] = useState('');
    const [binPath, setBinPath] = useState('');
    const [extractFormats, setExtractFormats] = useState<Set<ExtractFormat>>(() => {
        try {
            const raw = localStorage.getItem(FORMATS_KEY);
            return raw ? new Set(JSON.parse(raw) as ExtractFormat[]) : new Set<ExtractFormat>(['wav']);
        } catch { return new Set<ExtractFormat>(['wav']); }
    });
    const [mp3Bitrate, setMp3Bitrate] = useState(() => {
        const raw = localStorage.getItem(MP3_KEY);
        return raw ? parseInt(raw, 10) : 192;
    });
    const [autoSaveSession, setAutoSaveSession] = useState(false);

    // ── Parsed data / trees ───────────────────────────────────────────────────
    const [treeData, setTreeData] = useState<BnkNode[]>([]);
    const [rightTreeData, setRightTreeData] = useState<BnkNode[]>([]);

    // ── Selection state ───────────────────────────────────────────────────────
    const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [rightSelectedNodes, setRightSelectedNodes] = useState<Set<string>>(new Set());
    const [rightExpandedNodes, setRightExpandedNodes] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<LastSelected>({ id: null, pane: 'left' });

    // ── UI state ──────────────────────────────────────────────────────────────
    const [viewMode, setViewMode] = useState<ViewMode>('split');
    const [activePane, setActivePane] = useState<Pane>('left');
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Ready');
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [rightPaneDragOver, setRightPaneDragOver] = useState(false);
    const [rightSortMode, setRightSortMode] = useState<SortMode>('name-asc');
    const [leftSortMode, setLeftSortMode] = useState<SortMode>('name-asc');

    // ── Wwise conversion state ────────────────────────────────────────────────
    const [isWwiseInstalled, setIsWwiseInstalled] = useState(false);
    const [showInstallModal, setShowInstallModal] = useState(false);
    const [showConvertOverlay, setShowConvertOverlay] = useState(false);
    const [convertStatus, setConvertStatus] = useState('');
    const [installProgress, setInstallProgress] = useState('');
    const [isInstalling, setIsInstalling] = useState(false);

    // ── History (undo/redo) ───────────────────────────────────────────────────
    const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

    // ── Gain / volume state ───────────────────────────────────────────────────
    const [showGainDialog, setShowGainDialog] = useState(false);
    const [gainDb, setGainDb] = useState('3');
    const [gainTargetNodeId, setGainTargetNodeId] = useState<string | null>(null);
    const [gainTargetPane, setGainTargetPane] = useState<Pane>('left');
    const gainTargetNodeIds = useRef<string[]>([]);

    // ── Audio splitter state ──────────────────────────────────────────────────
    const [showAudioSplitter, setShowAudioSplitter] = useState(false);
    const [splitterInitialFile, setSplitterInitialFile] = useState<SplitterFile | null>(null);

    // ── Settings / modals ─────────────────────────────────────────────────────
    const [autoPlay, setAutoPlay] = useState(true);
    const [multiSelect, setMultiSelect] = useState(true);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [autoExtractOpen, setAutoExtractOpen] = useState(false);
    const [showAutoMatchModal, setShowAutoMatchModal] = useState(false);
    const [showSessionManager, setShowSessionManager] = useState(false);
    const [modDropModalOpen, setModDropModalOpen] = useState(false);
    const [pendingModFolder, setPendingModFolder] = useState<string | null>(null);
    const [groupNameModalOpen, setGroupNameModalOpen] = useState(false);
    const [addToGroupModalOpen, setAddToGroupModalOpen] = useState(false);
    const [showGameBanksModal, setShowGameBanksModal] = useState(false);
    const [isGameBanksLoading, setIsGameBanksLoading] = useState(false);
    const [gameBanksProgress, setGameBanksProgress] = useState('');

    // ── Search ────────────────────────────────────────────────────────────────
    const [leftSearchQuery, setLeftSearchQuery] = useState('');
    const [rightSearchQuery, setRightSearchQuery] = useState('');

    // ── Playback ──────────────────────────────────────────────────────────────
    const [volume, setVolumeState] = useState(() => {
        const saved = localStorage.getItem(VOLUME_KEY);
        return saved !== null ? parseInt(saved, 10) : 100;
    });
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const codebookDataRef = useRef<Uint8Array | null>(null);

    const pendingConversion = useRef<{ filePath: string; targetNodeId: string } | null>(null);
    const pendingGroupIds = useRef<string[]>([]);

    /* Routing for the Tauri webview file-drop event. DOM drag handlers stamp the
       intended target here; the webview 'drop' (carrying real absolute paths)
       reads and clears it. */
    const webviewDropTarget = useRef<
        { kind: 'reference' }
        | { kind: 'node'; targetId: string; pane: Pane }
        | { kind: 'mod-folder' }
        | null
    >(null);

    const setVolume = useCallback((v: number) => {
        setVolumeState(v);
        localStorage.setItem(VOLUME_KEY, String(v));
        if (audioRef.current) audioRef.current.volume = v / 100;
    }, []);

    // ── History ───────────────────────────────────────────────────────────────
    const pushToHistory = useCallback(() => {
        setUndoStack((prev) => [...prev, { left: treeData, right: rightTreeData, bytes: 0 }].slice(-50));
        setRedoStack([]);
    }, [treeData, rightTreeData]);

    const handleUndo = useCallback(() => {
        setUndoStack((prev) => {
            if (prev.length === 0) return prev;
            const entry = prev[prev.length - 1];
            setRedoStack((r) => [...r, { left: treeData, right: rightTreeData, bytes: 0 }]);
            setTreeData(entry.left);
            setRightTreeData(entry.right);
            setStatusMessage('Undo');
            return prev.slice(0, -1);
        });
    }, [treeData, rightTreeData]);

    const handleRedo = useCallback(() => {
        setRedoStack((prev) => {
            if (prev.length === 0) return prev;
            const entry = prev[prev.length - 1];
            setUndoStack((u) => [...u, { left: treeData, right: rightTreeData, bytes: 0 }]);
            setTreeData(entry.left);
            setRightTreeData(entry.right);
            setStatusMessage('Redo');
            return prev.slice(0, -1);
        });
    }, [treeData, rightTreeData]);

    // ── Search + sort (derived) ───────────────────────────────────────────────
    const filteredLeftTree = useMemo(
        () => sortTree(filterTree(treeData, leftSearchQuery), leftSortMode),
        [treeData, leftSearchQuery, leftSortMode],
    );
    const filteredRightTree = useMemo(
        () => sortTree(filterTree(rightTreeData, rightSearchQuery), rightSortMode),
        [rightTreeData, rightSearchQuery, rightSortMode],
    );

    // ── Codebook + Wwise availability (once) ──────────────────────────────────
    useEffect(() => {
        void loadCodebook().then((cb) => { codebookDataRef.current = cb; }).catch(() => { });
        void checkWwiseInstalled().then(setIsWwiseInstalled).catch(() => { });
    }, []);

    // ── Playback ──────────────────────────────────────────────────────────────
    const stopAudio = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.removeAttribute('src');
        }
        setStatusMessage('Playback stopped');
    }, []);

    const playAudio = useCallback(async (node: BnkNode) => {
        if (!autoPlay || !node.audioData) return;
        stopAudio();
        try {
            setStatusMessage(`Playing ${node.name}...`);
            const raw = node.audioData.data;
            const nameLower = node.name.toLowerCase();
            let playable: Uint8Array | null = null;

            if ((nameLower.endsWith('.wav') || nameLower.endsWith('.ogg')) && raw.length >= 4) {
                const magic = String.fromCharCode(raw[0], raw[1], raw[2], raw[3]);
                if (magic === 'RIFF' || magic === 'OggS') playable = raw;
            }
            if (!playable) {
                // Decode the WEM to a playable OGG/WAV container in Rust.
                playable = await wemToPlayable(raw, codebookDataRef.current);
            }
            if (!playable || playable.length === 0) {
                setStatusMessage(`Cannot decode ${node.name} for playback`);
                return;
            }
            const isWav = playable[0] === 0x52 && playable[1] === 0x49 && playable[2] === 0x46 && playable[3] === 0x46;
            const blob = new Blob([playable as BlobPart], { type: isWav ? 'audio/wav' : 'audio/ogg' });
            const url = URL.createObjectURL(blob);
            if (!audioRef.current) audioRef.current = new Audio();
            audioRef.current.src = url;
            audioRef.current.volume = volume / 100;
            audioRef.current.onended = () => { URL.revokeObjectURL(url); setStatusMessage('Ready'); };
            await audioRef.current.play();
        } catch (e) {
            log.error('[BnkExtract] playback error', e);
            setStatusMessage(`Playback failed: ${(e as Error).message}`);
        }
    }, [autoPlay, stopAudio, volume]);

    // ── Selection helpers ─────────────────────────────────────────────────────
    const hasAudioSelection = useCallback(() => {
        const pane = activePane;
        const sel = pane === 'left' ? selectedNodes : rightSelectedNodes;
        const tree = pane === 'left' ? treeData : rightTreeData;
        for (const id of sel) {
            const n = findNode(tree, id);
            if (n && (n.audioData || (n.children && collectAudioUnder(n).length > 0))) return true;
        }
        return false;
    }, [activePane, selectedNodes, rightSelectedNodes, treeData, rightTreeData]);

    const hasRootSelection = useCallback(() => {
        const pane = activePane;
        const sel = pane === 'left' ? selectedNodes : rightSelectedNodes;
        const tree = pane === 'left' ? treeData : rightTreeData;
        return tree.some((n) => sel.has(n.id) && n.isRoot);
    }, [activePane, selectedNodes, rightSelectedNodes, treeData, rightTreeData]);

    // ── File picking + parse ──────────────────────────────────────────────────
    const handleSelectFile = useCallback(async (kind: 'bin' | 'wpk' | 'bnk') => {
        const exts = kind === 'bin' ? ['bin'] : kind === 'wpk' ? ['wpk', 'bnk'] : ['bnk'];
        const picked = await pickPath({ mode: 'file', filters: [{ name: kind.toUpperCase(), extensions: exts }, { name: 'All Files', extensions: ['*'] }] });
        if (typeof picked !== 'string') return;
        if (kind === 'bin') setBinPath(picked);
        else if (kind === 'wpk') setWpkPath(picked);
        else setBnkPath(picked);
    }, []);

    const handleParseFiles = useCallback(async () => {
        setIsLoading(true);
        setStatusMessage('Parsing...');
        try {
            pushToHistory();
            const result = await loadBanks({ bnkPath, wpkPath, binPath });
            if (result?.tree) {
                if (viewMode === 'split' && activePane === 'right') {
                    setRightTreeData((prev) => [...prev, result.tree]);
                } else {
                    setTreeData((prev) => [...prev, result.tree]);
                }
                setStatusMessage(`Loaded ${result.fileCount} audio file(s)`);
            } else {
                setStatusMessage('Nothing parsed');
            }
        } catch (e) {
            log.error('[BnkExtract] parse failed', e);
            setStatusMessage(`Parse failed: ${(e as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [bnkPath, wpkPath, binPath, viewMode, activePane, pushToHistory]);

    const handleClearPane = useCallback((pane: Pane) => {
        pushToHistory();
        if (pane === 'right') { setRightTreeData([]); setRightSelectedNodes(new Set()); }
        else { setTreeData([]); setSelectedNodes(new Set()); }
        setStatusMessage('Cleared');
    }, [pushToHistory]);

    // ── Node select / expand ──────────────────────────────────────────────────
    const handleNodeSelect = useCallback((node: BnkNode, ctrl: boolean, _shift: boolean, pane: Pane) => {
        const setter = pane === 'left' ? setSelectedNodes : setRightSelectedNodes;
        setActivePane(pane);
        setLastSelectedId({ id: node.id, pane });
        setter((prev) => {
            const next = new Set(multiSelect && ctrl ? prev : []);
            if (multiSelect && ctrl && prev.has(node.id)) next.delete(node.id);
            else next.add(node.id);
            return next;
        });
    }, [multiSelect]);

    const handleToggleExpand = useCallback((id: string, _shift: boolean, pane: Pane) => {
        const setter = pane === 'left' ? setExpandedNodes : setRightExpandedNodes;
        setter((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    // ── Selection actions ─────────────────────────────────────────────────────
    const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);

    const handleContextMenu = useCallback((e: React.MouseEvent, node: BnkNode, pane: Pane) => {
        e.preventDefault();
        setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, node, pane });
    }, []);

    const getContextTargetIds = useCallback((): string[] => {
        const nodeId = contextMenu?.node?.id;
        const pane = contextMenu?.pane || activePane;
        if (!nodeId) return [];
        const paneSelection = pane === 'left' ? selectedNodes : rightSelectedNodes;
        if (paneSelection.has(nodeId) && paneSelection.size > 1) return Array.from(paneSelection);
        return [nodeId];
    }, [contextMenu, activePane, selectedNodes, rightSelectedNodes]);

    const handlePlaySelected = useCallback(() => {
        const pane = activePane;
        const sel = pane === 'left' ? selectedNodes : rightSelectedNodes;
        const tree = pane === 'left' ? treeData : rightTreeData;
        const id = [...sel][0];
        if (!id) return;
        const n = findNode(tree, id);
        if (n?.audioData) void playAudio(n);
    }, [activePane, selectedNodes, rightSelectedNodes, treeData, rightTreeData, playAudio]);

    const removeNodesByIds = useCallback((nodes: BnkNode[], ids: Set<string>): BnkNode[] =>
        nodes
            .filter((n) => !ids.has(n.id))
            .map((n) => (n.children ? { ...n, children: removeNodesByIds(n.children, ids) } : n)), []);

    // Swap raw WEM bytes onto every audio node whose id is in `ids` (the node keeps
    // its original audioData.id so the bank still maps the event to it).
    const applyAudioToNodes = useCallback((pane: Pane, ids: Set<string>, data: Uint8Array) => {
        const patch = (nodes: BnkNode[]): BnkNode[] => nodes.map((n) => {
            if (ids.has(n.id) && n.audioData) {
                return {
                    ...n,
                    isModified: true,
                    audioData: { ...n.audioData, data, length: data.length, isModified: true },
                };
            }
            if (n.children) return { ...n, children: patch(n.children) };
            return n;
        });
        if (pane === 'right') setRightTreeData((p) => patch(p));
        else setTreeData((p) => patch(p));
    }, []);

    const handleDeleteSelected = useCallback(() => {
        const pane = activePane;
        const sel = pane === 'left' ? selectedNodes : rightSelectedNodes;
        if (sel.size === 0) return;
        pushToHistory();
        if (pane === 'left') { setTreeData((p) => removeNodesByIds(p, sel)); setSelectedNodes(new Set()); }
        else { setRightTreeData((p) => removeNodesByIds(p, sel)); setRightSelectedNodes(new Set()); }
        setStatusMessage(`Removed ${sel.size} item(s)`);
    }, [activePane, selectedNodes, rightSelectedNodes, pushToHistory, removeNodesByIds]);

    const handleDeleteNode = useCallback(() => {
        const pane = contextMenu?.pane || activePane;
        const ids = new Set(getContextTargetIds());
        if (ids.size === 0) return;
        pushToHistory();
        if (pane === 'left') { setTreeData((p) => removeNodesByIds(p, ids)); setSelectedNodes(new Set()); }
        else { setRightTreeData((p) => removeNodesByIds(p, ids)); setRightSelectedNodes(new Set()); }
        handleCloseContextMenu();
        setStatusMessage(`Removed ${ids.size} item(s)`);
    }, [contextMenu, activePane, getContextTargetIds, pushToHistory, removeNodesByIds, handleCloseContextMenu]);

    const handleCopyName = useCallback(() => {
        const name = contextMenu?.node?.name;
        if (name) void navigator.clipboard?.writeText(name).catch(() => { });
        handleCloseContextMenu();
        setStatusMessage('Copied name');
    }, [contextMenu, handleCloseContextMenu]);

    // ── File operations (extract / replace / silent / save) ───────────────────
    const collectSelectedAudioNodes = useCallback((): BnkNode[] => {
        const pane = activePane;
        const sel = pane === 'left' ? selectedNodes : rightSelectedNodes;
        const tree = pane === 'left' ? treeData : rightTreeData;
        const out: BnkNode[] = [];
        for (const id of sel) {
            const n = findNode(tree, id);
            if (n) collectAudioUnder(n, out);
        }
        return out;
    }, [activePane, selectedNodes, rightSelectedNodes, treeData, rightTreeData]);

    const handleExtract = useCallback(async () => {
        const nodes = collectSelectedAudioNodes();
        if (nodes.length === 0) { setStatusMessage('Select tracks to extract first'); return; }
        if (extractFormats.size === 0) { setStatusMessage('No export formats selected'); return; }
        const dir = await pickDirectory();
        if (!dir) return;
        setIsLoading(true);
        try {
            const count = await extractNodes(nodes, [...extractFormats], mp3Bitrate, dir);
            setStatusMessage(`Extracted ${count} track(s)`);
        } catch (e) {
            log.error('[BnkExtract] extract failed', e);
            setStatusMessage(`Extraction failed: ${(e as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [collectSelectedAudioNodes, extractFormats, mp3Bitrate]);

    const handleReplace = useCallback(async () => {
        if (!hasAudioSelection()) return;
        if (!isWwiseInstalled) { setShowInstallModal(true); return; }
        const picked = await pickPath({ mode: 'file', filters: [{ name: 'Audio', extensions: ['wem', 'wav', 'ogg', 'mp3'] }], recentsKey: 'audio' });
        if (typeof picked !== 'string') return;
        const targets = collectSelectedAudioNodes();
        if (targets.length === 0) return;
        const targetPane = activePane;
        setShowConvertOverlay(true);
        setConvertStatus('Converting replacement audio...');
        try {
            const wem = picked.toLowerCase().endsWith('.wem')
                ? await readFileBytes(picked)
                : await convertToWem(picked);
            pushToHistory();
            const ids = new Set(targets.map((n) => n.id));
            applyAudioToNodes(targetPane, ids, wem);
            setStatusMessage(`Replaced ${targets.length} track(s)`);
        } catch (e) {
            log.error('[BnkExtract] replace failed', e);
            setStatusMessage(`Replace failed: ${(e as Error).message}`);
        } finally {
            setShowConvertOverlay(false);
        }
    }, [hasAudioSelection, isWwiseInstalled, collectSelectedAudioNodes, activePane, pushToHistory, applyAudioToNodes]);

    const handleMakeSilent = useCallback(() => {
        if (!hasAudioSelection()) return;
        const targets = collectSelectedAudioNodes();
        if (targets.length === 0) return;
        pushToHistory();
        const ids = new Set(targets.map((n) => n.id));
        applyAudioToNodes(activePane, ids, silenceWem());
        setStatusMessage(`Silenced ${targets.length} track(s)`);
        handleCloseContextMenu();
    }, [hasAudioSelection, collectSelectedAudioNodes, activePane, pushToHistory, applyAudioToNodes, handleCloseContextMenu]);

    const handleSave = useCallback(async () => {
        if (!hasRootSelection()) return;
        const pane = activePane;
        const sel = pane === 'left' ? selectedNodes : rightSelectedNodes;
        const tree = pane === 'left' ? treeData : rightTreeData;
        const root = tree.find((n) => sel.has(n.id) && n.isRoot);
        if (!root) return;
        const out = await pickPath({ mode: 'file' });
        if (typeof out !== 'string') return;
        setIsLoading(true);
        try {
            await saveBank(root, out);
            setStatusMessage('Saved bank');
        } catch (e) {
            log.error('[BnkExtract] save failed', e);
            setStatusMessage(`Save failed: ${(e as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [hasRootSelection, activePane, selectedNodes, rightSelectedNodes, treeData, rightTreeData]);

    // ── Drop / auto-match ops ─────────────────────────────────────────────────
    /* Drag a right-pane (reference) node onto a left-pane (main) node: copy the
       source's WEM bytes onto the target leaf, keeping the target's audio id. */
    const handleDropReplace = useCallback((ids: string[], targetId: string) => {
        const sources: BnkNode[] = [];
        for (const id of ids) {
            const n = findNode(rightTreeData, id);
            if (n) collectAudioUnder(n, sources);
        }
        const src = sources.find((n) => n.audioData?.data?.length);
        const target = findNode(treeData, targetId);
        if (!src?.audioData || !target?.audioData) { setStatusMessage('Nothing to copy from reference'); return; }
        pushToHistory();
        applyAudioToNodes('left', new Set([targetId]), src.audioData.data);
        setStatusMessage(`Replaced ${target.name} from reference`);
    }, [rightTreeData, treeData, pushToHistory, applyAudioToNodes]);

    /* Convert dropped wem/wav/ogg/mp3 files to WEM and apply to the target node. */
    const applyExternalFiles = useCallback(async (files: { path: string; name: string }[], targetId: string, pane: Pane) => {
        const file = files.find((f) => /\.(wem|wav|ogg|mp3)$/i.test(f.name));
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.wem') && !isWwiseInstalled) { setShowInstallModal(true); return; }
        setShowConvertOverlay(true);
        setConvertStatus(`Converting ${file.name}...`);
        try {
            const wem = file.name.toLowerCase().endsWith('.wem')
                ? await readFileBytes(file.path)
                : await convertToWem(file.path);
            pushToHistory();
            applyAudioToNodes(pane, new Set([targetId]), wem);
            setStatusMessage(`Replaced from ${file.name}`);
        } catch (e) {
            log.error('[BnkExtract] external file drop failed', e);
            setStatusMessage(`Replace failed: ${(e as Error).message}`);
        } finally {
            setShowConvertOverlay(false);
        }
    }, [isWwiseInstalled, pushToHistory, applyAudioToNodes]);

    const handleExternalFileDrop = useCallback((_files: { path: string; name: string }[], targetId: string, pane: Pane) => {
        // The DOM event lacks real paths under Tauri; stamp the target and let the
        // webview drop listener apply the converted bytes.
        webviewDropTarget.current = { kind: 'node', targetId, pane };
    }, []);

    /* Match audio leaves between panes by their numeric WEM id and copy the
       reference (right) bytes onto the matching main (left) leaf. */
    const handleAutoMatchByEventName = useCallback(() => {
        const refLeaves: BnkNode[] = [];
        rightTreeData.forEach((n) => collectAudioUnder(n, refLeaves));
        const byId = new Map<number, BnkNode>();
        for (const n of refLeaves) {
            if (n.audioData?.id != null && n.audioData.data?.length) byId.set(n.audioData.id, n);
        }
        if (byId.size === 0) { setStatusMessage('No reference audio to match'); return; }

        const mainLeaves: BnkNode[] = [];
        treeData.forEach((n) => collectAudioUnder(n, mainLeaves));
        const matches: { targetId: string; data: Uint8Array }[] = [];
        for (const n of mainLeaves) {
            const ref = n.audioData?.id != null ? byId.get(n.audioData.id) : undefined;
            if (ref?.audioData) matches.push({ targetId: n.id, data: ref.audioData.data });
        }
        if (matches.length === 0) { setStatusMessage('No matching WEM ids between panes'); return; }

        pushToHistory();
        const patch = (nodes: BnkNode[]): BnkNode[] => nodes.map((n) => {
            const m = n.audioData ? matches.find((x) => x.targetId === n.id) : undefined;
            if (m && n.audioData) {
                return { ...n, isModified: true, audioData: { ...n.audioData, data: m.data, length: m.data.length, isModified: true } };
            }
            if (n.children) return { ...n, children: patch(n.children) };
            return n;
        });
        setTreeData((p) => patch(p));
        setStatusMessage(`Auto-matched ${matches.length} track(s) by WEM id`);
    }, [rightTreeData, treeData, pushToHistory]);

    const handleRightPaneDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer?.types?.includes('Files')) setRightPaneDragOver(true);
    }, []);
    const handleRightPaneDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setRightPaneDragOver(false);
    }, []);

    /* Import dropped audio files as a reference-pane group (each converted to WEM). */
    const importReferenceFiles = useCallback(async (paths: string[]) => {
        const audio = paths.filter((p) => /\.(wem|wav|ogg|mp3)$/i.test(p));
        if (audio.length === 0) return;
        const nonWem = audio.some((p) => !p.toLowerCase().endsWith('.wem'));
        if (nonWem && !isWwiseInstalled) { setShowInstallModal(true); return; }
        setShowConvertOverlay(true);
        const children: BnkNode[] = [];
        for (let i = 0; i < audio.length; i++) {
            const p = audio[i];
            const name = p.split(/[\\/]/).pop() || `audio_${i}`;
            setConvertStatus(`Importing ${name} (${i + 1}/${audio.length})...`);
            try {
                const wem = p.toLowerCase().endsWith('.wem') ? await readFileBytes(p) : await convertToWem(p);
                children.push({
                    id: `ref_${Date.now()}_${i}`,
                    name,
                    audioData: { id: Date.now() + i, data: wem, offset: 0, length: wem.length, isModified: true },
                });
            } catch (e) {
                log.error('[BnkExtract] reference import failed', e);
            }
        }
        setShowConvertOverlay(false);
        if (children.length === 0) { setStatusMessage('No files imported'); return; }
        pushToHistory();
        const group: BnkNode = { id: `refgroup_${Date.now()}`, name: `Imported (${children.length})`, children };
        setRightTreeData((prev) => [...prev, group]);
        setRightExpandedNodes((prev) => new Set(prev).add(group.id));
        setActivePane('right');
        setStatusMessage(`Imported ${children.length} reference file(s)`);
    }, [isWwiseInstalled, pushToHistory]);

    const handleRightPaneFileDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setRightPaneDragOver(false);
        // Real paths arrive through the Tauri webview drop listener; the DOM event
        // only tells us the reference pane was the target.
        webviewDropTarget.current = { kind: 'reference' };
    }, []);

    // ── Wwise install ─────────────────────────────────────────────────────────
    const handleInstallWwise = useCallback(async () => {
        setIsInstalling(true);
        setInstallProgress('Installing Wwise tools...');
        const unlisten = await listen<string>('wwise:install-progress', (e) => setInstallProgress(e.payload));
        try {
            const res = await installWwise();
            if (res.success) { setIsWwiseInstalled(true); setShowInstallModal(false); setStatusMessage('Wwise tools installed'); }
            else setInstallProgress(res.error || 'Install failed');
        } finally {
            unlisten();
            setIsInstalling(false);
        }
    }, []);

    // ── Gain ──────────────────────────────────────────────────────────────────
    /* Re-encode each targeted WEM with the chosen dB gain (decode → scale → Wwise). */
    const handleApplyGain = useCallback(async () => {
        setShowGainDialog(false);
        const ids = gainTargetNodeIds.current.length > 0
            ? gainTargetNodeIds.current
            : Array.from(gainTargetPane === 'left' ? selectedNodes : rightSelectedNodes);
        const pane = gainTargetPane;
        const tree = pane === 'left' ? treeData : rightTreeData;
        const targets: BnkNode[] = [];
        for (const id of ids) {
            const n = findNode(tree, id);
            if (n) collectAudioUnder(n, targets);
        }
        const withData = targets.filter((n) => n.audioData?.data?.length);
        if (withData.length === 0) { setStatusMessage('No audio to amplify'); return; }
        if (!isWwiseInstalled) { setShowInstallModal(true); return; }

        const db = parseFloat(gainDb);
        if (isNaN(db)) { setStatusMessage('Invalid gain value'); return; }

        setShowConvertOverlay(true);
        try {
            const patches = new Map<string, Uint8Array>();
            for (let i = 0; i < withData.length; i++) {
                const n = withData[i];
                setConvertStatus(`Applying ${db}dB gain (${i + 1}/${withData.length})...`);
                const amplified = await amplifyWem(n.audioData!.data, db);
                patches.set(n.id, amplified);
            }
            pushToHistory();
            const patch = (nodes: BnkNode[]): BnkNode[] => nodes.map((n) => {
                const data = n.audioData ? patches.get(n.id) : undefined;
                if (data && n.audioData) {
                    return { ...n, isModified: true, audioData: { ...n.audioData, data, length: data.length, isModified: true } };
                }
                if (n.children) return { ...n, children: patch(n.children) };
                return n;
            });
            if (pane === 'right') setRightTreeData((p) => patch(p)); else setTreeData((p) => patch(p));
            setStatusMessage(`Applied ${db}dB gain to ${patches.size} track(s)`);
        } catch (e) {
            log.error('[BnkExtract] gain failed', e);
            setStatusMessage(`Gain failed: ${(e as Error).message}`);
        } finally {
            setShowConvertOverlay(false);
        }
    }, [gainDb, gainTargetPane, selectedNodes, rightSelectedNodes, treeData, rightTreeData, isWwiseInstalled, pushToHistory]);

    // ── Splitter actions ──────────────────────────────────────────────────────
    const handleOpenInSplitter = useCallback(() => {
        const node = contextMenu?.node;
        const pane = contextMenu?.pane || activePane;
        handleCloseContextMenu();
        if (node?.audioData && !isWwiseInstalled) {
            setShowInstallModal(true);
            return;
        }
        setSplitterInitialFile(node ? {
            nodeId: node.id,
            name: node.name,
            pane,
            isWem: !!node.audioData,
            data: node.audioData?.data,
        } : null);
        setShowAudioSplitter(true);
    }, [contextMenu, activePane, isWwiseInstalled, handleCloseContextMenu]);

    const handleSplitterReplace = useCallback((data: Uint8Array, nodeId: string, pane?: string) => {
        if (!data?.length || !nodeId) return;
        pushToHistory();
        applyAudioToNodes((pane as Pane) || 'left', new Set([nodeId]), data);
        setStatusMessage('Replaced source with edited audio');
    }, [pushToHistory, applyAudioToNodes]);

    const handleSplitterExportSegments = useCallback((segments: SplitterSegment[]) => {
        pushToHistory();
        const groupNode: BnkNode = {
            id: `splitseg_${Date.now()}`,
            name: `Split Segments (${segments.length})`,
            children: segments.map((s, i) => ({
                id: `splitseg_${Date.now()}_${i}`,
                name: s.name,
                audioData: { id: Date.now() + i, data: s.data, offset: 0, length: s.data.length, isModified: true },
            })),
        };
        setRightTreeData((prev) => [...prev, groupNode]);
        setRightExpandedNodes((prev) => new Set(prev).add(groupNode.id));
        setViewMode('split');
        setStatusMessage(`Pushed ${segments.length} segment(s) to reference pane`);
    }, [pushToHistory]);

    // ── Auto-extract / mod folder ─────────────────────────────────────────────
    /* Parse each scanned mod-file set into the left tree, then (if an output dir
       was given) extract every loaded root to disk in the chosen formats. */
    const handleAutoExtractProcess = useCallback(async (req?: AutoExtractRequest) => {
        const batch = req?.batchFiles ?? [];
        if (batch.length === 0) { setStatusMessage('No mod files to process'); return; }
        setIsLoading(true);
        setStatusMessage('Auto-extract running...');
        try {
            const loaded: BnkNode[] = [];
            for (let i = 0; i < batch.length; i++) {
                const set = batch[i];
                setStatusMessage(`Parsing ${set.modFolderName || set.audio || 'mod'} (${i + 1}/${batch.length})...`);
                const result = await loadBanks({
                    bnkPath: set.events || '',
                    wpkPath: set.audio || '',
                    binPath: set.bin || '',
                });
                if (result?.tree) {
                    const root = set.modFolderName ? { ...result.tree, name: set.modFolderName } : result.tree;
                    loaded.push(root);
                }
            }
            if (loaded.length === 0) { setStatusMessage('Nothing parsed from mod folder'); return; }

            if (req?.loadToTree !== false) {
                pushToHistory();
                setTreeData((prev) => [...prev, ...loaded]);
            }

            if (req?.outputPath) {
                let total = 0;
                for (const root of loaded) {
                    const audioNodes = collectAudioUnder(root);
                    if (audioNodes.length > 0) {
                        total += await extractNodes(audioNodes, [...extractFormats], mp3Bitrate, req.outputPath);
                    }
                }
                setStatusMessage(`Loaded ${loaded.length} bank(s), extracted ${total} track(s)`);
            } else {
                setStatusMessage(`Loaded ${loaded.length} bank(s) into tree`);
            }
        } catch (e) {
            log.error('[BnkExtract] auto-extract failed', e);
            setStatusMessage(`Auto-extract failed: ${(e as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [pushToHistory, extractFormats, mp3Bitrate]);

    const handleLeftPaneFolderDrop = useCallback((folderPath: string) => {
        setPendingModFolder(folderPath);
        setModDropModalOpen(true);
    }, []);

    const handleModDropConfirm = useCallback(async (skinId: string | null) => {
        setModDropModalOpen(false);
        if (!pendingModFolder) return;
        const folderPath = pendingModFolder;
        setPendingModFolder(null);
        setStatusMessage('Scanning mod folder...');
        try {
            const sets = (await getModFiles(folderPath, skinId)) as ModFileSet[];
            if (!sets || sets.length === 0) { setStatusMessage('No audio files found in mod folder'); return; }
            await handleAutoExtractProcess({ batchFiles: sets, outputPath: null, loadToTree: true, skinId: skinId ?? undefined });
        } catch (e) {
            setStatusMessage(`Mod folder error: ${(e as Error).message}`);
        }
    }, [pendingModFolder, handleAutoExtractProcess]);

    // ── Groups (right pane) ───────────────────────────────────────────────────
    const collectRightGroups = useCallback((nodes: BnkNode[], result: BnkNode[] = []): BnkNode[] => {
        for (const node of nodes) {
            if (!node.audioData && node.children) {
                result.push(node);
                collectRightGroups(node.children, result);
            }
        }
        return result;
    }, []);

    const isNodeInGroup = useCallback((nodeId: string, nodes: BnkNode[]): boolean => {
        for (const node of nodes) {
            if (node.id === nodeId) return false;
            if (node.children) {
                const inChild = (id: string, children: BnkNode[]): boolean =>
                    children.some((c) => c.id === id || (c.children ? inChild(id, c.children) : false));
                if (inChild(nodeId, node.children)) return true;
            }
        }
        return false;
    }, []);

    const handleCreateGroup = useCallback((groupName: string) => {
        setGroupNameModalOpen(false);
        pushToHistory();
        const selectedIds = new Set(pendingGroupIds.current);
        const collected: BnkNode[] = [];
        const removeAndCollect = (nodes: BnkNode[]): BnkNode[] => {
            const remaining: BnkNode[] = [];
            for (const node of nodes) {
                if (selectedIds.has(node.id)) collected.push(node);
                else remaining.push(node.children ? { ...node, children: removeAndCollect(node.children) } : node);
            }
            return remaining;
        };
        const newTree = removeAndCollect(rightTreeData);
        setRightTreeData([...newTree, { id: `group_${Date.now()}`, name: groupName, children: collected }]);
        setRightSelectedNodes(new Set());
        setStatusMessage(`Grouped ${collected.length} file${collected.length !== 1 ? 's' : ''} into "${groupName}"`);
    }, [rightTreeData, pushToHistory]);

    const handleAddToGroup = useCallback((groupId: string) => {
        setAddToGroupModalOpen(false);
        pushToHistory();
        const selectedIds = new Set(pendingGroupIds.current);
        const collected: BnkNode[] = [];
        const removeAndCollect = (nodes: BnkNode[]): BnkNode[] => {
            const remaining: BnkNode[] = [];
            for (const node of nodes) {
                if (selectedIds.has(node.id)) collected.push(node);
                else remaining.push(node.children ? { ...node, children: removeAndCollect(node.children) } : node);
            }
            return remaining;
        };
        const insertIntoGroup = (nodes: BnkNode[]): BnkNode[] => nodes.map((node) => {
            if (node.id === groupId) return { ...node, children: [...(node.children || []), ...collected] };
            if (node.children) return { ...node, children: insertIntoGroup(node.children) };
            return node;
        });
        setRightTreeData(insertIntoGroup(removeAndCollect(rightTreeData)));
        setRightSelectedNodes(new Set());
        setStatusMessage(`Added ${collected.length} file${collected.length !== 1 ? 's' : ''} to group`);
    }, [rightTreeData, pushToHistory]);

    const handleRemoveFromGroup = useCallback(() => {
        pushToHistory();
        const selectedIds = new Set(pendingGroupIds.current);
        const removed: BnkNode[] = [];
        const strip = (nodes: BnkNode[]): BnkNode[] => nodes
            .map((node): BnkNode | null => {
                if (selectedIds.has(node.id)) { removed.push(node); return null; }
                if (node.children) return { ...node, children: strip(node.children).filter(Boolean) as BnkNode[] };
                return node;
            })
            .filter(Boolean) as BnkNode[];
        setRightTreeData([...strip(rightTreeData), ...removed]);
        setRightSelectedNodes(new Set());
        setStatusMessage(`Removed ${removed.length} file${removed.length !== 1 ? 's' : ''} from group`);
    }, [rightTreeData, pushToHistory]);

    // ── Session ───────────────────────────────────────────────────────────────
    const sessionStateRef = useRef({ treeData, rightTreeData, bnkPath, wpkPath, binPath, viewMode, activePane });
    sessionStateRef.current = { treeData, rightTreeData, bnkPath, wpkPath, binPath, viewMode, activePane };

    useEffect(() => () => {
        if (autoSaveSession && (sessionStateRef.current.treeData.length > 0 || sessionStateRef.current.rightTreeData.length > 0)) {
            try { saveSession(sessionStateRef.current, 'AutoSave_Exit'); } catch (e) { log.error('[BnkExtract] auto-save failed', e); }
        }
    }, [autoSaveSession]);

    const handleLoadSession = useCallback(async (session: SessionDetail) => {
        setIsLoading(true);
        setStatusMessage(`Loading session: ${session.name}...`);
        try {
            setBnkPath(session.paths?.bnk || '');
            setWpkPath(session.paths?.wpk || '');
            setBinPath(session.paths?.bin || '');
            setViewMode((session.viewMode as ViewMode) || 'split');
            setActivePane((session.activePane as Pane) || 'left');
            setTreeData(session.treeData || []);
            setRightTreeData(session.rightTreeData || []);
            setStatusMessage(`Loaded session: ${session.name}`);
        } catch (e) {
            setStatusMessage(`Error loading session: ${(e as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // ── Game banks ────────────────────────────────────────────────────────────
    const handleConfirmGameBanks = useCallback(async ({ champion, skinIds, selections, includeVoiceover, includeSfx }: GameBanksConfirm) => {
        const requestItems: GameBanksSelection[] = Array.isArray(selections) && selections.length > 0
            ? selections.filter((item) => item.champion && item.skinIds.length > 0)
            : [{ champion: champion ?? null, skinIds: Array.isArray(skinIds) ? skinIds : [] }];

        if (requestItems.length === 0 || !requestItems.some((r) => r.champion && r.skinIds.length > 0)) {
            setStatusMessage('Select at least one champion skin');
            return;
        }
        if (!includeVoiceover && !includeSfx) {
            setStatusMessage('Enable at least one bank type: VO or SFX');
            return;
        }

        setIsGameBanksLoading(true);
        setGameBanksProgress('Resolving paths...');
        try {
            const leaguePath = (await invoke<string | null>('get_league_path').catch(() => null)) || null;
            const loadedTrees: BnkNode[] = [];
            let lastError = '';
            for (let i = 0; i < requestItems.length; i++) {
                const req = requestItems[i];
                if (!req.champion) continue;
                setGameBanksProgress(`Extracting ${req.champion.name} (${i + 1}/${requestItems.length})...`);
                const result = await extractBnkBanksFromGame({ championName: req.champion.name, leaguePath, skinIds: req.skinIds, includeVoiceover, includeSfx });
                if (!result?.success) { if (result?.error) lastError = result.error; continue; }
                const groups = Array.isArray(result.groups) ? result.groups : [];
                for (const group of groups) {
                    const g = group as { eventsBnk?: string; audioWpk?: string; audioBnk?: string; binPath?: string };
                    const parsed = await loadBanks({ bnkPath: g.eventsBnk || '', wpkPath: g.audioWpk || g.audioBnk || '', binPath: g.binPath || '' });
                    if (parsed?.tree) loadedTrees.push(parsed.tree);
                }
            }
            if (loadedTrees.length === 0) {
                throw new Error(lastError || 'No banks found for the selected champion skins');
            }
            pushToHistory();
            setRightTreeData((prev) => [...prev, ...loadedTrees]);
            setActivePane('right');
            setShowGameBanksModal(false);
            setStatusMessage(`Loaded ${loadedTrees.length} bank group(s)`);
        } catch (e) {
            log.error('[BnkExtract] game banks failed', e);
            setStatusMessage(`Failed to load banks from game: ${(e as Error).message}`);
        } finally {
            setIsGameBanksLoading(false);
            setGameBanksProgress('');
        }
    }, [pushToHistory]);

    // ── Webview file-drop (real absolute paths) ───────────────────────────────
    /* Tauri delivers dropped file/folder paths through the webview drop event, not
       the DOM. The DOM drag handlers stamp the intended target into
       webviewDropTarget; here we read it and route the real paths. */
    const dropHandlersRef = useRef({ applyExternalFiles, importReferenceFiles, handleLeftPaneFolderDrop });
    dropHandlersRef.current = { applyExternalFiles, importReferenceFiles, handleLeftPaneFolderDrop };

    useEffect(() => {
        let unlisten: (() => void) | null = null;
        let active = true;
        void getCurrentWebview().onDragDropEvent((event) => {
            if (event.payload.type !== 'drop') return;
            const paths = event.payload.paths || [];
            const target = webviewDropTarget.current;
            webviewDropTarget.current = null;
            if (paths.length === 0) return;

            const audioPaths = paths.filter((p) => /\.(wem|wav|ogg|mp3)$/i.test(p));
            const { applyExternalFiles: applyFn, importReferenceFiles: importFn, handleLeftPaneFolderDrop: folderFn } = dropHandlersRef.current;

            if (target?.kind === 'node') {
                if (audioPaths.length === 0) { setStatusMessage('Drop a .wem/.wav/.ogg/.mp3 file'); return; }
                const name = audioPaths[0].split(/[\\/]/).pop() || '';
                void applyFn([{ path: audioPaths[0], name }], target.targetId, target.pane);
                return;
            }
            if (target?.kind === 'reference') {
                if (audioPaths.length === 0) { setStatusMessage('Drop .wem/.wav/.ogg/.mp3 files into the reference pane'); return; }
                void importFn(audioPaths);
                return;
            }
            // Left pane / unspecified: a single audio file isn't a mod folder, so
            // treat any non-audio path as a folder for the auto-extract scan.
            const folder = paths.find((p) => !/\.[a-z0-9]{1,5}$/i.test(p));
            if (folder) { folderFn(folder); return; }
            if (audioPaths.length > 0) void importFn(audioPaths);
        }).then((fn) => {
            if (active) unlisten = fn; else fn();
        }).catch((e) => log.error('[BnkExtract] webview drop listener failed', e));
        return () => { active = false; if (unlisten) unlisten(); };
    }, []);

    // ── Hotkeys ───────────────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (showAudioSplitter) return;
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); handleUndo(); }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); handleRedo(); }
            else if (e.key === 'Delete') { e.preventDefault(); handleDeleteSelected(); }
            else if (e.code === 'Space') { e.preventDefault(); handlePlaySelected(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showAudioSplitter, handleUndo, handleRedo, handleDeleteSelected, handlePlaySelected]);

    // referenced for future status counts / shift-select / gain-target routing
    void countNodes;
    void lastSelectedId;
    void gainTargetPane;

    return (
        <Box className="bnk-extract-container" sx={containerStyle}>
            <BnkInstallModal
                open={showInstallModal}
                isInstalling={isInstalling}
                installProgress={installProgress}
                onCancel={() => { setShowInstallModal(false); pendingConversion.current = null; }}
                onInstall={handleInstallWwise}
            />

            <BnkConvertOverlay open={showConvertOverlay} convertStatus={convertStatus} />

            <BnkGainModal
                open={showGainDialog}
                onClose={() => setShowGainDialog(false)}
                gainTargetNodeId={gainTargetNodeId}
                gainDb={gainDb}
                setGainDb={setGainDb}
                onApply={handleApplyGain}
            />

            <BnkHeaderPanel
                headerStyle={headerStyle}
                statusMessage={statusMessage}
                showAudioSplitter={showAudioSplitter}
                setSplitterInitialFile={setSplitterInitialFile}
                setShowAudioSplitter={setShowAudioSplitter}
                viewMode={viewMode}
                setViewMode={setViewMode}
                activePane={activePane}
                setActivePane={setActivePane}
                binPath={binPath}
                setBinPath={setBinPath}
                wpkPath={wpkPath}
                setWpkPath={setWpkPath}
                bnkPath={bnkPath}
                setBnkPath={setBnkPath}
                handleSelectFile={handleSelectFile}
                handleParseFiles={handleParseFiles}
                isLoading={isLoading}
                handleClearPane={handleClearPane}
                onSessionClick={() => setShowSessionManager(true)}
                setAutoExtractOpen={setAutoExtractOpen}
                onOpenGameBanks={() => setShowGameBanksModal(true)}
            />

            <AutoExtractDialog
                open={autoExtractOpen}
                onClose={() => setAutoExtractOpen(false)}
                onProcess={handleAutoExtractProcess}
            />

            <BnkLoadingOverlay isLoading={isLoading} autoExtractOpen={autoExtractOpen} statusMessage={statusMessage} />

            <BnkMainContent
                mainContentStyle={mainContentStyle}
                treeViewStyle={treeViewStyle}
                sidebarStyle={sidebarStyle}
                viewMode={viewMode}
                activePane={activePane}
                leftSearchQuery={leftSearchQuery}
                setLeftSearchQuery={setLeftSearchQuery}
                filteredLeftTree={filteredLeftTree}
                selectedNodes={selectedNodes}
                setSelectedNodes={setSelectedNodes}
                setLastSelectedId={setLastSelectedId}
                handleNodeSelect={handleNodeSelect}
                playAudio={(n) => void playAudio(n)}
                handleContextMenu={handleContextMenu}
                expandedNodes={expandedNodes}
                handleToggleExpand={handleToggleExpand}
                handleDropReplace={handleDropReplace}
                handleAutoMatchByEventName={() => setShowAutoMatchModal(true)}
                handleExternalFileDrop={handleExternalFileDrop}
                rightPaneDragOver={rightPaneDragOver}
                handleRightPaneDragOver={handleRightPaneDragOver}
                handleRightPaneDragLeave={handleRightPaneDragLeave}
                handleRightPaneFileDrop={handleRightPaneFileDrop}
                rightSearchQuery={rightSearchQuery}
                setRightSearchQuery={setRightSearchQuery}
                rightSortMode={rightSortMode}
                setRightSortMode={setRightSortMode}
                leftSortMode={leftSortMode}
                setLeftSortMode={setLeftSortMode}
                filteredRightTree={filteredRightTree}
                rightSelectedNodes={rightSelectedNodes}
                setRightSelectedNodes={setRightSelectedNodes}
                rightExpandedNodes={rightExpandedNodes}
                handleUndo={handleUndo}
                undoStack={undoStack}
                handleRedo={handleRedo}
                redoStack={redoStack}
                handleExtract={() => void handleExtract()}
                handleReplace={() => void handleReplace()}
                hasAudioSelection={hasAudioSelection}
                handleMakeSilent={handleMakeSilent}
                handleSave={() => void handleSave()}
                hasRootSelection={hasRootSelection}
                handlePlaySelected={handlePlaySelected}
                stopAudio={stopAudio}
                volume={volume}
                setVolume={setVolume}
                treeData={treeData}
                rightTreeData={rightTreeData}
                setShowSettingsModal={setShowSettingsModal}
                onLeftPaneFolderDrop={handleLeftPaneFolderDrop}
                stampDropTarget={(t) => { webviewDropTarget.current = { kind: t }; }}
            />

            <BnkContextMenu
                contextMenu={contextMenu}
                onClose={handleCloseContextMenu}
                onPlay={() => { if (contextMenu?.node?.audioData) void playAudio(contextMenu.node); handleCloseContextMenu(); }}
                onExtract={() => { void handleExtract(); handleCloseContextMenu(); }}
                onReplace={() => { void handleReplace(); handleCloseContextMenu(); }}
                onMakeSilent={handleMakeSilent}
                onAdjustGain={() => {
                    const pane = contextMenu?.pane || 'left';
                    const nodeIds = getContextTargetIds();
                    setGainTargetPane(pane);
                    gainTargetNodeIds.current = nodeIds;
                    setGainTargetNodeId(nodeIds.length === 1 ? nodeIds[0] : null);
                    handleCloseContextMenu();
                    setShowGainDialog(true);
                }}
                onOpenInSplitter={handleOpenInSplitter}
                onDeleteNode={handleDeleteNode}
                onCopyName={handleCopyName}
                onCreateGroup={() => { pendingGroupIds.current = getContextTargetIds(); handleCloseContextMenu(); setGroupNameModalOpen(true); }}
                showCreateGroup={contextMenu?.pane === 'right' && !!contextMenu?.node?.id}
                onAddToGroup={() => { pendingGroupIds.current = getContextTargetIds(); handleCloseContextMenu(); setAddToGroupModalOpen(true); }}
                showAddToGroup={contextMenu?.pane === 'right' && !!contextMenu?.node?.id && collectRightGroups(rightTreeData).length > 0}
                onRemoveFromGroup={() => { pendingGroupIds.current = getContextTargetIds(); handleCloseContextMenu(); handleRemoveFromGroup(); }}
                showRemoveFromGroup={contextMenu?.pane === 'right' && !!contextMenu?.node?.id && isNodeInGroup(contextMenu.node.id, rightTreeData)}
                isWwiseInstalled={isWwiseInstalled}
            />

            <BnkSettingsModal
                showSettingsModal={showSettingsModal}
                setShowSettingsModal={setShowSettingsModal}
                extractFormats={extractFormats}
                setExtractFormats={setExtractFormats}
                mp3Bitrate={mp3Bitrate}
                setMp3Bitrate={setMp3Bitrate}
                autoPlay={autoPlay}
                setAutoPlay={setAutoPlay}
                multiSelect={multiSelect}
                setMultiSelect={setMultiSelect}
            />

            <AudioSplitter
                open={showAudioSplitter}
                onClose={() => setShowAudioSplitter(false)}
                initialFile={splitterInitialFile}
                onReplace={handleSplitterReplace}
                onExportSegments={handleSplitterExportSegments}
            />

            <BnkAutoMatchConfirmModal
                open={showAutoMatchModal}
                onClose={() => setShowAutoMatchModal(false)}
                onConfirm={handleAutoMatchByEventName}
            />

            <BnkModDropModal
                open={modDropModalOpen}
                folderName={pendingModFolder ? (pendingModFolder.split(/[\\/]/).pop() || '') : ''}
                onConfirm={handleModDropConfirm}
                onCancel={() => { setModDropModalOpen(false); setPendingModFolder(null); }}
            />

            <BnkGroupNameModal
                open={groupNameModalOpen}
                count={pendingGroupIds.current.length}
                onConfirm={handleCreateGroup}
                onCancel={() => setGroupNameModalOpen(false)}
            />

            <BnkAddToGroupModal
                open={addToGroupModalOpen}
                count={pendingGroupIds.current.length}
                groups={collectRightGroups(rightTreeData)}
                onConfirm={handleAddToGroup}
                onCancel={() => setAddToGroupModalOpen(false)}
            />

            <BnkSessionManager
                open={showSessionManager}
                onClose={() => setShowSessionManager(false)}
                currentState={sessionStateRef.current}
                onLoadSession={handleLoadSession}
                autoSaveEnabled={autoSaveSession}
                setAutoSaveEnabled={setAutoSaveSession}
            />

            <BnkGameBanksModal
                open={showGameBanksModal}
                loading={isGameBanksLoading}
                progressText={gameBanksProgress}
                onClose={() => { if (isGameBanksLoading) return; setShowGameBanksModal(false); }}
                onConfirm={handleConfirmGameBanks}
            />
        </Box>
    );
}

export default BnkExtract;
