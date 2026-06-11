/* Simple VFX Emitter Parser — fast and reliable.
   Only extracts emitter names for UI display, keeps original content intact.
   Ported 1:1 from the Electron Quartz Port2 page. */

export interface VfxEmitter {
    name: string;
    loaded?: boolean;
    startLine?: number;
    endLine?: number;
    rawContent?: string;
    originalContent?: string;
    texturePath?: string | null;
    allTextures?: { path: string; label: string }[];
    color?: { constantValue?: string } | null;
    isChildParticle?: boolean;
    childSystemKey?: string;
}

export interface VfxSystem {
    key: string;
    name: string;
    particleName: string | null;
    emitters: VfxEmitter[];
    startLine: number;
    endLine: number;
    rawContent: string;
    ported?: boolean;
    portedAt?: number;
    createdAt?: number;
}

export type VfxSystemMap = Record<string, VfxSystem>;

export const parseVfxEmitters = (content: string): VfxSystemMap => {
    const systems: VfxSystemMap = {};
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (/=\s*VfxSystemDefinitionData\s*\{/i.test(line)) {
            const keyMatch = line.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData\s*\{/i);
            if (keyMatch) {
                const systemKeyRaw = keyMatch[1] || keyMatch[2];
                const cleanSystemKey = systemKeyRaw.replace(/^"|"$/g, '');
                const systemName = cleanSystemName(systemKeyRaw);

                const { emitterNames, endLine } = parseEmitterNamesInVfxSystem(lines, i);
                const systemContent = lines.slice(i, endLine + 1).join('\n');

                let particleName: string | null = null;
                const particleNameMatch = systemContent.match(/particleName:\s*string\s*=\s*"([^"]+)"/i);
                if (particleNameMatch) particleName = particleNameMatch[1];

                systems[cleanSystemKey] = {
                    key: cleanSystemKey,
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
};

const parseEmitterNamesInVfxSystem = (lines: string[], systemStartLine: number) => {
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
};

const parseEmitterNameOnly = (lines: string[], emitterStartLine: number): string | null => {
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
};

export const loadEmitterData = (system: VfxSystem | undefined, emitterName: string): VfxEmitter | null => {
    if (!system || !system.rawContent) return null;

    const lines = system.rawContent.split('\n');
    let bracketDepth = 0;
    let inSystem = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;

        if (i === 0) {
            bracketDepth = 1;
            inSystem = true;
            continue;
        }

        if (inSystem) {
            bracketDepth += openBrackets - closeBrackets;

            if (/VfxEmitterDefinitionData\s*\{/i.test(line)) {
                let emitterBracketDepth = 1;
                let emitterEndLine = i;

                for (let j = i + 1; j < lines.length; j++) {
                    const emitterLine = lines[j];
                    const ob = (emitterLine.match(/{/g) || []).length;
                    const cb = (emitterLine.match(/}/g) || []).length;
                    emitterBracketDepth += ob - cb;
                    if (emitterBracketDepth <= 0) {
                        emitterEndLine = j;
                        break;
                    }
                }

                const emitterLines = lines.slice(i, emitterEndLine + 1);
                const { emitter } = parseVfxEmitter(emitterLines, 0);

                if (emitter && emitter.name) {
                    if (emitter.name === emitterName) return emitter;
                }
                i = emitterEndLine;
            }

            if (bracketDepth <= 0) break;
        }
    }

    return null;
};

export const cleanSystemName = (fullName: string): string => {
    if (fullName.startsWith('0x')) return fullName;
    const cleanName = fullName.replace(/^"|"$/g, '');
    const parts = cleanName.split('/');
    return parts.length > 1 ? parts[parts.length - 1] : cleanName;
};

const parseVfxEmitter = (lines: string[], emitterStartLine: number): { emitter: VfxEmitter; endLine: number } => {
    const emitter: VfxEmitter = {
        name: '',
        startLine: emitterStartLine,
        endLine: emitterStartLine,
        rawContent: '',
        originalContent: '',
        texturePath: null,
    };

    let bracketDepth = 0;
    let originalContent = '';

    for (let i = emitterStartLine; i < lines.length && i < emitterStartLine + 2000; i++) {
        const line = lines[i];
        originalContent += line + '\n';
        const trimmedLine = line.trim();

        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        bracketDepth += openBrackets - closeBrackets;

        if (/emitterName:/i.test(trimmedLine)) {
            const match = trimmedLine.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
            if (match) emitter.name = match[1];
        }

        if (bracketDepth <= 0) {
            emitter.endLine = i;
            emitter.originalContent = originalContent;
            emitter.texturePath = findTexturePathInContent(originalContent);
            emitter.allTextures = findAllTexturesInContent(originalContent);
            break;
        }
    }

    return { emitter, endLine: emitter.endLine || emitterStartLine };
};

export const findAllTexturesInContent = (content: string): { path: string; label: string }[] => {
    const textures: { path: string; label: string }[] = [];
    const textureSet = new Set<string>();

    const cleanPath = (path: string) => {
        if (path && path.includes('akitanerusera')) {
            return path.replace(/akitanerusera/g, 'ASSETS');
        }
        return path;
    };

    const texturePatterns = [
        { regex: /(?<![a-zA-Z])texture:\s*string\s*=\s*"([^"]+\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi, label: 'Main Texture' },
        { regex: /particleColorTexture:\s*string\s*=\s*"([^"]+\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi, label: 'Color Texture' },
        { regex: /erosionMapName:\s*string\s*=\s*"([^"]+\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi, label: 'Erosion Map' },
        { regex: /textureMult:\s*string\s*=\s*"([^"]+\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi, label: 'Mult Texture' },
        { regex: /paletteTexture:\s*string\s*=\s*"([^"]+\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi, label: 'Palette' },
        { regex: /normalMap:\s*string\s*=\s*"([^"]+\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi, label: 'Normal Map' },
        { regex: /normalMapTexture:\s*string\s*=\s*"([^"]+\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi, label: 'Normal Map' },
    ];

    for (const { regex, label } of texturePatterns) {
        const matches = [...content.matchAll(regex)];
        for (const match of matches) {
            const texturePath = cleanPath(match[1]);
            if (texturePath && !textureSet.has(texturePath)) {
                textureSet.add(texturePath);
                textures.push({ path: texturePath, label });
            }
        }
    }

    return textures;
};

const findTexturePathInContent = (content: string): string | null => {
    const allTextures = findAllTexturesInContent(content);
    const mainTexture = allTextures.find((t) => t.label === 'Main Texture');
    if (mainTexture) return mainTexture.path;
    return allTextures.length > 0 ? allTextures[0].path : null;
};

/* Safely replace the emitter definition data block within a single VFX system
   using a provided list of emitter python snippets. Preserves all other fields.
   Handles both simpleEmitterDefinitionData and complexEmitterDefinitionData. */
export const replaceEmittersInSystem = (systemContent: string, emittersPython: string[]): string => {
    const lines = systemContent.split('\n');

    const complexEmitters: string[] = [];
    const simpleEmitters: string[] = [];

    let inComplexSection = false;
    let inSimpleSection = false;
    let complexSectionStart = -1;
    let simpleSectionStart = -1;
    let complexSectionDepth = 0;
    let simpleSectionDepth = 0;
    const originalEmitterSections = new Map<string, string>();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (/complexEmitterDefinitionData:\s*list\[pointer\]\s*=/i.test(trimmed)) {
            inComplexSection = true;
            complexSectionStart = i;
            complexSectionDepth = 1;
        } else if (/simpleEmitterDefinitionData:\s*list\[pointer\]\s*=/i.test(trimmed)) {
            inSimpleSection = true;
            simpleSectionStart = i;
            simpleSectionDepth = 1;
        }

        if ((inComplexSection || inSimpleSection) && /VfxEmitterDefinitionData\s*\{/i.test(trimmed)) {
            for (let j = i + 1; j < lines.length && j < i + 50; j++) {
                const emitterLine = lines[j];
                if (/emitterName:\s*string\s*=\s*"/i.test(emitterLine)) {
                    const match = emitterLine.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
                    if (match) {
                        originalEmitterSections.set(match[1], inComplexSection ? 'complex' : 'simple');
                        break;
                    }
                }
            }
        }

        if (inComplexSection) {
            const opens = (line.match(/\{/g) || []).length;
            const closes = (line.match(/\}/g) || []).length;
            complexSectionDepth += opens - closes;
            if (complexSectionDepth <= 0) inComplexSection = false;
        }

        if (inSimpleSection) {
            const opens = (line.match(/\{/g) || []).length;
            const closes = (line.match(/\}/g) || []).length;
            simpleSectionDepth += opens - closes;
            if (simpleSectionDepth <= 0) inSimpleSection = false;
        }
    }

    for (const emitterBlock of emittersPython) {
        let emitterName: string | null = null;
        const emitterLines = emitterBlock.split('\n');
        for (const emitterLine of emitterLines) {
            if (/emitterName:\s*string\s*=\s*"/i.test(emitterLine)) {
                const match = emitterLine.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
                if (match) {
                    emitterName = match[1];
                    break;
                }
            }
        }

        const sectionType = emitterName ? originalEmitterSections.get(emitterName) : undefined;
        if (sectionType === 'simple') simpleEmitters.push(emitterBlock);
        else complexEmitters.push(emitterBlock);
    }

    if (complexSectionStart !== -1 && simpleSectionStart !== -1) {
        const complexResultLines = replaceEmittersInSection(lines, complexSectionStart, complexEmitters);

        let newSimpleSectionStart = -1;
        for (let i = 0; i < complexResultLines.length; i++) {
            if (/simpleEmitterDefinitionData:\s*list\[pointer\]\s*=/i.test(complexResultLines[i])) {
                newSimpleSectionStart = i;
                break;
            }
        }

        if (newSimpleSectionStart !== -1) {
            return replaceEmittersInSection(complexResultLines, newSimpleSectionStart, simpleEmitters).join('\n');
        }
        return complexResultLines.join('\n');
    }

    let sectionStartLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (
            /complexEmitterDefinitionData:\s*list\[pointer\]\s*=/i.test(lines[i]) ||
            /simpleEmitterDefinitionData:\s*list\[pointer\]\s*=/i.test(lines[i])
        ) {
            sectionStartLine = i;
            break;
        }
    }

    if (sectionStartLine === -1) return systemContent;

    const emittersToUse =
        complexSectionStart !== -1 ? complexEmitters : simpleSectionStart !== -1 ? simpleEmitters : emittersPython;

    return replaceEmittersInSection(lines, sectionStartLine, emittersToUse).join('\n');
};

const replaceEmittersInSection = (lines: string[], sectionStartLine: number, emittersPython: string[]): string[] => {
    const result: string[] = [];

    const headerLine = lines[sectionStartLine];
    const headerIndentMatch = headerLine.match(/^(\s*)/);
    const headerIndent = headerIndentMatch ? headerIndentMatch[1] : '';
    const emitterIndent = headerIndent + '    ';

    const isEmptyInline = headerLine.includes('= {}');

    for (let i = 0; i < sectionStartLine; i++) result.push(lines[i]);

    const normalizedHeader = headerLine.replace(/= \{\}/, '= {');
    result.push(normalizedHeader);

    let i = sectionStartLine + 1;
    if (!isEmptyInline) {
        let depth = 1;
        for (; i < lines.length; i++) {
            const line = lines[i];
            const opens = (line.match(/\{/g) || []).length;
            const closes = (line.match(/\}/g) || []).length;
            depth += opens - closes;
            if (depth <= 0) break;
        }
    }

    for (const emitterBlock of emittersPython) {
        const trimmed = emitterBlock.replace(/\n$/, '');
        const emitterLines = trimmed.split('\n');
        emitterLines[0] = emitterIndent + emitterLines[0].trim();
        const last = emitterLines[emitterLines.length - 1].trim();
        if (last !== '}') emitterLines.push(emitterIndent + '}');
        result.push(...emitterLines);
    }

    result.push(headerIndent + '}');

    if (!isEmptyInline) i += 1;
    else i = sectionStartLine + 1;

    for (; i < lines.length; i++) result.push(lines[i]);

    return result;
};

/* Generate a modified python file content by replacing emitter sections for
   systems based on the provided systems map. Uses emitter.originalContent when
   present, else recovers the block from the original system text. */
export const generateModifiedPythonFromSystems = (originalContent: string, systems: VfxSystemMap): string => {
    const lines = originalContent.split('\n');
    const out: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (/=\s*VfxSystemDefinitionData\s*\{/i.test(trimmed)) {
            const keyMatch = trimmed.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/i);
            if (keyMatch) {
                const sysKey = keyMatch[1] || keyMatch[2];
                let depth = 1;
                const sysStart = i;
                let sysEnd = i;
                for (let j = i + 1; j < lines.length; j++) {
                    const l = lines[j];
                    const opens = (l.match(/\{/g) || []).length;
                    const closes = (l.match(/\}/g) || []).length;
                    depth += opens - closes;
                    if (depth <= 0) {
                        sysEnd = j;
                        break;
                    }
                }

                const originalSystem = lines.slice(sysStart, sysEnd + 1).join('\n');
                if (systems[sysKey]) {
                    const extractEmitterBlockByName = (systemText: string, wantedName: string): string | null => {
                        if (!systemText || !wantedName) return null;
                        const sysLines = systemText.split('\n');
                        for (let k = 0; k < sysLines.length; k++) {
                            const t = (sysLines[k] || '').trim();
                            if (/VfxEmitterDefinitionData\s*\{/i.test(t)) {
                                let d = 1;
                                const startIdx = k;
                                let endIdx = k;
                                let foundName: string | null = null;
                                for (let m = k + 1; m < sysLines.length; m++) {
                                    const ln = sysLines[m];
                                    const tr = (ln || '').trim();
                                    if (!foundName && /emitterName:/i.test(tr)) {
                                        const mm = tr.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
                                        if (mm) foundName = mm[1];
                                    }
                                    const opens = (ln.match(/\{/g) || []).length;
                                    const closes = (ln.match(/\}/g) || []).length;
                                    d += opens - closes;
                                    if (d <= 0) {
                                        endIdx = m;
                                        break;
                                    }
                                }
                                if (foundName === wantedName) {
                                    return sysLines.slice(startIdx, endIdx + 1).join('\n');
                                }
                                k = endIdx;
                            }
                        }
                        return null;
                    };

                    const emitterBlocks = (systems[sysKey].emitters || [])
                        .filter((e) => e && (e.originalContent || e.rawContent || e.name))
                        .map((e) => {
                            if (e.originalContent) return e.originalContent;
                            if (e.name) {
                                const recovered = extractEmitterBlockByName(originalSystem, e.name);
                                if (recovered) return recovered;
                            }
                            let basic = 'VfxEmitterDefinitionData {\n';
                            if (e.name) basic += `    emitterName: string = "${e.name}"\n`;
                            basic += '}\n';
                            return basic;
                        });

                    const updatedSystem = replaceEmittersInSystem(originalSystem, emitterBlocks);
                    out.push(updatedSystem);
                } else {
                    out.push(originalSystem);
                }

                i = sysEnd;
                continue;
            }
        }
        out.push(line);
    }

    return out.join('\n');
};
