/**
 * BnkExtract - Audio Bank Extraction and Editing Tool
 * React page for extracting, playing, replacing, and saving audio from BNK/WPK files
 */

import React, { useState, useRef, useEffect } from 'react';
import {
    Box,
    Typography,
    Button,
} from '@mui/material';

import AutoExtractDialog from '../../components/dialogs/AutoExtractDialog';
import AudioSplitter from './components/AudioSplitter';
import BnkMainContent from './components/BnkMainContent';
import BnkSettingsModal from './components/BnkSettingsModal';
import BnkInstallModal from './components/BnkInstallModal';
import BnkConvertOverlay from './components/BnkConvertOverlay';
import BnkGainModal from './components/BnkGainModal';
import BnkContextMenu from './components/BnkContextMenu';
import BnkHeaderPanel from './components/BnkHeaderPanel';
import BnkLoadingOverlay from './components/BnkLoadingOverlay';
import BnkAutoMatchConfirmModal from './components/BnkAutoMatchConfirmModal';
import BnkSessionManager from './components/BnkSessionManager';
import BnkModDropModal from './components/BnkModDropModal';
import BnkGroupNameModal from './components/BnkGroupNameModal';
import BnkAddToGroupModal from './components/BnkAddToGroupModal';
import { saveSession } from './utils/sessionManager';
import { loadBanks } from './utils/bnkLoader';
import { useBnkHistory } from './hooks/useBnkHistory';
import { useBnkSearch } from './hooks/useBnkSearch';
import { useBnkHotkeys } from './hooks/useBnkHotkeys';
import { useBnkAutoExtract } from './hooks/useBnkAutoExtract';
import { useBnkCodebookLoader } from './hooks/useBnkCodebookLoader';
import { useBnkAudioPlayback } from './hooks/useBnkAudioPlayback';
import { useBnkFileParsing } from './hooks/useBnkFileParsing';
import { useBnkTreeState } from './hooks/useBnkTreeState';
import { useBnkSelectionActions } from './hooks/useBnkSelectionActions';
import { useBnkFileOps } from './hooks/useBnkFileOps';
import { useBnkDropOps } from './hooks/useBnkDropOps';
import { useBnkSplitterActions } from './hooks/useBnkSplitterActions';
import { useBnkWwiseBridge } from './hooks/useBnkWwiseBridge';
import { useBnkGainOps } from './hooks/useBnkGainOps';
import { useBnkPersistence } from './hooks/useBnkPersistence';
import { getModFiles } from './utils/modAutoProcessor';
import {
    containerStyle,
    headerStyle,
    mainContentStyle,
    treeViewStyle,
    sidebarStyle,
    buttonStyle,
    compactButtonStyle,
    inputStyle,
} from './styles';
import './BnkExtract.css';

/**
 * Main BnkExtract Component
 */
export default function BnkExtract() {
    const {
        bnkPath,
        setBnkPath,
        wpkPath,
        setWpkPath,
        binPath,
        setBinPath,
        extractFormats,
        setExtractFormats,
        mp3Bitrate,
        setMp3Bitrate,
        history,
        setHistory,
        autoSaveSession,
        setAutoSaveSession,
    } = useBnkPersistence();

    // Parsed data
    const [parsedData, setParsedData] = useState(null);
    const [treeData, setTreeData] = useState([]);

    // Selection state
    const [selectedNodes, setSelectedNodes] = useState(new Set());
    const [expandedNodes, setExpandedNodes] = useState(new Set());
    const [rightSelectedNodes, setRightSelectedNodes] = useState(new Set());
    const [rightExpandedNodes, setRightExpandedNodes] = useState(new Set());
    const [lastSelectedId, setLastSelectedId] = useState({ id: null, pane: 'left' });

    // UI state
    const [viewMode, setViewMode] = useState('split'); // 'normal' | 'split'
    const [activePane, setActivePane] = useState('left');
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Ready');
    const [contextMenu, setContextMenu] = useState(null);
    const [rightTreeData, setRightTreeData] = useState([]);
    const [rightPaneDragOver, setRightPaneDragOver] = useState(false);
    const [rightSortMode, setRightSortMode] = useState('none'); // 'none', 'size-asc', 'size-desc'

    // Wwise conversion state
    const [isWwiseInstalled, setIsWwiseInstalled] = useState(false);
    const [showInstallModal, setShowInstallModal] = useState(false);
    const [showConvertOverlay, setShowConvertOverlay] = useState(false);
    const [convertStatus, setConvertStatus] = useState('');
    const [installProgress, setInstallProgress] = useState('');
    const [isInstalling, setIsInstalling] = useState(false);

    const {
        undoStack,
        redoStack,
        pushToHistory,
        handleUndo,
        handleRedo,
    } = useBnkHistory({
        treeData,
        rightTreeData,
        setTreeData,
        setRightTreeData,
        setStatusMessage,
    });

    // Pending conversion: { filePath, targetNodeId } — used when install completes mid-drop
    const pendingConversion = useRef(null);
    // IDs to group — captured at context menu click time before menu closes
    const pendingGroupIds = useRef([]);

    // Gain / volume state
    const [showGainDialog, setShowGainDialog] = useState(false);
    const [gainDb, setGainDb] = useState('3');
    const [gainTargetNodeId, setGainTargetNodeId] = useState(null);
    const [gainTargetNodeIds, setGainTargetNodeIds] = useState([]);
    const [gainTargetPane, setGainTargetPane] = useState('left');

    // Audio Splitter state
    const [showAudioSplitter, setShowAudioSplitter] = useState(false);
    const [splitterInitialFile, setSplitterInitialFile] = useState(null);

    // Settings
    const [autoPlay, setAutoPlay] = useState(true);
    const [multiSelect, setMultiSelect] = useState(true);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [autoExtractOpen, setAutoExtractOpen] = useState(false);
    const [showAutoMatchModal, setShowAutoMatchModal] = useState(false);
    const [showSessionManager, setShowSessionManager] = useState(false);
    const [modDropModalOpen, setModDropModalOpen] = useState(false);
    const [pendingModFolder, setPendingModFolder] = useState(null);
    const [groupNameModalOpen, setGroupNameModalOpen] = useState(false);
    const [addToGroupModalOpen, setAddToGroupModalOpen] = useState(false);

    const {
        leftSearchQuery,
        setLeftSearchQuery,
        rightSearchQuery,
        setRightSearchQuery,
        filteredLeftTree,
        filteredRightTree,
        leftSearchDebounced,
        rightSearchDebounced,
    } = useBnkSearch({
        treeData,
        rightTreeData,
        rightSortMode,
        expandedNodes,
        setExpandedNodes,
        rightExpandedNodes,
        setRightExpandedNodes,
    });

    const { handleApplyGain } = useBnkGainOps({
        gainDb,
        gainTargetNodeId,
        gainTargetNodeIds,
        gainTargetPane,
        isWwiseInstalled,
        treeData,
        rightTreeData,
        setTreeData,
        setRightTreeData,
        setShowGainDialog,
        pushToHistory,
        setShowConvertOverlay,
        setConvertStatus,
        setStatusMessage,
    });

    const {
        handleExternalFileDrop,
        handleInstallWwise,
    } = useBnkWwiseBridge({
        pushToHistory,
        setStatusMessage,
        treeData,
        rightTreeData,
        setTreeData,
        setRightTreeData,
        setRightExpandedNodes,
        isWwiseInstalled,
        setIsWwiseInstalled,
        setShowInstallModal,
        setShowConvertOverlay,
        setConvertStatus,
        setInstallProgress,
        setIsInstalling,
        pendingConversion,
    });

    const {
        volume,
        setVolume,
        codebookDataRef,
        stopAudio,
        playAudio,
    } = useBnkAudioPlayback({
        autoPlay,
        setStatusMessage,
    });

    const { handleAutoExtractProcess } = useBnkAutoExtract({
        activePane,
        setTreeData,
        setRightTreeData,
        setStatusMessage,
        setIsLoading,
        pushToHistory,
        extractFormats,
        codebookDataRef,
        mp3Bitrate,
    });

    const { handleSelectFile, handleParseFiles } = useBnkFileParsing({
        bnkPath,
        wpkPath,
        binPath,
        activePane,
        setBnkPath,
        setWpkPath,
        setBinPath,
        setIsLoading,
        setStatusMessage,
        pushToHistory,
        setParsedData,
        setTreeData,
        setRightTreeData,
        setHistory,
    });

    const {
        handleClearPane,
        handleNodeSelect,
        handleToggleExpand,
    } = useBnkTreeState({
        pushToHistory,
        setTreeData,
        setSelectedNodes,
        setExpandedNodes,
        setParsedData,
        setRightTreeData,
        setRightSelectedNodes,
        setRightExpandedNodes,
        setStatusMessage,
        lastSelectedId,
        setLastSelectedId,
        filteredLeftTree,
        filteredRightTree,
        expandedNodes,
        rightExpandedNodes,
        treeData,
        rightTreeData,
    });

    const {
        handlePlaySelected,
        handleContextMenu,
        handleCloseContextMenu,
        handleDeleteNode,
        handleDeleteSelected,
        handleCopyName,
        hasAudioSelection,
        hasRootSelection,
    } = useBnkSelectionActions({
        activePane,
        treeData,
        rightTreeData,
        selectedNodes,
        rightSelectedNodes,
        playAudio,
        pushToHistory,
        setTreeData,
        setRightTreeData,
        setSelectedNodes,
        setRightSelectedNodes,
        setStatusMessage,
        contextMenu,
        setContextMenu,
    });

    const {
        handleExtract,
        handleReplace,
        handleMakeSilent,
        handleSave,
    } = useBnkFileOps({
        activePane,
        treeData,
        rightTreeData,
        selectedNodes,
        rightSelectedNodes,
        setTreeData,
        setRightTreeData,
        setStatusMessage,
        setIsLoading,
        pushToHistory,
        extractFormats,
        mp3Bitrate,
        codebookDataRef,
    });

    const {
        handleAutoMatchByEventName,
        handleDropReplace,
        handleRightPaneFileDrop,
        handleRightPaneDragOver,
        handleRightPaneDragLeave,
    } = useBnkDropOps({
        treeData,
        rightTreeData,
        pushToHistory,
        setTreeData,
        setRightTreeData,
        setRightExpandedNodes,
        setRightPaneDragOver,
        setStatusMessage,
        isWwiseInstalled,
        pendingConversion,
        setShowInstallModal,
        setShowConvertOverlay,
        setConvertStatus,
    });

    const {
        handleOpenInSplitter,
        handleSplitterReplace,
        handleSplitterExportSegments,
    } = useBnkSplitterActions({
        contextMenu,
        handleCloseContextMenu,
        isWwiseInstalled,
        setStatusMessage,
        setShowConvertOverlay,
        setConvertStatus,
        setShowAudioSplitter,
        setSplitterInitialFile,
        pushToHistory,
        setTreeData,
        setRightTreeData,
        setViewMode,
        setRightExpandedNodes,
    });

    const sessionStateRef = useRef();
    sessionStateRef.current = {
        treeData,
        rightTreeData,
        bnkPath,
        wpkPath,
        binPath,
        viewMode,
        activePane
    };

    useEffect(() => {
        return () => {
            if (autoSaveSession && (sessionStateRef.current.treeData.length > 0 || sessionStateRef.current.rightTreeData.length > 0)) {
                try {
                    saveSession(sessionStateRef.current, 'AutoSave_Exit');
                } catch (e) {
                    console.error('Failed to auto-save session on exit:', e);
                }
            }
        };
    }, [autoSaveSession]);

    const handleLoadSession = async (session) => {
        setIsLoading(true);
        setStatusMessage(`Loading session: ${session.name}...`);

        try {
            // Restore basic UI state
            setBnkPath(session.paths?.bnk || '');
            setWpkPath(session.paths?.wpk || '');
            setBinPath(session.paths?.bin || '');
            setViewMode(session.viewMode || 'split');
            setActivePane(session.activePane || 'left');

            const mergeOverrides = (cleanNodes, sessionNodes) => {
                if (!cleanNodes || !sessionNodes) return cleanNodes;
                return cleanNodes.map(cleanNode => {
                    const isAudio = !!cleanNode.audioData;
                    // Find node in session with stable matching
                    const sessionNode = sessionNodes.find(sn => {
                        if (sn.id === cleanNode.id) return true;
                        if (sn.name !== cleanNode.name) return false;

                        // If both are audio, match by audio ID
                        if (isAudio && sn.audioData) {
                            return sn.audioData.id === cleanNode.audioData.id;
                        }
                        // If both are folders, match by name (we assume folders at same level/parent have same name)
                        if (!isAudio && !sn.audioData) {
                            return true;
                        }
                        return false;
                    });

                    if (sessionNode) {
                        const newNode = { ...cleanNode, isModified: sessionNode.isModified };
                        if (isAudio && sessionNode.audioData) {
                            const hasOverrideData = sessionNode.audioData.data && sessionNode.audioData.data.length > 0;
                            newNode.audioData = {
                                ...cleanNode.audioData,
                                isModified: sessionNode.audioData.isModified,
                                data: hasOverrideData ? sessionNode.audioData.data : cleanNode.audioData.data,
                                length: hasOverrideData ? sessionNode.audioData.length : cleanNode.audioData.length
                            };
                        }
                        if (cleanNode.children && sessionNode.children) {
                            newNode.children = mergeOverrides(cleanNode.children, sessionNode.children);
                        }
                        return newNode;
                    }
                    return cleanNode;
                });
            };

            const rehydrateTreeList = async (sessionTreeList) => {
                const newTrees = [];
                for (const sessionRoot of sessionTreeList) {
                    if (session.isDelta && sessionRoot.isRoot && (sessionRoot.bnkPath || sessionRoot.wpkPath)) {
                        try {
                            const result = await loadBanks({
                                bnkPath: sessionRoot.bnkPath || '',
                                wpkPath: sessionRoot.wpkPath || '',
                                binPath: sessionRoot.binPath || ''
                            });

                            if (result) {
                                const rehydrated = mergeOverrides([result.tree], [sessionRoot]);
                                newTrees.push(rehydrated[0]);
                                continue;
                            }
                        } catch (e) {
                            console.warn('[BnkExtract] Rehydration failed for a root:', e);
                        }
                    }
                    newTrees.push(sessionRoot);
                }
                return newTrees;
            };

            const newLeftTrees = await rehydrateTreeList(session.treeData || []);
            const newRightTrees = await rehydrateTreeList(session.rightTreeData || []);

            setTreeData(newLeftTrees);
            setRightTreeData(newRightTrees);

            setStatusMessage(`Loaded session: ${session.name}`);
        } catch (e) {
            console.error('[BnkExtract] Session load error:', e);
            setStatusMessage(`Error loading session: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const isNodeInGroup = (nodeId, nodes) => {
        for (const node of nodes) {
            if (node.id === nodeId) return false; // at root level
            if (node.children) {
                const inChild = (id, children) => children.some(c => c.id === id || (c.children && inChild(id, c.children)));
                if (inChild(nodeId, node.children)) return true;
            }
        }
        return false;
    };

    const collectRightGroups = (nodes, result = []) => {
        for (const node of nodes) {
            if (!node.audioData && node.children) {
                result.push(node);
                collectRightGroups(node.children, result);
            }
        }
        return result;
    };

    const handleAddToGroup = (groupId) => {
        setAddToGroupModalOpen(false);
        pushToHistory();
        const selectedIds = new Set(pendingGroupIds.current);
        const collectedNodes = [];

        const removeAndCollect = (nodes) => {
            const remaining = [];
            for (const node of nodes) {
                if (selectedIds.has(node.id)) {
                    collectedNodes.push(node);
                } else {
                    remaining.push(node.children ? { ...node, children: removeAndCollect(node.children) } : node);
                }
            }
            return remaining;
        };

        const insertIntoGroup = (nodes) => nodes.map((node) => {
            if (node.id === groupId) return { ...node, children: [...(node.children || []), ...collectedNodes] };
            if (node.children) return { ...node, children: insertIntoGroup(node.children) };
            return node;
        });

        setRightTreeData(insertIntoGroup(removeAndCollect(rightTreeData)));
        setRightSelectedNodes(new Set());
        setStatusMessage(`Added ${collectedNodes.length} file${collectedNodes.length !== 1 ? 's' : ''} to group`);
    };

    const handleCreateGroup = (groupName) => {
        setGroupNameModalOpen(false);
        pushToHistory();
        const selectedIds = new Set(pendingGroupIds.current);
        const collectedNodes = [];

        const removeAndCollect = (nodes) => {
            const remaining = [];
            for (const node of nodes) {
                if (selectedIds.has(node.id)) {
                    collectedNodes.push(node);
                } else {
                    const newNode = node.children
                        ? { ...node, children: removeAndCollect(node.children) }
                        : node;
                    remaining.push(newNode);
                }
            }
            return remaining;
        };

        const newRightTree = removeAndCollect(rightTreeData);
        const groupNode = {
            id: `group_${Date.now()}`,
            name: groupName,
            children: collectedNodes,
        };
        setRightTreeData([...newRightTree, groupNode]);
        setRightSelectedNodes(new Set());
        setStatusMessage(`Grouped ${collectedNodes.length} file${collectedNodes.length !== 1 ? 's' : ''} into "${groupName}"`);
    };

    const handleRemoveFromGroup = () => {
        pushToHistory();
        const selectedIds = new Set(pendingGroupIds.current);
        const removed = [];

        const stripFromTree = (nodes) => nodes
            .map((node) => {
                if (selectedIds.has(node.id)) { removed.push(node); return null; }
                if (node.children) return { ...node, children: stripFromTree(node.children).filter(Boolean) };
                return node;
            })
            .filter(Boolean);

        setRightTreeData([...stripFromTree(rightTreeData), ...removed]);
        setRightSelectedNodes(new Set());
        setStatusMessage(`Removed ${removed.length} file${removed.length !== 1 ? 's' : ''} from group`);
    };

    const handleLeftPaneFolderDrop = (folderPath) => {
        setPendingModFolder(folderPath);
        setModDropModalOpen(true);
    };

    const handleModDropConfirm = async (skinId) => {
        setModDropModalOpen(false);
        if (!pendingModFolder) return;
        const path = window.require('path');
        const folderPath = pendingModFolder;
        setPendingModFolder(null);
        setStatusMessage('Scanning mod folder...');
        try {
            const sets = await getModFiles(folderPath, skinId || null);
            if (!sets || sets.length === 0) {
                setStatusMessage('No audio files found in mod folder');
                return;
            }
            const folderName = path.basename(folderPath);
            const batchFiles = sets.map((s) => ({
                ...s,
                modFolderName: s.type ? `${folderName}_${s.type}` : folderName,
            }));
            await handleAutoExtractProcess({ batchFiles, outputPath: null, loadToTree: true });
        } catch (e) {
            setStatusMessage(`Mod folder error: ${e.message}`);
        }
    };

    useBnkCodebookLoader({ codebookDataRef, setStatusMessage });

    /**
     * Drop Replace Logic (Split View)
     * Replaces ALL nodes with the same audio ID to handle duplicates in the tree
     */

    /**
     * Extract selected files
     */

    useBnkHotkeys({
        showAudioSplitter,
        onDeleteSelected: handleDeleteSelected,
        onPlaySelected: handlePlaySelected,
        onUndo: handleUndo,
        onRedo: handleRedo,
    });

    const getContextTargetIds = () => {
        const nodeId = contextMenu?.node?.id;
        const pane = contextMenu?.pane || activePane;
        if (!nodeId) return [];

        const paneSelection = pane === 'left' ? selectedNodes : rightSelectedNodes;
        if (paneSelection.has(nodeId) && paneSelection.size > 1) {
            return Array.from(paneSelection);
        }
        return [nodeId];
    };


    return (
        <Box className="bnk-extract-container" sx={containerStyle}>

            <BnkInstallModal
                open={showInstallModal}
                isInstalling={isInstalling}
                installProgress={installProgress}
                buttonStyle={buttonStyle}
                onCancel={() => { setShowInstallModal(false); pendingConversion.current = null; }}
                onInstall={handleInstallWwise}
            />

            <BnkConvertOverlay
                open={showConvertOverlay}
                convertStatus={convertStatus}
            />

            <BnkGainModal
                open={showGainDialog}
                onClose={() => setShowGainDialog(false)}
                gainTargetNodeId={gainTargetNodeId}
                gainDb={gainDb}
                setGainDb={setGainDb}
                compactButtonStyle={compactButtonStyle}
                buttonStyle={buttonStyle}
                onApply={handleApplyGain}
            />

            <BnkHeaderPanel
                headerStyle={headerStyle}
                inputStyle={inputStyle}
                buttonStyle={buttonStyle}
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
            />

            <AutoExtractDialog
                open={autoExtractOpen}
                onClose={() => setAutoExtractOpen(false)}
                onProcess={handleAutoExtractProcess}
            />

            <BnkLoadingOverlay
                isLoading={isLoading}
                autoExtractOpen={autoExtractOpen}
                statusMessage={statusMessage}
            />


            {/* Main Content */}
            <BnkMainContent
                mainContentStyle={mainContentStyle}
                treeViewStyle={treeViewStyle}
                sidebarStyle={sidebarStyle}
                compactButtonStyle={compactButtonStyle}
                buttonStyle={buttonStyle}
                viewMode={viewMode}
                activePane={activePane}
                leftSearchQuery={leftSearchQuery}
                setLeftSearchQuery={setLeftSearchQuery}
                filteredLeftTree={filteredLeftTree}
                selectedNodes={selectedNodes}
                setSelectedNodes={setSelectedNodes}
                setLastSelectedId={setLastSelectedId}
                handleNodeSelect={handleNodeSelect}
                playAudio={playAudio}
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
                filteredRightTree={filteredRightTree}
                rightSelectedNodes={rightSelectedNodes}
                setRightSelectedNodes={setRightSelectedNodes}
                rightExpandedNodes={rightExpandedNodes}
                handleUndo={handleUndo}
                undoStack={undoStack}
                handleRedo={handleRedo}
                redoStack={redoStack}
                handleExtract={handleExtract}
                handleReplace={handleReplace}
                hasAudioSelection={hasAudioSelection}
                handleMakeSilent={handleMakeSilent}
                handleSave={handleSave}
                hasRootSelection={hasRootSelection}
                handlePlaySelected={handlePlaySelected}
                stopAudio={stopAudio}
                volume={volume}
                setVolume={setVolume}
                treeData={treeData}
                rightTreeData={rightTreeData}
                setShowSettingsModal={setShowSettingsModal}
                onLeftPaneFolderDrop={handleLeftPaneFolderDrop}
            />
            <BnkContextMenu
                contextMenu={contextMenu}
                onClose={handleCloseContextMenu}
                onPlay={() => {
                    if (contextMenu?.node?.audioData) playAudio(contextMenu.node);
                    handleCloseContextMenu();
                }}
                onExtract={handleExtract}
                onReplace={handleReplace}
                onMakeSilent={() => {
                    const pane = contextMenu?.pane || activePane;
                    const nodeIds = getContextTargetIds();
                    handleMakeSilent({ pane, nodeIds });
                    handleCloseContextMenu();
                }}
                onAdjustGain={() => {
                    const pane = contextMenu?.pane || 'left';
                    const nodeIds = getContextTargetIds();
                    setGainTargetPane(pane);
                    setGainTargetNodeIds(nodeIds);
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
            {/* Audio Splitter overlay */}
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
                folderName={pendingModFolder ? window.require('path').basename(pendingModFolder) : ''}
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
        </Box>
    );
}


