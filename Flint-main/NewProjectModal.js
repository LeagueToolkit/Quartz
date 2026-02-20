/**
 * Flint - New Project Modal Component
 */

import { h, showToast } from '../../lib/utils.js';
import { state, closeModal, setWorking, setReady, setError, addRecentProject } from '../../lib/state.js';
import * as api from '../../lib/api.js';
import * as datadragon from '../../lib/datadragon.js';

/**
 * Create the NewProjectModal component
 * @returns {HTMLElement}
 */
export function NewProjectModal() {
    const overlay = h('div', {
        className: 'modal-overlay',
        id: 'new-project-modal',
        onClick: (e) => { if (e.target === overlay) closeModal(); }
    });

    const modal = h('div', { className: 'modal' });

    // Header
    const header = h('div', { className: 'modal__header' },
        h('h2', { className: 'modal__title' }, 'Create New Project'),
        h('button', { className: 'modal__close', onClick: closeModal }, '✕')
    );

    // Body
    const body = h('div', { className: 'modal__body' });

    // Project Name
    body.appendChild(
        h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Project Name'),
            h('input', {
                type: 'text',
                className: 'form-input',
                id: 'project-name-input',
                placeholder: 'e.g., Ahri Base Rework'
            })
        )
    );

    // Champion Selection
    body.appendChild(
        h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Champion'),
            h('select', {
                className: 'form-select',
                id: 'champion-select'
            },
                h('option', { value: '' }, 'Loading champions...')
            )
        )
    );

    // Skin Selection
    body.appendChild(
        h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Skin'),
            h('select', {
                className: 'form-select',
                id: 'skin-select',
                disabled: true
            },
                h('option', { value: '' }, 'Select a champion first')
            )
        )
    );

    // Project Location
    body.appendChild(
        h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Project Location'),
            h('div', { className: 'form-input--with-button' },
                h('input', {
                    type: 'text',
                    className: 'form-input',
                    id: 'project-path-input',
                    placeholder: 'C:\\Users\\...\\Projects\\'
                }),
                h('button', {
                    className: 'btn btn--secondary',
                    onClick: selectProjectPath
                }, '...')
            )
        )
    );

    // Footer
    const footer = h('div', { className: 'modal__footer' },
        h('button', { className: 'btn btn--secondary', onClick: closeModal }, 'Cancel'),
        h('button', {
            className: 'btn btn--primary',
            id: 'create-project-btn',
            onClick: handleCreateProject
        }, 'Create Project')
    );

    // Loading overlay (hidden by default)
    const loadingOverlay = h('div', {
        className: 'modal__loading-overlay',
        id: 'project-loading-overlay',
        style: 'display: none;'
    },
        h('div', { className: 'modal__loading-content' },
            h('div', { className: 'spinner spinner--lg' }),
            h('div', { className: 'modal__loading-text', id: 'loading-text' }, 'Creating project...'),
            h('div', { className: 'modal__loading-progress', id: 'loading-progress' }, '')
        )
    );

    modal.append(header, body, footer, loadingOverlay);
    overlay.appendChild(modal);

    // Subscribe to modal visibility - load champions and set defaults when modal opens
    state.subscribe('activeModal', (active) => {
        if (active === 'newProject') {
            overlay.classList.add('modal-overlay--visible');
            // Load champions when modal opens (delayed to ensure DOM is ready)
            setTimeout(() => {
                loadChampions();
                setDefaultProjectPath();
            }, 50);
        } else {
            overlay.classList.remove('modal-overlay--visible');
        }
    });

    return overlay;
}

/**
 * Load champions into the dropdown
 */
async function loadChampions() {
    const championSelect = document.getElementById('champion-select');

    if (!championSelect) return;

    try {
        // Check if champions are cached in state
        let champions = state.get('champions');

        if (!state.get('championsLoaded')) {
            setWorking('Loading champions...');
            // Use CDragon API directly via fetch
            champions = await datadragon.fetchChampions();
            state.set({ champions, championsLoaded: true });
            setReady();
        }

        // Populate dropdown
        championSelect.innerHTML = '';
        championSelect.appendChild(h('option', { value: '' }, 'Select a champion...'));

        for (const champ of champions) {
            championSelect.appendChild(
                h('option', { value: champ.id, dataset: { alias: champ.alias } }, champ.name)
            );
        }

        // Add change handler
        championSelect.onchange = () => loadSkins(championSelect.value);

    } catch (error) {
        console.error('Failed to load champions:', error);
        championSelect.innerHTML = '';
        championSelect.appendChild(
            h('option', { value: '' }, 'Failed to load champions')
        );
        setError('Failed to load champions');
    }
}

/**
 * Load skins for selected champion
 * @param {string} championId 
 */
async function loadSkins(championId) {
    const skinSelect = document.getElementById('skin-select');

    if (!skinSelect) return;

    if (!championId) {
        skinSelect.innerHTML = '';
        skinSelect.appendChild(h('option', { value: '' }, 'Select a champion first'));
        skinSelect.disabled = true;
        return;
    }

    try {
        setWorking('Loading skins...');
        const skins = await datadragon.fetchChampionSkins(championId);
        setReady();

        skinSelect.innerHTML = '';
        skinSelect.disabled = false;

        for (const skin of skins) {
            skinSelect.appendChild(
                h('option', { value: skin.num }, skin.name)
            );
        }

    } catch (error) {
        console.error('Failed to load skins:', error);
        skinSelect.innerHTML = '';
        skinSelect.appendChild(h('option', { value: '' }, 'Failed to load skins'));
        setError('Failed to load skins');
    }
}

/**
 * Set default project path to AppData/RitoShark/Flint/Projects
 */
async function setDefaultProjectPath() {
    const input = document.getElementById('project-path-input');
    if (!input || input.value) return;  // Don't override if already set

    try {
        // Get APPDATA path and construct default path
        const appDataPath = await getAppDataPath();
        if (appDataPath) {
            input.value = `${appDataPath}\\RitoShark\\Flint\\Projects`;
        }
    } catch (error) {
        console.error('Failed to set default project path:', error);
    }
}

/**
 * Get APPDATA path from environment
 */
async function getAppDataPath() {
    try {
        // Try using Tauri path API
        const { appDataDir } = await import('@tauri-apps/api/path');
        const dir = await appDataDir();
        // appDataDir returns something like C:\Users\name\AppData\Roaming\app-name
        // We want C:\Users\name\AppData\Roaming
        const parts = dir.split('\\');
        parts.pop();  // Remove app name
        return parts.join('\\');
    } catch (error) {
        // Fallback - check if we have it in localStorage or environment
        console.warn('Could not get APPDATA path from Tauri:', error);
        return null;
    }
}

/**
 * Select project path via file dialog
 */
async function selectProjectPath() {
    try {
        const { open } = await import('@tauri-apps/plugin-dialog');

        const selected = await open({
            title: 'Select Project Location',
            directory: true
        });

        if (selected) {
            const input = document.getElementById('project-path-input');
            if (input) input.value = selected;
        }
    } catch (error) {
        console.error('Failed to open folder picker:', error);
    }
}

/**
 * Handle create project button click
 */
async function handleCreateProject() {
    const nameInput = document.getElementById('project-name-input');
    const championSelect = document.getElementById('champion-select');
    const skinSelect = document.getElementById('skin-select');
    const pathInput = document.getElementById('project-path-input');

    const name = nameInput?.value?.trim();
    // Get the champion alias (internal name like "Kayn") from the selected option's dataset
    const selectedOption = championSelect?.options[championSelect.selectedIndex];
    const champion = selectedOption?.dataset?.alias || championSelect?.value;
    const skin = parseInt(skinSelect?.value || '0', 10);
    const projectPath = pathInput?.value?.trim();
    const leaguePath = state.get('leaguePath');

    // Validation
    if (!name) {
        showToast('Please enter a project name', 'error');
        nameInput?.focus();
        return;
    }

    if (!champion) {
        showToast('Please select a champion', 'error');
        championSelect?.focus();
        return;
    }

    if (!projectPath) {
        showToast('Please select a project location', 'error');
        pathInput?.focus();
        return;
    }

    // Show loading overlay
    const loadingOverlay = document.getElementById('project-loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const loadingProgress = document.getElementById('loading-progress');
    const createBtn = document.getElementById('create-project-btn');

    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    if (createBtn) createBtn.disabled = true;

    const updateLoadingUI = (text, progress = '') => {
        if (loadingText) loadingText.textContent = text;
        if (loadingProgress) loadingProgress.textContent = progress;
    };

    try {
        updateLoadingUI('Creating project...', 'Extracting assets from WAD');
        setWorking('Creating project...');

        const result = await api.createProject({
            name,
            champion,
            skin,
            projectPath,
            leaguePath,
            creatorName: state.get('creatorName')
        });

        updateLoadingUI('Preparing BIN files...', 'This enables instant BIN loading later');

        // Listen for progress events
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen('bin-convert-progress', (event) => {
            const { current, total, file, status } = event.payload;
            if (status === 'converting') {
                updateLoadingUI(`Converting BIN files...`, `${current}/${total}: ${file}`);
            } else if (status === 'complete') {
                updateLoadingUI('Finalizing...', 'Almost done!');
            }
        });

        // Run pre-conversion
        try {
            await api.preconvertProjectBins(result.project_path);
        } catch (err) {
            console.warn('BIN pre-conversion had some issues:', err);
        }

        // Stop listening
        unlisten();

        // Hide loading overlay
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        if (createBtn) createBtn.disabled = false;

        setReady('Project created successfully');
        showToast('Project created successfully!', 'success');

        // Update state - use the full project object from backend
        state.set({
            currentProject: result,  // Full Project object with all fields
            currentProjectPath: result.project_path,
            currentView: 'project'
        });

        // Load the file tree for the new project
        try {
            const fileTree = await api.listProjectFiles(result.project_path);
            state.set({ fileTree });
        } catch (err) {
            console.warn('Failed to load file tree:', err);
        }

        // Add to recent
        addRecentProject(result, result.project_path);

        // Close modal
        closeModal();

    } catch (error) {
        console.error('Failed to create project:', error);

        // Hide loading overlay on error
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        if (createBtn) createBtn.disabled = false;

        setError('Failed to create project');
        showToast(error.getUserMessage?.() || 'Failed to create project', 'error');
    }
}
