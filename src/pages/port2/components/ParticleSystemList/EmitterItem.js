import React from 'react';
import { RenameInput } from '../common/Inputs';
import { isDivineLabChildParticle } from '../../../../utils/vfx/mutations/childParticlesManager';
import CropOriginalIcon from '@mui/icons-material/CropOriginal';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';

const EmitterItem = ({
    emitter,
    index,
    system,
    isTarget,
    renamingEmitter,
    setRenamingEmitter,
    handleRenameEmitter,
    handlePortEmitter,
    draggedEmitter,
    setDraggedEmitter,
    selectedTargetSystem,
    setStatusMessage,
    handleDeleteEmitter,
    handleEditChildParticle,
    handleEmitterMouseEnter,
    handleEmitterMouseLeave,
    handleEmitterClick,
    handleEmitterContextMenu
}) => {
    const isQuartzChild = isDivineLabChildParticle(emitter.name);

    return (
        <div
            className="emitter-div"
            draggable={!isTarget}
            onDragStart={(e) => {
                if (isTarget) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                if (typeof setDraggedEmitter === 'function') {
                    setDraggedEmitter({ sourceSystemKey: system.key, emitterName: emitter.name });
                }
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/x-vfxemitter', JSON.stringify({
                    sourceType: 'donor',
                    sourceSystemKey: system.key,
                    emitterName: emitter.name
                }));
                // Create a drag image
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
            }}
            onDragEnd={() => {
                if (isTarget) return;
                if (typeof setDraggedEmitter === 'function') {
                    setDraggedEmitter(null);
                }
            }}
            style={{
                border: isQuartzChild ? '2px solid #3b82f6' : undefined,
                borderRadius: isQuartzChild ? '6px' : undefined,
                background: isQuartzChild ? 'rgba(59, 130, 246, 0.05)' : undefined,
                cursor: isTarget ? 'default' : 'grab',
                opacity: draggedEmitter && draggedEmitter.sourceSystemKey === system.key && draggedEmitter.emitterName === emitter.name ? 0.5 : 1
            }}
        >
            {!isTarget && (
                <button
                    className="port-btn"
                    onClick={() => {
                        if (!selectedTargetSystem) {
                            setStatusMessage('Please select a target system first');
                            return;
                        }
                        handlePortEmitter(system.key, emitter.name);
                    }}
                    title="Port emitter to selected target system"
                    style={{ flexShrink: 0, minWidth: '24px' }}
                >
                    <KeyboardArrowLeftIcon sx={{ fontSize: 18, lineHeight: 1 }} />
                </button>
            )}
            {isTarget && renamingEmitter && renamingEmitter.systemKey === system.key && renamingEmitter.emitterName === emitter.name ? (
                <RenameInput
                    initialValue={emitter.name}
                    onConfirm={(newName) => {
                        if (newName && newName.trim() !== '' && newName !== emitter.name) {
                            handleRenameEmitter(system.key, emitter.name, newName);
                        } else {
                            setRenamingEmitter(null);
                        }
                    }}
                    onCancel={() => setRenamingEmitter(null)}
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <div
                    className="label flex-1 ellipsis"
                    style={{
                        minWidth: 0,
                        color: 'var(--accent)',
                        fontWeight: '600',
                        fontSize: '0.95rem',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                    }}
                >
                    <span
                        onClick={(e) => {
                            if (isTarget && !isQuartzChild) {
                                e.stopPropagation();
                            }
                        }}
                        onDoubleClick={(e) => {
                            if (isTarget && !isQuartzChild) {
                                e.stopPropagation();
                                e.preventDefault();
                                setRenamingEmitter({ systemKey: system.key, emitterName: emitter.name, newName: emitter.name });
                            }
                        }}
                        style={{
                            cursor: isTarget && !isQuartzChild ? 'text' : 'default',
                            display: 'inline-block'
                        }}
                    >
                        {emitter.name || `Emitter ${index + 1}`}
                    </span>
                    {emitter.isChildParticle && (
                        <span
                            style={{
                                marginLeft: '6px',
                                fontSize: '10px',
                                background: 'rgba(255, 193, 7, 0.2)',
                                color: '#ffc107',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                border: '1px solid rgba(255, 193, 7, 0.3)',
                                fontWeight: 'bold'
                            }}
                            title={`Child particle referencing: ${emitter.childSystemKey}`}
                        >
                            CHILD
                        </span>
                    )}
                </div>
            )}

            {emitter.color && (
                <div
                    className="color-block"
                    style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '3px',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        marginLeft: '6px',
                        flexShrink: 0,
                        background: emitter.color.constantValue || '#ffffff'
                    }}
                    title={`Color: ${emitter.color.constantValue || 'Unknown'}`}
                />
            )}

            {/* Edit button for Quartz-created child particles */}
            {isQuartzChild && isTarget && (
                <button
                    className="edit-child-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleEditChildParticle(system.key, system.name, emitter.name);
                    }}
                    title="Edit child particle"
                    style={{
                        width: '24px',
                        height: '24px',
                        marginLeft: '6px',
                        flexShrink: 0,
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        color: '#3b82f6',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px'
                    }}
                >
                    ✏️
                </button>
            )}

            {/* Preview button */}
            <button
                className="preview-btn"
                style={{
                    width: '24px',
                    height: '24px',
                    marginLeft: '6px',
                    flexShrink: 0,
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '4px',
                    color: 'var(--accent, #3b82f6)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px'
                }}
                title="Preview texture"
                onMouseEnter={(e) => handleEmitterMouseEnter(e, emitter, system, isTarget)}
                onMouseLeave={handleEmitterMouseLeave}
                onContextMenu={(e) => handleEmitterContextMenu(e, emitter, system, isTarget)}
                onClick={(e) => handleEmitterClick(e, emitter, system, isTarget)}
            >
                <CropOriginalIcon sx={{ fontSize: 16 }} />
            </button>

            {isTarget && (
                <button
                    className="delete-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEmitter(system.key, index, isTarget, emitter.name);
                    }}
                    title="Delete emitter"
                    style={{
                        flexShrink: 0,
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '25px',
                        padding: '2px 4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1
                    }}
                >
                    🗑
                </button>
            )}
        </div>
    );
};

export default EmitterItem;

