import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ArrowLeft, ArrowRight, ArrowUp, RefreshCw, Search, X,
    LayoutGrid, List as ListIcon, FolderOpen, Eye, Star,
} from 'lucide-react';
import { explorerReveal, type FsEntry } from '@/lib/api/explorer';
import { useExplorerNav } from './useExplorerNav';
import { ExplorerSidebar } from './ExplorerSidebar';
import { FileTile } from './FileTile';
import { PreviewPane } from './PreviewPane';
import { useExplorerStore } from './explorerStore';
import type { ExplorerOptions } from './types';
import './explorer.css';

const MODEL_EXTS = new Set(['scb', 'sco', 'skn']);

/** Merge an options.filters list into a flat lowercased extension list.
 *  A `*` extension (any file) yields undefined = no filter. */
function extFilterFrom(options: ExplorerOptions): string[] | undefined {
    if (options.mode === 'directory') return undefined;
    const exts = (options.filters ?? []).flatMap((f) => f.extensions).map((e) => e.toLowerCase());
    if (!exts.length || exts.includes('*')) return undefined;
    return exts;
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
    const extFilter = useMemo(() => extFilterFrom(options), [options]);
    const nav = useExplorerNav(extFilter);
    const addRecent = useExplorerStore((s) => s.addRecent);
    const addPin = useExplorerStore((s) => s.addPin);

    const [view, setView] = useState<'grid' | 'list'>('grid');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string | null>(null); // entry.name
    const [multi, setMulti] = useState<Set<string>>(new Set()); // entry.path, files mode
    const [saveName, setSaveName] = useState('');
    const [editingAddr, setEditingAddr] = useState(false);
    const [addrDraft, setAddrDraft] = useState('');
    const [ctx, setCtx] = useState<ContextState | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    const isSave = options.mode === 'save';
    const isFiles = options.mode === 'files';
    const isDirectory = options.mode === 'directory';

    // Boot: resolve the start folder from defaultPath (or Home) once per open.
    useEffect(() => {
        if (!open) return;
        setSearch(''); setSelected(null); setMulti(new Set()); setCtx(null);
        (async () => {
            const start = options.defaultPath;
            if (start) {
                const file = await nav.resolveAndGo(start);
                if (file) { setSelected(file); if (isSave) setSaveName(file); }
            } else {
                // No default: land on Home via quick-links resolve of %USERPROFILE%.
                const home = await nav.resolveAndGo('%USERPROFILE%');
                void home;
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

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
        const file = await nav.resolveAndGo(addrDraft);
        if (file) setSelected(file);
        setEditingAddr(false);
    };

    const chooseFile = (entry: FsEntry) => {
        addRecent(recentsKey, entry.path);
        onResolve(entry.path);
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
                    <ExplorerSidebar recentsKey={recentsKey} currentPath={nav.currentPath} onNavigate={nav.navigateTo} />

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
                        <button className="dl-dd__item" onClick={() => { void explorerReveal(ctx.entry.path); setCtx(null); }}>
                            <Eye size={14} /><span>Reveal in Explorer</span>
                        </button>
                        {ctx.entry.isDirectory && (
                            <button className="dl-dd__item" onClick={() => { addPin(ctx.entry.path); setCtx(null); }}>
                                <Star size={14} /><span>Pin folder</span>
                            </button>
                        )}
                        {MODEL_EXTS.has(ctx.entry.extension) && onInspect && (
                            <button className="dl-dd__item" onClick={() => { onInspect(ctx.entry); setCtx(null); }}>
                                <Eye size={14} /><span>Inspect model</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
