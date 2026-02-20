import React from 'react';
import { Button } from '@mui/material';
import { SearchInput } from './common/Inputs';
import ParticleSystemList from './ParticleSystemList/ParticleSystemList';

export default function DonorColumn({
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
}) {
  const safeDonorSystems = donorSystems || {};

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Button
        onClick={handleOpenDonorBin}
        disabled={isProcessing}
        sx={{
          width: '100%',
          padding: '0 16px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '13px',
          fontWeight: 700,
          height: '36px',
          background: 'color-mix(in srgb, #ef4444, var(--bg) 85%)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#ef4444',
          borderRadius: '4px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          '&:hover': {
            background: 'color-mix(in srgb, #ef4444, var(--bg) 75%)',
            borderColor: '#ef4444',
            textShadow: '0 0 8px color-mix(in srgb, #ef4444, transparent 50%)',
          },
          '&:disabled': {
            opacity: 0.5,
            cursor: 'not-allowed',
            borderColor: 'rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.3)',
          },
        }}
      >
        {isProcessing ? 'Processing...' : 'Open Donor Bin'}
      </Button>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <SearchInput
          initialValue={donorFilterInput}
          placeholder={enableDonorEmitterSearch ? 'Filter by Particle or Emitter Name' : 'Filter by Particle Name Only'}
          onChange={filterDonorParticles}
        />
        <button
          onClick={() => setEnableDonorEmitterSearch(!enableDonorEmitterSearch)}
          title={enableDonorEmitterSearch ? 'Disable emitter search (faster)' : 'Enable emitter search'}
          style={{
            padding: '8px 14px',
            background: enableDonorEmitterSearch
              ? 'linear-gradient(180deg, rgba(236, 185, 106, 0.15), rgba(236, 185, 106, 0.05))'
              : 'rgba(0, 0, 0, 0.25)',
            border: enableDonorEmitterSearch
              ? '1px solid var(--accent)'
              : '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            color: 'var(--accent)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '12px',
            cursor: 'pointer',
            marginTop: '-4px',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: enableDonorEmitterSearch ? '0 0 10px rgba(236, 185, 106, 0.1)' : 'none',
          }}
        >
          {enableDonorEmitterSearch ? '🔍+' : '🔍-'}
        </button>
      </div>

      <div
        style={{
          flex: 1,
          ...sectionStyle,
          borderRadius: '8px',
          padding: '0',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'stretch',
        }}
      >
        {Object.keys(safeDonorSystems).length > 0 ? (
          <div ref={donorListRef} style={{ width: '100%', height: '100%', overflow: 'auto' }}>
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
              handlePortEmitter={handlePortEmitter}
              draggedEmitter={draggedEmitter}
              setDraggedEmitter={setDraggedEmitter}
              trimDonorNames={trimDonorNames}
              collapsedSystems={collapsedDonorSystems}
              toggleSystemCollapse={handleToggleDonorCollapse}
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
            No donor bin loaded
          </div>
        )}
      </div>
    </div>
  );
}
