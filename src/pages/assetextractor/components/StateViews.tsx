import React from 'react';

/* Loading / error / empty state views — theme-tokened, Design Lab styling. */

const centerWrap: React.CSSProperties = {
    minHeight: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-primary)',
};

const spinner = (
    <div
        style={{
            width: 48, height: 48, margin: '0 auto 16px',
            borderRadius: '50%',
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent-primary)',
            animation: 'dl-spin 0.9s linear infinite',
        }}
    />
);

export function LoadingStateView() {
    return (
        <div style={centerWrap}>
            <div style={{ textAlign: 'center' }}>
                {spinner}
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Loading Asset Extractor...</p>
            </div>
        </div>
    );
}

export function ErrorStateView({ error, onRetry }: { error: string; onRetry: () => void }) {
    return (
        <div style={centerWrap}>
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
                <div style={{ fontSize: 40, lineHeight: 1, color: 'var(--color-danger)', marginBottom: 12 }}>!</div>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-danger)' }}>Connection Error</h2>
                <p style={{ color: 'var(--text-muted)', margin: '0 0 16px' }}>{error}</p>
                <button className="dl-btn dl-btn--primary" onClick={onRetry}>Retry</button>
            </div>
        </div>
    );
}

export function NoChampionSelectedView({ loading }: { loading: boolean }) {
    return (
        <div style={{ ...centerWrap, height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>Select a Champion</h2>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>Choose a champion from the sidebar to view their skins</p>
                {loading && <p style={{ color: 'var(--accent-primary)', marginTop: 8 }}>Loading champions...</p>}
            </div>
        </div>
    );
}
