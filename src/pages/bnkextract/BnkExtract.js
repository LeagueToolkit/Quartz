/**
 * BnkExtract - Audio Bank Extraction and Editing Tool
 * React page for extracting, playing, replacing, and saving audio from BNK/WPK files
 */

import React, { useState, useRef } from 'react';
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
import BnkHistoryMenu from './components/BnkHistoryMenu';
import BnkLoadingOverlay from './components/BnkLoadingOverlay';
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
    const [historyAnchor, setHistoryAnchor] = useState(null);
    const [autoExtractOpen, setAutoExtractOpen] = useState(false);

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
                setHistoryAnchor={setHistoryAnchor}
                setAutoExtractOpen={setAutoExtractOpen}
            />

            <AutoExtractDialog
                open={autoExtractOpen}
                onClose={() => setAutoExtractOpen(false)}
                onProcess={handleAutoExtractProcess}
            />

            <BnkHistoryMenu
                historyAnchor={historyAnchor}
                setHistoryAnchor={setHistoryAnchor}
                history={history}
                setHistory={setHistory}
                setBinPath={setBinPath}
                setWpkPath={setWpkPath}
                setBnkPath={setBnkPath}
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
                setShowSettingsModal={setShowSettingsModal}
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
        </Box>
    );
}


