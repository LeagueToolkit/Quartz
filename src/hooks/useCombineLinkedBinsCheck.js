import { useState, useRef, useCallback } from 'react';

const dismissedFiles = new Set();

export function useCombineLinkedBinsCheck() {
    const [combineModalState, setCombineModalState] = useState({
        open: false,
        filePath: null,
        linkCount: 0,
    });
    const resolveRef = useRef(null);

    const checkAndPromptCombine = useCallback(async (filePath) => {
        if (!filePath || dismissedFiles.has(filePath)) return;
        if (!window.require) return;

        const { ipcRenderer } = window.require('electron');
        let result;
        try {
            result = await ipcRenderer.invoke('bin:getLinkCount', { filePath });
        } catch {
            return; // don't block the user on IPC failure
        }

        if (!result?.success || result.linkCount <= 3) return;

        return new Promise(resolve => {
            resolveRef.current = resolve;
            setCombineModalState({ open: true, filePath, linkCount: result.linkCount });
        });
    }, []);

    const handleCombineYes = useCallback(async (dontAskAgain) => {
        const { filePath } = combineModalState;
        setCombineModalState({ open: false, filePath: null, linkCount: 0 });
        if (dontAskAgain && filePath) dismissedFiles.add(filePath);

        if (window.require && filePath) {
            const { ipcRenderer } = window.require('electron');
            try {
                await ipcRenderer.invoke('bin:combineLinkedBins', { filePath });
            } catch (e) {
                console.error('[useCombineLinkedBinsCheck] combine failed:', e);
            }
        }

        resolveRef.current?.();
        resolveRef.current = null;
    }, [combineModalState]);

    const handleCombineNo = useCallback((dontAskAgain) => {
        const { filePath } = combineModalState;
        setCombineModalState({ open: false, filePath: null, linkCount: 0 });
        if (dontAskAgain && filePath) dismissedFiles.add(filePath);

        resolveRef.current?.();
        resolveRef.current = null;
    }, [combineModalState]);

    return { checkAndPromptCombine, combineModalState, handleCombineYes, handleCombineNo };
}
