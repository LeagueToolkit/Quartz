import { useState } from 'react';
import { FolderOpen, AutoFixHigh, Close } from '@mui/icons-material';
import { open } from '@tauri-apps/plugin-dialog';
import { log } from '@/lib/util/logger';
import { getModFiles } from '../utils/backend';
import type { AutoExtractRequest, ModFileSet } from '../types';

interface Props {
    open: boolean;
    onClose: () => void;
    onProcess: (req: AutoExtractRequest) => void;
}

const sectionLabel: React.CSSProperties = {
    fontSize: '0.7rem', opacity: 0.5, marginBottom: 8, letterSpacing: '0.05em', color: 'var(--text-secondary)',
};

export default function AutoExtractDialog({ open: isOpen, onClose, onProcess }: Props) {
    const [modPaths, setModPaths] = useState<string[]>([]);
    const [outputPath, setOutputPath] = useState('');
    const [skinId, setSkinId] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadToTree, setLoadToTree] = useState(true);

    const handleSelectFolder = async (target: 'mod' | 'output') => {
        const picked = await open({ directory: true, multiple: target === 'mod' });
        if (picked == null) return;
        if (target === 'mod') {
            setModPaths(Array.isArray(picked) ? picked : [picked]);
        } else {
            setOutputPath(Array.isArray(picked) ? picked[0] : picked);
        }
    };

    const handleRun = async () => {
        if (modPaths.length === 0) return;
        setIsProcessing(true);
        try {
            const batchFiles: ModFileSet[] = [];
            for (const path of modPaths) {
                const results = (await getModFiles(path, skinId)) as ModFileSet[];
                if (results && results.length > 0) {
                    const pathParts = path.split(/[\\/]/);
                    const baseFolderName = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || 'Mod';
                    for (const set of results) {
                        if (set.audio || set.events) {
                            const modFolderName = set.type ? `${baseFolderName} (${set.type})` : baseFolderName;
                            batchFiles.push({ ...set, modFolderName });
                        }
                    }
                }
            }

            if (batchFiles.length > 0) {
                onProcess({ batchFiles, outputPath, loadToTree, skinId });
                onClose();
            }
        } catch (e) {
            log.error('[AutoExtractDialog] scan error', e);
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="dl-modal-backdrop" onClick={onClose}>
            <div className="dl-modal" onClick={(e) => e.stopPropagation()}>
                <div className="dl-modal__head">
                    <span className="dl-icon"><AutoFixHigh style={{ color: 'var(--accent-primary)' }} /></span>
                    <h2 className="dl-modal__title">Batch Mod Processor</h2>
                    <button className="dl-modal__close" onClick={onClose} aria-label="Close">✕</button>
                </div>

                <div className="dl-modal__body">
                    <div>
                        <div style={sectionLabel}>MOD SOURCE FOLDERS ({modPaths.length})</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                className="dl-input"
                                placeholder="Select one or more mod folders..."
                                value={modPaths.length > 0 ? `${modPaths.length} folder(s) selected` : ''}
                                readOnly
                            />
                            <button className="dl-btn dl-btn--secondary dl-btn--icon" onClick={() => handleSelectFolder('mod')} title="Select mod folders">
                                <span className="dl-icon"><FolderOpen fontSize="small" /></span>
                            </button>
                            {modPaths.length > 0 && (
                                <button className="dl-btn dl-btn--icon dl-btn--sm dl-btn--danger" onClick={() => setModPaths([])} title="Clear">
                                    <span className="dl-icon"><Close fontSize="small" /></span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <div style={sectionLabel}>OUTPUT DESTINATION (OPTIONAL)</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                className="dl-input"
                                placeholder="Leave empty to just parse tree"
                                value={outputPath}
                                onChange={(e) => setOutputPath(e.target.value)}
                            />
                            <button className="dl-btn dl-btn--secondary dl-btn--icon" onClick={() => handleSelectFolder('output')} title="Select output folder">
                                <span className="dl-icon"><FolderOpen fontSize="small" /></span>
                            </button>
                        </div>
                    </div>

                    <div>
                        <div style={sectionLabel}>SKIN ID (OPTIONAL)</div>
                        <input className="dl-input" placeholder="e.g. 45" value={skinId} onChange={(e) => setSkinId(e.target.value)} />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <span className="dl-toggle">
                            <input type="checkbox" checked={loadToTree} onChange={(e) => setLoadToTree(e.target.checked)} />
                            <span className="dl-toggle__track" />
                            <span className="dl-toggle__thumb" />
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>LOAD INTO TREE VIEW</span>
                    </label>
                </div>

                <div className="dl-modal__foot">
                    <button className="dl-btn dl-btn--secondary" onClick={onClose}>Cancel</button>
                    <button
                        className="dl-btn dl-btn--primary"
                        onClick={handleRun}
                        disabled={modPaths.length === 0 || isProcessing}
                    >
                        {isProcessing ? 'Processing...' : (outputPath ? 'Batch Auto-Extract' : 'Batch Parse Only')}
                    </button>
                </div>
            </div>
        </div>
    );
}
