/**
 * Flint - Settings Modal Component
 */

import React, { useState, useEffect } from 'react';
import { useAppState } from '../../lib/state';
import * as api from '../../lib/api';
import { open } from '@tauri-apps/plugin-dialog';
import { getIcon } from '../../lib/fileIcons';

export const SettingsModal: React.FC = () => {
    const { state, dispatch, closeModal, showToast } = useAppState();

    const [leaguePath, setLeaguePath] = useState(state.leaguePath || '');
    const [creatorName, setCreatorName] = useState(state.creatorName || '');
    const [isValidating, setIsValidating] = useState(false);

    const isVisible = state.activeModal === 'settings';

    useEffect(() => {
        if (isVisible) {
            setLeaguePath(state.leaguePath || '');
            setCreatorName(state.creatorName || '');
        }
    }, [isVisible, state.leaguePath, state.creatorName]);

    const handleBrowseLeague = async () => {
        const selected = await open({
            title: 'Select League of Legends Game Folder',
            directory: true,
        });
        if (selected) {
            setLeaguePath(selected as string);
        }
    };

    const handleDetectLeague = async () => {
        setIsValidating(true);
        try {
            const result = await api.detectLeague();
            if (result.path) {
                setLeaguePath(result.path);
                showToast('success', 'League installation detected!');
            }
        } catch (err) {
            showToast('error', 'Could not auto-detect League installation');
        } finally {
            setIsValidating(false);
        }
    };

    const handleSave = async () => {
        // Validate League path if changed
        if (leaguePath && leaguePath !== state.leaguePath) {
            setIsValidating(true);
            try {
                const result = await api.validateLeague(leaguePath);
                if (!result.valid) {
                    showToast('error', 'Invalid League of Legends path');
                    setIsValidating(false);
                    return;
                }
            } catch {
                showToast('error', 'Failed to validate League path');
                setIsValidating(false);
                return;
            }
            setIsValidating(false);
        }

        dispatch({
            type: 'SET_STATE',
            payload: {
                leaguePath: leaguePath || null,
                creatorName: creatorName || null,
            },
        });

        showToast('success', 'Settings saved');
        closeModal();
    };

    if (!isVisible) return null;

    return (
        <div className={`modal-overlay ${isVisible ? 'modal-overlay--visible' : ''}`}>
            <div className="modal">
                <div className="modal__header">
                    <h2 className="modal__title">Settings</h2>
                    <button className="modal__close" onClick={closeModal}>×</button>
                </div>

                <div className="modal__body">
                    <div className="form-group">
                        <label className="form-label">League of Legends Path</label>
                        <div className="form-input--with-button">
                            <input
                                type="text"
                                className="form-input"
                                placeholder="C:\Riot Games\League of Legends"
                                value={leaguePath}
                                onChange={(e) => setLeaguePath(e.target.value)}
                            />
                            <button className="btn btn--secondary" onClick={handleBrowseLeague}>
                                Browse
                            </button>
                        </div>
                        <button
                            className="btn btn--ghost"
                            style={{ marginTop: '8px' }}
                            onClick={handleDetectLeague}
                            disabled={isValidating}
                        >
                            <span dangerouslySetInnerHTML={{ __html: getIcon('search') }} />
                            <span>Auto-detect</span>
                        </button>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Creator Name</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Your name (for mod credits)"
                            value={creatorName}
                            onChange={(e) => setCreatorName(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Hash Status</label>
                        <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {state.hashesLoaded ? (
                                <>
                                    <span dangerouslySetInnerHTML={{ __html: getIcon('success') }} />
                                    <span>{state.hashCount.toLocaleString()} hashes loaded</span>
                                </>
                            ) : (
                                <>
                                    <span dangerouslySetInnerHTML={{ __html: getIcon('warning') }} />
                                    <span>Hashes not loaded</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="modal__footer">
                    <button className="btn btn--secondary" onClick={closeModal}>
                        Cancel
                    </button>
                    <button className="btn btn--primary" onClick={handleSave} disabled={isValidating}>
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
};
