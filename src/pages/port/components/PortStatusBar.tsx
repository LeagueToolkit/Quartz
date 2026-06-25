interface PortStatusBarProps {
    statusMessage: string;
    targetPyContent: string;
    trimTargetNames: boolean;
    setTrimTargetNames: (v: boolean) => void;
    trimDonorNames: boolean;
    setTrimDonorNames: (v: boolean) => void;
}

export default function PortStatusBar({ statusMessage, targetPyContent, trimTargetNames, setTrimTargetNames, trimDonorNames, setTrimDonorNames }: PortStatusBarProps) {
    return (
        <div
            className="port-status-bar"
            style={{
                padding: '6px 12px',
                background: 'transparent',
                borderTop: '1px solid var(--border)',
                color: 'var(--accent-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '20px',
            }}
        >
            <span style={{ flex: 1 }}>{statusMessage}</span>
            {targetPyContent && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={trimTargetNames} onChange={(e) => setTrimTargetNames(e.target.checked)} style={{ cursor: 'pointer' }} />
                        <span>Trim Target Names</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={trimDonorNames} onChange={(e) => setTrimDonorNames(e.target.checked)} style={{ cursor: 'pointer' }} />
                        <span>Trim Donor Names</span>
                    </label>
                </div>
            )}
        </div>
    );
}
