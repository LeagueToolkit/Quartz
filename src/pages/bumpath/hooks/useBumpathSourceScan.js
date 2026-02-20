import { useCallback, useEffect } from 'react';
import electronPrefs from '../../../utils/core/electronPrefs.js';

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
  onSourceDirAdded
}) {
  useEffect(() => {
    return () => {
      if (scanDebounceTimerRef.current) {
        clearTimeout(scanDebounceTimerRef.current);
      }
    };
  }, [scanDebounceTimerRef]);

  const runScanForSelectedBins = useCallback(async (binState) => {
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

    try {
      const result = await apiCall('scan', {
        hashesPath,
        ritobinPath: electronPrefs.obj.RitoBinPath || ''
      });

      if (result.success) {
        setScannedData(result.data);
        setAppliedPrefixes(new Map());
        setSuccess(`Scan completed: Found ${Object.keys(result.data.entries).length} entries`);
      } else {
        setError(result.error || 'Scan failed');
      }
    } catch (scanError) {
      setError('Scan failed: ' + scanError.message);
    } finally {
      setIsScanning(false);
    }
  }, [
    apiCall,
    hashesPath,
    setAppliedPrefixes,
    setError,
    setExpandedEntries,
    setIsScanning,
    setScannedData,
    setSelectedEntries,
    setSuccess
  ]);

  const addSourceDirByPath = useCallback(async (dirPath) => {
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
      const result = await electronPrefs.selectDirectory();
      if (result) {
        await addSourceDirByPath(result);
      }
    } catch (error) {
      setError('Failed to select directory: ' + error.message);
    }
  }, [addSourceDirByPath, setError]);

  const handleBinSelect = useCallback(async (unifyPath, selected) => {
    const newSelections = { ...(sourceBins || {}) };
    newSelections[unifyPath] = { ...newSelections[unifyPath], selected };
    setSourceBins(newSelections);

    const binSelections = {};
    Object.entries(newSelections).forEach(([path, data]) => {
      binSelections[path] = data.selected;
    });

    try {
      await apiCall('update-bin-selection', { binSelections });

      if (scanDebounceTimerRef.current) {
        clearTimeout(scanDebounceTimerRef.current);
      }
      scanDebounceTimerRef.current = setTimeout(() => {
        runScanForSelectedBins(newSelections);
      }, 220);
    } catch (error) {
      console.error('Failed to update bin selection:', error);
    }
  }, [apiCall, runScanForSelectedBins, scanDebounceTimerRef, setSourceBins, sourceBins]);

  return {
    handleSelectSourceDir,
    handleBinSelect,
    runScanForSelectedBins,
    addSourceDirByPath
  };
}
