/* Simple VFX emitter parser, ported 1:1 from the Electron Quartz
   (src/utils/vfx/vfxEmitterParser.js). Extracts emitter names for UI display
   and keeps the original system content intact for porting. */

export interface DonorEmitter {
    name: string;
    loaded: boolean;
}

export interface DonorSystem {
    key: string;
    name: string;
    particleName: string | null;
    emitters: DonorEmitter[];
    startLine: number;
    endLine: number;
    rawContent: string;
    // VFXHub enrichment (downloaded systems).
    downloaded?: boolean;
    downloadedAt?: number;
    ported?: boolean;
    portedAt?: number;
    createdAt?: number;
    collection?: string;
    category?: string;
    assets?: HubAsset[];
}

export interface HubAsset {
    name: string;
    sourceName?: string;
    path: string;
    downloadUrl?: string | null;
    size?: number;
    localPath?: string;
}

function cleanSystemName(fullName: string): string {
    if (fullName.startsWith('0x')) return fullName;
    const cleanName = fullName.replace(/^"|"$/g, '');
    const parts = cleanName.split('/');
    return parts.length > 1 ? parts[parts.length - 1] : cleanName;
}

function parseEmitterNameOnly(lines: string[], emitterStartLine: number): string | null {
    let bracketDepth = 1;
    for (let i = emitterStartLine + 1; i < lines.length && i < emitterStartLine + 100; i++) {
        const line = lines[i].trim();
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        bracketDepth += openBrackets - closeBrackets;
        if (/emitterName:/i.test(line)) {
            const match = line.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
            if (match) return match[1];
        }
        if (bracketDepth <= 0) break;
    }
    return null;
}

function parseEmitterNamesInVfxSystem(lines: string[], systemStartLine: number): { emitterNames: string[]; endLine: number } {
    const emitterNames: string[] = [];
    let systemEndLine = systemStartLine;
    let bracketDepth = 0;
    let inSystem = false;

    for (let i = systemStartLine; i < lines.length; i++) {
        const line = lines[i].trim();
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;

        if (i === systemStartLine) {
            bracketDepth = 1;
            inSystem = true;
            continue;
        }

        if (inSystem) {
            bracketDepth += openBrackets - closeBrackets;
            if (/VfxEmitterDefinitionData\s*\{/i.test(line)) {
                const emitterName = parseEmitterNameOnly(lines, i);
                if (emitterName) emitterNames.push(emitterName);
            }
            if (bracketDepth <= 0) {
                systemEndLine = i;
                break;
            }
        }
    }
    return { emitterNames, endLine: systemEndLine };
}

export function parseVfxEmitters(content: string): Record<string, DonorSystem> {
    const systems: Record<string, DonorSystem> = {};
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/=\s*VfxSystemDefinitionData\s*\{/i.test(line)) {
            const keyMatch = line.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData\s*\{/i);
            if (keyMatch) {
                const systemKeyRaw = keyMatch[1] || keyMatch[2];
                const cleanKey = systemKeyRaw.replace(/^"|"$/g, '');
                const systemName = cleanSystemName(systemKeyRaw);
                const { emitterNames, endLine } = parseEmitterNamesInVfxSystem(lines, i);
                const systemContent = lines.slice(i, endLine + 1).join('\n');

                let particleName: string | null = null;
                const particleNameMatch = systemContent.match(/particleName:\s*string\s*=\s*"([^"]+)"/i);
                if (particleNameMatch) particleName = particleNameMatch[1];

                systems[cleanKey] = {
                    key: cleanKey,
                    name: systemName,
                    particleName,
                    emitters: emitterNames.map((name) => ({ name, loaded: false })),
                    startLine: i,
                    endLine,
                    rawContent: systemContent,
                };
            }
        }
    }
    return systems;
}
