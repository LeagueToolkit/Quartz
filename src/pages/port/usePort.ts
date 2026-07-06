import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePortStore } from '@/lib/stores/portStore';
import { useUiPrefsStore } from '@/lib/stores';
import { log } from '@/lib/util/logger';
import { pickBinPath } from './utils/loadBin';
import {
    vfxOpen,
    vfxClose,
    vfxSave,
    vfxUndo,
    vfxRedo,
    vfxCreateSystem,
    vfxPortEmitters,
    vfxPortSystem,
    vfxDeleteEmitter,
    vfxDeleteSystem,
    vfxSetMatrix,
    vfxIdleAdd,
    vfxIdleRemove,
    vfxChildAdd,
    vfxChildUpdate,
    vfxPersistentUpsert,
    vfxPersistentRemove,
    vfxResolverUpsert,
    vfxRenameEmitter,
    vfxRenameSystem,
    type VfxPath,
    type VfxPortModel,
} from '@/lib/api/vfxSession';
import { portCopyAssetsToTarget } from '@/lib/api/wad';
import {
    buildSystemMap,
    buildSystemList,
    effectKeyForSystem,
    effectKeyOptionsFromModel,
    idleEntriesFromModel,
    persistentConditionsFromModel,
    availableSystemsFromModel,
    buildPersistentPayload,
    type VfxSystem,
    type AvailableVfxSystem,
    type BoneConfig,
    type PersistentCondition,
    type PersistentPreset,
    type PersistentVfxItem,
} from './model';

export interface IdleBoneItem {
    id: number;
    boneName: string;
    customBoneName: string;
}

export interface MatrixModalState {
    systemKey: string | null;
    systemName?: string;
    initial?: number[] | null;
}

export interface PendingDrop {
    donorSystemPath: VfxPath;
    defaultName: string;
}

const typeOptions = [
    { value: 'IsAnimationPlaying', label: 'Animation Playing', description: 'Trigger when specific animation is playing' },
    { value: 'HasBuffScript', label: 'Has Buff', description: 'Trigger when character has a specific buff' },
    { value: 'LearnedSpell', label: 'Learned Spell', description: 'Trigger when character has learned a spell' },
    { value: 'HasGear', label: 'Has Gear', description: 'Trigger when character has specific gear equipped' },
    { value: 'FloatComparison', label: 'Spell Rank Comparison', description: 'Compare spell rank with a value' },
    { value: 'BuffCounterFloatComparison', label: 'Buff Counter Comparison', description: 'Compare buff counter with a value' },
];

export default function usePort() {
    // File state — seeded from the resident store so the loaded sessions survive
    // a page swap (App remounts pages). Mirrored back via the effect below.
    const portStore = usePortStore.getState();
    const [targetPath, setTargetPath] = useState(portStore.targetPath);
    const [donorPath, setDonorPath] = useState(portStore.donorPath);
    const [targetSessionId, setTargetSessionId] = useState<number | null>(portStore.targetSessionId);
    const [donorSessionId, setDonorSessionId] = useState<number | null>(portStore.donorSessionId);
    const [targetModel, setTargetModel] = useState<VfxPortModel | null>(portStore.targetModel);
    const [donorModel, setDonorModel] = useState<VfxPortModel | null>(portStore.donorModel);
    const [donorTempRoot, setDonorTempRoot] = useState<string | null>(portStore.donorTempRoot);

    // Shared state
    const [statusMessage, setStatusMessage] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingText, setProcessingText] = useState('');
    const [fileSaved, setFileSaved] = useState(portStore.fileSaved);

    // History (backend undo stack; tracked optimistically like Paint)
    const [canUndo, setCanUndo] = useState(portStore.canUndo);
    const [canRedo, setCanRedo] = useState(portStore.canRedo);

    // Mirror the loaded-session state into the resident store so it persists
    // across page swaps. The store is the source of truth between mounts.
    useEffect(() => {
        usePortStore.getState().hydrate({
            targetPath, donorPath, targetSessionId, donorSessionId, targetModel, donorModel, donorTempRoot, fileSaved, canUndo, canRedo,
        });
    }, [targetPath, donorPath, targetSessionId, donorSessionId, targetModel, donorModel, donorTempRoot, fileSaved, canUndo, canRedo]);

    const [selectedTargetSystem, setSelectedTargetSystem] = useState<string | null>(null);
    const [collapsedTargetSystems, setCollapsedTargetSystems] = useState<Set<string>>(() => new Set(portStore.collapsedTargetKeys));
    const [collapsedDonorSystems, setCollapsedDonorSystems] = useState<Set<string>>(() => new Set(portStore.collapsedDonorKeys));
    const [isPortAllLoading, setIsPortAllLoading] = useState(false);

    // Persist collapse state across page swaps too (the main mirror above runs
    // before these are declared, so keep it in its own effect).
    useEffect(() => {
        usePortStore.getState().hydrate({
            collapsedTargetKeys: [...collapsedTargetSystems],
            collapsedDonorKeys: [...collapsedDonorSystems],
        });
    }, [collapsedTargetSystems, collapsedDonorSystems]);

    // Filters
    const [targetFilter, setTargetFilter] = useState('');
    const [donorFilter, setDonorFilter] = useState('');
    // Emitter search on by default: the filter box matches particle AND emitter
    // names, and hides non-matching emitters within each system.
    const [enableTargetEmitterSearch, setEnableTargetEmitterSearch] = useState(true);
    const [enableDonorEmitterSearch, setEnableDonorEmitterSearch] = useState(true);

    // Modal / UI state
    const [actionsMenuAnchor, setActionsMenuAnchor] = useState<{ element: HTMLElement; systemKey: string } | null>(null);
    const [showNamePromptModal, setShowNamePromptModal] = useState(false);
    const [showNewSystemModal, setShowNewSystemModal] = useState(false);
    const [showMatrixModal, setShowMatrixModal] = useState(false);
    const [showIdleParticleModal, setShowIdleParticleModal] = useState(false);
    const [showChildModal, setShowChildModal] = useState(false);
    const [showPersistentModal, setShowPersistentModal] = useState(false);
    const [namePromptValue, setNamePromptValue] = useState('');
    const [newSystemName, setNewSystemName] = useState('');
    const [matrixModalState, setMatrixModalState] = useState<MatrixModalState>({ systemKey: null, initial: null });
    const [pressedSystemKey, setPressedSystemKey] = useState<string | null>(null);
    const [dragStartedKey, setDragStartedKeyState] = useState<string | null>(null);
    const [draggedEmitter, setDraggedEmitter] = useState<{ sourceSystemKey: string; emitterName: string } | null>(null);
    const [isDragOverVfx, setIsDragOverVfx] = useState(false);
    const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);

    // Rename
    const [renamingEmitter, setRenamingEmitter] = useState<{ systemKey: string; emitterName: string; newName: string } | null>(null);
    const [renamingSystem, setRenamingSystem] = useState<{ systemKey: string; newName: string } | null>(null);

    // Trim toggles
    const [trimTargetNames, setTrimTargetNames] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('port_trimTargetNames') || 'true');
        } catch {
            return true;
        }
    });
    const [trimDonorNames, setTrimDonorNames] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('port_trimDonorNames') || 'true');
        } catch {
            return true;
        }
    });
    useEffect(() => {
        localStorage.setItem('port_trimTargetNames', JSON.stringify(trimTargetNames));
    }, [trimTargetNames]);
    useEffect(() => {
        localStorage.setItem('port_trimDonorNames', JSON.stringify(trimDonorNames));
    }, [trimDonorNames]);

    // Idle modal state
    const [selectedSystemForIdle, setSelectedSystemForIdle] = useState<{ key: string; name: string } | null>(null);
    const [idleBonesList, setIdleBonesList] = useState<IdleBoneItem[]>([]);
    const [isEditingIdle, setIsEditingIdle] = useState(false);
    const [existingIdleBones, setExistingIdleBones] = useState<string[]>([]);

    // Child modal state
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedSystemForChild, setSelectedSystemForChild] = useState<{ key: string; name: string } | null>(null);
    const [editingChildEmitterPath, setEditingChildEmitterPath] = useState<VfxPath | null>(null);
    const [selectedChildSystem, setSelectedChildSystem] = useState('');
    const [emitterName, setEmitterName] = useState('');
    const [availableVfxSystems, setAvailableVfxSystems] = useState<AvailableVfxSystem[]>([]);
    const [childParticleRate, setChildParticleRate] = useState('1');
    const [childParticleLifetime, setChildParticleLifetime] = useState('9999');
    const [childParticleBindWeight, setChildParticleBindWeight] = useState('1');
    const [childParticleIsSingle, setChildParticleIsSingle] = useState(true);
    const [childParticleTimeBeforeFirstEmission, setChildParticleTimeBeforeFirstEmission] = useState('0');
    const [childParticleTranslationOverrideX, setChildParticleTranslationOverrideX] = useState('0');
    const [childParticleTranslationOverrideY, setChildParticleTranslationOverrideY] = useState('0');
    const [childParticleTranslationOverrideZ, setChildParticleTranslationOverrideZ] = useState('0');

    // Persistent modal state
    const [persistentPreset, setPersistentPreset] = useState<PersistentPreset>({ type: 'IsAnimationPlaying', animationName: 'Spell4', delay: { on: 0, off: 0 } });
    const [persistentVfx, setPersistentVfx] = useState<PersistentVfxItem[]>([]);
    const [persistentShowSubmeshes, setPersistentShowSubmeshes] = useState<string[]>([]);
    const [persistentHideSubmeshes, setPersistentHideSubmeshes] = useState<string[]>([]);
    const [customShowSubmeshInput, setCustomShowSubmeshInput] = useState('');
    const [customHideSubmeshInput, setCustomHideSubmeshInput] = useState('');
    const [vfxSearchTerms, setVfxSearchTerms] = useState<Record<number, string>>({});
    const [vfxDropdownOpen, setVfxDropdownOpen] = useState<Record<number, boolean>>({});
    const [showExistingConditions, setShowExistingConditions] = useState(false);
    const [editingConditionIndex, setEditingConditionIndex] = useState<number | null>(null);
    const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
    const typeDropdownRef = useRef<HTMLDivElement | null>(null);

    // Refs
    const targetListRef = useRef<HTMLDivElement | null>(null);
    const donorListRef = useRef<HTMLDivElement | null>(null);
    const dragEnterCounter = useRef(0);
    const dragStartedKeyRef = useRef<string | null>(null);
    const targetSessionQueueRef = useRef<Promise<void>>(Promise.resolve());
    const targetSessionBusyCountRef = useRef(0);

    const setDragStartedKey = useCallback((key: string | null) => {
        dragStartedKeyRef.current = key;
        setDragStartedKeyState(key);
    }, []);

    const runTargetSessionTask = useCallback(
        async <T,>(task: () => Promise<T>, processingLabel = 'Applying changes...'): Promise<T> => {
            const prev = targetSessionQueueRef.current.catch(() => undefined);
            let release!: () => void;
            const gate = new Promise<void>((resolve) => {
                release = resolve;
            });
            targetSessionQueueRef.current = prev.then(() => gate);

            targetSessionBusyCountRef.current += 1;
            setIsProcessing(true);
            setProcessingText((current) => current || processingLabel);

            await prev;
            try {
                return await task();
            } finally {
                release();
                targetSessionBusyCountRef.current = Math.max(0, targetSessionBusyCountRef.current - 1);
                if (targetSessionBusyCountRef.current === 0) {
                    setIsProcessing(false);
                    setProcessingText('');
                }
            }
        },
        []
    );

    // Derived model views. The map is for O(1) lookups by key; the ordered list
    // preserves the bin's entry order for rendering (Object.values on the map
    // reorders integer-like keys and scrambled the list vs the bin).
    const targetSystems = useMemo(() => buildSystemMap(targetModel), [targetModel]);
    const donorSystems = useMemo(() => buildSystemMap(donorModel), [donorModel]);
    const targetSystemList = useMemo(() => buildSystemList(targetModel), [targetModel]);
    const donorSystemList = useMemo(() => buildSystemList(donorModel), [donorModel]);
    const effectKeyOptions = useMemo(() => effectKeyOptionsFromModel(targetModel), [targetModel]);
    const availableSubmeshes = useMemo(() => targetModel?.submeshes ?? [], [targetModel]);
    const existingConditions = useMemo(() => persistentConditionsFromModel(targetModel), [targetModel]);

    const hasResourceResolver = !!targetModel?.resolver;
    const hasSkinCharacterData = targetModel?.hasSkinCharacterData ?? false;

    /* Apply a mutation result: refresh the model and mark the session edited. */
    const applyTargetModel = useCallback((model: VfxPortModel) => {
        setTargetModel(model);
        setFileSaved(false);
        setCanUndo(true);
        setCanRedo(false);
    }, []);

    const findTargetSystem = useCallback(
        (systemKey: string): VfxSystem | null => targetSystems[systemKey] ?? null,
        [targetSystems]
    );

    /* Copy donor asset files referenced by ported content into the target mod
       tree. Source candidates: the donor-from-game temp extract dir and the
       donor bin's own folder. */
    const copyDonorAssets = useCallback(
        async (assetPaths: string[]) => {
            console.log('[port assets] copyDonorAssets called', {
                assetCount: assetPaths?.length ?? 0,
                assetPaths,
                targetPath,
                donorPath,
                donorTempRoot,
            });
            if (!assetPaths || assetPaths.length === 0) {
                console.warn('[port assets] no asset paths extracted from the ported system — nothing to copy');
                return;
            }
            if (!targetPath || !targetPath.includes('.')) {
                console.warn('[port assets] no valid target path; skipping asset copy', { targetPath });
                return;
            }
            const sourceDirs = new Set<string>();
            if (donorTempRoot) sourceDirs.add(`${donorTempRoot}/combined`);
            const donorDir = donorPath && donorPath.includes('.') ? donorPath.replace(/[/\\][^/\\]*$/, '') : '';
            if (donorDir) sourceDirs.add(donorDir);
            if (sourceDirs.size === 0) {
                console.warn('[port assets] no source dirs (no donorTempRoot and no donorPath); cannot locate assets');
                return;
            }
            console.log('[port assets] invoking backend copy', { sourceDirs: Array.from(sourceDirs), targetBinPath: targetPath });
            try {
                const res = await portCopyAssetsToTarget({
                    assetPaths,
                    sourceDirs: Array.from(sourceDirs),
                    targetBinPath: targetPath,
                });
                console.log('[port assets] backend result', res);
                if (res.copied > 0) setStatusMessage(`Copied ${res.copied} asset file(s) into the target mod`);
                else if (res.missing > 0) setStatusMessage(`No assets copied (${res.missing} not found under donor)`);
            } catch (err) {
                console.error('[port assets] backend copy threw', err);
            }
        },
        [targetPath, donorPath, donorTempRoot]
    );

    // ── Undo / redo ──
    const handleUndo = useCallback(async () => {
        if (targetSessionId === null) return;
        await runTargetSessionTask(async () => {
            try {
                const restored = await vfxUndo(targetSessionId);
                if (restored) {
                    setTargetModel(restored);
                    setFileSaved(false);
                    setCanRedo(true);
                    setStatusMessage('Restored previous state');
                } else {
                    setCanUndo(false);
                    setStatusMessage('Nothing to undo');
                }
            } catch (error) {
                setStatusMessage(`Undo error: ${(error as Error).message}`);
            }
        }, 'Undoing...');
    }, [targetSessionId, runTargetSessionTask]);

    const handleRedo = useCallback(async () => {
        if (targetSessionId === null) return;
        await runTargetSessionTask(async () => {
            try {
                const restored = await vfxRedo(targetSessionId);
                if (restored) {
                    setTargetModel(restored);
                    setFileSaved(false);
                    setCanUndo(true);
                    setStatusMessage('Redid last edit');
                } else {
                    setCanRedo(false);
                    setStatusMessage('Nothing to redo');
                }
            } catch (error) {
                setStatusMessage(`Redo error: ${(error as Error).message}`);
            }
        }, 'Redoing...');
    }, [targetSessionId, runTargetSessionTask]);

    const handleToggleTargetCollapse = useCallback((key: string) => {
        setCollapsedTargetSystems((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const handleToggleDonorCollapse = useCallback((key: string) => {
        setCollapsedDonorSystems((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    // Filtered systems
    const filteredTargetSystems = useMemo(() => {
        if (!targetFilter) return targetSystemList;
        const term = targetFilter.toLowerCase();
        return targetSystemList
            .map((sys) => {
                const sysName = (sys.particleName || sys.name || sys.key || '').toLowerCase();
                if (sysName.includes(term)) return sys;
                if (enableTargetEmitterSearch && sys.emitters) {
                    const matching = sys.emitters.filter((e) => (e.name || '').toLowerCase().includes(term));
                    if (matching.length > 0) return { ...sys, emitters: matching };
                }
                return null;
            })
            .filter((s): s is VfxSystem => s !== null);
    }, [targetSystemList, targetFilter, enableTargetEmitterSearch]);

    const filteredDonorSystems = useMemo(() => {
        if (!donorFilter) return donorSystemList;
        const term = donorFilter.toLowerCase();
        return donorSystemList
            .map((sys) => {
                const sysName = (sys.particleName || sys.name || sys.key || '').toLowerCase();
                if (sysName.includes(term)) return sys;
                if (enableDonorEmitterSearch && sys.emitters) {
                    const matching = sys.emitters.filter((e) => (e.name || '').toLowerCase().includes(term));
                    if (matching.length > 0) return { ...sys, emitters: matching };
                }
                return null;
            })
            .filter((s): s is VfxSystem => s !== null);
    }, [donorSystemList, donorFilter, enableDonorEmitterSearch]);

    // ── File loading ──
    const processTargetBin = useCallback(async (filePath: string) => {
        if (!filePath) return;
        try {
            setIsProcessing(true);
            setStatusMessage('Opening target file...');
            setProcessingText('Loading target...');

            // Free the previous resident session. Read the live id from the
            // store (local state resets on a page swap, the session does not).
            const prev = usePortStore.getState().targetSessionId;
            if (prev !== null) void vfxClose(prev).catch(() => undefined);

            const { sessionId, model } = await vfxOpen(filePath);
            setTargetSessionId(sessionId);
            setTargetModel(model);
            setTargetPath(filePath);
            setFileSaved(true);
            setCanUndo(false);
            setCanRedo(false);
            setCollapsedTargetSystems(new Set(model.systems.map((s) => s.key)));
            setSelectedTargetSystem(null);
            useUiPrefsStore.getState().pushRecentBinFor('target', filePath);
            setStatusMessage(`Target bin loaded: ${model.systems.length} systems found`);
        } catch (error) {
            setStatusMessage(`Error: ${(error as Error).message}`);
        } finally {
            setIsProcessing(false);
            setProcessingText('');
        }
    }, []);

    // `recordRecent` defaults true; donor-from-game passes false because its
    // path is a throwaway temp extraction that shouldn't pollute recent history.
    const processDonorBin = useCallback(async (filePath: string, recordRecent = true) => {
        if (!filePath) return;
        try {
            setIsProcessing(true);
            setStatusMessage('Opening donor bin...');
            setProcessingText('Loading donor...');

            const prev = usePortStore.getState().donorSessionId;
            if (prev !== null) void vfxClose(prev).catch(() => undefined);

            const { sessionId, model } = await vfxOpen(filePath);
            setDonorSessionId(sessionId);
            setDonorModel(model);
            setDonorPath(filePath);
            setCollapsedDonorSystems(new Set(model.systems.map((s) => s.key)));
            if (recordRecent) useUiPrefsStore.getState().pushRecentBinFor('donor', filePath);
            setStatusMessage(`Donor bin loaded: ${model.systems.length} systems found`);
        } catch (error) {
            setStatusMessage(`Error: ${(error as Error).message}`);
        } finally {
            setIsProcessing(false);
            setProcessingText('');
        }
    }, []);

    const handleOpenTargetBin = useCallback(async () => {
        const p = await pickBinPath();
        if (p) await processTargetBin(p);
    }, [processTargetBin]);

    const handleOpenDonorBin = useCallback(async () => {
        const p = await pickBinPath();
        if (p) await processDonorBin(p);
    }, [processDonorBin]);

    // ── Save ──
    const handleSave = useCallback(async () => {
        if (targetSessionId === null) {
            setStatusMessage('No target file loaded');
            return;
        }
        await runTargetSessionTask(async () => {
            try {
                setProcessingText('Saving .bin...');
                setStatusMessage('Saving modified target file...');
                const written = await vfxSave(targetSessionId);
                setFileSaved(true);
                setStatusMessage(written.length > 0 ? `Successfully saved ${written.length} file(s)` : 'No changes to save');
            } catch (e) {
                setStatusMessage(`Error saving file: ${(e as Error).message}`);
                setFileSaved(false);
            }
        }, 'Saving .bin...');
    }, [targetSessionId, runTargetSessionTask]);

    const hasChangesToSave = useCallback(() => !fileSaved, [fileSaved]);

    // ── Porting ──
    const handlePortEmitter = useCallback(
        async (donorSystemKey: string, emName: string, _hasResolver?: boolean, targetSystemKeyOverride: string | null = null) => {
            const targetSystemKey = targetSystemKeyOverride || selectedTargetSystem;
            if (!targetSystemKey) {
                setStatusMessage('Please select a target system first');
                return;
            }
            if (targetSessionId === null || donorSessionId === null || !emName) return;
            const donorSystem = donorSystems[donorSystemKey];
            const targetSystem = targetSystems[targetSystemKey];
            if (!donorSystem || !targetSystem) return;
            const emitter = donorSystem.emitters.find((e) => e.name === emName);
            if (!emitter) return;
            await runTargetSessionTask(async () => {
                try {
                    const result = await vfxPortEmitters(targetSessionId, donorSessionId, [emitter.path], targetSystem.path);
                    applyTargetModel(result.model);
                    setStatusMessage(`Ported emitter "${result.ported[0] || emName}"`);
                    void copyDonorAssets(result.assetPaths);
                } catch (error) {
                    setStatusMessage(`Error porting emitter: ${(error as Error).message}`);
                }
            }, 'Porting emitter...');
        },
        [selectedTargetSystem, targetSessionId, donorSessionId, donorSystems, targetSystems, applyTargetModel, copyDonorAssets, runTargetSessionTask]
    );

    const handlePortAllEmitters = useCallback(
        async (donorSystemKey: string) => {
            if (!selectedTargetSystem) {
                setStatusMessage('Please select a target system first');
                return;
            }
            if (targetSessionId === null || donorSessionId === null) return;
            const donorSystem = donorSystems[donorSystemKey];
            const targetSystem = targetSystems[selectedTargetSystem];
            if (!donorSystem || !targetSystem || donorSystem.emitters.length === 0) return;
            await runTargetSessionTask(async () => {
                try {
                    const result = await vfxPortEmitters(
                        targetSessionId,
                        donorSessionId,
                        donorSystem.emitters.map((e) => e.path),
                        targetSystem.path
                    );
                    applyTargetModel(result.model);
                    setStatusMessage(`Ported ${result.ported.length} emitters`);
                    void copyDonorAssets(result.assetPaths);
                } catch (error) {
                    setStatusMessage(`Error porting all emitters: ${(error as Error).message}`);
                }
            }, 'Porting emitters...');
        },
        [selectedTargetSystem, targetSessionId, donorSessionId, donorSystems, targetSystems, applyTargetModel, copyDonorAssets, runTargetSessionTask]
    );

    /* Insert a donor system dropped onto the target column. preserveName keeps
       the donor's particle names/resolver keys; otherwise renames to `name`. */
    const handleInsertDonorSystem = useCallback(
        async (donorSystemPath: VfxPath, name: string | null, preserveName: boolean) => {
            if (targetSessionId === null || donorSessionId === null) {
                setStatusMessage('Both target and donor files must be loaded');
                return;
            }
            await runTargetSessionTask(async () => {
                try {
                    const result = await vfxPortSystem(targetSessionId, donorSessionId, donorSystemPath, preserveName ? null : name, preserveName);
                    applyTargetModel(result.model);
                    const modeText = preserveName ? 'with preserved ResourceResolver names' : 'with updated names';
                    setStatusMessage(`Added VFX system "${result.finalName}" to target ${modeText}`);
                    void copyDonorAssets(result.assetPaths);
                } catch (error) {
                    setStatusMessage(`Failed to add VFX system: ${(error as Error).message}`);
                }
            }, 'Porting VFX system...');
        },
        [targetSessionId, donorSessionId, applyTargetModel, copyDonorAssets, runTargetSessionTask]
    );

    const handlePortAllSystems = useCallback(
        async (hasResolver: boolean, mode: 'normal' | 'replace-target' = 'normal') => {
            if (targetSessionId === null || donorSessionId === null) {
                setStatusMessage('Both target and donor files must be loaded');
                return;
            }
            if (!hasResolver) {
                setStatusMessage('Locked: target bin missing ResourceResolver');
                return;
            }
            const donorSystemsList = Object.values(donorSystems);
            if (donorSystemsList.length === 0) {
                setStatusMessage('No VFX systems found in donor file');
                return;
            }
            try {
                setIsPortAllLoading(true);
                setIsProcessing(true);
                setProcessingText(
                    mode === 'replace-target'
                        ? `Replacing target with ${donorSystemsList.length} donor VFX systems...`
                        : `Porting ${donorSystemsList.length} VFX systems...`
                );

                let latest: VfxPortModel | null = null;
                if (mode === 'replace-target') {
                    // Delete every existing target system first, refreshing the
                    // model between deletes so entry paths stay valid.
                    let current = targetModel;
                    while (current && current.systems.length > 0) {
                        latest = await vfxDeleteSystem(targetSessionId, current.systems[0].path);
                        current = latest;
                    }
                }

                let successCount = 0;
                let errorCount = 0;
                const allAssets = new Set<string>();
                for (let i = 0; i < donorSystemsList.length; i++) {
                    const system = donorSystemsList[i];
                    setProcessingText(`Porting system ${i + 1}/${donorSystemsList.length}: ${system.particleName || system.name}`);
                    try {
                        const result = await vfxPortSystem(targetSessionId, donorSessionId, system.path, null, true);
                        latest = result.model;
                        for (const a of result.assetPaths) allAssets.add(a);
                        successCount++;
                    } catch {
                        errorCount++;
                    }
                }

                if (latest) {
                    applyTargetModel(latest);
                }
                if (successCount > 0) {
                    const verb = mode === 'replace-target' ? 'Replaced target with' : 'Successfully ported';
                    setStatusMessage(`${verb} ${successCount} VFX systems${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
                    void copyDonorAssets(Array.from(allAssets));
                } else {
                    setStatusMessage('Failed to port any VFX systems');
                }
            } catch (error) {
                setStatusMessage(`Failed to port VFX systems: ${(error as Error).message}`);
            } finally {
                setIsPortAllLoading(false);
                setIsProcessing(false);
                setProcessingText('');
            }
        },
        [targetSessionId, donorSessionId, donorSystems, targetModel, applyTargetModel, copyDonorAssets]
    );

    /* Move an emitter between two target systems: clone into the destination
       (same session as donor), then delete the source emitter. */
    const handleMoveEmitter = useCallback(
        async (sourceSystemKey: string, emName: string, targetSystemKey: string) => {
            if (sourceSystemKey === targetSystemKey) {
                setStatusMessage('Cannot move emitter to the same system');
                return;
            }
            if (targetSessionId === null) return;
            const sourceSystem = targetSystems[sourceSystemKey];
            const targetSystem = targetSystems[targetSystemKey];
            if (!sourceSystem || !targetSystem) {
                setStatusMessage('Source or target system not found');
                return;
            }
            const emitter = sourceSystem.emitters.find((e) => e.name === emName);
            if (!emitter) {
                setStatusMessage(`Failed to load emitter data for "${emName}"`);
                return;
            }
            await runTargetSessionTask(async () => {
                try {
                    const ported = await vfxPortEmitters(targetSessionId, targetSessionId, [emitter.path], targetSystem.path);
                    const freshSource = ported.model.systems.find((s) => s.key === sourceSystemKey);
                    const freshEmitter = freshSource?.emitters.find((e) => e.name === emName);
                    if (freshEmitter) {
                        const model = await vfxDeleteEmitter(targetSessionId, freshEmitter.path);
                        applyTargetModel(model);
                    } else {
                        applyTargetModel(ported.model);
                    }
                    const finalName = ported.ported[0] || emName;
                    setStatusMessage(`Moved emitter "${emName}"${finalName !== emName ? ` (renamed to "${finalName}")` : ''}`);
                } catch (error) {
                    setStatusMessage(`Error moving emitter: ${(error as Error).message}`);
                }
            }, 'Moving emitter...');
        },
        [targetSessionId, targetSystems, applyTargetModel, runTargetSessionTask]
    );

    const handleDeleteEmitter = useCallback(
        async (systemKey: string, emitterIndex: number, isTarget: boolean, emName: string | null = null) => {
            const sessionId = isTarget ? targetSessionId : donorSessionId;
            const systems = isTarget ? targetSystems : donorSystems;
            if (sessionId === null) return;
            const system = systems[systemKey];
            if (!system || system.emitters.length === 0) return;
            const emitter = emName ? system.emitters.find((e) => e.name === emName) : system.emitters[emitterIndex];
            if (!emitter) {
                setStatusMessage(`Emitter "${emName ?? emitterIndex}" not found in system`);
                return;
            }
            const task = async () => {
                try {
                    const model = await vfxDeleteEmitter(sessionId, emitter.path);
                    if (isTarget) applyTargetModel(model);
                    else setDonorModel(model);
                    setStatusMessage(`Deleted emitter "${emitter.name}" from ${isTarget ? 'target' : 'donor'} bin`);
                } catch (error) {
                    setStatusMessage(`Error deleting emitter: ${(error as Error).message}`);
                }
            };
            if (isTarget) await runTargetSessionTask(task, 'Deleting emitter...');
            else await task();
        },
        [targetSessionId, donorSessionId, targetSystems, donorSystems, applyTargetModel, runTargetSessionTask]
    );

    const handleDeleteAllEmitters = useCallback(
        async (systemKey: string) => {
            if (targetSessionId === null) return;
            const system = targetSystems[systemKey];
            if (!system || system.emitters.length === 0) return;
            await runTargetSessionTask(async () => {
                try {
                    let model: VfxPortModel | null = null;
                    for (let i = system.emitters.length - 1; i >= 0; i--) {
                        model = await vfxDeleteEmitter(targetSessionId, system.emitters[i].path);
                    }
                    if (model) applyTargetModel(model);
                    setStatusMessage(`Deleted all emitters from "${system.particleName || system.name || systemKey}"`);
                } catch (error) {
                    setStatusMessage(`Error deleting emitters: ${(error as Error).message}`);
                }
            }, 'Deleting emitters...');
        },
        [targetSessionId, targetSystems, applyTargetModel, runTargetSessionTask]
    );

    const handleRenameEmitter = useCallback(
        async (systemKey: string, oldEmitterName: string, newEmitterName: string) => {
            const name = (typeof newEmitterName === 'string' ? newEmitterName : '').trim();
            if (!name) {
                setStatusMessage('Emitter name cannot be empty');
                return;
            }
            if (name === oldEmitterName) {
                setRenamingEmitter(null);
                return;
            }
            const system = targetSystems[systemKey];
            if (!system || targetSessionId === null) {
                setStatusMessage(`System "${systemKey}" not found`);
                setRenamingEmitter(null);
                return;
            }
            if (system.emitters.some((e) => e.name === name)) {
                setStatusMessage(`Emitter "${name}" already exists in this system`);
                setRenamingEmitter(null);
                return;
            }
            const emitter = system.emitters.find((e) => e.name === oldEmitterName);
            if (!emitter) {
                setStatusMessage(`Emitter "${oldEmitterName}" not found in system`);
                setRenamingEmitter(null);
                return;
            }
            await runTargetSessionTask(async () => {
                try {
                    const model = await vfxRenameEmitter(targetSessionId, emitter.path, name);
                    applyTargetModel(model);
                    setStatusMessage(`Renamed emitter "${oldEmitterName}" to "${name}"`);
                } catch (error) {
                    setStatusMessage(`Failed to rename emitter: ${(error as Error).message}`);
                } finally {
                    setRenamingEmitter(null);
                }
            }, 'Renaming emitter...');
        },
        [targetSessionId, targetSystems, applyTargetModel, runTargetSessionTask]
    );

    /* Rename a system. The backend updates particleName/particlePath, recomputes
       the entry hash (so the system key changes), uniquifies across all bins and
       re-points the resolver; re-anchor selection and highlights to the new key. */
    const handleRenameSystem = useCallback(
        async (systemKey: string, newSystemName: string) => {
            const name = (typeof newSystemName === 'string' ? newSystemName : '').trim();
            if (!name) {
                setStatusMessage('System name cannot be empty');
                return;
            }
            const system = targetSystems[systemKey];
            if (!system || targetSessionId === null) {
                setStatusMessage(`System "${systemKey}" not found`);
                setRenamingSystem(null);
                return;
            }
            const oldSystemName = system.particleName || system.name || system.key;
            if (name === oldSystemName) {
                setRenamingSystem(null);
                return;
            }
            await runTargetSessionTask(async () => {
                try {
                    const prevKeys = new Set(targetModel?.systems.map((s) => s.key) ?? []);
                    const model = await vfxRenameSystem(targetSessionId, system.path, name);
                    const renamed = model.systems.find((s) => !prevKeys.has(s.key));
                    if (renamed) {
                        if (selectedTargetSystem === systemKey) setSelectedTargetSystem(renamed.key);
                        setCollapsedTargetSystems((prev) => {
                            if (!prev.has(systemKey)) return prev;
                            const next = new Set(prev);
                            next.delete(systemKey);
                            next.add(renamed.key);
                            return next;
                        });
                    }
                    applyTargetModel(model);
                    const finalName = renamed?.particleName || renamed?.name || name;
                    setStatusMessage(`Renamed system "${oldSystemName}" to "${finalName}"`);
                } catch (error) {
                    setStatusMessage(`Failed to rename system: ${(error as Error).message}`);
                } finally {
                    setRenamingSystem(null);
                }
            }, 'Renaming system...');
        },
        [targetSessionId, targetSystems, targetModel, selectedTargetSystem, applyTargetModel, runTargetSessionTask]
    );

    const handleCreateNewSystem = useCallback(
        async (name: string, closeModal?: (v: boolean) => void) => {
            const clean = (typeof name === 'string' ? name : '').trim();
            if (!clean) {
                setStatusMessage('Enter a system name');
                return;
            }
            if (targetSessionId === null) {
                setStatusMessage('No target file loaded');
                return;
            }
            await runTargetSessionTask(async () => {
                try {
                    const before = new Set(targetModel?.systems.map((s) => s.key) ?? []);
                    log.info('[port] create system', { name: clean, systemsBefore: before.size, targetSessionId });
                    const model = await vfxCreateSystem(targetSessionId, clean);
                    const created = model.systems.find((s) => !before.has(s.key));
                    log.info('[port] create system result', {
                        systemsAfter: model.systems.length,
                        createdKey: created?.key ?? null,
                        createdName: created?.name ?? null,
                        createdBin: created?.binIndex ?? null,
                    });
                    if (created) {
                        setSelectedTargetSystem(created.key);
                    } else {
                        log.warn('[port] create system: no new system key appeared in model');
                    }
                    applyTargetModel(model);
                    setStatusMessage(`Created VFX system "${clean}" and updated ResourceResolver`);
                } catch (error) {
                    log.error('[port] create system failed', error);
                    setStatusMessage(`Failed to create VFX system: ${(error as Error).message}`);
                } finally {
                    if (typeof closeModal === 'function') closeModal(false);
                }
            }, 'Creating VFX system...');
        },
        [targetSessionId, targetModel, applyTargetModel, runTargetSessionTask]
    );

    // ── Idle particles ──
    const normalizeBoneConfigs = useCallback((boneConfigs: BoneConfig[]) => {
        const normalized: BoneConfig[] = [];
        const seen = new Set<string>();
        for (const cfg of Array.isArray(boneConfigs) ? boneConfigs : []) {
            const raw = String(cfg?.boneName || '').trim();
            if (!raw) continue;
            const safe = raw.replace(/[\r\n\t"]/g, '').trim();
            if (!safe) continue;
            const lower = safe.toLowerCase();
            if (seen.has(lower)) continue;
            seen.add(lower);
            normalized.push({ boneName: safe });
        }
        return normalized;
    }, []);

    const idleBonesForEffectKey = useCallback(
        (effectKey: string): string[] => {
            const entry = idleEntriesFromModel(targetModel).find((e) => e.effectKey.toLowerCase() === effectKey.toLowerCase());
            return entry?.bones ?? [];
        },
        [targetModel]
    );

    const handleAddIdleParticles = useCallback(
        (systemKey: string, systemName: string) => {
            if (targetSessionId === null) {
                setStatusMessage('No target file loaded - Please open a target bin file first');
                return;
            }
            if (!hasResourceResolver || !hasSkinCharacterData) {
                setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
                return;
            }
            const system = findTargetSystem(systemKey);
            if (!system) return;
            const effectKey = effectKeyForSystem(targetModel, system);
            if (!effectKey) {
                setStatusMessage(`VFX system "${systemName}" does not have particle emitters and cannot be used for idle particles.`);
                return;
            }
            const currentBones = idleBonesForEffectKey(effectKey);
            if (currentBones.length > 0) {
                setIsEditingIdle(true);
                setExistingIdleBones(currentBones);
                setIdleBonesList(currentBones.map((bone, idx) => ({ id: Date.now() + idx, boneName: bone, customBoneName: '' })));
                setSelectedSystemForIdle({ key: systemKey, name: systemName });
                setShowIdleParticleModal(true);
                setStatusMessage(`Editing ${currentBones.length} idle particle(s) for "${systemName}".`);
                return;
            }
            setIsEditingIdle(false);
            setExistingIdleBones([]);
            setIdleBonesList([]);
            setSelectedSystemForIdle({ key: systemKey, name: systemName });
            setShowIdleParticleModal(true);
        },
        [targetSessionId, hasResourceResolver, hasSkinCharacterData, findTargetSystem, targetModel, idleBonesForEffectKey]
    );

    /* Replace all idle entries for a system's effect key with the given bones. */
    const upsertIdleForSystem = useCallback(
        async (systemKey: string, boneConfigs: BoneConfig[]): Promise<{ effectKey: string; bones: BoneConfig[] } | null> => {
            if (targetSessionId === null) return null;
            const system = findTargetSystem(systemKey);
            if (!system) return null;
            const effectKey = effectKeyForSystem(targetModel, system);
            if (!effectKey) return null;
            const bones = normalizeBoneConfigs(boneConfigs);
            let model: VfxPortModel | null = null;
            if (idleBonesForEffectKey(effectKey).length > 0) {
                model = await vfxIdleRemove(targetSessionId, effectKey);
            }
            if (bones.length > 0) {
                model = await vfxIdleAdd(targetSessionId, effectKey, bones.map((b) => b.boneName));
            }
            if (model) applyTargetModel(model);
            return { effectKey, bones };
        },
        [targetSessionId, findTargetSystem, targetModel, normalizeBoneConfigs, idleBonesForEffectKey, applyTargetModel]
    );

    const handleConfirmIdleParticles = useCallback(async () => {
        if (!selectedSystemForIdle || targetSessionId === null) return;
        try {
            const boneConfigs = idleBonesList.map((item) => ({
                boneName: item.customBoneName && item.customBoneName.trim() ? item.customBoneName.trim() : item.boneName,
            }));
            const result = await upsertIdleForSystem(selectedSystemForIdle.key, boneConfigs);
            if (result) {
                if (result.bones.length === 0) {
                    setStatusMessage(`Removed all idle particles from "${selectedSystemForIdle.name}"`);
                } else {
                    const boneNames = result.bones.map((c) => c.boneName).join(', ');
                    setStatusMessage(
                        `${isEditingIdle ? 'Updated' : 'Added'} ${result.bones.length} idle particle(s) for "${selectedSystemForIdle.name}" on bones: ${boneNames}`
                    );
                }
            }
            setShowIdleParticleModal(false);
            setSelectedSystemForIdle(null);
            setIsEditingIdle(false);
            setExistingIdleBones([]);
            setIdleBonesList([]);
        } catch (error) {
            setStatusMessage(`Failed to add idle particles: ${(error as Error).message}`);
        }
    }, [selectedSystemForIdle, targetSessionId, idleBonesList, isEditingIdle, upsertIdleForSystem]);

    const handleUpsertIdleParticlesForSystem = useCallback(
        async (systemKey: string, systemName: string, boneConfigs: BoneConfig[]) => {
            if (targetSessionId === null || !systemKey) return;
            try {
                const safeBones = normalizeBoneConfigs(boneConfigs);
                if (safeBones.length === 0) {
                    setStatusMessage('Add at least one valid bone before applying idle particles');
                    return;
                }
                const result = await upsertIdleForSystem(systemKey, safeBones);
                if (result) setStatusMessage(`Applied ${result.bones.length} idle particle(s) for "${systemName || systemKey}"`);
            } catch (error) {
                setStatusMessage(`Failed to apply idle particles: ${(error as Error).message}`);
            }
        },
        [targetSessionId, normalizeBoneConfigs, upsertIdleForSystem]
    );

    const handleRemoveIdleParticlesByEffectKey = useCallback(
        async (effectKey: string) => {
            const cleanKey = String(effectKey || '').replace(/^"|"$/g, '').trim();
            if (!cleanKey || targetSessionId === null) return;
            try {
                const model = await vfxIdleRemove(targetSessionId, cleanKey);
                applyTargetModel(model);
                setStatusMessage(`Removed idle particles for "${cleanKey}"`);
            } catch (error) {
                setStatusMessage(`Failed to remove idle particles: ${(error as Error).message}`);
            }
        },
        [targetSessionId, applyTargetModel]
    );

    // ── Child particles ──
    const resetChildState = useCallback(() => {
        setShowChildModal(false);
        setIsEditMode(false);
        setSelectedSystemForChild(null);
        setEditingChildEmitterPath(null);
        setSelectedChildSystem('');
        setEmitterName('');
        setChildParticleRate('1');
        setChildParticleLifetime('9999');
        setChildParticleBindWeight('1');
        setChildParticleIsSingle(true);
        setChildParticleTimeBeforeFirstEmission('0');
        setChildParticleTranslationOverrideX('0');
        setChildParticleTranslationOverrideY('0');
        setChildParticleTranslationOverrideZ('0');
        setAvailableVfxSystems([]);
    }, []);

    const handleAddChildParticles = useCallback(
        (systemKey: string, systemName: string) => {
            if (targetSessionId === null) {
                setStatusMessage('No target file loaded - Please open a target bin file first');
                return;
            }
            if (!hasResourceResolver || !hasSkinCharacterData) {
                setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
                return;
            }
            setAvailableVfxSystems(availableSystemsFromModel(targetModel));
            setSelectedSystemForChild({ key: systemKey, name: systemName });
            setIsEditMode(false);
            setEditingChildEmitterPath(null);
            setEmitterName('');
            setChildParticleRate('1');
            setChildParticleLifetime('9999');
            setChildParticleBindWeight('1');
            setChildParticleIsSingle(true);
            setChildParticleTimeBeforeFirstEmission('0');
            setChildParticleTranslationOverrideX('0');
            setChildParticleTranslationOverrideY('0');
            setChildParticleTranslationOverrideZ('0');
            setShowChildModal(true);
            setStatusMessage(`Opening child particles modal for "${systemName}"`);
        },
        [targetSessionId, hasResourceResolver, hasSkinCharacterData, targetModel]
    );

    const handleEditChildParticle = useCallback(
        (systemKey: string, systemName: string, editingEmitterName: string) => {
            const system = findTargetSystem(systemKey);
            const emitter = system?.emitters.find((e) => e.name === editingEmitterName);
            if (!emitter || !emitter.childData) {
                setStatusMessage(`Could not find child particle data for "${editingEmitterName}"`);
                return;
            }
            const systems = availableSystemsFromModel(targetModel);
            setAvailableVfxSystems(systems);
            setSelectedSystemForChild({ key: systemKey, name: systemName });
            setEmitterName(editingEmitterName);
            setIsEditMode(true);
            setEditingChildEmitterPath(emitter.path);
            const currentData = emitter.childData;
            const matchingSystem = systems.find((sys) => sys.key === currentData.effectKey);
            setSelectedChildSystem(matchingSystem ? matchingSystem.key : currentData.effectKey || '');
            setChildParticleRate(currentData.rate.toString());
            setChildParticleLifetime(currentData.lifetime.toString());
            setChildParticleBindWeight(currentData.bindWeight.toString());
            setChildParticleIsSingle(currentData.isSingleParticle);
            setChildParticleTimeBeforeFirstEmission(currentData.timeBeforeFirstEmission.toString());
            setChildParticleTranslationOverrideX(currentData.translation[0].toString());
            setChildParticleTranslationOverrideY(currentData.translation[1].toString());
            setChildParticleTranslationOverrideZ(currentData.translation[2].toString());
            setShowChildModal(true);
            setStatusMessage(`Editing child particle "${editingEmitterName}" in "${systemName}"`);
        },
        [findTargetSystem, targetModel]
    );

    const handleConfirmChildParticles = useCallback(async () => {
        if (!selectedSystemForChild || !selectedChildSystem || (!isEditMode && !emitterName.trim())) {
            setStatusMessage('Please fill in all fields (VFX system and emitter name)');
            return;
        }
        if (targetSessionId === null) return;
        const num = (v: string, fallback: number) => {
            const parsed = parseFloat(v);
            return Number.isFinite(parsed) ? parsed : fallback;
        };
        const params = {
            effectKey: selectedChildSystem,
            rate: num(childParticleRate, 1),
            lifetime: num(childParticleLifetime, 9999),
            bindWeight: num(childParticleBindWeight, 1),
            translation: [
                num(childParticleTranslationOverrideX, 0),
                num(childParticleTranslationOverrideY, 0),
                num(childParticleTranslationOverrideZ, 0),
            ] as [number, number, number],
            isSingleParticle: childParticleIsSingle,
            emitterName: emitterName.trim() || null,
            timeBeforeFirstEmission: num(childParticleTimeBeforeFirstEmission, 0),
        };
        try {
            let model: VfxPortModel;
            if (isEditMode) {
                if (!editingChildEmitterPath) return;
                model = await vfxChildUpdate(targetSessionId, editingChildEmitterPath, params);
            } else {
                const hostSystem = findTargetSystem(selectedSystemForChild.key);
                if (!hostSystem) return;
                model = await vfxChildAdd(targetSessionId, hostSystem.path, params);
            }
            applyTargetModel(model);
            setStatusMessage(`${isEditMode ? 'Updated' : 'Added'} child particle "${emitterName}" in "${selectedSystemForChild.name}"`);
            resetChildState();
        } catch (error) {
            setStatusMessage(`Failed to process child particles: ${(error as Error).message}`);
        }
    }, [
        isEditMode,
        selectedSystemForChild,
        selectedChildSystem,
        emitterName,
        targetSessionId,
        editingChildEmitterPath,
        childParticleRate,
        childParticleLifetime,
        childParticleBindWeight,
        childParticleIsSingle,
        childParticleTimeBeforeFirstEmission,
        childParticleTranslationOverrideX,
        childParticleTranslationOverrideY,
        childParticleTranslationOverrideZ,
        findTargetSystem,
        applyTargetModel,
        resetChildState,
    ]);

    // ── Persistent effects ──
    const handleAddCustomShowSubmesh = useCallback(() => {
        const trimmed = customShowSubmeshInput.trim();
        if (trimmed && !persistentShowSubmeshes.includes(trimmed)) {
            setPersistentShowSubmeshes((prev) => [...prev, trimmed]);
            setCustomShowSubmeshInput('');
        }
    }, [customShowSubmeshInput, persistentShowSubmeshes]);

    const handleAddCustomHideSubmesh = useCallback(() => {
        const trimmed = customHideSubmeshInput.trim();
        if (trimmed && !persistentHideSubmeshes.includes(trimmed)) {
            setPersistentHideSubmeshes((prev) => [...prev, trimmed]);
            setCustomHideSubmeshInput('');
        }
    }, [customHideSubmeshInput, persistentHideSubmeshes]);

    const handleRemoveCustomSubmesh = useCallback((submesh: string, type: 'show' | 'hide') => {
        if (type === 'show') setPersistentShowSubmeshes((prev) => prev.filter((s) => s !== submesh));
        else setPersistentHideSubmeshes((prev) => prev.filter((s) => s !== submesh));
    }, []);

    const handleOpenPersistent = useCallback(() => {
        if (targetSessionId === null) {
            setStatusMessage('No target file loaded');
            return;
        }
        if (!hasResourceResolver || !hasSkinCharacterData) {
            setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
            return;
        }
        setPersistentPreset({ type: 'IsAnimationPlaying', animationName: 'Spell4', delay: { on: 0, off: 0 } });
        setPersistentVfx([]);
        setCustomShowSubmeshInput('');
        setCustomHideSubmeshInput('');
        setVfxSearchTerms({});
        setVfxDropdownOpen({});
        setEditingConditionIndex(null);
        setShowExistingConditions(false);
        setPersistentShowSubmeshes((prev) => prev.filter((s) => !availableSubmeshes.includes(s)));
        setPersistentHideSubmeshes((prev) => prev.filter((s) => !availableSubmeshes.includes(s)));
        setShowPersistentModal(true);
    }, [targetSessionId, hasResourceResolver, hasSkinCharacterData, availableSubmeshes]);

    const handleLoadExistingCondition = useCallback(
        (condition: PersistentCondition) => {
            setVfxSearchTerms({});
            setVfxDropdownOpen({});
            setPersistentPreset(condition.preset);
            setPersistentVfx(condition.vfx.map((v) => ({ ...v, id: effectKeyOptions.find((o) => o.key === v.key)?.id || `custom:${v.key}` })));
            setPersistentShowSubmeshes([...condition.submeshesShow]);
            setPersistentHideSubmeshes([...condition.submeshesHide]);
            setEditingConditionIndex(condition.index);
            setShowExistingConditions(false);
            setStatusMessage(`Loaded condition: ${condition.label}`);
        },
        [effectKeyOptions]
    );

    const handleApplyPersistent = useCallback(async () => {
        if (targetSessionId === null) return;
        try {
            const normalizedVfx = persistentVfx
                .map((v) => {
                    const selected = effectKeyOptions.find((o) => o.id === v.id);
                    return { ...v, key: selected?.key || v.key };
                })
                .filter((v) => !!v.key);

            // Non-hex effect keys need a resolver mapping to resolve in-engine;
            // add one for keys the resolver does not know yet.
            let model: VfxPortModel | null = null;
            const resolverKeys = new Set((targetModel?.resolver?.entries ?? []).map((e) => e.key.toLowerCase()));
            for (const v of normalizedVfx) {
                const key = v.key!;
                if (/^0x[0-9a-fA-F]+$/.test(key) || resolverKeys.has(key.toLowerCase())) continue;
                const option = effectKeyOptions.find((o) => o.key === v.key);
                const system = Object.values(targetSystems).find(
                    (s) => s.particleName === (option?.particleName ?? key) || s.particleName === key || s.name === key
                );
                const value = system?.particlePath || system?.particleName || key;
                model = await vfxResolverUpsert(targetSessionId, key, value);
                resolverKeys.add(key.toLowerCase());
            }

            const payload = buildPersistentPayload(persistentPreset, normalizedVfx, persistentShowSubmeshes, persistentHideSubmeshes);
            model = await vfxPersistentUpsert(targetSessionId, editingConditionIndex, payload);
            applyTargetModel(model);
            setShowPersistentModal(false);
            setStatusMessage(`${editingConditionIndex !== null ? 'Updated' : 'Added'} PersistentEffectConditions`);
        } catch (e) {
            setStatusMessage(`Failed to apply Persistent effect: ${(e as Error).message}`);
        }
    }, [
        targetSessionId,
        targetModel,
        targetSystems,
        editingConditionIndex,
        persistentVfx,
        effectKeyOptions,
        persistentPreset,
        persistentShowSubmeshes,
        persistentHideSubmeshes,
        applyTargetModel,
    ]);

    const handleRemovePersistentCondition = useCallback(
        async (index: number) => {
            if (targetSessionId === null) return;
            try {
                const model = await vfxPersistentRemove(targetSessionId, index);
                applyTargetModel(model);
                setStatusMessage('Removed persistent effect condition');
            } catch (error) {
                setStatusMessage(`Failed to remove condition: ${(error as Error).message}`);
            }
        },
        [targetSessionId, applyTargetModel]
    );

    // Type dropdown click-outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) setTypeDropdownOpen(false);
        };
        if (typeDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [typeDropdownOpen]);

    // ── Matrix ──
    const applyMatrix = useCallback(
        async (mat: number[]) => {
            try {
                if (!matrixModalState.systemKey || targetSessionId === null) return;
                const sys = targetSystems[matrixModalState.systemKey];
                if (!sys) return;
                const model = await vfxSetMatrix(targetSessionId, sys.path, mat.slice(0, 16));
                applyTargetModel(model);
                setStatusMessage(`Updated matrix for "${sys.particleName || sys.name}"`);
            } catch (error) {
                setStatusMessage(`Failed to update matrix: ${(error as Error).message}`);
            } finally {
                setShowMatrixModal(false);
                setMatrixModalState({ systemKey: null, initial: null });
            }
        },
        [matrixModalState, targetSessionId, targetSystems, applyTargetModel]
    );

    const handleOpenNewSystemModal = useCallback(() => {
        setNewSystemName('');
        setShowNewSystemModal(true);
    }, []);

    return {
        // state
        targetPath,
        donorPath,
        targetSessionId,
        donorSessionId,
        targetModel,
        donorModel,
        targetSystems,
        donorSystems,
        setDonorPath,
        setDonorTempRoot,
        statusMessage,
        setStatusMessage,
        isProcessing,
        processingText,
        selectedTargetSystem,
        setSelectedTargetSystem,
        collapsedTargetSystems,
        collapsedDonorSystems,
        handleToggleTargetCollapse,
        handleToggleDonorCollapse,
        isPortAllLoading,
        hasResourceResolver,
        hasSkinCharacterData,
        targetFilter,
        donorFilter,
        setTargetFilter,
        setDonorFilter,
        enableTargetEmitterSearch,
        setEnableTargetEmitterSearch,
        enableDonorEmitterSearch,
        setEnableDonorEmitterSearch,
        actionsMenuAnchor,
        setActionsMenuAnchor,
        showNamePromptModal,
        setShowNamePromptModal,
        showNewSystemModal,
        setShowNewSystemModal,
        showMatrixModal,
        setShowMatrixModal,
        showIdleParticleModal,
        setShowIdleParticleModal,
        showChildModal,
        showPersistentModal,
        setShowPersistentModal,
        namePromptValue,
        setNamePromptValue,
        newSystemName,
        setNewSystemName,
        matrixModalState,
        setMatrixModalState,
        pressedSystemKey,
        setPressedSystemKey,
        dragStartedKey,
        dragStartedKeyRef,
        setDragStartedKey,
        draggedEmitter,
        setDraggedEmitter,
        isDragOverVfx,
        setIsDragOverVfx,
        pendingDrop,
        setPendingDrop,
        renamingEmitter,
        setRenamingEmitter,
        renamingSystem,
        setRenamingSystem,
        canUndo,
        canRedo,
        filteredTargetSystems,
        filteredDonorSystems,
        targetListRef,
        donorListRef,
        dragEnterCounter,
        trimTargetNames,
        setTrimTargetNames,
        trimDonorNames,
        setTrimDonorNames,
        setFileSaved,
        // file
        processTargetBin,
        processDonorBin,
        handleOpenTargetBin,
        handleOpenDonorBin,
        handleSave,
        hasChangesToSave,
        // mutations
        handlePortEmitter,
        handlePortAllEmitters,
        handlePortAllSystems,
        handleInsertDonorSystem,
        handleMoveEmitter,
        handleDeleteEmitter,
        handleDeleteAllEmitters,
        handleRenameEmitter,
        handleRenameSystem,
        handleCreateNewSystem,
        handleOpenNewSystemModal,
        handleUndo,
        handleRedo,
        // idle
        selectedSystemForIdle,
        setSelectedSystemForIdle,
        idleBonesList,
        setIdleBonesList,
        isEditingIdle,
        setIsEditingIdle,
        existingIdleBones,
        setExistingIdleBones,
        handleAddIdleParticles,
        handleConfirmIdleParticles,
        handleUpsertIdleParticlesForSystem,
        handleRemoveIdleParticlesByEffectKey,
        // child
        isEditMode,
        selectedSystemForChild,
        selectedChildSystem,
        setSelectedChildSystem,
        emitterName,
        setEmitterName,
        availableVfxSystems,
        childParticleRate,
        setChildParticleRate,
        childParticleLifetime,
        setChildParticleLifetime,
        childParticleBindWeight,
        setChildParticleBindWeight,
        childParticleIsSingle,
        setChildParticleIsSingle,
        childParticleTimeBeforeFirstEmission,
        setChildParticleTimeBeforeFirstEmission,
        childParticleTranslationOverrideX,
        setChildParticleTranslationOverrideX,
        childParticleTranslationOverrideY,
        setChildParticleTranslationOverrideY,
        childParticleTranslationOverrideZ,
        setChildParticleTranslationOverrideZ,
        handleAddChildParticles,
        handleEditChildParticle,
        handleConfirmChildParticles,
        resetChildState,
        // persistent
        persistentPreset,
        setPersistentPreset,
        persistentVfx,
        setPersistentVfx,
        persistentShowSubmeshes,
        setPersistentShowSubmeshes,
        persistentHideSubmeshes,
        setPersistentHideSubmeshes,
        customShowSubmeshInput,
        setCustomShowSubmeshInput,
        customHideSubmeshInput,
        setCustomHideSubmeshInput,
        vfxSearchTerms,
        setVfxSearchTerms,
        vfxDropdownOpen,
        setVfxDropdownOpen,
        existingConditions,
        showExistingConditions,
        setShowExistingConditions,
        editingConditionIndex,
        effectKeyOptions,
        typeDropdownOpen,
        setTypeDropdownOpen,
        typeDropdownRef,
        availableSubmeshes,
        typeOptions,
        handleOpenPersistent,
        handleAddCustomShowSubmesh,
        handleAddCustomHideSubmesh,
        handleRemoveCustomSubmesh,
        handleLoadExistingCondition,
        handleApplyPersistent,
        handleRemovePersistentCondition,
        // matrix
        applyMatrix,
    };
}
