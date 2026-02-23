/**
 * Flint - Settings Modal Component
 */

import React, { useState, useEffect } from 'react';
import { useAppState } from '../../lib/state';
import * as api from '../../lib/api';
import * as updater from '../../lib/updater';
import { open } from '@tauri-apps/plugin-dialog';
import { getIcon } from '../../lib/fileIcons';
import { getVersion } from '@tauri-apps/api/app';

export const SettingsModal: React.FC = () => {
    const { state, dispatch, closeModal, showToast } = useAppState();

    const [leaguePath, setLeaguePath] = useState(state.leaguePath || '');
    const [creatorName, setCreatorName] = useState(state.creatorName || '');
    const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(state.autoUpdateEnabled);
    const [isValidating, setIsValidating] = useState(false);

    // Update checker state
    const [currentVersion, setCurrentVersion] = useState<string>('');
    const [latestVersion, setLatestVersion] = useState<string | null>(null);
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState(false);

    const isVisible = state.activeModal === 'settings';

    useEffect(() => {
        if (isVisible) {
            setLeaguePath(state.leaguePath || '');
            setCreatorName(state.creatorName || '');
            setAutoUpdateEnabled(state.autoUpdateEnabled);

            // Load current version
            getVersion().then(setCurrentVersion).catch(() => setCurrentVersion('0.0.0'));
        }
    }, [isVisible, state.leaguePath, state.creatorName, state.autoUpdateEnabled]);

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

    const handleCheckForUpdates = async () => {
        setIsCheckingUpdate(true);
        setLatestVersion(null);
        setUpdateAvailable(false);

        try {
            const result = await updater.checkForUpdates();

            if (result.available && result.newVersion) {
                setLatestVersion(result.newVersion);
                setUpdateAvailable(true);
                showToast('success', `Update available: v${result.newVersion}`);
            } else {
                setLatestVersion(result.currentVersion);
                showToast('info', 'You are running the latest version');
            }
        } catch (error) {
            console.error('Update check failed:', error);
            showToast('error', 'Failed to check for updates');
        } finally {
            setIsCheckingUpdate(false);
        }
    };

    const handleUpdateNow = () => {
        if (latestVersion) {
            // Open the update modal with the available update info
            dispatch({
                type: 'OPEN_MODAL',
                payload: {
                    modal: 'updateAvailable',
                    options: {
                        available: true,
                        current_version: currentVersion,
                        latest_version: latestVersion,
                        release_notes: 'Check GitHub releases for details',
                        published_at: new Date().toISOString(),
                    } as Record<string, unknown>,
                },
            });
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
                autoUpdateEnabled,
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
                        <label className="form-label">Updates</label>

                        {/* Version Info */}
                        <div style={{
                            padding: '16px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '8px',
                            marginBottom: '12px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                        Current Version
                                    </div>
                                    <div style={{ fontSize: '18px', fontWeight: '600' }}>
                                        v{currentVersion}
                                    </div>
                                </div>

                                {latestVersion && updateAvailable && (
                                    <>
                                        <span dangerouslySetInnerHTML={{ __html: getIcon('chevronRight') }} style={{ opacity: 0.5 }} />
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '12px', color: 'var(--accent-primary)', marginBottom: '4px' }}>
                                                Latest Version
                                            </div>
                                            <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--accent-primary)' }}>
                                                v{latestVersion}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    className="btn btn--secondary"
                                    onClick={handleCheckForUpdates}
                                    disabled={isCheckingUpdate}
                                    style={{ flex: 1 }}
                                >
                                    {isCheckingUpdate ? 'Checking...' : 'Check for Updates'}
                                </button>

                                {updateAvailable && latestVersion && (
                                    <button
                                        className="btn btn--primary"
                                        onClick={handleUpdateNow}
                                        style={{ flex: 1 }}
                                    >
                                        Update Now
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Auto-update toggle */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={autoUpdateEnabled}
                                onChange={(e) => setAutoUpdateEnabled(e.target.checked)}
                                style={{ width: 'auto', margin: 0 }}
                            />
                            <span>Enable automatic update checks on startup</span>
                        </label>
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
