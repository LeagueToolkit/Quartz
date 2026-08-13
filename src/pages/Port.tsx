import { useCallback, useEffect, useMemo, useState } from 'react';
import './port/Port.css';
import usePort from './port/usePort';
import { PortDragProvider, type PortDragPayload } from './port/usePortDrag';
import type { VfxEmitter, VfxSystem, VfxPath } from './port/model';
import {
    showTexturePreview,
    scheduleTexturePreviewClose,
    closeTexturePreview,
    openTexturePreviewContextMenu,
    type PreviewTexture,
} from '@/lib/util/texturePreview';
import { getLeaguePath } from '@/lib/api/league';
import { readBin, writeBin } from '@/lib/api';
import { vfxModel } from '@/lib/api/vfxSession';
import { log } from '@/lib/util/logger';
import { useUiPrefsStore, useNavigationStore } from '@/lib/stores';
import { portPrepareDonorFromSkin, backupCreate, portCleanupDonorTemp } from '@/lib/api/wad';
import TargetColumn from './port/components/TargetColumn';
import DonorColumn from './port/components/DonorColumn';
import PortBottomControls, { type PortActionButton } from './port/components/PortBottomControls';
import {
    Apps as AppsIcon,
    BubbleChart as BubbleChartIcon,
    Add as AddIcon,
    Folder as FolderIcon,
    ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import NewVfxSystemModal from './port/components/modals/NewVfxSystemModal';
import VfxSystemNamePromptModal from './port/components/modals/VfxSystemNamePromptModal';
import PortAllModeModal from './port/components/modals/PortAllModeModal';
import MatrixEditorModal from './port/components/modals/MatrixEditorModal';
import IdleParticleModal from './port/components/modals/IdleParticleModal';
import IdleParticlesManagerModal from './port/components/modals/IdleParticlesManagerModal';
import ChildParticleModal from './port/components/modals/ChildParticleModal';
import PersistentEffectsModal from './port/components/modals/PersistentEffectsModal';
import PortDonorFromGameModal from './port/components/modals/PortDonorFromGameModal';
import BackupViewerModal from './port/components/modals/BackupViewerModal';
import { HubBrowserModal } from './port/components/modals/hub/HubBrowserModal';
import { HubUploadModal, type UploadableSystem } from './port/components/modals/hub/HubUploadModal';
import { useHubDonor } from './port/components/modals/hub/useHubDonor';
import { parseCompleteVFXSystems } from './vfxhub/lib/vfxSystemParser';
import { useJadeBin } from '@/lib/jade/jadeInterop';
import { useAnmMode } from './port/anm/useAnmMode';
import ClipList from './port/anm/components/ClipList';
import { AnmEditProvider } from './port/anm/components/AnmEditContext';
import { filterClips } from './port/anm/filterClips';
import type { PortClipResult } from '@/lib/api/vfxAnm';

function Port() {
    const p = usePort();

    /* Animation view. Reads the SAME resident sessions Port already holds - the
       animation bin arrives as one of the skin's linked bins - so toggling costs
       a projection, not a reload. */
    const anm = useAnmMode({
        targetSessionId: p.targetSessionId,
        donorSessionId: p.donorSessionId,
    });
    /* An animation edit dirties the target bin exactly as a VFX edit does, so it
       has to clear the same `fileSaved` flag the Save button gates on. Only the
       TARGET side: the donor is never written. */
    const setFileSaved = p.setFileSaved;
    const markAnmDirty = useCallback(() => setFileSaved(false), [setFileSaved]);

    /* A ported clip carries the same kind of donor assets a ported VFX system
       does (its `.anm`, plus the textures of the systems that came with it), so
       it reuses the VFX side's copier rather than a second implementation.
       Unresolved effect keys are surfaced rather than swallowed: those
       particles will not play until they are fixed, and silently porting a clip
       that half-works is worse than saying so. */
    const { copyDonorAssets, setStatusMessage, applyTargetModel, targetSessionId } = p;
    const handleAnmPorted = useCallback(
        (result: PortClipResult) => {
            setFileSaved(false);
            anm.publishTarget(result.model);
            if (result.assetPaths.length > 0) void copyDonorAssets(result.assetPaths);

            /* A clip port writes VFX systems into the session too, but the
               command answers with the ANM projection only. The VFX list is
               built from a SEPARATE model, so without this re-read the systems
               that "came along" existed in the bin and saved correctly while the
               VFX side of the page kept showing the pre-port list.

               Unconditional rather than gated on `portedSystems`: the reprojection
               is a cheap read of trees already in memory, and gating it on a
               non-empty list would make the correctness of the view depend on
               exactly which systems the installer chose to skip. */
            if (targetSessionId !== null) {
                void vfxModel(targetSessionId)
                    .then(applyTargetModel)
                    .catch((e) => log.error('[anm] vfx model refresh after port', e));
            }

            const parts: string[] = [];
            if (result.portedSystems.length > 0) {
                parts.push(`${result.portedSystems.length} VFX system(s) came along`);
            }
            if (result.unresolvedEffectKeys.length > 0) {
                parts.push(
                    `${result.unresolvedEffectKeys.length} effect key(s) had no VFX system: ${result.unresolvedEffectKeys.join(', ')}`,
                );
            }
            setStatusMessage(parts.length > 0 ? `Ported. ${parts.join('. ')}` : 'Ported.');
        },
        [setFileSaved, anm, copyDonorAssets, setStatusMessage, applyTargetModel, targetSessionId],
    );

    /* The column search boxes are shared by both modes, so ANM reuses the same
       filter state the VFX list uses instead of adding a second input the user
       would have to notice. */
    const filteredTargetClips = useMemo(
        () => filterClips(anm.targetClips, p.targetFilter),
        [anm.targetClips, p.targetFilter],
    );
    const filteredDonorClips = useMemo(
        () => filterClips(anm.donorClips, p.donorFilter),
        [anm.donorClips, p.donorFilter],
    );

    /* Row keys per column, so a drop target resolves from a key without every
       card carrying the whole list. Memoised on the clips themselves: rebuilding
       the array each render would give the edit context a new identity and
       re-render every card in the column.

       Keyed off the UNFILTERED list on purpose: a drop target that vanished
       because of an active search is still a real clip, and resolving a move
       against the filtered view would reject it. */
    const targetClipKeys = useMemo(() => anm.targetClips.map((c) => c.key), [anm.targetClips]);
    const donorClipKeys = useMemo(() => anm.donorClips.map((c) => c.key), [anm.donorClips]);

    /* Which clips are OPEN. Tracked as expanded rather than collapsed so every
       clip starts shut - a bin holds 100+ and opening them all buries the list.
       View-local: clip keys and VFX system keys share no namespace. */
    const [expandedTargetClips, setExpandedTargetClips] = useState<Set<string>>(new Set());
    const [expandedDonorClips, setExpandedDonorClips] = useState<Set<string>>(new Set());
    const toggleTargetClip = useCallback((key: string) => {
        setExpandedTargetClips((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);
    const toggleDonorClip = useCallback((key: string) => {
        setExpandedDonorClips((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);
    /* `usePort` returns a fresh object literal each render, so `p` itself is never
       a stable dependency. Pull out the individual callbacks that feed the
       virtualized/memoized VFX rows so their identities survive re-renders. */
    const { handleSetTexture, handlePortEmitter, handleMoveEmitter } = p;
    useJadeBin(p.targetPath);

    /* A BIN handed off from another tool (RubyRe via `--port-bin`, or the
       single-instance event when Quartz was already running) loads into the TARGET
       column. Mirrors Paint: the path is cleared only once loaded, so a remount
       between handoff and load cannot drop it. */
    const pendingFile = useNavigationStore((s) => s.pendingFile);
    const consumePendingFile = useNavigationStore((s) => s.consumePendingFile);
    const clearPendingFile = useNavigationStore((s) => s.clearPendingFile);
    const processTargetBin = p.processTargetBin;
    useEffect(() => {
        if (pendingFile?.page !== 'port') return;
        const path = consumePendingFile('port');
        if (!path) return;
        clearPendingFile('port');
        void processTargetBin(path);
    }, [pendingFile, consumePendingFile, clearPendingFile, processTargetBin]);

    const [showPortAllModeModal, setShowPortAllModeModal] = useState(false);
    const [showIdleManagerModal, setShowIdleManagerModal] = useState(false);
    const [showPortDonorModal, setShowPortDonorModal] = useState(false);
    const [isPreparingPortDonor, setIsPreparingPortDonor] = useState(false);
    const [portDonorProgress, setPortDonorProgress] = useState('');
    const [showBackupViewer, setShowBackupViewer] = useState(false);
    const [showHubBrowser, setShowHubBrowser] = useState(false);
    const [showHubUpload, setShowHubUpload] = useState(false);
    const [uploadableSystems, setUploadableSystems] = useState<UploadableSystem[]>([]);

    // Bridge picked hub systems into the donor column (temp tree + vfx_open).
    const hubDonor = useHubDonor({
        processDonorBin: p.processDonorBin,
        setDonorTempRoot: p.setDonorTempRoot,
        setStatus: p.setStatusMessage,
    });

    const handleOpenHub = useCallback(() => setShowHubBrowser(true), []);

    // Read + parse the target's .py into per-system content for upload. Done on
    // open so we always reflect the currently loaded target.
    const handleOpenHubUpload = useCallback(async () => {
        setShowHubUpload(true);
        setUploadableSystems([]);
        if (!p.targetPath || !p.targetPath.includes('.')) return;
        try {
            const text = await readBin(p.targetPath);
            const systems = parseCompleteVFXSystems(text);
            setUploadableSystems(systems.map((s) => ({ key: s.name, name: s.name, fullContent: s.fullContent })));
        } catch (e) {
            p.setStatusMessage(`Could not read target for upload: ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [p]);
    const recentPortDonors = useUiPrefsStore((s) => s.recentPortDonors);

    const sectionStyle = useMemo<React.CSSProperties>(() => ({ background: 'transparent', border: 'none', borderRadius: '5px' }), []);

    const logVfxDrag = useCallback((stage: string, event?: React.DragEvent, extra?: Record<string, unknown>) => {
        const types = event?.dataTransfer?.types ? Array.from(event.dataTransfer.types) : [];
        console.log('[port drag]', stage, {
            types,
            dragStartedKey: p.dragStartedKeyRef.current,
            dropEffect: event?.dataTransfer?.dropEffect,
            effectAllowed: event?.dataTransfer?.effectAllowed,
            ...extra,
        });
    }, [p.dragStartedKeyRef]);

    /* Cursor-following glow: set --mx/--my on the hovered system header row. */
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const row = (e.target as HTMLElement).closest<HTMLElement>('.particle-title-div');
            if (!row) return;
            const r = row.getBoundingClientRect();
            row.style.setProperty('--mx', `${e.clientX - r.left}px`);
            row.style.setProperty('--my', `${e.clientY - r.top}px`);
        };
        document.addEventListener('mousemove', onMove);
        return () => document.removeEventListener('mousemove', onMove);
    }, []);

    useEffect(() => {
        const logNativeDrag = (stage: string, event: DragEvent) => {
            const target = event.target as HTMLElement | null;
            const types = event.dataTransfer?.types ? Array.from(event.dataTransfer.types) : [];
            console.log('[port drag native]', stage, {
                targetTag: target?.tagName,
                targetClass: target?.className,
                types,
                dragStartedKey: p.dragStartedKeyRef.current,
                dropEffect: event.dataTransfer?.dropEffect,
                effectAllowed: event.dataTransfer?.effectAllowed,
            });
        };

        const onDragEnter = (event: DragEvent) => logNativeDrag('document:dragenter', event);
        const onDragOver = (event: DragEvent) => logNativeDrag('document:dragover', event);
        const onDrop = (event: DragEvent) => logNativeDrag('document:drop', event);

        document.addEventListener('dragenter', onDragEnter, true);
        document.addEventListener('dragover', onDragOver, true);
        document.addEventListener('drop', onDrop, true);

        return () => {
            document.removeEventListener('dragenter', onDragEnter, true);
            document.removeEventListener('dragover', onDragOver, true);
            document.removeEventListener('drop', onDrop, true);
        };
    }, [p.dragStartedKeyRef]);

    // Debounced filter inputs mirroring the original filterTargetParticles/filterDonorParticles.
    const filterTargetParticles = useCallback((v: string) => p.setTargetFilter(v), [p]);
    const filterDonorParticles = useCallback((v: string) => p.setDonorFilter(v), [p]);

    // Asset hover preview: textures decode through the image pipeline; SCB/SKN
    // meshes parse natively and render in the same floating card.
    const binPathFor = useCallback((isTarget: boolean) => (isTarget ? p.targetPath : p.donorPath), [p.targetPath, p.donorPath]);
    const handleEmitterMouseEnter = useCallback(
        (e: React.MouseEvent, emitter: VfxEmitter, _system: VfxSystem, isTarget: boolean) => {
            const primaryTexture = emitter.textures[0];
            const assets: PreviewTexture[] = [
                ...emitter.textures.map((path) => ({ path, kind: 'texture' as const })),
                ...emitter.meshes.map((path) => ({
                    path,
                    kind: 'model' as const,
                    label: path.toLowerCase().endsWith('.skn') ? 'Skinned Mesh' : 'Static Mesh',
                    texturePath: primaryTexture,
                })),
            ];
            showTexturePreview(assets, e.currentTarget as HTMLElement, binPathFor(isTarget), {
                contextMenu: true,
                onEditPath: (oldPath, newPath) => {
                    void handleSetTexture(emitter, isTarget, oldPath, newPath);
                },
            });
        },
        // Depend on the one callback used, not the whole `p` bag — `usePort`
        // returns a fresh object every render, so `[p]` would give this handler
        // a new identity each time and break the row-level React.memo.
        [binPathFor, handleSetTexture]
    );
    const handleEmitterMouseLeave = useCallback(() => scheduleTexturePreviewClose(), []);
    const handleEmitterClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        closeTexturePreview();
    }, []);
    const handleEmitterContextMenu = useCallback(
        (e: React.MouseEvent, emitter: VfxEmitter, _system: VfxSystem, isTarget: boolean) => {
            const mesh = emitter.meshes[0];
            const texture = emitter.textures[0];
            if (mesh) {
                openTexturePreviewContextMenu(e, {
                    path: mesh,
                    kind: 'model',
                    texturePath: texture,
                }, binPathFor(isTarget));
            } else if (texture) {
                openTexturePreviewContextMenu(e, { path: texture }, binPathFor(isTarget));
            }
        },
        [binPathFor]
    );

    const handleOpenDonorFromGame = useCallback(() => {
        setPortDonorProgress('');
        setShowPortDonorModal(true);
    }, []);

    const handleConfirmDonorFromGame = useCallback(
        async (args: { champion: { id: string; name: string; alias?: string }; skin: { id: number; name: string; tilePath?: string | null }; portingPrefix: string }) => {
            try {
                setIsPreparingPortDonor(true);
                setPortDonorProgress('Locating League install...');
                const leaguePath = await getLeaguePath();
                if (!leaguePath) {
                    setPortDonorProgress('League install not found. Set the League path in Settings.');
                    p.setStatusMessage('Load donor from game: League install not found');
                    return;
                }

                setPortDonorProgress(`Extracting ${args.champion.name} skin ${args.skin.id} from the game WAD...`);
                const result = await portPrepareDonorFromSkin({
                    championName: args.champion.name,
                    skinId: args.skin.id,
                    leaguePath,
                    portingPrefix: args.portingPrefix,
                });

                if (!result.combinedBinPath) {
                    setPortDonorProgress('No donor content was produced.');
                    p.setStatusMessage('Load donor from game produced no content');
                    return;
                }

                setPortDonorProgress('Opening donor session...');
                p.setDonorTempRoot(result.tempRoot);
                // Donor-from-game bins are throwaway temp extractions — don't
                // record them in the recent-donor-bin history.
                await p.processDonorBin(result.combinedBinPath, false);

                const evicted = useUiPrefsStore.getState().pushRecentPortDonor({
                    championId: args.champion.id,
                    championName: args.champion.name,
                    championAlias: args.champion.alias ?? '',
                    skinId: args.skin.id,
                    skinName: args.skin.name,
                    tilePath: args.skin.tilePath ?? null,
                    tempRoot: result.tempRoot,
                    lastUsed: new Date().toISOString(),
                });
                for (const root of evicted) {
                    if (root && root !== result.tempRoot) void portCleanupDonorTemp(root).catch(() => { /* best-effort */ });
                }

                // Surface what the combine/repath pass actually did so it's
                // clear the linked bins were merged and assets repathed (a cache
                // hit reports 0/0 because it reused a prior build).
                const readyMsg = result.cacheHit
                    ? 'Donor ready (reused cached build).'
                    : `Donor ready — combined ${result.selectedBinCount} bin(s), repathed ${result.extractedAssetCount} asset(s).`;
                setPortDonorProgress(readyMsg);
                p.setStatusMessage(readyMsg);
                setShowPortDonorModal(false);
            } catch (error) {
                const msg = (error as Error)?.message || String(error);
                setPortDonorProgress(`Failed: ${msg}`);
                p.setStatusMessage(`Load donor from game failed: ${msg}`);
            } finally {
                setIsPreparingPortDonor(false);
            }
        },
        [p]
    );

    const handleInsertDroppedVfxSystem = () => {
        try {
            const chosen = (p.namePromptValue || p.pendingDrop?.defaultName || 'NewVFXSystem').trim();
            if (!chosen) {
                p.setStatusMessage('Enter a system name');
                return;
            }
            if (!p.pendingDrop) return;
            if (!p.hasResourceResolver) {
                p.setStatusMessage('Locked: target bin missing ResourceResolver');
                return;
            }
            const { donorSystemPath, defaultName } = p.pendingDrop;
            const isPreservationMode = chosen === defaultName;
            void p.handleInsertDonorSystem(donorSystemPath, chosen, isPreservationMode);
        } finally {
            p.setShowNamePromptModal(false);
            p.setPendingDrop(null);
        }
    };

    // WebView2 does not reliably expose custom dataTransfer types during
    // dragover, so also trust the live drag state set on the donor dragstart.
    const isVfxSystemDrag = (event: React.DragEvent) => {
        if (p.dragStartedKeyRef.current) {
            logVfxDrag('isVfxSystemDrag:ref-true', event);
            return true;
        }
        const types = event?.dataTransfer?.types;
        if (!types) return false;
        const result = Array.from(types).includes('application/x-vfxsys');
        if (result) logVfxDrag('isVfxSystemDrag:type-true', event);
        return result;
    };

    const processVfxSystemDrop = (event: React.DragEvent, _source = 'unknown') => {
        try {
            logVfxDrag('processVfxSystemDrop:start', event, { source: _source });
            event.preventDefault();
            event.stopPropagation();

            const data = event.dataTransfer.getData('application/x-vfxsys');
            const draggedKey = p.dragStartedKeyRef.current;

            p.setIsDragOverVfx(false);
            p.dragEnterCounter.current = 0;
            if (!data && !draggedKey) {
                logVfxDrag('processVfxSystemDrop:no-data', event, { source: _source });
                return;
            }

            if (!p.targetModel) {
                p.setStatusMessage('No target file loaded - please open a target bin first');
                return;
            }
            if (!p.hasResourceResolver) {
                p.setStatusMessage('Locked: target bin missing ResourceResolver');
                return;
            }

            let name: string | undefined;
            let path: VfxPath | undefined;
            if (data) {
                try {
                    const payload = JSON.parse(data) as { name?: string; path?: VfxPath };
                    name = payload?.name;
                    path = payload?.path;
                } catch {
                    /* fall through to drag-state lookup */
                }
            }
            // Fallback: the payload can be empty when the engine withholds
            // dataTransfer contents; recover the system from the drag state.
            if (!path && draggedKey) {
                const sys = p.donorSystems[draggedKey];
                if (sys) {
                    path = sys.path;
                    name = name || sys.particleName || sys.name;
                }
            }
            if (!path) {
                logVfxDrag('processVfxSystemDrop:no-path', event, { source: _source, dataPresent: !!data, draggedKey });
                p.setStatusMessage('Dropped item has no VFX content');
                return;
            }

            const defaultName = name && typeof name === 'string' ? name : 'NewVFXSystem';
            logVfxDrag('processVfxSystemDrop:accepted', event, { source: _source, defaultName, draggedKey });
            p.setPendingDrop({ donorSystemPath: path, defaultName });
            p.setNamePromptValue(defaultName);
            p.setShowNamePromptModal(true);

            requestAnimationFrame(() => {
                if (!p.targetListRef.current) return;
                try {
                    p.targetListRef.current.scrollTop = 0;
                } catch {
                    /* noop */
                }
            });
        } catch {
            logVfxDrag('processVfxSystemDrop:error', event, { source: _source });
            p.setStatusMessage('Failed to add VFX system');
        }
    };

    const handleTargetDropDragOver = (event: React.DragEvent) => {
        const accepted = isVfxSystemDrag(event);
        logVfxDrag('target:dragover', event, { accepted });
        if (!accepted) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        if (!p.isDragOverVfx) p.setIsDragOverVfx(true);
    };

    const handleTargetDropDragEnter = (event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const accepted = isVfxSystemDrag(event);
        logVfxDrag('target:dragenter', event, { accepted });
        if (!accepted) return;
        p.dragEnterCounter.current += 1;
        if (!p.isDragOverVfx) p.setIsDragOverVfx(true);
    };

    const handleTargetDropDragLeave = (event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        logVfxDrag('target:dragleave', event, { counter: p.dragEnterCounter.current });
        p.dragEnterCounter.current -= 1;
        if (p.dragEnterCounter.current <= 0) {
            p.setIsDragOverVfx(false);
            p.dragEnterCounter.current = 0;
        }
    };

    // ── Pointer-drag drop dispatch (see usePortDrag) ──
    // Native drag-drop is enabled for OS file drops, which disables HTML5 DnD on
    // WebView2, so the donor→target drags run on raw pointer events. These take
    // the dragged payload and route it into the same port actions the old HTML5
    // drop handlers used.
    const dropDonorSystem = useCallback((payload: Extract<PortDragPayload, { kind: 'system' }>) => {
        if (!p.targetModel) {
            p.setStatusMessage('No target file loaded - please open a target bin first');
            return;
        }
        if (!p.hasResourceResolver) {
            p.setStatusMessage('Locked: target bin missing ResourceResolver');
            return;
        }
        const sys = p.donorSystems[payload.systemKey];
        if (!sys) {
            p.setStatusMessage('Dropped item has no VFX content');
            return;
        }
        const defaultName = sys.particleName || sys.name || 'NewVFXSystem';
        p.setPendingDrop({ donorSystemPath: sys.path, defaultName });
        p.setNamePromptValue(defaultName);
        p.setShowNamePromptModal(true);
        requestAnimationFrame(() => {
            if (!p.targetListRef.current) return;
            try {
                p.targetListRef.current.scrollTop = 0;
            } catch {
                /* noop */
            }
        });
    }, [p]);

    // Drop a donor/target emitter onto a specific target system row.
    const dropEmitterOnSystem = useCallback(
        (payload: Extract<PortDragPayload, { kind: 'emitter' }>, targetSystemKey: string) => {
            const { sourceType, sourceSystemKey, emitterName } = payload;
            if (!sourceSystemKey || !emitterName || targetSystemKey === sourceSystemKey) return;
            if (sourceType === 'donor') handlePortEmitter(sourceSystemKey, emitterName, undefined, targetSystemKey);
            else handleMoveEmitter?.(sourceSystemKey, emitterName, targetSystemKey);
        },
        [handlePortEmitter, handleMoveEmitter]
    );

    const handleOpenIdleManager = useCallback(() => {
        if (!p.targetModel) {
            p.setStatusMessage('No target file loaded');
            return;
        }
        if (!p.hasResourceResolver || !p.hasSkinCharacterData) {
            p.setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
            return;
        }
        setShowIdleManagerModal(true);
    }, [p]);

    const handleSelectPortAllMode = useCallback(
        (mode: 'normal' | 'replace-target') => {
            setShowPortAllModeModal(false);
            p.handlePortAllSystems(p.hasResourceResolver, mode);
        },
        [p]
    );

    const handleOpenBackupViewer = useCallback(() => {
        if (!p.targetPath || !p.targetPath.includes('.')) {
            p.setStatusMessage('No target file loaded');
            return;
        }
        setShowBackupViewer(true);
    }, [p]);

    // Save wrapper: snapshot the current on-disk target into zbackups before
    // writing, matching the original's create-on-save backups. The session has
    // no text form, so the backup reads the bin through the ritobin bridge.
    const handleSaveWithBackup = useCallback(async () => {
        try {
            if (p.targetPath && p.targetPath.includes('.')) {
                const text = await readBin(p.targetPath).catch(() => null);
                if (text) await backupCreate(p.targetPath, text, 'port').catch(() => {});
            }
        } finally {
            await p.handleSave();
        }
    }, [p]);

    // Old-Quartz behavior: systems are collapsed by default, but an active
    // Search no longer force-expands matching systems — the user's own collapse
    // state is always respected, whether or not a filter is active.
    const targetCollapsed = p.collapsedTargetSystems;
    const donorCollapsed = p.collapsedDonorSystems;

    const sharedListProps = {
        selectedTargetSystem: p.selectedTargetSystem,
        setSelectedTargetSystem: p.setSelectedTargetSystem,
        handlePortEmitter: p.handlePortEmitter,
        setStatusMessage: p.setStatusMessage,
        targetPath: p.targetPath,
        donorPath: p.donorPath,
        handleEditChildParticle: p.handleEditChildParticle,
        handleEmitterMouseEnter,
        handleEmitterMouseLeave,
        handleEmitterClick,
        handleEmitterContextMenu,
        // Pointer-drag drop dispatch (replaces the old HTML5 drop handlers).
        dropEmitterOnSystem,
    };

    // Only bin-loading gets a skeleton, and only on the side being loaded;
    // other operations (save/port) are quick and show no loader.
    const targetLoading = p.isProcessing && p.processingText === 'Loading target...';
    const donorLoading = p.isProcessing && p.processingText === 'Loading donor...';

    const targetColumnProps = {
        ...sharedListProps,
        isProcessing: p.isProcessing,
        binLoading: targetLoading,
        handleOpenTargetBin: p.handleOpenTargetBin,
        processTargetBin: p.processTargetBin,
        targetFilterInput: p.targetFilter,
        filterTargetParticles,
        sectionStyle,
        isDragOverVfx: p.isDragOverVfx,
        handleTargetDropDragOver,
        handleTargetDropDragEnter,
        handleTargetDropDragLeave,
        processVfxSystemDrop,
        dropDonorSystem,
        targetSystems: p.targetSystems,
        targetListRef: p.targetListRef,
        filteredTargetSystems: p.filteredTargetSystems,
        collapsedSystems: targetCollapsed,
        toggleSystemCollapse: p.handleToggleTargetCollapse,
        renamingSystem: p.renamingSystem,
        setRenamingSystem: p.setRenamingSystem,
        handleRenameSystem: p.handleRenameSystem,
        handleDeleteEmitter: p.handleDeleteEmitter,
        handleMoveEmitter: p.handleMoveEmitter,
        handleRenameEmitter: p.handleRenameEmitter,
        renamingEmitter: p.renamingEmitter,
        setRenamingEmitter: p.setRenamingEmitter,
        handleDeleteAllEmitters: p.handleDeleteAllEmitters,
        // Lets target rows recognize an in-progress donor system drag and pass
        // it through to the column drop zone.
        dragStartedKey: p.dragStartedKey,
        dragStartedKeyRef: p.dragStartedKeyRef,
        hasResourceResolver: p.hasResourceResolver,
        hasSkinCharacterData: p.hasSkinCharacterData,
        actionsMenuAnchor: p.actionsMenuAnchor,
        setActionsMenuAnchor: p.setActionsMenuAnchor,
        setShowMatrixModal: p.setShowMatrixModal,
        setMatrixModalState: p.setMatrixModalState,
        handleAddIdleParticles: p.handleAddIdleParticles,
        handleAddChildParticles: p.handleAddChildParticles,
        trimTargetNames: p.trimTargetNames,
        setTrimTargetNames: p.setTrimTargetNames,
    };

    const donorColumnProps = {
        ...sharedListProps,
        isProcessing: p.isProcessing,
        binLoading: donorLoading,
        handleOpenDonorBin: p.handleOpenDonorBin,
        processDonorBin: p.processDonorBin,
        handleOpenDonorFromGame,
        handleOpenHub,
        donorFilterInput: p.donorFilter,
        filterDonorParticles,
        sectionStyle,
        donorSystems: p.donorSystems,
        donorListRef: p.donorListRef,
        filteredDonorSystems: p.filteredDonorSystems,
        collapsedSystems: donorCollapsed,
        toggleSystemCollapse: p.handleToggleDonorCollapse,
        pressedSystemKey: p.pressedSystemKey,
        setPressedSystemKey: p.setPressedSystemKey,
        dragStartedKey: p.dragStartedKey,
        dragStartedKeyRef: p.dragStartedKeyRef,
        setDragStartedKey: p.setDragStartedKey,
        handlePortAllEmitters: p.handlePortAllEmitters,
        draggedEmitter: p.draggedEmitter,
        setDraggedEmitter: p.setDraggedEmitter,
        trimDonorNames: p.trimDonorNames,
        setTrimDonorNames: p.setTrimDonorNames,
    };

    // VFX action buttons for the bottom bar (formerly the floating island).
    // Same enable/disable rules and order as the old cluster.
    const pDis = !p.hasResourceResolver || !p.hasSkinCharacterData;
    const nDis = !p.hasResourceResolver;
    const portAllDisabled = !p.hasResourceResolver || Object.values(p.donorSystems).length === 0 || p.isPortAllLoading;
    // Memoized so the button elements (and their inline <Icon> JSX) keep a
    // stable identity across the frequent full re-renders of this page. Without
    // this the array + every icon are freshly allocated each render, which
    // churns the MUI <Tooltip> wrappers and makes the whole action bar flicker
    // on any state change. Only rebuild when something the buttons actually
    // depend on changes.
    const hasBothModels = Boolean(p.targetModel && p.donorModel);
    const portActions: PortActionButton[] = useMemo(() => [
        ...(hasBothModels
            ? [{
                id: 'portAll',
                color: 'var(--accent-primary)',
                title: p.isPortAllLoading ? 'Porting…' : 'Port All VFX Systems',
                icon: <ArrowBackIcon sx={{ fontSize: 16 }} />,
                onClick: () => setShowPortAllModeModal(true),
                disabled: portAllDisabled,
            }]
            : []),
        {
            id: 'newSystem',
            color: 'var(--color-warning)',
            title: nDis ? 'New VFX System (needs ResourceResolver)' : 'New VFX System',
            icon: <AddIcon sx={{ fontSize: 18 }} />,
            onClick: p.handleOpenNewSystemModal,
            disabled: nDis,
        },
        {
            id: 'persistent',
            color: 'var(--color-success)',
            title: pDis ? 'Persistent Effects (needs ResourceResolver + SkinData)' : 'Persistent Effects',
            icon: <AppsIcon sx={{ fontSize: 16 }} />,
            onClick: p.handleOpenPersistent,
            disabled: pDis,
        },
        {
            id: 'idleParticles',
            color: 'var(--color-info)',
            title: pDis ? 'Idle Particles (needs ResourceResolver + SkinData)' : 'Idle Particles',
            icon: <BubbleChartIcon sx={{ fontSize: 16 }} />,
            onClick: handleOpenIdleManager,
            disabled: pDis,
        },
        {
            id: 'backup',
            color: 'var(--accent-secondary)',
            title: 'Backup History',
            icon: <FolderIcon sx={{ fontSize: 16 }} />,
            onClick: handleOpenBackupViewer,
        },
    ], [
        hasBothModels,
        portAllDisabled,
        pDis,
        nDis,
        p.isPortAllLoading,
        p.handleOpenNewSystemModal,
        p.handleOpenPersistent,
        handleOpenIdleManager,
        handleOpenBackupViewer,
    ]);

    return (
        <PortDragProvider>
        <div
            className="port-container"
            style={{ minHeight: '100%', height: '100%', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
            {/* No full-screen spinner: bin-load shows column skeletons (below);
               save/port operations are quick enough to need no loader. */}

            <div className="port-main-content" style={{ display: 'flex', flex: 1, gap: '20px', padding: '12px', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
                <TargetColumn
                    {...targetColumnProps}
                    anmSlot={
                        anm.isAnm ? (
                            <AnmEditProvider
                                sessionId={p.targetSessionId}
                                refresh={anm.refresh}
                                onModel={anm.publishTarget}
                                onDirty={markAnmDirty}
                                clipKeys={targetClipKeys}
                                donorSessionId={p.donorSessionId}
                                donorGeneration={p.donorModel?.generation}
                                onPorted={handleAnmPorted}
                                onError={p.setStatusMessage}
                            >
                                <ClipList
                                    clips={filteredTargetClips}
                                    expandedKeys={expandedTargetClips}
                                    toggleCollapse={toggleTargetClip}
                                    loading={anm.loading}
                                    error={anm.error}
                                />
                            </AnmEditProvider>
                        ) : undefined
                    }
                />
                {/* Single center divider splitting the two halves. */}
                <div style={{ width: '1px', alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />
                <DonorColumn
                    {...donorColumnProps}
                    anmSlot={
                        anm.isAnm ? (
                            <AnmEditProvider
                                sessionId={p.donorSessionId}
                                refresh={anm.refresh}
                                onModel={anm.publishDonor}
                                clipKeys={donorClipKeys}
                                onError={p.setStatusMessage}
                            >
                                <ClipList
                                    clips={filteredDonorClips}
                                    expandedKeys={expandedDonorClips}
                                    toggleCollapse={toggleDonorClip}
                                    loading={anm.loading}
                                    error={anm.error}
                                />
                            </AnmEditProvider>
                        ) : undefined
                    }
                />
            </div>

            <HubBrowserModal
                open={showHubBrowser}
                onClose={() => setShowHubBrowser(false)}
                onPickSystem={(system) => void hubDonor.loadSystemAsDonor(system)}
                onOpenUpload={() => void handleOpenHubUpload()}
                staging={hubDonor.staging}
            />
            <HubUploadModal
                open={showHubUpload}
                onClose={() => setShowHubUpload(false)}
                targetSystems={uploadableSystems}
                targetPath={p.targetPath}
                setStatus={p.setStatusMessage}
            />

            <PortDonorFromGameModal
                open={showPortDonorModal}
                loading={isPreparingPortDonor}
                progressText={portDonorProgress}
                recentDonors={recentPortDonors}
                onClose={() => {
                    if (!isPreparingPortDonor) setShowPortDonorModal(false);
                }}
                onConfirm={handleConfirmDonorFromGame}
            />

            <BackupViewerModal
                open={showBackupViewer}
                filePath={p.targetPath}
                component="port"
                onClose={(restored) => {
                    setShowBackupViewer(false);
                    if (restored) {
                        // The backup is ritobin text; write it back as a proper
                        // .bin, then reload the session from disk.
                        void (async () => {
                            try {
                                await writeBin(restored.content, p.targetPath);
                                await p.processTargetBin(p.targetPath);
                                p.setStatusMessage('Restored target from backup');
                            } catch (e) {
                                p.setStatusMessage(`Failed to restore backup: ${(e as Error).message}`);
                            }
                        })();
                    }
                }}
            />

            <PersistentEffectsModal
                showPersistentModal={p.showPersistentModal}
                setShowPersistentModal={p.setShowPersistentModal}
                persistentPreset={p.persistentPreset}
                setPersistentPreset={p.setPersistentPreset}
                typeOptions={p.typeOptions}
                typeDropdownOpen={p.typeDropdownOpen}
                setTypeDropdownOpen={p.setTypeDropdownOpen}
                typeDropdownRef={p.typeDropdownRef}
                persistentShowSubmeshes={p.persistentShowSubmeshes}
                setPersistentShowSubmeshes={p.setPersistentShowSubmeshes}
                persistentHideSubmeshes={p.persistentHideSubmeshes}
                setPersistentHideSubmeshes={p.setPersistentHideSubmeshes}
                availableSubmeshes={p.availableSubmeshes}
                customShowSubmeshInput={p.customShowSubmeshInput}
                setCustomShowSubmeshInput={p.setCustomShowSubmeshInput}
                handleAddCustomShowSubmesh={p.handleAddCustomShowSubmesh}
                customHideSubmeshInput={p.customHideSubmeshInput}
                setCustomHideSubmeshInput={p.setCustomHideSubmeshInput}
                handleAddCustomHideSubmesh={p.handleAddCustomHideSubmesh}
                handleRemoveCustomSubmesh={p.handleRemoveCustomSubmesh}
                persistentVfx={p.persistentVfx}
                setPersistentVfx={p.setPersistentVfx}
                effectKeyOptions={p.effectKeyOptions}
                vfxSearchTerms={p.vfxSearchTerms}
                setVfxSearchTerms={p.setVfxSearchTerms}
                vfxDropdownOpen={p.vfxDropdownOpen}
                setVfxDropdownOpen={p.setVfxDropdownOpen}
                existingConditions={p.existingConditions}
                showExistingConditions={p.showExistingConditions}
                setShowExistingConditions={p.setShowExistingConditions}
                handleLoadExistingCondition={p.handleLoadExistingCondition}
                editingConditionIndex={p.editingConditionIndex}
                handleApplyPersistent={p.handleApplyPersistent}
            />

            <MatrixEditorModal open={p.showMatrixModal} initialMatrix={p.matrixModalState.initial} onApply={p.applyMatrix} onClose={() => p.setShowMatrixModal(false)} />

            <NewVfxSystemModal
                open={p.showNewSystemModal}
                onClose={() => p.setShowNewSystemModal(false)}
                newSystemName={p.newSystemName}
                setNewSystemName={p.setNewSystemName}
                onCreate={() => p.handleCreateNewSystem(p.newSystemName, p.setShowNewSystemModal)}
            />

            <VfxSystemNamePromptModal
                open={p.showNamePromptModal}
                value={p.namePromptValue}
                onChange={p.setNamePromptValue}
                onClose={() => {
                    p.setShowNamePromptModal(false);
                    p.setPendingDrop(null);
                }}
                onInsert={handleInsertDroppedVfxSystem}
            />

            <IdleParticleModal
                showIdleParticleModal={p.showIdleParticleModal}
                setShowIdleParticleModal={p.setShowIdleParticleModal}
                selectedSystemForIdle={p.selectedSystemForIdle}
                setSelectedSystemForIdle={p.setSelectedSystemForIdle}
                isEditingIdle={p.isEditingIdle}
                setIsEditingIdle={p.setIsEditingIdle}
                idleBonesList={p.idleBonesList}
                setIdleBonesList={p.setIdleBonesList}
                existingIdleBones={p.existingIdleBones}
                setExistingIdleBones={p.setExistingIdleBones}
                handleConfirmIdleParticles={p.handleConfirmIdleParticles}
            />

            <IdleParticlesManagerModal
                open={showIdleManagerModal}
                onClose={() => setShowIdleManagerModal(false)}
                targetSystems={p.targetSystems}
                model={p.targetModel}
                onUpsertSystem={p.handleUpsertIdleParticlesForSystem}
                onRemoveEffectKey={p.handleRemoveIdleParticlesByEffectKey}
            />

            <ChildParticleModal
                open={p.showChildModal}
                onClose={p.resetChildState}
                isEdit={p.isEditMode}
                targetSystem={p.selectedSystemForChild}
                selectedChildSystem={p.selectedChildSystem}
                setSelectedChildSystem={p.setSelectedChildSystem}
                emitterName={p.emitterName}
                setEmitterName={p.setEmitterName}
                rate={p.childParticleRate}
                setRate={p.setChildParticleRate}
                lifetime={p.childParticleLifetime}
                setLifetime={p.setChildParticleLifetime}
                bindWeight={p.childParticleBindWeight}
                setBindWeight={p.setChildParticleBindWeight}
                timeBeforeFirstEmission={p.childParticleTimeBeforeFirstEmission}
                setTimeBeforeFirstEmission={p.setChildParticleTimeBeforeFirstEmission}
                translationOverrideX={p.childParticleTranslationOverrideX}
                setTranslationOverrideX={p.setChildParticleTranslationOverrideX}
                translationOverrideY={p.childParticleTranslationOverrideY}
                setTranslationOverrideY={p.setChildParticleTranslationOverrideY}
                translationOverrideZ={p.childParticleTranslationOverrideZ}
                setTranslationOverrideZ={p.setChildParticleTranslationOverrideZ}
                isSingle={p.childParticleIsSingle}
                setIsSingle={p.setChildParticleIsSingle}
                availableSystems={p.availableVfxSystems}
                onConfirm={p.handleConfirmChildParticles}
            />

            <PortBottomControls
                statusMessage={p.statusMessage}
                hasTarget={!!p.targetModel}
                handleUndo={p.handleUndo}
                canUndo={p.canUndo}
                handleSave={handleSaveWithBackup}
                isProcessing={p.isProcessing}
                hasChangesToSave={p.hasChangesToSave}
                actions={anm.isAnm ? [] : portActions}
                mode={anm.mode}
                onModeChange={anm.setMode}
            />

            <PortAllModeModal
                open={showPortAllModeModal}
                onClose={() => setShowPortAllModeModal(false)}
                onSelectMode={handleSelectPortAllMode}
                donorCount={Object.values(p.donorSystems || {}).length}
            />
        </div>
        </PortDragProvider>
    );
}

export { Port };
export default Port;
