/* VFX Hub — community VFX library (GitHub-backed). Faithful port of the
   Electron Quartz src/pages/vfxhub/VFXHub.js: target bin tree on the left,
   downloaded donor systems on the right, a GitHub collection browser modal
   (category filter, search, pagination, image previews, per-system download),
   drag-to-target porting, Save, and upload to the hub. Real data over the same
   GitHub repo the old app used (FrogCsLoL/VFXHub) via browser fetch; porting
   inserts the downloaded VfxSystemDefinitionData into the target .py and
   rewires its ResourceResolver. Upload pushes selected target systems back to
   the hub repo with the token from Settings → GitHub Integration. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileInput, Globe, Upload, Undo2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readBin, writeBin } from '@/lib/api';
import { useNotificationStore } from '@/lib/stores';
import githubApi, { type HubVfxSystem, type UploadSystemInput } from './vfxhub/lib/githubApi';
import { parseVfxEmitters, type DonorSystem, type HubAsset } from './vfxhub/lib/vfxEmitterParser';
import { extractVFXSystem } from './vfxhub/lib/vfxSystemParser';
import { insertVFXSystemIntoFile, addToResourceResolver } from './vfxhub/lib/vfxInsertSystem';
import './vfxhub/VfxHub.css';

const FONT = 'var(--font-mono)';
const CATEGORIES = ['All', 'Missiles', 'Auras', 'Explosions', 'Target', 'Shield', 'Buf'];
const SYSTEMS_PER_PAGE = 8;

const sectionStyle = {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '5px',
};

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shortName(path: string): string {
    return path.split('/').pop() || path;
}

interface FlatSystem extends HubVfxSystem {
    collection: string;
}

interface UndoEntry {
    action: string;
    timestamp: number;
    targetSystems: Record<string, DonorSystem>;
    targetPyContent: string;
}

function getShortUndoAction(action: string): string {
    if (!action) return 'Undo';
    if (action.startsWith('Port VFX system "')) return 'Port VFX system';
    return action.length > 48 ? `${action.slice(0, 48)}...` : action;
}

function VfxHub() {
    const notify = useNotificationStore((s) => s.push);

    // Target bin state.
    const [targetPath, setTargetPath] = useState('This will show target bin');
    const [targetPyContent, setTargetPyContent] = useState('');
    const [targetSystems, setTargetSystems] = useState<Record<string, DonorSystem>>({});
    const [hasResourceResolver, setHasResourceResolver] = useState(false);
    const [fileSaved, setFileSaved] = useState(true);
    const [targetFilter, setTargetFilter] = useState('');
    const [collapsedTarget, setCollapsedTarget] = useState<Set<string>>(new Set());
    const [undoHistory, setUndoHistory] = useState<UndoEntry[]>([]);

    // Donor (downloaded) state.
    const [donorPath, setDonorPath] = useState('VFX Hub - GitHub Collections');
    void donorPath;
    const [donorPyContent, setDonorPyContent] = useState('');
    const [donorSystems, setDonorSystems] = useState<Record<string, DonorSystem>>({});
    const [donorFilter, setDonorFilter] = useState('');
    const [collapsedDonor, setCollapsedDonor] = useState<Set<string>>(new Set());

    // Shared UI state.
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingText, setProcessingText] = useState('');
    const [statusMessage, setStatusMessage] = useState('Ready - Open target bin and browse VFX Hub');
    const [trimTargetNames, setTrimTargetNames] = useState(true);
    const [dragOverTarget, setDragOverTarget] = useState(false);

    // Collection browser modal state.
    const [showDownloadModal, setShowDownloadModal] = useState(false);
    const [allVfxSystems, setAllVfxSystems] = useState<FlatSystem[]>([]);
    const [githubConnected, setGithubConnected] = useState(false);
    const [isLoadingCollections, setIsLoadingCollections] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    const [hoveredPreview, setHoveredPreview] = useState<string | null>(null);

    // Upload modal state.
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadName, setUploadName] = useState('');
    const [uploadDescription, setUploadDescription] = useState('');
    const [uploadCollection, setUploadCollection] = useState('missilevfxs.py');
    const [uploadSelected, setUploadSelected] = useState<Set<string>>(new Set());
    const [uploadPreview, setUploadPreview] = useState<{ base64: string; ext: string } | null>(null);

    const dragPayloadRef = useRef<string | null>(null);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedCategory, showDownloadModal]);

    const toggleCollapse = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
        setter((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // --- Target bin loading -------------------------------------------------

    const processTargetBin = useCallback(async (binPath: string) => {
        setIsProcessing(true);
        setProcessingText('Loading target bin...');
        setStatusMessage(`Loading ${shortName(binPath)}...`);
        try {
            const text = await readBin(binPath);
            const systems = parseVfxEmitters(text);
            setTargetPath(binPath);
            setTargetPyContent(text);
            setTargetSystems(systems);
            setHasResourceResolver(/ResourceResolver\s*\{/.test(text));
            setFileSaved(true);
            setCollapsedTarget(new Set());
            setUndoHistory([]);
            setStatusMessage(`Loaded target: ${Object.keys(systems).length} VFX systems`);
        } catch (error) {
            setStatusMessage(`Failed to load bin: ${error instanceof Error ? error.message : String(error)}`);
            notify('error', 'Failed to load target bin');
        } finally {
            setIsProcessing(false);
            setProcessingText('');
        }
    }, [notify]);

    const handleOpenTargetBin = useCallback(async () => {
        if (isProcessing) return;
        const picked = await open({ multiple: false, filters: [{ name: 'BIN / PY', extensions: ['bin', 'py'] }] });
        if (typeof picked !== 'string') return;
        await processTargetBin(picked);
    }, [isProcessing, processTargetBin]);

    // --- GitHub collection browser -----------------------------------------

    const loadVFXCollections = useCallback(async () => {
        try {
            setIsLoadingCollections(true);
            setStatusMessage('Connecting to GitHub and loading VFX collections...');

            const connectionTest = await githubApi.testConnection();
            setGithubConnected(Boolean(connectionTest.success));
            setStatusMessage(
                connectionTest.success
                    ? 'Connected to GitHub (Public Access) - Loading collections...'
                    : `GitHub connection failed: ${connectionTest.error}`
            );

            const result = await githubApi.getVFXCollections();
            const collections = result.collections;

            const flattened: FlatSystem[] = [];
            collections.forEach((collection) => {
                collection.systems.forEach((system) => {
                    flattened.push({ ...system, collection: collection.name, category: collection.category });
                });
            });

            setAllVfxSystems(flattened);
            setGithubConnected(true);
            setStatusMessage(
                `VFX Hub loaded - ${flattened.length} effects available from ${collections.length} collections`
            );
        } catch (error) {
            setGithubConnected(false);
            setStatusMessage(`Error loading VFX Hub: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsLoadingCollections(false);
        }
    }, []);

    const handleOpenVFXHub = useCallback(async () => {
        if (isProcessing) return;
        setShowDownloadModal(true);
        setStatusMessage('Opening VFX Hub - Loading collections...');
        if (allVfxSystems.length === 0) await loadVFXCollections();
    }, [allVfxSystems.length, isProcessing, loadVFXCollections]);

    const handleRefreshCollections = useCallback(async () => {
        setStatusMessage('Refreshing VFX collections...');
        await loadVFXCollections();
    }, [loadVFXCollections]);

    const handleCloseDownloadModal = useCallback(() => {
        setShowDownloadModal(false);
        setStatusMessage('VFX Hub closed');
    }, []);

    const filteredVfxSystems = useMemo(() => {
        let filtered = allVfxSystems;
        if (selectedCategory !== 'All') {
            const re = new RegExp(`^${escapeRegex(selectedCategory)}$`, 'i');
            filtered = filtered.filter((system) => typeof system.category === 'string' && re.test(system.category));
        }
        if (searchTerm) {
            const pattern = new RegExp(escapeRegex(searchTerm), 'i');
            filtered = filtered.filter((system) => {
                const name = system.displayName || system.name || '';
                return pattern.test(name) || pattern.test(system.description || '');
            });
        }
        return filtered;
    }, [allVfxSystems, searchTerm, selectedCategory]);

    const totalPages = Math.max(1, Math.ceil(filteredVfxSystems.length / SYSTEMS_PER_PAGE));
    const paginatedSystems = useMemo(() => {
        const start = (currentPage - 1) * SYSTEMS_PER_PAGE;
        return filteredVfxSystems.slice(start, start + SYSTEMS_PER_PAGE);
    }, [filteredVfxSystems, currentPage]);

    // --- Download a system into the donor pane ------------------------------

    const downloadVFXSystem = useCallback(async (system: FlatSystem) => {
        try {
            setIsProcessing(true);
            setProcessingText('Downloading...');
            setStatusMessage(`Downloading VFX system: ${system.displayName || system.name}...`);

            const { assets, pythonContent } = await githubApi.downloadVFXSystem(
                system.name,
                `vfx collection/${system.collection}`
            );

            setStatusMessage('Parsing VFX system...');
            const parsedSystems = parseVfxEmitters(pythonContent);
            const downloadedAt = Date.now();
            const resolvedAssets: HubAsset[] = Array.isArray(assets) ? assets : [];

            const enriched: Record<string, DonorSystem> = {};
            for (const [key, value] of Object.entries(parsedSystems)) {
                enriched[key] = {
                    ...value,
                    downloaded: true,
                    downloadedAt,
                    assets: resolvedAssets,
                    collection: system.collection,
                    category: system.category,
                };
            }

            setDonorSystems(enriched);
            setDonorPyContent(pythonContent);
            setDonorPath(`VFX Hub: ${system.displayName || system.name}`);
            setCollapsedDonor(new Set());
            setStatusMessage(`VFX system loaded: ${Object.keys(enriched).length} systems available for porting`);
            setShowDownloadModal(false);
            notify('success', `Downloaded ${system.displayName || system.name}`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (/rate\s*limit/i.test(msg) || /429/.test(msg)) {
                setStatusMessage('GitHub rate limit exceeded. Please authenticate in Settings or wait a while.');
            } else {
                setStatusMessage(`Error downloading VFX system: ${msg}`);
            }
            notify('error', 'Download failed');
        } finally {
            setIsProcessing(false);
            setProcessingText('');
        }
    }, [notify]);

    // --- Port a donor system into the target --------------------------------

    const persistTarget = useCallback(async (content: string) => {
        if (!targetPath || targetPath === 'This will show target bin') return;
        try {
            await writeBin(content, targetPath);
            setFileSaved(true);
        } catch {
            /* Auto-save failed — keep the in-memory edit so the user can retry
               via the Save button. */
            setFileSaved(false);
        }
    }, [targetPath]);

    const saveStateToHistory = useCallback((action: string) => {
        const entry: UndoEntry = {
            action,
            timestamp: Date.now(),
            targetSystems: JSON.parse(JSON.stringify(targetSystems || {})),
            targetPyContent,
        };
        setUndoHistory((prev) => [...prev, entry].slice(-20));
    }, [targetSystems, targetPyContent]);

    const handleUndo = useCallback(() => {
        if (undoHistory.length === 0) {
            setStatusMessage('Nothing to undo');
            return;
        }
        const last = undoHistory[undoHistory.length - 1];
        setTargetSystems(last.targetSystems || {});
        setTargetPyContent(last.targetPyContent);
        setFileSaved(false);
        setUndoHistory((prev) => prev.slice(0, -1));
        setStatusMessage(`Undone: ${getShortUndoAction(last.action)}`);
    }, [undoHistory]);

    const portVFXSystemToTarget = useCallback(async (donorSystemKey: string) => {
        const donorSystem = donorSystems[donorSystemKey];
        if (!donorSystem) {
            setStatusMessage('Donor system not found');
            return;
        }
        setStatusMessage(`Porting VFX system: ${donorSystem.name}`);
        const prevTargetKeys = new Set(Object.keys(targetSystems || {}));

        setDonorSystems((prev) => ({
            ...prev,
            [donorSystemKey]: { ...prev[donorSystemKey], ported: true, portedAt: Date.now() },
        }));

        if (!targetPyContent) {
            setStatusMessage(`Ported system "${donorSystem.name}" (no target file to update)`);
            return;
        }
        if (!hasResourceResolver) {
            setStatusMessage('Locked: target bin missing ResourceResolver');
            return;
        }

        try {
            saveStateToHistory(`Port VFX system "${donorSystem.name}"`);

            const sourcePy = donorPyContent || donorSystem.rawContent;
            const extracted = donorPyContent ? extractVFXSystem(sourcePy, donorSystem.name) : null;

            let updatedContent: string;
            if (extracted && extracted.fullContent) {
                updatedContent = insertVFXSystemIntoFile(targetPyContent, extracted.fullContent, donorSystem.name);
            } else if (donorSystem.rawContent) {
                updatedContent = insertVFXSystemIntoFile(targetPyContent, donorSystem.rawContent, donorSystem.name);
            } else {
                updatedContent = addToResourceResolver(targetPyContent, donorSystem.name);
            }

            setTargetPyContent(updatedContent);
            const systems = parseVfxEmitters(updatedContent);
            const nowTs = Date.now();
            const entries = Object.entries(systems).map(([key, sys]) =>
                prevTargetKeys.has(key) ? [key, sys] : [key, { ...sys, ported: true, portedAt: nowTs }]
            ) as [string, DonorSystem][];
            const ordered = Object.fromEntries([
                ...entries.filter(([key]) => !prevTargetKeys.has(key)),
                ...entries.filter(([key]) => prevTargetKeys.has(key)),
            ]);
            setTargetSystems(ordered);
            await persistTarget(updatedContent);

            const assetNote = donorSystem.assets && donorSystem.assets.length > 0
                ? ` (${donorSystem.assets.length} assets referenced)`
                : '';
            setStatusMessage(`Ported complete VFX system "${donorSystem.name}" with all emitters and ResourceResolver entry${assetNote}`);
            notify('success', `Ported "${donorSystem.name}" → target`);
        } catch (error) {
            setStatusMessage(`Failed to insert VFX system "${donorSystem.name}": ${error instanceof Error ? error.message : String(error)}`);
            notify('error', 'Port failed');
        }
    }, [donorSystems, donorPyContent, hasResourceResolver, notify, persistTarget, saveStateToHistory, targetPyContent, targetSystems]);

    // --- Drag and drop ------------------------------------------------------

    const handleDragStart = (e: React.DragEvent, systemKey: string) => {
        dragPayloadRef.current = systemKey;
        e.dataTransfer.setData('text/plain', systemKey);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOverTarget(false);
        const systemKey = e.dataTransfer.getData('text/plain') || dragPayloadRef.current;
        dragPayloadRef.current = null;
        if (systemKey && donorSystems[systemKey]) portVFXSystemToTarget(systemKey);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!dragOverTarget) setDragOverTarget(true);
    };

    // --- Save ---------------------------------------------------------------

    const hasChangesToSave = useCallback(() => Boolean(targetPyContent) && !fileSaved, [targetPyContent, fileSaved]);

    const handleSave = useCallback(async () => {
        if (!targetPyContent || targetPath === 'This will show target bin') {
            setStatusMessage('No target file loaded');
            return;
        }
        setIsProcessing(true);
        setProcessingText('Saving...');
        try {
            await writeBin(targetPyContent, targetPath);
            setFileSaved(true);
            setStatusMessage(`Saved ${shortName(targetPath)}`);
            notify('success', `Saved ${shortName(targetPath)}`);
        } catch (error) {
            setStatusMessage(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
            notify('error', 'Save failed');
        } finally {
            setIsProcessing(false);
            setProcessingText('');
        }
    }, [notify, targetPath, targetPyContent]);

    const handleOpenUpload = useCallback(() => {
        if (isProcessing) return;
        if (Object.keys(targetSystems).length === 0) {
            setStatusMessage('Open a target bin first — upload pulls systems from it');
            notify('info', 'Open a target bin to upload from');
            return;
        }
        setUploadSelected(new Set());
        setShowUploadModal(true);
        setStatusMessage('Select systems to upload to the VFX Hub');
    }, [isProcessing, notify, targetSystems]);

    const handleExecuteUpload = useCallback(async () => {
        const name = uploadName.trim();
        if (!name) {
            notify('info', 'Enter an effect name');
            return;
        }
        if (uploadSelected.size === 0) {
            notify('info', 'Select at least one system');
            return;
        }

        const systems: UploadSystemInput[] = [];
        let first = true;
        for (const key of uploadSelected) {
            const sys = targetSystems[key];
            if (!sys?.rawContent) continue;
            // First selection adopts the chosen effect name; extras keep theirs.
            systems.push({ name: first ? name : (sys.particleName || sys.name || key), fullContent: sys.rawContent });
            first = false;
        }
        if (systems.length === 0) {
            notify('error', 'Selected systems have no content to upload');
            return;
        }

        setIsProcessing(true);
        setProcessingText('Uploading to VFX Hub...');
        setStatusMessage('Uploading VFX system(s) to the hub...');
        try {
            const category = uploadCollection.replace(/\.py$/i, '').toLowerCase();
            await githubApi.uploadVFXSystem(systems, uploadCollection, { name, description: uploadDescription.trim(), category });
            if (uploadPreview?.base64) {
                setProcessingText('Uploading preview...');
                await githubApi.uploadPreview(uploadPreview.base64, name, uploadPreview.ext);
            }
            setStatusMessage(`Uploaded "${name}" to ${uploadCollection}`);
            notify('success', `Uploaded "${name}" to VFX Hub`);
            setShowUploadModal(false);
            setUploadName('');
            setUploadDescription('');
            setUploadPreview(null);
            setUploadSelected(new Set());
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Upload failed: ${msg}`);
            notify('error', 'Upload failed');
        } finally {
            setIsProcessing(false);
            setProcessingText('');
        }
    }, [notify, targetSystems, uploadCollection, uploadDescription, uploadName, uploadPreview, uploadSelected]);

    // --- Derived lists ------------------------------------------------------

    const filteredTargetSystems = useMemo(() => {
        const term = targetFilter.toLowerCase();
        return Object.values(targetSystems).filter((s) => {
            if (!term) return true;
            return (s.particleName || s.name || s.key || '').toLowerCase().includes(term);
        });
    }, [targetFilter, targetSystems]);

    const filteredDonorSystems = useMemo(() => {
        const term = donorFilter.toLowerCase();
        return Object.values(donorSystems).filter((s) => {
            if (!term) return true;
            return (s.particleName || s.name || s.key || '').toLowerCase().includes(term);
        });
    }, [donorFilter, donorSystems]);

    const showTrimTargetNames = Boolean(targetPyContent);

    // --- Render -------------------------------------------------------------

    return (
        <div className="vfx-hub-container">
            {isProcessing && <ProcessingOverlay text={processingText || 'Working...'} />}

            <Toolbar
                isProcessing={isProcessing}
                isLoadingCollections={isLoadingCollections}
                onOpenTargetBin={handleOpenTargetBin}
                onOpenHub={handleOpenVFXHub}
                onUpload={handleOpenUpload}
            />

            <div className="vfx-hub-panels">
                <div
                    className="vfx-hub-pane"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={() => setDragOverTarget(false)}
                >
                    <SearchField
                        value={targetFilter}
                        onChange={setTargetFilter}
                        placeholder="Filter Selected Systems"
                        accent="var(--accent)"
                    />
                    <div
                        className="vfx-hub-section"
                        style={{ border: dragOverTarget ? '1px solid var(--accent)' : sectionStyle.border }}
                    >
                        {dragOverTarget && (
                            <div style={{
                                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', pointerEvents: 'none', zIndex: 2,
                                background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)', border: '2px dashed var(--accent)',
                                borderRadius: '8px',
                            }}>
                                <div style={{
                                    padding: '10px 16px', borderRadius: '6px', border: '1px dashed var(--accent)',
                                    color: 'var(--accent)', fontFamily: FONT, fontSize: '13px',
                                    background: 'color-mix(in oklab, var(--accent-primary) 10%, transparent)',
                                }}>
                                    Drop to add VFX system
                                </div>
                            </div>
                        )}
                        {Object.keys(targetSystems).length > 0 ? (
                            <div className="with-scrollbars">
                                <SystemList
                                    systems={filteredTargetSystems}
                                    accent="var(--accent)"
                                    collapsed={collapsedTarget}
                                    onToggle={(k) => toggleCollapse(setCollapsedTarget, k)}
                                    trim={trimTargetNames}
                                    draggable={false}
                                />
                            </div>
                        ) : (
                            <div className="vfx-hub-empty" style={{ color: 'var(--accent)' }}>No target bin loaded</div>
                        )}
                    </div>
                </div>

                <div className="vfx-hub-pane">
                    <SearchField
                        value={donorFilter}
                        onChange={setDonorFilter}
                        placeholder="Filter Downloaded VFX Systems"
                        accent="var(--accent2)"
                        right
                    />
                    <div className="vfx-hub-section">
                        {Object.keys(donorSystems).length > 0 ? (
                            <div className="with-scrollbars">
                                <SystemList
                                    systems={filteredDonorSystems}
                                    accent="var(--accent2)"
                                    collapsed={collapsedDonor}
                                    onToggle={(k) => toggleCollapse(setCollapsedDonor, k)}
                                    trim={false}
                                    draggable
                                    onDragStart={handleDragStart}
                                    onPort={portVFXSystemToTarget}
                                />
                            </div>
                        ) : (
                            <div className="vfx-hub-empty" style={{ color: 'var(--accent2)' }}>No VFX systems downloaded</div>
                        )}
                    </div>
                </div>
            </div>

            <Footer
                statusMessage={statusMessage}
                showTrimTargetNames={showTrimTargetNames}
                trimTargetNames={trimTargetNames}
                setTrimTargetNames={setTrimTargetNames}
                handleUndo={handleUndo}
                undoHistory={undoHistory}
                handleSave={handleSave}
                isProcessing={isProcessing}
                hasChangesToSave={hasChangesToSave}
            />

            <CollectionBrowser
                open={showDownloadModal}
                isProcessing={isProcessing}
                isLoadingCollections={isLoadingCollections}
                githubConnected={githubConnected}
                searchTerm={searchTerm}
                selectedCategory={selectedCategory}
                currentPage={currentPage}
                totalPages={totalPages}
                filteredSystems={filteredVfxSystems}
                paginatedSystems={paginatedSystems}
                hoveredPreview={hoveredPreview}
                onSetHoveredPreview={setHoveredPreview}
                onSearchTerm={setSearchTerm}
                onSelectedCategory={setSelectedCategory}
                onPage={setCurrentPage}
                onDownload={downloadVFXSystem}
                onRefresh={handleRefreshCollections}
                onClose={handleCloseDownloadModal}
            />

            <UploadModal
                open={showUploadModal}
                isProcessing={isProcessing}
                targetSystems={targetSystems}
                name={uploadName}
                description={uploadDescription}
                collection={uploadCollection}
                selected={uploadSelected}
                preview={uploadPreview}
                onName={setUploadName}
                onDescription={setUploadDescription}
                onCollection={setUploadCollection}
                onToggleSelected={(key, checked) => setUploadSelected((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(key); else next.delete(key);
                    return next;
                })}
                onPreview={setUploadPreview}
                onUpload={handleExecuteUpload}
                onClose={() => setShowUploadModal(false)}
            />
        </div>
    );
}

// --- Toolbar ----------------------------------------------------------------

function Toolbar({ isProcessing, isLoadingCollections, onOpenTargetBin, onOpenHub, onUpload }: {
    isProcessing: boolean;
    isLoadingCollections: boolean;
    onOpenTargetBin: () => void;
    onOpenHub: () => void;
    onUpload: () => void;
}) {
    return (
        <div className="vfx-hub-toolbar">
            <button className="dl-btn dl-btn--primary" onClick={onOpenTargetBin} disabled={isProcessing}>
                <span className="dl-icon"><FileInput size={15} /></span>
                <span>{isProcessing ? 'Processing…' : 'Open Target Bin'}</span>
            </button>
            <button className="dl-btn vfx-btn-donor" onClick={onOpenHub} disabled={isProcessing || isLoadingCollections}>
                <span className="dl-icon"><Globe size={15} /></span>
                <span>VFX Hub</span>
            </button>
            <button className="dl-btn vfx-btn-donor" onClick={onUpload} disabled={isProcessing} title="Upload VFX system to VFX Hub">
                <span className="dl-icon"><Upload size={15} /></span>
                <span>Local Hub</span>
            </button>
        </div>
    );
}

// --- Footer -----------------------------------------------------------------

function Footer({ statusMessage, showTrimTargetNames, trimTargetNames, setTrimTargetNames, handleUndo, undoHistory, handleSave, isProcessing, hasChangesToSave }: {
    statusMessage: string;
    showTrimTargetNames: boolean;
    trimTargetNames: boolean;
    setTrimTargetNames: (v: boolean) => void;
    handleUndo: () => void;
    undoHistory: UndoEntry[];
    handleSave: () => void;
    isProcessing: boolean;
    hasChangesToSave: () => boolean;
}) {
    const saveDisabled = isProcessing || !hasChangesToSave();
    const undoDisabled = undoHistory.length === 0;
    return (
        <div className="vfx-bottom-bar">
            <span className="vfx-bottom-bar__status">{statusMessage}</span>

            {showTrimTargetNames && (
                <div className="vfx-bottom-bar__trims">
                    <label>
                        <input type="checkbox" checked={trimTargetNames} onChange={(e) => setTrimTargetNames(e.target.checked)} />
                        <span>Trim Target Names</span>
                    </label>
                </div>
            )}

            <div className="vfx-bottom-bar__actions">
                <button
                    className="dl-btn dl-btn--secondary dl-btn--sm dl-btn--icon"
                    onClick={handleUndo}
                    disabled={undoDisabled}
                    title={undoHistory.length > 0 ? `Undo: ${undoHistory[undoHistory.length - 1]?.action} (${undoHistory.length})` : 'Nothing to undo'}
                >
                    <span className="dl-icon"><Undo2 size={15} /></span>
                </button>
                <button
                    className="dl-btn dl-btn--sm vfx-save-btn"
                    onClick={handleSave}
                    disabled={saveDisabled}
                    title={hasChangesToSave() ? 'Save changes to file' : 'No changes to save'}
                >
                    Save
                </button>
            </div>
        </div>
    );
}

// --- Search field -----------------------------------------------------------

function SearchField({ value, onChange, placeholder, accent, right }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    accent: string;
    right?: boolean;
}) {
    return (
        <div className="vfx-hub-search-wrap">
            <input
                className={`vfx-hub-search${right ? ' right' : ''}`}
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
            />
            <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2"
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.9, pointerEvents: 'none' }}
            >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
            </svg>
        </div>
    );
}

// --- System / emitter list --------------------------------------------------

function trimName(name: string, trim: boolean): string {
    if (!trim) return name;
    let short = name.split('/').pop() || name;
    const match = short.match(/^[A-Z][a-z]+_(Base_|Skin\d+_)/);
    if (match) short = short.substring(match[0].length);
    return short.length > 45 ? `${short.substring(0, 42)}...` : short;
}

function SystemList({ systems, accent, collapsed, onToggle, trim, draggable, onDragStart, onPort }: {
    systems: DonorSystem[];
    accent: string;
    collapsed: Set<string>;
    onToggle: (key: string) => void;
    trim: boolean;
    draggable: boolean;
    onDragStart?: (e: React.DragEvent, key: string) => void;
    onPort?: (key: string) => void;
}) {
    return (
        <div>
            {systems.map((sys) => {
                const isCollapsed = collapsed.has(sys.key);
                return (
                    <div key={sys.key}>
                        <div
                            className="vfx-sys-row"
                            draggable={draggable}
                            onDragStart={draggable && onDragStart ? (e) => onDragStart(e, sys.key) : undefined}
                            onDoubleClick={onPort ? () => onPort(sys.key) : undefined}
                            title={onPort ? 'Double-click or drag onto target to port' : undefined}
                        >
                            <button
                                onClick={() => onToggle(sys.key)}
                                style={{ background: 'transparent', border: 'none', color: accent, cursor: 'pointer', padding: 0, display: 'flex' }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                    style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.12s ease' }}>
                                    <path d="m6 9 6 6 6-6" />
                                </svg>
                            </button>
                            <span style={{ color: accent, display: 'flex' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                                    <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
                                </svg>
                            </span>
                            <span className="name">{trimName(sys.particleName || sys.name, trim)}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-2)' }}>{sys.emitters.length}</span>
                            {onPort && (
                                <button
                                    onClick={() => onPort(sys.key)}
                                    title="Port to target"
                                    style={{
                                        background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)',
                                        border: '1px solid color-mix(in oklab, var(--accent-primary) 40%, transparent)',
                                        color: 'var(--accent)', borderRadius: '4px', fontSize: '10px',
                                        padding: '2px 8px', cursor: 'pointer', fontFamily: FONT,
                                    }}
                                >
                                    Port
                                </button>
                            )}
                        </div>
                        {!isCollapsed && sys.emitters.map((em, i) => (
                            <div key={`${sys.key}-${i}`} className="vfx-emitter-row">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5 }}>
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                                </svg>
                                {em.name}
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

// --- Collection browser modal -----------------------------------------------

function CollectionBrowser({
    open: isOpen, isProcessing, isLoadingCollections, githubConnected, searchTerm, selectedCategory,
    currentPage, totalPages, filteredSystems, paginatedSystems, hoveredPreview, onSetHoveredPreview,
    onSearchTerm, onSelectedCategory, onPage, onDownload, onRefresh, onClose,
}: {
    open: boolean;
    isProcessing: boolean;
    isLoadingCollections: boolean;
    githubConnected: boolean;
    searchTerm: string;
    selectedCategory: string;
    currentPage: number;
    totalPages: number;
    filteredSystems: FlatSystem[];
    paginatedSystems: FlatSystem[];
    hoveredPreview: string | null;
    onSetHoveredPreview: (v: string | null) => void;
    onSearchTerm: (v: string) => void;
    onSelectedCategory: (v: string) => void;
    onPage: (v: number) => void;
    onDownload: (system: FlatSystem) => void;
    onRefresh: () => void;
    onClose: () => void;
}) {
    if (!isOpen) return null;

    const btnAccent: React.CSSProperties = {
        padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: FONT, fontSize: '0.75rem',
        fontWeight: 600, background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)',
        color: 'var(--accent)', border: '1px solid color-mix(in oklab, var(--accent-primary) 40%, transparent)',
    };
    const btnGhost: React.CSSProperties = {
        padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: FONT, fontSize: '0.75rem',
        fontWeight: 600, background: 'color-mix(in oklab, var(--text-primary) 5%, transparent)', color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'color-mix(in oklab, black 75%, transparent)', backdropFilter: 'blur(4px)',
        }}>
            <div style={{
                position: 'relative', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                borderRadius: 16, width: '1000px', height: '700px', maxWidth: '90vw', maxHeight: '88vh',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                backdropFilter: 'saturate(180%) blur(16px)',
                boxShadow: '0 24px 48px -16px rgba(0,0,0,.6), 0 4px 12px rgba(0,0,0,.3)',
                fontFamily: FONT,
            }}>
                <div style={{
                    height: 3, flexShrink: 0,
                    background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
                    backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite',
                }} />

                <div style={{
                    padding: '14px 20px', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text)', fontFamily: FONT }}>
                            VFX Hub Collections
                        </h2>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 4 }}>
                            {filteredSystems.length} effect{filteredSystems.length !== 1 ? 's' : ''} available
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                            onClick={onRefresh}
                            disabled={isProcessing || isLoadingCollections}
                            style={{ ...btnAccent, opacity: isProcessing || isLoadingCollections ? 0.5 : 1 }}
                        >
                            Refresh
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'flex',
                                alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)',
                                border: '1px solid var(--border)', background: 'color-mix(in oklab, var(--text-primary) 4%, transparent)', cursor: 'pointer',
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                    <input
                        value={searchTerm}
                        onChange={(e) => onSearchTerm(e.target.value)}
                        placeholder="Search by name, category, description..."
                        className="vfx-hub-search right"
                        style={{ marginBottom: 10 }}
                    />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {CATEGORIES.map((category) => {
                            const active = category === selectedCategory;
                            return (
                                <button
                                    key={category}
                                    onClick={() => onSelectedCategory(category)}
                                    style={{
                                        padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: FONT,
                                        fontSize: '0.72rem', fontWeight: active ? 700 : 600,
                                        border: active ? '1px solid color-mix(in oklab, var(--accent2) 50%, transparent)' : '1px solid var(--border)',
                                        background: active ? 'color-mix(in oklab, var(--accent2) 18%, transparent)' : 'color-mix(in oklab, var(--text-primary) 3%, transparent)',
                                        color: active ? 'var(--accent2)' : 'var(--text-secondary)',
                                    }}
                                >
                                    {category}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div style={{
                    flex: 1, padding: '14px 20px', overflowY: 'auto', display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, alignContent: 'start',
                }}>
                    {isLoadingCollections ? (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            Loading VFX collections...
                        </div>
                    ) : !githubConnected ? (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--color-danger)', fontSize: '0.82rem' }}>
                            Failed to connect
                        </div>
                    ) : filteredSystems.length === 0 ? (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            No VFX effects found
                        </div>
                    ) : (
                        paginatedSystems.map((system, index) => (
                            <CollectionItem
                                key={`${system.collection}-${system.name}-${index}`}
                                system={system}
                                isProcessing={isProcessing}
                                onDownload={onDownload}
                                onPreview={onSetHoveredPreview}
                            />
                        ))
                    )}
                </div>

                {totalPages > 1 && (
                    <div style={{
                        padding: '10px 20px', flexShrink: 0, borderTop: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <button onClick={() => onPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
                            style={{ ...btnGhost, opacity: currentPage === 1 ? 0.4 : 1 }}>Previous</button>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                                const active = page === currentPage;
                                return (
                                    <button key={page} onClick={() => onPage(page)} style={{
                                        width: 30, height: 30, borderRadius: 6, cursor: 'pointer', fontFamily: FONT,
                                        fontSize: '0.75rem', fontWeight: active ? 700 : 400,
                                        border: active ? '1px solid color-mix(in oklab, var(--accent2) 50%, transparent)' : '1px solid var(--border)',
                                        background: active ? 'color-mix(in oklab, var(--accent2) 20%, transparent)' : 'color-mix(in oklab, var(--text-primary) 2%, transparent)',
                                        color: active ? 'var(--accent2)' : 'var(--text-secondary)',
                                    }}>{page}</button>
                                );
                            })}
                        </div>
                        <button onClick={() => onPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}
                            style={{ ...btnGhost, opacity: currentPage === totalPages ? 0.4 : 1 }}>Next</button>
                    </div>
                )}
            </div>

            {hoveredPreview && (
                <>
                    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in oklab, black 80%, transparent)', zIndex: 1999 }} onClick={() => onSetHoveredPreview(null)} />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2000,
                        background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: 14,
                        maxWidth: '84vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
                        boxShadow: '0 24px 48px -16px rgba(0,0,0,.6), 0 4px 12px rgba(0,0,0,.3)', backdropFilter: 'saturate(180%) blur(16px)',
                    }}>
                        <button onClick={() => onSetHoveredPreview(null)} style={{
                            alignSelf: 'flex-end', marginBottom: 8, width: 28, height: 28, borderRadius: 8,
                            border: '1px solid var(--border)', background: 'color-mix(in oklab, var(--text-primary) 4%, transparent)',
                            cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13,
                        }}>✕</button>
                        <img
                            src={hoveredPreview}
                            alt="Full preview"
                            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 10, border: '1px solid var(--border)' }}
                            onError={() => onSetHoveredPreview(null)}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

function CollectionItem({ system, isProcessing, onDownload, onPreview }: {
    system: FlatSystem;
    isProcessing: boolean;
    onDownload: (system: FlatSystem) => void;
    onPreview: (url: string) => void;
}) {
    const cleanedDescription = system.description
        ? system.description.replace(
            new RegExp(`^${(system.displayName || system.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-:]?\\s*`, 'i'),
            ''
        )
        : '';
    return (
        <div
            draggable
            onDragStart={(e) => {
                try {
                    const payload = {
                        name: system.displayName || (system.name || '').split('/').pop() || system.name,
                        fullContent: system.fullContent || '',
                    };
                    e.dataTransfer.setData('application/x-vfxsys', JSON.stringify(payload));
                } catch {
                    // ignore drag payload failures
                }
            }}
            style={{
                background: 'linear-gradient(180deg, color-mix(in oklab, var(--text-primary) 4%, transparent), transparent)',
                border: '1px solid var(--border)', borderRadius: '12px', padding: '0.55rem',
                cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
            }}
        >
            <div
                className="vfx-preview-container"
                style={{ cursor: system.previewUrl ? 'pointer' : 'default' }}
                onClick={() => { if (system.previewUrl) onPreview(system.previewUrl); }}
            >
                {system.previewUrl ? (
                    <img
                        src={system.previewUrl}
                        alt={system.displayName || system.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                ) : (
                    <div style={{ fontSize: '2rem' }}>{system.demoVideo ? '🎬' : '✨'}</div>
                )}
            </div>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text)' }}>
                {system.displayName || system.name}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                {system.emitterCount || 0} emitters • {system.category || 'general'}
            </div>
            {cleanedDescription && (
                <div style={{
                    fontSize: '0.7rem', color: 'var(--text-2)', height: '2.4rem', overflow: 'hidden',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                    {cleanedDescription}
                </div>
            )}
            <button
                onClick={() => onDownload(system)}
                disabled={isProcessing}
                style={{
                    width: '100%', padding: '0.42rem',
                    background: isProcessing ? 'var(--bg-tertiary)' : 'color-mix(in oklab, var(--accent-primary) 11%, transparent)',
                    border: isProcessing ? '1px solid var(--border)' : '1px solid color-mix(in oklab, var(--accent-primary) 42%, transparent)',
                    color: isProcessing ? 'var(--text-secondary)' : 'var(--accent)', borderRadius: '9px',
                    cursor: isProcessing ? 'not-allowed' : 'pointer', fontFamily: FONT, fontWeight: 'bold',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}
            >
                {isProcessing ? 'Loading...' : 'Download'}
            </button>
        </div>
    );
}

// --- Upload modal -----------------------------------------------------------

const UPLOAD_COLLECTIONS: { value: string; label: string }[] = [
    { value: 'missilevfxs.py', label: 'Missiles' },
    { value: 'auravfx.py', label: 'Auras' },
    { value: 'explosionvfxs.py', label: 'Explosions' },
    { value: 'targetvfx.py', label: 'Target' },
    { value: 'shieldvfx.py', label: 'Shield' },
    { value: 'bufvfx.py', label: 'Buf' },
];

function UploadModal({
    open: isOpen, isProcessing, targetSystems, name, description, collection, selected, preview,
    onName, onDescription, onCollection, onToggleSelected, onPreview, onUpload, onClose,
}: {
    open: boolean;
    isProcessing: boolean;
    targetSystems: Record<string, DonorSystem>;
    name: string;
    description: string;
    collection: string;
    selected: Set<string>;
    preview: { base64: string; ext: string } | null;
    onName: (v: string) => void;
    onDescription: (v: string) => void;
    onCollection: (v: string) => void;
    onToggleSelected: (key: string, checked: boolean) => void;
    onPreview: (v: { base64: string; ext: string } | null) => void;
    onUpload: () => void;
    onClose: () => void;
}) {
    const [systemSearch, setSystemSearch] = useState('');
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    if (!isOpen) return null;

    const entries = Object.entries(targetSystems);
    const term = systemSearch.trim().toLowerCase();
    const visibleEntries = entries.filter(([key, sys]) => {
        const label = sys.particleName || sys.name || key;
        return !term || label.toLowerCase().includes(term);
    });
    const canUpload = !isProcessing && name.trim() !== '' && selected.size > 0;

    const readPreviewFile = (file: File) => {
        if (!String(file.type || '').startsWith('image/')) return;
        const ext = (file.name?.split('.').pop() || 'png').toLowerCase();
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : null;
            if (base64) onPreview({ base64, ext });
        };
        reader.readAsDataURL(file);
    };

    const label: React.CSSProperties = {
        fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--accent2)', fontFamily: FONT, marginBottom: 6, display: 'block',
    };
    const input: React.CSSProperties = {
        width: '100%', boxSizing: 'border-box', borderRadius: 6, border: '1px solid var(--border)',
        background: 'color-mix(in oklab, var(--bg-primary) 60%, transparent)', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text)',
        fontFamily: FONT, outline: 'none',
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
            <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, black 75%, transparent)', backdropFilter: 'blur(4px)' }} />
            <div onClick={(e) => e.stopPropagation()} style={{
                position: 'relative', zIndex: 1, width: '100%', maxWidth: 820, background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)', backdropFilter: 'saturate(180%) blur(16px)', borderRadius: 16,
                boxShadow: '0 24px 48px -16px rgba(0,0,0,.6), 0 4px 12px rgba(0,0,0,.3)', fontFamily: FONT,
            }}>
                <div style={{ borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
                    <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite' }} />
                </div>

                <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 style={{ margin: 0, fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text)', fontFamily: FONT }}>
                        Upload to VFX Hub
                    </h2>
                    <button onClick={onClose} style={{
                        width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'color-mix(in oklab, var(--text-primary) 4%, transparent)', cursor: 'pointer',
                    }}>✕</button>
                </div>

                <div style={{ padding: 22, display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
                    <div style={{ ...sectionStyle, borderRadius: 10, padding: '14px 16px' }}>
                        <span style={label}>VFX Systems</span>
                        <p style={{ margin: '0 0 10px 0', fontSize: '0.68rem', color: 'var(--text-muted)' }}>Select from target bin</p>
                        <input value={systemSearch} onChange={(e) => setSystemSearch(e.target.value)} placeholder="Search systems..." style={{ ...input, marginBottom: 8 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                            {visibleEntries.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', padding: '2.5rem 0' }}>
                                    No systems in target bin
                                </div>
                            ) : (
                                visibleEntries.map(([key, sys]) => {
                                    const systemLabel = sys.particleName || sys.name || key;
                                    const checked = selected.has(key);
                                    return (
                                        <label key={key} style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                                            border: '1px solid', borderColor: checked ? 'color-mix(in oklab, var(--accent-primary) 45%, transparent)' : 'var(--border)',
                                            background: checked ? 'color-mix(in oklab, var(--accent-primary) 15%, transparent)' : 'color-mix(in oklab, var(--text-primary) 2%, transparent)',
                                        }}>
                                            <input type="checkbox" checked={checked} onChange={(e) => onToggleSelected(key, e.target.checked)} style={{ width: 13, height: 13, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{systemLabel}</div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{sys.emitters?.length || 0} emitters</div>
                                            </div>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ ...sectionStyle, borderRadius: 10, padding: '14px 16px' }}>
                            <span style={label}>Collection</span>
                            <select value={collection} onChange={(e) => onCollection(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                                {UPLOAD_COLLECTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value} style={{ background: 'var(--bg-secondary)' }}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ ...sectionStyle, borderRadius: 10, padding: '14px 16px' }}>
                            <span style={label}>Effect Name</span>
                            <input value={name} onChange={(e) => onName(e.target.value)} placeholder="MyCustomVFX" style={input} />
                        </div>

                        <div style={{ ...sectionStyle, borderRadius: 10, padding: '14px 16px' }}>
                            <span style={label}>Description</span>
                            <textarea value={description} onChange={(e) => onDescription(e.target.value)} placeholder="Custom VFX effect with particles…" style={{ ...input, height: 70, resize: 'vertical' }} />
                        </div>

                        <div style={{ ...sectionStyle, borderRadius: 10, padding: '14px 16px' }}>
                            <span style={label}>Preview (optional)</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) readPreviewFile(f); }}
                                    style={{
                                        width: 72, height: 72, borderRadius: 8, border: '1px dashed var(--border-strong)', overflow: 'hidden',
                                        background: 'color-mix(in oklab, var(--text-primary) 3%, transparent)', color: 'var(--text-secondary)', fontSize: '10px', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 6, cursor: 'pointer', flexShrink: 0,
                                    }}
                                    title="Drag/drop or click to select image/gif"
                                >
                                    {preview ? (
                                        <img src={`data:image/${preview.ext};base64,${preview.base64}`} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : 'Drop/Click'}
                                    <input ref={fileInputRef} type="file" accept="image/*,.gif" onChange={(e) => { const f = e.target.files?.[0]; if (f) readPreviewFile(f); e.target.value = ''; }} style={{ display: 'none' }} />
                                </div>
                                {preview && (
                                    <button onClick={() => onPreview(null)} style={{
                                        padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: FONT, fontSize: '0.72rem',
                                        background: 'color-mix(in oklab, var(--text-primary) 5%, transparent)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
                                    }}>Remove</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', borderRadius: '0 0 16px 16px' }}>
                    <button onClick={onClose} style={{
                        padding: '7px 18px', borderRadius: 6, cursor: 'pointer', fontFamily: FONT, fontSize: '0.75rem', fontWeight: 600,
                        background: 'color-mix(in oklab, var(--text-primary) 5%, transparent)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
                    }}>Cancel</button>
                    <button onClick={onUpload} disabled={!canUpload} style={{
                        padding: '7px 18px', borderRadius: 6, cursor: canUpload ? 'pointer' : 'not-allowed', fontFamily: FONT, fontSize: '0.75rem', fontWeight: 600,
                        background: 'color-mix(in oklab, var(--accent-primary) 20%, transparent)', color: 'var(--accent)',
                        border: '1px solid color-mix(in oklab, var(--accent-primary) 40%, transparent)', opacity: canUpload ? 1 : 0.5,
                    }}>{isProcessing ? 'Uploading…' : 'Upload to VFX Hub'}</button>
                </div>
            </div>
        </div>
    );
}

// --- Processing overlay -----------------------------------------------------

function ProcessingOverlay({ text }: { text: string }) {
    return (
        <div style={{
            position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16,
            background: 'color-mix(in oklab, black 55%, transparent)', backdropFilter: 'blur(2px)',
        }}>
            <div style={{
                width: 44, height: 44, borderRadius: '50%',
                border: '3px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)',
                borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ color: 'var(--accent)', fontFamily: FONT, fontSize: 13 }}>{text}</div>
            <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
        </div>
    );
}

export { VfxHub };
export default VfxHub;
