// Simple text-based clip manipulation - copy/paste text blocks.
// Ported 1:1 from clipTextManipulator.js.

/* Delete a complete clip (and its transition references) from animation content. */
export function deleteClip(content: string, clipName: string): string {
    const types = ['AtomicClipData', 'SelectorClipData', 'SequencerClipData', 'ParametricClipData', 'ConditionFloatClipData'];
    const clipStartMatch = matchAnyClip(content, clipName, types);
    if (!clipStartMatch || clipStartMatch.index === undefined) return content;

    const clipStartIndex = clipStartMatch.index;
    const clipEndIndex = findClipEndIndex(content, clipStartIndex);

    let deleteEndIndex = clipEndIndex + 1;
    while (deleteEndIndex < content.length && /\s/.test(content[deleteEndIndex])) deleteEndIndex++;

    const beforeClip = content.substring(0, clipStartIndex);
    const afterClip = content.substring(deleteEndIndex);

    let modifiedContent = beforeClip + afterClip;
    modifiedContent = deleteTransitionClipReferences(modifiedContent, clipName);
    return modifiedContent;
}

/* Extract a complete clip text block, or null if not found. */
export function extractClip(content: string, clipName: string): string | null {
    const types = ['AtomicClipData', 'SelectorClipData', 'SequencerClipData', 'ParametricClipData', 'ConditionFloatClipData'];
    const clipStartMatch = matchAnyClip(content, clipName, types);
    if (!clipStartMatch || clipStartMatch.index === undefined) return null;

    const clipStartIndex = clipStartMatch.index;
    const clipEndIndex = findClipEndIndex(content, clipStartIndex);
    return content.substring(clipStartIndex, clipEndIndex + 1);
}

/* Insert a clip text block at the end of the mClipDataMap section. */
export function insertClip(content: string, clipText: string): string {
    const clipDataMapPattern = /mClipDataMap\s*:\s*map\[hash,pointer\]\s*=\s*{/;
    const clipDataMapMatch = content.match(clipDataMapPattern);
    if (!clipDataMapMatch || clipDataMapMatch.index === undefined) return content;

    const mapStartIndex = clipDataMapMatch.index;
    const mapEndIndex = findClipEndIndex(content, mapStartIndex);

    const beforeInsert = content.substring(0, mapEndIndex);
    const afterInsert = content.substring(mapEndIndex);

    const indentedClipText = '            ' + clipText.replace(/\n/g, '\n            ');
    const insertText = '\n' + indentedClipText + '\n            ';

    return beforeInsert + insertText + afterInsert;
}

/* List every clip name in the file (quoted names only) for UI display. */
export function getAllClipNames(content: string): string[] {
    const patterns = [
        /"([^"]+)"\s*=\s*AtomicClipData\s*{/g,
        /"([^"]+)"\s*=\s*SequencerClipData\s*{/g,
        /"([^"]+)"\s*=\s*SelectorClipData\s*{/g,
        /"([^"]+)"\s*=\s*ParametricClipData\s*{/g,
        /"([^"]+)"\s*=\s*ConditionFloatClipData\s*{/g,
    ];
    const all: string[] = [];
    for (const re of patterns) {
        for (const m of Array.from(content.matchAll(re))) all.push(m[1]);
    }
    return all;
}

function matchAnyClip(content: string, clipName: string, types: string[]): RegExpMatchArray | null {
    const isHash = clipName.startsWith('0x');
    const name = isHash ? clipName : `"${clipName}"`;
    for (const type of types) {
        const pattern = new RegExp(`${name}\\s*=\\s*${type}\\s*{`);
        const match = content.match(pattern);
        if (match) return match;
    }
    return null;
}

function findClipEndIndex(content: string, startIndex: number): number {
    let braceCount = 0;
    let inClip = false;
    for (let i = startIndex; i < content.length; i++) {
        const char = content[i];
        if (char === '{') {
            braceCount++;
            inClip = true;
        } else if (char === '}') {
            braceCount--;
            if (inClip && braceCount === 0) return i;
        }
    }
    return content.length;
}

/* Remove all TransitionClipBlendData entries that reference a given clip. */
function deleteTransitionClipReferences(content: string, clipName: string): string {
    const lines = content.split('\n');
    const resultLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().match(/^\d+\s*=\s*TransitionClipBlendData\s*\{/)) {
            const blockLines = [line];
            let braceCount = 1;
            let j = i + 1;
            while (j < lines.length && braceCount > 0) {
                const nextLine = lines[j];
                blockLines.push(nextLine);
                for (const char of nextLine) {
                    if (char === '{') braceCount++;
                    if (char === '}') braceCount--;
                }
                j++;
            }

            const blockContent = blockLines.join('\n');
            const shouldDelete = clipName.startsWith('0x')
                ? blockContent.includes(`mClipName: hash = ${clipName}`)
                : blockContent.includes(`mClipName: hash = "${clipName}"`);

            if (shouldDelete) {
                i = j - 1;
            } else {
                resultLines.push(...blockLines);
                i = j - 1;
            }
        } else {
            resultLines.push(line);
        }
    }

    return resultLines.join('\n');
}
