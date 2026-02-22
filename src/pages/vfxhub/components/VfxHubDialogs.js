import React from 'react';
import BackupViewer from '../../../components/modals/BackupViewer';
import RitobinWarningModal from '../../../components/modals/RitobinWarningModal';
import RitoBinErrorDialog from '../../../components/modals/RitoBinErrorDialog';
import UnsavedChangesModal from '../../../components/modals/UnsavedChangesModal';
import VfxFloatingActions from '../../../components/floating/VfxFloatingActions';
import PersistentEffectsModal from '../../port2/components/modals/PersistentEffectsModal';
import IdleParticleModal from '../../port2/components/modals/IdleParticleModal';
import ChildParticleModal from '../../port2/components/modals/ChildParticleModal';
import VfxMatrixEditorAdapter from '../../port2/components/VfxMatrixEditorAdapter';
import NewVfxSystemModal from '../../port2/components/modals/NewVfxSystemModal';
import { reparseBinWithFreshPy } from '../../../utils/io/reparseHelpers.js';

function VfxHubDialogs({
  persistent,
  typeOptions,
  showNewSystemModal,
  setShowNewSystemModal,
  newSystemName,
  setNewSystemName,
  handleCreateNewSystem,
  idle,
  child,
  showMatrixModal,
  setShowMatrixModal,
  matrixModalState,
  setMatrixModalState,
  targetSystems,
  setTargetSystems,
  targetPyContent,
  setTargetPyContent,
  setFileSaved,
  saveStateToHistory,
  isProcessing,
  handleOpenBackupViewer,
  handleOpenPersistent,
  handleOpenNewSystemModal,
  hasResourceResolver,
  hasSkinCharacterData,
  showBackupViewer,
  setShowBackupViewer,
  fileSaved,
  performBackupRestore,
  setStatusMessage,
  targetPath,
  unsavedGuard,
  showRitobinWarning,
  setShowRitobinWarning,
  ritobinWarningContent,
  setRitobinWarningContent,
  navigate,
  processTargetBin,
  showRitoBinErrorDialog,
  setShowRitoBinErrorDialog,
  celestialButtonStyle,
}) {
  return (
    <>
      <PersistentEffectsModal
        showPersistentModal={persistent.showPersistentModal}
        setShowPersistentModal={persistent.setShowPersistentModal}
        persistentPreset={persistent.persistentPreset}
        setPersistentPreset={persistent.setPersistentPreset}
        typeOptions={typeOptions}
        typeDropdownOpen={persistent.typeDropdownOpen}
        setTypeDropdownOpen={persistent.setTypeDropdownOpen}
        typeDropdownRef={persistent.typeDropdownRef}
        persistentShowSubmeshes={persistent.persistentShowSubmeshes}
        setPersistentShowSubmeshes={persistent.setPersistentShowSubmeshes}
        persistentHideSubmeshes={persistent.persistentHideSubmeshes}
        setPersistentHideSubmeshes={persistent.setPersistentHideSubmeshes}
        availableSubmeshes={persistent.availableSubmeshes}
        customShowSubmeshInput={persistent.customShowSubmeshInput}
        setCustomShowSubmeshInput={persistent.setCustomShowSubmeshInput}
        handleAddCustomShowSubmesh={persistent.handleAddCustomShowSubmesh}
        customHideSubmeshInput={persistent.customHideSubmeshInput}
        setCustomHideSubmeshInput={persistent.setCustomHideSubmeshInput}
        handleAddCustomHideSubmesh={persistent.handleAddCustomHideSubmesh}
        handleRemoveCustomSubmesh={persistent.handleRemoveCustomSubmesh}
        persistentVfx={persistent.persistentVfx}
        setPersistentVfx={persistent.setPersistentVfx}
        effectKeyOptions={persistent.effectKeyOptions}
        vfxSearchTerms={persistent.vfxSearchTerms}
        setVfxSearchTerms={persistent.setVfxSearchTerms}
        vfxDropdownOpen={persistent.vfxDropdownOpen}
        setVfxDropdownOpen={persistent.setVfxDropdownOpen}
        existingConditions={persistent.existingConditions}
        showExistingConditions={persistent.showExistingConditions}
        setShowExistingConditions={persistent.setShowExistingConditions}
        handleLoadExistingCondition={persistent.handleLoadExistingCondition}
        editingConditionIndex={persistent.editingConditionIndex}
        handleApplyPersistent={persistent.handleApplyPersistent}
      />

      <NewVfxSystemModal
        open={showNewSystemModal}
        onClose={() => setShowNewSystemModal(false)}
        newSystemName={newSystemName}
        setNewSystemName={setNewSystemName}
        onCreate={handleCreateNewSystem}
      />

      <IdleParticleModal
        showIdleParticleModal={idle.showIdleParticleModal}
        setShowIdleParticleModal={idle.setShowIdleParticleModal}
        selectedSystemForIdle={idle.selectedSystemForIdle}
        setSelectedSystemForIdle={idle.setSelectedSystemForIdle}
        isEditingIdle={idle.isEditingIdle}
        setIsEditingIdle={idle.setIsEditingIdle}
        idleBonesList={idle.idleBonesList}
        setIdleBonesList={idle.setIdleBonesList}
        existingIdleBones={idle.existingIdleBones}
        setExistingIdleBones={idle.setExistingIdleBones}
        handleConfirmIdleParticles={idle.handleConfirmIdleParticles}
      />

      <ChildParticleModal
        open={child.showChildModal}
        onClose={child.resetChildState}
        isEdit={child.isEditMode}
        targetSystem={child.selectedSystemForChild}
        selectedChildSystem={child.selectedChildSystem}
        setSelectedChildSystem={child.setSelectedChildSystem}
        emitterName={child.emitterName}
        setEmitterName={child.setEmitterName}
        rate={child.childParticleRate}
        setRate={child.setChildParticleRate}
        lifetime={child.childParticleLifetime}
        setLifetime={child.setChildParticleLifetime}
        bindWeight={child.childParticleBindWeight}
        setBindWeight={child.setChildParticleBindWeight}
        timeBeforeFirstEmission={child.childParticleTimeBeforeFirstEmission}
        setTimeBeforeFirstEmission={child.setChildParticleTimeBeforeFirstEmission}
        translationOverrideX={child.childParticleTranslationOverrideX}
        setTranslationOverrideX={child.setChildParticleTranslationOverrideX}
        translationOverrideY={child.childParticleTranslationOverrideY}
        setTranslationOverrideY={child.setChildParticleTranslationOverrideY}
        translationOverrideZ={child.childParticleTranslationOverrideZ}
        setTranslationOverrideZ={child.setChildParticleTranslationOverrideZ}
        isSingle={child.childParticleIsSingle}
        setIsSingle={child.setChildParticleIsSingle}
        availableSystems={child.availableVfxSystems}
        onConfirm={child.handleConfirmChildParticles}
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

      <VfxFloatingActions
        targetPyContent={targetPyContent}
        isProcessing={isProcessing}
        handleOpenBackupViewer={handleOpenBackupViewer}
        handleOpenPersistent={handleOpenPersistent}
        handleOpenNewSystemModal={handleOpenNewSystemModal}
        hasResourceResolver={hasResourceResolver}
        hasSkinCharacterData={hasSkinCharacterData}
        placement="left"
      />

      <BackupViewer
        open={showBackupViewer}
        onClose={(restored) => {
          setShowBackupViewer(false);
          if (restored) {
            if (!fileSaved) {
              if (window.confirm('You have unsaved changes. Restoring a backup will overwrite them. Continue?')) {
                performBackupRestore();
              } else {
                setStatusMessage('Backup restore cancelled - unsaved changes preserved');
                return;
              }
            } else {
              performBackupRestore();
            }
          }
        }}
        filePath={targetPath !== 'This will show target bin' ? targetPath.replace('.bin', '.py') : null}
        component="VFXHub"
      />

      <UnsavedChangesModal
        open={unsavedGuard.showUnsavedDialog}
        onCancel={unsavedGuard.handleUnsavedCancel}
        onSave={unsavedGuard.handleUnsavedSave}
        onDiscard={unsavedGuard.handleUnsavedDiscard}
      />

      <RitobinWarningModal
        open={showRitobinWarning}
        onClose={() => {
          setShowRitobinWarning(false);
          setRitobinWarningContent(null);
        }}
        navigate={navigate}
        content={ritobinWarningContent}
        onReparseFromBin={async () => {
          if (targetPath && targetPath !== 'This will show target bin' && typeof processTargetBin === 'function') {
            await reparseBinWithFreshPy({
              sourcePath: targetPath,
              reparseFn: processTargetBin,
              logPrefix: '[VFXHub]',
            });
          }
        }}
        onContinueAnyway={() => {
          setShowRitobinWarning(false);
          setRitobinWarningContent(null);
          if (targetSystems && Object.keys(targetSystems).length > 0) {
            setStatusMessage(`Target bin loaded: ${Object.keys(targetSystems).length} systems found`);
          }
        }}
      />

      <RitoBinErrorDialog
        open={showRitoBinErrorDialog}
        onClose={() => setShowRitoBinErrorDialog(false)}
        onRestoreBackup={() => {
          performBackupRestore();
          setShowRitoBinErrorDialog(false);
        }}
        celestialButtonStyle={celestialButtonStyle}
      />
    </>
  );
}

export default React.memo(VfxHubDialogs);
