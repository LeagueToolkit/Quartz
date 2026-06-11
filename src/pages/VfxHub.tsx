/* VFX Hub — community VFX library (GitHub-backed). Faithful port of the
   Electron Quartz src/pages/vfxhub/VFXHub.js: target bin tree on the left,
   downloaded donor systems on the right, a GitHub collection browser modal
   (category filter, search, pagination, image previews, per-system download),
   drag-to-target porting, and Save. Real data over the same GitHub repo the
   old app used (FrogCsLoL/VFXHub) via browser fetch; porting inserts the
   downloaded VfxSystemDefinitionData into the target .py and rewires its
   ResourceResolver. Upload's GitHub push step is // TODO(backend). */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readBin, writeBin } from '@/lib/api';
import { useNotificationStore } from '@/lib/stores';
import githubApi, { type HubVfxSystem } from './vfxhub/lib/githubApi';
import { parseVfxEmitters, type DonorSystem, type HubAsset } from './vfxhub/lib/vfxEmitterParser';
import { extractVFXSystem } from './vfxhub/lib/vfxSystemParser';
import { insertVFXSystemIntoFile, addToResourceResolver } from './vfxhub/lib/vfxInsertSystem';
import './vfxhub/VfxHub.css';

const FONT = 'JetBrains Mono, monospace';
const CATEGORIES = ['All', 'Missiles', 'Auras', 'Explosions', 'Target', 'Shield', 'Buf'];
const SYSTEMS_PER_PAGE = 8;

const sectionStyle = {
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.06)',
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
            // TODO(backend): write_bin not available — keep in-memory edit.
            setFileSaved(false);
        }
    }, [targetPath]);

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
    }, [donorSystems, donorPyContent, hasResourceResolver, notify, persistTarget, targetPyContent, targetSystems]);

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

    const handleLocalHub = useCallback(() => {
        // TODO(backend): Local Hub + GitHub upload need a token / native file walk.
        setStatusMessage('Local Hub upload is not available yet in this build');
        notify('info', 'Local Hub / upload deferred (backend)');
    }, [notify]);

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
                onUpload={handleLocalHub}
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
                                background: 'rgba(139, 92, 246, 0.15)', border: '2px dashed var(--accent)',
                                borderRadius: '8px',
                            }}>
                                <div style={{
                                    padding: '10px 16px', borderRadius: '6px', border: '1px dashed var(--accent)',
                                    color: 'var(--accent)', fontFamily: FONT, fontSize: '13px',
                                    background: 'color-mix(in srgb, var(--accent), transparent 90%)',
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
    const base: React.CSSProperties = {
        flex: 1, padding: '0 16px', fontFamily: FONT, fontSize: '13px', fontWeight: 700,
        height: '36px', borderRadius: '4px', letterSpacing: '0.05em', textTransform: 'uppercase',
        cursor: 'pointer',
    };
    return (
        <div style={{ display: 'flex', gap: '8px', padding: '12px 12px 8px', position: 'relative', zIndex: 1 }}>
            <button
                onClick={onOpenTargetBin}
                disabled={isProcessing}
                style={{
                    ...base,
                    background: 'color-mix(in srgb, var(--accent), var(--bg) 85%)',
                    border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
                    color: 'var(--accent)', opacity: isProcessing ? 0.5 : 1,
                }}
            >
                {isProcessing ? 'Processing...' : 'Open Target Bin'}
            </button>
            <button
                onClick={onOpenHub}
                disabled={isProcessing || isLoadingCollections}
                style={{
                    ...base,
                    background: 'color-mix(in srgb, var(--accent2), var(--bg) 85%)',
                    border: '1px solid color-mix(in srgb, var(--accent2), transparent 70%)',
                    color: 'var(--accent2)', opacity: isProcessing || isLoadingCollections ? 0.5 : 1,
                }}
            >
                VFX Hub
            </button>
            <button
                onClick={onUpload}
                disabled={isProcessing}
                title="Upload VFX system to VFX Hub"
                style={{
                    ...base,
                    background: 'color-mix(in srgb, var(--accent2), var(--bg) 85%)',
                    border: '1px solid color-mix(in srgb, var(--accent2), transparent 70%)',
                    color: 'var(--accent2)', opacity: isProcessing ? 0.5 : 1,
                }}
            >
                Local Hub
            </button>
        </div>
    );
}

// --- Footer -----------------------------------------------------------------

function Footer({ statusMessage, showTrimTargetNames, trimTargetNames, setTrimTargetNames, handleSave, isProcessing, hasChangesToSave }: {
    statusMessage: string;
    showTrimTargetNames: boolean;
    trimTargetNames: boolean;
    setTrimTargetNames: (v: boolean) => void;
    handleSave: () => void;
    isProcessing: boolean;
    hasChangesToSave: () => boolean;
}) {
    const saveDisabled = isProcessing || !hasChangesToSave();
    return (
        <>
            <div style={{
                padding: '6px 20px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', color: 'var(--accent)',
                fontFamily: FONT, fontSize: '12px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: '20px',
            }}>
                <span style={{ flex: 1 }}>{statusMessage}</span>
                {showTrimTargetNames && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
                        <input type="checkbox" checked={trimTargetNames} onChange={(e) => setTrimTargetNames(e.target.checked)} />
                        <span>Trim Target Names</span>
                    </label>
                )}
            </div>
            <div style={{ display: 'flex', gap: '12px', padding: '12px 20px' }}>
                <button
                    onClick={handleSave}
                    disabled={saveDisabled}
                    title={hasChangesToSave() ? 'Save changes to file' : 'No changes to save'}
                    style={{
                        flex: 1, padding: '0 16px', fontFamily: FONT, fontSize: '13px', fontWeight: 700,
                        height: '36px', background: 'color-mix(in srgb, #22c55e, var(--bg) 85%)',
                        border: '1px solid rgba(34, 197, 94, 0.3)', color: '#22c55e', borderRadius: '4px',
                        letterSpacing: '0.05em', textTransform: 'uppercase', cursor: saveDisabled ? 'not-allowed' : 'pointer',
                        opacity: saveDisabled ? 0.5 : 1,
                    }}
                >
                    Save
                </button>
            </div>
        </>
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
                                        background: 'color-mix(in srgb, var(--accent), transparent 85%)',
                                        border: '1px solid color-mix(in srgb, var(--accent), transparent 60%)',
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
        fontWeight: 600, background: 'color-mix(in srgb, var(--accent), transparent 85%)',
        color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent), transparent 60%)',
    };
    const btnGhost: React.CSSProperties = {
        padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: FONT, fontSize: '0.75rem',
        fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.75)',
        border: '1px solid rgba(255,255,255,0.12)',
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        }}>
            <div style={{
                position: 'relative', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                borderRadius: 16, width: '1000px', height: '700px', maxWidth: '90vw', maxHeight: '88vh',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                backdropFilter: 'saturate(180%) blur(16px)',
                boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 40px color-mix(in srgb, var(--accent2), transparent 82%)',
                fontFamily: FONT,
            }}>
                <div style={{
                    height: 3, flexShrink: 0,
                    background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
                    backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite',
                }} />

                <div style={{
                    padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text)', fontFamily: FONT }}>
                            VFX Hub Collections
                        </h2>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.68rem', marginTop: 4 }}>
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
                                alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'rgba(255,255,255,0.5)',
                                border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
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
                                        border: active ? '1px solid color-mix(in srgb, var(--accent2), transparent 50%)' : '1px solid rgba(255,255,255,0.08)',
                                        background: active ? 'color-mix(in srgb, var(--accent2), transparent 82%)' : 'rgba(255,255,255,0.03)',
                                        color: active ? 'var(--accent2)' : 'rgba(255,255,255,0.65)',
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
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>
                            Loading VFX collections...
                        </div>
                    ) : !githubConnected ? (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: '#f87171', fontSize: '0.82rem' }}>
                            Failed to connect
                        </div>
                    ) : filteredSystems.length === 0 ? (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>
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
                        padding: '10px 20px', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.07)',
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
                                        border: active ? '1px solid color-mix(in srgb, var(--accent2), transparent 50%)' : '1px solid rgba(255,255,255,0.1)',
                                        background: active ? 'color-mix(in srgb, var(--accent2), transparent 80%)' : 'rgba(255,255,255,0.02)',
                                        color: active ? 'var(--accent2)' : 'rgba(255,255,255,0.65)',
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
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1999 }} onClick={() => onSetHoveredPreview(null)} />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2000,
                        background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: 14,
                        maxWidth: '84vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
                        boxShadow: '0 30px 70px rgba(0,0,0,0.65)', backdropFilter: 'saturate(180%) blur(16px)',
                    }}>
                        <button onClick={() => onSetHoveredPreview(null)} style={{
                            alignSelf: 'flex-end', marginBottom: 8, width: 28, height: 28, borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
                            cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 13,
                        }}>✕</button>
                        <img
                            src={hoveredPreview}
                            alt="Full preview"
                            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}
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
                background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '0.55rem',
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
                    background: isProcessing ? 'rgba(160,160,160,0.12)' : 'color-mix(in srgb, var(--accent) 11%, transparent)',
                    border: isProcessing ? '1px solid rgba(200,200,200,0.2)' : '1px solid color-mix(in srgb, var(--accent) 42%, transparent)',
                    color: isProcessing ? '#ccc' : 'var(--accent)', borderRadius: '9px',
                    cursor: isProcessing ? 'not-allowed' : 'pointer', fontFamily: FONT, fontWeight: 'bold',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}
            >
                {isProcessing ? 'Loading...' : 'Download'}
            </button>
        </div>
    );
}

// --- Processing overlay -----------------------------------------------------

function ProcessingOverlay({ text }: { text: string }) {
    return (
        <div style={{
            position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        }}>
            <div style={{
                width: 44, height: 44, borderRadius: '50%',
                border: '3px solid color-mix(in srgb, var(--accent), transparent 70%)',
                borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ color: 'var(--accent)', fontFamily: FONT, fontSize: 13 }}>{text}</div>
            <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
        </div>
    );
}

export { VfxHub };
export default VfxHub;
