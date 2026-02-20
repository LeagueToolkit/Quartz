import { useCallback } from 'react';
import electronPrefs from '../../../utils/core/electronPrefs.js';

export default function useBumpathActions({
  apiCall,
  selectedEntries,
  prefixText,
  debouncedPrefixText,
  scannedData,
  appliedPrefixes,
  outputPath,
  ignoreMissing,
  combineLinked,
  addLog,
  fetchLogs,
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
  setSourceBins
}) {
  const handleApplyPrefix = useCallback(async () => {
    if (selectedEntries.size === 0) {
      setError('Please select at least one entry');
      return;
    }

    if (!prefixText.trim()) {
      setError('Please enter a prefix');
      return;
    }

    try {
      const result = await apiCall('apply-prefix', {
        entryHashes: Array.from(selectedEntries),
        prefix: debouncedPrefixText.trim()
      });

      if (!result.success) {
        setError(result.error || 'Failed to apply prefix');
        return;
      }

      if (scannedData) {
        const updatedData = {
          ...scannedData,
          entries: { ...scannedData.entries }
        };

        selectedEntries.forEach(entryHash => {
          if (updatedData.entries[entryHash]) {
            updatedData.entries[entryHash] = {
              ...updatedData.entries[entryHash],
              prefix: debouncedPrefixText.trim()
            };
          }
        });

        setScannedData(updatedData);
      } else if (result.data.entries && result.data.entry_names && result.data.entry_prefixes) {
        const convertedData = {
          entries: {},
          all_bins: {}
        };

        for (const [entryHash, entryData] of Object.entries(result.data.entries)) {
          if (entryHash === 'All_BINs') continue;

          const referenced_files = [];
          if (typeof entryData === 'object' && entryData !== null) {
            for (const [unify_file, fileData] of Object.entries(entryData)) {
              if (Array.isArray(fileData) && fileData.length === 2) {
                const [exists, path] = fileData;
                referenced_files.push({
                  path,
                  exists,
                  unify_file
                });
              }
            }
          }

          convertedData.entries[entryHash] = {
            name: result.data.entry_names[entryHash] || scannedData?.entries[entryHash]?.name || `Entry_${entryHash}`,
            type_name: scannedData?.entries[entryHash]?.type_name,
            prefix: result.data.entry_prefixes[entryHash] || scannedData?.entries[entryHash]?.prefix || 'bum',
            referenced_files: referenced_files.length > 0
              ? referenced_files
              : (scannedData?.entries[entryHash]?.referenced_files || [])
          };
        }

        setScannedData(convertedData);
      }

      const newAppliedPrefixes = new Map(appliedPrefixes);
      selectedEntries.forEach(entryHash => {
        newAppliedPrefixes.set(entryHash, debouncedPrefixText.trim());
      });
      setAppliedPrefixes(newAppliedPrefixes);

      setSuccess(`Applied prefix "${debouncedPrefixText}" to ${selectedEntries.size} entries`);
    } catch (error) {
      setError('Failed to apply prefix: ' + error.message);
    }
  }, [
    apiCall,
    appliedPrefixes,
    debouncedPrefixText,
    prefixText,
    scannedData,
    selectedEntries,
    setAppliedPrefixes,
    setError,
    setScannedData,
    setSuccess
  ]);

  const handleProcess = useCallback(async () => {
    if (!scannedData) {
      setError('Please scan first');
      addLog('Error: Please scan first');
      return;
    }

    if (!outputPath) {
      setError('Please select an output directory');
      addLog('Error: Please select an output directory');
      return;
    }

    setIsProcessing(true);
    setError(null);
    addLog('Starting bumpath process...');
    addLog(`Output directory: ${outputPath}`);
    addLog(`Combine linked: ${combineLinked}`);
    addLog(`Ignore missing: ${ignoreMissing}`);

    try {
      const result = await apiCall('process', {
        outputPath,
        ignoreMissing,
        combineLinked
      });

      if (result.success) {
        const message = `Processing completed: ${result.total_files || result.processedFiles || 0} files processed`;
        setSuccess(message);
        addLog(message);
        addLog(`Output: ${result.output_dir || outputPath}`);

        if (result.warnings && result.warnings.length > 0) {
          result.warnings.forEach((warning) => addLog(`Warning: ${warning}`));
        }

        await fetchLogs();

        addLog('Clearing state after successful processing...');
        setScannedData(null);
        setSelectedEntries(new Set());
        setExpandedEntries(new Set());
        setAppliedPrefixes(new Map());
      } else {
        const errorMsg = result.error || 'Processing failed';
        setError(errorMsg);
        addLog(`Error: ${errorMsg}`);

        if (errorMsg.includes('Malformed') || errorMsg.includes('path') || errorMsg.includes('skins_skin')) {
          addLog('Tip: This may be caused by Windows path length limits. Try shorter folder names or move files closer to the drive root.');
        }
      }
    } catch (error) {
      const errorMsg = 'Processing failed: ' + error.message;
      setError(errorMsg);
      addLog(`Error: ${errorMsg}`);

      if (error.message.includes('path') || error.message.includes('ENAMETOOLONG')) {
        addLog('Tip: Windows path length limit may be causing this. Try shorter folder names or move files closer to root.');
      }
    } finally {
      setIsProcessing(false);
    }
  }, [
    addLog,
    apiCall,
    combineLinked,
    fetchLogs,
    ignoreMissing,
    outputPath,
    scannedData,
    setAppliedPrefixes,
    setError,
    setExpandedEntries,
    setIsProcessing,
    setScannedData,
    setSelectedEntries,
    setSuccess
  ]);

  const handleSelectOutputDir = useCallback(async () => {
    try {
      const result = await electronPrefs.selectDirectory();
      if (result) {
        setOutputPath(result);
      }
    } catch (error) {
      setError('Failed to select output directory: ' + error.message);
    }
  }, [setError, setOutputPath]);

  const handleReset = useCallback(async () => {
    try {
      await apiCall('reset');
      setSourceDirs([]);
      setSourceFiles({});
      setSourceBins({});
      setScannedData(null);
      setSelectedEntries(new Set());
      setExpandedEntries(new Set());
      setError(null);
      setSuccess(null);
    } catch (error) {
      setError('Failed to reset: ' + error.message);
    }
  }, [
    apiCall,
    setError,
    setExpandedEntries,
    setScannedData,
    setSelectedEntries,
    setSourceBins,
    setSourceDirs,
    setSourceFiles,
    setSuccess
  ]);

  return {
    handleApplyPrefix,
    handleProcess,
    handleSelectOutputDir,
    handleReset
  };
}
