import { useState, useCallback, useEffect, useMemo } from 'react';
import { detectHashedContent } from '../../../components/modals/RitobinWarningModal';
import { ToPyWithPath } from '../../../utils/io/fileOperations.js';
import { loadFileWithBackup, createBackup } from '../../../utils/io/backupManager.js';
import { parseVfxEmitters } from '../../../utils/vfx/vfxEmitterParser.js';
import { openAssetPreview } from '../../../utils/assets/assetPreviewEvent.js';

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
    } = options;
    const [targetPath, setTargetPath] = useState('This will show target bin');
    const [donorPath, setDonorPath] = useState('This will show donor bin');
    const [targetPyContent, setTargetPyContent] = useState('');
    const [donorPyContent, setDonorPyContent] = useState('');
    const [targetSystems, setTargetSystems] = useState({});
    const [donorSystems, setDonorSystems] = useState({});
    const [showRitoBinErrorDialog, setShowRitoBinErrorDialog] = useState(false);
    const [showBackupViewer, setShowBackupViewer] = useState(false);
    const hasResourceResolver = useMemo(
        () => /\bResourceResolver\s*\{/m.test(targetPyContent || ''),
        [targetPyContent]
    );
    const hasSkinCharacterData = useMemo(
        () => /=\s*SkinCharacterDataProperties\s*\{/m.test(targetPyContent || ''),
        [targetPyContent]
    );

    const processTargetBin = useCallback(async (filePath) => {
        if (!filePath) return;
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
            if (fs?.existsSync(pyFilePath)) {
                console.log(`[useVfxFile] .py exists. Loading from disk.`);
                setProcessingText('Loading existing .py file...');
                pyContent = loadFileWithBackup(pyFilePath, 'port');
                await new Promise(resolve => setTimeout(resolve, 500));
            } else if (!isPy) {
                console.log(`[useVfxFile] .py NOT found. Converting .bin via ToPyWithPath.`);
                setProcessingText('Converting .bin to .py...');
                pyContent = await ToPyWithPath(filePath);
                if (fs?.existsSync(pyFilePath)) {
                    console.log(`[useVfxFile] Conversion successful, created backup for: ${pyFilePath}`);
                    createBackup(pyFilePath, pyContent, 'port');
                }
            } else {
                throw new Error('Target .py file does not exist');
            }

            console.log(`[useVfxFile] pyContent loaded. Length: ${pyContent?.length || 0} characters.`);
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
            setUndoHistory([]);
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
                pyContent = loadFileWithBackup(pyFilePath, 'port');
                await new Promise(resolve => setTimeout(resolve, 500));
            } else if (!isPy) {
                console.log(`[useVfxFile] .py NOT found. Converting .bin via ToPyWithPath.`);
                setProcessingText('Converting .bin to .py...');
                pyContent = await ToPyWithPath(filePath);
                if (fs?.existsSync(pyFilePath)) {
                    console.log(`[useVfxFile] Conversion successful, created backup for: ${pyFilePath}`);
                    createBackup(pyFilePath, pyContent, 'port');
                }
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
            try {
                await electronPrefs.initPromise;
                const autoLoadEnabled = await electronPrefs.get('AutoLoadEnabled');
                if (autoLoadEnabled === false) return;
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
    }, [autoReloadDonor, enableDonor, processTargetBin, processDonorBin]); // eslint-disable-line

    const performBackupRestore = useCallback(() => {
        try {
            setStatusMessage('Backup restored - reloading file...');
            const pyFilePath = targetPath.replace('.bin', '.py');
            if (fs?.existsSync(pyFilePath)) {
                const restoredContent = fs.readFileSync(pyFilePath, 'utf8');
                setSelectedTargetSystem(null);
                setDeletedEmitters(new Map());
                setUndoHistory([]);
                setTargetPyContent(restoredContent);
                setTargetSystems(parseVfxEmitters(restoredContent) || {});
                setFileSaved(true);
            }
        } catch (e) { }
    }, [targetPath, setSelectedTargetSystem, setDeletedEmitters, setUndoHistory, setFileSaved, setStatusMessage]);

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
        performBackupRestore
    };
}
