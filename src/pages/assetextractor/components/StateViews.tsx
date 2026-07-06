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

/* Loading skeleton — shimmers the champion sidebar (tabs, search, rows) while
   the champion list loads. The main area keeps the real "Select a Champion"
   empty state: nothing is selected on load, so no skin grid is coming until the
   user picks a champion, and a card skeleton there would imply otherwise.
   Reuses the real .ae-sb / .ae-sb__row structure so the placeholder lines up
   1:1 with the loaded sidebar. */
export function LoadingSkeletonView({ sidebarWidth = 256 }: { sidebarWidth?: number }) {
    const rows = Array.from({ length: 12 });
    const stagger = (i: number) => ['', 'ae-skel--d1', 'ae-skel--d2', 'ae-skel--d3'][i % 4];

    return (
        <div className="flex" style={{ height: '100%', minHeight: 0 }}>
            {/* Sidebar skeleton */}
            <aside className="ae-sb" style={{ width: sidebarWidth }} aria-hidden="true">
                {/* Category tabs */}
                <div className="ae-sb__tabs" style={{ gap: 6 }}>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="ae-skel" style={{ flex: 1, height: 30 }} />
                    ))}
                </div>
                {/* Search bar */}
                <div className="ae-sb__search">
                    <div className="ae-skel" style={{ height: 38, borderRadius: 8 }} />
                </div>
                {/* Champion rows */}
                <div className="ae-sb__list">
                    {rows.map((_, i) => (
                        <div
                            key={i}
                            className="ae-sb__row"
                            style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 10 }}
                        >
                            <div className={`ae-skel ae-skel__avatar ${stagger(i)}`} />
                            <div className="ae-sb__meta" style={{ flex: 1, gap: 6 }}>
                                <div className={`ae-skel ae-skel__line ${stagger(i)}`} style={{ width: `${55 + ((i * 13) % 35)}%` }} />
                                <div className={`ae-skel ae-skel__line--sm ${stagger(i + 1)}`} style={{ width: `${30 + ((i * 7) % 25)}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            </aside>

            {/* Resize handle placeholder (matches the real 8px divider) */}
            <div style={{ width: 8, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }} />

            {/* Main area keeps the real empty state — no champion selected yet. */}
            <main className="flex-1" style={{ minWidth: 0, padding: '12px 16px 16px', overflow: 'hidden' }}>
                <NoChampionSelectedView loading />
            </main>
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
