/* BnkExtract - Audio Bank Extraction and Editing Tool.
   Faithful port of the Electron Quartz page: BIN/WPK/BNK inputs, parse, single
   and split tree views with an active-pane toggle, dual multi-select tree panes,
   the audio splitter overlay, the session / auto-extract / game-banks toolbar,
   the playback footer, per-format extract and the full context-menu + modal set.

   Backend: BNK/WPK parsing, WEM decode and Wwise Vorbis encode all live behind
   the bnk_* / audio_* Tauri commands, wrapped by ./bnkextract/utils/backend.ts.
   Everything runs in-process — there is no external toolchain. The audio splitter
   renders its waveform with wavesurfer.js — see AudioSplitter.tsx. */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Box } from '@mui/material';
import { ContentCut, ViewStream, VerticalSplit, Undo, Redo, Delete, AutoFixHigh, SportsEsports } from '@mui/icons-material';
import { pickPath } from '@/components/explorer';
import { log } from '@/lib/util/logger';

import AutoExtractDialog from './bnkextract/components/AutoExtractDialog';
import AudioSplitter from './bnkextract/components/AudioSplitter';
import BnkMainContent from './bnkextract/components/BnkMainContent';
import BnkSettingsModal from './bnkextract/components/BnkSettingsModal';
import BnkConvertOverlay from './bnkextract/components/BnkConvertOverlay';
import BnkGainModal from './bnkextract/components/BnkGainModal';
import BnkContextMenu from './bnkextract/components/BnkContextMenu';
import BnkLoadingOverlay from './bnkextract/components/BnkLoadingOverlay';
import BnkAutoMatchConfirmModal from './bnkextract/components/BnkAutoMatchConfirmModal';
import BnkModDropModal from './bnkextract/components/BnkModDropModal';
import BnkGroupNameModal from './bnkextract/components/BnkGroupNameModal';
import BnkAddToGroupModal from './bnkextract/components/BnkAddToGroupModal';
import LoadFromGameModal from './port/components/modals/PortDonorFromGameModal';
import type { BanksConfirmArgs } from './port/components/modals/donor/types';

import {
    loadBanks, wemToPlayable, extractNodes, saveBank,
    getModFiles, extractBnkBanksFromGame, pickDirectory, locateBanksForBin,
    convertToWem, convertWavsToWem, amplifyWem, silenceWem, readFileBytes,
} from './bnkextract/utils/backend';
import { invoke } from '@tauri-apps/api/core';
import { useFileDrop, type FileDropPosition } from '@/lib/util/useFileDrop';
import {
    containerStyle, mainContentStyle, treeViewStyle, sidebarStyle,
} from './bnkextract/styles';
import type {
    AutoExtractRequest, BnkNode, ContextMenuState, ExtractFormat, GameBanksConfirm, GameBanksSelection,
    HistoryEntry, LastSelected, ModFileSet, Pane, SortMode, SplitterFile, SplitterSegment, ViewMode,
} from './bnkextract/types';
import './bnkextract/BnkExtract.css';

const VOLUME_KEY = 'bnk-extract-volume';
const FORMATS_KEY = 'bnk-extract-formats';
const MP3_KEY = 'bnk-extract-mp3-bitrate';

/* One pane's BIN/Audio(WPK)/Events(BNK) file paths. */
export type PathSet = { bin: string; wpk: string; bnk: string };

// ── playback format sniffing ─────────────────────────────────────────────────
/* WAVE format tags the browser's <audio> can actually decode. A Wwise WEM is
   also a RIFF/WAVE file, but its fmt tag is a Wwise codec (0xFFFF extensible
   Vorbis, 0x0166 XMA, ...) that Chromium cannot play, so the container magic
   alone is not enough to decide. */
const PLAYABLE_WAVE_FORMATS = new Set([
    0x0001, // PCM
    0x0003, // IEEE float
    0x0006, // A-law
    0x0007, // mu-law
]);

/** Read the `fmt ` chunk's format tag from a RIFF/WAVE buffer, or null if the
 *  buffer has no readable `fmt ` chunk. Walks the chunk list rather than
 *  assuming `fmt ` sits at offset 20, since WEMs often carry other chunks first. */
function waveFormatTag(bytes: Uint8Array): number | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 12; // past "RIFF" + size + "WAVE"
    while (offset + 8 <= bytes.length) {
        const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
        const size = view.getUint32(offset + 4, true);
        if (id === 'fmt ') {
            return offset + 10 <= bytes.length ? view.getUint16(offset + 8, true) : null;
        }
        // Chunks are word-aligned.
        offset += 8 + size + (size & 1);
    }
    return null;
}

/** Can this buffer go straight to <audio>, or must Rust decode it first? */
function browserPlayable(bytes: Uint8Array): boolean {
    if (bytes.length < 12) return false;
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic === 'OggS') return true;
    if (magic === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return true; // MP3
    if (magic !== 'RIFF') return false;
    const tag = waveFormatTag(bytes);
    return tag !== null && PLAYABLE_WAVE_FORMATS.has(tag);
}

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
    // ── Per-pane file inputs ──────────────────────────────────────────────────
    // Each pane (left = Main Bank, right = Reference) owns its own BIN/Audio/Events
    // triple and parses independently into itself via its empty-state load block.
    const [leftPaths, setLeftPaths] = useState<PathSet>({ bin: '', wpk: '', bnk: '' });
    const [rightPaths, setRightPaths] = useState<PathSet>({ bin: '', wpk: '', bnk: '' });

    // ── Settings ──────────────────────────────────────────────────────────────
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
    // Parse-only loading state, scoped to the pane being parsed. Renders a
    // small pane-local spinner instead of the full-window blur backdrop that
    // `isLoading` triggers (which we keep for extract/save/auto-extract).
    const [parsingPane, setParsingPane] = useState<Pane | null>(null);
    const [statusMessage, setStatusMessage] = useState('Ready');
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [rightPaneDragOver, setRightPaneDragOver] = useState(false);
    const [leftDragOver, setLeftDragOver] = useState(false);
    const [rightSortMode, setRightSortMode] = useState<SortMode>('name-asc');
    const [leftSortMode, setLeftSortMode] = useState<SortMode>('name-asc');

    // ── Wwise conversion state ────────────────────────────────────────────────
    const [showConvertOverlay, setShowConvertOverlay] = useState(false);
    const [convertStatus, setConvertStatus] = useState('');

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
    const [modDropModalOpen, setModDropModalOpen] = useState(false);
    const [pendingModFolder, setPendingModFolder] = useState<string | null>(null);
    // Which pane the pending mod folder was dropped on, so the parsed banks load
    // back into that pane rather than always the main one.
    const pendingModFolderPane = useRef<Pane>('left');
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
    // Object URL of the clip currently loaded into `audioRef`, so it can be
    // revoked when playback stops or another clip replaces it.
    const playingUrlRef = useRef<string | null>(null);

    const pendingGroupIds = useRef<string[]>([]);


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
    }, []);

    // ── Playback ──────────────────────────────────────────────────────────────
    const stopAudio = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.removeAttribute('src');
        }
        if (playingUrlRef.current) {
            URL.revokeObjectURL(playingUrlRef.current);
            playingUrlRef.current = null;
        }
        setStatusMessage('Playback stopped');
    }, []);

    const playAudio = useCallback(async (node: BnkNode) => {
        if (!autoPlay || !node.audioData) return;
        stopAudio();
        try {
            setStatusMessage(`Playing ${node.name}...`);
            const raw = node.audioData.data;
            // Decide by INSPECTING the bytes, never by the node name: an imported
            // file keeps its original `.wav`/`.mp3` name while its bytes are
            // transcoded to WEM, and a WEM is itself a RIFF container. Trusting
            // the extension handed raw Wwise-Vorbis to <audio> as audio/wav,
            // which fails with NotSupportedError.
            const playable = browserPlayable(raw)
                ? raw
                // Decode the WEM to a playable OGG/WAV container in Rust.
                : await wemToPlayable(raw);
            if (!playable || playable.length === 0) {
                setStatusMessage(`Cannot decode ${node.name} for playback`);
                return;
            }
            const magic = String.fromCharCode(playable[0], playable[1], playable[2], playable[3]);
            const mime = magic === 'RIFF' ? 'audio/wav' : magic === 'OggS' ? 'audio/ogg' : 'audio/mpeg';
            const blob = new Blob([playable as BlobPart], { type: mime });
            const url = URL.createObjectURL(blob);
            // Release the previous clip's blob before replacing it.
            if (playingUrlRef.current) URL.revokeObjectURL(playingUrlRef.current);
            playingUrlRef.current = url;
            if (!audioRef.current) audioRef.current = new Audio();
            audioRef.current.src = url;
            audioRef.current.volume = volume / 100;
            // The URL stays alive (owned by playingUrlRef) so the clip can be
            // replayed; it is revoked when another clip loads or playback stops.
            audioRef.current.onended = () => setStatusMessage('Ready');
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

    // ── File picking + parse (per pane) ───────────────────────────────────────
    const handleSelectFile = useCallback(async (pane: Pane, kind: keyof PathSet) => {
        const exts = kind === 'bin' ? ['bin'] : kind === 'wpk' ? ['wpk', 'bnk'] : ['bnk'];
        const picked = await pickPath({ mode: 'file', filters: [{ name: kind.toUpperCase(), extensions: exts }, { name: 'All Files', extensions: ['*'] }] });
        if (typeof picked !== 'string') return;
        const setter = pane === 'right' ? setRightPaths : setLeftPaths;
        setter((prev) => ({ ...prev, [kind]: picked }));

        /* Picking the BIN is enough to find its banks: they share a skin number
           and a mod root, which is the same pairing a folder drop resolves. Only
           empty fields are filled, so an explicit choice is never overwritten. */
        if (kind !== 'bin') return;
        const located = await locateBanksForBin(picked);
        if (!located) return;
        setter((prev) => ({
            ...prev,
            wpk: prev.wpk || located.audio,
            bnk: prev.bnk || located.events,
        }));
        if (located.audio) {
            setStatusMessage(`Found ${located.events ? 'audio + events banks' : 'audio bank'}`);
        }
    }, []);

    const handleSetPath = useCallback((pane: Pane, kind: keyof PathSet, value: string) => {
        const setter = pane === 'right' ? setRightPaths : setLeftPaths;
        setter((prev) => ({ ...prev, [kind]: value }));
    }, []);

    const handleParseFiles = useCallback(async (pane: Pane) => {
        const paths = pane === 'right' ? rightPaths : leftPaths;
        // Pane-scoped spinner instead of the full-window blur — the rest of
        // the app stays interactive while one pane parses.
        setParsingPane(pane);
        setStatusMessage('Parsing...');
        try {
            pushToHistory();
            const result = await loadBanks({ bnkPath: paths.bnk, wpkPath: paths.wpk, binPath: paths.bin });
            if (result?.tree) {
                if (pane === 'right') setRightTreeData((prev) => [...prev, result.tree]);
                else setTreeData((prev) => [...prev, result.tree]);
                setStatusMessage(`Loaded ${result.fileCount} audio file(s)`);
            } else {
                setStatusMessage('Nothing parsed');
            }
        } catch (e) {
            log.error('[BnkExtract] parse failed', e);
            setStatusMessage(`Parse failed: ${(e as Error).message}`);
        } finally {
            setParsingPane(null);
        }
    }, [leftPaths, rightPaths, pushToHistory]);

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

    /* Right-click on empty pane space (not a row). Opens the same menu with no
       target node, so only the pane-level actions show (e.g. New Folder). */
    const handlePaneContextMenu = useCallback((e: React.MouseEvent, pane: Pane) => {
        if ((e.target as HTMLElement).closest('[data-node-id]')) return; // a row handles its own
        e.preventDefault();
        setActivePane(pane);
        setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, pane });
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

    // BNK event trees may expose the same underlying WEM in several branches.
    // Mutating only the clicked row leaves duplicate event nodes with the old
    // bytes; the bank writer then deduplicates by WEM id and can retain that
    // unchanged copy. Old Quartz therefore applied silence to every node that
    // references any selected WEM id, which is the behavior we preserve here.
    const applyAudioToWemIds = useCallback((pane: Pane, wemIds: Set<number>, data: Uint8Array) => {
        const patch = (nodes: BnkNode[]): BnkNode[] => nodes.map((n) => {
            if (n.audioData && wemIds.has(n.audioData.id)) {
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
    }, [hasAudioSelection, collectSelectedAudioNodes, activePane, pushToHistory, applyAudioToNodes]);

    const handleMakeSilent = useCallback((options?: { pane?: Pane; nodeIds?: string[] }) => {
        const pane = options?.pane ?? activePane;
        const tree = pane === 'left' ? treeData : rightTreeData;
        const selected = options?.nodeIds?.length
            ? new Set(options.nodeIds)
            : (pane === 'left' ? selectedNodes : rightSelectedNodes);

        if (selected.size === 0) {
            setStatusMessage('Select tracks to silence first');
            return;
        }

        const targets: BnkNode[] = [];
        const collectedNodeIds = new Set<string>();
        for (const id of selected) {
            const node = findNode(tree, id);
            if (!node) continue;
            const audioNodes = collectAudioUnder(node);
            for (const audioNode of audioNodes) {
                if (!collectedNodeIds.has(audioNode.id)) {
                    collectedNodeIds.add(audioNode.id);
                    targets.push(audioNode);
                }
            }
        }
        if (targets.length === 0) {
            setStatusMessage('No audio files found in selection');
            handleCloseContextMenu();
            return;
        }

        const wemIds = new Set(targets.map((node) => node.audioData!.id));
        let silencedEvents = 0;
        const countMatches = (nodes: BnkNode[]) => {
            for (const node of nodes) {
                if (node.audioData && wemIds.has(node.audioData.id)) silencedEvents += 1;
                if (node.children) countMatches(node.children);
            }
        };
        countMatches(tree);

        let silentAudio: Uint8Array;
        try {
            silentAudio = silenceWem();
        } catch (error) {
            log.error('[BnkExtract] failed to load silence WEM', error);
            setStatusMessage(`Make Silent failed: ${(error as Error).message}`);
            handleCloseContextMenu();
            return;
        }

        pushToHistory();
        applyAudioToWemIds(pane, wemIds, silentAudio);
        setStatusMessage(
            silencedEvents > wemIds.size
                ? `Silenced ${wemIds.size} WEM(s) across ${silencedEvents} event(s)`
                : `Silenced ${silencedEvents} track(s)`,
        );
        handleCloseContextMenu();
    }, [activePane, treeData, rightTreeData, selectedNodes, rightSelectedNodes, pushToHistory, applyAudioToWemIds, handleCloseContextMenu]);

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
    /* Drag one or more right-pane (reference) nodes onto a left-pane (main)
       node. Works for sounds, groups, or whole events: every audio leaf under
       the dragged sources is paired 1-to-1 with every audio leaf under the
       drop target (cycling the source list if the target has more leaves).
       Each replacement is keyed by the target's wem id so events that share
       the same underlying wem all update together — matching old Quartz. */
    const handleDropReplace = useCallback((ids: string[], targetId: string) => {
        const sourceLeaves: BnkNode[] = [];
        for (const id of ids) {
            const n = findNode(rightTreeData, id);
            if (n) collectAudioUnder(n, sourceLeaves);
        }
        const sources = sourceLeaves.filter((n) => n.audioData?.data?.length);
        if (sources.length === 0) { setStatusMessage('No audio in reference selection'); return; }

        const target = findNode(treeData, targetId);
        if (!target) { setStatusMessage('Drop target not found'); return; }
        const targetLeaves: BnkNode[] = [];
        collectAudioUnder(target, targetLeaves);
        if (targetLeaves.length === 0) { setStatusMessage('Drop target has no audio'); return; }

        // Map target-wem-id -> replacement bytes. First write wins per id so a
        // shared wem doesn't get overwritten later in the loop by a different
        // source (which would break the "all references stay consistent" invariant).
        const wemIdToData = new Map<number, Uint8Array>();
        targetLeaves.forEach((t, i) => {
            if (t.audioData?.id == null) return;
            const src = sources[i % sources.length];
            if (src.audioData?.data && !wemIdToData.has(t.audioData.id)) {
                wemIdToData.set(t.audioData.id, src.audioData.data);
            }
        });
        if (wemIdToData.size === 0) { setStatusMessage('Nothing to replace'); return; }

        pushToHistory();
        // Single tree walk that hits every node whose wem id is in the map,
        // propagating across shared wems so duplicate event branches stay in sync.
        const patch = (nodes: BnkNode[]): BnkNode[] => nodes.map((n) => {
            const data = n.audioData ? wemIdToData.get(n.audioData.id) : undefined;
            if (data && n.audioData) {
                return {
                    ...n,
                    isModified: true,
                    audioData: { ...n.audioData, data, length: data.length, isModified: true },
                };
            }
            if (n.children) return { ...n, children: patch(n.children) };
            return n;
        });
        setTreeData((p) => patch(p));
        setStatusMessage(`Replaced ${wemIdToData.size} wem(s) across ${target.name}`);
    }, [rightTreeData, treeData, pushToHistory]);

    /* Convert dropped wem/wav/ogg/mp3 files to WEM and apply to the target node. */
    const applyExternalFiles = useCallback(async (files: { path: string; name: string }[], targetId: string, pane: Pane) => {
        const file = files.find((f) => /\.(wem|wav|ogg|mp3)$/i.test(f.name));
        if (!file) return;
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
    }, [pushToHistory, applyAudioToNodes]);

    /* External file→node drops are routed by the OS drag-drop listener (via cursor
       hit-test), so the DOM handler is a no-op. Internal node→node drags still flow
       through TreeNode's own DOM handlers. */
    const handleExternalFileDrop = useCallback(() => { }, []);

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
        // A real folder: the row renders its own live count, so the name must not
        // bake one in (it would go stale as soon as anything is moved in or out).
        const group: BnkNode = { id: `refgroup_${Date.now()}`, name: 'Imported', children, isFolder: true };
        setRightTreeData((prev) => [...prev, group]);
        setRightExpandedNodes((prev) => new Set(prev).add(group.id));
        setActivePane('right');
        setStatusMessage(`Imported ${children.length} reference file(s)`);
    }, [pushToHistory]);

    /* The OS drag-drop listener imports the real paths; the DOM handler only clears
       the drag-over highlight. */
    const handleRightPaneFileDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setRightPaneDragOver(false);
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
    }, [gainDb, gainTargetPane, selectedNodes, rightSelectedNodes, treeData, rightTreeData, pushToHistory]);

    // ── Splitter actions ──────────────────────────────────────────────────────
    const handleOpenInSplitter = useCallback(() => {
        const node = contextMenu?.node;
        const pane = contextMenu?.pane || activePane;
        handleCloseContextMenu();
        setSplitterInitialFile(node ? {
            nodeId: node.id,
            name: node.name,
            pane,
            isWem: !!node.audioData,
            data: node.audioData?.data,
        } : null);
        setShowAudioSplitter(true);
    }, [contextMenu, activePane, handleCloseContextMenu]);

    const handleSplitterReplace = useCallback((data: Uint8Array, nodeId: string, pane?: string) => {
        if (!data?.length || !nodeId) return;
        pushToHistory();
        applyAudioToNodes((pane as Pane) || 'left', new Set([nodeId]), data);
        setStatusMessage('Replaced source with edited audio');
    }, [pushToHistory, applyAudioToNodes]);

    const handleSplitterExportSegments = useCallback(async (segments: SplitterSegment[]) => {
        if (segments.length === 0) return;
        setShowConvertOverlay(true);
        setConvertStatus(`Converting ${segments.length} segment(s)...`);
        try {
            const timestamp = Date.now();
            const converted = await convertWavsToWem(segments);
            const audioNodes: BnkNode[] = converted.flatMap((result, index) => {
                if (!result.data?.length) {
                    log.warn(`[AudioSplitter] ${result.name} was not converted`, result.error);
                    return [];
                }
                const baseName = result.name.replace(/\.\w+$/, '');
                return [{
                    id: `split-segment-${timestamp}-${index}`,
                    name: `${baseName}.wem`,
                    isModified: true,
                    audioData: {
                        id: timestamp + index,
                        data: result.data,
                        offset: 0,
                        length: result.data.length,
                        isModified: true,
                    },
                    children: [],
                }];
            });

            if (audioNodes.length === 0) {
                throw new Error(converted.find((result) => result.error)?.error || 'No segments could be converted');
            }

            pushToHistory();
            setRightTreeData((previous) => {
                const rootIndex = previous.findIndex((node) => node.id === '__split-segments-root__');
                if (rootIndex < 0) {
                    return [{
                        id: '__split-segments-root__',
                        name: 'Split Segments',
                        isRoot: true,
                        children: audioNodes,
                    }, ...previous];
                }
                const next = [...previous];
                next[rootIndex] = {
                    ...next[rootIndex],
                    children: [...(next[rootIndex].children || []), ...audioNodes],
                };
                return next;
            });
            setRightExpandedNodes((previous) => new Set(previous).add('__split-segments-root__'));
            setViewMode('split');
            const failed = segments.length - audioNodes.length;
            setStatusMessage(failed > 0
                ? `Pushed ${audioNodes.length} segment(s); ${failed} failed conversion`
                : `Converted and pushed ${audioNodes.length} segment(s) to the reference pane`);
        } catch (error) {
            setStatusMessage(`Segment export failed: ${(error as Error).message}`);
            throw error;
        } finally {
            setShowConvertOverlay(false);
            setConvertStatus('');
        }
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
                    // Root label mirrors old Quartz: "<modFolderName> [<audioFileName>]"
                    // (e.g. "MyMod_VO [aatrox_base_vo_audio.bnk]").
                    const bankFileName = (set.audio || '').split(/[\\/]/).pop() || '';
                    const rootLabel = set.modFolderName
                        ? `${set.modFolderName} [${bankFileName}]`
                        : bankFileName || result.tree.name;
                    loaded.push({ ...result.tree, name: rootLabel });
                }
            }
            if (loaded.length === 0) { setStatusMessage('Nothing parsed from mod folder'); return; }

            if (req?.loadToTree !== false) {
                pushToHistory();
                const setTree = req?.targetPane === 'right' ? setRightTreeData : setTreeData;
                setTree((prev) => [...prev, ...loaded]);
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

    /* A mod folder dropped on either pane: ask which skin, then load the parsed
       banks into the pane it was dropped on. */
    const handleLeftPaneFolderDrop = useCallback((folderPath: string, pane: Pane = 'left') => {
        setPendingModFolder(folderPath);
        pendingModFolderPane.current = pane;
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
            // Name each set "<folder>_<TYPE>" (e.g. MyMod_VO / MyMod_SFX) when a type
            // was detected, else just the folder name — matching old Quartz.
            const folderName = folderPath.split(/[\\/]/).pop() || '';
            const batchFiles = sets.map((s) => ({
                ...s,
                modFolderName: s.type ? `${folderName}_${s.type}` : folderName,
            }));
            await handleAutoExtractProcess({
                batchFiles,
                outputPath: null,
                loadToTree: true,
                skinId: skinId ?? undefined,
                targetPane: pendingModFolderPane.current,
            });
        } catch (e) {
            setStatusMessage(`Mod folder error: ${(e as Error).message}`);
        }
    }, [pendingModFolder, handleAutoExtractProcess]);

    // ── Groups (right pane) ───────────────────────────────────────────────────
    /* Only user-created folders. Every parsed bank, event, and wem-id container
       also has children, so matching on `children` alone listed the entire tree
       as a drop target. */
    const collectRightGroups = useCallback((nodes: BnkNode[], result: BnkNode[] = []): BnkNode[] => {
        for (const node of nodes) {
            if (node.isFolder) result.push(node);
            if (node.children) collectRightGroups(node.children, result);
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

    /* Create an EMPTY folder in the reference pane. It deliberately does not move
       the current selection into it - use "Add to Group..." or drag files in. */
    const handleCreateGroup = useCallback((groupName: string) => {
        setGroupNameModalOpen(false);
        pushToHistory();
        setRightTreeData((prev) => [...prev, { id: `group_${Date.now()}`, name: groupName, children: [], isFolder: true }]);
        setRightSelectedNodes(new Set());
        setStatusMessage(`Created folder "${groupName}"`);
    }, [pushToHistory]);

    /* Move sounds into a folder, or back out to the pane root (targetFolderId =
       null). Only audio leaves move - folders and parsed bank/event containers
       stay where they are, which keeps this a single lift-and-insert with no
       self-containment cases to guard against. */
    const handleMoveIntoGroup = useCallback((ids: string[], targetFolderId: string | null) => {
        const wanted = new Set(ids);
        if (wanted.size === 0) return;

        // Lift only the audio leaves, leaving every container in place.
        const lifted: BnkNode[] = [];
        const lift = (nodes: BnkNode[]): BnkNode[] => {
            const kept: BnkNode[] = [];
            for (const n of nodes) {
                if (wanted.has(n.id) && n.audioData) { lifted.push(n); continue; }
                kept.push(n.children ? { ...n, children: lift(n.children) } : n);
            }
            return kept;
        };
        /* A user folder that just lost its last sound is dead weight, so drop it.
           Parsed banks are kept even when empty - they are still the file you
           loaded, and removing them would misrepresent what is open. */
        const pruneEmptyFolders = (nodes: BnkNode[]): BnkNode[] => nodes
            .map((n) => (n.children ? { ...n, children: pruneEmptyFolders(n.children) } : n))
            .filter((n) => !(n.isFolder && n.id !== targetFolderId && (n.children?.length ?? 0) === 0));

        const stripped = pruneEmptyFolders(lift(rightTreeData));
        if (lifted.length === 0) { setStatusMessage('Only sounds can be moved into folders'); return; }

        const label = lifted.length === 1 ? `"${lifted[0].name}"` : `${lifted.length} sounds`;

        pushToHistory();
        setRightSelectedNodes(new Set());

        if (!targetFolderId) {
            setRightTreeData([...stripped, ...lifted]);
            setStatusMessage(`Moved ${label} out of folders`);
            return;
        }

        let folderName = '';
        const insert = (nodes: BnkNode[]): BnkNode[] => nodes.map((n) => {
            if (n.id === targetFolderId) {
                folderName = n.name;
                return { ...n, children: [...(n.children ?? []), ...lifted] };
            }
            return n.children ? { ...n, children: insert(n.children) } : n;
        });
        const next = insert(stripped);
        // Target still exists (folders are never lifted), but stay defensive.
        setRightTreeData(folderName ? next : [...stripped, ...lifted]);
        setStatusMessage(folderName ? `Moved ${label} into "${folderName}"` : `Moved ${label}`);
        // Reveal the result.
        if (folderName) setRightExpandedNodes((prev) => new Set(prev).add(targetFolderId));
    }, [rightTreeData, pushToHistory]);

    const handleAddToGroup = useCallback((groupId: string) => {
        setAddToGroupModalOpen(false);
        // Same operation as a drag onto the folder - share one implementation so
        // the menu and drag paths cannot drift apart.
        handleMoveIntoGroup(pendingGroupIds.current, groupId);
    }, [handleMoveIntoGroup]);

    /* Move sounds back out of their folder to the pane root. */
    const handleRemoveFromGroup = useCallback(() => {
        handleMoveIntoGroup(pendingGroupIds.current, null);
    }, [handleMoveIntoGroup]);

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

    // ── OS file-drop (real absolute paths) ────────────────────────────────────
    /* Tauri's webview File objects carry no disk path, so external file/folder
       drops arrive via the OS drag-drop event (with a cursor position) rather than
       the DOM. We hit-test that position against each pane's rect — the same
       geometry approach Port uses — instead of the old DOM-stamp hand-off, which
       never fires reliably while `dragDropEnabled` is on. This restores the old
       Quartz behavior: drop a mod folder on the main pane to auto-extract, drop a
       .wem/.wav/.ogg/.mp3 on a tree node to replace it, or on the reference pane
       to import. */
    const dropHandlersRef = useRef({ applyExternalFiles, importReferenceFiles, handleLeftPaneFolderDrop });
    dropHandlersRef.current = { applyExternalFiles, importReferenceFiles, handleLeftPaneFolderDrop };

    const rectContains = (el: Element | null, pos: FileDropPosition): boolean => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return pos.x >= r.left && pos.x <= r.right && pos.y >= r.top && pos.y <= r.bottom;
    };

    // Drive the pane drag-over highlight from the OS drag event (Tauri suppresses
    // DOM dragover while dragDropEnabled is on, so a plain onDragOver never fires).
    const updateDragHover = (pos: FileDropPosition) => {
        if (showAudioSplitter) {
            clearDragHover();
            return;
        }
        const rightEl = document.querySelector('.bnk-extract-tree-right');
        const leftEl = document.querySelector('.bnk-extract-tree');
        const overRight = rectContains(rightEl, pos);
        const overLeft = !overRight && rectContains(leftEl, pos);
        setRightPaneDragOver(overRight);
        setLeftDragOver(overLeft);
    };
    const clearDragHover = () => { setRightPaneDragOver(false); setLeftDragOver(false); };

    useFileDrop({
        onEnter: updateDragHover,
        onOver: updateDragHover,
        onLeave: clearDragHover,
        onDrop: (paths, pos) => {
            clearDragHover();
            if (showAudioSplitter) return;
            if (paths.length === 0) return;
            const { applyExternalFiles: applyFn, importReferenceFiles: importFn, handleLeftPaneFolderDrop: folderFn } = dropHandlersRef.current;
            const audioPaths = paths.filter((p) => /\.(wem|wav|ogg|mp3)$/i.test(p));

            const rightEl = document.querySelector('.bnk-extract-tree-right');
            const overRight = rectContains(rightEl, pos);

            // A specific tree row under the cursor → replace that node's audio.
            const nodeEl = (document.elementFromPoint(pos.x, pos.y) as Element | null)?.closest('[data-node-id]');
            const targetNodeId = nodeEl?.getAttribute('data-node-id') || null;
            if (targetNodeId && audioPaths.length > 0) {
                const name = audioPaths[0].split(/[\\/]/).pop() || '';
                void applyFn([{ path: audioPaths[0], name }], targetNodeId, overRight ? 'right' : 'left');
                return;
            }

            // Either pane accepts a mod folder (loaded into the pane it was dropped
            // on) or loose audio. Only the extension check differs, so resolve the
            // directory case first for both.
            const pane: Pane = overRight ? 'right' : 'left';
            void (async () => {
                for (const p of paths) {
                    try {
                        const info = await invoke<{ isDir: boolean }>('explorer_resolve_path', { path: p });
                        if (info?.isDir) { folderFn(p, pane); return; }
                    } catch (e) { log.error('[BnkExtract] resolve path failed', e); }
                }
                if (audioPaths.length > 0) { importFn(audioPaths); return; }
                setStatusMessage('Drop a mod folder, or .wem/.wav/.ogg/.mp3 files');
            })();
        },
    });

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
            <BnkConvertOverlay open={showConvertOverlay} convertStatus={convertStatus} />

            <BnkGainModal
                open={showGainDialog}
                onClose={() => setShowGainDialog(false)}
                gainTargetNodeId={gainTargetNodeId}
                gainDb={gainDb}
                setGainDb={setGainDb}
                onApply={handleApplyGain}
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
                setActivePane={setActivePane}
                leftSearchQuery={leftSearchQuery}
                setLeftSearchQuery={setLeftSearchQuery}
                filteredLeftTree={filteredLeftTree}
                selectedNodes={selectedNodes}
                setSelectedNodes={setSelectedNodes}
                setLastSelectedId={setLastSelectedId}
                handleNodeSelect={handleNodeSelect}
                playAudio={(n) => void playAudio(n)}
                handleContextMenu={handleContextMenu}
                handlePaneContextMenu={handlePaneContextMenu}
                handleMoveIntoGroup={handleMoveIntoGroup}
                expandedNodes={expandedNodes}
                handleToggleExpand={handleToggleExpand}
                handleDropReplace={handleDropReplace}
                handleAutoMatchByEventName={() => setShowAutoMatchModal(true)}
                handleExternalFileDrop={handleExternalFileDrop}
                rightPaneDragOver={rightPaneDragOver}
                leftDragOver={leftDragOver}
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
                leftPaths={leftPaths}
                rightPaths={rightPaths}
                onSelectFile={handleSelectFile}
                onSetPath={handleSetPath}
                onParse={handleParseFiles}
                isLoading={isLoading}
                parsingPane={parsingPane}
            />

            {/* Bottom bar: splitter + view-mode toggles (left), centered status,
                undo/redo + clear (right). Mirrors Port's bottom-bar layout. */}
            <Box className="bnk-bottom-bar">
                <Box className="bnk-bottom-bar__actions">
                    <button
                        className="bnk-action-btn"
                        style={{ '--action-color': showAudioSplitter ? 'var(--accent-primary)' : 'var(--text-secondary)' } as React.CSSProperties}
                        onClick={() => { setSplitterInitialFile(null); setShowAudioSplitter(true); }}
                        title="Audio Splitter - cut audio into segments"
                    >
                        <ContentCut sx={{ fontSize: 18 }} />
                    </button>
                    <button
                        className="bnk-action-btn"
                        style={{ '--action-color': viewMode === 'split' ? 'var(--accent-primary)' : 'var(--text-secondary)' } as React.CSSProperties}
                        onClick={() => setViewMode((prev) => (prev === 'normal' ? 'split' : 'normal'))}
                        title={viewMode === 'normal' ? 'Switch to Split View' : 'Switch to Single View'}
                    >
                        {viewMode === 'normal' ? <ViewStream sx={{ fontSize: 18 }} /> : <VerticalSplit sx={{ fontSize: 18 }} />}
                    </button>
                    <button
                        className="bnk-action-btn"
                        style={{ '--action-color': 'var(--text-secondary)' } as React.CSSProperties}
                        onClick={() => setAutoExtractOpen(true)}
                        title="Mod Auto-Extract"
                    >
                        <AutoFixHigh sx={{ fontSize: 18 }} />
                    </button>
                    <button
                        className="bnk-action-btn"
                        style={{ '--action-color': 'var(--text-secondary)' } as React.CSSProperties}
                        onClick={() => setShowGameBanksModal(true)}
                        title="Load Banks From Game"
                    >
                        <SportsEsports sx={{ fontSize: 18 }} />
                    </button>
                </Box>

                <span className="bnk-bottom-bar__status">{statusMessage}</span>

                <Box className="bnk-bottom-bar__actions">
                    <button
                        className="dl-btn dl-btn--secondary dl-btn--sm dl-btn--icon"
                        onClick={handleUndo}
                        disabled={undoStack.length === 0}
                        title="Undo (Ctrl+Z)"
                    >
                        <span className="dl-icon"><Undo sx={{ fontSize: 15 }} /></span>
                    </button>
                    <button
                        className="dl-btn dl-btn--secondary dl-btn--sm dl-btn--icon"
                        onClick={handleRedo}
                        disabled={redoStack.length === 0}
                        title="Redo (Ctrl+Y)"
                    >
                        <span className="dl-icon"><Redo sx={{ fontSize: 15 }} /></span>
                    </button>
                    <button
                        className="bnk-action-btn"
                        style={{ '--action-color': 'var(--color-danger, #e5484d)' } as React.CSSProperties}
                        onClick={() => handleClearPane(viewMode === 'split' ? activePane : 'left')}
                        title="Clear tree"
                    >
                        <Delete sx={{ fontSize: 18 }} />
                    </button>
                </Box>
            </Box>

            <BnkContextMenu
                contextMenu={contextMenu}
                onClose={handleCloseContextMenu}
                onPlay={() => { if (contextMenu?.node?.audioData) void playAudio(contextMenu.node); handleCloseContextMenu(); }}
                onExtract={() => { void handleExtract(); handleCloseContextMenu(); }}
                onReplace={() => { void handleReplace(); handleCloseContextMenu(); }}
                onMakeSilent={() => handleMakeSilent({
                    pane: contextMenu?.pane ?? activePane,
                    nodeIds: getContextTargetIds(),
                })}
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
                // Creates an empty folder, so it is offered anywhere in the
                // reference pane - including a right-click on blank space.
                showCreateGroup={contextMenu?.pane === 'right'}
                onAddToGroup={() => { pendingGroupIds.current = getContextTargetIds(); handleCloseContextMenu(); setAddToGroupModalOpen(true); }}
                showAddToGroup={contextMenu?.pane === 'right' && !!contextMenu?.node?.id && collectRightGroups(rightTreeData).length > 0}
                onRemoveFromGroup={() => { pendingGroupIds.current = getContextTargetIds(); handleCloseContextMenu(); handleRemoveFromGroup(); }}
                showRemoveFromGroup={contextMenu?.pane === 'right' && !!contextMenu?.node?.id && isNodeInGroup(contextMenu.node.id, rightTreeData)}
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

            <LoadFromGameModal
                mode="banks"
                open={showGameBanksModal}
                loading={isGameBanksLoading}
                progressText={gameBanksProgress}
                onClose={() => { if (isGameBanksLoading) return; setShowGameBanksModal(false); }}
                onConfirm={(args: BanksConfirmArgs) => handleConfirmGameBanks({
                    champion: { id: Number(args.champion.id), name: args.champion.name, alias: args.champion.alias },
                    skinIds: args.skinIds,
                    selections: args.selections.map((selection) => ({
                        champion: {
                            id: Number(selection.champion.id),
                            name: selection.champion.name,
                            alias: selection.champion.alias,
                        },
                        skinIds: selection.skinIds,
                    })),
                    includeVoiceover: args.includeVoiceover,
                    includeSfx: args.includeSfx,
                })}
            />
        </Box>
    );
}

export default BnkExtract;
