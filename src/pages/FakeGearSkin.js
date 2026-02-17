/**
 * FakeGearSkin - VFX Toggle Variant Generator
 * 
 * Converts VFX systems into toggle-able variants using stencil filtering.
 * Uses Ctrl+5 toggle to switch between variant1 and variant2 of each VFX.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Box, Typography, Checkbox, Button, TextField, Tooltip, IconButton, CircularProgress } from '@mui/material';
import { List } from 'react-window';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SaveIcon from '@mui/icons-material/Save';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SearchIcon from '@mui/icons-material/Search';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import DeleteIcon from '@mui/icons-material/Delete';
import ClearIcon from '@mui/icons-material/Clear';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import electronPrefs from '../utils/electronPrefs.js';
import { openAssetPreview } from '../utils/assetPreviewEvent';
import {
    extractVfxSystems,
    convertToToggleVariants,
    convertToSeparateBins,
    writeVariantBinsWithMerge,
    hasToggleVariants,
    hasVariantBinsLinked,
    insertToggleScreen,
    hasToggleScreen,
    copyAssetsToVariantFolders,
    createBackup,
    countExistingStencilEmitters,
    countGroundLayerEmitters,
    extractEmittersFromSystem,
    duplicateEmittersAsInline,
    processMinimalMesh,
    insertAnimationToggle,
    hasAnimationToggle,
    extractStencilIdFromToggleScreen,
    convertToInlineVariants,
    hasInlineVariants,
    deleteVariant2FromSystem,
    removeRenderPhaseOverrideFromSystem,
    hasVariant2,
    VARIANT1_FOLDER,
    VARIANT2_FOLDER
} from '../utils/fakeGearSkinUtils.js';

import './FakeGearSkin.css';

// ============ STYLES (from BinEditor) ============
const buttonStyle = (color, disabled = false) => ({
    padding: '8px 14px',
    background: disabled ? 'rgba(100,100,100,0.2)' : `rgba(${hexToRgb(color)}, 0.15)`,
    border: `1px solid ${disabled ? 'rgba(100,100,100,0.3)' : color}`,
    borderRadius: 'var(--border-radius, 6px)',
    color: disabled ? '#666' : color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s ease'
});

const smallButtonStyle = (color, disabled = false) => ({
    padding: '4px 10px',
    background: disabled ? 'rgba(100,100,100,0.2)' : `rgba(${hexToRgb(color)}, 0.15)`,
    border: `1px solid ${disabled ? 'rgba(100,100,100,0.3)' : color}`,
    borderRadius: 'var(--border-radius, 4px)',
    color: disabled ? '#666' : color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s ease'
});

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return '255, 255, 255';
}

// Virtualized row component for system list (react-window v2 API)
const SystemRowComponent = React.memo((props) => {
    const {
        index,
        style,
        rows,
        selectedSystems,
        selectedEmitters,
        expandedSystems,
        pyContent,
        isLoading,
        toggleSystemSelection,
        toggleEmitterSelection,
        toggleExpand,
        handleRemoveRenderPhase,
        handleDeleteVariant2Click,
        isToggleScreenSystem
    } = props;

    if (!rows || !rows[index]) return null;

    const row = rows[index];

    // Render emitter row
    if (row.type === 'emitter') {
        const emitter = row.emitter;
        const systemKey = row.systemKey;
        const emitterKey = `${systemKey}::${emitter.name}`;
        const isEmitterSelected = selectedEmitters?.has(emitterKey);
        const isVariant2 = emitter.name.toLowerCase().endsWith('_variant2');

        return (
            <div
                style={{
                    ...style,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 12px 4px 36px',
                    gap: '6px',
                    background: isEmitterSelected ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(0,0,0,0.2)',
                    borderLeft: `2px solid ${isEmitterSelected ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.3)'}`,
                    marginLeft: '8px',
                    boxSizing: 'border-box',
                    width: 'calc(100% - 16px)',
                    cursor: isVariant2 ? 'not-allowed' : 'pointer',
                    opacity: isVariant2 ? 0.5 : 1
                }}
                onClick={() => !isVariant2 && toggleEmitterSelection && toggleEmitterSelection(systemKey, emitter.name)}
            >
                <Checkbox
                    checked={isEmitterSelected || false}
                    disabled={isVariant2}
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => !isVariant2 && toggleEmitterSelection && toggleEmitterSelection(systemKey, emitter.name)}
                    sx={{ padding: '2px' }}
                />
                <Typography sx={{ 
                    fontSize: '12px', 
                    color: isVariant2 ? 'var(--text-3)' : 'var(--text-2)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                    fontStyle: isVariant2 ? 'italic' : 'normal'
                }}>
                    {emitter.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {isVariant2 && (
                        <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa' }}>
                            V2
                        </span>
                    )}
                    {emitter.hasStencil && (
                        <Tooltip title="Has StencilMode - may not work">
                            <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(234, 179, 8, 0.2)', color: '#fbbf24' }}>
                                Stencil
                            </span>
                        </Tooltip>
                    )}
                    {emitter.hasGroundLayer && (
                        <Tooltip title="Has isGroundLayer - may not work">
                            <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
                                Ground
                            </span>
                        </Tooltip>
                    )}
                    {emitter.hasRenderPhaseOverride && (
                        <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>
                            Phase
                        </span>
                    )}
                </Box>
            </div>
        );
    }

    // Render system row
    const system = row.system;
    const isSelected = selectedSystems.has(system.key);
    const isExpanded = expandedSystems.has(system.key);
    const alreadyHasVariants = hasToggleVariants(pyContent, system.key, system.rawContent);
    const alreadyHasInlineVariants = hasInlineVariants(system.rawContent);
    const isToggleScreen = isToggleScreenSystem(system);
    const isDisabled = alreadyHasVariants || alreadyHasInlineVariants || isToggleScreen;
    const hasV2 = window.__fakegearVariant2Systems?.has(system.key) || false;
    const stencilCount = system.stencilCount || 0;
    const groundLayerCount = system.groundLayerCount || 0;

    return (
        <div
            style={{
                ...style,
                display: 'flex',
                alignItems: 'center',
                padding: '6px 12px',
                gap: '8px',
                borderRadius: '4px',
                cursor: 'pointer',
                margin: '0 8px',
                border: `1px solid ${isSelected ? 'rgba(var(--accent-rgb), 0.3)' : 'transparent'}`,
                background: isSelected ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                opacity: isDisabled ? 0.5 : 1,
                boxSizing: 'border-box',
                width: 'calc(100% - 16px)'
            }}
        >
            {/* Expand/Collapse button */}
            <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); toggleExpand(system.key); }}
                sx={{ padding: '2px', color: 'var(--text-2)' }}
            >
                {isExpanded ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
                ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                )}
            </IconButton>

            <Checkbox
                checked={isSelected}
                disabled={isDisabled}
                icon={<CheckBoxOutlineBlankIcon />}
                checkedIcon={<CheckBoxIcon />}
                size="small"
                onClick={(e) => { e.stopPropagation(); if (!isDisabled) toggleSystemSelection(system.key); }}
                sx={{ padding: '4px' }}
            />
            <Box sx={{ flex: 1, overflow: 'hidden' }} onClick={() => toggleExpand(system.key)}>
                <Typography sx={{ 
                    fontSize: '13px', 
                    fontWeight: 500, 
                    color: 'var(--text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>
                    {system.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', marginTop: '2px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-2)' }}>
                        {system.emitterCount} emitter{system.emitterCount !== 1 ? 's' : ''}
                    </span>
                    {alreadyHasVariants && (
                        <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' }}>Child</span>
                    )}
                    {alreadyHasInlineVariants && (
                        <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa' }}>Inline</span>
                    )}
                    {stencilCount > 0 && (
                        <Tooltip title={`${stencilCount} emitters have StencilMode - conversion may not work!`}>
                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(234, 179, 8, 0.2)', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <WarningAmberIcon sx={{ fontSize: 10 }} /> Stencil
                            </span>
                        </Tooltip>
                    )}
                    {groundLayerCount > 0 && (
                        <Tooltip title={`${groundLayerCount} emitters have isGroundLayer - conversion may not work!`}>
                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <WarningAmberIcon sx={{ fontSize: 10 }} /> Ground
                            </span>
                        </Tooltip>
                    )}
                </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
                <Tooltip title="Remove renderPhaseOverride">
                    <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleRemoveRenderPhase(system.key, e); }}
                        disabled={isLoading}
                        sx={{
                            color: '#f59e0b',
                            padding: '4px',
                            '&:hover': { backgroundColor: 'rgba(245, 158, 11, 0.1)' }
                        }}
                    >
                        <ClearIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
                {hasV2 && (
                    <Tooltip title="Revert Variants (delete V2, rename V1 back, remove stencil)">
                        <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); handleDeleteVariant2Click(system.key, e); }}
                            disabled={isLoading}
                            sx={{
                                color: '#ef4444',
                                padding: '4px',
                                '&:hover': { backgroundColor: 'rgba(239, 68, 68, 0.1)' }
                            }}
                        >
                            <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
        </div>
    );
});

export default function FakeGearSkin() {
    // File state
    const [binPath, setBinPath] = useState(null);
    const [pyContent, setPyContent] = useState('');
    const [originalContent, setOriginalContent] = useState('');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showWarning, setShowWarning] = useState(true);

    // Systems state
    const [systems, setSystems] = useState([]);
    const [selectedSystems, setSelectedSystems] = useState(new Set());
    const [selectedEmitters, setSelectedEmitters] = useState(new Set()); // Format: "systemKey::emitterName"
    const [expandedSystems, setExpandedSystems] = useState(new Set());

    // Refs
    const fileInputRef = useRef(null);
    const listContainerRef = useRef(null);

    // Toggle system expansion
    const toggleExpand = useCallback((systemKey) => {
        setExpandedSystems(prev => {
            const next = new Set(prev);
            if (next.has(systemKey)) {
                next.delete(systemKey);
            } else {
                next.add(systemKey);
            }
            return next;
        });
    }, []);

    // Toggle emitter selection
    const toggleEmitterSelection = useCallback((systemKey, emitterName) => {
        const key = `${systemKey}::${emitterName}`;
        console.log('[FakeGearSkin] Toggling emitter:', key);
        setSelectedEmitters(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
                console.log('[FakeGearSkin] Deselected emitter, new size:', next.size);
            } else {
                next.add(key);
                console.log('[FakeGearSkin] Selected emitter, new size:', next.size);
            }
            return next;
        });
    }, []);

    // Ground Layer Warning Modal state
    const [showGroundLayerWarning, setShowGroundLayerWarning] = useState(false);

    // Get details about selected emitters (including which have groundLayer)
    const getSelectedEmitterDetails = useCallback(() => {
        const details = { total: 0, groundLayerCount: 0, groundLayerEmitters: [] };
        
        for (const key of selectedEmitters) {
            const [systemKey, emitterName] = key.split('::');
            const system = systems.find(s => s.key === systemKey);
            if (system && system.emitters) {
                const emitter = system.emitters.find(e => e.name === emitterName);
                if (emitter) {
                    details.total++;
                    if (emitter.hasGroundLayer) {
                        details.groundLayerCount++;
                        details.groundLayerEmitters.push(emitterName);
                    }
                }
            }
        }
        return details;
    }, [selectedEmitters, systems]);

    // Duplicate selected emitters as inline variants
    const handleDuplicateEmittersAsInline = useCallback(async (stencilId, skipGroundLayer = false) => {
        if (selectedEmitters.size === 0) {
            setStatusMessage('No emitters selected');
            return;
        }

        try {
            setIsLoading(true);
            setLoadingText('Duplicating emitters...');

            // Group selected emitters by system, optionally skipping ground layer emitters
            const emittersBySystem = new Map();
            let skippedCount = 0;
            
            for (const key of selectedEmitters) {
                const [systemKey, emitterName] = key.split('::');
                
                // Check if we should skip this emitter
                if (skipGroundLayer) {
                    const system = systems.find(s => s.key === systemKey);
                    if (system && system.emitters) {
                        const emitter = system.emitters.find(e => e.name === emitterName);
                        if (emitter && emitter.hasGroundLayer) {
                            skippedCount++;
                            continue;
                        }
                    }
                }
                
                if (!emittersBySystem.has(systemKey)) {
                    emittersBySystem.set(systemKey, []);
                }
                emittersBySystem.get(systemKey).push(emitterName);
            }

            // Count total emitters to process
            let totalToProcess = 0;
            for (const emitterNames of emittersBySystem.values()) {
                totalToProcess += emitterNames.length;
            }

            if (totalToProcess === 0) {
                setStatusMessage('No emitters to duplicate (all were ground layer emitters)');
                setIsLoading(false);
                setLoadingText('');
                return;
            }

            // Apply changes for each system
            let newContent = pyContent;
            for (const [systemKey, emitterNames] of emittersBySystem) {
                newContent = duplicateEmittersAsInline(newContent, systemKey, emitterNames, stencilId);
            }

            setPyContent(newContent);
            setHasUnsavedChanges(true);
            setSelectedEmitters(new Set());
            
            const message = skippedCount > 0
                ? `Duplicated ${totalToProcess} emitter(s), skipped ${skippedCount} ground layer emitter(s)`
                : `Duplicated ${totalToProcess} emitter(s) as inline variants`;
            setStatusMessage(message);
        } catch (error) {
            console.error('Error duplicating emitters:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [selectedEmitters, pyContent, systems]);

    // Check for ground layer emitters before showing stencil modal
    const initiateEmitterDuplication = useCallback(() => {
        const details = getSelectedEmitterDetails();
        if (details.groundLayerCount > 0) {
            // Show warning first
            setShowGroundLayerWarning(true);
        } else {
            // No ground layer emitters - try to auto-detect stencil ID
            const existingId = extractStencilIdFromToggleScreen(pyContent);
            if (existingId) {
                console.log('[FakeGearSkin] Found existing Stencil ID for emitters:', existingId);
                handleDuplicateEmittersAsInline(existingId, false);
            } else {
                // No existing ID, ask for one
                setPendingAction('emitter-inline');
                setShowStencilModal(true);
            }
        }
    }, [getSelectedEmitterDetails, pyContent, handleDuplicateEmittersAsInline]);

    // Stencil ID Modal state
    const [showStencilModal, setShowStencilModal] = useState(false);
    const [customStencilId, setCustomStencilId] = useState('');
    const [pendingAction, setPendingAction] = useState(null); // 'convert' or 'togglescreen'

    // Delete Confirmation Modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [pendingDeleteSystemKey, setPendingDeleteSystemKey] = useState(null);


    // Child Particles Warning Modal state
    const [showChildParticlesWarning, setShowChildParticlesWarning] = useState(false);

    // Extract systems when content changes and pre-compute variant2 status + emitter info
    useEffect(() => {
        if (pyContent) {
            const extractedSystems = extractVfxSystems(pyContent);
            // Pre-compute variant2 status for all systems to avoid repeated parsing
            const systemsWithVariant2 = new Set();
            // First pass: collect all child variant2 system keys
            const childVariant2Keys = new Set();
            for (const system of extractedSystems) {
                if (system.key.includes('_child_variant2')) {
                    // Extract parent key from child variant2 key
                    const parentKey = system.key.replace('_child_variant2', '');
                    childVariant2Keys.add(parentKey);
                }
            }
            // Second pass: check each system for variant2 and extract emitter info
            for (const system of extractedSystems) {
                // Extract emitter details for each system
                system.emitters = extractEmittersFromSystem(system.rawContent);
                system.stencilCount = system.emitters.filter(e => e.hasStencil).length;
                system.groundLayerCount = system.emitters.filter(e => e.hasGroundLayer).length;

                // Skip child variant2 systems themselves
                if (system.key.includes('_child_variant2')) continue;
                
                // Check inline variants from system content
                const hasInlineVariant2 = /emitterName:\s*string\s*=\s*"[^"]*_Variant2"/i.test(system.rawContent);
                if (hasInlineVariant2) {
                    systemsWithVariant2.add(system.key);
                    continue;
                }
                // Check spawner for variant2 child particle
                const isSpawner = /emitterName:\s*string\s*=\s*"variant1"/i.test(system.rawContent) &&
                                  /emitterName:\s*string\s*=\s*"variant2"/i.test(system.rawContent);
                if (isSpawner) {
                    systemsWithVariant2.add(system.key);
                    continue;
                }
                // Check if this system has a child variant2 system
                if (childVariant2Keys.has(system.key)) {
                    systemsWithVariant2.add(system.key);
                }
            }
            // Store variant2 status in a ref for quick lookup
            window.__fakegearVariant2Systems = systemsWithVariant2;
            setSystems(extractedSystems);
            console.log(`[FakeGearSkin] Extracted ${extractedSystems.length} VFX systems`);
        } else {
            setSystems([]);
            window.__fakegearVariant2Systems = new Set();
        }
    }, [pyContent]);

    // Filtered systems based on search
    const filteredSystems = useMemo(() => {
        let filtered = systems;
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = systems.filter(sys =>
                sys.name.toLowerCase().includes(query) ||
                sys.key.toLowerCase().includes(query)
            );
        }
        return filtered;
    }, [systems, searchQuery]);

    // Flattened rows for virtualized list (systems + expanded emitters)
    const flattenedRows = useMemo(() => {
        const rows = [];
        for (const system of filteredSystems) {
            rows.push({ type: 'system', system });
            if (expandedSystems.has(system.key) && system.emitters) {
                for (const emitter of system.emitters) {
                    rows.push({ type: 'emitter', emitter, systemKey: system.key });
                }
            }
        }
        return rows;
    }, [filteredSystems, expandedSystems]);

    // File operations
    const processBinFile = useCallback(async (filePath) => {
        if (!window.require) {
            setStatusMessage('Error: Electron environment required');
            return;
        }

        try {
            let ritobinPath = await electronPrefs.get('RitoBinPath');
            if (!ritobinPath) {
                setStatusMessage('Error: Configure ritobin path in Settings first');
                return;
            }

            setBinPath(filePath);
            setIsLoading(true);
            setLoadingText('Processing .bin file...');

            const path = window.require('path');
            const fs = window.require('fs');
            const { execSync } = window.require('child_process');

            const binDir = path.dirname(filePath);
            const binName = path.basename(filePath, '.bin');
            const pyPath = path.join(binDir, `${binName}.py`);

            // Check if .py already exists
            if (!fs.existsSync(pyPath)) {
                setLoadingText('Converting .bin to .py...');
                try {
                    execSync(`"${ritobinPath}" "${filePath}"`, {
                        cwd: binDir,
                        timeout: 30000
                    });
                } catch (err) {
                    throw new Error(`Ritobin failed: ${err.message}`);
                }

                if (!fs.existsSync(pyPath)) {
                    throw new Error('Failed to create .py file');
                }
            }

            setLoadingText('Loading file...');
            const content = fs.readFileSync(pyPath, 'utf8');

            setPyContent(content);
            setOriginalContent(content);
            setSelectedSystems(new Set());
            setHasUnsavedChanges(false);

            // Don't process mesh on load - only when user clicks "Add Animation Toggle"

            // Save path for next session
            try {
                await electronPrefs.set('FakeGearLastBinPath', filePath);
            } catch (e) { console.warn('Failed to save path', e); }

            const systemCount = extractVfxSystems(content).length;
            setStatusMessage(`Loaded: ${systemCount} VFX systems found`);

        } catch (error) {
            console.error('Load error:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, []);

    const loadBinFile = useCallback(async () => {
        let defaultPath = binPath || undefined;
        if (!defaultPath) {
            try {
                defaultPath = await electronPrefs.get('FakeGearLastBinPath');
            } catch (e) { }
        }

        const useNativeFileBrowser = await electronPrefs.get('UseNativeFileBrowser');

        if (useNativeFileBrowser) {
            try {
                if (window.require) {
                    const { ipcRenderer } = window.require('electron');
                    const path = window.require('path');
                    const result = await ipcRenderer.invoke('dialog:openFile', {
                        title: 'Select a skin .bin file',
                        defaultPath: defaultPath ? path.dirname(defaultPath) : undefined,
                        filters: [
                            { name: 'Bin Files', extensions: ['bin'] },
                            { name: 'All Files', extensions: ['*'] }
                        ],
                        properties: ['openFile']
                    });

                    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
                        processBinFile(result.filePaths[0]);
                    }
                }
            } catch (error) {
                console.error('Error opening file dialog:', error);
                setStatusMessage('Error opening file dialog: ' + error.message);
            }
        } else {
            openAssetPreview(defaultPath, null, 'fakegear-bin');
        }
    }, [binPath, processBinFile]);

    // Listen for file selection from asset preview
    useEffect(() => {
        const handleAssetSelected = (e) => {
            const { path: filePath, mode } = e.detail || {};
            if (!filePath) return;

            if (mode === 'fakegear-bin') {
                processBinFile(filePath);
            }
        };

        window.addEventListener('asset-preview-selected', handleAssetSelected);
        return () => window.removeEventListener('asset-preview-selected', handleAssetSelected);
    }, [processBinFile]);

    const saveFile = useCallback(async () => {
        if (!pyContent || !binPath) {
            setStatusMessage('Nothing to save');
            return;
        }

        try {
            setIsLoading(true);
            setLoadingText('Creating backup...');

            const fs = window.require('fs');
            const { execSync } = window.require('child_process');
            const path = window.require('path');

            // Create timestamped backup of the original bin before saving
            const backupPath = createBackup(binPath);
            if (backupPath) {
                console.log('[FakeGearSkin] Backup created:', backupPath);
            }

            const pyPath = binPath.replace('.bin', '.py');

            setLoadingText('Writing .py file...');
            // Write .py file
            fs.writeFileSync(pyPath, pyContent, 'utf8');

            setLoadingText('Converting to .bin...');

            // Convert back to .bin
            const ritobinPath = await electronPrefs.get('RitoBinPath');
            execSync(`"${ritobinPath}" "${pyPath}"`, {
                cwd: path.dirname(pyPath),
                timeout: 30000
            });

            // Reload the .py file from disk to ensure we have the latest content
            // This is important when doing multiple conversions without reloading
            setLoadingText('Reloading file...');
            const freshContent = fs.readFileSync(pyPath, 'utf8');
            setPyContent(freshContent);
            setOriginalContent(freshContent);
            setHasUnsavedChanges(false);
            setStatusMessage(`Saved successfully${backupPath ? ' (backup created)' : ''}`);

        } catch (error) {
            console.error('Save error:', error);
            setStatusMessage(`Save failed: ${error.message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [pyContent, binPath]);

    // Selection operations
    const toggleSystemSelection = useCallback((systemKey) => {
        setSelectedSystems(prev => {
            const next = new Set(prev);
            if (next.has(systemKey)) {
                next.delete(systemKey);
                setStatusMessage(`Deselected: ${systemKey}`);
            } else {
                next.add(systemKey);

                // Check for existing stencil properties
                const system = systems.find(s => s.key === systemKey);
                if (system && system.rawContent) {
                    const stencilCount = countExistingStencilEmitters(system.rawContent);
                    if (stencilCount > 0) {
                        setStatusMessage(`Warning: ${stencilCount} emitters in "${systemKey}" have existing StencilMode and will NOT be toggled.`);
                    } else {
                        setStatusMessage(`Selected: ${systemKey}`);
                    }
                }
            }
            return next;
        });
    }, [systems]);

    // Check if a system is the special 'togglescreen' system
    const isToggleScreenSystem = useCallback((system) => {
        if (!system) return false;
        // Check by key/name
        if (system.key === 'togglescreen' || system.name === 'togglescreen') return true;
        // Check content
        if (system.rawContent) {
            return /particleName:\s*string\s*=\s*"togglescreen"/i.test(system.rawContent) ||
                /particlePath:\s*string\s*=\s*"togglescreen"/i.test(system.rawContent);
        }
        return false;
    }, []);

    const selectAll = useCallback(() => {
        const selectable = filteredSystems.filter(s => {
            const hasVariants = hasToggleVariants(pyContent, s.key, s.rawContent);
            const hasInline = hasInlineVariants(s.rawContent); // Only true if BOTH variant1 and variant2 exist
            const isToggleScreen = isToggleScreenSystem(s);
            // Allow selection if only variant1 exists (can add variant2)
            // Only block if both variants exist or has child variants
            return !hasVariants && !hasInline && !isToggleScreen;
        });
        setSelectedSystems(new Set(selectable.map(s => s.key)));
    }, [filteredSystems, pyContent, isToggleScreenSystem]);

    const deselectAll = useCallback(() => {
        setSelectedSystems(new Set());
    }, []);

    // Execute conversion logic (extracted from modal confirm)
    const executeConversion = useCallback(async (stencilId) => {
        setIsLoading(true);
        setLoadingText('Converting to separate variant bins...');

        try {
            const fs = window.require('fs');
            const { execSync } = window.require('child_process');
            const path = window.require('path');

            // Get ritobin path first - needed for merging
            const ritobinPath = await electronPrefs.get('RitoBinPath');
            if (!ritobinPath) {
                setStatusMessage('Error: Configure ritobin path in Settings first');
                setIsLoading(false);
                return;
            }

            // Use separate bins approach with CUSTOM STENCIL ID
            const result = convertToSeparateBins(pyContent, [...selectedSystems], binPath, stencilId);

            if (result.success) {
                // Update main content
                setPyContent(result.mainContent);
                setHasUnsavedChanges(true);
                setSelectedSystems(new Set());

                // Merge with existing variant bins and generate content
                setLoadingText('Merging with existing variant bins...');
                const mergeResult = writeVariantBinsWithMerge(result, ritobinPath);

                // Write variant1.py
                setLoadingText(`Writing variant1.py (${mergeResult.variant1SystemCount} systems)...`);
                fs.writeFileSync(mergeResult.variant1Path, mergeResult.variant1Content, 'utf8');
                console.log('[FakeGearSkin] Wrote variant1.py:', mergeResult.variant1Path);

                // Write variant2.py
                setLoadingText(`Writing variant2.py (${mergeResult.variant2SystemCount} systems)...`);
                fs.writeFileSync(mergeResult.variant2Path, mergeResult.variant2Content, 'utf8');
                console.log('[FakeGearSkin] Wrote variant2.py:', mergeResult.variant2Path);

                // Convert variant .py files to .bin
                setLoadingText('Converting variant1.py to .bin...');
                try {
                    execSync(`"${ritobinPath}" "${mergeResult.variant1Path}"`, {
                        cwd: path.dirname(mergeResult.variant1Path),
                        timeout: 30000
                    });
                } catch (e) {
                    console.warn('[FakeGearSkin] variant1 conversion warning:', e.message);
                }

                setLoadingText('Converting variant2.py to .bin...');
                try {
                    execSync(`"${ritobinPath}" "${mergeResult.variant2Path}"`, {
                        cwd: path.dirname(mergeResult.variant2Path),
                        timeout: 30000
                    });
                } catch (e) {
                    console.warn('[FakeGearSkin] variant2 conversion warning:', e.message);
                }

                // Copy assets to variant folders
                if (result.assetMappings && (result.assetMappings.variant1.length > 0 || result.assetMappings.variant2.length > 0)) {
                    setLoadingText('Copying assets to variant folders...');

                    const copyResult = copyAssetsToVariantFolders(
                        binPath,
                        result.assetMappings,
                        result.variant1Folder,
                        result.variant2Folder
                    );

                    if (copyResult.copiedFiles.length > 0) {
                        setStatusMessage(`${result.message} | Assets: ${copyResult.message}`);
                        console.log('[FakeGearSkin] Asset copy result:', copyResult);
                    } else if (copyResult.failedFiles.length > 0) {
                        setStatusMessage(`${result.message} | Warning: Some assets failed to copy`);
                    } else {
                        setStatusMessage(result.message);
                    }
                } else {
                    setStatusMessage(result.message);
                }
            } else {
                setStatusMessage(`Error: ${result.error}`);
            }
        } catch (error) {
            console.error('Conversion error:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [pyContent, selectedSystems, binPath]);

    // Execute inline variants conversion (duplicates emitters within same system)
    const executeInlineVariantsConversion = useCallback(async (stencilId, skipGroundLayer = false) => {
        setIsLoading(true);
        setLoadingText(skipGroundLayer ? 'Duplicating emitters (skipping ground layer)...' : 'Duplicating emitters as inline variants...');

        try {
            // Use inline variants approach with CUSTOM STENCIL ID
            const result = convertToInlineVariants(pyContent, [...selectedSystems], stencilId, skipGroundLayer);

            if (result.success) {
                // Update content
                setPyContent(result.content);
                setHasUnsavedChanges(true);
                setSelectedSystems(new Set());

                // Copy assets to variant folders
                if (result.assetMappings && (result.assetMappings.variant1.length > 0 || result.assetMappings.variant2.length > 0)) {
                    setLoadingText('Copying assets to variant folders...');

                    const copyResult = copyAssetsToVariantFolders(
                        binPath,
                        result.assetMappings,
                        result.variant1Folder,
                        result.variant2Folder
                    );

                    if (copyResult.copiedFiles.length > 0) {
                        setStatusMessage(`${result.message} | Assets: ${copyResult.message}`);
                        console.log('[FakeGearSkin] Asset copy result:', copyResult);
                    } else if (copyResult.failedFiles.length > 0) {
                        setStatusMessage(`${result.message} | Warning: Some assets failed to copy`);
                    } else {
                        setStatusMessage(result.message);
                    }
                } else {
                    setStatusMessage(result.message);
                }
            } else {
                setStatusMessage(`Error: ${result.error}`);
            }
        } catch (error) {
            console.error('Inline variants conversion error:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [pyContent, selectedSystems, binPath]);

    // Open modal for conversion
    const handleConvertToVariants = useCallback(async () => {
        if (selectedSystems.size === 0) {
            setStatusMessage('Select at least one VFX system');
            return;
        }

        if (!binPath) {
            setStatusMessage('No file loaded');
            return;
        }

        // Show warning modal first
        setShowChildParticlesWarning(true);
    }, [selectedSystems, binPath]);

    // Confirm child particles conversion after warning
    const handleConfirmChildParticles = useCallback(() => {
        setShowChildParticlesWarning(false);
        
        // Try to auto-detect stencil ID from existing togglescreen system
        const existingId = extractStencilIdFromToggleScreen(pyContent);
        if (existingId) {
            console.log('[FakeGearSkin] Found existing Stencil ID:', existingId);
            executeConversion(existingId);
            return;
        }

        // Open modal to ask for stencil ID
        setPendingAction('convert');
        setCustomStencilId('');
        setShowStencilModal(true);
    }, [pyContent, executeConversion]);

    // Cancel child particles conversion
    const handleCancelChildParticles = useCallback(() => {
        setShowChildParticlesWarning(false);
    }, []);

    // Execute action with custom Stencil ID
    const handleStencilModalConfirm = useCallback(async () => {
        setShowStencilModal(false);
        const stencilId = customStencilId.trim() || '0xe6deedc4'; // Default if empty

        if (pendingAction === 'convert') {
            await executeConversion(stencilId);
        }
        else if (pendingAction === 'togglescreen') {
            try {
                // Pass binPath AND custom stencil ID
                const result = await insertToggleScreen(pyContent, binPath, null, null, stencilId);

                if (result.success) {
                    setPyContent(result.content);
                    setHasUnsavedChanges(true);
                    setStatusMessage(result.message);
                } else {
                    setStatusMessage(`Error: ${result.error}`);
                }
            } catch (error) {
                console.error('Error adding togglescreen:', error);
                setStatusMessage(`Error: ${error.message}`);
            }
        }
        else if (pendingAction === 'inlineVariants') {
            await executeInlineVariantsConversion(stencilId, false);
        }
        else if (pendingAction === 'inlineVariants-skip') {
            await executeInlineVariantsConversion(stencilId, true);
        }
        else if (pendingAction === 'emitter-inline') {
            await handleDuplicateEmittersAsInline(stencilId, false);
        }
        else if (pendingAction === 'emitter-inline-skip') {
            await handleDuplicateEmittersAsInline(stencilId, true);
        }
    }, [pyContent, binPath, customStencilId, pendingAction, executeConversion, executeInlineVariantsConversion, handleDuplicateEmittersAsInline]);

    // Open modal for togglescreen
    const handleAddToggleScreen = useCallback(() => {
        if (!pyContent) {
            setStatusMessage('Load a file first');
            return;
        }

        if (hasToggleScreen(pyContent)) {
            setStatusMessage('togglescreen system already exists');
            return;
        }

        // Open modal to ask for stencil ID
        setPendingAction('togglescreen');
        setCustomStencilId('');
        setShowStencilModal(true);
    }, [pyContent]);

    // Add animation toggle system
    const handleAddAnimationToggle = useCallback(() => {
        if (!pyContent) {
            setStatusMessage('Load a file first');
            return;
        }

        if (!binPath) {
            setStatusMessage('No file loaded');
            return;
        }

        if (hasAnimationToggle(pyContent)) {
            setStatusMessage('Animation toggle already exists');
            return;
        }

        try {
            setIsLoading(true);
            setLoadingText('Processing mesh and adding animation toggle...');

            // Process SKL/SKN to add minimal mesh for animation (only when user clicks this button)
            const meshResult = processMinimalMesh(pyContent, binPath);
            let contentToUse = pyContent;
            if (meshResult.status === 'success') {
                console.log('[FakeGearSkin] Minimal mesh processed:', meshResult.message);
                contentToUse = meshResult.content || pyContent;
            } else if (meshResult.status === 'error') {
                console.warn('[FakeGearSkin] Minimal mesh error:', meshResult.message);
            }

            // Default submeshes - these should match what will be toggled
            const submeshes = ["Weapon2", "Body2"];

            const result = insertAnimationToggle(contentToUse, binPath, submeshes);

            if (result.success) {
                setPyContent(result.content);
                setHasUnsavedChanges(true);
                setStatusMessage(result.message);
            } else {
                setStatusMessage(`Error: ${result.error}`);
            }
        } catch (error) {
            console.error('Error adding animation toggle:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [pyContent, binPath]);

    // Get ground layer count for selected systems
    const getSelectedSystemsGroundLayerCount = useCallback(() => {
        let count = 0;
        for (const systemKey of selectedSystems) {
            const system = systems.find(s => s.key === systemKey);
            if (system && system.groundLayerCount) {
                count += system.groundLayerCount;
            }
        }
        return count;
    }, [selectedSystems, systems]);

    // Handle inline variants button click
    const handleConvertToInlineVariants = useCallback(async () => {
        if (selectedSystems.size === 0) {
            setStatusMessage('Select at least one VFX system');
            return;
        }

        if (!binPath) {
            setStatusMessage('No file loaded');
            return;
        }

        // Check for ground layer emitters in selected systems
        const groundLayerCount = getSelectedSystemsGroundLayerCount();
        if (groundLayerCount > 0) {
            // Show ground layer warning first
            setShowGroundLayerWarning(true);
            return;
        }

        // Try to auto-detect stencil ID from existing togglescreen system
        const existingId = extractStencilIdFromToggleScreen(pyContent);
        if (existingId) {
            console.log('[FakeGearSkin] Found existing Stencil ID:', existingId);
            await executeInlineVariantsConversion(existingId);
            return;
        }

        // Open modal to ask for stencil ID
        setPendingAction('inlineVariants');
        setCustomStencilId('');
        setShowStencilModal(true);
    }, [selectedSystems, binPath, pyContent, executeInlineVariantsConversion, getSelectedSystemsGroundLayerCount]);

    // Undo changes - restore to original content
    const handleUndo = useCallback(() => {
        if (!originalContent) {
            setStatusMessage('No original content to restore');
            return;
        }

        if (pyContent === originalContent) {
            setStatusMessage('No changes to undo');
            return;
        }

        setPyContent(originalContent);
        setHasUnsavedChanges(false);
        setStatusMessage('Changes reverted to original');
    }, [originalContent, pyContent]);

    // Open delete confirmation modal
    const handleDeleteVariant2Click = useCallback((systemKey, event) => {
        event.stopPropagation(); // Prevent system selection when clicking delete

        if (!pyContent) {
            setStatusMessage('Load a file first');
            return;
        }

        setPendingDeleteSystemKey(systemKey);
        setShowDeleteModal(true);
    }, [pyContent]);

    // Confirm and execute deletion
    const handleDeleteConfirm = useCallback(async () => {
        if (!pendingDeleteSystemKey || !pyContent) {
            setShowDeleteModal(false);
            setPendingDeleteSystemKey(null);
            return;
        }

        const systemKey = pendingDeleteSystemKey;
        setShowDeleteModal(false);
        setPendingDeleteSystemKey(null);

        try {
            setIsLoading(true);
            setLoadingText(`Deleting variant2 from ${systemKey}...`);

            const result = deleteVariant2FromSystem(pyContent, systemKey);

            if (result.success) {
                setPyContent(result.content);
                setHasUnsavedChanges(true);
                setStatusMessage(result.message);
                // Clear variant2 status cache - it will be recomputed on next render
                if (window.__fakegearVariant2Systems) {
                    window.__fakegearVariant2Systems.delete(systemKey);
                }
                console.log('[FakeGearSkin] Deleted variant2 from system:', result);
            } else {
                setStatusMessage(`Error: ${result.error}`);
            }
        } catch (error) {
            console.error('Error deleting variant2:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [pendingDeleteSystemKey, pyContent]);

    // Cancel deletion
    const handleDeleteCancel = useCallback(() => {
        setShowDeleteModal(false);
        setPendingDeleteSystemKey(null);
    }, []);

    // Remove renderPhaseOverride from system
    const handleRemoveRenderPhase = useCallback((systemKey, event) => {
        event.stopPropagation(); // Prevent system selection

        if (!pyContent) {
            setStatusMessage('Load a file first');
            return;
        }

        try {
            setIsLoading(true);
            setLoadingText(`Removing renderPhaseOverride from ${systemKey}...`);

            const result = removeRenderPhaseOverrideFromSystem(pyContent, systemKey);

            if (result.success) {
                setPyContent(result.content);
                setHasUnsavedChanges(true);
                setStatusMessage(result.message);
                console.log('[FakeGearSkin] Removed renderPhaseOverride from system:', result);
            } else {
                setStatusMessage(`Error: ${result.error}`);
            }
        } catch (error) {
            console.error('Error removing renderPhaseOverride:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [pyContent]);


    // Check if system already has variants
    const systemHasVariants = useCallback((systemKey) => {
        return hasToggleVariants(pyContent, systemKey);
    }, [pyContent]);

    // Clear toast after 5 seconds
    useEffect(() => {
        if (statusMessage && !statusMessage.startsWith('Load') && !statusMessage.startsWith('Error')) {
            const timer = setTimeout(() => {
                setStatusMessage('');
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [statusMessage]);

    return (
        <Box className="fakegear-container">
            {/* Initial Warning Modal */}
            {showWarning && (
                <div className="fakegear-modal-overlay" style={{ zIndex: 10000 }}>
                    <div className="fakegear-modal" onClick={e => e.stopPropagation()} style={{ borderColor: 'rgba(234, 179, 8, 0.5)', maxWidth: '600px' }}>
                        <div className="fakegear-modal-header">
                            <InfoOutlinedIcon style={{ color: '#fbbf24', fontSize: '1.5rem' }} />
                            <Typography className="fakegear-modal-title" style={{ color: '#fbbf24' }}>
                                ⚠️ Test Page Warning
                            </Typography>
                        </div>

                        <div className="fakegear-modal-body">
                            <Typography className="fakegear-modal-desc" style={{ fontSize: '1rem', lineHeight: '1.6' }}>
                                This is a <strong style={{ color: '#fbbf24' }}>test page</strong> meant to make VFX exchangeable.
                            </Typography>
                            <Typography className="fakegear-modal-desc" style={{ marginTop: '1rem', fontSize: '0.95rem', opacity: 0.9 }}>
                                <strong style={{ color: '#ef4444' }}>Important Limitations:</strong>
                            </Typography>
                            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', lineHeight: '1.8' }}>
                                <li>Will <strong style={{ color: '#ef4444' }}>NOT work</strong> on stencil emitters</li>
                                <li>Will <strong style={{ color: '#ef4444' }}>NOT work</strong> on emitters that have <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '3px' }}>isGroundLayer</code></li>
                            </ul>
                            <Typography className="fakegear-modal-desc" style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.7, fontStyle: 'italic' }}>
                                Please proceed with caution and test thoroughly.
                            </Typography>
                        </div>

                        <div className="fakegear-modal-actions">
                            <button 
                                className="fakegear-modal-btn confirm" 
                                onClick={() => setShowWarning(false)} 
                                style={{ background: '#fbbf24', color: '#000', width: '100%' }}
                            >
                                I Understand, Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Header */}
            <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.2)'
            }}>
                {/* Title Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>
                        🪄 FakeGearSkin {binPath ? `- ${window.require?.('path').basename(binPath)}` : ''}
                    </h1>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={loadBinFile} style={buttonStyle('#22c55e')}>
                            Open
                        </button>
                        <button
                            onClick={handleUndo}
                            disabled={!originalContent || pyContent === originalContent}
                            style={buttonStyle('#6cb6ff', !originalContent || pyContent === originalContent)}
                            title="Undo changes (restore original)"
                        >
                            Undo
                        </button>
                        <button
                            onClick={saveFile}
                            disabled={!hasUnsavedChanges}
                            style={buttonStyle('#ecb96a', !hasUnsavedChanges)}
                        >
                            Save
                        </button>
                    </div>
                </div>

                {/* Status */}
                <div style={{ fontSize: '12px', color: '#888' }}>{statusMessage}</div>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left Panel - System List */}
                <div style={{
                    flex: 1,
                    borderRight: '1px solid rgba(255,255,255,0.1)',
                    overflow: 'auto',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'rgba(0,0,0,0.1)'
                    }}>
                        <Typography variant="h6" style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>VFX Systems</Typography>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <Tooltip title="Select all visible">
                                <IconButton size="small" onClick={selectAll} sx={{ padding: '4px' }}>
                                    <CheckBoxIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Deselect all">
                                <IconButton size="small" onClick={deselectAll} sx={{ padding: '4px' }}>
                                    <CheckBoxOutlineBlankIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </div>
                    </div>

                    {/* Search */}
                    <div style={{
                        padding: '8px 16px',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(0,0,0,0.05)'
                    }}>
                        <SearchIcon style={{ color: 'var(--text-2)', fontSize: '18px' }} />
                        <input
                            type="text"
                            placeholder="Search systems..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                flex: 1,
                                padding: '6px 8px',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '4px',
                                color: 'var(--text)',
                                fontSize: '12px',
                                fontFamily: 'inherit',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* System List - Virtualized */}
                    <div ref={listContainerRef} style={{ flex: 1, overflow: 'hidden', padding: '0' }}>
                        {isLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-2)' }}>
                                <CircularProgress size={32} />
                                <Typography style={{ marginTop: '1rem' }}>{loadingText}</Typography>
                            </div>
                        ) : systems.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-2)' }}>
                                <Typography>No VFX systems found</Typography>
                            </div>
                        ) : filteredSystems.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-2)' }}>
                                <Typography>No matching systems</Typography>
                            </div>
                        ) : (
                            <List
                                height={400}
                                rowCount={flattenedRows.length}
                                rowHeight={40}
                                width="100%"
                                style={{ overflowX: 'hidden' }}
                                rowProps={{
                                    rows: flattenedRows,
                                    selectedSystems,
                                    selectedEmitters,
                                    expandedSystems,
                                    pyContent,
                                    isLoading,
                                    toggleSystemSelection,
                                    toggleEmitterSelection,
                                    toggleExpand,
                                    handleRemoveRenderPhase,
                                    handleDeleteVariant2Click,
                                    isToggleScreenSystem
                                }}
                                rowComponent={SystemRowComponent}
                            />
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: '8px 16px',
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(0,0,0,0.1)',
                        fontSize: '11px',
                        color: 'var(--text-2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px'
                    }}>
                        <span>
                            {selectedSystems.size} system{selectedSystems.size !== 1 ? 's' : ''} · {selectedEmitters.size} emitter{selectedEmitters.size !== 1 ? 's' : ''} selected
                        </span>
                        {selectedEmitters.size > 0 ? (
                            <button
                                onClick={initiateEmitterDuplication}
                                disabled={isLoading}
                                style={{
                                    padding: '8px 16px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(168, 85, 247, 0.3))',
                                    border: '1px solid #a78bfa',
                                    borderRadius: '6px',
                                    color: '#c4b5fd',
                                    cursor: isLoading ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit',
                                    opacity: isLoading ? 0.5 : 1,
                                    transition: 'all 0.15s ease',
                                    boxShadow: '0 2px 8px rgba(139, 92, 246, 0.2)'
                                }}
                            >
                                ✨ Duplicate {selectedEmitters.size} Emitter{selectedEmitters.size !== 1 ? 's' : ''} as Inline
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* Right Panel - Actions & Steps */}
                <div style={{
                    width: '35%',
                    minWidth: '300px',
                    overflow: 'auto',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(0,0,0,0.1)'
                    }}>
                        <Typography variant="h6" style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Actions</Typography>
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>

                        {/* Step 1: Convert */}
                        <Box className={`fakegear-step ${selectedSystems.size > 0 ? 'active' : ''}`}>
                            <div className="fakegear-step-number">1</div>
                            <Box className="fakegear-step-header">
                                <Typography className="fakegear-step-title">Convert Variants</Typography>
                            </Box>
                            <Typography className="fakegear-step-desc">
                                Creates variant1 (OFF) and variant2 (ON) for selected systems.
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                                <button
                                    onClick={handleConvertToVariants}
                                    disabled={selectedSystems.size === 0 || isLoading}
                                    style={buttonStyle('#ecb96a', selectedSystems.size === 0 || isLoading)}
                                >
                                    Convert to Child Particles
                                </button>
                                <button
                                    onClick={handleConvertToInlineVariants}
                                    disabled={selectedSystems.size === 0 || isLoading}
                                    style={buttonStyle('#9d8cd9', selectedSystems.size === 0 || isLoading)}
                                >
                                    Duplicate as Inline Variants
                                </button>
                            </Box>
                            <Typography variant="caption" sx={{ color: 'var(--text-secondary)', mt: 1, display: 'block', fontSize: '0.7rem' }}>
                                Child Particles: Creates separate VFX systems for each variant.<br />
                                Inline Variants: Duplicates emitters within the same system.
                            </Typography>
                        </Box>

                        {/* Step 2: Toggle Screen */}
                        <Box className={`fakegear-step ${hasToggleScreen(pyContent) ? 'completed' : 'active'}`}>
                            <div className="fakegear-step-number">2</div>
                            <Box className="fakegear-step-header">
                                <Typography className="fakegear-step-title">Toggle Screen</Typography>
                            </Box>
                            <Typography className="fakegear-step-desc">
                                Adds the screen filter effect that controls visibility.
                            </Typography>

                            {hasToggleScreen(pyContent) ? (
                                <Box className="fakegear-exists-badge">
                                    togglescreen exists
                                </Box>
                            ) : (
                                <button
                                    onClick={handleAddToggleScreen}
                                    disabled={!pyContent}
                                    style={buttonStyle('#22c55e', !pyContent)}
                                >
                                    Add Toggle Screen
                                </button>
                            )}
                        </Box>

                        {/* Step 3: Animation Toggle */}
                        <Box className={`fakegear-step ${hasAnimationToggle(pyContent) ? 'completed' : 'active'}`}>
                            <div className="fakegear-step-number">3</div>
                            <Box className="fakegear-step-header">
                                <Typography className="fakegear-step-title">Animation Logic</Typography>
                            </Box>
                            <Typography className="fakegear-step-desc">
                                Adds Ctrl+5 logic to switch meshes and animations.
                            </Typography>

                            {hasAnimationToggle(pyContent) ? (
                                <Box className="fakegear-exists-badge">
                                    Animation Toggle exists
                                </Box>
                            ) : (
                                <button
                                    onClick={handleAddAnimationToggle}
                                    disabled={!pyContent}
                                    style={buttonStyle('#6cb6ff', !pyContent)}
                                >
                                    Add Animation Toggle
                                </button>
                            )}
                        </Box>


                    </div>
                </div>
            </div>

            {/* Toast Notification */}
            {statusMessage && (
                <Box className="fakegear-toast-container">
                    <Box className="fakegear-toast">
                        <InfoOutlinedIcon fontSize="small" style={{ color: 'var(--accent)' }} />
                        <Typography variant="body2">{statusMessage}</Typography>
                    </Box>
                </Box>
            )}

            {/* Stencil ID Modal */}
            <StencilModal
                open={showStencilModal}
                stencilId={customStencilId}
                onChange={setCustomStencilId}
                onConfirm={handleStencilModalConfirm}
                onClose={() => setShowStencilModal(false)}
            />

            {/* Delete Confirmation Modal */}
            <DeleteConfirmModal
                open={showDeleteModal}
                systemKey={pendingDeleteSystemKey}
                onConfirm={handleDeleteConfirm}
                onCancel={handleDeleteCancel}
            />

            {/* Child Particles Warning Modal */}
            <ChildParticlesWarningModal
                open={showChildParticlesWarning}
                onConfirm={handleConfirmChildParticles}
                onCancel={handleCancelChildParticles}
            />

            {/* Ground Layer Warning Modal */}
            {showGroundLayerWarning && (() => {
                // Determine if this is for emitters or systems
                const isEmitterMode = selectedEmitters.size > 0;
                const groundCount = isEmitterMode 
                    ? getSelectedEmitterDetails().groundLayerCount 
                    : getSelectedSystemsGroundLayerCount();
                
                return (
                    <div className="fakegear-modal-overlay" onClick={() => setShowGroundLayerWarning(false)}>
                        <div className="fakegear-modal" onClick={e => e.stopPropagation()} style={{ borderColor: 'rgba(239, 68, 68, 0.5)', maxWidth: '550px' }}>
                            <div className="fakegear-modal-header">
                                <WarningAmberIcon style={{ color: '#f87171', fontSize: '1.5rem' }} />
                                <Typography className="fakegear-modal-title" style={{ color: '#f87171' }}>
                                    ⚠️ Ground Layer Emitters Detected
                                </Typography>
                            </div>

                            <div className="fakegear-modal-body">
                                <Typography className="fakegear-modal-desc">
                                    <strong style={{ color: '#f87171' }}>{groundCount}</strong> {isEmitterMode ? 'of your selected emitters have' : 'emitters in selected systems have'} <strong style={{ color: 'var(--accent)' }}>isGroundLayer: flag = true</strong>
                                </Typography>
                                <Typography className="fakegear-modal-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.9 }}>
                                    Patching ground layer emitters will likely cause <strong style={{ color: '#f87171' }}>rendering bugs</strong> where the character renders <strong>behind</strong> the particle effect.
                                </Typography>
                                <Typography className="fakegear-modal-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.7 }}>
                                    What would you like to do?
                                </Typography>
                            </div>

                            <div className="fakegear-modal-actions" style={{ flexDirection: 'column', gap: '8px' }}>
                                {isEmitterMode ? (
                                    <>
                                        <button 
                                            className="fakegear-modal-btn confirm" 
                                            onClick={() => {
                                                setShowGroundLayerWarning(false);
                                                // Try auto-detect stencil ID
                                                const existingId = extractStencilIdFromToggleScreen(pyContent);
                                                if (existingId) {
                                                    handleDuplicateEmittersAsInline(existingId, true); // skip ground layer
                                                } else {
                                                    setPendingAction('emitter-inline-skip');
                                                    setShowStencilModal(true);
                                                }
                                            }}
                                            style={{ background: '#22c55e', color: '#000', width: '100%' }}
                                        >
                                            Skip Ground Layer Emitters (Recommended)
                                        </button>
                                        <button 
                                            className="fakegear-modal-btn" 
                                            onClick={() => {
                                                setShowGroundLayerWarning(false);
                                                // Try auto-detect stencil ID
                                                const existingId = extractStencilIdFromToggleScreen(pyContent);
                                                if (existingId) {
                                                    handleDuplicateEmittersAsInline(existingId, false); // include ground layer
                                                } else {
                                                    setPendingAction('emitter-inline');
                                                    setShowStencilModal(true);
                                                }
                                            }}
                                            style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #f87171', color: '#f87171', width: '100%' }}
                                        >
                                            Patch Anyway (May Cause Bugs)
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button 
                                            className="fakegear-modal-btn confirm" 
                                            onClick={() => {
                                                setShowGroundLayerWarning(false);
                                                // Skip ground layer - set flag and continue
                                                setPendingAction('inlineVariants-skip');
                                                const existingId = extractStencilIdFromToggleScreen(pyContent);
                                                if (existingId) {
                                                    executeInlineVariantsConversion(existingId, true); // skip ground layer
                                                } else {
                                                    setCustomStencilId('');
                                                    setShowStencilModal(true);
                                                }
                                            }}
                                            style={{ background: '#22c55e', color: '#000', width: '100%' }}
                                        >
                                            Skip Ground Layer Emitters (Recommended)
                                        </button>
                                        <button 
                                            className="fakegear-modal-btn" 
                                            onClick={() => {
                                                setShowGroundLayerWarning(false);
                                                // Continue with inline variants conversion including ground layer
                                                const existingId = extractStencilIdFromToggleScreen(pyContent);
                                                if (existingId) {
                                                    executeInlineVariantsConversion(existingId, false);
                                                } else {
                                                    setPendingAction('inlineVariants');
                                                    setCustomStencilId('');
                                                    setShowStencilModal(true);
                                                }
                                            }}
                                            style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #f87171', color: '#f87171', width: '100%' }}
                                        >
                                            Patch Anyway (May Cause Bugs)
                                        </button>
                                    </>
                                )}
                                <button 
                                    className="fakegear-modal-btn cancel" 
                                    onClick={() => setShowGroundLayerWarning(false)}
                                    style={{ width: '100%' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </Box>
    );
}

// Memoized Modal Component
const StencilModal = React.memo(({ open, stencilId, onChange, onConfirm, onClose }) => {
    // Use local state to avoid parent re-renders on every keystroke
    const [localValue, setLocalValue] = React.useState(stencilId);

    // Update local state when prop changes (e.g., when modal opens)
    React.useEffect(() => {
        if (open) {
            setLocalValue(stencilId);
        }
    }, [open, stencilId]);

    const handleConfirm = React.useCallback(() => {
        onChange(localValue);
        onConfirm();
    }, [localValue, onChange, onConfirm]);

    const handleKeyDown = React.useCallback((e) => {
        if (e.key === 'Enter') {
            handleConfirm();
        } else if (e.key === 'Escape') {
            onClose();
        }
    }, [handleConfirm, onClose]);

    if (!open) return null;

    return (
        <div className="fakegear-modal-overlay" onClick={onClose}>
            <div className="fakegear-modal" onClick={e => e.stopPropagation()}>
                <div className="fakegear-modal-header">
                    <AutoFixHighIcon />
                    <Typography className="fakegear-modal-title">Configure Stencil ID</Typography>
                </div>

                <div className="fakegear-modal-body">
                    <Typography className="fakegear-modal-desc">
                        Set the unique Stencil Reference ID for your variant toggle.
                        This ID links the screen filter to the mesh visibility.
                    </Typography>

                    <div>
                        <input
                            type="text"
                            className="fakegear-modal-input"
                            placeholder="0xe6deedc4 (Default)"
                            value={localValue}
                            onChange={(e) => setLocalValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                        />
                        <Typography className="fakegear-modal-hint" style={{ marginTop: '0.5rem' }}>
                            Leave empty to use default (0xe6deedc4)
                        </Typography>
                    </div>
                </div>

                <div className="fakegear-modal-actions">
                    <button className="fakegear-modal-btn cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="fakegear-modal-btn confirm" onClick={handleConfirm}>
                        Confirm & Proceed
                    </button>
                </div>
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison: only re-render if open state changes or initial stencilId changes
    return prevProps.open === nextProps.open && 
           prevProps.stencilId === nextProps.stencilId &&
           prevProps.onChange === nextProps.onChange &&
           prevProps.onConfirm === nextProps.onConfirm &&
           prevProps.onClose === nextProps.onClose;
});

// Child Particles Warning Modal Component
const ChildParticlesWarningModal = React.memo(({ open, onConfirm, onCancel }) => {
    if (!open) return null;

    return (
        <div className="fakegear-modal-overlay" onClick={onCancel}>
            <div className="fakegear-modal" onClick={e => e.stopPropagation()} style={{ borderColor: 'rgba(234, 179, 8, 0.3)' }}>
                <div className="fakegear-modal-header">
                    <InfoOutlinedIcon style={{ color: '#fbbf24', fontSize: '1.5rem' }} />
                    <Typography className="fakegear-modal-title" style={{ color: '#fbbf24' }}>
                        ⚠️ Warning: Child Particles Method
                    </Typography>
                </div>

                <div className="fakegear-modal-body">
                    <Typography className="fakegear-modal-desc">
                        The <strong style={{ color: 'var(--accent)' }}>"Convert to Child Particles"</strong> method creates separate VFX systems for each variant, which can cause more bugs and compatibility issues.
                    </Typography>
                    <Typography className="fakegear-modal-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.8 }}>
                        <strong style={{ color: '#4ade80' }}>Recommended:</strong> Use <strong>"Duplicate as Inline Variants"</strong> instead, which duplicates emitters within the same system and has fewer bugs.
                    </Typography>
                    <Typography className="fakegear-modal-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.7 }}>
                        Do you still want to proceed with Child Particles?
                    </Typography>
                </div>

                <div className="fakegear-modal-actions">
                    <button className="fakegear-modal-btn cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="fakegear-modal-btn confirm" onClick={onConfirm} style={{ background: '#fbbf24', color: '#000' }}>
                        Proceed Anyway
                    </button>
                </div>
            </div>
        </div>
    );
});

// Delete Confirmation Modal Component
const DeleteConfirmModal = React.memo(({ open, systemKey, onConfirm, onCancel }) => {
    if (!open) return null;

    return (
        <div className="fakegear-modal-overlay" onClick={onCancel}>
            <div className="fakegear-modal" onClick={e => e.stopPropagation()} style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                <div className="fakegear-modal-header">
                    <DeleteIcon style={{ color: '#ef4444', fontSize: '1.5rem' }} />
                    <Typography className="fakegear-modal-title" style={{ color: '#ef4444' }}>
                        Revert Variants
                    </Typography>
                </div>

                <div className="fakegear-modal-body">
                    <Typography className="fakegear-modal-desc">
                        Are you sure you want to revert variants from <strong style={{ color: 'var(--accent)' }}>"{systemKey}"</strong>?
                    </Typography>
                    <Typography className="fakegear-modal-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.8 }}>
                        This will:
                    </Typography>
                    <ul style={{ marginTop: '0.5rem', fontSize: '0.8rem', opacity: 0.8, paddingLeft: '1.5rem' }}>
                        <li>Delete all _Variant2 emitters</li>
                        <li>Rename _Variant1 emitters back to original names</li>
                        <li>Remove stencil properties (only those matching your togglescreen ID)</li>
                        <li>Remove renderPhaseOverride</li>
                    </ul>
                </div>

                <div className="fakegear-modal-actions">
                    <button className="fakegear-modal-btn cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    <button 
                        className="fakegear-modal-btn" 
                        onClick={onConfirm}
                        style={{
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: '1px solid #ef4444'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#dc2626'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = '#ef4444'}
                    >
                        Revert Variants
                    </button>
                </div>
            </div>
        </div>
    );
});
