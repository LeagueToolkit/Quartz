import React, { useState, useCallback, useMemo, useEffect } from 'react';
import electronPrefs from '../utils/core/electronPrefs.js';
import { loadFileWithBackup, createBackup } from '../utils/io/backupManager.js';
import { openAssetPreview } from '../utils/assets/assetPreviewEvent';
import { ToPy, ToBin } from '../utils/io/fileOperations.js';
import GlowingSpinner from '../components/GlowingSpinner.js';
import { parseVfxFile } from './paint2/utils/parser.js';
import './ParticleRandomizer.css';

const nodeFs = window.require ? window.require('fs') : null;
const nodePath = window.require ? window.require('path') : null;

// ════════════════════════════════════════════════════════════════
//  CORE LOGIC
// ════════════════════════════════════════════════════════════════



function findVfxBlock(content, entryPath) {
    const startPattern = `"${entryPath}" = VfxSystemDefinitionData {`;
    const startIndex = content.indexOf(startPattern);
    if (startIndex === -1) return null;
    let braceCount = 0, inBlock = false, endIndex = startIndex;
    for (let i = startIndex; i < content.length; i++) {
        if (content[i] === '{') { braceCount++; inBlock = true; }
        else if (content[i] === '}') {
            braceCount--;
            if (inBlock && braceCount === 0) { endIndex = i + 1; break; }
        }
    }
    return { start: startIndex, end: endIndex, block: content.substring(startIndex, endIndex) };
}

/**
 * Find a named VfxEmitterDefinitionData block within a system block string.
 * Returns { start, end, indent } — indices into blockContent.
 */
function findEmitterInBlock(blockContent, emitterName) {
    const emitterRegex = /VfxEmitterDefinitionData\s*\{/g;
    let match;
    while ((match = emitterRegex.exec(blockContent)) !== null) {
        const tokenStart = match.index;
        let braceCount = 0, inBlock = false, blockEnd = tokenStart;
        for (let i = tokenStart; i < blockContent.length; i++) {
            if (blockContent[i] === '{') { braceCount++; inBlock = true; }
            else if (blockContent[i] === '}') {
                braceCount--;
                if (inBlock && braceCount === 0) { blockEnd = i + 1; break; }
            }
        }
        const emBlock = blockContent.substring(tokenStart, blockEnd);
        const nameMatch = emBlock.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
        if (nameMatch && nameMatch[1] === emitterName) {
            // Walk back to start of line to capture leading whitespace (indent)
            let lineStart = tokenStart;
            while (lineStart > 0 && blockContent[lineStart - 1] !== '\n') lineStart--;
            const leadingWs = blockContent.substring(lineStart, tokenStart);
            const indent = /^\s*$/.test(leadingWs) ? leadingWs : '            ';
            return { start: lineStart, end: blockEnd, indent };
        }
    }
    return null;
}

/**
 * Build the randomizer emitter block that references N variant system paths.
 */
function buildRandomizerEmitter(emitterName, variantPaths, indent) {
    const l1 = indent + '    ';
    const l2 = indent + '        ';
    const l3 = indent + '            ';
    const l4 = indent + '                ';
    const l5 = indent + '                    ';
    const l6 = indent + '                        ';

    const childrenIds = variantPaths.map(path =>
        `${l3}VfxChildIdentifier {\n${l4}effectKey: hash = "${path}"\n${l3}}`
    ).join('\n');

    const n = variantPaths.length;

    return `${indent}VfxEmitterDefinitionData {
${l1}rate: embed = ValueFloat {
${l2}constantValue: f32 = 1
${l1}}
${l1}isSingleParticle: flag = true
${l1}childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData {
${l2}childrenIdentifiers: list[embed] = {
${childrenIds}
${l2}}
${l2}childrenProbability: embed = ValueFloat {
${l3}constantValue: f32 = 1
${l3}dynamics: pointer = VfxAnimatedFloatVariableData {
${l4}probabilityTables: list[pointer] = {
${l5}VfxProbabilityTableData {
${l6}keyTimes: list[f32] = {
${l6}    0
${l6}    1
${l6}}
${l6}keyValues: list[f32] = {
${l6}    0
${l6}    ${n}
${l6}}
${l5}}
${l4}}
${l4}times: list[f32] = {
${l5}0
${l4}}
${l4}values: list[f32] = {
${l5}1
${l4}}
${l3}}
${l2}}
${l1}}
${l1}emitterName: string = "${emitterName}_randomized"
${l1}shape: embed = VfxShape {
${l2}emitOffset: embed = ValueVector3 {
${l3}constantValue: vec3 = { 0, 0, 0 }
${l2}}
${l1}}
${l1}bindWeight: embed = ValueFloat {
${l2}constantValue: f32 = 1
${l1}}
${l1}birthScale0: embed = ValueVector3 {
${l2}constantValue: vec3 = { 0, 0, 0 }
${l1}}
${indent}}`;
}

/**
 * Resolve a unique base name for an emitter's variants.
 * Checks particleName strings (not hashed by ritobin) to detect existing collisions,
 * and also tracks names already assigned in this generation run.
 */
function resolveUniqueName(content, usedNames, baseName, variantPrefixes) {
    let candidate = baseName;
    let counter = 2;
    while (
        usedNames.has(candidate) ||
        content.includes(`particleName: string = "${candidate}_${variantPrefixes[0]}"`)
    ) {
        candidate = `${baseName}_${counter}`;
        counter++;
    }
    usedNames.add(candidate);
    return candidate;
}

/**
 * Main generation: for each selected emitter, create N variant systems and
 * replace the emitter in the original with a randomizer that references them.
 */
function generateEmitterRandomizers(content, parsedFile, selectedEmitterKeys, variantPrefixes) {
    let result = content;
    const usedBaseNames = new Set();

    // Group selected emitters by system
    const bySystem = new Map();
    for (const eKey of selectedEmitterKeys) {
        const emitter = parsedFile.emitters.get(eKey);
        if (!emitter || !emitter.name || emitter.name === 'Unnamed') continue;
        if (!bySystem.has(emitter.systemKey)) bySystem.set(emitter.systemKey, []);
        bySystem.get(emitter.systemKey).push(emitter);
    }

    for (const [systemKey, emitters] of bySystem) {
        const sys = findVfxBlock(result, systemKey);
        if (!sys) continue;

        const originalBlock = sys.block;
        let modifiedBlock = sys.block;
        let duplicatesText = '';
        const resolvedNames = new Map(); // emitter.key -> baseName

        for (const emitter of emitters) {
            const emName = emitter.name;
            const baseName = resolveUniqueName(result, usedBaseNames, emName, variantPrefixes);
            resolvedNames.set(emitter.key, baseName);
            const variantPaths = variantPrefixes.map(p => `${baseName}_${p}`);

            // Create variant system blocks — each contains ONLY this emitter
            const emForVariant = findEmitterInBlock(originalBlock, emName);
            if (emForVariant) {
                const emitterText = originalBlock.substring(emForVariant.start, emForVariant.end);

                const complexIdx = originalBlock.indexOf('complexEmitterDefinitionData: list[pointer] = {');
                let complexLineStart = complexIdx;
                while (complexLineStart > 0 && originalBlock[complexLineStart - 1] !== '\n') complexLineStart--;
                const complexIndent = complexIdx !== -1 ? originalBlock.substring(complexLineStart, complexIdx) : '        ';

                const lastBraceIdx = originalBlock.lastIndexOf('}');
                let closeBraceLineStart = lastBraceIdx;
                while (closeBraceLineStart > 0 && originalBlock[closeBraceLineStart - 1] !== '\n') closeBraceLineStart--;
                const closeBraceIndent = originalBlock.substring(closeBraceLineStart, lastBraceIdx);

                for (const variantPath of variantPaths) {
                    const variantBlock =
                        `"${variantPath}" = VfxSystemDefinitionData {\n` +
                        `${complexIndent}complexEmitterDefinitionData: list[pointer] = {\n` +
                        `${emitterText}\n` +
                        `${complexIndent}}\n` +
                        `${complexIndent}particleName: string = "${variantPath}"\n` +
                        `${complexIndent}particlePath: string = "${variantPath}"\n` +
                        `${closeBraceIndent}}`;
                    duplicatesText += '\n' + variantBlock + '\n';
                }
            }

            // Replace this emitter in modifiedBlock with the randomizer
            const emFound = findEmitterInBlock(modifiedBlock, emName);
            if (emFound) {
                const randomizerBlock = buildRandomizerEmitter(emName, variantPaths, emFound.indent);
                modifiedBlock =
                    modifiedBlock.substring(0, emFound.start) +
                    randomizerBlock +
                    modifiedBlock.substring(emFound.end);
            }
        }

        result =
            result.substring(0, sys.start) +
            modifiedBlock +
            duplicatesText +
            result.substring(sys.end);

        for (const emitter of emitters) {
            const baseName = resolvedNames.get(emitter.key);
            result = addToResourceResolver(result, baseName, variantPrefixes.map(p => `_${p}`));
        }
    }

    return { content: result, resolvedBaseNames: Array.from(usedBaseNames) };
}

/**
 * System-level generation: duplicate the whole VfxSystem N times,
 * add a randomizer emitter to the original that picks between the copies.
 */
function generateSystemRandomizers(content, parsedFile, selectedSystemKeys, variantPrefixes) {
    let result = content;

    for (const systemKey of selectedSystemKeys) {
        const sys = findVfxBlock(result, systemKey);
        if (!sys) continue;

        const originalBlock = sys.block;
        const variantPaths = variantPrefixes.map(p => `${systemKey}_${p}`);

        // Create N full copies of the system with new paths
        let duplicatesText = '';
        for (const variantPath of variantPaths) {
            const variantBlock = originalBlock.replace(
                `"${systemKey}" = VfxSystemDefinitionData {`,
                `"${variantPath}" = VfxSystemDefinitionData {`
            );
            duplicatesText += '\n' + variantBlock + '\n';
        }

        // Detect emitter indent from original block
        const emIndentMatch = originalBlock.match(/\n(\s*)VfxEmitterDefinitionData\s*\{/);
        const emitterIndent = emIndentMatch ? emIndentMatch[1] : '            ';

        // Find complexEmitterDefinitionData list and insert randomizer before its closing brace
        const complexListPattern = 'complexEmitterDefinitionData: list[pointer] = {';
        const complexListIdx = originalBlock.indexOf(complexListPattern);

        let modifiedBlock = originalBlock;
        if (complexListIdx !== -1) {
            // Find the opening { of the list
            const listOpenIdx = complexListIdx + complexListPattern.length - 1;
            // Find the closing } of the list
            let braceCount = 0, inList = false, listEnd = complexListIdx;
            for (let i = complexListIdx; i < originalBlock.length; i++) {
                if (originalBlock[i] === '{') { braceCount++; inList = true; }
                else if (originalBlock[i] === '}') {
                    braceCount--;
                    if (inList && braceCount === 0) { listEnd = i; break; }
                }
            }
            const sysDisplayName = (parsedFile.systems.get(systemKey)?.name || systemKey).split('/').pop();
            const randomizerEmitterText = buildRandomizerEmitter(sysDisplayName, variantPaths, emitterIndent);
            // Replace entire list contents with just the randomizer emitter
            modifiedBlock =
                originalBlock.substring(0, listOpenIdx + 1) +
                '\n' + randomizerEmitterText + '\n' +
                originalBlock.substring(listEnd);
        }

        result = result.substring(0, sys.start) + modifiedBlock + duplicatesText + result.substring(sys.end);
        result = addToResourceResolver(result, systemKey, variantPrefixes.map(p => `_${p}`));
    }

    return result;
}

/** Append new entries to the ResourceResolver map */
function addToResourceResolver(content, originalPath, suffixes) {
    const resourceMapStart = content.indexOf('resourceMap: map[hash,link] = {');
    if (resourceMapStart === -1) return content;

    // Find the closing brace of the resourceMap block
    let braceCount = 0, inMap = false, mapEnd = resourceMapStart;
    for (let i = resourceMapStart; i < content.length; i++) {
        if (content[i] === '{') { braceCount++; inMap = true; }
        else if (content[i] === '}') {
            braceCount--;
            if (inMap && braceCount === 0) { mapEnd = i; break; }
        }
    }

    // Detect indent from any existing entry inside the map
    const anyEntry = content.substring(resourceMapStart, mapEnd).match(/\n(\s*)"[^"]+"\s*=\s*"[^"]+"/);
    const indent = anyEntry ? anyEntry[1] : '            ';

    let newEntries = '';
    for (const suffix of suffixes) {
        newEntries += `${indent}"${originalPath}${suffix}" = "${originalPath}${suffix}"\n`;
    }
    return content.slice(0, mapEnd) + newEntries + content.slice(mapEnd);
}

function separateAssetsPerCopy(content, originalPaths, numCopies, customPrefixes, assetFolderNames) {
    let modifiedContent = content;
    const assetsByFolder = {};

    for (const fn of assetFolderNames) { assetsByFolder[fn] = new Map(); }
    assetsByFolder['_backup'] = new Map();

    for (const originalPath of originalPaths) {
        for (let i = 0; i < numCopies; i++) {
            const suffix = customPrefixes ? `_${customPrefixes[i]}` : `_${i + 1}`;
            const duplicatePath = `${originalPath}${suffix}`;
            const folderName = assetFolderNames[i];

            const found = findVfxBlock(modifiedContent, duplicatePath);
            if (!found) continue;

            const { start: startIndex, end: endIndex, block: vfxBlock } = found;
            const assetRegex = /(ASSETS\/[^"\s]+)/gi;
            let m;
            const replacements = [];
            while ((m = assetRegex.exec(vfxBlock)) !== null) {
                const assetPath = m[1];
                const fileName = assetPath.split('/').pop();
                const newPath = `ASSETS/${folderName}/${fileName}`;
                assetsByFolder[folderName].set(fileName, assetPath);
                if (!assetsByFolder['_backup'].has(fileName)) {
                    assetsByFolder['_backup'].set(fileName, assetPath);
                }
                if (assetPath !== newPath) replacements.push({ old: assetPath, new: newPath });
            }

            const uniqueReplacements = [];
            const seen = new Set();
            for (const r of replacements) {
                if (!seen.has(r.old)) { seen.add(r.old); uniqueReplacements.push(r); }
            }
            uniqueReplacements.sort((a, b) => b.old.length - a.old.length);

            let updatedBlock = vfxBlock;
            for (const repl of uniqueReplacements) {
                updatedBlock = updatedBlock.split(repl.old).join(repl.new);
            }
            modifiedContent = modifiedContent.substring(0, startIndex) + updatedBlock + modifiedContent.substring(endIndex);
        }
    }

    const result = {};
    for (const folder in assetsByFolder) {
        result[folder] = Array.from(assetsByFolder[folder].entries()).map(([filename, original]) => ({ original, filename }));
    }
    return { content: modifiedContent, assetsByFolder: result };
}

function copyAssetsToFolders(assetsByFolder, sourceFilePath) {
    if (!nodeFs || !nodePath) return { success: false, error: 'No Node.js' };

    const binDir = nodePath.dirname(sourceFilePath);
    let projectRoot = binDir;
    let current = binDir;
    while (current && current !== nodePath.dirname(current)) {
        if (nodePath.basename(current).toLowerCase() === 'data') {
            projectRoot = nodePath.dirname(current);
            break;
        }
        current = nodePath.dirname(current);
    }

    let totalCopied = 0, totalFailed = 0, totalSkipped = 0, foldersCreated = 0;
    const failures = [];

    for (const [folderName, assets] of Object.entries(assetsByFolder)) {
        const destDir = nodePath.join(projectRoot, 'ASSETS', folderName);
        if (!nodeFs.existsSync(destDir)) {
            nodeFs.mkdirSync(destDir, { recursive: true });
            foldersCreated++;
        }

        for (const asset of assets) {
            try {
                const destPath = nodePath.join(destDir, asset.filename);
                if (nodeFs.existsSync(destPath)) { totalSkipped++; continue; }

                const originalRel = asset.original.replace(/\//g, nodePath.sep);
                const relNoAssets = originalRel.replace(/^ASSETS[\\\/]/i, '');
                const candidates = [
                    nodePath.join(projectRoot, originalRel),
                    nodePath.join(projectRoot, 'ASSETS', relNoAssets),
                    nodePath.join(projectRoot, 'assets', relNoAssets),
                    nodePath.join(binDir, originalRel),
                    nodePath.join(binDir, asset.filename),
                ];

                let sourcePath = null;
                for (const c of candidates) {
                    try { if (nodeFs.existsSync(c)) { sourcePath = c; break; } } catch { }
                }

                if (sourcePath) {
                    nodeFs.copyFileSync(sourcePath, destPath);
                    totalCopied++;
                } else {
                    failures.push({ folder: folderName, asset: asset.original, reason: 'Source not found' });
                    totalFailed++;
                }
            } catch (error) {
                failures.push({ folder: folderName, asset: asset.original, reason: error.message });
                totalFailed++;
            }
        }
    }

    return { success: totalFailed === 0, totalCopied, totalFailed, totalSkipped, foldersCreated, failures };
}


// ════════════════════════════════════════════════════════════════
//  REACT COMPONENT
// ════════════════════════════════════════════════════════════════

export default function ParticleRandomizer() {
    // File state
    const [pyContent, setPyContent] = useState('');
    const [binPath, setBinPath] = useState(null);
    const [pyPath, setPyPath] = useState(null);
    const [generatedContent, setGeneratedContent] = useState('');
    const [parsedFile, setParsedFile] = useState(null);

    // Tree state
    const [expandedSystems, setExpandedSystems] = useState(new Set());
    const [selected, setSelected] = useState(new Set()); // Set<emitterKey>
    const [selectedSystems, setSelectedSystems] = useState(new Set()); // Set<systemKey> — system-level mode
    const [searchQuery, setSearchQuery] = useState('');

    // Config
    const [numCopies, setNumCopies] = useState(2);
    const [useCustomPrefix, setUseCustomPrefix] = useState(false);
    const [customPrefixes, setCustomPrefixes] = useState([]);
    const [separateAssets, setSeparateAssets] = useState(true);
    const [assetFolderNames, setAssetFolderNames] = useState([]);
    const [detectedAssets, setDetectedAssets] = useState({});

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [statusMessage, setStatusMessage] = useState('Load a .bin file to start');
    const [statusType, setStatusType] = useState('');
    const [canSave, setCanSave] = useState(false);
    const [canCopyAssets, setCanCopyAssets] = useState(false);

    // Keep prefix/asset-folder arrays in sync with numCopies
    useEffect(() => {
        setCustomPrefixes(prev => {
            const arr = [...prev];
            while (arr.length < numCopies) arr.push('');
            return arr.slice(0, numCopies);
        });
        setAssetFolderNames(prev => {
            const arr = [...prev];
            while (arr.length < numCopies) arr.push(`variant_${arr.length + 1}`);
            return arr.slice(0, numCopies);
        });
    }, [numCopies]);

    const setStatus = useCallback((msg, type = '') => {
        setStatusMessage(msg);
        setStatusType(type);
    }, []);

    // ── Derived: filtered system order + per-system visible emitters ──
    const filteredSystemOrder = useMemo(() => {
        if (!parsedFile) return [];
        if (!searchQuery.trim()) return parsedFile.systemOrder || [];
        const q = searchQuery.toLowerCase();
        return (parsedFile.systemOrder || []).filter(sKey => {
            const sys = parsedFile.systems.get(sKey);
            if (!sys) return false;
            if ((sys.name || '').toLowerCase().includes(q) || sKey.toLowerCase().includes(q)) return true;
            return (sys.emitterKeys || []).some(eKey => {
                const em = parsedFile.emitters.get(eKey);
                return em && (em.name || '').toLowerCase().includes(q);
            });
        });
    }, [parsedFile, searchQuery]);

    const getVisibleEmitters = useCallback((systemKey) => {
        if (!parsedFile) return [];
        const sys = parsedFile.systems.get(systemKey);
        if (!sys) return [];
        const all = (sys.emitterKeys || []).map(k => parsedFile.emitters.get(k)).filter(Boolean);
        if (!searchQuery.trim()) return all;
        const q = searchQuery.toLowerCase();
        const sysMatches = (sys.name || '').toLowerCase().includes(q) || systemKey.toLowerCase().includes(q);
        if (sysMatches) return all;
        return all.filter(e => (e.name || '').toLowerCase().includes(q));
    }, [parsedFile, searchQuery]);

    const totalEmitterCount = useMemo(() => {
        if (!parsedFile) return 0;
        return (parsedFile.systemOrder || []).reduce((sum, sKey) => {
            const sys = parsedFile.systems.get(sKey);
            return sum + (sys ? (sys.emitterKeys || []).length : 0);
        }, 0);
    }, [parsedFile]);

    // ── File Operations ──
    const processFile = useCallback(async (filePath) => {
        try {
            setIsLoading(true);
            setLoadingText('Processing .bin file...');

            setBinPath(filePath);

            const binDir = path.dirname(filePath);
            const binName = path.basename(filePath, '.bin');
            const convertedPyPath = path.join(binDir, `${binName}.py`);

            setBinPath(filePath);

            if (!fs.existsSync(convertedPyPath)) {
                setLoadingText('Converting .bin to .py...');
                try {
                    await ToPy(filePath);
                } catch (err) {
                    throw new Error(`RitoBin failed: ${err.message}`);
                }
                if (!fs.existsSync(convertedPyPath)) throw new Error('Failed to create .py file');
            }

            setLoadingText('Reading & parsing file...');
            const content = loadFileWithBackup(convertedPyPath, 'ParticleRandomizer');

            setPyPath(convertedPyPath);
            setPyContent(content);
            setGeneratedContent('');
            setCanSave(false);
            setCanCopyAssets(false);
            setDetectedAssets({});
            setSelected(new Set());
            setSelectedSystems(new Set());
            setSearchQuery('');

            const parsed = parseVfxFile(content);
            setParsedFile(parsed);

            // Expand all systems by default
            setExpandedSystems(new Set(parsed.systemOrder || []));

            const systemCount = parsed.stats?.systemCount || 0;
            const emitterCount = parsed.stats?.emitterCount || 0;
            if (systemCount > 0) {
                setStatus(`Loaded: ${systemCount} VFX system${systemCount !== 1 ? 's' : ''}, ${emitterCount} emitters`, 'success');
            } else {
                setStatus('File loaded but no VFX systems found', 'error');
            }
        } catch (error) {
            console.error('Load error:', error);
            setStatus(`Error: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [setStatus]);

    const loadBinFile = useCallback(async () => {
        if (!window.require) { setStatus('Electron environment required', 'error'); return; }
        const useNativeFileBrowser = await electronPrefs.get('UseNativeFileBrowser');
        const { ipcRenderer } = window.require('electron');

        if (useNativeFileBrowser) {
            const result = await ipcRenderer.invoke('dialog:openFile', {
                title: 'Select a .bin file',
                defaultPath: binPath ? nodePath?.dirname(binPath) : undefined,
                filters: [{ name: 'Bin Files', extensions: ['bin'] }, { name: 'All Files', extensions: ['*'] }],
                properties: ['openFile']
            });
            if (result.canceled || !result.filePaths?.length) return;
            await processFile(result.filePaths[0]);
        } else {
            openAssetPreview(binPath || undefined, null, 'particle-randomizer-bin');
        }
    }, [binPath, processFile, setStatus]);

    useEffect(() => {
        const handleAssetSelected = (e) => {
            const { path: filePath, mode } = e.detail || {};
            if (filePath && mode === 'particle-randomizer-bin') processFile(filePath);
        };
        window.addEventListener('asset-preview-selected', handleAssetSelected);
        return () => window.removeEventListener('asset-preview-selected', handleAssetSelected);
    }, [processFile]);

    // ── Selection ──
    const toggleEmitter = useCallback((emitterKey, systemKey) => {
        // If this system was in system mode, exit it when toggling individual emitters
        if (systemKey) {
            setSelectedSystems(prev => {
                if (!prev.has(systemKey)) return prev;
                const next = new Set(prev);
                next.delete(systemKey);
                return next;
            });
        }
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(emitterKey)) next.delete(emitterKey);
            else next.add(emitterKey);
            return next;
        });
    }, []);

    const toggleSystemMode = useCallback((systemKey) => {
        if (selectedSystems.has(systemKey)) {
            setSelectedSystems(prev => {
                const next = new Set(prev);
                next.delete(systemKey);
                return next;
            });
        } else {
            setSelectedSystems(prev => {
                const next = new Set(prev);
                next.add(systemKey);
                return next;
            });
            // Clear individual emitter selections for this system separately
            if (parsedFile) {
                const sys = parsedFile.systems.get(systemKey);
                if (sys) {
                    setSelected(prev => {
                        const next = new Set(prev);
                        for (const eKey of sys.emitterKeys || []) next.delete(eKey);
                        return next;
                    });
                }
            }
        }
    }, [selectedSystems, parsedFile]);

    const toggleSystemExpand = useCallback((systemKey) => {
        setExpandedSystems(prev => {
            const next = new Set(prev);
            if (next.has(systemKey)) next.delete(systemKey);
            else next.add(systemKey);
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        if (!parsedFile) return;
        setSelectedSystems(new Set());
        const all = new Set();
        for (const sKey of parsedFile.systemOrder || []) {
            const sys = parsedFile.systems.get(sKey);
            if (!sys) continue;
            for (const eKey of sys.emitterKeys || []) {
                const em = parsedFile.emitters.get(eKey);
                if (em && em.name && em.name !== 'Unnamed') all.add(eKey);
            }
        }
        setSelected(all);
    }, [parsedFile]);

    const deselectAll = useCallback(() => {
        setSelected(new Set());
        setSelectedSystems(new Set());
    }, []);

    const selectVisible = useCallback(() => {
        setSelected(prev => {
            const next = new Set(prev);
            for (const sKey of filteredSystemOrder) {
                const emitters = getVisibleEmitters(sKey);
                for (const em of emitters) {
                    if (em.name && em.name !== 'Unnamed') next.add(em.key);
                }
            }
            return next;
        });
    }, [filteredSystemOrder, getVisibleEmitters]);

    const expandAll = useCallback(() => {
        if (!parsedFile) return;
        setExpandedSystems(new Set(parsedFile.systemOrder || []));
    }, [parsedFile]);

    const collapseAll = useCallback(() => setExpandedSystems(new Set()), []);

    // ── Generate ──
    const handleGenerate = useCallback(() => {
        if (!pyContent || !parsedFile) { setStatus('Load a file first', 'error'); return; }
        if (selected.size === 0 && selectedSystems.size === 0) { setStatus('Select at least one emitter or system', 'error'); return; }
        if (numCopies < 1 || numCopies > 10) { setStatus('Copies must be between 1 and 10', 'error'); return; }

        let variantPrefixes;
        if (useCustomPrefix) {
            variantPrefixes = customPrefixes.map(p => p.trim());
            if (variantPrefixes.some(p => !p)) { setStatus('Fill in all custom prefix fields', 'error'); return; }
        } else {
            variantPrefixes = Array.from({ length: numCopies }, (_, i) => `variant${i + 1}`);
        }

        if (separateAssets) {
            const folders = assetFolderNames.map(f => f.trim());
            if (folders.some(f => !f)) { setStatus('Fill in all asset folder names', 'error'); return; }
        }

        try {
            let result = pyContent;

            // System-level mode: duplicate whole system, add randomizer emitter to original
            if (selectedSystems.size > 0) {
                result = generateSystemRandomizers(result, parsedFile, Array.from(selectedSystems), variantPrefixes);
            }

            // Per-emitter mode: create mini variant systems, replace emitter with randomizer
            let emitterResolvedNames = [];
            if (selected.size > 0) {
                const emitterResult = generateEmitterRandomizers(result, parsedFile, Array.from(selected), variantPrefixes);
                result = emitterResult.content;
                emitterResolvedNames = emitterResult.resolvedBaseNames;
            }

            if (separateAssets) {
                const folders = assetFolderNames.map(f => f.trim());
                const basePaths = [...emitterResolvedNames];
                for (const sKey of selectedSystems) {
                    basePaths.push(sKey);
                }
                const assetsResult = separateAssetsPerCopy(result, basePaths, numCopies, variantPrefixes, folders);
                result = assetsResult.content;
                setDetectedAssets(assetsResult.assetsByFolder);
                setCanCopyAssets(true);
            } else {
                setDetectedAssets({});
                setCanCopyAssets(false);
            }

            setGeneratedContent(result);
            setCanSave(true);
            // Update tree immediately to reflect new state
            setPyContent(result);
            setParsedFile(parseVfxFile(result));
            setSelected(new Set());
            setSelectedSystems(new Set());

            const parts = [];
            if (selected.size > 0) parts.push(`${selected.size} emitter${selected.size !== 1 ? 's' : ''}`);
            if (selectedSystems.size > 0) parts.push(`${selectedSystems.size} system${selectedSystems.size !== 1 ? 's' : ''}`);
            setStatus(`Processed ${parts.join(' + ')} × ${numCopies} copies`, 'success');
        } catch (error) {
            setStatus(`Error: ${error.message}`, 'error');
        }
    }, [pyContent, parsedFile, selected, selectedSystems, numCopies, useCustomPrefix, customPrefixes, separateAssets, assetFolderNames, setStatus]);

    // ── Save ──
    const handleSave = useCallback(async () => {
        if (!generatedContent || !pyPath || !binPath) { setStatus('Nothing to save', 'error'); return; }
        try {
            setIsLoading(true);
            setLoadingText('Creating backup...');
            const fs = window.require('fs');
            const path = window.require('path');

            if (fs.existsSync(pyPath)) {
                createBackup(pyPath, fs.readFileSync(pyPath, 'utf8'), 'ParticleRandomizer');
            }
            setLoadingText('Saving modified .py...');
            fs.writeFileSync(pyPath, generatedContent, 'utf8');

            setLoadingText('Converting .py back to .bin...');
            await ToBin(pyPath, binPath);

            setStatus('Saved successfully! Backup created in zbackups/', 'success');
            setPyContent(generatedContent);
            setGeneratedContent('');
            setCanSave(false);
        } catch (error) {
            setStatus(`Save failed: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [generatedContent, pyPath, binPath, setStatus]);

    // ── Copy Assets ──
    const handleCopyAssets = useCallback(() => {
        if (!Object.keys(detectedAssets).length || !binPath) { setStatus('No assets to copy', 'error'); return; }
        setIsLoading(true);
        setLoadingText('Copying assets...');
        try {
            const result = copyAssetsToFolders(detectedAssets, binPath);
            if (result.success) {
                let msg = `Copied ${result.totalCopied} assets to ${result.foldersCreated} folders`;
                if (result.totalSkipped > 0) msg += ` (${result.totalSkipped} already existed)`;
                setStatus(msg, 'success');
            } else {
                let msg = `Copied ${result.totalCopied}. Failed: ${result.totalFailed}`;
                if (result.failures.length > 0) msg += ` — ${result.failures[0].asset}: ${result.failures[0].reason}`;
                setStatus(msg, 'error');
            }
        } catch (error) {
            setStatus(`Copy failed: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [detectedAssets, binPath, setStatus]);

    const updatePrefix = (idx, val) => setCustomPrefixes(prev => { const a = [...prev]; a[idx] = val; return a; });
    const updateAssetFolder = (idx, val) => setAssetFolderNames(prev => { const a = [...prev]; a[idx] = val; return a; });

    // ════════════════════════════════════════════════════════
    //  RENDER
    // ════════════════════════════════════════════════════════

    return (
        <div className="particle-randomizer">
            {isLoading && <GlowingSpinner text={loadingText} />}

            {/* ── Header ── */}
            <div className="pr-header">
                <div className="pr-header-top">
                    <h1>
                        Particle Randomizer
                        {binPath && <span>— {nodePath?.basename(binPath)}</span>}
                    </h1>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="pr-btn pr-btn-green" onClick={loadBinFile}>
                            📁 Load .bin
                        </button>
                    </div>
                </div>
                <div className={`pr-status ${statusType}`}>{statusMessage}</div>
            </div>

            {/* ── Main Content ── */}
            <div className="pr-main">

                {/* ── Left Panel: VFX Tree ── */}
                <div className="pr-left-panel">
                    {parsedFile && parsedFile.systemOrder?.length > 0 ? (
                        <>
                            {/* Search */}
                            <div className="pr-search-bar">
                                <input
                                    className="pr-search-input"
                                    type="text"
                                    placeholder="🔍 Search systems or emitters..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (
                                    <span className="pr-search-count">
                                        {filteredSystemOrder.length} / {parsedFile.systemOrder.length}
                                    </span>
                                )}
                            </div>

                            {/* Selection controls */}
                            <div className="pr-selection-bar">
                                <button className="pr-btn pr-btn-small pr-btn-accent" onClick={selectAll}>All</button>
                                <button className="pr-btn pr-btn-small pr-btn-accent" onClick={deselectAll}>None</button>
                                <button className="pr-btn pr-btn-small pr-btn-accent" onClick={selectVisible}>Visible</button>
                                <button className="pr-btn pr-btn-small pr-btn-accent" onClick={expandAll}>Expand</button>
                                <button className="pr-btn pr-btn-small pr-btn-accent" onClick={collapseAll}>Collapse</button>
                                <span className="pr-selection-count">
                                    {selected.size > 0 && selectedSystems.size > 0
                                        ? `${selected.size} emitters + ${selectedSystems.size} systems`
                                        : selectedSystems.size > 0
                                            ? `${selectedSystems.size} system${selectedSystems.size !== 1 ? 's' : ''} (whole)`
                                            : `${selected.size} / ${totalEmitterCount} emitters`
                                    }
                                </span>
                            </div>

                            {/* VFX Tree */}
                            <div className="pr-vfx-list">
                                {filteredSystemOrder.map(systemKey => {
                                    const sys = parsedFile.systems.get(systemKey);
                                    if (!sys) return null;
                                    const isExpanded = expandedSystems.has(systemKey);
                                    const visibleEmitters = getVisibleEmitters(systemKey);
                                    const allEmitters = (sys.emitterKeys || [])
                                        .map(k => parsedFile.emitters.get(k)).filter(Boolean);
                                    const namedEmitters = allEmitters.filter(e => e.name && e.name !== 'Unnamed');
                                    const isSystemMode = selectedSystems.has(systemKey);
                                    const selectedInSystem = namedEmitters.filter(e => selected.has(e.key)).length;
                                    const isSystemRandomized = namedEmitters.length > 0 && namedEmitters.every(e => e.name?.endsWith('_randomized'));
                                    const hasAnyRandomized = !isSystemRandomized && namedEmitters.some(e => e.name?.endsWith('_randomized'));
                                    const selectableEmitters = namedEmitters.filter(e => !e.name?.endsWith('_randomized'));
                                    const allSelected = !isSystemMode && selectedInSystem === selectableEmitters.length && selectableEmitters.length > 0;
                                    const someSelected = !isSystemMode && selectedInSystem > 0 && !allSelected;
                                    const displayName = (sys.name || systemKey).split('/').pop();

                                    return (
                                        <div key={systemKey} className="pr-system-group">
                                            {/* System header row */}
                                            <div
                                                className={`pr-system-header${isSystemRandomized ? ' is-randomized' : isSystemMode ? ' system-mode' : hasAnyRandomized ? ' has-randomized' : someSelected || allSelected ? ' has-selection' : ''}`}
                                                onClick={() => toggleSystemExpand(systemKey)}
                                            >
                                                <span className="pr-expand-icon">
                                                    {isExpanded ? '▼' : '▶'}
                                                </span>
                                                <input
                                                    type="checkbox"
                                                    className="pr-vfx-checkbox"
                                                    checked={isSystemMode || allSelected}
                                                    ref={el => { if (el) el.indeterminate = someSelected; }}
                                                    onChange={() => toggleSystemMode(systemKey)}
                                                    onClick={e => e.stopPropagation()}
                                                    disabled={isSystemRandomized}
                                                />
                                                <span className="pr-vfx-label pr-system-name" title={systemKey}>
                                                    {displayName}
                                                </span>
                                                {isSystemRandomized && (
                                                    <span className="pr-badge pr-badge-done" title="System already randomized">
                                                        randomized
                                                    </span>
                                                )}
                                                {hasAnyRandomized && (
                                                    <span className="pr-badge pr-badge-done" title="Some emitters already randomized">
                                                        partial
                                                    </span>
                                                )}
                                                {isSystemMode && !isSystemRandomized && (
                                                    <span className="pr-badge pr-badge-system-mode" title="Whole-system randomizer mode">
                                                        system
                                                    </span>
                                                )}
                                                <span className="pr-badge pr-badge-variant">
                                                    {allEmitters.length}
                                                </span>
                                            </div>

                                            {/* Emitter rows */}
                                            {isExpanded && visibleEmitters.map(emitter => {
                                                const isSelected = selected.has(emitter.key);
                                                const isUnnamed = !emitter.name || emitter.name === 'Unnamed';
                                                const isRandomized = emitter.name?.endsWith('_randomized');
                                                const isDisabled = isUnnamed || isRandomized;
                                                return (
                                                    <div
                                                        key={emitter.key}
                                                        className={`pr-emitter-row${isSelected ? ' selected' : ''}${isUnnamed ? ' unnamed' : ''}${isRandomized ? ' randomized' : ''}`}
                                                        onClick={() => !isDisabled && toggleEmitter(emitter.key, systemKey)}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="pr-vfx-checkbox"
                                                            checked={isSelected}
                                                            disabled={isDisabled}
                                                            onChange={() => !isDisabled && toggleEmitter(emitter.key, systemKey)}
                                                            onClick={e => e.stopPropagation()}
                                                        />
                                                        <span className="pr-vfx-label" title={emitter.name}>
                                                            {emitter.name || 'Unnamed'}
                                                        </span>
                                                        {isRandomized && (
                                                            <span className="pr-badge pr-badge-done">
                                                                done
                                                            </span>
                                                        )}
                                                        {isUnnamed && !isRandomized && (
                                                            <span className="pr-badge" style={{ color: '#555', borderColor: '#333' }}>
                                                                no name
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="pr-empty-state">
                            <div className="icon">🎲</div>
                            <div>Load a .bin file to see VFX systems</div>
                        </div>
                    )}
                </div>

                {/* ── Right Panel: Config ── */}
                <div className="pr-right-panel">
                    <div className="pr-config-area">

                        {/* Copies */}
                        <div className="pr-section">
                            <div className="pr-section-title">
                                Copies
                                <span className="badge">Step 1</span>
                            </div>
                            <div className="pr-number-row">
                                <label>Number of variants (1–10):</label>
                                <input
                                    className="pr-number-input"
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={numCopies}
                                    onChange={e => {
                                        const v = parseInt(e.target.value);
                                        if (!isNaN(v) && v >= 1 && v <= 10) setNumCopies(v);
                                    }}
                                />
                            </div>
                        </div>

                        {/* Custom Prefix */}
                        <div className="pr-section">
                            <div className="pr-section-title">
                                Variant Names
                                <span className="badge">Optional</span>
                            </div>
                            <div className="pr-option">
                                <input
                                    type="checkbox"
                                    id="pr-custom-prefix"
                                    checked={useCustomPrefix}
                                    onChange={e => setUseCustomPrefix(e.target.checked)}
                                />
                                <label htmlFor="pr-custom-prefix">
                                    Custom names instead of variant1, variant2…
                                </label>
                                <span className="pr-info-tip" title="Custom names used in system paths, e.g. _EmitterName_fire instead of _EmitterName_variant1">?</span>
                            </div>

                            {useCustomPrefix && (
                                <div className="pr-prefix-grid">
                                    {customPrefixes.map((val, i) => (
                                        <React.Fragment key={i}>
                                            <label>Variant {i + 1}:</label>
                                            <input
                                                className="pr-prefix-input"
                                                type="text"
                                                placeholder={`e.g. fire, ice, dark…`}
                                                value={val}
                                                onChange={e => updatePrefix(i, e.target.value)}
                                            />
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Separate Assets */}
                        <div className="pr-section">
                            <div className="pr-section-title">
                                Separate Assets
                                <span className="badge" style={{
                                    background: separateAssets ? 'rgba(34,197,94,0.15)' : undefined,
                                    borderColor: separateAssets ? '#22c55e' : undefined,
                                    color: separateAssets ? '#22c55e' : undefined
                                }}>
                                    {separateAssets ? 'Active' : 'Off'}
                                </span>
                            </div>
                            <div className="pr-option">
                                <input
                                    type="checkbox"
                                    id="pr-separate-assets"
                                    checked={separateAssets}
                                    onChange={e => setSeparateAssets(e.target.checked)}
                                />
                                <label htmlFor="pr-separate-assets">
                                    Give each variant its own particle folder
                                </label>
                                <span className="pr-info-tip" title="Each variant gets its own copy of textures/meshes so you can modify them independently.">?</span>
                            </div>

                            {separateAssets && (
                                <>
                                    <div className="pr-asset-hint">
                                        Each variant gets a subfolder. A <code>_backup</code> folder with originals is included.
                                    </div>
                                    <div className="pr-asset-grid">
                                        {assetFolderNames.map((val, i) => (
                                            <React.Fragment key={i}>
                                                <label>Variant {i + 1}:</label>
                                                <input
                                                    className="pr-prefix-input"
                                                    type="text"
                                                    placeholder={`e.g. variant_${i + 1}`}
                                                    value={val}
                                                    onChange={e => updateAssetFolder(i, e.target.value)}
                                                />
                                                <span className="path-hint">…/{val || '…'}/</span>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </>
                            )}

                            {Object.keys(detectedAssets).length > 0 && (
                                <div className="pr-assets-output">
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>
                                        📁 Detected Assets
                                    </div>
                                    {Object.entries(detectedAssets).map(([folder, assets]) => (
                                        <div key={folder} className="pr-assets-folder">
                                            <div className="pr-assets-folder-name">
                                                {folder === '_backup' ? '🔒 _backup (originals)' : `📂 ${folder}`}
                                                <span style={{ opacity: 0.6 }}> ({assets.length})</span>
                                            </div>
                                            <ul>
                                                {assets.slice(0, 8).map((a, i) => (
                                                    <li key={i}>{a.filename}</li>
                                                ))}
                                                {assets.length > 8 && (
                                                    <li style={{ color: '#666' }}>…and {assets.length - 8} more</li>
                                                )}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Action Bar ── */}
                    <div className="pr-action-bar">
                        <button
                            className="pr-btn pr-btn-green"
                            onClick={handleGenerate}
                            disabled={!pyContent || (selected.size === 0 && selectedSystems.size === 0)}
                        >
                            🎲 Randomize!
                        </button>
                        <button
                            className="pr-btn pr-btn-amber"
                            onClick={handleSave}
                            disabled={!canSave}
                        >
                            💾 Save
                        </button>
                        {canCopyAssets && (
                            <button className="pr-btn pr-btn-blue" onClick={handleCopyAssets}>
                                📂 Copy Assets to Folders
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
