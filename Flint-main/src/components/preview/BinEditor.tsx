/**
 * Flint - BIN Editor Component (Monaco Editor)
 *
 * A full-featured code editor for viewing and editing Ritobin (.bin) files
 * using Monaco Editor with custom syntax highlighting.
 *
 * Features:
 * - Custom Ritobin language with semantic tokenization
 * - Matching dark theme
 * - Dirty state tracking and save functionality
 * - Asset preview on hover (textures, meshes)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor, { OnMount, BeforeMount, Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useAppState } from '../../lib/state';
import * as api from '../../lib/api';
import { getIcon } from '../../lib/fileIcons';
import {
    RITOBIN_LANGUAGE_ID,
    RITOBIN_THEME_ID,
    registerRitobinLanguage,
    registerRitobinTheme
} from '../../lib/ritobinLanguage';
import { AssetPreviewTooltip } from './AssetPreviewTooltip';

/** Delay in milliseconds before showing the asset preview tooltip */
const HOVER_DELAY_MS = 3000;

/** Asset file extensions that can be previewed */
const PREVIEWABLE_EXTENSIONS = ['tex', 'dds', 'scb', 'sco', 'skn'];

function isPreviewableAssetPath(value: string): boolean {
    if (!value) return false;
    const ext = value.toLowerCase().split('.').pop() || '';
    return PREVIEWABLE_EXTENSIONS.includes(ext);
}

/**
 * Extract string value from a line at a given column position.
 * Returns the string content if cursor is inside a quoted string.
 */
function extractStringAtPosition(line: string, column: number): string | null {
    const stringPattern = /"([^"\\]*(\\.[^"\\]*)*)"/g;
    let match;
    while ((match = stringPattern.exec(line)) !== null) {
        const startCol = match.index + 1;
        const endCol = match.index + match[0].length;
        if (column >= startCol && column <= endCol) return match[1];
    }
    return null;
}

interface BinEditorProps {
    filePath: string;
}

export const BinEditor: React.FC<BinEditorProps> = ({ filePath }) => {
    const { showToast, setWorking, setReady } = useAppState();
    const [content, setContent] = useState<string>('');
    const [originalContent, setOriginalContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lineCount, setLineCount] = useState(0);

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

    // Asset preview tooltip state
    const [previewAsset, setPreviewAsset] = useState<string | null>(null);
    const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [showPreview, setShowPreview] = useState(false);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastHoveredAssetRef = useRef<string | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const isDirty = content !== originalContent;
    const basePath = filePath.split(/[/\\]/).slice(0, -1).join('\\');

    /**
     * Configure Monaco before the editor is created.
     * @monaco-editor/react handles worker loading internally — no MonacoEnvironment needed.
     */
    const handleEditorWillMount: BeforeMount = (_monaco: Monaco) => {
        registerRitobinLanguage(_monaco);
        registerRitobinTheme(_monaco);
    };

    const handleEditorDidMount: OnMount = (editor) => {
        editorRef.current = editor;
        const model = editor.getModel();
        if (model) {
            setLineCount(model.getLineCount());
            model.onDidChangeContent(() => setLineCount(model.getLineCount()));
        }
    };

    const handleEditorChange = useCallback((value: string | undefined) => {
        setContent(value || '');
    }, []);

    useEffect(() => {
        const loadBin = async () => {
            setLoading(true);
            setError(null);
            try {
                const text = await api.readOrConvertBin(filePath);
                setContent(text);
                setOriginalContent(text);
                setLineCount(text.split('\n').length);
            } catch (err) {
                console.error('[BinEditor] Error:', err);
                setError((err as Error).message || 'Failed to load BIN file');
            } finally {
                setLoading(false);
            }
        };
        loadBin();
    }, [filePath]);

    const handleSave = useCallback(async () => {
        try {
            setWorking('Saving BIN file...');
            await api.saveRitobinToBin(filePath, content);
            setOriginalContent(content);
            setReady('Saved');
            showToast('success', 'BIN file saved successfully');
        } catch (err) {
            console.error('[BinEditor] Save error:', err);
            const flintError = err as api.FlintError;
            showToast('error', flintError.getUserMessage?.() || 'Failed to save');
        }
    }, [filePath, content, setWorking, setReady, showToast]);

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        };
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!editorRef.current) return;
        const editorInst = editorRef.current;
        const target = e.target as HTMLElement;
        if (!target.closest('.monaco-editor')) return;
        if (!editorInst.getDomNode()) return;

        const pos = editorInst.getTargetAtClientPoint(e.clientX, e.clientY);
        if (!pos?.position) {
            if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
            return;
        }

        const model = editorInst.getModel();
        if (!model) return;

        const lineContent = model.getLineContent(pos.position.lineNumber);
        const stringValue = extractStringAtPosition(lineContent, pos.position.column);

        setPreviewPosition({ x: e.clientX, y: e.clientY });

        if (stringValue && isPreviewableAssetPath(stringValue)) {
            if (stringValue !== lastHoveredAssetRef.current) {
                lastHoveredAssetRef.current = stringValue;
                setShowPreview(false);
                if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = setTimeout(() => {
                    setPreviewAsset(stringValue);
                    setShowPreview(true);
                }, HOVER_DELAY_MS);
            }
        } else {
            if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
            lastHoveredAssetRef.current = null;
            setShowPreview(false);
        }
    }, []);

    const handleMouseLeave = useCallback(() => {
        if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
        lastHoveredAssetRef.current = null;
        setShowPreview(false);
    }, []);

    const handleClick = useCallback(() => {
        if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
        setShowPreview(false);
    }, []);

    const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || 'file.bin';

    if (loading) {
        return (
            <div className="bin-editor__loading">
                <div className="spinner spinner--lg" />
                <span>Loading BIN file...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bin-editor__error">
                <span dangerouslySetInnerHTML={{ __html: getIcon('warning') }} />
                <span>{error}</span>
            </div>
        );
    }

    return (
        <div className="bin-editor">
            <div className="bin-editor__toolbar">
                <span className="bin-editor__filename">
                    {fileName}{isDirty ? ' •' : ''}
                    <span className="bin-editor__stats">
                        {lineCount.toLocaleString()} lines
                    </span>
                </span>
                <div className="bin-editor__toolbar-actions">
                    <button
                        className="btn btn--primary btn--sm"
                        onClick={handleSave}
                        disabled={!isDirty}
                    >
                        Save
                    </button>
                </div>
            </div>

            <div
                className="bin-editor__content"
                ref={containerRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onClick={handleClick}
            >
                <Editor
                    height="100%"
                    language={RITOBIN_LANGUAGE_ID}
                    theme={RITOBIN_THEME_ID}
                    value={content}
                    onChange={handleEditorChange}
                    beforeMount={handleEditorWillMount}
                    onMount={handleEditorDidMount}
                    options={{
                        fontFamily: 'var(--font-mono), "Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
                        fontSize: 13,
                        lineHeight: 20,
                        lineNumbers: 'on',
                        lineNumbersMinChars: 5,
                        minimap: { enabled: false },
                        folding: false,
                        bracketPairColorization: { enabled: false },
                        matchBrackets: 'never',
                        maxTokenizationLineLength: 5000,
                        stopRenderingLineAfter: 10000,
                        scrollBeyondLastLine: false,
                        smoothScrolling: false,
                        fastScrollSensitivity: 5,
                        cursorBlinking: 'solid',
                        cursorSmoothCaretAnimation: 'off',
                        cursorStyle: 'line',
                        renderWhitespace: 'none',
                        renderControlCharacters: false,
                        renderLineHighlight: 'none',
                        renderValidationDecorations: 'off',
                        occurrencesHighlight: 'off',
                        selectionHighlight: false,
                        guides: {
                            indentation: false,
                            bracketPairs: false,
                            highlightActiveBracketPair: false,
                            highlightActiveIndentation: false,
                        },
                        scrollbar: {
                            vertical: 'auto',
                            horizontal: 'auto',
                            verticalScrollbarSize: 12,
                            horizontalScrollbarSize: 12,
                            useShadows: false,
                        },
                        tabSize: 4,
                        insertSpaces: true,
                        autoIndent: 'none',
                        formatOnPaste: false,
                        formatOnType: false,
                        wordWrap: 'off',
                        quickSuggestions: false,
                        suggestOnTriggerCharacters: false,
                        acceptSuggestionOnEnter: 'off',
                        parameterHints: { enabled: false },
                        wordBasedSuggestions: 'off',
                        hover: { enabled: false },
                        links: false,
                        colorDecorators: false,
                        codeLens: false,
                        inlineSuggest: { enabled: false },
                        contextmenu: false,
                        accessibilitySupport: 'off',
                    }}
                    loading={
                        <div className="bin-editor__loading">
                            <div className="spinner spinner--lg" />
                            <span>Initializing editor...</span>
                        </div>
                    }
                />
            </div>

            {previewAsset && (
                <AssetPreviewTooltip
                    assetPath={previewAsset}
                    basePath={basePath}
                    position={previewPosition}
                    visible={showPreview}
                />
            )}
        </div>
    );
};
