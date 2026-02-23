import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './Port.css';
import PersistentEffectsModal from './components/modals/PersistentEffectsModal';
import IdleParticleModal from './components/modals/IdleParticleModal';
import ChildParticleModal from './components/modals/ChildParticleModal';
import TargetColumn from './components/TargetColumn';
import DonorColumn from './components/DonorColumn';
import PortStatusBar from './components/PortStatusBar';
import PortBottomControls from './components/PortBottomControls';
import VfxSystemNamePromptModal from './components/modals/VfxSystemNamePromptModal';
import PortAllModeModal from './components/modals/PortAllModeModal';
import VfxMatrixEditorAdapter from './components/VfxMatrixEditorAdapter';
import usePort from './hooks/usePort';
import { Box, IconButton, Tooltip, Button, Typography, Checkbox, FormControlLabel, Select, MenuItem, FormControl, InputLabel, Menu } from '@mui/material';
import { ChevronRight as ChevronRightIcon, ChevronLeft as ChevronLeftIcon, MoreHoriz as MoreHorizIcon, Delete as DeleteIcon } from '@mui/icons-material';
import CropOriginalIcon from '@mui/icons-material/CropOriginal';
import BackupViewer from '../../components/modals/BackupViewer';
import RitobinWarningModal from '../../components/modals/RitobinWarningModal';
import CombineLinkedBinsModal from '../../components/modals/CombineLinkedBinsModal';
import RitoBinErrorDialog from '../../components/modals/RitoBinErrorDialog';
import VfxFloatingActions from '../../components/floating/VfxFloatingActions';
import NewVfxSystemModal from './components/modals/NewVfxSystemModal';
import { parseVfxEmitters } from '../../utils/vfx/vfxEmitterParser.js';
import { insertVFXSystemIntoFile, insertVFXSystemWithPreservedNames } from '../../utils/vfx/vfxInsertSystem.js';
import { findAssetFiles, copyAssetFiles, showAssetCopyResults } from '../../utils/assets/assetCopier.js';
import GlowingSpinner from '../../components/GlowingSpinner';
import { parseSystemMatrix } from '../../utils/vfx/mutations/matrixUtils.js';
import { openAssetPreview } from '../../utils/assets/assetPreviewEvent.js';
import UnsavedChangesModal from '../../components/modals/UnsavedChangesModal';
import { reparseBinWithFreshPy } from '../../utils/io/reparseHelpers.js';


// Feature flag for virtualization - set to false to disable if issues occur
// DISABLED BY DEFAULT for safety - enable after testing
const ENABLE_VIRTUALIZATION = true;
// Minimum number of systems before virtualization kicks in (to avoid overhead for small lists)
const VIRTUALIZATION_THRESHOLD = 20;

const Port2 = () => {
  const [showPortAllModeModal, setShowPortAllModeModal] = useState(false);

  // All state and handlers live in usePort hook
  const {
    actionsMenuAnchor,
    activeConversions,
    availableSubmeshes,
    availableVfxSystems,
    backgroundSaveTimerRef,
    emitterName,
    setEmitterName,
    childParticleBindWeight,
    childParticleIsSingle,
    childParticleLifetime,
    childParticleRate,
    childParticleTimeBeforeFirstEmission,
    childParticleTranslationOverrideX,
    childParticleTranslationOverrideY,
    childParticleTranslationOverrideZ,
    collapsedTargetSystems,
    collapsedDonorSystems,
    conversionTimers,
    customHideSubmeshInput,
    customShowSubmeshInput,
    filterDonorParticles,
    filterTargetParticles,
    deletedEmitters,
    donorFilter,
    donorFilterInput,
    donorListRef,
    donorPath,
    donorPyContent,
    donorPyContentRef,
    donorSystems,
    dragEnterCounter,
    dragStartedKey,
    draggedEmitter,
    isEditMode,
    resetChildState,
    editingConditionIndex,
    effectKeyOptions,
    enableDonorEmitterSearch,
    enableTargetEmitterSearch,
    existingConditions,
    existingIdleBones,
    extractColorsFromEmitterContent,
    extractTextureNamesFromEmitter,
    extractTexturesFromEmitterContent,
    filteredTargetSystems,
    filteredDonorSystems,
    processTargetBin,
    processDonorBin,
    handleAddChildParticles,
    handleAddCustomHideSubmesh,
    handleAddCustomShowSubmesh,
    handleAddIdleParticles,
    handleApplyPersistent,
    handleClearSelection,
    handleConfirmChildParticles,
    handleConfirmIdleParticles,
    handleCreateNewSystem,
    handleDeleteAllEmitters,
    handleDeleteEmitter,
    handleEditChildParticle,
    handleLoadExistingCondition,
    handleMoveEmitter,
    handleOpenBackupViewer,
    handleOpenDonorBin,
    handleOpenNewSystemModal,
    handleOpenPersistent,
    handleOpenTargetBin,
    handlePortAllEmitters,
    handlePortAllSystems,
    handlePortEmitter,
    handleRemoveCustomSubmesh,
    handleRenameEmitter,
    handleRenameSystem,
    handleSave,
    handleUndo,
    handleUnsavedCancel,
    handleUnsavedDiscard,
    handleUnsavedSave,
    handleVersions,
    hasChangesToSave,
    hasResourceResolver,
    hasSkinCharacterData,
    idleBonesList,
    isPortAllLoading,
    isProcessing,
    processingText,
    isEditingIdle,
    isDragOverVfx,
    performBackupRestore,
    pressedSystemKey,
    pendingDrop,
    matrixModalState,
    newSystemName,
    namePromptValue,
    persistentPreset,
    persistentVfx,
    persistentShowSubmeshes,
    persistentHideSubmeshes,
    recentCreatedSystemKeys,
    removeEmitterBlockFromSystem,
    renamingEmitter,
    renamingSystem,
    ritobinWarningContent,
    navigate,
    saveStateToHistory,
    selectedChildSystem,
    selectedSystemForChild,
    selectedSystemForIdle,
    selectedTargetSystem,
    setActionsMenuAnchor,
    handleEmitterMouseEnter,
    handleEmitterMouseLeave,
    handleEmitterClick,
    handleEmitterContextMenu,
    showTexturePreview,
    textureCloseTimerRef,
    setAvailableSubmeshes,
    setAvailableVfxSystems,
    setChildParticleBindWeight,
    setChildParticleIsSingle,
    setChildParticleLifetime,
    setChildParticleRate,
    setChildParticleTimeBeforeFirstEmission,
    setChildParticleTranslationOverrideX,
    setChildParticleTranslationOverrideY,
    setChildParticleTranslationOverrideZ,
    setCollapsedTargetSystems,
    setCollapsedDonorSystems,
    setCustomHideSubmeshInput,
    setCustomShowSubmeshInput,
    setDeletedEmitters,
    setDonorFilter,
    setDonorFilterInput,
    setDonorPath,
    setDonorPyContent,
    setDonorSystems,
    setDragStartedKey,
    setDraggedEmitter,
    setEditingConditionIndex,
    setEffectKeyOptions,
    setEnableDonorEmitterSearch,
    setEnableTargetEmitterSearch,
    setExistingConditions,
    setExistingIdleBones,
    setFileSaved,
    setIdleBonesList,
    setIsDragOverVfx,
    setIsEditingIdle,
    setIsPortAllLoading,
    setIsProcessing,
    setMatrixModalState,
    setNamePromptValue,
    setNewSystemName,
    setPendingDrop,
    setPersistentHideSubmeshes,
    setPersistentPreset,
    setPersistentShowSubmeshes,
    setPersistentVfx,
    setPressedSystemKey,
    setProcessingText,
    setRecentCreatedSystemKeys,
    setRenamingEmitter,
    setRenamingSystem,
    setRitobinWarningContent,
    setSelectedChildSystem,
    setSelectedSystemForChild,
    setSelectedSystemForIdle,
    setSelectedTargetSystem,
    setShowBackupViewer,
    setShowExistingConditions,
    setShowIdleParticleModal,
    setShowMatrixModal,
    setShowNamePromptModal,
    setShowNewSystemModal,
    setShowPersistentModal,
    setShowRitoBinErrorDialog,
    setShowRitobinWarning,
    setStatusMessage,
    setTargetFilter,
    setTargetFilterInput,
    setTargetPath,
    setTargetPyContent,
    setTargetSystems,
    setTrimDonorNames,
    setTrimTargetNames,
    setTypeDropdownOpen,
    setUndoHistory,
    setVfxDropdownOpen,
    setVfxSearchTerms,
    showBackupViewer,
    showChildModal,
    showExistingConditions,
    showIdleParticleModal,
    showMatrixModal,
    showNamePromptModal,
    showNewSystemModal,
    showPersistentModal,
    showRitoBinErrorDialog,
    showRitobinWarning,
    showTextureError,
    showUnsavedDialog,
    statusMessage,
    targetFilter,
    targetFilterInput,
    targetListRef,
    targetPath,
    targetPyContent,
    targetPyContentRef,
    targetSystems,
    handleToggleTargetCollapse,
    handleToggleDonorCollapse,
    trimDonorNames,
    trimTargetNames,
    typeDropdownOpen,
    typeDropdownRef,
    typeOptions,
    undoHistory,
    vfxDropdownOpen,
    vfxSearchTerms,
    combineModalState,
    handleCombineYes,
    handleCombineNo,
  } = usePort();


  console.log('[Port2] Handlers loaded:', {
    handleOpenTargetBin: typeof handleOpenTargetBin,
    handleOpenDonorBin: typeof handleOpenDonorBin,
    isProcessing
  });



  const celestialButtonStyle = {
    background: 'var(--bg-2)',
    border: '1px solid var(--accent-muted)',
    color: 'var(--text)',
    borderRadius: '5px',
    transition: 'all 200ms ease',
    textTransform: 'none',
    fontFamily: 'JetBrains Mono, monospace',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    '&:hover': {
      background: 'var(--surface-2)',
      borderColor: 'var(--accent)',
      boxShadow: '0 0 15px color-mix(in srgb, var(--accent), transparent 60%)'
    },
    '&:disabled': {
      background: 'var(--bg-2)',
      borderColor: 'var(--text-2)',
      color: 'var(--text-2)',
      opacity: 0.6,
      cursor: 'not-allowed'
    },
  };

  const primaryButtonStyle = {
    ...celestialButtonStyle,
    background: 'var(--bg-2)',
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
    fontWeight: 'bold',
    boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent), transparent 70%), 0 2px 4px rgba(0,0,0,0.2)',
    '&:hover': {
      ...celestialButtonStyle['&:hover'],
      boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent), transparent 50%), 0 2px 4px rgba(0,0,0,0.3)'
    }
  };

  const sectionStyle = {
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '5px'
  };

  const handleInsertDroppedVfxSystem = () => {
    try {
      const chosen = (namePromptValue || (pendingDrop?.defaultName || 'NewVFXSystem')).trim();
      if (!chosen) {
        setStatusMessage('Enter a system name');
        return;
      }
      if (!pendingDrop) return;

      if (!hasResourceResolver) {
        setStatusMessage('Locked: target bin missing ResourceResolver');
        return;
      }

      saveStateToHistory(`Add VFX system "${chosen}"`);

      const { fullContent, defaultName } = pendingDrop;
      const prevKeys = new Set(Object.keys(targetSystems || {}));

      const isPreservationMode = chosen === defaultName;
      let updatedPy;

      if (isPreservationMode) {
        console.log(`[Drag Drop] Using preservation mode for system "${chosen}"`);
        updatedPy = insertVFXSystemWithPreservedNames(targetPyContent || '', fullContent, chosen, donorPyContent);
      } else {
        console.log(`[Drag Drop] Using standard insertion for renamed system "${chosen}"`);
        updatedPy = insertVFXSystemIntoFile(targetPyContent || '', fullContent, chosen);
      }

      setTargetPyContent(updatedPy);
      try { setFileSaved(false); } catch { }
      const systems = parseVfxEmitters(updatedPy);
      const nowTs = Date.now();

      const systemsWithDeletedEmitters = Object.fromEntries(
        Object.entries(systems).map(([key, sys]) => {
          if (sys.emitters) {
            const filteredEmitters = sys.emitters.filter(emitter => {
              const emitterKey = `${key}:${emitter.name}`;
              return !deletedEmitters.has(emitterKey);
            });
            return [key, { ...sys, emitters: filteredEmitters }];
          }
          return [key, sys];
        })
      );

      const entries = Object.entries(systemsWithDeletedEmitters).map(([key, sys]) => (
        !prevKeys.has(key)
          ? [key, { ...sys, ported: true, portedAt: nowTs }]
          : [key, sys]
      ));
      const newEntries = entries.filter(([key]) => !prevKeys.has(key));
      const oldEntries = entries.filter(([key]) => prevKeys.has(key));
      const ordered = Object.fromEntries([...newEntries, ...oldEntries]);
      setTargetSystems(ordered);

      const modeText = isPreservationMode ? 'with preserved ResourceResolver names' : 'with updated names';
      setStatusMessage(`Added VFX system "${chosen}" to target ${modeText}`);
    } catch (e) {
      console.error('Insert VFX system failed:', e);
      setStatusMessage('Failed to add VFX system');
    } finally {
      setShowNamePromptModal(false);
      setPendingDrop(null);
    }
  };

  const isVfxSystemDrag = (event) => {
    const types = event?.dataTransfer?.types;
    if (!types) return false;
    return (
      Array.from(types).includes('application/x-vfxsys') ||
      (typeof types.contains === 'function' && types.contains('application/x-vfxsys'))
    );
  };

  const processVfxSystemDrop = (event, source) => {
    try {
      event.preventDefault();
      event.stopPropagation();

      const data = event.dataTransfer.getData('application/x-vfxsys');
      if (!data) return;

      setIsDragOverVfx(false);
      dragEnterCounter.current = 0;

      if (!targetPyContent) {
        setStatusMessage('No target file loaded - please open a target bin first');
        return;
      }
      if (!hasResourceResolver) {
        setStatusMessage('Locked: target bin missing ResourceResolver');
        return;
      }

      const payload = JSON.parse(data);
      const { name, fullContent } = payload || {};
      if (!fullContent) {
        setStatusMessage('Dropped item has no VFX content');
        return;
      }

      console.log(`[Drag Drop] Open name prompt from ${source}:`, name);
      const defaultName = (name && typeof name === 'string') ? name : 'NewVFXSystem';
      setPendingDrop({ fullContent, defaultName });
      setNamePromptValue(defaultName);
      setShowNamePromptModal(true);

      requestAnimationFrame(() => {
        if (!targetListRef.current) return;
        try {
          targetListRef.current.scrollTop = 0;
        } catch { }
      });

      try {
        const assetFiles = findAssetFiles(fullContent);
        if (assetFiles && assetFiles.length > 0) {
          const { copiedFiles, failedFiles, skippedFiles } = copyAssetFiles(donorPath, targetPath, assetFiles);
          const { ipcRenderer } = window.require('electron');
          showAssetCopyResults(copiedFiles, failedFiles, skippedFiles, (messageData) => {
            ipcRenderer.send('Message', messageData);
          });
        }
      } catch (assetError) {
        console.error('Error copying assets for inserted VFX system:', assetError);
      }
    } catch (err) {
      console.error('Drop failed:', err);
      setStatusMessage('Failed to add VFX system');
    }
  };

  const handleTargetDropDragOver = (event) => {
    if (!isVfxSystemDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    if (!isDragOverVfx) setIsDragOverVfx(true);
  };

  const handleTargetDropDragEnter = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isVfxSystemDrag(event)) return;
    dragEnterCounter.current += 1;
    if (!isDragOverVfx) setIsDragOverVfx(true);
  };

  const handleTargetDropDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragEnterCounter.current -= 1;
    if (dragEnterCounter.current <= 0) {
      setIsDragOverVfx(false);
      dragEnterCounter.current = 0;
    }
  };

  const handleOpenPortAllModeModal = useCallback(() => {
    setShowPortAllModeModal(true);
  }, []);

  const handleSelectPortAllMode = useCallback((mode) => {
    setShowPortAllModeModal(false);
    handlePortAllSystems(hasResourceResolver, mode);
  }, [handlePortAllSystems, hasResourceResolver]);

  const targetColumnProps = {
    isProcessing,
    handleOpenTargetBin,
    targetFilterInput,
    enableTargetEmitterSearch,
    filterTargetParticles,
    setEnableTargetEmitterSearch,
    sectionStyle,
    isDragOverVfx,
    handleTargetDropDragOver,
    handleTargetDropDragEnter,
    handleTargetDropDragLeave,
    processVfxSystemDrop,
    targetSystems,
    targetListRef,
    filteredTargetSystems,
    selectedTargetSystem,
    setSelectedTargetSystem,
    collapsedTargetSystems,
    handleToggleTargetCollapse,
    renamingSystem,
    setRenamingSystem,
    handleRenameSystem,
    handleDeleteEmitter,
    handleMoveEmitter,
    handlePortEmitter,
    handleRenameEmitter,
    renamingEmitter,
    setRenamingEmitter,
    handleDeleteAllEmitters,
    hasResourceResolver,
    hasSkinCharacterData,
    actionsMenuAnchor,
    setActionsMenuAnchor,
    setShowMatrixModal,
    setMatrixModalState,
    handleAddIdleParticles,
    handleAddChildParticles,
    trimTargetNames,
    setStatusMessage,
    showTexturePreview,
    extractTexturesFromEmitterContent,
    conversionTimers,
    textureCloseTimerRef,
    targetPath,
    donorPath,
    handleEditChildParticle,
    handleEmitterMouseEnter,
    handleEmitterMouseLeave,
    handleEmitterClick,
    handleEmitterContextMenu,
  };

  const donorColumnProps = {
    isProcessing,
    handleOpenDonorBin,
    donorFilterInput,
    enableDonorEmitterSearch,
    filterDonorParticles,
    setEnableDonorEmitterSearch,
    sectionStyle,
    donorSystems,
    donorListRef,
    filteredDonorSystems,
    selectedTargetSystem,
    setSelectedTargetSystem,
    pressedSystemKey,
    setPressedSystemKey,
    dragStartedKey,
    setDragStartedKey,
    donorPyContent,
    handlePortAllEmitters,
    handlePortEmitter,
    draggedEmitter,
    setDraggedEmitter,
    trimDonorNames,
    collapsedDonorSystems,
    handleToggleDonorCollapse,
    setStatusMessage,
    showTexturePreview,
    extractTexturesFromEmitterContent,
    conversionTimers,
    textureCloseTimerRef,
    targetPath,
    donorPath,
    handleEditChildParticle,
    handleEmitterMouseEnter,
    handleEmitterMouseLeave,
    handleEmitterClick,
    handleEmitterContextMenu,
  };

  const handleBackupViewerClose = (restored) => {
    setShowBackupViewer(false);
    if (!restored) return;

    if (!fileSaved) {
      if (window.confirm('You have unsaved changes. Restoring a backup will overwrite them. Continue?')) {
        performBackupRestore();
      } else {
        setStatusMessage('Backup restore cancelled - unsaved changes preserved');
      }
      return;
    }

    performBackupRestore();
  };

  return (
    <div className="port-container" style={{
      minHeight: '100%',
      height: '100%', // Use 100% of parent container instead of 100vh to account for title bar
      background: 'var(--bg)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {isProcessing && <GlowingSpinner text={processingText || 'Working...'} />}
      {/* Main Content Area */}
      <div style={{
        display: 'flex',
        flex: 1,
        gap: '20px',
        padding: '20px',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Target Column */}
        <TargetColumn {...targetColumnProps} />

        {/* Donor Column */}
        <DonorColumn {...donorColumnProps} />
      </div>

      {/* Persistent Modal */}
      <PersistentEffectsModal
        showPersistentModal={showPersistentModal}
        setShowPersistentModal={setShowPersistentModal}
        persistentPreset={persistentPreset}
        setPersistentPreset={setPersistentPreset}
        typeOptions={typeOptions}
        typeDropdownOpen={typeDropdownOpen}
        setTypeDropdownOpen={setTypeDropdownOpen}
        typeDropdownRef={typeDropdownRef}
        persistentShowSubmeshes={persistentShowSubmeshes}
        setPersistentShowSubmeshes={setPersistentShowSubmeshes}
        persistentHideSubmeshes={persistentHideSubmeshes}
        setPersistentHideSubmeshes={setPersistentHideSubmeshes}
        availableSubmeshes={availableSubmeshes}
        customShowSubmeshInput={customShowSubmeshInput}
        setCustomShowSubmeshInput={setCustomShowSubmeshInput}
        handleAddCustomShowSubmesh={handleAddCustomShowSubmesh}
        customHideSubmeshInput={customHideSubmeshInput}
        setCustomHideSubmeshInput={setCustomHideSubmeshInput}
        handleAddCustomHideSubmesh={handleAddCustomHideSubmesh}
        handleRemoveCustomSubmesh={handleRemoveCustomSubmesh}
        persistentVfx={persistentVfx}
        setPersistentVfx={setPersistentVfx}
        effectKeyOptions={effectKeyOptions}
        vfxSearchTerms={vfxSearchTerms}
        setVfxSearchTerms={setVfxSearchTerms}
        vfxDropdownOpen={vfxDropdownOpen}
        setVfxDropdownOpen={setVfxDropdownOpen}
        existingConditions={existingConditions}
        showExistingConditions={showExistingConditions}
        setShowExistingConditions={setShowExistingConditions}
        handleLoadExistingCondition={handleLoadExistingCondition}
        editingConditionIndex={editingConditionIndex}
        handleApplyPersistent={handleApplyPersistent}
      />
      <VfxMatrixEditorAdapter
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
      />

      <NewVfxSystemModal
        open={showNewSystemModal}
        onClose={() => setShowNewSystemModal(false)}
        newSystemName={newSystemName}
        setNewSystemName={setNewSystemName}
        onCreate={() => handleCreateNewSystem(newSystemName, setShowNewSystemModal)}
      />

      <VfxSystemNamePromptModal
        open={showNamePromptModal}
        value={namePromptValue}
        onChange={setNamePromptValue}
        onClose={() => {
          setShowNamePromptModal(false);
          setPendingDrop(null);
        }}
        onInsert={handleInsertDroppedVfxSystem}
      />

      <IdleParticleModal
        showIdleParticleModal={showIdleParticleModal}
        setShowIdleParticleModal={setShowIdleParticleModal}
        selectedSystemForIdle={selectedSystemForIdle}
        setSelectedSystemForIdle={setSelectedSystemForIdle}
        isEditingIdle={isEditingIdle}
        setIsEditingIdle={setIsEditingIdle}
        idleBonesList={idleBonesList}
        setIdleBonesList={setIdleBonesList}
        existingIdleBones={existingIdleBones}
        setExistingIdleBones={setExistingIdleBones}
        handleConfirmIdleParticles={handleConfirmIdleParticles}
      />

      <ChildParticleModal
        open={showChildModal}
        onClose={resetChildState}
        isEdit={isEditMode}
        targetSystem={selectedSystemForChild}
        selectedChildSystem={selectedChildSystem}
        setSelectedChildSystem={setSelectedChildSystem}
        emitterName={emitterName}
        setEmitterName={setEmitterName}
        rate={childParticleRate}
        setRate={setChildParticleRate}
        lifetime={childParticleLifetime}
        setLifetime={setChildParticleLifetime}
        bindWeight={childParticleBindWeight}
        setBindWeight={setChildParticleBindWeight}
        timeBeforeFirstEmission={childParticleTimeBeforeFirstEmission}
        setTimeBeforeFirstEmission={setChildParticleTimeBeforeFirstEmission}
        translationOverrideX={childParticleTranslationOverrideX}
        setTranslationOverrideX={setChildParticleTranslationOverrideX}
        translationOverrideY={childParticleTranslationOverrideY}
        setTranslationOverrideY={setChildParticleTranslationOverrideY}
        translationOverrideZ={childParticleTranslationOverrideZ}
        setTranslationOverrideZ={setChildParticleTranslationOverrideZ}
        isSingle={childParticleIsSingle}
        setIsSingle={setChildParticleIsSingle}
        availableSystems={availableVfxSystems}
        onConfirm={handleConfirmChildParticles}
      />
      <PortStatusBar
        statusMessage={statusMessage}
        targetPyContent={targetPyContent}
        trimTargetNames={trimTargetNames}
        setTrimTargetNames={setTrimTargetNames}
        trimDonorNames={trimDonorNames}
        setTrimDonorNames={setTrimDonorNames}
      />

      <PortBottomControls
        handleUndo={handleUndo}
        undoHistory={undoHistory}
        handleSave={handleSave}
        isProcessing={isProcessing}
        hasChangesToSave={hasChangesToSave}
      />



      <VfxFloatingActions
        targetPyContent={targetPyContent}
        isProcessing={isProcessing}
        handleOpenBackupViewer={handleOpenBackupViewer}
        handleOpenPersistent={handleOpenPersistent}
        handleOpenNewSystemModal={handleOpenNewSystemModal}
        hasResourceResolver={hasResourceResolver}
        hasSkinCharacterData={hasSkinCharacterData}
        placement="top"
        showPortAllButton={!!(targetPyContent && donorPyContent)}
        onPortAll={handleOpenPortAllModeModal}
        isPortAllLoading={isPortAllLoading}
        disablePortAll={!hasResourceResolver || Object.values(donorSystems).length === 0}
      />

      <PortAllModeModal
        open={showPortAllModeModal}
        onClose={() => setShowPortAllModeModal(false)}
        onSelectMode={handleSelectPortAllMode}
        donorCount={Object.values(donorSystems || {}).length}
      />

      {/* Backup Viewer Dialog */}
      <BackupViewer
        open={showBackupViewer}
        onClose={handleBackupViewerClose}
        filePath={targetPath !== 'This will show target bin' ? targetPath.replace('.bin', '.py') : null}
        component="port"
      />

      <UnsavedChangesModal
        open={showUnsavedDialog}
        onCancel={handleUnsavedCancel}
        onSave={handleUnsavedSave}
        onDiscard={handleUnsavedDiscard}
      />

      {/* Ritobin Warning Modal */}
      <RitobinWarningModal
        open={showRitobinWarning}
        onClose={() => {
          setShowRitobinWarning(false);
          setRitobinWarningContent(null);
        }}
        navigate={navigate}
        content={ritobinWarningContent}
        onReparseFromBin={async () => {
          if (!ritobinWarningContent) return;
          if (ritobinWarningContent === targetPyContent && targetPath && targetPath !== 'This will show target bin') {
            await reparseBinWithFreshPy({
              sourcePath: targetPath,
              reparseFn: processTargetBin,
              logPrefix: '[Port2]',
            });
            return;
          }
          if (ritobinWarningContent === donorPyContent && donorPath && donorPath !== 'This will show donor bin') {
            await reparseBinWithFreshPy({
              sourcePath: donorPath,
              reparseFn: processDonorBin,
              logPrefix: '[Port2]',
            });
            return;
          }
          if (targetPath && targetPath !== 'This will show target bin') {
            await reparseBinWithFreshPy({
              sourcePath: targetPath,
              reparseFn: processTargetBin,
              logPrefix: '[Port2]',
            });
          }
        }}
        onContinueAnyway={() => {
          setShowRitobinWarning(false);
          setRitobinWarningContent(null);
          // File is already loaded, just update status message
          if (targetSystems && Object.keys(targetSystems).length > 0) {
            setStatusMessage(`Target bin loaded: ${Object.keys(targetSystems).length} systems found`);
          } else if (donorSystems && Object.keys(donorSystems).length > 0) {
            setStatusMessage(`Donor bin loaded: ${Object.keys(donorSystems).length} systems found`);
          }
        }}
      />

      {/* Combine Linked BINs Modal */}
      <CombineLinkedBinsModal
        open={combineModalState.open}
        linkCount={combineModalState.linkCount}
        onYes={handleCombineYes}
        onNo={handleCombineNo}
      />

      {/* RitoBin Error Dialog */}
      <RitoBinErrorDialog
        open={showRitoBinErrorDialog}
        onClose={() => setShowRitoBinErrorDialog(false)}
        onRestoreBackup={() => {
          performBackupRestore();
          setShowRitoBinErrorDialog(false);
        }}
        celestialButtonStyle={celestialButtonStyle}
      />
    </div>
  );
};

export default Port2;

