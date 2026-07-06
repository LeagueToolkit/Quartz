import { useCallback, useEffect } from 'react';
import { useFileExplorer } from '@/components/explorer';
import type { BumpathApiCall } from './useBumpathCoreApi';
import type { ScannedData, SourceBins } from '../utils/types';

interface SourceDirAddedPayload {
    sourceDir: string;
    sourceBins: SourceBins | null;
}

interface UseBumpathSourceScanArgs {
    apiCall: BumpathApiCall;
    sourceDirs: string[];
    sourceBins: SourceBins;
    hashesPath: string;
    scanDebounceTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    setSourceDirs: (value: string[]) => void;
    setSourceFiles: (value: Record<string, unknown>) => void;
    setSourceBins: (value: SourceBins) => void;
    setScannedData: (value: ScannedData | null) => void;
    setSelectedEntries: (value: Set<string>) => void;
    setExpandedEntries: (value: Set<string>) => void;
    setAppliedPrefixes: (value: Map<string, string>) => void;
    setIsScanning: (value: boolean) => void;
    setError: (value: string | null) => void;
    setSuccess: (value: string | null) => void;
    onSourceDirAdded?: (payload: SourceDirAddedPayload) => void;
}

export default function useBumpathSourceScan({
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
    setAppliedPrefixes,
    setIsScanning,
    setError,
    setSuccess,
    onSourceDirAdded,
}: UseBumpathSourceScanArgs) {
    const pick = useFileExplorer();
    useEffect(() => {
        return () => {
            if (scanDebounceTimerRef.current) {
                clearTimeout(scanDebounceTimerRef.current);
            }
        };
    }, [scanDebounceTimerRef]);

    const runScanForSelectedBins = useCallback(async (binState: SourceBins) => {
        if (!hashesPath) return;

        const selectedBinsList = Object.values(binState || {}).filter((bin) => bin?.selected);
        if (selectedBinsList.length === 0) {
            setScannedData(null);
            setSelectedEntries(new Set());
            setExpandedEntries(new Set());
            setAppliedPrefixes(new Map());
            return;
        }

        setIsScanning(true);
        setError(null);
        setScannedData(null);

        const binSelections: Record<string, boolean> = {};
        Object.entries(binState || {}).forEach(([path, fileData]) => {
            binSelections[path] = !!fileData?.selected;
        });

        try {
            const result = await apiCall('scan', {
                hashesPath,
                folders: sourceDirs,
                binSelections,
            });

            if (result.success && result.data) {
                setScannedData(result.data);
                setAppliedPrefixes(new Map());
                setSuccess(`Scan completed: Found ${Object.keys(result.data.entries).length} entries`);
            } else {
                setError(result.error || 'Scan failed');
            }
        } catch (scanError) {
            const message = scanError instanceof Error ? scanError.message : String(scanError);
            setError('Scan failed: ' + message);
        } finally {
            setIsScanning(false);
        }
    }, [
        apiCall,
        hashesPath,
        sourceDirs,
        setAppliedPrefixes,
        setError,
        setExpandedEntries,
        setIsScanning,
        setScannedData,
        setSelectedEntries,
        setSuccess,
    ]);

    const addSourceDirByPath = useCallback(async (dirPath: string) => {
        if (!dirPath || sourceDirs.includes(dirPath)) {
            return { success: false, skipped: true };
        }

        const newDirs = [...sourceDirs, dirPath];
        setSourceDirs(newDirs);

        try {
            const response = await apiCall('add-source-dirs', { sourceDirs: newDirs });
            if (response.success) {
                setSourceFiles(response.source_files || {});
                setSourceBins(response.source_bins || {});
                setError(null);
                const binCount = response.source_bins ? Object.keys(response.source_bins).length : 0;
                setSuccess(`Added source directory and discovered ${binCount} BIN files`);
                if (typeof onSourceDirAdded === 'function') {
                    onSourceDirAdded({
                        sourceDir: dirPath,
                        sourceBins: response.source_bins || {},
                    });
                }
                return { success: true };
            }

            setError(response.error || 'Failed to discover BIN files');
            return { success: false, skipped: false };
        } catch {
            setError(null);
            setSuccess(`Added source directory: ${dirPath}`);
            if (typeof onSourceDirAdded === 'function') {
                onSourceDirAdded({
                    sourceDir: dirPath,
                    sourceBins: null,
                });
            }
            return { success: true };
        }
    }, [apiCall, onSourceDirAdded, setError, setSourceBins, setSourceDirs, setSourceFiles, setSuccess, sourceDirs]);

    const handleSelectSourceDir = useCallback(async () => {
        try {
            const result = await pick({ mode: 'directory' });
            if (typeof result === 'string') {
                await addSourceDirByPath(result);
            }
        } catch (selectError) {
            const message = selectError instanceof Error ? selectError.message : String(selectError);
            setError('Failed to select directory: ' + message);
        }
    }, [addSourceDirByPath, setError, pick]);

    const handleBinSelect = useCallback(async (unifyPath: string, selected: boolean) => {
        const newSelections: SourceBins = { ...(sourceBins || {}) };
        newSelections[unifyPath] = { ...newSelections[unifyPath], selected };
        setSourceBins(newSelections);

        const binSelections: Record<string, boolean> = {};
        Object.entries(newSelections).forEach(([path, fileData]) => {
            binSelections[path] = fileData.selected;
        });

        try {
            await apiCall('update-bin-selection', { binSelections });

            if (scanDebounceTimerRef.current) {
                clearTimeout(scanDebounceTimerRef.current);
            }
            scanDebounceTimerRef.current = setTimeout(() => {
                runScanForSelectedBins(newSelections);
            }, 220);
        } catch (selectionError) {
            console.error('Failed to update bin selection:', selectionError);
        }
    }, [apiCall, runScanForSelectedBins, scanDebounceTimerRef, setSourceBins, sourceBins]);

    return {
        handleSelectSourceDir,
        handleBinSelect,
        runScanForSelectedBins,
        addSourceDirByPath,
    };
}
