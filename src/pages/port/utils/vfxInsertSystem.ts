/* Insert a full VFX system into ritobin .py text and wire ResourceResolver.
   Ported 1:1 from the Electron Quartz vfxInsertSystem util. */

function updateVFXSystemNames(systemContent: string, oldName: string, newName: string): string {
    let updatedContent = systemContent;

    updatedContent = updatedContent.replace(
        new RegExp(`particleName:\\s*string\\s*=\\s*"[^"]*${oldName.split('/').pop()}[^"]*"`, 'g'),
        `particleName: string = "${newName}"`
    );

    updatedContent = updatedContent.replace(
        new RegExp(`particlePath:\\s*string\\s*=\\s*"[^"]*"`, 'g'),
        `particlePath: string = "${newName}"`
    );

    updatedContent = updatedContent.replace(
        /^(?:"[^"]+"|0x[0-9a-fA-F]+)\s*=\s*VfxSystemDefinitionData/m,
        `"${newName}" = VfxSystemDefinitionData`
    );

    return updatedContent;
}

function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function generateUniqueSystemName(originalPy: string, desiredName: string): string {
    let name = desiredName;
    let counter = 2;
    try {
        let pattern = new RegExp(`"${escapeRegExp(name)}"\\s*=\\s*VfxSystemDefinitionData`);

        while (pattern.test(originalPy)) {
            name = `${desiredName}_${counter}`;
            counter += 1;
            pattern = new RegExp(`"${escapeRegExp(name)}"\\s*=\\s*VfxSystemDefinitionData`);

            if (counter > 100) {
                name = `${desiredName}_${Date.now()}`;
                break;
            }
        }
        return name;
    } catch {
        return desiredName;
    }
}

function deriveResolverKey(systemFullContent: string): string | null {
    const m = systemFullContent.match(/particlePath:\s*string\s*=\s*"([^"]+)"/i);
    if (!m) return null;
    const particlePath = m[1];
    const partsIndex = particlePath.indexOf('/Particles/');
    if (partsIndex === -1) return null;
    const base = particlePath.slice(0, partsIndex);
    return `${base}/Resources`;
}

function extractParticlePath(systemFullContent: string): string | null {
    const m = systemFullContent.match(/particlePath:\s*string\s*=\s*"([^"]+)"/i);
    return m ? m[1] : null;
}

function extractSystemHeaderName(systemFullContent: string): string | null {
    const m = systemFullContent.match(/(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
    return m ? (m[1] || m[2]) : null;
}

function findResolverKeyFromSkin(originalPy: string): string | null {
    const m = originalPy.match(/mResourceResolver:\s*link\s*=\s*"([^"]+)"/i);
    return m ? m[1] : null;
}

function computeMappingValue(systemName: string, particlePath: string | null): string {
    let shortName = systemName;

    if (particlePath && particlePath.startsWith('Characters/')) {
        const parts = particlePath.split('/');
        const last = parts[parts.length - 1];
        if (last) shortName = last.replace(/^([^_]+)_Base_/, '$1_');
    } else if (systemName && systemName.includes('/')) {
        const parts = systemName.split('/');
        const last = parts[parts.length - 1];
        if (last) shortName = last.replace(/^([^_]+)_Base_/, '$1_');
    } else if (systemName) {
        shortName = systemName.replace(/^([^_]+)_Base_/, '$1_');
    }

    return shortName;
}

function insertIntoExistingResolver(py: string, systemName: string, resolverKeyName: string | null, particlePath: string | null): string {
    const entryValue = computeMappingValue(systemName, particlePath);
    const baseEntry = `"${entryValue}" = "${systemName}"`;

    let resolverStartIdx = -1;
    if (resolverKeyName) {
        const resolverRe = new RegExp(`"${escapeRegExp(resolverKeyName)}"\\s*=\\s*ResourceResolver\\s*\\{`, 'm');
        const m = py.match(resolverRe);
        if (m && typeof m.index === 'number') resolverStartIdx = m.index;
    }

    if (resolverStartIdx === -1) {
        const allResolverMatches = [...py.matchAll(/"([^"]+)"\s*=\s*ResourceResolver\s*\{/g)];
        if (resolverKeyName) {
            const targetMatch = allResolverMatches.find((m) => m[1] === resolverKeyName);
            if (targetMatch && typeof targetMatch.index === 'number') resolverStartIdx = targetMatch.index;
        }
        if (resolverStartIdx === -1 && allResolverMatches.length > 0 && typeof allResolverMatches[0].index === 'number') {
            resolverStartIdx = allResolverMatches[0].index;
        }
    }

    if (resolverStartIdx === -1) return py;

    const braceOpenIdx = py.indexOf('{', resolverStartIdx);
    if (braceOpenIdx === -1) return py;
    let depth = 0;
    let resolverEndIdx = -1;
    for (let i = braceOpenIdx; i < py.length; i++) {
        const ch = py[i];
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                resolverEndIdx = i;
                break;
            }
        }
    }
    if (resolverEndIdx === -1) return py;

    const resolverBlock = py.slice(resolverStartIdx, resolverEndIdx + 1);
    const headerText = 'resourceMap: map[hash,link] = {';
    const headerLocalIdx = resolverBlock.indexOf(headerText);
    if (headerLocalIdx === -1) return py;
    const headerGlobalIdx = resolverStartIdx + headerLocalIdx;

    const mapBraceOpenIdx = py.indexOf('{', headerGlobalIdx);
    let mapDepth = 0;
    let mapCloseIdx = -1;
    for (let i = mapBraceOpenIdx; i <= resolverEndIdx; i++) {
        const ch = py[i];
        if (ch === '{') mapDepth += 1;
        else if (ch === '}') {
            mapDepth -= 1;
            if (mapDepth === 0) {
                mapCloseIdx = i;
                break;
            }
        }
    }
    if (mapCloseIdx === -1) return py;

    const headerEndOfLine = py.indexOf('\n', headerGlobalIdx);
    const firstEntryLineStart = headerEndOfLine !== -1 ? headerEndOfLine + 1 : headerGlobalIdx + headerText.length;
    const firstEntryLineEnd = py.indexOf('\n', firstEntryLineStart);
    const firstEntryLine = firstEntryLineEnd !== -1 ? py.slice(firstEntryLineStart, firstEntryLineEnd) : '';
    const indentMatch = firstEntryLine.match(/^(\s+)/);
    const indent = indentMatch ? indentMatch[1] : '            ';
    const entryLine = `${indent}${baseEntry}`;

    const mapContent = py.slice(firstEntryLineStart, mapCloseIdx);
    if (mapContent.includes(`"${systemName}" =`)) return py;

    const beforeMapClose = py.slice(0, mapCloseIdx);
    const afterMapClose = py.slice(mapCloseIdx);

    const needsNewline = beforeMapClose.length > 0 && beforeMapClose[beforeMapClose.length - 1] !== '\n';
    const insertChunk = (needsNewline ? '\n' : '') + entryLine + '\n';

    return beforeMapClose + insertChunk + afterMapClose;
}

function appendMinimalResolver(py: string, systemName: string, resolverKeyName: string | null, particlePath: string | null): string {
    const key = resolverKeyName || 'Resources';
    const mappingValue = computeMappingValue(systemName, particlePath);
    const resolver = `\n"${key}" = ResourceResolver {\n    resourceMap: map[hash,link] = {\n        "${mappingValue}" = "${systemName}"\n    }\n}`;
    return py.endsWith('\n') ? py + resolver + '\n' : py + '\n' + resolver + '\n';
}

export function insertVFXSystemIntoFile(originalPy: string, systemFullContent: string, desiredSystemName?: string): string {
    if (!originalPy || !systemFullContent) return originalPy;

    let cleanedSystemContent = systemFullContent;

    const lines = cleanedSystemContent.split('\n');
    const filteredLines: string[] = [];
    let inResourceResolver = false;
    let bracketDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (trimmedLine.includes('= ResourceResolver {')) {
            inResourceResolver = true;
            bracketDepth = 1;
            continue;
        }

        if (inResourceResolver) {
            const openBrackets = (line.match(/{/g) || []).length;
            const closeBrackets = (line.match(/}/g) || []).length;
            bracketDepth += openBrackets - closeBrackets;
            if (bracketDepth <= 0) inResourceResolver = false;
            continue;
        }

        filteredLines.push(line);
    }

    cleanedSystemContent = filteredLines.join('\n').trim();

    const openBrackets = (cleanedSystemContent.match(/\{/g) || []).length;
    const closeBrackets = (cleanedSystemContent.match(/\}/g) || []).length;

    if (closeBrackets > openBrackets) {
        const extraCloseBrackets = closeBrackets - openBrackets;
        let fixedContent = cleanedSystemContent;
        for (let i = 0; i < extraCloseBrackets; i++) {
            fixedContent = fixedContent.replace(/\}\s*$/, '').trim();
        }
        cleanedSystemContent = fixedContent;
    }

    const headerMatch = cleanedSystemContent.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/m);
    const existingHeaderName = headerMatch ? (headerMatch[1] || headerMatch[2]) : null;
    let systemName = desiredSystemName || existingHeaderName || 'NewVFXSystem';

    let insertedSystemContent = cleanedSystemContent;
    if (desiredSystemName && existingHeaderName && desiredSystemName !== existingHeaderName) {
        insertedSystemContent = updateVFXSystemNames(insertedSystemContent, existingHeaderName, desiredSystemName);
    }

    const uniqueName = generateUniqueSystemName(originalPy, systemName);
    if (uniqueName !== systemName) {
        insertedSystemContent = updateVFXSystemNames(insertedSystemContent, systemName, uniqueName);
        systemName = uniqueName;
    }

    if (!/\bparticleName:\s*string\s*=\s*"[^"]*"/.test(insertedSystemContent)) {
        const headerMatchIdx = insertedSystemContent.indexOf('VfxSystemDefinitionData {');
        if (headerMatchIdx !== -1) {
            const headerLineEnd = insertedSystemContent.indexOf('\n', headerMatchIdx);
            const insertPos = headerLineEnd === -1 ? headerMatchIdx + 'VfxSystemDefinitionData {'.length : headerLineEnd + 1;
            const particleLine = `    particleName: string = "${systemName}"\n`;
            insertedSystemContent = insertedSystemContent.slice(0, insertPos) + particleLine + insertedSystemContent.slice(insertPos);
        }
    }

    const hasHeaderEq = /^(?:"[^"]+"|0x[0-9a-fA-F]+)\s*=\s*VfxSystemDefinitionData\s*\{/m.test(insertedSystemContent);
    const startsWithBlock = /^\s*VfxSystemDefinitionData\s*\{/.test(insertedSystemContent);
    if (!hasHeaderEq) {
        if (startsWithBlock) {
            insertedSystemContent = `"${systemName}" = ${insertedSystemContent}`;
        } else {
            insertedSystemContent = `"${systemName}" = VfxSystemDefinitionData {\n${insertedSystemContent}\n}`;
        }
    }

    insertedSystemContent = insertedSystemContent.replace(
        /particleName:\s*string\s*=\s*"[^"]*"/g,
        `particleName: string = "${systemName}"`
    );
    insertedSystemContent = insertedSystemContent.replace(
        /particlePath:\s*string\s*=\s*"[^"]*"/g,
        `particlePath: string = "${systemName}"`
    );

    const resolverKeyFromParticle = deriveResolverKey(insertedSystemContent);
    const resolverKeyFromSkin = findResolverKeyFromSkin(originalPy);
    const resolverKeyName = resolverKeyFromParticle || resolverKeyFromSkin || null;

    const particlePath = extractParticlePath(insertedSystemContent);

    let updated = '';

    const vfxSystemMatches = [...originalPy.matchAll(/"[^"]+"\s*=\s*VfxSystemDefinitionData\s*\{/g)];

    if (vfxSystemMatches.length > 0 && typeof vfxSystemMatches[0].index === 'number') {
        const firstSystemStart = vfxSystemMatches[0].index;
        let lineStart = firstSystemStart;
        while (lineStart > 0 && originalPy[lineStart - 1] !== '\n') lineStart -= 1;

        const before = originalPy.slice(0, lineStart);
        const after = originalPy.slice(lineStart);
        updated = (before.endsWith('\n') ? before : before + '\n') + insertedSystemContent + '\n' + after;
    } else {
        const resolverIdx = originalPy.indexOf('ResourceResolver {');
        if (resolverIdx !== -1) {
            let lineStart = resolverIdx;
            while (lineStart > 0 && originalPy[lineStart - 1] !== '\n') lineStart--;
            const before = originalPy.slice(0, lineStart);
            const after = originalPy.slice(lineStart);
            updated = (before.endsWith('\n') ? before : before + '\n') + insertedSystemContent + '\n' + after;
        } else {
            updated = originalPy + (originalPy.endsWith('\n') ? '' : '\n') + '\n' + insertedSystemContent + '\n';
        }
    }

    if (updated.includes('ResourceResolver {')) {
        updated = insertIntoExistingResolver(updated, systemName, resolverKeyName || null, particlePath);
    } else {
        updated = appendMinimalResolver(updated, systemName, resolverKeyName || null, particlePath);
    }

    return updated;
}

export function insertVFXSystemWithPreservedNames(
    originalPy: string,
    systemFullContent: string,
    desiredSystemName?: string,
    donorPyContent: string | null = null,
    options: { strictResolverCopy?: boolean } = {}
): string {
    if (!originalPy || !systemFullContent) return originalPy;
    const strictResolverCopy = !!options?.strictResolverCopy;
    const fallbackSystemName = (desiredSystemName || extractSystemHeaderName(systemFullContent) || 'NewVFXSystem').trim();

    let updated = '';
    const firstSystemMatch = originalPy.match(/"[^"]+"\s*=\s*VfxSystemDefinitionData\s*\{/m);
    if (firstSystemMatch && typeof firstSystemMatch.index === 'number') {
        const firstSystemStart = firstSystemMatch.index;
        let lineStart = firstSystemStart;
        while (lineStart > 0 && originalPy[lineStart - 1] !== '\n') lineStart -= 1;
        const before = originalPy.slice(0, lineStart);
        const after = originalPy.slice(lineStart);
        updated = (before.endsWith('\n') ? before : before + '\n') + systemFullContent + '\n' + after;
    } else {
        const originalLines = originalPy.split('\n');
        let insertionPoint = -1;
        for (let i = originalLines.length - 1; i >= 0; i--) {
            if (originalLines[i].trim() === '}' && originalLines[i].length === 1) {
                insertionPoint = i;
                break;
            }
        }
        if (insertionPoint === -1) {
            updated = originalPy + '\n\n' + systemFullContent + '\n';
        } else {
            const beforeClosing = originalLines.slice(0, insertionPoint);
            const afterClosing = originalLines.slice(insertionPoint);
            updated = [...beforeClosing, systemFullContent, ...afterClosing].join('\n');
        }
    }

    if (donorPyContent) {
        const resourceResolverEntries = extractResourceResolverEntriesFromDonor(donorPyContent, systemFullContent, strictResolverCopy);

        if (resourceResolverEntries.length > 0) {
            for (const entry of resourceResolverEntries) {
                updated = addResourceResolverEntryDirectly(updated, entry);
            }
        } else {
            updated = addResourceResolverEntryDirectly(updated, `"${fallbackSystemName}" = "${fallbackSystemName}"`);
        }
    } else {
        updated = addResourceResolverEntryDirectly(updated, `"${fallbackSystemName}" = "${fallbackSystemName}"`);
    }

    return updated;
}

function extractResourceResolverEntriesFromDonor(donorPyContent: string, systemFullContent: string, strictResolverCopy = false): string[] {
    const entries: string[] = [];

    const systemName = extractSystemHeaderName(systemFullContent);
    if (!systemName) return entries;

    const resourceResolverPattern = /ResourceResolver\s*{\s*resourceMap\s*:\s*map\[hash,link\]\s*=\s*{([\s\S]*?)}\s*}/g;
    let match: RegExpExecArray | null;

    while ((match = resourceResolverPattern.exec(donorPyContent)) !== null) {
        const resourceMapContent = match[1];

        const entryPattern = /(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/g;
        let entryMatch: RegExpExecArray | null;

        while ((entryMatch = entryPattern.exec(resourceMapContent)) !== null) {
            const key = entryMatch[1] || entryMatch[2];
            const value = entryMatch[3] || entryMatch[4];

            const isMatch = strictResolverCopy
                ? value === systemName || key === systemName
                : value === systemName ||
                  key.includes(systemName.split('/').pop() || '') ||
                  value.includes(systemName.split('/').pop() || '');

            if (isMatch) {
                const formattedEntry = key.startsWith('0x')
                    ? value.startsWith('0x')
                        ? `${key} = ${value}`
                        : `${key} = "${value}"`
                    : value.startsWith('0x')
                      ? `"${key}" = ${value}`
                      : `"${key}" = "${value}"`;
                entries.push(formattedEntry);
            }
        }
    }

    return entries;
}

function addResourceResolverEntryDirectly(content: string, entry: string): string {
    if (content.includes(entry)) return content;

    const lines = content.split('\n');
    let resourceResolverStartLine = -1;
    let resourceResolverEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('ResourceResolver') && lines[i].includes('=')) {
            if (i + 1 < lines.length && lines[i + 1].includes('resourceMap')) {
                resourceResolverStartLine = i;
                break;
            }
        }
    }

    if (resourceResolverStartLine === -1) return content;

    let braceCount = 0;
    let foundOpening = false;
    let foundResourceMap = false;

    for (let i = resourceResolverStartLine; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('resourceMap')) foundResourceMap = true;

        for (const char of line) {
            if (char === '{') {
                braceCount++;
                foundOpening = true;
            } else if (char === '}') {
                braceCount--;
                if (foundResourceMap && foundOpening && braceCount === 1) {
                    resourceResolverEndLine = i;
                    break;
                }
            }
        }

        if (resourceResolverEndLine !== -1) break;
    }

    if (resourceResolverEndLine === -1) return content;

    const newLines = [...lines];
    newLines.splice(resourceResolverEndLine, 0, `            ${entry}`);

    return newLines.join('\n');
}
