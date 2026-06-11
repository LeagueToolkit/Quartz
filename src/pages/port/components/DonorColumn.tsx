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
                        background: 'color-mix(in srgb, var(--accent2) 12%, transparent)',
                        border: '2px dashed var(--accent2)',
                        borderRadius: '8px',
                        transition: 'all 0.15s ease-out',
                    }}
                >
                    <div
                        style={{
                            padding: '10px 16px',
                            borderRadius: '6px',
                            border: '1px dashed var(--accent2)',
                            color: 'var(--accent2)',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '13px',
                            background: 'color-mix(in srgb, var(--accent2), transparent 80%)',
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
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '13px',
                        fontWeight: 700,
                        height: '36px',
                        background: 'color-mix(in srgb, var(--accent2) 14%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--accent2), transparent 70%)',
                        color: 'var(--accent2)',
                        borderRadius: '4px',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        position: 'relative',
                        '&:hover': {
                            background: 'color-mix(in srgb, var(--accent2) 22%, transparent)',
                            borderColor: 'var(--accent2)',
                            textShadow: '0 0 8px color-mix(in srgb, var(--accent2), transparent 50%)',
                        },
                        '&:disabled': { opacity: 0.5, cursor: 'not-allowed', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' },
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
                                border: '1px solid color-mix(in srgb, var(--accent2), transparent 62%)',
                                background: 'color-mix(in srgb, var(--accent2) 14%, transparent)',
                                color: 'var(--accent2)',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                    background: 'color-mix(in srgb, var(--accent2) 24%, transparent)',
                                    borderColor: 'var(--accent2)',
                                    boxShadow: '0 0 10px color-mix(in srgb, var(--accent2), transparent 55%)',
                                },
                                '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' },
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
                    accentVar="var(--accent2)"
                    style={{ color: 'var(--accent2)' }}
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
                        background: enableDonorEmitterSearch ? 'color-mix(in srgb, var(--accent2) 15%, transparent)' : 'color-mix(in srgb, var(--accent2) 12%, transparent)',
                        border: enableDonorEmitterSearch ? '1px solid var(--accent2)' : '1px solid color-mix(in srgb, var(--accent2) 35%, transparent)',
                        borderRadius: '10px',
                        color: 'var(--accent2)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: enableDonorEmitterSearch ? '0 0 10px color-mix(in srgb, var(--accent2) 15%, transparent)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                    }}
                >
                    <SearchIcon sx={{ fontSize: 16, color: 'var(--accent2)', opacity: enableDonorEmitterSearch ? 1 : 0.78 }} />
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
                            color: 'var(--accent2)',
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
                        No donor bin loaded
                    </div>
                )}
            </div>
        </div>
    );
}
