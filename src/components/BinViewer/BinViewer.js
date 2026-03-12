import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { List, useListRef } from 'react-window';
import './BinViewer.css';

const BIN_MONO_FONT = 'Consolas, "Cascadia Mono", "Cascadia Code", "Courier New", monospace';

// ─── Tokenizer ────────────────────────────────────────────────────────────────

const TYPE_KW = new Set([
  'type', 'embed', 'pointer', 'link', 'option', 'list', 'map', 'hash', 'flag', 'struct',
  'u8', 'u16', 'u32', 'u64', 'i8', 'i16', 'i32', 'i64', 'f32', 'f64', 'bool',
  'string', 'vec2', 'vec3', 'vec4', 'mtx44', 'rgba', 'path',
]);
const BOOL_KW = new Set(['true', 'false']);

const RULES = [
  { re: /^(#.*|\/\/.*)/, color: '#6a9955', italic: true },
  { re: /^"(?:[^"\\]|\\.)*"/, color: '#ce9178' },
  { re: /^0x[0-9a-fA-F]+/, color: '#bd93f9' },
  { re: /^-?\d+\.?\d*f/, color: '#b5cea8' },
  { re: /^-?\d+\.\d*/, color: '#b5cea8' },
  { re: /^-?\d+/, color: '#b5cea8' },
  { re: /^[{}]/, color: '#ffd700' },
  { re: /^[\[\]]/, color: '#da70d6' },
  { re: /^[()]/, color: '#179fff' },
  { re: /^[=:,]/, color: '#d4d4d4' },
  { re: /^\s+/, color: null },
  {
    re: /^[A-Za-z_][A-Za-z0-9_]*/,
    color: null,
    resolve(text, rest) {
      if (BOOL_KW.has(text)) return '#569cd6';
      if (TYPE_KW.has(text)) return '#569cd6';
      if (/^[A-Z]/.test(text)) return '#4ec9b0';
      if (/^\s*[:=]/.test(rest)) return '#dcdcaa';
      return '#c0c0c0';
    },
  },
  { re: /^./, color: '#c0c0c0' },
];

function tokenizeLine(line) {
  const tokens = [];
  let pos = 0;
  while (pos < line.length) {
    const slice = line.slice(pos);
    for (const rule of RULES) {
      const m = rule.re.exec(slice);
      if (!m) continue;
      const text = m[0];
      const color = rule.resolve ? rule.resolve(text, slice.slice(text.length)) : rule.color;
      tokens.push({ text, color, italic: rule.italic || false });
      pos += text.length;
      break;
    }
  }
  return tokens;
}

function buildFoldStarts(lines) {
  const stack = [];
  const regions = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = String(lines[lineIndex] || '');
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '{') {
        stack.push(lineIndex);
      } else if (ch === '}') {
        const start = stack.pop();
        if (Number.isInteger(start) && lineIndex > start) {
          regions.push({ start, end: lineIndex });
        }
      }
    }
  }

  const starts = new Map();
  for (const region of regions) {
    const existing = starts.get(region.start);
    if (!existing || region.end > existing.end) {
      starts.set(region.start, region);
    }
  }
  return starts;
}

// ─── Search ───────────────────────────────────────────────────────────────────

function buildMatches(lines, query, isRegex, matchCase) {
  if (!query) return [];
  let re;
  try {
    const src = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(src, matchCase ? 'g' : 'gi');
  } catch { return []; }

  const matches = [];
  for (let li = 0; li < lines.length; li++) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(lines[li])) !== null) {
      matches.push({ lineIndex: li, start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return matches;
}

// Split token spans at match boundaries and tag highlights
function applyHighlights(tokens, lineMatches, currentMatch) {
  if (!lineMatches.length) return tokens;

  const splitPoints = new Set();
  for (const m of lineMatches) { splitPoints.add(m.start); splitPoints.add(m.end); }

  const result = [];
  let charPos = 0;

  for (const tok of tokens) {
    const tokEnd = charPos + tok.text.length;
    const points = [...splitPoints]
      .filter(p => p > charPos && p < tokEnd)
      .sort((a, b) => a - b);

    const cuts = [0, ...points.map(p => p - charPos), tok.text.length];
    for (let i = 0; i < cuts.length - 1; i++) {
      const text = tok.text.slice(cuts[i], cuts[i + 1]);
      if (!text) continue;
      const absStart = charPos + cuts[i];
      const inMatch = lineMatches.find(m => absStart >= m.start && absStart < m.end);
      const isCurrent = inMatch && currentMatch && inMatch.start === currentMatch.start;
      result.push({ text, color: tok.color, italic: tok.italic, highlight: !!inMatch, current: isCurrent });
    }
    charPos = tokEnd;
  }
  return result;
}

// ─── Line row (virtualized) ───────────────────────────────────────────────────

const LINE_H = 20;
const GUTTER_W = 56;

const LineRow = memo(({
  index,
  style,
  visibleRows,
  tokenizedLines,
  lineMatchesByLine,
  currentMatch,
  foldStarts,
  collapsedStarts,
  onToggleFold,
  selectedRange,
  onLineMouseDown,
  onLineMouseEnter,
}) => {
  const row = visibleRows[index];
  if (!row) return null;
  const lineIndex = row.lineIndex;
  const rawTokens = tokenizedLines[lineIndex] || [];
  const lineMatches = lineMatchesByLine[lineIndex];
  const curOnLine = currentMatch?.lineIndex === lineIndex ? currentMatch : null;
  const segments = lineMatches ? applyHighlights(rawTokens, lineMatches, curOnLine) : rawTokens;
  const hasSelection = selectedRange && Number.isInteger(selectedRange.start) && Number.isInteger(selectedRange.end);
  const selFrom = hasSelection ? Math.min(selectedRange.start, selectedRange.end) : -1;
  const selTo = hasSelection ? Math.max(selectedRange.start, selectedRange.end) : -1;
  const isSelected = hasSelection && lineIndex >= selFrom && lineIndex <= selTo;
  const foldRegion = foldStarts.get(lineIndex);
  const canFold = Boolean(foldRegion);
  const isCollapsed = canFold && collapsedStarts.has(lineIndex);
  const hiddenCount = isCollapsed ? Math.max(0, foldRegion.end - foldRegion.start) : 0;

  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        background: isSelected ? 'rgba(90, 125, 180, 0.28)' : undefined,
      }}
      onMouseDown={(e) => onLineMouseDown(lineIndex, e)}
      onMouseEnter={(e) => onLineMouseEnter(lineIndex, e)}
    >
      <span style={ROW_S.gutter}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (canFold) onToggleFold(lineIndex, { expandDescendants: e.shiftKey });
          }}
          style={{
            ...ROW_S.foldBtn,
            visibility: canFold ? 'visible' : 'hidden',
          }}
          title={canFold ? (isCollapsed ? 'Expand block' : 'Collapse block') : ''}
          aria-label={canFold ? (isCollapsed ? 'Expand block' : 'Collapse block') : 'No fold block'}
        >
          <span style={isCollapsed ? ROW_S.foldGlyphCollapsed : ROW_S.foldGlyphExpanded} />
        </button>
        <span style={ROW_S.lineNumber}>{lineIndex + 1}</span>
      </span>
      <span style={ROW_S.code}>
        {segments.map((seg, i) => (
          <span
            key={i}
            style={{
              color: seg.current ? '#1a1a1a' : (seg.color || '#c0c0c0'),
              fontStyle: seg.italic ? 'italic' : undefined,
              background: seg.current ? '#e8c84a' : seg.highlight ? '#3a5070' : undefined,
            }}
          >
            {seg.text}
          </span>
        ))}
        {isCollapsed && (
          <span style={ROW_S.foldSummary}>
            {'  ... '}
            {hiddenCount}
            {' lines'}
          </span>
        )}
      </span>
    </div>
  );
});

const ROW_S = {
  gutter: {
    display: 'inline-block',
    width: GUTTER_W,
    flexShrink: 0,
    textAlign: 'right',
    paddingRight: 14,
    color: '#4a4a4a',
    fontSize: 11,
    fontFamily: BIN_MONO_FONT,
    userSelect: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 0,
  },
  foldBtn: {
    width: 14,
    minWidth: 14,
    height: 14,
    lineHeight: '12px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: '#888',
    cursor: 'pointer',
    fontSize: 10,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    flexShrink: 0,
  },
  lineNumber: {
    marginLeft: 'auto',
    minWidth: 24,
    textAlign: 'right',
  },
  foldGlyphCollapsed: {
    width: 0,
    height: 0,
    borderTop: '4px solid transparent',
    borderBottom: '4px solid transparent',
    borderLeft: '6px solid #8e97a6',
    transform: 'translateX(1px)',
  },
  foldGlyphExpanded: {
    width: 0,
    height: 0,
    borderLeft: '4px solid transparent',
    borderRight: '4px solid transparent',
    borderTop: '6px solid #8e97a6',
    transform: 'translateY(1px)',
  },
  code: {
    flex: 1,
    fontFamily: BIN_MONO_FONT,
    fontSize: 12,
    whiteSpace: 'pre',
    overflow: 'hidden',
  },
  foldSummary: {
    color: '#6f7681',
    fontStyle: 'italic',
  },
};

// ─── Search bar ───────────────────────────────────────────────────────────────

function SearchBar({ query, onChange, isRegex, onRegex, matchCase, onMatchCase,
  count, currentIdx, onPrev, onNext, onClose, hasError }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div style={SRCH_S.bar}>
      <div style={{ ...SRCH_S.inputWrap, borderColor: hasError ? '#e07070' : '#555' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? onPrev() : onNext(); }
            if (e.key === 'ArrowDown') { e.preventDefault(); onNext(); }
            if (e.key === 'ArrowUp') { e.preventDefault(); onPrev(); }
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
          }}
          placeholder="Find…"
          style={SRCH_S.input}
          spellCheck={false}
        />
        <button
          onClick={onMatchCase}
          style={{ ...SRCH_S.chip, opacity: matchCase ? 1 : 0.4 }}
          title="Match case"
        >Aa</button>
        <button
          onClick={onRegex}
          style={{ ...SRCH_S.chip, opacity: isRegex ? 1 : 0.4, fontFamily: BIN_MONO_FONT }}
          title="Use regex"
        >.*</button>
      </div>
      <span style={SRCH_S.count}>
        {hasError ? 'bad regex' : query ? (count > 0 ? `${currentIdx + 1} / ${count}` : 'no results') : ''}
      </span>
      <button onClick={onPrev} style={SRCH_S.navBtn} title="Previous (Shift+Enter)">↑</button>
      <button onClick={onNext} style={SRCH_S.navBtn} title="Next (Enter)">↓</button>
      <button onClick={onClose} style={{ ...SRCH_S.navBtn, marginLeft: 2 }} title="Close">✕</button>
    </div>
  );
}

const SRCH_S = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 10px',
    background: '#252526',
    borderBottom: '1px solid #333',
    flexShrink: 0,
  },
  inputWrap: {
    display: 'flex',
    alignItems: 'center',
    background: '#1e1e1e',
    border: '1px solid #555',
    borderRadius: 4,
    overflow: 'hidden',
    flex: 1,
    maxWidth: 320,
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    padding: '3px 8px',
    fontSize: 12,
    color: '#c0c0c0',
    fontFamily: BIN_MONO_FONT,
  },
  chip: {
    background: 'transparent',
    border: 'none',
    borderLeft: '1px solid #3a3a3a',
    color: '#c0c0c0',
    cursor: 'pointer',
    fontSize: 11,
    padding: '3px 6px',
    lineHeight: 1,
  },
  count: {
    fontSize: 11,
    color: '#888',
    minWidth: 72,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  navBtn: {
    background: 'none',
    border: '1px solid #3a3a3a',
    borderRadius: 3,
    color: '#c0c0c0',
    cursor: 'pointer',
    fontSize: 13,
    padding: '1px 6px',
    lineHeight: '16px',
  },
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function BinViewer({ content, loading, error, fileName }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [currentMatchIdx, setIdx] = useState(0);
  const [selectedRange, setSelectedRange] = useState(null);
  const [collapsedStarts, setCollapsedStarts] = useState(() => new Set());
  const [viewerActive, setViewerActive] = useState(false);
  const viewerActiveRef = useRef(false);
  const dragAnchorRef = useRef(null);
  const draggingRef = useRef(false);
  const listRef = useListRef();
  const containerRef = useRef(null);
  const [height, setHeight] = useState(400);

  // Measure container height for react-window
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setHeight(e.contentRect.height));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Lines + tokenization (memoized)
  const lines = useMemo(() => (content ?? '').split('\n'), [content]);
  const tokenizedLines = useMemo(() => lines.map(tokenizeLine), [lines]);
  const foldStarts = useMemo(() => buildFoldStarts(lines), [lines]);
  const foldableStarts = useMemo(() => Array.from(foldStarts.keys()).sort((a, b) => a - b), [foldStarts]);
  const visibleRows = useMemo(() => {
    if (!lines.length) return [{ lineIndex: 0 }];
    const rows = [];
    for (let lineIndex = 0; lineIndex < lines.length;) {
      rows.push({ lineIndex });
      if (collapsedStarts.has(lineIndex)) {
        const region = foldStarts.get(lineIndex);
        if (region) {
          lineIndex = region.end + 1;
          continue;
        }
      }
      lineIndex += 1;
    }
    return rows;
  }, [lines, foldStarts, collapsedStarts]);
  const lineToVisibleIndex = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < visibleRows.length; i++) {
      map.set(visibleRows[i].lineIndex, i);
    }
    return map;
  }, [visibleRows]);

  // Search matches
  const [regexError, setRegexError] = useState(false);
  const matches = useMemo(() => {
    if (!query) { setRegexError(false); return []; }
    try {
      const src = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      new RegExp(src); // validate
      setRegexError(false);
      return buildMatches(lines, query, isRegex, matchCase);
    } catch {
      setRegexError(true);
      return [];
    }
  }, [lines, query, isRegex, matchCase]);

  const lineMatchesByLine = useMemo(() => {
    const map = {};
    for (const m of matches) (map[m.lineIndex] = map[m.lineIndex] || []).push(m);
    return map;
  }, [matches]);

  const currentMatch = matches[currentMatchIdx] ?? null;

  const ensureLineVisible = useCallback((lineIndex) => {
    if (lineToVisibleIndex.has(lineIndex)) return false;
    let collapsedAncestor = null;
    for (const start of collapsedStarts) {
      const region = foldStarts.get(start);
      if (!region) continue;
      if (lineIndex > region.start && lineIndex <= region.end) {
        if (collapsedAncestor == null || start > collapsedAncestor) collapsedAncestor = start;
      }
    }
    if (collapsedAncestor == null) return false;
    setCollapsedStarts((prev) => {
      const next = new Set(prev);
      next.delete(collapsedAncestor);
      return next;
    });
    return true;
  }, [lineToVisibleIndex, collapsedStarts, foldStarts]);

  // Scroll to match
  useEffect(() => {
    if (!currentMatch) return;
    if (ensureLineVisible(currentMatch.lineIndex)) return;
    const visibleIndex = lineToVisibleIndex.get(currentMatch.lineIndex);
    if (!Number.isInteger(visibleIndex)) return;
    listRef.current?.scrollToRow({
      index: visibleIndex,
      align: 'center',
      behavior: 'auto',
    });
  }, [currentMatch, listRef, ensureLineVisible, lineToVisibleIndex]);

  // Reset index when query/options change
  useEffect(() => setIdx(0), [query, isRegex, matchCase]);

  useEffect(() => {
    if (matches.length === 0) {
      setIdx(0);
      return;
    }
    setIdx(i => Math.min(i, matches.length - 1));
  }, [matches.length]);

  useEffect(() => {
    setSelectedRange(null);
    setCollapsedStarts(new Set());
  }, [content, fileName]);

  const toggleFold = useCallback((lineIndex, options = {}) => {
    const expandDescendants = Boolean(options?.expandDescendants);
    setCollapsedStarts((prev) => {
      const next = new Set(prev);
      const isCollapsed = next.has(lineIndex);
      if (isCollapsed) {
        next.delete(lineIndex);
        if (expandDescendants) {
          const region = foldStarts.get(lineIndex);
          if (region) {
            for (const start of Array.from(next)) {
              if (start > region.start && start <= region.end) next.delete(start);
            }
          }
        }
      } else {
        next.add(lineIndex);
      }
      return next;
    });
  }, [foldStarts]);

  const collapseAll = useCallback(() => {
    setCollapsedStarts(new Set(foldableStarts));
  }, [foldableStarts]);

  const expandAll = useCallback(() => {
    setCollapsedStarts(new Set());
  }, []);

  const handleMouseDown = useCallback(() => {
    setViewerActive(true);
    viewerActiveRef.current = true;
    containerRef.current?.focus?.({ preventScroll: true });
  }, []);

  const handleCopy = useCallback((e) => {
    if (!selectedRange) return;
    const from = Math.min(selectedRange.start, selectedRange.end);
    const to = Math.max(selectedRange.start, selectedRange.end);
    const text = lines.slice(from, to + 1).join('\n');
    e.preventDefault();
    e.clipboardData?.setData('text/plain', text);
  }, [selectedRange, lines]);

  const copySelectedText = useCallback(async () => {
    let text = '';
    if (selectedRange) {
      const from = Math.min(selectedRange.start, selectedRange.end);
      const to = Math.max(selectedRange.start, selectedRange.end);
      text = lines.slice(from, to + 1).join('\n');
    } else {
      text = String(content ?? '');
    }
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // fallback below
      }
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(textarea);
  }, [selectedRange, lines, content]);

  const onLineMouseDown = useCallback((lineIndex, e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setViewerActive(true);
    viewerActiveRef.current = true;
    containerRef.current?.focus?.({ preventScroll: true });
    dragAnchorRef.current = lineIndex;
    draggingRef.current = true;
    setSelectedRange({ start: lineIndex, end: lineIndex });
  }, []);

  const onLineMouseEnter = useCallback((lineIndex) => {
    if (!draggingRef.current) return;
    const anchor = dragAnchorRef.current ?? lineIndex;
    setSelectedRange({ start: anchor, end: lineIndex });
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = String(e.key || '').toLowerCase();

    if (key === 'f') {
      e.preventDefault();
      setSearchOpen(true);
      return;
    }
    if (key === 'a') {
      e.preventDefault();
      setSelectedRange({ start: 0, end: Math.max(0, lines.length - 1) });
      return;
    }
    if (key === 'c' && selectedRange) {
      e.preventDefault();
      copySelectedText();
    }
  }, [selectedRange, copySelectedText, lines.length]);

  useEffect(() => {
    const onWindowMouseDown = (event) => {
      if (containerRef.current?.contains(event.target)) return;
      setViewerActive(false);
      viewerActiveRef.current = false;
      draggingRef.current = false;
      dragAnchorRef.current = null;
    };
    const onWindowMouseUp = () => {
      draggingRef.current = false;
      dragAnchorRef.current = null;
    };

    const onWindowKeyDownCapture = (event) => {
      if (!viewerActiveRef.current) return;
      if (!(event.ctrlKey || event.metaKey)) return;

      const target = event.target;
      const tag = String(target?.tagName || '').toLowerCase();
      const isEditable = target?.isContentEditable || tag === 'input' || tag === 'textarea';
      if (isEditable) return;

      const key = String(event.key || '').toLowerCase();
      if (key === 'a') {
        event.preventDefault();
        event.stopPropagation();
        setSelectedRange({ start: 0, end: Math.max(0, lines.length - 1) });
        return;
      }
      if (key === 'c' && selectedRange) {
        event.preventDefault();
        event.stopPropagation();
        copySelectedText();
      }
    };

    window.addEventListener('mousedown', onWindowMouseDown, true);
    window.addEventListener('mouseup', onWindowMouseUp, true);
    window.addEventListener('keydown', onWindowKeyDownCapture, true);
    return () => {
      window.removeEventListener('mousedown', onWindowMouseDown, true);
      window.removeEventListener('mouseup', onWindowMouseUp, true);
      window.removeEventListener('keydown', onWindowKeyDownCapture, true);
    };
  }, [selectedRange, copySelectedText, lines.length]);

  const prev = useCallback(() => {
    if (matches.length === 0) return;
    setIdx(i => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);
  const next = useCallback(() => {
    if (matches.length === 0) return;
    setIdx(i => (i + 1) % matches.length);
  }, [matches.length]);
  const closeSearch = useCallback(() => { setSearchOpen(false); setQuery(''); }, []);

  const rowProps = useMemo(
    () => ({
      visibleRows,
      tokenizedLines,
      lineMatchesByLine,
      currentMatch,
      foldStarts,
      collapsedStarts,
      onToggleFold: toggleFold,
      selectedRange,
      onLineMouseDown,
      onLineMouseEnter,
    }),
    [
      visibleRows,
      tokenizedLines,
      lineMatchesByLine,
      currentMatch,
      foldStarts,
      collapsedStarts,
      toggleFold,
      selectedRange,
      onLineMouseDown,
      onLineMouseEnter,
    ],
  );

  // ── States ──
  if (loading) {
    return (
      <div style={{ ...S.root, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={S.spinner} />
        <span style={S.muted}>Converting bin…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ ...S.root, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#e07070', fontSize: 12, textAlign: 'center', padding: '0 16px' }}>{error}</span>
      </div>
    );
  }
  if (content == null) {
    return (
      <div style={{ ...S.root, alignItems: 'center', justifyContent: 'center' }}>
        <span style={S.muted}>Select a .bin file to preview</span>
      </div>
    );
  }

  return (
    <div className="bin-viewer-root" style={S.root}>
      {fileName && <div style={S.header}>{fileName}</div>}
      <div style={S.foldBar}>
        <button
          type="button"
          style={S.foldBtn}
          onClick={collapseAll}
          disabled={foldableStarts.length === 0}
          title="Collapse all foldable blocks"
        >
          Collapse All
        </button>
        <button
          type="button"
          style={S.foldBtn}
          onClick={expandAll}
          disabled={collapsedStarts.size === 0}
          title="Expand all collapsed blocks"
        >
          Expand All
        </button>
      </div>

      {searchOpen && (
        <SearchBar
          query={query} onChange={setQuery}
          isRegex={isRegex} onRegex={() => setIsRegex(v => !v)}
          matchCase={matchCase} onMatchCase={() => setMatchCase(v => !v)}
          count={matches.length} currentIdx={currentMatchIdx}
          onPrev={prev} onNext={next} onClose={closeSearch}
          hasError={regexError}
        />
      )}

      <div
        ref={containerRef}
        style={S.listWrap}
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onCopy={handleCopy}
        onKeyDown={handleKeyDown}
      >
        {selectedRange && (
          <div style={S.selectionBadge}>
            {`${Math.abs(selectedRange.end - selectedRange.start) + 1} lines selected`}
          </div>
        )}
        {viewerActive && !selectedRange && (
          <div style={S.selectionHint}>Drag lines to select, then Ctrl/Cmd+C</div>
        )}
        <List
          listRef={listRef}
          width="100%"
          height={height}
          rowCount={visibleRows.length}
          rowHeight={LINE_H}
          rowComponent={LineRow}
          rowProps={rowProps}
          overscanRowCount={12}
          style={{ overflowX: 'hidden' }}
        />
      </div>
    </div>
  );
}

const S = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    color: '#c0c0c0',
  },
  header: {
    padding: '5px 10px',
    fontSize: 11,
    color: '#606060',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 0,
  },
  foldBar: {
    display: 'flex',
    gap: 6,
    padding: '4px 10px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.015)',
    flexShrink: 0,
  },
  foldBtn: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4,
    color: '#c0c0c0',
    fontSize: 11,
    padding: '2px 8px',
    cursor: 'pointer',
  },
  listWrap: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
    userSelect: 'none',
  },
  selectionBadge: {
    position: 'absolute',
    top: 8,
    right: 10,
    zIndex: 5,
    pointerEvents: 'none',
    fontSize: 11,
    color: '#e8c84a',
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(232,200,74,0.35)',
    borderRadius: 4,
    padding: '2px 6px',
  },
  selectionHint: {
    position: 'absolute',
    top: 8,
    right: 10,
    zIndex: 5,
    pointerEvents: 'none',
    fontSize: 11,
    color: '#8ea8c8',
    background: 'rgba(0,0,0,0.35)',
    border: '1px solid rgba(142,168,200,0.3)',
    borderRadius: 4,
    padding: '2px 6px',
  },
  muted: { color: '#555', fontSize: 12 },
  spinner: {
    width: 18,
    height: 18,
    border: '2px solid #333',
    borderTop: '2px solid #569cd6',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
};
