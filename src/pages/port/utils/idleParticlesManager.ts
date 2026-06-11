/* Idle particles manager. Ported 1:1 from the Electron Quartz util. */

export const BONE_NAMES = [
    'head',
    'spine1',
    'spine2',
    'pelvis',
    'C_Buffbone_Glb_Layout_Loc',
    'C_Buffbone_Glb_Center_Loc',
    'C_Buffbone_Glb_Overhead_Loc',
    'R_Foot',
    'L_Foot',
    'R_KneeLower',
    'L_KneeLower',
    'neck',
    'r_hand',
    'l_hand',
    'root',
];

export interface BoneConfig {
    boneName: string;
}

export interface ExistingIdleEntry {
    effectKey: string;
    bones: string[];
}

function findResourceResolverKey(pyContent: string, keyName: string): string | null {
    if (!pyContent || !keyName) return null;
    const cleanKeyName = keyName.replace(/^"|"$/g, '');

    const lines = pyContent.split('\n');
    let inResourceMap = false;
    let bracketDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.includes('resourceMap: map[hash,link] = {')) {
            inResourceMap = true;
            bracketDepth = 1;
            continue;
        }

        if (inResourceMap) {
            const ob = (line.match(/\{/g) || []).length;
            const cb = (line.match(/\}/g) || []).length;
            bracketDepth += ob - cb;

            if (cleanKeyName.startsWith('0x')) {
                if (line.startsWith(`${cleanKeyName} =`)) return cleanKeyName;
            } else {
                if (line.startsWith(`"${cleanKeyName}" =`)) return cleanKeyName;
            }

            if (bracketDepth === 0) break;
        }
    }

    return null;
}

export function extractParticleName(pyContent: string, vfxSystemName: string): string | null {
    const lines = pyContent.split('\n');

    if (vfxSystemName.startsWith('0x')) return vfxSystemName;

    if (!vfxSystemName.includes('/')) {
        const resourceResolverKey = findResourceResolverKey(pyContent, vfxSystemName);
        if (resourceResolverKey) return resourceResolverKey;
    }

    let inResourceMap = false;
    let bracketDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.includes('resourceMap: map[hash,link] = {')) {
            inResourceMap = true;
            bracketDepth = 1;
            continue;
        }

        if (inResourceMap) {
            const ob = (line.match(/\{/g) || []).length;
            const cb = (line.match(/\}/g) || []).length;
            bracketDepth += ob - cb;

            const mapMatch = line.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*"([^"]+)"/);
            if (mapMatch) {
                const key = mapMatch[1] || mapMatch[2];
                const value = mapMatch[3];
                const cleanSystemName = vfxSystemName.replace(/^"|"$/g, '');
                if (key && cleanSystemName && key.toLowerCase() === cleanSystemName.toLowerCase()) return key;
                if (value && cleanSystemName && value.toLowerCase() === cleanSystemName.toLowerCase()) return key;
            }

            if (bracketDepth === 0) break;
        }
    }

    const lastSegment = vfxSystemName.includes('/') ? vfxSystemName.split('/').pop() || vfxSystemName : vfxSystemName;

    inResourceMap = false;
    bracketDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.includes('resourceMap: map[hash,link] = {')) {
            inResourceMap = true;
            bracketDepth = 1;
            continue;
        }

        if (inResourceMap) {
            const ob = (line.match(/\{/g) || []).length;
            const cb = (line.match(/\}/g) || []).length;
            bracketDepth += ob - cb;

            const entryMatch = line.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*"([^"]+)"/);
            if (entryMatch) {
                const key = entryMatch[1] || entryMatch[2];
                const value = entryMatch[3];
                const valueLower = (value || '').toLowerCase();
                const cleanSystemName = vfxSystemName.replace(/^"|"$/g, '');
                const fullLower = (cleanSystemName || '').toLowerCase();
                const lastLower = (lastSegment || '').toLowerCase();

                if (key && cleanSystemName && key.toLowerCase() === cleanSystemName.toLowerCase()) return key;
                if (valueLower === fullLower) return key;
                if (lastLower && (valueLower.endsWith('/' + lastLower) || valueLower.endsWith('\\' + lastLower))) return key;
            }

            if (bracketDepth === 0) break;
        }
    }

    return null;
}

function locateSkinAndIdleBlocks(lines: string[]) {
    let skinStart = -1;
    let skinEnd = -1;
    let depth = 0;
    let inSkin = false;
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t.includes('= SkinCharacterDataProperties {')) {
            inSkin = true;
            skinStart = i;
            depth = 1;
            continue;
        }
        if (inSkin) {
            const open = (lines[i].match(/\{/g) || []).length;
            const close = (lines[i].match(/\}/g) || []).length;
            depth += open - close;
            if (depth === 0) {
                skinEnd = i;
                break;
            }
        }
    }

    let idleStart = -1;
    let idleEnd = -1;
    let idleDepth = 0;
    let inIdle = false;
    if (skinStart !== -1) {
        for (let i = skinStart; i < (skinEnd === -1 ? lines.length : skinEnd); i++) {
            const t = lines[i].trim();
            if (t.includes('idleParticlesEffects: list[embed] = {')) {
                inIdle = true;
                idleStart = i;
                idleDepth = 1;
                continue;
            }
            if (inIdle) {
                const open = (lines[i].match(/\{/g) || []).length;
                const close = (lines[i].match(/\}/g) || []).length;
                idleDepth += open - close;
                if (idleDepth === 0) {
                    idleEnd = i;
                    break;
                }
            }
        }
    }

    return { skinStart, skinEnd, idleStart, idleEnd };
}

export function addIdleParticleEffect(pyContent: string, vfxSystemName: string, boneNameOrArray: string | BoneConfig[] = 'head'): string {
    const lines = pyContent.split('\n');
    const updatedLines = [...lines];

    let skinCharacterDataStart = -1;
    let skinCharacterDataEnd = -1;
    let bracketDepth = 0;
    let inSkinCharacterData = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('= SkinCharacterDataProperties {')) {
            skinCharacterDataStart = i;
            inSkinCharacterData = true;
            bracketDepth = 1;
            continue;
        }
        if (inSkinCharacterData) {
            const open = (lines[i].match(/\{/g) || []).length;
            const close = (lines[i].match(/\}/g) || []).length;
            bracketDepth += open - close;
            if (bracketDepth === 0) {
                skinCharacterDataEnd = i;
                break;
            }
        }
    }

    if (skinCharacterDataStart === -1) throw new Error('Could not find SkinCharacterDataProperties block');

    let idleParticlesStart = -1;
    let idleParticlesEnd = -1;
    let idleParticlesBracketDepth = 0;
    let inIdleParticles = false;

    for (let i = skinCharacterDataStart; i < skinCharacterDataEnd; i++) {
        const line = lines[i].trim();
        if (line.includes('idleParticlesEffects: list[embed] = {')) {
            idleParticlesStart = i;
            inIdleParticles = true;
            idleParticlesBracketDepth = 1;
            continue;
        }
        if (inIdleParticles) {
            const open = (lines[i].match(/\{/g) || []).length;
            const close = (lines[i].match(/\}/g) || []).length;
            idleParticlesBracketDepth += open - close;
            if (idleParticlesBracketDepth === 0) {
                idleParticlesEnd = i;
                break;
            }
        }
    }

    const particleName = extractParticleName(pyContent, vfxSystemName);
    if (!particleName) {
        throw new Error(`VFX system "${vfxSystemName}" does not have a ResourceResolver mapping and cannot be used for idle particles.`);
    }

    const isHash = /^0x[0-9a-fA-F]+$/.test(particleName);
    const effectKeyLine = isHash ? `effectKey: hash = ${particleName}` : `effectKey: hash = "${particleName}"`;

    const boneConfigs = Array.isArray(boneNameOrArray) ? boneNameOrArray : [{ boneName: boneNameOrArray }];

    const newIdleEffects = boneConfigs.map(
        (config) =>
            `            SkinCharacterDataProperties_CharacterIdleEffect {
                ${effectKeyLine}
                boneName: string = "${config.boneName}"
            }`
    );

    if (idleParticlesStart !== -1) {
        updatedLines.splice(idleParticlesEnd, 0, ...newIdleEffects);
    } else {
        const newIdleParticlesBlock = [`        idleParticlesEffects: list[embed] = {`, ...newIdleEffects, `        }`];
        updatedLines.splice(skinCharacterDataEnd, 0, ...newIdleParticlesBlock);
    }

    return updatedLines.join('\n');
}

export function addIdleParticleEffectByKey(pyContent: string, effectKey: string, boneNameOrArray: string | BoneConfig[] = 'head'): string {
    const lines = pyContent.split('\n');
    const updatedLines = [...lines];

    let skinCharacterDataStart = -1;
    let skinCharacterDataEnd = -1;
    let bracketDepth = 0;
    let inSkinCharacterData = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('= SkinCharacterDataProperties {')) {
            skinCharacterDataStart = i;
            inSkinCharacterData = true;
            bracketDepth = 1;
            continue;
        }
        if (inSkinCharacterData) {
            const open = (lines[i].match(/\{/g) || []).length;
            const close = (lines[i].match(/\}/g) || []).length;
            bracketDepth += open - close;
            if (bracketDepth === 0) {
                skinCharacterDataEnd = i;
                break;
            }
        }
    }
    if (skinCharacterDataStart === -1) throw new Error('Could not find SkinCharacterDataProperties block');

    let idleParticlesStart = -1;
    let idleParticlesEnd = -1;
    let idleParticlesBracketDepth = 0;
    let inIdleParticles = false;
    for (let i = skinCharacterDataStart; i < skinCharacterDataEnd; i++) {
        const line = lines[i].trim();
        if (line.includes('idleParticlesEffects: list[embed] = {')) {
            idleParticlesStart = i;
            inIdleParticles = true;
            idleParticlesBracketDepth = 1;
            continue;
        }
        if (inIdleParticles) {
            const open = (lines[i].match(/\{/g) || []).length;
            const close = (lines[i].match(/\}/g) || []).length;
            idleParticlesBracketDepth += open - close;
            if (idleParticlesBracketDepth === 0) {
                idleParticlesEnd = i;
                break;
            }
        }
    }

    const cleanKey = String(effectKey || '').replace(/^"|"$/g, '').trim();
    if (!cleanKey) throw new Error('Missing effect key');
    const isHash = /^0x[0-9a-fA-F]+$/.test(cleanKey);
    const effectKeyLine = isHash ? `effectKey: hash = ${cleanKey}` : `effectKey: hash = "${cleanKey}"`;

    const boneConfigs = Array.isArray(boneNameOrArray) ? boneNameOrArray : [{ boneName: boneNameOrArray }];

    const newIdleEffects = boneConfigs.map(
        (config) =>
            `            SkinCharacterDataProperties_CharacterIdleEffect {
                ${effectKeyLine}
                boneName: string = "${config.boneName}"
            }`
    );

    if (idleParticlesStart !== -1) {
        updatedLines.splice(idleParticlesEnd, 0, ...newIdleEffects);
    } else {
        const newIdleParticlesBlock = [`        idleParticlesEffects: list[embed] = {`, ...newIdleEffects, `        }`];
        updatedLines.splice(skinCharacterDataEnd, 0, ...newIdleParticlesBlock);
    }

    return updatedLines.join('\n');
}

export function hasIdleParticleEffect(pyContent: string, vfxSystemName: string): boolean {
    const particleName = extractParticleName(pyContent, vfxSystemName);
    if (!particleName) return false;

    const lines = pyContent.split('\n');
    const { idleStart, idleEnd } = locateSkinAndIdleBlocks(lines);
    if (idleStart === -1) return false;

    for (let i = idleStart; i < (idleEnd === -1 ? lines.length : idleEnd); i++) {
        if (lines[i].includes('SkinCharacterDataProperties_CharacterIdleEffect {')) {
            let blockDepth = 1;
            for (let j = i + 1; j < (idleEnd === -1 ? lines.length : idleEnd); j++) {
                const l = lines[j];
                const trimmed = l.trim();
                const open = (l.match(/\{/g) || []).length;
                const close = (l.match(/\}/g) || []).length;
                blockDepth += open - close;
                if (/^effectKey:\s*hash\s*=/.test(trimmed)) {
                    const m = trimmed.match(/^effectKey:\s*hash\s*=\s*(?:"([^"]+)"|([^\s]+))/);
                    const val = m ? m[1] || m[2] : null;
                    if (val && (val === particleName || val.endsWith('/' + particleName))) return true;
                }
                if (blockDepth <= 0) break;
            }
        }
    }
    return false;
}

export function removeAllIdleParticlesForSystem(pyContent: string, vfxSystemName: string): string {
    const particleName = extractParticleName(pyContent, vfxSystemName);
    if (!particleName) return pyContent;

    const lines = pyContent.split('\n');
    const { idleStart, idleEnd } = locateSkinAndIdleBlocks(lines);
    if (idleStart === -1) return pyContent;

    const updatedLines: string[] = [];
    let i = 0;
    while (i < lines.length) {
        if (i >= idleStart && i < idleEnd && lines[i].includes('SkinCharacterDataProperties_CharacterIdleEffect {')) {
            let blockDepth = 1;
            let effectKeyMatches = false;
            let blockEnd = i;

            for (let j = i + 1; j < idleEnd; j++) {
                const l = lines[j];
                const trimmed = l.trim();
                const open = (l.match(/\{/g) || []).length;
                const close = (l.match(/\}/g) || []).length;
                blockDepth += open - close;
                if (/^effectKey:\s*hash\s*=/.test(trimmed)) {
                    const m = trimmed.match(/^effectKey:\s*hash\s*=\s*(?:"([^"]+)"|([^\s]+))/);
                    const val = m ? m[1] || m[2] : null;
                    if (val && (val === particleName || val.endsWith('/' + particleName))) effectKeyMatches = true;
                }
                if (blockDepth <= 0) {
                    blockEnd = j;
                    break;
                }
            }

            if (effectKeyMatches) {
                i = blockEnd + 1;
                continue;
            }
        }

        updatedLines.push(lines[i]);
        i++;
    }

    return updatedLines.join('\n');
}

export function removeAllIdleParticlesByEffectKey(pyContent: string, effectKey: string): string {
    const cleanKey = String(effectKey || '').replace(/^"|"$/g, '').trim();
    if (!cleanKey) return pyContent;

    const lines = pyContent.split('\n');
    const { idleStart, idleEnd } = locateSkinAndIdleBlocks(lines);
    if (idleStart === -1) return pyContent;

    const updatedLines: string[] = [];
    let i = 0;
    while (i < lines.length) {
        if (i >= idleStart && i < idleEnd && lines[i].includes('SkinCharacterDataProperties_CharacterIdleEffect {')) {
            let blockDepth = 1;
            let effectKeyMatches = false;
            let blockEnd = i;

            for (let j = i + 1; j < idleEnd; j++) {
                const l = lines[j];
                const trimmed = l.trim();
                const open = (l.match(/\{/g) || []).length;
                const close = (l.match(/\}/g) || []).length;
                blockDepth += open - close;
                if (/^effectKey:\s*hash\s*=/.test(trimmed)) {
                    const m = trimmed.match(/^effectKey:\s*hash\s*=\s*(?:"([^"]+)"|([^\s]+))/);
                    const val = m ? m[1] || m[2] : null;
                    if (val && (val === cleanKey || val.endsWith('/' + cleanKey))) effectKeyMatches = true;
                }
                if (blockDepth <= 0) {
                    blockEnd = j;
                    break;
                }
            }

            if (effectKeyMatches) {
                i = blockEnd + 1;
                continue;
            }
        }

        updatedLines.push(lines[i]);
        i++;
    }

    return updatedLines.join('\n');
}

export function extractExistingIdleParticles(pyContent: string): ExistingIdleEntry[] {
    if (!pyContent) return [];
    const lines = pyContent.split('\n');
    const { idleStart, idleEnd } = locateSkinAndIdleBlocks(lines);
    if (idleStart === -1) return [];

    const keyToBones = new Map<string, string[]>();
    for (let i = idleStart; i < idleEnd; i++) {
        if (!lines[i].includes('SkinCharacterDataProperties_CharacterIdleEffect {')) continue;
        let blockDepth = 1;
        let effectKey: string | null = null;
        let boneName: string | null = null;
        for (let j = i + 1; j < idleEnd; j++) {
            const l = lines[j];
            const t = l.trim();
            const open = (l.match(/\{/g) || []).length;
            const close = (l.match(/\}/g) || []).length;
            blockDepth += open - close;
            if (/^effectKey:\s*hash\s*=/.test(t)) {
                const m = t.match(/^effectKey:\s*hash\s*=\s*(?:"([^"]+)"|([^\s]+))/);
                effectKey = m ? m[1] || m[2] : effectKey;
            }
            if (/^boneName:\s*string\s*=/.test(t)) {
                const bm = t.match(/boneName:\s*string\s*=\s*"([^"]+)"/);
                boneName = bm ? bm[1] : boneName;
            }
            if (blockDepth <= 0) {
                if (effectKey) {
                    if (!keyToBones.has(effectKey)) keyToBones.set(effectKey, []);
                    if (boneName) keyToBones.get(effectKey)!.push(boneName);
                }
                i = j;
                break;
            }
        }
    }

    return Array.from(keyToBones.entries())
        .map(([effectKey, bones]) => ({ effectKey, bones }))
        .sort((a, b) => String(a.effectKey).localeCompare(String(b.effectKey)));
}

export function getAllIdleParticleBones(pyContent: string, vfxSystemName: string): string[] {
    const particleName = extractParticleName(pyContent, vfxSystemName);
    if (!particleName) return [];
    const lines = pyContent.split('\n');
    const { idleStart, idleEnd } = locateSkinAndIdleBlocks(lines);
    if (idleStart === -1) return [];

    const bones: string[] = [];
    for (let i = idleStart; i < (idleEnd === -1 ? lines.length : idleEnd); i++) {
        if (lines[i].includes('SkinCharacterDataProperties_CharacterIdleEffect {')) {
            let blockDepth = 1;
            let effectKeyMatches = false;
            let foundBone: string | null = null;
            for (let j = i + 1; j < (idleEnd === -1 ? lines.length : idleEnd); j++) {
                const l = lines[j];
                const trimmed = l.trim();
                const open = (l.match(/\{/g) || []).length;
                const close = (l.match(/\}/g) || []).length;
                blockDepth += open - close;
                if (/^effectKey:\s*hash\s*=/.test(trimmed)) {
                    const m = trimmed.match(/^effectKey:\s*hash\s*=\s*(?:"([^"]+)"|([^\s]+))/);
                    const val = m ? m[1] || m[2] : null;
                    if (val && (val === particleName || val.endsWith('/' + particleName))) effectKeyMatches = true;
                }
                if (effectKeyMatches && trimmed.startsWith('boneName:')) {
                    const bm = trimmed.match(/boneName:\s*string\s*=\s*"([^"]+)"/);
                    if (bm) foundBone = bm[1];
                }
                if (blockDepth <= 0) {
                    if (effectKeyMatches && foundBone) bones.push(foundBone);
                    break;
                }
            }
        }
    }
    return bones;
}
