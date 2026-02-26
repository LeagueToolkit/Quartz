import React, { useRef, useEffect } from 'react';
import './TabBar.css';
import { PinIcon, CloseIcon } from './Icons';

export interface EditorTab {
    id: string;
    filePath: string | null;
    fileName: string;
    content: string;
    isModified: boolean;
    isPinned: boolean;
    /** 'editor' (default) or 'texture-preview' */
    tabType?: 'editor' | 'texture-preview';
    /** For texture-preview tabs: decoded PNG data URL */
    textureDataUrl?: string | null;
    /** For texture-preview tabs: pixel dimensions */
    textureWidth?: number;
    textureHeight?: number;
    /** For texture-preview tabs: TEX format enum value */
    textureFormat?: number;
    /** For texture-preview tabs: error string if loading failed */
    textureError?: string | null;
}

interface TabBarProps {
    tabs: EditorTab[];
    activeTabId: string | null;
    onTabSelect: (tabId: string) => void;
    onTabClose: (tabId: string) => void;
    onTabCloseAll: () => void;
    onTabPin: (tabId: string) => void;
}

export default function TabBar({
    tabs,
    activeTabId,
    onTabSelect,
    onTabClose,
    onTabCloseAll,
    onTabPin,
}: TabBarProps) {
    const tabsContainerRef = useRef<HTMLDivElement>(null);

    // Scroll active tab into view when it changes
    useEffect(() => {
        if (activeTabId && tabsContainerRef.current) {
            const activeTab = tabsContainerRef.current.querySelector(`[data-tab-id="${activeTabId}"]`);
            if (activeTab) {
                activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        }
    }, [activeTabId]);

    const handleMouseDown = (e: React.MouseEvent, tabId: string) => {
        // Middle click to close
        if (e.button === 1) {
            e.preventDefault();
            onTabClose(tabId);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, _tab: EditorTab) => {
        e.preventDefault();
        // Could add context menu here in the future
    };

    const handleCloseClick = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        onTabClose(tabId);
    };

    const handleDoubleClick = (_e: React.MouseEvent, tabId: string) => {
        // Double click to pin/unpin
        onTabPin(tabId);
    };

    // Handle horizontal scroll with mouse wheel
    const handleWheel = (e: React.WheelEvent) => {
        if (tabsContainerRef.current) {
            tabsContainerRef.current.scrollLeft += e.deltaY;
        }
    };

    if (tabs.length === 0) {
        return null;
    }

    return (
        <div className="tab-bar">
            <div
                className="tabs-container"
                ref={tabsContainerRef}
                onWheel={handleWheel}
            >
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        data-tab-id={tab.id}
                        className={`tab ${activeTabId === tab.id ? 'active' : ''} ${tab.isModified ? 'modified' : ''} ${tab.isPinned ? 'pinned' : ''}`}
                        onClick={() => onTabSelect(tab.id)}
                        onMouseDown={(e) => handleMouseDown(e, tab.id)}
                        onContextMenu={(e) => handleContextMenu(e, tab)}
                        onDoubleClick={(e) => handleDoubleClick(e, tab.id)}
                        title={tab.filePath || tab.fileName}
                    >
                        {tab.isPinned && <span className="tab-pin-icon"><PinIcon size={12} /></span>}
                        <span className="tab-label">
                            {tab.isModified && <span className="tab-modified-dot">●</span>}
                            {tab.fileName}
                        </span>
                        {!tab.isPinned && (
                            <button
                                className="tab-close-btn"
                                onClick={(e) => handleCloseClick(e, tab.id)}
                                title="Close (Middle Click)"
                            >
                                <CloseIcon size={16} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {tabs.length > 1 && (
                <div className="tabs-actions">
                    <button
                        className="close-all-btn"
                        onClick={onTabCloseAll}
                        title="Close All Tabs"
                    >
                        <CloseIcon size={12} /> All
                    </button>
                </div>
            )}
        </div>
    );
}

// Helper to generate unique tab IDs
let tabIdCounter = 0;
export function generateTabId(): string {
    return `tab-${++tabIdCounter}-${Date.now()}`;
}

// Helper to get file name from path
export function getFileName(filePath: string | null): string {
    if (!filePath) return 'Untitled';
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || 'Untitled';
}

// Create a new editor tab object
export function createTab(filePath: string | null, content: string): EditorTab {
    return {
        id: generateTabId(),
        filePath,
        fileName: getFileName(filePath),
        content,
        isModified: false,
        isPinned: false,
        tabType: 'editor',
    };
}

// Create a texture preview tab
export function createTexPreviewTab(filePath: string): EditorTab {
    const fileName = getFileName(filePath);
    return {
        id: generateTabId(),
        filePath,
        fileName,
        content: '',
        isModified: false,
        isPinned: false,
        tabType: 'texture-preview',
        textureDataUrl: null,
        textureWidth: 0,
        textureHeight: 0,
        textureFormat: 0,
        textureError: null,
    };
}
