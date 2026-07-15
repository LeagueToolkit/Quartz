// AniPort — animation porting. Ported 1:1 from AniPortSimple.js.
// The Electron original read/wrote the target .py via Node fs; in Tauri the .bin
// is read to ritobin text by the backend (readBin) and written back (writeBin),
// so all clip/event text transforms operate on an in-memory content string kept
// in targetData.currentFileContent, re-parsed after every mutation.

import { useEffect, useRef, useState } from 'react';
import { Snackbar, Alert, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import { useFileExplorer } from '@/components/explorer';
import { useJadeBin } from '@/lib/jade/jadeInterop';

import './aniport/AniPort.css';

import { readBin, writeBin, aniportAutodetectSkl, aniportLoadSkeleton, type LoadedSkeleton } from '@/lib/api';

import { parseAnimationData } from './aniport/utils/animationParser';
import { findVfxSystemForEffectKey, portAnimationEventWithVfx } from './aniport/utils/animationVfxLinker';
import { loadAnimationFilePair, validateAnimationFile } from './aniport/utils/animationFileLoader';
import { deleteClip, extractClip, insertClip } from './aniport/utils/clipTextManipulator';
import {
    addSelectorPair,
    removeSelectorPair,
    updateSelectorPairProbability,
    deleteSelectorClipData,
    generateSelectorClipDataText,
    addEventToSelectorClipDataContent,
} from './aniport/utils/aniportutils/SelectorClipDataUtils';
import {
    getStandaloneEvents as getStandaloneEventsUtil,
    addStandaloneEventToClipContent,
} from './aniport/utils/aniportutils/StandaloneEventCreator';

import GlowingSpinner from './aniport/components/GlowingSpinner';
import StandaloneEventCreatorUI from './aniport/components/StandaloneEventCreatorUI';
import ClipEventsView from './aniport/components/ClipEventsView';

import type { Clip, AnimEvent, LoadedAniData } from './aniport/utils/types';

type Side = 'donor' | 'target';
type CreateMessageFn = (opts: { title: string; message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;

function AniPort() {
    const pick = useFileExplorer();
    // File management state
    const [donorAnimationFile, setDonorAnimationFile] = useState<string | null>(null);
    const [donorSkinsFile, setDonorSkinsFile] = useState<string | null>(null);
    const [targetAnimationFile, setTargetAnimationFile] = useState<string | null>(null);
    const [targetSkinsFile, setTargetSkinsFile] = useState<string | null>(null);
    useJadeBin(targetSkinsFile || targetAnimationFile);

    // Toast notification state
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'info' | 'success' | 'error' | 'warning' }>({ open: false, message: '', severity: 'info' });

    // Info tooltip state
    const [showInfoTooltip, setShowInfoTooltip] = useState(false);

    // Delete confirmation dialog state
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [clipToDelete, setClipToDelete] = useState<string | null>(null);

    // VFX system deletion confirmation dialog state
    const [vfxDeleteConfirmOpen, setVfxDeleteConfirmOpen] = useState(false);
    const vfxDeleteCallbackRef = useRef<((result: string) => void) | null>(null);
    const [vfxDeleteEffectKey, setVfxDeleteEffectKey] = useState<string | null>(null);

    // Recent files state
    const [recentDonorFiles, setRecentDonorFiles] = useState<{ path: string; name: string; timestamp: number }[]>([]);
    const [recentTargetFiles, setRecentTargetFiles] = useState<{ path: string; name: string; timestamp: number }[]>([]);

    // Pending file selections (chosen but not yet loaded)
    const [donorSelection, setDonorSelection] = useState<string | null>(null);
    const [targetSelection, setTargetSelection] = useState<string | null>(null);

    // Data state
    const [donorData, setDonorData] = useState<LoadedAniData | null>(null);
    const [targetData, setTargetData] = useState<LoadedAniData | null>(null);

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [expandedTargetClips, setExpandedTargetClips] = useState<Set<string>>(new Set());
    const [expandedDonorClips, setExpandedDonorClips] = useState<Set<string>>(new Set());
    const [targetSearchTerm, setTargetSearchTerm] = useState('');
    const [donorSearchTerm, setDonorSearchTerm] = useState('');

    // Save and undo functionality
    const [fileSaved, setFileSaved] = useState(true);
    const [undoHistory, setUndoHistory] = useState<{ targetData: LoadedAniData; fileContent: string | null; action: string }[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingText, setProcessingText] = useState('');
    const [statusMessage, setStatusMessage] = useState('Ready - Load files to begin editing');
    const [dragOverClip, setDragOverClip] = useState<string | null>(null);
    const [editingClipName, setEditingClipName] = useState<string | null>(null);
    const [newClipName, setNewClipName] = useState('');
    const [newClipNameInput, setNewClipNameInput] = useState('');
    const [newClipType, setNewClipType] = useState<string>('AtomicClipData');
    const [sequencerSearch, setSequencerSearch] = useState('');
    const [sequencerOpenFor, setSequencerOpenFor] = useState<string | null>(null);
    const [selectorSearch, setSelectorSearch] = useState('');
    const [selectorOpenFor, setSelectorOpenFor] = useState<string | null>(null);
    const [editingSelectorPair, setEditingSelectorPair] = useState<string | null>(null);
    const [editingProbability, setEditingProbability] = useState('');
    const [selectorProbabilityInput, setSelectorProbabilityInput] = useState('1.0');
    const [maskDataNameInputs, setMaskDataNameInputs] = useState<Record<string, string>>({});

    // Page switching state
    const [currentPage, setCurrentPage] = useState<'animation' | 'mask'>('animation');

    // Mask viewer state — skeleton joints read from the target .skl
    const [maskSkeleton, setMaskSkeleton] = useState<LoadedSkeleton | null>(null);
    const [maskSelectedJoints, setMaskSelectedJoints] = useState<Set<number>>(new Set());
    const [maskLoading, setMaskLoading] = useState(false);
    const [maskError, setMaskError] = useState<string | null>(null);

    // Standalone events panel state
    const [standaloneExpanded, setStandaloneExpanded] = useState(true);
    const [standaloneGroupExpanded, setStandaloneGroupExpanded] = useState<Set<string>>(new Set(['particle', 'submesh', 'sound', 'facetarget']));
    const [standaloneSlideOverOpen, setStandaloneSlideOverOpen] = useState(false);

    const CreateMessage: CreateMessageFn = (options) => {
        const severity = options.type === 'warning' ? 'warning' : options.type;
        setSnackbar({ open: true, message: options.message, severity });
    };

    // ---- Current target content helper -------------------------------------
    // The single source of truth for text transforms. Falls back to original.
    const getTargetContent = (data: LoadedAniData | null = targetData): string =>
        data?.currentFileContent || data?.originalAnimationContent || '';

    // ---- Mask viewer skeleton loading --------------------------------------
    // Auto-detect the target .skl from the skins bin context, then read its joints.
    const loadMaskSkeleton = async () => {
        const binPath = targetSkinsFile || targetAnimationFile;
        if (!binPath) return;

        setMaskLoading(true);
        setMaskError(null);
        try {
            const skeletonRef = targetData?.skeletonInfo?.skeleton || undefined;
            const sklPath = await aniportAutodetectSkl(binPath, skeletonRef);
            const skeleton = await aniportLoadSkeleton(sklPath);
            setMaskSkeleton(skeleton);
            setStatusMessage(`Skeleton loaded: ${skeleton.totalJoints} joints`);
        } catch (err) {
            setMaskSkeleton(null);
            setMaskError(String(err));
        } finally {
            setMaskLoading(false);
        }
    };

    // Load joints when the mask page opens (or the target changes while open).
    useEffect(() => {
        if (currentPage !== 'mask') return;
        if (maskSkeleton || maskLoading) return;
        void loadMaskSkeleton();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, targetSkinsFile, targetAnimationFile]);

    // Reset the cached skeleton when the target file changes.
    useEffect(() => {
        setMaskSkeleton(null);
        setMaskSelectedJoints(new Set());
        setMaskError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetSkinsFile, targetAnimationFile]);

    const toggleMaskJoint = (id: number) => {
        setMaskSelectedJoints((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // ---- File reading ------------------------------------------------------
    const readBinAsText = async (filePath: string): Promise<string> => {
        if (filePath.toLowerCase().endsWith('.py')) {
            // .py ritobin text — read straight through the backend file API.
            return readBin(filePath);
        }
        return readBin(filePath);
    };

    // ---- Recent files ------------------------------------------------------
    const baseName = (p: string): string => p.split(/[\\/]/).pop() || p;

    const addToRecentFiles = (filePath: string, type: Side) => {
        if (!filePath) return;
        const recentKey = type === 'donor' ? 'recentDonorFiles' : 'recentTargetFiles';
        const setter = type === 'donor' ? setRecentDonorFiles : setRecentTargetFiles;
        const getter = type === 'donor' ? recentDonorFiles : recentTargetFiles;

        const filtered = getter.filter((file) => file.path !== filePath);
        const updated = [{ path: filePath, name: baseName(filePath), timestamp: Date.now() }, ...filtered].slice(0, 10);
        setter(updated);
        try {
            localStorage.setItem(`aniport_${recentKey}`, JSON.stringify(updated));
        } catch {
            /* ignore */
        }
    };

    const loadRecentFilesFromStorage = () => {
        try {
            const donorRecent = localStorage.getItem('aniport_recentDonorFiles');
            const targetRecent = localStorage.getItem('aniport_recentTargetFiles');
            if (donorRecent) setRecentDonorFiles(JSON.parse(donorRecent));
            if (targetRecent) setRecentTargetFiles(JSON.parse(targetRecent));
        } catch {
            /* ignore */
        }
    };

    useEffect(() => {
        loadRecentFilesFromStorage();
    }, []);

    // ---- Combined file selection -------------------------------------------
    const handleCombinedFileSelect = async (type: Side) => {
        try {
            const result = await pick({
                mode: 'file',
                title: `Select ${type === 'donor' ? 'Donor' : 'Target'} Combined File`,
                filters: [
                    { name: 'Binary Files', extensions: ['bin'] },
                    { name: 'Python Files', extensions: ['py'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
                recentsKey: 'bin',
            });
            if (typeof result !== 'string') return;

            // Validate before accepting (combined file holds both animation + skins).
            setIsLoading(true);
            setLoadingMessage('Processing animation file...');
            const content = await readBinAsText(result);
            if (!validateAnimationFile(content)) {
                CreateMessage({
                    title: 'Invalid File',
                    message: "This file doesn't contain proper animationGraphData structure. Repath your mod to the correct animation files.",
                    type: 'error',
                });
                setIsLoading(false);
                return;
            }

            if (type === 'donor') {
                setDonorAnimationFile(result);
                setDonorSkinsFile(result);
                setDonorSelection(result);
                addToRecentFiles(result, 'donor');
            } else {
                setTargetAnimationFile(result);
                setTargetSkinsFile(result);
                setTargetSelection(result);
                addToRecentFiles(result, 'target');
            }
            setStatusMessage(`Selected ${type} file: ${baseName(result)}`);
        } catch (error) {
            CreateMessage({ title: 'Processing Error', message: `Failed to process file: ${(error as Error).message}`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const selectRecentFile = async (fileInfo: { path: string; name: string }, type: Side) => {
        try {
            const content = await readBinAsText(fileInfo.path);
            if (!validateAnimationFile(content)) {
                setStatusMessage(`❌ Recent ${type} file is not a valid animation file`);
                return;
            }
            if (type === 'donor') {
                setDonorAnimationFile(fileInfo.path);
                setDonorSkinsFile(fileInfo.path);
                setDonorSelection(fileInfo.path);
            } else {
                setTargetAnimationFile(fileInfo.path);
                setTargetSkinsFile(fileInfo.path);
                setTargetSelection(fileInfo.path);
            }
            setStatusMessage(`✅ Loaded recent ${type} file: ${fileInfo.name}`);
        } catch (error) {
            setStatusMessage(`❌ Failed to load recent ${type} file: ${(error as Error).message}`);
        }
    };

    // ---- Load + parse ------------------------------------------------------
    const loadFiles = async () => {
        if (!donorAnimationFile || !donorSkinsFile || !targetAnimationFile || !targetSkinsFile) {
            CreateMessage({ title: 'Missing Files', message: 'Please select all required files', type: 'error' });
            return;
        }

        setTargetData(null);
        setFileSaved(true);
        setIsLoading(true);
        setLoadingProgress(0);
        setLoadingMessage('Starting file loading...');

        try {
            setLoadingMessage('Loading donor files...');
            setLoadingProgress(10);
            const donorAnimContent = await readBinAsText(donorAnimationFile);
            const donorSkinsContent = donorSkinsFile === donorAnimationFile ? donorAnimContent : await readBinAsText(donorSkinsFile);
            const donorResult = loadAnimationFilePair(donorAnimContent, donorSkinsContent);
            if (!donorResult.success || !donorResult.animationData) {
                throw new Error(`Donor files: ${donorResult.errors.join(', ')}`);
            }
            setLoadingProgress(45);

            setLoadingMessage('Loading target files...');
            const targetAnimContent = await readBinAsText(targetAnimationFile);
            const targetSkinsContent = targetSkinsFile === targetAnimationFile ? targetAnimContent : await readBinAsText(targetSkinsFile);
            const targetResult = loadAnimationFilePair(targetAnimContent, targetSkinsContent);
            if (!targetResult.success || !targetResult.animationData) {
                throw new Error(`Target files: ${targetResult.errors.join(', ')}`);
            }
            setLoadingProgress(85);

            const donorLoaded: LoadedAniData = {
                success: true,
                animationData: donorResult.animationData,
                vfxSystems: donorResult.vfxSystems,
                resourceResolver: donorResult.resourceResolver,
                originalAnimationContent: donorAnimContent,
                originalSkinsContent: donorSkinsContent,
                animationPath: donorAnimationFile,
                skinsPath: donorSkinsFile,
                errors: donorResult.errors,
                warnings: donorResult.warnings,
            };

            const targetLoaded: LoadedAniData = {
                success: true,
                animationData: targetResult.animationData,
                vfxSystems: targetResult.vfxSystems,
                resourceResolver: targetResult.resourceResolver,
                originalAnimationContent: targetAnimContent,
                originalSkinsContent: targetSkinsContent,
                currentFileContent: targetAnimContent,
                animationPath: targetAnimationFile,
                skinsPath: targetSkinsFile,
                skeletonInfo: targetResult.skeletonInfo,
                errors: targetResult.errors,
                warnings: targetResult.warnings,
            };

            setDonorData(donorLoaded);
            setTargetData(targetLoaded);
            setUndoHistory([]);
            setFileSaved(false);

            setLoadingMessage('Files loaded successfully!');
            setLoadingProgress(100);

            CreateMessage({
                title: 'Files Loaded Successfully',
                message: `Loaded ${donorResult.animationData.totalClips} donor clips and ${targetResult.animationData.totalClips} target clips`,
                type: 'success',
            });
        } catch (error) {
            CreateMessage({ title: 'Loading Failed', message: (error as Error).message, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    // ---- Clip display / filtering ------------------------------------------
    const getClipDisplayName = (clip: Clip): string => {
        if (!clip.name) return 'Unknown';
        if (clip.name.startsWith('0x')) {
            if (clip.animationFilePath) {
                const fileName = clip.animationFilePath.split('/').pop();
                if (fileName) return `${fileName} (${clip.name})`;
            }
            return `${clip.name} (Hash)`;
        }
        return clip.name;
    };

    const filterClips = (clips: Clip[], term: string): Clip[] => {
        if (!term.trim()) return clips;
        const searchTerm = term.toLowerCase();
        return clips.filter((clip) => {
            const clipName = clip.name.toLowerCase();
            const displayName = getClipDisplayName(clip).toLowerCase();
            const animationPath = clip.animationFilePath ? clip.animationFilePath.toLowerCase() : '';
            return clipName.includes(searchTerm) || displayName.includes(searchTerm) || animationPath.includes(searchTerm);
        });
    };

    const getDonorClips = (): Clip[] => {
        if (!donorData?.animationData?.clips) return [];
        const clips = Object.values(donorData.animationData.clips).filter((clip) => !clip.isStandalone || clip.type !== 'StandaloneEvent');
        return filterClips(clips, donorSearchTerm);
    };

    const getTargetClips = (): Clip[] => {
        if (!targetData?.animationData?.clips) return [];
        const clips = Object.values(targetData.animationData.clips);
        return filterClips(clips, targetSearchTerm);
    };

    // ---- Standalone events -------------------------------------------------
    const getStandaloneEvents = (): AnimEvent[] => getStandaloneEventsUtil(donorData);

    const getStandaloneEventGroups = (): Record<string, AnimEvent[]> => {
        const events = getStandaloneEvents();
        const groups: Record<string, AnimEvent[]> = { particle: [], submesh: [], sound: [], facetarget: [], other: [] };
        events.forEach((ev) => {
            if (groups[ev.type]) groups[ev.type].push(ev);
            else groups.other.push(ev);
        });
        return groups;
    };

    const toggleStandaloneGroup = (key: string) => {
        setStandaloneGroupExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // ---- Expand/collapse ---------------------------------------------------
    const toggleTargetClipExpansion = (clipName: string) => {
        setExpandedTargetClips((prev) => {
            const next = new Set(prev);
            if (next.has(clipName)) next.delete(clipName);
            else next.add(clipName);
            return next;
        });
    };

    const toggleDonorClipExpansion = (clipName: string) => {
        setExpandedDonorClips((prev) => {
            const next = new Set(prev);
            if (next.has(clipName)) next.delete(clipName);
            else next.add(clipName);
            return next;
        });
    };

    // ---- Undo --------------------------------------------------------------
    const saveStateToHistory = (actionDescription: string) => {
        if (!targetData) return;
        const currentState = {
            targetData: JSON.parse(JSON.stringify(targetData)) as LoadedAniData,
            fileContent: getTargetContent(),
            action: actionDescription,
        };
        setUndoHistory((prev) => [...prev, currentState].slice(-20));
    };

    const handleUndo = () => {
        if (undoHistory.length === 0) {
            setStatusMessage('Nothing to undo');
            return;
        }
        const lastState = undoHistory[undoHistory.length - 1];
        if (lastState.fileContent) {
            const restoredData = parseAnimationData(lastState.fileContent);
            setTargetData((prev) => (prev ? { ...prev, animationData: restoredData, currentFileContent: lastState.fileContent! } : lastState.targetData));
        } else {
            setTargetData(lastState.targetData);
        }
        setFileSaved(false);
        setUndoHistory((prev) => prev.slice(0, -1));
        setStatusMessage(`✅ Undid: ${lastState.action}`);
    };

    const hasChangesToSave = (): boolean => !!targetData && !fileSaved;

    // Apply a content transform: persist into state + reparse, mark dirty.
    const applyTargetContent = (newContent: string) => {
        const updated = parseAnimationData(newContent);
        setTargetData((prev) => (prev ? { ...prev, animationData: updated, currentFileContent: newContent } : prev));
        setFileSaved(false);
    };

    // ---- Save --------------------------------------------------------------
    const handleSave = async () => {
        try {
            if (!targetData || !targetAnimationFile) {
                setStatusMessage('No target file loaded');
                return;
            }
            setIsProcessing(true);
            setProcessingText('Saving .bin...');
            setStatusMessage('Saving modified target file...');

            await new Promise((r) => setTimeout(r, 10));

            const modifiedContent = getTargetContent();

            // Determine the output .bin path (overwrite the original).
            const isBin = targetAnimationFile.toLowerCase().endsWith('.bin');
            const outputBinPath = isBin
                ? targetAnimationFile
                : targetAnimationFile.replace(/\.py$/i, '.bin');

            await writeBin(modifiedContent, outputBinPath);

            setTargetData((prev) => (prev ? { ...prev, currentFileContent: modifiedContent } : prev));
            setStatusMessage(`✅ Successfully saved: ${outputBinPath}`);
            setTimeout(() => setStatusMessage(''), 3000);
            setFileSaved(true);
        } catch (error) {
            setStatusMessage(`Error saving files: ${(error as Error).message}`);
            setFileSaved(false);
        } finally {
            setIsProcessing(false);
            setProcessingText('');
        }
    };

    // ---- Delete event ------------------------------------------------------
    const removeEventWithBracketCounting = (content: string, eventName: string, eventTypeName: string, targetClipName: string): string => {
        const lines = content.split('\n');
        const result: string[] = [];
        let inEvent = false;
        let bracketDepth = 0;
        let inTargetClip = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const isTargetClipStart = targetClipName.startsWith('0x')
                ? (line.includes(`${targetClipName} = AtomicClipData {`) || line.includes(`${targetClipName} = SequencerClipData {`) || line.includes(`${targetClipName} = ConditionFloatClipData {`))
                : (line.includes(`"${targetClipName}" = AtomicClipData {`) || line.includes(`"${targetClipName}" = SequencerClipData {`) || line.includes(`"${targetClipName}" = ConditionFloatClipData {`));
            const isOtherClipStart = targetClipName.startsWith('0x')
                ? (line.includes('= AtomicClipData {') || line.includes('= SequencerClipData {') || line.includes('= ConditionFloatClipData {')) && !line.includes(`${targetClipName}`)
                : (line.includes('= AtomicClipData {') || line.includes('= SequencerClipData {') || line.includes('= ConditionFloatClipData {')) && !line.includes(`"${targetClipName}"`);

            if (isTargetClipStart) inTargetClip = true;
            else if (inTargetClip && isOtherClipStart) inTargetClip = false;

            if (!inEvent && inTargetClip && line.includes(`${eventName} = ${eventTypeName}`)) {
                const openBrackets = (line.match(/\{/g) || []).length;
                const closeBracketsOnStart = (line.match(/\}/g) || []).length;
                bracketDepth = openBrackets - closeBracketsOnStart;
                if (bracketDepth <= 0) {
                    bracketDepth = 0;
                    continue;
                }
                inEvent = true;
                continue;
            }

            if (inEvent) {
                const openBrackets = (line.match(/\{/g) || []).length;
                const closeBrackets = (line.match(/\}/g) || []).length;
                bracketDepth += openBrackets - closeBrackets;
                if (bracketDepth <= 0) {
                    inEvent = false;
                    bracketDepth = 0;
                    continue;
                }
            } else {
                result.push(line);
            }
        }
        return result.join('\n');
    };

    const handleDeleteEvent = async (event: AnimEvent, targetClipName: string, eventType: string, eventIndex: number) => {
        try {
            const ev = event as unknown as Record<string, unknown>;
            let shouldDeleteVfxSystem = false;

            if (eventType === 'particle' && ev.effectKey) {
                const dialogResult = await new Promise<string>((resolve) => {
                    vfxDeleteCallbackRef.current = (result) => {
                        setVfxDeleteConfirmOpen(false);
                        vfxDeleteCallbackRef.current = null;
                        setVfxDeleteEffectKey(null);
                        resolve(result);
                    };
                    setVfxDeleteEffectKey(ev.effectKey as string);
                    requestAnimationFrame(() => setVfxDeleteConfirmOpen(true));
                });

                if (dialogResult === 'cancel') return;
                shouldDeleteVfxSystem = dialogResult === 'delete-vfx';
            }

            saveStateToHistory(
                shouldDeleteVfxSystem
                    ? `Delete ${eventType} event and VFX system from "${targetClipName}"`
                    : `Delete ${eventType} event from "${targetClipName}"`,
            );

            setIsLoading(true);
            setLoadingMessage('Deleting event...');

            const eventName = (ev.eventName as string) || (ev.hash as string) || `event_${eventIndex}`;
            const eventTypeName =
                eventType === 'particle' ? 'ParticleEventData' :
                    eventType === 'submesh' ? 'SubmeshVisibilityEventData' :
                        eventType === 'sound' ? 'SoundEventData' :
                            eventType === 'facetarget' ? 'FaceTargetEventData' : 'EventData';

            const currentContent = getTargetContent();
            const modifiedContent = removeEventWithBracketCounting(currentContent, eventName, eventTypeName, targetClipName);
            applyTargetContent(modifiedContent);

            if (shouldDeleteVfxSystem && ev.effectKey) {
                setLoadingMessage('Deleting VFX system...');
                setTargetData((prevData) => {
                    if (!prevData?.vfxSystems) return prevData;
                    const updatedVfxSystems = { ...prevData.vfxSystems };
                    for (const [systemKey, system] of Object.entries(updatedVfxSystems)) {
                        if (system.effectKey === ev.effectKey || systemKey.includes(ev.effectKey as string)) {
                            delete updatedVfxSystems[systemKey];
                            break;
                        }
                    }
                    const updatedResourceResolver = { ...prevData.resourceResolver };
                    if (updatedResourceResolver[ev.effectKey as string]) delete updatedResourceResolver[ev.effectKey as string];
                    return { ...prevData, vfxSystems: updatedVfxSystems, resourceResolver: updatedResourceResolver };
                });
            }

            setIsLoading(false);
            CreateMessage({
                title: 'Event Deleted',
                message: shouldDeleteVfxSystem && ev.effectKey
                    ? `${eventType} event and associated VFX system deleted successfully from ${targetClipName}`
                    : `${eventType} event deleted successfully from ${targetClipName}`,
                type: 'success',
            });
        } catch (error) {
            setIsLoading(false);
            CreateMessage({ title: 'Delete Failed', message: `Failed to delete event: ${(error as Error).message}`, type: 'error' });
        }
    };

    // ---- Delete clip -------------------------------------------------------
    const handleDeleteClipClick = (clipName: string) => {
        setClipToDelete(clipName);
        setDeleteConfirmOpen(true);
    };

    const handleDeleteClip = async () => {
        if (!clipToDelete) return;
        const clipName = clipToDelete;
        setDeleteConfirmOpen(false);

        const clip = targetData?.animationData?.clips?.[clipName];
        if (clip && clip.type === 'SelectorClipData') {
            await handleDeleteSelectorClipData(clipName);
            return;
        }

        saveStateToHistory(`Delete clip "${clipName}"`);
        setIsLoading(true);
        setLoadingMessage('Deleting clip...');

        try {
            const currentContent = getTargetContent();
            const modifiedContent = deleteClip(currentContent, clipName);
            applyTargetContent(modifiedContent);
            setTimeout(() => {
                CreateMessage({ title: 'Clip Deleted', message: `The "${clipName}" clip has been deleted successfully.`, type: 'success' });
            }, 100);
        } catch (error) {
            CreateMessage({ title: 'Delete Failed', message: `Failed to delete clip "${clipName}": ${(error as Error).message}`, type: 'error' });
        } finally {
            setIsLoading(false);
            setClipToDelete(null);
        }
    };

    const handleDeleteCancel = () => {
        setDeleteConfirmOpen(false);
        setClipToDelete(null);
    };

    // ---- Drag clip (donor → target) ----------------------------------------
    const handleClipDragStart = (e: React.DragEvent, clip: Clip) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'wholeClip', clipName: clip.name, isFromDonor: true }));
        e.dataTransfer.effectAllowed = 'copy';
        (e.currentTarget as HTMLElement).style.opacity = '0.5';
    };

    const handleClipDragEnd = (e: React.DragEvent) => {
        (e.currentTarget as HTMLElement).style.opacity = '1';
    };

    const sanitizeClipTextForPort = (clipText: string): string => {
        const lines = clipText.split('\n');
        return lines.filter((line) => !line.trim().startsWith('mMaskDataName:')).join('\n');
    };

    const handleClipDrop = async (clipName: string) => {
        if (!donorData) return;
        try {
            saveStateToHistory(`Add clip "${clipName}"`);
            const donorContent = donorData.currentFileContent || donorData.originalAnimationContent;

            let clipText = extractClip(donorContent, clipName);
            if (!clipText) clipText = extractClip(donorContent, clipName.replace(/"/g, ''));
            if (!clipText) {
                throw new Error(`Could not extract clip "${clipName}" from donor file. Available clips: ${Object.keys(donorData.animationData.clips).join(', ')}`);
            }

            const sanitizedClipText = sanitizeClipTextForPort(clipText);
            const modifiedContent = insertClip(getTargetContent(), sanitizedClipText);
            applyTargetContent(modifiedContent);

            CreateMessage({ title: 'Clip Added', message: `The "${clipName}" clip has been added to the target file.`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Drop Failed', message: `Failed to add clip: ${(error as Error).message}`, type: 'error' });
        }
    };

    // ---- Clip name editing -------------------------------------------------
    const handleClipNameEdit = (clipName: string) => {
        setEditingClipName(clipName);
        setNewClipName(clipName);
    };

    const handleClipNameSave = (oldName: string, newName: string) => {
        if (!newName.trim() || newName === oldName) {
            setEditingClipName(null);
            return;
        }
        try {
            saveStateToHistory(`Rename clip "${oldName}"`);
            const content = getTargetContent();

            const formattedNewName = newName.startsWith('0x') ? newName : newName.startsWith('"') && newName.endsWith('"') ? newName : `"${newName}"`;
            const oldNameInFile = oldName.startsWith('0x') ? oldName : `"${oldName}"`;

            let updatedContent = content;
            const clipPattern = new RegExp(`${oldNameInFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(AtomicClipData|SequencerClipData|ParametricClipData|ConditionFloatClipData|SelectorClipData)\\s*{`, 'g');
            updatedContent = updatedContent.replace(clipPattern, `${formattedNewName} = $1 {`);
            const stringRefPattern = new RegExp(`"${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
            updatedContent = updatedContent.replace(stringRefPattern, formattedNewName);

            applyTargetContent(updatedContent);
            CreateMessage({ title: 'Clip Renamed Successfully', message: `Clip "${oldName}" has been renamed to "${newName}"`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Renaming Failed', message: (error as Error).message, type: 'error' });
        } finally {
            setEditingClipName(null);
        }
    };

    const handleClipNameCancel = () => {
        setEditingClipName(null);
        setNewClipName('');
    };

    const handleClipNameKeyPress = (e: React.KeyboardEvent, oldName: string) => {
        if (e.key === 'Enter') handleClipNameSave(oldName, newClipName);
        else if (e.key === 'Escape') handleClipNameCancel();
    };

    // ---- Create new clip ---------------------------------------------------
    const generateClipContainerText = (clipName: string, clipType: string): string => {
        const quotedName = `"${clipName}"`;
        const lines: string[] = [];
        lines.push(`${quotedName} = ${clipType} {`);
        if (clipType === 'AtomicClipData') {
            lines.push('                mEventDataMap: map[hash,pointer] = {');
            lines.push('                }');
        } else if (clipType === 'SequencerClipData') {
            lines.push('                mClipNameList: list[hash] = {');
            lines.push('                }');
        } else if (clipType === 'SelectorClipData') {
            return generateSelectorClipDataText(clipName);
        } else if (clipType === 'ParametricClipData') {
            lines.push('                mEventDataMap: map[hash,pointer] = {');
            lines.push('                }');
        } else if (clipType === 'ConditionFloatClipData') {
            lines.push('                mConditionFloatPairDataList: list[embed] = {');
            lines.push('                }');
            lines.push('                Updater: pointer = MoveSpeedParametricUpdater {');
            lines.push('                }');
            lines.push('                mChangeAnimationMidPlay: bool = true');
        } else {
            lines.push('                mEventDataMap: map[hash,pointer] = {');
            lines.push('                }');
        }
        lines.push('            }');
        return lines.join('\n');
    };

    const handleCreateNewClip = () => {
        const clipName = (newClipNameInput || '').trim();
        const clipType = newClipType;
        if (!clipName) {
            CreateMessage({ title: 'Missing Name', message: 'Enter a new clip name.', type: 'error' });
            return;
        }
        if (!targetData?.animationData) {
            CreateMessage({ title: 'No Target Loaded', message: 'Load target files first.', type: 'error' });
            return;
        }
        if (targetData.animationData.clips[clipName]) {
            CreateMessage({ title: 'Already Exists', message: `Clip "${clipName}" already exists.`, type: 'warning' });
            return;
        }
        try {
            saveStateToHistory(`Create clip "${clipName}"`);
            const clipText = generateClipContainerText(clipName, clipType);
            const updatedContent = insertClip(getTargetContent(), clipText);
            applyTargetContent(updatedContent);
            setNewClipNameInput('');
            setNewClipType('AtomicClipData');
            CreateMessage({ title: 'Clip Created', message: `Created ${clipType} "${clipName}" in target animation.`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Creation Failed', message: (error as Error).message, type: 'error' });
        }
    };

    // ---- Sequencer child clips ---------------------------------------------
    const handleAddClipToSequencer = (sequencerClipName: string, childClipName: string) => {
        try {
            saveStateToHistory(`Add child clip to Sequencer "${sequencerClipName}"`);
            const currentContent = getTargetContent();

            const clipPattern = sequencerClipName.startsWith('0x')
                ? new RegExp(`${sequencerClipName}\\s*=\\s*SequencerClipData\\s*{`)
                : new RegExp(`"${sequencerClipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*SequencerClipData\\s*{`);
            const match = currentContent.match(clipPattern);
            if (!match || match.index === undefined) throw new Error(`Sequencer clip "${sequencerClipName}" not found`);

            const start = match.index;
            let brace = 0;
            let inBlock = false;
            let end = start;
            for (let i = start; i < currentContent.length; i++) {
                const ch = currentContent[i];
                if (ch === '{') {
                    brace++;
                    inBlock = true;
                } else if (ch === '}') {
                    brace--;
                    if (inBlock && brace === 0) {
                        end = i;
                        break;
                    }
                }
            }
            const clipBlock = currentContent.substring(start, end + 1);

            let updatedClip = clipBlock;
            const listStartMatch = clipBlock.match(/mClipNameList\s*:\s*list\[hash\]\s*=\s*{/);
            if (!listStartMatch) {
                const firstLineEnd = clipBlock.indexOf('\n');
                const before = clipBlock.substring(0, firstLineEnd + 1);
                const after = clipBlock.substring(firstLineEnd + 1);
                updatedClip = `${before}                mClipNameList: list[hash] = {\n                }\n${after}`;
            }

            const listStart = updatedClip.search(/mClipNameList\s*:\s*list\[hash\]\s*=\s*{/);
            let insertPos = -1;
            if (listStart >= 0) {
                let depth = 0;
                let foundStart = false;
                for (let i = listStart; i < updatedClip.length; i++) {
                    const c = updatedClip[i];
                    if (c === '{') {
                        depth++;
                        foundStart = true;
                    } else if (c === '}') {
                        depth--;
                        if (foundStart && depth === 0) {
                            insertPos = i;
                            break;
                        }
                    }
                }
            }
            if (insertPos === -1) throw new Error('Could not locate mClipNameList closing brace');

            const existingListSection = updatedClip.substring(listStart, insertPos);
            if (existingListSection.includes(`"${childClipName}"`) || existingListSection.includes(childClipName)) {
                CreateMessage({ title: 'Already in List', message: `"${childClipName}" already present.`, type: 'warning' });
                return;
            }

            const useQuoted = !childClipName.startsWith('0x');
            const entryLine = `\n                    ${useQuoted ? `"${childClipName}"` : childClipName}`;
            let finalUpdatedClip = updatedClip.substring(0, insertPos) + entryLine + updatedClip.substring(insertPos);
            const closingBracePattern = /(\n\s*"[^"]+")\s*}/;
            if (finalUpdatedClip.match(closingBracePattern)) {
                finalUpdatedClip = finalUpdatedClip.replace(closingBracePattern, '$1\n                }');
            }

            const newContent = currentContent.substring(0, start) + finalUpdatedClip + currentContent.substring(end + 1);
            applyTargetContent(newContent);
            setSequencerSearch('');
            setSequencerOpenFor(null);
            CreateMessage({ title: 'Child Added', message: `Added "${childClipName}" to ${sequencerClipName}.`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Add Failed', message: (error as Error).message, type: 'error' });
        }
    };

    // ---- Ensure mEventDataMap ----------------------------------------------
    const handleEnsureEventDataMap = (clipName: string) => {
        try {
            saveStateToHistory(`Ensure mEventDataMap for "${clipName}"`);
            const currentContent = getTargetContent();

            const clipPattern = clipName.startsWith('0x')
                ? new RegExp(`${clipName}\\s*=\\s*(AtomicClipData|SequencerClipData|SelectorClipData|ParametricClipData|ConditionFloatClipData)\\s*{`)
                : new RegExp(`"${clipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*(AtomicClipData|SequencerClipData|SelectorClipData|ParametricClipData|ConditionFloatClipData)\\s*{`);
            const match = currentContent.match(clipPattern);
            if (!match || match.index === undefined) throw new Error(`Clip "${clipName}" not found`);

            const start = match.index;
            let brace = 0;
            let inBlock = false;
            let end = start;
            for (let i = start; i < currentContent.length; i++) {
                const ch = currentContent[i];
                if (ch === '{') {
                    brace++;
                    inBlock = true;
                } else if (ch === '}') {
                    brace--;
                    if (inBlock && brace === 0) {
                        end = i;
                        break;
                    }
                }
            }
            let clipBlock = currentContent.substring(start, end + 1);
            if (/mEventDataMap\s*:\s*map\[hash,pointer\]\s*=\s*{/.test(clipBlock)) {
                CreateMessage({ title: 'Already Exists', message: 'mEventDataMap already present.', type: 'info' });
                return;
            }

            const lines = clipBlock.split('\n');
            let braceDepth = 0;
            let lastPropertyEnd = -1;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                for (const char of line) {
                    if (char === '{') braceDepth++;
                    if (char === '}') braceDepth--;
                }
                if (braceDepth <= 1 && line.trim().endsWith('}') && !line.trim().startsWith('}')) lastPropertyEnd = i;
            }

            let insertPos: number;
            if (lastPropertyEnd >= 0) {
                const beforeInsert = lines.slice(0, lastPropertyEnd + 1).join('\n');
                const afterInsert = lines.slice(lastPropertyEnd + 1).join('\n');
                insertPos = beforeInsert.length;
                clipBlock = beforeInsert + '\n' + afterInsert;
            } else {
                insertPos = clipBlock.lastIndexOf('}');
            }
            if (insertPos === -1) insertPos = clipBlock.length - 1;

            const eventMapSnippet = `\n                mEventDataMap: map[hash,pointer] = {\n                }\n`;
            const updatedClip = clipBlock.substring(0, insertPos) + eventMapSnippet + clipBlock.substring(insertPos);
            const newContent = currentContent.substring(0, start) + updatedClip + currentContent.substring(end + 1);
            applyTargetContent(newContent);
            CreateMessage({ title: 'EventDataMap Added', message: `Added mEventDataMap to "${clipName}".`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Operation Failed', message: (error as Error).message, type: 'error' });
        }
    };

    // ---- Selector pairs ----------------------------------------------------
    const handleAddSelectorPair = (selectorClipName: string, childClipName: string, probability = 1.0) => {
        try {
            saveStateToHistory(`Add selector pair to "${selectorClipName}"`);
            const result = addSelectorPair(getTargetContent(), selectorClipName, childClipName, probability);
            if (result.duplicate) {
                CreateMessage({ title: 'Already in List', message: `"${childClipName}" already present.`, type: 'warning' });
                return;
            }
            applyTargetContent(result.content);
            setSelectorSearch('');
            setSelectorOpenFor(null);
            CreateMessage({ title: 'Pair Added', message: `Added "${childClipName}" to ${selectorClipName}.`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Add Failed', message: (error as Error).message, type: 'error' });
        }
    };

    const handleRemoveSelectorPair = (selectorClipName: string, pairIndex: number) => {
        try {
            saveStateToHistory(`Remove selector pair from "${selectorClipName}"`);
            const newContent = removeSelectorPair(getTargetContent(), selectorClipName, pairIndex);
            applyTargetContent(newContent);
            CreateMessage({ title: 'Pair Removed', message: `Removed pair from ${selectorClipName}.`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Remove Failed', message: (error as Error).message, type: 'error' });
        }
    };

    const handleEditSelectorPairProbability = (selectorClipName: string, pairIndex: number, currentProbability: number) => {
        setEditingSelectorPair(`${selectorClipName}-${pairIndex}`);
        setEditingProbability(currentProbability.toString());
    };

    const handleSaveSelectorPairProbability = (selectorClipName: string, pairIndex: number) => {
        try {
            const newProbability = parseFloat(editingProbability);
            saveStateToHistory(`Edit selector probability in "${selectorClipName}"`);
            const newContent = updateSelectorPairProbability(getTargetContent(), selectorClipName, pairIndex, newProbability);
            applyTargetContent(newContent);
            CreateMessage({ title: 'Probability Updated', message: `Updated probability in ${selectorClipName}.`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Update Failed', message: (error as Error).message, type: 'error' });
        } finally {
            setEditingSelectorPair(null);
            setEditingProbability('');
        }
    };

    const handleCancelEditSelectorPair = () => {
        setEditingSelectorPair(null);
        setEditingProbability('');
    };

    const handleDeleteSelectorClipData = async (selectorClipName: string) => {
        try {
            saveStateToHistory(`Delete SelectorClipData "${selectorClipName}"`);
            const newContent = deleteSelectorClipData(getTargetContent(), selectorClipName);
            applyTargetContent(newContent);
            CreateMessage({ title: 'Clip Deleted', message: `Deleted SelectorClipData "${selectorClipName}".`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Delete Failed', message: (error as Error).message, type: 'error' });
        }
    };

    // ---- ConditionFloat pairs ----------------------------------------------
    const handleAddConditionFloatPair = (conditionFloatClipName: string, clipName: string, value: number | null = null) => {
        try {
            saveStateToHistory(`Add condition float pair to "${conditionFloatClipName}"`);
            const currentContent = getTargetContent();

            const clipPattern = conditionFloatClipName.startsWith('0x')
                ? new RegExp(`${conditionFloatClipName}\\s*=\\s*ConditionFloatClipData\\s*{`)
                : new RegExp(`"${conditionFloatClipName}"\\s*=\\s*ConditionFloatClipData\\s*{`);
            const match = currentContent.match(clipPattern);
            if (!match || match.index === undefined) throw new Error(`ConditionFloatClipData clip "${conditionFloatClipName}" not found`);

            const clipStartIndex = match.index;
            let braceCount = 0;
            let inClip = false;
            let end = clipStartIndex;
            for (let i = clipStartIndex; i < currentContent.length; i++) {
                const char = currentContent[i];
                if (char === '{') {
                    braceCount++;
                    inClip = true;
                } else if (char === '}') {
                    braceCount--;
                    if (inClip && braceCount === 0) {
                        end = i;
                        break;
                    }
                }
            }

            const clipBlock = currentContent.substring(clipStartIndex, end + 1);
            const conditionListMatch = clipBlock.match(/mConditionFloatPairDataList:\s*list\[embed\]\s*=\s*{/);
            if (!conditionListMatch || conditionListMatch.index === undefined) throw new Error('mConditionFloatPairDataList not found in ConditionFloatClipData');

            const listStartIndex = clipStartIndex + conditionListMatch.index;
            let listBraceCount = 0;
            let inList = false;
            let listEnd = listStartIndex;
            for (let i = listStartIndex; i < currentContent.length; i++) {
                const char = currentContent[i];
                if (char === '{') {
                    listBraceCount++;
                    inList = true;
                } else if (char === '}') {
                    listBraceCount--;
                    if (inList && listBraceCount === 0) {
                        listEnd = i;
                        break;
                    }
                }
            }

            const newPair = `            ConditionFloatPairData {\n                mClipName: hash = "${clipName}"${value !== null ? `\n                mValue: f32 = ${value}` : ''}\n            }`;
            const beforeList = currentContent.substring(0, listEnd);
            const afterList = currentContent.substring(listEnd);
            const listContent = currentContent.substring(listStartIndex, listEnd + 1);
            const isEmpty = listContent.trim() === '{';
            const insertText = isEmpty ? `\n${newPair}\n        }` : `,\n${newPair}\n        }`;
            const modifiedContent = beforeList + insertText + afterList;

            applyTargetContent(modifiedContent);
            CreateMessage({ title: 'Condition Float Pair Added', message: `Added condition float pair "${clipName}" to "${conditionFloatClipName}"`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Add Failed', message: (error as Error).message, type: 'error' });
        }
    };

    const handleRemoveConditionFloatPair = (conditionFloatClipName: string, pairIndex: number) => {
        try {
            saveStateToHistory(`Remove condition float pair from "${conditionFloatClipName}"`);
            const currentContent = getTargetContent();

            const clipPattern = conditionFloatClipName.startsWith('0x')
                ? new RegExp(`${conditionFloatClipName}\\s*=\\s*ConditionFloatClipData\\s*{`)
                : new RegExp(`"${conditionFloatClipName}"\\s*=\\s*ConditionFloatClipData\\s*{`);
            const match = currentContent.match(clipPattern);
            if (!match || match.index === undefined) throw new Error(`ConditionFloatClipData clip "${conditionFloatClipName}" not found`);

            const clipStartIndex = match.index;
            let braceCount = 0;
            let inClip = false;
            let end = clipStartIndex;
            for (let i = clipStartIndex; i < currentContent.length; i++) {
                const char = currentContent[i];
                if (char === '{') {
                    braceCount++;
                    inClip = true;
                } else if (char === '}') {
                    braceCount--;
                    if (inClip && braceCount === 0) {
                        end = i;
                        break;
                    }
                }
            }

            const clipBlock = currentContent.substring(clipStartIndex, end + 1);
            const pairPattern = /ConditionFloatPairData\s*{[\s\S]*?}/g;
            const pairs = Array.from(clipBlock.matchAll(pairPattern));
            if (pairIndex >= pairs.length) throw new Error(`Pair index ${pairIndex} out of range (${pairs.length} pairs found)`);

            const pairText = pairs[pairIndex][0];
            let modifiedClipBlock = clipBlock.replace(pairText, '');
            modifiedClipBlock = modifiedClipBlock.replace(/,\s*}/g, '}').replace(/{\s*,/g, '{');
            const modifiedContent = currentContent.substring(0, clipStartIndex) + modifiedClipBlock + currentContent.substring(end + 1);

            applyTargetContent(modifiedContent);
            CreateMessage({ title: 'Condition Float Pair Removed', message: `Removed condition float pair from "${conditionFloatClipName}"`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Remove Failed', message: (error as Error).message, type: 'error' });
        }
    };

    // ---- Property line editors (track/mask/animation path/clip name list) ---
    const updateClipInState = (clipName: string, patch: Partial<Clip>) => {
        setTargetData((prev) => {
            if (!prev) return prev;
            const updatedClips = { ...prev.animationData.clips };
            if (updatedClips[clipName]) updatedClips[clipName] = { ...updatedClips[clipName], ...patch };
            return { ...prev, animationData: { ...prev.animationData, clips: updatedClips } };
        });
    };

    const handleTrackDataNameInputChange = (clipName: string, newTrackDataName: string) => updateClipInState(clipName, { trackDataName: newTrackDataName });

    const handleTrackDataNameChange = (clipName: string, newTrackDataName: string) => {
        try {
            saveStateToHistory(`Edit track data name for "${clipName}"`);
            const currentContent = getTargetContent();
            const clipPattern = clipName.startsWith('0x')
                ? new RegExp(`${clipName}\\s*=\\s*(AtomicClipData|SequencerClipData|ConditionFloatClipData)\\s*{`)
                : new RegExp(`"${clipName}"\\s*=\\s*(AtomicClipData|SequencerClipData|ConditionFloatClipData)\\s*{`);
            const match = currentContent.match(clipPattern);
            if (!match || match.index === undefined) throw new Error(`Could not find clip "${clipName}" in file`);

            const clipStartIndex = match.index;
            let braceCount = 0;
            let inClip = false;
            let clipEndIndex = clipStartIndex;
            for (let i = clipStartIndex; i < currentContent.length; i++) {
                const char = currentContent[i];
                if (char === '{') {
                    braceCount++;
                    inClip = true;
                } else if (char === '}') {
                    braceCount--;
                    if (inClip && braceCount === 0) {
                        clipEndIndex = i;
                        break;
                    }
                }
            }

            const clipContent = currentContent.substring(clipStartIndex, clipEndIndex + 1);
            const formattedTrackName = newTrackDataName.startsWith('0x') ? newTrackDataName : newTrackDataName.startsWith('"') && newTrackDataName.endsWith('"') ? newTrackDataName : `"${newTrackDataName}"`;

            let updatedClipContent: string;
            const lines = clipContent.split('\n');
            const trackDataNameLineIndex = lines.findIndex((l) => l.trim().startsWith('mTrackDataName:'));
            if (trackDataNameLineIndex !== -1) {
                const indent = lines[trackDataNameLineIndex].match(/^(\s*)/)?.[1] || '';
                lines[trackDataNameLineIndex] = `${indent}mTrackDataName: hash = ${formattedTrackName}`;
                updatedClipContent = lines.join('\n');
            } else {
                const insertPos = clipContent.indexOf('{') + 1;
                updatedClipContent = clipContent.slice(0, insertPos) + `\n    mTrackDataName: hash = ${formattedTrackName}` + clipContent.slice(insertPos);
            }

            const modifiedContent = currentContent.substring(0, clipStartIndex) + updatedClipContent + currentContent.substring(clipEndIndex + 1);
            applyTargetContent(modifiedContent);
            CreateMessage({ title: 'Track Data Updated', message: `Track data name for "${clipName}" updated to "${newTrackDataName}"`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Update Failed', message: `Failed to update track data name: ${(error as Error).message}`, type: 'error' });
        }
    };

    const handleMaskDataNameInputChange = (clipName: string, newMaskDataName: string) => {
        setMaskDataNameInputs((prev) => ({ ...prev, [clipName]: newMaskDataName }));
    };

    const handleMaskDataNameChange = (clipName: string, newMaskDataName: string) => {
        try {
            saveStateToHistory(`Edit mask data name for "${clipName}"`);
            const currentContent = getTargetContent();
            const clipPattern = clipName.startsWith('0x')
                ? new RegExp(`${clipName}\\s*=\\s*(AtomicClipData|SequencerClipData|ConditionFloatClipData)\\s*{`)
                : new RegExp(`"${clipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*(AtomicClipData|SequencerClipData|ConditionFloatClipData)\\s*{`);
            const match = currentContent.match(clipPattern);
            if (!match || match.index === undefined) throw new Error(`Could not find clip "${clipName}" in file`);

            const clipStart = match.index;
            let depth = 0;
            let seenOpen = false;
            let end = clipStart;
            for (let i = clipStart; i < currentContent.length; i++) {
                const ch = currentContent[i];
                if (ch === '{') {
                    depth++;
                    seenOpen = true;
                } else if (ch === '}') depth--;
                if (seenOpen && depth === 0) {
                    end = i;
                    break;
                }
            }
            const clipBlock = currentContent.slice(clipStart, end + 1);
            const formattedMaskName = newMaskDataName.startsWith('0x') ? newMaskDataName : newMaskDataName.startsWith('"') && newMaskDataName.endsWith('"') ? newMaskDataName : `"${newMaskDataName}"`;

            let newClipBlock: string;
            const lines = clipBlock.split('\n');
            const maskDataNameLineIndex = lines.findIndex((l) => l.trim().startsWith('mMaskDataName:'));
            if (maskDataNameLineIndex !== -1) {
                const indent = lines[maskDataNameLineIndex].match(/^(\s*)/)?.[1] || '';
                lines[maskDataNameLineIndex] = `${indent}mMaskDataName: hash = ${formattedMaskName}`;
                newClipBlock = lines.join('\n');
            } else {
                const insertPos = clipBlock.indexOf('{') + 1;
                newClipBlock = clipBlock.slice(0, insertPos) + `\n                mMaskDataName: hash = ${formattedMaskName}` + clipBlock.slice(insertPos);
            }

            const updated = currentContent.slice(0, clipStart) + newClipBlock + currentContent.slice(end + 1);
            applyTargetContent(updated);
            setMaskDataNameInputs((prev) => {
                const next = { ...prev };
                delete next[clipName];
                return next;
            });
            CreateMessage({ title: 'Mask Data Name Updated', message: `Set to ${formattedMaskName} for ${clipName}`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Update Failed', message: (error as Error).message, type: 'error' });
        }
    };

    const handleAnimationFilePathInputChange = (clipName: string, newValue: string) => updateClipInState(clipName, { animationFilePath: newValue });

    const handleAnimationFilePathChange = (clipName: string, newValue: string) => {
        try {
            saveStateToHistory(`Edit animation file path for "${clipName}"`);
            const currentContent = getTargetContent();
            const clipPattern = clipName.startsWith('0x')
                ? new RegExp(`${clipName}\\s*=\\s*AtomicClipData\\s*{`)
                : new RegExp(`"${clipName}"\\s*=\\s*AtomicClipData\\s*{`);
            const match = currentContent.match(clipPattern);
            if (!match || match.index === undefined) throw new Error(`Could not find AtomicClipData clip "${clipName}" in file`);

            const clipStartIndex = match.index;
            let braceCount = 0;
            let inClip = false;
            let clipEndIndex = clipStartIndex;
            for (let i = clipStartIndex; i < currentContent.length; i++) {
                const char = currentContent[i];
                if (char === '{') {
                    braceCount++;
                    inClip = true;
                } else if (char === '}') {
                    braceCount--;
                    if (inClip && braceCount === 0) {
                        clipEndIndex = i;
                        break;
                    }
                }
            }

            const clipContent = currentContent.substring(clipStartIndex, clipEndIndex + 1);
            const standalonePathPattern = /mAnimationFilePath:\s*string\s*=\s*"([^"]+)"/;
            const resourceDataMatch = clipContent.match(/mAnimationResourceData:\s*embed\s*=\s*AnimationResourceData\s*\{[\s\S]*?mAnimationFilePath:\s*string\s*=\s*"([^"]+)"[\s\S]*?\}/);
            const standalonePathMatch = clipContent.match(standalonePathPattern);

            let updatedClipContent: string;
            if (resourceDataMatch) {
                updatedClipContent = clipContent.replace(
                    /mAnimationResourceData:\s*embed\s*=\s*AnimationResourceData\s*\{[\s\S]*?mAnimationFilePath:\s*string\s*=\s*"([^"]+)"/,
                    (m, oldPath) => m.replace(`"${oldPath}"`, `"${newValue}"`),
                );
            } else if (standalonePathMatch) {
                updatedClipContent = clipContent.replace(standalonePathPattern, `mAnimationFilePath: string = "${newValue}"`);
            } else {
                let indent = '                ';
                const lines = clipContent.split('\n');
                for (const line of lines) {
                    if (line.trim().startsWith('mEventDataMap:') || line.trim().startsWith('mTrackDataName:')) {
                        indent = line.match(/^(\s+)/)?.[1] || indent;
                        break;
                    }
                }
                const innerIndent = indent + '    ';
                const newProperty = [indent + 'mAnimationResourceData: embed = AnimationResourceData {', innerIndent + `mAnimationFilePath: string = "${newValue}"`, indent + '}'].join('\n');
                const insertPos = clipContent.indexOf('{') + 1;
                updatedClipContent = clipContent.slice(0, insertPos) + '\n' + newProperty + clipContent.slice(insertPos);
            }

            const modifiedContent = currentContent.substring(0, clipStartIndex) + updatedClipContent + currentContent.substring(clipEndIndex + 1);
            applyTargetContent(modifiedContent);
            CreateMessage({ title: 'Animation Path Updated', message: `Animation file path for "${clipName}" updated to "${newValue}"`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Update Failed', message: `Failed to update animation file path: ${(error as Error).message}`, type: 'error' });
        }
    };

    const handleClipNameListChange = (clipName: string, index: number, newValue: string) => {
        setTargetData((prev) => {
            if (!prev) return prev;
            const updatedClips = { ...prev.animationData.clips };
            if (updatedClips[clipName]?.clipNameList) {
                updatedClips[clipName] = {
                    ...updatedClips[clipName],
                    clipNameList: updatedClips[clipName].clipNameList.map((item, i) => (i === index ? { ...item, value: newValue } : item)),
                };
            }
            return { ...prev, animationData: { ...prev.animationData, clips: updatedClips } };
        });
    };

    const handleClipNameListSave = (clipName: string, index: number, newValue: string, type: string) => {
        try {
            saveStateToHistory(`Edit clip name list for "${clipName}"`);
            const currentContent = getTargetContent();
            const clipPattern = clipName.startsWith('0x')
                ? new RegExp(`${clipName}\\s*=\\s*SequencerClipData\\s*{`)
                : new RegExp(`"${clipName}"\\s*=\\s*SequencerClipData\\s*{`);
            const match = currentContent.match(clipPattern);
            if (!match || match.index === undefined) throw new Error(`Could not find SequencerClipData clip "${clipName}" in file`);

            const clipStartIndex = match.index;
            let braceCount = 0;
            let clipEndIndex = clipStartIndex;
            let inClip = false;
            for (let i = clipStartIndex; i < currentContent.length; i++) {
                const char = currentContent[i];
                if (char === '{') {
                    braceCount++;
                    inClip = true;
                } else if (char === '}') {
                    braceCount--;
                    if (inClip && braceCount === 0) {
                        clipEndIndex = i;
                        break;
                    }
                }
            }

            const clipContent = currentContent.substring(clipStartIndex, clipEndIndex + 1);
            const lines = clipContent.split('\n');
            let targetLineIndex = -1;
            let currentIndex = 0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.match(/^"([^"]+)"$/) || line.match(/^(0x[0-9a-fA-F]+)$/)) {
                    if (currentIndex === index) {
                        targetLineIndex = i;
                        break;
                    }
                    currentIndex++;
                }
            }
            if (targetLineIndex === -1) throw new Error(`Could not find clip name entry at index ${index}`);

            const newFormattedValue = type === 'quoted' ? `"${newValue}"` : newValue;
            lines[targetLineIndex] = lines[targetLineIndex].replace(/^(\s*).*$/, `$1${newFormattedValue}`);
            const updatedClipContent = lines.join('\n');
            const modifiedContent = currentContent.substring(0, clipStartIndex) + updatedClipContent + currentContent.substring(clipEndIndex + 1);

            applyTargetContent(modifiedContent);
            CreateMessage({ title: 'Clip Name Updated', message: `Clip name list entry for "${clipName}" updated to "${newFormattedValue}"`, type: 'success' });
        } catch (error) {
            CreateMessage({ title: 'Update Failed', message: `Failed to update clip name list: ${(error as Error).message}`, type: 'error' });
        }
    };

    // ---- Event drag / drop (port) ------------------------------------------
    const handleDragStart = (e: React.DragEvent, event: AnimEvent, sourceClip: Clip | { name: string; type: string }) => {
        e.stopPropagation();
        e.dataTransfer.setData('application/json', JSON.stringify({ event, sourceClip, type: 'animation-event', isStandalone: (event as { isStandalone?: boolean }).isStandalone || false }));
    };

    const handlePortEvent = (event: AnimEvent, sourceClip: { name: string }, targetClipName: string) => {
        try {
            saveStateToHistory(`Port event "${(event as unknown as Record<string, unknown>).name || (event as unknown as Record<string, unknown>).effectKey}" to "${targetClipName}"`);
            setIsLoading(true);
            setLoadingMessage('Porting event...');

            const targetClip = getTargetClips().find((clip) => clip.name === targetClipName) || targetData?.animationData?.clips?.[targetClipName];
            if (!targetClip) throw new Error(`Target clip "${targetClipName}" not found`);

            const ev = event as unknown as Record<string, unknown>;
            const isStandalone = !!ev.isStandalone;

            if (targetClip.type === 'SelectorClipData') {
                const newContent = addEventToSelectorClipDataContent(getTargetContent(), targetClipName, (event as { rawContent: string }).rawContent);
                applyTargetContent(newContent);
                CreateMessage({ title: 'Event Ported', message: `Event ported successfully to SelectorClipData "${targetClipName}"`, type: 'success' });
            } else if (isStandalone) {
                const newContent = addStandaloneEventToClipContent(getTargetContent(), targetClipName, event);
                applyTargetContent(newContent);
                CreateMessage({ title: 'Standalone Event Ported', message: `Standalone event "${ev.name || ev.effectKey}" ported successfully to "${targetClipName}"`, type: 'success' });
            } else if (event.type === 'particle' && ev.effectKey) {
                // Pick the matching donor particle event and port its raw block + VFX system.
                const donorClip = donorData?.animationData?.clips?.[sourceClip.name];
                const donorParticles = donorClip?.events?.particle || [];
                const sameKey = donorParticles.filter((pe) => pe.effectKey === ev.effectKey);
                let picked = sameKey.find((pe) => pe.eventName === (ev.eventName || ev.hash) || pe.hash === (ev.eventName || ev.hash)) || null;
                if (!picked && ev.startFrame != null) picked = sameKey.find((pe) => pe.startFrame === ev.startFrame) || null;
                if (!picked && sameKey.length > 0) picked = sameKey[0];
                if (!picked) throw new Error('Could not locate donor particle event with matching effectKey/hash/startFrame');

                const vfxConn = findVfxSystemForEffectKey(ev.effectKey as string, donorData?.vfxSystems || {}, donorData?.resourceResolver || {});

                // Port the VFX system + resolver into target state.
                setTargetData((prev) => {
                    if (!prev) return prev;
                    const vfxSystems = { ...prev.vfxSystems };
                    const resourceResolver = { ...prev.resourceResolver };
                    portAnimationEventWithVfx(
                        {
                            animationClip: targetClipName,
                            particleEvent: picked!,
                            vfxSystem: vfxConn ? vfxConn.vfxSystem : { name: ev.effectKey as string },
                            resourceResolverKey: vfxConn ? vfxConn.resourceKey : (ev.effectKey as string),
                            connectionType: vfxConn ? vfxConn.connectionType : 'direct',
                        },
                        prev.animationData,
                        vfxSystems,
                        resourceResolver,
                    );
                    return { ...prev, vfxSystems, resourceResolver };
                });

                // Write the particle event block into the target clip's mEventDataMap.
                if (picked.rawContent) {
                    const newContent = addStandaloneEventToClipContent(getTargetContent(), targetClipName, picked);
                    applyTargetContent(newContent);
                }
                CreateMessage({ title: 'Event Ported Successfully', message: `${ev.effectKey} has been ported with its VFX system.`, type: 'success' });
            } else {
                // Non-particle / particle-without-effectKey: write the raw event block.
                if ((event as { rawContent?: string }).rawContent) {
                    const newContent = addStandaloneEventToClipContent(getTargetContent(), targetClipName, event);
                    applyTargetContent(newContent);
                }
                CreateMessage({ title: 'Event Ported', message: `Event ported successfully to ${targetClipName}`, type: 'success' });
            }
        } catch (error) {
            CreateMessage({ title: 'Porting Failed', message: (error as Error).message, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDrop = (e: React.DragEvent, targetClip: Clip) => {
        e.preventDefault();
        try {
            const rawData = e.dataTransfer.getData('application/json');
            const data = JSON.parse(rawData);
            if (data.type === 'animation-event') {
                handlePortEvent(data.event, data.sourceClip, targetClip.name);
            } else if (data.type === 'wholeClip') {
                handleClipDrop(data.clipName);
            }
        } catch {
            /* ignore malformed drop */
        }
    };

    const handleDragOver = (e: React.DragEvent, targetClip: Clip) => {
        e.preventDefault();
        if (targetClip) setDragOverClip(targetClip.name);
    };

    const handleDragLeave = () => setDragOverClip(null);

    // ---- Render ------------------------------------------------------------
    const renderClipStats = (clip: Clip): number =>
        Object.values(clip.events || {}).reduce((sum, events) => sum + (events?.length || 0), 0) +
        (clip.type === 'SequencerClipData' ? clip.clipNameList?.length || 0 : 0) +
        (clip.type === 'SelectorClipData' ? clip.selectorPairs?.length || 0 : 0) +
        (clip.type === 'ParametricClipData' ? clip.parametricPairs?.length || 0 : 0) +
        (clip.type === 'ConditionFloatClipData' ? clip.conditionFloatPairs?.length || 0 : 0);

    return (
        <div className="aniport-container">
            {/* Info Button */}
            <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000 }}>
                <Tooltip
                    open={showInfoTooltip}
                    onClose={() => setShowInfoTooltip(false)}
                    title={
                        <div style={{ fontSize: '0.875rem', padding: '4px 0' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>⚠️ AniPort Simple is still in production!</div>
                            <div>Please check the Python file while the program processes to ensure nothing breaks.</div>
                        </div>
                    }
                    arrow
                    placement="left"
                >
                    <IconButton
                        onClick={() => setShowInfoTooltip(!showInfoTooltip)}
                        sx={{
                            backgroundColor: 'color-mix(in oklab, var(--color-warning) 10%, transparent)',
                            border: '1px solid color-mix(in oklab, var(--color-warning) 30%, transparent)',
                            color: 'var(--color-warning)',
                            '&:hover': { backgroundColor: 'color-mix(in oklab, var(--color-warning) 20%, transparent)' },
                        }}
                        size="small"
                    >
                        <InfoIcon />
                    </IconButton>
                </Tooltip>
            </div>

            {/* Loading Overlay */}
            {isLoading && (
                <div className="loading-overlay">
                    <GlowingSpinner />
                    <div className="loading-info">
                        <p>{loadingMessage}</p>
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${loadingProgress}%` }}></div>
                        </div>
                        <span>{loadingProgress}%</span>
                    </div>
                </div>
            )}

            {/* Page Navigation */}
            {donorData && targetData && (
                <div className="page-navigation">
                    <div className="dl-tabs page-tabs">
                        <button className={`dl-tab ${currentPage === 'animation' ? 'dl-tab--active' : ''}`} onClick={() => setCurrentPage('animation')}>
                            🎬 Animation Editor
                        </button>
                        <button className={`dl-tab ${currentPage === 'mask' ? 'dl-tab--active' : ''}`} onClick={() => setCurrentPage('mask')}>
                            🎭 Mask Viewer
                        </button>
                    </div>
                </div>
            )}

            {/* File Loading Section */}
            {(!donorData || !targetData) && (
                <div className="file-loading-section">
                    <div className="file-grid">
                        {/* Target Files */}
                        <div className="file-section target-section">
                            <h3>Target Files (Destination)</h3>
                            <div className="file-inputs">
                                <div className="input-group">
                                    <button className="dl-btn dl-btn--secondary combined-button" onClick={() => handleCombinedFileSelect('target')}>
                                        {targetSelection ? `✓ ${baseName(targetSelection)}` : 'Select Combined File'}
                                    </button>
                                </div>
                            </div>
                            {recentTargetFiles.length > 0 && (
                                <div className="recent-files-section">
                                    <h4>📁 Recent Target Files</h4>
                                    <div className="recent-files-list">
                                        {recentTargetFiles.map((fileInfo, index) => (
                                            <div key={`${fileInfo.path}-${index}`} className="recent-file-item" onClick={() => selectRecentFile(fileInfo, 'target')} title={fileInfo.path}>
                                                <span className="recent-file-name">{fileInfo.name}</span>
                                                <span className="recent-file-time">{new Date(fileInfo.timestamp).toLocaleDateString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Donor Files */}
                        <div className="file-section donor-section">
                            <h3>Donor Files (Source)</h3>
                            <div className="file-inputs">
                                <div className="input-group">
                                    <button className="dl-btn dl-btn--secondary combined-button" onClick={() => handleCombinedFileSelect('donor')}>
                                        {donorSelection ? `✓ ${baseName(donorSelection)}` : 'Select Combined File'}
                                    </button>
                                </div>
                            </div>
                            {recentDonorFiles.length > 0 && (
                                <div className="recent-files-section">
                                    <h4>📁 Recent Donor Files</h4>
                                    <div className="recent-files-list">
                                        {recentDonorFiles.map((fileInfo, index) => (
                                            <div key={`${fileInfo.path}-${index}`} className="recent-file-item" onClick={() => selectRecentFile(fileInfo, 'donor')} title={fileInfo.path}>
                                                <span className="recent-file-name">{fileInfo.name}</span>
                                                <span className="recent-file-time">{new Date(fileInfo.timestamp).toLocaleDateString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {donorAnimationFile && donorSkinsFile && targetAnimationFile && targetSkinsFile && (
                        <div className="load-section">
                            <button className="dl-btn dl-btn--primary load-button" onClick={loadFiles} disabled={isLoading}>
                                Load Files
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Main Split-Screen Editor */}
            {donorData && targetData && (
                <div className="main-editor">
                    {currentPage === 'animation' ? (
                        <div className="animation-editor">
                            <div className="split-container">
                                {/* Target Panel (Left) */}
                                <div className="panel target-panel">
                                    <div className="panel-header"></div>

                                    <div className="panel-search">
                                        <input type="text" placeholder="Search target clips..." value={targetSearchTerm} onChange={(e) => setTargetSearchTerm(e.target.value)} className="dl-input search-input" />
                                        {targetSearchTerm && (
                                            <div className="search-results">
                                                <span>Showing {getTargetClips().length} of {targetData?.animationData?.clips ? Object.keys(targetData.animationData.clips).length : 0} clips</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Create New Clip Controls */}
                                    <div className="new-clip-controls">
                                        <input type="text" placeholder="New clip name (e.g., Run_Base)" value={newClipNameInput} onChange={(e) => setNewClipNameInput(e.target.value)} className="dl-input new-clip-name-input" />
                                        <select className="dl-select new-clip-type-select" value={newClipType} onChange={(e) => setNewClipType(e.target.value)}>
                                            <option value="AtomicClipData">AtomicClipData</option>
                                            <option value="SequencerClipData">SequencerClipData</option>
                                            <option value="SelectorClipData">SelectorClipData</option>
                                            <option value="ParametricClipData">ParametricClipData</option>
                                            <option value="ConditionFloatClipData">ConditionFloatClipData</option>
                                        </select>
                                        <button className="dl-btn dl-btn--primary new-clip-create-btn" onClick={handleCreateNewClip}>+ New Clip</button>
                                    </div>

                                    <div className="animation-list">
                                        {getTargetClips().length > 0 ? (
                                            getTargetClips().map((clip) => {
                                                const totalEvents = renderClipStats(clip);
                                                const isExpanded = expandedTargetClips.has(clip.name);
                                                return (
                                                    <div
                                                        key={clip.name}
                                                        className={`animation-clip target-clip ${dragOverClip === clip.name ? 'drag-over' : ''}`}
                                                        onDrop={(e) => {
                                                            handleDrop(e, clip);
                                                            setDragOverClip(null);
                                                        }}
                                                        onDragOver={(e) => handleDragOver(e, clip)}
                                                        onDragLeave={handleDragLeave}
                                                    >
                                                        <div
                                                            className="clip-header"
                                                            onClick={() => {
                                                                toggleTargetClipExpansion(clip.name);
                                                            }}
                                                        >
                                                            <div className="clip-info">
                                                                {editingClipName === clip.name ? (
                                                                    <div className="clip-name-editor" onClick={(e) => e.stopPropagation()}>
                                                                        <input
                                                                            type="text"
                                                                            value={newClipName}
                                                                            onChange={(e) => setNewClipName(e.target.value)}
                                                                            onKeyDown={(e) => handleClipNameKeyPress(e, clip.name)}
                                                                            onBlur={() => handleClipNameSave(clip.name, newClipName)}
                                                                            autoFocus
                                                                            className="dl-input clip-name-input"
                                                                        />
                                                                        <div className="clip-name-actions">
                                                                            <button onClick={() => handleClipNameSave(clip.name, newClipName)} className="dl-btn dl-btn--sm dl-btn--icon dl-btn--primary save-name-btn">✓</button>
                                                                            <button onClick={handleClipNameCancel} className="dl-btn dl-btn--sm dl-btn--icon dl-btn--danger cancel-name-btn">✗</button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="clip-name-container">
                                                                        <span className="clip-name">{getClipDisplayName(clip)}</span>
                                                                        <button
                                                                            className="dl-btn dl-btn--sm dl-btn--secondary edit-name-btn"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleClipNameEdit(clip.name);
                                                                            }}
                                                                            title="Edit clip name"
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                <span className="clip-type">{clip.type || 'Unknown'}</span>
                                                            </div>
                                                            <div className="clip-stats">
                                                                <span className="event-count">{totalEvents} events</span>
                                                                <button
                                                                    className="dl-btn dl-btn--sm dl-btn--icon dl-btn--danger clip-delete-btn"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteClipClick(clip.name);
                                                                    }}
                                                                    title="Delete entire clip"
                                                                >
                                                                    🗑️
                                                                </button>
                                                                <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▼</span>
                                                            </div>
                                                        </div>

                                                        {isExpanded && (
                                                            <div className="clip-events">
                                                                {/* Track Data Name Editor - AtomicClipData */}
                                                                {clip.type === 'AtomicClipData' && (
                                                                    <div className="clip-property-editor">
                                                                        <div className="property-row">
                                                                            <label className="property-label">Track Data Name:</label>
                                                                            <div className="property-combo">
                                                                                <input
                                                                                    type="text"
                                                                                    value={clip.trackDataName || ''}
                                                                                    onChange={(e) => handleTrackDataNameInputChange(clip.name, e.target.value)}
                                                                                    onBlur={(e) => handleTrackDataNameChange(clip.name, e.target.value)}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter') {
                                                                                            handleTrackDataNameChange(clip.name, (e.target as HTMLInputElement).value);
                                                                                            (e.target as HTMLInputElement).blur();
                                                                                        }
                                                                                    }}
                                                                                    className="dl-input property-input"
                                                                                    placeholder="Enter track data name (e.g., Default, base, 0x12345678)"
                                                                                />
                                                                                {Array.isArray(targetData?.animationData?.trackNames) && targetData.animationData.trackNames.length > 0 && (
                                                                                    <select
                                                                                        className="dl-select property-select"
                                                                                        onChange={(e) => {
                                                                                            const v = e.target.value;
                                                                                            if (v) handleTrackDataNameChange(clip.name, v);
                                                                                            e.target.selectedIndex = 0;
                                                                                        }}
                                                                                    >
                                                                                        <option value="">TrackDataMap entries…</option>
                                                                                        {targetData.animationData.trackNames.map((name) => (
                                                                                            <option key={name} value={name}>{name}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                )}
                                                                            </div>
                                                                            <div className="property-info">{!clip.trackDataName && <span className="no-value">No track data name set</span>}</div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Mask Data Name Editor - AtomicClipData */}
                                                                {clip.type === 'AtomicClipData' && (
                                                                    <div className="clip-property-editor">
                                                                        <div className="property-row">
                                                                            <label className="property-label">Mask Data Name:</label>
                                                                            <div className="property-combo">
                                                                                <input
                                                                                    type="text"
                                                                                    value={maskDataNameInputs[clip.name] !== undefined ? maskDataNameInputs[clip.name] : clip.maskDataName || ''}
                                                                                    onChange={(e) => handleMaskDataNameInputChange(clip.name, e.target.value)}
                                                                                    onBlur={(e) => {
                                                                                        const value = maskDataNameInputs[clip.name] !== undefined ? maskDataNameInputs[clip.name] : (e.target as HTMLInputElement).value;
                                                                                        handleMaskDataNameChange(clip.name, value);
                                                                                    }}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter') {
                                                                                            const value = maskDataNameInputs[clip.name] !== undefined ? maskDataNameInputs[clip.name] : (e.target as HTMLInputElement).value;
                                                                                            handleMaskDataNameChange(clip.name, value);
                                                                                            (e.target as HTMLInputElement).blur();
                                                                                        }
                                                                                    }}
                                                                                    className="dl-input property-input"
                                                                                    placeholder="Enter mask data name (e.g., UpperBody, 0xABCD...)"
                                                                                />
                                                                                {Array.isArray(targetData?.animationData?.maskNames) && targetData.animationData.maskNames.length > 0 && (
                                                                                    <select
                                                                                        className="dl-select property-select"
                                                                                        onChange={(e) => {
                                                                                            const v = e.target.value;
                                                                                            if (v) handleMaskDataNameChange(clip.name, v);
                                                                                            e.target.selectedIndex = 0;
                                                                                        }}
                                                                                    >
                                                                                        <option value="">MaskDataMap entries…</option>
                                                                                        {targetData.animationData.maskNames.map((name) => (
                                                                                            <option key={name} value={name}>{name}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                )}
                                                                            </div>
                                                                            <div className="property-info">{!clip.maskDataName && <span className="no-value">No mask data name set</span>}</div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Animation File Path Editor - AtomicClipData */}
                                                                {clip.type === 'AtomicClipData' && (
                                                                    <div className="clip-property-editor">
                                                                        <div className="property-row">
                                                                            <label className="property-label">Animation File Path:</label>
                                                                            <input
                                                                                type="text"
                                                                                value={clip.animationFilePath || ''}
                                                                                onChange={(e) => handleAnimationFilePathInputChange(clip.name, e.target.value)}
                                                                                onBlur={(e) => handleAnimationFilePathChange(clip.name, e.target.value)}
                                                                                onKeyDown={(e) => {
                                                                                    if (e.key === 'Enter') {
                                                                                        handleAnimationFilePathChange(clip.name, (e.target as HTMLInputElement).value);
                                                                                        (e.target as HTMLInputElement).blur();
                                                                                    }
                                                                                }}
                                                                                className="dl-input property-input animation-path-input"
                                                                                placeholder="Enter animation file path (e.g., ASSETS/.../animations/Orianna_attack1.anm)"
                                                                            />
                                                                            <div className="property-info">{!clip.animationFilePath && <span className="no-value">No animation file path set</span>}</div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Clip Name List Editor - SequencerClipData */}
                                                                {clip.type === 'SequencerClipData' && (
                                                                    <div className="clip-property-editor">
                                                                        <div className="property-row">
                                                                            <label className="property-label">Clip Name List:</label>
                                                                            <div className="clip-name-list-editor">
                                                                                {(clip.clipNameList || []).map((clipNameEntry, idx) => (
                                                                                    <div key={idx} className="clip-name-entry">
                                                                                        <input
                                                                                            type="text"
                                                                                            value={clipNameEntry.value}
                                                                                            onChange={(e) => handleClipNameListChange(clip.name, idx, e.target.value)}
                                                                                            onBlur={(e) => handleClipNameListSave(clip.name, idx, e.target.value, clipNameEntry.type)}
                                                                                            onKeyDown={(e) => {
                                                                                                if (e.key === 'Enter') {
                                                                                                    handleClipNameListSave(clip.name, idx, (e.target as HTMLInputElement).value, clipNameEntry.type);
                                                                                                    (e.target as HTMLInputElement).blur();
                                                                                                }
                                                                                            }}
                                                                                            className="dl-input property-input clip-name-input"
                                                                                            placeholder={`Enter clip name (${clipNameEntry.type === 'quoted' ? 'string' : 'hash'})`}
                                                                                        />
                                                                                        <span className="clip-name-type">({clipNameEntry.type})</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                        <div className="sequencer-add-row">
                                                                            <input
                                                                                type="text"
                                                                                className="dl-input sequencer-search-input"
                                                                                placeholder="Search existing clips to add..."
                                                                                value={sequencerOpenFor === clip.name ? sequencerSearch : ''}
                                                                                onChange={(e) => {
                                                                                    setSequencerOpenFor(clip.name);
                                                                                    setSequencerSearch(e.target.value);
                                                                                }}
                                                                            />
                                                                            <select
                                                                                className="dl-select sequencer-select"
                                                                                onChange={(e) => {
                                                                                    const child = e.target.value;
                                                                                    if (child) {
                                                                                        handleAddClipToSequencer(clip.name, child);
                                                                                        e.target.selectedIndex = 0;
                                                                                    }
                                                                                }}
                                                                            >
                                                                                <option value="">Add existing clip...</option>
                                                                                {getTargetClips()
                                                                                    .filter((c) => c.name !== clip.name)
                                                                                    .filter((c) => {
                                                                                        if (sequencerOpenFor !== clip.name) return true;
                                                                                        const q = (sequencerSearch || '').toLowerCase();
                                                                                        return c.name.toLowerCase().includes(q);
                                                                                    })
                                                                                    .map((c) => (
                                                                                        <option key={c.name} value={c.name}>{c.name}</option>
                                                                                    ))}
                                                                            </select>
                                                                            <button className="dl-btn dl-btn--sm dl-btn--secondary ensure-eventmap-btn" onClick={() => handleEnsureEventDataMap(clip.name)}>+ EventDataMap</button>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* SelectorClipData UI */}
                                                                {clip.type === 'SelectorClipData' && (
                                                                    <div className="clip-property-editor">
                                                                        <div className="property-row">
                                                                            <label className="property-label">Selector Pairs:</label>
                                                                            <div className="selector-pairs-editor">
                                                                                {clip.selectorPairs && clip.selectorPairs.length > 0 && (
                                                                                    <div className="existing-pairs">
                                                                                        {clip.selectorPairs.map((pair, idx) => {
                                                                                            const pairKey = `${clip.name}-${idx}`;
                                                                                            const isEditing = editingSelectorPair === pairKey;
                                                                                            return (
                                                                                                <div key={idx} className="selector-pair-item">
                                                                                                    <span className="pair-clip">{pair.clipName}</span>
                                                                                                    {isEditing ? (
                                                                                                        <div className="probability-editor">
                                                                                                            <input
                                                                                                                type="number"
                                                                                                                className="dl-input probability-edit-input"
                                                                                                                value={editingProbability}
                                                                                                                onChange={(e) => setEditingProbability(e.target.value)}
                                                                                                                onKeyDown={(e) => {
                                                                                                                    if (e.key === 'Enter') handleSaveSelectorPairProbability(clip.name, idx);
                                                                                                                    else if (e.key === 'Escape') handleCancelEditSelectorPair();
                                                                                                                }}
                                                                                                                min="0"
                                                                                                                max="1"
                                                                                                                step="0.1"
                                                                                                                autoFocus
                                                                                                            />
                                                                                                            <button className="dl-btn dl-btn--sm dl-btn--icon dl-btn--primary save-probability-btn" onClick={() => handleSaveSelectorPairProbability(clip.name, idx)} title="Save">✓</button>
                                                                                                            <button className="dl-btn dl-btn--sm dl-btn--icon dl-btn--danger cancel-probability-btn" onClick={handleCancelEditSelectorPair} title="Cancel">×</button>
                                                                                                        </div>
                                                                                                    ) : (
                                                                                                        <span className="pair-probability editable" onClick={() => handleEditSelectorPairProbability(clip.name, idx, pair.probability)} title="Click to edit probability">
                                                                                                            ({pair.probability})
                                                                                                        </span>
                                                                                                    )}
                                                                                                    <button className="dl-btn dl-btn--sm dl-btn--icon dl-btn--danger" style={{ marginLeft: 'auto' }} onClick={() => handleRemoveSelectorPair(clip.name, idx)} title="Remove this pair">×</button>
                                                                                                </div>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                )}
                                                                                <div className="selector-add-row">
                                                                                    <input
                                                                                        type="text"
                                                                                        className="dl-input selector-search-input"
                                                                                        placeholder="Search clips to add..."
                                                                                        value={selectorOpenFor === clip.name ? selectorSearch : ''}
                                                                                        onChange={(e) => {
                                                                                            setSelectorOpenFor(clip.name);
                                                                                            setSelectorSearch(e.target.value);
                                                                                        }}
                                                                                    />
                                                                                    <input
                                                                                        type="number"
                                                                                        className="dl-input probability-input"
                                                                                        placeholder="1.0"
                                                                                        min="0"
                                                                                        max="1"
                                                                                        step="0.1"
                                                                                        value={selectorProbabilityInput}
                                                                                        onChange={(e) => setSelectorProbabilityInput(e.target.value)}
                                                                                    />
                                                                                    <select
                                                                                        className="dl-select selector-select"
                                                                                        onChange={(e) => {
                                                                                            const child = e.target.value;
                                                                                            const probability = parseFloat(selectorProbabilityInput || '1.0');
                                                                                            if (child) {
                                                                                                handleAddSelectorPair(clip.name, child, probability);
                                                                                                e.target.selectedIndex = 0;
                                                                                                if (!selectorProbabilityInput || selectorProbabilityInput === '') setSelectorProbabilityInput('1.0');
                                                                                            }
                                                                                        }}
                                                                                    >
                                                                                        <option value="">Add clip with probability...</option>
                                                                                        {getTargetClips()
                                                                                            .filter((c) => c.name !== clip.name)
                                                                                            .filter((c) => {
                                                                                                if (selectorOpenFor !== clip.name) return true;
                                                                                                const q = (selectorSearch || '').toLowerCase();
                                                                                                return c.name.toLowerCase().includes(q);
                                                                                            })
                                                                                            .map((c) => (
                                                                                                <option key={c.name} value={c.name}>{c.name}</option>
                                                                                            ))}
                                                                                    </select>
                                                                                    <button className="dl-btn dl-btn--sm dl-btn--secondary ensure-eventmap-btn" onClick={() => handleEnsureEventDataMap(clip.name)}>+ EventDataMap</button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Events or empty drop zone */}
                                                                {(() => {
                                                                    const hasEvents =
                                                                        Object.values(clip.events || {}).some((events) => events && events.length > 0) ||
                                                                        (clip.type === 'SequencerClipData' && (clip.clipNameList?.length || 0) > 0) ||
                                                                        (clip.type === 'SelectorClipData' && (clip.selectorPairs?.length || 0) > 0) ||
                                                                        (clip.type === 'ParametricClipData' && (clip.parametricPairs?.length || 0) > 0) ||
                                                                        (clip.type === 'ConditionFloatClipData' && (clip.conditionFloatPairs?.length || 0) > 0);

                                                                    if (!hasEvents) {
                                                                        return (
                                                                            <div className="empty-clip-drop-zone">
                                                                                <div className="drop-zone-content">
                                                                                    <span className="drop-zone-icon">📥</span>
                                                                                    <span className="drop-zone-text">Drop events here to add them to this clip</span>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return <ClipEventsView clip={clip} side="target" onDeleteEvent={handleDeleteEvent} />;
                                                                })()}

                                                                {/* ConditionFloatClipData UI */}
                                                                {clip.type === 'ConditionFloatClipData' && (
                                                                    <div className="event-type-section">
                                                                        <div className="event-type-header">
                                                                            <span className="event-type-name">Condition Float Pairs</span>
                                                                            <span className="event-type-count">({clip.conditionFloatPairs?.length || 0})</span>
                                                                            <button
                                                                                className="dl-btn dl-btn--sm dl-btn--primary add-pair-btn"
                                                                                onClick={() => {
                                                                                    const childName = prompt('Enter clip name:');
                                                                                    if (childName) {
                                                                                        const value = prompt('Enter value (optional, leave empty for no value):');
                                                                                        const floatValue = value ? parseFloat(value) : null;
                                                                                        handleAddConditionFloatPair(clip.name, childName, floatValue);
                                                                                    }
                                                                                }}
                                                                                title="Add condition float pair"
                                                                            >
                                                                                + Add Pair
                                                                            </button>
                                                                        </div>
                                                                        {Array.isArray(clip.conditionFloatPairs) && clip.conditionFloatPairs.length > 0 && (
                                                                            <div className="condition-pairs-list">
                                                                                {clip.conditionFloatPairs.map((pair, idx) => (
                                                                                    <div key={`condition-pair-${idx}`} className="event-item">
                                                                                        <div className="event-content">
                                                                                            <div className="event-header">
                                                                                                <span className="event-icon">⚖️</span>
                                                                                                <span className="event-type">Condition</span>
                                                                                            </div>
                                                                                            <div className="event-details">{`Clip: ${pair.clipName || 'unknown'} | Value: ${pair.value ?? 'N/A'}`}</div>
                                                                                        </div>
                                                                                        <div className="event-actions">
                                                                                            <button className="dl-btn dl-btn--sm dl-btn--icon dl-btn--danger" onClick={() => handleRemoveConditionFloatPair(clip.name, idx)} title="Delete this condition float pair">🗑️</button>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Updater Display - ConditionFloatClipData */}
                                                                {clip.type === 'ConditionFloatClipData' && clip.updater && (
                                                                    <div className="event-type-section">
                                                                        <div className="event-type-header">
                                                                            <span className="event-type-name">Updater</span>
                                                                            <span className="event-type-count">({clip.updater.type})</span>
                                                                        </div>
                                                                        <div className="event-item">
                                                                            <div className="event-content">
                                                                                <div className="event-header">
                                                                                    <span className="event-icon">⚙️</span>
                                                                                    <span className="event-type">Updater</span>
                                                                                </div>
                                                                                <div className="event-details">{`Type: ${clip.updater.type || 'Unknown'}`}</div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* ConditionFloatClipData Properties */}
                                                                {clip.type === 'ConditionFloatClipData' && (
                                                                    <div className="event-type-section">
                                                                        <div className="event-type-header">
                                                                            <span className="event-type-name">Properties</span>
                                                                        </div>
                                                                        <div className="event-item">
                                                                            <div className="event-content">
                                                                                <div className="event-header">
                                                                                    <span className="event-icon">📋</span>
                                                                                    <span className="event-type">Properties</span>
                                                                                </div>
                                                                                <div className="event-details">
                                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                                        {clip.changeAnimationMidPlay !== null && <span>Change Animation Mid Play: {clip.changeAnimationMidPlay ? 'true' : 'false'}</span>}
                                                                                        {clip.childAnimDelaySwitchTime !== null && <span>Child Anim Delay Switch Time: {clip.childAnimDelaySwitchTime}</span>}
                                                                                        {clip.dontStompTransitionClip !== null && <span>Don't Stomp Transition Clip: {clip.dontStompTransitionClip ? 'true' : 'false'}</span>}
                                                                                        {clip.playAnimChangeFromBeginning !== null && <span>Play Anim Change From Beginning: {clip.playAnimChangeFromBeginning ? 'true' : 'false'}</span>}
                                                                                        {clip.syncFrameOnChangeAnim !== null && <span>Sync Frame On Change Anim: {clip.syncFrameOnChangeAnim ? 'true' : 'false'}</span>}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="no-clips">
                                                <p>No animation clips found</p>
                                                <div style={{ marginTop: '20px', textAlign: 'left' }}>
                                                    <p>Debug info:</p>
                                                    <p>Donor data exists: {donorData ? 'Yes' : 'No'}</p>
                                                    <p>Target data exists: {targetData ? 'Yes' : 'No'}</p>
                                                    <p>Target clips count: {targetData?.animationData?.clips ? Object.keys(targetData.animationData.clips).length : 0}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Donor Panel (Right) */}
                                <div className="panel donor-panel">
                                    <div className="panel-header">
                                        <button
                                            className="standalone-toggle-arrow"
                                            onClick={() => setStandaloneSlideOverOpen(!standaloneSlideOverOpen)}
                                            title={standaloneSlideOverOpen ? 'Hide Standalone Events' : 'Show Standalone Events'}
                                        >
                                            ⬌
                                        </button>
                                    </div>

                                    <div className="panel-search">
                                        <input type="text" placeholder="Search donor clips..." value={donorSearchTerm} onChange={(e) => setDonorSearchTerm(e.target.value)} className="dl-input search-input" />
                                        {donorSearchTerm && (
                                            <div className="search-results">
                                                <span>Showing {getDonorClips().length} of {donorData?.animationData?.clips ? Object.keys(donorData.animationData.clips).length : 0} clips</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="animation-list">
                                        {getDonorClips().length > 0 ? (
                                            getDonorClips().map((clip) => {
                                                const totalEvents = renderClipStats(clip);
                                                const isExpanded = expandedDonorClips.has(clip.name);
                                                return (
                                                    <div key={clip.name} className="animation-clip donor-clip" draggable onDragStart={(e) => handleClipDragStart(e, clip)} onDragEnd={handleClipDragEnd}>
                                                        <div
                                                            className="clip-header"
                                                            onClick={() => {
                                                                toggleDonorClipExpansion(clip.name);
                                                            }}
                                                        >
                                                            <div className="clip-info">
                                                                <span className="clip-name">{getClipDisplayName(clip)}</span>
                                                                <span className="clip-type">{clip.type || 'Unknown'}</span>
                                                            </div>
                                                            <div className="clip-stats">
                                                                <span className="event-count">{totalEvents} events</span>
                                                                <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▼</span>
                                                            </div>
                                                        </div>

                                                        {isExpanded && (
                                                            <div className="clip-events">
                                                                <ClipEventsView clip={clip} side="donor" onDragStart={handleDragStart} />

                                                                {clip.type === 'SequencerClipData' && Array.isArray(clip.clipNameList) && clip.clipNameList.length > 0 && (
                                                                    <div className="event-type-section">
                                                                        <div className="event-type-header">
                                                                            <span className="event-type-name">Clip Name List</span>
                                                                            <span className="event-type-count">({clip.clipNameList.length})</span>
                                                                        </div>
                                                                        {clip.clipNameList.map((clipNameEntry, idx) => (
                                                                            <div key={`clip-name-${idx}`} className="event-item">
                                                                                <div className="event-content">
                                                                                    <div className="event-header">
                                                                                        <span className="event-icon">🎬</span>
                                                                                        <span className="event-type">Clip Name</span>
                                                                                    </div>
                                                                                    <div className="event-details">{clipNameEntry.value || clipNameEntry.raw || 'Unknown'}</div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {clip.type === 'SelectorClipData' && Array.isArray(clip.selectorPairs) && clip.selectorPairs.length > 0 && (
                                                                    <div className="event-type-section">
                                                                        <div className="event-type-header">
                                                                            <span className="event-type-name">Selector Pairs</span>
                                                                            <span className="event-type-count">({clip.selectorPairs.length})</span>
                                                                        </div>
                                                                        {clip.selectorPairs.map((pair, idx) => (
                                                                            <div key={`selector-pair-${idx}`} className="event-item">
                                                                                <div className="event-content">
                                                                                    <div className="event-header">
                                                                                        <span className="event-icon">🧩</span>
                                                                                        <span className="event-type">Pair</span>
                                                                                    </div>
                                                                                    <div className="event-details">{`Clip: ${pair.clipName || 'unknown'} | Probability: ${pair.probability ?? 1.0}`}</div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {clip.type === 'ParametricClipData' && Array.isArray(clip.parametricPairs) && clip.parametricPairs.length > 0 && (
                                                                    <div className="event-type-section">
                                                                        <div className="event-type-header">
                                                                            <span className="event-type-name">Parametric Pairs</span>
                                                                            <span className="event-type-count">({clip.parametricPairs.length})</span>
                                                                        </div>
                                                                        {clip.parametricPairs.map((pair, idx) => (
                                                                            <div key={`parametric-pair-${idx}`} className="event-item">
                                                                                <div className="event-content">
                                                                                    <div className="event-header">
                                                                                        <span className="event-icon">📊</span>
                                                                                        <span className="event-type">Parametric</span>
                                                                                    </div>
                                                                                    <div className="event-details">{`Clip: ${pair.clipName || 'unknown'} | Value: ${pair.value ?? 'N/A'}`}</div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {clip.type === 'ConditionFloatClipData' && Array.isArray(clip.conditionFloatPairs) && clip.conditionFloatPairs.length > 0 && (
                                                                    <div className="event-type-section">
                                                                        <div className="event-type-header">
                                                                            <span className="event-type-name">Condition Float Pairs</span>
                                                                            <span className="event-type-count">({clip.conditionFloatPairs.length})</span>
                                                                        </div>
                                                                        {clip.conditionFloatPairs.map((pair, idx) => (
                                                                            <div key={`condition-pair-${idx}`} className="event-item">
                                                                                <div className="event-content">
                                                                                    <div className="event-header">
                                                                                        <span className="event-icon">⚖️</span>
                                                                                        <span className="event-type">Condition</span>
                                                                                    </div>
                                                                                    <div className="event-details">{`Clip: ${pair.clipName || 'unknown'} | Value: ${pair.value ?? 'N/A'}`}</div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="no-clips">
                                                <p>No animation clips found</p>
                                                <div style={{ marginTop: '20px', textAlign: 'left' }}>
                                                    <p>Debug info:</p>
                                                    <p>Donor clips count: {donorData?.animationData?.clips ? Object.keys(donorData.animationData.clips).length : 0}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mask-editor">
                            <div className="mask-viewer">
                                <div className="mask-viewer-header">
                                    <h3>🎭 Mask Viewer</h3>
                                    <div className="mask-viewer-actions">
                                        {maskSkeleton && (
                                            <span className="mask-stat">{maskSkeleton.totalJoints} joints</span>
                                        )}
                                        {maskSelectedJoints.size > 0 && (
                                            <>
                                                <span className="mask-stat">{maskSelectedJoints.size} selected</span>
                                                <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={() => setMaskSelectedJoints(new Set())}>
                                                    Clear
                                                </button>
                                            </>
                                        )}
                                        <button
                                            className="dl-btn dl-btn--sm dl-btn--secondary"
                                            onClick={() => {
                                                setMaskSkeleton(null);
                                                void loadMaskSkeleton();
                                            }}
                                            disabled={maskLoading}
                                        >
                                            🔄 Reload
                                        </button>
                                    </div>
                                </div>

                                {maskSkeleton && (
                                    <div className="mask-viewer-meta" title={maskSkeleton.sklPath}>
                                        SKL: {baseName(maskSkeleton.sklPath)}
                                    </div>
                                )}

                                {maskLoading ? (
                                    <div className="no-clips">
                                        <p>Loading skeleton…</p>
                                    </div>
                                ) : maskError ? (
                                    <div className="no-clips">
                                        <p>Failed to load skeleton</p>
                                        <p className="mask-error">{maskError}</p>
                                        <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={() => void loadMaskSkeleton()}>
                                            Retry
                                        </button>
                                    </div>
                                ) : maskSkeleton && maskSkeleton.joints.length > 0 ? (
                                    <div className="mask-joint-list">
                                        <table className="mask-joint-table">
                                            <thead>
                                                <tr>
                                                    <th className="joint-id-col">ID</th>
                                                    <th className="joint-name-col">Joint</th>
                                                    <th className="joint-parent-col">Parent</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {maskSkeleton.joints.map((joint) => {
                                                    const parent =
                                                        joint.parentId >= 0
                                                            ? maskSkeleton.joints.find((j) => j.id === joint.parentId)
                                                            : null;
                                                    const selected = maskSelectedJoints.has(joint.id);
                                                    return (
                                                        <tr
                                                            key={joint.id}
                                                            className={`mask-joint-row ${selected ? 'selected' : ''}`}
                                                            onClick={() => toggleMaskJoint(joint.id)}
                                                        >
                                                            <td className="joint-id-col">[{joint.id}]</td>
                                                            <td className="joint-name-col">
                                                                {joint.name}
                                                                {selected && <span className="joint-check"> ✓</span>}
                                                            </td>
                                                            <td className="joint-parent-col">
                                                                {parent ? parent.name : joint.parentId >= 0 ? `[${joint.parentId}]` : '—'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="no-clips">
                                        <p>No skeleton joints found</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom Controls - Save and Undo */}
            {donorData && targetData && (
                <div className="bottom-controls">
                    <button
                        onClick={handleUndo}
                        disabled={undoHistory.length === 0}
                        className={`dl-btn dl-btn--secondary undo-button ${undoHistory.length === 0 ? 'disabled' : ''}`}
                        title={undoHistory.length > 0 ? `Undo: ${undoHistory[undoHistory.length - 1]?.action}` : 'Nothing to undo'}
                    >
                        Undo ({undoHistory.length})
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isProcessing || !hasChangesToSave()}
                        className={`dl-btn dl-btn--primary save-button ${hasChangesToSave() ? 'has-changes' : ''} ${isProcessing ? 'processing' : ''}`}
                        title={hasChangesToSave() ? 'Save changes to file' : 'No changes to save'}
                    >
                        {isProcessing ? 'Saving...' : 'Save'}
                    </button>
                </div>
            )}

            {/* Status Message */}
            {statusMessage && <div className="status-message">{statusMessage}</div>}

            {/* Processing Overlay */}
            {isProcessing && (
                <div className="processing-overlay">
                    <GlowingSpinner />
                    <div className="processing-info">
                        <p className="processing-text">{processingText}</p>
                    </div>
                </div>
            )}

            {/* Standalone Events Slide-Over Panel */}
            <div className={`standalone-slide-over ${standaloneSlideOverOpen ? 'open' : ''}`}>
                <div className="standalone-slide-content">
                    <div className="standalone-slide-header">
                        <h3>Standalone Events</h3>
                        <button className="dl-btn dl-btn--sm dl-btn--icon dl-btn--ghost standalone-close-btn" onClick={() => setStandaloneSlideOverOpen(false)} title="Close Standalone Events">×</button>
                    </div>

                    <div className="standalone-slide-body">
                        <div className="standalone-create">
                            <StandaloneEventCreatorUI donorData={donorData} setDonorData={setDonorData} createMessage={CreateMessage} />
                        </div>

                        {getStandaloneEvents().length > 0 && (
                            <div className="standalone-events-section">
                                <div className="section-header" onClick={() => setStandaloneExpanded((v) => !v)} style={{ cursor: 'pointer' }}>
                                    <h4>Standalone Events ({getStandaloneEvents().length})</h4>
                                    <p>{standaloneExpanded ? 'Click to collapse' : 'Click to expand'} • Drag these events to any target clip</p>
                                </div>
                                {standaloneExpanded &&
                                    (() => {
                                        const groups = getStandaloneEventGroups();
                                        const order = [
                                            { key: 'particle', label: 'ParticleEventData', icon: '✨' },
                                            { key: 'submesh', label: 'SubmeshVisibilityEventData', icon: '👁️' },
                                            { key: 'sound', label: 'SoundEventData', icon: '🔊' },
                                            { key: 'facetarget', label: 'FaceTargetEventData', icon: '🎯' },
                                            { key: 'other', label: 'Other', icon: '⚡' },
                                        ];
                                        return (
                                            <div>
                                                {order.map((g) =>
                                                    groups[g.key] && groups[g.key].length > 0 ? (
                                                        <div key={g.key} className="standalone-group">
                                                            <div className="standalone-group-header" onClick={() => toggleStandaloneGroup(g.key)} style={{ cursor: 'pointer' }}>
                                                                <span className="group-icon">{g.icon}</span>
                                                                <span className="group-title">{g.label}</span>
                                                                <span className="group-count">({groups[g.key].length})</span>
                                                                <span className={`expand-icon ${standaloneGroupExpanded.has(g.key) ? 'expanded' : ''}`}>▼</span>
                                                            </div>
                                                            {standaloneGroupExpanded.has(g.key) && (
                                                                <div className="standalone-events-list">
                                                                    {groups[g.key].map((event, index) => {
                                                                        const ev = event as unknown as Record<string, unknown>;
                                                                        return (
                                                                            <div
                                                                                key={`standalone-${g.key}-${index}`}
                                                                                className="standalone-event-item draggable"
                                                                                draggable
                                                                                onDragStart={(e) => handleDragStart(e, event, { name: 'StandaloneEvent', type: 'StandaloneEvent' })}
                                                                            >
                                                                                <div className="event-content">
                                                                                    <div className="event-header">
                                                                                        <span className="event-icon">{g.icon}</span>
                                                                                        <span className="event-type">{event.type}</span>
                                                                                        <span className="event-name">{ev.name as string}</span>
                                                                                        <span className="drag-hint">Drag to port →</span>
                                                                                    </div>
                                                                                    <div className="event-details">
                                                                                        {event.type === 'particle' && `Effect: ${ev.effectKey || 'None'} | Frame: ${ev.startFrame || 0}`}
                                                                                        {event.type === 'sound' && `Sound: ${ev.soundName || 'None'}`}
                                                                                        {event.type === 'submesh' && `Start: ${ev.startFrame || 0}${ev.endFrame ? ` | End: ${ev.endFrame}` : ''}`}
                                                                                        {event.type === 'facetarget' && `Target: ${ev.faceTarget || 0} | Y-Rot: ${ev.yRotationDegrees || 0}°`}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : null,
                                                )}
                                            </div>
                                        );
                                    })()}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Toast notification */}
            <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
                <Alert
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                    severity={snackbar.severity}
                    sx={{
                        background: 'var(--glass-bg)',
                        color: 'var(--text)',
                        border: '1px solid var(--glass-border)',
                        backdropFilter: 'blur(10px)',
                        '& .MuiAlert-icon': { color: 'var(--accent)' },
                    }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirmOpen}
                onClose={handleDeleteCancel}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                        backdropFilter: 'saturate(180%) blur(16px)',
                        WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                    },
                }}
            >
                <DialogTitle sx={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600 }}>⚠️ Delete Clip</DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    <div style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        Are you sure you want to delete the entire "{clipToDelete}" clip? This action cannot be undone.
                    </div>
                </DialogContent>
                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <Button onClick={handleDeleteCancel} sx={{ color: 'var(--accent2)', '&:hover': { backgroundColor: 'color-mix(in oklab, var(--accent2) 12%, transparent)' } }}>Cancel</Button>
                    <Button variant="contained" onClick={handleDeleteClip} sx={{ background: 'var(--color-danger)', color: '#fff', borderRadius: '4px', px: 2, '&:hover': { background: 'color-mix(in oklab, var(--color-danger) 85%, black)' } }}>Delete</Button>
                </DialogActions>
            </Dialog>

            {/* VFX System Deletion Confirmation Dialog */}
            <Dialog
                open={vfxDeleteConfirmOpen}
                onClose={() => vfxDeleteCallbackRef.current?.('cancel')}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                        backdropFilter: 'saturate(180%) blur(16px)',
                        WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                    },
                }}
            >
                <DialogTitle sx={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600 }}>🗑️ Delete VFX System?</DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    <div style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        <div style={{ marginBottom: '8px' }}>
                            This particle event uses effect key <strong style={{ color: 'var(--accent)' }}>"{vfxDeleteEffectKey}"</strong>.
                        </div>
                        <div>Do you also want to delete the associated VFX system and its ResourceResolver entry?</div>
                    </div>
                </DialogContent>
                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <Button onClick={() => vfxDeleteCallbackRef.current?.('cancel')} sx={{ color: 'var(--accent2)', '&:hover': { backgroundColor: 'color-mix(in oklab, var(--accent2) 12%, transparent)' } }}>Cancel</Button>
                    <Button onClick={() => vfxDeleteCallbackRef.current?.('delete-event-only')} sx={{ color: 'var(--accent2)', '&:hover': { backgroundColor: 'color-mix(in oklab, var(--accent2) 12%, transparent)' } }}>Delete Event Only</Button>
                    <Button variant="contained" onClick={() => vfxDeleteCallbackRef.current?.('delete-vfx')} sx={{ background: 'var(--color-danger)', color: '#fff', borderRadius: '4px', px: 2, '&:hover': { background: 'color-mix(in oklab, var(--color-danger) 85%, black)' } }}>Delete VFX System Too</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}

export { AniPort };
export default AniPort;
