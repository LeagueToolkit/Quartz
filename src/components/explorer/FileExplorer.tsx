import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ArrowLeft, ArrowRight, ArrowUp, RefreshCw, Search, X,
    LayoutGrid, List as ListIcon, FolderOpen, Eye, Star,
    Pencil, Trash2, Copy, ClipboardCopy, FolderPlus, Palette, FileCode,
} from 'lucide-react';
import {
    explorerReveal, explorerRename, explorerDelete, explorerCopy, explorerNewFolder,
    type FsEntry,
} from '@/lib/api/explorer';
import { useNavigationStore } from '@/lib/stores';
import { useExplorerNav } from './useExplorerNav';
import { ExplorerSidebar } from './ExplorerSidebar';
import { FileTile } from './FileTile';
import { PreviewPane } from './PreviewPane';
import { useExplorerStore } from './explorerStore';
import type { ExplorerOptions } from './types';
import './explorer.css';

const MODEL_EXTS = new Set(['scb', 'sco', 'skn']);
const TEXTURE_EXTS = new Set(['tex', 'dds', 'png', 'jpg', 'jpeg']);
const BIN_EXTS = new Set(['bin', 'py']);

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
    const extFilter = filterGroups[filterIdx]?.exts;
    const nav = useExplorerNav(extFilter);
    const addRecent = useExplorerStore((s) => s.addRecent);
    const addPin = useExplorerStore((s) => s.addPin);
    const view = useExplorerStore((s) => s.view);
    const setView = useExplorerStore((s) => s.setView);
    const setLastFolder = useExplorerStore((s) => s.setLastFolder);
    const pruneRecents = useExplorerStore((s) => s.pruneRecents);

    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string | null>(null); // entry.name
    const [multi, setMulti] = useState<Set<string>>(new Set()); // entry.path, files mode
    const [saveName, setSaveName] = useState('');
    const [editingAddr, setEditingAddr] = useState(false);
    const [addrDraft, setAddrDraft] = useState('');
    const [ctx, setCtx] = useState<ContextState | null>(null);
    // Inline rename: the entry being renamed + its draft name.
    const [renaming, setRenaming] = useState<{ entry: FsEntry; draft: string } | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const openInTool = useNavigationStore((s) => s.openInTool);

    const isSave = options.mode === 'save';
    const isFiles = options.mode === 'files';
    const isDirectory = options.mode === 'directory';

    // Boot: prune stale recents, then resolve the start folder. Priority:
    // caller defaultPath -> last-visited folder -> Desktop -> Home.
    useEffect(() => {
        if (!open) return;
        setSearch(''); setSelected(null); setMulti(new Set()); setCtx(null); setFilterIdx(0);
        void pruneRecents();
        (async () => {
            const start = options.defaultPath;
            if (start) {
                const r = await nav.resolveAndGo(start);
                if (r.file) { setSelected(r.file); if (isSave) setSaveName(r.file); }
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

    // Re-list the current folder when the active filter changes (skip the very
    // first render, which the boot effect already handles).
    const didMount = useRef(false);
    useEffect(() => {
        if (!didMount.current) { didMount.current = true; return; }
        nav.refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterIdx]);

    // Esc closes; also dismiss the context menu on any outside click.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (ctx) setCtx(null); else onCancel(); } };
        const onClick = () => setCtx(null);
        document.addEventListener('keydown', onKey);
        document.addEventListener('click', onClick);
        return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
    }, [open, ctx, onCancel]);

    // Scroll the selected tile into view (case-insensitive name match).
    useEffect(() => {
        if (!selected || !gridRef.current) return;
        const el = gridRef.current.querySelector<HTMLElement>(`[data-name="${CSS.escape(selected)}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [selected, nav.entries]);

    const visible = useMemo(
        () => nav.entries.filter((e) => matchesSearch(e, search)),
        [nav.entries, search],
    );
    const selectedEntry = useMemo(
        () => nav.entries.find((e) => e.name === selected) ?? null,
        [nav.entries, selected],
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
        if (r.file) { setSelected(r.file); if (isSave) setSaveName(r.file); }
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
            await explorerRename(entry.path, name);
            nav.refresh();
            setSelected(name);
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
            if (selected === entry.name) setSelected(null);
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
            setSelected(newPath.replace(/^.*[\\/]/, ''));
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
            setSelected(path.replace(/^.*[\\/]/, ''));
        } catch (e) {
            window.alert(e instanceof Error ? e.message : String(e));
        }
    };

    const openIn = (page: 'imgrecolor' | 'bineditor', entry: FsEntry) => {
        setCtx(null);
        onCancel(); // close the picker first
        openInTool(page, entry.path);
    };

    const handleDouble = (entry: FsEntry) => {
        if (entry.isDirectory) { nav.navigateTo(entry.path); return; }
        if (isDirectory) return; // dirs mode ignores files
        if (isSave) { setSaveName(entry.name); setSelected(entry.name); return; }
        if (isFiles) { toggleMulti(entry); return; }
        chooseFile(entry); // single-file mode: double-click confirms
    };

    const handleClick = (entry: FsEntry) => {
        setSelected(entry.name);
        if (isSave && !entry.isDirectory) setSaveName(entry.name);
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
        if (isDirectory) {
            if (!nav.currentPath) return;
            addRecent(recentsKey, nav.currentPath);
            onResolve(nav.currentPath);
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

    const confirmLabel = isSave ? 'Save' : isDirectory ? 'Select folder' : isFiles ? `Select (${multi.size})` : 'Open';
    const confirmDisabled = isDirectory
        ? !nav.currentPath
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

                    <div className="dl-explorer__view">
                        <button className={`dl-btn dl-btn--icon dl-btn--sm ${view === 'grid' ? 'dl-btn--active' : ''}`} onClick={() => setView('grid')} title="Grid"><LayoutGrid size={15} /></button>
                        <button className={`dl-btn dl-btn--icon dl-btn--sm ${view === 'list' ? 'dl-btn--active' : ''}`} onClick={() => setView('list')} title="List"><ListIcon size={15} /></button>
                    </div>
                    <button className="dl-btn dl-btn--icon dl-btn--sm" onClick={onCancel} title="Close"><X size={16} /></button>
                </div>

                {/* Body */}
                <div className="dl-explorer__body">
                    <ExplorerSidebar recentsKey={recentsKey} currentPath={nav.currentPath} onNavigate={handleSidebarNavigate} />

                    <div className="dl-explorer__main">
                        {nav.loading ? (
                            <div className="dl-explorer__state"><div className="dl-explorer-preview__spinner" /><span>Loading...</span></div>
                        ) : nav.error ? (
                            <div className="dl-explorer__state dl-explorer__state--error">{nav.error}</div>
                        ) : visible.length === 0 ? (
                            <div className="dl-explorer__state">{search ? 'No matches' : 'Empty folder'}</div>
                        ) : (
                            <div ref={gridRef} className={`dl-explorer__grid dl-explorer__grid--${view}`}>
                                {visible.map((entry) => (
                                    <FileTile
                                        key={entry.path}
                                        entry={entry}
                                        view={view}
                                        selected={selected === entry.name}
                                        checked={multi.has(entry.path)}
                                        showCheckbox={isFiles && !entry.isDirectory}
                                        onClick={() => handleClick(entry)}
                                        onDoubleClick={() => handleDouble(entry)}
                                        onToggleCheck={() => toggleMulti(entry)}
                                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, entry }); }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <PreviewPane entry={selectedEntry} onInspect={onInspect} />
                </div>

                {/* Footer */}
                <div className="dl-explorer__foot">
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
                        <span className="dl-explorer__selpath" title={selectedEntry?.path ?? nav.currentPath}>
                            {isDirectory ? nav.currentPath : isFiles ? `${multi.size} selected` : (selectedEntry?.path ?? '')}
                        </span>
                    )}
                    <div className="dl-explorer__foot-actions">
                        {/* No Cancel button: the X in the top bar (and Esc / backdrop click) cancels. */}
                        <button className="dl-btn dl-btn--primary" disabled={confirmDisabled} onClick={confirm}>{confirmLabel}</button>
                    </div>
                </div>

                {/* Context menu */}
                {ctx && (
                    <div className="dl-dd-portal dl-explorer__ctx" style={{ position: 'fixed', top: ctx.y, left: ctx.x }} onClick={(e) => e.stopPropagation()}>
                        {/* Open in tool */}
                        {TEXTURE_EXTS.has(ctx.entry.extension) && (
                            <button className="dl-dd__item" onClick={() => openIn('imgrecolor', ctx.entry)}>
                                <Palette size={14} /><span>Open in Image Recolor</span>
                            </button>
                        )}
                        {BIN_EXTS.has(ctx.entry.extension) && (
                            <button className="dl-dd__item" onClick={() => openIn('bineditor', ctx.entry)}>
                                <FileCode size={14} /><span>Open in Bin Editor</span>
                            </button>
                        )}
                        {MODEL_EXTS.has(ctx.entry.extension) && onInspect && (
                            <button className="dl-dd__item" onClick={() => { onInspect(ctx.entry); setCtx(null); }}>
                                <Eye size={14} /><span>Inspect model</span>
                            </button>
                        )}
                        {(TEXTURE_EXTS.has(ctx.entry.extension) || BIN_EXTS.has(ctx.entry.extension) || (MODEL_EXTS.has(ctx.entry.extension) && onInspect)) && (
                            <div className="dl-dd__divider" />
                        )}

                        {/* File operations */}
                        <button className="dl-dd__item" onClick={() => startRename(ctx.entry)}>
                            <Pencil size={14} /><span>Rename</span>
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
                            <Eye size={14} /><span>Reveal in Explorer</span>
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
