import { useCallback, useMemo } from 'react';

export default function useBumpathEntries({
  scannedData,
  showMissingOnly,
  setSelectedEntries,
  setExpandedEntries,
  setExpandedFilePaths
}) {
  const handleEntrySelect = useCallback((entryHash) => {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryHash)) {
        next.delete(entryHash);
      } else {
        next.add(entryHash);
      }
      return next;
    });
  }, [setSelectedEntries]);

  const handleEntryExpand = useCallback((entryHash) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryHash)) {
        next.delete(entryHash);
      } else {
        next.add(entryHash);
      }
      return next;
    });
  }, [setExpandedEntries]);

  const handleFilePathExpand = useCallback((filePath) => {
    setExpandedFilePaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, [setExpandedFilePaths]);

  const handleSelectAll = useCallback(() => {
    if (!scannedData) return;
    const allEntries = Object.keys(scannedData.entries).filter(
      (hash) => scannedData.entries[hash].prefix !== 'Uneditable'
    );
    setSelectedEntries(new Set(allEntries));
  }, [scannedData, setSelectedEntries]);

  const handleDeselectAll = useCallback(() => {
    setSelectedEntries(new Set());
  }, [setSelectedEntries]);

  const getEntryDisplayName = useCallback((entryHash, entryData) => {
    const truncateName = (str, maxLength = 60) => {
      if (!str) return '';
      if (str.length <= maxLength) return str;
      return str.substring(0, maxLength - 3) + '...';
    };

    const name = entryData.name || '';
    if (name && !name.startsWith('Entry_')) {
      return truncateName(name);
    }

    if (entryData.referenced_files && entryData.referenced_files.length > 0) {
      const unhashedName = entryData.referenced_files.find((file) =>
        !file.exists &&
        file.path &&
        !file.path.toLowerCase().endsWith('.tex')
      );
      if (unhashedName && unhashedName.path) {
        return truncateName(unhashedName.path);
      }

      const missingFile = entryData.referenced_files.find((file) => !file.exists && file.path);
      if (missingFile && missingFile.path) {
        return truncateName(missingFile.path);
      }
    }

    return truncateName(name || `Entry_${entryHash}` || 'Unknown Entry');
  }, []);

  const filteredEntries = useMemo(() => {
    if (!scannedData) return [];
    return Object.entries(scannedData.entries).filter(([_, data]) => {
      if (!showMissingOnly) return true;
      return data.referenced_files.some((file) => !file.exists);
    });
  }, [scannedData, showMissingOnly]);

  return {
    handleEntrySelect,
    handleEntryExpand,
    handleFilePathExpand,
    handleSelectAll,
    handleDeselectAll,
    getEntryDisplayName,
    filteredEntries
  };
}
