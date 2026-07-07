import { createPortal } from 'react-dom';
import { FolderOpen, Refresh, X as CloseIcon } from '@mui/icons-material';
import type { Pane } from '../types';
import type { PathSet } from '../../BnkExtract';

interface Props {
    open: boolean;
    pane: Pane;
    paths: PathSet;
    isLoading: boolean;
    onSelectFile: (pane: Pane, kind: keyof PathSet) => void;
    onSetPath: (pane: Pane, kind: keyof PathSet, value: string) => void;
    onParse: (pane: Pane) => void;
    onClose: () => void;
}

const FIELDS: { kind: keyof PathSet; label: string; tip: string }[] = [
    { kind: 'bin', label: 'BIN File (Names)', tip: 'Select BIN File (Event Names)' },
    { kind: 'wpk', label: 'Audio File (WPK/BNK)', tip: 'Select Audio File (.wpk/.bnk)' },
    { kind: 'bnk', label: 'Events File (BNK)', tip: 'Select BNK File (Events Structure)' },
];

/* "Add more files" modal for a loaded pane — the same BIN/Audio/Events triple the
   empty-state loader uses, wrapped in the shared dl-modal shell (Asset Extractor
   styling). Parsing appends to the pane's existing tree. */
export default function BnkAddFilesModal({ open, pane, paths, isLoading, onSelectFile, onSetPath, onParse, onClose }: Props) {
    if (!open) return null;
    const canParse = !isLoading && (!!paths.wpk || !!paths.bnk);
    const paneLabel = pane === 'right' ? 'Reference' : 'Main';

    return createPortal(
        <div className="dl-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="dl-modal">
                <div className="dl-modal__head">
                    <h3 className="dl-modal__title">Add Files to {paneLabel} Bank</h3>
                    <button className="dl-modal__close" onClick={onClose} aria-label="Close">
                        <span className="dl-icon"><CloseIcon sx={{ fontSize: 16 }} /></span>
                    </button>
                </div>

                <div className="dl-modal__body">
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                        Select a BIN / Audio / Events set and parse it into the {paneLabel.toLowerCase()} bank.
                        The parsed tree is appended to what's already loaded.
                    </p>

                    {FIELDS.map(({ kind, label, tip }) => (
                        <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                                className={`dl-btn dl-btn--icon dl-btn--sm ${paths[kind] ? 'dl-btn--primary' : 'dl-btn--secondary'}`}
                                onClick={() => onSelectFile(pane, kind)}
                                title={tip}
                            >
                                <span className="dl-icon"><FolderOpen sx={{ fontSize: 16 }} /></span>
                            </button>
                            <input
                                className="dl-input"
                                style={{ flex: 1 }}
                                value={paths[kind]}
                                onChange={(e) => onSetPath(pane, kind, e.target.value)}
                                placeholder={label}
                            />
                        </div>
                    ))}
                </div>

                <div className="dl-modal__foot">
                    <button className="dl-btn dl-btn--secondary" onClick={onClose}>Cancel</button>
                    <button
                        className="dl-btn dl-btn--primary"
                        disabled={!canParse}
                        onClick={() => { onParse(pane); onClose(); }}
                    >
                        <span className="dl-icon"><Refresh sx={{ fontSize: 14 }} /></span>
                        <span>Parse &amp; Add</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
