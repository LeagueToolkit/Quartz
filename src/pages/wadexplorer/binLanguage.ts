/* Syntax highlighting + folding for the League BIN text dump shown in the WAD
 * explorer's preview pane.
 *
 * The dump is a config-like format (`field: type = Value { ... }`), so a
 * StreamLanguage tokenizer is the right tool - it needs no Lezer grammar and
 * highlights line by line. Folding is brace-based and supplied by a foldService
 * that scans for the block a line opens. */

import { StreamLanguage, HighlightStyle, foldService } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { EditorState } from '@codemirror/state';

const TYPE_KEYWORDS = new Set([
    'type', 'embed', 'pointer', 'link', 'option', 'list', 'map', 'hash', 'flag', 'struct',
    'u8', 'u16', 'u32', 'u64', 'i8', 'i16', 'i32', 'i64', 'f32', 'f64', 'bool',
    'string', 'vec2', 'vec3', 'vec4', 'mtx44', 'rgba', 'path', 'true', 'false', 'nil',
]);

/** Token names map to the default StreamLanguage token table, then to the
 *  HighlightStyle below. Mirrors the previous hand-rolled tokenizer's classes. */
export const binLanguage = StreamLanguage.define({
    name: 'leaguebin',
    token(stream) {
        if (stream.eatSpace()) return null;
        // Comments run to end of line.
        if (stream.match(/^(#|\/\/|;)/)) { stream.skipToEnd(); return 'comment'; }
        if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string';
        // Hex before decimal so `0x...` is not split at the leading `0`.
        if (stream.match(/^0x[0-9a-f]+/i)) return 'number';
        if (stream.match(/^-?(?:\d+\.\d*|\d*\.\d+|\d+)(?:e[+-]?\d+)?f?/i)) return 'number';
        const word = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/) as RegExpMatchArray | null;
        if (word) {
            const text = word[0];
            if (TYPE_KEYWORDS.has(text.toLowerCase())) return 'keyword';
            if (/^[A-Z]/.test(text)) return 'typeName';
            // `name:` / `name =` is a field.
            if (/^\s*[:=]/.test(stream.string.slice(stream.pos))) return 'propertyName';
            return null;
        }
        const char = stream.next();
        if (char === '{' || char === '}') return 'brace';
        if (char === '[' || char === ']') return 'squareBracket';
        if (char === '(' || char === ')') return 'paren';
        if (char && '=:,'.includes(char)) return 'punctuation';
        return null;
    },
    tokenTable: {
        brace: t.brace,
        paren: t.paren,
        punctuation: t.punctuation,
    },
});

export const binHighlightStyle = HighlightStyle.define([
    { tag: t.comment, color: '#6a9955', fontStyle: 'italic' },
    { tag: t.string, color: '#ce9178' },
    { tag: t.number, color: '#b5cea8' },
    { tag: t.keyword, color: '#6aa9e9' },
    { tag: t.typeName, color: '#4ec9b0' },
    { tag: t.propertyName, color: '#dcdcaa' },
    { tag: t.brace, color: '#ffd75f' },
    { tag: t.squareBracket, color: '#da70d6' },
    { tag: t.paren, color: '#4aa5f0' },
    { tag: t.punctuation, color: '#d4d4d4' },
]);

/** Braces inside strings and comments are not fold delimiters. */
function scanBraces(line: string, onOpen: () => void, onClose: () => boolean): void {
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
            continue;
        }
        if (char === '"') { quoted = true; continue; }
        if (char === '#' || char === ';' || (char === '/' && line[i + 1] === '/')) break;
        if (char === '{') onOpen();
        else if (char === '}' && onClose()) return;
    }
}

/** Fold range for a line that opens a block: from end-of-line to the matching
 *  `}`. Scans forward only, so cost is proportional to the folded block. */
export const binFoldService = foldService.of((state: EditorState, lineStart: number, lineEnd: number) => {
    const line = state.doc.lineAt(lineStart);
    let depth = 0;
    scanBraces(line.text, () => { depth++; }, () => { if (depth > 0) depth--; return false; });
    if (depth <= 0) return null;

    for (let n = line.number + 1; n <= state.doc.lines; n++) {
        const next = state.doc.line(n);
        let closeAt = -1;
        scanBraces(
            next.text,
            () => { depth++; },
            () => {
                depth--;
                if (depth === 0) { closeAt = next.from; return true; }
                return false;
            },
        );
        if (closeAt >= 0) {
            // Fold from the end of the opening line to just before the closer.
            const to = Math.max(lineEnd, closeAt);
            return to > lineEnd ? { from: lineEnd, to } : null;
        }
    }
    return null;
});

/** Line numbers of every foldable block start, for Collapse All. */
export function foldableLines(state: EditorState): number[] {
    const starts: number[] = [];
    const stack: number[] = [];
    for (let n = 1; n <= state.doc.lines; n++) {
        const text = state.doc.line(n).text;
        scanBraces(
            text,
            () => stack.push(n),
            () => {
                const open = stack.pop();
                // Only a block spanning more than one line is foldable.
                if (open !== undefined && n > open) starts.push(open);
                return false;
            },
        );
    }
    return starts;
}
