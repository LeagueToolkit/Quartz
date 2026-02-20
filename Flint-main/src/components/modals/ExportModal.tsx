/**
 * Flint - Export Modal Component
 */

import React, { useState } from 'react';
import { useAppState } from '../../lib/state';
import * as api from '../../lib/api';
import { save } from '@tauri-apps/plugin-dialog';
import { getIcon } from '../../lib/fileIcons';

export const ExportModal: React.FC = () => {
    const { state, closeModal, showToast } = useAppState();

    const [format, setFormat] = useState<'fantome' | 'modpkg'>('fantome');
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState('');

    // Get project from active tab
    const activeTab = state.activeTabId
        ? state.openTabs.find(t => t.id === state.activeTabId)
        : null;
    const currentProject = activeTab?.project || null;
    const currentProjectPath = activeTab?.projectPath || null;

    const isVisible = state.activeModal === 'export';
    const modalOptions = state.modalOptions as { format?: 'fantome' | 'modpkg' } | null;

    // Use format from modal options if provided
    React.useEffect(() => {
        if (modalOptions?.format) {
            setFormat(modalOptions.format);
        }
    }, [modalOptions]);

    const handleExport = async () => {
        if (!currentProjectPath || !currentProject) return;

        const ext = format === 'fantome' ? 'fantome' : 'modpkg';
        const projectName = currentProject?.display_name || currentProject?.name || 'mod';

        const outputPath = await save({
            title: `Export as .${ext}`,
            defaultPath: `${projectName}.${ext}`,
            filters: [{ name: `${ext.toUpperCase()} Package`, extensions: [ext] }],
        });

        if (!outputPath) return;

        setIsExporting(true);
        setProgress('Packaging mod...');

        try {
            const result = await api.exportProject({
                projectPath: currentProjectPath,
                outputPath,
                format,
                champion: currentProject.champion,
                metadata: {
                    name: currentProject.name,
                    author: currentProject.creator || state.creatorName || 'Unknown',
                    version: currentProject.version || '1.0.0',
                    description: currentProject.description || '',
                },
            });

            showToast('success', `Exported to ${result.path}`);
            closeModal();

        } catch (err) {
            console.error('Export failed:', err);
            const flintError = err as api.FlintError;
            showToast('error', flintError.getUserMessage?.() || 'Export failed');
        } finally {
            setIsExporting(false);
            setProgress('');
        }
    };

    if (!isVisible) return null;

    return (
        <div className={`modal-overlay ${isVisible ? 'modal-overlay--visible' : ''}`}>
            <div className="modal">
                {isExporting && (
                    <div className="modal__loading-overlay">
                        <div className="modal__loading-content">
                            <div className="spinner spinner--lg" />
                            <div className="modal__loading-text">Exporting Mod</div>
                            <div className="modal__loading-progress">{progress}</div>
                        </div>
                    </div>
                )}

                <div className="modal__header">
                    <h2 className="modal__title">Export Mod</h2>
                    <button className="modal__close" onClick={closeModal}>×</button>
                </div>

                <div className="modal__body">
                    <div className="form-group">
                        <label className="form-label">Export Format</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="format"
                                    value="fantome"
                                    checked={format === 'fantome'}
                                    onChange={() => setFormat('fantome')}
                                />
                                <span dangerouslySetInnerHTML={{ __html: getIcon('package') }} />
                                <span>.fantome (Fantome Mod Manager)</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="format"
                                    value="modpkg"
                                    checked={format === 'modpkg'}
                                    onChange={() => setFormat('modpkg')}
                                />
                                <span dangerouslySetInnerHTML={{ __html: getIcon('package') }} />
                                <span>.modpkg (League Mod Tools)</span>
                            </label>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Project</label>
                        <div style={{ color: 'var(--text-secondary)' }}>
                            {currentProject?.champion} - {currentProject?.display_name || currentProject?.name}
                        </div>
                    </div>
                </div>

                <div className="modal__footer">
                    <button className="btn btn--secondary" onClick={closeModal}>
                        Cancel
                    </button>
                    <button className="btn btn--primary" onClick={handleExport} disabled={isExporting}>
                        Export
                    </button>
                </div>
            </div>
        </div>
    );
};
