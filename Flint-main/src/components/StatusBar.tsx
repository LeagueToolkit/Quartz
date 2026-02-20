/**
 * Flint - Log Panel Component
 * Displays application logs captured by the logger service
 */

import React, { useEffect, useRef } from 'react';
import { useAppState } from '../lib/state';
import { connectLogger, disconnectLogger } from '../lib/logger';

// SVG Icons
const TrashIcon = () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
        <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
    </svg>
);

const CloseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
    </svg>
);

const TerminalIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6 9a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3A.5.5 0 0 1 6 9zM3.854 4.146a.5.5 0 1 0-.708.708L4.793 6.5 3.146 8.146a.5.5 0 1 0 .708.708l2-2a.5.5 0 0 0 0-.708l-2-2z" />
        <path d="M2 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2H2zm12 1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12z" />
    </svg>
);

export const LogPanel: React.FC = () => {
    const { state, dispatch, toggleLogPanel, clearLogs } = useAppState();
    const { logs, logPanelExpanded } = state;
    const contentRef = useRef<HTMLDivElement>(null);
    const hasConnectedRef = useRef(false);

    // Connect to the logger service on mount
    useEffect(() => {
        if (hasConnectedRef.current) return;
        hasConnectedRef.current = true;

        // Connect and get buffered logs
        const bufferedLogs = connectLogger((log) => {
            dispatch({ type: 'ADD_LOG', payload: log });
        });

        // Add buffered logs to state
        bufferedLogs.forEach(log => {
            dispatch({ type: 'ADD_LOG', payload: log });
        });

        return () => {
            disconnectLogger();
        };
    }, [dispatch]);

    // Auto-scroll to bottom when new logs appear
    useEffect(() => {
        if (contentRef.current && logPanelExpanded) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [logs, logPanelExpanded]);

    // Get the latest log message or default
    const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;
    const displayMessage = latestLog ? latestLog.message : state.statusMessage || 'Ready';
    const displayLevel = latestLog?.level || 'info';

    // Format timestamp
    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    // Get level class for styling
    const getLevelClass = (level: string) => {
        switch (level) {
            case 'error':
                return 'log-panel__entry--error';
            case 'warning':
                return 'log-panel__entry--warning';
            default:
                return 'log-panel__entry--info';
        }
    };

    // Get indicator class based on latest log level
    const getIndicatorClass = () => {
        if (!latestLog) {
            switch (state.status) {
                case 'working':
                    return 'log-panel__indicator--working';
                case 'error':
                    return 'log-panel__indicator--error';
                default:
                    return 'log-panel__indicator--ready';
            }
        }
        switch (latestLog.level) {
            case 'error':
                return 'log-panel__indicator--error';
            case 'warning':
                return 'log-panel__indicator--warning';
            default:
                return 'log-panel__indicator--ready';
        }
    };

    // Handle click on collapsed bar
    const handleBarClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleLogPanel();
    };

    // Handle close button click
    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleLogPanel();
    };

    // Handle clear button click
    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        clearLogs();
    };

    if (logPanelExpanded) {
        return (
            <div className="log-panel log-panel--expanded" onClick={handleClose}>
                <div className="log-panel__container" onClick={(e) => e.stopPropagation()}>
                    <div className="log-panel__header">
                        <span className="log-panel__title">
                            <TerminalIcon /> Output
                        </span>
                        <div className="log-panel__actions">
                            <button className="log-panel__btn" onClick={handleClear} title="Clear logs">
                                <TrashIcon /> Clear
                            </button>
                            <button className="log-panel__btn log-panel__btn--close" onClick={handleClose} title="Close">
                                <CloseIcon />
                            </button>
                        </div>
                    </div>
                    <div className="log-panel__content" ref={contentRef}>
                        {logs.length === 0 ? (
                            <div className="log-panel__empty">No logs yet</div>
                        ) : (
                            logs.map((log) => (
                                <div key={log.id} className={`log-panel__entry ${getLevelClass(log.level)}`}>
                                    <span className="log-panel__time">{formatTime(log.timestamp)}</span>
                                    <span className="log-panel__level">[{log.level.toUpperCase()}]</span>
                                    <span className="log-panel__message">{log.message}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <footer className="log-panel log-panel--collapsed" onClick={handleBarClick}>
            <div className="log-panel__left">
                <span className={`log-panel__indicator ${getIndicatorClass()}`} />
                <span className={`log-panel__text ${getLevelClass(displayLevel)}`}>
                    {displayMessage.length > 100 ? displayMessage.substring(0, 100) + '...' : displayMessage}
                </span>
            </div>
            <div className="log-panel__right">
                <span className="log-panel__hint">
                    <TerminalIcon /> {logs.length}
                </span>
            </div>
        </footer>
    );
};

// Re-export as StatusBar for backward compatibility
export const StatusBar = LogPanel;
