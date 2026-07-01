import React from 'react';
import { AutoFixHigh as AutoFixHighIcon, Tune as TuneIcon, Close as CloseIcon } from '@mui/icons-material';

interface SourceAddModeModalProps {
    open: boolean;
    sourceDirLabel: string;
    onQuick: () => void;
    onNormal: () => void;
    onClose: () => void;
}

const SourceAddModeModal = React.memo(function SourceAddModeModal({
    open,
    sourceDirLabel,
    onQuick,
    onNormal,
    onClose,
}: SourceAddModeModalProps) {
    if (!open) return null;

    return (
        <div className="dl-modal-backdrop" onClick={onClose}>
            <div className="dl-modal" onClick={(e) => e.stopPropagation()}>
                <div className="dl-modal__head">
                    <h2 className="dl-modal__title">Source Folder Added</h2>
                    <button type="button" className="dl-modal__close" onClick={onClose} title="Close">
                        <span className="dl-icon"><CloseIcon /></span>
                    </button>
                </div>

                <div className="dl-modal__body">
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                        Choose your workflow for this source folder.
                    </p>
                    {sourceDirLabel && (
                        <div
                            style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                background: 'var(--bg-tertiary)',
                            }}
                        >
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                                {sourceDirLabel}
                            </span>
                        </div>
                    )}
                </div>

                <div className="dl-modal__foot">
                    <button type="button" className="dl-btn dl-btn--primary" onClick={onQuick}>
                        <span className="dl-icon"><AutoFixHighIcon /></span>
                        <span>Quick Repath (Recommended)</span>
                    </button>
                    <button type="button" className="dl-btn dl-btn--secondary" onClick={onNormal}>
                        <span className="dl-icon"><TuneIcon /></span>
                        <span>Normal Repath</span>
                    </button>
                </div>
            </div>
        </div>
    );
});

export default SourceAddModeModal;
