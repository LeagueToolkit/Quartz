/* Child Particles Manager. Ported 1:1 from the Electron Quartz util. */

import { replaceSystemBlockInFile } from './matrixUtils';

export interface AvailableVfxSystem {
    key: string;
    name: string;
    fullPath: string;
    particleName?: string | null;
}

export interface ChildParticleData {
    rate: number;
    lifetime: number;
    bindWeight: number;
    isSingleParticle: boolean;
    effectKey: string | null;
    timeBeforeFirstEmission: number;
    translationOverrideX: number;
    translationOverrideY: number;
    translationOverrideZ: number;
    _inRate?: boolean;
    _inLifetime?: boolean;
    _inBindWeight?: boolean;
}

export type DeletedEmittersMap = Map<string, { systemKey: string; emitterName: string }>;

function findResourceResolverKeyForPath(fullPath: string, pyContent: string): string {
    const resourceResolverPattern = /ResourceResolver\s*{\s*resourceMap\s*:\s*map\[hash,link\]\s*=\s*{([\s\S]*?)}\s*}/;
    const match = pyContent.match(resourceResolverPattern);

    if (match) {
        const resourceMapContent = match[1];
        const entryPattern = /(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/g;
        let entryMatch: RegExpExecArray | null;

        while ((entryMatch = entryPattern.exec(resourceMapContent)) !== null) {
            const resourceResolverKey = entryMatch[1] || entryMatch[2];
            const mappedPath = entryMatch[3] || entryMatch[4];
            if (mappedPath === fullPath) return resourceResolverKey;
        }
    }

    return fullPath;
}

function applyPendingDeletions(pyContent: string, deletedEmittersMap: DeletedEmittersMap): string {
    const lines = pyContent.split('\n');
    const modifiedLines: string[] = [];

    const systemsWithDeletions = new Set<string>();
    for (const [, value] of deletedEmittersMap.entries()) systemsWithDeletions.add(value.systemKey);

    let currentSystemKey: string | null = null;
    let inComplexEmitterSection = false;
    let complexEmitterBracketDepth = 0;
    let emitterCountInSection = 0;
    let totalEmittersInSection = 0;
    let shouldProcessSystem = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (/VfxSystemDefinitionData\s*\{/i.test(trimmedLine)) {
            const headerMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/i);
            if (headerMatch) {
                currentSystemKey = headerMatch[1] || headerMatch[2];
                shouldProcessSystem = systemsWithDeletions.has(currentSystemKey);
            } else {
                shouldProcessSystem = false;
            }
            inComplexEmitterSection = false;
            complexEmitterBracketDepth = 0;
            emitterCountInSection = 0;
            totalEmittersInSection = 0;
        }

        if (/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{/i.test(trimmedLine)) {
            inComplexEmitterSection = true;
            complexEmitterBracketDepth = 1;

            let tempBracketDepth = 1;
            for (let j = i + 1; j < lines.length; j++) {
                const tempLine = lines[j];
                const ob = (tempLine.match(/\{/g) || []).length;
                const cb = (tempLine.match(/\}/g) || []).length;
                tempBracketDepth += ob - cb;
                if (/^VfxEmitterDefinitionData\s*\{/i.test(tempLine.trim())) totalEmittersInSection++;
                if (tempBracketDepth <= 0) break;
            }
        }

        if (inComplexEmitterSection) {
            const ob = (line.match(/\{/g) || []).length;
            const cb = (line.match(/\}/g) || []).length;
            complexEmitterBracketDepth += ob - cb;
            if (complexEmitterBracketDepth <= 0) inComplexEmitterSection = false;
        }

        if (/^VfxEmitterDefinitionData\s*\{/i.test(trimmedLine)) {
            emitterCountInSection++;

            if (shouldProcessSystem) {
                let emitterName: string | null = null;
                let emitterEndLine = i;
                let emitterBracketDepth = 1;
                let foundEmitterName = false;

                for (let j = i + 1; j < lines.length; j++) {
                    const searchLine = lines[j];
                    if (!foundEmitterName && /emitterName:/i.test(searchLine)) {
                        const m = searchLine.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
                        if (m) {
                            emitterName = m[1];
                            foundEmitterName = true;
                        }
                    }
                    const ob = (searchLine.match(/\{/g) || []).length;
                    const cb = (searchLine.match(/\}/g) || []).length;
                    emitterBracketDepth += ob - cb;
                    if (emitterBracketDepth <= 0) {
                        emitterEndLine = j;
                        break;
                    }
                }

                if (emitterName && currentSystemKey) {
                    const key = `${currentSystemKey}:${emitterName}`;
                    if (deletedEmittersMap.has(key)) {
                        const isLastEmitter = emitterCountInSection === totalEmittersInSection;
                        i = emitterEndLine;
                        if (!isLastEmitter) {
                            if (i + 1 < lines.length && lines[i + 1].trim() === '}') i++;
                        }
                        continue;
                    }
                }
            }
        }

        modifiedLines.push(line);
    }

    return modifiedLines.join('\n');
}

function extractVFXSystemFromContent(pyContent: string, systemKey: string) {
    const lines = pyContent.split('\n');
    let systemStart = -1;
    let systemEnd = -1;
    let bracketDepth = 0;

    const systemPattern = new RegExp(`^\\s*(?:"${systemKey.replace(/"/g, '')}"|(${systemKey}))\\s*=\\s*VfxSystemDefinitionData\\s*\\{`, 'i');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (systemPattern.test(line.trim())) {
            systemStart = i;
            bracketDepth = 1;
            continue;
        }
        if (systemStart !== -1) {
            const ob = (line.match(/\{/g) || []).length;
            const cb = (line.match(/\}/g) || []).length;
            bracketDepth += ob - cb;
            if (bracketDepth <= 0) {
                systemEnd = i;
                break;
            }
        }
    }

    if (systemStart === -1 || systemEnd === -1) return null;

    const systemContent = lines.slice(systemStart, systemEnd + 1).join('\n');
    return { systemContent, systemStart, systemEnd };
}

export function addChildParticleEffect(
    pyContent: string,
    systemKey: string,
    childSystemKey: string,
    emitterName: string,
    deletedEmitters: DeletedEmittersMap = new Map(),
    rate = 1,
    lifetime = 9999,
    bindWeight = 1,
    isSingleParticle = true,
    timeBeforeFirstEmission = 0,
    translationOverrideX = 0,
    translationOverrideY = 0,
    translationOverrideZ = 0
): string {
    let workingContent = pyContent;
    if (deletedEmitters && deletedEmitters.size > 0) workingContent = applyPendingDeletions(pyContent, deletedEmitters);

    const extractedSystem = extractVFXSystemFromContent(workingContent, systemKey);
    if (!extractedSystem) return pyContent;

    const { systemContent } = extractedSystem;

    const resolvedKey = childSystemKey.startsWith('0x') ? childSystemKey : findResourceResolverKeyForPath(childSystemKey, pyContent);
    const effectKeyValue = resolvedKey.startsWith('0x') ? resolvedKey : `"${resolvedKey}"`;

    const childEmitterBlock = `        VfxEmitterDefinitionData {
            timeBeforeFirstEmission: f32 = ${timeBeforeFirstEmission}
            rate: embed = ValueFloat {
                constantValue: f32 = ${rate}
            }
            particleLifetime: embed = ValueFloat {
                constantValue: f32 = ${lifetime}
            }
            bindWeight: embed = ValueFloat {
                constantValue: f32 = ${bindWeight}
            }
            translationOverride: vec3 = { ${translationOverrideX}, ${translationOverrideY}, ${translationOverrideZ} }
            childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData {
                childrenIdentifiers: list[embed] = {
                    VfxChildIdentifier {
                        effectKey: hash = ${effectKeyValue}
                    }
                }
            }
            isSingleParticle: flag = ${isSingleParticle ? 'true' : 'false'}
            emitterName: string = "${emitterName}_cbdl"
            blendMode: u8 = 1
            pass: i16 = 9999
            miscRenderFlags: u8 = 1
        }`;

    const updatedSystemContent = addEmitterToSystem(systemContent, [childEmitterBlock]);
    return replaceSystemBlockInFile(pyContent, systemKey, updatedSystemContent);
}

function addEmitterToSystem(systemContent: string, emittersPython: string[]): string {
    const lines = systemContent.split('\n');
    const result: string[] = [];

    let sectionStartLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/complexEmitterDefinitionData:\s*list\[pointer\]\s*=/i.test(lines[i])) {
            sectionStartLine = i;
            break;
        }
    }

    if (sectionStartLine === -1) return systemContent;

    const headerLine = lines[sectionStartLine];
    const headerIndentMatch = headerLine.match(/^(\s*)/);
    const headerIndent = headerIndentMatch ? headerIndentMatch[1] : '';
    const isEmptyInline = headerLine.includes('= {}');

    for (let i = 0; i < sectionStartLine; i++) result.push(lines[i]);

    const normalizedHeader = headerLine.replace(/= \{\}/, '= {');
    result.push(normalizedHeader);

    let i = sectionStartLine + 1;
    if (!isEmptyInline) {
        let depth = 1;
        for (; i < lines.length; i++) {
            const line = lines[i];
            const ob = (line.match(/\{/g) || []).length;
            const cb = (line.match(/\}/g) || []).length;
            depth += ob - cb;
            if (depth <= 0) break;
            else result.push(line);
        }
    }

    emittersPython.forEach((emitterPython) => result.push(emitterPython));

    result.push(headerIndent + '}');

    for (let j = i + 1; j < lines.length; j++) result.push(lines[j]);

    return result.join('\n');
}

export function findAvailableVfxSystems(pyContent: string): AvailableVfxSystem[] {
    const systems: AvailableVfxSystem[] = [];
    const lines = pyContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/=\s*VfxSystemDefinitionData\s*\{/i.test(line)) {
            const quotedMatch = line.match(/^"([^"]+)"\s*=\s*VfxSystemDefinitionData/i);
            const hashMatch = line.match(/^(0x[0-9a-fA-F]+)\s*=\s*VfxSystemDefinitionData/i);

            if (quotedMatch) {
                const fullPath = quotedMatch[1];
                const displayName = fullPath.split('/').pop() || fullPath;
                systems.push({ key: fullPath, name: displayName, fullPath });
            } else if (hashMatch) {
                const hashKey = hashMatch[1];
                let particleName: string | null = null;
                let bracketDepth = 1;
                for (let j = i + 1; j < lines.length; j++) {
                    const l = lines[j];
                    const ob = (l.match(/\{/g) || []).length;
                    const cb = (l.match(/\}/g) || []).length;
                    bracketDepth += ob - cb;
                    const pm = l.match(/particleName:\s*string\s*=\s*"([^"]+)"/i);
                    if (pm) {
                        particleName = pm[1];
                        break;
                    }
                    if (bracketDepth <= 0) break;
                }
                const displayName = particleName ? `${particleName} (${hashKey})` : hashKey;
                systems.push({ key: hashKey, name: displayName, fullPath: hashKey, particleName });
            }
        }
    }

    return systems;
}

export function isDivineLabChildParticle(emitterName: string | undefined | null): boolean {
    return !!emitterName && emitterName.endsWith('_cbdl');
}

export function extractChildParticleData(pyContent: string, systemKey: string, emitterName: string): ChildParticleData | null {
    const lines = pyContent.split('\n');
    let inTargetSystem = false;
    let bracketDepth = 0;

    const systemPattern = new RegExp(`^\\s*(?:"${systemKey.replace(/"/g, '')}"|(${systemKey}))\\s*=\\s*VfxSystemDefinitionData\\s*\\{`, 'i');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (systemPattern.test(line.trim())) {
            inTargetSystem = true;
            bracketDepth = 1;
            continue;
        }

        if (inTargetSystem) {
            const ob = (line.match(/\{/g) || []).length;
            const cb = (line.match(/\}/g) || []).length;
            bracketDepth += ob - cb;

            if (/^VfxEmitterDefinitionData\s*\{/i.test(line.trim())) {
                let emitterDepth = 1;
                let foundTargetEmitter = false;
                const tempData: ChildParticleData = {
                    rate: 1,
                    lifetime: 9999,
                    bindWeight: 1,
                    isSingleParticle: true,
                    effectKey: null,
                    timeBeforeFirstEmission: 0,
                    translationOverrideX: 0,
                    translationOverrideY: 0,
                    translationOverrideZ: 0,
                };

                for (let j = i + 1; j < lines.length; j++) {
                    const emitterLine = lines[j];
                    const eob = (emitterLine.match(/\{/g) || []).length;
                    const ecb = (emitterLine.match(/\}/g) || []).length;
                    emitterDepth += eob - ecb;

                    if (new RegExp(`emitterName:\\s*string\\s*=\\s*"${emitterName}"`, 'i').test(emitterLine)) {
                        foundTargetEmitter = true;
                    }

                    if (/rate:\s*embed\s*=\s*ValueFloat/i.test(emitterLine)) tempData._inRate = true;
                    else if (/particleLifetime:\s*embed\s*=\s*ValueFloat/i.test(emitterLine)) tempData._inLifetime = true;
                    else if (/bindWeight:\s*embed\s*=\s*ValueFloat/i.test(emitterLine)) tempData._inBindWeight = true;

                    if (/constantValue:\s*f32\s*=/i.test(emitterLine)) {
                        const vm = emitterLine.match(/constantValue:\s*f32\s*=\s*([0-9.]+)/i);
                        if (vm) {
                            const value = parseFloat(vm[1]);
                            if (tempData._inRate) {
                                tempData.rate = value;
                                tempData._inRate = false;
                            } else if (tempData._inLifetime) {
                                tempData.lifetime = value;
                                tempData._inLifetime = false;
                            } else if (tempData._inBindWeight) {
                                tempData.bindWeight = value;
                                tempData._inBindWeight = false;
                            }
                        }
                    }

                    if (/isSingleParticle:/i.test(emitterLine)) {
                        const sm = emitterLine.match(/isSingleParticle:\s*flag\s*=\s*(true|false)/i);
                        if (sm) tempData.isSingleParticle = sm[1] === 'true';
                    }

                    if (/effectKey:/i.test(emitterLine)) {
                        const ekm = emitterLine.match(/effectKey:\s*hash\s*=\s*(0x[0-9a-fA-F]+|"[^"]+")/i);
                        if (ekm) tempData.effectKey = ekm[1].replace(/"/g, '');
                    }

                    if (/timeBeforeFirstEmission:/i.test(emitterLine)) {
                        const tm = emitterLine.match(/timeBeforeFirstEmission:\s*f32\s*=\s*([0-9.]+)/i);
                        if (tm) tempData.timeBeforeFirstEmission = parseFloat(tm[1]);
                    }

                    if (/translationOverride:/i.test(emitterLine)) {
                        const trm = emitterLine.match(/translationOverride:\s*vec3\s*=\s*\{\s*([0-9.-]+),\s*([0-9.-]+),\s*([0-9.-]+)\s*\}/i);
                        if (trm) {
                            tempData.translationOverrideX = parseFloat(trm[1]);
                            tempData.translationOverrideY = parseFloat(trm[2]);
                            tempData.translationOverrideZ = parseFloat(trm[3]);
                        }
                    }

                    if (emitterDepth <= 0) {
                        if (foundTargetEmitter) return tempData;
                        break;
                    }
                }
            }

            if (bracketDepth <= 0) break;
        }
    }

    return null;
}

export function updateChildParticleEmitter(
    pyContent: string,
    systemKey: string,
    emitterName: string,
    newData: Partial<ChildParticleData> & { effectKey?: string }
): string {
    const lines = pyContent.split('\n');
    const modifiedLines: string[] = [];
    let inTargetSystem = false;
    let inTargetEmitter = false;
    let bracketDepth = 0;
    let emitterDepth = 0;
    let emitterStartLine = -1;
    let emitterEndLine = -1;

    const systemPattern = new RegExp(`^\\s*(?:"${systemKey.replace(/"/g, '')}"|(${systemKey}))\\s*=\\s*VfxSystemDefinitionData\\s*\\{`, 'i');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (systemPattern.test(line.trim())) {
            inTargetSystem = true;
            bracketDepth = 1;
            continue;
        }

        if (inTargetSystem) {
            const ob = (line.match(/\{/g) || []).length;
            const cb = (line.match(/\}/g) || []).length;
            bracketDepth += ob - cb;

            if (/^VfxEmitterDefinitionData\s*\{/i.test(line.trim())) {
                emitterDepth = 1;
                emitterStartLine = i;
                continue;
            }

            if (emitterDepth > 0) {
                const eob = (line.match(/\{/g) || []).length;
                const ecb = (line.match(/\}/g) || []).length;
                emitterDepth += eob - ecb;

                if (new RegExp(`emitterName:\\s*string\\s*=\\s*"${emitterName}"`, 'i').test(line)) inTargetEmitter = true;
                if (inTargetEmitter && emitterDepth <= 0) {
                    emitterEndLine = i;
                    break;
                }
            }

            if (bracketDepth <= 0) break;
        }
    }

    if (emitterStartLine === -1 || emitterEndLine === -1) return pyContent;

    const currentData = extractChildParticleData(pyContent, systemKey, emitterName);
    if (!currentData) return pyContent;

    const mergedData = {
        rate: newData.rate !== undefined ? newData.rate : currentData.rate,
        lifetime: newData.lifetime !== undefined ? newData.lifetime : currentData.lifetime,
        bindWeight: newData.bindWeight !== undefined ? newData.bindWeight : currentData.bindWeight,
        isSingleParticle: newData.isSingleParticle !== undefined ? newData.isSingleParticle : currentData.isSingleParticle,
        effectKey: newData.effectKey !== undefined ? newData.effectKey : currentData.effectKey,
        timeBeforeFirstEmission: newData.timeBeforeFirstEmission !== undefined ? newData.timeBeforeFirstEmission : currentData.timeBeforeFirstEmission,
        translationOverrideX: newData.translationOverrideX !== undefined ? newData.translationOverrideX : currentData.translationOverrideX,
        translationOverrideY: newData.translationOverrideY !== undefined ? newData.translationOverrideY : currentData.translationOverrideY,
        translationOverrideZ: newData.translationOverrideZ !== undefined ? newData.translationOverrideZ : currentData.translationOverrideZ,
    };

    const effectKey = mergedData.effectKey || '';
    const resolvedKey = effectKey.startsWith('0x') ? effectKey : findResourceResolverKeyForPath(effectKey, pyContent);
    const effectKeyValue = resolvedKey.startsWith('0x') ? resolvedKey : `"${resolvedKey}"`;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i >= emitterStartLine && i <= emitterEndLine) {
            if (i === emitterStartLine) {
                const newEmitterBlock = `        VfxEmitterDefinitionData {
            timeBeforeFirstEmission: f32 = ${mergedData.timeBeforeFirstEmission}
            rate: embed = ValueFloat {
                constantValue: f32 = ${mergedData.rate}
            }
            particleLifetime: embed = ValueFloat {
                constantValue: f32 = ${mergedData.lifetime}
            }
            bindWeight: embed = ValueFloat {
                constantValue: f32 = ${mergedData.bindWeight}
            }
            translationOverride: vec3 = { ${mergedData.translationOverrideX}, ${mergedData.translationOverrideY}, ${mergedData.translationOverrideZ} }
            childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData {
                childrenIdentifiers: list[embed] = {
                    VfxChildIdentifier {
                        effectKey: hash = ${effectKeyValue}
                    }
                }
            }
            isSingleParticle: flag = ${mergedData.isSingleParticle ? 'true' : 'false'}
            emitterName: string = "${emitterName}"
            blendMode: u8 = 1
            pass: i16 = 9999
            miscRenderFlags: u8 = 1
        }`;
                modifiedLines.push(newEmitterBlock);
            }
        } else {
            modifiedLines.push(line);
        }
    }

    return modifiedLines.join('\n');
}
