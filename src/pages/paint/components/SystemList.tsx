/*
 * SystemList Component
 * Scrollable list of VFX systems / emitters / static materials.
 * Ported from the Electron Quartz paint2 SystemList. The original wrapped rows
 * in react-window for virtualization; that dependency is not present here, so
 * rows render in a plain scroll container with identical markup and classes.
 */

import React, { useMemo } from 'react';
import { Box, Typography, Checkbox, IconButton, Tooltip } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PaletteIcon from '@mui/icons-material/Palette';
import ColorBlock from './ColorBlock';
import { getEmitterColors, type ParsedFile, type Emitter, type ColorKeyframe } from '../utils/parser';
import type { Material, MaterialColorParam } from '../utils/staticMaterialParser';

const ROW_HEIGHT = 42;

type SystemRow = { type: 'system'; key: string; system: import('../utils/parser').VfxSystem; matchingCount: number };
type EmitterRow = { type: 'emitter'; key: string; emitter: Emitter; systemKey: string; indexInSystem: number };
type MaterialRow = { type: 'material'; key: string; material: Material };
type MaterialParamRow = { type: 'materialParam'; key: string; selectionKey: string; param: MaterialColorParam; materialKey: string };
type ListRow = SystemRow | EmitterRow | MaterialRow | MaterialParamRow;

interface SystemListProps {
    parsedFile: ParsedFile;
    selection: Set<string>;
    lockedSystems: Set<string>;
    expandedSystems: Set<string>;
    expandedMaterials: Set<string>;
    searchQuery: string;
    searchByTexture: boolean;
    variantFilter: 'all' | 'v1' | 'v2';
    viewMode: string;
    showBirthColor: boolean;
    showOC: boolean;
    showLingerColor: boolean;
    showBaseColor?: boolean;
    onToggleEmitter: (key: string) => void;
    onToggleSystem: (key: string, selected: boolean) => void;
    onToggleLock: (key: string) => void;
    onToggleExpand: (key: string) => void;
    onToggleMaterialExpand: (key: string) => void;
    onToggleMaterialParam: (key: string, selected: boolean) => void;
    onMaterialParamValueChange: (materialKey: string, paramName: string, newValues: number[]) => void;
    onColorClick: (colors: ColorKeyframe[]) => void;
    onSetBlendMode: (emitterKey: string, mode: number) => void;
    onTextureHover: (e: React.MouseEvent, emitter: Emitter) => void;
    onTextureLeave: () => void;
    onTextureClick: (emitter: Emitter) => void;
}

const Row = React.memo(function Row(props: { row: ListRow } & Omit<SystemListProps, 'parsedFile' | 'searchQuery' | 'searchByTexture' | 'variantFilter' | 'viewMode'>) {
    const {
        row, selection, lockedSystems, expandedSystems, expandedMaterials,
        showBirthColor, showOC, showLingerColor, showBaseColor,
        onToggleEmitter, onToggleSystem, onToggleLock, onToggleExpand,
        onToggleMaterialExpand, onToggleMaterialParam, onMaterialParamValueChange,
        onColorClick, onSetBlendMode, onTextureHover, onTextureLeave, onTextureClick,
    } = props;

    const style: React.CSSProperties = { height: ROW_HEIGHT };

    // === MATERIAL HEADER ROW ===
    if (row.type === 'material') {
        const isExpanded = expandedMaterials.has(row.key);
        const allParams = row.material?.colorParams || [];
        const colorParams = allParams.filter(p => p.isColor !== false);
        const paramKeys = colorParams.map(p => `mat::${row.key}::${p.name}`);
        const allSelected = paramKeys.length > 0 && paramKeys.every(k => selection.has(k));
        const someSelected = paramKeys.some(k => selection.has(k));

        return (
            <Box
                style={style}
                className="paint-material-row"
                onClick={() => onToggleMaterialExpand(row.key)}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 2, padding: '0 20px',
                    background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent), transparent 90%), color-mix(in srgb, var(--accent), transparent 97%))',
                    borderBottom: '1px solid color-mix(in srgb, var(--accent), transparent 80%)',
                    cursor: 'pointer',
                    '&:hover': { background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent), transparent 85%), color-mix(in srgb, var(--accent), transparent 95%))' },
                }}
            >
                <Checkbox
                    size="medium"
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onClick={(e) => {
                        e.stopPropagation();
                        paramKeys.forEach(k => onToggleMaterialParam(k, !allSelected));
                    }}
                    sx={{ padding: '4px', color: 'color-mix(in srgb, var(--accent), transparent 40%)', '&.Mui-checked': { color: 'var(--accent)' }, '& .MuiSvgIcon-root': { fontSize: '1.4rem' } }}
                />
                <Box sx={{ display: 'flex', alignItems: 'center', color: 'color-mix(in srgb, var(--accent), transparent 30%)', mr: -0.5 }}>
                    {isExpanded ? <ExpandMoreIcon sx={{ fontSize: '1.4rem' }} /> : <ChevronRightIcon sx={{ fontSize: '1.4rem' }} />}
                </Box>
                <PaletteIcon sx={{ fontSize: 22, color: 'var(--accent)', opacity: 0.8 }} />
                <Tooltip title={row.material?.displayName || row.material?.name}>
                    <Typography sx={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: '1rem', fontWeight: 700, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.material?.name || 'Material'}
                    </Typography>
                </Tooltip>
                <Typography sx={{ fontSize: '0.85rem', color: 'color-mix(in srgb, var(--accent), transparent 40%)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    {colorParams.length} colors{allParams.length > colorParams.length && ` / ${allParams.length} total`}
                </Typography>
            </Box>
        );
    }

    // === MATERIAL PARAM ROW ===
    if (row.type === 'materialParam') {
        const isSelected = selection.has(row.selectionKey);
        const rgba = row.param?.values || [0.5, 0.5, 0.5, 1];
        const isColor = row.param?.isColor !== false;
        const isNonColor = !isColor;

        return (
            <Box
                style={style}
                className={`paint-material-param-row${isSelected ? ' is-selected' : ''}${isNonColor ? ' is-non-color' : ''}`}
                onClick={() => { if (isColor) onToggleMaterialParam(row.selectionKey, !isSelected); }}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 2, padding: '0 20px 0 52px',
                    background: isNonColor ? 'rgba(100, 100, 100, 0.05)' : isSelected ? 'color-mix(in srgb, var(--accent), transparent 90%)' : 'transparent',
                    borderBottom: '1px solid color-mix(in srgb, var(--accent), transparent 95%)',
                    cursor: isColor ? 'pointer' : 'default',
                    opacity: isNonColor ? 0.6 : 1,
                    '&:hover': { background: isColor ? 'color-mix(in srgb, var(--accent), transparent 94%)' : 'rgba(100, 100, 100, 0.08)' },
                }}
            >
                <Checkbox
                    size="medium"
                    checked={isSelected}
                    disabled={isNonColor}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => isColor && onToggleMaterialParam(row.selectionKey, !isSelected)}
                    sx={{ padding: '4px', color: isNonColor ? 'rgba(100, 100, 100, 0.3)' : 'color-mix(in srgb, var(--accent), transparent 50%)', '&.Mui-checked': { color: 'var(--accent)' }, '&.Mui-disabled': { color: 'rgba(100, 100, 100, 0.2)' }, '& .MuiSvgIcon-root': { fontSize: '1.3rem' } }}
                />
                <Typography sx={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.95rem', color: isNonColor ? 'rgba(180, 180, 180, 0.7)' : isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: isNonColor ? 'italic' : 'normal' }}>
                    {row.param?.name || 'Param'}
                    {isNonColor && <span style={{ marginLeft: 10, fontSize: '0.75rem', opacity: 0.5 }}>(control)</span>}
                </Typography>
                {isColor ? (
                    <Box
                        onClick={(e) => { e.stopPropagation(); onColorClick([{ rgba, time: 0, lineNum: row.param.valueLine }]); }}
                        sx={{
                            width: 80, height: 26, borderRadius: '6px',
                            background: `rgb(${Math.round(rgba[0] * 255)}, ${Math.round(rgba[1] * 255)}, ${Math.round(rgba[2] * 255)})`,
                            border: '2px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                            '&:hover': { borderColor: 'var(--accent)', boxShadow: '0 0 8px color-mix(in srgb, var(--accent), transparent 60%)' },
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
                                    width: '52px', height: '26px', background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(150, 150, 150, 0.3)', borderRadius: '4px',
                                    color: 'rgba(200, 200, 200, 0.8)', fontFamily: 'JetBrains Mono, monospace',
                                    fontSize: '0.8rem', textAlign: 'center', outline: 'none', padding: '2px 4px',
                                }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; e.target.style.background = 'color-mix(in srgb, var(--accent), transparent 90%)'; }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'rgba(150, 150, 150, 0.3)';
                                    e.target.style.background = 'rgba(0,0,0,0.3)';
                                    const newVal = parseFloat(e.target.value);
                                    if (!isNaN(newVal) && newVal !== val) {
                                        const newValues = [...rgba];
                                        newValues[i] = newVal;
                                        onMaterialParamValueChange(row.materialKey, row.param.name, newValues);
                                    }
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            />
                        ))}
                    </Box>
                )}
            </Box>
        );
    }

    if (row.type === 'system') {
        const isExpanded = expandedSystems.has(row.key);
        const isLocked = lockedSystems.has(row.key);
        const emitterKeys = row.system?.emitterKeys || [];
        const allSelected = emitterKeys.length > 0 && emitterKeys.every(k => selection.has(k));
        const someSelected = emitterKeys.some(k => selection.has(k));

        const systemName = row.system?.name || 'Unnamed System';
        const displaySystemName = systemName.includes('/') ? systemName.split('/').pop() : systemName;

        return (
            <Box
                style={style}
                className={`paint-system-row${isLocked ? ' is-locked' : ''}${allSelected ? ' is-selected' : ''}`}
                onClick={() => onToggleExpand(row.key)}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, padding: '0 16px',
                    background: isLocked ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)', cursor: 'pointer',
                    '&:hover': { background: 'rgba(255, 255, 255, 0.04)' },
                }}
            >
                <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    disabled={isLocked}
                    onClick={(e) => { e.stopPropagation(); onToggleSystem(row.key, !allSelected); }}
                    sx={{ padding: '2px', color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent)' } }}
                />
                <Box sx={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', mr: -0.5 }}>
                    {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                </Box>
                <Tooltip title={systemName}>
                    <Typography sx={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem', fontWeight: 600, color: isLocked ? 'color-mix(in srgb, var(--accent), transparent 60%)' : 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displaySystemName}
                    </Typography>
                </Tooltip>
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', mr: 2 }}>
                    {row.matchingCount} emitters
                </Typography>
                <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onToggleLock(row.key); }}
                    sx={{ opacity: isLocked ? 1 : 0.3, color: isLocked ? 'var(--error-color)' : 'var(--text-2)' }}
                >
                    {isLocked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                </IconButton>
            </Box>
        );
    }

    // === EMITTER ROW ===
    const isSelected = selection.has(row.key);
    const isLocked = lockedSystems.has(row.systemKey);
    const colors = getEmitterColors(row.emitter);
    const currentBlendMode = row.emitter.blendMode !== undefined ? row.emitter.blendMode : 0;

    return (
        <Box
            style={style}
            className={`paint-emitter-row${isSelected ? ' is-selected' : ''}`}
            onClick={() => { if (!isLocked) onToggleEmitter(row.key); }}
            sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, padding: '0 16px 0 32px',
                background: isSelected ? 'color-mix(in srgb, var(--accent), transparent 95%)' : 'transparent',
                borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                opacity: isLocked ? 0.5 : 1, cursor: isLocked ? 'not-allowed' : 'pointer',
                '&:hover': { background: isLocked ? 'transparent' : 'rgba(255,255,255,0.02)' },
            }}
        >
            <Checkbox
                size="small"
                checked={isSelected}
                disabled={isLocked}
                onClick={(e) => e.stopPropagation()}
                onChange={() => { if (!isLocked) onToggleEmitter(row.key); }}
                sx={{ padding: '2px', color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent)' } }}
            />
            <Typography sx={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', color: isSelected ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.emitter?.name || 'Unnamed Emitter'}
            </Typography>
            <Box sx={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <Box
                    onMouseEnter={(e) => onTextureHover(e, row.emitter)}
                    onMouseLeave={onTextureLeave}
                    onClick={(e) => { e.stopPropagation(); onTextureClick(row.emitter); }}
                    sx={{ width: 24, height: 24, borderRadius: '4px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', cursor: 'pointer', '&:hover': { color: 'var(--accent)', borderColor: 'var(--accent)' } }}
                >
                    <ImageOutlinedIcon sx={{ fontSize: 14 }} />
                </Box>

                {showLingerColor && <ColorBlock variant="secondary" colors={colors.lingerColor} title="Linger Color" onClick={(e) => { e.stopPropagation(); if (colors.lingerColor.length > 0) onColorClick(colors.lingerColor); }} />}
                {showOC && <ColorBlock variant="secondary" colors={colors.fresnelColor} title="OC/Fresnel" onClick={(e) => { e.stopPropagation(); if (colors.fresnelColor.length > 0) onColorClick(colors.fresnelColor); }} />}
                {showBirthColor && <ColorBlock variant="standard" colors={colors.birthColor} title="Birth Color" onClick={(e) => { e.stopPropagation(); if (colors.birthColor.length > 0) onColorClick(colors.birthColor); }} />}
                {showBaseColor && <ColorBlock variant="wide" colors={colors.color} title="Base Color" onClick={(e) => { e.stopPropagation(); if (colors.color.length > 0) onColorClick(colors.color); }} />}

                <Box
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent), transparent 95%)', borderRadius: '4px', padding: '0 2px', ml: 0.5, height: '24px', border: '1px solid transparent', '&:hover': { border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)' } }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Typography sx={{ fontSize: '0.65rem', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', mr: 0.25, opacity: 0.5 }}>BM:</Typography>
                    <input
                        key={row.key}
                        type="text"
                        defaultValue={currentBlendMode}
                        disabled={isLocked}
                        style={{ width: '12px', background: 'transparent', border: 'none', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', textAlign: 'center', outline: 'none', padding: 0 }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                        onBlur={(e) => {
                            if (!isLocked) {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val !== currentBlendMode) onSetBlendMode(row.key, val);
                            }
                        }}
                    />
                </Box>
            </Box>
        </Box>
    );
});

function SystemList(props: SystemListProps) {
    const {
        parsedFile, searchQuery, searchByTexture, variantFilter, viewMode,
        expandedSystems, expandedMaterials, showBaseColor = true,
    } = props;

    const rows = useMemo<ListRow[]>(() => {
        if (!parsedFile) return [];
        const result: ListRow[] = [];
        const searchLower = (searchQuery || '').toLowerCase();
        const showVfx = viewMode !== 'materials';

        if (showVfx) {
            for (const systemKey of (parsedFile.systemOrder || [])) {
                const system = parsedFile.systems.get(systemKey);
                if (!system) continue;

                let matchingEmitters = (system.emitterKeys || [])
                    .map((k, idx) => {
                        const em = parsedFile.emitters.get(k);
                        return em ? { ...em, indexInSystem: idx + 1 } : null;
                    })
                    .filter((e): e is Emitter & { indexInSystem: number } => !!e);

                if (variantFilter === 'v1') {
                    matchingEmitters = matchingEmitters.filter(e => (e.name || '').toLowerCase().endsWith('_variant1'));
                } else if (variantFilter === 'v2') {
                    matchingEmitters = matchingEmitters.filter(e => (e.name || '').toLowerCase().endsWith('_variant2'));
                }

                if (searchQuery) {
                    const systemMatches = (system.name || '').toLowerCase().includes(searchLower) || (systemKey || '').toLowerCase().includes(searchLower);
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
        }

        for (const materialKey of (parsedFile.materialOrder || [])) {
            const material = parsedFile.materials.get(materialKey);
            if (!material || !material.colorParams || material.colorParams.length === 0) continue;

            if (searchQuery) {
                const materialMatches = (material.name || '').toLowerCase().includes(searchLower) ||
                    (material.displayName || '').toLowerCase().includes(searchLower) ||
                    (materialKey || '').toLowerCase().includes(searchLower) ||
                    material.colorParams.some(p => (p.name || '').toLowerCase().includes(searchLower));
                if (!materialMatches) continue;
            }

            result.push({ type: 'material', key: materialKey, material });

            if (expandedMaterials.has(materialKey)) {
                for (const param of material.colorParams) {
                    const selectionKey = `mat::${materialKey}::${param.name}`;
                    result.push({ type: 'materialParam', key: selectionKey, selectionKey, param, materialKey });
                }
            }
        }

        return result;
    }, [parsedFile, searchQuery, searchByTexture, expandedSystems, expandedMaterials, variantFilter, viewMode]);

    return (
        <Box className="paint2-system-scroll" sx={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
            {rows.map((row) => (
                <Row
                    key={row.key}
                    row={row}
                    selection={props.selection}
                    lockedSystems={props.lockedSystems}
                    expandedSystems={props.expandedSystems}
                    expandedMaterials={props.expandedMaterials}
                    showBirthColor={props.showBirthColor}
                    showOC={props.showOC}
                    showLingerColor={props.showLingerColor}
                    showBaseColor={showBaseColor}
                    onToggleEmitter={props.onToggleEmitter}
                    onToggleSystem={props.onToggleSystem}
                    onToggleLock={props.onToggleLock}
                    onToggleExpand={props.onToggleExpand}
                    onToggleMaterialExpand={props.onToggleMaterialExpand}
                    onToggleMaterialParam={props.onToggleMaterialParam}
                    onMaterialParamValueChange={props.onMaterialParamValueChange}
                    onColorClick={props.onColorClick}
                    onSetBlendMode={props.onSetBlendMode}
                    onTextureHover={props.onTextureHover}
                    onTextureLeave={props.onTextureLeave}
                    onTextureClick={props.onTextureClick}
                />
            ))}
        </Box>
    );
}

export default React.memo(SystemList);
