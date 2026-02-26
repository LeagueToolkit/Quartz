import { useState, useCallback } from 'react';

export function useWadScan() {
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scannedPath, setScannedPath] = useState(null);
  const [total, setTotal] = useState(0);

  const scan = useCallback(async (gamePath) => {
    if (!gamePath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.wad.scanAll({ gamePath });
      if (result.error) throw new Error(result.error);
      setGroups(result.groups);
      setScannedPath(gamePath);
      setTotal(result.total || 0);
    } catch (e) {
      setError(e.message);
      setGroups(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { groups, loading, error, scannedPath, total, scan };
}
