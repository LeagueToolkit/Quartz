/**
 * SystemList Component
 * Optimized virtualized list for Paint2 using react-window v2 API
 * Styled to perfectly match Image 1 layout
 * Now includes StaticMaterialDef support
 */

import React, { useMemo } from 'react';
import { List } from 'react-window';
import { Box, Typography, Checkbox, IconButton, Tooltip } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PaletteIcon from '@mui/icons-material/Palette';
import ColorBlock from './ColorBlock';
import { getEmitterColors } from '../utils/parser.js';
import { getMaterialColors } from '../utils/staticMaterialParser.js';

const ROW_HEIGHT = 42;

const Row = React.memo((props) => {
    const { index, style, rows, selection, lockedSystems, expandedSystems, expandedMaterials, showBirthColor, showOC, showLingerColor, showBaseColor, onToggleEmitter, onToggleSystem, onToggleLock, onToggleExpand, onToggleMaterialExpand, onToggleMaterialParam, onMaterialParamValueChange, onColorClick, onSetBlendMode, onTextureHover, onTextureLeave, onTextureClick } = props;

    if (!rows || !rows[index]) return null;
    const row = rows[index];

    // === MATERIAL HEADER ROW ===
    if (row.type === 'material') {
        const isExpanded = (expandedMaterials || new Set()).has(row.key);
        const allParams = row.material?.colorParams || [];
        const colorParams = allParams.filter(p => p.isColor !== false);
        const paramKeys = colorParams.map(p => `mat::${row.key}::${p.name}`);
        const allSelected = paramKeys.length > 0 && paramKeys.every(k => (selection || new Set()).has(k));
        const someSelected = paramKeys.some(k => (selection || new Set()).has(k));

        return (
            <Box
                style={style}
                onClick={() => onToggleMaterialExpand && onToggleMaterialExpand(row.key)}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    padding: '0 20px',
                    background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent), transparent 90%), color-mix(in srgb, var(--accent), transparent 97%))',
                    borderBottom: '1px solid color-mix(in srgb, var(--accent), transparent 80%)',
                    cursor: 'pointer',
                    '&:hover': { background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent), transparent 85%), color-mix(in srgb, var(--accent), transparent 95%))' }
                }}
            >
                <Checkbox
                    size="medium"
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onClick={(e) => {
                        e.stopPropagation();
                        // Toggle all params in this material
                        if (onToggleMaterialParam) {
                            paramKeys.forEach(k => onToggleMaterialParam(k, !allSelected));
                        }
                    }}
                    sx={{ padding: '4px', color: 'color-mix(in srgb, var(--accent), transparent 40%)', '&.Mui-checked': { color: 'var(--accent)' }, '& .MuiSvgIcon-root': { fontSize: '1.4rem' } }}
                />

                <Box sx={{ display: 'flex', alignItems: 'center', color: 'color-mix(in srgb, var(--accent), transparent 30%)', mr: -0.5 }}>
                    {isExpanded ? <ExpandMoreIcon sx={{ fontSize: '1.4rem' }} /> : <ChevronRightIcon sx={{ fontSize: '1.4rem' }} />}
                </Box>

                <PaletteIcon sx={{ fontSize: 22, color: 'var(--accent)', opacity: 0.8 }} />

                <Tooltip title={row.material?.displayName || row.material?.name}>
                    <Typography sx={{
                        flex: 1,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: 'var(--accent)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}>
                        {row.material?.name || 'Material'}
                    </Typography>
                </Tooltip>

                <Typography sx={{
                    fontSize: '0.85rem',
                    color: 'color-mix(in srgb, var(--accent), transparent 40%)',
                    fontFamily: 'JetBrains Mono, monospace',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 600
                }}>
                    {colorParams.length} colors{allParams.length > colorParams.length && ` / ${allParams.length} total`}
                </Typography>
            </Box>
        );
    }

    // === MATERIAL PARAM ROW ===
    if (row.type === 'materialParam') {
        const isSelected = (selection || new Set()).has(row.selectionKey);
        const rgba = row.param?.values || [0.5, 0.5, 0.5, 1];
        const isColor = row.param?.isColor !== false; // Default to true for backwards compat
        const isNonColor = !isColor;

        return (
            <Box
                style={style}
                onClick={() => {
                    // Only allow selection of color params
                    if (isColor && onToggleMaterialParam) {
                        onToggleMaterialParam(row.selectionKey, !isSelected);
                    }
                }}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    padding: '0 20px 0 52px',
                    background: isNonColor 
                        ? 'rgba(100, 100, 100, 0.05)' 
                        : isSelected ? 'color-mix(in srgb, var(--accent), transparent 90%)' : 'transparent',
                    borderBottom: '1px solid color-mix(in srgb, var(--accent), transparent 95%)',
                    cursor: isColor ? 'pointer' : 'default',
                    opacity: isNonColor ? 0.6 : 1,
                    '&:hover': { background: isColor ? 'color-mix(in srgb, var(--accent), transparent 94%)' : 'rgba(100, 100, 100, 0.08)' }
                }}
            >
                <Checkbox
                    size="medium"
                    checked={isSelected}
                    disabled={isNonColor}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => isColor && onToggleMaterialParam && onToggleMaterialParam(row.selectionKey, !isSelected)}
                    sx={{ 
                        padding: '4px', 
                        color: isNonColor ? 'rgba(100, 100, 100, 0.3)' : 'color-mix(in srgb, var(--accent), transparent 50%)', 
                        '&.Mui-checked': { color: 'var(--accent)' },
                        '&.Mui-disabled': { color: 'rgba(100, 100, 100, 0.2)' },
                        '& .MuiSvgIcon-root': { fontSize: '1.3rem' }
                    }}
                />

                <Typography sx={{
                    flex: 1,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.95rem',
                    color: isNonColor ? 'rgba(180, 180, 180, 0.7)' : isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.85)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontStyle: isNonColor ? 'italic' : 'normal'
                }}>
                    {row.param?.name || 'Param'}
                    {isNonColor && <span style={{ marginLeft: 10, fontSize: '0.75rem', opacity: 0.5 }}>(control)</span>}
                </Typography>

                {/* Value preview - show color swatch for colors, editable inputs for non-colors */}
                {isColor ? (
                    <Box
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onColorClick) {
                                onColorClick([{ rgba, time: 0 }]);
                            }
                        }}
                        sx={{
                            width: 80,
                            height: 26,
                            borderRadius: '6px',
                            background: `rgb(${Math.round(rgba[0] * 255)}, ${Math.round(rgba[1] * 255)}, ${Math.round(rgba[2] * 255)})`,
                            border: '2px solid rgba(255,255,255,0.2)',
                            cursor: 'pointer',
                            '&:hover': { borderColor: 'var(--accent)', boxShadow: '0 0 8px color-mix(in srgb, var(--accent), transparent 60%)' }
                        }}
                    />
                ) : (
                    <Box sx={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                        {rgba.map((val, i) => (
                            <input
                                key={`${row.selectionKey}_${i}`}
                                type="text"
                                defaultValue={val.toFixed(2)}
                                style={{
                                    width: '52px',
                                    height: '26px',
                                    background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(150, 150, 150, 0.3)',
                                    borderRadius: '4px',
                                    color: 'rgba(200, 200, 200, 0.8)',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    fontSize: '0.8rem',
                                    textAlign: 'center',
                                    outline: 'none',
                                    padding: '2px 4px'
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = 'var(--accent)';
                                    e.target.style.background = 'color-mix(in srgb, var(--accent), transparent 90%)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'rgba(150, 150, 150, 0.3)';
                                    e.target.style.background = 'rgba(0,0,0,0.3)';
                                    const newVal = parseFloat(e.target.value);
                                    if (!isNaN(newVal) && newVal !== val && onMaterialParamValueChange) {
                                        const newValues = [...rgba];
                                        newValues[i] = newVal;
                                        onMaterialParamValueChange(row.materialKey, row.param.name, newValues);
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.target.blur();
                                    }
                                }}
                            />
                        ))}
                    </Box>
                )}
            </Box>
        );
    }

    if (row.type === 'system') {
        const isExpanded = (expandedSystems || new Set()).has(row.key);
        const isLocked = (lockedSystems || new Set()).has(row.key);
        const emitterKeys = row.system?.emitterKeys || [];
        const allSelected = emitterKeys.length > 0 && emitterKeys.every(k => (selection || new Set()).has(k));
        const someSelected = emitterKeys.some(k => (selection || new Set()).has(k));

        const systemName = row.system?.name || 'Unnamed System';
        const displaySystemName = systemName.includes('/') ? systemName.split('/').pop() : systemName;

        return (
            <Box
                style={style}
                onClick={() => onToggleExpand && onToggleExpand(row.key)}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    padding: '0 16px',
                    background: isLocked ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    cursor: 'pointer',
                    '&:hover': { background: 'rgba(255, 255, 255, 0.04)' }
                }}
            >
                <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    disabled={isLocked}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onToggleSystem) onToggleSystem(row.key, !allSelected);
                    }}
                    sx={{ padding: '2px', color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent)' } }}
                />

                <Box sx={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', mr: -0.5 }}>
                    {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                </Box>

                <Tooltip title={systemName}>
                    <Typography sx={{
                        flex: 1,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: isLocked ? 'color-mix(in srgb, var(--accent), transparent 60%)' : 'var(--accent)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}>
                        {displaySystemName}
                    </Typography>
                </Tooltip>

                <Typography sx={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'JetBrains Mono, monospace',
                    mr: 2
                }}>
                    {row.matchingCount} emitters
                </Typography>

                <IconButton
                    size="small"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onToggleLock) onToggleLock(row.key);
                    }}
                    sx={{ opacity: isLocked ? 1 : 0.3, color: isLocked ? 'var(--error-color)' : 'var(--text-2)' }}
                >
                    {isLocked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                </IconButton>
            </Box>
        );
    }

    // Emitter row
    const isSelected = (selection || new Set()).has(row.key);
    const isLocked = (lockedSystems || new Set()).has(row.systemKey);
    const colors = getEmitterColors(row.emitter);
    const currentBlendMode = row.emitter.blendMode !== undefined ? row.emitter.blendMode : 0;

    return (
        <Box
            style={style}
            onClick={() => !isLocked && onToggleEmitter && onToggleEmitter(row.key)}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                padding: '0 16px 0 32px',
                background: isSelected ? 'color-mix(in srgb, var(--accent), transparent 95%)' : 'transparent',
                borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                opacity: isLocked ? 0.5 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                '&:hover': { background: isLocked ? 'transparent' : 'rgba(255,255,255,0.02)' }
            }}
        >
            <Checkbox
                size="small"
                checked={isSelected}
                disabled={isLocked}
                onClick={(e) => e.stopPropagation()}
                onChange={() => !isLocked && onToggleEmitter && onToggleEmitter(row.key)}
                sx={{ padding: '2px', color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent)' } }}
            />

            <Typography sx={{
                flex: 1,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.82rem',
                color: isSelected ? 'var(--accent)' : 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            }}>
                {row.emitter?.name || 'Unnamed Emitter'}
            </Typography>

            <Box sx={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {/* Texture Preview Icon */}
                <Box
                    onMouseEnter={(e) => onTextureHover && onTextureHover(e, row.emitter)}
                    onMouseLeave={onTextureLeave}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onTextureClick) onTextureClick(row.emitter);
                    }}
                    sx={{
                        width: 24, height: 24, borderRadius: '4px', background: 'rgba(255,255,255,0.05)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-muted)', cursor: 'pointer', '&:hover': { color: 'var(--accent)', borderColor: 'var(--accent)' }
                    }}>
                    <ImageOutlinedIcon sx={{ fontSize: 14 }} />
                </Box>

                {showLingerColor && <ColorBlock variant="secondary" colors={colors.lingerColor} title="Linger Color" onClick={(e) => {
                    e.stopPropagation();
                    if (colors.lingerColor.length > 0 && onColorClick) onColorClick(colors.lingerColor);
                }} />}

                {showOC && <ColorBlock variant="secondary" colors={colors.fresnelColor} title="OC/Fresnel" onClick={(e) => {
                    e.stopPropagation();
                    if (colors.fresnelColor.length > 0 && onColorClick) onColorClick(colors.fresnelColor);
                }} />}

                {showBirthColor && <ColorBlock variant="standard" colors={colors.birthColor} title="Birth Color" onClick={(e) => {
                    e.stopPropagation();
                    if (colors.birthColor.length > 0 && onColorClick) onColorClick(colors.birthColor);
                }} />}

                {showBaseColor && <ColorBlock variant="wide" colors={colors.color} title="Base Color" onClick={(e) => {
                    e.stopPropagation();
                    if (colors.color.length > 0 && onColorClick) onColorClick(colors.color);
                }} />}

                {/* Blend Mode Input */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'color-mix(in srgb, var(--accent), transparent 95%)',
                        borderRadius: '4px',
                        padding: '0 2px',
                        ml: 0.5,
                        height: '24px',
                        border: '1px solid transparent',
                        '&:hover': { border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)' }
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Typography sx={{ fontSize: '0.65rem', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', mr: 0.25, opacity: 0.5 }}>
                        BM:
                    </Typography>
                    <input
                        key={row.key} // Force re-render when row is recycled
                        type="text"
                        defaultValue={currentBlendMode}
                        disabled={isLocked}
                        style={{
                            width: '12px',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent)',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '0.8rem',
                            textAlign: 'center',
                            outline: 'none',
                            padding: 0
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.currentTarget.blur();
                            }
                        }}
                        onBlur={(e) => {
                            if (!isLocked && onSetBlendMode) {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val !== currentBlendMode) {
                                    onSetBlendMode(row.key, val);
                                }
                            }
                        }}
                    />
                </Box>
            </Box>
        </Box>
    );
});

const AutoSizer = ({ children }) => {
    const [size, setSize] = React.useState({ width: 0, height: 0 });
    const ref = React.useRef();

    React.useEffect(() => {
        if (!ref.current) return;
        const obs = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) {
                setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        obs.observe(ref.current);
        return () => obs.disconnect();
    }, []);

    return (
        <div ref={ref} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
            {size.height > 0 && children(size)}
        </div>
    );
};

function SystemList({
    parsedFile,
    selection,
    lockedSystems,
    expandedSystems,
    expandedMaterials,
    searchQuery,
    searchByTexture, // New prop
    variantFilter = 'all',
    viewMode = 'random', // 'materials' hides VFX, others show all
    showBirthColor,
    showOC,
    showLingerColor,
    onToggleEmitter,
    onToggleSystem,
    onToggleLock,
    onToggleExpand,
    onToggleMaterialExpand,
    onToggleMaterialParam,
    onMaterialParamValueChange,
    onColorClick,
    onSetBlendMode,
    onTextureHover,
    onTextureLeave,
    onTextureClick,
    showBaseColor = true
}) {
    const rows = useMemo(() => {
        if (!parsedFile) return [];
        const result = [];
        const searchLower = (searchQuery || '').toLowerCase();
        
        // In "materials" mode, only show materials
        const showVfx = viewMode !== 'materials';
        const showMaterials = true; // Always show materials when present

        // === VFX SYSTEMS (hidden in materials mode) ===
        if (showVfx) {
        for (const systemKey of (parsedFile.systemOrder || [])) {
            const system = parsedFile.systems.get(systemKey);
            if (!system) continue;

            let matchingEmitters = (system.emitterKeys || [])
                .map((k, idx) => ({ ...parsedFile.emitters.get(k), indexInSystem: idx + 1 }))
                .filter(e => e.key);

            // 1. Variant Filter
            if (variantFilter === 'v1') {
                matchingEmitters = matchingEmitters.filter(e => (e.name || '').toLowerCase().endsWith('_variant1'));
            } else if (variantFilter === 'v2') {
                matchingEmitters = matchingEmitters.filter(e => (e.name || '').toLowerCase().endsWith('_variant2'));
            }

            // 2. Search Query
            if (searchQuery) {
                const systemMatches = (system.name || '').toLowerCase().includes(searchLower) ||
                    (systemKey || '').toLowerCase().includes(searchLower);

                if (!systemMatches) {
                    matchingEmitters = matchingEmitters.filter(e =>
                        (e.name || '').toLowerCase().includes(searchLower) ||
                        (searchByTexture && ((e.texturePath && e.texturePath.toLowerCase().includes(searchLower)) ||
                            (e.textures && e.textures.some(t => t.path.toLowerCase().includes(searchLower)))))
                    );
                }
            }

            if (matchingEmitters.length === 0) continue;

            result.push({ type: 'system', key: systemKey, system, matchingCount: matchingEmitters.length });

            if (expandedSystems.has(systemKey)) {
                for (const emitter of matchingEmitters) {
                    result.push({ type: 'emitter', key: emitter.key, emitter, systemKey, indexInSystem: emitter.indexInSystem });
                }
            }
        }
        } // End showVfx block

        // === STATIC MATERIALS ===
        for (const materialKey of (parsedFile.materialOrder || [])) {
            const material = parsedFile.materials.get(materialKey);
            if (!material || !material.colorParams || material.colorParams.length === 0) continue;

            // Search filter for materials
            if (searchQuery) {
                const materialMatches = (material.name || '').toLowerCase().includes(searchLower) ||
                    (material.displayName || '').toLowerCase().includes(searchLower) ||
                    (materialKey || '').toLowerCase().includes(searchLower) ||
                    material.colorParams.some(p => (p.name || '').toLowerCase().includes(searchLower));

                if (!materialMatches) continue;
            }

            result.push({ type: 'material', key: materialKey, material });

            if ((expandedMaterials || new Set()).has(materialKey)) {
                for (const param of material.colorParams) {
                    // Use :: delimiter to avoid issues with underscores in param names
                    const selectionKey = `mat::${materialKey}::${param.name}`;
                    result.push({ type: 'materialParam', key: selectionKey, selectionKey, param, materialKey });
                }
            }
        }

        return result;
    }, [parsedFile, searchQuery, expandedSystems, expandedMaterials, variantFilter, viewMode]);

    const rowData = useMemo(() => ({
        rows,
        selection,
        lockedSystems,
        expandedSystems,
        expandedMaterials,
        showBirthColor,
        showOC,
        showLingerColor,
        showBaseColor,
        onToggleEmitter,
        onToggleSystem,
        onToggleLock,
        onToggleExpand,
        onToggleMaterialExpand,
        onToggleMaterialParam,
        onMaterialParamValueChange,
        onColorClick,
        onSetBlendMode,
        onTextureHover,
        onTextureLeave,
        onTextureClick
    }), [
        rows, selection, lockedSystems, expandedSystems, expandedMaterials, showBirthColor, showOC, showLingerColor, showBaseColor, onToggleEmitter, onToggleSystem, onToggleLock, onToggleExpand, onToggleMaterialExpand, onToggleMaterialParam, onMaterialParamValueChange, onColorClick, onSetBlendMode, onTextureHover, onTextureLeave, onTextureClick
    ]);

    return (
        <Box sx={{
            width: '100%',
            height: '100%',
            // Custom scrollbar styling - BIG AND VISIBLE
            '& .react-window-list': {
                overflowX: 'hidden !important',
                '&::-webkit-scrollbar': {
                    width: '16px',
                    background: 'var(--bg)',
                },
                '&::-webkit-scrollbar-track': {
                    background: 'var(--surface)',
                    borderRadius: '8px',
                    margin: '4px 0',
                },
                '&::-webkit-scrollbar-thumb': {
                    background: 'var(--accent)',
                    borderRadius: '8px',
                    border: '3px solid var(--surface)',
                    minHeight: '60px',
                    '&:hover': {
                        background: 'color-mix(in srgb, var(--accent), white 20%)',
                    },
                },
            }
        }}>
            <AutoSizer>
                {({ width, height }) => (
                    <List
                        className="react-window-list"
                        height={height}
                        rowCount={rows.length}
                        rowHeight={ROW_HEIGHT}
                        width={width}
                        rowProps={rowData}
                        rowComponent={Row}
                        style={{ overflowX: 'hidden' }}
                    />
                )}
            </AutoSizer>
        </Box>
    );
}

export default React.memo(SystemList);
