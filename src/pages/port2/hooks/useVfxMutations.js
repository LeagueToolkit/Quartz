import { useCallback } from 'react';
import { extractVFXSystem } from '../../../utils/vfx/vfxSystemParser.js';
import {
    insertVFXSystemIntoFile,
    generateUniqueSystemName,
    insertVFXSystemWithPreservedNames
} from '../../../utils/vfx/vfxInsertSystem.js';
import {
    parseVfxEmitters,
    loadEmitterData,
    replaceEmittersInSystem
} from '../../../utils/vfx/vfxEmitterParser.js';
import { replaceSystemBlockInFile } from '../../../utils/vfx/mutations/matrixUtils.js';
import { removeEmitterBlockFromSystem } from '../utils/pyContentUtils.js';

import { findAssetFiles, copyAssetFiles, showAssetCopyResults } from '../../../utils/assets/assetCopier.js';
import { createBackup } from '../../../utils/io/backupManager.js';

/**
 * useVfxMutations — logic for structural changes to VFX systems and emitters.
 */
export default function useVfxMutations(
    targetPyContent,
    donorPyContent,
    targetSystems,
    donorSystems,
    targetPath,
    donorPath,
    deletedEmitters,
    saveStateToHistory,
    setTargetPyContent,
    setTargetSystems,
    setDonorSystems,
    setDeletedEmitters,
    setRenamingEmitter,
    setRenamingSystem,
    setSelectedTargetSystem,
    setRecentCreatedSystemKeys,
    setFileSaved,
    setIsPortAllLoading,
    setIsProcessing,
    setProcessingText,
    setStatusMessage,
    electronPrefs,
    backgroundSaveTimerRef,
    targetPyContentRef,
    recentCreatedSystemKeys,
    selectedTargetSystem,
    setShowNewSystemModal
) {
    const cancelPendingBackgroundSave = useCallback(() => {
        if (backgroundSaveTimerRef?.current) {
            clearTimeout(backgroundSaveTimerRef.current);
            backgroundSaveTimerRef.current = null;
        }
    }, [backgroundSaveTimerRef]);

    // Create a new minimal VFX system and insert it into the current file
    const handleCreateNewSystem = useCallback((newSystemName, setShowNewSystemModal) => {
        cancelPendingBackgroundSave();
        try {
            console.log(`[handleCreateNewSystem] Called with:`, newSystemName, typeof newSystemName);
            const name = (typeof newSystemName === 'string' ? newSystemName : '').trim();
            if (!name) {
                setStatusMessage('Enter a system name');
                return;
            }

            // Save state before creating new system
            saveStateToHistory(`Create new VFX system "${name}"`);

            const minimalSystem = `"${name}" = VfxSystemDefinitionData {\n    complexEmitterDefinitionData: list[pointer] = {}\n    particleName: string = "${name}"\n    particlePath: string = "${name}"\n}`;
            const updated = insertVFXSystemIntoFile(targetPyContent, minimalSystem, name);
            setTargetPyContent(updated);
            try { setFileSaved(false); } catch { }
            try {
                const systems = parseVfxEmitters(updated);
                const entries = Object.entries(systems);
                if (entries.length > 0) {
                    const nowTs = Date.now();
                    // Use the name we just created — no heuristic needed
                    const createdKey = systems[name] ? name : entries[entries.length - 1][0];
                    // Only pin the single newly created key (don't accumulate old ones)
                    setRecentCreatedSystemKeys([createdKey]);
                    // Build ordered map: new system first (marked green), then rest in file order
                    const ordered = {};
                    if (systems[createdKey]) {
                        ordered[createdKey] = { ...systems[createdKey], ported: true, portedAt: nowTs, createdAt: nowTs };
                    }
                    for (const [k, v] of entries) { if (k !== createdKey) ordered[k] = v; }
                    setTargetSystems(ordered);
                } else {
                    setTargetSystems(systems);

                }
            } catch { }
            setStatusMessage(`Created VFX system "${name}" and updated ResourceResolver`);
        } catch (e) {
            console.error('Error creating new VFX system:', e);
            setStatusMessage('Failed to create VFX system');
        } finally {
            // Always close the modal whether creation succeeded or failed
            if (typeof setShowNewSystemModal === 'function') setShowNewSystemModal(false);
        }
    }, [targetPyContent, recentCreatedSystemKeys, saveStateToHistory, setTargetPyContent, setTargetSystems, setRecentCreatedSystemKeys, setFileSaved, setStatusMessage, cancelPendingBackgroundSave, setShowNewSystemModal]);

    // Port all VFX systems from donor to target
    const handlePortAllSystems = useCallback(async (hasResourceResolver) => {
        cancelPendingBackgroundSave();
        if (!targetPyContent || !donorPyContent) {
            setStatusMessage('Both target and donor files must be loaded');
            return;
        }

        if (!hasResourceResolver) {
            setStatusMessage('Locked: target bin missing ResourceResolver');
            return;
        }

        const donorSystemsList = Object.values(donorSystems);
        if (donorSystemsList.length === 0) {
            setStatusMessage('No VFX systems found in donor file');
            return;
        }

        // Show confirmation dialog
        const confirmed = window.confirm(
            `This will port ALL ${donorSystemsList.length} VFX systems from the donor file to the target file.\n\n` +
            `This operation:\n` +
            `• Creates a backup of your target file\n` +
            `• Copies all VFX systems and their assets\n` +
            `• May take several minutes to complete\n\n` +
            `Are you sure you want to continue?`
        );

        if (!confirmed) {
            return;
        }

        try {
            setIsPortAllLoading(true);
            setIsProcessing(true);
            setProcessingText(`Porting ${donorSystemsList.length} VFX systems...`);

            // Save state before porting all systems
            saveStateToHistory(`Port all ${donorSystemsList.length} VFX systems from donor`);

            // Create backup before making changes
            await createBackup(targetPath, 'port-all-systems');

            let updatedContent = targetPyContent;
            let successCount = 0;
            let errorCount = 0;
            const errors = [];

            // Process each donor system
            for (let i = 0; i < donorSystemsList.length; i++) {
                const system = donorSystemsList[i];
                setProcessingText(`Porting system ${i + 1}/${donorSystemsList.length}: ${system.particleName || system.name}`);

                try {
                    // Extract full VFX system content
                    let fullContent = '';
                    try {
                        const extracted = extractVFXSystem(donorPyContent, system.name);
                        fullContent = extracted?.fullContent || extracted?.rawContent || system.rawContent || '';
                    } catch (extractError) {
                        console.warn(`Failed to extract system ${system.name}:`, extractError);
                        fullContent = system.rawContent || '';
                    }

                    if (!fullContent) {
                        errors.push(`No content found for system: ${system.name}`);
                        errorCount++;
                        continue;
                    }

                    // Check if system name already exists in target
                    const originalName = system.particleName || system.name;
                    const systemExists = Object.values(targetSystems).some(targetSystem =>
                        (targetSystem.particleName || targetSystem.name) === originalName
                    );

                    let finalSystemName = originalName;
                    if (systemExists) {
                        finalSystemName = generateUniqueSystemName(updatedContent, originalName);
                    }

                    // Insert the VFX system with preserved names (unless there was a conflict)
                    if (systemExists) {
                        updatedContent = insertVFXSystemIntoFile(updatedContent, fullContent, finalSystemName);
                    } else {
                        updatedContent = insertVFXSystemWithPreservedNames(updatedContent, fullContent, finalSystemName, donorPyContent);
                    }
                    successCount++;

                    // Copy associated assets
                    try {
                        const assetFiles = findAssetFiles(fullContent);
                        if (assetFiles && assetFiles.length > 0) {
                            const { copiedFiles, failedFiles, skippedFiles } = copyAssetFiles(donorPath, targetPath, assetFiles);
                        }
                    } catch (assetError) {
                        console.warn(`Asset copy failed for ${finalSystemName}:`, assetError);
                    }

                } catch (systemError) {
                    console.error(`Error porting system ${system.name}:`, systemError);
                    errors.push(`Failed to port ${system.name}: ${systemError.message}`);
                    errorCount++;
                }

                // Yield control to the browser to prevent UI freezing
                if (i % 3 === 0 || i === donorSystemsList.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            setTargetPyContent(updatedContent);
            setFileSaved(false);

            try {
                const systems = parseVfxEmitters(updatedContent);
                setTargetSystems(systems);
            } catch (parseError) {
                console.error('Error parsing updated systems:', parseError);
            }

            if (successCount > 0) {
                setStatusMessage(`Successfully ported ${successCount} VFX systems${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);

                if (errors.length > 0) {
                    console.warn('Port all errors:', errors);
                    const { ipcRenderer } = window.require('electron');
                    ipcRenderer.send('Message', {
                        type: 'warning',
                        title: 'Port All Complete',
                        message: `Successfully ported ${successCount} systems. ${errorCount} systems failed. Check console for details.`
                    });
                }
            } else {
                setStatusMessage('Failed to port any VFX systems');
            }

        } catch (error) {
            console.error('Error in port all operation:', error);
            setStatusMessage('Failed to port VFX systems');
        } finally {
            setIsPortAllLoading(false);
            setIsProcessing(false);
            setProcessingText('');
        }
    }, [targetPyContent, donorPyContent, donorSystems, targetSystems, targetPath, donorPath, saveStateToHistory, setTargetPyContent, setTargetSystems, setFileSaved, setIsPortAllLoading, setIsProcessing, setProcessingText, setStatusMessage, cancelPendingBackgroundSave]);

    const handleDeleteEmitter = useCallback((systemKey, emitterIndex, isTarget, emitterName = null) => {
        cancelPendingBackgroundSave();
        const systems = isTarget ? targetSystems : donorSystems;
        const setSystems = isTarget ? setTargetSystems : setDonorSystems;

        if (isTarget) {
            try { saveStateToHistory(`Delete emitter from ${systemKey}`); } catch { }
        }

        const updatedSystems = { ...systems };
        if (updatedSystems[systemKey] && updatedSystems[systemKey].emitters) {
            let emitter;
            let actualIndex;

            if (emitterName) {
                actualIndex = updatedSystems[systemKey].emitters.findIndex(e => e.name === emitterName);
                if (actualIndex === -1) {
                    setStatusMessage(`Emitter "${emitterName}" not found in system`);
                    return;
                }
                emitter = updatedSystems[systemKey].emitters[actualIndex];
            } else {
                emitter = updatedSystems[systemKey].emitters[emitterIndex];
                actualIndex = emitterIndex;
            }

            const newEmittersList = [...updatedSystems[systemKey].emitters];
            newEmittersList.splice(actualIndex, 1);
            updatedSystems[systemKey] = { ...updatedSystems[systemKey], emitters: newEmittersList };
            setSystems(updatedSystems);

            if (isTarget) {
                try {
                    const currentSys = systems[systemKey] || {};
                    const currentRaw = currentSys.rawContent || '';
                    const newSystemRaw = removeEmitterBlockFromSystem(currentRaw, emitter.name);
                    if (newSystemRaw) {
                        setTargetSystems(prev => ({
                            ...prev,
                            [systemKey]: {
                                ...prev[systemKey],
                                rawContent: newSystemRaw
                            }
                        }));

                        try {
                            const sysKeyForReplace = (currentSys.key || systemKey);
                            const newFileText = replaceSystemBlockInFile(targetPyContent || '', sysKeyForReplace, newSystemRaw);
                            setTargetPyContent(newFileText);
                            try { setFileSaved(false); } catch { }

                            cancelPendingBackgroundSave();
                            backgroundSaveTimerRef.current = setTimeout(async () => {
                                try {
                                    const latestPy = targetPyContentRef?.current || '';
                                    if (latestPy !== newFileText) return;

                                    const fsp = window.require('fs').promises;
                                    const path = window.require('path');
                                    const { ipcRenderer } = window.require('electron');
                                    const { spawn } = window.require('child_process');

                                    const targetDir = path.dirname(targetPath);
                                    const targetName = path.basename(targetPath, '.bin');
                                    const outputPyPath = path.join(targetDir, `${targetName}.py`);

                                    await fsp.writeFile(outputPyPath, newFileText, 'utf8');

                                    let ritoBinPath = await electronPrefs.get('RitoBinPath');
                                    if (!ritoBinPath) {
                                        const settings = ipcRenderer.sendSync('get-ssx');
                                        ritoBinPath = settings[0]?.RitoBinPath;
                                    }

                                    if (ritoBinPath) {
                                        const outputBinPath = targetPath;
                                        const p = spawn(ritoBinPath, [outputPyPath, outputBinPath]);
                                        p.stdout?.on('data', () => { });
                                        p.stderr?.on('data', () => { });
                                    }
                                } catch (bgErr) {
                                    console.warn('Background save failed:', bgErr?.message || bgErr);
                                } finally {
                                    if (backgroundSaveTimerRef.current) {
                                        backgroundSaveTimerRef.current = null;
                                    }
                                }
                            }, 500);
                        } catch (e) {
                            console.warn('Fast content replace failed:', e?.message || e);
                        }
                    }
                } catch (fastErr) { }
            }

            if (isTarget && emitter.name) {
                const key = `${systemKey}:${emitter.name}`;
                setDeletedEmitters(prev => {
                    const newMap = new Map(prev);
                    newMap.set(key, { systemKey, emitterName: emitter.name });
                    return newMap;
                });
            }

            setStatusMessage(`Deleted emitter "${emitter.name}" from ${isTarget ? 'target' : 'donor'} bin`);
        }
    }, [targetSystems, donorSystems, targetPyContent, targetPath, backgroundSaveTimerRef, targetPyContentRef, electronPrefs, saveStateToHistory, setTargetSystems, setDonorSystems, setTargetPyContent, setFileSaved, setDeletedEmitters, setStatusMessage, cancelPendingBackgroundSave]);

    const handleRenameEmitter = useCallback((systemKey, oldEmitterName, newEmitterName) => {
        cancelPendingBackgroundSave();
        const name = (typeof newEmitterName === 'string' ? newEmitterName : '').trim();
        if (!name) {
            setStatusMessage('Emitter name cannot be empty');
            return;
        }

        if (newEmitterName === oldEmitterName) {
            setRenamingEmitter(null);
            return;
        }

        try { saveStateToHistory(`Rename emitter "${oldEmitterName}" to "${newEmitterName}"`); } catch { }

        const system = targetSystems[systemKey];
        if (!system) {
            setStatusMessage(`System "${systemKey}" not found`);
            setRenamingEmitter(null);
            return;
        }

        const existingEmitter = system.emitters?.find(e => e.name === newEmitterName);
        if (existingEmitter) {
            setStatusMessage(`Emitter "${newEmitterName}" already exists in this system`);
            setRenamingEmitter(null);
            return;
        }

        const systemRawContent = system.rawContent || '';
        const lines = systemRawContent.split('\n');
        let inTargetEmitter = false;
        let emitterBracketDepth = 0;
        let foundEmitterName = false;
        let updatedLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (/^VfxEmitterDefinitionData\s*\{/i.test(trimmed)) {
                inTargetEmitter = true;
                emitterBracketDepth = 1;
                foundEmitterName = false;
                updatedLines.push(line);
                continue;
            }

            if (inTargetEmitter) {
                const openBrackets = (line.match(/\{/g) || []).length;
                const closeBrackets = (line.match(/\}/g) || []).length;
                emitterBracketDepth += openBrackets - closeBrackets;

                if (!foundEmitterName && /emitterName:\s*string\s*=\s*"/i.test(trimmed)) {
                    const match = trimmed.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
                    if (match && match[1] === oldEmitterName) {
                        const indent = line.match(/^(\s*)/)?.[1] || '';
                        updatedLines.push(`${indent}emitterName: string = "${newEmitterName}"`);
                        foundEmitterName = true;
                        continue;
                    }
                }

                updatedLines.push(line);

                if (emitterBracketDepth <= 0) {
                    inTargetEmitter = false;
                }
            } else {
                updatedLines.push(line);
            }
        }

        const updatedSystemRawContent = updatedLines.join('\n');

        setTargetSystems(prev => ({
            ...prev,
            [systemKey]: {
                ...prev[systemKey],
                rawContent: updatedSystemRawContent,
                emitters: prev[systemKey].emitters.map(e =>
                    e.name === oldEmitterName ? { ...e, name: newEmitterName } : e
                )
            }
        }));

        try {
            const sysKeyForReplace = (system.key || systemKey);
            const newFileText = replaceSystemBlockInFile(targetPyContent || '', sysKeyForReplace, updatedSystemRawContent);
            setTargetPyContent(newFileText);
            try { setFileSaved(false); } catch { }
        } catch (e) {
            console.warn('Failed to update file content:', e);
        }

        const oldKey = `${systemKey}:${oldEmitterName}`;
        if (deletedEmitters.has(oldKey)) {
            setDeletedEmitters(prev => {
                const newMap = new Map(prev);
                newMap.delete(oldKey);
                return newMap;
            });
        }

        setStatusMessage(`Renamed emitter "${oldEmitterName}" to "${newEmitterName}"`);
        setRenamingEmitter(null);
    }, [targetSystems, targetPyContent, deletedEmitters, saveStateToHistory, setTargetSystems, setTargetPyContent, setFileSaved, setDeletedEmitters, setStatusMessage, setRenamingEmitter, cancelPendingBackgroundSave]);

    const handleRenameSystem = useCallback((systemKey, newSystemName) => {
        cancelPendingBackgroundSave();
        const name = (typeof newSystemName === 'string' ? newSystemName : '').trim();
        if (!name) {
            setStatusMessage('System name cannot be empty');
            return;
        }

        const system = targetSystems[systemKey];
        if (!system) {
            setStatusMessage(`System "${systemKey}" not found`);
            setRenamingSystem(null);
            return;
        }

        const oldSystemName = system.name || system.key;
        if (newSystemName === oldSystemName) {
            setRenamingSystem(null);
            return;
        }

        const existingSystem = Object.values(targetSystems).find(s =>
            (s.name === newSystemName || s.key === newSystemName) && s.key !== systemKey
        );
        if (existingSystem) {
            setStatusMessage(`System "${newSystemName}" already exists`);
            setRenamingSystem(null);
            return;
        }

        try { saveStateToHistory(`Rename system "${oldSystemName}" to "${newSystemName}"`); } catch { }

        let updatedContent = targetPyContent || '';
        const escapedOldKey = systemKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const oldKeyPattern = systemKey.startsWith('0x')
            ? new RegExp(`^\\s*${escapedOldKey}\\s*=\\s*VfxSystemDefinitionData\\s*\\{`, 'mi')
            : new RegExp(`^\\s*"${escapedOldKey}"\\s*=\\s*VfxSystemDefinitionData\\s*\\{`, 'mi');

        const newKey = newSystemName.startsWith('0x') ? newSystemName : `"${newSystemName}"`;
        updatedContent = updatedContent.replace(oldKeyPattern, (match) => {
            const leadingWhitespace = match.match(/^(\s*)/)?.[1] || '';
            return `${leadingWhitespace}${newKey} = VfxSystemDefinitionData {`;
        });

        const lines = updatedContent.split('\n');
        let inTargetSystem = false;
        let systemBracketDepth = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            const escapedNewKey = newKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const systemHeaderPattern = new RegExp(`${escapedNewKey}\\s*=\\s*VfxSystemDefinitionData\\s*\\{`, 'i');
            if (systemHeaderPattern.test(trimmed)) {
                inTargetSystem = true;
                systemBracketDepth = 1;
                continue;
            }

            if (inTargetSystem) {
                const openBrackets = (line.match(/\{/g) || []).length;
                const closeBrackets = (line.match(/\}/g) || []).length;
                systemBracketDepth += openBrackets - closeBrackets;

                if (/particleName:\s*string\s*=\s*"/i.test(trimmed)) {
                    lines[i] = line.replace(/particleName:\s*string\s*=\s*"[^"]*"/i, `particleName: string = "${newSystemName}"`);
                }

                if (/particlePath:\s*string\s*=\s*"/i.test(trimmed)) {
                    lines[i] = line.replace(/particlePath:\s*string\s*=\s*"[^"]*"/i, `particlePath: string = "${newSystemName}"`);
                }

                if (systemBracketDepth <= 0) {
                    inTargetSystem = false;
                    break;
                }
            }
        }

        const updatedLines = lines;
        let inResourceMap = false;
        let resourceMapDepth = 0;

        for (let i = 0; i < updatedLines.length; i++) {
            const line = updatedLines[i];
            const trimmed = line.trim();
            if (/resourceMap:\s*map\[hash,link\]\s*=\s*\{/i.test(trimmed)) {
                inResourceMap = true;
                resourceMapDepth = 1;
                continue;
            }
            if (inResourceMap) {
                const openBrackets = (line.match(/\{/g) || []).length;
                const closeBrackets = (line.match(/\}/g) || []).length;
                resourceMapDepth += openBrackets - closeBrackets;
                const entryMatch = trimmed.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/);
                if (entryMatch) {
                    const entryKey = entryMatch[1] || entryMatch[2];
                    const entryValue = entryMatch[3] || entryMatch[4];
                    const oldNameClean = oldSystemName.replace(/^"|"$/g, '');
                    const entryKeyClean = entryKey.replace(/^"|"$/g, '');
                    const entryValueClean = entryValue.replace(/^"|"$/g, '');
                    const keyMatches = entryKeyClean === oldNameClean || entryKeyClean === oldSystemName || entryKeyClean.toLowerCase() === oldNameClean.toLowerCase();
                    const valueMatches = entryValueClean === oldNameClean || entryValueClean === oldSystemName || entryValueClean.endsWith('/' + oldNameClean) || entryValueClean.endsWith('/' + oldSystemName) || entryValueClean.toLowerCase() === oldNameClean.toLowerCase() || entryValueClean.toLowerCase().endsWith('/' + oldNameClean.toLowerCase());
                    if (keyMatches || valueMatches) {
                        let finalEntryKey = entryKey;
                        let finalEntryValue = entryValue;
                        if (keyMatches) finalEntryKey = newSystemName;
                        if (valueMatches) finalEntryValue = newSystemName;
                        const finalEntryKeyFormatted = finalEntryKey.startsWith('0x') ? finalEntryKey : `"${finalEntryKey}"`;
                        const finalEntryValueFormatted = finalEntryValue.startsWith('0x') ? finalEntryValue : `"${finalEntryValue}"`;
                        const indentMatch = line.match(/^(\s*)/);
                        const indent = indentMatch ? indentMatch[1] : '            ';
                        updatedLines[i] = `${indent}${finalEntryKeyFormatted} = ${finalEntryValueFormatted}`;
                    }
                }
                if (resourceMapDepth <= 0) inResourceMap = false;
            }
        }

        updatedContent = updatedLines.join('\n');
        const updatedSystems = { ...targetSystems };
        const oldSystem = updatedSystems[systemKey];
        delete updatedSystems[systemKey];
        updatedSystems[newSystemName] = { ...oldSystem, key: newSystemName, name: newSystemName, particleName: newSystemName, rawContent: (oldSystem.rawContent || '').replace(/^(?:"[^"]+"|0x[0-9a-fA-F]+)\s*=\s*VfxSystemDefinitionData/m, `${newKey} = VfxSystemDefinitionData`).replace(/particleName:\s*string\s*=\s*"[^"]*"/g, `particleName: string = "${newSystemName}"`).replace(/particlePath:\s*string\s*=\s*"[^"]*"/g, `particlePath: string = "${newSystemName}"`) };
        setTargetPyContent(updatedContent);
        try { setFileSaved(false); } catch { }
        try { setTargetSystems(parseVfxEmitters(updatedContent) || {}); } catch { setTargetSystems(updatedSystems || {}); }
        if (selectedTargetSystem === systemKey) setSelectedTargetSystem(newSystemName);
        setStatusMessage(`Renamed system "${oldSystemName}" to "${newSystemName}"`);
        setRenamingSystem(null);
    }, [targetSystems, targetPyContent, selectedTargetSystem, saveStateToHistory, setTargetPyContent, setFileSaved, setTargetSystems, setSelectedTargetSystem, setStatusMessage, setRenamingSystem, cancelPendingBackgroundSave]);

    const handleMoveEmitter = useCallback(async (sourceSystemKey, emitterName, targetSystemKey) => {
        cancelPendingBackgroundSave();
        if (sourceSystemKey === targetSystemKey) {
            setStatusMessage('Cannot move emitter to the same system');
            return;
        }
        const sourceSystem = targetSystems[sourceSystemKey];
        const targetSystem = targetSystems[targetSystemKey];
        if (!sourceSystem || !targetSystem) {
            setStatusMessage('Source or target system not found');
            return;
        }
        const fullEmitterData = loadEmitterData(sourceSystem, emitterName);
        if (!fullEmitterData) {
            setStatusMessage(`Failed to load emitter data for "${emitterName}"`);
            return;
        }
        let finalEmitterName = emitterName;
        if (targetSystem.emitters) {
            const existingNames = new Set(targetSystem.emitters.map(e => e.name));
            if (existingNames.has(emitterName)) {
                let suffix = 1;
                while (existingNames.has(`${emitterName}_${suffix}`)) suffix++;
                finalEmitterName = `${emitterName}_${suffix}`;
                fullEmitterData.name = finalEmitterName;
                if (fullEmitterData.originalContent) fullEmitterData.originalContent = fullEmitterData.originalContent.replace(/emitterName:\s*string\s*=\s*"([^"]+)"/i, `emitterName: string = "${finalEmitterName}"`);
            }
        }
        try {
            saveStateToHistory(`Move emitter "${emitterName}" from "${sourceSystem.name}" to "${targetSystem.name}"`);
            const sourceSystemContent = sourceSystem.rawContent || '';
            const remainingEmitters = (sourceSystem.emitters || []).filter(e => e.name !== emitterName);
            const remainingEmitterBlocks = remainingEmitters.map(e => {
                if (e.originalContent) return e.originalContent;
                const loaded = loadEmitterData(sourceSystem, e.name);
                if (loaded?.originalContent) return loaded.originalContent;
                return `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
            });
            const updatedSourceContent = replaceEmittersInSystem(sourceSystemContent, remainingEmitterBlocks);
            const updatedSourceSystemContent = replaceSystemBlockInFile(targetPyContent || '', sourceSystemKey, updatedSourceContent);
            const targetSystemContent = targetSystem.rawContent || '';
            const targetSys = updatedSourceSystemContent ? (extractVFXSystem(updatedSourceSystemContent, targetSystemKey)?.fullContent || targetSystemContent) : targetSystemContent;
            const targetEmitters = targetSystem.emitters || [];
            const targetEmitterBlocks = targetEmitters.map(e => {
                if (e.originalContent) return e.originalContent;
                const loaded = loadEmitterData(targetSystem, e.name);
                if (loaded?.originalContent) return loaded.originalContent;
                return `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
            });
            targetEmitterBlocks.push(fullEmitterData.originalContent || `VfxEmitterDefinitionData {\n    emitterName: string = "${finalEmitterName}"\n}`);
            const updatedTargetSystemContent = replaceEmittersInSystem(targetSys, targetEmitterBlocks);
            const updatedTargetContent = replaceSystemBlockInFile(updatedSourceSystemContent || targetPyContent || '', targetSystemKey, updatedTargetSystemContent);
            setTargetPyContent(updatedTargetContent);
            try { setFileSaved(false); } catch { }
            try { setTargetSystems(parseVfxEmitters(updatedTargetContent) || {}); } catch { }
            setStatusMessage(`Moved emitter "${emitterName}"${finalEmitterName !== emitterName ? ` (renamed to "${finalEmitterName}")` : ''} from "${sourceSystem.name}" to "${targetSystem.name}"`);
        } catch (e) {
            console.error(e);
            setStatusMessage('Error moving emitter');
        }
    }, [targetSystems, targetPyContent, saveStateToHistory, setTargetPyContent, setTargetSystems, setFileSaved, setStatusMessage, cancelPendingBackgroundSave]);

    const handlePortEmitter = useCallback(async (donorSystemKey, emitterName, hasResourceResolver, targetSystemKeyOverride = null) => {
        cancelPendingBackgroundSave();
        const targetSystemKey = targetSystemKeyOverride || selectedTargetSystem;
        if (!targetSystemKey) {
            setStatusMessage('Please select a target system first');
            return;
        }
        const donorSystem = donorSystems[donorSystemKey];
        if (!emitterName) return;
        try {
            setStatusMessage(`Loading emitter data...`);
            const fullEmitterData = loadEmitterData(donorSystem, emitterName);
            if (!fullEmitterData) return;

            const targetSystem = targetSystems[targetSystemKey];
            let finalEmitterName = emitterName;
            if (targetSystem && targetSystem.emitters) {
                const existingNames = new Set(targetSystem.emitters.map(e => e.name));
                if (existingNames.has(emitterName)) {
                    let suffix = 1;
                    while (existingNames.has(`${emitterName}_${suffix}`)) suffix++;
                    finalEmitterName = `${emitterName}_${suffix}`;
                    fullEmitterData.name = finalEmitterName;
                    if (fullEmitterData.originalContent) fullEmitterData.originalContent = fullEmitterData.originalContent.replace(/emitterName:\s*string\s*=\s*"([^"]+)"/, `emitterName: string = "${finalEmitterName}"`);
                }
            }

            saveStateToHistory(`Port emitter "${finalEmitterName}" to "${targetSystemKey}"`);

            const updatedTargetSystems = { ...targetSystems };
            if (updatedTargetSystems[targetSystemKey]) {
                const newEmitterList = [...(updatedTargetSystems[targetSystemKey].emitters || []), fullEmitterData];
                updatedTargetSystems[targetSystemKey] = { ...updatedTargetSystems[targetSystemKey], emitters: newEmitterList };
                setTargetSystems(updatedTargetSystems);
                try {
                    const targetSys = updatedTargetSystems[targetSystemKey];
                    const targetSysKeyForReplace = targetSys.key || targetSystemKey;
                    const currentSystemContent = targetSys.rawContent || extractVFXSystem(targetPyContent, targetSysKeyForReplace)?.fullContent || '';
                    const emitterBlocks = targetSys.emitters.map(e => {
                        if (e.originalContent) return e.originalContent;
                        // After save, emitters lose originalContent (re-parsed as {name, loaded:false}).
                        // Extract full content from the system's rawContent instead of using a stub.
                        const loaded = loadEmitterData(targetSys, e.name);
                        if (loaded?.originalContent) return loaded.originalContent;
                        return `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
                    });
                    const newSystemText = replaceEmittersInSystem(currentSystemContent || '', emitterBlocks);
                    const newFile = replaceSystemBlockInFile(targetPyContent || '', targetSysKeyForReplace, newSystemText);
                    setTargetPyContent(newFile);
                    try { setFileSaved(false); } catch { }
                    setTargetSystems(prev => ({ ...prev, [targetSystemKey]: { ...prev[targetSystemKey], rawContent: newSystemText } }));
                } catch (e) {
                    console.warn('Port emitter content sync failed:', e?.message || e);
                }
                try {
                    const assetFiles = findAssetFiles(fullEmitterData);
                    if (assetFiles.length > 0) {
                        const { copiedFiles, failedFiles, skippedFiles } = copyAssetFiles(donorPath, targetPath, assetFiles);
                        const { ipcRenderer } = window.require('electron');
                        showAssetCopyResults(copiedFiles, failedFiles, skippedFiles, (m) => ipcRenderer.send("Message", m));
                    }
                } catch (assetError) { }
                setStatusMessage(`Ported emitter "${finalEmitterName}"`);
            }
        } catch (e) {
            console.error(e);
            setStatusMessage('Error porting emitter');
        }
    }, [selectedTargetSystem, donorSystems, targetSystems, targetPyContent, donorPath, targetPath, saveStateToHistory, setTargetSystems, setTargetPyContent, setFileSaved, setStatusMessage, cancelPendingBackgroundSave]);

    const handlePortAllEmitters = useCallback(async (donorSystemKey) => {
        cancelPendingBackgroundSave();
        if (!selectedTargetSystem) {
            setStatusMessage('Please select a target system first');
            return;
        }
        const donorSystem = donorSystems[donorSystemKey];
        if (!donorSystem || !donorSystem.emitters || donorSystem.emitters.length === 0) return;
        try {
            saveStateToHistory(`Port all emitters from "${donorSystem.name}"`);
            const origTargetSystem = targetSystems[selectedTargetSystem];
            const newEmitters = [...(origTargetSystem.emitters || [])];
            const existingNames = new Set(newEmitters.map(e => e.name));
            const collectedAssetFiles = new Set();
            let portedCount = 0;
            for (let i = 0; i < donorSystem.emitters.length; i++) {
                const emitterName = donorSystem.emitters[i].name;
                if (!emitterName) continue;
                const fullEmitterData = loadEmitterData(donorSystem, emitterName);
                if (!fullEmitterData) continue;
                try {
                    const emitterAssetFiles = findAssetFiles(fullEmitterData);
                    for (const assetFile of emitterAssetFiles) {
                        collectedAssetFiles.add(assetFile);
                    }
                } catch (_) { }
                let finalEmitterName = emitterName;
                if (existingNames.has(emitterName)) {
                    let suffix = 1;
                    while (existingNames.has(`${emitterName}_${suffix}`)) suffix++;
                    finalEmitterName = `${emitterName}_${suffix}`;
                    fullEmitterData.name = finalEmitterName;
                    if (fullEmitterData.originalContent) fullEmitterData.originalContent = fullEmitterData.originalContent.replace(/emitterName:\s*string\s*=\s*"([^"]+)"/, `emitterName: string = "${finalEmitterName}"`);
                }
                newEmitters.push({ name: finalEmitterName, originalContent: fullEmitterData.originalContent || fullEmitterData.rawContent });
                existingNames.add(finalEmitterName);
                portedCount++;
            }
            const updatedTargetSystems = { ...targetSystems, [selectedTargetSystem]: { ...origTargetSystem, emitters: newEmitters } };
            setTargetSystems(updatedTargetSystems);
            try {
                const targetSysKey = selectedTargetSystem;
                const targetSys = updatedTargetSystems[targetSysKey];
                const targetSysKeyForReplace = targetSys.key || targetSysKey;
                const currentSystemContent = targetSys.rawContent || extractVFXSystem(targetPyContent, targetSysKeyForReplace)?.fullContent || '';
                const emitterBlocks = newEmitters.map(e => {
                    if (e.originalContent) return e.originalContent;
                    const loaded = loadEmitterData(targetSys, e.name);
                    if (loaded?.originalContent) return loaded.originalContent;
                    return `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
                });
                const newSystemText = replaceEmittersInSystem(currentSystemContent || '', emitterBlocks);
                const newFile = replaceSystemBlockInFile(targetPyContent || '', targetSysKeyForReplace, newSystemText);
                setTargetPyContent(newFile);
                try { setFileSaved(false); } catch { }
                setTargetSystems(prev => ({ ...prev, [targetSysKey]: { ...prev[targetSysKey], rawContent: newSystemText } }));
            } catch (e) {
                console.warn('Port all emitters content sync failed:', e?.message || e);
            }
            try {
                const assetFiles = Array.from(collectedAssetFiles);
                if (assetFiles.length > 0) {
                    const { copiedFiles, failedFiles, skippedFiles } = copyAssetFiles(donorPath, targetPath, assetFiles);
                    const { ipcRenderer } = window.require('electron');
                    showAssetCopyResults(copiedFiles, failedFiles, skippedFiles, (m) => ipcRenderer.send('Message', m));
                }
            } catch (_) { }
            setStatusMessage(`Ported ${portedCount} emitters`);
        } catch (e) {
            console.error(e);
            setStatusMessage('Error porting all emitters');
        }
    }, [selectedTargetSystem, donorSystems, targetSystems, targetPyContent, donorPath, targetPath, saveStateToHistory, setTargetSystems, setTargetPyContent, setFileSaved, setStatusMessage, cancelPendingBackgroundSave]);

    const handleDeleteAllEmitters = useCallback((systemKey) => {
        cancelPendingBackgroundSave();
        const system = targetSystems[systemKey];
        if (!system || !system.emitters || system.emitters.length === 0) return;
        saveStateToHistory(`Delete all emitters from ${systemKey}`);
        try {
            const emitterNames = system.emitters.map(e => e?.name).filter(Boolean);
            const updatedDeletedEmitters = new Map(deletedEmitters);
            emitterNames.forEach(name => {
                updatedDeletedEmitters.set(`${systemKey}:${name}`, { systemKey, emitterName: name });
            });

            const updatedSystems = { ...targetSystems };
            updatedSystems[systemKey] = {
                ...updatedSystems[systemKey],
                emitters: []
            };

            // Keep file content in sync so Save/Undo state updates immediately.
            try {
                const currentSys = targetSystems[systemKey] || {};
                const currentRaw = currentSys.rawContent || '';
                const newSystemRaw = replaceEmittersInSystem(currentRaw, []);
                if (newSystemRaw) {
                    const sysKeyForReplace = currentSys.key || systemKey;
                    const newFileText = replaceSystemBlockInFile(targetPyContent || '', sysKeyForReplace, newSystemRaw);
                    setTargetPyContent(newFileText);
                    updatedSystems[systemKey] = {
                        ...updatedSystems[systemKey],
                        rawContent: newSystemRaw
                    };
                }
            } catch (contentErr) {
                console.warn('Delete all emitters content sync failed:', contentErr);
            }

            setTargetSystems(updatedSystems);
            setDeletedEmitters(updatedDeletedEmitters);
            try { setFileSaved(false); } catch { }
            setStatusMessage(`Deleted all emitters from "${systemKey}"`);
        } catch (e) { }
    }, [targetSystems, deletedEmitters, saveStateToHistory, setTargetSystems, setDeletedEmitters, setStatusMessage, targetPyContent, setTargetPyContent, setFileSaved, cancelPendingBackgroundSave]);

    return {
        handleCreateNewSystem,
        handlePortAllSystems,
        handleDeleteEmitter,
        handleRenameEmitter,
        handleRenameSystem,
        handleMoveEmitter,
        handlePortEmitter,
        handlePortAllEmitters,
        handleDeleteAllEmitters
    };
}
