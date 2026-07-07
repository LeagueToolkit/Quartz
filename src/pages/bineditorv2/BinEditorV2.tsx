import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { FolderOpen as FolderOpenIcon, Redo2 as RedoIcon, Undo2 as UndoIcon, X as CloseIcon } from 'lucide-react';
import { useFileExplorer } from '@/components/explorer';
import { DropOverlay } from '@/components/ui';
import {
    binEditorApply, binEditorClose, binEditorInsert, binEditorModel, binEditorMove, binEditorOpen,
    binEditorRedo, binEditorRemove, binEditorRestore, binEditorSave, binEditorUndo,
    type BinEditorUndoResult, type EditorEmitter, type EditorModel, type EditorNode,
    type EditorSystem, type JsonBinValue, type NodePath,
} from '@/lib/api/bineditor';
import { isStaleFileError, staleFilePaths } from '@/lib/api/staleFile';
import { useNavigationStore, useNotificationStore, useUiPrefsStore } from '@/lib/stores';
import { useFileDrop } from '@/lib/util/useFileDrop';
import { useExistingRecentBins } from '@/lib/util/useExistingRecentBins';
import { Switch } from '@/components/settings/primitives';
import {
    closeTexturePreview, scheduleTexturePreviewClose, showTexturePreview,
} from '@/lib/util/texturePreview';
import SystemSidebar, { systemId } from './components/SystemSidebar';
import CategoryTabs from './components/CategoryTabs';
import BulkBar from './components/BulkBar';
import EmitterGroup from './components/EmitterGroup';
import { categoriesPresent, classify, sameKey } from './model/categories';
import {
    applyMultiply, applySetFlag, applySetVector, categoryArity, countAffected, type BulkResult,
} from './model/bulkOps';
import {
    buildAddKeyframe, buildAddListItem, buildAnimate, buildDeanimate, buildRemoveKeyframe,
    canAnimate, type StructuralOp,
} from './model/dynamics';
import { buildFieldValue, type SchemaEntry } from './model/emitterSchema';
import { applyValueToNode, collectTextures, defaultListItem, emitterId, entryKey, fieldByKey, pathKey } from './model/nodes';
import './BinEditorV2.css';

/* Bin Editor V2 — dynamic VFX bin editor over the native Rust bin session.
   Port of the Electron BinEditorV3 container: same state orchestration
   (selected systems / checked emitters / category tabs / bulk ops), but every
   edit flows through the bin_editor_* commands instead of text splicing. */

const DROP_RE = /\.(bin|py|ritobin)$/i;

/* "3m ago" / "2h ago" / "5d ago" stamp for the recent bins list. */
function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

function BinEditorV2() {
    const pick = useFileExplorer();
    const page = useNavigationStore((s) => s.page);
    const notify = useNotificationStore((s) => s.push);
    const storedRecentBins = useUiPrefsStore((s) => s.recentBins);
    const removeRecentBin = useUiPrefsStore((s) => s.removeRecentBin);
    // Only show recent bins whose file still exists; prune vanished ones.
    const recentBins = useExistingRecentBins(storedRecentBins, removeRecentBin);

    const [model, setModel] = useState<EditorModel | null>(null);
    const [filePath, setFilePath] = useState<string | null>(null);
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const [selectedSystems, setSelectedSystems] = useState<Set<string>>(new Set());
    const [checkedEmitters, setCheckedEmitters] = useState<Set<string>>(new Set());
    const [expandedEmitters, setExpandedEmitters] = useState<Set<string>>(new Set());
    const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
    const [activeCategory, setActiveCategory] = useState('all');
    const [pinned, setPinned] = useState<string[]>([]);
    const [advanced, setAdvanced] = useState(false);
    const [search, setSearch] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);

    const sessionRef = useRef<number | null>(null);
    useEffect(() => () => {
        const sid = sessionRef.current;
        sessionRef.current = null;
        if (sid !== null) void binEditorClose(sid).catch(() => undefined);
    }, []);

    const collapseEditorView = useCallback((clearSystems = false) => {
        if (clearSystems) setSelectedSystems(new Set());
        setCheckedEmitters(new Set());
        setExpandedEmitters(new Set());
        setExpandedFields(new Set());
        setActiveCategory('all');
    }, []);

    const prevPageRef = useRef<string | null>(null);
    useEffect(() => {
        const prev = prevPageRef.current;
        prevPageRef.current = page;
        if (page === 'bineditor' && prev !== 'bineditor') {
            collapseEditorView(true);
        }
    }, [page, collapseEditorView]);

    // ── Model lookups ──
    const systems = model?.systems ?? [];

    /* `${bin}:${entry}` -> system key, for dirty-dot attribution from NodePaths.
       Keyed on (bin, entry) since entry indices collide across resident bins. */
    const entryToSystem = useMemo(() => {
        const m = new Map<string, string>();
        for (const sys of model?.systems ?? []) {
            for (const em of sys.emitters) m.set(entryKey(em.path.bin, em.path.entry), systemId(sys));
        }
        return m;
    }, [model]);

    /* pathKey -> node, for optimistic local mutation on leaf commits. Preorder
       insert keeps the PARENT for shared paths (vector components carry the
       vector's own path). */
    const pathIndex = useMemo(() => {
        const m = new Map<string, EditorNode>();
        const add = (n: EditorNode): void => {
            const k = pathKey(n.path);
            if (!m.has(k)) m.set(k, n);
            for (const c of n.children ?? []) add(c);
        };
        for (const sys of model?.systems ?? []) {
            for (const em of sys.emitters) em.fields.forEach(add);
        }
        return m;
    }, [model]);

    const markEdited = useCallback((entries: string[]) => {
        setDirty(true);
        setCanUndo(true);
        setCanRedo(false);
        setDirtyKeys((prev) => {
            const next = new Set(prev);
            for (const e of entries) {
                const k = entryToSystem.get(e);
                if (k) next.add(k);
            }
            return next;
        });
    }, [entryToSystem]);

    const refetchModel = useCallback(async () => {
        const sid = sessionRef.current;
        if (sid === null) return;
        try {
            setModel(await binEditorModel(sid));
        } catch {
            /* session gone; the next open recovers */
        }
    }, []);

    /* Nodes are mutated in place on leaf edits, so memo'd EmitterGroups can't
       see changes in their props. Per-entry revision counters invalidate
       exactly the touched systems' groups; everything else bails in memo. */
    const [entryRevs, setEntryRevs] = useState<Map<string, number>>(new Map());
    const bumpEntries = useCallback((entries: Iterable<string>) => {
        setEntryRevs((prev) => {
            const next = new Map(prev);
            for (const e of entries) next.set(e, (next.get(e) ?? 0) + 1);
            return next;
        });
    }, []);

    // ── File operations ──

    const loadBinFile = useCallback(async (path: string) => {
        setBusy(true);
        setStatus('Loading...');
        try {
            const prev = sessionRef.current;
            sessionRef.current = null;
            if (prev !== null) void binEditorClose(prev).catch(() => undefined);

            const { sessionId, model: opened } = await binEditorOpen(path);
            sessionRef.current = sessionId;
            setModel(opened);
            setFilePath(path);
            collapseEditorView(true);
            setPinned([]);
            setDirty(false);
            setDirtyKeys(new Set());
            setCanUndo(false);
            setCanRedo(false);
            useUiPrefsStore.getState().pushRecentBin(path);
            const emCount = opened.systems.reduce((a, s) => a + s.emitters.length, 0);
            setStatus(`Loaded: ${opened.systems.length} systems, ${emCount} emitters`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatus(`Error: ${msg}`);
            notify('error', `Failed to load bin: ${msg}`);
        } finally {
            setBusy(false);
        }
    }, [notify]);

    const handleFileOpen = useCallback(async () => {
        try {
            const selected = await pick({
                mode: 'file',
                filters: [
                    { name: 'Bin Files', extensions: ['bin'] },
                    { name: 'Py Files', extensions: ['py', 'ritobin'] },
                ],
                recentsKey: 'bin',
            });
            if (selected && typeof selected === 'string') await loadBinFile(selected);
        } catch (error) {
            setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [loadBinFile, pick]);

    useFileDrop({
        onEnter: () => setIsDragOver(true),
        onOver: () => setIsDragOver(true),
        onLeave: () => setIsDragOver(false),
        onDrop: (paths) => {
            setIsDragOver(false);
            const file = paths.find((p) => DROP_RE.test(p));
            if (file) void loadBinFile(file);
        },
    });

    const handleSave = useCallback(async (force = false) => {
        const sid = sessionRef.current;
        if (sid === null) return;
        setBusy(true);
        setStatus('Saving...');
        try {
            const savedPaths = await binEditorSave(sid, undefined, force);
            setDirty(false);
            setDirtyKeys(new Set());
            if (savedPaths.length === 0) {
                setStatus('Nothing to save (no changes)');
                notify('info', 'No changes to save');
            } else {
                const names = savedPaths.map((p) => p.split(/[\\/]/).pop()).join(', ');
                setStatus(`Saved: ${savedPaths.join(', ')}`);
                notify('success', savedPaths.length === 1 ? `Saved ${names}` : `Saved ${savedPaths.length} files: ${names}`);
            }
        } catch (error) {
            // A file changed on disk since opening (e.g. saved from Paint/Port).
            // Ask before clobbering; on confirm, retry with force.
            if (!force && isStaleFileError(error)) {
                const paths = staleFilePaths(error);
                const names = paths.map((p) => p.split(/[\\/]/).pop()).join(', ') || 'this file';
                setBusy(false);
                const ok = window.confirm(
                    `${names} was modified outside the Bin Editor since you opened it.\n\n`
                    + `Saving now will overwrite those changes. Overwrite?`,
                );
                if (ok) await handleSave(true);
                else setStatus('Save cancelled (file changed on disk)');
                return;
            }
            const msg = error instanceof Error ? error.message : String(error);
            setStatus(`Save error: ${msg}`);
            notify('error', `Save failed: ${msg}`);
        } finally {
            setBusy(false);
        }
    }, [notify]);

    /* Apply an undo/redo response: partial results patch only the touched
       systems into the resident model (and bump their revs); full results
       (restore frames) replace the model wholesale. */
    const applyUndoResult = useCallback((res: BinEditorUndoResult) => {
        if (res.kind === 'full') {
            setModel(res.model);
            return;
        }
        // Reconcile by (bin, key): system keys are path_hash hex and can repeat
        // across resident bins, so bin must be part of the identity.
        const sysId = (s: EditorSystem): string => `${s.bin}:${s.key}`;
        const byKey = new Map(res.systems.map((s) => [sysId(s), s]));
        setModel((prev) =>
            prev
                ? { ...prev, systems: prev.systems.map((s) => byKey.get(sysId(s)) ?? s) }
                : prev,
        );
        bumpEntries(res.entries.map((e) => entryKey(e.bin, e.entry)));
    }, [bumpEntries]);

    const handleUndo = useCallback(async () => {
        const sid = sessionRef.current;
        if (sid === null) return;
        try {
            const res = await binEditorUndo(sid);
            if (res) {
                applyUndoResult(res);
                setCanRedo(true);
                setDirty(true);
                setStatus('Undid last change');
            } else {
                setCanUndo(false);
                setStatus('Nothing to undo');
            }
        } catch (error) {
            setStatus(`Undo error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [applyUndoResult]);

    const handleRedo = useCallback(async () => {
        const sid = sessionRef.current;
        if (sid === null) return;
        try {
            const res = await binEditorRedo(sid);
            if (res) {
                applyUndoResult(res);
                setCanUndo(true);
                setDirty(true);
                setStatus('Redid last change');
            } else {
                setCanRedo(false);
                setStatus('Nothing to redo');
            }
        } catch (error) {
            setStatus(`Redo error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [applyUndoResult]);

    const handleRestore = useCallback(async () => {
        const sid = sessionRef.current;
        if (sid === null) return;
        try {
            const restored = await binEditorRestore(sid);
            setModel(restored);
            collapseEditorView(true);
            setDirty(false);
            setDirtyKeys(new Set());
            setCanUndo(true);
            setCanRedo(false);
            setStatus('Restored the originally loaded bin');
        } catch (error) {
            setStatus(`Restore error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, []);

    // ── Selection ──

    /* Single-select: choosing a system opens only that one. Clicking the already
       selected system deselects it (back to the empty hint). */
    const toggleSystem = useCallback((key: string) => {
        setSelectedSystems((prev) => (prev.has(key) && prev.size === 1 ? new Set() : new Set([key])));
    }, []);

    /* Keep emitter checks scoped to currently selected systems. Choosing a
       system should show its emitters, not silently bulk-select all of them. */
    const prevSelRef = useRef<Set<string> | null>(null);
    useEffect(() => {
        const prev = prevSelRef.current;
        const changed = !prev
            || prev.size !== selectedSystems.size
            || [...selectedSystems].some((k) => !prev.has(k));
        prevSelRef.current = selectedSystems;
        if (!changed) return;
        setCheckedEmitters((current) => {
            if (current.size === 0) return current;
            const visibleEmitterKeys = new Set<string>();
            for (const sys of model?.systems ?? []) {
                if (!selectedSystems.has(systemId(sys))) continue;
                for (const em of sys.emitters) visibleEmitterKeys.add(emitterId(sys.bin, em.key));
            }
            const next = new Set([...current].filter((key) => visibleEmitterKeys.has(key)));
            return next.size === current.size ? current : next;
        });
    }, [model, selectedSystems]);

    const toggleEmitter = useCallback((emitterKey: string) => {
        setCheckedEmitters((prev) => {
            const next = new Set(prev);
            if (next.has(emitterKey)) next.delete(emitterKey);
            else next.add(emitterKey);
            return next;
        });
    }, []);

    const toggleEmitterOpen = useCallback((emitterKey: string) => {
        setExpandedEmitters((prev) => {
            const next = new Set(prev);
            if (next.has(emitterKey)) next.delete(emitterKey);
            else next.add(emitterKey);
            return next;
        });
    }, []);

    const toggleFieldOpen = useCallback((path: NodePath) => {
        const key = pathKey(path);
        setExpandedFields((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const selectAllEmitters = useCallback(() => {
        if (!model) return;
        const keys = new Set<string>();
        for (const sys of model.systems) {
            if (!selectedSystems.has(systemId(sys))) continue;
            for (const em of sys.emitters) keys.add(emitterId(sys.bin, em.key));
        }
        setCheckedEmitters(keys);
    }, [model, selectedSystems]);

    const deselectAllEmitters = useCallback(() => setCheckedEmitters(new Set()), []);

    // ── Derivations ──

    const selectedSystemList = useMemo(
        () => systems.filter((s) => selectedSystems.has(systemId(s))),
        [systems, selectedSystems],
    );

    useEffect(() => {
        setExpandedEmitters((current) => {
            if (current.size === 0) return current;
            const visibleEmitterKeys = new Set<string>();
            for (const sys of selectedSystemList) {
                for (const em of sys.emitters) visibleEmitterKeys.add(emitterId(sys.bin, em.key));
            }
            const next = new Set([...current].filter((key) => visibleEmitterKeys.has(key)));
            return next.size === current.size ? current : next;
        });
        setExpandedFields((current) => {
            if (current.size === 0) return current;
            const visibleFieldKeys = new Set<string>();
            const addNode = (node: EditorNode): void => {
                visibleFieldKeys.add(pathKey(node.path));
                for (const child of node.children ?? []) addNode(child);
            };
            for (const sys of selectedSystemList) {
                for (const em of sys.emitters) {
                    for (const field of em.fields) addNode(field);
                }
            }
            const next = new Set([...current].filter((key) => visibleFieldKeys.has(key)));
            return next.size === current.size ? current : next;
        });
    }, [selectedSystemList]);

    const targetEmitters = useMemo(() => {
        const out: EditorEmitter[] = [];
        for (const sys of selectedSystemList) {
            for (const em of sys.emitters) {
                if (checkedEmitters.has(emitterId(sys.bin, em.key))) out.push(em);
            }
        }
        return out;
    }, [selectedSystemList, checkedEmitters]);

    const presentCategories = useMemo(
        () => categoriesPresent(targetEmitters.flatMap((e) => e.fields)),
        [targetEmitters],
    );
    const count = useMemo(
        () => countAffected(targetEmitters, activeCategory),
        [targetEmitters, activeCategory],
    );
    const arity = useMemo(
        () => categoryArity(targetEmitters, activeCategory),
        [targetEmitters, activeCategory],
    );
    const showFlag = useMemo(
        () => activeCategory !== 'all' && targetEmitters.some((em) =>
            em.fields.some((f) =>
                sameKey(classify(f), activeCategory) && f.kind === 'primitive' && f.valueType === 'bool')),
        [targetEmitters, activeCategory],
    );
    const showAnimate = useMemo(
        () => activeCategory !== 'all' && targetEmitters.some((em) =>
            em.fields.some((f) => sameKey(classify(f), activeCategory) && canAnimate(f))),
        [targetEmitters, activeCategory],
    );

    const pinCategory = useCallback((name: string) => {
        setPinned((prev) => [name, ...prev.filter((k) => !sameKey(k, name))]);
        setActiveCategory(name);
    }, []);

    // ── Leaf edits (optimistic local mutation + single-edit apply) ──

    const liveLeaf = useCallback((path: NodePath, value: JsonBinValue) => {
        const node = pathIndex.get(pathKey(path));
        if (!node) return;
        applyValueToNode(node, value);
        bumpEntries([entryKey(path.bin, path.entry)]);
    }, [pathIndex, bumpEntries]);

    const commitLeaf = useCallback(async (path: NodePath, value: JsonBinValue) => {
        const sid = sessionRef.current;
        if (sid === null) return;
        const node = pathIndex.get(pathKey(path));
        if (node) applyValueToNode(node, value);
        bumpEntries([entryKey(path.bin, path.entry)]);
        try {
            await binEditorApply(sid, [{ path, value }]);
            markEdited([entryKey(path.bin, path.entry)]);
        } catch (error) {
            setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
            await refetchModel();
        }
    }, [pathIndex, bumpEntries, markEdited, refetchModel]);

    // ── Bulk ops (one apply batch; leaf-only, so the local model is patched
    //    in place like commitLeaf — no full-model refetch over IPC) ──

    const runBulk = useCallback(async (result: BulkResult, successMsg: string) => {
        const sid = sessionRef.current;
        if (sid === null) return;
        if (result.edits.length === 0) {
            setStatus('Nothing to change in the current selection');
            return;
        }
        // Optimistic local application — the edits carry every {path, value}
        // written, so the resident model mirrors the native tree exactly.
        for (const e of result.edits) {
            const node = pathIndex.get(pathKey(e.path));
            if (node) applyValueToNode(node, e.value);
        }
        bumpEntries(result.edits.map((e) => entryKey(e.path.bin, e.path.entry)));
        try {
            await binEditorApply(sid, result.edits);
            markEdited(result.edits.map((e) => entryKey(e.path.bin, e.path.entry)));
            setStatus(successMsg);
        } catch (error) {
            // Native side swapped the batch back; resync the local model.
            setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
            await refetchModel();
        }
    }, [pathIndex, bumpEntries, markEdited, refetchModel]);

    const doMultiply = useCallback((factor: number) => {
        const r = applyMultiply(targetEmitters, activeCategory, factor);
        void runBulk(r, `Scaled ${r.fields} fields across ${r.emitters} emitters x${factor}`);
    }, [targetEmitters, activeCategory, runBulk]);

    const doSetVector = useCallback((vals: number[]) => {
        if (activeCategory === 'all') {
            setStatus('Pick a field tab to set a value');
            return;
        }
        const r = applySetVector(targetEmitters, activeCategory, vals);
        void runBulk(r, `Set ${r.fields} fields across ${r.emitters} emitters to ${vals.join(', ')}`);
    }, [targetEmitters, activeCategory, runBulk]);

    const doSetFlag = useCallback((v: boolean) => {
        const r = applySetFlag(targetEmitters, activeCategory, v);
        void runBulk(r, `Set ${r.fields} flags across ${r.emitters} emitters to ${v}`);
    }, [targetEmitters, activeCategory, runBulk]);

    // ── Structural ops (insert/remove, model replaced with the result) ──

    const runStructural = useCallback(async (
        ops: StructuralOp | StructuralOp[] | null,
        successMsg: string,
        entries: string[],
    ): Promise<boolean> => {
        const sid = sessionRef.current;
        if (sid === null || !ops) return false;
        const list = Array.isArray(ops) ? ops : [ops];
        if (list.length === 0) return false;
        try {
            let next: EditorModel | null = null;
            for (const op of list) {
                next = op.kind === 'insert'
                    ? await binEditorInsert(sid, op.parentPath, op.key ?? null, op.index ?? null, op.value)
                    : await binEditorRemove(sid, op.path);
            }
            if (next) setModel(next);
            markEdited(entries);
            setStatus(successMsg);
            return true;
        } catch (error) {
            setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
            await refetchModel();
            return false;
        }
    }, [markEdited, refetchModel]);

    const doAnimate = useCallback((node: EditorNode) => {
        void runStructural(buildAnimate(node), `Animated ${node.key ?? 'value'}`, [entryKey(node.path.bin, node.path.entry)]);
    }, [runStructural]);

    const doDeanimate = useCallback((node: EditorNode) => {
        void runStructural(buildDeanimate(node), `Made ${node.key ?? 'value'} constant`, [entryKey(node.path.bin, node.path.entry)]);
    }, [runStructural]);

    const doAddKeyframe = useCallback((node: EditorNode) => {
        void runStructural(buildAddKeyframe(node), `Added keyframe to ${node.key ?? 'value'}`, [entryKey(node.path.bin, node.path.entry)]);
    }, [runStructural]);

    const doRemoveKeyframe = useCallback((node: EditorNode, index: number) => {
        void runStructural(buildRemoveKeyframe(node, index), `Removed keyframe from ${node.key ?? 'value'}`, [entryKey(node.path.bin, node.path.entry)]);
    }, [runStructural]);

    const doRemoveNode = useCallback((node: EditorNode) => {
        void runStructural({ kind: 'remove', path: node.path }, `Removed ${node.key ?? 'item'}`, [entryKey(node.path.bin, node.path.entry)]);
    }, [runStructural]);

    // Reorder a field/list item up (delta -1) or down (delta +1) in its parent.
    // Not an insert/remove op, so it calls binEditorMove directly and replaces
    // the model with the fresh projection (same refresh contract as runStructural).
    const doMoveNode = useCallback(async (node: EditorNode, delta: number) => {
        const sid = sessionRef.current;
        if (sid === null) return;
        try {
            const next = await binEditorMove(sid, node.path, delta);
            setModel(next);
            markEdited([entryKey(node.path.bin, node.path.entry)]);
            setStatus(`Moved ${node.key ?? 'item'} ${delta < 0 ? 'up' : 'down'}`);
        } catch (error) {
            setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
            await refetchModel();
        }
    }, [markEdited, refetchModel]);

    const doAddListItem = useCallback((node: EditorNode) => {
        const op = buildAddListItem(node, defaultListItem(node.itemType));
        if (!op) {
            setStatus('This list type has no safe default item');
            return;
        }
        void runStructural(op, 'Added list item', [entryKey(node.path.bin, node.path.entry)]);
    }, [runStructural]);

    const doAddNested = useCallback((node: EditorNode, entry: SchemaEntry) => {
        const value = buildFieldValue(entry);
        if (!value) {
            setStatus(`No default value available for ${entry.name}`);
            return;
        }
        void runStructural(
            { kind: 'insert', parentPath: node.path, key: entry.name, value },
            `Added ${entry.name}`,
            [entryKey(node.path.bin, node.path.entry)],
        );
    }, [runStructural]);

    const doAddFieldToEmitter = useCallback(async (emitter: EditorEmitter, entry: SchemaEntry) => {
        if (fieldByKey(emitter, entry.name)) {
            setStatus(`${emitter.name} already has ${entry.name}`);
            return;
        }
        const value = buildFieldValue(entry);
        if (!value) {
            setStatus(`No default value available for ${entry.name}`);
            return;
        }
        const ok = await runStructural(
            { kind: 'insert', parentPath: emitter.path, key: entry.name, value },
            `Added ${entry.name} to ${emitter.name}`,
            [entryKey(emitter.path.bin, emitter.path.entry)],
        );
        if (ok) pinCategory(entry.name);
    }, [runStructural, pinCategory]);

    const doAddFieldBulk = useCallback(async (entry: SchemaEntry) => {
        const value = buildFieldValue(entry);
        if (!value) {
            setStatus(`No default value available for ${entry.name}`);
            return;
        }
        const ops: StructuralOp[] = [];
        for (const em of targetEmitters) {
            if (fieldByKey(em, entry.name)) continue;
            ops.push({ kind: 'insert', parentPath: em.path, key: entry.name, value });
        }
        if (ops.length === 0) {
            setStatus(`All selected emitters already have ${entry.name}`);
            return;
        }
        const ok = await runStructural(
            ops,
            `Added ${entry.name} to ${ops.length} emitters`,
            targetEmitters.map((e) => entryKey(e.path.bin, e.path.entry)),
        );
        if (ok) pinCategory(entry.name);
    }, [targetEmitters, runStructural, pinCategory]);

    const doAnimateBulk = useCallback((animate: boolean) => {
        if (activeCategory === 'all') return;
        const ops: StructuralOp[] = [];
        for (const em of targetEmitters) {
            const f = em.fields.find((x) => sameKey(classify(x), activeCategory));
            if (!f) continue;
            const op = animate ? buildAnimate(f) : buildDeanimate(f);
            if (op) ops.push(op);
        }
        if (ops.length === 0) {
            setStatus(animate ? 'Nothing to animate in the selection' : 'Nothing to make constant in the selection');
            return;
        }
        void runStructural(
            ops,
            animate
                ? `Animated ${activeCategory} on ${ops.length} emitters`
                : `Made ${activeCategory} constant on ${ops.length} emitters`,
            targetEmitters.map((e) => entryKey(e.path.bin, e.path.entry)),
        );
    }, [targetEmitters, activeCategory, runStructural]);

    const doDeleteBulk = useCallback(() => {
        if (activeCategory === 'all') return;
        const ops: StructuralOp[] = [];
        for (const em of targetEmitters) {
            const f = em.fields.find((x) => sameKey(classify(x), activeCategory));
            if (f && !sameKey(f.key, 'emitterName')) ops.push({ kind: 'remove', path: f.path });
        }
        if (ops.length === 0) {
            setStatus(`No selected emitter has ${activeCategory}`);
            return;
        }
        void runStructural(
            ops,
            `Removed ${activeCategory} from ${ops.length} emitters`,
            targetEmitters.map((e) => entryKey(e.path.bin, e.path.entry)),
        );
    }, [targetEmitters, activeCategory, runStructural]);

    // ── Texture hover preview (shared module) ──

    const handleTextureHover = useCallback((emitter: EditorEmitter, e: MouseEvent<HTMLButtonElement>) => {
        // The shared module owns the debounce + staleness guard; collectTextures
        // already returns { path, label }[] (PreviewTexture-compatible).
        showTexturePreview(collectTextures(emitter), e.currentTarget, filePath ?? '');
    }, [filePath]);

    const handleTextureLeave = useCallback(() => {
        scheduleTexturePreviewClose(500);
    }, []);

    const handleTextureOpen = useCallback(() => {
        closeTexturePreview();
    }, []);

    // ── Render ──

    const noDoc = !model;

    return (
        <div className="bineditorv2-root">
            {isDragOver && (
                <DropOverlay variant="scrim" label="Drop the bin here" icon={<FolderOpenIcon size={48} strokeWidth={1.5} />} />
            )}

            <div className="bineditorv2-body">
                <div className={`bineditorv2-sidebar${noDoc ? ' is-dim' : ''}`}>
                    <SystemSidebar
                        systems={systems}
                        selectedKeys={selectedSystems}
                        dirtyKeys={dirtyKeys}
                        search={search}
                        onSearch={setSearch}
                        onToggleSystem={toggleSystem}
                    />
                </div>

                <div className="bineditorv2-main">
                    {noDoc && (
                        <div className="bineditorv2-emptywrap">
                            <div className="bineditorv2-empty">
                                <FolderOpenIcon
                                    size={48}
                                    color="var(--accent-primary)"
                                    strokeWidth={1.5}
                                    style={{ display: 'block', marginBottom: 16 }}
                                />
                                <div className="bineditorv2-empty__title">No Bin Loaded</div>
                                <div className="bineditorv2-empty__sub">Drop a .bin here</div>
                                <button
                                    type="button"
                                    className="dl-btn dl-btn--primary"
                                    disabled={busy}
                                    onClick={() => void handleFileOpen()}
                                >
                                    <span className="dl-icon"><FolderOpenIcon size={14} /></span>
                                    <span>Open Bin</span>
                                </button>
                            </div>

                            {recentBins.length > 0 && (
                                <div className="bineditorv2-recent">
                                    <div className="bineditorv2-recent__title">Recent Bins</div>
                                    <div className="bineditorv2-recent__list">
                                        {recentBins.map((bin) => (
                                            <div
                                                key={bin.path}
                                                className="bineditorv2-recent__item"
                                                onClick={() => void loadBinFile(bin.path)}
                                                title={bin.path}
                                            >
                                                <div className="bineditorv2-recent__info">
                                                    <FolderOpenIcon size={15} className="bineditorv2-recent__icon" />
                                                    <span className="bineditorv2-recent__name">{bin.name}</span>
                                                </div>
                                                <div className="bineditorv2-recent__actions">
                                                    <span className="bineditorv2-recent__date">{relativeTime(bin.lastOpened)}</span>
                                                    <button
                                                        className="bineditorv2-recent__delete"
                                                        title="Remove from recent"
                                                        onClick={(e) => { e.stopPropagation(); removeRecentBin(bin.path); }}
                                                    >
                                                        <CloseIcon size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {model && selectedSystems.size === 0 && (
                        <div className="bineditorv2-hint">Select a system on the left</div>
                    )}

                    {model && selectedSystems.size > 0 && (
                        <>
                            <BulkBar
                                category={activeCategory}
                                count={count}
                                arity={arity}
                                showFlag={showFlag}
                                showAnimate={showAnimate}
                                onMultiply={doMultiply}
                                onSetVector={doSetVector}
                                onSetFlag={doSetFlag}
                                onAnimateBulk={doAnimateBulk}
                                onDeleteBulk={doDeleteBulk}
                                onAddField={(entry) => void doAddFieldBulk(entry)}
                            />
                            <CategoryTabs
                                categories={presentCategories}
                                active={activeCategory}
                                onSelect={setActiveCategory}
                                pinned={pinned}
                            />
                            <div className="bineditorv2-minirow">
                                <button type="button" className="dl-btn dl-btn--ghost dl-btn--sm" onClick={selectAllEmitters}>
                                    Select all
                                </button>
                                <button type="button" className="dl-btn dl-btn--ghost dl-btn--sm" onClick={deselectAllEmitters}>
                                    Deselect all
                                </button>
                                <span className="bineditorv2-minirow__count">{checkedEmitters.size} selected</span>
                            </div>
                            <div className="bineditorv2-main__scroll">
                                {selectedSystemList.map((sys) => (
                                    <div key={systemId(sys)}>
                                        {selectedSystemList.length > 1 && (
                                            <div className="bineditorv2-syshead">{sys.name}</div>
                                        )}
                                        {sys.emitters.map((em) => {
                                            const emId = emitterId(sys.bin, em.key);
                                            return (
                                            <EmitterGroup
                                                key={emId}
                                                emitterId={emId}
                                                emitter={em}
                                                selected={checkedEmitters.has(emId)}
                                                open={expandedEmitters.has(emId)}
                                                onToggle={toggleEmitter}
                                                onToggleOpen={toggleEmitterOpen}
                                                expandedFields={expandedFields}
                                                onToggleField={toggleFieldOpen}
                                                activeCategory={activeCategory}
                                                advanced={advanced}
                                                rev={entryRevs.get(entryKey(em.path.bin, em.path.entry)) ?? 0}
                                                onAddField={doAddFieldToEmitter}
                                                onTextureHover={handleTextureHover}
                                                onTextureLeave={handleTextureLeave}
                                                onTextureOpen={handleTextureOpen}
                                                onCommitLeaf={commitLeaf}
                                                onLive={liveLeaf}
                                                onAnimate={doAnimate}
                                                onDeanimate={doDeanimate}
                                                onAddKeyframe={doAddKeyframe}
                                                onRemoveKeyframe={doRemoveKeyframe}
                                                onRemoveNode={doRemoveNode}
                                                onMoveNode={doMoveNode}
                                                onAddNested={doAddNested}
                                                onAddListItem={doAddListItem}
                                                binPath={filePath}
                                            />
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="bineditorv2-footer">
                {model && (
                    <button
                        type="button"
                        className="dl-btn dl-btn--primary dl-btn--sm dl-btn--icon"
                        title="Open Bin"
                        disabled={busy}
                        onClick={() => void handleFileOpen()}
                    >
                        <span className="dl-icon"><FolderOpenIcon size={15} /></span>
                    </button>
                )}
                {status && <span className="bineditorv2-status">{status}</span>}
                {dirty && <span className="bineditorv2-unsaved">Unsaved</span>}
                <label className="bineditorv2-advanced">
                    <Switch checked={advanced} onChange={setAdvanced} />
                    <span>Advanced</span>
                </label>

                <div className="bineditorv2-footer__actions">
                    <button
                        type="button"
                        className="dl-btn dl-btn--secondary dl-btn--sm dl-btn--icon"
                        title="Undo"
                        disabled={!canUndo}
                        onClick={() => void handleUndo()}
                    >
                        <span className="dl-icon"><UndoIcon size={15} /></span>
                    </button>
                    <button
                        type="button"
                        className="dl-btn dl-btn--secondary dl-btn--sm dl-btn--icon"
                        title="Redo"
                        disabled={!canRedo}
                        onClick={() => void handleRedo()}
                    >
                        <span className="dl-icon"><RedoIcon size={15} /></span>
                    </button>
                    <button
                        type="button"
                        className="dl-btn dl-btn--secondary dl-btn--sm"
                        title="Reset the tree to its state at load"
                        disabled={noDoc || busy}
                        onClick={() => void handleRestore()}
                    >
                        Restore
                    </button>
                    <button
                        type="button"
                        className="dl-btn dl-btn--primary dl-btn--sm"
                        disabled={!dirty || busy}
                        onClick={() => void handleSave()}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

export { BinEditorV2 };
export default BinEditorV2;
