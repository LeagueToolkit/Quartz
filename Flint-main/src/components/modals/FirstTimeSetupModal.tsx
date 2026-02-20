/**
 * Flint - First Time Setup Modal Component
 */

import React, { useState } from 'react';
import { useAppState } from '../../lib/state';
import * as api from '../../lib/api';
import { open } from '@tauri-apps/plugin-dialog';
import { getIcon } from '../../lib/fileIcons';

export const FirstTimeSetupModal: React.FC = () => {
    const { state, dispatch, closeModal, showToast } = useAppState();

    const [creatorName, setCreatorName] = useState('');
    const [leaguePath, setLeaguePath] = useState(state.leaguePath || '');
    const [isDetecting, setIsDetecting] = useState(false);

    const isVisible = state.activeModal === 'firstTimeSetup';

    const handleDetectLeague = async () => {
        setIsDetecting(true);
        try {
            const result = await api.detectLeague();
            if (result.path) {
                setLeaguePath(result.path);
                showToast('success', 'League installation detected!');
            }
        } catch {
            showToast('warning', 'Could not auto-detect. Please select manually.');
        } finally {
            setIsDetecting(false);
        }
    };

    const handleBrowseLeague = async () => {
        const selected = await open({
            title: 'Select League of Legends Game Folder',
            directory: true,
        });
        if (selected) {
            setLeaguePath(selected as string);
        }
    };

    const handleComplete = async () => {
        if (!creatorName.trim()) {
            showToast('warning', 'Please enter your creator name');
            return;
        }

        // Validate League path if provided
        if (leaguePath) {
            try {
                const result = await api.validateLeague(leaguePath);
                if (!result.valid) {
                    showToast('error', 'Invalid League of Legends path');
                    return;
                }
            } catch {
                showToast('error', 'Failed to validate League path');
                return;
            }
        }

        dispatch({
            type: 'SET_STATE',
            payload: {
                creatorName: creatorName.trim(),
                leaguePath: leaguePath || null,
            },
        });

        closeModal();
        showToast('success', 'Setup complete! Welcome to Flint.');
    };

    if (!isVisible) return null;

    return (
        <div className={`modal-overlay ${isVisible ? 'modal-overlay--visible' : ''}`}>
            <div className="modal">
                <div className="modal__header">
                    <h2 className="modal__title">Welcome to Flint!</h2>
                </div>

                <div className="modal__body">
                    <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                        Let's get you set up. This will only take a moment.
                    </p>

                    <div className="form-group">
                        <label className="form-label">Your Creator Name *</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="e.g., SirDexal"
                            value={creatorName}
                            onChange={(e) => setCreatorName(e.target.value)}
                        />
                        <small style={{ color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                            This will be used in your mods for proper crediting.
                        </small>
                    </div>

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
                            disabled={isDetecting}
                        >
                            <span dangerouslySetInnerHTML={{ __html: getIcon('search') }} />
                            <span>Auto-detect</span>
                        </button>
                    </div>
                </div>

                <div className="modal__footer">
                    <button className="btn btn--primary" onClick={handleComplete}>
                        Get Started
                    </button>
                </div>
            </div>
        </div>
    );
};
