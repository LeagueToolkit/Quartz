import { LinearProgress } from '@mui/material';

interface Props {
    open: boolean;
    isInstalling: boolean;
    installProgress: string;
    onCancel: () => void;
    onInstall: () => void;
}

export default function BnkInstallModal({
    open,
    isInstalling,
    installProgress,
    onCancel,
    onInstall,
}: Props) {
    if (!open) return null;

    return (
        <div className="dl-modal-backdrop">
            <div className="dl-modal" style={{ maxWidth: 440 }}>
                <div className="dl-modal__head">
                    <h2 className="dl-modal__title">Audio Conversion Tools</h2>
                </div>

                <div className="dl-modal__body">
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        Converting <strong style={{ color: 'var(--text-primary)' }}>.wav / .mp3 / .ogg</strong> to WEM
                        requires the Wwise engine (~200 MB). Install it once to your AppData folder.
                    </p>

                    {isInstalling && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <LinearProgress sx={{ borderRadius: 4, height: 4, background: 'var(--border)', '& .MuiLinearProgress-bar': { background: 'var(--accent-primary)' } }} />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{installProgress}</span>
                        </div>
                    )}
                </div>

                {!isInstalling && (
                    <div className="dl-modal__foot">
                        <button className="dl-btn dl-btn--secondary" onClick={onCancel}>
                            <span>Cancel</span>
                        </button>
                        <button className="dl-btn dl-btn--primary" onClick={onInstall}>
                            <span>Install Wwise Tools</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
