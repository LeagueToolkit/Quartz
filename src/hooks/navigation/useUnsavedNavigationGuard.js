import { useCallback, useEffect, useRef, useState } from 'react';

export default function useUnsavedNavigationGuard({
  fileSaved,
  setFileSaved,
  onSave,
  navigate,
}) {
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const pendingNavigationPathRef = useRef(null);

  useEffect(() => {
    try { window.__DL_unsavedBin = !fileSaved; } catch { }
  }, [fileSaved]);

  useEffect(() => {
    const handleNavigationBlock = (e) => {
      if (!fileSaved && !window.__DL_forceClose) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();

        const targetPath = e.detail?.path;
        if (targetPath) {
          pendingNavigationPathRef.current = targetPath;
          setShowUnsavedDialog(true);
        }
      }
    };

    window.addEventListener('navigation-blocked', handleNavigationBlock, true);
    return () => window.removeEventListener('navigation-blocked', handleNavigationBlock, true);
  }, [fileSaved]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      try {
        const forceClose = Boolean(window.__DL_forceClose);
        if (!fileSaved && !forceClose) {
          e.preventDefault();
          e.returnValue = '';
        }
      } catch {
        if (!fileSaved) {
          e.preventDefault();
          e.returnValue = '';
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [fileSaved]);

  const handleUnsavedSave = useCallback(async () => {
    const targetPath = pendingNavigationPathRef.current;
    setShowUnsavedDialog(false);
    pendingNavigationPathRef.current = null;

    try {
      await onSave();
      window.__DL_forceClose = true;
      window.__DL_unsavedBin = false;

      if (targetPath) {
        setTimeout(() => {
          navigate(targetPath);
          setTimeout(() => {
            window.__DL_forceClose = false;
          }, 100);
        }, 50);
      }
    } catch (error) {
      console.error('Error saving before navigation:', error);
    }
  }, [navigate, onSave]);

  const handleUnsavedDiscard = useCallback(() => {
    const targetPath = pendingNavigationPathRef.current;
    setShowUnsavedDialog(false);
    pendingNavigationPathRef.current = null;

    setFileSaved(true);
    window.__DL_forceClose = true;
    window.__DL_unsavedBin = false;

    if (targetPath) {
      setTimeout(() => {
        navigate(targetPath);
        setTimeout(() => {
          window.__DL_forceClose = false;
        }, 100);
      }, 50);
    }
  }, [navigate, setFileSaved]);

  const handleUnsavedCancel = useCallback(() => {
    setShowUnsavedDialog(false);
    pendingNavigationPathRef.current = null;
  }, []);

  return {
    showUnsavedDialog,
    setShowUnsavedDialog,
    handleUnsavedSave,
    handleUnsavedDiscard,
    handleUnsavedCancel,
  };
}
