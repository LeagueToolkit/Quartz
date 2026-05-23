import { useCallback, useRef, useState } from 'react';
import { prepareModelInspectAssets } from '../services/modelInspectService.js';

export default function useModelInspect() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [manifest, setManifest] = useState(null);
  const inspectRequestRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setLoading(false);
    setProgressMessage('');
    setError('');
    inspectRequestRef.current = null;
  }, []);

  const inspect = useCallback(async ({
    championName,
    skinId,
    chromaId = null,
    chromaOptions = [],
    skinName,
    leaguePath,
    hashPath,
    isTftMode = false,
    wadTheme = null,
    wadTier = null,
  }) => {
    setOpen(true);
    setLoading(true);
    setError('');
    setManifest(null);
    setProgressMessage('Starting model inspect...');
    inspectRequestRef.current = {
      championName,
      skinId,
      skinName,
      leaguePath,
      hashPath,
      isTftMode,
      wadTheme,
      wadTier,
      chromaOptions: Array.isArray(chromaOptions) ? chromaOptions : [],
    };

    try {
      const selectedManifest = await prepareModelInspectAssets({
        championName,
        skinId,
        chromaId,
        skinName,
        leaguePath,
        hashPath,
        isTftMode,
        wadTheme,
        wadTier,
        onProgress: (message) => setProgressMessage(message),
      });
      setManifest({
        ...selectedManifest,
        chromaOptions: inspectRequestRef.current?.chromaOptions || [],
        selectedChromaId: chromaId,
      });
    } catch (err) {
      setError(err.message || 'Failed to prepare model inspect assets');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectChroma = useCallback(async (chromaId) => {
    const req = inspectRequestRef.current;
    if (!req) return;
    setLoading(true);
    setError('');
    setProgressMessage('Switching chroma...');
    try {
      const result = await prepareModelInspectAssets({
        championName: req.championName,
        skinId: req.skinId,
        chromaId,
        skinName: req.skinName,
        leaguePath: req.leaguePath,
        hashPath: req.hashPath,
        isTftMode: req.isTftMode,
        wadTheme: req.wadTheme,
        wadTier: req.wadTier,
        onProgress: (message) => setProgressMessage(message),
      });
      setManifest({
        ...result,
        chromaOptions: req.chromaOptions || [],
        selectedChromaId: chromaId,
      });
    } catch (err) {
      setError(err.message || 'Failed to switch chroma');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    open,
    loading,
    error,
    progressMessage,
    manifest,
    inspect,
    selectChroma,
    close,
  };
}
