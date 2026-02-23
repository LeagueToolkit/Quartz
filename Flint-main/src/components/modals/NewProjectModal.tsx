/**
 * Flint - New Project Modal Component
 * 
 * Uses DataDragon/CommunityDragon API for champion/skin selection
 */

import React, { useState, useEffect } from 'react';
import { useAppState } from '../../lib/state';
import * as api from '../../lib/api';
import * as datadragon from '../../lib/datadragon';
import { appDataDir } from '@tauri-apps/api/path';
import type { DDragonChampion, DDragonSkin } from '../../lib/datadragon';

export const NewProjectModal: React.FC = () => {
    const { state, dispatch, closeModal, showToast, setWorking, setReady } = useAppState();

    const [projectName, setProjectName] = useState('');
    const [projectPath, setProjectPath] = useState('');
    const [selectedChampion, setSelectedChampion] = useState<DDragonChampion | null>(null);
    const [selectedSkin, setSelectedSkin] = useState<DDragonSkin | null>(null);
    const [champions, setChampions] = useState<DDragonChampion[]>([]);
    const [skins, setSkins] = useState<DDragonSkin[]>([]);
    const [championSearch, setChampionSearch] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [progress, setProgress] = useState('');

    const isVisible = state.activeModal === 'newProject';

    // Set default project path when modal opens
    useEffect(() => {
        if (isVisible && !projectPath) {
            setDefaultProjectPath();
        }
    }, [isVisible]);

    // Load champions when modal opens
    useEffect(() => {
        if (isVisible) {
            loadChampions();
        }
    }, [isVisible]);

    // Load skins when champion changes
    useEffect(() => {
        if (selectedChampion) {
            loadSkins(selectedChampion.id);
        } else {
            setSkins([]);
            setSelectedSkin(null);
        }
    }, [selectedChampion]);

    /**
     * Set default project path to AppData/RitoShark/Flint/Projects
     */
    const setDefaultProjectPath = async () => {
        try {
            const dir = await appDataDir();
            // appDataDir returns {app name} folder, go up one level
            const parts = dir.replace(/\\/g, '/').split('/');
            parts.pop(); // Remove app name folder
            const appData = parts.join('/');
            setProjectPath(`${appData}/RitoShark/Flint/Projects`);
        } catch (error) {
            console.error('Failed to set default project path:', error);
            // Fallback to Documents
            setProjectPath('C:/Users/Projects/Flint');
        }
    };

    /**
     * Load champions from DataDragon
     */
    const loadChampions = async () => {
        try {
            setWorking('Loading champions...');
            const result = await datadragon.fetchChampions();
            setChampions(result);
            setReady();
        } catch (err) {
            console.error('Failed to load champions:', err);
            showToast('error', 'Failed to load champions from DataDragon');
            setReady();
        }
    };

    /**
     * Load skins for selected champion from DataDragon
     */
    const loadSkins = async (championId: number) => {
        try {
            setWorking('Loading skins...');
            const result = await datadragon.fetchChampionSkins(championId);
            setSkins(result);
            // Auto-select base skin
            const baseSkin = result.find(s => s.isBase) || result[0];
            setSelectedSkin(baseSkin);
            setReady();
        } catch (err) {
            console.error('Failed to load skins:', err);
            setSkins([{ id: 0, name: 'Base', num: 0, isBase: true }]);
            setSelectedSkin({ id: 0, name: 'Base', num: 0, isBase: true });
            setReady();
        }
    };

    /**
     * Handle browse for project path
     */
    const handleBrowsePath = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                title: 'Select Project Location',
                directory: true,
            });
            if (selected) {
                setProjectPath(selected as string);
            }
        } catch (error) {
            console.error('Failed to open folder picker:', error);
        }
    };

    /**
     * Handle create project
     */
    const handleCreate = async () => {
        if (!projectName || !projectPath || !selectedChampion || !selectedSkin || !state.leaguePath) {
            showToast('error', 'Please fill in all required fields');
            return;
        }

        setIsCreating(true);
        setProgress('Creating project...');

        try {
            // Use champion alias (internal name) for WAD extraction
            const project = await api.createProject({
                name: projectName,
                champion: selectedChampion.alias,  // Use alias for WAD paths
                skin: selectedSkin.num,  // Use skin num (last 3 digits of ID)
                projectPath,
                leaguePath: state.leaguePath,
                creatorName: state.creatorName || undefined,
            });

            setProgress('Opening project...');

            // Use project_path from the returned project
            const projectDir = project.project_path || projectPath;

            dispatch({ type: 'SET_PROJECT', payload: { project, path: projectDir } });

            const files = await api.listProjectFiles(projectDir);
            dispatch({ type: 'SET_FILE_TREE', payload: files });

            // Add to recent
            const recent = state.recentProjects.filter(p => p.path !== projectDir);
            recent.unshift({
                name: project.display_name || project.name,
                champion: selectedChampion.name,  // Display name for recent list
                skin: selectedSkin.num,
                path: projectDir,
                lastOpened: new Date().toISOString(),
            });
            dispatch({ type: 'SET_RECENT_PROJECTS', payload: recent.slice(0, 10) });

            closeModal();
            showToast('success', 'Project created successfully!');

            // Initial auto-checkpoint
            api.createCheckpoint(projectDir, 'Initial Project State').catch(e => {
                console.warn('Initial checkpoint failed:', e);
            });

        } catch (err) {
            console.error('Failed to create project:', err);
            const flintError = err as api.FlintError;
            showToast('error', flintError.getUserMessage?.() || 'Failed to create project');
        } finally {
            setIsCreating(false);
            setProgress('');
        }
    };

    // Filter champions by search
    const filteredChampions = championSearch
        ? champions.filter(c => c.name.toLowerCase().includes(championSearch.toLowerCase()))
        : champions;

    if (!isVisible) return null;

    return (
        <div className={`modal-overlay ${isVisible ? 'modal-overlay--visible' : ''}`}>
            <div className="modal modal--wide">
                {isCreating && (
                    <div className="modal__loading-overlay">
                        <div className="modal__loading-content">
                            <div className="spinner spinner--lg" />
                            <div className="modal__loading-text">Creating Project</div>
                            <div className="modal__loading-progress">{progress}</div>
                        </div>
                    </div>
                )}

                <div className="modal__header">
                    <h2 className="modal__title">Create New Project</h2>
                    <button className="modal__close" onClick={closeModal}>×</button>
                </div>

                <div className="modal__body">
                    <div className="form-group">
                        <label className="form-label">Project Name</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="e.g., Ahri Base Rework"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Project Location</label>
                        <div className="form-input--with-button">
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Select folder..."
                                value={projectPath}
                                onChange={(e) => setProjectPath(e.target.value)}
                            />
                            <button className="btn btn--secondary" onClick={handleBrowsePath}>
                                Browse
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Champion</label>
                        <input
                            type="text"
                            className="form-input form-input--search"
                            placeholder="Search champions..."
                            value={championSearch}
                            onChange={(e) => setChampionSearch(e.target.value)}
                        />
                        <div className="champion-grid">
                            {filteredChampions.map((champ) => (
                                <div
                                    key={champ.id}
                                    className={`champion-card ${selectedChampion?.id === champ.id ? 'champion-card--selected' : ''}`}
                                    onClick={() => {
                                        setSelectedChampion(champ);
                                        setChampionSearch('');
                                    }}
                                    title={champ.name}
                                >
                                    <img
                                        src={datadragon.getChampionIconUrl(champ.id)}
                                        alt={champ.name}
                                        className="champion-card__icon"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                    <span className="champion-card__name">{champ.name}</span>
                                </div>
                            ))}
                        </div>
                        {selectedChampion && (
                            <div className="form-hint">Selected: {selectedChampion.name}</div>
                        )}
                    </div>

                    {selectedChampion && (
                        <div className="form-group">
                            <label className="form-label">Skin</label>
                            <div className="skin-grid">
                                {skins.map((skin) => (
                                    <div
                                        key={skin.id}
                                        className={`skin-card ${selectedSkin?.id === skin.id ? 'skin-card--selected' : ''}`}
                                        onClick={() => setSelectedSkin(skin)}
                                    >
                                        <img
                                            src={datadragon.getSkinSplashUrl(selectedChampion.alias, skin.num)}
                                            alt={skin.name}
                                            className="skin-card__splash"
                                            onError={(e) => {
                                                // Fallback to CommunityDragon
                                                (e.target as HTMLImageElement).src =
                                                    datadragon.getSkinSplashCDragonUrl(selectedChampion.id, skin.id);
                                            }}
                                        />
                                        <span className="skin-card__name">{skin.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal__footer">
                    <button className="btn btn--secondary" onClick={closeModal}>
                        Cancel
                    </button>
                    <button
                        className="btn btn--primary"
                        onClick={handleCreate}
                        disabled={!projectName || !projectPath || !selectedChampion || !selectedSkin || isCreating}
                    >
                        Create Project
                    </button>
                </div>
            </div>
        </div>
    );
};
