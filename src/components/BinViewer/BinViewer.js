import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { List } from 'react-window';

// ─── Tokenizer ────────────────────────────────────────────────────────────────

const TYPE_KW = new Set([
  'type','embed','pointer','link','option','list','map','hash','flag','struct',
  'u8','u16','u32','u64','i8','i16','i32','i64','f32','f64','bool',
  'string','vec2','vec3','vec4','mtx44','rgba','path',
]);
const BOOL_KW = new Set(['true', 'false']);

const RULES = [
  { re: /^(#.*|\/\/.*)/, color: '#6a9955', italic: true },
  { re: /^"(?:[^"\\]|\\.)*"/,              color: '#ce9178' },
  { re: /^0x[0-9a-fA-F]+/,                 color: '#bd93f9' },
  { re: /^-?\d+\.?\d*f/,                   color: '#b5cea8' },
  { re: /^-?\d+\.\d*/,                     color: '#b5cea8' },
  { re: /^-?\d+/,                          color: '#b5cea8' },
  { re: /^[{}]/,                            color: '#ffd700' },
  { re: /^[\[\]]/,                          color: '#da70d6' },
  { re: /^[()]/,                            color: '#179fff' },
  { re: /^[=:,]/,                           color: '#d4d4d4' },
  { re: /^\s+/,                             color: null      },
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
  { re: /^./,                               color: '#c0c0c0' },
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

const LineRow = memo(({ index, style, tokenizedLines, lineMatchesByLine, currentMatch }) => {
  const rawTokens = tokenizedLines[index];
  const lineMatches = lineMatchesByLine[index];
  const curOnLine = currentMatch?.lineIndex === index ? currentMatch : null;
  const segments = lineMatches ? applyHighlights(rawTokens, lineMatches, curOnLine) : rawTokens;

  return (
    <div style={{ ...style, display: 'flex', alignItems: 'center' }}>
      <span style={ROW_S.gutter}>{index + 1}</span>
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
    fontFamily: 'monospace',
    userSelect: 'none',
  },
  code: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 12,
    whiteSpace: 'pre',
    overflow: 'hidden',
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
            if (e.key === 'Enter') { e.shiftKey ? onPrev() : onNext(); }
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
          style={{ ...SRCH_S.chip, opacity: isRegex ? 1 : 0.4, fontFamily: 'monospace' }}
          title="Use regex"
        >.*</button>
      </div>
      <span style={SRCH_S.count}>
        {hasError ? 'bad regex' : query ? (count > 0 ? `${currentIdx + 1} / ${count}` : 'no results') : ''}
      </span>
      <button onClick={onPrev}  style={SRCH_S.navBtn} title="Previous (Shift+Enter)">↑</button>
      <button onClick={onNext}  style={SRCH_S.navBtn} title="Next (Enter)">↓</button>
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
    fontFamily: 'monospace',
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
  const [searchOpen, setSearchOpen]   = useState(false);
  const [query, setQuery]             = useState('');
  const [isRegex, setIsRegex]         = useState(false);
  const [matchCase, setMatchCase]     = useState(false);
  const [currentMatchIdx, setIdx]     = useState(0);
  const listRef      = useRef(null);
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

  // Scroll to match
  useEffect(() => {
    if (currentMatch) listRef.current?.scrollToRow(currentMatch.lineIndex);
  }, [currentMatch]);

  // Reset index when query/options change
  useEffect(() => setIdx(0), [query, isRegex, matchCase]);

  // Ctrl+F
  useEffect(() => {
    const handler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const prev = useCallback(() => setIdx(i => (i - 1 + matches.length) % matches.length), [matches.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % matches.length), [matches.length]);
  const closeSearch = useCallback(() => { setSearchOpen(false); setQuery(''); }, []);

  const rowProps = useMemo(
    () => ({ tokenizedLines, lineMatchesByLine, currentMatch }),
    [tokenizedLines, lineMatchesByLine, currentMatch],
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
    <div style={S.root}>
      {fileName && <div style={S.header}>{fileName}</div>}

      {searchOpen && (
        <SearchBar
          query={query}       onChange={setQuery}
          isRegex={isRegex}   onRegex={() => setIsRegex(v => !v)}
          matchCase={matchCase} onMatchCase={() => setMatchCase(v => !v)}
          count={matches.length} currentIdx={currentMatchIdx}
          onPrev={prev} onNext={next} onClose={closeSearch}
          hasError={regexError}
        />
      )}

      <div ref={containerRef} style={S.listWrap}>
        <List
          ref={listRef}
          width="100%"
          height={height}
          rowCount={lines.length}
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
  listWrap: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
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
