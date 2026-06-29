import React, { useCallback } from 'react';
import { Tooltip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import { FolderOpen as FolderOpenIcon } from 'lucide-react';
import { SearchInput } from './common/Inputs';
import { useBinFileDrop } from './common/binFileDrop';
import ParticleSystemList from './ParticleSystemList/ParticleSystemList';
import type { VfxSystem, VfxSystemMap } from '../utils/vfxEmitterParser';
import type { ListSharedProps } from './ParticleSystemList/types';

interface DonorColumnProps extends ListSharedProps {
    isProcessing: boolean;
    handleOpenDonorBin: () => void;
    processDonorBin: (path: string) => void;
    handleOpenDonorFromGame: () => void;
    donorFilterInput: string;
    filterDonorParticles: (v: string) => void;
    enableDonorEmitterSearch: boolean;
    setEnableDonorEmitterSearch: (v: boolean) => void;
    sectionStyle: React.CSSProperties;
    donorSystems: VfxSystemMap;
    donorListRef: React.RefObject<HTMLDivElement>;
    filteredDonorSystems: VfxSystem[];
}

export default function DonorColumn(props: DonorColumnProps) {
    const {
        isProcessing,
        handleOpenDonorBin,
        processDonorBin,
        handleOpenDonorFromGame,
        donorFilterInput,
        enableDonorEmitterSearch,
        filterDonorParticles,
        setEnableDonorEmitterSearch,
        sectionStyle,
        donorSystems,
        donorListRef,
        filteredDonorSystems,
    } = props;

    const safeDonorSystems = donorSystems || {};

    const handleFileDrop = useCallback((filePath: string) => {
        if (typeof processDonorBin === 'function') processDonorBin(filePath);
    }, [processDonorBin]);
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
                        background: 'color-mix(in oklab, var(--accent-secondary) 12%, transparent)',
                        border: '2px dashed var(--accent-secondary)',
                        borderRadius: '8px',
                        transition: 'all 0.15s ease-out',
                    }}
                >
                    <div
                        style={{
                            padding: '10px 16px',
                            borderRadius: '6px',
                            border: '1px dashed var(--accent-secondary)',
                            color: 'var(--accent-secondary)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '13px',
                            background: 'color-mix(in oklab, var(--accent-secondary) 20%, transparent)',
                        }}
                    >
                        Drop .bin or .py to load as Donor
                    </div>
                </div>
            )}
            {/* One row: open + load-from-game + filter + emitter-search toggle. */}
            <div className="port-toolbar-row" style={{ '--port-accent': 'var(--accent-secondary)' } as React.CSSProperties}>
                <button
                    className="port-open-btn"
                    onClick={handleOpenDonorBin}
                    disabled={isProcessing}
                    title={isProcessing ? 'Processing...' : 'Open Donor Bin'}
                >
                    <FolderOpenIcon size={16} />
                </button>
                <Tooltip title="Load donor from game">
                    <span>
                        <button
                            className="port-open-btn"
                            onClick={handleOpenDonorFromGame}
                            disabled={isProcessing}
                            aria-label="Load donor from game"
                        >
                            <SportsEsportsIcon sx={{ fontSize: 16 }} />
                        </button>
                    </span>
                </Tooltip>
                <SearchInput
                    initialValue={donorFilterInput}
                    placeholder={enableDonorEmitterSearch ? 'Filter by Particle or Emitter Name' : 'Filter by Particle Name Only'}
                    onChange={filterDonorParticles}
                    accentVar="var(--accent-secondary)"
                    style={{ color: 'var(--accent-secondary)', height: '40px', padding: '0 14px' }}
                    className="port-donor-search"
                />
                <button
                    className={`port-search-toggle-btn${enableDonorEmitterSearch ? ' is-active' : ''}`}
                    onClick={() => setEnableDonorEmitterSearch(!enableDonorEmitterSearch)}
                    title={enableDonorEmitterSearch ? 'Disable emitter search (faster)' : 'Enable emitter search'}
                >
                    <SearchIcon sx={{ fontSize: 16 }} />
                </button>
            </div>

            <div
                className="port-panel"
                style={{ flex: 1, ...sectionStyle, borderRadius: '8px', padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'stretch', justifyContent: 'stretch' }}
            >
                {Object.keys(safeDonorSystems).length > 0 ? (
                    <div ref={donorListRef} style={{ width: '100%', height: '100%', overflow: 'auto' }}>
                        <ParticleSystemList systems={filteredDonorSystems} isTarget={false} {...props} />
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
                        No donor bin loaded
                    </div>
                )}
            </div>
        </div>
    );
}
