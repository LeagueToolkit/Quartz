/**
 * ParticleRandomizer - VFX Particle Randomizer
 *
 * Duplicates VfxSystemDefinitionData entries with per-copy suffixes,
 * adds ResourceResolver entries, injects a randomizer emitter into the
 * original system, and separates assets per copy by default.
 *
 * Uses the same ritobin .bin → .py → edit → .py → .bin pipeline as BinEditorV2.
 * Uses the same backup system as Paint2 / Port.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import electronPrefs from '../utils/electronPrefs.js';
import { loadFileWithBackup, createBackup } from '../utils/backupManager.js';
import { openAssetPreview } from '../utils/assetPreviewEvent';
import GlowingSpinner from '../components/GlowingSpinner.js';
import './ParticleRandomizer.css';

const nodeFs = window.require ? window.require('fs') : null;
const nodePath = window.require ? window.require('path') : null;

// ════════════════════════════════════════════════════════════════
//  CORE LOGIC  (ported from Particle-Randomizer-main/renderer.js)
// ════════════════════════════════════════════════════════════════

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Find all VfxSystemDefinitionData paths in .py content */
function findVfxEntries(content) {
    const regex = /"([^"]+)"\s*=\s*VfxSystemDefinitionData\s*\{/g;
    const entries = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        entries.push(match[1]);
    }
    return entries;
}

/**
 * Analyze VFX entries and detect which ones already have variants or randomizer emitters.
 * Also identifies which entries are "sub-variants" (children of a randomizer).
 */
function analyzeExistingVariants(content, entries) {
    const info = {};
    const subVariants = new Set();

    // First pass: identify who has a randomizer and what its children are
    for (const entry of entries) {
        const startPattern = `"${entry}" = VfxSystemDefinitionData {`;
        const startIndex = content.indexOf(startPattern);
        if (startIndex === -1) continue;

        let braceCount = 0, inBlock = false, endIndex = startIndex;
        for (let i = startIndex; i < content.length; i++) {
            if (content[i] === '{') { braceCount++; inBlock = true; }
            else if (content[i] === '}') {
                braceCount--;
                if (inBlock && braceCount === 0) { endIndex = i + 1; break; }
            }
        }
        const block = content.substring(startIndex, endIndex);

        // Find existing children in RandomizerByDisco
        const children = [];
        if (block.includes('RandomizerByDisco')) {
            const childRegex = /effectKey:\s*hash\s*=\s*"([^"]+)"/g;
            let m;
            while ((m = childRegex.exec(block)) !== null) {
                children.push(m[1]);
                subVariants.add(m[1]);
            }
        }

        info[entry] = {
            hasRandomizer: children.length > 0,
            existingChildren: children,
            variantCount: children.length,
            variantNames: [],
            isSubVariant: false // will be set in second pass
        };
    }

    // Second pass: mark sub-variants and find loose variants
    for (const entry of entries) {
        if (!info[entry]) info[entry] = {};

        if (subVariants.has(entry)) {
            info[entry].isSubVariant = true;
        }

        // Loose variant check (path looks like entry_suffix but not explicitly in a randomizer)
        const escaped = escapeRegex(entry);
        const variantRegex = new RegExp(`"${escaped}_([^"]+)"\\s*=\\s*VfxSystemDefinitionData\\s*\\{`, 'g');
        const variants = [];
        let m;
        while ((m = variantRegex.exec(content)) !== null) {
            variants.push(m[1]);
        }
        info[entry].hasVariants = (variants.length > 0 || info[entry].hasRandomizer);

        // Use the better count and names
        const finalVariants = variants.length > 0 ? variants : (info[entry].existingChildren || []).map(c => c.split('_').pop() || '_');
        info[entry].variantCount = Math.max(info[entry].variantCount || 0, variants.length);
        info[entry].variantNames = finalVariants.slice(0, 5);
    }

    return { info, subVariants };
}

/**
 * Extract all asset paths (ASSETS/...) from a given VFX block.
 */
function extractAssetPaths(blockContent) {
    const assetRegex = /[":]?\s*(ASSETS\/[^"\s]+\.(?:dds|tex|scb|skn|skl|bnk|wpk|troybin|bin))/gi;
    const paths = new Set();
    let m;
    while ((m = assetRegex.exec(blockContent)) !== null) {
        paths.add(m[1]);
    }
    return Array.from(paths);
}

/**
 * Find the block content for a VfxSystemDefinitionData entry.
 */
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


/** Duplicate a VFX block N times with suffixed paths */
function generateDuplicates(content, originalPath, numCopies, customPrefixes = null) {
    let result = content;

    const found = findVfxBlock(result, originalPath);
    if (!found) {
        throw new Error(`Could not find VfxSystemDefinitionData for path: ${originalPath}`);
    }
    const { block: originalBlock } = found;

    const particleNameMatch = originalBlock.match(/particleName:\s*string\s*=\s*"([^"]+)"/);
    const particlePathMatch = originalBlock.match(/particlePath:\s*string\s*=\s*"([^"]+)"/);

    if (!particleNameMatch || !particlePathMatch) {
        throw new Error('Could not find particleName or particlePath in VfxSystemDefinitionData');
    }

    const originalParticleName = particleNameMatch[1];
    const originalParticlePath = particlePathMatch[1];

    let duplicates = '';
    const suffixes = [];

    for (let i = 1; i <= numCopies; i++) {
        const suffix = customPrefixes ? `_${customPrefixes[i - 1]}` : `_${i}`;
        suffixes.push(suffix);

        const newPath = `${originalPath}${suffix}`;
        const newParticleName = `${originalParticleName}${suffix}`;
        const newParticlePath = `${originalParticlePath}${suffix}`;

        let duplicateBlock = originalBlock
            .replace(`"${originalPath}"`, `"${newPath}"`)
            .replace(/particleName:\s*string\s*=\s*"[^"]+"/, `particleName: string = "${newParticleName}"`)
            .replace(/particlePath:\s*string\s*=\s*"[^"]+"/, `particlePath: string = "${newParticlePath}"`);

        duplicates += '\n    ' + duplicateBlock + '\n';
    }

    const insertPos = result.indexOf(originalBlock) + originalBlock.length;
    result = result.slice(0, insertPos) + duplicates + result.slice(insertPos);

    result = addToResourceResolver(result, originalPath, suffixes);
    result = addRandomizerEmitter(result, originalPath, suffixes);

    return { content: result, suffixes };
}

/** Append new entries to the ResourceResolver map */
function addToResourceResolver(content, originalPath, suffixes) {
    const resourceMapStart = content.indexOf('resourceMap: map[hash,link] = {');
    if (resourceMapStart === -1) return content;

    const escapedPath = escapeRegex(originalPath);
    const resourceEntryRegex = new RegExp(`(\\s*)"([^"]+)"\\s*=\\s*"${escapedPath}"`, 'g');
    let lastMatch = null, match;
    while ((match = resourceEntryRegex.exec(content)) !== null) lastMatch = match;

    if (!lastMatch) {
        const simpleSearch = `"${originalPath}"`;
        const searchIndex = content.indexOf(simpleSearch, resourceMapStart);
        if (searchIndex === -1) {
            // Original not found - find ANY entry to get indentation
            const anyEntryRegex = /^(\s*)\"[^\"]+\"\s*=\s*\"[^\"]+\"/m;
            const anyMatch = content.substring(resourceMapStart).match(anyEntryRegex);

            const indent = anyMatch ? anyMatch[1] : '            ';

            // Find end of resourceMap
            let braceCount = 0, inMap = false, mapEnd = resourceMapStart;
            for (let i = resourceMapStart; i < content.length; i++) {
                if (content[i] === '{') { braceCount++; inMap = true; }
                else if (content[i] === '}') {
                    braceCount--;
                    if (inMap && braceCount === 0) { mapEnd = i; break; }
                }
            }

            let newEntries = '';
            for (const suffix of suffixes) {
                newEntries += `${indent}"${originalPath}${suffix}" = "${originalPath}${suffix}"\n`;
            }
            return content.slice(0, mapEnd) + newEntries + content.slice(mapEnd);
        }

        let lineStart = searchIndex;
        while (lineStart > 0 && content[lineStart] !== '\n') lineStart--;
        lineStart++;
        let lineEnd = searchIndex;
        while (lineEnd < content.length && content[lineEnd] !== '\n') lineEnd++;

        const fullLine = content.substring(lineStart, lineEnd);
        const lineMatch = fullLine.match(/"([^"]+)"\s*=\s*"[^"]+"/);
        if (!lineMatch) return content;

        const insertPos = lineEnd + (content[lineEnd] === '\n' ? 1 : 0);
        const indentMatch = fullLine.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '            ';

        let newEntries = '';
        for (const suffix of suffixes) {
            newEntries += `${indent}"${originalPath}${suffix}" = "${originalPath}${suffix}"\n`;
        }
        return content.slice(0, insertPos) + newEntries + content.slice(insertPos);
    }

    let insertPos = lastMatch.index + lastMatch[0].length;
    if (content[insertPos] === '\n') {
        insertPos++;
    } else {
        while (insertPos < content.length && content[insertPos] !== '\n') insertPos++;
        if (content[insertPos] === '\n') insertPos++;
    }

    const indent = lastMatch[1];
    let newEntries = '';
    for (const suffix of suffixes) {
        newEntries += `${indent}"${originalPath}${suffix}" = "${originalPath}${suffix}"\n`;
    }
    return content.slice(0, insertPos) + newEntries + content.slice(insertPos);
}

/** Add randomizer emitter pointing to duplicates. Appends if one already exists. */
function addRandomizerEmitter(content, originalPath, suffixes) {
    const startPattern = `"${escapeRegex(originalPath)}" = VfxSystemDefinitionData {`;
    const startIndex = content.indexOf(startPattern);
    if (startIndex === -1) return content;

    const complexEmitterStart = content.indexOf('complexEmitterDefinitionData: list[pointer] = {', startIndex);
    if (complexEmitterStart === -1) return content;

    const openBracePos = content.indexOf('{', complexEmitterStart + 'complexEmitterDefinitionData: list[pointer] = '.length);
    if (openBracePos === -1) return content;

    let braceCount = 1, closePos = openBracePos + 1;
    while (closePos < content.length && braceCount > 0) {
        if (content[closePos] === '{') braceCount++;
        else if (content[closePos] === '}') braceCount--;
        closePos++;
    }
    if (braceCount !== 0) return content;
    const closeBracePos = closePos - 1;

    const existingBlock = content.substring(openBracePos + 1, closeBracePos);
    let allChildren = [];

    // Check if we are appending to an existing randomizer
    if (existingBlock.includes('RandomizerByDisco')) {
        const childRegex = /effectKey:\s*hash\s*=\s*"([^"]+)"/g;
        let m;
        while ((m = childRegex.exec(existingBlock)) !== null) {
            allChildren.push(m[1]);
        }
    }

    // Add new ones
    for (const suffix of suffixes) {
        const newChild = `${originalPath}${suffix}`;
        if (!allChildren.includes(newChild)) {
            allChildren.push(newChild);
        }
    }

    const childrenIdentifiers = allChildren.map(child => `                        VfxChildIdentifier {
                            effectKey: hash = "${child}"
                        }`).join('\n');

    const totalVariants = allChildren.length;

    const randomizerEmitter = `
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                isSingleParticle: flag = true
                childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData {
                    childrenIdentifiers: list[embed] = {
${childrenIdentifiers}
                    }
                    childrenProbability: embed = ValueFloat {
                        constantValue: f32 = 1
                        dynamics: pointer = VfxAnimatedFloatVariableData {
                            probabilityTables: list[pointer] = {
                                VfxProbabilityTableData {
                                    keyTimes: list[f32] = {
                                        0
                                        1
                                    }
                                    keyValues: list[f32] = {
                                        0
                                        ${totalVariants}
                                    }
                                }
                            }
                            times: list[f32] = {
                                0
                            }
                            values: list[f32] = {
                                1
                            }
                        }
                    }
                }
                emitterName: string = "RandomizerByDisco"
                shape: embed = VfxShape {
                    emitOffset: embed = ValueVector3 {
                        constantValue: vec3 = { 0, 0, 0 }
                    }
                }
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 0, 0 }
                }
            }
        `;

    return content.slice(0, openBracePos + 1) + randomizerEmitter + content.slice(closeBracePos);
}

/**
 * For each duplicate, repath ALL its ASSETS/... string values to ASSETS/<folderName>/<filename>.
 * This flattens deep paths so each variant has its own isolated asset folder.
 * Also creates a _backup entry tracking the original asset paths.
 *
 * Example: "ASSETS/petalsofspringvfx/Characters/Jayce/.../Lillia_Skin19_E_Mote.tex"
 *        → "ASSETS/variant_1/Lillia_Skin19_E_Mote.tex"
 *
 * Returns { content, assetsByFolder } where each folder maps to an array of
 *   { original: "ASSETS/deep/path/file.tex", filename: "file.tex" }
 */
function separateAssetsPerCopy(content, originalPaths, numCopies, customPrefixes, assetFolderNames) {
    let modifiedContent = content;
    const assetsByFolder = {};

    // Prepare per-folder maps
    for (const fn of assetFolderNames) { assetsByFolder[fn] = new Map(); } // Map<filename, originalFullPath>
    assetsByFolder['_backup'] = new Map();

    for (const originalPath of originalPaths) {
        // Collect original assets for backup
        const origBlock = findVfxBlock(modifiedContent, originalPath);
        if (origBlock) {
            const origAssets = extractAssetPaths(origBlock.block);
            origAssets.forEach(a => {
                const fn = a.split('/').pop();
                assetsByFolder['_backup'].set(fn, a);
            });
        }

        for (let i = 0; i < numCopies; i++) {
            const suffix = customPrefixes ? `_${customPrefixes[i]}` : `_${i + 1}`;
            const duplicatePath = `${originalPath}${suffix}`;
            const folderName = assetFolderNames[i];

            const found = findVfxBlock(modifiedContent, duplicatePath);
            if (!found) continue;

            const { start: startIndex, end: endIndex, block: vfxBlock } = found;

            // Find all ASSETS/ paths in string values within this block
            const assetRegex = /(ASSETS\/[^"\s]+)/gi;
            let m;
            const replacements = [];
            while ((m = assetRegex.exec(vfxBlock)) !== null) {
                const assetPath = m[1];
                const fileName = assetPath.split('/').pop();
                const newPath = `ASSETS/${folderName}/${fileName}`;

                // Track: this file needs to be copied from original location to variant folder
                assetsByFolder[folderName].set(fileName, assetPath);

                if (assetPath !== newPath) {
                    replacements.push({ old: assetPath, new: newPath });
                }
            }

            // Apply replacements (deduplicate & sort longest first to avoid partial matches)
            const uniqueReplacements = [];
            const seen = new Set();
            for (const r of replacements) {
                if (!seen.has(r.old)) {
                    seen.add(r.old);
                    uniqueReplacements.push(r);
                }
            }
            uniqueReplacements.sort((a, b) => b.old.length - a.old.length);

            let updatedBlock = vfxBlock;
            for (const repl of uniqueReplacements) {
                updatedBlock = updatedBlock.split(repl.old).join(repl.new);
            }
            modifiedContent = modifiedContent.substring(0, startIndex) + updatedBlock + modifiedContent.substring(endIndex);
        }
    }

    // Convert Maps to arrays of { original, filename } for the UI and copy logic
    const result = {};
    for (const folder in assetsByFolder) {
        result[folder] = Array.from(assetsByFolder[folder].entries()).map(([filename, original]) => ({
            original,
            filename
        }));
    }
    return { content: modifiedContent, assetsByFolder: result };
}

/**
 * Copy detected assets to their per-variant folders on disk.
 * Creates ASSETS/<folderName>/ in the PROJECT ROOT (parent of data/ folder).
 * Source: original deep path resolved from project root.
 */
function copyAssetsToFolders(assetsByFolder, sourceFilePath) {
    if (!nodeFs || !nodePath) return { success: false, error: 'No Node.js' };

    const binDir = nodePath.dirname(sourceFilePath);

    // Walk UP from binDir to find project root (the folder that CONTAINS data/)
    let projectRoot = binDir;
    let current = binDir;
    while (current && current !== nodePath.dirname(current)) {
        const parent = nodePath.dirname(current);
        const baseName = nodePath.basename(current).toLowerCase();

        // If current folder is 'data', the parent is the project root
        if (baseName === 'data') {
            projectRoot = parent;
            break;
        }
        current = parent;
    }

    let totalCopied = 0, totalFailed = 0, totalSkipped = 0, foldersCreated = 0;
    const failures = [];

    for (const [folderName, assets] of Object.entries(assetsByFolder)) {
        // Create ASSETS/<folderName>/ in project root
        const destDir = nodePath.join(projectRoot, 'ASSETS', folderName);
        if (!nodeFs.existsSync(destDir)) {
            nodeFs.mkdirSync(destDir, { recursive: true });
            foldersCreated++;
        }

        for (const asset of assets) {
            try {
                const destPath = nodePath.join(destDir, asset.filename);
                if (nodeFs.existsSync(destPath)) { totalSkipped++; continue; }

                // Resolve source from original path
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

    // VFX list
    const [vfxEntries, setVfxEntries] = useState([]);
    const [entryInfo, setEntryInfo] = useState({}); // analysis: variants/randomizer per entry
    const [selected, setSelected] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    // Config — separate assets ON by default
    const [numCopies, setNumCopies] = useState(2);
    const [useCustomPrefix, setUseCustomPrefix] = useState(false);
    const [customPrefixes, setCustomPrefixes] = useState([]);
    const [separateAssets, setSeparateAssets] = useState(true);   // ← on by default
    const [assetFolderNames, setAssetFolderNames] = useState([]);
    const [detectedAssets, setDetectedAssets] = useState({});

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [statusMessage, setStatusMessage] = useState('Load a .bin file to start');
    const [statusType, setStatusType] = useState('');
    const [canSave, setCanSave] = useState(false);
    const [canCopyAssets, setCanCopyAssets] = useState(false);

    // ── Derived ──
    const filteredEntries = useMemo(() => {
        if (!searchQuery.trim()) return vfxEntries;
        const q = searchQuery.toLowerCase();
        return vfxEntries.filter(e => e.toLowerCase().includes(q));
    }, [vfxEntries, searchQuery]);

    const visibleSet = useMemo(() => new Set(filteredEntries), [filteredEntries]);

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

    // ── Status helper ──
    const setStatus = useCallback((msg, type = '') => {
        setStatusMessage(msg);
        setStatusType(type);
    }, []);

    // ── File Operations ──
    const processFile = useCallback(async (filePath) => {
        try {
            setIsLoading(true);
            setLoadingText('Processing .bin file...');

            const path = window.require('path');
            const fs = window.require('fs');
            const { execSync } = window.require('child_process');

            const ritobinPath = await electronPrefs.get('RitoBinPath');
            if (!ritobinPath) throw new Error('Configure ritobin path in Settings first');

            const binDir = path.dirname(filePath);
            const binName = path.basename(filePath, '.bin');
            const convertedPyPath = path.join(binDir, `${binName}.py`);

            setBinPath(filePath);

            // Convert .bin → .py if not already present
            if (!fs.existsSync(convertedPyPath)) {
                setLoadingText('Converting .bin to .py...');
                try {
                    execSync(`"${ritobinPath}" "${filePath}"`, { cwd: binDir, timeout: 30000 });
                } catch (err) {
                    throw new Error(`Ritobin failed: ${err.message}`);
                }
                if (!fs.existsSync(convertedPyPath)) throw new Error('Failed to create .py file');
            }

            setLoadingText('Reading file...');

            // Create backup on load (same as Paint2 / Port)
            const content = loadFileWithBackup(convertedPyPath, 'ParticleRandomizer');

            setPyPath(convertedPyPath);
            setPyContent(content);
            setGeneratedContent('');
            setCanSave(false);
            setCanCopyAssets(false);
            setDetectedAssets({});

            const allEntries = findVfxEntries(content);

            // Analyze for existing variants / randomizer
            const { info, subVariants } = analyzeExistingVariants(content, allEntries);

            // Filter out sub-variants from the main list so they aren't processed again
            const mainEntries = allEntries.filter(e => !subVariants.has(e));

            setVfxEntries(mainEntries);
            setEntryInfo(info);

            setSelected(new Set());
            setSearchQuery('');

            if (mainEntries.length > 0) {
                const withVariants = Object.values(info).filter(a => a.hasVariants).length;
                const withRandomizer = Object.values(info).filter(a => a.hasRandomizer).length;
                let msg = `Loaded: ${mainEntries.length} VFX entries`;
                if (withVariants > 0) msg += ` (${withVariants} with existing variants)`;
                if (withRandomizer > 0) msg += ` (${withRandomizer} with randomizer)`;
                setStatus(msg, 'success');
            } else {
                setStatus(allEntries.length > 0 ? 'Loaded: All entries are variants of existing randomizers' : 'File loaded but no VFX entries found', 'error');
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
        if (!window.require) {
            setStatus('Electron environment required', 'error');
            return;
        }

        // Check if user prefers native file browser
        const useNativeFileBrowser = await electronPrefs.get('UseNativeFileBrowser');
        const { ipcRenderer } = window.require('electron');

        let filePath;

        if (useNativeFileBrowser) {
            const result = await ipcRenderer.invoke('dialog:openFile', {
                title: 'Select a .bin file',
                defaultPath: binPath ? nodePath?.dirname(binPath) : undefined,
                filters: [
                    { name: 'Bin Files', extensions: ['bin'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                properties: ['openFile']
            });
            if (result.canceled || !result.filePaths?.length) return;
            filePath = result.filePaths[0];
            await processFile(filePath);
        } else {
            // Use custom explorer
            openAssetPreview(binPath || undefined, null, 'particle-randomizer-bin');
        }
    }, [binPath, processFile, setStatus]);

    // Listen for file selection from custom explorer
    useEffect(() => {
        const handleAssetSelected = (e) => {
            const { path: filePath, mode } = e.detail || {};
            if (filePath && mode === 'particle-randomizer-bin') {
                processFile(filePath);
            }
        };
        window.addEventListener('asset-preview-selected', handleAssetSelected);
        return () => window.removeEventListener('asset-preview-selected', handleAssetSelected);
    }, [processFile]);

    // ── Selection ──
    const toggleEntry = useCallback((entry) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(entry)) next.delete(entry);
            else next.add(entry);
            return next;
        });
    }, []);

    const selectAll = () => setSelected(new Set(vfxEntries));
    const deselectAll = () => setSelected(new Set());
    const selectVisible = () => {
        setSelected(prev => {
            const next = new Set(prev);
            filteredEntries.forEach(e => next.add(e));
            return next;
        });
    };

    // ── Generate ──
    const handleGenerate = useCallback(() => {
        if (!pyContent) { setStatus('Load a file first', 'error'); return; }
        if (selected.size === 0) { setStatus('Select at least one VFX entry', 'error'); return; }
        if (numCopies < 1 || numCopies > 10) { setStatus('Copies must be between 1 and 10', 'error'); return; }

        // Validate custom prefixes
        let prefixes = null;
        if (useCustomPrefix) {
            prefixes = customPrefixes.map(p => p.trim());
            if (prefixes.some(p => !p)) {
                setStatus('Fill in all custom prefix fields', 'error');
                return;
            }
        }

        // Validate asset folder names when separating
        if (separateAssets) {
            const folders = assetFolderNames.map(f => f.trim());
            if (folders.some(f => !f)) {
                setStatus('Fill in all asset folder names', 'error');
                return;
            }
        }

        try {
            let result = pyContent;
            let successCount = 0;
            const failedEntries = [];

            for (const entryPath of selected) {
                try {
                    const gen = generateDuplicates(result, entryPath, numCopies, prefixes);
                    result = gen.content;
                    successCount++;
                } catch (error) {
                    failedEntries.push({ path: entryPath, error: error.message });
                }
            }

            // Handle asset separation (on by default)
            if (separateAssets) {
                const folders = assetFolderNames.map(f => f.trim());
                const assetsResult = separateAssetsPerCopy(result, Array.from(selected), numCopies, prefixes, folders);
                result = assetsResult.content;
                setDetectedAssets(assetsResult.assetsByFolder);
                setCanCopyAssets(true);
            } else {
                setDetectedAssets({});
                setCanCopyAssets(false);
            }

            setGeneratedContent(result);
            setCanSave(true);

            // Update entry information (badges) immediately
            const { info: newInfo, subVariants: newSubVariants } = analyzeExistingVariants(result, findVfxEntries(result));
            setEntryInfo(newInfo);

            // Update the visible vfxEntries to hide any new sub-variants
            setVfxEntries(prev => prev.filter(e => !newSubVariants.has(e)));

            if (failedEntries.length === 0) {
                let msg = `✅ Processed ${successCount} VFX entr${successCount === 1 ? 'y' : 'ies'} × ${numCopies} copies`;
                if (separateAssets) {
                    const totalAssets = Object.entries(assetsResult.assetsByFolder)
                        .filter(([k]) => k !== '_backup')
                        .reduce((s, [, a]) => s + a.length, 0);
                    if (totalAssets > 0) msg += ` — ${totalAssets} assets will be separated`;
                }
                setStatus(msg, 'success');
            } else {
                setStatus(`Processed ${successCount}. Failed: ${failedEntries.length}`, 'error');
            }
        } catch (error) {
            setStatus(`Error: ${error.message}`, 'error');
        }
    }, [pyContent, selected, numCopies, useCustomPrefix, customPrefixes, separateAssets, assetFolderNames, detectedAssets, setStatus]);

    // ── Save ──
    const handleSave = useCallback(async () => {
        if (!generatedContent || !pyPath || !binPath) {
            setStatus('Nothing to save', 'error');
            return;
        }

        try {
            setIsLoading(true);
            setLoadingText('Creating backup...');

            const fs = window.require('fs');
            const path = window.require('path');
            const { execSync } = window.require('child_process');

            // Create backup BEFORE save (same as Paint2)
            if (fs.existsSync(pyPath)) {
                const existingContent = fs.readFileSync(pyPath, 'utf8');
                createBackup(pyPath, existingContent, 'ParticleRandomizer');
            }

            setLoadingText('Saving modified .py...');
            fs.writeFileSync(pyPath, generatedContent, 'utf8');

            setLoadingText('Converting .py back to .bin...');
            const ritobinPath = await electronPrefs.get('RitoBinPath');
            execSync(`"${ritobinPath}" "${pyPath}"`, {
                cwd: path.dirname(pyPath),
                timeout: 30000
            });

            setStatus('Saved successfully! Backup created in zbackups/', 'success');

            // Sync state so the UI reflects the saved changes as the new "base"
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
        if (!Object.keys(detectedAssets).length || !binPath) {
            setStatus('No assets to copy', 'error');
            return;
        }

        setIsLoading(true);
        setLoadingText('Copying assets...');

        try {
            const result = copyAssetsToFolders(detectedAssets, binPath);
            if (result.success) {
                let msg = `📂 Copied ${result.totalCopied} assets to ${result.foldersCreated} folders`;
                if (result.totalSkipped > 0) msg += ` (${result.totalSkipped} already existed)`;
                setStatus(msg, 'success');
            } else {
                let msg = `Copied ${result.totalCopied}. Failed: ${result.totalFailed}`;
                if (result.failures.length > 0) {
                    msg += ` — ${result.failures[0].asset}: ${result.failures[0].reason}`;
                }
                setStatus(msg, 'error');
            }
        } catch (error) {
            setStatus(`Copy failed: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [detectedAssets, binPath, setStatus]);

    // ── Update prefix at index ──
    const updatePrefix = (idx, val) => {
        setCustomPrefixes(prev => {
            const arr = [...prev];
            arr[idx] = val;
            return arr;
        });
    };

    const updateAssetFolder = (idx, val) => {
        setAssetFolderNames(prev => {
            const arr = [...prev];
            arr[idx] = val;
            return arr;
        });
    };

    // ════════════════════════════════════════════════════════════
    //  RENDER
    // ════════════════════════════════════════════════════════════

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

                {/* ── Left Panel: VFX List ── */}
                <div className="pr-left-panel">
                    {vfxEntries.length > 0 ? (
                        <>
                            {/* Search */}
                            <div className="pr-search-bar">
                                <input
                                    className="pr-search-input"
                                    type="text"
                                    placeholder="🔍 Search VFX entries..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (
                                    <span className="pr-search-count">
                                        {filteredEntries.length} / {vfxEntries.length}
                                    </span>
                                )}
                            </div>

                            {/* Selection controls */}
                            <div className="pr-selection-bar">
                                <button className="pr-btn pr-btn-small pr-btn-accent" onClick={selectAll}>All</button>
                                <button className="pr-btn pr-btn-small pr-btn-accent" onClick={deselectAll}>None</button>
                                <button className="pr-btn pr-btn-small pr-btn-accent" onClick={selectVisible}>Visible</button>
                                <span className="pr-selection-count">
                                    {selected.size} / {vfxEntries.length} selected
                                </span>
                            </div>

                            {/* VFX list */}
                            <div className="pr-vfx-list">
                                {vfxEntries.map((entry, i) => {
                                    const info = entryInfo[entry];
                                    const isSelected = selected.has(entry);
                                    const isVisible = visibleSet.has(entry);

                                    return (
                                        <div
                                            key={i}
                                            className={`pr-vfx-item${isSelected ? ' selected' : ''}${!isVisible ? ' hidden' : ''}`}
                                            onClick={() => toggleEntry(entry)}
                                        >
                                            <input
                                                type="checkbox"
                                                className="pr-vfx-checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleEntry(entry)}
                                                onClick={e => e.stopPropagation()}
                                            />
                                            <span className="pr-vfx-label" title={entry}>
                                                {(() => {
                                                    // Only trim the path prefix, keep the actual VFX name intact
                                                    const parts = entry.split('/');
                                                    return parts[parts.length - 1];
                                                })()}
                                            </span>

                                            {/* Badges: existing variants / randomizer */}
                                            {info && info.hasVariants && (
                                                <span
                                                    className="pr-badge pr-badge-variant"
                                                    title={`Has ${info.variantCount} variant${info.variantCount > 1 ? 's' : ''}: ${info.variantNames.join(', ')}${info.variantCount > 5 ? '...' : ''}`}
                                                >
                                                    {info.variantCount} var
                                                </span>
                                            )}
                                            {info && info.hasRandomizer && (
                                                <span
                                                    className="pr-badge pr-badge-randomizer"
                                                    title="Already has a RandomizerByDisco emitter"
                                                >
                                                    🎲
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="pr-empty-state">
                            <div className="icon">🎲</div>
                            <div>Load a .bin file to see VFX entries</div>
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
                                <label>Number of copies (1–10):</label>
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
                                Custom Prefix
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
                                    Use custom suffixes instead of _1, _2, _3…
                                </label>
                                <span className="pr-info-tip" title="Custom names for duplicates, e.g. _fire, _ice, _dark">?</span>
                            </div>

                            {useCustomPrefix && (
                                <div className="pr-prefix-grid">
                                    {customPrefixes.map((val, i) => (
                                        <React.Fragment key={i}>
                                            <label>Copy {i + 1}:</label>
                                            <input
                                                className="pr-prefix-input"
                                                type="text"
                                                placeholder="e.g. fire, ice, dark..."
                                                value={val}
                                                onChange={e => updatePrefix(i, e.target.value)}
                                            />
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Separate Assets (ON by default) */}
                        <div className="pr-section">
                            <div className="pr-section-title">
                                Separate Assets
                                <span className="badge" style={{ background: separateAssets ? 'rgba(34,197,94,0.15)' : undefined, borderColor: separateAssets ? '#22c55e' : undefined, color: separateAssets ? '#22c55e' : undefined }}>
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
                                    Give each copy its own particle folder
                                </label>
                                <span className="pr-info-tip" title="Each variant will have its own copy of textures/particles so you can modify them independently (e.g. recolor). A _backup folder is also created with the originals.">?</span>
                            </div>

                            {separateAssets && (
                                <>
                                    <div className="pr-asset-hint">
                                        Each copy gets a subfolder for its particles. A <code>_backup</code> folder with the originals is included automatically.
                                    </div>
                                    <div className="pr-asset-grid">
                                        {assetFolderNames.map((val, i) => (
                                            <React.Fragment key={i}>
                                                <label>Copy {i + 1}:</label>
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

                            {/* Detected assets output */}
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
                            disabled={!pyContent || selected.size === 0}
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
                            <button
                                className="pr-btn pr-btn-blue"
                                onClick={handleCopyAssets}
                            >
                                📂 Copy Assets to Folders
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
