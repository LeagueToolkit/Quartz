import React from 'react';
import { AutoFixHigh as AutoFixHighIcon, FolderOpen as FolderOpenIcon, Close as CloseIcon } from '@mui/icons-material';
import { CustomSelect } from '../../../components/settings/primitives';
import type { QuickBinOption } from '../utils/types';

const stepLabels = [
    'Select Main BIN',
    'Choose Prefix',
    'Choose Output Folder',
];

interface QuickRepathWizardModalProps {
    open: boolean;
    step: number;
    setStep: (step: number) => void;
    binOptions: QuickBinOption[];
    selectedMainBin: string;
    setSelectedMainBin: (value: string) => void;
    quickPrefix: string;
    setQuickPrefix: (value: string) => void;
    quickOutputPath: string;
    setQuickOutputPath: (value: string) => void;
    ignoreMissing: boolean;
    setIgnoreMissing: (value: boolean) => void;
    combineLinked: boolean;
    setCombineLinked: (value: boolean) => void;
    onSelectOutputDir: () => void;
    onRunQuickRepath: () => void;
    onClose: () => void;
    isRunning: boolean;
}

const toggleRow = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
        <span className="dl-toggle">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span className="dl-toggle__track" />
            <span className="dl-toggle__thumb" />
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{label}</span>
    </label>
);

const QuickRepathWizardModal = React.memo(function QuickRepathWizardModal({
    open,
    step,
    setStep,
    binOptions,
    selectedMainBin,
    setSelectedMainBin,
    quickPrefix,
    setQuickPrefix,
    quickOutputPath,
    setQuickOutputPath,
    ignoreMissing,
    setIgnoreMissing,
    combineLinked,
    setCombineLinked,
    onSelectOutputDir,
    onRunQuickRepath,
    onClose,
    isRunning,
}: QuickRepathWizardModalProps) {
    if (!open) return null;

    const canNextStep1 = Boolean(selectedMainBin);
    const canNextStep2 = Boolean((quickPrefix || '').trim());
    const canRun = Boolean((quickOutputPath || '').trim()) && !isRunning;

    const handleNext = () => {
        if (step === 0 && !canNextStep1) return;
        if (step === 1 && !canNextStep2) return;
        setStep(Math.min(2, step + 1));
    };

    const handleBack = () => {
        setStep(Math.max(0, step - 1));
    };

    return (
        <div className="dl-modal-backdrop" onClick={isRunning ? undefined : onClose}>
            <div className="dl-modal" onClick={(e) => e.stopPropagation()}>
                <div className="dl-modal__head">
                    <h2 className="dl-modal__title">Quick Repath Wizard</h2>
                    {!isRunning && (
                        <button type="button" className="dl-modal__close" onClick={onClose} title="Close">
                            <span className="dl-icon"><CloseIcon /></span>
                        </button>
                    )}
                </div>

                <div className="dl-modal__body">
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {stepLabels.map((label, index) => (
                            <span
                                key={label}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: '999px',
                                    fontSize: '0.72rem',
                                    border: '1px solid',
                                    borderColor: index === step ? 'var(--accent-primary)' : 'var(--border)',
                                    color: index <= step ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    background: index === step
                                        ? 'color-mix(in oklab, var(--accent-primary) 15%, transparent)'
                                        : 'transparent',
                                }}
                            >
                                {index + 1}. {label}
                            </span>
                        ))}
                    </div>

                    {step === 0 && (
                        <div>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '10px', fontSize: '0.85rem' }}>
                                Pick the main BIN. Matching subcharacter BINs with the same skin number are included automatically.
                            </p>
                            <CustomSelect
                                value={selectedMainBin}
                                onChange={setSelectedMainBin}
                                options={binOptions.map((bin) => ({ value: bin.value, label: bin.label }))}
                                placeholder="Main BIN"
                            />
                        </div>
                    )}

                    {step === 1 && (
                        <div>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '10px', fontSize: '0.85rem' }}>
                                Enter the prefix to apply to all editable entries.
                            </p>
                            <input
                                className="dl-input"
                                value={quickPrefix}
                                onChange={(e) => setQuickPrefix(e.target.value)}
                                placeholder="e.g. bum"
                            />
                        </div>
                    )}

                    {step === 2 && (
                        <div>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '10px', fontSize: '0.85rem' }}>
                                Select or type an output folder. Missing folders will be created.
                            </p>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    className="dl-input"
                                    value={quickOutputPath}
                                    onChange={(e) => setQuickOutputPath(e.target.value)}
                                    placeholder="Output path"
                                />
                                <button
                                    type="button"
                                    className="dl-btn dl-btn--secondary"
                                    onClick={onSelectOutputDir}
                                >
                                    <span className="dl-icon"><FolderOpenIcon /></span>
                                    <span>Browse</span>
                                </button>
                            </div>
                            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {toggleRow('Ignore Missing Files', ignoreMissing, setIgnoreMissing)}
                                {toggleRow('Combine Linked BINs', combineLinked, setCombineLinked)}
                            </div>
                        </div>
                    )}
                </div>

                <div className="dl-modal__foot">
                    <button type="button" className="dl-btn dl-btn--ghost" onClick={onClose} disabled={isRunning}>
                        Cancel
                    </button>
                    <button type="button" className="dl-btn dl-btn--secondary" onClick={handleBack} disabled={isRunning || step === 0}>
                        Back
                    </button>
                    {step < 2 ? (
                        <button
                            type="button"
                            className="dl-btn dl-btn--primary"
                            onClick={handleNext}
                            disabled={isRunning || (step === 0 ? !canNextStep1 : !canNextStep2)}
                        >
                            Next
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="dl-btn dl-btn--primary"
                            onClick={onRunQuickRepath}
                            disabled={!canRun}
                        >
                            <span className="dl-icon"><AutoFixHighIcon /></span>
                            <span>{isRunning ? 'Running...' : 'Run Quick Repath'}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});

export default QuickRepathWizardModal;
