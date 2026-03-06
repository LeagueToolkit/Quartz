import { useState, useCallback, useEffect, useMemo } from 'react';
import { detectHashedContent } from '../../../components/modals/RitobinWarningModal';
import { ToPyWithPath } from '../../../utils/io/fileOperations.js';
import { createBackup } from '../../../utils/io/backupManager.js';
import { parseVfxEmitters } from '../../../utils/vfx/vfxEmitterParser.js';
import { openAssetPreview } from '../../../utils/assets/assetPreviewEvent.js';
import { emitJadeMissingModal, isJadeMissingResult } from '../../../utils/interop/jadeInterop.js';
import { useCombineLinkedBinsCheck } from '../../../hooks/useCombineLinkedBinsCheck.js';

const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

/**
 * useVfxFile — logic for loading and saving target/donor bin files.
 */
export default function useVfxFile(
    setIsProcessing,
    setProcessingText,
    setStatusMessage,
    setFileSaved,
    setRitobinWarningContent,
    setShowRitobinWarning,
    setUndoHistory,
    setDeletedEmitters,
    setSelectedTargetSystem,
    setCollapsedTargetSystems,
    setCollapsedDonorSystems,
    electronPrefs,
    options = {}
) {
    const {
        targetMode = 'port-target',
        donorMode = 'port-donor',
        enableDonor = true,
        autoReloadDonor = true,
        onExternalOverwriteRef = null,
    } = options;
    const [targetPath, setTargetPath] = useState('This will show target bin');
    const [donorPath, setDonorPath] = useState('This will show donor bin');
    const [targetPyContent, setTargetPyContent] = useState('');
    const [donorPyContent, setDonorPyContent] = useState('');
    const [targetSystems, setTargetSystems] = useState({});
    const [donorSystems, setDonorSystems] = useState({});
    const [showRitoBinErrorDialog, setShowRitoBinErrorDialog] = useState(false);
    const [showBackupViewer, setShowBackupViewer] = useState(false);
    const [externalChangeModal, setExternalChangeModal] = useState({
        open: false,
        handoff: null,
        localContent: '',
        diskContent: '',
    });
    const { checkAndPromptCombine, combineModalState, handleCombineYes, handleCombineNo } = useCombineLinkedBinsCheck();
    const hasResourceResolver = useMemo(
        () => /\bResourceResolver\s*\{/m.test(targetPyContent || ''),
        [targetPyContent]
    );
    const hasSkinCharacterData = useMemo(
        () => /=\s*SkinCharacterDataProperties\s*\{/m.test(targetPyContent || ''),
        [targetPyContent]
    );

    const processTargetBin = useCallback(async (filePath, options = {}) => {
        if (!filePath) return;
        const { skipBackup = false } = options;
        const preserveUndo = options?.preserveUndo === true;
        const forceRefreshFromBin = options?.forceRefreshFromBin === true;
        try {
            console.log(`[useVfxFile] processTargetBin: Starting for ${filePath}`);
            setIsProcessing(true);
            setTargetPath(filePath);
            setStatusMessage('Opening target file...');
            setProcessingText('Loading file...');

            const binDir = path.dirname(filePath);
            const isPy = filePath.toLowerCase().endsWith('.py');
            const baseName = isPy ? path.basename(filePath, '.py') : path.basename(filePath, '.bin');
            const pyFilePath = isPy ? filePath : path.join(binDir, `${baseName}.py`);

            console.log(`[useVfxFile] Opening ${isPy ? '.py' : '.bin'} file. Associated .py: ${pyFilePath}`);

            let pyContent;
            if (forceRefreshFromBin && !isPy) {
                console.log(`[useVfxFile] forceRefreshFromBin enabled. Regenerating .py from .bin.`);
                setProcessingText('Refreshing from .bin...');
                pyContent = await ToPyWithPath(filePath);
            } else if (fs?.existsSync(pyFilePath)) {
                console.log(`[useVfxFile] .py exists. Loading from disk.`);
                setProcessingText('Loading existing .py file...');
                pyContent = fs.readFileSync(pyFilePath, 'utf8');
                await new Promise(resolve => setTimeout(resolve, 500));
            } else if (!isPy) {
                console.log(`[useVfxFile] .py NOT found. Converting .bin via ToPyWithPath.`);
                await checkAndPromptCombine(filePath);
                setProcessingText('Converting .bin to .py...');
                pyContent = await ToPyWithPath(filePath);
            } else {
                throw new Error('Target .py file does not exist');
            }

            console.log(`[useVfxFile] pyContent loaded. Length: ${pyContent?.length || 0} characters.`);
            if (!skipBackup && fs?.existsSync(pyFilePath)) {
                console.log(`[useVfxFile] Creating target backup at parse time: ${pyFilePath}`);
                createBackup(pyFilePath, pyContent, 'port');
            }
            setTargetPyContent(pyContent);
            setFileSaved(true);

            const isHashed = detectHashedContent(pyContent);
            if (isHashed) {
                console.log(`[useVfxFile] Hashed content detected in target.`);
                setRitobinWarningContent(pyContent);
                setShowRitobinWarning(true);
                setStatusMessage('Warning: File appears to have hashed content');
            } else {
                setRitobinWarningContent(null);
            }

            console.log(`[useVfxFile] Parsing VFX emitters...`);
            const systems = parseVfxEmitters(pyContent) || {};
            console.log(`[useVfxFile] Parsing complete. Found ${Object.keys(systems || {}).length} systems.`);
            setTargetSystems(systems);

            const expandOnLoad = await electronPrefs.get('ExpandSystemsOnLoad');
            if (!expandOnLoad) {
                setCollapsedTargetSystems(prev => new Set([...prev, ...Object.keys(systems)]));
            }

            setStatusMessage(`Target bin loaded: ${Object.keys(systems).length} systems found`);
            setDeletedEmitters(new Map());
            if (!preserveUndo) {
                setUndoHistory([]);
            }
            setSelectedTargetSystem(null);

            try {
                await electronPrefs.set('SharedLastBinPath', filePath);
            } catch (error) { }

        } catch (error) {
            console.error('[useVfxFile] Error opening target bin:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsProcessing(false);
            setProcessingText('');
        }
    }, [setIsProcessing, setStatusMessage, setProcessingText, setFileSaved, setRitobinWarningContent, setShowRitobinWarning, setDeletedEmitters, setUndoHistory, setSelectedTargetSystem, setCollapsedTargetSystems, electronPrefs]);

    const getDiskContentForBin = useCallback(async (binFilePath) => {
        try {
            if (!binFilePath || !fs) return '';
            if (binFilePath.toLowerCase().endsWith('.bin')) {
                await ToPyWithPath(binFilePath);
            }
            const pyPath = binFilePath.replace(/\.bin$/i, '.py');
            if (fs.existsSync(pyPath)) {
                return fs.readFileSync(pyPath, 'utf8');
            }
            return '';
        } catch {
            return '';
        }
    }, []);

    useEffect(() => {
        const openFromHandoff = async (handoff) => {
            if (!handoff || !handoff.bin_path) return;
            const mode = String(handoff.mode || 'paint').toLowerCase();
            const action = String(handoff.action || 'open-bin').toLowerCase();
            if (mode !== 'port') return;
            if (!handoff.bin_path.toLowerCase().endsWith('.bin')) return;

            const isReload = action === 'reload-bin';
            const isSameFile = targetPath && String(targetPath).toLowerCase() === String(handoff.bin_path).toLowerCase();
            const hasUnsaved = Boolean(window.__DL_unsavedBin);
            if (isReload && isSameFile && hasUnsaved) {
                setExternalChangeModal({
                    open: true,
                    handoff,
                    localContent: targetPyContent || '',
                    diskContent: await getDiskContentForBin(handoff.bin_path),
                });
                return;
            }

            await processTargetBin(handoff.bin_path, {
                preserveUndo: action === 'reload-bin',
                forceRefreshFromBin: isReload,
            });
            if (window.__QUARTZ_PENDING_HANDOFF === handoff) {
                window.__QUARTZ_PENDING_HANDOFF = null;
            }
        };

        const handleInterop = (event) => {
            openFromHandoff(event?.detail || {});
        };

        window.addEventListener('quartz-interop-handoff', handleInterop);
        openFromHandoff(window.__QUARTZ_PENDING_HANDOFF);
        return () => window.removeEventListener('quartz-interop-handoff', handleInterop);
    }, [getDiskContentForBin, processTargetBin, targetPath, targetPyContent]);

    const processDonorBin = useCallback(async (filePath) => {
        if (!filePath) return;
        try {
            console.log(`[useVfxFile] processDonorBin: Starting for ${filePath}`);
            setIsProcessing(true);
            setDonorPath(filePath);
            setStatusMessage('Opening donor bin...');
            setProcessingText('Loading file...');

            const binDir = path.dirname(filePath);
            const isPy = filePath.toLowerCase().endsWith('.py');
            const baseName = isPy ? path.basename(filePath, '.py') : path.basename(filePath, '.bin');
            const pyFilePath = isPy ? filePath : path.join(binDir, `${baseName}.py`);

            console.log(`[useVfxFile] Opening ${isPy ? '.py' : '.bin'} file. Associated .py: ${pyFilePath}`);

            let pyContent;
            if (fs?.existsSync(pyFilePath)) {
                console.log(`[useVfxFile] .py exists. Loading from disk.`);
                setProcessingText('Loading existing .py file...');
                pyContent = fs.readFileSync(pyFilePath, 'utf8');
                await new Promise(resolve => setTimeout(resolve, 500));
            } else if (!isPy) {
                console.log(`[useVfxFile] .py NOT found. Converting .bin via ToPyWithPath.`);
                await checkAndPromptCombine(filePath);
                setProcessingText('Converting .bin to .py...');
                pyContent = await ToPyWithPath(filePath);
            } else {
                throw new Error('Donor .py file does not exist');
            }

            console.log(`[useVfxFile] pyContent loaded. Length: ${pyContent?.length || 0} characters.`);
            setDonorPyContent(pyContent);
            const isHashed = detectHashedContent(pyContent);
            if (isHashed) {
                console.log(`[useVfxFile] Hashed content detected in donor.`);
                setRitobinWarningContent(pyContent);
                setShowRitobinWarning(true);
                setStatusMessage('Warning: Donor file has hashed content');
            }

            console.log(`[useVfxFile] Parsing VFX emitters...`);
            const systems = parseVfxEmitters(pyContent) || {};
            console.log(`[useVfxFile] Parsing complete. Found ${Object.keys(systems || {}).length} systems.`);
            setDonorSystems(systems);

            const expandOnLoad = await electronPrefs.get('ExpandSystemsOnLoad');
            if (!expandOnLoad) {
                setCollapsedDonorSystems(prev => new Set([...prev, ...Object.keys(systems)]));
            }

            setStatusMessage(`Donor bin loaded: ${Object.keys(systems).length} systems found`);
            try {
                await electronPrefs.set('PortLastDonorBinPath', filePath);
            } catch (error) { }

        } catch (error) {
            console.error('[useVfxFile] Error opening donor bin:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsProcessing(false);
            setProcessingText('');
        }
    }, [setIsProcessing, setStatusMessage, setProcessingText, setRitobinWarningContent, setShowRitobinWarning, setCollapsedDonorSystems, electronPrefs]);

    const handleOpenTargetBin = useCallback(async () => {
        console.log(`[useVfxFile] handleOpenTargetBin triggered`);
        let binPath = targetPath !== 'This will show target bin' ? targetPath : undefined;
        if (!binPath) {
            try { binPath = await electronPrefs.get('SharedLastBinPath'); } catch (e) { console.error(e); }
        }
        const useNativeFileBrowser = await electronPrefs.get('UseNativeFileBrowser');
        if (useNativeFileBrowser) {
            try {
                const { ipcRenderer } = window.require('electron');
                const result = await ipcRenderer.invoke('dialog:openFile', {
                    title: 'Select Target .bin file',
                    defaultPath: binPath ? path.dirname(binPath) : undefined,
                    filters: [
                        { name: 'Bin Files', extensions: ['bin'] },
                        { name: 'All Files', extensions: ['*'] }
                    ],
                    properties: ['openFile']
                });
                if (result && !result.canceled && result.filePaths.length > 0) {
                    processTargetBin(result.filePaths[0]);
                }
            } catch (e) { console.error('Error opening native file dialog:', e); }
        } else {
            openAssetPreview(binPath, null, targetMode);
        }
    }, [electronPrefs, processTargetBin, targetPath, targetMode]);

    const handleOpenDonorBin = useCallback(async () => {
        if (!enableDonor) return;
        console.log(`[useVfxFile] handleOpenDonorBin triggered`);
        let binPath = donorPath !== 'This will show donor bin' ? donorPath : undefined;
        if (!binPath) {
            try { binPath = await electronPrefs.get('PortLastDonorBinPath'); } catch (e) { console.error(e); }
        }
        const useNativeFileBrowser = await electronPrefs.get('UseNativeFileBrowser');
        if (useNativeFileBrowser) {
            try {
                const { ipcRenderer } = window.require('electron');
                const result = await ipcRenderer.invoke('dialog:openFile', {
                    title: 'Select Donor .bin file',
                    defaultPath: binPath ? path.dirname(binPath) : undefined,
                    filters: [
                        { name: 'Bin Files', extensions: ['bin'] },
                        { name: 'All Files', extensions: ['*'] }
                    ],
                    properties: ['openFile']
                });
                if (result && !result.canceled && result.filePaths.length > 0) {
                    processDonorBin(result.filePaths[0]);
                }
            } catch (e) { console.error('Error opening native file dialog:', e); }
        } else {
            openAssetPreview(binPath, null, donorMode);
        }
    }, [enableDonor, electronPrefs, processDonorBin, donorPath, donorMode]);

    // Listen for file selection from the custom asset-preview explorer
    useEffect(() => {
        const handleAssetSelected = (e) => {
            const { path: filePath, mode } = e.detail || {};
            if (!filePath) return;
            if (mode === targetMode) {
                processTargetBin(filePath);
            } else if (enableDonor && mode === donorMode) {
                processDonorBin(filePath);
            }
        };
        window.addEventListener('asset-preview-selected', handleAssetSelected);
        return () => window.removeEventListener('asset-preview-selected', handleAssetSelected);
    }, [processTargetBin, processDonorBin, targetMode, donorMode, enableDonor]);

    // Auto-reload last opened bins on mount
    useEffect(() => {
        const autoReloadLastBins = async () => {
            // Match legacy behavior: only auto-load when nothing is already loaded.
            if (targetPath !== 'This will show target bin') return;

            try {
                await electronPrefs.initPromise;
                const autoLoadRaw = await electronPrefs.get('AutoLoadEnabled');
                // Only explicit true enables auto-load (supports older serialized values).
                const autoLoadEnabled = autoLoadRaw === true || autoLoadRaw === 'true' || autoLoadRaw === 1;
                if (!autoLoadEnabled) return;
            } catch { }

            try {
                await electronPrefs.initPromise;
                const lastTargetPath = await electronPrefs.get('SharedLastBinPath');
                const lastDonorPath = autoReloadDonor && enableDonor
                    ? await electronPrefs.get('PortLastDonorBinPath')
                    : null;

                if (lastTargetPath && fs?.existsSync(lastTargetPath)) {
                    await processTargetBin(lastTargetPath);
                } else if (lastTargetPath) {
                    await electronPrefs.set('SharedLastBinPath', '');
                }

                if (enableDonor && lastDonorPath && fs?.existsSync(lastDonorPath)) {
                    await processDonorBin(lastDonorPath);
                } else if (enableDonor && lastDonorPath) {
                    await electronPrefs.set('PortLastDonorBinPath', '');
                }
            } catch (error) {
                console.error('[useVfxFile] Error auto-reloading bins:', error);
            }
        };

        const timer = setTimeout(autoReloadLastBins, 100);
        return () => clearTimeout(timer);
    }, []); // eslint-disable-line

    const performBackupRestore = useCallback(async (restoreMeta = null) => {
        try {
            console.log('[useVfxFile] performBackupRestore called, targetPath:', targetPath, 'restoreMeta:', !!restoreMeta);
            setStatusMessage('Backup restored - reopening target file...');
            if (!targetPath || targetPath === 'This will show target bin') {
                console.warn('[useVfxFile] performBackupRestore: no valid targetPath, aborting');
                return;
            }

            const pyFilePath = /\.py$/i.test(targetPath)
                ? targetPath
                : targetPath.replace(/\.bin$/i, '.py');
            if (!pyFilePath) return;

            const restoredContent = (restoreMeta && typeof restoreMeta.content === 'string')
                ? restoreMeta.content
                : (fs?.existsSync(pyFilePath) ? fs.readFileSync(pyFilePath, 'utf8') : null);

            if (!restoredContent) {
                setStatusMessage('Error restoring backup: restored content is empty');
                return;
            }

            if (fs) {
                fs.writeFileSync(pyFilePath, restoredContent, 'utf8');
            }
            console.log('[useVfxFile] performBackupRestore: .py written, calling processTargetBin...');
            // Reuse the exact same load/parse pipeline as reopening target bin,
            // while skipping backup creation to avoid backup-on-restore loops.
            await processTargetBin(targetPath, { skipBackup: true });
            // Restoring changes the .py on disk; keep Save enabled so user can write back to .bin.
            setFileSaved(false);
            setStatusMessage('Backup restored and target reloaded - click Save to apply to .bin');
        } catch (error) {
            console.error('[useVfxFile] Error restoring backup:', error);
            setStatusMessage(`Error restoring backup: ${error.message}`);
        }
    }, [targetPath, setStatusMessage, processTargetBin, setFileSaved]);

    const handleOpenInJade = useCallback(async () => {
        if (targetPath === 'This will show target bin') {
            setStatusMessage('No target bin is currently loaded');
            return;
        }

        if (!window.require) {
            setStatusMessage('Open in Jade is only available in the desktop app');
            return;
        }

        try {
            const { ipcRenderer } = window.require('electron');
            window.__DL_openInJadeHandled = true;
            const result = await ipcRenderer.invoke('interop:sendToJade', {
                binPath: targetPath,
                sourceMode: 'port',
            });
            if (isJadeMissingResult(result)) {
                emitJadeMissingModal(result?.warning || result?.error || '');
            }

            if (result?.success) {
                setStatusMessage(result?.warning || 'Sent target bin to Jade');
            } else {
                setStatusMessage(result?.error || 'Failed to open Jade');
            }
        } catch (error) {
            setStatusMessage(`Failed to open Jade: ${error.message || error}`);
        }
    }, [targetPath, setStatusMessage]);

    const handleExternalConflictKeepLocal = useCallback(() => {
        setExternalChangeModal({ open: false, handoff: null, localContent: '', diskContent: '' });
        setStatusMessage('Kept local unsaved changes');
    }, [setStatusMessage]);

    const handleExternalConflictReload = useCallback(async () => {
        const handoff = externalChangeModal.handoff;
        setExternalChangeModal({ open: false, handoff: null, localContent: '', diskContent: '' });
        if (handoff?.bin_path) {
            await processTargetBin(handoff.bin_path, { preserveUndo: true, forceRefreshFromBin: true });
        }
    }, [externalChangeModal.handoff, processTargetBin]);

    const handleExternalConflictOverwrite = useCallback(async () => {
        setExternalChangeModal({ open: false, handoff: null, localContent: '', diskContent: '' });
        try {
            if (onExternalOverwriteRef?.current && typeof onExternalOverwriteRef.current === 'function') {
                await onExternalOverwriteRef.current();
                return;
            }
            setStatusMessage('Overwrite is unavailable right now');
        } catch (error) {
            setStatusMessage(`Overwrite failed: ${error?.message || error}`);
        }
    }, [onExternalOverwriteRef, setStatusMessage]);

    return {
        targetPath, setTargetPath,
        donorPath, setDonorPath,
        targetPyContent, setTargetPyContent,
        donorPyContent, setDonorPyContent,
        targetSystems, setTargetSystems,
        donorSystems, setDonorSystems,
        hasResourceResolver,
        hasSkinCharacterData,
        showRitoBinErrorDialog, setShowRitoBinErrorDialog,
        showBackupViewer, setShowBackupViewer,
        processTargetBin,
        processDonorBin,
        handleOpenTargetBin,
        handleOpenDonorBin,
        handleOpenInJade,
        externalChangeModal,
        handleExternalConflictKeepLocal,
        handleExternalConflictReload,
        handleExternalConflictOverwrite,
        performBackupRestore,
        combineModalState,
        handleCombineYes,
        handleCombineNo,
    };
}
