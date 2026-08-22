import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
    ArrowLeft, ArrowRight, ArrowUp, RefreshCw, Search, X,
    LayoutGrid, List as ListIcon, FolderOpen, Eye, Star,
    Pencil, Trash2, Copy, ClipboardCopy, ClipboardPaste, FolderPlus, Palette, FileCode,
    ArrowUpNarrowWide, ArrowDownNarrowWide,
} from 'lucide-react';
import {
    explorerReveal, explorerRename, explorerDelete, explorerCopy, explorerNewFolder,
    type FsEntry,
} from '@/lib/api/explorer';
import { openModelInspect } from '@/lib/model/modelInspectEvent';
import { useNavigationStore } from '@/lib/stores';
import { openBinInJade } from '@/lib/jade/jadeInterop';
import { useExplorerNav } from './useExplorerNav';
import { ExplorerSidebar } from './ExplorerSidebar';
import { FileTile } from './FileTile';
import { PreviewPane } from './PreviewPane';
import { useExplorerStore, type SortKey, type SortDirection } from './explorerStore';
import type { ExplorerOptions } from './types';
import './explorer.css';

const MODEL_EXTS = new Set(['scb', 'sco', 'skn']);
const TEXTURE_EXTS = new Set(['tex', 'dds', 'png', 'jpg', 'jpeg']);
const BIN_EXTS = new Set(['bin', 'py', 'ritobin']);

// Explorer-local file clipboard. It intentionally survives closing one picker
// so a user can copy in one in-app explorer and paste in the next one.
let fileClipboard: string[] = [];

const isTextEditing = (target: EventTarget | null): boolean => {
    const element = target instanceof HTMLElement ? target : null;
    return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
};

const entryExtension = (entry: FsEntry): string => entry.extension.replace(/^\./, '').toLowerCase();

interface FilterGroup { label: string; exts: string[] | undefined } // undefined = all files

/** Build the selectable filter groups for a picker: the caller's filters, plus
 *  an always-present "All files" escape so nothing is ever unreachable. A `*`
 *  extension collapses a group to "all". Directory mode gets none. */
function filterGroupsFrom(options: ExplorerOptions): FilterGroup[] {
    if (options.mode === 'directory') return [];
    const callerGroups: FilterGroup[] = (options.filters ?? []).map((f) => {
        const exts = f.extensions.map((e) => e.toLowerCase());
        return { label: `${f.name} (${exts.map((e) => `.${e}`).join(', ')})`, exts: exts.includes('*') ? undefined : exts };
    });
    // "All files" is first (the default) so nothing is hidden on open; the
    // caller's specific filters follow for users who want to narrow down.
    const hasAll = callerGroups.some((g) => g.exts === undefined);
    return hasAll ? callerGroups : [{ label: 'All files (*)', exts: undefined }, ...callerGroups];
}

/** Windows-style shortened path for the address bar display. */
function getShortPath(full: string): string {
    if (!full) return '';
    const parts = full.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length <= 4) return full;
    return `${parts[0]}\\...\\${parts.slice(-3).join('\\')}`;
}

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function matchesSearch(entry: FsEntry, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    const name = entry.name.toLowerCase();
    if (name.includes(q)) return true;
    const cq = compact(query);
    return !!cq && compact(entry.name).includes(cq);
}

interface ContextState { x: number; y: number; entry: FsEntry }

const typeName = (entry: FsEntry): string => entry.isDirectory
    ? 'File folder'
    : (entry.extension ? `${entry.extension.toUpperCase()} file` : 'File');

function compareEntries(a: FsEntry, b: FsEntry, key: SortKey, direction: SortDirection): number {
    // Keep folders together above files, matching Windows Explorer.
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    let result = 0;
    if (key === 'modified') result = a.modified - b.modified;
    else if (key === 'size') result = a.size - b.size;
    else if (key === 'type') result = typeName(a).localeCompare(typeName(b), undefined, { numeric: true, sensitivity: 'base' });
    else result = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    if (result === 0) result = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? result : -result;
}

export function FileExplorer({ open, options, onResolve, onCancel, onInspect }: {
    open: boolean;
    options: ExplorerOptions;
    onResolve: (result: string | string[]) => void;
    onCancel: () => void;
    onInspect?: (entry: FsEntry) => void;
}) {
    const recentsKey = options.recentsKey ?? 'default';
    const filterGroups = useMemo(() => filterGroupsFrom(options), [options]);
    const [filterIdx, setFilterIdx] = useState(0);
    // Sort lives in the store, not local state: the modal unmounts on close, so
    // a useState choice would be lost on every reopen.
    const sortKey = useExplorerStore((s) => s.sortKey);
    const sortDirection = useExplorerStore((s) => s.sortDirection);
    const setSort = useExplorerStore((s) => s.setSort);
    const toggleSortDirection = () => setSort(sortKey, sortDirection === 'asc' ? 'desc' : 'asc');
    const extFilter = filterGroups[filterIdx]?.exts;
    const nav = useExplorerNav(extFilter);
    const addRecent = useExplorerStore((s) => s.addRecent);
    const addPin = useExplorerStore((s) => s.addPin);
    const view = useExplorerStore((s) => s.view);
    const setView = useExplorerStore((s) => s.setView);
    const setLastFolder = useExplorerStore((s) => s.setLastFolder);
    const pruneRecents = useExplorerStore((s) => s.pruneRecents);

    const [search, setSearch] = useState('');
    // Tracks the folder the current search applies to, so navigating away clears it.
    const lastSearchPath = useRef<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null); // absolute entry.path
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const [multi, setMulti] = useState<Set<string>>(new Set()); // entry.path, files mode
    const [saveName, setSaveName] = useState('');
    const [editingAddr, setEditingAddr] = useState(false);
    const [addrDraft, setAddrDraft] = useState('');
    const [ctx, setCtx] = useState<ContextState | null>(null);
    // Context menu position, clamped to the viewport after it measures. Starts
    // at the raw cursor coords, then a layout effect flips it up/left if it
    // would overflow the bottom/right edge (otherwise a tall menu clips off the
    // bottom near the address bar).
    const ctxMenuRef = useRef<HTMLDivElement>(null);
    const [ctxPos, setCtxPos] = useState<{ top: number; left: number } | null>(null);
    // Inline rename: the entry being renamed + its draft name.
    const [renaming, setRenaming] = useState<{ entry: FsEntry; draft: string } | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const marqueeStart = useRef<{ x: number; y: number } | null>(null);
    const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    const openInTool = useNavigationStore((s) => s.openInTool);

    const isSave = options.mode === 'save';
    const isFiles = options.mode === 'files';
    const isDirectory = options.mode === 'directory';
    const isBrowse = options.mode === 'browse';

    // Boot: prune stale recents, then resolve the start folder. Priority:
    // caller defaultPath -> last-visited folder -> Desktop -> Home.
    useEffect(() => {
        if (!open) return;
        setSearch(''); setSelected(null); setSelection(new Set()); setMulti(new Set()); setCtx(null); setFilterIdx(0);
        lastSearchPath.current = null; // fresh session: don't clear on the boot navigation
        void pruneRecents();
        (async () => {
            const start = options.defaultPath;
            if (start) {
                const r = await nav.resolveAndGo(start);
                if (r.file) { setSelected(r.file); if (isSave) setSaveName(r.file.replace(/^.*[\\/]/, '')); }
                if (r.ok) return;
            }
            // This picker's own most-recent entry (e.g. the last opened .bin),
            // so each picker type reopens near where it last left off.
            const bucketRecent = useExplorerStore.getState().recents[recentsKey]?.[0];
            if (bucketRecent && (await nav.resolveAndGo(bucketRecent)).ok) return;
            const last = useExplorerStore.getState().lastFolder;
            if (last && (await nav.resolveAndGo(last)).ok) return;
            if ((await nav.resolveAndGo('%USERPROFILE%\\Desktop')).ok) return;
            await nav.resolveAndGo('%USERPROFILE%');
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Remember the last folder browsed so the next open (e.g. the titlebar
    // button) reopens where the user left off.
    useEffect(() => {
        if (open && nav.currentPath) setLastFolder(nav.currentPath);
    }, [open, nav.currentPath, setLastFolder]);

    // Clear the search when the folder changes, so opening a result (or any
    // navigation) drops back to the plain folder listing instead of keeping the
    // now-stale query. Skips the first path seen so it doesn't wipe a search the
    // user is still typing in the current folder.
    useEffect(() => {
        if (!nav.currentPath) return;
        if (lastSearchPath.current !== null && lastSearchPath.current !== nav.currentPath) {
            setSearch('');
        }
        lastSearchPath.current = nav.currentPath;
    }, [nav.currentPath]);

    // Re-list the current folder when the active filter changes (skip the very
    // first render, which the boot effect already handles).
    const didMount = useRef(false);
    useEffect(() => {
        if (!didMount.current) { didMount.current = true; return; }
        nav.refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterIdx]);

    // Keep the context menu inside the viewport. Seed at the raw cursor coords,
    // then (after it renders and we can measure it) flip up / clamp left so a
    // tall menu opened near the bottom edge doesn't clip. Runs before paint via
    // useLayoutEffect so there's no visible reposition jump.
    useLayoutEffect(() => {
        if (!ctx) { setCtxPos(null); return; }
        setCtxPos({ top: ctx.y, left: ctx.x });
    }, [ctx]);
    useLayoutEffect(() => {
        const el = ctxMenuRef.current;
        if (!ctx || !el) return;
        const { width, height } = el.getBoundingClientRect();
        const margin = 8;
        const maxLeft = window.innerWidth - width - margin;
        const maxTop = window.innerHeight - height - margin;
        // If the menu would overflow the bottom, prefer opening ABOVE the
        // cursor; if even that overflows the top, just clamp to the margin.
        let top = ctx.y;
        if (ctx.y > maxTop) top = Math.max(margin, ctx.y - height);
        top = Math.min(top, Math.max(margin, maxTop));
        const left = Math.min(Math.max(margin, ctx.x), Math.max(margin, maxLeft));
        setCtxPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
    }, [ctx]);

    // Esc closes. Ctrl+C/Ctrl+V operate on files/folders unless the user is
    // editing text, in which case normal text clipboard behavior wins.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (ctx) setCtx(null); else onCancel();
                return;
            }
            if (!(e.ctrlKey || e.metaKey) || isTextEditing(e.target)) return;
            if (e.key.toLowerCase() === 'c') {
                const paths = selection.size ? [...selection] : isFiles && multi.size ? [...multi] : selected ? [selected] : [];
                if (!paths.length) return;
                fileClipboard = paths;
                e.preventDefault();
            } else if (e.key.toLowerCase() === 'v' && fileClipboard.length && nav.currentPath) {
                e.preventDefault();
                const sources = [...fileClipboard];
                void (async () => {
                    const copied: string[] = [];
                    try {
                        // Keep large directory copies serialized to avoid a burst
                        // of recursive filesystem work.
                        for (const source of sources) copied.push(await explorerCopy(source, nav.currentPath));
                        nav.refresh();
                        setSelection(new Set(copied));
                        setSelected(copied.length ? copied[copied.length - 1] : null);
                    } catch (error) {
                        window.alert(error instanceof Error ? error.message : String(error));
                    }
                })();
            }
        };
        const onClick = () => setCtx(null);
        document.addEventListener('keydown', onKey);
        document.addEventListener('click', onClick);
        return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
    }, [open, ctx, onCancel, selection, isFiles, multi, selected, nav.currentPath, nav.refresh]);

    // Scroll the selected tile into view (case-insensitive name match).
    useEffect(() => {
        if (!selected || !gridRef.current) return;
        const el = gridRef.current.querySelector<HTMLElement>(`[data-path="${CSS.escape(selected)}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [selected, nav.entries]);

    const visible = useMemo(() => nav.entries
        .filter((entry) => matchesSearch(entry, search))
        .sort((a, b) => compareEntries(a, b, sortKey, sortDirection)),
    [nav.entries, search, sortDirection, sortKey]);
    const selectedEntry = useMemo(
        () => nav.entries.find((e) => e.path === selected) ?? null,
        [nav.entries, selected],
    );
    const selectedDirectoryPath = isDirectory && selectedEntry?.isDirectory
        ? selectedEntry.path
        : nav.currentPath;
    // Only show the preview pane for files that actually render something
    // (textures decode to a thumbnail, models to a 3D viewport). A .bin/.py has
    // no visual preview — it only produced a generic icon + "Open in Jade", so
    // the pane is dead space there. Hide it for those; the list reclaims the room.
    const showPreview = Boolean(
        !isDirectory
        && selectedEntry
        && !selectedEntry.isDirectory
        && (
            TEXTURE_EXTS.has(entryExtension(selectedEntry))
            || MODEL_EXTS.has(entryExtension(selectedEntry))
        ),
    );

    if (!open) return null;

    const commitAddress = async () => {
        const r = await nav.resolveAndGo(addrDraft);
        if (r.file) setSelected(r.file);
        setEditingAddr(false);
    };

    // Sidebar recents/pins may hold FILE paths (bin pickers store the file).
    // Resolve first: a file lands on its parent folder with the file selected,
    // a folder navigates in, a dead path is ignored (no read_dir on a file).
    const handleSidebarNavigate = async (path: string) => {
        const r = await nav.resolveAndGo(path);
        if (r.file) { setSelected(r.file); if (isSave) setSaveName(r.file.replace(/^.*[\\/]/, '')); }
    };

    const chooseFile = (entry: FsEntry) => {
        addRecent(recentsKey, entry.path);
        onResolve(entry.path);
    };

    // ── Context-menu file operations ──────────────────────────────────────────
    const copyPath = (entry: FsEntry) => {
        void navigator.clipboard?.writeText(entry.path).catch(() => { /* ignore */ });
        setCtx(null);
    };

    const startRename = (entry: FsEntry) => {
        setRenaming({ entry, draft: entry.name });
        setCtx(null);
    };

    const commitRename = async () => {
        if (!renaming) return;
        const { entry, draft } = renaming;
        const name = draft.trim();
        setRenaming(null);
        if (!name || name === entry.name) return;
        try {
            const renamedPath = await explorerRename(entry.path, name);
            nav.refresh();
            setSelected(renamedPath);
        } catch (e) {
            window.alert(e instanceof Error ? e.message : String(e));
        }
    };

    const deleteEntry = async (entry: FsEntry) => {
        setCtx(null);
        const kind = entry.isDirectory ? 'folder' : 'file';
        if (!window.confirm(`Delete this ${kind}?\n\n${entry.name}\n\nThis cannot be undone.`)) return;
        try {
            await explorerDelete(entry.path);
            if (selected === entry.path) setSelected(null);
            nav.refresh();
        } catch (e) {
            window.alert(e instanceof Error ? e.message : String(e));
        }
    };

    const copyEntry = async (entry: FsEntry) => {
        setCtx(null);
        try {
            const newPath = await explorerCopy(entry.path, nav.currentPath);
            nav.refresh();
            setSelected(newPath);
        } catch (e) {
            window.alert(e instanceof Error ? e.message : String(e));
        }
    };

    const makeNewFolder = async () => {
        setCtx(null);
        const name = window.prompt('New folder name:', 'New folder');
        if (!name) return;
        try {
            const path = await explorerNewFolder(nav.currentPath, name);
            nav.refresh();
            setSelected(path);
        } catch (e) {
            window.alert(e instanceof Error ? e.message : String(e));
        }
    };

    const openIn = (page: 'imgrecolor' | 'bineditor', entry: FsEntry) => {
        setCtx(null);
        onCancel(); // close the picker first
        openInTool(page, entry.path);
    };

    const inspectModel = (entry: FsEntry) => {
        setCtx(null);
        if (onInspect) onInspect(entry);
        else openModelInspect(entry.path);
    };

    const openInJade = (entry: FsEntry) => {
        setCtx(null);
        void openBinInJade(entry.path).catch((error) => {
            window.alert(error instanceof Error ? error.message : String(error));
        });
    };

    const handleDouble = (entry: FsEntry) => {
        if (entry.isDirectory) { nav.navigateTo(entry.path); return; }
        if (isDirectory) return; // dirs mode ignores files
        if (isBrowse) { setSelected(entry.path); return; }
        if (isSave) { setSaveName(entry.name); setSelected(entry.path); return; }
        if (isFiles) { toggleMulti(entry); return; }
        chooseFile(entry); // single-file mode: double-click confirms
    };

    const handleClick = (entry: FsEntry, event: React.MouseEvent) => {
        if (event.ctrlKey || event.metaKey) {
            setSelection((current) => {
                const next = new Set(current);
                if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path);
                setSelected(next.has(entry.path) ? entry.path : (next.values().next().value ?? null));
                return next;
            });
            if (isFiles && !entry.isDirectory) toggleMulti(entry);
        } else {
            setSelection(new Set([entry.path]));
            setSelected(entry.path);
        }
        if (isSave && !entry.isDirectory) setSaveName(entry.name);
    };

    const beginMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || (event.target as HTMLElement).closest('.dl-explorer-tile')) return;
        marqueeStart.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelection(new Set());
        if (isFiles) setMulti(new Set());
        setSelected(null);
        setMarquee({ left: event.clientX, top: event.clientY, width: 0, height: 0 });
    };

    const moveMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
        const start = marqueeStart.current;
        if (!start || !gridRef.current) return;
        const left = Math.min(start.x, event.clientX);
        const top = Math.min(start.y, event.clientY);
        const right = Math.max(start.x, event.clientX);
        const bottom = Math.max(start.y, event.clientY);
        setMarquee({ left, top, width: right - left, height: bottom - top });
        const hits = new Set<string>();
        gridRef.current.querySelectorAll<HTMLElement>('[data-path]').forEach((tile) => {
            const box = tile.getBoundingClientRect();
            if (box.right >= left && box.left <= right && box.bottom >= top && box.top <= bottom) {
                const path = tile.dataset.path;
                if (path) hits.add(path);
            }
        });
        setSelection(hits);
        if (isFiles) {
            const files = new Set(
                nav.entries.filter((entry) => !entry.isDirectory && hits.has(entry.path)).map((entry) => entry.path),
            );
            setMulti(files);
        }
        setSelected(hits.values().next().value ?? null);
    };

    const endMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!marqueeStart.current) return;
        marqueeStart.current = null;
        setMarquee(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    const copyToFileClipboard = (entry: FsEntry) => {
        fileClipboard = selection.has(entry.path) && selection.size ? [...selection] : [entry.path];
        setCtx(null);
    };

    const pasteFileClipboard = async () => {
        setCtx(null);
        if (!fileClipboard.length) return;
        try {
            const copied: string[] = [];
            for (const source of fileClipboard) copied.push(await explorerCopy(source, nav.currentPath));
            nav.refresh();
            setSelection(new Set(copied));
            setSelected(copied.length ? copied[copied.length - 1] : null);
        } catch (error) {
            window.alert(error instanceof Error ? error.message : String(error));
        }
    };

    const changeSort = (key: SortKey) => {
        if (sortKey === key) {
            toggleSortDirection();
        } else {
            // Newest-first is the useful default for dates; A-Z for everything else.
            setSort(key, key === 'modified' ? 'desc' : 'asc');
        }
    };

    const toggleMulti = (entry: FsEntry) => {
        if (entry.isDirectory) return;
        setMulti((prev) => {
            const next = new Set(prev);
            if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path);
            return next;
        });
    };

    const confirm = () => {
        if (isBrowse) {
            onCancel();
            return;
        }
        if (isDirectory) {
            if (!selectedDirectoryPath) return;
            addRecent(recentsKey, selectedDirectoryPath);
            onResolve(selectedDirectoryPath);
            return;
        }
        if (isFiles) {
            const paths = [...multi];
            if (!paths.length) return;
            paths.forEach((p) => addRecent(recentsKey, p));
            onResolve(paths);
            return;
        }
        if (isSave) {
            const name = saveName.trim();
            if (!name || !nav.currentPath) return;
            const sep = nav.currentPath.includes('\\') ? '\\' : '/';
            const full = `${nav.currentPath.replace(/[\\/]+$/, '')}${sep}${name}`;
            addRecent(recentsKey, full);
            onResolve(full);
            return;
        }
        // single file
        if (selectedEntry && !selectedEntry.isDirectory) chooseFile(selectedEntry);
    };

    // Only surface the skeleton if a load runs longer than this; quick folder
    // switches (the common case) show nothing and never flash a loader.
    const showSkeleton = useDelayedFlag(nav.loading, 180);

    const confirmLabel = isBrowse ? 'Close' : isSave ? 'Save' : isDirectory ? 'Select folder' : isFiles ? `Select (${multi.size})` : 'Open';
    const confirmDisabled = isBrowse
        ? false
        : isDirectory
        ? !selectedDirectoryPath
        : isFiles
            ? multi.size === 0
            : isSave
                ? !saveName.trim()
                : !selectedEntry || selectedEntry.isDirectory;

    return createPortal(
        <div className="dl-modal-backdrop dl-explorer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="dl-modal dl-explorer">
                {/* Header / nav bar */}
                <div className="dl-explorer__bar">
                    <div className="dl-explorer__nav">
                        <button className="dl-btn dl-btn--icon dl-btn--sm" disabled={!nav.canBack} onClick={nav.back} title="Back"><ArrowLeft size={15} /></button>
                        <button className="dl-btn dl-btn--icon dl-btn--sm" disabled={!nav.canForward} onClick={nav.forward} title="Forward"><ArrowRight size={15} /></button>
                        <button className="dl-btn dl-btn--icon dl-btn--sm" onClick={nav.up} title="Up"><ArrowUp size={15} /></button>
                        <button className="dl-btn dl-btn--icon dl-btn--sm" onClick={nav.refresh} title="Refresh"><RefreshCw size={15} /></button>
                    </div>

                    <div
                        className={`dl-explorer__addr ${editingAddr ? 'is-editing' : ''}`}
                        onClick={() => { if (!editingAddr) { setAddrDraft(nav.currentPath); setEditingAddr(true); } }}
                    >
                        <FolderOpen size={14} />
                        {editingAddr ? (
                            <input
                                autoFocus
                                value={addrDraft}
                                onChange={(e) => setAddrDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') void commitAddress(); if (e.key === 'Escape') setEditingAddr(false); }}
                                onBlur={() => setEditingAddr(false)}
                            />
                        ) : (
                            <span title={nav.currentPath}>{getShortPath(nav.currentPath)}</span>
                        )}
                    </div>

                    <div className="dl-explorer__searchbar">
                        <Search size={14} />
                        <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
                        {search && <button className="dl-explorer__search-clear" onClick={() => setSearch('')}><X size={12} /></button>}
                    </div>

                    <div className="dl-explorer__sort-tools">
                        <select
                            className="dl-explorer__sort"
                            value={sortKey}
                            onChange={(event) => {
                                const key = event.target.value as SortKey;
                                setSort(key, key === 'modified' ? 'desc' : 'asc');
                            }}
                            title="Sort by"
                        >
                            <option value="name">Name</option>
                            <option value="modified">Date modified</option>
                            <option value="type">Type</option>
                            <option value="size">Size</option>
                        </select>
                        <button
                            className="dl-btn dl-btn--icon dl-btn--sm"
                            onClick={toggleSortDirection}
                            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                        >
                            {sortDirection === 'asc' ? <ArrowUpNarrowWide size={15} /> : <ArrowDownNarrowWide size={15} />}
                        </button>
                    </div>
                    <button className="dl-btn dl-btn--icon dl-btn--sm" onClick={onCancel} title="Close"><X size={16} /></button>
                </div>

                {/* Body */}
                <div className="dl-explorer__body">
                    <ExplorerSidebar recentsKey={recentsKey} currentPath={nav.currentPath} onNavigate={handleSidebarNavigate} />

                    <div className="dl-explorer__main">
                        {view === 'list' && (
                            <div className="dl-explorer__list-head">
                                {(['name', 'modified', 'type', 'size'] as SortKey[]).map((key) => (
                                    <button
                                        key={key}
                                        className={sortKey === key ? 'is-active' : ''}
                                        onClick={() => changeSort(key)}
                                    >
                                        <span>{key === 'name' ? 'Name' : key === 'modified' ? 'Date modified' : key === 'type' ? 'Type' : 'Size'}</span>
                                        {sortKey === key && (sortDirection === 'asc' ? '↑' : '↓')}
                                    </button>
                                ))}
                            </div>
                        )}
                        {nav.loading ? (
                            // Show a skeleton only for slow loads; quick switches stay blank
                            // (no spinner flash). Blank area holds layout meanwhile.
                            showSkeleton ? <GridSkeleton view={view} /> : <div className="dl-explorer__grid-blank" />
                        ) : nav.error ? (
                            <div className="dl-explorer__state dl-explorer__state--error">{nav.error}</div>
                        ) : visible.length === 0 ? (
                            <div className="dl-explorer__state">{search ? 'No matches' : 'Empty folder'}</div>
                        ) : (
                            <div
                                ref={gridRef}
                                className={`dl-explorer__grid dl-explorer__grid--${view}`}
                                onPointerDown={beginMarquee}
                                onPointerMove={moveMarquee}
                                onPointerUp={endMarquee}
                                onPointerCancel={endMarquee}
                            >
                                {visible.map((entry) => (
                                    <FileTile
                                        key={entry.path}
                                        entry={entry}
                                        view={view}
                                        selected={selection.has(entry.path) || selected === entry.path}
                                        checked={multi.has(entry.path)}
                                        showCheckbox={isFiles && !entry.isDirectory}
                                        onClick={(event) => handleClick(entry, event)}
                                        onDoubleClick={() => handleDouble(entry)}
                                        onToggleCheck={() => toggleMulti(entry)}
                                        onContextMenu={(e) => {
                                            e.preventDefault(); e.stopPropagation();
                                            if (!selection.has(entry.path)) { setSelection(new Set([entry.path])); setSelected(entry.path); }
                                            setCtx({ x: e.clientX, y: e.clientY, entry });
                                        }}
                                    />
                                ))}
                                {marquee && <div className="dl-explorer__marquee" style={marquee} />}
                            </div>
                        )}
                    </div>

                    {showPreview && <PreviewPane entry={selectedEntry} onInspect={onInspect} />}
                </div>

                {/* Footer */}
                <div className="dl-explorer__foot">
                    <div className="dl-explorer__view" aria-label="View mode">
                        <button className={`dl-btn dl-btn--icon dl-btn--sm ${view === 'grid' ? 'dl-btn--active' : ''}`} onClick={() => setView('grid')} title="Grid"><LayoutGrid size={15} /></button>
                        <button className={`dl-btn dl-btn--icon dl-btn--sm ${view === 'list' ? 'dl-btn--active' : ''}`} onClick={() => setView('list')} title="List"><ListIcon size={15} /></button>
                    </div>
                    {filterGroups.length > 1 && (
                        <select
                            className="dl-explorer__filter"
                            value={filterIdx}
                            onChange={(e) => setFilterIdx(Number(e.target.value))}
                            title="File type filter"
                        >
                            {filterGroups.map((g, i) => (
                                <option key={g.label} value={i}>{g.label}</option>
                            ))}
                        </select>
                    )}
                    {isSave ? (
                        <input
                            className="dl-input dl-explorer__savename"
                            placeholder="File name"
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
                        />
                    ) : (
                        <span className="dl-explorer__selpath" title={isDirectory ? selectedDirectoryPath : (selectedEntry?.path ?? nav.currentPath)}>
                            {isDirectory ? selectedDirectoryPath : isFiles ? `${multi.size} selected` : (selectedEntry?.path ?? '')}
                        </span>
                    )}
                    <div className="dl-explorer__foot-actions">
                        {/* No Cancel button: the X in the top bar (and Esc / backdrop click) cancels. */}
                        <button className="dl-btn dl-btn--primary" disabled={confirmDisabled} onClick={confirm}>{confirmLabel}</button>
                    </div>
                </div>

                {/* Context menu */}
                {ctx && (
                    <div
                        ref={ctxMenuRef}
                        className="dl-dd-portal dl-explorer__ctx"
                        style={{
                            position: 'fixed',
                            top: ctxPos?.top ?? ctx.y,
                            left: ctxPos?.left ?? ctx.x,
                            maxHeight: `calc(100vh - 16px)`,
                            overflowY: 'auto',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Open in tool */}
                        {TEXTURE_EXTS.has(entryExtension(ctx.entry)) && (
                            <button className="dl-dd__item" onClick={() => openIn('imgrecolor', ctx.entry)}>
                                <Palette size={14} /><span>Open in Image Recolor</span>
                            </button>
                        )}
                        {BIN_EXTS.has(entryExtension(ctx.entry)) && (
                            <>
                                <button className="dl-dd__item" onClick={() => openIn('bineditor', ctx.entry)}>
                                    <FileCode size={14} /><span>Open in Bin Editor</span>
                                </button>
                                <button className="dl-dd__item" onClick={() => openInJade(ctx.entry)}>
                                    <img src="/jade.webp" alt="" className="dl-explorer__jade-icon" /><span>Open in Jade</span>
                                </button>
                            </>
                        )}
                        {MODEL_EXTS.has(entryExtension(ctx.entry)) && (
                            <button className="dl-dd__item" onClick={() => inspectModel(ctx.entry)}>
                                <Eye size={14} /><span>Inspect Model</span>
                            </button>
                        )}
                        {(TEXTURE_EXTS.has(entryExtension(ctx.entry)) || BIN_EXTS.has(entryExtension(ctx.entry)) || MODEL_EXTS.has(entryExtension(ctx.entry))) && (
                            <div className="dl-dd__divider" />
                        )}

                        {/* File operations */}
                        <button className="dl-dd__item" onClick={() => startRename(ctx.entry)}>
                            <Pencil size={14} /><span>Rename</span>
                        </button>
                        <button className="dl-dd__item" onClick={() => copyToFileClipboard(ctx.entry)}>
                            <ClipboardCopy size={14} /><span>Copy</span><kbd>Ctrl+C</kbd>
                        </button>
                        <button className="dl-dd__item" disabled={!fileClipboard.length} onClick={() => void pasteFileClipboard()}>
                            <ClipboardPaste size={14} /><span>Paste</span><kbd>Ctrl+V</kbd>
                        </button>
                        <button className="dl-dd__item" onClick={() => copyEntry(ctx.entry)}>
                            <Copy size={14} /><span>Duplicate</span>
                        </button>
                        <button className="dl-dd__item" onClick={() => copyPath(ctx.entry)}>
                            <ClipboardCopy size={14} /><span>Copy path</span>
                        </button>
                        <button className="dl-dd__item dl-dd__item--danger" onClick={() => deleteEntry(ctx.entry)}>
                            <Trash2 size={14} /><span>Delete</span>
                        </button>

                        <div className="dl-dd__divider" />
                        <button className="dl-dd__item" onClick={() => { void explorerReveal(ctx.entry.path); setCtx(null); }}>
                            <FolderOpen size={14} /><span>Open in Windows Explorer</span>
                        </button>
                        <button className="dl-dd__item" onClick={makeNewFolder}>
                            <FolderPlus size={14} /><span>New folder</span>
                        </button>
                        {ctx.entry.isDirectory && (
                            <button className="dl-dd__item" onClick={() => { addPin(ctx.entry.path); setCtx(null); }}>
                                <Star size={14} /><span>Pin folder</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Rename modal */}
                {renaming && createPortal(
                    <div className="dl-modal-backdrop" style={{ zIndex: 10001 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setRenaming(null); }}>
                        <div className="dl-modal dl-explorer__rename">
                            <div className="dl-modal__head"><h3 className="dl-modal__title">Rename</h3></div>
                            <div className="dl-modal__body">
                                <input
                                    className="dl-input"
                                    autoFocus
                                    value={renaming.draft}
                                    onChange={(e) => setRenaming({ entry: renaming.entry, draft: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') void commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                                    onFocus={(e) => {
                                        // Preselect the base name (exclude extension) for quick edits.
                                        const dot = renaming.entry.isDirectory ? -1 : renaming.draft.lastIndexOf('.');
                                        e.target.setSelectionRange(0, dot > 0 ? dot : renaming.draft.length);
                                    }}
                                />
                            </div>
                            <div className="dl-modal__foot">
                                <button className="dl-btn" onClick={() => setRenaming(null)}>Cancel</button>
                                <button className="dl-btn dl-btn--primary" onClick={() => void commitRename()}>Rename</button>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
            </div>
        </div>,
        document.body,
    );
}

/** True only after `active` has stayed true for `delay` ms. Flips back to false
 *  immediately when `active` goes false. Lets quick loads pass with no UI. */
function useDelayedFlag(active: boolean, delay: number): boolean {
    const [flag, setFlag] = useState(false);
    useEffect(() => {
        if (!active) { setFlag(false); return; }
        const t = setTimeout(() => setFlag(true), delay);
        return () => clearTimeout(t);
    }, [active, delay]);
    return flag;
}

/** Shimmer placeholder for the file grid (styled like the asset extractor's
 *  skeleton). Only rendered for genuinely slow folder loads. */
function GridSkeleton({ view }: { view: 'grid' | 'list' }) {
    const count = view === 'grid' ? 24 : 12;
    return (
        <div className={`dl-explorer__grid dl-explorer__grid--${view} dl-explorer__grid--skel`}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className={`dl-explorer-tile dl-explorer-tile--${view}`}>
                    <div className={`dl-explorer-tile__icon dl-explorer-skel dl-explorer-skel--d${(i % 3) + 1}`} />
                    <span
                        className={`dl-explorer-tile__name dl-explorer-skel dl-explorer-skel--d${(i % 3) + 1}`}
                        style={{ height: 10, width: view === 'grid' ? '80%' : 160 }}
                    />
                </div>
            ))}
        </div>
    );
}
