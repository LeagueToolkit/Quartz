import React, { useCallback } from 'react';
import { Button, IconButton, Tooltip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                    onClick={handleOpenDonorBin}
                    disabled={isProcessing}
                    sx={{
                        flex: 1,
                        padding: '0 16px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        fontWeight: 700,
                        height: '36px',
                        background: 'color-mix(in oklab, var(--accent-secondary) 14%, transparent)',
                        border: '1px solid color-mix(in oklab, var(--accent-secondary) 30%, transparent)',
                        color: 'var(--accent-secondary)',
                        borderRadius: '4px',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        position: 'relative',
                        '&:hover': {
                            background: 'color-mix(in oklab, var(--accent-secondary) 22%, transparent)',
                            borderColor: 'var(--accent-secondary)',
                        },
                        '&:disabled': { opacity: 0.5, cursor: 'not-allowed', borderColor: 'var(--border)', color: 'var(--text-muted)' },
                    }}
                >
                    {isProcessing ? 'Processing...' : 'Open Donor Bin'}
                </Button>

                <Tooltip title="Load donor from game">
                    <span>
                        <IconButton
                            onClick={handleOpenDonorFromGame}
                            disabled={isProcessing}
                            size="small"
                            aria-label="Load donor from game"
                            sx={{
                                minWidth: '52px',
                                width: '52px',
                                height: '40px',
                                p: 0,
                                borderRadius: '10px',
                                border: '1px solid color-mix(in oklab, var(--accent-secondary) 38%, transparent)',
                                background: 'color-mix(in oklab, var(--accent-secondary) 14%, transparent)',
                                color: 'var(--accent-secondary)',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                    background: 'color-mix(in oklab, var(--accent-secondary) 24%, transparent)',
                                    borderColor: 'var(--accent-secondary)',
                                },
                                '&.Mui-disabled': { color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'var(--bg-tertiary)' },
                            }}
                        >
                            <SportsEsportsIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </span>
                </Tooltip>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <SearchInput
                    initialValue={donorFilterInput}
                    placeholder={enableDonorEmitterSearch ? 'Filter by Particle or Emitter Name' : 'Filter by Particle Name Only'}
                    onChange={filterDonorParticles}
                    accentVar="var(--accent-secondary)"
                    style={{ color: 'var(--accent-secondary)' }}
                    className="port-donor-search"
                />
                <button
                    className="port-search-toggle-btn"
                    onClick={() => setEnableDonorEmitterSearch(!enableDonorEmitterSearch)}
                    title={enableDonorEmitterSearch ? 'Disable emitter search (faster)' : 'Enable emitter search'}
                    style={{
                        height: '40px',
                        minWidth: '52px',
                        padding: '0 14px',
                        background: enableDonorEmitterSearch ? 'color-mix(in oklab, var(--accent-secondary) 18%, transparent)' : 'color-mix(in oklab, var(--accent-secondary) 12%, transparent)',
                        border: enableDonorEmitterSearch ? '1px solid var(--accent-secondary)' : '1px solid color-mix(in oklab, var(--accent-secondary) 35%, transparent)',
                        borderRadius: '10px',
                        color: 'var(--accent-secondary)',
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
                    <SearchIcon sx={{ fontSize: 16, color: 'var(--accent-secondary)', opacity: enableDonorEmitterSearch ? 1 : 0.78 }} />
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
