import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../port2/Port.css'; // Reuse existing styles
import themeManager from '../../utils/theme/themeManager.js';
import electronPrefs from '../../utils/core/electronPrefs.js';
import GlowingSpinner from '../../components/GlowingSpinner';

// Import necessary Node.js modules for Electron
const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;
import useIdleParticles from '../port2/hooks/useIdleParticles';
import useChildParticles from '../port2/hooks/useChildParticles';
import VfxHubToolbar from './components/VfxHubToolbar';
import VfxHubFooter from './components/VfxHubFooter';
import VfxHubSystemPanels from './components/VfxHubSystemPanels';
import VfxHubModalHosts from './components/VfxHubModalHosts';
import VfxHubDialogs from './components/VfxHubDialogs';
import useGitHubCollections from './hooks/useGitHubCollections';
import useVfxDownload from './hooks/useVfxDownload';
import useVfxUpload from './hooks/useVfxUpload';
import useVfxHistory from '../port2/hooks/useVfxHistory';
import useVfxMutations from '../port2/hooks/useVfxMutations';
import useVfxFile from '../port2/hooks/useVfxFile';
import usePersistentEffects from '../port2/hooks/usePersistentEffects';
import useVfxHubSave from './hooks/useVfxHubSave';
import useVfxHubPortSystem from './hooks/useVfxHubPortSystem';
import useVfxHubEmitterPreview from './hooks/useVfxHubEmitterPreview';
import useResizableModal from './hooks/useResizableModal';
import useVfxHubFilters from './hooks/useVfxHubFilters';
import useVfxHubThemeEffects from './hooks/useVfxHubThemeEffects';
import { extractTexturesFromEmitterContent } from '../port2/utils/vfxUtils.js';
import useUnsavedNavigationGuard from '../../hooks/navigation/useUnsavedNavigationGuard.js';
import { sectionStyle, celestialButtonStyle, primaryButtonStyle } from './styles';

const VFXHub = () => {
  useVfxHubThemeEffects({ electronPrefs, themeManager });

  const [donorPath, setDonorPath] = useState('VFX Hub - GitHub Collections');

  // File data states
  const [donorSystems, setDonorSystems] = useState({});
  const [donorPyContent, setDonorPyContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState('');
  const [statusMessage, setStatusMessage] = useState('Ready - Open target bin and browse VFX Hub');
  const [fileSaved, setFileSaved] = useState(true);
  const [selectedTargetSystem, setSelectedTargetSystem] = useState(null);
  const [collapsedTargetSystems, setCollapsedTargetSystems] = useState(new Set());
  const [collapsedDonorSystems, setCollapsedDonorSystems] = useState(new Set());
  const [deletedEmitters, setDeletedEmitters] = useState(new Map());
  const [pressedSystemKey, setPressedSystemKey] = useState(null);
  const [dragStartedKey, setDragStartedKey] = useState(null);
  const [draggedEmitter, setDraggedEmitter] = useState(null);
  const [renamingEmitter, setRenamingEmitter] = useState(null);
  const [renamingSystem, setRenamingSystem] = useState(null);
  const [showRitobinWarning, setShowRitobinWarning] = useState(false);
  const [ritobinWarningContent, setRitobinWarningContent] = useState(null);

  const toggleTargetSystemCollapse = (systemKey) => {
    setCollapsedTargetSystems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(systemKey)) {
        newSet.delete(systemKey);
      } else {
        newSet.add(systemKey);
      }
      return newSet;
    });
  };

  const toggleDonorSystemCollapse = (systemKey) => {
    setCollapsedDonorSystems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(systemKey)) {
        newSet.delete(systemKey);
      } else {
        newSet.add(systemKey);
      }
      return newSet;
    });
  };

  const conversionTimers = useRef(new Map());
  const textureCloseTimerRef = useRef(null);
  const backgroundSaveTimerRef = useRef(null);
  const targetPyContentRef = useRef('');
  const prevDonorKeysRef = useRef(new Set());
  const [isPortAllLoading, setIsPortAllLoading] = useState(false);

  // Donor list in VFXHub comes from GitHub downloads, so keep collapse-on-key-change local here.
  useEffect(() => {
    const currentKeys = Object.keys(donorSystems);
    if (currentKeys.length === 0) return;
    const currentKeysSet = new Set(currentKeys);
    let changed = false;
    if (currentKeysSet.size !== prevDonorKeysRef.current.size) {
      changed = true;
    } else {
      for (const key of currentKeysSet) {
        if (!prevDonorKeysRef.current.has(key)) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;

    electronPrefs.get('ExpandSystemsOnLoad').then((expandOnLoad) => {
      if (!expandOnLoad) {
        setCollapsedDonorSystems((prev) => {
          const next = new Set(prev);
          currentKeys.forEach((k) => next.add(k));
          return next;
        });
      }
    }).catch(() => {
      setCollapsedDonorSystems((prev) => {
        const next = new Set(prev);
        currentKeys.forEach((k) => next.add(k));
        return next;
      });
    });

    prevDonorKeysRef.current = currentKeysSet;
  }, [donorSystems]);
  const navigate = useNavigate();

  const {
    undoHistory,
    setUndoHistory,
    saveStateToHistory: saveHistoryState,
    handleUndo: popUndoState,
  } = useVfxHistory({ maxHistory: 20 });

  const file = useVfxFile(
    setIsProcessing,
    setProcessingText,
    setStatusMessage,
    setFileSaved,
    setRitobinWarningContent,
    setShowRitobinWarning,
    setUndoHistory,
    setDeletedEmitters,
    setSelectedTargetSystem,
    setCollapsedTargetSystems,
    setCollapsedDonorSystems,
    electronPrefs,
    {
      targetMode: 'vfxhub-target',
      enableDonor: false,
      autoReloadDonor: false,
    }
  );

  const {
    targetPath,
    targetPyContent,
    setTargetPyContent,
    targetSystems,
    setTargetSystems,
    hasResourceResolver,
    hasSkinCharacterData,
    showRitoBinErrorDialog,
    setShowRitoBinErrorDialog,
    showBackupViewer,
    setShowBackupViewer,
    handleOpenTargetBin,
    processTargetBin,
    performBackupRestore,
  } = file;

  useEffect(() => {
    targetPyContentRef.current = targetPyContent || '';
  }, [targetPyContent]);

  // Trimming options
  const [trimTargetNames, setTrimTargetNames] = useState(true);
  const [trimDonorNames, setTrimDonorNames] = useState(true);

  const {
    modalSize,
    handleMouseDown,
  } = useResizableModal({ width: 1000, height: 700 });

  // Preview hover state
  const [hoveredPreview, setHoveredPreview] = useState(null);

  // Clean up large state objects on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      // Clear large state objects to prevent memory leaks when switching pages
      setTargetSystems({});
      setDonorSystems({});
      setTargetPyContent('');
      setDonorPyContent('');

      console.log('🧹 Cleaned up VFXHub.js memory on unmount');
    };
  }, []);

  // Matrix state
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState(null);
  const [matrixModalState, setMatrixModalState] = useState({ systemKey: null, initial: null });
  // New VFX System modal state
  const [showNewSystemModal, setShowNewSystemModal] = useState(false);
  const [newSystemName, setNewSystemName] = useState('');
  // Track recently created systems to keep them pinned at the top in order of creation
  const [recentCreatedSystemKeys, setRecentCreatedSystemKeys] = useState([]);

  // Create a new minimal VFX system and insert it into the current file
  const handleOpenNewSystemModal = () => {
    if (!targetPyContent) {
      setStatusMessage('No target file loaded');
      return;
    }
    if (!hasResourceResolver) {
      setStatusMessage('Locked: target bin missing ResourceResolver');
      return;
    }
    setNewSystemName('');
    setShowNewSystemModal(true);
  };

  const handleOpenBackupViewer = () => {
    if (!targetPath || targetPath === 'This will show target bin') {
      setStatusMessage('No target file loaded');
      return;
    }
    setShowBackupViewer(true);
  };

  const saveStateToHistory = useCallback((action) => {
    saveHistoryState(action, {
      targetSystems: JSON.parse(JSON.stringify(targetSystems)),
      targetPyContent,
      selectedTargetSystem,
      deletedEmitters: new Map(deletedEmitters),
    });
  }, [saveHistoryState, targetSystems, targetPyContent, selectedTargetSystem, deletedEmitters]);

  const persistent = usePersistentEffects(
    targetPyContent,
    hasResourceResolver,
    hasSkinCharacterData,
    saveStateToHistory,
    setTargetPyContent,
    setFileSaved,
    setStatusMessage
  );

  const idle = useIdleParticles(
    targetPyContent,
    hasResourceResolver,
    hasSkinCharacterData,
    saveStateToHistory,
    setTargetPyContent,
    setFileSaved,
    setStatusMessage
  );

  const child = useChildParticles(
    targetPyContent,
    hasResourceResolver,
    hasSkinCharacterData,
    deletedEmitters,
    saveStateToHistory,
    setTargetPyContent,
    setTargetSystems,
    setFileSaved,
    setStatusMessage
  );

  const handleUndo = useCallback(async () => {
    const lastState = popUndoState((restored) => {
      setTargetSystems(restored.targetSystems);
      setTargetPyContent(restored.targetPyContent);
      try { setFileSaved(false); } catch { }
      setSelectedTargetSystem(restored.selectedTargetSystem);
      setDeletedEmitters(restored.deletedEmitters);
    });

    if (!lastState) {
      setStatusMessage('Nothing to undo');
      return;
    }

    setStatusMessage(`Undone: ${lastState.action} - Saving to file...`);

    try {
      const fsNode = window.require('fs');
      const pathNode = window.require('path');
      const targetDir = pathNode.dirname(targetPath);
      const targetName = pathNode.basename(targetPath, '.bin');
      const outputPyPath = pathNode.join(targetDir, `${targetName}.py`);
      fsNode.writeFileSync(outputPyPath, lastState.targetPyContent);
      setStatusMessage(`Undone: ${lastState.action} - Saved to ${outputPyPath}`);
    } catch (error) {
      console.error('Error saving undone state to file:', error);
      setStatusMessage(`Undone: ${lastState.action} - Failed to save to file: ${error.message}`);
    }
  }, [popUndoState, setTargetSystems, setTargetPyContent, setSelectedTargetSystem, setDeletedEmitters, targetPath]);

  const mutations = useVfxMutations(
    targetPyContent,
    donorPyContent,
    targetSystems,
    donorSystems,
    targetPath,
    donorPath,
    deletedEmitters,
    saveStateToHistory,
    setTargetPyContent,
    setTargetSystems,
    setDonorSystems,
    setDeletedEmitters,
    setRenamingEmitter,
    setRenamingSystem,
    setSelectedTargetSystem,
    setRecentCreatedSystemKeys,
    setFileSaved,
    setIsPortAllLoading,
    setIsProcessing,
    setProcessingText,
    setStatusMessage,
    electronPrefs,
    backgroundSaveTimerRef,
    targetPyContentRef,
    recentCreatedSystemKeys,
    selectedTargetSystem
  );

  const handleCreateNewSystem = useCallback(() => {
    const name = (newSystemName || '').trim();
    mutations.handleCreateNewSystem(name);
    if (name) setShowNewSystemModal(false);
  }, [newSystemName, mutations]);
  // Memoize target system entries for stable rendering
  const targetSystemEntries = React.useMemo(() => Object.entries(targetSystems), [targetSystems]);
  // Download modal scroll preservation
  const downloadContentRef = React.useRef(null);
  const downloadScrollPosRef = React.useRef(0);
  const saveDownloadScrollPos = () => {
    if (downloadContentRef.current) {
      downloadScrollPosRef.current = downloadContentRef.current.scrollTop;
    }
  };

  const collections = useGitHubCollections({
    setStatusMessage,
    isProcessing
  });

  const download = useVfxDownload({
    targetPath,
    donorSystems,
    setStatusMessage,
    setIsProcessing,
    setProcessingText,
    setDonorSystems,
    setDonorPyContent,
    setDonorPath,
    setShowDownloadModal: collections.setShowDownloadModal
  });

  const upload = useVfxUpload({
    targetSystems,
    targetPath,
    targetPyContent,
    setStatusMessage,
    setIsProcessing,
    setProcessingText,
    loadVFXCollections: collections.loadVFXCollections,
    findProjectRoot: download.findProjectRoot
  });

  // Shared port2 mutations, with VFXHub adapters for GitHub donor structure differences
  const handlePortEmitter = useCallback(async (donorSystemKey, emitterRef) => {
    const donorSystem = donorSystems[donorSystemKey];
    const emitterName = typeof emitterRef === 'number'
      ? donorSystem?.emitters?.[emitterRef]?.name
      : emitterRef;
    if (!emitterName) {
      setStatusMessage('Emitter not found');
      return;
    }

    await mutations.handlePortEmitter(donorSystemKey, emitterName, hasResourceResolver);

    // VFXHub-specific: downloaded GitHub systems may carry asset lists.
    if (donorSystem?.assets?.length > 0) {
      try {
        const copiedAssets = await download.downloadAndCopyAssets(donorSystem.assets, donorSystem.name);
        if (copiedAssets?.length >= 0) {
          setStatusMessage(`Ported emitter "${emitterName}" and copied ${copiedAssets.length} assets`);
        }
      } catch (error) {
        console.warn('Downloaded asset copy after emitter port failed:', error?.message || error);
      }
    }
  }, [donorSystems, mutations, hasResourceResolver, download, setStatusMessage]);

  const handlePortAllEmitters = useCallback(async (donorSystemKey) => {
    const donorSystem = donorSystems[donorSystemKey];
    await mutations.handlePortAllEmitters(donorSystemKey);

    // VFXHub-specific: preserve GitHub asset copy flow for downloaded systems.
    if (donorSystem?.assets?.length > 0) {
      try {
        const copiedAssets = await download.downloadAndCopyAssets(donorSystem.assets, donorSystem.name);
        if (copiedAssets?.length >= 0) {
          setStatusMessage(`Ported emitters from "${donorSystem.name}" and copied ${copiedAssets.length} assets`);
        }
      } catch (error) {
        console.warn('Downloaded asset copy after port-all failed:', error?.message || error);
      }
    }
  }, [donorSystems, mutations, download, setStatusMessage]);

  const handleDeleteEmitter = useCallback((systemKey, emitterIndex) => {
    mutations.handleDeleteEmitter(systemKey, emitterIndex, true);
  }, [mutations]);

  const handleDeleteAllEmitters = useCallback((systemKey) => {
    mutations.handleDeleteAllEmitters(systemKey);
  }, [mutations]);

  // Handle drag start from donor list
  const handleDragStart = (e, systemKey) => {
    e.dataTransfer.setData('text/plain', systemKey);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Handle drop on target list
  const handleDrop = (e) => {
    e.preventDefault();

    // Primary drag payload used by port2/particle lists and collection cards.
    const vfxPayloadRaw = e.dataTransfer.getData('application/x-vfxsys');
    if (vfxPayloadRaw) {
      try {
        const payload = JSON.parse(vfxPayloadRaw);
        const droppedName = payload?.name;

        // Prefer routing through existing donor->target port flow to preserve
        // metadata handling (including GitHub assets).
        const matchedEntry = Object.entries(donorSystems || {}).find(([, sys]) => {
          const sysName = sys?.name || '';
          const particleName = sys?.particleName || '';
          return sysName === droppedName || particleName === droppedName;
        });

        if (matchedEntry?.[0]) {
          portVFXSystemToTarget(matchedEntry[0]);
          return;
        }
      } catch (error) {
        console.warn('Failed to parse dropped VFX payload:', error);
      }
    }

    // Legacy fallback path.
    const systemKey = e.dataTransfer.getData('text/plain');
    if (systemKey && donorSystems[systemKey]) {
      portVFXSystemToTarget(systemKey);
    }
  };

  // Handle drag over target list
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  // Check if there are any changes to save (deleted emitters or added emitters)
  const {
    hasChangesToSave,
    handleSave,
  } = useVfxHubSave({
    deletedEmitters,
    targetSystems,
    targetPyContent,
    targetPath,
    setStatusMessage,
    setIsProcessing,
    setProcessingText,
    setFileSaved,
    setShowRitoBinErrorDialog,
    electronPrefs,
  });
  const { portVFXSystemToTarget } = useVfxHubPortSystem({
    donorSystems,
    setDonorSystems,
    setStatusMessage,
    targetPyContent,
    donorPyContent,
    hasResourceResolver,
    setTargetPyContent,
    setFileSaved,
    targetSystems,
    setTargetSystems,
    download,
    donorPath,
    targetPath,
  });

  const {
    targetFilter,
    donorFilter,
    filterTargetParticles,
    filterDonorParticles,
    filteredTargetSystems,
    filteredDonorSystems,
  } = useVfxHubFilters({
    targetSystems,
    donorSystems,
  });

  const noop = useCallback(() => { }, []);
  const {
    showTexturePreview,
    handleEmitterMouseEnter,
    handleEmitterMouseLeave,
    handleEmitterClick,
    handleEmitterContextMenu,
  } = useVfxHubEmitterPreview({
    targetPath,
    donorPath,
    conversionTimers,
    textureCloseTimerRef,
  });

  // Restore download modal scroll position after updates
  React.useLayoutEffect(() => {
    if (collections.showDownloadModal && downloadContentRef.current) {
      const el = downloadContentRef.current;
      const target = downloadScrollPosRef.current;
      if (Math.abs(el.scrollTop - target) > 1) {
        el.scrollTop = target;
      }
    }
  }, [
    collections.showDownloadModal,
    collections.searchTerm,
    collections.selectedCategory,
    collections.currentPage,
    collections.isLoadingCollections,
    collections.githubConnected,
    collections.allVfxSystems.length
  ]);

  const unsavedGuard = useUnsavedNavigationGuard({
    fileSaved,
    setFileSaved,
    onSave: handleSave,
    navigate,
  });

  return (
    <div className="vfx-hub-container" style={{
      minHeight: '100%',
      height: '100%',
      background: 'var(--bg)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {isProcessing && <GlowingSpinner text={processingText || 'Working...'} />}
      <VfxHubToolbar
        isProcessing={isProcessing}
        isLoadingCollections={collections.isLoadingCollections}
        githubAuthenticated={collections.githubAuthenticated}
        onOpenTargetBin={handleOpenTargetBin}
        onOpenHub={collections.handleOpenVFXHub}
        onUpload={upload.handleUploadToVFXHub}
      />

      <VfxHubSystemPanels
        sectionStyle={sectionStyle}
        targetFilter={targetFilter}
        onTargetFilterChange={filterTargetParticles}
        donorFilter={donorFilter}
        onDonorFilterChange={filterDonorParticles}
        handleDrop={handleDrop}
        handleDragOver={handleDragOver}
        targetSystems={targetSystems}
        donorSystems={donorSystems}
        filteredTargetSystems={filteredTargetSystems}
        filteredDonorSystems={filteredDonorSystems}
        selectedTargetSystem={selectedTargetSystem}
        setSelectedTargetSystem={setSelectedTargetSystem}
        pressedSystemKey={pressedSystemKey}
        setPressedSystemKey={setPressedSystemKey}
        dragStartedKey={dragStartedKey}
        setDragStartedKey={setDragStartedKey}
        donorPyContent={donorPyContent}
        handlePortAllEmitters={handlePortAllEmitters}
        handleRenameSystem={mutations.handleRenameSystem}
        renamingSystem={renamingSystem}
        setRenamingSystem={setRenamingSystem}
        trimTargetNames={trimTargetNames}
        trimDonorNames={trimDonorNames}
        collapsedTargetSystems={collapsedTargetSystems}
        toggleTargetSystemCollapse={toggleTargetSystemCollapse}
        collapsedDonorSystems={collapsedDonorSystems}
        toggleDonorSystemCollapse={toggleDonorSystemCollapse}
        handleMoveEmitter={mutations.handleMoveEmitter}
        handlePortEmitter={handlePortEmitter}
        handleRenameEmitter={mutations.handleRenameEmitter}
        renamingEmitter={renamingEmitter}
        setRenamingEmitter={setRenamingEmitter}
        draggedEmitter={draggedEmitter}
        setDraggedEmitter={setDraggedEmitter}
        setStatusMessage={setStatusMessage}
        hasResourceResolver={hasResourceResolver}
        hasSkinCharacterData={hasSkinCharacterData}
        actionsMenuAnchor={actionsMenuAnchor}
        setActionsMenuAnchor={setActionsMenuAnchor}
        setShowMatrixModal={setShowMatrixModal}
        setMatrixModalState={setMatrixModalState}
        handleAddIdleParticles={idle.handleAddIdleParticles}
        handleAddChildParticles={child.handleAddChildParticles}
        handleDeleteAllEmitters={handleDeleteAllEmitters}
        handleDeleteEmitter={handleDeleteEmitter}
        showTexturePreview={showTexturePreview}
        extractTexturesFromEmitterContent={extractTexturesFromEmitterContent}
        conversionTimers={conversionTimers}
        textureCloseTimerRef={textureCloseTimerRef}
        targetPath={targetPath}
        donorPath={donorPath}
        handleEditChildParticle={child.handleEditChildParticle}
        handleEmitterMouseEnter={handleEmitterMouseEnter}
        handleEmitterMouseLeave={handleEmitterMouseLeave}
        handleEmitterClick={handleEmitterClick}
        handleEmitterContextMenu={handleEmitterContextMenu}
        noop={noop}
      />

      <VfxHubFooter
        statusMessage={statusMessage}
        trimTargetNames={trimTargetNames}
        trimDonorNames={trimDonorNames}
        setTrimTargetNames={setTrimTargetNames}
        setTrimDonorNames={setTrimDonorNames}
        handleUndo={handleUndo}
        undoHistory={undoHistory}
        handleSave={handleSave}
        isProcessing={isProcessing}
        hasChangesToSave={hasChangesToSave}
      />

      {/* Modals */}
      <VfxHubModalHosts
        collections={collections}
        modalSize={modalSize}
        isProcessing={isProcessing}
        hoveredPreview={hoveredPreview}
        setHoveredPreview={setHoveredPreview}
        download={download}
        handleMouseDown={handleMouseDown}
        downloadContentRef={downloadContentRef}
        saveDownloadScrollPos={saveDownloadScrollPos}
        upload={upload}
        targetSystemEntries={targetSystemEntries}
        setStatusMessage={setStatusMessage}
      />
      <VfxHubDialogs
        persistent={persistent}
        typeOptions={persistent.typeOptions}
        showNewSystemModal={showNewSystemModal}
        setShowNewSystemModal={setShowNewSystemModal}
        newSystemName={newSystemName}
        setNewSystemName={setNewSystemName}
        handleCreateNewSystem={handleCreateNewSystem}
        idle={idle}
        child={child}
        showMatrixModal={showMatrixModal}
        setShowMatrixModal={setShowMatrixModal}
        matrixModalState={matrixModalState}
        setMatrixModalState={setMatrixModalState}
        targetSystems={targetSystems}
        setTargetSystems={setTargetSystems}
        targetPyContent={targetPyContent}
        setTargetPyContent={setTargetPyContent}
        setFileSaved={setFileSaved}
        saveStateToHistory={saveStateToHistory}
        isProcessing={isProcessing}
        handleOpenBackupViewer={handleOpenBackupViewer}
        handleOpenPersistent={persistent.handleOpenPersistent}
        handleOpenNewSystemModal={handleOpenNewSystemModal}
        hasResourceResolver={hasResourceResolver}
        hasSkinCharacterData={hasSkinCharacterData}
        showBackupViewer={showBackupViewer}
        setShowBackupViewer={setShowBackupViewer}
        fileSaved={fileSaved}
        performBackupRestore={performBackupRestore}
        setStatusMessage={setStatusMessage}
        targetPath={targetPath}
        unsavedGuard={unsavedGuard}
        showRitobinWarning={showRitobinWarning}
        setShowRitobinWarning={setShowRitobinWarning}
        ritobinWarningContent={ritobinWarningContent}
        setRitobinWarningContent={setRitobinWarningContent}
        navigate={navigate}
        processTargetBin={processTargetBin}
        showRitoBinErrorDialog={showRitoBinErrorDialog}
        setShowRitoBinErrorDialog={setShowRitoBinErrorDialog}
        celestialButtonStyle={celestialButtonStyle}
      />
    </div>
  );
};

export default VFXHub;
