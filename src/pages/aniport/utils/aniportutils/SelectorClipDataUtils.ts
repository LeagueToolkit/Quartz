// SelectorClipDataUtils - managing SelectorClipData in AniPort.
// Ported from SelectorClipDataUtils.js. The fs/React-state plumbing of the original
// is hoisted into AniPort.tsx; these functions are pure content transforms that
// return the modified ritobin text (or throw with a user-facing message).

const locateSelectorClip = (content: string, selectorClipName: string): { start: number; end: number; block: string } => {
    const escaped = selectorClipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const clipPattern = selectorClipName.startsWith('0x')
        ? new RegExp(`${selectorClipName}\\s*=\\s*SelectorClipData\\s*{`)
        : new RegExp(`"${escaped}"\\s*=\\s*SelectorClipData\\s*{`);
    const match = content.match(clipPattern);
    if (!match || match.index === undefined) throw new Error(`Selector clip "${selectorClipName}" not found`);

    const start = match.index;
    let brace = 0;
    let inBlock = false;
    let end = start;
    for (let i = start; i < content.length; i++) {
        const ch = content[i];
        if (ch === '{') {
            brace++;
            inBlock = true;
        } else if (ch === '}') {
            brace--;
            if (inBlock && brace === 0) {
                end = i;
                break;
            }
        }
    }
    return { start, end, block: content.substring(start, end + 1) };
};

/* Add a SelectorPairData entry. Returns { content } or { duplicate: true }. */
export function addSelectorPair(
    content: string,
    selectorClipName: string,
    childClipName: string,
    probability: number,
): { content: string; duplicate?: boolean } {
    const { start, end, block } = locateSelectorClip(content, selectorClipName);

    let updatedClip = block;
    const listStartMatch = block.match(/(mSelectorPairDataList|0x[0-9a-fA-F]+)\s*:\s*list\[embed\]\s*=\s*{/);
    if (!listStartMatch) {
        const firstLineEnd = block.indexOf('\n');
        const before = block.substring(0, firstLineEnd + 1);
        const after = block.substring(firstLineEnd + 1);
        updatedClip = `${before}                mSelectorPairDataList: list[embed] = {\n                }\n${after}`;
    }

    const listStart = updatedClip.search(/(mSelectorPairDataList|0x[0-9a-fA-F]+)\s*:\s*list\[embed\]\s*=\s*{/);
    let insertPos = -1;
    if (listStart >= 0) {
        let depth = 0;
        let foundStart = false;
        for (let i = listStart; i < updatedClip.length; i++) {
            const c = updatedClip[i];
            if (c === '{') {
                depth++;
                foundStart = true;
            } else if (c === '}') {
                depth--;
                if (foundStart && depth === 0) {
                    insertPos = i;
                    break;
                }
            }
        }
    }
    if (insertPos === -1) throw new Error('Could not locate mSelectorPairDataList closing brace');

    const existingListSection = updatedClip.substring(listStart, insertPos);
    if (existingListSection.includes(`"${childClipName}"`) || existingListSection.includes(childClipName)) {
        return { content, duplicate: true };
    }

    const useQuoted = !childClipName.startsWith('0x');
    const clipNameValue = useQuoted ? `"${childClipName}"` : childClipName;
    const selectorPairEntry = `\n                    SelectorPairData {\n                        mClipName: hash = ${clipNameValue}\n                        mProbability: f32 = ${probability}\n                    }`;
    const updatedClipWithPair = updatedClip.substring(0, insertPos) + selectorPairEntry + updatedClip.substring(insertPos);

    return { content: content.substring(0, start) + updatedClipWithPair + content.substring(end + 1) };
}

/* Remove the SelectorPairData at pairIndex. */
export function removeSelectorPair(content: string, selectorClipName: string, pairIndex: number): string {
    const { start, end, block } = locateSelectorClip(content, selectorClipName);

    const lines = block.split('\n');
    let pairCount = 0;
    let pairStartLine = -1;
    let pairEndLine = -1;
    let inPair = false;
    let pairBraceCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === 'SelectorPairData {') {
            if (pairCount === pairIndex) {
                pairStartLine = i;
                inPair = true;
                pairBraceCount = 1;
            }
            pairCount++;
        } else if (inPair) {
            for (const char of line) {
                if (char === '{') pairBraceCount++;
                if (char === '}') pairBraceCount--;
            }
            if (pairBraceCount === 0) {
                pairEndLine = i;
                break;
            }
        }
    }

    if (pairStartLine === -1 || pairEndLine === -1) throw new Error(`Could not find selector pair at index ${pairIndex}`);

    const updatedLines = [...lines];
    updatedLines.splice(pairStartLine, pairEndLine - pairStartLine + 1);
    const updatedClipBlock = updatedLines.join('\n');

    return content.substring(0, start) + updatedClipBlock + content.substring(end + 1);
}

/* Update the mProbability of a SelectorPairData. Throws on invalid input. */
export function updateSelectorPairProbability(
    content: string,
    selectorClipName: string,
    pairIndex: number,
    newProbability: number,
): string {
    if (isNaN(newProbability) || newProbability < 0 || newProbability > 1) {
        throw new Error('Probability must be between 0.0 and 1.0');
    }

    const { start, end, block } = locateSelectorClip(content, selectorClipName);
    const lines = block.split('\n');
    let pairCount = 0;
    let pairStartLine = -1;
    let pairEndLine = -1;
    let inPair = false;
    let pairBraceCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === 'SelectorPairData {') {
            if (pairCount === pairIndex) {
                pairStartLine = i;
                inPair = true;
                pairBraceCount = 1;
            }
            pairCount++;
        } else if (inPair) {
            for (const char of line) {
                if (char === '{') pairBraceCount++;
                if (char === '}') pairBraceCount--;
            }
            if (pairBraceCount === 0) {
                pairEndLine = i;
                break;
            }
        }
    }

    if (pairStartLine === -1 || pairEndLine === -1) throw new Error(`Could not find selector pair at index ${pairIndex}`);

    const updatedLines = [...lines];
    for (let i = pairStartLine; i <= pairEndLine; i++) {
        if (updatedLines[i].includes('mProbability:')) {
            updatedLines[i] = updatedLines[i].replace(/mProbability:\s*f32\s*=\s*[0-9.]+/, `mProbability: f32 = ${newProbability}`);
            break;
        }
    }

    const updatedClipBlock = updatedLines.join('\n');
    return content.substring(0, start) + updatedClipBlock + content.substring(end + 1);
}

/* Delete the entire SelectorClipData container. */
export function deleteSelectorClipData(content: string, selectorClipName: string): string {
    const { start, end } = locateSelectorClip(content, selectorClipName);
    return content.substring(0, start) + content.substring(end + 1);
}

/* Minimal SelectorClipData container text for the create-new-clip flow. */
export function generateSelectorClipDataText(clipName: string): string {
    const useQuoted = !clipName.startsWith('0x');
    const clipNameValue = useQuoted ? `"${clipName}"` : clipName;
    return [
        `${clipNameValue} = SelectorClipData {`,
        '                mSelectorPairDataList: list[embed] = {',
        '                }',
        '            }',
    ].join('\n');
}

/* Add an event's raw content to a SelectorClipData's mEventDataMap. */
export function addEventToSelectorClipDataContent(content: string, clipName: string, eventRawContent: string): string {
    const escaped = clipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const clipPattern = clipName.startsWith('0x')
        ? new RegExp(`${clipName}\\s*=\\s*SelectorClipData\\s*{`)
        : new RegExp(`"${escaped}"\\s*=\\s*SelectorClipData\\s*{`);

    const match = content.match(clipPattern);
    if (!match || match.index === undefined) throw new Error(`SelectorClipData "${clipName}" not found in file`);

    const clipStartIndex = match.index;
    let braceCount = 0;
    let clipEndIndex = clipStartIndex;
    let inClip = false;
    for (let i = clipStartIndex; i < content.length; i++) {
        const char = content[i];
        if (char === '{') {
            braceCount++;
            inClip = true;
        } else if (char === '}') {
            braceCount--;
            if (inClip && braceCount === 0) {
                clipEndIndex = i;
                break;
            }
        }
    }

    const clipContent = content.substring(clipStartIndex, clipEndIndex + 1);
    const eventDataMapPattern = /mEventDataMap\s*:\s*map\[hash,pointer\]\s*=\s*{([^}]*)}/;
    const eventDataMapMatch = clipContent.match(eventDataMapPattern);

    let modifiedClipContent: string;
    if (eventDataMapMatch) {
        const eventDataMapContent = eventDataMapMatch[1];
        const updatedEventDataMap = eventDataMapContent + `\n${eventRawContent}`;
        modifiedClipContent = clipContent.replace(eventDataMapPattern, `mEventDataMap: map[hash,pointer] = {${updatedEventDataMap}\n    }`);
    } else {
        const eventEntry = `\n    mEventDataMap: map[hash,pointer] = {\n${eventRawContent}\n    }`;
        const insertPos = clipContent.lastIndexOf('}');
        modifiedClipContent = clipContent.substring(0, insertPos) + eventEntry + '\n' + clipContent.substring(insertPos);
    }

    return content.substring(0, clipStartIndex) + modifiedClipContent + content.substring(clipEndIndex + 1);
}
