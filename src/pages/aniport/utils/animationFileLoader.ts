// Animation File Loader - loads + parses an animation/skins pair from ritobin text.
// Ported from animationFileLoader.js. In Tauri the .bin is read to ritobin text by
// the backend (readBin) before this runs, so loadAnimationFilePair takes the two
// content strings directly instead of reading files via fs.

import { parseAnimationData } from './animationParser';
import { linkAnimationWithVfx, type LinkedData } from './animationVfxLinker';
import type { AnimationData, VfxSystem } from './types';

export interface LoadResult {
    success: boolean;
    animationData: AnimationData | null;
    vfxSystems: Record<string, VfxSystem>;
    resourceResolver: Record<string, string>;
    linkedData: LinkedData | null;
    originalAnimationContent: string;
    originalSkinsContent: string;
    skeletonInfo: { skeleton: string; simpleSkin: string | null; texture: string | null } | null;
    errors: string[];
    warnings: string[];
}

export function loadAnimationFilePair(animationContent: string, skinsContent: string): LoadResult {
    const result: LoadResult = {
        success: false,
        animationData: null,
        vfxSystems: {},
        resourceResolver: {},
        linkedData: null,
        originalAnimationContent: animationContent,
        originalSkinsContent: skinsContent,
        skeletonInfo: null,
        errors: [],
        warnings: [],
    };

    try {
        if (!validateAnimationFile(animationContent)) {
            result.errors.push('Invalid animation file format');
            return result;
        }
        if (!validateSkinsFile(skinsContent)) {
            result.errors.push('Invalid skins file format');
            return result;
        }

        result.animationData = parseAnimationData(animationContent);

        result.vfxSystems = parseIndividualVFXSystems(skinsContent);
        result.resourceResolver = extractResourceResolverEntries(skinsContent);

        const skeletonInfo = extractSkeletonInfo(skinsContent);
        if (skeletonInfo) result.skeletonInfo = skeletonInfo;
        else result.warnings.push('No skeleton information found in skins file');

        result.linkedData = linkAnimationWithVfx(result.animationData, result.vfxSystems, result.resourceResolver);

        result.success = true;
    } catch (error) {
        result.errors.push(`Loading failed: ${(error as Error).message}`);
    }

    return result;
}

export function validateAnimationFile(content: string): boolean {
    if (!content || content.length === 0) return false;
    return (
        content.includes('animationGraphData') &&
        (content.includes('AtomicClipData') || content.includes('SequencerClipData'))
    );
}

export function validateSkinsFile(content: string): boolean {
    if (!content || content.length === 0) return false;
    return content.includes('SkinCharacterDataProperties') || content.includes('VfxSystemDefinitionData');
}

/* Pull every VfxSystemDefinitionData block keyed by its name/hash. */
function parseIndividualVFXSystems(content: string): Record<string, VfxSystem> {
    const systems: Record<string, VfxSystem> = {};
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/=\s*VfxSystemDefinitionData\s*{/i.test(line)) {
            const keyMatch = line.match(/^\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData\s*{/i);
            const name = keyMatch ? keyMatch[1] || keyMatch[2] : `VfxSystem_${i}`;

            let depth = 0;
            let started = false;
            let end = i;
            for (let j = i; j < lines.length; j++) {
                for (const ch of lines[j]) {
                    if (ch === '{') {
                        depth++;
                        started = true;
                    } else if (ch === '}') depth--;
                }
                if (started && depth === 0) {
                    end = j;
                    break;
                }
            }

            const rawContent = lines.slice(i, end + 1).join('\n');
            systems[name] = { name, rawContent, fullContent: rawContent, emitters: [] };
            i = end;
        }
    }

    return systems;
}

/* Extract ResourceResolver key -> path entries. */
function extractResourceResolverEntries(content: string): Record<string, string> {
    const resolver: Record<string, string> = {};
    const rrMatch = content.match(/ResourceResolver\s*{/);
    if (!rrMatch || rrMatch.index === undefined) return resolver;

    const start = rrMatch.index;
    let depth = 0;
    let started = false;
    let end = start;
    for (let i = start; i < content.length; i++) {
        const ch = content[i];
        if (ch === '{') {
            depth++;
            started = true;
        } else if (ch === '}') {
            depth--;
            if (started && depth === 0) {
                end = i;
                break;
            }
        }
    }

    const section = content.slice(start, end + 1);
    const re = /"([^"]+)"\s*=\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(section)) !== null) {
        resolver[m[1]] = m[2];
    }
    return resolver;
}

function extractSkeletonInfo(skinsContent: string): { skeleton: string; simpleSkin: string | null; texture: string | null } | null {
    const skeletonMatch = skinsContent.match(/skeleton:\s*string\s*=\s*"([^"]+)"/);
    const simpleSkinMatch = skinsContent.match(/simpleSkin:\s*string\s*=\s*"([^"]+)"/);
    const textureMatch = skinsContent.match(/texture:\s*string\s*=\s*"([^"]+)"/);
    if (skeletonMatch) {
        return {
            skeleton: skeletonMatch[1],
            simpleSkin: simpleSkinMatch ? simpleSkinMatch[1] : null,
            texture: textureMatch ? textureMatch[1] : null,
        };
    }
    return null;
}
