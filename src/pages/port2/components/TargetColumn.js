import React from 'react';
import { Button } from '@mui/material';
import { SearchInput } from './common/Inputs';
import ParticleSystemList from './ParticleSystemList/ParticleSystemList';

export default function TargetColumn({
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
}) {
  const safeTargetSystems = targetSystems || {};

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Button
        onClick={handleOpenTargetBin}
        disabled={isProcessing}
        sx={{
          width: '100%',
          padding: '0 16px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '13px',
          fontWeight: 700,
          height: '36px',
          background: 'color-mix(in srgb, var(--accent), var(--bg) 85%)',
          border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
          color: 'var(--accent)',
          borderRadius: '4px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          '&:hover': {
            background: 'color-mix(in srgb, var(--accent), var(--bg) 75%)',
            borderColor: 'var(--accent)',
            textShadow: '0 0 8px color-mix(in srgb, var(--accent), transparent 50%)',
          },
          '&:disabled': {
            opacity: 0.5,
            cursor: 'not-allowed',
            borderColor: 'rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.3)',
          },
        }}
      >
        {isProcessing ? 'Processing...' : 'Open Target Bin'}
      </Button>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <SearchInput
          initialValue={targetFilterInput}
          placeholder={enableTargetEmitterSearch ? 'Filter by Particle or Emitter Name' : 'Filter by Particle Name Only'}
          onChange={filterTargetParticles}
        />
        <button
          onClick={() => setEnableTargetEmitterSearch(!enableTargetEmitterSearch)}
          title={enableTargetEmitterSearch ? 'Disable emitter search (faster)' : 'Enable emitter search'}
          style={{
            padding: '8px 14px',
            background: enableTargetEmitterSearch
              ? 'linear-gradient(180deg, rgba(236, 185, 106, 0.15), rgba(236, 185, 106, 0.05))'
              : 'rgba(0, 0, 0, 0.25)',
            border: enableTargetEmitterSearch
              ? '1px solid var(--accent)'
              : '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            color: 'var(--accent)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '12px',
            cursor: 'pointer',
            marginTop: '-4px',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: enableTargetEmitterSearch ? '0 0 10px rgba(236, 185, 106, 0.1)' : 'none',
          }}
        >
          {enableTargetEmitterSearch ? '🔍+' : '🔍-'}
        </button>
      </div>

      <div
        style={{
          flex: 1,
          ...sectionStyle,
          border: isDragOverVfx ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.10)',
          borderRadius: '8px',
          padding: '0',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'stretch',
          position: 'relative',
        }}
        onDragOver={handleTargetDropDragOver}
        onDragEnter={handleTargetDropDragEnter}
        onDragLeave={handleTargetDropDragLeave}
        onDrop={(e) => processVfxSystemDrop(e, 'target container')}
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
        {Object.keys(safeTargetSystems).length > 0 ? (
          <div
            ref={targetListRef}
            style={{ width: '100%', height: '100%', overflow: 'auto', background: 'rgba(255, 255, 255, 0.03)' }}
            onDragOver={handleTargetDropDragOver}
            onDrop={(e) => processVfxSystemDrop(e, 'target list container')}
          >
            <ParticleSystemList
              systems={filteredTargetSystems}
              isTarget={true}
              selectedTargetSystem={selectedTargetSystem}
              setSelectedTargetSystem={setSelectedTargetSystem}
              collapsedSystems={collapsedTargetSystems}
              toggleSystemCollapse={handleToggleTargetCollapse}
              renamingSystem={renamingSystem}
              setRenamingSystem={setRenamingSystem}
              handleRenameSystem={handleRenameSystem}
              handleDeleteEmitter={handleDeleteEmitter}
              handleMoveEmitter={handleMoveEmitter}
              handlePortEmitter={handlePortEmitter}
              handleRenameEmitter={handleRenameEmitter}
              renamingEmitter={renamingEmitter}
              setRenamingEmitter={setRenamingEmitter}
              handleDeleteAllEmitters={handleDeleteAllEmitters}
              hasResourceResolver={hasResourceResolver}
              hasSkinCharacterData={hasSkinCharacterData}
              actionsMenuAnchor={actionsMenuAnchor}
              setActionsMenuAnchor={setActionsMenuAnchor}
              setShowMatrixModal={setShowMatrixModal}
              setMatrixModalState={setMatrixModalState}
              handleAddIdleParticles={handleAddIdleParticles}
              handleAddChildParticles={handleAddChildParticles}
              trimTargetNames={trimTargetNames}
              setStatusMessage={setStatusMessage}
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
          <div
            style={{
              color: 'var(--accent)',
              fontSize: '16px',
              fontFamily: 'JetBrains Mono, monospace',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              textAlign: 'center',
            }}
          >
            No target bin loaded
          </div>
        )}
      </div>
    </div>
  );
}
