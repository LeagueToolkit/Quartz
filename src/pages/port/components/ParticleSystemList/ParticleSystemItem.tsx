import { useRef, useState } from 'react';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import { RenameInput } from '../common/Inputs';
import SystemActionsButton from '../SystemActionsButton';
import EmitterItem from './EmitterItem';
import { usePortDrag, usePortDropZone } from '../../usePortDrag';
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
        handlePortAllEmitters,
        handleRenameSystem,
        renamingSystem,
        setRenamingSystem,
        trimTargetNames,
        trimDonorNames,
        collapsedSystems,
        toggleSystemCollapse,
        hasResourceResolver,
        hasSkinCharacterData,
        actionsMenuAnchor,
        setActionsMenuAnchor,
        setShowMatrixModal,
        setMatrixModalState,
        handleAddIdleParticles,
        handleAddChildParticles,
        handleDeleteAllEmitters,
        dropEmitterOnSystem,
    } = props;

    const { startDrag, dragging } = usePortDrag();

    // Target rows are emitter-drop zones (a donor/target emitter dropped here
    // ports/moves into this system). Donor rows are drag sources instead.
    const rowRef = useRef<HTMLDivElement>(null);
    const [isEmitterDropOver, setIsEmitterDropOver] = useState(false);
    usePortDropZone(
        `target-system-${system.key}`,
        rowRef,
        (payload) => isTarget && payload.kind === 'emitter' && payload.sourceSystemKey !== system.key,
        (payload) => {
            if (payload.kind === 'emitter') dropEmitterOnSystem?.(payload, system.key);
        },
        setIsEmitterDropOver
    );

    const isPressed = pressedSystemKey === system.key && !isTarget;
    const isDragging = dragging?.kind === 'system' && dragging.systemKey === system.key && !isTarget;
    const particleNameForUi =
        system && typeof system.particleName === 'string' && system.particleName.trim() ? system.particleName : system.name;

    return (
        <div
            key={system.key}
            ref={rowRef}
            title={!isTarget ? 'Drag into Target to add full system' : undefined}
            onPointerDown={(e) => {
                if (isTarget) return;
                // The row (including its title header) is the drag handle. Only
                // bail on genuinely interactive controls — buttons, the collapse
                // chevron, and the rename input — so grabbing the name still drags.
                const tgt = e.target as HTMLElement;
                if (tgt.closest('button') || tgt.closest('.port-btn') || tgt.closest('input') || tgt.closest('[data-no-drag]')) return;
                setPressedSystemKey?.(system.key);
                startDrag({ kind: 'system', systemKey: system.key, label: particleNameForUi }, e);
            }}
            onMouseUp={() => {
                if (isTarget) return;
                if (!isDragging) setPressedSystemKey?.(null);
            }}
            className={`particle-div ${isTarget && selectedTargetSystem === system.key ? 'selected-system' : ''}${isEmitterDropOver ? ' port-drop-active' : ''}`}
            onClick={(e) => {
                if (isTarget) {
                    const clickedOnHeader = (e.target as HTMLElement).closest('.particle-title-div');
                    if (clickedOnHeader) setSelectedTargetSystem(selectedTargetSystem === system.key ? null : system.key);
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
                    data-no-drag
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
                            {system.childParents.length > 0 && (
                                <span
                                    className="port-relation-badge port-relation-badge--child"
                                    data-relation-tooltip={`Parent: ${system.childParents.map((parent) => `${parent.system} / ${parent.emitter}`).join(', ')}`}
                                    title={`Child VFX of ${system.childParents.map((parent) => `${parent.system} / ${parent.emitter}`).join(', ')}`}
                                >
                                    CHILD
                                </span>
                            )}
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
