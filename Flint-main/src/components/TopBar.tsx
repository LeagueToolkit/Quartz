/**
 * Flint - Top Bar Component
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppState } from '../lib/state';
import { getIcon } from '../lib/fileIcons';
import { save } from '@tauri-apps/plugin-dialog';
import * as api from '../lib/api';

/**
 * Flint flame logo SVG
 */
const FlintLogo: React.FC = () => (
    <svg className="topbar__logo" viewBox="0 0 24 24">
        <path
            d="M12 2C8.5 6 8 10 8 12c0 3.5 1.5 6 4 8 2.5-2 4-4.5 4-8 0-2-.5-6-4-10z"
            fill="currentColor"
        />
        <path
            d="M12 5c-2 3-2.5 5.5-2.5 7 0 2 .8 3.5 2.5 5 1.7-1.5 2.5-3 2.5-5 0-1.5-.5-4-2.5-7z"
            fill="var(--bg-secondary)"
        />
        <path
            d="M12 8c-1 1.5-1.5 3-1.5 4 0 1.2.5 2.2 1.5 3 1-.8 1.5-1.8 1.5-3 0-1-.5-2.5-1.5-4z"
            fill="currentColor"
        />
    </svg>
);

export const TopBar: React.FC = () => {
    const { state, dispatch, showToast } = useAppState();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Get active tab
    const activeTab = useMemo(() => {
        if (!state.activeTabId) return null;
        return state.openTabs.find(t => t.id === state.activeTabId) || null;
    }, [state.activeTabId, state.openTabs]);

    const currentProject = activeTab?.project || null;
    const currentProjectPath = activeTab?.projectPath || null;

    const handleSwitchTab = useCallback((tabId: string) => {
        dispatch({ type: 'SWITCH_TAB', payload: tabId });
    }, [dispatch]);

    const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        dispatch({ type: 'REMOVE_TAB', payload: tabId });
    }, [dispatch]);

    const handleSwitchExtract = useCallback((sessionId: string) => {
        dispatch({ type: 'SWITCH_EXTRACT_TAB', payload: sessionId });
    }, [dispatch]);

    const handleCloseExtract = useCallback((e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        dispatch({ type: 'CLOSE_EXTRACT_SESSION', payload: sessionId });
    }, [dispatch]);

    const toggleDropdown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setDropdownOpen(prev => !prev);
    }, []);

    // Direct export without modal - just opens save dialog
    const handleExportAs = useCallback(async (format: 'fantome' | 'modpkg') => {
        setDropdownOpen(false);

        if (!currentProjectPath || !currentProject) return;

        const ext = format;
        const projectName = currentProject?.display_name || currentProject?.name || 'mod';

        const outputPath = await save({
            title: `Export as .${ext}`,
            defaultPath: `${projectName}.${ext}`,
            filters: [{ name: `${ext.toUpperCase()} Package`, extensions: [ext] }],
        });

        if (!outputPath) return;

        setIsExporting(true);

        try {
            const result = await api.exportProject({
                projectPath: currentProjectPath,
                outputPath,
                format,
                champion: currentProject.champion,
                metadata: {
                    name: currentProject.name,
                    author: currentProject.creator || state.creatorName || 'Unknown',
                    version: currentProject.version || '1.0.0',
                    description: currentProject.description || '',
                },
            });

            showToast('success', `Exported to ${result.path}`);

            // Auto-checkpoint after export
            api.createCheckpoint(currentProjectPath, `Auto-checkpoint: Exported to ${format}`).catch(e => {
                console.warn('Auto-checkpoint failed:', e);
            });

        } catch (err) {
            console.error('Export failed:', err);
            const flintError = err as api.FlintError;
            showToast('error', flintError.getUserMessage?.() || 'Export failed');
        } finally {
            setIsExporting(false);
        }
    }, [currentProject, currentProjectPath, state.creatorName, showToast]);

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!dropdownOpen) return;

        const handleClickOutside = () => setDropdownOpen(false);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [dropdownOpen]);

    return (
        <header className="topbar">
            {/* Brand section */}
            <div
                className="topbar__brand"
                style={{ cursor: 'pointer' }}
                title="Return to Home"
                onClick={() => dispatch({ type: 'SET_STATE', payload: { currentView: 'welcome' } })}
            >
                <FlintLogo />
                <span className="topbar__title">Flint</span>
            </div>

            {/* Divider */}
            <div className="topbar__divider" />

            {/* Tabs: WAD Explorer + individual WADs + projects */}
            <div className="topbar__tabs-container">
                {state.openTabs.length === 0 && state.extractSessions.length === 0 && !state.wadExplorer.isOpen ? (
                    <div className="topbar__project">
                        <span className="topbar__project-icon" dangerouslySetInnerHTML={{ __html: getIcon('folder') }} />
                        <span className="topbar__project-name">No Project Open</span>
                    </div>
                ) : (
                    <div className="tabbar__tabs" style={{ height: '100%' }}>
                        {/* WAD Explorer singleton tab */}
                        {state.wadExplorer.isOpen && (
                            <div
                                className={`tabbar__tab ${state.currentView === 'wad-explorer' ? 'tabbar__tab--active' : ''}`}
                                onClick={() => dispatch({ type: 'OPEN_WAD_EXPLORER' })}
                                title="WAD Explorer — unified game asset browser"
                            >
                                <span className="tabbar__tab-icon" dangerouslySetInnerHTML={{ __html: getIcon('wad') }} />
                                <span className="tabbar__tab-name">WAD Explorer</span>
                                <button
                                    className="tabbar__tab-close"
                                    onClick={(e) => { e.stopPropagation(); dispatch({ type: 'CLOSE_WAD_EXPLORER' }); }}
                                    title="Close WAD Explorer"
                                >
                                    <svg viewBox="0 0 16 16" width="14" height="14">
                                        <path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* Project tabs */}
                        {state.openTabs.map(tab => (
                            <div
                                key={tab.id}
                                className={`tabbar__tab ${tab.id === state.activeTabId && state.currentView === 'preview' ? 'tabbar__tab--active' : ''}`}
                                onClick={() => handleSwitchTab(tab.id)}
                                onMouseDown={(e) => e.button === 1 && handleCloseTab(e, tab.id)}
                                title={`${tab.project.champion} - ${tab.project.display_name || tab.project.name}\n${tab.projectPath}`}
                            >
                                <span className="tabbar__tab-icon" dangerouslySetInnerHTML={{ __html: getIcon('folder') }} />
                                <span className="tabbar__tab-name">
                                    {tab.project.champion} - {tab.project.display_name || tab.project.name}
                                </span>
                                <button
                                    className="tabbar__tab-close"
                                    onClick={(e) => handleCloseTab(e, tab.id)}
                                    title="Close Tab"
                                >
                                    <svg viewBox="0 0 16 16" width="14" height="14">
                                        <path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                                    </svg>
                                </button>
                            </div>
                        ))}

                        {/* WAD extract session tabs */}
                        {state.extractSessions.map(session => (
                            <div
                                key={session.id}
                                className={`tabbar__tab ${session.id === state.activeExtractId && state.currentView === 'extract' ? 'tabbar__tab--active' : ''}`}
                                onClick={() => handleSwitchExtract(session.id)}
                                onMouseDown={(e) => e.button === 1 && handleCloseExtract(e, session.id)}
                                title={session.wadPath}
                            >
                                <span className="tabbar__tab-icon" dangerouslySetInnerHTML={{ __html: getIcon('wad') }} />
                                <span className="tabbar__tab-name">{session.wadName}</span>
                                {session.loading && <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.6 }}>···</span>}
                                <button
                                    className="tabbar__tab-close"
                                    onClick={(e) => handleCloseExtract(e, session.id)}
                                    title="Close Tab"
                                >
                                    <svg viewBox="0 0 16 16" width="14" height="14">
                                        <path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Spacer */}
            <div className="topbar__spacer" />

            {/* Actions */}
            <div className="topbar__actions">
                {/* Timeline + Export only make sense when a project is actively open */}
                {state.currentView === 'preview' && currentProjectPath && (
                    <button
                        className="btn btn--ghost"
                        title="Project Checkpoints"
                        onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { modal: 'checkpoint' } })}
                    >
                        <span dangerouslySetInnerHTML={{ __html: getIcon('history') }} />
                        <span>Timeline</span>
                    </button>
                )}

                {/* Export dropdown (only visible when actively viewing a project) */}
                {state.currentView === 'preview' && currentProject && (
                    <div className={`dropdown ${dropdownOpen ? 'dropdown--open' : ''}`}>
                        <button
                            className="btn btn--primary btn--dropdown"
                            onClick={toggleDropdown}
                            disabled={isExporting}
                        >
                            {isExporting ? 'Exporting...' : 'Export Mod'}
                        </button>
                        <div className="dropdown__menu">
                            <button
                                className="dropdown__item"
                                onClick={() => handleExportAs('fantome')}
                            >
                                <span dangerouslySetInnerHTML={{ __html: getIcon('package') }} />
                                <span>Export as .fantome</span>
                            </button>
                            <button
                                className="dropdown__item"
                                onClick={() => handleExportAs('modpkg')}
                            >
                                <span dangerouslySetInnerHTML={{ __html: getIcon('package') }} />
                                <span>Export as .modpkg</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Settings — always accessible */}
                <button
                    className="btn btn--ghost"
                    title="Settings (Ctrl+,)"
                    onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { modal: 'settings' } })}
                >
                    <span dangerouslySetInnerHTML={{ __html: getIcon('settings') }} />
                </button>
            </div>
        </header>
    );
};
