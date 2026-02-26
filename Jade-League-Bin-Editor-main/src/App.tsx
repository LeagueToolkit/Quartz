import { useState, useEffect, useRef, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Editor, { Monaco } from "@monaco-editor/react";
import type * as MonacoType from 'monaco-editor';
import { registerRitobinLanguage, registerRitobinTheme, RITOBIN_LANGUAGE_ID, RITOBIN_THEME_ID } from "./lib/ritobinLanguage";
import { openBinFile, saveBinFile, saveBinFileAs } from "./lib/binOperations";
import { loadSavedTheme } from "./lib/themeApplicator";
import { texBufferToDataURL } from "./lib/texFormat";
import TitleBar from "./components/TitleBar";
import MenuBar from "./components/MenuBar";
import TabBar, { EditorTab, createTab, createTexPreviewTab, getFileName } from "./components/TabBar";
import StatusBar from "./components/StatusBar";
import WelcomeScreen from "./components/WelcomeScreen";
import AboutDialog from "./components/AboutDialog";
import ThemesDialog from "./components/ThemesDialog";
import SettingsDialog from "./components/SettingsDialog";
import PreferencesDialog from "./components/PreferencesDialog";
import GeneralEditPanel from "./components/GeneralEditPanel";
import ParticleEditorPanel from "./components/ParticleEditorPanel";
import ParticleEditorDialog from "./components/ParticleEditorDialog";
import UpdateToast from "./components/UpdateToast";
import TexHoverPopup from "./components/TexHoverPopup";
import TexturePreviewTab from "./components/TexturePreviewTab";
import SmokeOverlay from "./components/SmokeOverlay";
import { findAndOpenLinkedBins, LinkedBinResult } from "./lib/linkedBinParser";
import "./App.css";
import "./App.modernui.css";

interface UpdateInfo {
  available: boolean;
  version: string;
  notes: string;
  release_url: string;
}

// Store editor view states (scroll position, cursor position) per tab
interface EditorViewState {
  viewState: MonacoType.editor.ICodeEditorViewState | null;
}

function App() {
  // Tab management - start with NO tabs (empty)
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const viewStatesRef = useRef<Map<string, EditorViewState>>(new Map());

  // UI state
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showThemesDialog, setShowThemesDialog] = useState(false);
  const [showPreferencesDialog, setShowPreferencesDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [updateToastVersion, setUpdateToastVersion] = useState<string | null>(null);
  const [appIcon, setAppIcon] = useState<string>("/jade.ico");
  const [findWidgetOpen, setFindWidgetOpen] = useState(false);
  const [replaceWidgetOpen, setReplaceWidgetOpen] = useState(false);
  const [generalEditPanelOpen, setGeneralEditPanelOpen] = useState(false);
  const [particlePanelOpen, setParticlePanelOpen] = useState(false);
  const [particleDialogOpen, setParticleDialogOpen] = useState(false);
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const [caretPosition, setCaretPosition] = useState({ line: 1, column: 1 });
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [cigaretteMode, setCigaretteMode] = useState(false);

  // Texture hover popup state
  interface TexPopupState {
    x: number;
    y: number;
    rawPath: string;
    resolvedPath: string | null;
    imageDataUrl: string | null;
    texWidth: number;
    texHeight: number;
    formatStr: string;
    formatNum: number;
    error: string | null;
  }
  const [texPopup, setTexPopup] = useState<TexPopupState | null>(null);
  const texPopupRef = useRef<TexPopupState | null>(null);
  texPopupRef.current = texPopup;
  // Whether the mouse is currently over the popup (prevents premature dismissal)
  const isMouseOverPopupRef = useRef(false);
  const texHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track normal window dimensions (when not maximized/fullscreen)
  const normalWindowSize = useRef<{ width: number; height: number; x: number; y: number }>({
    width: 1200,
    height: 800,
    x: 100,
    y: 100
  });

  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
  const editorDisposablesRef = useRef<MonacoType.IDisposable[]>([]);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const mutationSetupTimeoutRef = useRef<number | null>(null);
  const undoCheckIntervalRef = useRef<number | null>(null);
  // Map of tabId -> Monaco ITextModel (model-based tab switching to prevent RAM leaks)
  const monacoModelsRef = useRef<Map<string, MonacoType.editor.ITextModel>>(new Map());
  // LRU order for model eviction: most-recently-used tab IDs (front = oldest)
  const modelLruRef = useRef<string[]>([]);
  const MODEL_CACHE_LIMIT = 10;
  const monacoRef = useRef<Monaco | null>(null);

  // Stable refs so Tauri/DOM event listeners (registered once) always call the
  // latest version of these callbacks rather than stale closure captures.
  const openFileFromPathRef = useRef<((path: string) => Promise<void>) | null>(null);
  const openingFilesRef = useRef<Set<string>>(new Set()); // prevents duplicate concurrent opens
  const handleTabCloseRef = useRef<((tabId: string) => void) | null>(null);

  // Get the active tab
  const activeTab = tabs.find(t => t.id === activeTabId) || null;

  // Ref to track active tab for keyboard shortcuts
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Ref to track active tab ID for keyboard shortcuts
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  // Ref to track if we should allow hash preload status updates
  // This prevents hash preload status from overriding important messages like "Opened file"
  const statusMessageRef = useRef<string>("Ready");
  const allowHashStatusUpdateRef = useRef<boolean>(true);

  // Load custom icon and window state on mount
  useEffect(() => {
    loadCustomIcon();
    restoreWindowState();
    // Auto-download hashes first (if enabled), then preload them
    autoDownloadHashesIfEnabled().then(() => {
      preloadHashesIfEnabled();
    });
    loadRecentFiles(); // Just load the list, don't open files
    if (!monacoInstance) {
      loadSavedTheme(invoke);
    }

    invoke<string>('get_preference', { key: 'CigaretteMode', defaultValue: 'false' })
      .then(val => setCigaretteMode(val === 'true'))
      .catch(() => {});

    const handleCigaretteModeChanged = (e: Event) => {
      setCigaretteMode((e as CustomEvent<boolean>).detail);
    };
    window.addEventListener('cigarette-mode-changed', handleCigaretteModeChanged);

    // Listen for open-file events from backend (file association double-click or single-instance)
    const openFileUnlisten = listen<string>('open-file', (event) => {
      const filePath = event.payload;
      if (filePath && filePath.trim()) {
        console.log('[App] Received open-file event:', filePath);
        openFileFromPathRef.current?.(filePath);
      }
    });

    // Auto-check for updates on startup
    invoke<string>('get_preference', { key: 'AutoCheckUpdates', defaultValue: 'True' })
      .then(async pref => {
        if (pref !== 'True') return;
        try {
          const info = await invoke<UpdateInfo>('check_for_update');
          if (!info.available) return;
          const silent = await invoke<string>('get_preference', { key: 'SilentUpdate', defaultValue: 'False' });
          if (silent === 'True') {
            // Download and install with no UI
            await invoke('start_update_download');
            await invoke('run_installer', { silent: true });
          } else {
            setUpdateToastVersion(info.version);
          }
        } catch (e) {
          console.warn('[Updater] Auto-check failed:', e);
        }
      })
      .catch(() => { });

    const handleIconChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      setAppIcon(customEvent.detail);
    };

    window.addEventListener('icon-changed', handleIconChange);

    // Event listeners for keyboard shortcuts
    const handleAppOpen = () => handleOpen();
    const handleAppSave = () => handleSave();
    const handleAppSaveAs = () => handleSaveAs();
    const handleAppFind = () => handleFind();
    const handleAppReplace = () => handleReplace();
    const handleAppCompare = () => handleCompareFiles();
    const handleAppCloseTab = () => {
      if (activeTabIdRef.current) {
        handleTabCloseRef.current?.(activeTabIdRef.current);
      }
    };

    window.addEventListener('app-open', handleAppOpen);
    window.addEventListener('app-save', handleAppSave);
    window.addEventListener('app-save-as', handleAppSaveAs);
    window.addEventListener('app-find', handleAppFind);
    window.addEventListener('app-replace', handleAppReplace);
    window.addEventListener('app-compare', handleAppCompare);
    window.addEventListener('app-close-tab', handleAppCloseTab);

    // Keyboard shortcut for General Edit panel (Ctrl+O), Particle panel (Ctrl+Shift+P), Tab switching (Ctrl+Tab/Ctrl+Shift+Tab) and Escape to close
    const handleKeyDown = (e: KeyboardEvent) => {
      // Helper to check if current file is a bin file (using ref for up-to-date value)
      const isBinFile = (): boolean => {
        const tab = activeTabRef.current;
        if (!tab) return false;
        return tab.fileName.toLowerCase().endsWith('.bin');
      };

      // Ctrl+S - Save file
      if (e.ctrlKey && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        // Trigger save - handleSave is defined elsewhere, use a custom event
        window.dispatchEvent(new CustomEvent('app-save'));
        return;
      }

      // Ctrl+Shift+S - Save As
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app-save-as'));
        return;
      }

      // Ctrl+Z - Undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        // Don't prevent default - let Monaco handle it, but ensure editor is focused
        return;
      }

      // Ctrl+Y - Redo
      if (e.ctrlKey && e.key === 'y' && !e.shiftKey) {
        // Don't prevent default - let Monaco handle it
        return;
      }

      // Ctrl+F - Find
      if (e.ctrlKey && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app-find'));
        return;
      }

      // Ctrl+H - Replace
      if (e.ctrlKey && e.key === 'h' && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app-replace'));
        return;
      }

      // Ctrl+A - Select All (let Monaco handle it)
      if (e.ctrlKey && e.key === 'a' && !e.shiftKey) {
        // Don't prevent default - let Monaco handle it
        return;
      }

      // Ctrl+X - Cut (let Monaco handle it)
      if (e.ctrlKey && e.key === 'x' && !e.shiftKey) {
        // Don't prevent default - let Monaco handle it
        return;
      }

      // Ctrl+C - Copy (let Monaco handle it)
      if (e.ctrlKey && e.key === 'c' && !e.shiftKey) {
        // Don't prevent default - let Monaco handle it
        return;
      }

      // Ctrl+V - Paste (let Monaco handle it)
      if (e.ctrlKey && e.key === 'v' && !e.shiftKey) {
        // Don't prevent default - let Monaco handle it
        return;
      }

      // Ctrl+W - Close current tab
      if (e.ctrlKey && e.key === 'w' && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app-close-tab'));
        return;
      }

      // Tab switching shortcuts
      if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        // Save current view state before switching (model handles content)
        if (editorRef.current && activeTabIdRef.current) {
          const viewState = editorRef.current.saveViewState();
          viewStatesRef.current.set(activeTabIdRef.current, { viewState });
        }
        // Switch to next tab
        setTabs(currentTabs => {
          if (currentTabs.length <= 1) return currentTabs; // No need to switch if 0 or 1 tab

          const currentIndex = currentTabs.findIndex(t => t.id === activeTabIdRef.current);
          const nextIndex = currentIndex < currentTabs.length - 1 ? currentIndex + 1 : 0;
          setActiveTabId(currentTabs[nextIndex].id);
          return currentTabs;
        });
      } else if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        // Save current view state before switching (model handles content)
        if (editorRef.current && activeTabIdRef.current) {
          const viewState = editorRef.current.saveViewState();
          viewStatesRef.current.set(activeTabIdRef.current, { viewState });
        }
        // Switch to previous tab
        setTabs(currentTabs => {
          if (currentTabs.length <= 1) return currentTabs; // No need to switch if 0 or 1 tab

          const currentIndex = currentTabs.findIndex(t => t.id === activeTabIdRef.current);
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : currentTabs.length - 1;
          setActiveTabId(currentTabs[prevIndex].id);
          return currentTabs;
        });
      } else if (e.ctrlKey && e.key === 'o' && !e.shiftKey) {
        e.preventDefault();
        // Context-aware: Open file if no tabs, toggle General Edit if tabs exist
        const currentTabs = tabs;
        if (currentTabs.length === 0) {
          // No tabs open - trigger file open
          window.dispatchEvent(new CustomEvent('app-open'));
        } else {
          // Tabs exist - toggle General Edit panel
          setGeneralEditPanelOpen(prev => !prev);
        }
      } else if (e.ctrlKey && e.key === 'd' && !e.shiftKey) {
        e.preventDefault();
        // Compare files - dispatch event
        window.dispatchEvent(new CustomEvent('app-compare'));
      } else if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        // Only open particle dialog if bin file is loaded
        if (isBinFile()) {
          setParticlePanelOpen(false);
          setParticleDialogOpen(prev => !prev);
        }
      } else if (e.ctrlKey && e.key === 'p' && !e.shiftKey) {
        e.preventDefault();
        // Only open particle panel if bin file is loaded
        if (isBinFile()) {
          setFindWidgetOpen(false);
          setReplaceWidgetOpen(false);
          setGeneralEditPanelOpen(false);
          setParticlePanelOpen(prev => !prev);
        }
      } else if (e.key === 'Escape') {
        setGeneralEditPanelOpen(false);
        setParticlePanelOpen(false);
        setParticleDialogOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    let saveTimeout: number | null = null;
    const debouncedSave = () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveCurrentWindowState();
      }, 500);
    };

    const setupWindowListeners = async () => {
      const window = getCurrentWindow();
      const unlistenResize = await window.onResized(debouncedSave);
      const unlistenMove = await window.onMoved(debouncedSave);

      let lastMaximized = await window.isMaximized();
      let lastFullscreen = await window.isFullscreen();

      const checkMaximized = setInterval(async () => {
        const maximized = await window.isMaximized();
        const fullscreen = await window.isFullscreen();
        setIsMaximized(maximized || fullscreen);

        // Save state when maximized or fullscreen changes
        if (maximized !== lastMaximized || fullscreen !== lastFullscreen) {
          lastMaximized = maximized;
          lastFullscreen = fullscreen;
          debouncedSave();
        }
      }, 100);

      return () => {
        unlistenResize();
        unlistenMove();
        clearInterval(checkMaximized);
        if (saveTimeout) clearTimeout(saveTimeout);
      };
    };

    // Listen for file drop events from Tauri
    const setupFileDropListener = async () => {
      const unlisten = await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
        console.log('File drop event:', event.payload);
        setIsDragging(false);

        for (const filePath of event.payload.paths) {
          console.log('Dropped file:', filePath);
          if (filePath.toLowerCase().endsWith('.bin')) {
            await openFileFromPathRef.current?.(filePath);
          }
        }
      });

      const unlistenDragOver = await listen('tauri://drag', () => {
        setIsDragging(true);
      });

      return () => {
        unlisten();
        unlistenDragOver();
      };
    };

    let cleanup: (() => void) | undefined;
    let fileDropCleanup: (() => void) | undefined;

    setupWindowListeners().then(fn => { cleanup = fn; });
    setupFileDropListener().then(fn => { fileDropCleanup = fn; });

    return () => {
      window.removeEventListener('icon-changed', handleIconChange);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('cigarette-mode-changed', handleCigaretteModeChanged);
      window.removeEventListener('app-open', handleAppOpen);
      window.removeEventListener('app-save', handleAppSave);
      window.removeEventListener('app-save-as', handleAppSaveAs);
      window.removeEventListener('app-find', handleAppFind);
      window.removeEventListener('app-replace', handleAppReplace);
      window.removeEventListener('app-compare', handleAppCompare);
      window.removeEventListener('app-close-tab', handleAppCloseTab);
      cleanup?.();
      fileDropCleanup?.();
      saveCurrentWindowState();
      // Unlisten from Tauri open-file event
      openFileUnlisten.then(fn => fn());
    };
  }, [monacoInstance]);

  const saveCurrentWindowState = async () => {
    try {
      const window = getCurrentWindow();
      const maximized = await window.isMaximized();
      const fullscreen = await window.isFullscreen();

      // Minimum window size constants (matching backend)
      const MIN_WIDTH = 800;
      const MIN_HEIGHT = 600;

      // Update tracked normal dimensions only when not maximized/fullscreen
      if (!maximized && !fullscreen) {
        const size = await window.innerSize();
        const position = await window.outerPosition();

        // Enforce minimum size constraints
        const width = Math.max(size.width, MIN_WIDTH);
        const height = Math.max(size.height, MIN_HEIGHT);

        normalWindowSize.current = {
          width,
          height,
          x: position.x,
          y: position.y
        };
      }

      // Save the normal dimensions along with maximized/fullscreen state
      await invoke('save_window_state', {
        state: {
          width: normalWindowSize.current.width,
          height: normalWindowSize.current.height,
          x: normalWindowSize.current.x,
          y: normalWindowSize.current.y,
          maximized,
          fullscreen
        }
      });

      console.log('Saved window state:', {
        ...normalWindowSize.current,
        maximized,
        fullscreen
      });
    } catch (error) {
      console.error('Failed to save window state:', error);
    }
  };

  const restoreWindowState = async () => {
    try {
      const state = await invoke<{ width: number, height: number, x: number, y: number, maximized: boolean, fullscreen: boolean } | null>('get_window_state');

      console.log('Loading window state for tracking:', state);

      // Minimum window size constants (matching backend)
      const MIN_WIDTH = 800;
      const MIN_HEIGHT = 600;

      if (state) {
        // Store the normal dimensions for tracking (Rust already restored the window)
        // Enforce minimum size constraints
        normalWindowSize.current = {
          width: Math.max(state.width, MIN_WIDTH),
          height: Math.max(state.height, MIN_HEIGHT),
          x: state.x,
          y: state.y
        };

        const window = getCurrentWindow();
        const maximized = await window.isMaximized();
        const fullscreen = await window.isFullscreen();
        setIsMaximized(maximized || fullscreen);
      } else {
        // No saved state - capture current window dimensions
        const window = getCurrentWindow();
        const size = await window.innerSize();
        const position = await window.outerPosition();
        normalWindowSize.current = {
          width: Math.max(size.width, MIN_WIDTH),
          height: Math.max(size.height, MIN_HEIGHT),
          x: position.x,
          y: position.y
        };
      }
    } catch (error) {
      console.error('Failed to restore window state:', error);
    }
  };

  const loadCustomIcon = async () => {
    try {
      const iconData = await invoke<string | null>('get_custom_icon_data');
      if (iconData) {
        setAppIcon(iconData);
      }
    } catch (error) {
      console.error('Failed to load custom icon:', error);
    }
  };

  // Auto-download hashes on startup if setting is enabled
  const autoDownloadHashesIfEnabled = async () => {
    try {
      const autoDownloadEnabled = await invoke<string>('get_preference', {
        key: 'AutoDownloadHashes',
        defaultValue: 'False'
      });

      if (autoDownloadEnabled !== 'True') {
        return;
      }

      const useBinaryFormat = await invoke<string>('get_preference', {
        key: 'UseBinaryHashFormat',
        defaultValue: 'False'
      }) === 'True';

      // Always download latest hashes when auto-download is enabled
      allowHashStatusUpdateRef.current = false; // Block hash preload updates during download
      setStatusMessage('Auto-downloading latest hash files...');
      statusMessageRef.current = 'Auto-downloading latest hash files...';
      try {
        await invoke('download_hashes', { useBinary: useBinaryFormat });
        setStatusMessage('Latest hash files downloaded');
        statusMessageRef.current = 'Latest hash files downloaded';
        // Re-enable hash status updates after a short delay
        setTimeout(() => {
          allowHashStatusUpdateRef.current = true;
        }, 500);
      } catch (error) {
        console.error('[App] Failed to auto-download hashes:', error);
        setStatusMessage('Ready');
        statusMessageRef.current = 'Ready';
        allowHashStatusUpdateRef.current = true;
      }
    } catch (error) {
      console.error('[App] Failed to auto-download hashes:', error);
      allowHashStatusUpdateRef.current = true;
    }
  };

  // Helper to check if current status is safe to override with hash preload status
  const isStatusSafeToOverride = (currentStatus: string): boolean => {
    const lowerStatus = currentStatus.toLowerCase();
    // Don't override if status contains important operations
    const importantKeywords = [
      'opening', 'opened', 'switched to', 'saved', 'loading', 'loaded',
      'failed', 'error', 'updated', 'set bindweight', 'scaled'
    ];
    return !importantKeywords.some(keyword => lowerStatus.includes(keyword));
  };

  // Preload hashes in background if setting is enabled
  const preloadHashesIfEnabled = async () => {
    try {
      const preloadEnabled = await invoke<string>('get_preference', {
        key: 'PreloadHashes',
        defaultValue: 'False'
      });

      if (preloadEnabled === 'True') {
        // Check status first to see if hashes are already loaded
        const status = await invoke<{ loaded: boolean; loading: boolean; fnv_count: number; xxh_count: number; memory_bytes: number }>('get_preload_status');

        if (status.loaded) {
          // Hashes are already loaded, always update status to show correct info
          // (even if current status is "Preloading hashes..." - we need to correct it)
          const totalHashes = status.fnv_count + status.xxh_count;
          const newStatus = `Ready (${totalHashes} hashes preloaded)`;

          // Force update the status - always update when hashes are already loaded
          // This corrects any incorrect "Preloading hashes..." status
          setStatusMessage(currentStatus => {
            const lowerCurrent = currentStatus.toLowerCase();
            // Always update if current status is hash-related or generic (to correct wrong status)
            const isHashRelated = lowerCurrent.includes('preloading hashes') ||
              lowerCurrent.includes('hashes preloaded') ||
              lowerCurrent.includes('hash');
            const isGeneric = lowerCurrent === 'ready' ||
              lowerCurrent.includes('latest hash files downloaded');

            if (isHashRelated || isGeneric || isStatusSafeToOverride(currentStatus)) {
              statusMessageRef.current = newStatus;
              allowHashStatusUpdateRef.current = true;
              console.log(`[App] Updating status from "${currentStatus}" to "${newStatus}" (hashes already loaded)`);
              return newStatus;
            }
            // Only keep current status if it's an important operation
            console.log(`[App] Keeping current status "${currentStatus}" (important operation)`);
            allowHashStatusUpdateRef.current = false;
            return currentStatus;
          });
        } else if (!status.loading) {
          // Hashes are not loaded and not currently loading, start preloading
          // Only set preloading status if current status is safe to override
          setStatusMessage(currentStatus => {
            statusMessageRef.current = currentStatus;
            if (isStatusSafeToOverride(currentStatus)) {
              allowHashStatusUpdateRef.current = true;
              return 'Preloading hashes...';
            }
            allowHashStatusUpdateRef.current = false;
            return currentStatus;
          });

          // Run preload in background - don't await
          invoke<{ loaded: boolean; fnv_count: number; xxh_count: number; memory_bytes: number }>('preload_hashes')
            .then((preloadStatus) => {
              if (preloadStatus.loaded) {
                const totalHashes = preloadStatus.fnv_count + preloadStatus.xxh_count;
                const newStatus = `Ready (${totalHashes} hashes preloaded)`;
                // Always update if current status is hash-related
                setStatusMessage(currentStatus => {
                  statusMessageRef.current = currentStatus;
                  const lowerCurrent = currentStatus.toLowerCase();
                  if (lowerCurrent.includes('preloading hashes') ||
                    (allowHashStatusUpdateRef.current && isStatusSafeToOverride(currentStatus))) {
                    return newStatus;
                  }
                  return currentStatus;
                });
              }
            })
            .catch((error) => {
              console.error('[App] Failed to preload hashes:', error);
              // Only update status if it's safe to do so
              setStatusMessage(currentStatus => {
                statusMessageRef.current = currentStatus;
                const lowerCurrent = currentStatus.toLowerCase();
                if (lowerCurrent.includes('preloading hashes') ||
                  (allowHashStatusUpdateRef.current && isStatusSafeToOverride(currentStatus))) {
                  return 'Ready';
                }
                return currentStatus;
              });
            });
        }
        // If status.loading is true, hashes are currently being loaded, don't do anything
      }
    } catch (error) {
      console.error('[App] Failed to check preload preference:', error);
    }
  };

  // Recent files management
  const loadRecentFiles = async () => {
    try {
      const recent = await invoke<string[]>('get_recent_files');
      setRecentFiles(recent);
    } catch (e) {
      console.error("Failed to load recent files:", e);
      setRecentFiles([]);
    }
  };

  const addToRecentFiles = async (filePath: string) => {
    try {
      const updated = await invoke<string[]>('add_recent_file', { path: filePath });
      setRecentFiles(updated);
    } catch (e) {
      console.error("Failed to add to recent files:", e);
    }
  };

  const openFileFromPath = async (filePath: string) => {
    // Prevent duplicate concurrent opens (e.g. Tauri drag-drop firing twice,
    // or rapid re-drops of the same file before the first open completes).
    const normalizedPath = filePath.toLowerCase();
    if (openingFilesRef.current.has(normalizedPath)) return;
    openingFilesRef.current.add(normalizedPath);
    try {
      // Block hash status updates while opening file
      allowHashStatusUpdateRef.current = false;
      setStatusMessage(`Opening ${getFileName(filePath)}...`);
      statusMessageRef.current = `Opening ${getFileName(filePath)}...`;

      const existingTab = tabs.find(t => t.filePath && t.filePath.toLowerCase() === filePath.toLowerCase());
      if (existingTab) {
        setActiveTabId(existingTab.id);
        setStatusMessage(`Switched to ${getFileName(filePath)}`);
        statusMessageRef.current = `Switched to ${getFileName(filePath)}`;
        // Re-enable hash status updates after a delay
        setTimeout(() => {
          allowHashStatusUpdateRef.current = true;
        }, 2000);
        return;
      }

      // Import the readBinDirect function from binOperations
      const { readBinDirect } = await import('./lib/binOperations');
      const content = await readBinDirect(filePath);
      const newTab = createTab(filePath, content);
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);

      await addToRecentFiles(filePath);
      setStatusMessage(`Opened ${getFileName(filePath)}`);
      statusMessageRef.current = `Opened ${getFileName(filePath)}`;

      await openLinkedBinFiles(filePath, content);

      // Re-enable hash status updates after file is opened (with delay to show the message)
      setTimeout(() => {
        allowHashStatusUpdateRef.current = true;
      }, 2000);
    } catch (error) {
      console.error("Failed to open file:", error);
      setStatusMessage(`Failed to open file: ${error}`);
      statusMessageRef.current = `Failed to open file: ${error}`;
      // Re-enable hash status updates after error
      setTimeout(() => {
        allowHashStatusUpdateRef.current = true;
      }, 2000);
    } finally {
      openingFilesRef.current.delete(normalizedPath);
    }
  };
  // Keep the ref up-to-date every render so event listeners always call the
  // latest version (which has fresh `tabs` in its closure).
  openFileFromPathRef.current = openFileFromPath;


  // Save current editor view state before switching tabs
  // Note: content sync is no longer needed since Monaco models handle content
  const saveCurrentViewState = useCallback(() => {
    if (editorRef.current && activeTabId) {
      const viewState = editorRef.current.saveViewState();
      viewStatesRef.current.set(activeTabId, { viewState });
    }
  }, [activeTabId]);

  // Tab operations
  const handleTabSelect = useCallback((tabId: string) => {
    if (tabId === activeTabId) return;
    saveCurrentViewState();
    setActiveTabId(tabId);
    // Model switching and view state restoration handled by the activeTabId useEffect
  }, [activeTabId, saveCurrentViewState]);

  const handleTabClose = useCallback((tabId: string) => {
    const tabToClose = tabs.find(t => t.id === tabId);
    if (!tabToClose) return;

    // Confirm if modified
    if (tabToClose.isModified) {
      if (!confirm(`"${tabToClose.fileName}" has unsaved changes. Close anyway?`)) {
        return;
      }
    }

    // Remove view state and LRU entry
    viewStatesRef.current.delete(tabId);
    modelLruRef.current = modelLruRef.current.filter(id => id !== tabId);

    const modelToDispose = monacoModelsRef.current.get(tabId);
    monacoModelsRef.current.delete(tabId);

    // Compute the next active tab now, before state updates
    const newTabs = tabs.filter(t => t.id !== tabId);
    let nextActiveId: string | null = null;
    if (tabId === activeTabId) {
      if (newTabs.length > 0) {
        const closedIndex = tabs.findIndex(t => t.id === tabId);
        nextActiveId = newTabs[Math.min(closedIndex, newTabs.length - 1)].id;
      }
    } else {
      nextActiveId = activeTabId;
    }

    // If closing the active tab, switch the editor to the NEXT model before
    // disposing the old one. Calling setModel(null) tears down Monaco's
    // InstantiationService which crashes the editor on the next setModel call.
    if (tabId === activeTabId && editorRef.current && nextActiveId) {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (monaco) {
        let nextModel = monacoModelsRef.current.get(nextActiveId);
        const nextTab = newTabs.find(t => t.id === nextActiveId);
        if ((!nextModel || nextModel.isDisposed()) && nextTab) {
          const uri = nextTab.filePath
            ? monaco.Uri.file(nextTab.filePath)
            : monaco.Uri.parse(`inmemory://tab/${nextActiveId}`);
          const existing = monaco.editor.getModel(uri);
          nextModel = (existing && !existing.isDisposed())
            ? existing
            : monaco.editor.createModel(nextTab.content, RITOBIN_LANGUAGE_ID, uri);
          monacoModelsRef.current.set(nextActiveId, nextModel!);
        }
        if (nextModel) {
          try { editor.setModel(nextModel); } catch (_) { }
        }
      }
    }

    // Dispose the old model after a delay so Monaco's RAF-based render pipeline
    // can finish all queued frames before the model is torn down.
    if (modelToDispose && !modelToDispose.isDisposed()) {
      setTimeout(() => {
        try { modelToDispose.dispose(); } catch (_) { }
      }, 500);
    }

    setTabs(newTabs);
    if (tabId === activeTabId) {
      setActiveTabId(nextActiveId);
    }
  }, [tabs, activeTabId]);
  handleTabCloseRef.current = handleTabClose;

  const handleTabCloseAll = useCallback(() => {
    const hasModified = tabs.some(t => t.isModified);
    if (hasModified) {
      if (!confirm('Some tabs have unsaved changes. Close all anyway?')) {
        return;
      }
    }

    viewStatesRef.current.clear();
    modelLruRef.current = [];

    // Collect models for delayed disposal, then clear the map immediately so
    // no further renders reference them.  The 500ms delay lets Monaco's
    // RAF-based render pipeline drain before we tear down the models.
    const modelsToDispose = Array.from(monacoModelsRef.current.values());
    monacoModelsRef.current.clear();
    setTimeout(() => {
      modelsToDispose.forEach((model) => {
        if (!model.isDisposed()) {
          try { model.dispose(); } catch (_) { }
        }
      });
    }, 500);

    setTabs([]);
    setActiveTabId(null);
  }, [tabs]);

  const handleTabPin = useCallback((tabId: string) => {
    setTabs(prevTabs =>
      prevTabs.map(t =>
        t.id === tabId ? { ...t, isPinned: !t.isPinned } : t
      )
    );
  }, []);


  // Add a new tab
  const addTab = useCallback((filePath: string | null, content: string): EditorTab => {
    // Check if file is already open
    if (filePath) {
      const existingTab = tabs.find(t => t.filePath === filePath);
      if (existingTab) {
        setActiveTabId(existingTab.id);
        return existingTab;
      }
    }

    const newTab = createTab(filePath, content);
    saveCurrentViewState();
    setTabs(prevTabs => [...prevTabs, newTab]);
    setActiveTabId(newTab.id);
    return newTab;
  }, [tabs, saveCurrentViewState]);

  // Monaco handlers
  function handleBeforeMount(monaco: Monaco) {
    registerRitobinLanguage(monaco);
    registerRitobinTheme(monaco);
    monacoRef.current = monaco;
    setMonacoInstance(monaco);
    loadSavedTheme(invoke, monaco);
  }

  // Model-based tab switching: swap Monaco model when active tab changes
  // This is the core fix for the RAM leak - no more editor remounts
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !activeTabId) return;

    // Guard: bail out if the editor's DOM container is gone (disposed / unmounted)
    if (!editor.getContainerDomNode()) return;

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    // Texture-preview tabs don't have a Monaco model — skip model switching
    if (activeTab.tabType === 'texture-preview') return;

    // Save view state of current model before switching
    const currentModel = editor.getModel();
    if (currentModel) {
      // Find which tab owns the current model
      monacoModelsRef.current.forEach((model, tabId) => {
        if (model === currentModel && tabId !== activeTabId) {
          const vs = editor.saveViewState();
          viewStatesRef.current.set(tabId, { viewState: vs });
        }
      });
    }

    // Get or create the Monaco model for this tab
    let model = monacoModelsRef.current.get(activeTabId);
    if (!model || model.isDisposed()) {
      // Create a new model with a unique URI
      const uri = activeTab.filePath
        ? monaco.Uri.file(activeTab.filePath)
        : monaco.Uri.parse(`inmemory://tab/${activeTabId}`);

      // Check if a model with this URI already exists (e.g. from a previous session)
      const existing = monaco.editor.getModel(uri);
      if (existing && !existing.isDisposed()) {
        model = existing;
      } else {
        model = monaco.editor.createModel(activeTab.content, RITOBIN_LANGUAGE_ID, uri);
      }
      monacoModelsRef.current.set(activeTabId, model!);
    }

    // LRU eviction: mark this tab as most-recently used, evict oldest if over limit
    modelLruRef.current = modelLruRef.current.filter(id => id !== activeTabId);
    modelLruRef.current.push(activeTabId);
    while (modelLruRef.current.length > MODEL_CACHE_LIMIT) {
      const evictId = modelLruRef.current.shift()!;
      const evictModel = monacoModelsRef.current.get(evictId);
      if (evictModel && !evictModel.isDisposed()) {
        // Save the current text back to the tab so it reloads correctly
        const evictTab = tabs.find(t => t.id === evictId);
        if (evictTab) {
          evictTab.content = evictModel.getValue();
        }
        // Delay disposal so Monaco's RAF-based render pipeline can finish all
        // queued frames.  100ms was too short on busy systems; 500ms gives plenty
        // of headroom.  Also guard against the model being re-mapped before the
        // timeout fires (e.g. rapid tab switching back to an evicted tab).
        const modelRef = evictModel;
        setTimeout(() => {
          let isStillMapped = false;
          monacoModelsRef.current.forEach((m) => { if (m === modelRef) isStillMapped = true; });
          if (!isStillMapped && !modelRef.isDisposed()) {
            try { modelRef.dispose(); } catch (_) { }
          }
        }, 500);
      }
      monacoModelsRef.current.delete(evictId);
      viewStatesRef.current.delete(evictId);
    }

    // Set the model on the editor (this is the key operation - no remount!)
    try {
      editor.setModel(model ?? null);
    } catch (e) {
      console.warn('[tab-switch] setModel failed, editor may be mid-dispose:', e);
      return;
    }

    // Restore view state for this tab
    const savedState = viewStatesRef.current.get(activeTabId);
    if (savedState?.viewState) {
      try { editor.restoreViewState(savedState.viewState); } catch (_) { }
    } else {
      // New tab - scroll to top
      try { editor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 }); } catch (_) { }
    }

    try { editor.focus(); } catch (_) { }

    // Update line count
    try { setLineCount(model!.getLineCount()); } catch (_) { }
  }, [activeTabId]); // Only re-run when active tab changes

  const handleThemeApplied = () => {
    if (monacoInstance) {
      loadSavedTheme(invoke, monacoInstance);
    }
  };

  // ── Texture hover helpers ──────────────────────────────────────────────────

  /**
   * Given a line of text and a column (1-based), extract a .tex path if the
   * cursor is inside a quoted string that ends with ".tex".
   */
  function extractTexPathAtColumn(line: string, column: number): string | null {
    // Walk backwards from the column to find an opening quote
    const col0 = column - 1; // 0-based
    let start = -1;
    for (let i = col0; i >= 0; i--) {
      if (line[i] === '"') { start = i + 1; break; }
      if (line[i] === '\n') break;
    }
    if (start === -1) return null;

    // Walk forwards to find a closing quote
    let end = -1;
    for (let i = col0; i < line.length; i++) {
      if (line[i] === '"') { end = i; break; }
    }
    if (end === -1) return null;

    const candidate = line.slice(start, end);
    if (candidate.toLowerCase().endsWith('.tex')) return candidate;
    return null;
  }

  /**
   * Decode a .tex file at the given resolved path and load it into a texture tab.
   * Updates the tab state in-place once loading is complete.
   */
  // Track which texture-preview tab is currently reloading (for the spinner)
  const [reloadingTexTabId, setReloadingTexTabId] = useState<string | null>(null);
  // Per-tab last-seen mtime (seconds since epoch); used by the auto-reload poller
  const texMtimeRef = useRef<Map<string, number>>(new Map());
  // Interval handle for the file-watch poll loop
  const texPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTextureIntoTab = useCallback(async (tabId: string, resolvedPath: string, silent = false) => {
    if (!silent) setReloadingTexTabId(tabId);
    try {
      const b64: string = await invoke('read_file_base64', { path: resolvedPath });
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const { dataURL, width, height, format } = texBufferToDataURL(bytes.buffer);
      setTabs(prev => prev.map(t =>
        t.id === tabId
          ? { ...t, textureDataUrl: dataURL, textureWidth: width, textureHeight: height, textureFormat: format, textureError: null }
          : t
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTabs(prev => prev.map(t =>
        t.id === tabId ? { ...t, textureError: msg } : t
      ));
    } finally {
      if (!silent) setReloadingTexTabId(null);
    }
  }, []);

  /** Manual reload triggered by the Reload button */
  const handleTexReload = useCallback(() => {
    const tab = tabs.find(t => t.id === activeTabId && t.tabType === 'texture-preview');
    if (!tab?.filePath) return;
    // Reset the stored mtime so the poller doesn't double-fire
    texMtimeRef.current.delete(tab.id);
    loadTextureIntoTab(tab.id, tab.filePath);
  }, [tabs, activeTabId, loadTextureIntoTab]);

  // Auto-reload: poll the active texture tab's file mtime every 1.5 s
  useEffect(() => {
    // Clear any existing poll
    if (texPollIntervalRef.current) {
      clearInterval(texPollIntervalRef.current);
      texPollIntervalRef.current = null;
    }

    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.tabType !== 'texture-preview' || !tab.filePath) return;

    const filePath = tab.filePath;
    const tabId = tab.id;

    texPollIntervalRef.current = setInterval(async () => {
      try {
        const mtime = await invoke<number>('get_file_mtime', { path: filePath });
        const last = texMtimeRef.current.get(tabId);
        if (last === undefined) {
          // First reading — just store it, don't reload
          texMtimeRef.current.set(tabId, mtime);
        } else if (mtime !== last) {
          texMtimeRef.current.set(tabId, mtime);
          // File changed on disk — silently reload
          await loadTextureIntoTab(tabId, filePath, true);
        }
      } catch {
        // File temporarily locked while being written — ignore and retry next tick
      }
    }, 1500);

    return () => {
      if (texPollIntervalRef.current) {
        clearInterval(texPollIntervalRef.current);
        texPollIntervalRef.current = null;
      }
    };
  }, [activeTabId, tabs, loadTextureIntoTab]);

  /**
   * Resolve a .tex asset path and decode it for the hover popup.
   * Called whenever the popup's rawPath changes.
   */
  const loadTextureForPopup = useCallback(async (rawPath: string, baseFile: string | null) => {
    try {
      const resolved: string | null = baseFile
        ? await invoke('resolve_asset_path', { baseFile, assetPath: rawPath })
        : null;

      if (!resolved) {
        setTexPopup(prev =>
          prev?.rawPath === rawPath
            ? { ...prev, error: `File not found: ${rawPath}`, resolvedPath: null }
            : prev
        );
        return;
      }

      const b64: string = await invoke('read_file_base64', { path: resolved });
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const { dataURL, width, height, format } = texBufferToDataURL(bytes.buffer);

      // Import lazily to keep bundle tidy
      const { formatName } = await import('./lib/texFormat');

      setTexPopup(prev =>
        prev?.rawPath === rawPath
          ? {
              ...prev,
              resolvedPath: resolved,
              imageDataUrl: dataURL,
              texWidth: width,
              texHeight: height,
              formatStr: formatName(format),
              formatNum: format,
              error: null,
            }
          : prev
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTexPopup(prev =>
        prev?.rawPath === rawPath
          ? { ...prev, error: msg, resolvedPath: null }
          : prev
      );
    }
  }, []);

  /** Schedule dismissal of the hover popup (can be cancelled if mouse re-enters) */
  const scheduleTexPopupHide = useCallback(() => {
    if (texHideTimeoutRef.current) clearTimeout(texHideTimeoutRef.current);
    texHideTimeoutRef.current = setTimeout(() => {
      if (!isMouseOverPopupRef.current) {
        setTexPopup(null);
      }
    }, 280);
  }, []);

  /** Open a full-size texture preview tab for the currently shown popup */
  const handleTexOpenFull = useCallback(() => {
    const popup = texPopupRef.current;
    if (!popup?.resolvedPath) return;
    setTexPopup(null);

    // Check if already open
    const existing = tabs.find(t => t.filePath === popup.resolvedPath && t.tabType === 'texture-preview');
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const newTab = createTexPreviewTab(popup.resolvedPath);
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);

    // Load texture data into the new tab
    loadTextureIntoTab(newTab.id, popup.resolvedPath);
  }, [tabs, loadTextureIntoTab]);

  /** Open the file in the configured image editor (or OS default) */
  const handleTexEditImage = useCallback(async (resolvedPath: string | null | undefined) => {
    const path = resolvedPath ?? texPopupRef.current?.resolvedPath;
    if (!path) return;
    try {
      await invoke('open_tex_for_edit', { filePath: path });
    } catch (err) {
      setStatusMessage(`Edit Image: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleEditorMount = (editor: MonacoType.editor.IStandaloneCodeEditor) => {
    // Clean up any previous subscriptions before creating new ones
    editorDisposablesRef.current.forEach(disposable => {
      try {
        disposable.dispose();
      } catch (error) {
        console.warn('Error disposing previous subscription:', error);
      }
    });
    editorDisposablesRef.current = [];

    // Disconnect previous MutationObserver if it exists
    if (mutationObserverRef.current) {
      mutationObserverRef.current.disconnect();
      mutationObserverRef.current = null;
    }

    // Clear any pending mutation setup timeout
    if (mutationSetupTimeoutRef.current) {
      clearTimeout(mutationSetupTimeoutRef.current);
      mutationSetupTimeoutRef.current = null;
    }

    // Clear any existing undo check interval
    if (undoCheckIntervalRef.current) {
      clearInterval(undoCheckIntervalRef.current);
      undoCheckIntervalRef.current = null;
    }

    editorRef.current = editor;

    // Configure model to limit undo stack memory
    const model = editor.getModel();
    if (model) {
      setLineCount(model.getLineCount());
      // Set model options to help reduce memory usage
      model.updateOptions({
        tabSize: 2,
        insertSpaces: true,
      });
    }

    // Update caret position on cursor change - DEBOUNCED to prevent re-render spam
    const caretUpdateTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null };
    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      // Debounce cursor updates to 100ms to avoid re-rendering on every keystroke
      if (caretUpdateTimeoutRef.current) {
        clearTimeout(caretUpdateTimeoutRef.current);
      }
      caretUpdateTimeoutRef.current = setTimeout(() => {
        setCaretPosition({ line: e.position.lineNumber, column: e.position.column });
        caretUpdateTimeoutRef.current = null;
      }, 100);
    });
    editorDisposablesRef.current.push(cursorDisposable);
    editorDisposablesRef.current.push({
      dispose: () => {
        if (caretUpdateTimeoutRef.current) clearTimeout(caretUpdateTimeoutRef.current);
      }
    });

    // ── Texture path hover detection ──────────────────────────────────────
    const texMoveHideTimeout = { current: null as ReturnType<typeof setTimeout> | null };
    let lastTexPath = '';

    const mouseMoveDisposable = editor.onMouseMove((e) => {
      if (!e.target.position) {
        // Mouse left the editor text area - schedule hide
        if (texMoveHideTimeout.current) clearTimeout(texMoveHideTimeout.current);
        texMoveHideTimeout.current = setTimeout(() => {
          if (!isMouseOverPopupRef.current) setTexPopup(null);
        }, 280);
        return;
      }

      const model = editor.getModel();
      if (!model) return;

      const line = model.getLineContent(e.target.position.lineNumber);
      const texPath = extractTexPathAtColumn(line, e.target.position.column);

      if (texPath) {
        if (texMoveHideTimeout.current) clearTimeout(texMoveHideTimeout.current);

        if (texPath !== lastTexPath) {
          lastTexPath = texPath;
          // Get the base file path from the currently active tab
          const baseFile = activeTabRef.current?.filePath ?? null;
          setTexPopup({
            x: e.event.posx,
            y: e.event.posy,
            rawPath: texPath,
            resolvedPath: null,
            imageDataUrl: null,
            texWidth: 0,
            texHeight: 0,
            formatStr: '',
            formatNum: 0,
            error: null,
          });
          // Kick off async load
          loadTextureForPopup(texPath, baseFile);
        } else {
          // Same path - just update position
          setTexPopup(prev => prev ? { ...prev, x: e.event.posx, y: e.event.posy } : prev);
        }
      } else {
        lastTexPath = '';
        if (texMoveHideTimeout.current) clearTimeout(texMoveHideTimeout.current);
        texMoveHideTimeout.current = setTimeout(() => {
          if (!isMouseOverPopupRef.current) setTexPopup(null);
        }, 280);
      }
    });
    editorDisposablesRef.current.push(mouseMoveDisposable);
    editorDisposablesRef.current.push({
      dispose: () => {
        if (texMoveHideTimeout.current) clearTimeout(texMoveHideTimeout.current);
      }
    });

    const mouseLeaveDisposable = editor.onMouseLeave(() => {
      lastTexPath = '';
      if (texMoveHideTimeout.current) clearTimeout(texMoveHideTimeout.current);
      texMoveHideTimeout.current = setTimeout(() => {
        if (!isMouseOverPopupRef.current) setTexPopup(null);
      }, 280);
    });
    editorDisposablesRef.current.push(mouseLeaveDisposable);
    // ── End texture hover detection ───────────────────────────────────────

    // Restore view state for active tab (model-switching effect will handle this on tab changes)
    // On initial mount, trigger model setup for the first tab
    if (activeTabId) {
      // Trigger the model-switching effect by forcing a re-evaluation
      // The effect depends on activeTabId which is already set
      setTimeout(() => {
        const monaco = monacoRef.current;
        const activeTabData = tabs.find(t => t.id === activeTabId);
        if (monaco && activeTabData && editor) {
          const uri = activeTabData.filePath
            ? monaco.Uri.file(activeTabData.filePath)
            : monaco.Uri.parse(`inmemory://tab/${activeTabId}`);
          const existing = monaco.editor.getModel(uri);
          let model: MonacoType.editor.ITextModel;
          if (existing && !existing.isDisposed()) {
            model = existing;
          } else {
            model = monaco.editor.createModel(activeTabData.content, RITOBIN_LANGUAGE_ID, uri);
          }
          monacoModelsRef.current.set(activeTabId, model);
          editor.setModel(model);
          const savedState = viewStatesRef.current.get(activeTabId);
          if (savedState?.viewState) {
            editor.restoreViewState(savedState.viewState);
          }
          setLineCount(model.getLineCount());
        }
      }, 0);
    }

    // Periodic undo stack trimming to prevent memory bloat
    // Monaco doesn't expose direct undo stack access, but we can segment it periodically
    undoCheckIntervalRef.current = setInterval(() => {
      const currentModel = editorRef.current?.getModel();
      if (currentModel) {
        // Push a stack element periodically to segment the undo stack
        // This prevents undo operations from spanning too much content
        currentModel.pushStackElement();
      }
    }, 30000) as unknown as number; // Every 30 seconds

    // Watch for find widget visibility - STORE THE OBSERVER
    mutationSetupTimeoutRef.current = setTimeout(() => {
      const editorElement = editor.getDomNode();
      if (editorElement) {
        mutationObserverRef.current = new MutationObserver(() => {
          const findWidget = editorElement.querySelector('.find-widget');
          if (findWidget) {
            const isHidden = findWidget.classList.contains('hidden') ||
              findWidget.getAttribute('aria-hidden') === 'true' ||
              (findWidget as HTMLElement).style.display === 'none';

            const isVisible = !isHidden;
            const isReplace = findWidget.classList.contains('replaceToggled');

            if (isVisible) {
              setFindWidgetOpen(!isReplace);
              setReplaceWidgetOpen(isReplace);
            } else {
              setFindWidgetOpen(false);
              setReplaceWidgetOpen(false);
            }
          } else {
            setFindWidgetOpen(false);
            setReplaceWidgetOpen(false);
          }
        });

        mutationObserverRef.current.observe(editorElement, {
          attributes: true,
          childList: true,
          subtree: true,
          attributeFilter: ['class', 'style', 'aria-hidden']
        });
      }
      mutationSetupTimeoutRef.current = null;
    }, 500) as unknown as number;
  };

  // Cleanup subscriptions only on component unmount (editor no longer remounts on tab change)
  useEffect(() => {
    return () => {
      // Clean up all editor subscriptions
      editorDisposablesRef.current.forEach(disposable => {
        try {
          disposable.dispose();
        } catch (error) {
          console.warn('Error disposing subscription on cleanup:', error);
        }
      });
      editorDisposablesRef.current = [];

      // Disconnect MutationObserver
      if (mutationObserverRef.current) {
        mutationObserverRef.current.disconnect();
        mutationObserverRef.current = null;
      }

      // Clear mutation setup timeout
      if (mutationSetupTimeoutRef.current) {
        clearTimeout(mutationSetupTimeoutRef.current);
        mutationSetupTimeoutRef.current = null;
      }

      // Clear undo check interval
      if (undoCheckIntervalRef.current) {
        clearInterval(undoCheckIntervalRef.current);
        undoCheckIntervalRef.current = null;
      }

      // Dispose all Monaco models on unmount
      monacoModelsRef.current.forEach((model) => {
        if (!model.isDisposed()) {
          try { model.dispose(); } catch (_) { }
        }
      });
      monacoModelsRef.current.clear();
    };
  }, []); // Only run cleanup on unmount

  // Ref to track if tab was already modified (to skip unnecessary state updates)
  const wasModifiedRef = useRef(false);

  // Reset wasModified ref when active tab changes
  useEffect(() => {
    wasModifiedRef.current = activeTab?.isModified || false;
  }, [activeTabId, activeTab?.isModified]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined && activeTabId) {
      // Only update state if tab wasn't already marked modified (prevents re-render spam)
      if (!wasModifiedRef.current) {
        wasModifiedRef.current = true;
        setTabs(prevTabs =>
          prevTabs.map(t =>
            t.id === activeTabId ? { ...t, isModified: true } : t
          )
        );
      }
      // Update line count (lightweight, no re-render if unchanged)
      const model = editorRef.current?.getModel();
      if (model) {
        setLineCount(model.getLineCount());
      }
    }
  };

  // Window Controls
  const handleMinimize = () => getCurrentWindow().minimize();
  const handleMaximize = () => getCurrentWindow().toggleMaximize();
  const handleClose = () => getCurrentWindow().close();

  // File Operations
  const handleOpen = async () => {
    try {
      // Block hash status updates while opening file
      allowHashStatusUpdateRef.current = false;
      const result = await openBinFile();
      if (result) {
        addTab(result.path, result.content);
        setStatusMessage(`Opened ${result.path}`);
        statusMessageRef.current = `Opened ${result.path}`;

        if (result.path) {
          await addToRecentFiles(result.path);
        }

        // Open linked bin files if preference enabled
        await openLinkedBinFiles(result.path, result.content);

        // Re-enable hash status updates after file is opened
        setTimeout(() => {
          allowHashStatusUpdateRef.current = true;
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to open file:', error);
      setStatusMessage(`Error: ${error}`);
      statusMessageRef.current = `Error: ${error}`;
      setTimeout(() => {
        allowHashStatusUpdateRef.current = true;
      }, 2000);
    }
  };

  const openLinkedBinFiles = async (filePath: string, content: string) => {
    try {
      const importLinked = await invoke<string>('get_preference', {
        key: 'ImportLinkedBins',
        defaultValue: 'False'
      });

      if (importLinked !== 'True') return;

      const extension = filePath.toLowerCase().split('.').pop();
      if (extension !== 'bin') return;

      const recursiveEnabled = await invoke<string>('get_preference', {
        key: 'RecursiveLinkedBins',
        defaultValue: 'False'
      }) === 'True';

      // Block hash status updates while loading linked files
      allowHashStatusUpdateRef.current = false;
      setStatusMessage('Loading linked files...');
      statusMessageRef.current = 'Loading linked files...';

      const linkedResults = await findAndOpenLinkedBins(
        filePath,
        content,
        recursiveEnabled,
        (result: LinkedBinResult) => {
          addTab(result.path, result.content);
        }
      );

      if (linkedResults.length > 0) {
        setStatusMessage(`Loaded ${linkedResults.length} linked file(s)`);
        statusMessageRef.current = `Loaded ${linkedResults.length} linked file(s)`;
      }

      // Re-enable hash status updates after loading linked files
      setTimeout(() => {
        allowHashStatusUpdateRef.current = true;
      }, 2000);
    } catch (error) {
      console.error('Error opening linked bin files:', error);
    }
  };

  const handleSave = async () => {
    if (!activeTab) return;

    try {
      // Block hash status updates while saving
      allowHashStatusUpdateRef.current = false;
      if (activeTab.filePath) {
        // Read content from editor for active tab, or from state for inactive tabs
        const content = editorRef.current?.getValue() || activeTab.content;
        await saveBinFile(content, activeTab.filePath);
        setTabs(prevTabs =>
          prevTabs.map(t =>
            t.id === activeTabId ? { ...t, isModified: false } : t
          )
        );
        setStatusMessage(`Saved ${activeTab.filePath}`);
        statusMessageRef.current = `Saved ${activeTab.filePath}`;
        // Re-enable hash status updates after save
        setTimeout(() => {
          allowHashStatusUpdateRef.current = true;
        }, 2000);
      } else {
        handleSaveAs();
      }
    } catch (error) {
      console.error('Failed to save file:', error);
      setStatusMessage(`Error: ${error}`);
      statusMessageRef.current = `Error: ${error}`;
      alert(`Failed to save file: ${error}`);
      setTimeout(() => {
        allowHashStatusUpdateRef.current = true;
      }, 2000);
    }
  };

  const handleSaveAs = async () => {
    if (!activeTab) return;

    try {
      // Block hash status updates while saving
      allowHashStatusUpdateRef.current = false;
      // Read content from editor for active tab, or from state for inactive tabs
      const content = editorRef.current?.getValue() || activeTab.content;
      const newPath = await saveBinFileAs(content);
      if (newPath) {
        setTabs(prevTabs =>
          prevTabs.map(t =>
            t.id === activeTabId ? {
              ...t,
              filePath: newPath,
              fileName: getFileName(newPath),
              isModified: false
            } : t
          )
        );
        setStatusMessage(`Saved ${newPath}`);
        statusMessageRef.current = `Saved ${newPath}`;
        // Re-enable hash status updates after save
        setTimeout(() => {
          allowHashStatusUpdateRef.current = true;
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
      setStatusMessage(`Error: ${error}`);
      statusMessageRef.current = `Error: ${error}`;
      alert(`Failed to save file: ${error}`);
      setTimeout(() => {
        allowHashStatusUpdateRef.current = true;
      }, 2000);
    }
  };

  // Edit Operations
  const handleUndo = () => editorRef.current?.trigger('keyboard', 'undo', null);
  const handleRedo = () => editorRef.current?.trigger('keyboard', 'redo', null);
  const handleCut = () => document.execCommand('cut');
  const handleCopy = () => document.execCommand('copy');
  const handlePaste = () => document.execCommand('paste');

  const handleFind = () => {
    if (findWidgetOpen) {
      editorRef.current?.trigger('keyboard', 'closeFindWidget', null);
      setFindWidgetOpen(false);
    } else {
      setGeneralEditPanelOpen(false);
      setParticlePanelOpen(false);
      editorRef.current?.trigger('keyboard', 'actions.find', null);
      setFindWidgetOpen(true);
      setReplaceWidgetOpen(false);
    }
  };

  const handleReplace = () => {
    if (replaceWidgetOpen) {
      editorRef.current?.trigger('keyboard', 'closeFindWidget', null);
      setReplaceWidgetOpen(false);
    } else {
      setGeneralEditPanelOpen(false);
      setParticlePanelOpen(false);
      editorRef.current?.trigger('keyboard', 'editor.action.startFindReplaceAction', null);
      setReplaceWidgetOpen(true);
      setFindWidgetOpen(false);
    }
  };

  const handleCompareFiles = () => console.log('Compare Files');
  const handleSelectAll = () => editorRef.current?.trigger('keyboard', 'editor.action.selectAll', null);
  const handleGeneralEdit = () => {
    setFindWidgetOpen(false);
    setReplaceWidgetOpen(false);
    setParticlePanelOpen(false);
    editorRef.current?.trigger('keyboard', 'closeFindWidget', null);
    setGeneralEditPanelOpen(!generalEditPanelOpen);
  };

  // Handle content change from General Edit Panel (undoable, preserves cursor/scroll)
  const handleGeneralEditContentChange = (newContent: string) => {
    if (activeTabId && editorRef.current) {
      const editor = editorRef.current;
      const model = editor.getModel();
      if (model) {
        const currentContent = model.getValue();

        // Find the actual changed lines to minimize the edit
        const oldLines = currentContent.split('\n');
        const newLines = newContent.split('\n');

        // Find first different line
        let startLine = 0;
        while (startLine < oldLines.length && startLine < newLines.length &&
          oldLines[startLine] === newLines[startLine]) {
          startLine++;
        }

        // Find last different line (from end)
        let oldEndLine = oldLines.length - 1;
        let newEndLine = newLines.length - 1;
        while (oldEndLine > startLine && newEndLine > startLine &&
          oldLines[oldEndLine] === newLines[newEndLine]) {
          oldEndLine--;
          newEndLine--;
        }

        // Calculate the range to replace (1-indexed for Monaco)
        const startLineNum = startLine + 1;
        const endLineNum = oldEndLine + 1;
        const endColumn = (oldLines[oldEndLine]?.length || 0) + 1;

        // Get the replacement text
        const replacementLines = newLines.slice(startLine, newEndLine + 1);
        const replacementText = replacementLines.join('\n');

        // Get current selections to preserve cursor position on undo
        const selections = editor.getSelections() || [];

        // Use pushEditOperations for proper undo stack with cursor restoration
        // Only push stack element AFTER the edit (not before)
        model.pushEditOperations(
          selections,
          [{
            range: {
              startLineNumber: startLineNum,
              startColumn: 1,
              endLineNumber: endLineNum,
              endColumn: endColumn
            },
            text: replacementText
          }],
          () => selections // Return same selections for undo
        );

        // Push stack element AFTER the edit (only once)
        model.pushStackElement();

        // Update tab content state (mark as modified, content will be synced on tab switch)
        setTabs(prevTabs =>
          prevTabs.map(t =>
            t.id === activeTabId ? { ...t, isModified: true } : t
          )
        );
      }
    }
  };
  const handleOpenLog = () => console.log('Open Log');

  // Tool Operations
  const handleThemes = () => setShowThemesDialog(true);
  const handlePreferences = () => setShowPreferencesDialog(true);
  const handleSettings = () => setShowSettingsDialog(true);
  const handleAbout = () => setShowAboutDialog(true);

  // Helper to check if current file is a bin file
  const isBinFileOpen = (): boolean => {
    if (!activeTab) return false;
    const fileName = activeTab.fileName.toLowerCase();
    return fileName.endsWith('.bin');
  };

  // Particle Editor handlers
  const handleParticlePanel = () => {
    // Only allow opening if a bin file is loaded
    if (!isBinFileOpen()) return;

    setFindWidgetOpen(false);
    setReplaceWidgetOpen(false);
    setGeneralEditPanelOpen(false);
    editorRef.current?.trigger('keyboard', 'closeFindWidget', null);
    setParticlePanelOpen(prev => !prev);
  };

  const handleParticleEditor = () => {
    // Only allow opening if a bin file is loaded
    if (!isBinFileOpen()) return;

    setParticlePanelOpen(false);
    setParticleDialogOpen(true);
  };

  // Scroll to line handler for particle editor
  const handleScrollToLine = (line: number) => {
    if (editorRef.current) {
      editorRef.current.revealLineInCenter(line);
      editorRef.current.setPosition({ lineNumber: line, column: 1 });
      editorRef.current.focus();
    }
  };

  // Build status message
  const statusText = `${statusMessage}${activeTab?.isModified ? ' (Modified)' : ''}`;

  return (
    <div className={`app-container ${isDragging ? 'dragging' : ''}`}>
      <TitleBar
        appIcon={appIcon}
        isMaximized={isMaximized}
        onThemes={handleThemes}
        onPreferences={handlePreferences}
        onSettings={handleSettings}
        onAbout={handleAbout}
        onMinimize={handleMinimize}
        onMaximize={handleMaximize}
        onClose={handleClose}
        onParticleEditor={handleParticleEditor}
      />

      <MenuBar
        findActive={findWidgetOpen}
        replaceActive={replaceWidgetOpen}
        generalEditActive={generalEditPanelOpen}
        particlePanelActive={particlePanelOpen}
        onOpenFile={handleOpen}
        onSaveFile={handleSave}
        onSaveFileAs={handleSaveAs}
        onOpenLog={handleOpenLog}
        onExit={handleClose}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onFind={handleFind}
        onReplace={handleReplace}
        onCompareFiles={handleCompareFiles}
        onSelectAll={handleSelectAll}
        onGeneralEdit={handleGeneralEdit}
        onParticlePanel={handleParticlePanel}
        onThemes={handleThemes}
        onSettings={handleSettings}
        onAbout={handleAbout}
        recentFiles={recentFiles}
        onOpenRecentFile={openFileFromPath}
      />

      {tabs.length > 0 && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={handleTabSelect}
          onTabClose={handleTabClose}
          onTabCloseAll={handleTabCloseAll}
          onTabPin={handleTabPin}
        />
      )}

      {tabs.length === 0 && <WelcomeScreen onOpenFile={handleOpen} />}

      {/* Keep the editor container (and Monaco) always mounted.
          Unmounting Monaco while a requestAnimationFrame render is in-flight
          causes "Cannot read properties of undefined (reading 'domNode')".
          We hide it with display:none when there are no tabs instead. */}
      {/* Texture-preview tab: shown instead of Monaco when active tab is a texture */}
      {activeTab?.tabType === 'texture-preview' && activeTab.filePath && (
        <TexturePreviewTab
          filePath={activeTab.filePath}
          imageDataUrl={activeTab.textureDataUrl ?? null}
          texWidth={activeTab.textureWidth ?? 0}
          texHeight={activeTab.textureHeight ?? 0}
          format={activeTab.textureFormat ?? 0}
          error={activeTab.textureError ?? null}
          isReloading={reloadingTexTabId === activeTab.id}
          onEditImage={() => handleTexEditImage(activeTab.filePath)}
          onReload={handleTexReload}
        />
      )}

      <div
        className="editor-container"
        style={
          tabs.length === 0 || activeTab?.tabType === 'texture-preview'
            ? { display: 'none' }
            : undefined
        }
      >
        <Editor
          height="100%"
          defaultLanguage={RITOBIN_LANGUAGE_ID}
          theme={RITOBIN_THEME_ID}
          beforeMount={handleBeforeMount}
          onMount={handleEditorMount}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: true },
            fontSize: 14,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            fixedOverflowWidgets: true,
            find: {
              addExtraSpaceOnTop: false,
              autoFindInSelection: 'never',
              seedSearchStringFromSelection: 'always',
            },
            ...({
              "bracketPairColorization.enabled": true,
              "suggest.maxVisibleSuggestions": 5,
            } as any),
          }}
        />
        {activeTab && activeTab.tabType !== 'texture-preview' && (
          <GeneralEditPanel
            isOpen={generalEditPanelOpen}
            onClose={() => setGeneralEditPanelOpen(false)}
            editorContent={editorRef.current?.getValue() || activeTab.content}
            onContentChange={handleGeneralEditContentChange}
          />
        )}
        {activeTab && activeTab.tabType !== 'texture-preview' && (
          <ParticleEditorPanel
            isOpen={particlePanelOpen}
            onClose={() => setParticlePanelOpen(false)}
            editorContent={editorRef.current?.getValue() || activeTab.content}
            onContentChange={handleGeneralEditContentChange}
            onScrollToLine={handleScrollToLine}
            onStatusUpdate={setStatusMessage}
          />
        )}
      </div>

      {/* Texture hover popup */}
      {texPopup && (
        <TexHoverPopup
          x={texPopup.x}
          y={texPopup.y}
          rawPath={texPopup.rawPath}
          resolvedPath={texPopup.resolvedPath}
          imageDataUrl={texPopup.imageDataUrl}
          texWidth={texPopup.texWidth}
          texHeight={texPopup.texHeight}
          formatName={texPopup.formatStr}
          error={texPopup.error}
          onOpenFull={handleTexOpenFull}
          onEditImage={() => handleTexEditImage(texPopup.resolvedPath)}
          onDismiss={() => {
            isMouseOverPopupRef.current = false;
            scheduleTexPopupHide();
          }}
          onMouseEnter={() => {
            isMouseOverPopupRef.current = true;
            if (texHideTimeoutRef.current) {
              clearTimeout(texHideTimeoutRef.current);
              texHideTimeoutRef.current = null;
            }
          }}
        />
      )}

      <StatusBar
        status={statusText}
        lineCount={lineCount}
        caretLine={caretPosition.line}
        caretColumn={caretPosition.column}
        ramUsage="0 MB"
      />

      <AboutDialog
        isOpen={showAboutDialog}
        onClose={() => setShowAboutDialog(false)}
      />

      <ThemesDialog
        isOpen={showThemesDialog}
        onClose={() => setShowThemesDialog(false)}
        onThemeApplied={handleThemeApplied}
      />

      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />

      <PreferencesDialog
        isOpen={showPreferencesDialog}
        onClose={() => setShowPreferencesDialog(false)}
      />

      {updateToastVersion && (
        <UpdateToast
          version={updateToastVersion}
          onOpenSettings={() => setShowSettingsDialog(true)}
          onDismiss={() => setUpdateToastVersion(null)}
        />
      )}

      {activeTab && particleDialogOpen && (
        <ParticleEditorDialog
          isOpen={particleDialogOpen}
          onClose={() => setParticleDialogOpen(false)}
          editorContent={editorRef.current?.getValue() || activeTab.content}
          onContentChange={handleGeneralEditContentChange}
          onScrollToLine={handleScrollToLine}
          onStatusUpdate={setStatusMessage}
        />
      )}

      <SmokeOverlay active={cigaretteMode} />
    </div>
  );
}

export default App;
