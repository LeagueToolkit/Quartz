/*
 * FakeGear - VFX Toggle Variant Generator.
 *
 * Faithful 1:1 port of the Electron Quartz FakeGearSkin page. Converts VFX
 * systems into toggle-able variants using stencil filtering: Ctrl+5 in-game
 * switches between variant1 and variant2 of each VFX. Loads a real .bin
 * (ritobin .py text via readBin), applies the same bin/material/variant
 * transforms from fakeGearSkinUtils, and writes the result back through writeBin.
 */

import {
    useState,
    useCallback,
    useEffect,
    useRef,
    useMemo,
    memo,
} from 'react';
import {
    Box,
    Typography,
    Checkbox,
    Tooltip,
    IconButton,
    CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DeleteIcon from '@mui/icons-material/Delete';
import ClearIcon from '@mui/icons-material/Clear';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

import { readBin, writeBin } from '@/lib/api';
import { useNotificationStore } from '@/lib/stores';

import {
    extractVfxSystems,
    convertToSeparateBins,
    writeVariantBinsWithMerge,
    hasToggleVariants,
    insertToggleScreen,
    hasToggleScreen,
    countExistingStencilEmitters,
    extractEmittersFromSystem,
    duplicateEmittersAsInline,
    insertAnimationToggle,
    hasAnimationToggle,
    extractStencilIdFromToggleScreen,
    convertToInlineVariants,
    hasInlineVariants,
    deleteVariant2FromSystem,
    removeRenderPhaseOverrideFromSystem,
    type VfxSystemInfo,
    type EmitterInfo,
} from './fakegear/fakeGearSkinUtils';

import './fakegear/FakeGear.css';

const DEFAULT_STENCIL = '0xe6deedc4';

function basename(p: string): string {
    return p.replace(/\\/g, '/').split('/').pop() || p;
}

interface FlatRow {
    type: 'system' | 'emitter';
    system?: VfxSystemInfo;
    emitter?: EmitterInfo;
    systemKey?: string;
}

interface SystemRowProps {
    row: FlatRow;
    selectedSystems: Set<string>;
    selectedEmitters: Set<string>;
    expandedSystems: Set<string>;
    pyContent: string;
    isLoading: boolean;
    variant2Systems: Set<string>;
    toggleSystemSelection: (key: string) => void;
    toggleEmitterSelection: (systemKey: string, emitterName: string) => void;
    toggleExpand: (key: string) => void;
    handleRemoveRenderPhase: (key: string, e: React.MouseEvent) => void;
    handleDeleteVariant2Click: (key: string, e: React.MouseEvent) => void;
    isToggleScreenSystem: (system: VfxSystemInfo) => boolean;
}

const SystemRowComponent = memo(function SystemRowComponent(props: SystemRowProps) {
    const {
        row,
        selectedSystems,
        selectedEmitters,
        expandedSystems,
        pyContent,
        isLoading,
        variant2Systems,
        toggleSystemSelection,
        toggleEmitterSelection,
        toggleExpand,
        handleRemoveRenderPhase,
        handleDeleteVariant2Click,
        isToggleScreenSystem,
    } = props;

    // Render emitter row
    if (row.type === 'emitter' && row.emitter && row.systemKey) {
        const emitter = row.emitter;
        const systemKey = row.systemKey;
        const emitterKey = `${systemKey}::${emitter.name}`;
        const isEmitterSelected = selectedEmitters.has(emitterKey);
        const isVariant2 = emitter.name.toLowerCase().endsWith('_variant2');

        return (
            <div
                style={{
                    height: 40,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 12px 4px 36px',
                    gap: '6px',
                    background: isEmitterSelected ? 'color-mix(in oklab, var(--accent-primary) 15%, transparent)' : 'var(--bg-tertiary)',
                    borderLeft: `2px solid ${isEmitterSelected ? 'var(--accent-primary)' : 'color-mix(in oklab, var(--accent-primary) 30%, transparent)'}`,
                    marginLeft: '8px',
                    boxSizing: 'border-box',
                    width: 'calc(100% - 16px)',
                    cursor: isVariant2 ? 'not-allowed' : 'pointer',
                    opacity: isVariant2 ? 0.5 : 1,
                }}
                onClick={() => !isVariant2 && toggleEmitterSelection(systemKey, emitter.name)}
            >
                <Checkbox
                    checked={isEmitterSelected || false}
                    disabled={isVariant2}
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => !isVariant2 && toggleEmitterSelection(systemKey, emitter.name)}
                    sx={{ padding: '2px' }}
                />
                <Typography sx={{
                    fontSize: '12px',
                    color: isVariant2 ? 'var(--text-muted)' : 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                    fontStyle: isVariant2 ? 'italic' : 'normal',
                }}>
                    {emitter.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {isVariant2 && (
                        <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'color-mix(in oklab, var(--accent-secondary) 22%, transparent)', color: 'var(--accent-hover)' }}>
                            V2
                        </span>
                    )}
                    {emitter.hasStencil && (
                        <Tooltip title="Has StencilMode - may not work">
                            <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'color-mix(in oklab, var(--color-warning) 20%, transparent)', color: 'var(--color-warning)' }}>
                                Stencil
                            </span>
                        </Tooltip>
                    )}
                    {emitter.hasGroundLayer && (
                        <Tooltip title="Has isGroundLayer - may not work">
                            <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'color-mix(in oklab, var(--color-danger) 20%, transparent)', color: 'var(--color-danger)' }}>
                                Ground
                            </span>
                        </Tooltip>
                    )}
                    {emitter.hasRenderPhaseOverride && (
                        <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'color-mix(in oklab, var(--color-info) 20%, transparent)', color: 'var(--color-info)' }}>
                            Phase
                        </span>
                    )}
                </Box>
            </div>
        );
    }

    // Render system row
    const system = row.system;
    if (!system) return null;

    const isSelected = selectedSystems.has(system.key);
    const isExpanded = expandedSystems.has(system.key);
    const alreadyHasVariants = hasToggleVariants(pyContent, system.key, system.rawContent);
    const alreadyHasInlineVariants = hasInlineVariants(system.rawContent);
    const isToggleScreen = isToggleScreenSystem(system);
    const isDisabled = alreadyHasVariants || alreadyHasInlineVariants || isToggleScreen;
    const hasV2 = variant2Systems.has(system.key);
    const stencilCount = system.stencilCount || 0;
    const groundLayerCount = system.groundLayerCount || 0;

    return (
        <div
            style={{
                height: 40,
                display: 'flex',
                alignItems: 'center',
                padding: '6px 12px',
                gap: '8px',
                borderRadius: '4px',
                cursor: 'pointer',
                margin: '0 8px',
                border: `1px solid ${isSelected ? 'color-mix(in oklab, var(--accent-primary) 30%, transparent)' : 'transparent'}`,
                background: isSelected ? 'color-mix(in oklab, var(--accent-primary) 10%, transparent)' : 'transparent',
                opacity: isDisabled ? 0.5 : 1,
                boxSizing: 'border-box',
                width: 'calc(100% - 16px)',
            }}
        >
            {/* Expand/Collapse button */}
            <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); toggleExpand(system.key); }}
                sx={{ padding: '2px', color: 'var(--text-secondary)' }}
            >
                {isExpanded ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" /></svg>
                ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" /></svg>
                )}
            </IconButton>

            <Checkbox
                checked={isSelected}
                disabled={isDisabled}
                icon={<CheckBoxOutlineBlankIcon />}
                checkedIcon={<CheckBoxIcon />}
                size="small"
                onClick={(e) => { e.stopPropagation(); if (!isDisabled) toggleSystemSelection(system.key); }}
                sx={{ padding: '4px' }}
            />
            <Box sx={{ flex: 1, overflow: 'hidden' }} onClick={() => toggleExpand(system.key)}>
                <Typography sx={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}>
                    {system.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', marginTop: '2px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {system.emitterCount} emitter{system.emitterCount !== 1 ? 's' : ''}
                    </span>
                    {alreadyHasVariants && (
                        <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'color-mix(in oklab, var(--color-success) 20%, transparent)', color: 'var(--color-success)' }}>Child</span>
                    )}
                    {alreadyHasInlineVariants && (
                        <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'color-mix(in oklab, var(--accent-secondary) 22%, transparent)', color: 'var(--accent-hover)' }}>Inline</span>
                    )}
                    {stencilCount > 0 && (
                        <Tooltip title={`${stencilCount} emitters have StencilMode - conversion may not work!`}>
                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'color-mix(in oklab, var(--color-warning) 20%, transparent)', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <WarningAmberIcon sx={{ fontSize: 10 }} /> Stencil
                            </span>
                        </Tooltip>
                    )}
                    {groundLayerCount > 0 && (
                        <Tooltip title={`${groundLayerCount} emitters have isGroundLayer - conversion may not work!`}>
                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'color-mix(in oklab, var(--color-danger) 20%, transparent)', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <WarningAmberIcon sx={{ fontSize: 10 }} /> Ground
                            </span>
                        </Tooltip>
                    )}
                </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
                <Tooltip title="Remove renderPhaseOverride">
                    <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleRemoveRenderPhase(system.key, e); }}
                        disabled={isLoading}
                        sx={{
                            color: 'var(--color-warning)',
                            padding: '4px',
                            '&:hover': { backgroundColor: 'color-mix(in oklab, var(--color-warning) 12%, transparent)' },
                        }}
                    >
                        <ClearIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
                {hasV2 && (
                    <Tooltip title="Revert Variants (delete V2, rename V1 back, remove stencil)">
                        <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); handleDeleteVariant2Click(system.key, e); }}
                            disabled={isLoading}
                            sx={{
                                color: 'var(--color-danger)',
                                padding: '4px',
                                '&:hover': { backgroundColor: 'color-mix(in oklab, var(--color-danger) 12%, transparent)' },
                            }}
                        >
                            <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
        </div>
    );
});

type PendingAction =
    | 'convert'
    | 'togglescreen'
    | 'inlineVariants'
    | 'inlineVariants-skip'
    | 'emitter-inline'
    | 'emitter-inline-skip'
    | null;

function FakeGear() {
    const notify = useNotificationStore((s) => s.push);

    // File state
    const [binPath, setBinPath] = useState<string | null>(null);
    const [pyContent, setPyContent] = useState('');
    const [originalContent, setOriginalContent] = useState('');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showWarning, setShowWarning] = useState(true);

    // Systems state
    const [systems, setSystems] = useState<VfxSystemInfo[]>([]);
    const [selectedSystems, setSelectedSystems] = useState<Set<string>>(new Set());
    const [selectedEmitters, setSelectedEmitters] = useState<Set<string>>(new Set()); // "systemKey::emitterName"
    const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());
    const [variant2Systems, setVariant2Systems] = useState<Set<string>>(new Set());

    // Modal state
    const [showGroundLayerWarning, setShowGroundLayerWarning] = useState(false);
    const [showStencilModal, setShowStencilModal] = useState(false);
    const [customStencilId, setCustomStencilId] = useState('');
    const [pendingAction, setPendingAction] = useState<PendingAction>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [pendingDeleteSystemKey, setPendingDeleteSystemKey] = useState<string | null>(null);
    const [showChildParticlesWarning, setShowChildParticlesWarning] = useState(false);

    const listContainerRef = useRef<HTMLDivElement>(null);

    // Toggle system expansion
    const toggleExpand = useCallback((systemKey: string) => {
        setExpandedSystems((prev) => {
            const next = new Set(prev);
            if (next.has(systemKey)) next.delete(systemKey);
            else next.add(systemKey);
            return next;
        });
    }, []);

    // Toggle emitter selection
    const toggleEmitterSelection = useCallback((systemKey: string, emitterName: string) => {
        const key = `${systemKey}::${emitterName}`;
        setSelectedEmitters((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    // Get details about selected emitters (including which have groundLayer)
    const getSelectedEmitterDetails = useCallback(() => {
        const details = { total: 0, groundLayerCount: 0, groundLayerEmitters: [] as string[] };

        for (const key of selectedEmitters) {
            const [systemKey, emitterName] = key.split('::');
            const system = systems.find((s) => s.key === systemKey);
            if (system && system.emitters) {
                const emitter = system.emitters.find((e) => e.name === emitterName);
                if (emitter) {
                    details.total++;
                    if (emitter.hasGroundLayer) {
                        details.groundLayerCount++;
                        details.groundLayerEmitters.push(emitterName);
                    }
                }
            }
        }
        return details;
    }, [selectedEmitters, systems]);

    // Duplicate selected emitters as inline variants
    const handleDuplicateEmittersAsInline = useCallback(async (stencilId: string, skipGroundLayer = false) => {
        if (selectedEmitters.size === 0) {
            setStatusMessage('No emitters selected');
            return;
        }

        try {
            setIsLoading(true);
            setLoadingText('Duplicating emitters...');

            const emittersBySystem = new Map<string, string[]>();
            let skippedCount = 0;

            for (const key of selectedEmitters) {
                const [systemKey, emitterName] = key.split('::');

                if (skipGroundLayer) {
                    const system = systems.find((s) => s.key === systemKey);
                    if (system && system.emitters) {
                        const emitter = system.emitters.find((e) => e.name === emitterName);
                        if (emitter && emitter.hasGroundLayer) {
                            skippedCount++;
                            continue;
                        }
                    }
                }

                if (!emittersBySystem.has(systemKey)) emittersBySystem.set(systemKey, []);
                emittersBySystem.get(systemKey)!.push(emitterName);
            }

            let totalToProcess = 0;
            for (const emitterNames of emittersBySystem.values()) totalToProcess += emitterNames.length;

            if (totalToProcess === 0) {
                setStatusMessage('No emitters to duplicate (all were ground layer emitters)');
                setIsLoading(false);
                setLoadingText('');
                return;
            }

            let newContent = pyContent;
            for (const [systemKey, emitterNames] of emittersBySystem) {
                newContent = duplicateEmittersAsInline(newContent, systemKey, emitterNames, stencilId);
            }

            setPyContent(newContent);
            setHasUnsavedChanges(true);
            setSelectedEmitters(new Set());

            const message = skippedCount > 0
                ? `Duplicated ${totalToProcess} emitter(s), skipped ${skippedCount} ground layer emitter(s)`
                : `Duplicated ${totalToProcess} emitter(s) as inline variants`;
            setStatusMessage(message);
            notify('success', message);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Error: ${msg}`);
            notify('error', `Error: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [selectedEmitters, pyContent, systems, notify]);

    // Check for ground layer emitters before showing stencil modal
    const initiateEmitterDuplication = useCallback(() => {
        const details = getSelectedEmitterDetails();
        if (details.groundLayerCount > 0) {
            setShowGroundLayerWarning(true);
        } else {
            const existingId = extractStencilIdFromToggleScreen(pyContent);
            if (existingId) {
                handleDuplicateEmittersAsInline(existingId, false);
            } else {
                setPendingAction('emitter-inline');
                setShowStencilModal(true);
            }
        }
    }, [getSelectedEmitterDetails, pyContent, handleDuplicateEmittersAsInline]);

    // Extract systems when content changes; pre-compute variant2 status + emitter info
    useEffect(() => {
        if (pyContent) {
            const extractedSystems = extractVfxSystems(pyContent);
            const systemsWithVariant2 = new Set<string>();
            const childVariant2Keys = new Set<string>();

            for (const system of extractedSystems) {
                if (system.key.includes('_child_variant2')) {
                    const parentKey = system.key.replace('_child_variant2', '');
                    childVariant2Keys.add(parentKey);
                }
            }

            for (const system of extractedSystems) {
                system.emitters = extractEmittersFromSystem(system.rawContent);
                system.stencilCount = system.emitters.filter((e) => e.hasStencil).length;
                system.groundLayerCount = system.emitters.filter((e) => e.hasGroundLayer).length;

                if (system.key.includes('_child_variant2')) continue;

                const hasInlineVariant2 = /emitterName:\s*string\s*=\s*"[^"]*_Variant2"/i.test(system.rawContent);
                if (hasInlineVariant2) { systemsWithVariant2.add(system.key); continue; }

                const isSpawner = /emitterName:\s*string\s*=\s*"variant1"/i.test(system.rawContent)
                    && /emitterName:\s*string\s*=\s*"variant2"/i.test(system.rawContent);
                if (isSpawner) { systemsWithVariant2.add(system.key); continue; }

                if (childVariant2Keys.has(system.key)) systemsWithVariant2.add(system.key);
            }

            setVariant2Systems(systemsWithVariant2);
            setSystems(extractedSystems);
        } else {
            setSystems([]);
            setVariant2Systems(new Set());
        }
    }, [pyContent]);

    // Filtered systems based on search
    const filteredSystems = useMemo(() => {
        let filtered = systems;
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = systems.filter((sys) =>
                sys.name.toLowerCase().includes(query) || sys.key.toLowerCase().includes(query));
        }
        return filtered;
    }, [systems, searchQuery]);

    // Flattened rows for the list (systems + expanded emitters)
    const flattenedRows = useMemo<FlatRow[]>(() => {
        const rows: FlatRow[] = [];
        for (const system of filteredSystems) {
            rows.push({ type: 'system', system });
            if (expandedSystems.has(system.key) && system.emitters) {
                for (const emitter of system.emitters) {
                    rows.push({ type: 'emitter', emitter, systemKey: system.key });
                }
            }
        }
        return rows;
    }, [filteredSystems, expandedSystems]);

    // File operations
    const processBinFile = useCallback(async (filePath: string) => {
        try {
            setBinPath(filePath);
            setIsLoading(true);
            setLoadingText('Processing .bin file...');

            setLoadingText('Loading file...');
            const content = await readBin(filePath);

            setPyContent(content);
            setOriginalContent(content);
            setSelectedSystems(new Set());
            setSelectedEmitters(new Set());
            setHasUnsavedChanges(false);

            const systemCount = extractVfxSystems(content).length;
            setStatusMessage(`Loaded: ${systemCount} VFX systems found`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Error: ${msg}`);
            notify('error', `Failed to load bin: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [notify]);

    const loadBinFile = useCallback(async () => {
        try {
            const picked = await openDialog({
                multiple: false,
                filters: [
                    { name: 'Bin Files', extensions: ['bin', 'py'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
            });
            if (typeof picked === 'string') {
                await processBinFile(picked);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage('Error opening file dialog: ' + msg);
        }
    }, [processBinFile]);

    const saveFile = useCallback(async () => {
        if (!pyContent || !binPath) {
            setStatusMessage('Nothing to save');
            return;
        }

        try {
            setIsLoading(true);
            setLoadingText('Writing .bin file...');

            await writeBin(pyContent, binPath);

            setOriginalContent(pyContent);
            setHasUnsavedChanges(false);
            setStatusMessage('Saved successfully');
            notify('success', 'Saved successfully');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Save failed: ${msg}`);
            notify('error', `Save failed: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [pyContent, binPath, notify]);

    // Selection operations
    const toggleSystemSelection = useCallback((systemKey: string) => {
        setSelectedSystems((prev) => {
            const next = new Set(prev);
            if (next.has(systemKey)) {
                next.delete(systemKey);
                setStatusMessage(`Deselected: ${systemKey}`);
            } else {
                next.add(systemKey);
                const system = systems.find((s) => s.key === systemKey);
                if (system && system.rawContent) {
                    const stencilCount = countExistingStencilEmitters(system.rawContent);
                    if (stencilCount > 0) {
                        setStatusMessage(`Warning: ${stencilCount} emitters in "${systemKey}" have existing StencilMode and will NOT be toggled.`);
                    } else {
                        setStatusMessage(`Selected: ${systemKey}`);
                    }
                }
            }
            return next;
        });
    }, [systems]);

    // Check if a system is the special 'togglescreen' system
    const isToggleScreenSystem = useCallback((system: VfxSystemInfo) => {
        if (!system) return false;
        if (system.key === 'togglescreen' || system.name === 'togglescreen') return true;
        if (system.rawContent) {
            return /particleName:\s*string\s*=\s*"togglescreen"/i.test(system.rawContent)
                || /particlePath:\s*string\s*=\s*"togglescreen"/i.test(system.rawContent);
        }
        return false;
    }, []);

    const selectAll = useCallback(() => {
        const selectable = filteredSystems.filter((s) => {
            const hasVariants = hasToggleVariants(pyContent, s.key, s.rawContent);
            const hasInline = hasInlineVariants(s.rawContent);
            const isToggleScreen = isToggleScreenSystem(s);
            return !hasVariants && !hasInline && !isToggleScreen;
        });
        setSelectedSystems(new Set(selectable.map((s) => s.key)));
    }, [filteredSystems, pyContent, isToggleScreenSystem]);

    const deselectAll = useCallback(() => {
        setSelectedSystems(new Set());
    }, []);

    // Execute conversion logic (Child Particles / separate bins)
    const executeConversion = useCallback(async (stencilId: string) => {
        setIsLoading(true);
        setLoadingText('Converting to separate variant bins...');

        try {
            const result = convertToSeparateBins(pyContent, [...selectedSystems], binPath || '', stencilId);

            if (result.success && result.mainContent) {
                // Write variant1.bin / variant2.bin to disk (merging existing systems).
                if (binPath) {
                    const writeResult = await writeVariantBinsWithMerge(result, binPath);
                    if (!writeResult.success) {
                        setStatusMessage(`Error: ${writeResult.error}`);
                        notify('error', `Error writing variant bins: ${writeResult.error}`);
                        return;
                    }
                }

                setPyContent(result.mainContent);
                setHasUnsavedChanges(true);
                setSelectedSystems(new Set());
                setStatusMessage(result.message || 'Converted to child particles');
                notify('success', result.message || 'Converted to child particles');
            } else {
                setStatusMessage(`Error: ${result.error}`);
                notify('error', `Error: ${result.error}`);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Error: ${msg}`);
            notify('error', `Error: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [pyContent, selectedSystems, binPath, notify]);

    // Execute inline variants conversion (duplicates emitters within same system)
    const executeInlineVariantsConversion = useCallback(async (stencilId: string, skipGroundLayer = false) => {
        setIsLoading(true);
        setLoadingText(skipGroundLayer ? 'Duplicating emitters (skipping ground layer)...' : 'Duplicating emitters as inline variants...');

        try {
            const result = convertToInlineVariants(pyContent, [...selectedSystems], stencilId, skipGroundLayer);

            if (result.success) {
                setPyContent(result.content);
                setHasUnsavedChanges(true);
                setSelectedSystems(new Set());
                setStatusMessage(result.message || 'Duplicated as inline variants');
                notify('success', result.message || 'Duplicated as inline variants');
            } else {
                setStatusMessage(`Error: ${result.error}`);
                notify('error', `Error: ${result.error}`);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Error: ${msg}`);
            notify('error', `Error: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [pyContent, selectedSystems, notify]);

    // Open modal for Child Particles conversion
    const handleConvertToVariants = useCallback(() => {
        if (selectedSystems.size === 0) { setStatusMessage('Select at least one VFX system'); return; }
        if (!binPath) { setStatusMessage('No file loaded'); return; }
        setShowChildParticlesWarning(true);
    }, [selectedSystems, binPath]);

    const handleConfirmChildParticles = useCallback(() => {
        setShowChildParticlesWarning(false);
        const existingId = extractStencilIdFromToggleScreen(pyContent);
        if (existingId) { executeConversion(existingId); return; }
        setPendingAction('convert');
        setCustomStencilId('');
        setShowStencilModal(true);
    }, [pyContent, executeConversion]);

    const handleCancelChildParticles = useCallback(() => {
        setShowChildParticlesWarning(false);
    }, []);

    // Execute action with custom Stencil ID
    const handleStencilModalConfirm = useCallback(async () => {
        setShowStencilModal(false);
        const stencilId = customStencilId.trim() || DEFAULT_STENCIL;

        if (pendingAction === 'convert') {
            await executeConversion(stencilId);
        } else if (pendingAction === 'togglescreen') {
            try {
                const result = await insertToggleScreen(pyContent, binPath, null, null, stencilId);
                if (result.success) {
                    setPyContent(result.content);
                    setHasUnsavedChanges(true);
                    setStatusMessage(result.message || 'Added togglescreen');
                    notify('success', result.message || 'Added togglescreen');
                } else {
                    setStatusMessage(`Error: ${result.error}`);
                    notify('error', `Error: ${result.error}`);
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                setStatusMessage(`Error: ${msg}`);
                notify('error', `Error: ${msg}`);
            }
        } else if (pendingAction === 'inlineVariants') {
            await executeInlineVariantsConversion(stencilId, false);
        } else if (pendingAction === 'inlineVariants-skip') {
            await executeInlineVariantsConversion(stencilId, true);
        } else if (pendingAction === 'emitter-inline') {
            await handleDuplicateEmittersAsInline(stencilId, false);
        } else if (pendingAction === 'emitter-inline-skip') {
            await handleDuplicateEmittersAsInline(stencilId, true);
        }
    }, [pyContent, binPath, customStencilId, pendingAction, executeConversion, executeInlineVariantsConversion, handleDuplicateEmittersAsInline, notify]);

    // Open modal for togglescreen
    const handleAddToggleScreen = useCallback(() => {
        if (!pyContent) { setStatusMessage('Load a file first'); return; }
        if (hasToggleScreen(pyContent)) { setStatusMessage('togglescreen system already exists'); return; }
        setPendingAction('togglescreen');
        setCustomStencilId('');
        setShowStencilModal(true);
    }, [pyContent]);

    // Add animation toggle system
    const handleAddAnimationToggle = useCallback(async () => {
        if (!pyContent) { setStatusMessage('Load a file first'); return; }
        if (!binPath) { setStatusMessage('No file loaded'); return; }
        if (hasAnimationToggle(pyContent)) { setStatusMessage('Animation toggle already exists'); return; }

        try {
            setIsLoading(true);
            setLoadingText('Adding animation toggle...');

            const result = await insertAnimationToggle(pyContent, binPath);

            if (result.success) {
                setPyContent(result.content);
                setHasUnsavedChanges(true);
                setStatusMessage(result.message || 'Added animation toggle');
                notify('success', result.message || 'Added animation toggle');
            } else {
                setStatusMessage(`Error: ${result.error}`);
                notify('error', `Error: ${result.error}`);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Error: ${msg}`);
            notify('error', `Error: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [pyContent, binPath, notify]);

    // Get ground layer count for selected systems
    const getSelectedSystemsGroundLayerCount = useCallback(() => {
        let count = 0;
        for (const systemKey of selectedSystems) {
            const system = systems.find((s) => s.key === systemKey);
            if (system && system.groundLayerCount) count += system.groundLayerCount;
        }
        return count;
    }, [selectedSystems, systems]);

    // Handle inline variants button click
    const handleConvertToInlineVariants = useCallback(async () => {
        if (selectedSystems.size === 0) { setStatusMessage('Select at least one VFX system'); return; }
        if (!binPath) { setStatusMessage('No file loaded'); return; }

        const groundLayerCount = getSelectedSystemsGroundLayerCount();
        if (groundLayerCount > 0) { setShowGroundLayerWarning(true); return; }

        const existingId = extractStencilIdFromToggleScreen(pyContent);
        if (existingId) { await executeInlineVariantsConversion(existingId); return; }

        setPendingAction('inlineVariants');
        setCustomStencilId('');
        setShowStencilModal(true);
    }, [selectedSystems, binPath, pyContent, executeInlineVariantsConversion, getSelectedSystemsGroundLayerCount]);

    // Undo - restore to original content
    const handleUndo = useCallback(() => {
        if (!originalContent) { setStatusMessage('No original content to restore'); return; }
        if (pyContent === originalContent) { setStatusMessage('No changes to undo'); return; }
        setPyContent(originalContent);
        setHasUnsavedChanges(false);
        setStatusMessage('Changes reverted to original');
    }, [originalContent, pyContent]);

    // Open delete confirmation modal
    const handleDeleteVariant2Click = useCallback((systemKey: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (!pyContent) { setStatusMessage('Load a file first'); return; }
        setPendingDeleteSystemKey(systemKey);
        setShowDeleteModal(true);
    }, [pyContent]);

    // Confirm and execute deletion
    const handleDeleteConfirm = useCallback(() => {
        if (!pendingDeleteSystemKey || !pyContent) {
            setShowDeleteModal(false);
            setPendingDeleteSystemKey(null);
            return;
        }

        const systemKey = pendingDeleteSystemKey;
        setShowDeleteModal(false);
        setPendingDeleteSystemKey(null);

        try {
            setIsLoading(true);
            setLoadingText(`Deleting variant2 from ${systemKey}...`);

            const result = deleteVariant2FromSystem(pyContent, systemKey);

            if (result.success) {
                setPyContent(result.content);
                setHasUnsavedChanges(true);
                setStatusMessage(result.message || 'Reverted variants');
                notify('success', result.message || 'Reverted variants');
            } else {
                setStatusMessage(`Error: ${result.error}`);
                notify('error', `Error: ${result.error}`);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Error: ${msg}`);
            notify('error', `Error: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [pendingDeleteSystemKey, pyContent, notify]);

    const handleDeleteCancel = useCallback(() => {
        setShowDeleteModal(false);
        setPendingDeleteSystemKey(null);
    }, []);

    // Remove renderPhaseOverride from system
    const handleRemoveRenderPhase = useCallback((systemKey: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (!pyContent) { setStatusMessage('Load a file first'); return; }

        try {
            setIsLoading(true);
            setLoadingText(`Removing renderPhaseOverride from ${systemKey}...`);

            const result = removeRenderPhaseOverrideFromSystem(pyContent, systemKey);

            if (result.success) {
                setPyContent(result.content);
                setHasUnsavedChanges(true);
                setStatusMessage(result.message || 'Removed renderPhaseOverride');
                notify('success', result.message || 'Removed renderPhaseOverride');
            } else {
                setStatusMessage(`Error: ${result.error}`);
                notify('error', `Error: ${result.error}`);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Error: ${msg}`);
            notify('error', `Error: ${msg}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [pyContent, notify]);

    // Clear toast after 5 seconds
    useEffect(() => {
        if (statusMessage && !statusMessage.startsWith('Load') && !statusMessage.startsWith('Error')) {
            const timer = setTimeout(() => setStatusMessage(''), 5000);
            return () => clearTimeout(timer);
        }
    }, [statusMessage]);

    return (
        <Box className="fakegear-container">
            {/* Initial Warning Modal */}
            {showWarning && (
                <div className="fakegear-modal-overlay" style={{ zIndex: 10000 }}>
                    <div className="fakegear-modal" onClick={(e) => e.stopPropagation()} style={{ borderColor: 'color-mix(in oklab, var(--color-warning) 50%, var(--border))', maxWidth: '600px' }}>
                        <div className="fakegear-modal-header">
                            <InfoOutlinedIcon style={{ color: 'var(--color-warning)', fontSize: '1.5rem' }} />
                            <Typography className="fakegear-modal-title" style={{ color: 'var(--color-warning)' }}>
                                ⚠️ Test Page Warning
                            </Typography>
                        </div>

                        <div className="fakegear-modal-body">
                            <Typography className="fakegear-modal-desc" style={{ fontSize: '1rem', lineHeight: '1.6' }}>
                                This is a <strong style={{ color: 'var(--color-warning)' }}>test page</strong> meant to make VFX exchangeable.
                            </Typography>
                            <Typography className="fakegear-modal-desc" style={{ marginTop: '1rem', fontSize: '0.95rem', opacity: 0.9 }}>
                                <strong style={{ color: 'var(--color-danger)' }}>Important Limitations:</strong>
                            </Typography>
                            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.8' }}>
                                <li>Will <strong style={{ color: 'var(--color-danger)' }}>NOT work</strong> on stencil emitters</li>
                                <li>Will <strong style={{ color: 'var(--color-danger)' }}>NOT work</strong> on emitters that have <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '3px' }}>isGroundLayer</code></li>
                            </ul>
                            <Typography className="fakegear-modal-desc" style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.7, fontStyle: 'italic' }}>
                                Please proceed with caution and test thoroughly.
                            </Typography>
                        </div>

                        <div className="fakegear-modal-actions">
                            <button
                                className="dl-btn"
                                onClick={() => setShowWarning(false)}
                                style={{ background: 'var(--color-warning)', borderColor: 'var(--color-warning)', color: '#fff', fontWeight: 700, width: '100%' }}
                            >
                                I Understand, Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
            }}>
                {/* Title Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--accent-primary)' }}>
                        🪄 FakeGearSkin {binPath ? `- ${basename(binPath)}` : ''}
                    </h1>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="dl-btn dl-btn--sm" onClick={loadBinFile}>
                            Open
                        </button>
                        <button
                            className="dl-btn dl-btn--sm dl-btn--secondary"
                            onClick={handleUndo}
                            disabled={!originalContent || pyContent === originalContent}
                            title="Undo changes (restore original)"
                        >
                            Undo
                        </button>
                        <button
                            className="dl-btn dl-btn--sm dl-btn--primary"
                            onClick={saveFile}
                            disabled={!hasUnsavedChanges}
                        >
                            Save
                        </button>
                    </div>
                </div>

                {/* Status */}
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{statusMessage}</div>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left Panel - System List */}
                <div style={{
                    flex: 1,
                    borderRight: '1px solid var(--border)',
                    overflow: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--bg-tertiary)',
                    }}>
                        <Typography variant="h6" style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>VFX Systems</Typography>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <Tooltip title="Select all visible">
                                <IconButton size="small" onClick={selectAll} sx={{ padding: '4px' }}>
                                    <CheckBoxIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Deselect all">
                                <IconButton size="small" onClick={deselectAll} sx={{ padding: '4px' }}>
                                    <CheckBoxOutlineBlankIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </div>
                    </div>

                    {/* Search */}
                    <div style={{
                        padding: '8px 16px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'var(--bg-tertiary)',
                    }}>
                        <SearchIcon style={{ color: 'var(--text-secondary)', fontSize: '18px' }} />
                        <input
                            type="text"
                            className="dl-input"
                            placeholder="Search systems..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ flex: 1, height: '30px', fontSize: '12px' }}
                        />
                    </div>

                    {/* System List */}
                    <div ref={listContainerRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 0' }}>
                        {isLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                <CircularProgress size={32} />
                                <Typography style={{ marginTop: '1rem' }}>{loadingText}</Typography>
                            </div>
                        ) : systems.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                <Typography>No VFX systems found</Typography>
                            </div>
                        ) : filteredSystems.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                <Typography>No matching systems</Typography>
                            </div>
                        ) : (
                            flattenedRows.map((row, index) => (
                                <SystemRowComponent
                                    key={row.type === 'system'
                                        ? `sys::${row.system!.key}`
                                        : `em::${row.systemKey}::${row.emitter!.name}::${index}`}
                                    row={row}
                                    selectedSystems={selectedSystems}
                                    selectedEmitters={selectedEmitters}
                                    expandedSystems={expandedSystems}
                                    pyContent={pyContent}
                                    isLoading={isLoading}
                                    variant2Systems={variant2Systems}
                                    toggleSystemSelection={toggleSystemSelection}
                                    toggleEmitterSelection={toggleEmitterSelection}
                                    toggleExpand={toggleExpand}
                                    handleRemoveRenderPhase={handleRemoveRenderPhase}
                                    handleDeleteVariant2Click={handleDeleteVariant2Click}
                                    isToggleScreenSystem={isToggleScreenSystem}
                                />
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: '8px 16px',
                        borderTop: '1px solid var(--border)',
                        background: 'var(--bg-tertiary)',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                    }}>
                        <span>
                            {selectedSystems.size} system{selectedSystems.size !== 1 ? 's' : ''} · {selectedEmitters.size} emitter{selectedEmitters.size !== 1 ? 's' : ''} selected
                        </span>
                        {selectedEmitters.size > 0 ? (
                            <button
                                className="dl-btn dl-btn--sm dl-btn--primary"
                                onClick={initiateEmitterDuplication}
                                disabled={isLoading}
                            >
                                ✨ Duplicate {selectedEmitters.size} Emitter{selectedEmitters.size !== 1 ? 's' : ''} as Inline
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* Right Panel - Actions & Steps */}
                <div style={{
                    width: '35%',
                    minWidth: '300px',
                    overflow: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        background: 'var(--bg-tertiary)',
                    }}>
                        <Typography variant="h6" style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Actions</Typography>
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>

                        {/* Step 1: Convert */}
                        <Box className={`fakegear-step ${selectedSystems.size > 0 ? 'active' : ''}`}>
                            <div className="fakegear-step-number">1</div>
                            <Box className="fakegear-step-header">
                                <Typography className="fakegear-step-title">Convert Variants</Typography>
                            </Box>
                            <Typography className="fakegear-step-desc">
                                Creates variant1 (OFF) and variant2 (ON) for selected systems.
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                                <button
                                    className="dl-btn dl-btn--secondary"
                                    style={{ width: '100%' }}
                                    onClick={handleConvertToVariants}
                                    disabled={selectedSystems.size === 0 || isLoading}
                                >
                                    Convert to Child Particles
                                </button>
                                <button
                                    className="dl-btn dl-btn--primary"
                                    style={{ width: '100%' }}
                                    onClick={handleConvertToInlineVariants}
                                    disabled={selectedSystems.size === 0 || isLoading}
                                >
                                    Duplicate as Inline Variants
                                </button>
                            </Box>
                            <Typography variant="caption" sx={{ color: 'var(--text-secondary)', mt: 1, display: 'block', fontSize: '0.7rem' }}>
                                Child Particles: Creates separate VFX systems for each variant.<br />
                                Inline Variants: Duplicates emitters within the same system.
                            </Typography>
                        </Box>

                        {/* Step 2: Toggle Screen */}
                        <Box className={`fakegear-step ${hasToggleScreen(pyContent) ? 'completed' : 'active'}`}>
                            <div className="fakegear-step-number">2</div>
                            <Box className="fakegear-step-header">
                                <Typography className="fakegear-step-title">Toggle Screen</Typography>
                            </Box>
                            <Typography className="fakegear-step-desc">
                                Adds the screen filter effect that controls visibility.
                            </Typography>

                            {hasToggleScreen(pyContent) ? (
                                <Box className="fakegear-exists-badge">
                                    togglescreen exists
                                </Box>
                            ) : (
                                <button
                                    className="dl-btn dl-btn--primary"
                                    style={{ width: '100%' }}
                                    onClick={handleAddToggleScreen}
                                    disabled={!pyContent}
                                >
                                    Add Toggle Screen
                                </button>
                            )}
                        </Box>

                        {/* Step 3: Animation Toggle */}
                        <Box className={`fakegear-step ${hasAnimationToggle(pyContent) ? 'completed' : 'active'}`}>
                            <div className="fakegear-step-number">3</div>
                            <Box className="fakegear-step-header">
                                <Typography className="fakegear-step-title">Animation Logic</Typography>
                            </Box>
                            <Typography className="fakegear-step-desc">
                                Adds Ctrl+5 logic to switch meshes and animations.
                            </Typography>

                            {hasAnimationToggle(pyContent) ? (
                                <Box className="fakegear-exists-badge">
                                    Animation Toggle exists
                                </Box>
                            ) : (
                                <button
                                    className="dl-btn dl-btn--primary"
                                    style={{ width: '100%' }}
                                    onClick={handleAddAnimationToggle}
                                    disabled={!pyContent}
                                >
                                    Add Animation Toggle
                                </button>
                            )}
                        </Box>

                    </div>
                </div>
            </div>

            {/* Toast Notification */}
            {statusMessage && (
                <Box className="fakegear-toast-container">
                    <Box className="fakegear-toast">
                        <InfoOutlinedIcon fontSize="small" style={{ color: 'var(--accent-primary)' }} />
                        <Typography variant="body2">{statusMessage}</Typography>
                    </Box>
                </Box>
            )}

            {/* Stencil ID Modal */}
            <StencilModal
                open={showStencilModal}
                stencilId={customStencilId}
                onChange={setCustomStencilId}
                onConfirm={handleStencilModalConfirm}
                onClose={() => setShowStencilModal(false)}
            />

            {/* Delete Confirmation Modal */}
            <DeleteConfirmModal
                open={showDeleteModal}
                systemKey={pendingDeleteSystemKey}
                onConfirm={handleDeleteConfirm}
                onCancel={handleDeleteCancel}
            />

            {/* Child Particles Warning Modal */}
            <ChildParticlesWarningModal
                open={showChildParticlesWarning}
                onConfirm={handleConfirmChildParticles}
                onCancel={handleCancelChildParticles}
            />

            {/* Ground Layer Warning Modal */}
            {showGroundLayerWarning && (() => {
                const isEmitterMode = selectedEmitters.size > 0;
                const groundCount = isEmitterMode
                    ? getSelectedEmitterDetails().groundLayerCount
                    : getSelectedSystemsGroundLayerCount();

                return (
                    <div className="fakegear-modal-overlay" onClick={() => setShowGroundLayerWarning(false)}>
                        <div className="fakegear-modal" onClick={(e) => e.stopPropagation()} style={{ borderColor: 'color-mix(in oklab, var(--color-danger) 50%, var(--border))', maxWidth: '550px' }}>
                            <div className="fakegear-modal-header">
                                <WarningAmberIcon style={{ color: 'var(--color-danger)', fontSize: '1.5rem' }} />
                                <Typography className="fakegear-modal-title" style={{ color: 'var(--color-danger)' }}>
                                    ⚠️ Ground Layer Emitters Detected
                                </Typography>
                            </div>

                            <div className="fakegear-modal-body">
                                <Typography className="fakegear-modal-desc">
                                    <strong style={{ color: 'var(--color-danger)' }}>{groundCount}</strong> {isEmitterMode ? 'of your selected emitters have' : 'emitters in selected systems have'} <strong style={{ color: 'var(--accent-primary)' }}>isGroundLayer: flag = true</strong>
                                </Typography>
                                <Typography className="fakegear-modal-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.9 }}>
                                    Patching ground layer emitters will likely cause <strong style={{ color: 'var(--color-danger)' }}>rendering bugs</strong> where the character renders <strong>behind</strong> the particle effect.
                                </Typography>
                                <Typography className="fakegear-modal-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.7 }}>
                                    What would you like to do?
                                </Typography>
                            </div>

                            <div className="fakegear-modal-actions" style={{ flexDirection: 'column', gap: '8px' }}>
                                {isEmitterMode ? (
                                    <>
                                        <button
                                            className="dl-btn"
                                            onClick={() => {
                                                setShowGroundLayerWarning(false);
                                                const existingId = extractStencilIdFromToggleScreen(pyContent);
                                                if (existingId) {
                                                    handleDuplicateEmittersAsInline(existingId, true);
                                                } else {
                                                    setPendingAction('emitter-inline-skip');
                                                    setShowStencilModal(true);
                                                }
                                            }}
                                            style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)', color: '#fff', fontWeight: 700, width: '100%' }}
                                        >
                                            Skip Ground Layer Emitters (Recommended)
                                        </button>
                                        <button
                                            className="dl-btn dl-btn--danger"
                                            style={{ width: '100%' }}
                                            onClick={() => {
                                                setShowGroundLayerWarning(false);
                                                const existingId = extractStencilIdFromToggleScreen(pyContent);
                                                if (existingId) {
                                                    handleDuplicateEmittersAsInline(existingId, false);
                                                } else {
                                                    setPendingAction('emitter-inline');
                                                    setShowStencilModal(true);
                                                }
                                            }}
                                        >
                                            Patch Anyway (May Cause Bugs)
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            className="dl-btn"
                                            onClick={() => {
                                                setShowGroundLayerWarning(false);
                                                setPendingAction('inlineVariants-skip');
                                                const existingId = extractStencilIdFromToggleScreen(pyContent);
                                                if (existingId) {
                                                    executeInlineVariantsConversion(existingId, true);
                                                } else {
                                                    setCustomStencilId('');
                                                    setShowStencilModal(true);
                                                }
                                            }}
                                            style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)', color: '#fff', fontWeight: 700, width: '100%' }}
                                        >
                                            Skip Ground Layer Emitters (Recommended)
                                        </button>
                                        <button
                                            className="dl-btn dl-btn--danger"
                                            style={{ width: '100%' }}
                                            onClick={() => {
                                                setShowGroundLayerWarning(false);
                                                const existingId = extractStencilIdFromToggleScreen(pyContent);
                                                if (existingId) {
                                                    executeInlineVariantsConversion(existingId, false);
                                                } else {
                                                    setPendingAction('inlineVariants');
                                                    setCustomStencilId('');
                                                    setShowStencilModal(true);
                                                }
                                            }}
                                        >
                                            Patch Anyway (May Cause Bugs)
                                        </button>
                                    </>
                                )}
                                <button
                                    className="dl-btn dl-btn--secondary"
                                    onClick={() => setShowGroundLayerWarning(false)}
                                    style={{ width: '100%' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </Box>
    );
}

// ============ Stencil ID Modal ============
interface StencilModalProps {
    open: boolean;
    stencilId: string;
    onChange: (v: string) => void;
    onConfirm: () => void;
    onClose: () => void;
}

const StencilModal = memo(function StencilModal({ open, stencilId, onChange, onConfirm, onClose }: StencilModalProps) {
    const [localValue, setLocalValue] = useState(stencilId);

    useEffect(() => {
        if (open) setLocalValue(stencilId);
    }, [open, stencilId]);

    const handleConfirm = useCallback(() => {
        onChange(localValue);
        onConfirm();
    }, [localValue, onChange, onConfirm]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleConfirm();
        else if (e.key === 'Escape') onClose();
    }, [handleConfirm, onClose]);

    if (!open) return null;

    return (
        <div className="fakegear-modal-overlay" onClick={onClose}>
            <div className="fakegear-modal" onClick={(e) => e.stopPropagation()}>
                <div className="fakegear-modal-header">
                    <AutoFixHighIcon />
                    <Typography className="fakegear-modal-title">Configure Stencil ID</Typography>
                </div>

                <div className="fakegear-modal-body">
                    <Typography className="fakegear-modal-desc">
                        Set the unique Stencil Reference ID for your variant toggle.
                        This ID links the screen filter to the mesh visibility.
                    </Typography>

                    <div>
                        <input
                            type="text"
                            className="dl-input"
                            style={{ fontFamily: 'var(--font-mono)' }}
                            placeholder="0xe6deedc4 (Default)"
                            value={localValue}
                            onChange={(e) => setLocalValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                        />
                        <Typography className="fakegear-modal-hint" style={{ marginTop: '0.5rem' }}>
                            Leave empty to use default (0xe6deedc4)
                        </Typography>
                    </div>
                </div>

                <div className="fakegear-modal-actions">
                    <button className="dl-btn dl-btn--secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="dl-btn dl-btn--primary" onClick={handleConfirm}>
                        Confirm & Proceed
                    </button>
                </div>
            </div>
        </div>
    );
});

// ============ Child Particles Warning Modal ============
interface ChildParticlesWarningModalProps {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const ChildParticlesWarningModal = memo(function ChildParticlesWarningModal({ open, onConfirm, onCancel }: ChildParticlesWarningModalProps) {
    if (!open) return null;

    return (
        <div className="fakegear-modal-overlay" onClick={onCancel}>
            <div className="fakegear-modal" onClick={(e) => e.stopPropagation()} style={{ borderColor: 'color-mix(in oklab, var(--color-warning) 35%, var(--border))' }}>
                <div className="fakegear-modal-header">
                    <InfoOutlinedIcon style={{ color: 'var(--color-warning)', fontSize: '1.5rem' }} />
                    <Typography className="fakegear-modal-title" style={{ color: 'var(--color-warning)' }}>
                        ⚠️ Warning: Child Particles Method
                    </Typography>
                </div>

                <div className="fakegear-modal-body">
                    <Typography className="fakegear-modal-desc">
                        The <strong style={{ color: 'var(--accent-primary)' }}>"Convert to Child Particles"</strong> method creates separate VFX systems for each variant, which can cause more bugs and compatibility issues.
                    </Typography>
                    <Typography className="fakegear-modal-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.8 }}>
                        <strong style={{ color: 'var(--color-success)' }}>Recommended:</strong> Use <strong>"Duplicate as Inline Variants"</strong> instead, which duplicates emitters within the same system and has fewer bugs.
                    </Typography>
                    <Typography className="fakegear-modal-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.7 }}>
                        Do you still want to proceed with Child Particles?
                    </Typography>
                </div>

                <div className="fakegear-modal-actions">
                    <button className="dl-btn dl-btn--secondary" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="dl-btn" onClick={onConfirm} style={{ background: 'var(--color-warning)', borderColor: 'var(--color-warning)', color: '#fff', fontWeight: 700 }}>
                        Proceed Anyway
                    </button>
                </div>
            </div>
        </div>
    );
});

// ============ Delete Confirmation Modal ============
interface DeleteConfirmModalProps {
    open: boolean;
    systemKey: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}

const DeleteConfirmModal = memo(function DeleteConfirmModal({ open, systemKey, onConfirm, onCancel }: DeleteConfirmModalProps) {
    if (!open) return null;

    return (
        <div className="fakegear-modal-overlay" onClick={onCancel}>
            <div className="fakegear-modal" onClick={(e) => e.stopPropagation()} style={{ borderColor: 'color-mix(in oklab, var(--color-danger) 35%, var(--border))' }}>
                <div className="fakegear-modal-header">
                    <DeleteIcon style={{ color: 'var(--color-danger)', fontSize: '1.5rem' }} />
                    <Typography className="fakegear-modal-title" style={{ color: 'var(--color-danger)' }}>
                        Revert Variants
                    </Typography>
                </div>

                <div className="fakegear-modal-body">
                    <Typography className="fakegear-modal-desc">
                        Are you sure you want to revert variants from <strong style={{ color: 'var(--accent-primary)' }}>"{systemKey}"</strong>?
                    </Typography>
                    <Typography className="fakegear-modal-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.8 }}>
                        This will:
                    </Typography>
                    <ul style={{ marginTop: '0.5rem', fontSize: '0.8rem', opacity: 0.8, paddingLeft: '1.5rem' }}>
                        <li>Delete all _Variant2 emitters</li>
                        <li>Rename _Variant1 emitters back to original names</li>
                        <li>Remove stencil properties (only those matching your togglescreen ID)</li>
                        <li>Remove renderPhaseOverride</li>
                    </ul>
                </div>

                <div className="fakegear-modal-actions">
                    <button className="dl-btn dl-btn--secondary" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        className="dl-btn"
                        onClick={onConfirm}
                        style={{
                            background: 'var(--color-danger)',
                            color: 'white',
                            borderColor: 'var(--color-danger)',
                        }}
                    >
                        Revert Variants
                    </button>
                </div>
            </div>
        </div>
    );
});

export { FakeGear };
export default FakeGear;
