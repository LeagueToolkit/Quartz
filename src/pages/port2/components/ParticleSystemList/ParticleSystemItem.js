import React from 'react';
import { RenameInput } from '../common/Inputs';
import SystemActionsButton from '../SystemActionsButton';
import EmitterItem from './EmitterItem';
import { getShortSystemName } from '../../utils/nameUtils';
import { extractVFXSystem } from '../../../../utils/vfx/vfxSystemParser';
import { isDivineLabChildParticle } from '../../../../utils/vfx/mutations/childParticlesManager';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';

const ParticleSystemItem = ({
    system,
    isTarget,
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
    collapsedSystems,
    toggleSystemCollapse,
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
    handleEmitterContextMenu
}) => {
    const isPressed = pressedSystemKey === system.key && !isTarget;
    const isDragging = dragStartedKey === system.key && !isTarget;

    return (
        <div
            key={system.key}
            draggable={!isTarget}
            title={!isTarget ? 'Drag into Target to add full system' : undefined}
            onMouseDown={(e) => {
                if (isTarget || e.target.closest('button') || e.target.closest('.port-btn') || e.target.closest('.particle-title-div')) return;
                setPressedSystemKey(system.key);
                setDragStartedKey(null);
            }}
            onMouseUp={() => {
                if (isTarget) return;
                if (!isDragging) {
                    setPressedSystemKey(null);
                }
            }}
            onDragStart={async (e) => {
                if (isTarget) return;
                setDragStartedKey(system.key);
                try {
                    let fullContent = '';
                    try {
                        const extracted = extractVFXSystem(donorPyContent, system.name);
                        fullContent = extracted?.fullContent || extracted?.rawContent || system.rawContent || '';
                    } catch (_) {
                        fullContent = system.rawContent || '';
                    }
                    const particleNameForUi = (system && typeof system.particleName === 'string' && system.particleName.trim()) ? system.particleName : system.name;
                    const payload = {
                        name: particleNameForUi,
                        fullContent
                    };
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('application/x-vfxsys', JSON.stringify(payload));
                    const el = e.currentTarget;
                    const dragImage = el.cloneNode(true);
                    dragImage.style.transform = 'rotate(2deg)';
                    dragImage.style.opacity = '0.9';
                    document.body.appendChild(dragImage);
                    dragImage.style.position = 'absolute';
                    dragImage.style.top = '-1000px';
                    e.dataTransfer.setDragImage(dragImage, 0, 0);
                    setTimeout(() => {
                        try {
                            if (dragImage.parentNode === document.body) {
                                document.body.removeChild(dragImage);
                            }
                        } catch (e) { }
                    }, 0);
                } catch (err) {
                    console.error('Drag start failed:', err);
                }
            }}
            onDragEnd={() => {
                if (isTarget) return;
                setPressedSystemKey(null);
                setDragStartedKey(null);
            }}
            className={`particle-div ${isTarget && selectedTargetSystem === system.key ? 'selected-system' : ''}`}
            onClick={(e) => {
                if (isTarget) {
                    const clickedOnHeader = e.target.closest('.particle-title-div');
                    if (clickedOnHeader) {
                        setSelectedTargetSystem(selectedTargetSystem === system.key ? null : system.key);
                    }
                }
            }}
            onDragOver={(e) => {
                if (!isTarget) return;
                const types = e.dataTransfer?.types;
                const hasEmitterType = types && (
                    Array.from(types).includes('application/x-vfxemitter') ||
                    (typeof types.contains === 'function' && types.contains('application/x-vfxemitter'))
                );
                const hasVfxType = types && (
                    Array.from(types).includes('application/x-vfxsys') ||
                    (typeof types.contains === 'function' && types.contains('application/x-vfxsys'))
                );
                if (hasVfxType) return;
                if (hasEmitterType) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                }
            }}
            onDrop={(e) => {
                if (!isTarget) return;
                const types = e.dataTransfer?.types;
                const hasVfxType = types && (
                    Array.from(types).includes('application/x-vfxsys') ||
                    (typeof types.contains === 'function' && types.contains('application/x-vfxsys'))
                );
                if (hasVfxType) return;
                try {
                    e.preventDefault();
                    e.stopPropagation();
                    const data = e.dataTransfer.getData('application/x-vfxemitter');
                    if (!data) return;
                    const emitterData = JSON.parse(data);
                    const { sourceType, sourceSystemKey, emitterName } = emitterData;
                    if (sourceSystemKey && emitterName && system.key !== sourceSystemKey) {
                        if (sourceType === 'donor') {
                            // Donor -> target should use normal port path (faster, same behavior as button).
                            handlePortEmitter(sourceSystemKey, emitterName, undefined, system.key);
                        } else {
                            // Target -> target move path.
                            handleMoveEmitter(sourceSystemKey, emitterName, system.key);
                        }
                    }
                } catch (error) {
                    console.error('Error handling emitter drop:', error);
                }
            }}
            style={{
                cursor: isTarget ? 'pointer' : 'default',
                outline: isPressed || isDragging ? '2px dashed var(--accent)' : 'none',
                outlineOffset: isPressed || isDragging ? '2px' : '0px',
                userSelect: 'none',
                opacity: isPressed ? '0.8' : (isDragging ? '0.7' : '1'),
                transform: isPressed ? 'scale(0.98)' : (isDragging ? 'scale(0.95)' : 'scale(1)'),
                transition: 'all 0.1s ease-out',
                ...(isTarget && system.ported ? {
                    background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent-green, #22c55e), transparent 65%), color-mix(in srgb, var(--accent-green, #22c55e), transparent 78%))',
                    border: '1px solid color-mix(in srgb, var(--accent-green, #22c55e), transparent 45%)'
                } : {}),
                // Keep target systems visually stable while dragging donor emitters.
            }}
        >
            <div
                className="particle-title-div"
                style={{
                    cursor: 'default',
                    padding: '0',
                    display: 'flex',
                    alignItems: 'stretch',
                    minHeight: '42px',
                    ...(isTarget && system.ported ? {
                        background: 'color-mix(in srgb, var(--accent-green, #22c55e), transparent 75%)',
                        borderBottom: '1px solid color-mix(in srgb, var(--accent-green, #22c55e), transparent 45%)'
                    } : {})
                }}
            >
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleSystemCollapse(system.key);
                    }}
                    style={{
                        width: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        borderRight: '1px solid rgba(255,255,255,0.04)',
                        backgroundColor: 'rgba(255,255,255,0.02)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    title={collapsedSystems.has(system.key) ? "Expand" : "Collapse"}
                >
                    <span style={{ fontSize: '14px', opacity: 0.9 }}>
                        {collapsedSystems.has(system.key) ? '🞂' : '▼'}
                    </span>
                </div>

                <div
                    className={`flex-1 flex items-center ${isTarget && selectedTargetSystem === system.key ? 'selected' : ''}`}
                    style={{
                        padding: '0 12px',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    onClick={() => {
                        if (isTarget) {
                            setSelectedTargetSystem(selectedTargetSystem === system.key ? null : system.key);
                        }
                    }}
                >
                    {!isTarget && (
                        <button
                            className="port-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePortAllEmitters(system.key);
                            }}
                            title="Port all emitters from this system to selected target system"
                            disabled={!selectedTargetSystem}
                            style={{
                                flexShrink: 0,
                                minWidth: '28px',
                                width: '28px',
                                height: '28px',
                                fontSize: '14px',
                                padding: '0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '7px',
                                border: '1px solid rgba(255,255,255,0.16)',
                                background: 'rgba(255,255,255,0.05)'
                            }}
                        >
                            <KeyboardDoubleArrowLeftIcon sx={{ fontSize: 18, lineHeight: 1, opacity: 0.95 }} />
                        </button>
                    )}

                    {isTarget && renamingSystem && renamingSystem.systemKey === system.key ? (
                        <RenameInput
                            initialValue={system.particleName || system.name || system.key}
                            onConfirm={(newName) => {
                                if (newName && newName.trim() !== '' && newName !== (system.particleName || system.name || system.key)) {
                                    handleRenameSystem(system.key, newName);
                                } else {
                                    setRenamingSystem(null);
                                }
                            }}
                            onCancel={() => setRenamingSystem(null)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <div
                            className="label ellipsis flex-1"
                            title={system.particleName || system.name}
                            style={{
                                color: 'var(--accent)',
                                fontWeight: '600',
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <span
                                onDoubleClick={(e) => {
                                    if (isTarget) {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setRenamingSystem({ systemKey: system.key, newName: system.particleName || system.name || system.key });
                                    }
                                }}
                                style={{
                                    cursor: 'pointer',
                                    display: 'inline-block',
                                    flex: 1,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {(() => {
                                    const displayName = system.particleName || system.name || system.key;
                                    const shouldTrim = isTarget ? trimTargetNames : trimDonorNames;
                                    return shouldTrim ? getShortSystemName(displayName) : displayName;
                                })()}
                            </span>
                            {selectedTargetSystem === system.key && isTarget && (
                                <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>✓</span>
                            )}
                            <span style={{
                                marginLeft: 'auto',
                                opacity: 1.0,
                                fontSize: '12px',
                                background: 'rgba(255,255,255,0.08)',
                                padding: '1px 7px',
                                borderRadius: '12px',
                                color: 'var(--text)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                fontWeight: '600'
                            }}>
                                {system.emitters.length}
                            </span>
                        </div>
                    )}
                </div>

                {isTarget && (
                    <div style={{ display: 'flex', alignItems: 'center', paddingRight: '8px' }}>
                        <SystemActionsButton
                            system={system}
                            hasResourceResolver={hasResourceResolver}
                            hasSkinCharacterData={hasSkinCharacterData}
                            menuAnchorEl={actionsMenuAnchor && actionsMenuAnchor.systemKey === system.key ? actionsMenuAnchor.element : null}
                            setActionsMenuAnchor={setActionsMenuAnchor}
                            setShowMatrixModal={setShowMatrixModal}
                            setMatrixModalState={setMatrixModalState}
                            handleAddIdleParticles={handleAddIdleParticles}
                            handleAddChildParticles={handleAddChildParticles}
                            handleDeleteAllEmitters={handleDeleteAllEmitters}
                        />
                    </div>
                )}
            </div>
            {!collapsedSystems.has(system.key) && system.emitters.map((emitter, index) => (
                <EmitterItem
                    key={`${emitter.name}-${index}`}
                    emitter={emitter}
                    index={index}
                    system={system}
                    isTarget={isTarget}
                    renamingEmitter={renamingEmitter}
                    setRenamingEmitter={setRenamingEmitter}
                    handleRenameEmitter={handleRenameEmitter}
                    handlePortEmitter={handlePortEmitter}
                    draggedEmitter={draggedEmitter}
                    setDraggedEmitter={setDraggedEmitter}
                    isDivineLabChildParticle={isDivineLabChildParticle}
                    selectedTargetSystem={selectedTargetSystem}
                    setStatusMessage={setStatusMessage}
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
            ))}
        </div>
    );
};

export default ParticleSystemItem;

