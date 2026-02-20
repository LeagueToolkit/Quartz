import { useEffect } from 'react';

export function useBnkCodebookLoader({ codebookDataRef, setStatusMessage }) {
    useEffect(() => {
        const loadCodebook = async () => {
            console.log('[BnkExtract] Loading codebook...');

            try {
                if (window.require) {
                    const fs = window.require('fs');
                    const path = window.require('path');

                    let resourcesPath = null;
                    try {
                        const { ipcRenderer } = window.require('electron');
                        const resourcesPathResult = await ipcRenderer.invoke('getResourcesPath');
                        if (resourcesPathResult) {
                            resourcesPath = resourcesPathResult;
                        } else {
                            const appPathResult = await ipcRenderer.invoke('getAppPath');
                            if (appPathResult) {
                                resourcesPath = path.join(appPathResult, '..', 'resources');
                            }
                        }
                    } catch (error) {
                        console.log('[BnkExtract] Could not get resources path via IPC:', error);
                    }

                    const possiblePaths = [
                        resourcesPath ? path.join(resourcesPath, 'codebook.bin') : null,
                    ].filter((entry) => entry !== null);

                    console.log('[BnkExtract] Checking resources folder for codebook.bin, resourcesPath:', resourcesPath);

                    for (const codebookPath of possiblePaths) {
                        try {
                            if (fs.existsSync(codebookPath)) {
                                const data = fs.readFileSync(codebookPath);
                                codebookDataRef.current = new Uint8Array(data);
                                console.log('[BnkExtract] Loaded codebook from:', codebookPath, 'size:', data.length);
                                setStatusMessage('Codebook loaded - ready');
                                return;
                            }
                        } catch (_) {
                            // Try next path.
                        }
                    }

                    console.log('[BnkExtract] No codebook found in resources folder');
                    console.warn('[BnkExtract] Could not load codebook from resources folder - audio playback will not work');
                    setStatusMessage('Warning: Codebook not found in resources - audio playback disabled');
                } else {
                    console.warn('[BnkExtract] Could not load codebook - window.require not available');
                    setStatusMessage('Warning: Codebook not found - audio playback disabled');
                }
            } catch (error) {
                console.warn('[BnkExtract] Could not load codebook:', error);
                setStatusMessage('Warning: Codebook load error');
            }
        };

        loadCodebook();
    }, [codebookDataRef, setStatusMessage]);
}
