import React from 'react';
import type { SelectedSkin } from '../types';

interface Props {
    selectedSkins: SelectedSkin[];
    isExtracting: boolean;
    isSetupValid: boolean;
    onExtract: () => void;
    onClearAll: () => void;
}

/* Ported from FrogChanger SelectionSummaryBar.js. The Electron build also had
   Repath and Inspect Model actions; those have no Rust backend yet.
   TODO(backend): wire Repath + Inspect Model. */
export function SelectionSummaryBar({ selectedSkins, isExtracting, isSetupValid, onExtract, onClearAll }: Props) {
    if (selectedSkins.length === 0) return null;

    const disabledAction = isExtracting || !isSetupValid || selectedSkins.length === 0;

    const baseButton: React.CSSProperties = {
        borderRadius: 8,
        padding: '7px 12px',
        fontSize: '0.76rem',
        fontWeight: 600,
        fontFamily: 'inherit',
        border: '1px solid rgba(255,255,255,0.14)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minWidth: 98,
    };

    const extractStyle: React.CSSProperties = disabledAction
        ? { ...baseButton, opacity: 0.5, cursor: 'not-allowed', background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)', boxShadow: 'none' }
        : {
            ...baseButton,
            background: 'color-mix(in srgb, var(--accent-green), transparent 70%)',
            color: 'var(--accent-green)',
            borderColor: 'color-mix(in srgb, var(--accent-green), transparent 40%)',
            boxShadow: '0 0 16px color-mix(in srgb, var(--accent-green), transparent 68%)',
        };

    const ghostStyle: React.CSSProperties = isExtracting
        ? { ...baseButton, opacity: 0.5, cursor: 'not-allowed', background: 'rgba(255,255,255,0.08)' }
        : { ...baseButton, background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.82)', borderColor: 'rgba(255,255,255,0.12)', boxShadow: 'none' };

    return (
        <div
            style={{
                position: 'absolute',
                bottom: 14,
                left: 14,
                right: 14,
                zIndex: 100,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(12, 14, 24, 0.68)',
                backdropFilter: 'blur(18px) saturate(180%)',
                WebkitBackdropFilter: 'blur(18px) saturate(180%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(255,255,255,0.03), 0 18px 44px rgba(0,0,0,0.46)',
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.03) 34%, rgba(255,255,255,0) 62%)',
                    opacity: 0.28,
                    pointerEvents: 'none',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    inset: '-25% -35%',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 20%, rgba(255,255,255,0) 56%)',
                    transform: 'translateX(-25%)',
                    animation: 'liquidSheen 11s ease-in-out infinite',
                    pointerEvents: 'none',
                    mixBlendMode: 'screen',
                    opacity: 0.14,
                }}
            />
            <div
                style={{
                    position: 'relative',
                    zIndex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '10px',
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ minWidth: 220, flex: '1 1 320px', padding: '2px 2px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--accent2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                        Selected Skins ({selectedSkins.length})
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.97)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selectedSkins.map((skin, index) => (
                            <span key={index}>
                                {`${skin.name}${skin.champion?.name ? ` (${skin.champion.name})` : ''}`}
                                {index < selectedSkins.length - 1 && ', '}
                            </span>
                        ))}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button onClick={onExtract} disabled={disabledAction} style={extractStyle}>
                        {isExtracting && (
                            <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'ae-spin 0.7s linear infinite' }} />
                        )}
                        {isExtracting ? 'Extracting...' : 'Extract WAD'}
                    </button>
                    <button onClick={onClearAll} disabled={isExtracting} style={ghostStyle}>
                        Clear All
                    </button>
                </div>
            </div>
        </div>
    );
}
