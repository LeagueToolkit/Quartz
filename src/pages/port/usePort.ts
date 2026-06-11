import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pickBinPath, loadBin, saveBinText } from './utils/loadBin';
import {
    parseVfxEmitters,
    loadEmitterData,
    replaceEmittersInSystem,
    generateModifiedPythonFromSystems,
    type VfxSystem,
    type VfxSystemMap,
    type VfxEmitter,
} from './utils/vfxEmitterParser';
import { extractVFXSystem } from './utils/vfxSystemParser';
import { insertVFXSystemIntoFile, insertVFXSystemWithPreservedNames, generateUniqueSystemName } from './utils/vfxInsertSystem';
import { replaceSystemBlockInFile, parseSystemMatrix, upsertSystemMatrix } from './utils/matrixUtils';
import { removeEmitterBlockFromSystem } from './utils/pyContentUtils';
import {
    extractColorsFromEmitterContent,
    extractTexturesFromEmitterContent,
} from './utils/vfxUtils';
import {
    addChildParticleEffect,
    findAvailableVfxSystems,
    extractChildParticleData,
    updateChildParticleEmitter,
    type AvailableVfxSystem,
    type DeletedEmittersMap,
} from './utils/childParticlesManager';
import {
    addIdleParticleEffect,
    hasIdleParticleEffect,
    extractParticleName,
    getAllIdleParticleBones,
    removeAllIdleParticlesForSystem,
    removeAllIdleParticlesByEffectKey,
    type BoneConfig,
} from './utils/idleParticlesManager';
import {
    scanEffectKeys,
    extractSubmeshes,
    insertOrUpdatePersistentEffect,
    insertMultiplePersistentEffects,
    ensureResolverMapping,
    resolveEffectKey,
    extractExistingPersistentConditions,
    type EffectKeyOption,
    type PersistentPreset,
    type PersistentVfxItem,
    type PersistentCondition,
} from './utils/persistentEffectsManager';

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

export interface UndoEntry {
    action: string;
    timestamp: number;
    targetSystems: VfxSystemMap;
    targetPyContent: string;
    selectedTargetSystem: string | null;
    deletedEmitters: DeletedEmittersMap;
}

export interface PendingDrop {
    fullContent: string;
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
    // File state
    const [targetPath, setTargetPath] = useState('This will show target bin');
    const [donorPath, setDonorPath] = useState('This will show donor bin');
    const [targetPyContent, setTargetPyContent] = useState('');
    const [donorPyContent, setDonorPyContent] = useState('');
    const [targetSystems, setTargetSystems] = useState<VfxSystemMap>({});
    const [donorSystems, setDonorSystems] = useState<VfxSystemMap>({});

    // Shared state
    const [statusMessage, setStatusMessage] = useState('Ready - Select files to begin porting');
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingText, setProcessingText] = useState('');
    const [fileSaved, setFileSaved] = useState(true);
    const [deletedEmitters, setDeletedEmitters] = useState<DeletedEmittersMap>(new Map());
    const [selectedTargetSystem, setSelectedTargetSystem] = useState<string | null>(null);
    const [collapsedTargetSystems, setCollapsedTargetSystems] = useState<Set<string>>(new Set());
    const [collapsedDonorSystems, setCollapsedDonorSystems] = useState<Set<string>>(new Set());
    const [recentCreatedSystemKeys, setRecentCreatedSystemKeys] = useState<string[]>([]);
    const [isPortAllLoading, setIsPortAllLoading] = useState(false);

    // Filters
    const [targetFilter, setTargetFilter] = useState('');
    const [donorFilter, setDonorFilter] = useState('');
    const [enableTargetEmitterSearch, setEnableTargetEmitterSearch] = useState(false);
    const [enableDonorEmitterSearch, setEnableDonorEmitterSearch] = useState(false);

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
    const [dragStartedKey, setDragStartedKey] = useState<string | null>(null);
    const [draggedEmitter, setDraggedEmitter] = useState<{ sourceSystemKey: string; emitterName: string } | null>(null);
    const [isDragOverVfx, setIsDragOverVfx] = useState(false);
    const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);

    // Rename
    const [renamingEmitter, setRenamingEmitter] = useState<{ systemKey: string; emitterName: string; newName: string } | null>(null);
    const [renamingSystem, setRenamingSystem] = useState<{ systemKey: string; newName: string } | null>(null);

    // History
    const [undoHistory, setUndoHistory] = useState<UndoEntry[]>([]);

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
    const [existingConditions, setExistingConditions] = useState<PersistentCondition[]>([]);
    const [showExistingConditions, setShowExistingConditions] = useState(false);
    const [editingConditionIndex, setEditingConditionIndex] = useState<number | null>(null);
    const [effectKeyOptions, setEffectKeyOptions] = useState<EffectKeyOption[]>([]);
    const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
    const [availableSubmeshes, setAvailableSubmeshes] = useState<string[]>([]);
    const typeDropdownRef = useRef<HTMLDivElement | null>(null);

    // Refs
    const targetListRef = useRef<HTMLDivElement | null>(null);
    const donorListRef = useRef<HTMLDivElement | null>(null);
    const dragEnterCounter = useRef(0);
    const targetPyContentRef = useRef('');
    const donorPyContentRef = useRef('');

    useEffect(() => {
        targetPyContentRef.current = targetPyContent;
    }, [targetPyContent]);
    useEffect(() => {
        donorPyContentRef.current = donorPyContent;
    }, [donorPyContent]);

    const hasResourceResolver = useMemo(() => /\bResourceResolver\s*\{/m.test(targetPyContent || ''), [targetPyContent]);
    const hasSkinCharacterData = useMemo(() => /=\s*SkinCharacterDataProperties\s*\{/m.test(targetPyContent || ''), [targetPyContent]);

    // History
    const saveStateToHistory = useCallback(
        (action: string) => {
            const entry: UndoEntry = {
                action,
                timestamp: Date.now(),
                targetSystems: JSON.parse(JSON.stringify(targetSystems || {})),
                targetPyContent,
                selectedTargetSystem,
                deletedEmitters: new Map(deletedEmitters),
            };
            setUndoHistory((prev) => [...prev, entry].slice(-10));
        },
        [targetSystems, targetPyContent, selectedTargetSystem, deletedEmitters]
    );

    const handleUndo = useCallback(() => {
        setUndoHistory((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            setTargetSystems(last.targetSystems || {});
            setTargetPyContent(last.targetPyContent);
            setSelectedTargetSystem(last.selectedTargetSystem);
            setDeletedEmitters(last.deletedEmitters || new Map());
            setFileSaved(false);
            return prev.slice(0, -1);
        });
    }, []);

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
        const safe = targetSystems || {};
        if (!targetFilter) return Object.values(safe);
        const term = targetFilter.toLowerCase();
        return Object.values(safe)
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
    }, [targetSystems, targetFilter, enableTargetEmitterSearch]);

    const filteredDonorSystems = useMemo(() => {
        const safe = donorSystems || {};
        if (!donorFilter) return Object.values(safe);
        const term = donorFilter.toLowerCase();
        return Object.values(safe)
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
    }, [donorSystems, donorFilter, enableDonorEmitterSearch]);

    // File loading
    const processTargetBin = useCallback(async (filePath: string) => {
        if (!filePath) return;
        try {
            setIsProcessing(true);
            setTargetPath(filePath);
            setStatusMessage('Opening target file...');
            setProcessingText('Loading file...');
            const loaded = await loadBin(filePath);
            setTargetPyContent(loaded.text);
            setFileSaved(true);
            setTargetSystems(loaded.systems);
            setCollapsedTargetSystems(new Set(Object.keys(loaded.systems)));
            setDeletedEmitters(new Map());
            setUndoHistory([]);
            setSelectedTargetSystem(null);
            setStatusMessage(`Target bin loaded: ${Object.keys(loaded.systems).length} systems found`);
        } catch (error) {
            setStatusMessage(`Error: ${(error as Error).message}`);
        } finally {
            setIsProcessing(false);
            setProcessingText('');
        }
    }, []);

    const processDonorBin = useCallback(async (filePath: string) => {
        if (!filePath) return;
        try {
            setIsProcessing(true);
            setDonorPath(filePath);
            setStatusMessage('Opening donor bin...');
            setProcessingText('Loading file...');
            const loaded = await loadBin(filePath);
            setDonorPyContent(loaded.text);
            setDonorSystems(loaded.systems);
            setCollapsedDonorSystems(new Set(Object.keys(loaded.systems)));
            setStatusMessage(`Donor bin loaded: ${Object.keys(loaded.systems).length} systems found`);
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

    // Save
    const handleSave = useCallback(async () => {
        try {
            setIsProcessing(true);
            setProcessingText('Saving .bin...');
            setStatusMessage('Saving modified target file...');
            setFileSaved(false);

            const freshPyContent = targetPyContentRef.current || targetPyContent;
            if (!freshPyContent || Object.keys(targetSystems || {}).length === 0) {
                setStatusMessage('No target file loaded');
                setIsProcessing(false);
                setProcessingText('');
                return;
            }

            const existingPersistent = extractExistingPersistentConditions(freshPyContent);
            let modifiedContent = freshPyContent;
            const preSaveSystems = targetSystems || {};

            const hasDeleted = deletedEmitters.size > 0;
            let hasEmittersWithoutFullData = false;
            for (const sName in targetSystems) {
                if (targetSystems[sName].emitters?.some((e) => !e.originalContent)) {
                    hasEmittersWithoutFullData = true;
                    break;
                }
            }

            if (hasDeleted || hasEmittersWithoutFullData) {
                const systemsForSave: VfxSystemMap = {};
                for (const [key, sys] of Object.entries(targetSystems)) {
                    const emitters = sys.emitters?.map((e) => (e.originalContent ? e : loadEmitterData(sys, e.name) || e)) || [];
                    systemsForSave[key] = { ...sys, emitters };
                }
                modifiedContent = generateModifiedPythonFromSystems(freshPyContent, systemsForSave);
            }

            let finalContent = modifiedContent;
            try {
                const nowPersistent = extractExistingPersistentConditions(modifiedContent) || [];
                const needsReinsert =
                    (existingPersistent || []).length > 0 &&
                    (nowPersistent.length === 0 ||
                        existingPersistent.map((c) => c.originalText).join('') !== nowPersistent.map((c) => c.originalText).join(''));
                if (needsReinsert) finalContent = insertMultiplePersistentEffects(modifiedContent, existingPersistent);
            } catch {
                /* noop */
            }

            await saveBinText(finalContent, targetPath);

            setStatusMessage('Successfully saved');
            setTargetPyContent(finalContent);
            const reparsedSystems = parseVfxEmitters(finalContent) || {};
            const mergedSystems = Object.fromEntries(
                Object.entries(reparsedSystems).map(([key, sys]) => {
                    const priorByKey = preSaveSystems[key];
                    const priorByName = Object.values(preSaveSystems).find(
                        (prev) => (prev?.particleName || prev?.name || prev?.key) === (sys?.particleName || sys?.name || sys?.key)
                    );
                    const prior = priorByKey || priorByName;
                    if (!prior) return [key, sys];
                    return [key, { ...sys }];
                })
            );
            setTargetSystems(mergedSystems);
            setDeletedEmitters(new Map());
            setFileSaved(true);
        } catch (e) {
            setStatusMessage(`Error saving file: ${(e as Error).message}`);
            setFileSaved(false);
        } finally {
            setIsProcessing(false);
            setProcessingText('');
        }
    }, [targetPyContent, targetSystems, deletedEmitters, targetPath]);

    const hasChangesToSave = useCallback(() => !fileSaved, [fileSaved]);

    // ── Mutations ──
    const handlePortEmitter = useCallback(
        (donorSystemKey: string, emName: string, _hasResolver?: boolean, targetSystemKeyOverride: string | null = null) => {
            const targetSystemKey = targetSystemKeyOverride || selectedTargetSystem;
            if (!targetSystemKey) {
                setStatusMessage('Please select a target system first');
                return;
            }
            const donorSystem = donorSystems[donorSystemKey];
            if (!emName) return;
            try {
                const fullEmitterData = loadEmitterData(donorSystem, emName);
                if (!fullEmitterData) return;

                const targetSystem = targetSystems[targetSystemKey];
                let finalEmitterName = emName;
                if (targetSystem && targetSystem.emitters) {
                    const existingNames = new Set(targetSystem.emitters.map((e) => e.name));
                    if (existingNames.has(emName)) {
                        let suffix = 1;
                        while (existingNames.has(`${emName}_${suffix}`)) suffix++;
                        finalEmitterName = `${emName}_${suffix}`;
                        fullEmitterData.name = finalEmitterName;
                        if (fullEmitterData.originalContent) {
                            fullEmitterData.originalContent = fullEmitterData.originalContent.replace(
                                /emitterName:\s*string\s*=\s*"([^"]+)"/,
                                `emitterName: string = "${finalEmitterName}"`
                            );
                        }
                    }
                }

                saveStateToHistory(`Port emitter "${finalEmitterName}" to "${targetSystemKey}"`);

                const updatedTargetSystems = { ...targetSystems };
                if (updatedTargetSystems[targetSystemKey]) {
                    const newEmitterList = [...(updatedTargetSystems[targetSystemKey].emitters || []), fullEmitterData];
                    const targetSys = { ...updatedTargetSystems[targetSystemKey], emitters: newEmitterList };

                    const targetSysKeyForReplace = targetSys.key || targetSystemKey;
                    const baseText = targetPyContentRef.current || targetPyContent || '';
                    let currentSystemContent = targetSys.rawContent || '';
                    try {
                        currentSystemContent = extractVFXSystem(baseText, targetSysKeyForReplace)?.fullContent || currentSystemContent;
                    } catch {
                        /* noop */
                    }
                    const emitterBlocks = newEmitterList.map((e) => {
                        if (e.originalContent) return e.originalContent;
                        const loaded = loadEmitterData(targetSys, e.name);
                        if (loaded?.originalContent) return loaded.originalContent;
                        return `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
                    });
                    const newSystemText = replaceEmittersInSystem(currentSystemContent || '', emitterBlocks);
                    const newFile = replaceSystemBlockInFile(baseText, targetSysKeyForReplace, newSystemText);
                    updatedTargetSystems[targetSystemKey] = { ...targetSys, rawContent: newSystemText };
                    setTargetSystems(updatedTargetSystems);
                    setTargetPyContent(newFile);
                    targetPyContentRef.current = newFile;
                    setFileSaved(false);
                    setStatusMessage(`Ported emitter "${finalEmitterName}"`);
                }
            } catch {
                setStatusMessage('Error porting emitter');
            }
        },
        [selectedTargetSystem, donorSystems, targetSystems, targetPyContent, saveStateToHistory]
    );

    const handlePortAllEmitters = useCallback(
        (donorSystemKey: string) => {
            if (!selectedTargetSystem) {
                setStatusMessage('Please select a target system first');
                return;
            }
            const donorSystem = donorSystems[donorSystemKey];
            if (!donorSystem || !donorSystem.emitters || donorSystem.emitters.length === 0) return;
            try {
                saveStateToHistory(`Port all emitters from "${donorSystem.name}"`);
                const origTargetSystem = targetSystems[selectedTargetSystem];
                const newEmitters: VfxEmitter[] = [...(origTargetSystem.emitters || [])];
                const existingNames = new Set(newEmitters.map((e) => e.name));
                let portedCount = 0;
                for (let i = 0; i < donorSystem.emitters.length; i++) {
                    const emName = donorSystem.emitters[i].name;
                    if (!emName) continue;
                    const fullEmitterData = loadEmitterData(donorSystem, emName);
                    if (!fullEmitterData) continue;
                    let finalEmitterName = emName;
                    if (existingNames.has(emName)) {
                        let suffix = 1;
                        while (existingNames.has(`${emName}_${suffix}`)) suffix++;
                        finalEmitterName = `${emName}_${suffix}`;
                        fullEmitterData.name = finalEmitterName;
                        if (fullEmitterData.originalContent) {
                            fullEmitterData.originalContent = fullEmitterData.originalContent.replace(
                                /emitterName:\s*string\s*=\s*"([^"]+)"/,
                                `emitterName: string = "${finalEmitterName}"`
                            );
                        }
                    }
                    newEmitters.push({ name: finalEmitterName, originalContent: fullEmitterData.originalContent || fullEmitterData.rawContent });
                    existingNames.add(finalEmitterName);
                    portedCount++;
                }
                const targetSysKey = selectedTargetSystem;
                const targetSys = { ...origTargetSystem, emitters: newEmitters };
                const targetSysKeyForReplace = targetSys.key || targetSysKey;
                let currentSystemContent = targetSys.rawContent || '';
                try {
                    currentSystemContent = extractVFXSystem(targetPyContent, targetSysKeyForReplace)?.fullContent || currentSystemContent;
                } catch {
                    /* noop */
                }
                const emitterBlocks = newEmitters.map((e) => {
                    if (e.originalContent) return e.originalContent;
                    const loaded = loadEmitterData(targetSys, e.name);
                    if (loaded?.originalContent) return loaded.originalContent;
                    return `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
                });
                const newSystemText = replaceEmittersInSystem(currentSystemContent || '', emitterBlocks);
                const newFile = replaceSystemBlockInFile(targetPyContent || '', targetSysKeyForReplace, newSystemText);
                setTargetPyContent(newFile);
                setTargetSystems({ ...targetSystems, [targetSysKey]: { ...targetSys, rawContent: newSystemText } });
                setFileSaved(false);
                setStatusMessage(`Ported ${portedCount} emitters`);
            } catch {
                setStatusMessage('Error porting all emitters');
            }
        },
        [selectedTargetSystem, donorSystems, targetSystems, targetPyContent, saveStateToHistory]
    );

    const handleMoveEmitter = useCallback(
        (sourceSystemKey: string, emName: string, targetSystemKey: string) => {
            if (sourceSystemKey === targetSystemKey) {
                setStatusMessage('Cannot move emitter to the same system');
                return;
            }
            const sourceSystem = targetSystems[sourceSystemKey];
            const targetSystem = targetSystems[targetSystemKey];
            if (!sourceSystem || !targetSystem) {
                setStatusMessage('Source or target system not found');
                return;
            }
            const fullEmitterData = loadEmitterData(sourceSystem, emName);
            if (!fullEmitterData) {
                setStatusMessage(`Failed to load emitter data for "${emName}"`);
                return;
            }
            let finalEmitterName = emName;
            if (targetSystem.emitters) {
                const existingNames = new Set(targetSystem.emitters.map((e) => e.name));
                if (existingNames.has(emName)) {
                    let suffix = 1;
                    while (existingNames.has(`${emName}_${suffix}`)) suffix++;
                    finalEmitterName = `${emName}_${suffix}`;
                    fullEmitterData.name = finalEmitterName;
                    if (fullEmitterData.originalContent) {
                        fullEmitterData.originalContent = fullEmitterData.originalContent.replace(
                            /emitterName:\s*string\s*=\s*"([^"]+)"/i,
                            `emitterName: string = "${finalEmitterName}"`
                        );
                    }
                }
            }
            try {
                saveStateToHistory(`Move emitter "${emName}" from "${sourceSystem.name}" to "${targetSystem.name}"`);
                const sourceSystemContent = sourceSystem.rawContent || '';
                const remainingEmitters = (sourceSystem.emitters || []).filter((e) => e.name !== emName);
                const remainingEmitterBlocks = remainingEmitters.map((e) => {
                    if (e.originalContent) return e.originalContent;
                    const loaded = loadEmitterData(sourceSystem, e.name);
                    if (loaded?.originalContent) return loaded.originalContent;
                    return `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
                });
                const updatedSourceContent = replaceEmittersInSystem(sourceSystemContent, remainingEmitterBlocks);
                const updatedSourceSystemContent = replaceSystemBlockInFile(targetPyContent || '', sourceSystemKey, updatedSourceContent);
                const targetSystemContent = targetSystem.rawContent || '';
                let targetSysText = targetSystemContent;
                try {
                    targetSysText = updatedSourceSystemContent
                        ? extractVFXSystem(updatedSourceSystemContent, targetSystemKey)?.fullContent || targetSystemContent
                        : targetSystemContent;
                } catch {
                    /* noop */
                }
                const targetEmitters = targetSystem.emitters || [];
                const targetEmitterBlocks = targetEmitters.map((e) => {
                    if (e.originalContent) return e.originalContent;
                    const loaded = loadEmitterData(targetSystem, e.name);
                    if (loaded?.originalContent) return loaded.originalContent;
                    return `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
                });
                targetEmitterBlocks.push(fullEmitterData.originalContent || `VfxEmitterDefinitionData {\n    emitterName: string = "${finalEmitterName}"\n}`);
                const updatedTargetSystemContent = replaceEmittersInSystem(targetSysText, targetEmitterBlocks);
                const updatedTargetContent = replaceSystemBlockInFile(updatedSourceSystemContent || targetPyContent || '', targetSystemKey, updatedTargetSystemContent);
                setTargetPyContent(updatedTargetContent);
                setFileSaved(false);
                setTargetSystems(parseVfxEmitters(updatedTargetContent) || {});
                setStatusMessage(`Moved emitter "${emName}"${finalEmitterName !== emName ? ` (renamed to "${finalEmitterName}")` : ''}`);
            } catch {
                setStatusMessage('Error moving emitter');
            }
        },
        [targetSystems, targetPyContent, saveStateToHistory]
    );

    const handleDeleteEmitter = useCallback(
        (systemKey: string, emitterIndex: number, isTarget: boolean, emName: string | null = null) => {
            const systems = isTarget ? targetSystems : donorSystems;
            const setSystems = isTarget ? setTargetSystems : setDonorSystems;
            if (isTarget) saveStateToHistory(`Delete emitter from ${systemKey}`);

            const updatedSystems = { ...systems };
            if (updatedSystems[systemKey] && updatedSystems[systemKey].emitters) {
                let emitter: VfxEmitter;
                let actualIndex: number;
                if (emName) {
                    actualIndex = updatedSystems[systemKey].emitters.findIndex((e) => e.name === emName);
                    if (actualIndex === -1) {
                        setStatusMessage(`Emitter "${emName}" not found in system`);
                        return;
                    }
                    emitter = updatedSystems[systemKey].emitters[actualIndex];
                } else {
                    emitter = updatedSystems[systemKey].emitters[emitterIndex];
                    actualIndex = emitterIndex;
                }

                const newEmittersList = [...updatedSystems[systemKey].emitters];
                newEmittersList.splice(actualIndex, 1);
                updatedSystems[systemKey] = { ...updatedSystems[systemKey], emitters: newEmittersList };

                if (isTarget) {
                    const currentSys = systems[systemKey] || ({} as VfxSystem);
                    const currentRaw = currentSys.rawContent || '';
                    const newSystemRaw = removeEmitterBlockFromSystem(currentRaw, emitter.name);
                    if (newSystemRaw) {
                        updatedSystems[systemKey] = { ...updatedSystems[systemKey], rawContent: newSystemRaw };
                        const sysKeyForReplace = currentSys.key || systemKey;
                        const newFileText = replaceSystemBlockInFile(targetPyContentRef.current || targetPyContent || '', sysKeyForReplace, newSystemRaw);
                        setTargetPyContent(newFileText);
                        targetPyContentRef.current = newFileText;
                    }
                    if (emitter.name) {
                        setDeletedEmitters((prev) => {
                            const newMap = new Map(prev);
                            newMap.set(`${systemKey}:${emitter.name}`, { systemKey, emitterName: emitter.name });
                            return newMap;
                        });
                    }
                    setFileSaved(false);
                }
                setSystems(updatedSystems);
                setStatusMessage(`Deleted emitter "${emitter.name}" from ${isTarget ? 'target' : 'donor'} bin`);
            }
        },
        [targetSystems, donorSystems, targetPyContent, saveStateToHistory]
    );

    const handleDeleteAllEmitters = useCallback(
        (systemKey: string) => {
            const system = targetSystems[systemKey];
            if (!system || !system.emitters || system.emitters.length === 0) return;
            saveStateToHistory(`Delete all emitters from ${systemKey}`);
            try {
                const emitterNames = system.emitters.map((e) => e?.name).filter(Boolean) as string[];
                const updatedDeletedEmitters = new Map(deletedEmitters);
                emitterNames.forEach((name) => updatedDeletedEmitters.set(`${systemKey}:${name}`, { systemKey, emitterName: name }));

                const updatedSystems = { ...targetSystems };
                updatedSystems[systemKey] = { ...updatedSystems[systemKey], emitters: [] };

                const currentSys = targetSystems[systemKey] || ({} as VfxSystem);
                const currentRaw = currentSys.rawContent || '';
                const newSystemRaw = replaceEmittersInSystem(currentRaw, []);
                if (newSystemRaw) {
                    const sysKeyForReplace = currentSys.key || systemKey;
                    const newFileText = replaceSystemBlockInFile(targetPyContent || '', sysKeyForReplace, newSystemRaw);
                    setTargetPyContent(newFileText);
                    updatedSystems[systemKey] = { ...updatedSystems[systemKey], rawContent: newSystemRaw };
                }

                setTargetSystems(updatedSystems);
                setDeletedEmitters(updatedDeletedEmitters);
                setFileSaved(false);
                setStatusMessage(`Deleted all emitters from "${systemKey}"`);
            } catch {
                /* noop */
            }
        },
        [targetSystems, deletedEmitters, targetPyContent, saveStateToHistory]
    );

    const handleRenameEmitter = useCallback(
        (systemKey: string, oldEmitterName: string, newEmitterName: string) => {
            const name = (typeof newEmitterName === 'string' ? newEmitterName : '').trim();
            if (!name) {
                setStatusMessage('Emitter name cannot be empty');
                return;
            }
            if (newEmitterName === oldEmitterName) {
                setRenamingEmitter(null);
                return;
            }
            saveStateToHistory(`Rename emitter "${oldEmitterName}" to "${newEmitterName}"`);

            const system = targetSystems[systemKey];
            if (!system) {
                setStatusMessage(`System "${systemKey}" not found`);
                setRenamingEmitter(null);
                return;
            }
            const existingEmitter = system.emitters?.find((e) => e.name === newEmitterName);
            if (existingEmitter) {
                setStatusMessage(`Emitter "${newEmitterName}" already exists in this system`);
                setRenamingEmitter(null);
                return;
            }

            const systemRawContent = system.rawContent || '';
            const lines = systemRawContent.split('\n');
            let inTargetEmitter = false;
            let emitterBracketDepth = 0;
            let foundEmitterName = false;
            const updatedLines: string[] = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                if (/^VfxEmitterDefinitionData\s*\{/i.test(trimmed)) {
                    inTargetEmitter = true;
                    emitterBracketDepth = 1;
                    foundEmitterName = false;
                    updatedLines.push(line);
                    continue;
                }
                if (inTargetEmitter) {
                    const ob = (line.match(/\{/g) || []).length;
                    const cb = (line.match(/\}/g) || []).length;
                    emitterBracketDepth += ob - cb;
                    if (!foundEmitterName && /emitterName:\s*string\s*=\s*"/i.test(trimmed)) {
                        const m = trimmed.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
                        if (m && m[1] === oldEmitterName) {
                            const indent = line.match(/^(\s*)/)?.[1] || '';
                            updatedLines.push(`${indent}emitterName: string = "${newEmitterName}"`);
                            foundEmitterName = true;
                            continue;
                        }
                    }
                    updatedLines.push(line);
                    if (emitterBracketDepth <= 0) inTargetEmitter = false;
                } else {
                    updatedLines.push(line);
                }
            }

            const updatedSystemRawContent = updatedLines.join('\n');
            const sysKeyForReplace = system.key || systemKey;
            const newFileText = replaceSystemBlockInFile(targetPyContent || '', sysKeyForReplace, updatedSystemRawContent);
            setTargetPyContent(newFileText);
            setTargetSystems((prev) => ({
                ...prev,
                [systemKey]: {
                    ...prev[systemKey],
                    rawContent: updatedSystemRawContent,
                    emitters: prev[systemKey].emitters.map((e) => (e.name === oldEmitterName ? { ...e, name: newEmitterName } : e)),
                },
            }));
            setFileSaved(false);

            const oldKey = `${systemKey}:${oldEmitterName}`;
            if (deletedEmitters.has(oldKey)) {
                setDeletedEmitters((prev) => {
                    const newMap = new Map(prev);
                    newMap.delete(oldKey);
                    return newMap;
                });
            }
            setStatusMessage(`Renamed emitter "${oldEmitterName}" to "${newEmitterName}"`);
            setRenamingEmitter(null);
        },
        [targetSystems, targetPyContent, deletedEmitters, saveStateToHistory]
    );

    const handleRenameSystem = useCallback(
        (systemKey: string, newSystemName: string) => {
            const name = (typeof newSystemName === 'string' ? newSystemName : '').trim();
            if (!name) {
                setStatusMessage('System name cannot be empty');
                return;
            }
            const system = targetSystems[systemKey];
            if (!system) {
                setStatusMessage(`System "${systemKey}" not found`);
                setRenamingSystem(null);
                return;
            }
            const oldSystemName = system.name || system.key;
            if (newSystemName === oldSystemName) {
                setRenamingSystem(null);
                return;
            }
            const existingSystem = Object.values(targetSystems).find((s) => (s.name === newSystemName || s.key === newSystemName) && s.key !== systemKey);
            if (existingSystem) {
                setStatusMessage(`System "${newSystemName}" already exists`);
                setRenamingSystem(null);
                return;
            }

            saveStateToHistory(`Rename system "${oldSystemName}" to "${newSystemName}"`);

            let updatedContent = targetPyContent || '';
            const escapedOldKey = systemKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const oldKeyPattern = systemKey.startsWith('0x')
                ? new RegExp(`^\\s*${escapedOldKey}\\s*=\\s*VfxSystemDefinitionData\\s*\\{`, 'mi')
                : new RegExp(`^\\s*"${escapedOldKey}"\\s*=\\s*VfxSystemDefinitionData\\s*\\{`, 'mi');
            const newKey = newSystemName.startsWith('0x') ? newSystemName : `"${newSystemName}"`;
            updatedContent = updatedContent.replace(oldKeyPattern, (match) => {
                const leadingWhitespace = match.match(/^(\s*)/)?.[1] || '';
                return `${leadingWhitespace}${newKey} = VfxSystemDefinitionData {`;
            });

            const lines = updatedContent.split('\n');
            let inTargetSystem = false;
            let systemBracketDepth = 0;
            const escapedNewKey = newKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const systemHeaderPattern = new RegExp(`${escapedNewKey}\\s*=\\s*VfxSystemDefinitionData\\s*\\{`, 'i');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                if (systemHeaderPattern.test(trimmed)) {
                    inTargetSystem = true;
                    systemBracketDepth = 1;
                    continue;
                }
                if (inTargetSystem) {
                    const ob = (line.match(/\{/g) || []).length;
                    const cb = (line.match(/\}/g) || []).length;
                    systemBracketDepth += ob - cb;
                    if (/particleName:\s*string\s*=\s*"/i.test(trimmed)) lines[i] = line.replace(/particleName:\s*string\s*=\s*"[^"]*"/i, `particleName: string = "${newSystemName}"`);
                    if (/particlePath:\s*string\s*=\s*"/i.test(trimmed)) lines[i] = line.replace(/particlePath:\s*string\s*=\s*"[^"]*"/i, `particlePath: string = "${newSystemName}"`);
                    if (systemBracketDepth <= 0) {
                        inTargetSystem = false;
                        break;
                    }
                }
            }

            let inResourceMap = false;
            let resourceMapDepth = 0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                if (/resourceMap:\s*map\[hash,link\]\s*=\s*\{/i.test(trimmed)) {
                    inResourceMap = true;
                    resourceMapDepth = 1;
                    continue;
                }
                if (inResourceMap) {
                    const ob = (line.match(/\{/g) || []).length;
                    const cb = (line.match(/\}/g) || []).length;
                    resourceMapDepth += ob - cb;
                    const entryMatch = trimmed.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/);
                    if (entryMatch) {
                        const entryKey = entryMatch[1] || entryMatch[2];
                        const entryValue = entryMatch[3] || entryMatch[4];
                        const oldNameClean = oldSystemName.replace(/^"|"$/g, '');
                        const entryKeyClean = entryKey.replace(/^"|"$/g, '');
                        const entryValueClean = entryValue.replace(/^"|"$/g, '');
                        const keyMatches = entryKeyClean === oldNameClean || entryKeyClean === oldSystemName || entryKeyClean.toLowerCase() === oldNameClean.toLowerCase();
                        const valueMatches =
                            entryValueClean === oldNameClean ||
                            entryValueClean === oldSystemName ||
                            entryValueClean.endsWith('/' + oldNameClean) ||
                            entryValueClean.endsWith('/' + oldSystemName) ||
                            entryValueClean.toLowerCase() === oldNameClean.toLowerCase() ||
                            entryValueClean.toLowerCase().endsWith('/' + oldNameClean.toLowerCase());
                        if (keyMatches || valueMatches) {
                            let finalEntryKey = entryKey;
                            let finalEntryValue = entryValue;
                            if (keyMatches) finalEntryKey = newSystemName;
                            if (valueMatches) finalEntryValue = newSystemName;
                            const fk = finalEntryKey.startsWith('0x') ? finalEntryKey : `"${finalEntryKey}"`;
                            const fv = finalEntryValue.startsWith('0x') ? finalEntryValue : `"${finalEntryValue}"`;
                            const indent = line.match(/^(\s*)/)?.[1] || '            ';
                            lines[i] = `${indent}${fk} = ${fv}`;
                        }
                    }
                    if (resourceMapDepth <= 0) inResourceMap = false;
                }
            }

            updatedContent = lines.join('\n');
            setTargetPyContent(updatedContent);
            setFileSaved(false);
            try {
                setTargetSystems(parseVfxEmitters(updatedContent) || {});
            } catch {
                /* noop */
            }
            if (selectedTargetSystem === systemKey) setSelectedTargetSystem(newSystemName);
            setStatusMessage(`Renamed system "${oldSystemName}" to "${newSystemName}"`);
            setRenamingSystem(null);
        },
        [targetSystems, targetPyContent, selectedTargetSystem, saveStateToHistory]
    );

    const handleCreateNewSystem = useCallback(
        (name: string, closeModal?: (v: boolean) => void) => {
            try {
                const clean = (typeof name === 'string' ? name : '').trim();
                if (!clean) {
                    setStatusMessage('Enter a system name');
                    return;
                }
                saveStateToHistory(`Create new VFX system "${clean}"`);
                const minimalSystem = `"${clean}" = VfxSystemDefinitionData {\n    complexEmitterDefinitionData: list[pointer] = {}\n    particleName: string = "${clean}"\n    particlePath: string = "${clean}"\n}`;
                const updated = insertVFXSystemIntoFile(targetPyContent, minimalSystem, clean);
                setTargetPyContent(updated);
                setFileSaved(false);
                const systems = parseVfxEmitters(updated);
                const entries = Object.entries(systems);
                if (entries.length > 0) {
                    const nowTs = Date.now();
                    const createdKey = systems[clean] ? clean : entries[entries.length - 1][0];
                    setRecentCreatedSystemKeys([createdKey]);
                    const ordered: VfxSystemMap = {};
                    if (systems[createdKey]) ordered[createdKey] = { ...systems[createdKey], ported: true, portedAt: nowTs, createdAt: nowTs };
                    for (const [k, v] of entries) if (k !== createdKey) ordered[k] = v;
                    setTargetSystems(ordered);
                } else {
                    setTargetSystems(systems);
                }
                setStatusMessage(`Created VFX system "${clean}" and updated ResourceResolver`);
            } catch {
                setStatusMessage('Failed to create VFX system');
            } finally {
                if (typeof closeModal === 'function') closeModal(false);
            }
        },
        [targetPyContent, saveStateToHistory]
    );

    const handlePortAllSystems = useCallback(
        async (hasResolver: boolean, mode: 'normal' | 'replace-target' = 'normal') => {
            if (!targetPyContent || !donorPyContent) {
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
                setProcessingText(mode === 'replace-target' ? `Replacing target with ${donorSystemsList.length} donor VFX systems...` : `Porting ${donorSystemsList.length} VFX systems...`);
                saveStateToHistory(
                    mode === 'replace-target' ? `Replace target VFX systems with all ${donorSystemsList.length} donor systems` : `Port all ${donorSystemsList.length} VFX systems from donor`
                );

                let updatedContent = targetPyContent;
                if (mode === 'replace-target') {
                    updatedContent = stripVfxSystemsAndResolverEntries(updatedContent);
                }
                let successCount = 0;
                let errorCount = 0;

                for (let i = 0; i < donorSystemsList.length; i++) {
                    const system = donorSystemsList[i];
                    setProcessingText(`Porting system ${i + 1}/${donorSystemsList.length}: ${system.particleName || system.name}`);
                    try {
                        let fullContent = '';
                        try {
                            const extracted = extractVFXSystem(donorPyContent, system.name);
                            fullContent = extracted?.fullContent || extracted?.rawContent || system.rawContent || '';
                        } catch {
                            fullContent = system.rawContent || '';
                        }
                        if (!fullContent) {
                            errorCount++;
                            continue;
                        }
                        const originalName = system.particleName || system.name;
                        const keyPattern = new RegExp(`^\\s*("${escapeRegExp(originalName)}"|${escapeRegExp(originalName)})\\s*=\\s*VfxSystemDefinitionData\\s*\\{`, 'm');
                        const systemExists = keyPattern.test(updatedContent);
                        let finalSystemName = originalName;
                        if (systemExists) finalSystemName = generateUniqueSystemName(updatedContent, originalName);
                        if (systemExists) {
                            updatedContent = insertVFXSystemIntoFile(updatedContent, fullContent, finalSystemName);
                        } else {
                            updatedContent = insertVFXSystemWithPreservedNames(updatedContent, fullContent, finalSystemName, donorPyContent, { strictResolverCopy: true });
                        }
                        successCount++;
                    } catch {
                        errorCount++;
                    }
                    if (i % 3 === 0 || i === donorSystemsList.length - 1) await new Promise((r) => setTimeout(r, 0));
                }

                setTargetPyContent(updatedContent);
                setFileSaved(false);
                try {
                    setTargetSystems(parseVfxEmitters(updatedContent));
                } catch {
                    /* noop */
                }
                if (successCount > 0) {
                    const verb = mode === 'replace-target' ? 'Replaced target with' : 'Successfully ported';
                    setStatusMessage(`${verb} ${successCount} VFX systems${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
                } else {
                    setStatusMessage('Failed to port any VFX systems');
                }
            } catch {
                setStatusMessage('Failed to port VFX systems');
            } finally {
                setIsPortAllLoading(false);
                setIsProcessing(false);
                setProcessingText('');
            }
        },
        [targetPyContent, donorPyContent, donorSystems, saveStateToHistory]
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

    const handleAddIdleParticles = useCallback(
        (systemKey: string, systemName: string) => {
            if (!targetPyContent) {
                setStatusMessage('No target file loaded - Please open a target bin file first');
                return;
            }
            if (!hasResourceResolver || !hasSkinCharacterData) {
                setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
                return;
            }
            const particleName = extractParticleName(targetPyContent, systemKey);
            if (!particleName) {
                setStatusMessage(`VFX system "${systemName}" does not have particle emitters and cannot be used for idle particles.`);
                return;
            }
            if (hasIdleParticleEffect(targetPyContent, systemKey)) {
                const currentBones = getAllIdleParticleBones(targetPyContent, systemKey);
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
        [targetPyContent, hasResourceResolver, hasSkinCharacterData]
    );

    const handleConfirmIdleParticles = useCallback(() => {
        if (!selectedSystemForIdle || !targetPyContent) return;
        try {
            saveStateToHistory(`${isEditingIdle ? 'Update' : 'Add'} idle particles for "${selectedSystemForIdle.name}"`);
            const boneConfigs = normalizeBoneConfigs(
                idleBonesList.map((item) => ({ boneName: item.customBoneName && item.customBoneName.trim() ? item.customBoneName.trim() : item.boneName }))
            );
            let updatedContent = targetPyContent;
            if (isEditingIdle) updatedContent = removeAllIdleParticlesForSystem(updatedContent, selectedSystemForIdle.key);
            if (boneConfigs.length === 0) {
                setTargetPyContent(updatedContent);
                setFileSaved(false);
                setStatusMessage(`Removed all idle particles from "${selectedSystemForIdle.name}"`);
            } else {
                updatedContent = addIdleParticleEffect(updatedContent, selectedSystemForIdle.key, boneConfigs);
                setTargetPyContent(updatedContent);
                setFileSaved(false);
                const boneNames = boneConfigs.map((c) => c.boneName).join(', ');
                setStatusMessage(`${isEditingIdle ? 'Updated' : 'Added'} ${boneConfigs.length} idle particle(s) for "${selectedSystemForIdle.name}" on bones: ${boneNames}`);
            }
            setShowIdleParticleModal(false);
            setSelectedSystemForIdle(null);
            setIsEditingIdle(false);
            setExistingIdleBones([]);
            setIdleBonesList([]);
        } catch (error) {
            setStatusMessage(`Failed to add idle particles: ${(error as Error).message}`);
        }
    }, [selectedSystemForIdle, targetPyContent, isEditingIdle, idleBonesList, normalizeBoneConfigs, saveStateToHistory]);

    const handleUpsertIdleParticlesForSystem = useCallback(
        (systemKey: string, systemName: string, boneConfigs: BoneConfig[]) => {
            if (!targetPyContent || !systemKey) return;
            try {
                saveStateToHistory(`Upsert idle particles for "${systemName || systemKey}"`);
                const safeBones = normalizeBoneConfigs(boneConfigs);
                let updatedContent = removeAllIdleParticlesForSystem(targetPyContent, systemKey);
                if (safeBones.length === 0) {
                    setStatusMessage('Add at least one valid bone before applying idle particles');
                    return;
                }
                updatedContent = addIdleParticleEffect(updatedContent, systemKey, safeBones);
                setTargetPyContent(updatedContent);
                setFileSaved(false);
                setStatusMessage(`Applied ${safeBones.length} idle particle(s) for "${systemName || systemKey}"`);
            } catch (error) {
                setStatusMessage(`Failed to apply idle particles: ${(error as Error).message}`);
            }
        },
        [targetPyContent, normalizeBoneConfigs, saveStateToHistory]
    );

    const handleRemoveIdleParticlesByEffectKey = useCallback(
        (effectKey: string) => {
            const cleanKey = String(effectKey || '').replace(/^"|"$/g, '').trim();
            if (!cleanKey || !targetPyContent) return;
            try {
                saveStateToHistory(`Remove idle particles for "${cleanKey}"`);
                const updatedContent = removeAllIdleParticlesByEffectKey(targetPyContent, cleanKey);
                setTargetPyContent(updatedContent);
                setFileSaved(false);
                setStatusMessage(`Removed idle particles for "${cleanKey}"`);
            } catch (error) {
                setStatusMessage(`Failed to remove idle particles: ${(error as Error).message}`);
            }
        },
        [targetPyContent, saveStateToHistory]
    );

    // ── Child particles ──
    const resetChildState = useCallback(() => {
        setShowChildModal(false);
        setIsEditMode(false);
        setSelectedSystemForChild(null);
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
            if (!targetPyContent) {
                setStatusMessage('No target file loaded - Please open a target bin file first');
                return;
            }
            if (!hasResourceResolver || !hasSkinCharacterData) {
                setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
                return;
            }
            try {
                const systems = findAvailableVfxSystems(targetPyContent);
                setAvailableVfxSystems(systems);
                setSelectedSystemForChild({ key: systemKey, name: systemName });
                setIsEditMode(false);
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
            } catch (error) {
                setStatusMessage(`Failed to prepare child particles: ${(error as Error).message}`);
            }
        },
        [targetPyContent, hasResourceResolver, hasSkinCharacterData]
    );

    const handleEditChildParticle = useCallback(
        (systemKey: string, systemName: string, editingEmitterName: string) => {
            try {
                const currentData = extractChildParticleData(targetPyContent, systemKey, editingEmitterName);
                if (!currentData) {
                    setStatusMessage(`Could not find child particle data for "${editingEmitterName}"`);
                    return;
                }
                const systems = findAvailableVfxSystems(targetPyContent);
                setAvailableVfxSystems(systems);
                setSelectedSystemForChild({ key: systemKey, name: systemName });
                setEmitterName(editingEmitterName);
                setIsEditMode(true);
                const matchingSystem = systems.find((sys) => sys.key === currentData.effectKey);
                setSelectedChildSystem(matchingSystem ? matchingSystem.key : currentData.effectKey || '');
                setChildParticleRate(currentData.rate.toString());
                setChildParticleLifetime(currentData.lifetime.toString());
                setChildParticleBindWeight(currentData.bindWeight.toString());
                setChildParticleIsSingle(currentData.isSingleParticle);
                setChildParticleTimeBeforeFirstEmission(currentData.timeBeforeFirstEmission.toString());
                setChildParticleTranslationOverrideX(currentData.translationOverrideX.toString());
                setChildParticleTranslationOverrideY(currentData.translationOverrideY.toString());
                setChildParticleTranslationOverrideZ(currentData.translationOverrideZ.toString());
                setShowChildModal(true);
                setStatusMessage(`Editing child particle "${editingEmitterName}" in "${systemName}"`);
            } catch (error) {
                setStatusMessage(`Failed to prepare child particle edit: ${(error as Error).message}`);
            }
        },
        [targetPyContent]
    );

    const handleConfirmChildParticles = useCallback(() => {
        if (!selectedSystemForChild || !selectedChildSystem || !emitterName.trim()) {
            setStatusMessage('Please fill in all fields (VFX system and emitter name)');
            return;
        }
        try {
            saveStateToHistory(`${isEditMode ? 'Edit' : 'Add'} child particles ${isEditMode ? `"${emitterName}" in` : 'to'} "${selectedSystemForChild.name}"`);
            let updated: string;
            if (isEditMode) {
                updated = updateChildParticleEmitter(targetPyContent, selectedSystemForChild.key, emitterName, {
                    effectKey: selectedChildSystem,
                    rate: parseFloat(childParticleRate),
                    lifetime: parseFloat(childParticleLifetime),
                    bindWeight: parseFloat(childParticleBindWeight),
                    isSingleParticle: childParticleIsSingle,
                    timeBeforeFirstEmission: parseFloat(childParticleTimeBeforeFirstEmission),
                    translationOverrideX: parseFloat(childParticleTranslationOverrideX),
                    translationOverrideY: parseFloat(childParticleTranslationOverrideY),
                    translationOverrideZ: parseFloat(childParticleTranslationOverrideZ),
                });
            } else {
                updated = addChildParticleEffect(
                    targetPyContent,
                    selectedSystemForChild.key,
                    selectedChildSystem,
                    emitterName.trim(),
                    deletedEmitters,
                    parseFloat(childParticleRate),
                    parseFloat(childParticleLifetime),
                    parseFloat(childParticleBindWeight),
                    childParticleIsSingle,
                    parseFloat(childParticleTimeBeforeFirstEmission),
                    parseFloat(childParticleTranslationOverrideX),
                    parseFloat(childParticleTranslationOverrideY),
                    parseFloat(childParticleTranslationOverrideZ)
                );
            }
            setTargetPyContent(updated);
            setFileSaved(false);
            try {
                setTargetSystems(parseVfxEmitters(updated));
            } catch {
                /* noop */
            }
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
        targetPyContent,
        deletedEmitters,
        childParticleRate,
        childParticleLifetime,
        childParticleBindWeight,
        childParticleIsSingle,
        childParticleTimeBeforeFirstEmission,
        childParticleTranslationOverrideX,
        childParticleTranslationOverrideY,
        childParticleTranslationOverrideZ,
        saveStateToHistory,
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
        if (!targetPyContent) {
            setStatusMessage('No target file loaded');
            return;
        }
        if (!hasResourceResolver || !hasSkinCharacterData) {
            setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
            return;
        }
        try {
            setPersistentPreset({ type: 'IsAnimationPlaying', animationName: 'Spell4', delay: { on: 0, off: 0 } });
            setPersistentVfx([]);
            setCustomShowSubmeshInput('');
            setCustomHideSubmeshInput('');
            setVfxSearchTerms({});
            setVfxDropdownOpen({});
            setEditingConditionIndex(null);
            setShowExistingConditions(false);
            setEffectKeyOptions(scanEffectKeys(targetPyContent));
            const newAvailableSubmeshes = extractSubmeshes(targetPyContent);
            setAvailableSubmeshes(newAvailableSubmeshes);
            setPersistentShowSubmeshes((prev) => prev.filter((s) => !newAvailableSubmeshes.includes(s)));
            setPersistentHideSubmeshes((prev) => prev.filter((s) => !newAvailableSubmeshes.includes(s)));
            setExistingConditions(extractExistingPersistentConditions(targetPyContent));
            setShowPersistentModal(true);
        } catch {
            setStatusMessage('Error preparing Persistent editor');
        }
    }, [targetPyContent, hasResourceResolver, hasSkinCharacterData]);

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

    const handleApplyPersistent = useCallback(() => {
        if (!targetPyContent) return;
        try {
            saveStateToHistory(editingConditionIndex !== null ? 'Update persistent effects' : 'Add persistent effects');
            let updated = targetPyContent;
            const normalizedVfx = persistentVfx
                .map((v) => {
                    const selected = effectKeyOptions.find((o) => o.id === v.id) || { key: v.key, type: v.type, value: v.value };
                    const resolved = resolveEffectKey(updated, selected);
                    return { ...v, key: resolved.key || undefined, value: resolved.value };
                })
                .filter((v) => !!v.key);
            for (const v of normalizedVfx) {
                if (v && v.key && !/^0x[0-9a-fA-F]+$/.test(v.key) && v.value) updated = ensureResolverMapping(updated, v.key, v.value);
            }
            updated = insertOrUpdatePersistentEffect(updated, {
                ownerPreset: persistentPreset,
                submeshesShow: persistentShowSubmeshes,
                submeshesHide: persistentHideSubmeshes,
                vfxList: normalizedVfx,
                editingIndex: editingConditionIndex,
            });
            setTargetPyContent(updated);
            setFileSaved(false);
            setShowPersistentModal(false);
            setStatusMessage(`${editingConditionIndex !== null ? 'Updated' : 'Added'} PersistentEffectConditions`);
        } catch (e) {
            setStatusMessage(`Failed to apply Persistent effect: ${(e as Error).message}`);
        }
    }, [
        targetPyContent,
        editingConditionIndex,
        persistentVfx,
        effectKeyOptions,
        persistentPreset,
        persistentShowSubmeshes,
        persistentHideSubmeshes,
        saveStateToHistory,
    ]);

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
        (mat: number[]) => {
            try {
                if (!matrixModalState.systemKey) {
                    setShowMatrixModal(false);
                    return;
                }
                const sys = targetSystems[matrixModalState.systemKey];
                if (!sys) {
                    setShowMatrixModal(false);
                    return;
                }
                saveStateToHistory(`Update matrix for "${sys.name}"`);
                let currentSysText = sys.rawContent || '';
                try {
                    currentSysText = currentSysText || extractVFXSystem(targetPyContent, sys.key)?.fullContent || '';
                } catch {
                    /* noop */
                }
                const updatedSystemText = upsertSystemMatrix(currentSysText, mat);
                const updatedFile = replaceSystemBlockInFile(targetPyContent || '', sys.key, updatedSystemText);
                setTargetPyContent(updatedFile);
                setFileSaved(false);
                setTargetSystems((prev) => {
                    const copy = { ...prev };
                    const old = copy[matrixModalState.systemKey!];
                    if (old) copy[matrixModalState.systemKey!] = { ...old, rawContent: updatedSystemText };
                    return copy;
                });
            } finally {
                setShowMatrixModal(false);
                setMatrixModalState({ systemKey: null, initial: null });
            }
        },
        [matrixModalState, targetSystems, targetPyContent, saveStateToHistory]
    );

    const handleOpenNewSystemModal = useCallback(() => {
        setNewSystemName('');
        setShowNewSystemModal(true);
    }, []);

    return {
        // state
        targetPath,
        donorPath,
        targetPyContent,
        donorPyContent,
        targetSystems,
        donorSystems,
        setTargetSystems,
        setTargetPyContent,
        setDonorSystems,
        setDonorPyContent,
        setDonorPath,
        statusMessage,
        setStatusMessage,
        isProcessing,
        processingText,
        deletedEmitters,
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
        undoHistory,
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
        recentCreatedSystemKeys,
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
        handleMoveEmitter,
        handleDeleteEmitter,
        handleDeleteAllEmitters,
        handleRenameEmitter,
        handleRenameSystem,
        handleCreateNewSystem,
        handleOpenNewSystemModal,
        saveStateToHistory,
        handleUndo,
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
        // matrix
        applyMatrix,
        // utils
        extractTexturesFromEmitterContent,
        extractColorsFromEmitterContent,
        parseSystemMatrix,
    };
}

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripVfxSystemsAndResolverEntries(content: string): string {
    if (!content) return '';
    const lines = content.split('\n');
    const kept: string[] = [];
    const removedSystemKeys = new Set<string>();

    let inSystem = false;
    let systemDepth = 0;
    const systemStartRe = /^\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData\s*\{/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!inSystem) {
            const match = trimmed.match(systemStartRe);
            if (match) {
                const key = match[1] || match[2];
                if (key) removedSystemKeys.add(key);
                inSystem = true;
                systemDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                continue;
            }
            kept.push(line);
            continue;
        }
        systemDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        if (systemDepth <= 0) {
            inSystem = false;
            systemDepth = 0;
        }
    }

    const cleaned: string[] = [];
    let inResolver = false;
    let resolverDepth = 0;
    let inResourceMap = false;
    let resourceMapDepth = 0;
    const resolverStartRe = /=\s*ResourceResolver\s*\{/i;
    const resourceMapStartRe = /resourceMap:\s*map\[hash,link\]\s*=\s*\{/i;
    const entryRe = /^(\s*)(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*,?\s*$/;

    for (let i = 0; i < kept.length; i++) {
        const line = kept[i];
        const trimmed = line.trim();
        if (!inResolver && resolverStartRe.test(trimmed)) {
            inResolver = true;
            resolverDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
            cleaned.push(line);
            continue;
        }
        if (inResolver && !inResourceMap && resourceMapStartRe.test(trimmed)) {
            inResourceMap = true;
            resourceMapDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
            cleaned.push(line);
            continue;
        }
        if (inResolver && inResourceMap) {
            const match = trimmed.match(entryRe);
            if (match) {
                const entryKey = match[2] || match[3] || '';
                const entryValue = match[4] || match[5] || '';
                const valueLooksLikeVfx = /[\\/]Particles[\\/]/i.test(entryValue);
                if (valueLooksLikeVfx || removedSystemKeys.has(entryKey) || removedSystemKeys.has(entryValue)) {
                    /* dropped */
                } else {
                    cleaned.push(line);
                }
            } else {
                cleaned.push(line);
            }
            resourceMapDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
            if (resourceMapDepth <= 0) {
                inResourceMap = false;
                resourceMapDepth = 0;
            }
            resolverDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
            if (resolverDepth <= 0) {
                inResolver = false;
                resolverDepth = 0;
                inResourceMap = false;
            }
            continue;
        }
        cleaned.push(line);
        if (inResolver) {
            resolverDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
            if (resolverDepth <= 0) {
                inResolver = false;
                resolverDepth = 0;
                inResourceMap = false;
            }
        }
    }

    return cleaned.join('\n');
}
