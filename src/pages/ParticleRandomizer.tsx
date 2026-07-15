/*
 * ParticleRandomizer — system / emitter level VFX randomizer.
 *
 * Faithful 1:1 port of the Electron Quartz ParticleRandomizer page to
 * Tauri + React + TS. Opens a real .bin (converted to ritobin text by the
 * read_bin backend), parses it with the ported line-indexed parser, lets the
 * user pick systems / emitters, duplicates them N times into randomizer
 * variants, optionally separates per-variant assets, and saves the rewritten
 * ritobin text back to a .bin through write_bin.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    FolderOpen, Save, Dices, ChevronDown, ChevronRight, HelpCircle, Folder,
    Lock, CheckSquare, Square, Eye, ChevronsDown, ChevronsUp,
} from 'lucide-react';
import { useFileExplorer } from '@/components/explorer';
import { BinOpenLanding, DropOverlay } from '@/components/ui';
import { backupCreate, readBin, writeBin } from '@/lib/api';
import { useUiPrefsStore } from '@/lib/stores';
import { useExistingRecentBins } from '@/lib/util/useExistingRecentBins';
import { useFileDrop } from '@/lib/util/useFileDrop';
import { useJadeBin } from '@/lib/jade/jadeInterop';

import { parseVfxFile, type ParsedFile, type Emitter } from './particlerandomizer/parser';
import {
    generateEmitterRandomizers, generateSystemRandomizers, separateAssetsPerCopy,
    copyAssetsToFolders, type AssetsByFolder,
} from './particlerandomizer/randomizer';
import './particlerandomizer/ParticleRandomizer.css';

type StatusType = '' | 'success' | 'error';

export function ParticleRandomizer() {
    const pick = useFileExplorer();
    const storedRecentBins = useUiPrefsStore((s) => s.recentBins);
    const removeRecentBin = useUiPrefsStore((s) => s.removeRecentBin);
    const recentBins = useExistingRecentBins(storedRecentBins, removeRecentBin);
    // File state
    const [pyContent, setPyContent] = useState('');
    const [originalContent, setOriginalContent] = useState('');
    const [binPath, setBinPath] = useState<string | null>(null);
    useJadeBin(binPath);
    const [generatedContent, setGeneratedContent] = useState('');
    const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);

    // Tree state
    const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<Set<string>>(new Set()); // Set<emitterKey>
    const [selectedSystems, setSelectedSystems] = useState<Set<string>>(new Set()); // Set<systemKey> — system-level mode
    const [searchQuery, setSearchQuery] = useState('');

    // Config
    const [numCopies, setNumCopies] = useState(2);
    const [useCustomPrefix, setUseCustomPrefix] = useState(false);
    const [customPrefixes, setCustomPrefixes] = useState<string[]>([]);
    const [separateAssets, setSeparateAssets] = useState(true);
    const [assetFolderNames, setAssetFolderNames] = useState<string[]>([]);
    const [detectedAssets, setDetectedAssets] = useState<AssetsByFolder>({});

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [statusMessage, setStatusMessage] = useState('Load a .bin file to start');
    const [statusType, setStatusType] = useState<StatusType>('');
    const [canSave, setCanSave] = useState(false);
    const [canCopyAssets, setCanCopyAssets] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    // Keep prefix/asset-folder arrays in sync with numCopies
    useEffect(() => {
        setCustomPrefixes((prev) => {
            const arr = [...prev];
            while (arr.length < numCopies) arr.push('');
            return arr.slice(0, numCopies);
        });
        setAssetFolderNames((prev) => {
            const arr = [...prev];
            while (arr.length < numCopies) arr.push(`variant_${arr.length + 1}`);
            return arr.slice(0, numCopies);
        });
    }, [numCopies]);

    const setStatus = useCallback((msg: string, type: StatusType = '') => {
        setStatusMessage(msg);
        setStatusType(type);
    }, []);

    // ── Derived: filtered system order + per-system visible emitters ──
    const filteredSystemOrder = useMemo(() => {
        if (!parsedFile) return [];
        if (!searchQuery.trim()) return parsedFile.systemOrder || [];
        const q = searchQuery.toLowerCase();
        return (parsedFile.systemOrder || []).filter((sKey) => {
            const sys = parsedFile.systems.get(sKey);
            if (!sys) return false;
            if ((sys.name || '').toLowerCase().includes(q) || sKey.toLowerCase().includes(q)) return true;
            return (sys.emitterKeys || []).some((eKey) => {
                const em = parsedFile.emitters.get(eKey);
                return em && (em.name || '').toLowerCase().includes(q);
            });
        });
    }, [parsedFile, searchQuery]);

    const getVisibleEmitters = useCallback((systemKey: string): Emitter[] => {
        if (!parsedFile) return [];
        const sys = parsedFile.systems.get(systemKey);
        if (!sys) return [];
        const all = (sys.emitterKeys || []).map((k) => parsedFile.emitters.get(k)).filter(Boolean) as Emitter[];
        if (!searchQuery.trim()) return all;
        const q = searchQuery.toLowerCase();
        const sysMatches = (sys.name || '').toLowerCase().includes(q) || systemKey.toLowerCase().includes(q);
        if (sysMatches) return all;
        return all.filter((e) => (e.name || '').toLowerCase().includes(q));
    }, [parsedFile, searchQuery]);

    const totalEmitterCount = useMemo(() => {
        if (!parsedFile) return 0;
        return (parsedFile.systemOrder || []).reduce((sum, sKey) => {
            const sys = parsedFile.systems.get(sKey);
            return sum + (sys ? (sys.emitterKeys || []).length : 0);
        }, 0);
    }, [parsedFile]);

    // ── File Operations ──
    const processFile = useCallback(async (filePath: string) => {
        try {
            setIsLoading(true);
            setLoadingText('Reading & parsing .bin file...');

            // read_bin converts the .bin to ritobin text on the backend.
            const content = await readBin(filePath);
            const parsed = parseVfxFile(content);

            // Legacy Particle Randomizer snapshots the converted text as soon
            // as a BIN is loaded. Duplicate-content suppression keeps the save
            // pass from creating a redundant second backup.
            try {
                await backupCreate(filePath, content, 'ParticleRandomizer');
            } catch {
                // Backups are best effort, matching backupManager.js.
            }

            setBinPath(filePath);
            setPyContent(content);
            setOriginalContent(content);
            setGeneratedContent('');
            setCanSave(false);
            setCanCopyAssets(false);
            setDetectedAssets({});
            setSelected(new Set());
            setSelectedSystems(new Set());
            setSearchQuery('');

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
            useUiPrefsStore.getState().pushRecentBin(filePath);
        } catch (error) {
            console.error('Load error:', error);
            setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [setStatus]);

    const loadBinFile = useCallback(async () => {
        const result = await pick({
            mode: 'file',
            filters: [
                { name: 'Bin Files', extensions: ['bin'] },
                { name: 'All Files', extensions: ['*'] },
            ],
            recentsKey: 'bin',
        });
        if (typeof result !== 'string') return;
        await processFile(result);
    }, [processFile, pick]);

    useFileDrop({
        onEnter: () => setIsDragOver(true),
        onOver: () => setIsDragOver(true),
        onLeave: () => setIsDragOver(false),
        onDrop: (paths) => {
            setIsDragOver(false);
            const file = paths.find((path) => /\.bin$/i.test(path));
            if (file) void processFile(file);
        },
    });

    // ── Selection ──
    const toggleEmitter = useCallback((emitterKey: string, systemKey?: string) => {
        // If this system was in system mode, exit it when toggling individual emitters
        if (systemKey) {
            setSelectedSystems((prev) => {
                if (!prev.has(systemKey)) return prev;
                const next = new Set(prev);
                next.delete(systemKey);
                return next;
            });
        }
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(emitterKey)) next.delete(emitterKey);
            else next.add(emitterKey);
            return next;
        });
    }, []);

    const toggleSystemMode = useCallback((systemKey: string) => {
        if (selectedSystems.has(systemKey)) {
            setSelectedSystems((prev) => {
                const next = new Set(prev);
                next.delete(systemKey);
                return next;
            });
        } else {
            setSelectedSystems((prev) => {
                const next = new Set(prev);
                next.add(systemKey);
                return next;
            });
            // Clear individual emitter selections for this system separately
            if (parsedFile) {
                const sys = parsedFile.systems.get(systemKey);
                if (sys) {
                    setSelected((prev) => {
                        const next = new Set(prev);
                        for (const eKey of sys.emitterKeys || []) next.delete(eKey);
                        return next;
                    });
                }
            }
        }
    }, [selectedSystems, parsedFile]);

    const toggleSystemExpand = useCallback((systemKey: string) => {
        setExpandedSystems((prev) => {
            const next = new Set(prev);
            if (next.has(systemKey)) next.delete(systemKey);
            else next.add(systemKey);
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        if (!parsedFile) return;
        setSelectedSystems(new Set());
        const all = new Set<string>();
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
        setSelected((prev) => {
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

        let variantPrefixes: string[];
        if (useCustomPrefix) {
            variantPrefixes = customPrefixes.map((p) => p.trim());
            if (variantPrefixes.some((p) => !p)) { setStatus('Fill in all custom prefix fields', 'error'); return; }
        } else {
            variantPrefixes = Array.from({ length: numCopies }, (_, i) => `variant${i + 1}`);
        }

        if (separateAssets) {
            const folders = assetFolderNames.map((f) => f.trim());
            if (folders.some((f) => !f)) { setStatus('Fill in all asset folder names', 'error'); return; }
        }

        try {
            let result = pyContent;

            // System-level mode: duplicate whole system, add randomizer emitter to original
            if (selectedSystems.size > 0) {
                result = generateSystemRandomizers(result, parsedFile, Array.from(selectedSystems), variantPrefixes);
            }

            // Per-emitter mode: create mini variant systems, replace emitter with randomizer
            let emitterResolvedNames: string[] = [];
            if (selected.size > 0) {
                const emitterResult = generateEmitterRandomizers(result, parsedFile, Array.from(selected), variantPrefixes);
                result = emitterResult.content;
                emitterResolvedNames = emitterResult.resolvedBaseNames;
            }

            if (separateAssets) {
                const folders = assetFolderNames.map((f) => f.trim());
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

            const parts: string[] = [];
            if (selected.size > 0) parts.push(`${selected.size} emitter${selected.size !== 1 ? 's' : ''}`);
            if (selectedSystems.size > 0) parts.push(`${selectedSystems.size} system${selectedSystems.size !== 1 ? 's' : ''}`);
            setStatus(`Processed ${parts.join(' + ')} × ${numCopies} copies`, 'success');
        } catch (error) {
            setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
    }, [pyContent, parsedFile, selected, selectedSystems, numCopies, useCustomPrefix, customPrefixes, separateAssets, assetFolderNames, setStatus]);

    // ── Save ──
    const handleSave = useCallback(async () => {
        if (!generatedContent || !binPath) { setStatus('Nothing to save', 'error'); return; }
        try {
            setIsLoading(true);
            setLoadingText('Creating backup...');

            try {
                await backupCreate(binPath, originalContent, 'ParticleRandomizer');
            } catch {
                // Keep save available if the backup folder is not writable.
            }

            // write_bin converts the ritobin text back to a .bin.
            setLoadingText('Saving modified .bin...');
            await writeBin(generatedContent, binPath);

            setStatus('Saved successfully! Backup created in zbackups/', 'success');
            setPyContent(generatedContent);
            setOriginalContent(generatedContent);
            setGeneratedContent('');
            setCanSave(false);
        } catch (error) {
            setStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [generatedContent, originalContent, binPath, setStatus]);

    // ── Copy Assets ──
    const handleCopyAssets = useCallback(async () => {
        if (!Object.keys(detectedAssets).length || !binPath) { setStatus('No assets to copy', 'error'); return; }
        setIsLoading(true);
        setLoadingText('Copying assets...');
        try {
            const result = await copyAssetsToFolders(detectedAssets, binPath);
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
            setStatus(`Copy failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [detectedAssets, binPath, setStatus]);

    const updatePrefix = (idx: number, val: string) =>
        setCustomPrefixes((prev) => { const a = [...prev]; a[idx] = val; return a; });
    const updateAssetFolder = (idx: number, val: string) =>
        setAssetFolderNames((prev) => { const a = [...prev]; a[idx] = val; return a; });

    // ════════════════════════════════════════════════════════
    //  RENDER
    // ════════════════════════════════════════════════════════

    return (
        <div className="particle-randomizer">
            {isDragOver && (
                <DropOverlay
                    variant="scrim"
                    label="Drop the BIN here"
                    icon={<FolderOpen size={48} strokeWidth={1.5} />}
                />
            )}

            {isLoading && (
                <div className="pr-spinner-overlay">
                    <div className="pr-spinner" />
                    {loadingText && <div className="pr-spinner-text">{loadingText}</div>}
                </div>
            )}

            {/* ── Main Content ── */}
            <div className="pr-workspace-shell">
            <div className={`pr-main${binPath ? '' : ' is-dim'}`}>

                {/* ── Left Panel: VFX Tree ── */}
                <div className="pr-left-panel">
                    {parsedFile && parsedFile.systemOrder?.length > 0 ? (
                        <>
                            {/* Search */}
                            <div className="pr-search-bar">
                                <input
                                    className="dl-input"
                                    style={{ flex: 1, minWidth: '150px', fontFamily: 'var(--font-mono)' }}
                                    type="text"
                                    placeholder="Search systems or emitters..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (
                                    <span className="pr-search-count">
                                        {filteredSystemOrder.length} / {parsedFile.systemOrder.length}
                                    </span>
                                )}
                            </div>

                            {/* Selection controls */}
                            <div className="pr-selection-bar">
                                <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={selectAll}><span className="dl-icon"><CheckSquare size={11} /></span>All</button>
                                <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={deselectAll}><span className="dl-icon"><Square size={11} /></span>None</button>
                                <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={selectVisible}><span className="dl-icon"><Eye size={11} /></span>Visible</button>
                                <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={expandAll}><span className="dl-icon"><ChevronsDown size={11} /></span>Expand</button>
                                <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={collapseAll}><span className="dl-icon"><ChevronsUp size={11} /></span>Collapse</button>
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
                                {filteredSystemOrder.map((systemKey) => {
                                    const sys = parsedFile.systems.get(systemKey);
                                    if (!sys) return null;
                                    const isExpanded = expandedSystems.has(systemKey);
                                    const visibleEmitters = getVisibleEmitters(systemKey);
                                    const allEmitters = (sys.emitterKeys || [])
                                        .map((k) => parsedFile.emitters.get(k)).filter(Boolean) as Emitter[];
                                    const namedEmitters = allEmitters.filter((e) => e.name && e.name !== 'Unnamed');
                                    const isSystemMode = selectedSystems.has(systemKey);
                                    const selectedInSystem = namedEmitters.filter((e) => selected.has(e.key)).length;
                                    const isSystemRandomized = namedEmitters.length > 0 && namedEmitters.every((e) => e.name?.endsWith('_randomized'));
                                    const hasAnyRandomized = !isSystemRandomized && namedEmitters.some((e) => e.name?.endsWith('_randomized'));
                                    const selectableEmitters = namedEmitters.filter((e) => !e.name?.endsWith('_randomized'));
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
                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </span>
                                                <input
                                                    type="checkbox"
                                                    className="pr-vfx-checkbox"
                                                    checked={isSystemMode || allSelected}
                                                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                                                    onChange={() => toggleSystemMode(systemKey)}
                                                    onClick={(e) => e.stopPropagation()}
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
                                            {isExpanded && visibleEmitters.map((emitter) => {
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
                                                            onClick={(e) => e.stopPropagation()}
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
                                                            <span className="pr-badge" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
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
                            <div className="icon"><Dices size={48} /></div>
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
                                    className="dl-input"
                                    style={{ width: '70px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={numCopies}
                                    onChange={(e) => {
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
                                    onChange={(e) => setUseCustomPrefix(e.target.checked)}
                                />
                                <label htmlFor="pr-custom-prefix">
                                    Custom names instead of variant1, variant2…
                                </label>
                                <span className="pr-info-tip" title="Custom names used in system paths, e.g. _EmitterName_fire instead of _EmitterName_variant1"><HelpCircle size={11} /></span>
                            </div>

                            {useCustomPrefix && (
                                <div className="pr-prefix-grid">
                                    {customPrefixes.map((val, i) => (
                                        <React.Fragment key={i}>
                                            <label>Variant {i + 1}:</label>
                                            <input
                                                className="dl-input"
                                                style={{ height: '32px', fontFamily: 'var(--font-mono)', background: 'var(--bg-secondary)' }}
                                                type="text"
                                                placeholder={`e.g. fire, ice, dark…`}
                                                value={val}
                                                onChange={(e) => updatePrefix(i, e.target.value)}
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
                                <span className={`badge ${separateAssets ? 'badge-active' : 'badge-off'}`}>
                                    {separateAssets ? 'Active' : 'Off'}
                                </span>
                            </div>
                            <div className="pr-option">
                                <input
                                    type="checkbox"
                                    id="pr-separate-assets"
                                    checked={separateAssets}
                                    onChange={(e) => setSeparateAssets(e.target.checked)}
                                />
                                <label htmlFor="pr-separate-assets">
                                    Give each variant its own particle folder
                                </label>
                                <span className="pr-info-tip" title="Each variant gets its own copy of textures/meshes so you can modify them independently."><HelpCircle size={11} /></span>
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
                                                    className="dl-input"
                                                    style={{ height: '32px', fontFamily: 'var(--font-mono)', background: 'var(--bg-secondary)' }}
                                                    type="text"
                                                    placeholder={`e.g. variant_${i + 1}`}
                                                    value={val}
                                                    onChange={(e) => updateAssetFolder(i, e.target.value)}
                                                />
                                                <span className="path-hint">…/{val || '…'}/</span>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </>
                            )}

                            {Object.keys(detectedAssets).length > 0 && (
                                <div className="pr-assets-output">
                                    <div className="pr-assets-output-title">
                                        <FolderOpen size={13} /> Detected Assets
                                    </div>
                                    {Object.entries(detectedAssets).map(([folder, assets]) => (
                                        <div key={folder} className="pr-assets-folder">
                                            <div className="pr-assets-folder-name">
                                                {folder === '_backup' ? <Lock size={12} /> : <Folder size={12} />}
                                                {folder === '_backup' ? '_backup (originals)' : folder}
                                                <span style={{ opacity: 0.55 }}>({assets.length})</span>
                                            </div>
                                            <ul>
                                                {assets.slice(0, 8).map((a, i) => (
                                                    <li key={i}>{a.filename}</li>
                                                ))}
                                                {assets.length > 8 && (
                                                    <li style={{ color: 'var(--text-muted)' }}>…and {assets.length - 8} more</li>
                                                )}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Action Bar ── */}
                </div>
            </div>

            {!binPath && (
                <BinOpenLanding
                    recentBins={recentBins}
                    busy={isLoading}
                    dragActive={isDragOver}
                    onOpen={() => void loadBinFile()}
                    onOpenRecent={(path) => void processFile(path)}
                    onRemoveRecent={removeRecentBin}
                />
            )}
            </div>

            <footer className="pr-action-bar">
                {binPath && (
                    <button
                        type="button"
                        className="dl-btn dl-btn--primary dl-btn--sm dl-btn--icon"
                        title="Open Bin"
                        onClick={loadBinFile}
                        disabled={isLoading}
                    >
                        <span className="dl-icon"><FolderOpen size={15} /></span>
                    </button>
                )}
                {statusMessage && (
                    <span className={`pr-action-status ${statusType}`}>{statusMessage}</span>
                )}
                <div className="pr-action-bar__actions">
                    <button
                        className="dl-btn dl-btn--primary dl-btn--sm"
                        onClick={handleGenerate}
                        disabled={!pyContent || (selected.size === 0 && selectedSystems.size === 0)}
                    >
                        <span className="dl-icon"><Dices size={15} /></span> Randomize
                    </button>
                    <button
                        className="dl-btn dl-btn--secondary dl-btn--sm"
                        onClick={handleSave}
                        disabled={!canSave}
                    >
                        <span className="dl-icon"><Save size={15} /></span> Save
                    </button>
                    {canCopyAssets && (
                        <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={handleCopyAssets}>
                            <span className="dl-icon"><FolderOpen size={15} /></span> Copy Assets to Folders
                        </button>
                    )}
                </div>
            </footer>
        </div>
    );
}

export default ParticleRandomizer;
