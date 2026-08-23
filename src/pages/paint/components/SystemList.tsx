/*
 * SystemList Component
 * Scrollable list of VFX systems / emitters / static materials.
 * Ported from the Electron Quartz paint2 SystemList. Rows are virtualized (only
 * the visible window mounts) and each Row receives plain per-row booleans rather
 * than the shared selection/lock/expand Sets — so toggling one block re-renders
 * only the rows whose own state changed, not the whole list.
 */

import React, { useMemo, type CSSProperties } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { Box, Typography, Checkbox, IconButton } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PaletteIcon from '@mui/icons-material/Palette';
import ColorBlock from './ColorBlock';
import type { VfxModel, VfxSystem, VfxEmitter, VfxMaterial, MaterialParam } from '@/lib/api';

const ROW_HEIGHT = 42;

// Keyframe shape consumed by ColorBlock / the palette import (no line numbers).
interface ColorKeyframe {
    rgba: number[];
    time: number;
}

type EmitterColorArrays = {
    color: ColorKeyframe[];
    birthColor: ColorKeyframe[];
    fresnelColor: ColorKeyframe[];
    lingerColor: ColorKeyframe[];
};

// Flatten the resident-model color slots (ColorData | null) to plain keyframe arrays.
function emitterColorArrays(emitter: VfxEmitter): EmitterColorArrays {
    const slot = (c: VfxEmitter['colors']['color']): ColorKeyframe[] =>
        (c?.keyframes ?? []).map(kf => ({ rgba: kf.rgba, time: kf.time }));
    return {
        color: slot(emitter.colors.color),
        birthColor: slot(emitter.colors.birthColor),
        fresnelColor: slot(emitter.colors.fresnelColor),
        lingerColor: slot(emitter.colors.lingerColor),
    };
}

type SystemRow = { type: 'system'; key: string; system: VfxSystem; matchingCount: number };
type EmitterRow = { type: 'emitter'; key: string; emitter: VfxEmitter; systemKey: string; indexInSystem: number };
type MaterialRow = { type: 'material'; key: string; material: VfxMaterial };
type MaterialParamRow = { type: 'materialParam'; key: string; selectionKey: string; param: MaterialParam; materialKey: string };
type ListRow = SystemRow | EmitterRow | MaterialRow | MaterialParamRow;

interface SystemListProps {
    model: VfxModel;
    selection: Set<string>;
    lockedSystems: Set<string>;
    expandedSystems: Set<string>;
    expandedMaterials: Set<string>;
    searchQuery: string;
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
    onColorAlpha: (emitterKey: string, slot: ColorSlotKey, title: string, colors: ColorKeyframe[]) => void;
    onSetBlendMode: (emitterKey: string, mode: number) => void;
    onTextureHover: (e: React.MouseEvent, emitter: VfxEmitter) => void;
    onTextureLeave: () => void;
    onTextureClick: (emitter: VfxEmitter) => void;
}

export type ColorSlotKey = 'color' | 'birthColor' | 'fresnelColor' | 'lingerColor';

/* Per-row state the parent derives once per render, so Row receives only plain
   booleans (memo-stable) instead of the shared Sets. */
interface RowState {
    selected: boolean;      // emitter / material-param selected, or system all-selected
    someSelected: boolean;  // system/material: some-but-not-all children selected
    locked: boolean;        // system locked, or emitter's system locked
    expanded: boolean;      // system / material expanded
}

type RowHandlers = Pick<SystemListProps,
    'showBirthColor' | 'showOC' | 'showLingerColor' | 'showBaseColor' |
    'onToggleEmitter' | 'onToggleSystem' | 'onToggleLock' | 'onToggleExpand' |
    'onToggleMaterialExpand' | 'onToggleMaterialParam' | 'onMaterialParamValueChange' |
    'onColorClick' | 'onColorAlpha' | 'onSetBlendMode' | 'onTextureHover' | 'onTextureLeave' | 'onTextureClick'
>;

const Row = React.memo(function Row(props: { row: ListRow; state: RowState; style: CSSProperties } & RowHandlers) {
    const {
        row, state,
        showBirthColor, showOC, showLingerColor, showBaseColor,
        onToggleEmitter, onToggleSystem, onToggleLock, onToggleExpand,
        onToggleMaterialExpand, onToggleMaterialParam, onMaterialParamValueChange,
        onColorClick, onColorAlpha, onSetBlendMode, onTextureHover, onTextureLeave, onTextureClick,
    } = props;

    const style: React.CSSProperties = { ...props.style, height: ROW_HEIGHT };

    // === MATERIAL HEADER ROW ===
    if (row.type === 'material') {
        const isExpanded = state.expanded;
        const allParams = row.material?.colorParams || [];
        const colorParams = allParams.filter(p => p.isColor !== false);
        const paramKeys = colorParams.map(p => `mat::${row.key}::${p.name}`);
        const allSelected = state.selected;
        const someSelected = state.someSelected;

        return (
            <Box
                style={style}
                className="paint-material-row"
                onClick={() => onToggleMaterialExpand(row.key)}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 2, padding: '0 20px',
                    background: 'color-mix(in oklab, var(--accent-primary) 10%, transparent)',
                    borderBottom: '1px solid color-mix(in oklab, var(--accent-primary) 20%, transparent)',
                    cursor: 'pointer',
                    '&:hover': { background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)' },
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
                    sx={{ padding: '4px', color: 'color-mix(in oklab, var(--accent-primary) 60%, var(--text-muted))', '&.Mui-checked': { color: 'var(--accent-primary)' }, '& .MuiSvgIcon-root': { fontSize: '1.4rem' } }}
                />
                <Box sx={{ display: 'flex', alignItems: 'center', color: 'var(--accent-primary)', mr: -0.5 }}>
                    {isExpanded ? <ExpandMoreIcon sx={{ fontSize: '1.4rem' }} /> : <ChevronRightIcon sx={{ fontSize: '1.4rem' }} />}
                </Box>
                <PaletteIcon sx={{ fontSize: 22, color: 'var(--accent-primary)', opacity: 0.8 }} />
                <Typography title={row.material?.name} sx={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: 'var(--accent-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.material?.name || 'Material'}
                </Typography>
                <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    {colorParams.length} colors{allParams.length > colorParams.length && ` / ${allParams.length} total`}
                </Typography>
            </Box>
        );
    }

    // === MATERIAL PARAM ROW ===
    if (row.type === 'materialParam') {
        const isSelected = state.selected;
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
                    background: isNonColor ? 'var(--bg-tertiary)' : isSelected ? 'color-mix(in oklab, var(--accent-primary) 12%, transparent)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                    cursor: isColor ? 'pointer' : 'default',
                    opacity: isNonColor ? 0.6 : 1,
                    '&:hover': { background: isColor ? 'color-mix(in oklab, var(--accent-primary) 8%, transparent)' : 'var(--bg-hover)' },
                }}
            >
                <Checkbox
                    size="medium"
                    checked={isSelected}
                    disabled={isNonColor}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => isColor && onToggleMaterialParam(row.selectionKey, !isSelected)}
                    sx={{ padding: '4px', color: isNonColor ? 'var(--text-muted)' : 'color-mix(in oklab, var(--accent-primary) 50%, var(--text-muted))', '&.Mui-checked': { color: 'var(--accent-primary)' }, '&.Mui-disabled': { color: 'var(--text-muted)' }, '& .MuiSvgIcon-root': { fontSize: '1.3rem' } }}
                />
                <Typography sx={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: isNonColor ? 'var(--text-muted)' : isSelected ? 'var(--accent-primary)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: isNonColor ? 'italic' : 'normal' }}>
                    {row.param?.name || 'Param'}
                    {isNonColor && <span style={{ marginLeft: 10, fontSize: '0.75rem', opacity: 0.5 }}>(control)</span>}
                </Typography>
                {isColor ? (
                    <Box
                        onClick={(e) => { e.stopPropagation(); onColorClick([{ rgba, time: 0 }]); }}
                        sx={{
                            width: 80, height: 26, borderRadius: 'var(--radius-sm)',
                            // Data swatch — actual material param color.
                            background: `rgb(${Math.round(rgba[0] * 255)}, ${Math.round(rgba[1] * 255)}, ${Math.round(rgba[2] * 255)})`,
                            border: '2px solid var(--border)', cursor: 'pointer',
                            '&:hover': { borderColor: 'var(--accent-primary)' },
                        }}
                    />
                ) : (
                    <Box sx={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                        {rgba.map((val, i) => (
                            <input
                                /* Value in the key for the same reason as the BM input
                                   below: uncontrolled inputs only read defaultValue on
                                   mount, so without it an externally-changed value stays
                                   stale until the row is recycled by scrolling. */
                                key={`${row.selectionKey}_${i}_${val}`}
                                type="text"
                                defaultValue={val.toFixed(2)}
                                style={{
                                    width: '52px', height: '26px', background: 'var(--bg-primary)',
                                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                                    color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
                                    fontSize: '0.8rem', textAlign: 'center', outline: 'none', padding: '2px 4px',
                                }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--accent-primary)'; e.target.style.background = 'var(--bg-secondary)'; }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'var(--border)';
                                    e.target.style.background = 'var(--bg-primary)';
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
        const isExpanded = state.expanded;
        const isLocked = state.locked;
        const allSelected = state.selected;
        const someSelected = state.someSelected;

        const systemName = row.system?.name || 'Unnamed System';
        const displaySystemName = systemName.includes('/') ? systemName.split('/').pop() : systemName;

        return (
            <Box
                style={style}
                className={`paint-system-row${isLocked ? ' is-locked' : ''}${allSelected ? ' is-selected' : ''}`}
                onClick={() => onToggleExpand(row.key)}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, padding: '0 16px',
                    background: isLocked ? 'var(--bg-primary)' : 'var(--bg-tertiary)',
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    '&:hover': { background: 'var(--bg-hover)' },
                }}
            >
                <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    disabled={isLocked}
                    onClick={(e) => { e.stopPropagation(); onToggleSystem(row.key, !allSelected); }}
                    sx={{ padding: '2px', color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent-primary)' } }}
                />
                <Box sx={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', mr: -0.5 }}>
                    {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                </Box>
                <Typography title={systemName} sx={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 600, color: isLocked ? 'var(--text-muted)' : 'var(--accent-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displaySystemName}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', mr: 2 }}>
                    {row.matchingCount} emitters
                </Typography>
                <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onToggleLock(row.key); }}
                    sx={{ opacity: isLocked ? 1 : 0.3, color: isLocked ? 'var(--color-danger)' : 'var(--text-secondary)' }}
                >
                    {isLocked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                </IconButton>
            </Box>
        );
    }

    // === EMITTER ROW ===
    const isSelected = state.selected;
    const isLocked = state.locked;
    const colors = emitterColorArrays(row.emitter);
    const currentBlendMode = row.emitter.blendMode !== undefined ? row.emitter.blendMode : 0;

    return (
        <Box
            style={style}
            className={`paint-emitter-row${isSelected ? ' is-selected' : ''}`}
            onClick={() => { if (!isLocked) onToggleEmitter(row.key); }}
            sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, padding: '0 16px 0 32px',
                background: isSelected ? 'color-mix(in oklab, var(--accent-primary) 14%, transparent)' : 'transparent',
                borderBottom: '1px solid var(--border)',
                // Inset left accent bar marks the selected row at a glance.
                boxShadow: isSelected ? 'inset 3px 0 0 0 var(--accent-primary)' : 'none',
                opacity: isLocked ? 0.5 : 1, cursor: isLocked ? 'not-allowed' : 'pointer',
                transition: 'background 0.12s ease, box-shadow 0.12s ease',
                '&:hover': { background: isLocked ? 'transparent' : isSelected ? 'color-mix(in oklab, var(--accent-primary) 20%, transparent)' : 'var(--bg-hover)' },
            }}
        >
            <Checkbox
                size="small"
                checked={isSelected}
                disabled={isLocked}
                onClick={(e) => e.stopPropagation()}
                onChange={() => { if (!isLocked) onToggleEmitter(row.key); }}
                sx={{ padding: '2px', color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent-primary)' } }}
            />
            <Typography sx={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.emitter?.name || 'Unnamed Emitter'}
            </Typography>
            <Box sx={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <Box
                    onMouseEnter={(e) => onTextureHover(e, row.emitter)}
                    onMouseLeave={onTextureLeave}
                    onClick={(e) => { e.stopPropagation(); onTextureClick(row.emitter); }}
                    sx={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', '&:hover': { color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' } }}
                >
                    <ImageOutlinedIcon sx={{ fontSize: 14 }} />
                </Box>

                {showLingerColor && <ColorBlock variant="secondary" colors={colors.lingerColor} title="Linger Color"
                    onClick={(e) => { e.stopPropagation(); if (colors.lingerColor.length > 0) onColorClick(colors.lingerColor); }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (colors.lingerColor.length > 0) onColorAlpha(row.emitter.key, 'lingerColor', 'Linger Color', colors.lingerColor); }} />}
                {showOC && <ColorBlock variant="secondary" colors={colors.fresnelColor} title="OC/Fresnel"
                    onClick={(e) => { e.stopPropagation(); if (colors.fresnelColor.length > 0) onColorClick(colors.fresnelColor); }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (colors.fresnelColor.length > 0) onColorAlpha(row.emitter.key, 'fresnelColor', 'OC/Fresnel', colors.fresnelColor); }} />}
                {showBirthColor && <ColorBlock variant="standard" colors={colors.birthColor} title="Birth Color"
                    onClick={(e) => { e.stopPropagation(); if (colors.birthColor.length > 0) onColorClick(colors.birthColor); }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (colors.birthColor.length > 0) onColorAlpha(row.emitter.key, 'birthColor', 'Birth Color', colors.birthColor); }} />}
                {showBaseColor && <ColorBlock variant="wide" colors={colors.color} title="Base Color"
                    onClick={(e) => { e.stopPropagation(); if (colors.color.length > 0) onColorClick(colors.color); }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (colors.color.length > 0) onColorAlpha(row.emitter.key, 'color', 'Base Color', colors.color); }} />}

                <Box
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in oklab, var(--accent-primary) 10%, transparent)', borderRadius: 'var(--radius-sm)', padding: '0 2px', ml: 0.5, height: '24px', border: '1px solid transparent', '&:hover': { border: '1px solid color-mix(in oklab, var(--accent-primary) 35%, transparent)' } }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Typography sx={{ fontSize: '0.65rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', mr: 0.25, opacity: 0.5 }}>BM:</Typography>
                    <input
                        /* The value is in the key on purpose. This input is uncontrolled
                           (defaultValue lets you type freely without a state round-trip per
                           keystroke), and React only reads defaultValue when the element
                           mounts. Keying on row.key alone meant a bulk blend-mode change
                           left the old number on screen until react-window recycled the row
                           on scroll. Including the value remounts the input when it changes. */
                        key={`${row.key}:${currentBlendMode}`}
                        type="text"
                        defaultValue={currentBlendMode}
                        disabled={isLocked}
                        style={{ width: '12px', background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textAlign: 'center', outline: 'none', padding: 0 }}
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
        model, searchQuery, variantFilter, viewMode,
        expandedSystems, expandedMaterials, showBaseColor = true,
    } = props;

    // The model is array-shaped; build key lookups once per model change.
    const systemMap = useMemo(() => new Map(model.systems.map(s => [s.key, s])), [model]);
    const emitterMap = useMemo(() => new Map(model.emitters.map(e => [e.key, e])), [model]);
    const materialMap = useMemo(() => new Map(model.materials.map(m => [m.key, m])), [model]);

    const rows = useMemo<ListRow[]>(() => {
        const result: ListRow[] = [];
        const searchLower = (searchQuery || '').toLowerCase();
        const showVfx = viewMode !== 'materials';

        if (showVfx) {
            /* Search matches NAMES first and only falls back to texture paths,
               the same two-pass rule Port's `filterSystems` uses.

               A texture path carries the ability token too, so a single pass
               that ORed name and texture together answered "_Q_" with every
               Dance / Taunt / Recall system whose emitters merely reference a
               Q texture — the systems actually named _Q_ were buried among
               them and the search read as broken. Texture search is still
               worth having (it finds every system using a given .tex), so it
               runs only when NOTHING matched by name.

               `_q_`-style ability tokens skip emitter matching entirely: they
               are a system-naming convention, so emitter hits are pure noise. */
            const systemOnly = /^_[a-z](_)?$/i.test((searchQuery || '').trim());

            const collect = (matchMode: 'name' | 'texture'): ListRow[] => {
                const out: ListRow[] = [];
                for (const systemKey of (model.systemOrder || [])) {
                    const system = systemMap.get(systemKey);
                    if (!system) continue;

                    let matchingEmitters = (system.emitterKeys || [])
                        .map((k, idx) => {
                            const em = emitterMap.get(k);
                            return em ? { emitter: em, indexInSystem: idx + 1 } : null;
                        })
                        .filter((e): e is { emitter: VfxEmitter; indexInSystem: number } => !!e);

                    if (variantFilter === 'v1') {
                        matchingEmitters = matchingEmitters.filter(e => (e.emitter.name || '').toLowerCase().endsWith('_variant1'));
                    } else if (variantFilter === 'v2') {
                        matchingEmitters = matchingEmitters.filter(e => (e.emitter.name || '').toLowerCase().endsWith('_variant2'));
                    }

                    if (searchQuery) {
                        const systemMatches = (system.name || '').toLowerCase().includes(searchLower)
                            || (systemKey || '').toLowerCase().includes(searchLower);
                        if (systemMatches) {
                            // The system itself matched: keep all of its emitters.
                        } else if (matchMode === 'name') {
                            // An ability token names systems, not emitters.
                            if (systemOnly) continue;
                            matchingEmitters = matchingEmitters.filter(e =>
                                (e.emitter.name || '').toLowerCase().includes(searchLower)
                            );
                        } else {
                            matchingEmitters = matchingEmitters.filter(e =>
                                e.emitter.textures.some(t => t.path.toLowerCase().includes(searchLower))
                            );
                        }
                    }

                    if (matchingEmitters.length === 0) continue;

                    out.push({ type: 'system', key: systemKey, system, matchingCount: matchingEmitters.length });

                    if (expandedSystems.has(systemKey)) {
                        for (const { emitter, indexInSystem } of matchingEmitters) {
                            out.push({ type: 'emitter', key: emitter.key, emitter, systemKey, indexInSystem });
                        }
                    }
                }
                return out;
            };

            const byName = collect('name');
            // An ability token never falls back to textures — that fallback is
            // exactly the noise it is meant to avoid.
            const vfxRows = byName.length > 0 || !searchQuery || systemOnly ? byName : collect('texture');
            result.push(...vfxRows);
        }

        for (const materialKey of (model.materialOrder || [])) {
            const material = materialMap.get(materialKey);
            if (!material || !material.colorParams || material.colorParams.length === 0) continue;

            if (searchQuery) {
                const materialMatches = (material.name || '').toLowerCase().includes(searchLower) ||
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
    }, [model, systemMap, emitterMap, materialMap, searchQuery, expandedSystems, expandedMaterials, variantFilter, viewMode]);

    const { selection, lockedSystems } = props;

    /* Derive each row's plain-boolean state once per render. This is the cheap
       O(rows) pass that lets Row stay memoized: a selection toggle changes only
       the booleans of the affected rows, so only those Rows re-render. */
    const rowStates = useMemo<RowState[]>(() => {
        return rows.map((row): RowState => {
            switch (row.type) {
                case 'emitter':
                    return { selected: selection.has(row.key), someSelected: false, locked: lockedSystems.has(row.systemKey), expanded: false };
                case 'system': {
                    const keys = row.system?.emitterKeys || [];
                    const all = keys.length > 0 && keys.every(k => selection.has(k));
                    const some = !all && keys.some(k => selection.has(k));
                    return { selected: all, someSelected: some, locked: lockedSystems.has(row.key), expanded: expandedSystems.has(row.key) };
                }
                case 'material': {
                    const paramKeys = (row.material?.colorParams || []).filter(p => p.isColor !== false).map(p => `mat::${row.key}::${p.name}`);
                    const all = paramKeys.length > 0 && paramKeys.every(k => selection.has(k));
                    const some = !all && paramKeys.some(k => selection.has(k));
                    return { selected: all, someSelected: some, locked: false, expanded: expandedMaterials.has(row.key) };
                }
                case 'materialParam':
                    return { selected: selection.has(row.selectionKey), someSelected: false, locked: false, expanded: false };
            }
        });
    }, [rows, selection, lockedSystems, expandedSystems, expandedMaterials]);

    /* Everything a row needs, in ONE memo-stable object. react-window re-renders
       rows only when a value in rowProps changes; keeping this reference stable
       (and its members either memoized arrays or useCallback'd handlers) is what
       lets the memoized Row skip re-rendering on pure scroll. */
    const rowProps = useMemo<RwRowProps>(() => ({
        rows,
        rowStates,
        showBirthColor: props.showBirthColor,
        showOC: props.showOC,
        showLingerColor: props.showLingerColor,
        showBaseColor,
        onToggleEmitter: props.onToggleEmitter,
        onToggleSystem: props.onToggleSystem,
        onToggleLock: props.onToggleLock,
        onToggleExpand: props.onToggleExpand,
        onToggleMaterialExpand: props.onToggleMaterialExpand,
        onToggleMaterialParam: props.onToggleMaterialParam,
        onMaterialParamValueChange: props.onMaterialParamValueChange,
        onColorClick: props.onColorClick,
        onColorAlpha: props.onColorAlpha,
        onSetBlendMode: props.onSetBlendMode,
        onTextureHover: props.onTextureHover,
        onTextureLeave: props.onTextureLeave,
        onTextureClick: props.onTextureClick,
    }), [
        rows, rowStates, showBaseColor,
        props.showBirthColor, props.showOC, props.showLingerColor,
        props.onToggleEmitter, props.onToggleSystem, props.onToggleLock, props.onToggleExpand,
        props.onToggleMaterialExpand, props.onToggleMaterialParam, props.onMaterialParamValueChange,
        props.onColorClick, props.onColorAlpha, props.onSetBlendMode, props.onTextureHover, props.onTextureLeave, props.onTextureClick,
    ]);

    /* react-window List: fills its parent, scrolls on the compositor thread (the
       GPU-composited scroll the old paint2 had — smooth even while React mounts
       new rows on the main thread), and recycles the row DOM. This is the fix
       for the thumb outrunning content on a fast fling. */
    return (
        <List
            className="paint2-system-scroll react-window-list"
            rowCount={rows.length}
            rowHeight={ROW_HEIGHT}
            rowComponent={RwRow}
            rowProps={rowProps}
            overscanCount={8}
            style={{ height: '100%', width: '100%' }}
        />
    );
}

/* Adapter between react-window's (index, style, ...rowProps) row API and the
   memoized Row above (which takes row/state/style + handlers). Kept out of the
   Row component so Row's memo comparison stays on plain props. */
type RwRowProps = {
    rows: ListRow[];
    rowStates: RowState[];
} & RowHandlers;

function RwRow({ index, style, rows, rowStates, ...handlers }: RowComponentProps<RwRowProps>) {
    const row = rows[index];
    if (!row) return null;
    return <Row row={row} state={rowStates[index]} style={style} {...handlers} />;
}

export default React.memo(SystemList);
