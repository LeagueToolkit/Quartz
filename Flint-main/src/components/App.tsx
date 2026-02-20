/**
 * Flint - Main Application Component
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useAppState } from '../lib/state';
import { initShortcuts, registerShortcut } from '../lib/utils';
import * as api from '../lib/api';

import { TopBar } from './TopBar';
import { LeftPanel } from './FileTree';
import { WadBrowserPanel } from './WadBrowser';
import { WadExplorer } from './WadExplorer';
import { CenterPanel } from './CenterPanel';
import { StatusBar } from './StatusBar';
import { ContextMenu } from './ContextMenu';
import { NewProjectModal } from './modals/NewProjectModal';
import { SettingsModal } from './modals/SettingsModal';
import { ExportModal } from './modals/ExportModal';
import { FirstTimeSetupModal } from './modals/FirstTimeSetupModal';
import { UpdateModal } from './modals/UpdateModal';
import { RecolorModal } from './modals/RecolorModal';
import { ToastContainer } from './Toast';

// Helper to get active tab from state
function getActiveTab(state: { activeTabId: string | null; openTabs: Array<{ id: string; project: any; projectPath: string }> }) {
    if (!state.activeTabId) return null;
    return state.openTabs.find(t => t.id === state.activeTabId) || null;
}

export const App: React.FC = () => {
    const { state, dispatch, openModal, closeModal, setWorking, setReady, showToast } = useAppState();
    const [leftPanelWidth, setLeftPanelWidth] = useState(280);
    const resizerRef = useRef<HTMLDivElement>(null);
    const isResizingRef = useRef(false);

    // Keep a ref to always-current state so shortcut handlers are never stale
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; });

    // Initialize shortcuts and load data on mount
    useEffect(() => {
        initShortcuts();

        // Register shortcuts — use stateRef.current so handlers always see latest state
        registerShortcut('ctrl+n', () => openModal('newProject'));
        registerShortcut('ctrl+s', async () => {
            const activeTab = getActiveTab(stateRef.current);
            if (activeTab) {
                try {
                    setWorking('Saving...');
                    await api.saveProject(activeTab.project);
                    setReady('Saved');
                } catch (error) {
                    console.error('Failed to save:', error);
                    showToast('error', 'Save failed');
                }
            }
        });
        registerShortcut('ctrl+,', () => openModal('settings'));
        registerShortcut('ctrl+e', () => {
            const activeTab = getActiveTab(stateRef.current);
            if (activeTab) {
                openModal('export');
            }
        });
        registerShortcut('ctrl+w', () => {
            const s = stateRef.current;
            if (s.currentView === 'wad-explorer') {
                dispatch({ type: 'CLOSE_WAD_EXPLORER' });
            } else if (s.currentView === 'extract' && s.activeExtractId) {
                dispatch({ type: 'CLOSE_EXTRACT_SESSION', payload: s.activeExtractId });
            } else if (s.currentView === 'preview' && s.activeTabId) {
                dispatch({ type: 'REMOVE_TAB', payload: s.activeTabId });
            }
        });
        registerShortcut('escape', () => {
            if (stateRef.current.activeModal) {
                closeModal();
            }
        });

        // Load initial data
        loadInitialData();
        // Clean stale projects
        cleanStaleProjects();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const loadInitialData = async () => {
        try {
            const hashStatus = await api.getHashStatus();
            dispatch({
                type: 'SET_STATE',
                payload: {
                    hashesLoaded: hashStatus.loaded_count > 0,
                    hashCount: hashStatus.loaded_count,
                },
            });

            if (hashStatus.loaded_count === 0) {
                pollHashStatus();
            }

            if (!state.leaguePath) {
                try {
                    const leagueResult = await api.detectLeague();
                    if (leagueResult.path) {
                        dispatch({ type: 'SET_STATE', payload: { leaguePath: leagueResult.path } });
                        console.log('[Flint] Auto-detected League path:', leagueResult.path);
                    }
                } catch {
                    console.log('[Flint] League auto-detection failed');
                }
            }

            // Check for updates after a short delay (don't block startup)
            setTimeout(checkForUpdates, 3000);
        } catch (error) {
            console.error('[Flint] Failed to load initial data:', error);
        }
    };

    const pollHashStatus = async () => {
        const maxAttempts = 30;
        let attempts = 0;

        const poll = async () => {
            try {
                const status = await api.getHashStatus();
                if (status.loaded_count > 0) {
                    dispatch({
                        type: 'SET_STATE',
                        payload: { hashesLoaded: true, hashCount: status.loaded_count },
                    });
                    console.log(`[Flint] Hashes loaded: ${status.loaded_count.toLocaleString()}`);
                    return;
                }

                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, 1000);
                }
            } catch (error) {
                console.error('[Flint] Error polling hash status:', error);
            }
        };

        setTimeout(poll, 1000);
    };

    const checkForUpdates = async () => {
        try {
            console.log('[Flint] Checking for updates...');
            const updateInfo = await api.checkForUpdates();
            if (updateInfo.available) {
                // Skip if user already skipped this version
                if (state.skippedUpdateVersion === updateInfo.latest_version) {
                    console.log(`[Flint] Update ${updateInfo.latest_version} was skipped by user`);
                    return;
                }
                console.log(`[Flint] Update available: ${updateInfo.current_version} → ${updateInfo.latest_version}`);
                openModal('updateAvailable', updateInfo as unknown as Record<string, unknown>);
            } else {
                console.log('[Flint] Application is up to date');
            }
        } catch (error) {
            // Silently fail - don't bother user if update check fails
            console.log('[Flint] Update check failed:', error);
        }
    };

    const cleanStaleProjects = async () => {
        try {
            const recent = stateRef.current.recentProjects;
            if (recent.length === 0) return;

            // Validate all projects in parallel instead of sequentially
            const results = await Promise.allSettled(
                recent.map(project => api.listProjectFiles(project.path).then(() => project))
            );

            const validProjects = results
                .filter((r): r is PromiseFulfilledResult<typeof recent[number]> => r.status === 'fulfilled')
                .map(r => r.value);

            if (validProjects.length !== recent.length) {
                dispatch({ type: 'SET_RECENT_PROJECTS', payload: validProjects });
            }
        } catch (error) {
            console.error('[Flint] Failed to clean stale projects:', error);
        }
    };

    // Resizer handling
    const handleMouseDown = useCallback(() => {
        isResizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizingRef.current) return;
            const newWidth = Math.min(400, Math.max(200, e.clientX));
            setLeftPanelWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (isResizingRef.current) {
                isResizingRef.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const handleResizerDoubleClick = useCallback(() => {
        setLeftPanelWidth(prev => (prev === 48 ? 280 : 48));
    }, []);

    // Use currentView as the single source of truth for what's displayed
    const isWadExplorer = state.currentView === 'wad-explorer';
    const isExtractMode = state.currentView === 'extract';
    // Show a left panel for any view that isn't the welcome screen or WAD Explorer
    const hasProject = !isWadExplorer && state.currentView !== 'welcome';

    // Check if first-time setup is needed
    useEffect(() => {
        if (!state.creatorName && !state.activeModal) {
            openModal('firstTimeSetup');
        }
    }, [state.creatorName, state.activeModal, openModal]);

    return (
        <>
            <TopBar />
            <div className="main-content" id="main-content">
                {/* Keep WadExplorer mounted when open — toggling display avoids the ~10s rescan on every switch */}
                {state.wadExplorer.isOpen && (
                    <div style={{ display: isWadExplorer ? 'contents' : 'none' }}>
                        <WadExplorer />
                    </div>
                )}
                {!isWadExplorer && (
                    <>
                        {hasProject && (
                            <>
                                {isExtractMode
                                    ? <WadBrowserPanel style={{ width: leftPanelWidth }} />
                                    : <LeftPanel style={{ width: leftPanelWidth }} />
                                }
                                <div
                                    ref={resizerRef}
                                    className="panel-resizer"
                                    id="panel-resizer"
                                    onMouseDown={handleMouseDown}
                                    onDoubleClick={handleResizerDoubleClick}
                                />
                            </>
                        )}
                        <CenterPanel />
                    </>
                )}
            </div>
            <StatusBar />

            {/* Modals */}
            <NewProjectModal />
            <SettingsModal />
            <ExportModal />
            <FirstTimeSetupModal />
            <UpdateModal />
            <RecolorModal />

            {/* Toast notifications */}
            <ToastContainer />

            {/* Context Menu */}
            <ContextMenu />
        </>
    );
};
