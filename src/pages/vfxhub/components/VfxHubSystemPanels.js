import React from 'react';
import ParticleSystemList from '../../port2/components/ParticleSystemList/ParticleSystemList';
import { SearchInput } from '../../port2/components/common/Inputs';

function VfxHubSystemPanels({
  sectionStyle,
  targetFilter,
  onTargetFilterChange,
  donorFilter,
  onDonorFilterChange,
  handleDrop,
  handleDragOver,
  targetSystems,
  donorSystems,
  filteredTargetSystems,
  filteredDonorSystems,
  selectedTargetSystem,
  setSelectedTargetSystem,
  pressedSystemKey,
  setPressedSystemKey,
  dragStartedKey,
  setDragStartedKey,
  donorPyContent,
  handlePortAllEmitters,
  handleRenameSystem,
  renamingSystem,
  setRenamingSystem,
  trimTargetNames,
  trimDonorNames,
  collapsedTargetSystems,
  toggleTargetSystemCollapse,
  collapsedDonorSystems,
  toggleDonorSystemCollapse,
  handleMoveEmitter,
  handlePortEmitter,
  handleRenameEmitter,
  renamingEmitter,
  setRenamingEmitter,
  draggedEmitter,
  setDraggedEmitter,
  setStatusMessage,
  hasResourceResolver,
  hasSkinCharacterData,
  actionsMenuAnchor,
  setActionsMenuAnchor,
  setShowMatrixModal,
  setMatrixModalState,
  handleAddIdleParticles,
  handleAddChildParticles,
  handleDeleteAllEmitters,
  handleDeleteEmitter,
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
  noop,
}) {
  const [isDragOverVfx, setIsDragOverVfx] = React.useState(false);
  const dragEnterCounter = React.useRef(0);

  const isVfxSystemDrag = (event) => {
    const types = event?.dataTransfer?.types;
    if (!types) return false;
    return (
      Array.from(types).includes('application/x-vfxsys') ||
      (typeof types.contains === 'function' && types.contains('application/x-vfxsys'))
    );
  };

  const handleTargetDragOver = (event) => {
    if (!isVfxSystemDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    if (!isDragOverVfx) setIsDragOverVfx(true);
    if (typeof handleDragOver === 'function') handleDragOver(event);
  };

  const handleTargetDragEnter = (event) => {
    if (!isVfxSystemDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragEnterCounter.current += 1;
    if (!isDragOverVfx) setIsDragOverVfx(true);
  };

  const handleTargetDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragEnterCounter.current -= 1;
    if (dragEnterCounter.current <= 0) {
      dragEnterCounter.current = 0;
      setIsDragOverVfx(false);
    }
  };

  const handleTargetDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragEnterCounter.current = 0;
    setIsDragOverVfx(false);
    handleDrop(event);
  };



  return (
    <div style={{
      display: 'flex',
      flex: 1,
      gap: '20px',
      padding: '12px',
      overflow: 'hidden',
      minHeight: '0',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '0' }}>
        <SearchInput
          initialValue={targetFilter}
          placeholder="Filter Selected Systems"
          onChange={onTargetFilterChange}
          style={{ flex: '0 0 auto', width: '100%' }}
        />
        <div
          onDrop={handleTargetDrop}
          onDragOver={handleTargetDragOver}
          onDragEnter={handleTargetDragEnter}
          onDragLeave={handleTargetDragLeave}
          style={{
            flex: 1,
            height: '400px',
            ...sectionStyle,
            border: isDragOverVfx ? '1px solid var(--accent)' : (sectionStyle.border || '1px solid rgba(255,255,255,0.10)'),
            borderRadius: '8px',
            padding: '0',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'stretch',
            position: 'relative',
          }}
        >
          {isDragOverVfx && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: 2,
                background: 'rgba(139, 92, 246, 0.15)',
                border: '2px dashed var(--accent)',
                borderRadius: '8px',
                transition: 'all 0.15s ease-out',
              }}
            >
              <div
                style={{
                  padding: '10px 16px',
                  borderRadius: '6px',
                  border: '1px dashed var(--accent)',
                  color: 'var(--accent)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '13px',
                  background: 'color-mix(in srgb, var(--accent), transparent 90%)',
                }}
              >
                Drop to add VFX system
              </div>
            </div>
          )}
          {Object.keys(targetSystems).length > 0 ? (
            <div className="with-scrollbars" style={{ width: '100%', height: '100%', overflow: 'auto', background: 'rgba(255, 255, 255, 0.03)' }}>
              <ParticleSystemList
                systems={filteredTargetSystems}
                isTarget
                selectedTargetSystem={selectedTargetSystem}
                setSelectedTargetSystem={setSelectedTargetSystem}
                pressedSystemKey={pressedSystemKey}
                setPressedSystemKey={setPressedSystemKey}
                dragStartedKey={dragStartedKey}
                setDragStartedKey={setDragStartedKey}
                donorPyContent={donorPyContent}
                handlePortAllEmitters={handlePortAllEmitters}
                handleRenameSystem={handleRenameSystem}
                renamingSystem={renamingSystem}
                setRenamingSystem={setRenamingSystem}
                trimTargetNames={trimTargetNames}
                trimDonorNames={trimDonorNames}
                collapsedSystems={collapsedTargetSystems}
                toggleSystemCollapse={toggleTargetSystemCollapse}
                handleMoveEmitter={handleMoveEmitter}
                handlePortEmitter={handlePortEmitter}
                handleRenameEmitter={handleRenameEmitter}
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
                handleAddIdleParticles={handleAddIdleParticles}
                handleAddChildParticles={handleAddChildParticles}
                handleDeleteAllEmitters={handleDeleteAllEmitters}
                handleDeleteEmitter={handleDeleteEmitter}
                showTexturePreview={showTexturePreview}
                extractTexturesFromEmitterContent={extractTexturesFromEmitterContent}
                conversionTimers={conversionTimers}
                textureCloseTimerRef={textureCloseTimerRef}
                targetPath={targetPath}
                donorPath={donorPath}
                handleEditChildParticle={handleEditChildParticle}
                handleEmitterMouseEnter={handleEmitterMouseEnter}
                handleEmitterMouseLeave={handleEmitterMouseLeave}
                handleEmitterClick={handleEmitterClick}
                handleEmitterContextMenu={handleEmitterContextMenu}
              />
            </div>
          ) : (
            <div style={{
              color: 'var(--accent)',
              fontSize: '16px',
              fontFamily: 'JetBrains Mono, monospace',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              textAlign: 'center',
            }}>
              No target bin loaded
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SearchInput
          initialValue={donorFilter}
          placeholder="Filter Downloaded VFX Systems"
          onChange={onDonorFilterChange}
          accentVar="var(--accent2)"
          className="vfx-right-search"
          style={{ flex: '0 0 auto', width: '100%' }}
        />
        <div style={{
          flex: 1,
          ...sectionStyle,
          borderRadius: '8px',
          padding: '0',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'stretch',
        }}>
          {Object.keys(donorSystems).length > 0 ? (
            <div className="with-scrollbars" style={{ width: '100%', height: '100%', overflow: 'auto', background: 'rgba(255, 255, 255, 0.03)' }}>
              <ParticleSystemList
                systems={filteredDonorSystems}
                isTarget={false}
                selectedTargetSystem={selectedTargetSystem}
                setSelectedTargetSystem={setSelectedTargetSystem}
                pressedSystemKey={pressedSystemKey}
                setPressedSystemKey={setPressedSystemKey}
                dragStartedKey={dragStartedKey}
                setDragStartedKey={setDragStartedKey}
                donorPyContent={donorPyContent}
                handlePortAllEmitters={handlePortAllEmitters}
                handleRenameSystem={noop}
                renamingSystem={renamingSystem}
                setRenamingSystem={setRenamingSystem}
                trimTargetNames={trimTargetNames}
                trimDonorNames={trimDonorNames}
                collapsedSystems={collapsedDonorSystems}
                toggleSystemCollapse={toggleDonorSystemCollapse}
                handleMoveEmitter={handleMoveEmitter}
                handlePortEmitter={handlePortEmitter}
                handleRenameEmitter={handleRenameEmitter}
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
                handleAddIdleParticles={handleAddIdleParticles}
                handleAddChildParticles={handleAddChildParticles}
                handleDeleteAllEmitters={handleDeleteAllEmitters}
                handleDeleteEmitter={handleDeleteEmitter}
                showTexturePreview={showTexturePreview}
                extractTexturesFromEmitterContent={extractTexturesFromEmitterContent}
                conversionTimers={conversionTimers}
                textureCloseTimerRef={textureCloseTimerRef}
                targetPath={targetPath}
                donorPath={donorPath}
                handleEditChildParticle={handleEditChildParticle}
                handleEmitterMouseEnter={handleEmitterMouseEnter}
                handleEmitterMouseLeave={handleEmitterMouseLeave}
                handleEmitterClick={handleEmitterClick}
                handleEmitterContextMenu={handleEmitterContextMenu}
              />
            </div>
          ) : (
            <div style={{
              color: 'var(--accent)',
              fontSize: '16px',
              fontFamily: 'JetBrains Mono, monospace',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              textAlign: 'center',
            }}>
              No VFX systems downloaded
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(VfxHubSystemPanels);
