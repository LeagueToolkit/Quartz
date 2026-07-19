import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Box } from '@mui/material';
import { FolderOpen } from 'lucide-react';
import { log } from '@/lib/util/logger';
import './bumpath/Bumpath.css';
import { useFileExplorer } from '@/components/explorer';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { explorerListDir } from '@/lib/api/explorer';
import CelestiaGuide from './bumpath/components/CelestiaGuide';
import SourceBinsPanel from './bumpath/components/SourceBinsPanel';
import EntriesPanel from './bumpath/components/EntriesPanel';
import BumpathBottomControls from './bumpath/components/BumpathBottomControls';
import BumpathSettingsPanel from './bumpath/components/BumpathSettingsPanel';
import BumpathSettingsDialog from './bumpath/components/BumpathSettingsDialog';
import CelestiaTriggerButton from './bumpath/components/CelestiaTriggerButton';
import CelestiaTutorialOverlays from './bumpath/components/CelestiaTutorialOverlays';
import QuickRepathWizardModal from './bumpath/components/QuickRepathWizardModal';
import SourceAddModeModal from './bumpath/components/SourceAddModeModal';
import { panelStyle } from './bumpath/utils/styles';
import useBumpathCoreApi from './bumpath/hooks/useBumpathCoreApi';
import useBumpathSourceScan from './bumpath/hooks/useBumpathSourceScan';
import useBumpathActions from './bumpath/hooks/useBumpathActions';
import useBumpathEntries from './bumpath/hooks/useBumpathEntries';
import type { ScannedData, SourceBins, QuickBinOption } from './bumpath/utils/types';
import type { SpotlightRect } from './bumpath/components/SpotlightOverlay';

/* Hash files in the Rust build are resolved by the backend via the shared
   RitoShark LMDB. The marker is only shown for parity in Bumpath settings. */
const INTEGRATED_HASHES_PATH = 'RitoShark hash database (Integrated)';

function readBoolPref(key: string): boolean | undefined {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return undefined;
        return raw === 'true';
    } catch {
        return undefined;
    }
}

function shortStatus(value: string): string {
    return value
        .replace(/^Processing completed:\s*/i, 'Done · ')
        .replace(/^Quick Repath completed:\s*/i, 'Quick Repath · ')
        .replace(/^Scan completed:\s*Found\s*/i, '')
        .replace(/^Added source directory and discovered\s*/i, '')
        .replace(/^Viewing\s*/i, 'Viewing ')
        .replace(/^Failed to discover BIN files:\s*/i, 'Source error · ')
        .replace(/^Processing failed:\s*/i, 'Failed · ')
        .replace(/^Quick Repath failed:\s*/i, 'Quick Repath failed · ')
        .replace(/\s+files processed$/i, ' files')
        .trim();
}

export function Bumpath() {
    const pick = useFileExplorer();
    const [sourceDirs, setSourceDirs] = useState<string[]>([]);
    const [, setSourceFiles] = useState<Record<string, unknown>>({});
    const [sourceBins, setSourceBins] = useState<SourceBins>({});
    const [activeBinPath, setActiveBinPath] = useState('');
    const [scannedData, setScannedData] = useState<ScannedData | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
    const [prefixText, setPrefixText] = useState('');
    const [debouncedPrefixText, setDebouncedPrefixText] = useState('');
    const [appliedPrefixes, setAppliedPrefixes] = useState<Map<string, string>>(new Map()); // Track applied prefixes per entry
    const [ignoreMissing, setIgnoreMissing] = useState(false);
    const [combineLinked, setCombineLinked] = useState(false);
    const [splitVfx, setSplitVfx] = useState(true);
    const [consolidateAssets, setConsolidateAssets] = useState(true);
    const [hideDataFolderBins, setHideDataFolderBins] = useState(false);
    const [hashesPath, setHashesPath] = useState('');
    const [outputPath, setOutputPath] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [showMissingOnly, setShowMissingOnly] = useState(false);
    const [binFilter, setBinFilter] = useState('');
    const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
    const [expandedFilePaths, setExpandedFilePaths] = useState<Set<string>>(new Set()); // Track expanded file paths (for missing file headers)
    const [settingsExpanded, setSettingsExpanded] = useState(false);
    const [showCelestiaGuide, setShowCelestiaGuide] = useState(false);
    const [celestiaStepIndex, setCelestiaStepIndex] = useState(0);
    const [simulatedBinSelected, setSimulatedBinSelected] = useState(false);
    const [binListHighlightRect, setBinListHighlightRect] = useState<SpotlightRect | null>(null);
    const [settingsAutoOpened, setSettingsAutoOpened] = useState(false);
    const [quickRepathOpen, setQuickRepathOpen] = useState(false);
    const [quickRepathStep, setQuickRepathStep] = useState(0);
    const [quickMainBin, setQuickMainBin] = useState('');
    const [quickPrefix, setQuickPrefix] = useState('');
    const [quickOutputPath, setQuickOutputPath] = useState('');
    const [isQuickRepathRunning, setIsQuickRepathRunning] = useState(false);
    const [sourceAddModeOpen, setSourceAddModeOpen] = useState(false);
    const [lastAddedSourceDir, setLastAddedSourceDir] = useState('');
    const [isDragOverSource, setIsDragOverSource] = useState(false);
    const [outputConflictOpen, setOutputConflictOpen] = useState(false);
    const [outputConflictPath, setOutputConflictPath] = useState('');
    const outputConflictResolver = useRef<((replace: boolean) => void) | null>(null);
    const scanDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Reset simulated state when step changes or guide closes
    useEffect(() => {
        if (celestiaStepIndex !== 1) {
            setSimulatedBinSelected(false);
        }
    }, [celestiaStepIndex]);

    useEffect(() => {
        if (!showCelestiaGuide) {
            setSimulatedBinSelected(false);
            setBinListHighlightRect(null);
            // Reset auto-opened flag and close settings when guide closes
            if (settingsAutoOpened) {
                setSettingsExpanded(false);
                setSettingsAutoOpened(false);
            }
        }
    }, [showCelestiaGuide, settingsAutoOpened]);

    // Update bin list highlight rect when on step 2 (bin list step, index 1)
    useEffect(() => {
        if (showCelestiaGuide && celestiaStepIndex === 1) {
            const updateRect = () => {
                const element = document.querySelector('[data-bumpath-bin-list]');
                if (element) {
                    const rect = element.getBoundingClientRect();
                    const padding = 15; // Same padding as in the step definition
                    setBinListHighlightRect({
                        left: rect.left - padding,
                        top: rect.top - padding,
                        width: rect.width + padding * 2,
                        height: rect.height + padding * 2,
                    });
                } else {
                    setBinListHighlightRect(null);
                }
            };

            updateRect();
            const onResize = () => updateRect();
            const onScroll = () => updateRect();
            window.addEventListener('resize', onResize, { passive: true });
            window.addEventListener('scroll', onScroll, true);

            return () => {
                window.removeEventListener('resize', onResize);
                window.removeEventListener('scroll', onScroll, true);
            };
        }
        setBinListHighlightRect(null);
        return undefined;
    }, [showCelestiaGuide, celestiaStepIndex]);

    // Auto-open/close settings when on step 7 (index 6)
    useEffect(() => {
        if (!showCelestiaGuide) {
            // Don't do anything if guide is not open
            return undefined;
        }

        // Only manage settings on step 7
        if (celestiaStepIndex === 6) {
            // Open settings when entering step 7
            setSettingsAutoOpened(true);
            setSettingsExpanded(true);
            return undefined;
        }

        // Close settings when not on step 7. If we auto-opened them, close and reset the flag
        if (settingsAutoOpened) {
            const timer = setTimeout(() => {
                setSettingsExpanded(false);
                setSettingsAutoOpened(false);
            }, 100);
            return () => clearTimeout(timer);
        }
        /* Also ensure settings are closed if they're open when guide starts on
           earlier steps. This prevents settings from briefly showing when guide
           opens on step 1. */
        if (settingsExpanded && !settingsAutoOpened) {
            if (celestiaStepIndex < 6) {
                setSettingsExpanded(false);
            }
        }
        return undefined;
    }, [showCelestiaGuide, celestiaStepIndex, settingsAutoOpened, settingsExpanded]);

    // Progress/status sink for the repath flow. The console UI was removed, so
    // these route to the app log instead of an in-page buffer.
    const addLog = useCallback((message: string) => {
        log.info(`[bumpath] ${message}`);
    }, []);

    /* Kept for the hook contract; the native flow logs via addLog directly. */
    const fetchLogs = useCallback(async () => {}, []);

    const confirmOutputMerge = useCallback(async (path: string): Promise<boolean> => {
        try {
            const entries = await explorerListDir(path);
            if (entries.length === 0) return true;
        } catch {
            // A destination that does not exist yet is safe; the backend creates it.
            return true;
        }
        setOutputConflictPath(path);
        setOutputConflictOpen(true);
        return new Promise<boolean>((resolve) => {
            outputConflictResolver.current = resolve;
        });
    }, []);

    const resolveOutputConflict = useCallback((replace: boolean) => {
        setOutputConflictOpen(false);
        const resolve = outputConflictResolver.current;
        outputConflictResolver.current = null;
        resolve?.(replace);
    }, []);

    // Load settings on mount
    useEffect(() => {
        // Hashes are integrated via the shared LMDB; use the marker path.
        setHashesPath(INTEGRATED_HASHES_PATH);

        // Check if this is the first time (preferences not set)
        const savedIgnore = readBoolPref('BumpathIgnoreMissing');
        const savedCombine = readBoolPref('BumpathCombineLinked');
        const savedSplitVfx = readBoolPref('BumpathSplitVfx');
        const savedConsolidateAssets = readBoolPref('BumpathConsolidateAssets');
        const isFirstTime = savedIgnore === undefined && savedCombine === undefined;

        if (isFirstTime) {
            // First time: set both to true by default
            const defaultIgnoreMissing = true;
            const defaultCombineLinked = true;
            setIgnoreMissing(defaultIgnoreMissing);
            setCombineLinked(defaultCombineLinked);
            try {
                localStorage.setItem('BumpathIgnoreMissing', String(defaultIgnoreMissing));
                localStorage.setItem('BumpathCombineLinked', String(defaultCombineLinked));
            } catch {
                /* ignore */
            }
        } else {
            // Not first time: use saved values or default to false
            setIgnoreMissing(savedIgnore || false);
            setCombineLinked(savedCombine || false);
            setHideDataFolderBins(readBoolPref('BumpathHideDataFolderBins') || false);
        }
        const splitVfxDefault = savedSplitVfx ?? true;
        setSplitVfx(splitVfxDefault);
        if (savedSplitVfx === undefined) {
            try {
                localStorage.setItem('BumpathSplitVfx', 'true');
            } catch {
                /* ignore */
            }
        }
        const consolidateDefault = savedConsolidateAssets ?? true;
        setConsolidateAssets(consolidateDefault);
        if (savedConsolidateAssets === undefined) {
            try {
                localStorage.setItem('BumpathConsolidateAssets', 'true');
            } catch {
                /* ignore */
            }
        }
    }, []);

    // Auto-dismiss success toast after 4 seconds
    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => {
                setSuccess(null);
            }, 4000);

            return () => clearTimeout(timer);
        }
        return undefined;
    }, [success]);

    // Debounce prefix text to reduce lag
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedPrefixText(prefixText);
        }, 150);

        return () => clearTimeout(timer);
    }, [prefixText]);

    // Optimized prefix text change handler
    const handlePrefixTextChange = useCallback((value: string) => {
        setPrefixText(value);
    }, []);

    // Save settings
    const saveSettings = useCallback((key: string, value: boolean) => {
        try {
            localStorage.setItem(key, String(value));
        } catch (saveError) {
            console.error('Error saving setting:', saveError);
        }
    }, []);

    const apiCall = useBumpathCoreApi({ addLog });

    const handleSourceDirAdded = useCallback((payload: { sourceDir: string } | undefined) => {
        const addedPath = payload?.sourceDir || '';
        setLastAddedSourceDir(addedPath);
        setQuickRepathOpen(false);
        // Loading a source should never interrupt the user with a workflow
        // choice. Quick Repath remains available as an explicit action.
        setSourceAddModeOpen(false);
    }, []);

    const {
        handleSelectSourceDir,
        handleBinSelect,
        handleBinView: scanViewedBin,
        addSourceDirByPath,
    } = useBumpathSourceScan({
        apiCall,
        sourceDirs,
        sourceBins,
        hashesPath,
        scanDebounceTimerRef,
        setSourceDirs,
        setSourceFiles,
        setSourceBins,
        setScannedData,
        setSelectedEntries,
        setExpandedEntries,
        setIsScanning,
        setError,
        setSuccess,
        onSourceDirAdded: handleSourceDirAdded,
    });
    const handleBinView = useCallback((unifyPath: string) => {
        setActiveBinPath(unifyPath);
        void scanViewedBin(unifyPath);
    }, [scanViewedBin]);
    const {
        handleApplyPrefix,
        handleProcess,
        handleSelectOutputDir,
    } = useBumpathActions({
        apiCall,
        selectedEntries,
        prefixText,
        debouncedPrefixText,
        scannedData,
        appliedPrefixes,
        outputPath,
        ignoreMissing,
        combineLinked,
        splitVfx,
        consolidateAssets,
        sourceDirs,
        sourceBins,
        hashesPath,
        addLog,
        fetchLogs,
        confirmOutputMerge,
        setError,
        setSuccess,
        setScannedData,
        setAppliedPrefixes,
        setSelectedEntries,
        setExpandedEntries,
        setIsProcessing,
        setOutputPath,
        setSourceDirs,
        setSourceFiles,
        setSourceBins,
    });

    const openQuickWizard = useCallback(() => {
        setSourceAddModeOpen(false);
        setQuickRepathStep(0);
        setQuickRepathOpen(true);
    }, []);

    const handleChooseNormalRepath = useCallback(() => {
        setSourceAddModeOpen(false);
        setQuickRepathOpen(false);
        setSuccess('Source folder added. Continue with normal repath flow.');
    }, []);

    // OS folder drops are wired through the Tauri webview drag-drop event,
    // which (unlike the webview File object) provides absolute paths.
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let cancelled = false;
        (async () => {
            try {
                const webview = getCurrentWebview();
                const handle = await webview.onDragDropEvent((event) => {
                    const payload = event.payload;
                    if (payload.type === 'enter' || payload.type === 'over') {
                        setIsDragOverSource(true);
                    } else if (payload.type === 'leave') {
                        setIsDragOverSource(false);
                    } else if (payload.type === 'drop') {
                        setIsDragOverSource(false);
                        const paths = payload.paths || [];
                        if (paths.length === 0) {
                            setError('No folder detected in drop');
                            return;
                        }
                        void addSourceDirByPath(paths[0]);
                    }
                });
                if (cancelled) {
                    handle();
                } else {
                    unlisten = handle;
                }
            } catch {
                /* Drag-drop unavailable outside Tauri; ignore. */
            }
        })();
        return () => {
            cancelled = true;
            if (unlisten) unlisten();
        };
    }, [addSourceDirByPath]);

    useEffect(() => {
        if (!quickRepathOpen) return;
        if (quickOutputPath) return;
        if (outputPath) {
            setQuickOutputPath(outputPath);
        }
    }, [outputPath, quickOutputPath, quickRepathOpen]);

    const quickBinOptions = useMemo<QuickBinOption[]>(() => {
        return Object.entries(sourceBins || {})
            .filter(([unifyPath, data]) => {
                const pathToUse = data?.rel_path || data?.path || unifyPath || '';
                return !String(pathToUse).toLowerCase().includes('/animations/');
            })
            .map(([unifyPath, data]) => {
                const pathToUse = data?.rel_path || data?.path || unifyPath || '';
                return { value: unifyPath, label: pathToUse };
            });
    }, [sourceBins]);

    useEffect(() => {
        if (!quickRepathOpen) return;
        if (quickMainBin) return;
        if (quickBinOptions.length > 0) {
            setQuickMainBin(quickBinOptions[0].value);
        }
    }, [quickBinOptions, quickMainBin, quickRepathOpen]);

    const handleQuickSelectOutputDir = useCallback(async () => {
        try {
            const result = await pick({ mode: 'directory' });
            if (typeof result === 'string') {
                setQuickOutputPath(result);
            }
        } catch (selectError) {
            const message = selectError instanceof Error ? selectError.message : String(selectError);
            setError('Failed to select output directory: ' + message);
        }
    }, [pick]);

    const handleRunQuickRepath = useCallback(async () => {
        if (!quickMainBin) {
            setError('Select a main BIN first');
            return;
        }
        const prefix = (quickPrefix || '').trim();
        if (!prefix) {
            setError('Enter a prefix first');
            return;
        }
        const outPath = (quickOutputPath || '').trim();
        if (!outPath) {
            setError('Select an output directory first');
            return;
        }
        setIsQuickRepathRunning(true);
        setError(null);
        addLog('Quick Repath...');

        try {
            if (!(await confirmOutputMerge(outPath))) {
                addLog('Quick Repath cancelled: output folder already contains files');
                return;
            }
            const normalizeQuickPath = (value: string) => value.replace(/\\/g, '/').toLowerCase();
            const mainBinFolder = sourceDirs.find((dir) =>
                normalizeQuickPath(quickMainBin).startsWith(normalizeQuickPath(dir)),
            ) || sourceDirs[0] || quickMainBin;
            const mainPath = sourceBins[quickMainBin]?.rel_path
                || sourceBins[quickMainBin]?.path
                || quickMainBin;
            const selectedSkinFile = normalizeQuickPath(mainPath).match(/(?:^|\/)(skin\d+)\.bin$/)?.[1];

            // A mod can contain the main character skin BIN and one or more
            // subcharacter BINs with the same skin number. The original flow
            // needs all of them selected so their entries and links are repathed.
            const newSelections: SourceBins = {};
            Object.entries(sourceBins || {}).forEach(([path, data]) => {
                const candidatePath = data?.rel_path || data?.path || path;
                const candidateNormalized = normalizeQuickPath(candidatePath);
                const candidateSkinFile = candidateNormalized.match(/(?:^|\/)(skin\d+)\.bin$/)?.[1];
                const belongsToSource = normalizeQuickPath(data?.path || path)
                    .startsWith(normalizeQuickPath(mainBinFolder));
                const isMatchingSkinBin = Boolean(
                    selectedSkinFile
                    && candidateSkinFile === selectedSkinFile
                    && belongsToSource
                    && !candidateNormalized.includes('/animations/'),
                );
                newSelections[path] = {
                    ...data,
                    selected: path === quickMainBin || isMatchingSkinBin,
                };
            });
            setSourceBins(newSelections);

            const binSelections: Record<string, boolean> = {};
            Object.entries(newSelections).forEach(([path, data]) => {
                binSelections[path] = Boolean(data?.selected);
            });
            await apiCall('update-bin-selection', { binSelections });
            const selectedQuickBinPaths = Object.entries(newSelections)
                .filter(([, data]) => data?.selected)
                .map(([path, data]) => data?.path || path);

            setPrefixText(prefix);
            setDebouncedPrefixText(prefix);
            setOutputPath(outPath);

            setIsProcessing(true);
            const processResult = await apiCall('process', {
                folders: [mainBinFolder],
                prefix,
                selectedBinPaths: selectedQuickBinPaths,
                entryPrefixes: {},
                outputPath: outPath,
                ignoreMissing,
                combineLinked,
                splitVfx,
                consolidateAssets,
                hashesPath,
            });
            setIsProcessing(false);

            if (!processResult.success) {
                setError(processResult.error || 'Quick Repath process failed');
                return;
            }

            const processedCount = processResult.total_files || processResult.processedFiles || 0;
            setSuccess(`Quick Repath completed: ${processedCount} files processed`);
            addLog(`Done: ${processedCount} files`);

            setScannedData(null);
            setSelectedEntries(new Set());
            setExpandedEntries(new Set());
            setAppliedPrefixes(new Map());

            setQuickRepathOpen(false);
            setQuickRepathStep(0);
        } catch (quickError) {
            const message = quickError instanceof Error ? quickError.message : String(quickError);
            setError(`Quick Repath failed: ${message}`);
            addLog(`Quick Repath error: ${message}`);
            setIsProcessing(false);
            setIsScanning(false);
        } finally {
            setIsQuickRepathRunning(false);
        }
    }, [
        addLog,
        apiCall,
        combineLinked,
        confirmOutputMerge,
        splitVfx,
        consolidateAssets,
        hashesPath,
        ignoreMissing,
        quickMainBin,
        quickOutputPath,
        quickPrefix,
        sourceBins,
        sourceDirs,
    ]);
    const {
        handleEntrySelect,
        handleEntryExpand,
        handleFilePathExpand,
        handleSelectAll,
        handleDeselectAll,
        getEntryDisplayName,
        filteredEntries,
    } = useBumpathEntries({
        scannedData,
        showMissingOnly,
        setSelectedEntries,
        setExpandedEntries,
        setExpandedFilePaths,
    });

    const selectedBinCount = useMemo(
        () => Object.values(sourceBins || {}).filter((bin) => bin?.selected).length,
        [sourceBins],
    );
    const totalBinCount = useMemo(() => Object.keys(sourceBins || {}).length, [sourceBins]);

    useEffect(() => {
        if (activeBinPath && !sourceBins[activeBinPath]) {
            setActiveBinPath('');
        }
    }, [activeBinPath, sourceBins]);

    // Filter bins based on search (exclude animation BINs from display)
    const filteredBins = useMemo<Array<[string, SourceBins[string]]>>(() => {
        const filterLower = (binFilter || '').toLowerCase();
        return Object.entries(sourceBins || {}).filter(([unifyPath, data]) => {
            if (!data) return false;
            const pathToCheck = data?.path || data?.rel_path || unifyPath || '';
            const pathLower = pathToCheck.toLowerCase();
            // Filter out animation BINs from the list (but they can still be merged)
            if (pathLower.includes('/animations/')) return false;
            // Filter out bins directly in data folder if setting is enabled
            if (hideDataFolderBins) {
                /* Check if bin is directly in data folder (e.g., "data/something.bin"
                   or "data\\something.bin"). Not "data/characters/..." or
                   "data/particles/..." - those are subdirectories. */
                const dataFolderPattern = /^data[/\\][^/\\]+\.bin$/i;
                if (dataFolderPattern.test(pathToCheck)) {
                    return false;
                }
            }
            return pathLower.includes(filterLower);
        });
    }, [sourceBins, hideDataFolderBins, binFilter]);

    // Nothing loaded yet: no source folders, no scanned bins, no scan result.
    const isEmpty = sourceDirs.length === 0
        && Object.keys(sourceBins || {}).length === 0
        && !scannedData;

    return (
        <Box className="bumpath-container" sx={{
            width: '100%',
            height: '100%',
            minHeight: '100%',
            overflow: 'hidden',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
        }}>
            {isDragOverSource && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 30,
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)',
                        border: '2px dashed color-mix(in oklab, var(--accent-primary) 70%, transparent)',
                    }}
                >
                    <Box sx={{
                        px: 2,
                        py: 1.1,
                        borderRadius: '8px',
                        border: '1px solid color-mix(in oklab, var(--accent-primary) 55%, transparent)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.82rem',
                    }}>
                        Drop source folder to add it
                    </Box>
                </Box>
            )}

            <Box sx={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Main Content Area */}
                {isEmpty ? (
                    <div className="bumpath-emptywrap">
                        <div className="bumpath-empty">
                            <FolderOpen
                                size={48}
                                color="var(--accent-primary)"
                                strokeWidth={1.5}
                                style={{ display: 'block', marginBottom: 16 }}
                            />
                            <div className="bumpath-empty__title">No Source Folders</div>
                            <div className="bumpath-empty__sub">Drop a source folder here, or add one</div>
                            <button
                                type="button"
                                className="dl-btn dl-btn--primary"
                                onClick={handleSelectSourceDir}
                            >
                                <span className="dl-icon"><FolderOpen size={14} /></span>
                                <span>Add Source Folder</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
                        <SourceBinsPanel
                            binFilter={binFilter}
                            setBinFilter={setBinFilter}
                            filteredBins={filteredBins}
                            selectedBinCount={selectedBinCount}
                            totalBinCount={totalBinCount}
                            activeBinPath={activeBinPath}
                            handleBinSelect={handleBinSelect}
                            handleBinView={handleBinView}
                        />
                        <EntriesPanel
                            isScanning={isScanning}
                            scannedData={scannedData}
                            filteredEntries={filteredEntries}
                            expandedEntries={expandedEntries}
                            selectedEntries={selectedEntries}
                            expandedFilePaths={expandedFilePaths}
                            appliedPrefixes={appliedPrefixes}
                            globalPrefix={prefixText}
                            showMissingOnly={showMissingOnly}
                            setShowMissingOnly={setShowMissingOnly}
                            selectedEntriesSize={selectedEntries.size}
                            handleSelectAll={handleSelectAll}
                            handleDeselectAll={handleDeselectAll}
                            getEntryDisplayName={getEntryDisplayName}
                            handleEntryExpand={handleEntryExpand}
                            handleEntrySelect={handleEntrySelect}
                            handleFilePathExpand={handleFilePathExpand}
                            settingsExpanded={settingsExpanded}
                            setSettingsExpanded={setSettingsExpanded}
                            setSettingsAutoOpened={setSettingsAutoOpened}
                        />
                    </Box>
                )}
                {/* Bottom Controls */}
                <div className={`bumpath-dimmable${isEmpty ? ' is-dim' : ''}`}>
                    <BumpathBottomControls
                        handleSelectSourceDir={handleSelectSourceDir}
                        prefixText={prefixText}
                        handlePrefixTextChange={handlePrefixTextChange}
                        handleApplyPrefix={handleApplyPrefix}
                        selectedEntriesSize={selectedEntries.size}
                        handleSelectOutputDir={handleSelectOutputDir}
                        isProcessing={isProcessing}
                        handleProcess={handleProcess}
                        handleOpenQuickRepath={openQuickWizard}
                        quickRepathDisabled={isProcessing || Object.keys(sourceBins || {}).length === 0}
                        scannedData={scannedData}
                        outputPath={outputPath}
                        statusMessage={shortStatus(error || success || (isProcessing ? 'Processing…' : isScanning ? 'Scanning…' : ''))}
                        statusKind={error ? 'error' : 'normal'}
                    />
                </div>
                {/* Collapsible Settings Panel */}
                <BumpathSettingsPanel
                    panelStyle={panelStyle}
                    settingsExpanded={settingsExpanded}
                    ignoreMissing={ignoreMissing}
                    setIgnoreMissing={setIgnoreMissing}
                    combineLinked={combineLinked}
                    setCombineLinked={setCombineLinked}
                    splitVfx={splitVfx}
                    setSplitVfx={setSplitVfx}
                    consolidateAssets={consolidateAssets}
                    setConsolidateAssets={setConsolidateAssets}
                    hideDataFolderBins={hideDataFolderBins}
                    setHideDataFolderBins={setHideDataFolderBins}
                    saveSettings={saveSettings}
                />
            </Box>

            <BumpathSettingsDialog
                settingsOpen={settingsOpen}
                setSettingsOpen={setSettingsOpen}
                hashesPath={hashesPath}
            />
            {outputConflictOpen && (
                <div className="dl-modal-backdrop" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) resolveOutputConflict(false);
                }}>
                    <div className="dl-modal" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="dl-modal__head">
                            <h2 className="dl-modal__title">Output folder is not empty</h2>
                        </div>
                        <div className="dl-modal__body">
                            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                                Bumpath will merge into this folder and replace files with matching paths. It will not delete unrelated files.
                            </p>
                            <div className="dl-code" style={{ marginTop: 12, wordBreak: 'break-all' }}>
                                {outputConflictPath}
                            </div>
                        </div>
                        <div className="dl-modal__foot">
                            <button type="button" className="dl-btn dl-btn--secondary" onClick={() => resolveOutputConflict(false)}>
                                Cancel
                            </button>
                            <button type="button" className="dl-btn dl-btn--primary" onClick={() => resolveOutputConflict(true)}>
                                Merge &amp; Replace
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <QuickRepathWizardModal
                open={quickRepathOpen}
                step={quickRepathStep}
                setStep={setQuickRepathStep}
                binOptions={quickBinOptions}
                selectedMainBin={quickMainBin}
                setSelectedMainBin={setQuickMainBin}
                quickPrefix={quickPrefix}
                setQuickPrefix={setQuickPrefix}
                quickOutputPath={quickOutputPath}
                setQuickOutputPath={setQuickOutputPath}
                ignoreMissing={ignoreMissing}
                setIgnoreMissing={setIgnoreMissing}
                combineLinked={combineLinked}
                setCombineLinked={setCombineLinked}
                onSelectOutputDir={handleQuickSelectOutputDir}
                onRunQuickRepath={handleRunQuickRepath}
                onClose={() => setQuickRepathOpen(false)}
                isRunning={isQuickRepathRunning}
            />
            <SourceAddModeModal
                open={sourceAddModeOpen}
                sourceDirLabel={lastAddedSourceDir}
                onQuick={openQuickWizard}
                onNormal={handleChooseNormalRepath}
                onClose={handleChooseNormalRepath}
            />
            <CelestiaTriggerButton
                showCelestiaGuide={showCelestiaGuide}
                setShowCelestiaGuide={setShowCelestiaGuide}
                settingsExpanded={settingsExpanded}
            />
            <CelestiaTutorialOverlays
                showCelestiaGuide={showCelestiaGuide}
                celestiaStepIndex={celestiaStepIndex}
                binListHighlightRect={binListHighlightRect}
                panelStyle={panelStyle}
                simulatedBinSelected={simulatedBinSelected}
                setSimulatedBinSelected={setSimulatedBinSelected}
            />
            {/* Celestia Guide */}
            {showCelestiaGuide && (
                <CelestiaGuide
                    id="bumpath-guide"
                    onStepChange={(stepIndex) => setCelestiaStepIndex(stepIndex)}
                    enableTopRightForSteps={[4, 5, 6]} // Steps 5, 6, and 7 (0-based indices 4, 5, 6)
                    steps={[
                        {
                            title: 'Source BINs List',
                            text: "After adding source directories, BIN files will appear in this list. Select your main BIN file - this is usually skin0.bin or the primary BIN file for your mod. Click the checkbox next to the BIN file you want to scan. The main BIN file typically contains references to all the other files in your mod.",
                            targetSelector: '[data-bumpath-bin-list]',
                            padding: 15,
                        },
                        {
                            title: 'Select All Entries',
                            text: "After scanning your BIN file, entries will appear in the right panel. Click 'Select All' to select all entries that need to be repathed. This ensures all file references in your mod are updated with the prefix, preventing broken file paths and ensuring your mod works correctly.",
                            targetSelector: '[data-bumpath-select-all]',
                            padding: 15,
                        },
                        {
                            title: 'Prefix',
                            text: "The prefix is REQUIRED. Pick something unique to your mod (e.g. 'sera_kda', 'mymod_v2') — all file paths will move to 'assets/<your_prefix>/path/to/file' instead of 'assets/path/to/file'. This prevents conflicts with the original game and with other mods. Avoid generic words like 'bum', 'mod', or 'custom' — they're used everywhere and will collide.",
                            targetSelector: '[data-bumpath-prefix]',
                            padding: 15,
                        },
                        {
                            title: 'Output Directory',
                            text: "This is where the repathed files will be saved. Select a folder where you want the processed files to be written. The output directory should be different from your source directories to avoid overwriting your original mod files. Typically, this would be your League of Legends mod folder or a staging directory.",
                            targetSelector: '[data-bumpath-output]',
                            padding: 15,
                        },
                        {
                            title: 'Process Button',
                            text: "Click this button to start the repathing process. Bumpath will scan the selected BIN files, apply the prefix to all file paths (moving them to assets/[prefix]/...), and write the modified files to the output directory. Make sure you have selected source directories, chosen your main BIN file, selected all entries, set a prefix, and chosen an output directory before processing.",
                            targetSelector: '[data-bumpath-process]',
                            padding: 15,
                        },
                        {
                            title: 'Settings',
                            text: "These settings control how Bumpath processes your files. 'Ignore Missing Files' should usually be ON - it prevents errors when some referenced files don't exist. 'Combine Linked BINs to Source BINs' should also typically be ON - it ensures all linked BIN files are properly combined with your source BIN. Most users should keep both of these enabled for the best results. The settings panel can be toggled open and closed using the gear icon button.",
                            targetSelector: '[data-bumpath-settings-panel]',
                            padding: 15,
                        },
                    ]}
                    onClose={() => {
                        setShowCelestiaGuide(false);
                    }}
                />
            )}
        </Box>
    );
}

export default Bumpath;
