/*
 * ParticleRandomizer core logic — operates on ritobin text.
 * Ported 1:1 from the Electron Quartz ParticleRandomizer.js.
 */

import type { ParsedFile } from './parser';

export interface VfxBlock {
    start: number;
    end: number;
    block: string;
}

export interface AssetEntry {
    original: string;
    filename: string;
}

export type AssetsByFolder = Record<string, AssetEntry[]>;

export function findVfxBlock(content: string, entryPath: string): VfxBlock | null {
    const startPattern = `"${entryPath}" = VfxSystemDefinitionData {`;
    const startIndex = content.indexOf(startPattern);
    if (startIndex === -1) return null;
    let braceCount = 0;
    let inBlock = false;
    let endIndex = startIndex;
    for (let i = startIndex; i < content.length; i++) {
        if (content[i] === '{') {
            braceCount++;
            inBlock = true;
        } else if (content[i] === '}') {
            braceCount--;
            if (inBlock && braceCount === 0) {
                endIndex = i + 1;
                break;
            }
        }
    }
    return { start: startIndex, end: endIndex, block: content.substring(startIndex, endIndex) };
}

/* Find a named VfxEmitterDefinitionData block within a system block string.
   Returns { start, end, indent } — indices into blockContent. */
export function findEmitterInBlock(
    blockContent: string,
    emitterName: string
): { start: number; end: number; indent: string } | null {
    const emitterRegex = /VfxEmitterDefinitionData\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = emitterRegex.exec(blockContent)) !== null) {
        const tokenStart = match.index;
        let braceCount = 0;
        let inBlock = false;
        let blockEnd = tokenStart;
        for (let i = tokenStart; i < blockContent.length; i++) {
            if (blockContent[i] === '{') {
                braceCount++;
                inBlock = true;
            } else if (blockContent[i] === '}') {
                braceCount--;
                if (inBlock && braceCount === 0) {
                    blockEnd = i + 1;
                    break;
                }
            }
        }
        const emBlock = blockContent.substring(tokenStart, blockEnd);
        const nameMatch = emBlock.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
        if (nameMatch && nameMatch[1] === emitterName) {
            // Walk back to start of line to capture leading whitespace (indent)
            let lineStart = tokenStart;
            while (lineStart > 0 && blockContent[lineStart - 1] !== '\n') lineStart--;
            const leadingWs = blockContent.substring(lineStart, tokenStart);
            const indent = /^\s*$/.test(leadingWs) ? leadingWs : '            ';
            return { start: lineStart, end: blockEnd, indent };
        }
    }
    return null;
}

// Build the randomizer emitter block that references N variant system paths.
export function buildRandomizerEmitter(emitterName: string, variantPaths: string[], indent: string): string {
    const l1 = indent + '    ';
    const l2 = indent + '        ';
    const l3 = indent + '            ';
    const l4 = indent + '                ';
    const l5 = indent + '                    ';
    const l6 = indent + '                        ';

    const childrenIds = variantPaths
        .map((path) => `${l3}VfxChildIdentifier {\n${l4}effectKey: hash = "${path}"\n${l3}}`)
        .join('\n');

    const n = variantPaths.length;

    return `${indent}VfxEmitterDefinitionData {
${l1}rate: embed = ValueFloat {
${l2}constantValue: f32 = 1
${l1}}
${l1}isSingleParticle: flag = true
${l1}childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData {
${l2}childrenIdentifiers: list[embed] = {
${childrenIds}
${l2}}
${l2}childrenProbability: embed = ValueFloat {
${l3}constantValue: f32 = 1
${l3}dynamics: pointer = VfxAnimatedFloatVariableData {
${l4}probabilityTables: list[pointer] = {
${l5}VfxProbabilityTableData {
${l6}keyTimes: list[f32] = {
${l6}    0
${l6}    1
${l6}}
${l6}keyValues: list[f32] = {
${l6}    0
${l6}    ${n}
${l6}}
${l5}}
${l4}}
${l4}times: list[f32] = {
${l5}0
${l4}}
${l4}values: list[f32] = {
${l5}1
${l4}}
${l3}}
${l2}}
${l1}}
${l1}emitterName: string = "${emitterName}_randomized"
${l1}shape: embed = VfxShape {
${l2}emitOffset: embed = ValueVector3 {
${l3}constantValue: vec3 = { 0, 0, 0 }
${l2}}
${l1}}
${l1}bindWeight: embed = ValueFloat {
${l2}constantValue: f32 = 1
${l1}}
${l1}birthScale0: embed = ValueVector3 {
${l2}constantValue: vec3 = { 0, 0, 0 }
${l1}}
${indent}}`;
}

/* Resolve a unique base name for an emitter's variants. Checks particleName
   strings (not hashed by ritobin) to detect existing collisions, and tracks
   names already assigned in this generation run. */
export function resolveUniqueName(
    content: string,
    usedNames: Set<string>,
    baseName: string,
    variantPrefixes: string[]
): string {
    let candidate = baseName;
    let counter = 2;
    while (
        usedNames.has(candidate) ||
        content.includes(`particleName: string = "${candidate}_${variantPrefixes[0]}"`)
    ) {
        candidate = `${baseName}_${counter}`;
        counter++;
    }
    usedNames.add(candidate);
    return candidate;
}

/* Main generation: for each selected emitter, create N variant systems and
   replace the emitter in the original with a randomizer that references them. */
export function generateEmitterRandomizers(
    content: string,
    parsedFile: ParsedFile,
    selectedEmitterKeys: string[],
    variantPrefixes: string[]
): { content: string; resolvedBaseNames: string[] } {
    let result = content;
    const usedBaseNames = new Set<string>();

    // Group selected emitters by system
    const bySystem = new Map<string, ParsedFile['emitters'] extends Map<string, infer E> ? E[] : never>();
    for (const eKey of selectedEmitterKeys) {
        const emitter = parsedFile.emitters.get(eKey);
        if (!emitter || !emitter.name || emitter.name === 'Unnamed') continue;
        if (!bySystem.has(emitter.systemKey)) bySystem.set(emitter.systemKey, []);
        bySystem.get(emitter.systemKey)!.push(emitter);
    }

    for (const [systemKey, emitters] of bySystem) {
        const sys = findVfxBlock(result, systemKey);
        if (!sys) continue;

        const originalBlock = sys.block;
        let modifiedBlock = sys.block;
        let duplicatesText = '';
        const resolvedNames = new Map<string, string>(); // emitter.key -> baseName

        for (const emitter of emitters) {
            const emName = emitter.name;
            const baseName = resolveUniqueName(result, usedBaseNames, emName, variantPrefixes);
            resolvedNames.set(emitter.key, baseName);
            const variantPaths = variantPrefixes.map((p) => `${baseName}_${p}`);

            // Create variant system blocks — each contains ONLY this emitter
            const emForVariant = findEmitterInBlock(originalBlock, emName);
            if (emForVariant) {
                const emitterText = originalBlock.substring(emForVariant.start, emForVariant.end);

                const complexIdx = originalBlock.indexOf('complexEmitterDefinitionData: list[pointer] = {');
                let complexLineStart = complexIdx;
                while (complexLineStart > 0 && originalBlock[complexLineStart - 1] !== '\n') complexLineStart--;
                const complexIndent = complexIdx !== -1 ? originalBlock.substring(complexLineStart, complexIdx) : '        ';

                const lastBraceIdx = originalBlock.lastIndexOf('}');
                let closeBraceLineStart = lastBraceIdx;
                while (closeBraceLineStart > 0 && originalBlock[closeBraceLineStart - 1] !== '\n') closeBraceLineStart--;
                const closeBraceIndent = originalBlock.substring(closeBraceLineStart, lastBraceIdx);

                for (const variantPath of variantPaths) {
                    const variantBlock =
                        `"${variantPath}" = VfxSystemDefinitionData {\n` +
                        `${complexIndent}complexEmitterDefinitionData: list[pointer] = {\n` +
                        `${emitterText}\n` +
                        `${complexIndent}}\n` +
                        `${complexIndent}particleName: string = "${variantPath}"\n` +
                        `${complexIndent}particlePath: string = "${variantPath}"\n` +
                        `${closeBraceIndent}}`;
                    duplicatesText += '\n' + variantBlock + '\n';
                }
            }

            // Replace this emitter in modifiedBlock with the randomizer
            const emFound = findEmitterInBlock(modifiedBlock, emName);
            if (emFound) {
                const randomizerBlock = buildRandomizerEmitter(emName, variantPaths, emFound.indent);
                modifiedBlock =
                    modifiedBlock.substring(0, emFound.start) +
                    randomizerBlock +
                    modifiedBlock.substring(emFound.end);
            }
        }

        result = result.substring(0, sys.start) + modifiedBlock + duplicatesText + result.substring(sys.end);

        for (const emitter of emitters) {
            const baseName = resolvedNames.get(emitter.key)!;
            result = addToResourceResolver(result, baseName, variantPrefixes.map((p) => `_${p}`));
        }
    }

    return { content: result, resolvedBaseNames: Array.from(usedBaseNames) };
}

/* System-level generation: duplicate the whole VfxSystem N times, add a
   randomizer emitter to the original that picks between the copies. */
export function generateSystemRandomizers(
    content: string,
    parsedFile: ParsedFile,
    selectedSystemKeys: string[],
    variantPrefixes: string[]
): string {
    let result = content;

    for (const systemKey of selectedSystemKeys) {
        const sys = findVfxBlock(result, systemKey);
        if (!sys) continue;

        const originalBlock = sys.block;
        const variantPaths = variantPrefixes.map((p) => `${systemKey}_${p}`);

        // Create N full copies of the system with new paths
        let duplicatesText = '';
        for (const variantPath of variantPaths) {
            const variantBlock = originalBlock.replace(
                `"${systemKey}" = VfxSystemDefinitionData {`,
                `"${variantPath}" = VfxSystemDefinitionData {`
            );
            duplicatesText += '\n' + variantBlock + '\n';
        }

        // Detect emitter indent from original block
        const emIndentMatch = originalBlock.match(/\n(\s*)VfxEmitterDefinitionData\s*\{/);
        const emitterIndent = emIndentMatch ? emIndentMatch[1] : '            ';

        // Find complexEmitterDefinitionData list and insert randomizer before its closing brace
        const complexListPattern = 'complexEmitterDefinitionData: list[pointer] = {';
        const complexListIdx = originalBlock.indexOf(complexListPattern);

        let modifiedBlock = originalBlock;
        if (complexListIdx !== -1) {
            // Find the opening { of the list
            const listOpenIdx = complexListIdx + complexListPattern.length - 1;
            // Find the closing } of the list
            let braceCount = 0;
            let inList = false;
            let listEnd = complexListIdx;
            for (let i = complexListIdx; i < originalBlock.length; i++) {
                if (originalBlock[i] === '{') {
                    braceCount++;
                    inList = true;
                } else if (originalBlock[i] === '}') {
                    braceCount--;
                    if (inList && braceCount === 0) {
                        listEnd = i;
                        break;
                    }
                }
            }
            const sysDisplayName = (parsedFile.systems.get(systemKey)?.name || systemKey).split('/').pop()!;
            const randomizerEmitterText = buildRandomizerEmitter(sysDisplayName, variantPaths, emitterIndent);
            // Replace entire list contents with just the randomizer emitter
            modifiedBlock =
                originalBlock.substring(0, listOpenIdx + 1) +
                '\n' + randomizerEmitterText + '\n' +
                originalBlock.substring(listEnd);
        }

        result = result.substring(0, sys.start) + modifiedBlock + duplicatesText + result.substring(sys.end);
        result = addToResourceResolver(result, systemKey, variantPrefixes.map((p) => `_${p}`));
    }

    return result;
}

// Append new entries to the ResourceResolver map.
export function addToResourceResolver(content: string, originalPath: string, suffixes: string[]): string {
    const resourceMapStart = content.indexOf('resourceMap: map[hash,link] = {');
    if (resourceMapStart === -1) return content;

    // Find the closing brace of the resourceMap block
    let braceCount = 0;
    let inMap = false;
    let mapEnd = resourceMapStart;
    for (let i = resourceMapStart; i < content.length; i++) {
        if (content[i] === '{') {
            braceCount++;
            inMap = true;
        } else if (content[i] === '}') {
            braceCount--;
            if (inMap && braceCount === 0) {
                mapEnd = i;
                break;
            }
        }
    }

    // Detect indent from any existing entry inside the map
    const anyEntry = content.substring(resourceMapStart, mapEnd).match(/\n(\s*)"[^"]+"\s*=\s*"[^"]+"/);
    const indent = anyEntry ? anyEntry[1] : '            ';

    let newEntries = '';
    for (const suffix of suffixes) {
        newEntries += `${indent}"${originalPath}${suffix}" = "${originalPath}${suffix}"\n`;
    }
    return content.slice(0, mapEnd) + newEntries + content.slice(mapEnd);
}

export function separateAssetsPerCopy(
    content: string,
    originalPaths: string[],
    numCopies: number,
    customPrefixes: string[] | null,
    assetFolderNames: string[]
): { content: string; assetsByFolder: AssetsByFolder } {
    let modifiedContent = content;
    const assetsByFolder: Record<string, Map<string, string>> = {};

    for (const fn of assetFolderNames) {
        assetsByFolder[fn] = new Map();
    }
    assetsByFolder['_backup'] = new Map();

    for (const originalPath of originalPaths) {
        for (let i = 0; i < numCopies; i++) {
            const suffix = customPrefixes ? `_${customPrefixes[i]}` : `_${i + 1}`;
            const duplicatePath = `${originalPath}${suffix}`;
            const folderName = assetFolderNames[i];

            const found = findVfxBlock(modifiedContent, duplicatePath);
            if (!found) continue;

            const { start: startIndex, end: endIndex, block: vfxBlock } = found;
            const assetRegex = /(ASSETS\/[^"\s]+)/gi;
            let m: RegExpExecArray | null;
            const replacements: { old: string; new: string }[] = [];
            while ((m = assetRegex.exec(vfxBlock)) !== null) {
                const assetPath = m[1];
                const fileName = assetPath.split('/').pop()!;
                const newPath = `ASSETS/${folderName}/${fileName}`;
                assetsByFolder[folderName].set(fileName, assetPath);
                if (!assetsByFolder['_backup'].has(fileName)) {
                    assetsByFolder['_backup'].set(fileName, assetPath);
                }
                if (assetPath !== newPath) replacements.push({ old: assetPath, new: newPath });
            }

            const uniqueReplacements: { old: string; new: string }[] = [];
            const seen = new Set<string>();
            for (const r of replacements) {
                if (!seen.has(r.old)) {
                    seen.add(r.old);
                    uniqueReplacements.push(r);
                }
            }
            uniqueReplacements.sort((a, b) => b.old.length - a.old.length);

            let updatedBlock = vfxBlock;
            for (const repl of uniqueReplacements) {
                updatedBlock = updatedBlock.split(repl.old).join(repl.new);
            }
            modifiedContent = modifiedContent.substring(0, startIndex) + updatedBlock + modifiedContent.substring(endIndex);
        }
    }

    const result: AssetsByFolder = {};
    for (const folder in assetsByFolder) {
        result[folder] = Array.from(assetsByFolder[folder].entries()).map(([filename, original]) => ({ original, filename }));
    }
    return { content: modifiedContent, assetsByFolder: result };
}

export interface CopyAssetsResult {
    success: boolean;
    totalCopied: number;
    totalFailed: number;
    totalSkipped: number;
    foldersCreated: number;
    failures: { folder: string; asset: string; reason: string }[];
    error?: string;
}

/* Copy detected assets into per-variant subfolders next to the source bin.
   The original used Node fs directly; here the actual file copying is delegated
   to the Rust backend, which resolves the project root and ASSETS layout. */
export async function copyAssetsToFolders(
    assetsByFolder: AssetsByFolder,
    sourceFilePath: string
): Promise<CopyAssetsResult> {
    // TODO(backend): no `copy_particle_assets` command exists in src-tauri yet.
    // The randomized bin saves fine without it; this only performs the optional
    // physical asset duplication into ASSETS/<variant>/ folders.
    const { invokeCommand } = await import('@/lib/api');
    return invokeCommand<CopyAssetsResult>('copy_particle_assets', {
        sourceFilePath,
        assetsByFolder,
    });
}
