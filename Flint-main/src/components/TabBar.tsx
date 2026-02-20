/**
 * Flint - Tab Bar Component
 * Displays tabs for open projects and WAD extract sessions with switch/close functionality
 */

import React, { useCallback } from 'react';
import { useAppState } from '../lib/state';
import { getIcon } from '../lib/fileIcons';
import type { ProjectTab, ExtractSession } from '../lib/types';

/**
 * Individual tab component
 */
interface TabProps {
    tab: ProjectTab;
    isActive: boolean;
    onSwitch: () => void;
    onClose: (e: React.MouseEvent) => void;
}

const Tab: React.FC<TabProps> = ({ tab, isActive, onSwitch, onClose }) => {
    const handleMiddleClick = useCallback((e: React.MouseEvent) => {
        if (e.button === 1) { // Middle click
            e.preventDefault();
            onClose(e);
        }
    }, [onClose]);

    const projectName = tab.project.display_name || tab.project.name;
    const champion = tab.project.champion;

    return (
        <div
            className={`tabbar__tab ${isActive ? 'tabbar__tab--active' : ''}`}
            onClick={onSwitch}
            onMouseDown={handleMiddleClick}
            title={`${champion} - ${projectName}\n${tab.projectPath}`}
        >
            <span
                className="tabbar__tab-icon"
                dangerouslySetInnerHTML={{ __html: getIcon('folder') }}
            />
            <span className="tabbar__tab-name">
                {champion} - {projectName}
            </span>
            <button
                className="tabbar__tab-close"
                onClick={onClose}
                title="Close Tab"
            >
                <svg viewBox="0 0 16 16" width="14" height="14">
                    <path
                        d="M4.5 4.5l7 7m0-7l-7 7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        fill="none"
                    />
                </svg>
            </button>
        </div>
    );
};

// =============================================================================
// Extract Session Tab
// =============================================================================

interface ExtractTabProps {
    session: ExtractSession;
    isActive: boolean;
    onSwitch: () => void;
    onClose: (e: React.MouseEvent) => void;
}

const ExtractTab: React.FC<ExtractTabProps> = ({ session, isActive, onSwitch, onClose }) => {
    const handleMiddleClick = useCallback((e: React.MouseEvent) => {
        if (e.button === 1) {
            e.preventDefault();
            onClose(e);
        }
    }, [onClose]);

    return (
        <div
            className={`tabbar__tab ${isActive ? 'tabbar__tab--active' : ''}`}
            onClick={onSwitch}
            onMouseDown={handleMiddleClick}
            title={session.wadPath}
        >
            <span
                className="tabbar__tab-icon"
                dangerouslySetInnerHTML={{ __html: getIcon('wad') }}
            />
            <span className="tabbar__tab-name">{session.wadName}</span>
            {session.loading && (
                <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.6 }}>···</span>
            )}
            <button
                className="tabbar__tab-close"
                onClick={onClose}
                title="Close Tab"
            >
                <svg viewBox="0 0 16 16" width="14" height="14">
                    <path
                        d="M4.5 4.5l7 7m0-7l-7 7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        fill="none"
                    />
                </svg>
            </button>
        </div>
    );
};

// =============================================================================
// TabBar
// =============================================================================

/**
 * Tab bar component showing all open project tabs, WAD extract sessions, and WAD Explorer
 */
export const TabBar: React.FC = () => {
    const { state, dispatch } = useAppState();

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

    const isWadExplorerOpen = state.wadExplorer.isOpen;
    const isWadExplorerActive = state.currentView === 'wad-explorer';
    const isProjectActive = state.currentView === 'preview';
    const isExtractActive = state.currentView === 'extract';

    // Don't render if nothing is open
    if (state.openTabs.length === 0 && state.extractSessions.length === 0 && !isWadExplorerOpen) {
        return null;
    }

    return (
        <div className="tabbar">
            <div className="tabbar__tabs">
                {/* WAD Explorer singleton tab */}
                {isWadExplorerOpen && (
                    <div
                        className={`tabbar__tab ${isWadExplorerActive ? 'tabbar__tab--active' : ''}`}
                        onClick={() => dispatch({ type: 'OPEN_WAD_EXPLORER' })}
                        title="WAD Explorer — unified game asset browser"
                    >
                        <span
                            className="tabbar__tab-icon"
                            dangerouslySetInnerHTML={{ __html: getIcon('wad') }}
                        />
                        <span className="tabbar__tab-name">WAD Explorer</span>
                        <button
                            className="tabbar__tab-close"
                            onClick={e => { e.stopPropagation(); dispatch({ type: 'CLOSE_WAD_EXPLORER' }); }}
                            title="Close WAD Explorer"
                        >
                            <svg viewBox="0 0 16 16" width="14" height="14">
                                <path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                            </svg>
                        </button>
                    </div>
                )}

                {state.openTabs.map(tab => (
                    <Tab
                        key={tab.id}
                        tab={tab}
                        isActive={tab.id === state.activeTabId && isProjectActive}
                        onSwitch={() => handleSwitchTab(tab.id)}
                        onClose={(e) => handleCloseTab(e, tab.id)}
                    />
                ))}
                {state.extractSessions.map(session => (
                    <ExtractTab
                        key={session.id}
                        session={session}
                        isActive={session.id === state.activeExtractId && isExtractActive}
                        onSwitch={() => handleSwitchExtract(session.id)}
                        onClose={(e) => handleCloseExtract(e, session.id)}
                    />
                ))}
            </div>
        </div>
    );
};
