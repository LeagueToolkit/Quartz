/*
 * FakeGearSkin Utilities (ported from Electron Quartz fakeGearSkinUtils.js)
 *
 * Converts VFX systems into toggle-able variants using stencil filtering.
 * All transforms operate on ritobin .py text (the form read_bin returns and
 * write_bin consumes), so load -> select -> apply -> save runs on real bins.
 *
 * The original relied on window.require('fs'/'path') for variant-bin file IO,
 * asset copying, SKL/SKN mesh editing and timestamped backups. Those filesystem
 * pieces are not available under Tauri's webview, so they are marked
 * TODO(backend); the pure content transforms below are fully functional.
 */

// Stencil configuration
export const STENCIL_REFERENCE_ID = '0xe6deedc4';
const STENCIL_MODE_BLOCKED_WHEN_ON = 3; // Render when stencil DOESN'T match
const STENCIL_MODE_VISIBLE_WHEN_ON = 2; // Render when stencil MATCHES

// Default variant folder paths
export const VARIANT1_FOLDER = 'assets/variant1';
export const VARIANT2_FOLDER = 'assets/variant2';

export interface EmitterInfo {
    name: string;
    startLine: number;
    endLine: number;
    hasStencil: boolean;
    hasGroundLayer: boolean;
    hasRenderPhaseOverride: boolean;
    blendMode: number;
    rawContent: string;
}

export interface VfxSystemInfo {
    key: string;
    name: string;
    fullPath: string;
    startLine: number;
    endLine: number;
    rawContent: string;
    emitterCount: number;
    emitters?: EmitterInfo[];
    stencilCount?: number;
    groundLayerCount?: number;
}

interface EmitterBlock {
    content: string;
    startLine: number;
    endLine: number;
    emitterName: string;
}

export interface OpResult {
    success: boolean;
    content: string;
    message?: string;
    error?: string;
}

/* ---- low-level parsing (string-aware bracket counting) ---- */

function countBrackets(line: string): { opens: number; closes: number } {
    let opens = 0;
    let closes = 0;
    let inString = false;
    let stringChar: string | null = null;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const prevChar = i > 0 ? line[i - 1] : '';

        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
                stringChar = null;
            }
        }

        if (!inString) {
            if (char === '{') opens++;
            if (char === '}') closes++;
        }
    }

    return { opens, closes };
}

function findBlockEnd(lines: string[], startLine: number): number {
    let bracketDepth = 0;
    let foundFirstBracket = false;

    for (let i = startLine; i < lines.length; i++) {
        const { opens, closes } = countBrackets(lines[i]);
        bracketDepth += opens - closes;

        if (opens > 0) foundFirstBracket = true;

        if (foundFirstBracket && bracketDepth === 0) {
            return i;
        }

        if (i - startLine > 10000) {
            return i;
        }
    }

    return lines.length - 1;
}

/* ---- extraction ---- */

export function extractVfxSystems(pyContent: string): VfxSystemInfo[] {
    if (!pyContent) return [];

    const lines = pyContent.split('\n');
    const systems: VfxSystemInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const match = line.match(/^\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData\s*\{/);
        if (match) {
            const key = match[1] || match[2];
            const startLine = i;
            const endLine = findBlockEnd(lines, i);
            const rawContent = lines.slice(startLine, endLine + 1).join('\n');

            const particleNameMatch = rawContent.match(/particleName:\s*string\s*=\s*"([^"]+)"/);
            const particleName = particleNameMatch ? particleNameMatch[1] : null;

            const emitterMatches = rawContent.match(/VfxEmitterDefinitionData\s*\{/gi);
            const emitterCount = emitterMatches ? emitterMatches.length : 0;

            systems.push({
                key,
                name: particleName || key.split('/').pop() || key,
                fullPath: key,
                startLine,
                endLine,
                rawContent,
                emitterCount,
            });

            i = endLine;
        }
    }

    return systems;
}

export function extractEmittersFromSystem(systemContent: string): EmitterInfo[] {
    const lines = systemContent.split('\n');
    const emitters: EmitterInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/VfxEmitterDefinitionData/i.test(line)) {
            const blockEndIndex = findBlockEnd(lines, i);
            const blockContent = lines.slice(i, blockEndIndex + 1).join('\n');

            const nameMatch = blockContent.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
            const emitterName = nameMatch ? nameMatch[1] : `Emitter_${emitters.length + 1}`;

            const hasStencil = /stencilMode:\s*u8\s*=/i.test(blockContent) || /StencilReferenceId:\s*hash\s*=/i.test(blockContent);
            const hasGroundLayer = /isGroundLayer:\s*(?:bool|flag)\s*=\s*true/i.test(blockContent);
            const hasRenderPhaseOverride = /renderPhaseOverride:\s*u8\s*=/i.test(blockContent);

            const blendModeMatch = blockContent.match(/blendMode:\s*u8\s*=\s*(\d+)/);
            const blendMode = blendModeMatch ? parseInt(blendModeMatch[1]) : 0;

            emitters.push({
                name: emitterName,
                startLine: i,
                endLine: blockEndIndex,
                hasStencil,
                hasGroundLayer,
                hasRenderPhaseOverride,
                blendMode,
                rawContent: blockContent,
            });

            i = blockEndIndex;
        }
    }

    return emitters;
}

export function countExistingStencilEmitters(systemContent: string): number {
    return extractEmittersFromSystem(systemContent).filter((e) => e.hasStencil).length;
}

export function countGroundLayerEmitters(systemContent: string): number {
    return extractEmittersFromSystem(systemContent).filter((e) => e.hasGroundLayer).length;
}

function extractEmitterBlocks(systemContent: string): EmitterBlock[] {
    const emitters: EmitterBlock[] = [];
    const lines = systemContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/VfxEmitterDefinitionData\s*\{/i.test(line)) {
            const startLine = i;
            const endLine = findBlockEnd(lines, i);
            const emitterContent = lines.slice(startLine, endLine + 1).join('\n');

            const nameMatch = emitterContent.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
            const emitterName = nameMatch ? nameMatch[1] : `Emitter_${emitters.length}`;

            emitters.push({ content: emitterContent, startLine, endLine, emitterName });
            i = endLine;
        }
    }

    return emitters;
}

/* ---- asset path helpers ---- */

function extractAssetPaths(content: string): string[] {
    const assets = new Set<string>();
    const assetPattern = /"([^"]+\.(dds|tex|png|jpg|jpeg|tga|scb|sco|skn|skl|anm))"/gi;

    let match: RegExpExecArray | null;
    while ((match = assetPattern.exec(content)) !== null) {
        if (match[1] && match[1].trim()) {
            assets.add(match[1].trim());
        }
    }

    return Array.from(assets);
}

function getFilename(assetPath: string): string {
    return assetPath.split('/').pop() || assetPath.split('\\').pop() || assetPath;
}

interface AssetMapping {
    original: string;
    repathed: string;
    filename: string;
}

function repathAssetsToVariant(content: string, variantFolder: string): { content: string; assetMappings: AssetMapping[] } {
    const assetPaths = extractAssetPaths(content);
    const assetMappings: AssetMapping[] = [];
    let updatedContent = content;

    for (const originalPath of assetPaths) {
        const filename = getFilename(originalPath);
        const newPath = `${variantFolder}/${filename}`;

        const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`"${escapedPath}"`, 'g');
        updatedContent = updatedContent.replace(pattern, `"${newPath}"`);

        assetMappings.push({ original: originalPath, repathed: newPath, filename });
    }

    return { content: updatedContent, assetMappings };
}

/* ---- stencil helpers ---- */

function formatHashValue(value: string | null | undefined): string {
    if (!value) return STENCIL_REFERENCE_ID;

    const trimmed = String(value).trim();

    if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed;
    if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) return trimmed;

    return `"${trimmed}"`;
}

function addStencilToEmitters(systemContent: string, stencilMode: number, stencilReferenceId: string = STENCIL_REFERENCE_ID): string {
    const lines = systemContent.split('\n');
    const outputLines: string[] = [];
    const formattedId = formatHashValue(stencilReferenceId);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/VfxEmitterDefinitionData/i.test(line)) {
            const blockEndIndex = findBlockEnd(lines, i);
            const blockContent = lines.slice(i, blockEndIndex + 1).join('\n');

            const hasStencil = /stencilMode:\s*u8\s*=/i.test(blockContent) || /StencilReferenceId:\s*hash\s*=/i.test(blockContent);

            if (!hasStencil) {
                outputLines.push(line);
                const indentMatch = line.match(/^(\s*)/);
                const baseIndent = indentMatch ? indentMatch[1] : '';
                const propIndent = baseIndent + '    ';

                outputLines.push(`${propIndent}stencilMode: u8 = ${stencilMode}`);
                outputLines.push(`${propIndent}StencilReferenceId: hash = ${formattedId}`);
                outputLines.push(`${propIndent}renderPhaseOverride: u8 = 4`);
                continue;
            }
        }
        outputLines.push(line);
    }
    return outputLines.join('\n');
}

function addStencilToEmitter(
    emitterContent: string,
    stencilMode: number,
    stencilReferenceId: string = STENCIL_REFERENCE_ID,
): { content: string; skipped: boolean } {
    const hasStencilMode = /stencilMode:\s*u8\s*=/i.test(emitterContent);
    const hasStencilRef = /StencilReferenceId:\s*hash\s*=/i.test(emitterContent);

    if (hasStencilMode || hasStencilRef) {
        return { content: emitterContent, skipped: true };
    }

    const lines = emitterContent.split('\n');
    const outputLines: string[] = [];
    const formattedId = formatHashValue(stencilReferenceId);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        outputLines.push(line);

        if (i === 0 && /VfxEmitterDefinitionData\s*\{/i.test(line)) {
            const indentMatch = line.match(/^(\s*)/);
            const baseIndent = indentMatch ? indentMatch[1] : '';
            const propIndent = baseIndent + '    ';

            outputLines.push(`${propIndent}stencilMode: u8 = ${stencilMode}`);
            outputLines.push(`${propIndent}StencilReferenceId: hash = ${formattedId}`);
            outputLines.push(`${propIndent}renderPhaseOverride: u8 = 4`);
        }
    }

    return { content: outputLines.join('\n'), skipped: false };
}

function renameEmitter(emitterContent: string, newSuffix: string): { content: string; newName: string } {
    const nameMatch = emitterContent.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);

    if (nameMatch) {
        const originalName = nameMatch[1];
        const newName = `${originalName}${newSuffix}`;
        const newContent = emitterContent.replace(
            /emitterName:\s*string\s*=\s*"[^"]+"/i,
            `emitterName: string = "${newName}"`,
        );
        return { content: newContent, newName };
    }

    const lines = emitterContent.split('\n');
    const outputLines: string[] = [];
    const newName = `Emitter${newSuffix}`;

    for (let i = 0; i < lines.length; i++) {
        outputLines.push(lines[i]);
        if (i === 0 && /VfxEmitterDefinitionData\s*\{/i.test(lines[i])) {
            const indentMatch = lines[i].match(/^(\s*)/);
            const propIndent = (indentMatch ? indentMatch[1] : '') + '    ';
            outputLines.push(`${propIndent}emitterName: string = "${newName}"`);
        }
    }

    return { content: outputLines.join('\n'), newName };
}

/* ---- ResourceResolver helpers ---- */

function addToResourceResolver(pyContent: string, entries: { key: string; value: string }[]): string {
    const lines = pyContent.split('\n');
    const result = [...lines];

    let resolverStartIdx = -1;
    let resourceMapEndIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('= ResourceResolver {')) {
            resolverStartIdx = i;
            break;
        }
    }

    if (resolverStartIdx === -1) return pyContent;

    let depth = 0;
    let inResourceMap = false;

    for (let i = resolverStartIdx; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('resourceMap: map[hash,link] = {')) inResourceMap = true;

        if (inResourceMap) {
            const { opens, closes } = countBrackets(line);
            depth += opens - closes;

            if (depth <= 0) {
                resourceMapEndIdx = i;
                break;
            }
        }
    }

    if (resourceMapEndIdx === -1) return pyContent;

    const indent = '            ';
    const entryLines = entries.map((e) => `${indent}"${e.key}" = "${e.value}"`);

    result.splice(resourceMapEndIdx, 0, ...entryLines);

    return result.join('\n');
}

function removeResourceResolverEntry(pyContent: string, key: string): string {
    const lines = pyContent.split('\n');
    const result = [...lines];

    let resolverStartIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('= ResourceResolver {')) {
            resolverStartIdx = i;
            break;
        }
    }

    if (resolverStartIdx === -1) return pyContent;

    let depth = 0;
    let inResourceMap = false;

    for (let i = resolverStartIdx; i < result.length; i++) {
        const line = result[i];

        if (line.includes('resourceMap: map[hash,link] = {')) inResourceMap = true;

        if (inResourceMap) {
            const { opens, closes } = countBrackets(line);
            depth += opens - closes;

            if (line.includes(`"${key}"`)) {
                result.splice(i, 1);
                i--;
                continue;
            }

            if (depth <= 0) break;
        }
    }

    return result.join('\n');
}

/* ---- linked-list helpers ---- */

function extractLinkedList(pyContent: string): string[] {
    const match = pyContent.match(/linked:\s*list\[string\]\s*=\s*\{([^}]*)\}/);
    if (!match) return [];

    const linkedContent = match[1];
    const links: string[] = [];
    const linkPattern = /"([^"]+)"/g;
    let linkMatch: RegExpExecArray | null;

    while ((linkMatch = linkPattern.exec(linkedContent)) !== null) {
        links.push(linkMatch[1]);
    }

    return links;
}

export function hasVariantBinsLinked(pyContent: string): { hasVariant1: boolean; hasVariant2: boolean; links: string[] } {
    const links = extractLinkedList(pyContent);
    const hasVariant1 = links.some((l) => l.toLowerCase().includes('variant1'));
    const hasVariant2 = links.some((l) => l.toLowerCase().includes('variant2'));
    return { hasVariant1, hasVariant2, links };
}

function addToLinkedList(pyContent: string, variant1BinPath: string, variant2BinPath: string): string {
    const existingLinks = extractLinkedList(pyContent);

    const newLinks = [...existingLinks];
    if (!existingLinks.some((l) => l.toLowerCase().includes('variant1'))) newLinks.push(variant1BinPath);
    if (!existingLinks.some((l) => l.toLowerCase().includes('variant2'))) newLinks.push(variant2BinPath);

    const linkedContent = newLinks.map((l) => `    "${l}"`).join('\n');
    const newLinkedList = `linked: list[string] = {\n${linkedContent}\n}`;

    return pyContent.replace(/linked:\s*list\[string\]\s*=\s*\{[^}]*\}/, newLinkedList);
}

/* ---- spawner / child-variant systems ---- */

function createVariantSystem(
    originalContent: string,
    originalKey: string,
    variantSuffix: string,
    stencilMode: number,
    variantFolder: string,
    stencilReferenceId: string = STENCIL_REFERENCE_ID,
): { key: string; content: string; assetMappings: AssetMapping[] } {
    let variantContent = originalContent;
    const variantKey = `${originalKey}_child_${variantSuffix}`;

    variantContent = variantContent.replace(
        /^(\s*)(?:"[^"]+"|0x[0-9a-fA-F]+)\s*=\s*VfxSystemDefinitionData/m,
        `$1"${variantKey}" = VfxSystemDefinitionData`,
    );

    variantContent = variantContent.replace(
        /particleName:\s*string\s*=\s*"[^"]+"/g,
        `particleName: string = "${variantKey}"`,
    );
    variantContent = variantContent.replace(
        /particlePath:\s*string\s*=\s*"[^"]+"/g,
        `particlePath: string = "${variantKey}"`,
    );

    const repathResult = repathAssetsToVariant(variantContent, variantFolder);
    variantContent = repathResult.content;

    variantContent = addStencilToEmitters(variantContent, stencilMode, stencilReferenceId);

    return { key: variantKey, content: variantContent, assetMappings: repathResult.assetMappings };
}

function createSpawnerSystem(originalKey: string, variant1Key: string, variant2Key: string): string {
    return `    "${originalKey}" = VfxSystemDefinitionData {
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = -1
                }
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData {
                    childrenIdentifiers: list[embed] = {
                        VfxChildIdentifier {
                            effectKey: hash = "${variant1Key}"
                        }
                    }
                }
                isSingleParticle: flag = true
                emitterName: string = "variant1"
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = -1
                }
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData {
                    childrenIdentifiers: list[embed] = {
                        VfxChildIdentifier {
                            effectKey: hash = "${variant2Key}"
                        }
                    }
                }
                isSingleParticle: flag = true
                emitterName: string = "variant2"
            }
        }
        visibilityRadius: f32 = 9999
        particleName: string = "${originalKey.split('/').pop() || originalKey}"
        particlePath: string = "${originalKey}"
        flags: u16 = 228
    }`;
}

/**
 * Convert selected VFX systems to separate variant bins (child particles).
 *
 * The main bin content is fully transformed here (spawner + resolver + linked
 * list). Writing variant1.bin/variant2.bin and copying assets requires
 * filesystem access — see TODO(backend) in writeVariantBinsWithMerge /
 * copyAssetsToVariantFolders.
 */
export function convertToSeparateBins(
    pyContent: string,
    selectedSystemKeys: string[],
    _mainBinPath: string,
    stencilReferenceId: string = STENCIL_REFERENCE_ID,
    variant1Folder: string = VARIANT1_FOLDER,
    variant2Folder: string = VARIANT2_FOLDER,
): {
    success: boolean;
    error?: string;
    mainContent?: string;
    content?: string;
    variant1Systems?: string[];
    variant2Systems?: string[];
    createdVariants?: { original: string; variant1: string; variant2: string }[];
    assetMappings?: { variant1: AssetMapping[]; variant2: AssetMapping[] };
    variant1Folder?: string;
    variant2Folder?: string;
    message?: string;
} {
    if (!pyContent || !selectedSystemKeys || selectedSystemKeys.length === 0) {
        return { success: false, error: 'No systems selected', content: pyContent };
    }

    const systems = extractVfxSystems(pyContent);
    const systemMap = new Map(systems.map((s) => [s.key, s]));

    let mainContent = pyContent;
    const variant1Systems: string[] = [];
    const variant2Systems: string[] = [];
    const createdVariants: { original: string; variant1: string; variant2: string }[] = [];
    const resolverEntries: { key: string; value: string }[] = [];
    const allAssetMappings = { variant1: [] as AssetMapping[], variant2: [] as AssetMapping[] };

    for (const systemKey of selectedSystemKeys) {
        const system = systemMap.get(systemKey);
        if (!system) continue;

        const variant1 = createVariantSystem(system.rawContent, systemKey, 'variant1', STENCIL_MODE_BLOCKED_WHEN_ON, variant1Folder, stencilReferenceId);
        const variant2 = createVariantSystem(system.rawContent, systemKey, 'variant2', STENCIL_MODE_VISIBLE_WHEN_ON, variant2Folder, stencilReferenceId);

        variant1Systems.push(variant1.content);
        variant2Systems.push(variant2.content);

        allAssetMappings.variant1.push(...variant1.assetMappings);
        allAssetMappings.variant2.push(...variant2.assetMappings);

        const spawnerContent = createSpawnerSystem(systemKey, variant1.key, variant2.key);
        mainContent = mainContent.replace(system.rawContent, spawnerContent);

        resolverEntries.push({ key: variant1.key, value: variant1.key });
        resolverEntries.push({ key: variant2.key, value: variant2.key });

        createdVariants.push({ original: systemKey, variant1: variant1.key, variant2: variant2.key });
    }

    if (resolverEntries.length > 0) {
        mainContent = addToResourceResolver(mainContent, resolverEntries);
    }

    // DATA/variant1.bin / DATA/variant2.bin links (filenames only — placement is backend-side).
    mainContent = addToLinkedList(mainContent, 'DATA/variant1.bin', 'DATA/variant2.bin');

    return {
        success: true,
        mainContent,
        content: mainContent,
        variant1Systems,
        variant2Systems,
        createdVariants,
        assetMappings: allAssetMappings,
        variant1Folder,
        variant2Folder,
        message: `Created ${createdVariants.length} variant systems in separate bins`,
    };
}

/* ---- spawner detection ---- */

function checkSpawnerSignature(content: string): boolean {
    const hasVariant1 = /emitterName:\s*string\s*=\s*"variant1"/i.test(content);
    const hasVariant2 = /emitterName:\s*string\s*=\s*"variant2"/i.test(content);
    const hasChildSet = content.includes('childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData');
    return hasVariant1 && hasVariant2 && hasChildSet;
}

export function hasToggleVariants(pyContent: string, systemKey: string, systemContent: string | null = null): boolean {
    if (systemContent) return checkSpawnerSignature(systemContent);

    if (pyContent && systemKey) {
        const systems = extractVfxSystems(pyContent);
        const system = systems.find((s) => s.key === systemKey);
        if (system && system.rawContent) return checkSpawnerSignature(system.rawContent);
    }

    const variant1Key = `${systemKey}_child_variant1`;
    return !!(pyContent && pyContent.includes(`"${variant1Key}"`));
}

/* ---- togglescreen ---- */

export function getToggleScreenSystem(
    texturePath = 'assets/togglescreen/screen.dds',
    meshPath = 'assets/togglescreen/screen.scb',
    stencilReferenceId: string = STENCIL_REFERENCE_ID,
): string {
    const formattedId = formatHashValue(stencilReferenceId);

    return `    "togglescreen" = VfxSystemDefinitionData {
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = -1
                }
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                isSingleParticle: flag = true
                emitterName: string = "Overlay_Under"
                SpawnShape: pointer = VfxShapeLegacy {
                    emitOffset: embed = ValueVector3 {
                        dynamics: pointer = VfxAnimatedVector3fVariableData {
                            probabilityTables: list[pointer] = {
                                VfxProbabilityTableData {}
                                VfxProbabilityTableData {}
                                VfxProbabilityTableData {}
                            }
                            times: list[f32] = {
                                0
                            }
                            values: list[vec3] = {
                                { 0, 0, 0 }
                            }
                        }
                    }
                    emitRotationAngles: list[embed] = {
                        ValueFloat {}
                        ValueFloat {}
                    }
                    emitRotationAxes: list[vec3] = {
                        { 0, 0, 0 }
                        { 0, 0, 0 }
                    }
                }
                RenderPhaseOverride: u8 = 4
                EmitterPosition: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {}
                            VfxProbabilityTableData {}
                            VfxProbabilityTableData {}
                        }
                        times: list[f32] = {
                            0
                        }
                        values: list[vec3] = {
                            { 0, 0, 0 }
                        }
                    }
                }
                primitive: pointer = VfxPrimitiveMesh {
                    mMesh: embed = VfxMeshDefinitionData {
                        mSimpleMeshName: string = "${meshPath}"
                    }
                    AlignPitchToCamera: bool = true
                    AlignYawToCamera: bool = true
                    0x6aec9e7a: bool = true
                }
                pass: i16 = -9999
                blendMode: u8 = 4
                stencilMode: u8 = 1
                StencilReferenceId: hash = ${formattedId}
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { 0, -270, 0 }
                }
                texture: string = "${texturePath}"
            }
        }
        visibilityRadius: f32 = 9999
        particleName: string = "togglescreen"
        particlePath: string = "togglescreen"
        flags: u16 = 6
    }`;
}

export function extractStencilIdFromToggleScreen(pyContent: string): string | null {
    if (!pyContent) return null;

    const systems = extractVfxSystems(pyContent);
    const toggleSystem = systems.find(
        (s) =>
            (s.rawContent && /particleName:\s*string\s*=\s*"togglescreen"/i.test(s.rawContent)) ||
            (s.rawContent && /particlePath:\s*string\s*=\s*"togglescreen"/i.test(s.rawContent)) ||
            s.key === 'togglescreen',
    );

    if (!toggleSystem || !toggleSystem.rawContent) return null;

    const idMatch = toggleSystem.rawContent.match(/StencilReferenceId:\s*hash\s*=\s*(?:(?:"([^"]+)")|(0x[0-9a-fA-F]+))/);
    if (idMatch) return idMatch[1] || idMatch[2];

    return null;
}

export function hasToggleScreen(pyContent: string): boolean {
    if (!pyContent) return false;

    if (pyContent.includes('"togglescreen" = VfxSystemDefinitionData')) return true;

    const systems = extractVfxSystems(pyContent);
    return systems.some(
        (s) =>
            (s.rawContent && /particleName:\s*string\s*=\s*"togglescreen"/i.test(s.rawContent)) ||
            (s.rawContent && /particlePath:\s*string\s*=\s*"togglescreen"/i.test(s.rawContent)),
    );
}

/**
 * Insert togglescreen system and its ResourceResolver entry.
 * Asset copying (screen.dds / screen.scb into the project) is backend-side; the
 * .py is still wired up to reference assets/togglescreen/screen.*.
 */
export function insertToggleScreen(
    pyContent: string,
    _binPath: string | null = null,
    texturePath: string | null = null,
    meshPath: string | null = null,
    stencilReferenceId: string = STENCIL_REFERENCE_ID,
): OpResult {
    if (hasToggleScreen(pyContent)) {
        return { success: false, error: 'togglescreen already exists', content: pyContent };
    }

    const finalTexturePath = texturePath || 'assets/togglescreen/screen.dds';
    const finalMeshPath = meshPath || 'assets/togglescreen/screen.scb';

    // TODO(backend): copy screen.dds / screen.scb into <project>/assets/togglescreen.

    const toggleScreenContent = getToggleScreenSystem(finalTexturePath, finalMeshPath, stencilReferenceId);

    const lines = pyContent.split('\n');
    let insertIdx = lines.length;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('= ResourceResolver {')) {
            insertIdx = i;
            break;
        }
    }

    lines.splice(insertIdx, 0, toggleScreenContent);
    let updatedContent = lines.join('\n');

    updatedContent = addToResourceResolver(updatedContent, [{ key: 'togglescreen', value: 'togglescreen' }]);

    return {
        success: true,
        content: updatedContent,
        message: 'Added togglescreen system (copy screen assets into assets/togglescreen/)',
    };
}

/* ---- inline variants ---- */

export function duplicateEmittersAsInline(
    pyContent: string,
    systemKey: string,
    emitterNames: string[],
    stencilId: string = STENCIL_REFERENCE_ID,
): string {
    const lines = pyContent.split('\n');
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        const systemMatch = line.match(/^\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData\s*\{/);
        if (systemMatch) {
            const currentKey = systemMatch[1] || systemMatch[2];

            if (currentKey === systemKey) {
                const systemEndLine = findBlockEnd(lines, i);
                const systemLines = lines.slice(i, systemEndLine + 1);

                const processedLines: string[] = [];
                let j = 0;

                while (j < systemLines.length) {
                    const sysLine = systemLines[j];

                    if (/VfxEmitterDefinitionData/i.test(sysLine)) {
                        const emitterEndIdx = findBlockEnd(systemLines, j);
                        const emitterContent = systemLines.slice(j, emitterEndIdx + 1).join('\n');

                        const nameMatch = emitterContent.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
                        const emitterName = nameMatch ? nameMatch[1] : null;

                        for (let k = j; k <= emitterEndIdx; k++) {
                            processedLines.push(systemLines[k]);
                        }

                        if (emitterName && emitterNames.includes(emitterName)) {
                            let variant2Content = emitterContent;

                            variant2Content = variant2Content.replace(
                                /emitterName:\s*string\s*=\s*"([^"]+)"/i,
                                'emitterName: string = "$1_Variant2"',
                            );

                            if (!variant2Content.includes('stencilMode:')) {
                                const lastBraceIdx = variant2Content.lastIndexOf('}');
                                const formattedStencilId = formatHashValue(stencilId);
                                variant2Content =
                                    variant2Content.slice(0, lastBraceIdx) +
                                    `                stencilMode: u8 = 2\n` +
                                    `                StencilReferenceId: hash = ${formattedStencilId}\n` +
                                    `            ` +
                                    variant2Content.slice(lastBraceIdx);
                            }

                            processedLines.push('');
                            processedLines.push(...variant2Content.split('\n'));
                        }

                        j = emitterEndIdx + 1;
                    } else {
                        processedLines.push(sysLine);
                        j++;
                    }
                }

                result.push(...processedLines);
                i = systemEndLine + 1;
                continue;
            }
        }

        result.push(line);
        i++;
    }

    return result.join('\n');
}

export function convertToInlineVariants(
    pyContent: string,
    selectedSystemKeys: string[],
    stencilReferenceId: string = STENCIL_REFERENCE_ID,
    skipGroundLayer = false,
    variant1Folder: string = VARIANT1_FOLDER,
    variant2Folder: string = VARIANT2_FOLDER,
): {
    success: boolean;
    error?: string;
    content: string;
    processedSystems?: { systemKey: string; emitterCount: number; variant1Count: number; variant2Count: number }[];
    assetMappings?: { variant1: AssetMapping[]; variant2: AssetMapping[] };
    variant1Folder?: string;
    variant2Folder?: string;
    skippedGroundLayerCount?: number;
    message?: string;
} {
    if (!pyContent || !selectedSystemKeys || selectedSystemKeys.length === 0) {
        return { success: false, error: 'No systems selected', content: pyContent };
    }

    const systems = extractVfxSystems(pyContent);
    const systemMap = new Map(systems.map((s) => [s.key, s]));

    let updatedContent = pyContent;
    const processedSystems: { systemKey: string; emitterCount: number; variant1Count: number; variant2Count: number }[] = [];
    const allAssetMappings = { variant1: [] as AssetMapping[], variant2: [] as AssetMapping[] };
    let skippedGroundLayerCount = 0;

    for (const systemKey of selectedSystemKeys) {
        const system = systemMap.get(systemKey);
        if (!system) continue;

        const emitters = extractEmitterBlocks(system.rawContent);
        if (emitters.length === 0) continue;

        const variant1Emitters = emitters.filter((e) => {
            const name = e.emitterName.toLowerCase();
            return name.includes('_variant1') && !name.includes('_variant2');
        });
        const variant2Emitters = emitters.filter((e) => e.emitterName.toLowerCase().includes('_variant2'));
        const hasVariant1 = variant1Emitters.length > 0;
        const hasVariant2 = variant2Emitters.length > 0;

        if (hasVariant1 && hasVariant2) continue;

        let newSystemContent = system.rawContent;
        const finalVariant1Emitters: string[] = [];
        const finalVariant2Emitters: string[] = [];
        const groundLayerEmitters: string[] = [];

        if (hasVariant1 && !hasVariant2) {
            for (const emitter of emitters) {
                const emitterNameLower = emitter.emitterName.toLowerCase();

                if (emitterNameLower.includes('_variant1') && !emitterNameLower.includes('_variant2')) {
                    finalVariant1Emitters.push(emitter.content);

                    let variant2Content = emitter.content;

                    const nameMatch = emitter.emitterName.match(/^(.+?)(?:_Variant1|_variant1)$/i);
                    const baseName = nameMatch
                        ? nameMatch[1]
                        : emitter.emitterName.replace(/_Variant1$/i, '').replace(/_variant1$/i, '');

                    variant2Content = variant2Content.replace(
                        /emitterName:\s*string\s*=\s*"[^"]+"/i,
                        `emitterName: string = "${baseName}_Variant2"`,
                    );

                    const escapedVariant1Folder = variant1Folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    variant2Content = variant2Content.replace(new RegExp(escapedVariant1Folder, 'g'), variant2Folder);

                    const variant2Assets = extractAssetPaths(variant2Content);
                    variant2Assets.forEach((path) => {
                        if (path.includes(variant2Folder)) {
                            allAssetMappings.variant2.push({
                                original: path.replace(variant2Folder, variant1Folder),
                                repathed: path,
                                filename: path.split('/').pop() || path.split('\\').pop() || path,
                            });
                        }
                    });

                    const stencilRefMatch = emitter.content.match(/StencilReferenceId:\s*hash\s*=\s*(?:(?:"([^"]+)")|(0x[0-9a-fA-F]+))/i);
                    const variant1StencilRefId = stencilRefMatch ? stencilRefMatch[1] || stencilRefMatch[2] : null;

                    const toggleScreenStencilRefId = extractStencilIdFromToggleScreen(pyContent);
                    const formattedToggleScreenId = toggleScreenStencilRefId ? formatHashValue(toggleScreenStencilRefId) : null;
                    const formattedVariant1Id = variant1StencilRefId ? formatHashValue(variant1StencilRefId) : null;

                    if (variant1StencilRefId && formattedVariant1Id === formattedToggleScreenId) {
                        variant2Content = variant2Content.replace(/stencilMode:\s*u8\s*=\s*3/, 'stencilMode: u8 = 2');

                        const hasStencil = /stencilMode:\s*u8\s*=/i.test(variant2Content);
                        if (!hasStencil) {
                            const stencil2 = addStencilToEmitter(variant2Content, STENCIL_MODE_VISIBLE_WHEN_ON, stencilReferenceId);
                            variant2Content = stencil2.content;
                        } else {
                            const formattedId = formatHashValue(stencilReferenceId);
                            variant2Content = variant2Content.replace(
                                /StencilReferenceId:\s*hash\s*=\s*[^\n]+/,
                                `StencilReferenceId: hash = ${formattedId}`,
                            );
                        }
                    }

                    finalVariant2Emitters.push(variant2Content);
                } else if (!emitterNameLower.includes('_variant2')) {
                    finalVariant1Emitters.push(emitter.content);
                }
            }
        } else {
            const originalEmitters = emitters.filter(
                (e) =>
                    !e.emitterName.includes('_Variant1') &&
                    !e.emitterName.includes('_variant1') &&
                    !e.emitterName.includes('_Variant2') &&
                    !e.emitterName.includes('_variant2'),
            );

            let emittersToProcess = originalEmitters;

            if (skipGroundLayer) {
                emittersToProcess = [];
                for (const e of originalEmitters) {
                    const hasGroundLayer = /isGroundLayer:\s*(?:bool|flag)\s*=\s*true/i.test(e.content);
                    if (hasGroundLayer) {
                        groundLayerEmitters.push(e.content);
                        skippedGroundLayerCount++;
                    } else {
                        emittersToProcess.push(e);
                    }
                }
            }

            for (const emitter of emittersToProcess) {
                let variant1Content = emitter.content;
                const repath1 = repathAssetsToVariant(variant1Content, variant1Folder);
                variant1Content = repath1.content;
                allAssetMappings.variant1.push(...repath1.assetMappings);
                const rename1 = renameEmitter(variant1Content, '_Variant1');
                variant1Content = rename1.content;
                const stencil1 = addStencilToEmitter(variant1Content, STENCIL_MODE_BLOCKED_WHEN_ON, stencilReferenceId);
                variant1Content = stencil1.content;
                finalVariant1Emitters.push(variant1Content);

                let variant2Content = emitter.content;
                const repath2 = repathAssetsToVariant(variant2Content, variant2Folder);
                variant2Content = repath2.content;
                allAssetMappings.variant2.push(...repath2.assetMappings);
                const rename2 = renameEmitter(variant2Content, '_Variant2');
                variant2Content = rename2.content;
                const stencil2 = addStencilToEmitter(variant2Content, STENCIL_MODE_VISIBLE_WHEN_ON, stencilReferenceId);
                variant2Content = stencil2.content;
                finalVariant2Emitters.push(variant2Content);
            }
        }

        const allEmitters = [...groundLayerEmitters, ...finalVariant1Emitters, ...finalVariant2Emitters];

        const emitterListMatch = newSystemContent.match(/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{/i);

        if (emitterListMatch && emitterListMatch.index !== undefined) {
            const lines = newSystemContent.split('\n');
            let listStartLine = 0;
            let charCount = 0;

            for (let li = 0; li < lines.length; li++) {
                if (charCount + lines[li].length >= emitterListMatch.index) {
                    listStartLine = li;
                    break;
                }
                charCount += lines[li].length + 1;
            }

            const listEndLine = findBlockEnd(lines, listStartLine);

            const indentMatch = lines[listStartLine].match(/^(\s*)/);
            const baseIndent = indentMatch ? indentMatch[1] : '        ';
            const emitterIndent = baseIndent + '    ';

            const indentedEmitters = allEmitters.map((e) => {
                const emitterLines = e.split('\n');
                return emitterLines
                    .map((line, idx) => {
                        if (idx === 0) return emitterIndent + line.trim();
                        const trimmed = line.trimStart();
                        const originalIndent = line.length - trimmed.length;
                        const relativeIndent = Math.max(0, originalIndent - 12);
                        return emitterIndent + '    '.repeat(Math.floor(relativeIndent / 4)) + trimmed;
                    })
                    .join('\n');
            });

            const newEmitterListContent = '\n' + indentedEmitters.join('\n') + '\n' + baseIndent;

            const beforeList = lines.slice(0, listStartLine + 1).join('\n');
            const afterList = lines.slice(listEndLine).join('\n');

            newSystemContent = beforeList + newEmitterListContent + afterList;
        }

        updatedContent = updatedContent.replace(system.rawContent, newSystemContent);

        processedSystems.push({
            systemKey,
            emitterCount: emitters.length,
            variant1Count: finalVariant1Emitters.length,
            variant2Count: finalVariant2Emitters.length,
        });
    }

    return {
        success: true,
        content: updatedContent,
        processedSystems,
        assetMappings: allAssetMappings,
        variant1Folder,
        variant2Folder,
        skippedGroundLayerCount,
        message:
            skippedGroundLayerCount > 0
                ? `Duplicated emitters in ${processedSystems.length} system(s), kept ${skippedGroundLayerCount} ground layer emitter(s) unchanged.`
                : `Duplicated emitters in ${processedSystems.length} system(s) as inline variants.`,
    };
}

export function hasInlineVariants(systemContent: string): boolean {
    if (!systemContent) return false;
    const hasVariant1 = /emitterName:\s*string\s*=\s*"[^"]*_Variant1"/i.test(systemContent);
    const hasVariant2 = /emitterName:\s*string\s*=\s*"[^"]*_Variant2"/i.test(systemContent);
    return hasVariant1 && hasVariant2;
}

export function hasVariant2(pyContent: string, systemKey: string, systemContent: string | null = null): boolean {
    if (!pyContent || !systemKey) return false;

    if (systemContent) {
        const hasInlineVariant2 = /emitterName:\s*string\s*=\s*"[^"]*_Variant2"/i.test(systemContent);
        if (hasInlineVariant2) return true;

        if (checkSpawnerSignature(systemContent)) {
            const hasVariant2Child = /emitterName:\s*string\s*=\s*"variant2"/i.test(systemContent);
            if (hasVariant2Child) return true;
        }
        return false;
    }

    const systems = extractVfxSystems(pyContent);
    const variant2Key = `${systemKey}_child_variant2`;
    return systems.some((s) => s.key === variant2Key || (s.key.includes('_child_variant2') && s.key.includes(systemKey)));
}

/* ---- animation toggle ---- */

export function hasAnimationToggle(pyContent: string): boolean {
    const hasToggleClip = pyContent.includes('"Toggle" = ConditionBoolClipData');
    const hasToggleTrack = pyContent.includes('"Toggle" = TrackData');
    const hasToggleMask = pyContent.includes('"Toggle" = MaskData');
    return hasToggleClip || (hasToggleTrack && hasToggleMask);
}

function findValidAnmPath(pyContent: string): string | null {
    const anmPattern = /mAnimationFilePath:\s*string\s*=\s*"([^"]+\.anm)"/gi;
    const matches: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = anmPattern.exec(pyContent)) !== null) {
        matches.push(match[1]);
    }

    if (matches.length === 0) return null;
    // TODO(backend): validate the .anm exists on disk; using the first reference.
    return matches[0];
}

function generateToggleClipData(anmPath: string): string {
    return `            "Toggle" = ConditionBoolClipData {
                Updater: pointer = LogicDriverBoolParametricUpdater {
                    driver: pointer = SubmeshVisibilityBoolDriver {
                        Submeshes: list[hash] = {
                            "MinimalMesh"
                        }
                        VISIBLE: bool = false
                    }
                }
                mTrueConditionClipName: hash = 0xbe8683f0
                mFalseConditionClipName: hash = 0x8aa48b13
            }
            0xbe8683f0 = ParallelClipData {
                mFlags: u32 = 14
                mClipNameList: list[hash] = {
                    0x43191761
                }
            }
            0x43191761 = AtomicClipData {
                mFlags: u32 = 14
                mTrackDataName: hash = "Toggle"
                mMaskDataName: hash = "Default"
                mEventDataMap: map[hash,pointer] = {
                    "fade" = ParticleEventData {
                        mEffectKey: hash = 0xcef6c126
                        mParticleEventDataPairList: list[embed] = {
                            ParticleEventDataPair {
                                mBoneName: hash = "C_Buffbone_GLB_Layout_Loc"
                            }
                        }
                        mIsLoop: bool = false
                        mIsKillEvent: bool = false
                    }
                    0x38503e10 = SubmeshVisibilityEventData {
                        mShowSubmeshList: list[hash] = {
                            "MinimalMesh"
                        }
                        mHideSubmeshList: list[hash] = {
                        }
                    }
                }
                mAnimationResourceData: embed = AnimationResourceData {
                    mAnimationFilePath: string = "${anmPath}"
                }
            }
            0x8aa48b13 = ParallelClipData {
                mFlags: u32 = 14
                mClipNameList: list[hash] = {
                    0x04acc354
                }
            }
            0x04acc354 = AtomicClipData {
                mFlags: u32 = 14
                mTrackDataName: hash = "Toggle"
                mMaskDataName: hash = "Default"
                mEventDataMap: map[hash,pointer] = {
                    "FadeOut" = ParticleEventData {
                        mEffectKey: hash = 0xe271f27c
                        mParticleEventDataPairList: list[embed] = {
                            ParticleEventDataPair {
                                mBoneName: hash = "C_Buffbone_GLB_Layout_Loc"
                            }
                        }
                        mIsLoop: bool = false
                        mIsKillEvent: bool = false
                    }
                    "Hide_Mesh" = SubmeshVisibilityEventData {
                        mHideSubmeshList: list[hash] = {
                            "MinimalMesh"
                        }
                        mShowSubmeshList: list[hash] = {
                        }
                    }
                }
                mAnimationResourceData: embed = AnimationResourceData {
                    mAnimationFilePath: string = "${anmPath}"
                }
            }`;
}

function generateToggleMaskData(boneCount = 93): string {
    const weights = Array(boneCount).fill('                    0').join('\n');
    return `            "Toggle" = MaskData {
                mWeightList: list[f32] = {
${weights}
                }
            }`;
}

function generateDefaultMaskData(boneCount = 93): string {
    const weights = Array(boneCount).fill('                    0').join('\n');
    return `            "Default" = MaskData {
                mWeightList: list[f32] = {
${weights}
                }
            }`;
}

function generateToggleTrackData(): string {
    return `            "Toggle" = TrackData {
            }`;
}

function adjustTrackDataPriorities(pyContent: string): string {
    let updated = pyContent;

    updated = updated.replace(
        /("[^"]+"\s*=\s*TrackData\s*\{[^}]*mPriority:\s*u8\s*=\s*)(\d+)/g,
        (_m, prefix: string, priority: string) => `${prefix}${parseInt(priority) + 1}`,
    );

    const trackDataPattern = /("(?!Toggle")[^"]+"\s*=\s*TrackData\s*\{)(\s*\})/g;
    updated = updated.replace(trackDataPattern, '$1\n                mPriority: u8 = 1\n            }');

    return updated;
}

function insertToggleScreenPersistentEffect(pyContent: string): string {
    if (pyContent.includes('effectKey: hash = "togglescreen"') || pyContent.includes("effectKey: hash = 'togglescreen'")) {
        return pyContent;
    }

    const lines = pyContent.split('\n');

    let skinStart = -1;
    let skinEnd = -1;
    let depth = 0;
    let inSkin = false;
    for (let i = 0; i < lines.length; i++) {
        const t = (lines[i] || '').trim();
        if (t.includes('= SkinCharacterDataProperties {')) {
            inSkin = true;
            depth = 1;
            skinStart = i;
            continue;
        }
        if (!inSkin) continue;
        const opens = (lines[i].match(/\{/g) || []).length;
        const closes = (lines[i].match(/\}/g) || []).length;
        depth += opens - closes;
        if (depth === 0) {
            skinEnd = i;
            break;
        }
    }

    if (skinStart === -1 || skinEnd === -1) return pyContent;

    let peStart = -1;
    let peEnd = -1;
    let peDepth = 0;
    let inPe = false;
    for (let i = skinStart; i <= skinEnd; i++) {
        const t = (lines[i] || '').trim();
        if (t.startsWith('PersistentEffectConditions:') && t.includes('list2[pointer] = {')) {
            inPe = true;
            peStart = i;
            peDepth = 1;
            continue;
        }
        if (!inPe) continue;
        const opens = (lines[i].match(/\{/g) || []).length;
        const closes = (lines[i].match(/\}/g) || []).length;
        peDepth += opens - closes;
        if (peDepth === 0) {
            peEnd = i;
            break;
        }
    }

    const indent0 = '        ';
    const indent1 = '            ';
    const indent2 = '                ';
    const indent3 = '                    ';
    const indent4 = '                        ';

    const persistentBlock = `${indent0}PersistentEffectConditionData {
${indent1}OwnerCondition: pointer = AllTrueMaterialDriver {
${indent2}mDrivers: list[pointer] = {
${indent3}SubmeshVisibilityBoolDriver {
${indent4}Submeshes: list[hash] = {
${indent4}    "MinimalMesh"
${indent4}}
${indent4}VISIBLE: bool = true
${indent3}}
${indent2}}
${indent1}}
${indent1}0x09e5cdf8: bool = true
${indent1}PersistentVfxs: list2[embed] = {
${indent2}PersistentVfxData {
${indent3}effectKey: hash = "togglescreen"
${indent3}boneName: string = "BuffBone_Glb_Ground_Loc"
${indent3}0xd543b3fe: bool = true
${indent3}AttachToCamera: bool = true
${indent2}}
${indent1}}
${indent0}}`;

    const out = [...lines];

    if (peStart !== -1 && peEnd !== -1) {
        out.splice(peEnd, 0, persistentBlock);
    } else {
        const newSection = [
            `${indent0}PersistentEffectConditions: list2[pointer] = {`,
            persistentBlock,
            `${indent0}}`,
        ];
        out.splice(skinEnd, 0, ...newSection);
    }

    return out.join('\n');
}

/**
 * Insert the Ctrl+5 animation toggle clip/mask/track data plus the togglescreen
 * persistent effect. The original first edits the SKN to add a MinimalMesh and
 * reads the bone count from the SKL — that mesh/skeleton IO is backend-side
 * (see TODO(backend) below); the .py clip data uses the default 93-bone mask.
 */
export function insertAnimationToggle(pyContent: string, _binPath: string): OpResult {
    try {
        if (hasAnimationToggle(pyContent)) {
            return { success: false, error: 'Animation toggle already exists', content: pyContent };
        }

        const anmPath = findValidAnmPath(pyContent);
        if (!anmPath) {
            return { success: false, error: 'No animation files found in mod. Cannot add animation toggle.', content: pyContent };
        }

        let updatedContent = pyContent;

        // TODO(backend): edit SKN to add MinimalMesh and read true bone count from SKL.
        const boneCount = 93;

        const clipDataMapMatch = updatedContent.match(/mClipDataMap:\s*map\[hash,pointer\]\s*=\s*\{/);
        if (clipDataMapMatch && clipDataMapMatch.index !== undefined) {
            const insertPos = clipDataMapMatch.index + clipDataMapMatch[0].length;
            const toggleClipData = '\n' + generateToggleClipData(anmPath);
            updatedContent = updatedContent.slice(0, insertPos) + toggleClipData + updatedContent.slice(insertPos);
        }

        const maskDataMapMatch = updatedContent.match(/mMaskDataMap:\s*map\[hash,embed\]\s*=\s*\{/);
        const hasDefaultMask = updatedContent.includes('"Default" = MaskData');

        if (maskDataMapMatch && maskDataMapMatch.index !== undefined) {
            const insertPos = maskDataMapMatch.index + maskDataMapMatch[0].length;
            if (hasDefaultMask) {
                const toggleMaskData = '\n' + generateToggleMaskData(boneCount);
                updatedContent = updatedContent.slice(0, insertPos) + toggleMaskData + updatedContent.slice(insertPos);
            } else {
                const combinedMaskData = '\n' + generateDefaultMaskData(boneCount) + '\n' + generateToggleMaskData(boneCount);
                updatedContent = updatedContent.slice(0, insertPos) + combinedMaskData + updatedContent.slice(insertPos);
            }
        } else {
            const fullMaskDataMap = `
        mMaskDataMap: map[hash,embed] = {
${generateDefaultMaskData(boneCount)}
${generateToggleMaskData(boneCount)}
        }`;
            const trackDataMapPos = updatedContent.indexOf('mTrackDataMap:');
            if (trackDataMapPos !== -1) {
                updatedContent = updatedContent.slice(0, trackDataMapPos) + fullMaskDataMap + '\n        ' + updatedContent.slice(trackDataMapPos);
            }
        }

        const trackDataMapMatch = updatedContent.match(/mTrackDataMap:\s*map\[hash,embed\]\s*=\s*\{/);
        if (trackDataMapMatch && trackDataMapMatch.index !== undefined) {
            const insertPos = trackDataMapMatch.index + trackDataMapMatch[0].length;
            const toggleTrackData = '\n' + generateToggleTrackData();
            updatedContent = updatedContent.slice(0, insertPos) + toggleTrackData + updatedContent.slice(insertPos);
        }

        updatedContent = adjustTrackDataPriorities(updatedContent);
        updatedContent = insertToggleScreenPersistentEffect(updatedContent);

        return {
            success: true,
            content: updatedContent,
            message: `Added animation toggle using ${anmPath.split('/').pop()}`,
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), content: pyContent };
    }
}

/* ---- removal / revert ---- */

export function removeRenderPhaseOverrideFromSystem(pyContent: string, systemKey: string): OpResult {
    if (!pyContent || !systemKey) {
        return { success: false, error: 'No content or system key provided', content: pyContent };
    }

    const systems = extractVfxSystems(pyContent);
    const system = systems.find((s) => s.key === systemKey);

    if (!system) {
        return { success: false, error: `System not found: ${systemKey}`, content: pyContent };
    }

    const systemContent = system.rawContent;
    const lines = systemContent.split('\n');
    const outputLines: string[] = [];
    let removedCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/renderPhaseOverride:\s*u8\s*=\s*\d+/i.test(line)) {
            removedCount++;
            continue;
        }
        outputLines.push(line);
    }

    const newSystemContent = outputLines.join('\n');
    const updatedContent = pyContent.replace(systemContent, newSystemContent);

    return {
        success: true,
        content: updatedContent,
        message: `Removed ${removedCount} renderPhaseOverride property${removedCount !== 1 ? 'ies' : ''} from ${systemKey}`,
    };
}

export function deleteVariant2FromSystem(pyContent: string, systemKey: string, customStencilId: string | null = null): OpResult & {
    deletedSystems?: string[];
    deletedEmitters?: string[];
    renamedEmitters?: string[];
} {
    if (!pyContent || !systemKey) {
        return { success: false, error: 'No content or system key provided', content: pyContent };
    }

    let stencilIdToRemove = customStencilId;
    if (!stencilIdToRemove) stencilIdToRemove = extractStencilIdFromToggleScreen(pyContent);

    let updatedContent = pyContent;
    const deletedSystems: string[] = [];
    const deletedEmitters: string[] = [];
    const renamedEmitters: string[] = [];

    const systems = extractVfxSystems(pyContent);
    const system = systems.find((s) => s.key === systemKey);

    if (!system) {
        return { success: false, error: `System not found: ${systemKey}`, content: pyContent };
    }

    const systemContent = system.rawContent;
    const isSpawner = checkSpawnerSignature(systemContent);

    if (isSpawner) {
        const emitters = extractEmitterBlocks(systemContent);
        const variant2Emitter = emitters.find(
            (e) => e.emitterName === 'variant2' || /emitterName:\s*string\s*=\s*"variant2"/i.test(e.content),
        );

        if (variant2Emitter) {
            const newSystemContent = systemContent.replace(variant2Emitter.content, '');
            updatedContent = updatedContent.replace(systemContent, newSystemContent);
            deletedEmitters.push(`${systemKey} (variant2 child particle)`);
        }

        const variant2Key = `${systemKey}_child_variant2`;
        const variant2System = systems.find(
            (s) => s.key === variant2Key || (s.key.includes('_child_variant2') && s.key.includes(systemKey)),
        );

        if (variant2System) {
            updatedContent = updatedContent.replace(variant2System.rawContent, '');
            deletedSystems.push(variant2System.key);
            updatedContent = removeResourceResolverEntry(updatedContent, variant2System.key);
        }
    } else if (hasInlineVariants(systemContent)) {
        const emitters = extractEmitterBlocks(systemContent);
        let newSystemContent = systemContent;

        for (const emitter of emitters) {
            const isVariant1 = emitter.emitterName.includes('_Variant1') || emitter.emitterName.includes('_variant1');
            const isVariant2 = emitter.emitterName.includes('_Variant2') || emitter.emitterName.includes('_variant2');

            if (isVariant2) {
                newSystemContent = newSystemContent.replace(emitter.content, '');
                deletedEmitters.push(emitter.emitterName);
            } else if (isVariant1) {
                let cleanedContent = emitter.content;

                const originalName = emitter.emitterName.replace(/_Variant1$/i, '').replace(/_variant1$/i, '');
                cleanedContent = cleanedContent.replace(
                    /emitterName:\s*string\s*=\s*"[^"]+"/i,
                    `emitterName: string = "${originalName}"`,
                );
                renamedEmitters.push(`${emitter.emitterName} -> ${originalName}`);

                cleanedContent = cleanedContent.replace(/\s*stencilMode:\s*u8\s*=\s*[23]\s*\n?/g, '\n');

                if (stencilIdToRemove) {
                    const escapedId = stencilIdToRemove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const stencilPattern = new RegExp(
                        `\\s*StencilReferenceId:\\s*hash\\s*=\\s*(?:"${escapedId}"|${escapedId})\\s*\\n?`,
                        'gi',
                    );
                    cleanedContent = cleanedContent.replace(stencilPattern, '\n');
                }

                cleanedContent = cleanedContent.replace(/\s*renderPhaseOverride:\s*u8\s*=\s*\d+\s*\n?/g, '\n');
                cleanedContent = cleanedContent.replace(/\n{2,}/g, '\n');

                newSystemContent = newSystemContent.replace(emitter.content, cleanedContent);
            }
        }

        updatedContent = updatedContent.replace(systemContent, newSystemContent);
    }

    updatedContent = updatedContent.replace(/\n{3,}/g, '\n\n');

    const totalChanges = deletedSystems.length + deletedEmitters.length + renamedEmitters.length;
    return {
        success: true,
        content: updatedContent,
        deletedSystems,
        deletedEmitters,
        renamedEmitters,
        message:
            totalChanges > 0
                ? `Reverted variants from ${systemKey}: ${deletedEmitters.length} deleted, ${renamedEmitters.length} renamed back to original`
                : `No variants found to revert in ${systemKey}`,
    };
}

export { extractAssetPaths };
