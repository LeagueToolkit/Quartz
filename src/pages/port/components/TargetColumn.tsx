import React, { useCallback } from 'react';
import { Button } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { SearchInput } from './common/Inputs';
import { useBinFileDrop } from './common/binFileDrop';
import ParticleSystemList from './ParticleSystemList/ParticleSystemList';
import type { VfxSystem, VfxSystemMap } from '../utils/vfxEmitterParser';
import type { ListSharedProps } from './ParticleSystemList/types';

interface TargetColumnProps extends ListSharedProps {
    isProcessing: boolean;
    handleOpenTargetBin: () => void;
    processTargetBin: (path: string) => void;
    targetFilterInput: string;
    filterTargetParticles: (v: string) => void;
    enableTargetEmitterSearch: boolean;
    setEnableTargetEmitterSearch: (v: boolean) => void;
    sectionStyle: React.CSSProperties;
    isDragOverVfx: boolean;
    handleTargetDropDragOver: (e: React.DragEvent) => void;
    handleTargetDropDragEnter: (e: React.DragEvent) => void;
    handleTargetDropDragLeave: (e: React.DragEvent) => void;
    processVfxSystemDrop: (e: React.DragEvent, source: string) => void;
    targetSystems: VfxSystemMap;
    targetListRef: React.RefObject<HTMLDivElement>;
    filteredTargetSystems: VfxSystem[];
}

export default function TargetColumn(props: TargetColumnProps) {
    const {
        isProcessing,
        handleOpenTargetBin,
        processTargetBin,
        targetFilterInput,
        enableTargetEmitterSearch,
        filterTargetParticles,
        setEnableTargetEmitterSearch,
        sectionStyle,
        isDragOverVfx,
        handleTargetDropDragOver,
        handleTargetDropDragEnter,
        handleTargetDropDragLeave,
        processVfxSystemDrop,
        targetSystems,
        targetListRef,
        filteredTargetSystems,
    } = props;

    const safeTargetSystems = targetSystems || {};

    const handleFileDrop = useCallback((filePath: string) => {
        if (typeof processTargetBin === 'function') processTargetBin(filePath);
    }, [processTargetBin]);
    const fileDrop = useBinFileDrop(handleFileDrop);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }} {...fileDrop.handlers}>
            {fileDrop.isOver && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 30,
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        border: '2px dashed var(--accent)',
                        borderRadius: '8px',
                        transition: 'all 0.15s ease-out',
                    }}
                >
                    <div
                        style={{
                            padding: '10px 16px',
                            borderRadius: '6px',
                            border: '1px dashed var(--accent)',
                            color: 'var(--accent)',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '13px',
                            background: 'color-mix(in srgb, var(--accent), transparent 80%)',
                        }}
                    >
                        Drop .bin or .py to load as Target
                    </div>
                </div>
            )}
            <Button
                onClick={handleOpenTargetBin}
                disabled={isProcessing}
                sx={{
                    width: '100%',
                    padding: '0 16px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '13px',
                    fontWeight: 700,
                    height: '36px',
                    background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
                    color: 'var(--accent)',
                    borderRadius: '4px',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    '&:hover': {
                        background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
                        borderColor: 'var(--accent)',
                        textShadow: '0 0 8px color-mix(in srgb, var(--accent), transparent 50%)',
                    },
                    '&:disabled': { opacity: 0.5, cursor: 'not-allowed', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' },
                }}
            >
                {isProcessing ? 'Processing...' : 'Open Target Bin'}
            </Button>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <SearchInput
                    initialValue={targetFilterInput}
                    placeholder={enableTargetEmitterSearch ? 'Filter by Particle or Emitter Name' : 'Filter by Particle Name Only'}
                    onChange={filterTargetParticles}
                    accentVar="var(--accent)"
                    style={{ color: 'var(--accent)' }}
                    className="port-target-search"
                />
                <button
                    className="port-search-toggle-btn"
                    onClick={() => setEnableTargetEmitterSearch(!enableTargetEmitterSearch)}
                    title={enableTargetEmitterSearch ? 'Disable emitter search (faster)' : 'Enable emitter search'}
                    style={{
                        height: '40px',
                        minWidth: '52px',
                        padding: '0 14px',
                        background: enableTargetEmitterSearch
                            ? 'linear-gradient(180deg, rgba(236, 185, 106, 0.15), rgba(236, 185, 106, 0.05))'
                            : 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        border: enableTargetEmitterSearch ? '1px solid var(--accent)' : '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                        borderRadius: '10px',
                        color: 'var(--accent)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: enableTargetEmitterSearch ? '0 0 10px rgba(236, 185, 106, 0.1)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                    }}
                >
                    <SearchIcon sx={{ fontSize: 16, color: 'var(--accent)', opacity: enableTargetEmitterSearch ? 1 : 0.78 }} />
                </button>
            </div>

            <div
                className="port-panel"
                style={{
                    flex: 1,
                    ...sectionStyle,
                    border: isDragOverVfx ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '8px',
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'stretch',
                    justifyContent: 'stretch',
                    position: 'relative',
                }}
                onDragOver={handleTargetDropDragOver}
                onDragEnter={handleTargetDropDragEnter}
                onDragLeave={handleTargetDropDragLeave}
                onDrop={(e) => processVfxSystemDrop(e, 'target container')}
            >
                {isDragOverVfx && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                            zIndex: 2,
                            background: 'rgba(139, 92, 246, 0.15)',
                            border: '2px dashed var(--accent)',
                            borderRadius: '8px',
                            transition: 'all 0.15s ease-out',
                        }}
                    >
                        <div
                            style={{
                                padding: '10px 16px',
                                borderRadius: '6px',
                                border: '1px dashed var(--accent)',
                                color: 'var(--accent)',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '13px',
                                background: 'color-mix(in srgb, var(--accent), transparent 90%)',
                            }}
                        >
                            Drop to add VFX system
                        </div>
                    </div>
                )}
                {Object.keys(safeTargetSystems).length > 0 ? (
                    <div
                        ref={targetListRef}
                        style={{ width: '100%', height: '100%', overflow: 'auto', background: 'rgba(255, 255, 255, 0.03)' }}
                        onDragOver={handleTargetDropDragOver}
                        onDrop={(e) => processVfxSystemDrop(e, 'target list container')}
                    >
                        <ParticleSystemList systems={filteredTargetSystems} isTarget {...props} />
                    </div>
                ) : (
                    <div
                        style={{
                            color: 'var(--accent)',
                            fontSize: '16px',
                            fontFamily: 'JetBrains Mono, monospace',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                            height: '100%',
                            textAlign: 'center',
                        }}
                    >
                        No target bin loaded
                    </div>
                )}
            </div>
        </div>
    );
}
