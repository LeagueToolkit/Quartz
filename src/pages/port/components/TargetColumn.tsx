import React, { useCallback, useState } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import { FolderOpen as FolderOpenIcon, Scissors as ScissorsIcon } from 'lucide-react';
import { SearchInput } from './common/Inputs';
import { useBinFileDrop } from './common/binFileDrop';
import PortRecentBins from './common/PortRecentBins';
import ParticleSystemList from './ParticleSystemList/ParticleSystemList';
import { SkeletonList } from '@/components/ui/Skeleton';
import { usePortDropZone, type PortDragPayload } from '../usePortDrag';
import type { VfxSystem, VfxSystemMap } from '../model';
import type { ListSharedProps } from './ParticleSystemList/types';

interface TargetColumnProps extends ListSharedProps {
    isProcessing: boolean;
    binLoading?: boolean;
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
    dropDonorSystem?: (payload: Extract<PortDragPayload, { kind: 'system' }>) => void;
    targetSystems: VfxSystemMap;
    targetListRef: React.RefObject<HTMLDivElement>;
    filteredTargetSystems: VfxSystem[];
    trimTargetNames: boolean;
    setTrimTargetNames: (v: boolean) => void;
}

export default function TargetColumn(props: TargetColumnProps) {
    const {
        isProcessing,
        binLoading,
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
        dropDonorSystem,
        targetSystems,
        targetListRef,
        filteredTargetSystems,
        trimTargetNames,
        setTrimTargetNames,
    } = props;

    const safeTargetSystems = targetSystems || {};
    const hasBin = Object.keys(safeTargetSystems).length > 0;

    const handleFileDrop = useCallback((filePath: string) => {
        if (typeof processTargetBin === 'function') processTargetBin(filePath);
    }, [processTargetBin]);
    const fileDrop = useBinFileDrop(handleFileDrop);

    // Pointer-drag drop zone: the whole target column accepts a donor system
    // drop (routes to the name-prompt insert flow). Emitter drops are handled
    // by the individual target system rows, so this zone ignores them. Reuse the
    // bin-drop hook's element ref (spread via fileDrop.handlers) so we don't add
    // a second `ref` to the same node.
    const [isSystemDropOver, setIsSystemDropOver] = useState(false);
    usePortDropZone(
        'target-column',
        fileDrop.zoneRef,
        (payload) => payload.kind === 'system',
        (payload) => {
            if (payload.kind === 'system') dropDonorSystem?.(payload);
        },
        setIsSystemDropOver
    );

    return (
        <div
            className={isSystemDropOver ? 'port-drop-active' : undefined}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative', borderRadius: '8px' }}
            {...fileDrop.handlers}
        >
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
                    className="dl-btn dl-btn--secondary dl-btn--icon"
                    onClick={handleOpenTargetBin}
                    disabled={isProcessing}
                    title={isProcessing ? 'Processing...' : 'Open Target Bin'}
                >
                    <FolderOpenIcon size={16} />
                </button>
                {/* Filter + emitter-search dim out until a bin is loaded (the open
                   button stays live so you can still load one). */}
                <div
                    className="port-toolbar-filters"
                    style={hasBin ? undefined : { opacity: 0.4, pointerEvents: 'none' }}
                    aria-disabled={!hasBin}
                >
                    <SearchInput
                        initialValue={targetFilterInput}
                        placeholder={enableTargetEmitterSearch ? 'Filter by Particle or Emitter Name' : 'Filter by Particle Name Only'}
                        onChange={filterTargetParticles}
                        trailing={
                            <button
                                type="button"
                                className={`port-search-scissor${trimTargetNames ? ' is-active' : ''}`}
                                onClick={() => setTrimTargetNames(!trimTargetNames)}
                                title={trimTargetNames ? 'Show full target names' : 'Trim target names'}
                            >
                                <ScissorsIcon size={15} />
                            </button>
                        }
                    />
                    <button
                        className={`dl-btn dl-btn--secondary dl-btn--icon${enableTargetEmitterSearch ? ' dl-btn--active' : ''}`}
                        onClick={() => setEnableTargetEmitterSearch(!enableTargetEmitterSearch)}
                        title={enableTargetEmitterSearch ? 'Disable emitter search (faster)' : 'Enable emitter search'}
                    >
                        <SearchIcon sx={{ fontSize: 16 }} />
                    </button>
                </div>
            </div>

            <div
                className="port-panel"
                style={{
                    flex: 1,
                    ...sectionStyle,
                    border: isDragOverVfx ? '1px solid var(--accent-primary)' : '1px solid transparent',
                    borderRadius: '8px',
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'stretch',
                    justifyContent: 'stretch',
                    position: 'relative',
                }}
                onDragOverCapture={handleTargetDropDragOver}
                onDragEnterCapture={handleTargetDropDragEnter}
                onDragLeaveCapture={handleTargetDropDragLeave}
                onDropCapture={(e) => processVfxSystemDrop(e, 'target container capture')}
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
                {binLoading ? (
                    <SkeletonList count={8} />
                ) : Object.keys(safeTargetSystems).length > 0 ? (
                    <div
                        ref={targetListRef}
                        style={{ width: '100%', height: '100%', overflow: 'auto', background: 'transparent' }}
                        onDragOverCapture={handleTargetDropDragOver}
                        onDragEnterCapture={handleTargetDropDragEnter}
                        onDragLeaveCapture={handleTargetDropDragLeave}
                        onDropCapture={(e) => processVfxSystemDrop(e, 'target list container capture')}
                        onDragOver={handleTargetDropDragOver}
                        onDrop={(e) => processVfxSystemDrop(e, 'target list container')}
                    >
                        <ParticleSystemList systems={filteredTargetSystems} isTarget {...props} />
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '28px', width: '100%', height: '100%', padding: '2rem', overflow: 'hidden', minHeight: 0 }}>
                        <div style={{
                            width: 'min(360px, 90%)',
                            flexShrink: 0,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
                        }}>
                            <FolderOpenIcon size={36} color="var(--accent-primary)" strokeWidth={1.5} />
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                Drag Target <b style={{ color: 'var(--text-primary)' }}>.bin</b> here
                            </div>
                            <button onClick={handleOpenTargetBin} disabled={isProcessing} className="dl-btn dl-btn--primary dl-btn--sm">
                                <span className="dl-icon"><FolderOpenIcon size={14} /></span>
                                <span>Open Bin</span>
                            </button>
                        </div>
                        <PortRecentBins slot="target" onOpen={processTargetBin} />
                    </div>
                )}
            </div>
        </div>
    );
}
