import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronsDownUp, ChevronsUpDown, Search } from 'lucide-react';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import {
    syntaxHighlighting,
    codeFolding,
    foldGutter,
    foldKeymap,
    foldAll,
    unfoldAll,
} from '@codemirror/language';
import { search, searchKeymap, openSearchPanel, highlightSelectionMatches } from '@codemirror/search';
import { defaultKeymap, standardKeymap, history, historyKeymap } from '@codemirror/commands';
import { binLanguage, binHighlightStyle, binFoldService } from './binLanguage';

/* Editor chrome, themed to match the app's tokens. CodeMirror owns selection and
 * the clipboard, so Ctrl+A / Ctrl+C operate on the whole document even though
 * only the visible lines are rendered - the previous hand-rolled virtual list
 * could not do this, because scrolling unmounted the rows a DOM selection was
 * anchored to. */
const binTheme = EditorView.theme({
    '&': {
        height: '100%',
        color: 'var(--text-secondary)',
        backgroundColor: 'color-mix(in oklab, var(--bg-primary) 96%, #07090d)',
        fontSize: '11px',
    },
    '.cm-scroller': {
        fontFamily: "var(--font-mono, 'Cascadia Mono', Consolas, monospace)",
        lineHeight: '20px',
        overflow: 'auto',
    },
    '.cm-content': { padding: 0 },
    '.cm-line': { padding: '0 28px 0 6px' },
    '.cm-gutters': {
        color: 'color-mix(in oklab, var(--text-muted) 62%, transparent)',
        backgroundColor: 'color-mix(in oklab, var(--bg-primary) 97%, #07090d)',
        border: 'none',
        fontSize: '9px',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 3px 0 8px', minWidth: '34px' },
    '.cm-foldGutter .cm-gutterElement': { padding: '0 2px', color: 'var(--text-muted)' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,.025)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    // Selection must stay clearly visible - this is the whole point of the rewrite.
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: 'color-mix(in oklab, var(--accent-primary) 32%, #2a3f5c)',
    },
    '.cm-searchMatch': {
        backgroundColor: 'color-mix(in oklab, var(--accent-primary) 28%, #304866)',
        outline: 'none',
    },
    '.cm-searchMatch.cm-searchMatch-selected': { color: '#101419', backgroundColor: '#e8c84a' },
    '.cm-selectionMatch': { backgroundColor: 'color-mix(in oklab, var(--accent-primary) 14%, transparent)' },
    '.cm-foldPlaceholder': {
        margin: '0 4px',
        padding: '0 6px',
        border: '1px solid var(--border)',
        borderRadius: '3px',
        color: 'var(--text-muted)',
        backgroundColor: 'var(--bg-tertiary)',
        fontStyle: 'italic',
    },
    // Search panel, themed to match the toolbar.
    '.cm-panels': { border: 'none', backgroundColor: 'var(--bg-secondary)' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
    '.cm-panel.cm-search': { padding: '6px 8px', fontFamily: 'inherit', fontSize: '11px' },
    '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': {
        fontFamily: 'inherit',
        fontSize: '11px',
    },
    '.cm-panel.cm-search input[type=text]': {
        padding: '3px 6px',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        color: 'var(--text-primary)',
        backgroundColor: 'var(--bg-tertiary)',
    },
    '.cm-textfield': { color: 'var(--text-primary)', backgroundColor: 'var(--bg-tertiary)' },
    '.cm-button': {
        border: '1px solid var(--border)',
        borderRadius: '4px',
        color: 'var(--text-secondary)',
        background: 'var(--bg-tertiary)',
        backgroundImage: 'none',
    },
}, { dark: true });

const extensions: Extension[] = [
    lineNumbers(),
    codeFolding(),
    foldGutter(),
    binFoldService,
    history(),
    search({ top: false }),
    highlightSelectionMatches(),
    highlightActiveLine(),
    binLanguage,
    syntaxHighlighting(binHighlightStyle),
    // standardKeymap carries selectAll (Ctrl+A) and the cursor motions; without
    // it Ctrl+A would fall through to the browser and select the whole app.
    keymap.of([...standardKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap]),
    // readOnly (not editable:false) keeps the content focusable, so the native
    // caret, click-drag selection, and Ctrl+A / Ctrl+C keybindings all work.
    EditorState.readOnly.of(true),
    binTheme,
];

/** `actions` are file-level buttons (Extract / Open in Jade) hosted in this
 *  toolbar, so the preview panel shows one bar instead of a separate actions
 *  row stacked above it. */
export function BinTextViewer({ content, actions }: { content: string; actions?: ReactNode }) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    // Create the editor once; content changes are dispatched as a document swap
    // below so we don't tear down and rebuild the view per file.
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const view = new EditorView({
            state: EditorState.create({ doc: content, extensions }),
            parent: host,
        });
        viewRef.current = view;
        return () => {
            view.destroy();
            viewRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const view = viewRef.current;
        if (!view || view.state.doc.toString() === content) return;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: content },
            selection: { anchor: 0 },
            scrollIntoView: true,
        });
    }, [content]);

    const run = (command: (view: EditorView) => boolean) => () => {
        const view = viewRef.current;
        if (!view) return;
        command(view);
        view.focus();
    };

    return (
        <div className="wad-bin-viewer">
            <div className="wad-bin-viewer__toolbar">
                {actions}
                {actions && <span className="wad-bin-viewer__sep" />}
                <button className="dl-btn dl-btn--sm dl-btn--ghost" onClick={run(foldAll)}>
                    <ChevronsDownUp size={13} /> Collapse All
                </button>
                <button className="dl-btn dl-btn--sm dl-btn--ghost" onClick={run(unfoldAll)}>
                    <ChevronsUpDown size={13} /> Expand All
                </button>
                <span />
                <button className="dl-btn dl-btn--sm dl-btn--ghost" onClick={run(openSearchPanel)}>
                    <Search size={13} /> Find
                </button>
            </div>
            <div className="wad-bin-viewer__editor" ref={hostRef} />
        </div>
    );
}
