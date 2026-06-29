import React, { useCallback } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import { FolderOpen as FolderOpenIcon } from 'lucide-react';
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
            {/* One row: open + filter + emitter-search toggle (mirrors Donor). */}
            <div className="port-toolbar-row">
                <button
                    className="port-open-btn"
                    onClick={handleOpenTargetBin}
                    disabled={isProcessing}
                    title={isProcessing ? 'Processing...' : 'Open Target Bin'}
                    style={{ '--port-accent': 'var(--accent-primary)' } as React.CSSProperties}
                >
                    <FolderOpenIcon size={16} />
                </button>
                <SearchInput
                    initialValue={targetFilterInput}
                    placeholder={enableTargetEmitterSearch ? 'Filter by Particle or Emitter Name' : 'Filter by Particle Name Only'}
                    onChange={filterTargetParticles}
                    accentVar="var(--accent-primary)"
                    style={{ color: 'var(--accent-primary)', height: '40px', padding: '0 14px' }}
                    className="port-target-search"
                />
                <button
                    className={`port-search-toggle-btn${enableTargetEmitterSearch ? ' is-active' : ''}`}
                    onClick={() => setEnableTargetEmitterSearch(!enableTargetEmitterSearch)}
                    title={enableTargetEmitterSearch ? 'Disable emitter search (faster)' : 'Enable emitter search'}
                    style={{ '--port-accent': 'var(--accent-primary)' } as React.CSSProperties}
                >
                    <SearchIcon sx={{ fontSize: 16 }} />
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
