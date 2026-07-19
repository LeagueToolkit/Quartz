import React, { useCallback } from 'react';
import { Tooltip } from '@mui/material';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import { FolderOpen as FolderOpenIcon, Github, Scissors as ScissorsIcon } from 'lucide-react';
import { SearchInput } from './common/Inputs';
import { useBinFileDrop } from './common/binFileDrop';
import PortRecentBins from './common/PortRecentBins';
import ParticleSystemList from './ParticleSystemList/ParticleSystemList';
import { PortSystemSkeleton } from './ParticleSystemList/PortSystemSkeleton';
import { DropOverlay } from '@/components/ui';
import type { VfxSystem, VfxSystemMap } from '../model';
import type { ListSharedProps } from './ParticleSystemList/types';

interface DonorColumnProps extends ListSharedProps {
    isProcessing: boolean;
    binLoading?: boolean;
    handleOpenDonorBin: () => void;
    processDonorBin: (path: string) => void;
    handleOpenDonorFromGame: () => void;
    handleOpenHub: () => void;
    donorFilterInput: string;
    filterDonorParticles: (v: string) => void;
    sectionStyle: React.CSSProperties;
    donorSystems: VfxSystemMap;
    donorListRef: React.RefObject<HTMLDivElement>;
    filteredDonorSystems: VfxSystem[];
    trimDonorNames: boolean;
    setTrimDonorNames: (v: boolean) => void;
}

export default function DonorColumn(props: DonorColumnProps) {
    const {
        isProcessing,
        binLoading,
        handleOpenDonorBin,
        processDonorBin,
        handleOpenDonorFromGame,
        handleOpenHub,
        donorFilterInput,
        filterDonorParticles,
        sectionStyle,
        donorSystems,
        donorListRef,
        filteredDonorSystems,
        trimDonorNames,
        setTrimDonorNames,
    } = props;

    const safeDonorSystems = donorSystems || {};
    const hasBin = Object.keys(safeDonorSystems).length > 0;

    const handleFileDrop = useCallback((filePath: string) => {
        if (typeof processDonorBin === 'function') processDonorBin(filePath);
    }, [processDonorBin]);
    const fileDrop = useBinFileDrop(handleFileDrop);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }} {...fileDrop.handlers}>
            {fileDrop.isOver && <DropOverlay accent="secondary" label="Drop .bin or .py to load as Donor" />}
            {/* One row: open · search · vfxhub · load-from-game · emitter toggle. */}
            <div className="port-toolbar-row">
                <button
                    className="dl-btn dl-btn--secondary dl-btn--icon"
                    onClick={handleOpenDonorBin}
                    disabled={isProcessing}
                    title={isProcessing ? 'Processing...' : 'Open Donor Bin'}
                >
                    <FolderOpenIcon size={16} />
                </button>
                {/* Search flexes to fill; dims until a bin is loaded. */}
                <div
                    className="port-toolbar-filters"
                    style={hasBin ? undefined : { opacity: 0.4, pointerEvents: 'none' }}
                    aria-disabled={!hasBin}
                >
                    <SearchInput
                        initialValue={donorFilterInput}
                        placeholder="Filter by Particle or Emitter"
                        onChange={filterDonorParticles}
                        trailing={
                            <button
                                type="button"
                                className={`port-search-scissor${trimDonorNames ? ' is-active' : ''}`}
                                onClick={() => setTrimDonorNames(!trimDonorNames)}
                                title={trimDonorNames ? 'Show full donor names' : 'Trim donor names'}
                            >
                                <ScissorsIcon size={15} />
                            </button>
                        }
                    />
                </div>
                {/* VFX Hub browse — opens the GitHub collection browser. */}
                <Tooltip title="Browse VFX Hub">
                    <span>
                        <button
                            className="dl-btn dl-btn--secondary dl-btn--icon"
                            onClick={handleOpenHub}
                            aria-label="Browse VFX Hub"
                        >
                            <Github size={16} />
                        </button>
                    </span>
                </Tooltip>
                {/* Load-from-game stays live even with no bin loaded. */}
                <Tooltip title="Load donor from game">
                    <span>
                        <button
                            className="dl-btn dl-btn--secondary dl-btn--icon"
                            onClick={handleOpenDonorFromGame}
                            disabled={isProcessing}
                            aria-label="Load donor from game"
                        >
                            <SportsEsportsIcon sx={{ fontSize: 16 }} />
                        </button>
                    </span>
                </Tooltip>
            </div>

            <div
                className="port-panel"
                style={{ flex: 1, ...sectionStyle, borderRadius: '8px', padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'stretch', justifyContent: 'stretch' }}
            >
                {binLoading ? (
                    <PortSystemSkeleton isTarget={false} />
                ) : Object.keys(safeDonorSystems).length > 0 ? (
                    <div ref={donorListRef} style={{ width: '100%', height: '100%', overflow: 'auto' }}>
                        <ParticleSystemList systems={filteredDonorSystems} isTarget={false} {...props} />
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
                                Drag Donor <b style={{ color: 'var(--text-primary)' }}>.bin</b> here
                            </div>
                            <button onClick={handleOpenDonorBin} disabled={isProcessing} className="dl-btn dl-btn--primary dl-btn--sm">
                                <span className="dl-icon"><FolderOpenIcon size={14} /></span>
                                <span>Open Bin</span>
                            </button>
                        </div>
                        <PortRecentBins slot="donor" onOpen={processDonorBin} />
                    </div>
                )}
            </div>
        </div>
    );
}
