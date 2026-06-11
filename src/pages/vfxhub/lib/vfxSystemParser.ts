/* Enhanced VFX System parser, ported 1:1 from the Electron Quartz
   (src/utils/vfx/vfxSystemParser.js). Handles complete VFX system extraction,
   bracket validation and VFX_HUB_* metadata parsing. Used by the GitHub catalog
   to turn collection .py text into browsable systems, and by the port flow to
   extract a single system for insertion into the target bin. */

export interface VfxSystemMetadata {
    displayName?: string;
    description?: string;
    category?: string;
    previewImage?: string;
    demoVideo?: string;
    tags?: string[];
    emitters?: string;
}

export interface ParsedVfxSystem {
    name: string;
    displayName: string;
    startLine: number;
    endLine: number;
    content: string[];
    emitters: { name: string | null; startLine: number; endLine: number }[];
    emitterCount: number;
    bracketCount: number;
    metadata: VfxSystemMetadata;
    assets: string[];
    resourceResolverKey: string | null;
    fullContent: string;
    isValid: boolean;
    validationError: string | null;
    wasCompleted?: boolean;
}

export function cleanMalformedEntries(content: string): string {
    const lines = content.split('\n');
    const cleanedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('= VfxSystemDefinitionData {') && line.includes('"') && line.includes('=')) {
            const matches = line.match(/"([^"]+)"/g);
            if (matches && matches.length > 1) {
                const firstMatch = matches[0];
                const cleanLine = line.replace(/"[^"]+"\s*=\s*VfxSystemDefinitionData/, `${firstMatch} = VfxSystemDefinitionData`);
                cleanedLines.push(cleanLine);
                continue;
            }
        }
        cleanedLines.push(line);
    }
    return cleanedLines.join('\n');
}

export function validateBrackets(content: string): { valid: boolean; error?: string } {
    let bracketCount = 0;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        bracketCount += openBrackets - closeBrackets;
        if (bracketCount < 0) {
            return { valid: false, error: `Unmatched closing bracket at line ${i + 1}: "${line.trim()}"` };
        }
    }
    if (bracketCount > 0) return { valid: false, error: `Missing ${bracketCount} closing bracket(s)` };
    return { valid: true };
}

export function getShortSystemName(fullPath: string): string {
    if (!fullPath) return 'Unknown System';
    const parts = fullPath.split('/');
    let shortName = parts[parts.length - 1];
    const universalPrefixPattern = /^[A-Z][a-z]+_(Base_|Skin\d+_)/;
    const match = shortName.match(universalPrefixPattern);
    if (match) shortName = shortName.substring(match[0].length);
    if (shortName.length > 30) return shortName.substring(0, 27) + '...';
    return shortName;
}

function extractResourceResolverEntries(content: string): { key: string; fullPath: string; line: number }[] {
    const entries: { key: string; fullPath: string; line: number }[] = [];
    const lines = content.split('\n');
    let inResourceResolver = false;
    let bracketCount = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('ResourceResolver {')) {
            inResourceResolver = true;
            bracketCount = 1;
            continue;
        }
        if (inResourceResolver) {
            const openBrackets = (line.match(/{/g) || []).length;
            const closeBrackets = (line.match(/}/g) || []).length;
            bracketCount += openBrackets - closeBrackets;
            const entryMatch = line.match(/^"([^"]+)"\s*=\s*"([^"]+)"/);
            if (entryMatch) entries.push({ key: entryMatch[1], fullPath: entryMatch[2], line: i });
            if (bracketCount <= 0) {
                inResourceResolver = false;
                break;
            }
        }
    }
    return entries;
}

function parseEmitterInContext(lines: string[], startLine: number) {
    const emitter = { name: null as string | null, startLine, endLine: startLine, hasTextures: false, hasParticles: false };
    let bracketCount = 1;
    for (let i = startLine + 1; i < lines.length && i < startLine + 500; i++) {
        const line = lines[i].trim();
        if (/emitterName:/i.test(line) && !emitter.name) {
            const nameMatch = line.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
            if (nameMatch) emitter.name = nameMatch[1];
        }
        if (line.includes('texture:') || line.includes('.dds') || line.includes('.tex')) emitter.hasTextures = true;
        if (line.includes('mSimpleMeshName:') || line.includes('.scb') || line.includes('.sco')) emitter.hasParticles = true;
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        bracketCount += openBrackets - closeBrackets;
        if (bracketCount <= 0) {
            emitter.endLine = i;
            break;
        }
    }
    return emitter;
}

function extractAssetReferences(line: string): string[] {
    const assets: string[] = [];
    const patterns = [
        /texture:\s*string\s*=\s*"([^"]+\.(?:dds|tex|png|jpg))"/gi,
        /mSimpleMeshName:\s*string\s*=\s*"([^"]+\.(?:scb|sco|skn))"/gi,
        /"([^"]+\.(?:dds|tex|png|jpg|scb|sco|skn|wav|ogg|anm))"/gi,
    ];
    for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null) {
            const asset = match[1];
            if (!assets.includes(asset)) assets.push(asset);
        }
    }
    return assets;
}

function parseSystemMetadata(contentLines: string[]): VfxSystemMetadata {
    const metadata: VfxSystemMetadata = {};
    for (const line of contentLines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# VFX_HUB_')) {
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex !== -1) {
                const key = trimmed.substring(2, colonIndex).trim();
                const value = trimmed.substring(colonIndex + 1).trim();
                applyMetaKey(metadata, key, value);
            }
        }
    }
    return metadata;
}

function applyMetaKey(metadata: VfxSystemMetadata, key: string, value: string): void {
    switch (key) {
        case 'VFX_HUB_NAME': metadata.displayName = value; break;
        case 'VFX_HUB_DESCRIPTION': metadata.description = value; break;
        case 'VFX_HUB_CATEGORY': metadata.category = value; break;
        case 'VFX_HUB_PREVIEW': metadata.previewImage = value; break;
        case 'VFX_HUB_DEMO': metadata.demoVideo = value; break;
        case 'VFX_HUB_TAGS': metadata.tags = value.split(',').map((t) => t.trim()); break;
        case 'VFX_HUB_EMITTERS': metadata.emitters = value; break;
    }
}

function parsePreHeaderMetadata(lines: string[], startLine: number): VfxSystemMetadata | null {
    const metadata: VfxSystemMetadata = {};
    const maxLookback = 10;
    const results: string[] = [];
    for (let i = startLine - 1; i >= 0 && i >= startLine - maxLookback; i--) {
        const line = (lines[i] || '').trim();
        if (line.length === 0) break;
        if (/=\s*VfxSystemDefinitionData\s*\{/.test(line)) break;
        if (line.startsWith('# VFX_HUB_')) results.push(line);
    }
    results.reverse();
    for (const l of results) {
        const colon = l.indexOf(':');
        if (colon === -1) continue;
        applyMetaKey(metadata, l.substring(2, colon).trim(), l.substring(colon + 1).trim());
    }
    return Object.keys(metadata).length ? metadata : null;
}

export function parseCompleteVFXSystems(content: string): ParsedVfxSystem[] {
    const systems: ParsedVfxSystem[] = [];
    const lines = content.split('\n');

    let currentSystem: ParsedVfxSystem | null = null;
    let bracketCount = 0;
    let inSystem = false;
    const resourceResolverEntries = extractResourceResolverEntries(content);

    const finalize = (sys: ParsedVfxSystem, valid: boolean, error: string | null, endLine: number) => {
        sys.endLine = endLine;
        sys.fullContent = sys.content.join('\n');
        sys.bracketCount = bracketCount;
        sys.isValid = valid;
        sys.validationError = error;
        const preHeaderMeta = parsePreHeaderMetadata(lines, sys.startLine);
        const inBlockMeta = parseSystemMetadata(sys.content);
        sys.metadata = { ...inBlockMeta, ...(preHeaderMeta || {}) };
        sys.assets = [...new Set(sys.assets)];
        systems.push(sys);
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.includes('VfxSystemDefinitionData {') && line.includes('=')) {
            const nameMatch = line.match(/^"?([^"=]+)"?\s*=\s*VfxSystemDefinitionData/);
            if (nameMatch) {
                if (inSystem && currentSystem) {
                    finalize(currentSystem, false, 'Incomplete - new system found before completion', i - 1);
                    inSystem = false;
                    currentSystem = null;
                    bracketCount = 0;
                }

                const name = nameMatch[1].trim().replace(/"/g, '');
                const newSystem: ParsedVfxSystem = {
                    name,
                    displayName: getShortSystemName(name),
                    startLine: i,
                    endLine: i,
                    content: [],
                    emitters: [],
                    emitterCount: 0,
                    bracketCount: 0,
                    metadata: {},
                    assets: [],
                    resourceResolverKey: null,
                    fullContent: '',
                    isValid: false,
                    validationError: null,
                };
                currentSystem = newSystem;

                const shortTail = name.split('/').pop() || name;
                const resolverEntry = resourceResolverEntries.find(
                    (entry) => entry.fullPath === name || entry.fullPath.includes(shortTail)
                );
                if (resolverEntry) newSystem.resourceResolverKey = resolverEntry.key;

                inSystem = true;
                bracketCount = 1;
                newSystem.content.push(lines[i]);
                continue;
            }
        }

        if (inSystem && currentSystem) {
            currentSystem.content.push(lines[i]);

            if (/VfxEmitterDefinitionData\s*\{/i.test(line)) {
                currentSystem.emitterCount++;
                const emitter = parseEmitterInContext(lines, i);
                if (emitter) currentSystem.emitters.push(emitter);
            }

            currentSystem.assets.push(...extractAssetReferences(line));

            let inStringLiteral = false;
            let stringChar: string | null = null;
            let lineOpenBrackets = 0;
            let lineCloseBrackets = 0;
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                const prevChar = j > 0 ? line[j - 1] : '';
                if ((char === '"' || char === "'") && prevChar !== '\\') {
                    if (!inStringLiteral) {
                        inStringLiteral = true;
                        stringChar = char;
                    } else if (char === stringChar) {
                        inStringLiteral = false;
                        stringChar = null;
                    }
                }
                if (!inStringLiteral) {
                    if (char === '{') lineOpenBrackets++;
                    else if (char === '}') lineCloseBrackets++;
                }
            }
            bracketCount += lineOpenBrackets - lineCloseBrackets;

            if (bracketCount === 0) {
                const validation = validateBrackets(currentSystem.content.join('\n'));
                finalize(currentSystem, validation.valid, validation.error ?? null, i);
                inSystem = false;
                currentSystem = null;
                bracketCount = 0;
                continue;
            }

            if (bracketCount < 0) bracketCount = 0;

            if (bracketCount > 50) {
                finalize(currentSystem, false, 'Complex nested structure - bracket count exceeded limit', i);
                inSystem = false;
                currentSystem = null;
                bracketCount = 0;
            }
        }
    }

    if (inSystem && currentSystem) {
        let completedContent = currentSystem.content.join('\n');
        for (let i = 0; i < bracketCount; i++) completedContent += '\n    }';
        currentSystem.fullContent = completedContent;
        currentSystem.isValid = true;
        currentSystem.validationError = null;
        currentSystem.wasCompleted = true;
        currentSystem.endLine = lines.length - 1;
        currentSystem.assets = [...new Set(currentSystem.assets)];
        systems.push(currentSystem);
    }

    return systems;
}

export function extractVFXSystem(content: string, systemName: string): ParsedVfxSystem {
    const systems = parseCompleteVFXSystems(content);
    const targetSystem = systems.find((sys) => sys.name === systemName);
    if (!targetSystem) throw new Error(`VFX system "${systemName}" not found`);
    return targetSystem;
}
