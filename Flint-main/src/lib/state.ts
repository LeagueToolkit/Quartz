/**
 * Flint - React State Management
 * Uses React Context for global state with localStorage persistence
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo, ReactNode } from 'react';
import type { AppState, ModalType, Toast, RecentProject, Project, FileTreeNode, Champion, LogEntry, ContextMenuState, ContextMenuOption, ProjectTab, WadChunk, ExtractSession, WadExplorerState, WadExplorerWad, GameWadInfo } from './types';

// =============================================================================
// Initial State
// =============================================================================

const initialState: AppState = {
    // App status
    status: 'ready',
    statusMessage: 'Ready',

    // Context menu
    contextMenu: null,

    // Creator info (for repathing)
    creatorName: null,

    // Hash status
    hashesLoaded: false,
    hashCount: 0,

    // League installation
    leaguePath: null,

    // Project state (tab-based)
    openTabs: [],
    activeTabId: null,
    recentProjects: [],

    // WAD extract sessions
    extractSessions: [],
    activeExtractId: null,

    // WAD Explorer
    wadExplorer: {
        isOpen: false,
        wads: [],
        scanStatus: 'idle',
        scanError: null,
        selected: null,
        expandedWads: new Set<string>(),
        expandedFolders: new Set<string>(),
        searchQuery: '',
    },

    // UI state
    currentView: 'welcome',
    activeModal: null,
    modalOptions: null,

    // Champions (cached)
    champions: [],
    championsLoaded: false,

    // Toast notifications
    toasts: [],

    // Log panel
    logs: [],
    logPanelExpanded: false,

    // Auto-update settings
    autoUpdateEnabled: true,
    skippedUpdateVersion: null,
};

// =============================================================================
// Action Types
// =============================================================================

type Action =
    | { type: 'SET_STATE'; payload: Partial<AppState> }
    | { type: 'SET_STATUS'; payload: { status: AppState['status']; message: string } }
    | { type: 'OPEN_MODAL'; payload: { modal: ModalType; options?: Record<string, unknown> } }
    | { type: 'CLOSE_MODAL' }
    | { type: 'ADD_TOAST'; payload: Toast }
    | { type: 'REMOVE_TOAST'; payload: number }
    // Tab actions
    | { type: 'ADD_TAB'; payload: { project: Project; path: string } }
    | { type: 'REMOVE_TAB'; payload: string }  // tab id
    | { type: 'SWITCH_TAB'; payload: string }  // tab id
    | { type: 'UPDATE_TAB'; payload: { tabId: string; updates: Partial<ProjectTab> } }
    | { type: 'SET_TAB_FILE_TREE'; payload: { tabId: string; fileTree: FileTreeNode | null } }
    | { type: 'TOGGLE_TAB_FOLDER'; payload: { tabId: string; folderPath: string } }
    | { type: 'SET_TAB_SELECTED_FILE'; payload: { tabId: string; filePath: string | null } }
    // Legacy compatibility (redirects to tab actions)
    | { type: 'SET_PROJECT'; payload: { project: Project | null; path: string | null } }
    | { type: 'SET_FILE_TREE'; payload: FileTreeNode | null }
    | { type: 'TOGGLE_FOLDER'; payload: string }
    | { type: 'BULK_SET_FOLDERS'; payload: { paths: string[]; expand: boolean } }
    | { type: 'SET_RECENT_PROJECTS'; payload: RecentProject[] }
    | { type: 'SET_CHAMPIONS'; payload: Champion[] }
    | { type: 'ADD_LOG'; payload: LogEntry }
    | { type: 'CLEAR_LOGS' }
    | { type: 'TOGGLE_LOG_PANEL' }
    | { type: 'OPEN_CONTEXT_MENU'; payload: ContextMenuState }
    | { type: 'CLOSE_CONTEXT_MENU' }
    // WAD Explorer actions
    | { type: 'OPEN_WAD_EXPLORER' }
    | { type: 'CLOSE_WAD_EXPLORER' }
    | { type: 'SET_WAD_EXPLORER_SCAN'; payload: { status: WadExplorerState['scanStatus']; wads?: GameWadInfo[]; error?: string } }
    | { type: 'SET_WAD_EXPLORER_WAD_STATUS'; payload: { wadPath: string; status: WadExplorerWad['status']; chunks?: WadChunk[]; error?: string } }
    | { type: 'BATCH_SET_WAD_STATUSES'; payload: Array<{ wadPath: string; status: WadExplorerWad['status']; chunks?: WadChunk[]; error?: string }> }
    | { type: 'SET_WAD_EXPLORER_SELECTED'; payload: { wadPath: string; hash: string } | null }
    | { type: 'TOGGLE_WAD_EXPLORER_WAD'; payload: string }
    | { type: 'TOGGLE_WAD_EXPLORER_FOLDER'; payload: string }
    | { type: 'BULK_SET_WAD_EXPLORER_FOLDERS'; payload: { keys: string[]; expand: boolean } }
    | { type: 'SET_WAD_EXPLORER_SEARCH'; payload: string }
    // Extract session actions
    | { type: 'OPEN_EXTRACT_SESSION'; payload: { id: string; wadPath: string } }
    | { type: 'CLOSE_EXTRACT_SESSION'; payload: string }
    | { type: 'SWITCH_EXTRACT_TAB'; payload: string }
    | { type: 'SET_EXTRACT_CHUNKS'; payload: { sessionId: string; chunks: WadChunk[] } }
    | { type: 'SET_EXTRACT_PREVIEW'; payload: { sessionId: string; hash: string | null } }
    | { type: 'TOGGLE_EXTRACT_FOLDER'; payload: { sessionId: string; folderPath: string } }
    | { type: 'TOGGLE_EXTRACT_CHUNK'; payload: { sessionId: string; hash: string } }
    | { type: 'SET_EXTRACT_SEARCH'; payload: { sessionId: string; query: string } }
    | { type: 'SET_EXTRACT_LOADING'; payload: { sessionId: string; loading: boolean } };

// =============================================================================
// Reducer
// =============================================================================

// Helper to generate unique tab IDs
let tabIdCounter = 0;
function generateTabId(): string {
    return `tab-${Date.now()}-${++tabIdCounter}`;
}


// Helper to get active tab
function getActiveTab(state: AppState): ProjectTab | null {
    if (!state.activeTabId) return null;
    return state.openTabs.find(t => t.id === state.activeTabId) || null;
}

function appReducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'SET_STATE':
            return { ...state, ...action.payload };

        case 'SET_STATUS':
            return {
                ...state,
                status: action.payload.status,
                statusMessage: action.payload.message,
            };

        case 'OPEN_MODAL':
            return {
                ...state,
                activeModal: action.payload.modal,
                modalOptions: action.payload.options || null,
            };

        case 'CLOSE_MODAL':
            return {
                ...state,
                activeModal: null,
                modalOptions: null,
            };

        case 'ADD_TOAST':
            return {
                ...state,
                toasts: [...state.toasts, action.payload],
            };

        case 'REMOVE_TOAST':
            return {
                ...state,
                toasts: state.toasts.filter(t => t.id !== action.payload),
            };

        // =====================================================================
        // Tab Actions
        // =====================================================================

        case 'ADD_TAB': {
            const { project, path } = action.payload;
            // Check if this project is already open
            const existingTab = state.openTabs.find(t => t.projectPath === path);
            if (existingTab) {
                // Switch to existing tab
                return {
                    ...state,
                    activeTabId: existingTab.id,
                    currentView: 'preview',
                };
            }
            // Create new tab
            const newTab: ProjectTab = {
                id: generateTabId(),
                project,
                projectPath: path,
                selectedFile: null,
                fileTree: null,
                expandedFolders: new Set(),
            };
            return {
                ...state,
                openTabs: [...state.openTabs, newTab],
                activeTabId: newTab.id,
                currentView: 'preview',
            };
        }

        case 'REMOVE_TAB': {
            const tabId = action.payload;
            const newTabs = state.openTabs.filter(t => t.id !== tabId);
            let newActiveId: string | null = state.activeTabId;
            let newView = state.currentView;

            // If we closed the active tab, switch to another
            if (state.activeTabId === tabId) {
                const closedIndex = state.openTabs.findIndex(t => t.id === tabId);
                if (newTabs.length > 0) {
                    // Switch to previous tab, or first if we closed the first
                    const newIndex = Math.max(0, closedIndex - 1);
                    newActiveId = newTabs[newIndex]?.id || null;
                    newView = 'preview';
                } else if (state.extractSessions.length > 0) {
                    // Fall back to an extract session
                    newActiveId = null;
                    newView = 'extract';
                } else if (state.wadExplorer.isOpen) {
                    // Fall back to WAD explorer
                    newActiveId = null;
                    newView = 'wad-explorer';
                } else {
                    newActiveId = null;
                    newView = 'welcome';
                }
            }

            return {
                ...state,
                openTabs: newTabs,
                activeTabId: newActiveId,
                currentView: newView,
            };
        }

        case 'SWITCH_TAB': {
            const tabId = action.payload;
            const tab = state.openTabs.find(t => t.id === tabId);
            if (!tab) return state;
            return {
                ...state,
                activeTabId: tabId,
                // Don't null activeExtractId — it's a "last active" pointer used when switching back
                currentView: 'preview',
            };
        }

        case 'UPDATE_TAB': {
            const { tabId, updates } = action.payload;
            return {
                ...state,
                openTabs: state.openTabs.map(t =>
                    t.id === tabId ? { ...t, ...updates } : t
                ),
            };
        }

        case 'SET_TAB_FILE_TREE': {
            const { tabId, fileTree } = action.payload;
            return {
                ...state,
                openTabs: state.openTabs.map(t =>
                    t.id === tabId ? { ...t, fileTree } : t
                ),
            };
        }

        case 'TOGGLE_TAB_FOLDER': {
            const { tabId, folderPath } = action.payload;
            return {
                ...state,
                openTabs: state.openTabs.map(t => {
                    if (t.id !== tabId) return t;
                    const newExpanded = new Set(t.expandedFolders);
                    if (newExpanded.has(folderPath)) {
                        newExpanded.delete(folderPath);
                    } else {
                        newExpanded.add(folderPath);
                    }
                    return { ...t, expandedFolders: newExpanded };
                }),
            };
        }

        case 'SET_TAB_SELECTED_FILE': {
            const { tabId, filePath } = action.payload;
            return {
                ...state,
                openTabs: state.openTabs.map(t =>
                    t.id === tabId ? { ...t, selectedFile: filePath } : t
                ),
            };
        }

        // =====================================================================
        // Legacy Actions (for backward compatibility - operate on active tab)
        // =====================================================================

        case 'SET_PROJECT': {
            const { project, path } = action.payload;
            if (!project || !path) {
                // Close all tabs
                return {
                    ...state,
                    openTabs: [],
                    activeTabId: null,
                    currentView: 'welcome',
                };
            }
            // Redirect to ADD_TAB
            return appReducer(state, { type: 'ADD_TAB', payload: { project, path } });
        }

        case 'SET_FILE_TREE': {
            const activeTab = getActiveTab(state);
            if (!activeTab) return state;
            return appReducer(state, {
                type: 'SET_TAB_FILE_TREE',
                payload: { tabId: activeTab.id, fileTree: action.payload },
            });
        }

        case 'TOGGLE_FOLDER': {
            const activeTab = getActiveTab(state);
            if (!activeTab) return state;
            return appReducer(state, {
                type: 'TOGGLE_TAB_FOLDER',
                payload: { tabId: activeTab.id, folderPath: action.payload },
            });
        }

        case 'BULK_SET_FOLDERS': {
            const activeTab = getActiveTab(state);
            if (!activeTab) return state;
            const { paths, expand } = action.payload;
            const newExpanded = new Set(activeTab.expandedFolders);
            for (const p of paths) {
                if (expand) newExpanded.add(p);
                else newExpanded.delete(p);
            }
            return {
                ...state,
                openTabs: state.openTabs.map(t =>
                    t.id === activeTab.id ? { ...t, expandedFolders: newExpanded } : t
                ),
            };
        }

        case 'SET_RECENT_PROJECTS':
            return {
                ...state,
                recentProjects: action.payload,
            };

        case 'SET_CHAMPIONS':
            return {
                ...state,
                champions: action.payload,
                championsLoaded: true,
            };

        case 'ADD_LOG':
            return {
                ...state,
                logs: [...state.logs, action.payload].slice(-100), // Keep last 100 logs
            };

        case 'CLEAR_LOGS':
            return {
                ...state,
                logs: [],
            };

        case 'TOGGLE_LOG_PANEL':
            return {
                ...state,
                logPanelExpanded: !state.logPanelExpanded,
            };

        case 'OPEN_CONTEXT_MENU':
            return {
                ...state,
                contextMenu: action.payload,
            };

        case 'CLOSE_CONTEXT_MENU':
            return {
                ...state,
                contextMenu: null,
            };

        // =====================================================================
        // WAD Explorer Actions
        // =====================================================================

        case 'OPEN_WAD_EXPLORER':
            return {
                ...state,
                currentView: 'wad-explorer',
                // Don't null out activeTabId/activeExtractId — they serve as "last active" pointers
                wadExplorer: { ...state.wadExplorer, isOpen: true },
            };

        case 'CLOSE_WAD_EXPLORER': {
            // activeTabId/activeExtractId still point to the last-used tab, use them for fallback
            const fallbackView = state.activeTabId && state.openTabs.find(t => t.id === state.activeTabId)
                ? 'preview'
                : state.activeExtractId && state.extractSessions.find(s => s.id === state.activeExtractId)
                    ? 'extract'
                    : state.openTabs.length > 0 ? 'preview'
                        : state.extractSessions.length > 0 ? 'extract'
                            : 'welcome';
            const fallbackTabId = fallbackView === 'preview'
                ? (state.activeTabId ?? state.openTabs[state.openTabs.length - 1]?.id ?? null)
                : state.activeTabId;
            const fallbackExtractId = fallbackView === 'extract'
                ? (state.activeExtractId ?? state.extractSessions[state.extractSessions.length - 1]?.id ?? null)
                : state.activeExtractId;
            return {
                ...state,
                currentView: fallbackView,
                activeTabId: fallbackTabId,
                activeExtractId: fallbackExtractId,
                wadExplorer: { ...state.wadExplorer, isOpen: false },
            };
        }

        case 'SET_WAD_EXPLORER_SCAN': {
            const { status, wads: gameWads, error } = action.payload;
            const newWads: WadExplorerWad[] = gameWads
                ? gameWads.map(w => ({ ...w, status: 'idle', chunks: [] }))
                : state.wadExplorer.wads;
            return {
                ...state,
                wadExplorer: {
                    ...state.wadExplorer,
                    scanStatus: status,
                    scanError: error ?? null,
                    wads: newWads,
                },
            };
        }

        case 'SET_WAD_EXPLORER_WAD_STATUS': {
            const { wadPath, status: wadStatus, chunks, error } = action.payload;
            return {
                ...state,
                wadExplorer: {
                    ...state.wadExplorer,
                    wads: state.wadExplorer.wads.map(w =>
                        w.path === wadPath
                            ? { ...w, status: wadStatus, chunks: chunks ?? w.chunks, error }
                            : w
                    ),
                },
            };
        }

        case 'BATCH_SET_WAD_STATUSES': {
            const updates = new Map(action.payload.map(u => [u.wadPath, u]));
            return {
                ...state,
                wadExplorer: {
                    ...state.wadExplorer,
                    wads: state.wadExplorer.wads.map(w => {
                        const u = updates.get(w.path);
                        return u ? { ...w, status: u.status, chunks: u.chunks ?? w.chunks, error: u.error } : w;
                    }),
                },
            };
        }

        case 'SET_WAD_EXPLORER_SELECTED':
            return {
                ...state,
                wadExplorer: { ...state.wadExplorer, selected: action.payload },
            };

        case 'TOGGLE_WAD_EXPLORER_WAD': {
            const wadPath = action.payload;
            const newExpanded = new Set(state.wadExplorer.expandedWads);
            if (newExpanded.has(wadPath)) {
                newExpanded.delete(wadPath);
            } else {
                newExpanded.add(wadPath);
            }
            return {
                ...state,
                wadExplorer: { ...state.wadExplorer, expandedWads: newExpanded },
            };
        }

        case 'TOGGLE_WAD_EXPLORER_FOLDER': {
            const key = action.payload;
            const newExpanded = new Set(state.wadExplorer.expandedFolders);
            if (newExpanded.has(key)) {
                newExpanded.delete(key);
            } else {
                newExpanded.add(key);
            }
            return {
                ...state,
                wadExplorer: { ...state.wadExplorer, expandedFolders: newExpanded },
            };
        }

        case 'BULK_SET_WAD_EXPLORER_FOLDERS': {
            const { keys, expand } = action.payload;
            const newExpanded = new Set(state.wadExplorer.expandedFolders);
            for (const k of keys) {
                if (expand) newExpanded.add(k);
                else newExpanded.delete(k);
            }
            return {
                ...state,
                wadExplorer: { ...state.wadExplorer, expandedFolders: newExpanded },
            };
        }

        case 'SET_WAD_EXPLORER_SEARCH':
            return {
                ...state,
                wadExplorer: { ...state.wadExplorer, searchQuery: action.payload },
            };

        // =====================================================================
        // Extract Session Actions
        // =====================================================================

        case 'OPEN_EXTRACT_SESSION': {
            const { id, wadPath } = action.payload;
            const wadName = wadPath.split(/[\\/]/).pop() || wadPath;
            const newSession: ExtractSession = {
                id,
                wadPath,
                wadName,
                chunks: [],
                selectedHashes: new Set(),
                previewHash: null,
                expandedFolders: new Set(),
                searchQuery: '',
                loading: true,
            };
            return {
                ...state,
                extractSessions: [...state.extractSessions, newSession],
                activeExtractId: id,
                // Don't null activeTabId — it's a "last active" pointer used when switching back
                currentView: 'extract',
            };
        }

        case 'CLOSE_EXTRACT_SESSION': {
            const sessionId = action.payload;
            const newSessions = state.extractSessions.filter(s => s.id !== sessionId);
            let newActiveExtractId = state.activeExtractId;
            let newView = state.currentView;

            if (state.activeExtractId === sessionId) {
                // Switch to last remaining extract session, or last project tab, or WAD explorer, or welcome
                if (newSessions.length > 0) {
                    newActiveExtractId = newSessions[newSessions.length - 1].id;
                    newView = 'extract';
                } else if (state.activeTabId && state.openTabs.find(t => t.id === state.activeTabId)) {
                    newActiveExtractId = null;
                    newView = 'preview';
                } else if (state.openTabs.length > 0) {
                    newActiveExtractId = null;
                    newView = 'preview';
                } else if (state.wadExplorer.isOpen) {
                    newActiveExtractId = null;
                    newView = 'wad-explorer';
                } else {
                    newActiveExtractId = null;
                    newView = 'welcome';
                }
            }

            return {
                ...state,
                extractSessions: newSessions,
                activeExtractId: newActiveExtractId,
                currentView: newView,
            };
        }

        case 'SWITCH_EXTRACT_TAB': {
            const sessionId = action.payload;
            if (!state.extractSessions.find(s => s.id === sessionId)) return state;
            return {
                ...state,
                activeExtractId: sessionId,
                // Don't null activeTabId — it's a "last active" pointer used when switching back
                currentView: 'extract',
            };
        }

        case 'SET_EXTRACT_CHUNKS': {
            const { sessionId, chunks } = action.payload;
            return {
                ...state,
                extractSessions: state.extractSessions.map(s =>
                    s.id === sessionId ? { ...s, chunks, loading: false } : s
                ),
            };
        }

        case 'SET_EXTRACT_PREVIEW': {
            const { sessionId, hash } = action.payload;
            return {
                ...state,
                extractSessions: state.extractSessions.map(s =>
                    s.id === sessionId ? { ...s, previewHash: hash } : s
                ),
            };
        }

        case 'TOGGLE_EXTRACT_FOLDER': {
            const { sessionId, folderPath } = action.payload;
            return {
                ...state,
                extractSessions: state.extractSessions.map(s => {
                    if (s.id !== sessionId) return s;
                    const newExpanded = new Set(s.expandedFolders);
                    if (newExpanded.has(folderPath)) {
                        newExpanded.delete(folderPath);
                    } else {
                        newExpanded.add(folderPath);
                    }
                    return { ...s, expandedFolders: newExpanded };
                }),
            };
        }

        case 'TOGGLE_EXTRACT_CHUNK': {
            const { sessionId, hash } = action.payload;
            return {
                ...state,
                extractSessions: state.extractSessions.map(s => {
                    if (s.id !== sessionId) return s;
                    const newSelected = new Set(s.selectedHashes);
                    if (newSelected.has(hash)) {
                        newSelected.delete(hash);
                    } else {
                        newSelected.add(hash);
                    }
                    return { ...s, selectedHashes: newSelected };
                }),
            };
        }

        case 'SET_EXTRACT_SEARCH': {
            const { sessionId, query } = action.payload;
            return {
                ...state,
                extractSessions: state.extractSessions.map(s =>
                    s.id === sessionId ? { ...s, searchQuery: query } : s
                ),
            };
        }

        case 'SET_EXTRACT_LOADING': {
            const { sessionId, loading } = action.payload;
            return {
                ...state,
                extractSessions: state.extractSessions.map(s =>
                    s.id === sessionId ? { ...s, loading } : s
                ),
            };
        }

        default:
            return state;
    }
}

// =============================================================================
// Context
// =============================================================================

interface AppContextValue {
    state: AppState;
    dispatch: React.Dispatch<Action>;
    // Convenience methods
    setStatus: (status: AppState['status'], message: string) => void;
    setWorking: (message?: string) => void;
    setReady: (message?: string) => void;
    setError: (message: string) => void;
    openModal: (modal: ModalType, options?: Record<string, unknown>) => void;
    closeModal: () => void;
    showToast: (type: Toast['type'], message: string, options?: { suggestion?: string; duration?: number }) => number;
    dismissToast: (id: number) => void;
    addLog: (level: LogEntry['level'], message: string) => void;
    clearLogs: () => void;
    toggleLogPanel: () => void;
    openContextMenu: (x: number, y: number, options: ContextMenuOption[]) => void;
    closeContextMenu: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// =============================================================================
// Provider Component
// =============================================================================

const SETTINGS_KEY = 'flint_settings';

interface AppProviderProps {
    children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
    const [state, dispatch] = useReducer(appReducer, initialState, (initial) => {
        // Load persisted settings on init
        try {
            const stored = localStorage.getItem(SETTINGS_KEY);
            if (stored) {
                const settings = JSON.parse(stored);
                return {
                    ...initial,
                    leaguePath: settings.leaguePath || null,
                    recentProjects: settings.recentProjects || [],
                    creatorName: settings.creatorName || null,
                    autoUpdateEnabled: settings.autoUpdateEnabled !== undefined ? settings.autoUpdateEnabled : true,
                    skippedUpdateVersion: settings.skippedUpdateVersion || null,
                };
            }
        } catch (error) {
            console.error('[Flint] Failed to load settings:', error);
        }
        return initial;
    });

    // Persist settings on change
    useEffect(() => {
        try {
            const settings = {
                leaguePath: state.leaguePath,
                recentProjects: state.recentProjects,
                creatorName: state.creatorName,
                autoUpdateEnabled: state.autoUpdateEnabled,
                skippedUpdateVersion: state.skippedUpdateVersion,
            };
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (error) {
            console.error('[Flint] Failed to save settings:', error);
        }
    }, [state.leaguePath, state.recentProjects, state.creatorName, state.autoUpdateEnabled, state.skippedUpdateVersion]);

    // Toast ID counter
    const toastIdRef = React.useRef(0);

    // Convenience methods
    const setStatus = useCallback((status: AppState['status'], message: string) => {
        dispatch({ type: 'SET_STATUS', payload: { status, message } });
    }, []);

    const setWorking = useCallback((message = 'Working...') => {
        setStatus('working', message);
    }, [setStatus]);

    const setReady = useCallback((message = 'Ready') => {
        setStatus('ready', message);
    }, [setStatus]);

    const setError = useCallback((message: string) => {
        setStatus('error', message);
    }, [setStatus]);

    const openModal = useCallback((modal: ModalType, options?: Record<string, unknown>) => {
        dispatch({ type: 'OPEN_MODAL', payload: { modal, options } });
    }, []);

    const closeModal = useCallback(() => {
        dispatch({ type: 'CLOSE_MODAL' });
    }, []);

    const showToast = useCallback((
        type: Toast['type'],
        message: string,
        options: { suggestion?: string; duration?: number } = {}
    ) => {
        const id = ++toastIdRef.current;
        const toast: Toast = {
            id,
            type,
            message,
            suggestion: options.suggestion || null,
            timestamp: Date.now(),
        };
        dispatch({ type: 'ADD_TOAST', payload: toast });

        // Auto-dismiss
        const duration = options.duration !== undefined ? options.duration : 5000;
        if (duration > 0) {
            setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), duration);
        }

        return id;
    }, []);

    const dismissToast = useCallback((id: number) => {
        dispatch({ type: 'REMOVE_TOAST', payload: id });
    }, []);

    // Log ID counter
    const logIdRef = React.useRef(0);

    const addLog = useCallback((level: LogEntry['level'], message: string) => {
        const log: LogEntry = {
            id: ++logIdRef.current,
            timestamp: Date.now(),
            level,
            message,
        };
        dispatch({ type: 'ADD_LOG', payload: log });
    }, []);

    const clearLogs = useCallback(() => {
        dispatch({ type: 'CLEAR_LOGS' });
    }, []);

    const toggleLogPanel = useCallback(() => {
        dispatch({ type: 'TOGGLE_LOG_PANEL' });
    }, []);

    const openContextMenu = useCallback((x: number, y: number, options: ContextMenuOption[]) => {
        dispatch({ type: 'OPEN_CONTEXT_MENU', payload: { x, y, options } });
    }, []);

    const closeContextMenu = useCallback(() => {
        dispatch({ type: 'CLOSE_CONTEXT_MENU' });
    }, []);

    const value = useMemo<AppContextValue>(() => ({
        state,
        dispatch,
        setStatus,
        setWorking,
        setReady,
        setError,
        openModal,
        closeModal,
        showToast,
        dismissToast,
        addLog,
        clearLogs,
        toggleLogPanel,
        openContextMenu,
        closeContextMenu,
    }), [state, dispatch, setStatus, setWorking, setReady, setError, openModal, closeModal, showToast, dismissToast, addLog, clearLogs, toggleLogPanel, openContextMenu, closeContextMenu]);

    return React.createElement(AppContext.Provider, { value }, children);
}

// =============================================================================
// Hook
// =============================================================================

export function useAppState() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppState must be used within an AppProvider');
    }
    return context;
}

// =============================================================================
// Image Cache (LRU for decoded DDS images)
// =============================================================================

const IMAGE_CACHE_MAX_SIZE = 50;
const imageCache = new Map<string, unknown>();

export function getCachedImage(path: string): unknown | null {
    const cached = imageCache.get(path);
    if (cached) {
        // Move to end (most recently used)
        imageCache.delete(path);
        imageCache.set(path, cached);
        return cached;
    }
    return null;
}

export function cacheImage(path: string, imageData: unknown): void {
    // Evict oldest if at capacity
    if (imageCache.size >= IMAGE_CACHE_MAX_SIZE) {
        const oldestKey = imageCache.keys().next().value;
        if (oldestKey) {
            imageCache.delete(oldestKey);
        }
    }
    imageCache.set(path, imageData);
}

export function clearImageCache(): void {
    imageCache.clear();
}
