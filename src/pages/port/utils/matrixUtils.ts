const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface ParsedMatrix {
    matrix: number[] | null;
    start: number;
    end: number;
    indent: string;
    propName: string;
}

/* Parse a system's transform matrix from its VfxSystemDefinitionData text block.
   start/end are line indices in the system content (inclusive). */
export const parseSystemMatrix = (systemContent: string): ParsedMatrix => {
    if (!systemContent || typeof systemContent !== 'string') {
        return { matrix: null, start: -1, end: -1, indent: '', propName: 'transform' };
    }

    const lines = systemContent.split('\n');
    const propPattern = /(\s*)(transform)\s*:\s*mtx44\s*=\s*\{/i;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(propPattern);
        if (!m) continue;

        const indent = m[1] || '';
        const propName = m[2] || 'transform';

        const values: number[] = [];
        let end = i;
        for (let j = i + 1; j < lines.length && j < i + 12; j++) {
            const l = lines[j].trim();
            if (l === '}') {
                end = j;
                break;
            }
            const nums = l
                .replace(/\{\s*|\s*\}/g, '')
                .split(',')
                .map((v) => parseFloat(v.trim()))
                .filter((v) => Number.isFinite(v));
            values.push(...nums);
        }

        if (values.length >= 16) return { matrix: values.slice(0, 16), start: i, end, indent, propName };
    }

    return { matrix: null, start: -1, end: -1, indent: '', propName: 'transform' };
};

/* Format an mtx44 block with the provided matrix and indentation. */
export const formatMtx44 = (matrix: number[], indent = '', propName = 'transform'): string => {
    const m = Array.isArray(matrix) && matrix.length >= 16 ? matrix : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const row = (r: number) => m.slice(r * 4, r * 4 + 4).join(', ');
    return [`${indent}${propName}: mtx44 = {`, `${indent}    ${row(0)}`, `${indent}    ${row(1)}`, `${indent}    ${row(2)}`, `${indent}    ${row(3)}`, `${indent}}`].join('\n');
};

/* Upsert a transform matrix into a system's text block: replace if present,
   else insert after particlePath/particleName or the header. */
export const upsertSystemMatrix = (systemContent: string, matrix: number[]): string => {
    if (!systemContent || typeof systemContent !== 'string') return systemContent || '';

    const { matrix: existing, start, end, indent, propName } = parseSystemMatrix(systemContent);
    const formatted = formatMtx44(matrix, indent || '    ', propName);
    const lines = systemContent.split('\n');

    if (existing && start >= 0 && end >= start) {
        const before = lines.slice(0, start);
        const after = lines.slice(end + 1);
        return [...before, formatted, ...after].join('\n');
    }

    let insertIndex = -1;
    let baseIndent = '';
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (/\bparticlePath:\s*string\s*=/i.test(l)) {
            insertIndex = i + 1;
            baseIndent = (l.match(/^(\s*)/) || ['', ''])[1];
            break;
        }
    }
    if (insertIndex === -1) {
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (/\bparticleName:\s*string\s*=/i.test(l)) {
                insertIndex = i + 1;
                baseIndent = (l.match(/^(\s*)/) || ['', ''])[1];
                break;
            }
        }
    }
    if (insertIndex === -1) {
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (/\bsound[A-Za-z]*Default\s*:\s*string\s*=/i.test(l) || /\bflags\s*:\s*u16\s*=/i.test(l)) {
                insertIndex = i;
                baseIndent = (l.match(/^(\s*)/) || ['', ''])[1];
                break;
            }
        }
    }
    if (insertIndex === -1) {
        insertIndex = 1;
        baseIndent = (lines[1] && (lines[1].match(/^(\s*)/) || ['', ''])[1]) || '    ';
    }

    const block = formatMtx44(matrix, baseIndent, 'transform');
    const before = lines.slice(0, insertIndex);
    const after = lines.slice(insertIndex);
    return [...before, block, ...after].join('\n');
};

/* Replace a whole VfxSystemDefinitionData block (matched by key) with new text. */
export const replaceSystemBlockInFile = (fullContent: string, systemKey: string, newSystemContent: string): string => {
    if (!fullContent || !systemKey || !newSystemContent) return fullContent || '';
    const lines = fullContent.split('\n');
    const headerRe = new RegExp(`^\\s*"?${escapeRegex(systemKey)}"?\\s*=\\s*VfxSystemDefinitionData\\s*\\{`, 'i');

    for (let i = 0; i < lines.length; i++) {
        if (!headerRe.test(lines[i])) continue;
        let depth = 1;
        let end = i;
        for (let j = i + 1; j < lines.length; j++) {
            const l = lines[j];
            const opens = (l.match(/\{/g) || []).length;
            const closes = (l.match(/\}/g) || []).length;
            depth += opens - closes;
            if (depth <= 0) {
                end = j;
                break;
            }
        }
        const before = lines.slice(0, i);
        const after = lines.slice(end + 1);
        return [...before, ...newSystemContent.split('\n'), ...after].join('\n');
    }

    return fullContent;
};
