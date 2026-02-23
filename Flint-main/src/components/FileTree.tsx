/**
 * Flint - File Tree Component
 */

import React, { useState, useMemo, useCallback, CSSProperties } from 'react';
import { useAppState } from '../lib/state';
import { getFileIcon, getExpanderIcon, getIcon } from '../lib/fileIcons';
import * as api from '../lib/api';
import type { FileTreeNode, ProjectTab } from '../lib/types';

// Helper to get active tab
function getActiveTab(state: { activeTabId: string | null; openTabs: ProjectTab[] }): ProjectTab | null {
    if (!state.activeTabId) return null;
    return state.openTabs.find(t => t.id === state.activeTabId) || null;
}

interface LeftPanelProps {
    style?: CSSProperties;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({ style }) => {
    const { state } = useAppState();
    const [searchQuery, setSearchQuery] = useState('');

    const activeTab = getActiveTab(state);
    const hasProject = !!activeTab;

    if (!hasProject) {
        return <ProjectsPanel />;
    }

    return (
        <aside className="left-panel" id="left-panel" style={style}>
            <div className="search-box">
                <input
                    type="text"
                    className="search-box__input"
                    placeholder="Filter files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            <FileTree searchQuery={searchQuery} />
        </aside>
    );
};

interface FileTreeProps {
    searchQuery: string;
}

const FileTree: React.FC<FileTreeProps> = ({ searchQuery }) => {
    const { state, dispatch } = useAppState();

    // Get active tab for file tree data
    const activeTab = getActiveTab(state);
    const fileTree = activeTab?.fileTree || null;
    const selectedFile = activeTab?.selectedFile || null;
    const expandedFolders = activeTab?.expandedFolders || new Set<string>();

    const handleItemClick = useCallback((path: string, isFolder: boolean) => {
        if (isFolder) {
            dispatch({ type: 'TOGGLE_FOLDER', payload: path });
        } else {
            // Update selected file on active tab
            if (activeTab) {
                dispatch({
                    type: 'SET_TAB_SELECTED_FILE',
                    payload: { tabId: activeTab.id, filePath: path }
                });
                dispatch({ type: 'SET_STATE', payload: { currentView: 'preview' } });
            }
        }
    }, [dispatch, activeTab]);

    const handleDeepToggle = useCallback((paths: string[], expand: boolean) => {
        dispatch({ type: 'BULK_SET_FOLDERS', payload: { paths, expand } });
    }, [dispatch]);

    const filteredTree = useMemo(() => {
        if (!fileTree || !searchQuery) return fileTree;
        return filterTreeByQuery(fileTree, searchQuery.toLowerCase());
    }, [fileTree, searchQuery]);

    if (!filteredTree) {
        return (
            <div className="file-tree">
                <div className="file-tree__empty">No project files loaded</div>
            </div>
        );
    }

    return (
        <div className="file-tree">
            <TreeNode
                node={filteredTree}
                depth={0}
                selectedFile={selectedFile}
                expandedFolders={expandedFolders}
                onItemClick={handleItemClick}
                onDeepToggle={handleDeepToggle}
            />
        </div>
    );
};

interface TreeNodeProps {
    node: FileTreeNode;
    depth: number;
    selectedFile: string | null;
    expandedFolders: Set<string>;
    onItemClick: (path: string, isFolder: boolean) => void;
    onDeepToggle: (paths: string[], expand: boolean) => void;
}

// Compact folders: merge single-child directory chains into one label
function compactNode(node: FileTreeNode): { displayPath: string; effectiveNode: FileTreeNode } {
    let current = node;
    const parts = [current.name];
    while (
        current.isDirectory &&
        current.children?.length === 1 &&
        current.children[0].isDirectory
    ) {
        current = current.children[0];
        parts.push(current.name);
    }
    return { displayPath: parts.join('/'), effectiveNode: current };
}

// Collect all descendant folder paths for deep expand/collapse
function collectAllFolderPaths(node: FileTreeNode): string[] {
    if (!node.isDirectory) return [];
    const result = [node.path];
    for (const child of node.children ?? []) {
        result.push(...collectAllFolderPaths(child));
    }
    return result;
}

const TreeNode: React.FC<TreeNodeProps> = React.memo(({
    node,
    depth,
    selectedFile,
    expandedFolders,
    onItemClick,
    onDeepToggle,
}) => {
    const { openModal, openContextMenu } = useAppState();

    // Apply compact-folder merging
    const { displayPath, effectiveNode } = node.isDirectory ? compactNode(node) : { displayPath: node.name, effectiveNode: node };
    const isExpanded = expandedFolders.has(effectiveNode.path);
    const isSelected = selectedFile === effectiveNode.path;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (e.shiftKey && effectiveNode.isDirectory) {
            // Deep expand/collapse
            const allPaths = collectAllFolderPaths(effectiveNode);
            onDeepToggle(allPaths, !isExpanded);
        } else {
            onItemClick(effectiveNode.path, effectiveNode.isDirectory);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (effectiveNode.isDirectory) {
            openContextMenu(e.clientX, e.clientY, [
                {
                    label: 'Batch Recolor',
                    icon: getIcon('texture'),
                    onClick: () => openModal('recolor', { filePath: effectiveNode.path, isFolder: true })
                }
            ]);
        }
    };

    const icon = getFileIcon(effectiveNode.name, effectiveNode.isDirectory, isExpanded);
    const expanderIcon = getExpanderIcon(isExpanded);

    return (
        <div className="file-tree__node">
            <div
                className={`file-tree__item ${isSelected ? 'file-tree__item--selected' : ''}`}
                style={{ paddingLeft: 4 + depth * 12 }}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
            >
                {effectiveNode.isDirectory ? (
                    <span
                        className="file-tree__expander"
                        dangerouslySetInnerHTML={{ __html: expanderIcon }}
                    />
                ) : (
                    <span className="file-tree__expander" style={{ visibility: 'hidden' }} />
                )}
                <span
                    className="file-tree__icon"
                    dangerouslySetInnerHTML={{ __html: icon }}
                />
                <span className="file-tree__name">
                    {displayPath.includes('/') ? (
                        displayPath.split('/').map((segment, idx, arr) => (
                            <React.Fragment key={idx}>
                                <span className="file-tree__compact-segment">{segment}</span>
                                {idx < arr.length - 1 && <span className="file-tree__compact-separator">/</span>}
                            </React.Fragment>
                        ))
                    ) : (
                        displayPath
                    )}
                </span>
            </div>
            {effectiveNode.isDirectory && isExpanded && effectiveNode.children && (
                <div className="file-tree__children">
                    {effectiveNode.children.map((child) => (
                        <TreeNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            selectedFile={selectedFile}
                            expandedFolders={expandedFolders}
                            onItemClick={onItemClick}
                            onDeepToggle={onDeepToggle}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

const ProjectsPanel: React.FC = () => {
    const { state, dispatch, openModal, setWorking, setReady, setError } = useAppState();

    const handleOpenProject = async (projectPath: string) => {
        try {
            setWorking('Opening project...');
            const project = await api.openProject(projectPath);

            dispatch({ type: 'SET_PROJECT', payload: { project, path: projectPath } });

            let projectDir = projectPath;
            if (projectDir.endsWith('project.json')) {
                projectDir = projectDir.replace(/[\\/]project\.json$/, '');
            }

            const files = await api.listProjectFiles(projectDir);
            dispatch({ type: 'SET_FILE_TREE', payload: files });
            dispatch({ type: 'SET_STATE', payload: { currentView: 'project' } });
            setReady();
        } catch (error) {
            console.error('Failed to open project:', error);
            const flintError = error as api.FlintError;
            setError(flintError.getUserMessage?.() || 'Failed to open project');
        }
    };

    return (
        <aside className="left-panel projects-panel">
            <div className="projects-panel__header">
                <span className="projects-panel__title">Projects</span>
                <button
                    className="btn btn--ghost btn--small"
                    title="New Project"
                    onClick={() => openModal('newProject')}
                    dangerouslySetInnerHTML={{ __html: getIcon('plus') }}
                />
            </div>
            <div className="projects-panel__list">
                {state.recentProjects.length === 0 ? (
                    <div className="projects-panel__empty">
                        <p>No recent projects</p>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Create a new project to get started
                        </p>
                    </div>
                ) : (
                    state.recentProjects.map((project) => (
                        <div
                            key={project.path}
                            className="projects-panel__item"
                            onClick={() => handleOpenProject(project.path)}
                        >
                            <span
                                className="projects-panel__icon"
                                dangerouslySetInnerHTML={{ __html: getIcon('folder') }}
                            />
                            <div className="projects-panel__info">
                                <div className="projects-panel__name">
                                    {project.champion} - {project.name}
                                </div>
                                <div className="projects-panel__meta">Skin {project.skin}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
};

function filterTreeByQuery(node: FileTreeNode, query: string): FileTreeNode | null {
    if (node.name.toLowerCase().includes(query)) {
        return node;
    }

    if (node.isDirectory && node.children) {
        const filteredChildren = node.children
            .map((child) => filterTreeByQuery(child, query))
            .filter((child): child is FileTreeNode => child !== null);

        if (filteredChildren.length > 0) {
            return { ...node, children: filteredChildren };
        }
    }

    return null;
}

export { FileTree, ProjectsPanel };
