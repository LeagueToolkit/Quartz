/**
 * vfxIndexParser.js
 * 
 * A high-performance parser for large VFX Python files.
 * Performs a boundary-only scan to identify VFX systems and their metadata
 * without fully parsing every emitter, providing a significant speedup.
 */

/**
 * Indexes VFX systems in a file content string with maximum performance.
 * @param {string} content - The raw Python file content.
 * @returns {Object} - An object keyed by system key, containing system metadata.
 */
export const indexVfxSystems = (content) => {
    const systems = {};
    // Regex for both "key" = Vfx... and 0x... = Vfx...
    const sysRegex = /(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData\s*\{/gi;

    let match;
    let currentLine = 1;
    let lastScanPos = 0;

    while ((match = sysRegex.exec(content)) !== null) {
        const fullMatch = match[0];
        const systemKeyRaw = match[1] || match[2];
        const startPos = match.index;

        // Fast line counting up to the start of this system
        let pos = content.indexOf('\n', lastScanPos);
        while (pos !== -1 && pos < startPos) {
            currentLine++;
            pos = content.indexOf('\n', pos + 1);
        }
        lastScanPos = startPos;
        const startLine = currentLine;

        // Find closing brace and count lines inside simultaneously
        const openBraceIdx = startPos + fullMatch.length - 1;
        const braceInfo = findClosingBraceAndCountLines(content, openBraceIdx);

        if (braceInfo.endPos === -1) continue;

        const endPos = braceInfo.endPos;
        const endLine = startLine + braceInfo.linesCount;
        const systemContent = content.substring(startPos, endPos + 1);

        // Faster extraction of particleName (limited scope)
        let particleName = null;
        const pNameMatch = systemContent.match(/particleName:\s*string\s*=\s*"([^"]+)"/i);
        if (pNameMatch) {
            particleName = pNameMatch[1];
        }

        // Scan for emitter names
        const emitterNames = [];
        const emitterRegex = /emitterName:\s*string\s*=\s*"([^"]+)"/gi;
        let eMatch;
        while ((eMatch = emitterRegex.exec(systemContent)) !== null) {
            emitterNames.push(eMatch[1]);
        }

        systems[systemKeyRaw] = {
            key: systemKeyRaw,
            name: cleanSystemName(systemKeyRaw),
            particleName,
            emitters: emitterNames.map(name => ({ name, loaded: false })),
            startLine: startLine,
            endLine: endLine,
            offsets: { start: startPos, end: endPos }
        };

        // Preparation for next iteration
        currentLine = endLine;
        lastScanPos = endPos;
    }

    return systems;
};

/**
 * Finds closing brace and counts lines in a single pass.
 */
const findClosingBraceAndCountLines = (content, openingBraceIndex) => {
    let depth = 1;
    let linesCount = 0;
    const len = content.length;
    for (let i = openingBraceIndex + 1; i < len; i++) {
        const char = content[i];
        if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) return { endPos: i, linesCount };
        } else if (char === '\n') {
            linesCount++;
        }
    }
    return { endPos: -1, linesCount };
};

/**
 * Clean system name from key
 */
const cleanSystemName = (fullName) => {
    if (fullName.startsWith('0x')) return fullName;
    const cleanName = fullName.replace(/^"|"$/g, '');
    const lastSlash = cleanName.lastIndexOf('/');
    return lastSlash !== -1 ? cleanName.substring(lastSlash + 1) : cleanName;
};
