import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import { RenameInput } from '../common/Inputs';
import SystemActionsButton from '../SystemActionsButton';
import EmitterItem from './EmitterItem';
import { getShortSystemName, type VfxSystem } from '../../model';
import type { ListSharedProps } from './types';

interface ParticleSystemItemProps extends ListSharedProps {
    system: VfxSystem;
    isTarget: boolean;
}

export default function ParticleSystemItem(props: ParticleSystemItemProps) {
    const {
        system,
        isTarget,
        selectedTargetSystem,
        setSelectedTargetSystem,
        pressedSystemKey,
        setPressedSystemKey,
        dragStartedKey,
        dragStartedKeyRef,
        setDragStartedKey,
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
        hasResourceResolver,
        hasSkinCharacterData,
        actionsMenuAnchor,
        setActionsMenuAnchor,
        setShowMatrixModal,
        setMatrixModalState,
        handleAddIdleParticles,
        handleAddChildParticles,
        handleDeleteAllEmitters,
        processVfxSystemDrop,
    } = props;

    const isPressed = pressedSystemKey === system.key && !isTarget;
    const isDragging = dragStartedKey === system.key && !isTarget;

    return (
        <div
            key={system.key}
            draggable={!isTarget}
            title={!isTarget ? 'Drag into Target to add full system' : undefined}
            onMouseDown={(e) => {
                const tgt = e.target as HTMLElement;
                if (isTarget || tgt.closest('button') || tgt.closest('.port-btn') || tgt.closest('.particle-title-div')) return;
                setPressedSystemKey?.(system.key);
                setDragStartedKey?.(null);
            }}
            onMouseUp={() => {
                if (isTarget) return;
                if (!isDragging) setPressedSystemKey?.(null);
            }}
            onDragStart={(e) => {
                if (isTarget) return;
                e.stopPropagation();
                setDragStartedKey?.(system.key);
                console.log('[port drag] donor-system:dragstart', {
                    systemKey: system.key,
                    particleName: system.particleName || system.name,
                });
                // Set the payload first and on its own: if the drag-image code
                // throws, the drag must still carry the system data.
                try {
                    const particleNameForUi = system && typeof system.particleName === 'string' && system.particleName.trim() ? system.particleName : system.name;
                    const payload = { name: particleNameForUi, systemKey: system.key, path: system.path };
                    e.dataTransfer.effectAllowed = 'copyMove';
                    e.dataTransfer.setData('text/plain', particleNameForUi);
                    e.dataTransfer.setData('application/x-vfxsys', JSON.stringify(payload));
                    console.log('[port drag] donor-system:payload-set', {
                        systemKey: system.key,
                        particleName: particleNameForUi,
                        types: Array.from(e.dataTransfer.types || []),
                    });
                } catch {
                    /* noop */
                }
                try {
                    const el = e.currentTarget;
                    const dragImage = el.cloneNode(true) as HTMLElement;
                    dragImage.style.transform = 'rotate(2deg)';
                    dragImage.style.opacity = '0.9';
                    document.body.appendChild(dragImage);
                    dragImage.style.position = 'absolute';
                    dragImage.style.top = '-1000px';
                    e.dataTransfer.setDragImage(dragImage, 0, 0);
                    setTimeout(() => {
                        try {
                            if (dragImage.parentNode === document.body) document.body.removeChild(dragImage);
                        } catch {
                            /* noop */
                        }
                    }, 0);
                } catch {
                    /* noop */
                }
            }}
            onDragEnd={() => {
                if (isTarget) return;
                console.log('[port drag] donor-system:dragend', {
                    systemKey: system.key,
                    particleName: system.particleName || system.name,
                });
                setPressedSystemKey?.(null);
                setDragStartedKey?.(null);
            }}
            className={`particle-div ${isTarget && selectedTargetSystem === system.key ? 'selected-system' : ''}`}
            onClick={(e) => {
                if (isTarget) {
                    const clickedOnHeader = (e.target as HTMLElement).closest('.particle-title-div');
                    if (clickedOnHeader) setSelectedTargetSystem(selectedTargetSystem === system.key ? null : system.key);
                }
            }}
            onDragOver={(e) => {
                if (!isTarget) return;
                const types = e.dataTransfer?.types;
                const hasEmitterType = types && Array.from(types).includes('application/x-vfxemitter');
                // System drags bubble up to the column drop zone; detect them
                // via the payload type or the live drag state (types can be
                // withheld during dragover in WebView2).
                const isSystemDrag = (types && Array.from(types).includes('application/x-vfxsys')) || !!dragStartedKeyRef?.current;
                if (isSystemDrag) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                    return;
                }
                if (hasEmitterType) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                }
            }}
            onDrop={(e) => {
                if (!isTarget) return;
                const types = e.dataTransfer?.types;
                const isSystemDrag = (types && Array.from(types).includes('application/x-vfxsys')) || !!dragStartedKeyRef?.current;
                if (isSystemDrag) {
                    processVfxSystemDrop?.(e, 'target system row');
                    return;
                }
                try {
                    e.preventDefault();
                    e.stopPropagation();
                    const data = e.dataTransfer.getData('application/x-vfxemitter');
                    if (!data) return;
                    const emitterData = JSON.parse(data);
                    const { sourceType, sourceSystemKey, emitterName } = emitterData;
                    if (sourceSystemKey && emitterName && system.key !== sourceSystemKey) {
                        if (sourceType === 'donor') handlePortEmitter(sourceSystemKey, emitterName, undefined, system.key);
                        else handleMoveEmitter?.(sourceSystemKey, emitterName, system.key);
                    }
                } catch {
                    /* noop */
                }
            }}
            style={{
                cursor: isTarget ? 'pointer' : 'grab',
                outline: isPressed || isDragging ? '2px dashed var(--accent-primary)' : 'none',
                outlineOffset: isPressed || isDragging ? '2px' : '0px',
                userSelect: 'none',
                opacity: isPressed ? 0.8 : isDragging ? 0.7 : 1,
                transform: isPressed ? 'scale(0.98)' : isDragging ? 'scale(0.95)' : 'scale(1)',
                transition: 'all 0.1s ease-out',
            }}
        >
            <div
                className="particle-title-div"
                style={{
                    cursor: 'default',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'stretch',
                    minHeight: '42px',
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
                        borderRight: '1px solid var(--border)',
                        backgroundColor: 'color-mix(in oklab, var(--bg-hover) 30%, transparent)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'color-mix(in oklab, var(--bg-hover) 30%, transparent)')}
                    title={collapsedSystems.has(system.key) ? 'Expand' : 'Collapse'}
                >
                    <span style={{ fontSize: '14px', opacity: 0.9, color: 'var(--accent-primary)' }}>
                        {collapsedSystems.has(system.key) ? '▶' : '▼'}
                    </span>
                </div>

                <div
                    className={`flex-1 flex items-center ${isTarget && selectedTargetSystem === system.key ? 'selected' : ''}`}
                    style={{ padding: '0 12px', cursor: 'pointer', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in oklab, var(--bg-hover) 40%, transparent)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => {
                        if (isTarget) setSelectedTargetSystem(selectedTargetSystem === system.key ? null : system.key);
                    }}
                >
                    {!isTarget && (
                        <button
                            className="port-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePortAllEmitters?.(system.key);
                            }}
                            title="Port all emitters from this system to selected target system"
                            disabled={!selectedTargetSystem}
                            style={{
                                flexShrink: 0,
                                minWidth: '28px',
                                width: '28px',
                                height: '28px',
                                fontSize: '14px',
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '7px',
                                border: '1px solid color-mix(in oklab, var(--accent-secondary) 45%, transparent)',
                                background: 'color-mix(in oklab, var(--accent-secondary) 14%, transparent)',
                                color: 'var(--accent-secondary)',
                            }}
                        >
                            <KeyboardDoubleArrowLeftIcon sx={{ fontSize: 18, lineHeight: 1, opacity: 0.95 }} />
                        </button>
                    )}

                    {isTarget && renamingSystem && renamingSystem.systemKey === system.key ? (
                        <RenameInput
                            initialValue={system.particleName || system.name || system.key}
                            onConfirm={(newName) => {
                                if (newName && newName.trim() !== '' && newName !== (system.particleName || system.name || system.key)) handleRenameSystem?.(system.key, newName);
                                else setRenamingSystem?.(null);
                            }}
                            onCancel={() => setRenamingSystem?.(null)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <div
                            className="label ellipsis flex-1"
                            title={system.particleName || system.name}
                            style={{
                                color: 'var(--text-primary)',
                                fontWeight: 600,
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}
                        >
                            <span
                                onDoubleClick={(e) => {
                                    if (isTarget) {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setRenamingSystem?.({ systemKey: system.key, newName: system.particleName || system.name || system.key });
                                    }
                                }}
                                style={{ cursor: 'pointer', display: 'inline-block', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                                {(() => {
                                    const displayName = system.particleName || system.name || system.key;
                                    const shouldTrim = isTarget ? trimTargetNames : trimDonorNames;
                                    return shouldTrim ? getShortSystemName(displayName) : displayName;
                                })()}
                            </span>
                            {selectedTargetSystem === system.key && isTarget && <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>✓</span>}
                            <span
                                style={{
                                    marginLeft: 'auto',
                                    opacity: 1,
                                    fontSize: '12px',
                                    background: 'var(--bg-hover)',
                                    padding: '1px 7px',
                                    borderRadius: '12px',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border)',
                                    fontWeight: 600,
                                }}
                            >
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
            {!collapsedSystems.has(system.key) &&
                system.emitters.map((emitter, index) => (
                    <EmitterItem key={`${emitter.name}-${index}`} {...props} emitter={emitter} index={index} system={system} isTarget={isTarget} />
                ))}
        </div>
    );
}
