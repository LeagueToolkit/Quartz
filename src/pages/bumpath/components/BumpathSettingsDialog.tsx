import React from 'react';
import { Close as CloseIcon } from '@mui/icons-material';

interface BumpathSettingsDialogProps {
    settingsOpen: boolean;
    setSettingsOpen: (open: boolean) => void;
    hashesPath: string;
}

const BumpathSettingsDialog = React.memo(function BumpathSettingsDialog({
    settingsOpen,
    setSettingsOpen,
    hashesPath,
}: BumpathSettingsDialogProps) {
    if (!settingsOpen) return null;

    return (
        <div className="dl-modal-backdrop" onClick={() => setSettingsOpen(false)}>
            <div className="dl-modal" onClick={(e) => e.stopPropagation()}>
                <div className="dl-modal__head">
                    <h2 className="dl-modal__title" style={{ color: 'var(--accent-primary)' }}>
                        Bumpath Settings
                    </h2>
                    <button
                        type="button"
                        className="dl-modal__close"
                        onClick={() => setSettingsOpen(false)}
                        title="Close"
                    >
                        <span className="dl-icon"><CloseIcon /></span>
                    </button>
                </div>

                <div className="dl-modal__body">
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            Hash Directory (Automatic)
                        </span>
                        <input
                            className="dl-input"
                            value={hashesPath}
                            placeholder="Loading..."
                            readOnly
                            data-bumpath-hash-dir
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Hash files are automatically managed. Use Settings page to download/update hash files.
                        </span>
                    </label>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
                        Hash files are downloaded automatically from CommunityDragon.
                        Go to Settings -&gt; Hash Files section to download or update hash files.
                    </p>
                </div>

                <div className="dl-modal__foot">
                    <button
                        type="button"
                        className="dl-btn dl-btn--secondary"
                        onClick={() => setSettingsOpen(false)}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
});

export default BumpathSettingsDialog;
