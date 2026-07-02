import type React from 'react';
import type { VfxSystem, VfxEmitter } from '../../model';

export interface ListSharedProps {
    selectedTargetSystem: string | null;
    setSelectedTargetSystem: (k: string | null) => void;
    collapsedSystems: Set<string>;
    toggleSystemCollapse: (key: string) => void;
    handlePortEmitter: (donorSystemKey: string, emitterName: string, hasResolver?: boolean, targetSystemKeyOverride?: string | null) => void;
    setStatusMessage: (m: string) => void;
    trimTargetNames?: boolean;
    trimDonorNames?: boolean;
    targetPath: string;
    donorPath: string;
    handleEditChildParticle: (systemKey: string, systemName: string, emitterName: string) => void;
    handleEmitterMouseEnter: (e: React.MouseEvent, emitter: VfxEmitter, system: VfxSystem, isTarget: boolean) => void;
    handleEmitterMouseLeave: (e: React.MouseEvent) => void;
    handleEmitterClick: (e: React.MouseEvent, emitter: VfxEmitter, system: VfxSystem, isTarget: boolean) => void;
    handleEmitterContextMenu: (e: React.MouseEvent, emitter: VfxEmitter, system: VfxSystem, isTarget: boolean) => void;
    processVfxSystemDrop?: (e: React.DragEvent, source: string) => void;

    // target-only
    renamingSystem?: { systemKey: string; newName: string } | null;
    setRenamingSystem?: (v: { systemKey: string; newName: string } | null) => void;
    handleRenameSystem?: (systemKey: string, newName: string) => void;
    handleDeleteEmitter?: (systemKey: string, index: number, isTarget: boolean, emitterName?: string | null) => void;
    handleMoveEmitter?: (sourceSystemKey: string, emitterName: string, targetSystemKey: string) => void;
    handleRenameEmitter?: (systemKey: string, oldName: string, newName: string) => void;
    renamingEmitter?: { systemKey: string; emitterName: string; newName: string } | null;
    setRenamingEmitter?: (v: { systemKey: string; emitterName: string; newName: string } | null) => void;
    handleDeleteAllEmitters?: (systemKey: string) => void;
    hasResourceResolver?: boolean;
    hasSkinCharacterData?: boolean;
    actionsMenuAnchor?: { element: HTMLElement; systemKey: string } | null;
    setActionsMenuAnchor?: (v: { element: HTMLElement; systemKey: string } | null) => void;
    setShowMatrixModal?: (v: boolean) => void;
    setMatrixModalState?: (v: { systemKey: string; initial: number[] }) => void;
    handleAddIdleParticles?: (systemKey: string, systemName: string) => void;
    handleAddChildParticles?: (systemKey: string, systemName: string) => void;

    // donor-only
    pressedSystemKey?: string | null;
    setPressedSystemKey?: (k: string | null) => void;
    dragStartedKey?: string | null;
    dragStartedKeyRef?: React.MutableRefObject<string | null>;
    setDragStartedKey?: (k: string | null) => void;
    handlePortAllEmitters?: (donorSystemKey: string) => void;
    draggedEmitter?: { sourceSystemKey: string; emitterName: string } | null;
    setDraggedEmitter?: (v: { sourceSystemKey: string; emitterName: string } | null) => void;
}
