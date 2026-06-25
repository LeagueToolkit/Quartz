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
                        background: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)',
                        border: '2px dashed var(--accent-primary)',
                        borderRadius: '8px',
                        transition: 'all 0.15s ease-out',
                    }}
                >
                    <div
                        style={{
                            padding: '10px 16px',
                            borderRadius: '6px',
                            border: '1px dashed var(--accent-primary)',
                            color: 'var(--accent-primary)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '13px',
                            background: 'color-mix(in oklab, var(--accent-primary) 20%, transparent)',
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
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    fontWeight: 700,
                    height: '36px',
                    background: 'color-mix(in oklab, var(--accent-primary) 14%, transparent)',
                    border: '1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)',
                    color: 'var(--accent-primary)',
                    borderRadius: '4px',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    '&:hover': {
                        background: 'color-mix(in oklab, var(--accent-primary) 22%, transparent)',
                        borderColor: 'var(--accent-primary)',
                    },
                    '&:disabled': { opacity: 0.5, cursor: 'not-allowed', borderColor: 'var(--border)', color: 'var(--text-muted)' },
                }}
            >
                {isProcessing ? 'Processing...' : 'Open Target Bin'}
            </Button>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <SearchInput
                    initialValue={targetFilterInput}
                    placeholder={enableTargetEmitterSearch ? 'Filter by Particle or Emitter Name' : 'Filter by Particle Name Only'}
                    onChange={filterTargetParticles}
                    accentVar="var(--accent-primary)"
                    style={{ color: 'var(--accent-primary)' }}
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
                            ? 'color-mix(in oklab, var(--accent-primary) 18%, transparent)'
                            : 'color-mix(in oklab, var(--accent-primary) 12%, transparent)',
                        border: enableTargetEmitterSearch ? '1px solid var(--accent-primary)' : '1px solid color-mix(in oklab, var(--accent-primary) 35%, transparent)',
                        borderRadius: '10px',
                        color: 'var(--accent-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                    }}
                >
                    <SearchIcon sx={{ fontSize: 16, color: 'var(--accent-primary)', opacity: enableTargetEmitterSearch ? 1 : 0.78 }} />
                </button>
            </div>

            <div
                className="port-panel"
                style={{
                    flex: 1,
                    ...sectionStyle,
                    border: isDragOverVfx ? '1px solid var(--accent-primary)' : '1px solid var(--border)',
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
                            background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)',
                            border: '2px dashed var(--accent-primary)',
                            borderRadius: '8px',
                            transition: 'all 0.15s ease-out',
                        }}
                    >
                        <div
                            style={{
                                padding: '10px 16px',
                                borderRadius: '6px',
                                border: '1px dashed var(--accent-primary)',
                                color: 'var(--accent-primary)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '13px',
                                background: 'color-mix(in oklab, var(--accent-primary) 10%, transparent)',
                            }}
                        >
                            Drop to add VFX system
                        </div>
                    </div>
                )}
                {Object.keys(safeTargetSystems).length > 0 ? (
                    <div
                        ref={targetListRef}
                        style={{ width: '100%', height: '100%', overflow: 'auto', background: 'var(--bg-secondary)' }}
                        onDragOver={handleTargetDropDragOver}
                        onDrop={(e) => processVfxSystemDrop(e, 'target list container')}
                    >
                        <ParticleSystemList systems={filteredTargetSystems} isTarget {...props} />
                    </div>
                ) : (
                    <div
                        style={{
                            color: 'var(--text-muted)',
                            fontSize: '16px',
                            fontFamily: 'var(--font-mono)',
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
