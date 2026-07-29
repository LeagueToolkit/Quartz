import CropOriginalIcon from '@mui/icons-material/CropOriginal';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { RenameInput } from '../common/Inputs';
import { usePortDrag } from '../../usePortDrag';
import { isDivineLabChildParticle, type VfxEmitter, type VfxSystem } from '../../model';
import type { ListSharedProps } from './types';

interface EmitterItemProps extends ListSharedProps {
    emitter: VfxEmitter;
    index: number;
    system: VfxSystem;
    isTarget: boolean;
}

export default function EmitterItem({
    emitter,
    index,
    system,
    isTarget,
    renamingEmitter,
    setRenamingEmitter,
    handleRenameEmitter,
    handlePortEmitter,
    selectedTargetSystem,
    setStatusMessage,
    handleDeleteEmitter,
    handleEditChildParticle,
    handleEmitterMouseEnter,
    handleEmitterMouseLeave,
    handleEmitterClick,
    handleEmitterContextMenu,
}: EmitterItemProps) {
    const isQuartzChild = isDivineLabChildParticle(emitter.name);
    const { startDrag, dragging } = usePortDrag();
    const isThisDragging =
        dragging?.kind === 'emitter' && dragging.sourceSystemKey === system.key && dragging.emitterName === emitter.name;

    return (
        <div
            className="emitter-div"
            onPointerDown={(e) => {
                if (isTarget) return;
                // Don't start a drag from the row's action buttons.
                const tgt = e.target as HTMLElement;
                if (tgt.closest('button')) return;
                // CRITICAL: stop the event before it bubbles to the parent
                // system row's onPointerDown, which would overwrite this
                // emitter drag with a whole-system drag (both call startDrag,
                // last write wins). Without this, dragging a single emitter
                // silently ports the entire system instead.
                e.stopPropagation();
                startDrag(
                    {
                        kind: 'emitter',
                        sourceType: 'donor',
                        sourceSystemKey: system.key,
                        emitterName: emitter.name,
                        label: emitter.name || 'emitter',
                    },
                    e
                );
            }}
            style={{
                border: isQuartzChild ? '2px solid var(--accent-primary)' : undefined,
                borderRadius: isQuartzChild ? '6px' : undefined,
                background: isQuartzChild ? 'color-mix(in oklab, var(--accent-primary) 8%, transparent)' : undefined,
                cursor: isTarget ? 'default' : 'grab',
                opacity: isThisDragging ? 0.5 : 1,
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
                    style={{
                        flexShrink: 0,
                        minWidth: '24px',
                        color: 'var(--accent-secondary)',
                        borderColor: 'color-mix(in oklab, var(--accent-secondary) 45%, transparent)',
                        background: 'color-mix(in oklab, var(--accent-secondary) 14%, transparent)',
                    }}
                >
                    <KeyboardArrowLeftIcon sx={{ fontSize: 18, lineHeight: 1 }} />
                </button>
            )}
            {isTarget && renamingEmitter && renamingEmitter.systemKey === system.key && renamingEmitter.emitterName === emitter.name ? (
                <RenameInput
                    initialValue={emitter.name}
                    onConfirm={(newName) => {
                        if (newName && newName.trim() !== '' && newName !== emitter.name) handleRenameEmitter?.(system.key, emitter.name, newName);
                        else setRenamingEmitter?.(null);
                    }}
                    onCancel={() => setRenamingEmitter?.(null)}
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <div
                    className="label flex-1 ellipsis"
                    style={{
                        minWidth: 0,
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        fontSize: '0.95rem',
                    }}
                >
                    <span
                        onClick={(e) => {
                            if (isTarget && !isQuartzChild) e.stopPropagation();
                        }}
                        onDoubleClick={(e) => {
                            if (isTarget && !isQuartzChild) {
                                e.stopPropagation();
                                e.preventDefault();
                                setRenamingEmitter?.({ systemKey: system.key, emitterName: emitter.name, newName: emitter.name });
                            }
                        }}
                        style={{ cursor: isTarget && !isQuartzChild ? 'text' : 'default', display: 'inline-block' }}
                    >
                        {emitter.name || `Emitter ${index + 1}`}
                    </span>
                    {emitter.isChildParticle && (
                        <span
                            className="port-relation-badge port-relation-badge--parent"
                            data-relation-tooltip={`Child VFX: ${emitter.childSystemName || emitter.childSystemKey || 'Unknown'}`}
                            title={`Child VFX: ${emitter.childSystemName || emitter.childSystemKey || 'Unknown'}`}
                        >
                            PARENT
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
                        border: '1px solid var(--border-strong)',
                        marginLeft: '6px',
                        flexShrink: 0,
                        /* user-chosen particle color — keep literal value */
                        background: emitter.color.constantValue || '#ffffff',
                    }}
                    title={`Color: ${emitter.color.constantValue || 'Unknown'}`}
                />
            )}

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
                        background: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)',
                        border: '1px solid var(--accent-primary)',
                        borderRadius: '4px',
                        color: 'var(--accent-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                    }}
                >
                    ✏️
                </button>
            )}

            <button
                className="preview-btn"
                style={{
                    width: '24px',
                    height: '24px',
                    marginLeft: '6px',
                    flexShrink: 0,
                    background: 'transparent',
                    border: '1px solid var(--border-strong)',
                    borderRadius: '4px',
                    color: isTarget ? 'var(--accent-primary)' : 'var(--accent-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                }}
                title="Preview textures and models"
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
                        handleDeleteEmitter?.(system.key, index, isTarget, emitter.name);
                    }}
                    title="Delete emitter"
                    style={{
                        flexShrink: 0,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-danger)',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                    }}
                >
                    <DeleteOutlineIcon sx={{ fontSize: 22 }} />
                </button>
            )}
        </div>
    );
}
