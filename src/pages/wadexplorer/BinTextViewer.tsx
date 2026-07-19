import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactElement,
} from 'react';
import { ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown, Search, X } from 'lucide-react';
import { List, type ListImperativeAPI, type RowComponentProps } from 'react-window';

type TokenKind =
    | 'plain'
    | 'comment'
    | 'string'
    | 'number'
    | 'type'
    | 'class'
    | 'property'
    | 'brace'
    | 'bracket'
    | 'paren'
    | 'punctuation';

interface Token { text: string; kind: TokenKind }
interface FoldRegion { start: number; end: number }
interface SearchMatch { lineIndex: number; start: number; end: number }
interface VisibleRow { lineIndex: number }

const TYPE_KEYWORDS = new Set([
    'type', 'embed', 'pointer', 'link', 'option', 'list', 'map', 'hash', 'flag', 'struct',
    'u8', 'u16', 'u32', 'u64', 'i8', 'i16', 'i32', 'i64', 'f32', 'f64', 'bool',
    'string', 'vec2', 'vec3', 'vec4', 'mtx44', 'rgba', 'path', 'true', 'false', 'nil',
]);

function tokenizeLine(line: string): Token[] {
    const tokens: Token[] = [];
    let offset = 0;
    const push = (text: string, kind: TokenKind) => {
        tokens.push({ text, kind });
        offset += text.length;
    };

    while (offset < line.length) {
        const rest = line.slice(offset);
        let match: RegExpMatchArray | null;
        if ((match = rest.match(/^(#.*|\/\/.*|;.*)/))) push(match[0], 'comment');
        else if ((match = rest.match(/^"(?:[^"\\]|\\.)*"/))) push(match[0], 'string');
        else if ((match = rest.match(/^0x[0-9a-f]+/i))) push(match[0], 'number');
        else if ((match = rest.match(/^-?(?:\d+\.\d*|\d*\.\d+|\d+)(?:e[+-]?\d+)?f?/i))) push(match[0], 'number');
        else if ((match = rest.match(/^\s+/))) push(match[0], 'plain');
        else if ((match = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/))) {
            const word = match[0];
            if (TYPE_KEYWORDS.has(word.toLowerCase())) push(word, 'type');
            else if (/^[A-Z]/.test(word)) push(word, 'class');
            else if (/^\s*[:=]/.test(rest.slice(word.length))) push(word, 'property');
            else push(word, 'plain');
        } else {
            const char = rest[0];
            const kind: TokenKind = char === '{' || char === '}'
                ? 'brace'
                : char === '[' || char === ']'
                    ? 'bracket'
                    : char === '(' || char === ')'
                        ? 'paren'
                        : '=:,'.includes(char)
                            ? 'punctuation'
                            : 'plain';
            push(char, kind);
        }
    }
    return tokens;
}

/** Braces inside quoted strings and comments are not fold delimiters. */
function foldCharacters(line: string): string[] {
    const output: string[] = [];
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
            continue;
        }
        if (char === '"') { quoted = true; continue; }
        if (char === '#' || char === ';' || (char === '/' && line[index + 1] === '/')) break;
        if (char === '{' || char === '}') output.push(char);
    }
    return output;
}

function buildFoldStarts(lines: string[]): Map<number, FoldRegion> {
    const stack: number[] = [];
    const starts = new Map<number, FoldRegion>();
    lines.forEach((line, lineIndex) => {
        for (const char of foldCharacters(line)) {
            if (char === '{') stack.push(lineIndex);
            else {
                const start = stack.pop();
                if (start === undefined || lineIndex <= start) continue;
                const current = starts.get(start);
                if (!current || current.end < lineIndex) starts.set(start, { start, end: lineIndex });
            }
        }
    });
    return starts;
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatches(lines: string[], query: string, regexMode: boolean, matchCase: boolean) {
    if (!query) return { matches: [] as SearchMatch[], error: false };
    try {
        const expression = new RegExp(regexMode ? query : escapeRegex(query), matchCase ? 'g' : 'gi');
        const matches: SearchMatch[] = [];
        lines.forEach((line, lineIndex) => {
            expression.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = expression.exec(line)) !== null) {
                matches.push({ lineIndex, start: match.index, end: match.index + match[0].length });
                if (!match[0].length) expression.lastIndex++;
            }
        });
        return { matches, error: false };
    } catch {
        return { matches: [] as SearchMatch[], error: true };
    }
}

interface Segment extends Token { highlight?: boolean; current?: boolean }

function highlightTokens(tokens: Token[], matches: SearchMatch[], current: SearchMatch | null): Segment[] {
    if (!matches.length) return tokens;
    const segments: Segment[] = [];
    let tokenStart = 0;
    for (const token of tokens) {
        const tokenEnd = tokenStart + token.text.length;
        const cuts = new Set([tokenStart, tokenEnd]);
        for (const match of matches) {
            if (match.start > tokenStart && match.start < tokenEnd) cuts.add(match.start);
            if (match.end > tokenStart && match.end < tokenEnd) cuts.add(match.end);
        }
        const ordered = [...cuts].sort((left, right) => left - right);
        for (let index = 0; index < ordered.length - 1; index++) {
            const start = ordered[index];
            const end = ordered[index + 1];
            const match = matches.find((candidate) => start >= candidate.start && start < candidate.end);
            segments.push({
                text: token.text.slice(start - tokenStart, end - tokenStart),
                kind: token.kind,
                highlight: !!match,
                current: !!match && !!current && match.start === current.start && match.end === current.end,
            });
        }
        tokenStart = tokenEnd;
    }
    return segments;
}

interface CodeRowProps {
    visibleRows: VisibleRow[];
    tokenizedLines: Token[][];
    matchesByLine: Map<number, SearchMatch[]>;
    currentMatch: SearchMatch | null;
    foldStarts: Map<number, FoldRegion>;
    collapsedStarts: Set<number>;
    onToggleFold: (lineIndex: number, expandDescendants: boolean) => void;
}

function CodeRow({
    ariaAttributes,
    index,
    style,
    visibleRows,
    tokenizedLines,
    matchesByLine,
    currentMatch,
    foldStarts,
    collapsedStarts,
    onToggleFold,
}: RowComponentProps<CodeRowProps>): ReactElement | null {
    const lineIndex = visibleRows[index]?.lineIndex;
    if (lineIndex === undefined) return null;
    const fold = foldStarts.get(lineIndex);
    const collapsed = collapsedStarts.has(lineIndex);
    const current = currentMatch?.lineIndex === lineIndex ? currentMatch : null;
    const segments = highlightTokens(tokenizedLines[lineIndex] || [], matchesByLine.get(lineIndex) || [], current);
    return (
        <div {...ariaAttributes} className={`wad-bin-line${current ? ' is-current' : ''}`} style={style}>
            <span className="wad-bin-line__gutter">
                <button
                    type="button"
                    className={`wad-bin-line__fold${collapsed ? ' is-collapsed' : ''}`}
                    style={{ visibility: fold ? 'visible' : 'hidden' }}
                    title={collapsed ? 'Expand block' : 'Collapse block'}
                    onClick={(event) => { event.stopPropagation(); onToggleFold(lineIndex, event.shiftKey); }}
                ><i /></button>
                <span>{lineIndex + 1}</span>
            </span>
            <code className="wad-bin-line__code">
                {segments.map((segment, segmentIndex) => (
                    <span
                        key={segmentIndex}
                        className={`wad-bin-token--${segment.kind}${segment.highlight ? ' is-match' : ''}${segment.current ? ' is-current' : ''}`}
                    >{segment.text}</span>
                ))}
                {collapsed && fold && <span className="wad-bin-line__summary"> ... {fold.end - fold.start} lines</span>}
            </code>
        </div>
    );
}

export function BinTextViewer({ content }: { content: string }) {
    const [collapsedStarts, setCollapsedStarts] = useState<Set<number>>(new Set());
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [regexMode, setRegexMode] = useState(false);
    const [matchCase, setMatchCase] = useState(false);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
    const [height, setHeight] = useState(300);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<ListImperativeAPI | null>(null);

    const lines = useMemo(() => content.replace(/\r\n/g, '\n').split('\n'), [content]);
    const tokenizedLines = useMemo(() => lines.map(tokenizeLine), [lines]);
    const foldStarts = useMemo(() => buildFoldStarts(lines), [lines]);
    const foldableStarts = useMemo(() => [...foldStarts.keys()].sort((a, b) => a - b), [foldStarts]);
    const search = useMemo(() => buildMatches(lines, query, regexMode, matchCase), [lines, matchCase, query, regexMode]);
    const currentMatch = search.matches[currentMatchIndex] ?? null;
    const matchesByLine = useMemo(() => {
        const map = new Map<number, SearchMatch[]>();
        for (const match of search.matches) map.set(match.lineIndex, [...(map.get(match.lineIndex) || []), match]);
        return map;
    }, [search.matches]);
    const visibleRows = useMemo(() => {
        const rows: VisibleRow[] = [];
        for (let lineIndex = 0; lineIndex < lines.length;) {
            rows.push({ lineIndex });
            const fold = collapsedStarts.has(lineIndex) ? foldStarts.get(lineIndex) : undefined;
            lineIndex = fold ? fold.end + 1 : lineIndex + 1;
        }
        return rows;
    }, [collapsedStarts, foldStarts, lines.length]);
    const visibleIndexByLine = useMemo(
        () => new Map(visibleRows.map((row, index) => [row.lineIndex, index])),
        [visibleRows],
    );

    useEffect(() => {
        setCollapsedStarts(new Set());
        setCurrentMatchIndex(0);
    }, [content]);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => setHeight(Math.max(1, entry.contentRect.height)));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (searchOpen) searchRef.current?.focus();
    }, [searchOpen]);

    useEffect(() => setCurrentMatchIndex(0), [matchCase, query, regexMode]);
    useEffect(() => {
        if (!search.matches.length) setCurrentMatchIndex(0);
        else setCurrentMatchIndex((index) => Math.min(index, search.matches.length - 1));
    }, [search.matches.length]);

    useEffect(() => {
        if (!currentMatch) return;
        const ancestors = [...collapsedStarts].filter((start) => {
            const fold = foldStarts.get(start);
            return fold && currentMatch.lineIndex > fold.start && currentMatch.lineIndex <= fold.end;
        });
        if (ancestors.length) {
            setCollapsedStarts((current) => {
                const next = new Set(current);
                ancestors.forEach((start) => next.delete(start));
                return next;
            });
            return;
        }
        const index = visibleIndexByLine.get(currentMatch.lineIndex);
        if (index !== undefined) listRef.current?.scrollToRow({ index, align: 'center', behavior: 'auto' });
    }, [collapsedStarts, currentMatch, foldStarts, listRef, visibleIndexByLine]);

    const toggleFold = useCallback((lineIndex: number, expandDescendants: boolean) => {
        setCollapsedStarts((current) => {
            const next = new Set(current);
            if (next.has(lineIndex)) {
                next.delete(lineIndex);
                if (expandDescendants) {
                    const parent = foldStarts.get(lineIndex);
                    if (parent) for (const start of next) if (start > parent.start && start <= parent.end) next.delete(start);
                }
            } else next.add(lineIndex);
            return next;
        });
    }, [foldStarts]);

    const previousMatch = () => {
        if (search.matches.length) setCurrentMatchIndex((index) => (index - 1 + search.matches.length) % search.matches.length);
    };
    const nextMatch = () => {
        if (search.matches.length) setCurrentMatchIndex((index) => (index + 1) % search.matches.length);
    };
    const closeSearch = () => { setSearchOpen(false); setQuery(''); };

    const rowProps = useMemo<CodeRowProps>(() => ({
        visibleRows,
        tokenizedLines,
        matchesByLine,
        currentMatch,
        foldStarts,
        collapsedStarts,
        onToggleFold: toggleFold,
    }), [collapsedStarts, currentMatch, foldStarts, matchesByLine, tokenizedLines, toggleFold, visibleRows]);

    return (
        <div
            className="wad-bin-viewer"
            tabIndex={0}
            onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                    event.preventDefault(); setSearchOpen(true);
                } else if (event.key === 'Escape' && searchOpen) closeSearch();
            }}
        >
            <div className="wad-bin-viewer__toolbar">
                <button className="dl-btn dl-btn--sm dl-btn--ghost" disabled={!foldableStarts.length} onClick={() => setCollapsedStarts(new Set(foldableStarts))}><ChevronsDownUp size={13} /> Collapse All</button>
                <button className="dl-btn dl-btn--sm dl-btn--ghost" disabled={!collapsedStarts.size} onClick={() => setCollapsedStarts(new Set())}><ChevronsUpDown size={13} /> Expand All</button>
                <span />
                <button className={`dl-btn dl-btn--sm ${searchOpen ? 'dl-btn--active' : 'dl-btn--ghost'}`} onClick={() => setSearchOpen((open) => !open)}><Search size={13} /> Find</button>
            </div>
            {searchOpen && (
                <div className="wad-bin-search">
                    <Search size={13} />
                    <input
                        ref={searchRef}
                        className={`dl-input${search.error ? ' is-error' : ''}`}
                        value={query}
                        placeholder="Find in BIN..."
                        spellCheck={false}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') event.shiftKey ? previousMatch() : nextMatch(); }}
                    />
                    <button className={`wad-bin-search__mode${matchCase ? ' is-active' : ''}`} title="Match case" onClick={() => setMatchCase((value) => !value)}>Aa</button>
                    <button className={`wad-bin-search__mode${regexMode ? ' is-active' : ''}`} title="Use regular expression" onClick={() => setRegexMode((value) => !value)}>.*</button>
                    <small>{search.error ? 'Invalid expression' : query ? search.matches.length ? `${currentMatchIndex + 1} / ${search.matches.length}` : 'No matches' : ''}</small>
                    <button className="dl-btn dl-btn--sm dl-btn--icon dl-btn--ghost" title="Previous match" onClick={previousMatch}><ChevronUp size={13} /></button>
                    <button className="dl-btn dl-btn--sm dl-btn--icon dl-btn--ghost" title="Next match" onClick={nextMatch}><ChevronDown size={13} /></button>
                    <button className="dl-btn dl-btn--sm dl-btn--icon dl-btn--ghost" title="Close search" onClick={closeSearch}><X size={13} /></button>
                </div>
            )}
            <div className="wad-bin-viewer__list" ref={containerRef}>
                <List<CodeRowProps>
                    listRef={listRef}
                    rowCount={visibleRows.length}
                    rowHeight={20}
                    rowComponent={CodeRow}
                    rowProps={rowProps}
                    overscanCount={14}
                    style={{ width: '100%', height }}
                />
            </div>
        </div>
    );
}
