import { useCallback, useMemo, useState } from 'react';
import './port/Port.css';
import usePort from './port/usePort';
import { parseVfxEmitters, type VfxEmitter, type VfxSystem, type VfxSystemMap } from './port/utils/vfxEmitterParser';
import { insertVFXSystemIntoFile, insertVFXSystemWithPreservedNames } from './port/utils/vfxInsertSystem';
import { findAssetFiles } from './port/utils/assetCopier';
import {
    handleEmitterTextureMouseEnter,
    handleEmitterTextureMouseLeave,
    handleEmitterTextureContextMenu,
    closeTextureHoverPreview,
} from './port/utils/textureHoverPreview';
import { getLeaguePath } from '@/lib/api/league';
import { portPrepareDonorFromSkin, portCopyAssetsToTarget, backupCreate } from '@/lib/api/wad';
import GlowingSpinner from './port/components/GlowingSpinner';
import TargetColumn from './port/components/TargetColumn';
import DonorColumn from './port/components/DonorColumn';
import PortStatusBar from './port/components/PortStatusBar';
import PortBottomControls from './port/components/PortBottomControls';
import VfxFloatingActions from './port/components/VfxFloatingActions';
import NewVfxSystemModal from './port/components/modals/NewVfxSystemModal';
import VfxSystemNamePromptModal from './port/components/modals/VfxSystemNamePromptModal';
import PortAllModeModal from './port/components/modals/PortAllModeModal';
import MatrixEditorModal from './port/components/modals/MatrixEditorModal';
import IdleParticleModal from './port/components/modals/IdleParticleModal';
import IdleParticlesManagerModal from './port/components/modals/IdleParticlesManagerModal';
import ChildParticleModal from './port/components/modals/ChildParticleModal';
import PersistentEffectsModal from './port/components/modals/PersistentEffectsModal';
import PortDonorFromGameModal from './port/components/modals/PortDonorFromGameModal';
import BackupViewerModal from './port/components/modals/BackupViewerModal';

function Port() {
    const p = usePort();

    const [showPortAllModeModal, setShowPortAllModeModal] = useState(false);
    const [showIdleManagerModal, setShowIdleManagerModal] = useState(false);
    const [showPortDonorModal, setShowPortDonorModal] = useState(false);
    const [isPreparingPortDonor, setIsPreparingPortDonor] = useState(false);
    const [portDonorProgress, setPortDonorProgress] = useState('');
    const [showBackupViewer, setShowBackupViewer] = useState(false);
    const [donorTempRoot, setDonorTempRoot] = useState<string | null>(null);

    const sectionStyle = useMemo<React.CSSProperties>(() => ({ background: 'transparent', border: '1px solid var(--border)', borderRadius: '5px' }), []);

    // Debounced filter inputs mirroring the original filterTargetParticles/filterDonorParticles.
    const filterTargetParticles = useCallback((v: string) => p.setTargetFilter(v), [p]);
    const filterDonorParticles = useCallback((v: string) => p.setDonorFilter(v), [p]);

    // Texture hover preview: resolve the emitter's texture to a disk file under
    // the bin's mod tree, decode it via the imgrecolor backend, and float a
    // thumbnail. Right-click opens a context menu (reveal / open in ImgRecolor).
    const binPathFor = useCallback((isTarget: boolean) => (isTarget ? p.targetPath : p.donorPath), [p.targetPath, p.donorPath]);
    const handleEmitterMouseEnter = useCallback(
        (e: React.MouseEvent, emitter: VfxEmitter, _system: VfxSystem, isTarget: boolean) => {
            handleEmitterTextureMouseEnter(e, emitter, binPathFor(isTarget));
        },
        [binPathFor]
    );
    const handleEmitterMouseLeave = useCallback(() => handleEmitterTextureMouseLeave(), []);
    const handleEmitterClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        closeTextureHoverPreview();
    }, []);
    const handleEmitterContextMenu = useCallback(
        (e: React.MouseEvent, emitter: VfxEmitter, _system: VfxSystem, isTarget: boolean) => {
            handleEmitterTextureContextMenu(e, emitter, binPathFor(isTarget));
        },
        [binPathFor]
    );

    const handleOpenDonorFromGame = useCallback(() => {
        setPortDonorProgress('');
        setShowPortDonorModal(true);
    }, []);

    const handleConfirmDonorFromGame = useCallback(
        async (args: { champion: { id: string; name: string }; skin: { id: number; name: string }; portingPrefix: string }) => {
            try {
                setIsPreparingPortDonor(true);
                setPortDonorProgress('Locating League install...');
                const leaguePath = await getLeaguePath();
                if (!leaguePath) {
                    setPortDonorProgress('League install not found. Set the League path in Settings.');
                    p.setStatusMessage('Load donor from game: League install not found');
                    return;
                }

                setPortDonorProgress(`Extracting ${args.champion.name} skin ${args.skin.id} from the game WAD...`);
                const result = await portPrepareDonorFromSkin({
                    championName: args.champion.name,
                    skinId: args.skin.id,
                    leaguePath,
                    portingPrefix: args.portingPrefix,
                });

                if (!result.donorPyContent) {
                    setPortDonorProgress('No donor content was produced.');
                    p.setStatusMessage('Load donor from game produced no content');
                    return;
                }

                const systems = parseVfxEmitters(result.donorPyContent) || {};
                p.setDonorPyContent(result.donorPyContent);
                p.setDonorSystems(systems);
                p.setDonorPath(`${result.championFileName} skin${result.skinId} (from game)`);
                setDonorTempRoot(result.tempRoot);
                setPortDonorProgress('Donor is ready.');
                p.setStatusMessage(`Loaded donor from game: ${Object.keys(systems).length} VFX systems`);
                setShowPortDonorModal(false);
            } catch (error) {
                const msg = (error as Error)?.message || String(error);
                setPortDonorProgress(`Failed: ${msg}`);
                p.setStatusMessage(`Load donor from game failed: ${msg}`);
            } finally {
                setIsPreparingPortDonor(false);
            }
        },
        [p]
    );

    const handleInsertDroppedVfxSystem = () => {
        try {
            const chosen = (p.namePromptValue || p.pendingDrop?.defaultName || 'NewVFXSystem').trim();
            if (!chosen) {
                p.setStatusMessage('Enter a system name');
                return;
            }
            if (!p.pendingDrop) return;
            if (!p.hasResourceResolver) {
                p.setStatusMessage('Locked: target bin missing ResourceResolver');
                return;
            }

            p.saveStateToHistory(`Add VFX system "${chosen}"`);

            const { fullContent, defaultName } = p.pendingDrop;
            const prevKeys = new Set(Object.keys(p.targetSystems || {}));

            const isPreservationMode = chosen === defaultName;
            let updatedPy: string;
            if (isPreservationMode) updatedPy = insertVFXSystemWithPreservedNames(p.targetPyContent || '', fullContent, chosen, p.donorPyContent);
            else updatedPy = insertVFXSystemIntoFile(p.targetPyContent || '', fullContent, chosen);

            p.setTargetPyContent(updatedPy);
            p.setFileSaved(false);
            const systems = parseVfxEmitters(updatedPy);
            const nowTs = Date.now();

            const systemsWithDeletedEmitters: VfxSystemMap = Object.fromEntries(
                Object.entries(systems).map(([key, sys]) => {
                    if (sys.emitters) {
                        const filteredEmitters = sys.emitters.filter((emitter) => !p.deletedEmitters.has(`${key}:${emitter.name}`));
                        return [key, { ...sys, emitters: filteredEmitters }];
                    }
                    return [key, sys];
                })
            );

            const entries = Object.entries(systemsWithDeletedEmitters).map(([key, sys]): [string, VfxSystem] =>
                !prevKeys.has(key) ? [key, { ...sys, ported: true, portedAt: nowTs }] : [key, sys]
            );
            const newEntries = entries.filter(([key]) => !prevKeys.has(key));
            const oldEntries = entries.filter(([key]) => prevKeys.has(key));
            const ordered = Object.fromEntries([...newEntries, ...oldEntries]);
            p.setTargetSystems(ordered);

            const modeText = isPreservationMode ? 'with preserved ResourceResolver names' : 'with updated names';
            p.setStatusMessage(`Added VFX system "${chosen}" to target ${modeText}`);
        } catch {
            p.setStatusMessage('Failed to add VFX system');
        } finally {
            p.setShowNamePromptModal(false);
            p.setPendingDrop(null);
        }
    };

    const isVfxSystemDrag = (event: React.DragEvent) => {
        const types = event?.dataTransfer?.types;
        if (!types) return false;
        return Array.from(types).includes('application/x-vfxsys');
    };

    const processVfxSystemDrop = (event: React.DragEvent) => {
        try {
            event.preventDefault();
            event.stopPropagation();

            const data = event.dataTransfer.getData('application/x-vfxsys');
            if (!data) return;

            p.setIsDragOverVfx(false);
            p.dragEnterCounter.current = 0;

            if (!p.targetPyContent) {
                p.setStatusMessage('No target file loaded - please open a target bin first');
                return;
            }
            if (!p.hasResourceResolver) {
                p.setStatusMessage('Locked: target bin missing ResourceResolver');
                return;
            }

            const payload = JSON.parse(data);
            const { name, fullContent } = payload || {};
            if (!fullContent) {
                p.setStatusMessage('Dropped item has no VFX content');
                return;
            }

            const defaultName = name && typeof name === 'string' ? name : 'NewVFXSystem';
            p.setPendingDrop({ fullContent, defaultName });
            p.setNamePromptValue(defaultName);
            p.setShowNamePromptModal(true);

            requestAnimationFrame(() => {
                if (!p.targetListRef.current) return;
                try {
                    p.targetListRef.current.scrollTop = 0;
                } catch {
                    /* noop */
                }
            });

            // Copy the dropped system's referenced assets into the target mod
            // tree so its textures/meshes ship beside the bin. The donor temp
            // root (when the donor came from the game) and the donor bin's own
            // folder are the candidate sources.
            const assetPaths = findAssetFiles(fullContent);
            if (assetPaths.length > 0 && p.targetPath && p.targetPath.includes('.')) {
                const sourceDirs = new Set<string>();
                if (donorTempRoot) sourceDirs.add(`${donorTempRoot}/combined`);
                const donorDir = p.donorPath && p.donorPath.includes('.') ? p.donorPath.replace(/[/\\][^/\\]*$/, '') : '';
                if (donorDir) sourceDirs.add(donorDir);
                if (sourceDirs.size > 0) {
                    void portCopyAssetsToTarget({
                        assetPaths,
                        sourceDirs: Array.from(sourceDirs),
                        targetBinPath: p.targetPath,
                    })
                        .then((res) => {
                            if (res.copied > 0) p.setStatusMessage(`Copied ${res.copied} asset file(s) into the target mod`);
                        })
                        .catch(() => {});
                }
            }
        } catch {
            p.setStatusMessage('Failed to add VFX system');
        }
    };

    const handleTargetDropDragOver = (event: React.DragEvent) => {
        if (!isVfxSystemDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        if (!p.isDragOverVfx) p.setIsDragOverVfx(true);
    };

    const handleTargetDropDragEnter = (event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isVfxSystemDrag(event)) return;
        p.dragEnterCounter.current += 1;
        if (!p.isDragOverVfx) p.setIsDragOverVfx(true);
    };

    const handleTargetDropDragLeave = (event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        p.dragEnterCounter.current -= 1;
        if (p.dragEnterCounter.current <= 0) {
            p.setIsDragOverVfx(false);
            p.dragEnterCounter.current = 0;
        }
    };

    const handleOpenIdleManager = useCallback(() => {
        if (!p.targetPyContent) {
            p.setStatusMessage('No target file loaded');
            return;
        }
        if (!p.hasResourceResolver || !p.hasSkinCharacterData) {
            p.setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
            return;
        }
        setShowIdleManagerModal(true);
    }, [p]);

    const handleSelectPortAllMode = useCallback(
        (mode: 'normal' | 'replace-target') => {
            setShowPortAllModeModal(false);
            p.handlePortAllSystems(p.hasResourceResolver, mode);
        },
        [p]
    );

    const handleOpenBackupViewer = useCallback(() => {
        if (!p.targetPath || !p.targetPath.includes('.')) {
            p.setStatusMessage('No target file loaded');
            return;
        }
        setShowBackupViewer(true);
    }, [p]);

    // Save wrapper: snapshot the current target into zbackups before writing,
    // matching the original's create-on-save backups.
    const handleSaveWithBackup = useCallback(async () => {
        try {
            if (p.targetPath && p.targetPath.includes('.') && p.targetPyContent) {
                await backupCreate(p.targetPath, p.targetPyContent, 'port').catch(() => {});
            }
        } finally {
            await p.handleSave();
        }
    }, [p]);

    const sharedListProps = {
        selectedTargetSystem: p.selectedTargetSystem,
        setSelectedTargetSystem: p.setSelectedTargetSystem,
        handlePortEmitter: p.handlePortEmitter,
        setStatusMessage: p.setStatusMessage,
        targetPath: p.targetPath,
        donorPath: p.donorPath,
        handleEditChildParticle: p.handleEditChildParticle,
        handleEmitterMouseEnter,
        handleEmitterMouseLeave,
        handleEmitterClick,
        handleEmitterContextMenu,
    };

    const targetColumnProps = {
        ...sharedListProps,
        isProcessing: p.isProcessing,
        handleOpenTargetBin: p.handleOpenTargetBin,
        processTargetBin: p.processTargetBin,
        targetFilterInput: p.targetFilter,
        enableTargetEmitterSearch: p.enableTargetEmitterSearch,
        filterTargetParticles,
        setEnableTargetEmitterSearch: p.setEnableTargetEmitterSearch,
        sectionStyle,
        isDragOverVfx: p.isDragOverVfx,
        handleTargetDropDragOver,
        handleTargetDropDragEnter,
        handleTargetDropDragLeave,
        processVfxSystemDrop,
        targetSystems: p.targetSystems,
        targetListRef: p.targetListRef,
        filteredTargetSystems: p.filteredTargetSystems,
        collapsedSystems: p.collapsedTargetSystems,
        toggleSystemCollapse: p.handleToggleTargetCollapse,
        renamingSystem: p.renamingSystem,
        setRenamingSystem: p.setRenamingSystem,
        handleRenameSystem: p.handleRenameSystem,
        handleDeleteEmitter: p.handleDeleteEmitter,
        handleMoveEmitter: p.handleMoveEmitter,
        handleRenameEmitter: p.handleRenameEmitter,
        renamingEmitter: p.renamingEmitter,
        setRenamingEmitter: p.setRenamingEmitter,
        handleDeleteAllEmitters: p.handleDeleteAllEmitters,
        hasResourceResolver: p.hasResourceResolver,
        hasSkinCharacterData: p.hasSkinCharacterData,
        actionsMenuAnchor: p.actionsMenuAnchor,
        setActionsMenuAnchor: p.setActionsMenuAnchor,
        setShowMatrixModal: p.setShowMatrixModal,
        setMatrixModalState: p.setMatrixModalState,
        handleAddIdleParticles: p.handleAddIdleParticles,
        handleAddChildParticles: p.handleAddChildParticles,
        trimTargetNames: p.trimTargetNames,
    };

    const donorColumnProps = {
        ...sharedListProps,
        isProcessing: p.isProcessing,
        handleOpenDonorBin: p.handleOpenDonorBin,
        processDonorBin: p.processDonorBin,
        handleOpenDonorFromGame,
        donorFilterInput: p.donorFilter,
        enableDonorEmitterSearch: p.enableDonorEmitterSearch,
        filterDonorParticles,
        setEnableDonorEmitterSearch: p.setEnableDonorEmitterSearch,
        sectionStyle,
        donorSystems: p.donorSystems,
        donorListRef: p.donorListRef,
        filteredDonorSystems: p.filteredDonorSystems,
        collapsedSystems: p.collapsedDonorSystems,
        toggleSystemCollapse: p.handleToggleDonorCollapse,
        pressedSystemKey: p.pressedSystemKey,
        setPressedSystemKey: p.setPressedSystemKey,
        dragStartedKey: p.dragStartedKey,
        setDragStartedKey: p.setDragStartedKey,
        donorPyContent: p.donorPyContent,
        handlePortAllEmitters: p.handlePortAllEmitters,
        draggedEmitter: p.draggedEmitter,
        setDraggedEmitter: p.setDraggedEmitter,
        trimDonorNames: p.trimDonorNames,
    };

    return (
        <div
            className="port-container"
            style={{ minHeight: '100%', height: '100%', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
            {p.isProcessing && <GlowingSpinner text={p.processingText || 'Working...'} />}

            <div className="port-main-content" style={{ display: 'flex', flex: 1, gap: '20px', padding: '12px', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
                <TargetColumn {...targetColumnProps} />
                <DonorColumn {...donorColumnProps} />
            </div>

            <PortDonorFromGameModal
                open={showPortDonorModal}
                loading={isPreparingPortDonor}
                progressText={portDonorProgress}
                onClose={() => {
                    if (!isPreparingPortDonor) setShowPortDonorModal(false);
                }}
                onConfirm={handleConfirmDonorFromGame}
            />

            <BackupViewerModal
                open={showBackupViewer}
                filePath={p.targetPath}
                component="port"
                onClose={(restored) => {
                    setShowBackupViewer(false);
                    if (restored) {
                        p.setTargetPyContent(restored.content);
                        p.setTargetSystems(parseVfxEmitters(restored.content) || {});
                        p.setStatusMessage('Restored target from backup');
                    }
                }}
            />

            <PersistentEffectsModal
                showPersistentModal={p.showPersistentModal}
                setShowPersistentModal={p.setShowPersistentModal}
                persistentPreset={p.persistentPreset}
                setPersistentPreset={p.setPersistentPreset}
                typeOptions={p.typeOptions}
                typeDropdownOpen={p.typeDropdownOpen}
                setTypeDropdownOpen={p.setTypeDropdownOpen}
                typeDropdownRef={p.typeDropdownRef}
                persistentShowSubmeshes={p.persistentShowSubmeshes}
                setPersistentShowSubmeshes={p.setPersistentShowSubmeshes}
                persistentHideSubmeshes={p.persistentHideSubmeshes}
                setPersistentHideSubmeshes={p.setPersistentHideSubmeshes}
                availableSubmeshes={p.availableSubmeshes}
                customShowSubmeshInput={p.customShowSubmeshInput}
                setCustomShowSubmeshInput={p.setCustomShowSubmeshInput}
                handleAddCustomShowSubmesh={p.handleAddCustomShowSubmesh}
                customHideSubmeshInput={p.customHideSubmeshInput}
                setCustomHideSubmeshInput={p.setCustomHideSubmeshInput}
                handleAddCustomHideSubmesh={p.handleAddCustomHideSubmesh}
                handleRemoveCustomSubmesh={p.handleRemoveCustomSubmesh}
                persistentVfx={p.persistentVfx}
                setPersistentVfx={p.setPersistentVfx}
                effectKeyOptions={p.effectKeyOptions}
                vfxSearchTerms={p.vfxSearchTerms}
                setVfxSearchTerms={p.setVfxSearchTerms}
                vfxDropdownOpen={p.vfxDropdownOpen}
                setVfxDropdownOpen={p.setVfxDropdownOpen}
                existingConditions={p.existingConditions}
                showExistingConditions={p.showExistingConditions}
                setShowExistingConditions={p.setShowExistingConditions}
                handleLoadExistingCondition={p.handleLoadExistingCondition}
                editingConditionIndex={p.editingConditionIndex}
                handleApplyPersistent={p.handleApplyPersistent}
            />

            <MatrixEditorModal open={p.showMatrixModal} initialMatrix={p.matrixModalState.initial} onApply={p.applyMatrix} onClose={() => p.setShowMatrixModal(false)} />

            <NewVfxSystemModal
                open={p.showNewSystemModal}
                onClose={() => p.setShowNewSystemModal(false)}
                newSystemName={p.newSystemName}
                setNewSystemName={p.setNewSystemName}
                onCreate={() => p.handleCreateNewSystem(p.newSystemName, p.setShowNewSystemModal)}
            />

            <VfxSystemNamePromptModal
                open={p.showNamePromptModal}
                value={p.namePromptValue}
                onChange={p.setNamePromptValue}
                onClose={() => {
                    p.setShowNamePromptModal(false);
                    p.setPendingDrop(null);
                }}
                onInsert={handleInsertDroppedVfxSystem}
            />

            <IdleParticleModal
                showIdleParticleModal={p.showIdleParticleModal}
                setShowIdleParticleModal={p.setShowIdleParticleModal}
                selectedSystemForIdle={p.selectedSystemForIdle}
                setSelectedSystemForIdle={p.setSelectedSystemForIdle}
                isEditingIdle={p.isEditingIdle}
                setIsEditingIdle={p.setIsEditingIdle}
                idleBonesList={p.idleBonesList}
                setIdleBonesList={p.setIdleBonesList}
                existingIdleBones={p.existingIdleBones}
                setExistingIdleBones={p.setExistingIdleBones}
                handleConfirmIdleParticles={p.handleConfirmIdleParticles}
            />

            <IdleParticlesManagerModal
                open={showIdleManagerModal}
                onClose={() => setShowIdleManagerModal(false)}
                targetSystems={p.targetSystems}
                targetPyContent={p.targetPyContent}
                onUpsertSystem={p.handleUpsertIdleParticlesForSystem}
                onRemoveEffectKey={p.handleRemoveIdleParticlesByEffectKey}
            />

            <ChildParticleModal
                open={p.showChildModal}
                onClose={p.resetChildState}
                isEdit={p.isEditMode}
                targetSystem={p.selectedSystemForChild}
                selectedChildSystem={p.selectedChildSystem}
                setSelectedChildSystem={p.setSelectedChildSystem}
                emitterName={p.emitterName}
                setEmitterName={p.setEmitterName}
                rate={p.childParticleRate}
                setRate={p.setChildParticleRate}
                lifetime={p.childParticleLifetime}
                setLifetime={p.setChildParticleLifetime}
                bindWeight={p.childParticleBindWeight}
                setBindWeight={p.setChildParticleBindWeight}
                timeBeforeFirstEmission={p.childParticleTimeBeforeFirstEmission}
                setTimeBeforeFirstEmission={p.setChildParticleTimeBeforeFirstEmission}
                translationOverrideX={p.childParticleTranslationOverrideX}
                setTranslationOverrideX={p.setChildParticleTranslationOverrideX}
                translationOverrideY={p.childParticleTranslationOverrideY}
                setTranslationOverrideY={p.setChildParticleTranslationOverrideY}
                translationOverrideZ={p.childParticleTranslationOverrideZ}
                setTranslationOverrideZ={p.setChildParticleTranslationOverrideZ}
                isSingle={p.childParticleIsSingle}
                setIsSingle={p.setChildParticleIsSingle}
                availableSystems={p.availableVfxSystems}
                onConfirm={p.handleConfirmChildParticles}
            />

            <PortStatusBar
                statusMessage={p.statusMessage}
                targetPyContent={p.targetPyContent}
                trimTargetNames={p.trimTargetNames}
                setTrimTargetNames={p.setTrimTargetNames}
                trimDonorNames={p.trimDonorNames}
                setTrimDonorNames={p.setTrimDonorNames}
            />

            <PortBottomControls handleUndo={p.handleUndo} undoHistory={p.undoHistory} handleSave={handleSaveWithBackup} isProcessing={p.isProcessing} hasChangesToSave={p.hasChangesToSave} />

            <VfxFloatingActions
                targetPyContent={p.targetPyContent}
                isProcessing={p.isProcessing}
                handleOpenBackupViewer={handleOpenBackupViewer}
                handleOpenPersistent={p.handleOpenPersistent}
                handleOpenIdleParticles={handleOpenIdleManager}
                handleOpenNewSystemModal={p.handleOpenNewSystemModal}
                hasResourceResolver={p.hasResourceResolver}
                hasSkinCharacterData={p.hasSkinCharacterData}
                showIdleParticlesButton
                showPortAllButton={!!(p.targetPyContent && p.donorPyContent)}
                onPortAll={() => setShowPortAllModeModal(true)}
                isPortAllLoading={p.isPortAllLoading}
                disablePortAll={!p.hasResourceResolver || Object.values(p.donorSystems).length === 0}
            />

            <PortAllModeModal
                open={showPortAllModeModal}
                onClose={() => setShowPortAllModeModal(false)}
                onSelectMode={handleSelectPortAllMode}
                donorCount={Object.values(p.donorSystems || {}).length}
            />
        </div>
    );
}

export { Port };
export default Port;
