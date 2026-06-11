/*
 * BinEditor Parser - Clean parsing of ritobin .py text.
 *
 * Ported 1:1 from the Electron Quartz utils/binEditor/parser.js. Key principle:
 * parse into structured data while preserving raw content blocks for safe,
 * targeted editing without corrupting other parts of the file.
 */

import type {
    ParsedData,
    ParseStats,
    VfxSystem,
    Emitter,
    ValueVector3,
    SimpleVec3,
    ValueFloat,
    OptionFloat,
} from './types';

interface Block {
    name: string;
    startLine: number;
    endLine: number;
}

// Parse a .py file content into structured data.
export function parsePyFile(content: string): ParsedData {
    const lines = content.split('\n');

    const result: ParsedData = {
        header: '',
        systems: {},
        systemOrder: [],
        footer: '',
        rawContent: content,
    };

    let lastSystemEndLine = -1;

    const systemBlocks = findSystemBlocks(lines);

    if (systemBlocks.length === 0) {
        result.header = content;
        return result;
    }

    const headerEndLine = systemBlocks[0].startLine;
    result.header = lines.slice(0, headerEndLine).join('\n');
    if (result.header) result.header += '\n';

    for (let i = 0; i < systemBlocks.length; i++) {
        const block = systemBlocks[i];
        const systemLines = lines.slice(block.startLine, block.endLine + 1);
        const rawContent = systemLines.join('\n');

        const system = parseSystem(rawContent, block.name, block.startLine);

        // Preserve any non-VFX content between systems (ResourceResolver,
        // animationGraphData, SkinCharacterDataProperties, etc.).
        if (i > 0) {
            const prevBlock = systemBlocks[i - 1];
            const gapStart = prevBlock.endLine + 1;
            const gapEnd = block.startLine;
            if (gapEnd > gapStart) {
                const gapContent = lines.slice(gapStart, gapEnd).join('\n');
                if (gapContent.trim()) {
                    system.prefix = '\n' + gapContent + '\n';
                }
            }
        }

        result.systems[block.name] = system;
        result.systemOrder.push(block.name);

        lastSystemEndLine = block.endLine;
    }

    if (lastSystemEndLine < lines.length - 1) {
        result.footer = '\n' + lines.slice(lastSystemEndLine + 1).join('\n');
    }

    return result;
}

function findSystemBlocks(lines: string[]): Block[] {
    const blocks: Block[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const match = line.match(/^\s*"?([^"=]+)"?\s*=\s*VfxSystemDefinitionData\s*\{/i);
        if (match) {
            const name = match[1].trim().replace(/"/g, '');
            const startLine = i;
            const endLine = findBlockEnd(lines, i);
            blocks.push({ name, startLine, endLine });
            i = endLine;
        }
    }

    return blocks;
}

function findBlockEnd(lines: string[], startLine: number): number {
    let bracketDepth = 0;
    let foundFirstBracket = false;

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        const { opens, closes } = countBrackets(line);

        bracketDepth += opens - closes;

        if (opens > 0) foundFirstBracket = true;

        if (foundFirstBracket && bracketDepth === 0) {
            return i;
        }

        if (i - startLine > 10000) {
            console.warn(`Block parsing exceeded 10000 lines, stopping at line ${i}`);
            return i;
        }
    }

    return lines.length - 1;
}

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

function parseSystem(rawContent: string, name: string, globalStartLine: number): VfxSystem {
    const lines = rawContent.split('\n');

    let particleName: string | null = null;
    const particleNameMatch = rawContent.match(/particleName:\s*string\s*=\s*"([^"]+)"/i);
    if (particleNameMatch) {
        particleName = particleNameMatch[1];
    }

    const system: VfxSystem = {
        name,
        displayName: particleName || getShortName(name),
        particleName,
        rawContent,
        globalStartLine,
        emitters: [],
    };

    const emitterBlocks = findEmitterBlocks(lines);

    for (const block of emitterBlocks) {
        const emitterLines = lines.slice(block.startLine, block.endLine + 1);
        const emitterRawContent = emitterLines.join('\n');

        const emitter = parseEmitter(emitterRawContent, block.startLine);
        emitter.localStartLine = block.startLine;
        emitter.localEndLine = block.endLine;

        system.emitters.push(emitter);
    }

    return system;
}

function findEmitterBlocks(lines: string[]): { startLine: number; endLine: number }[] {
    const blocks: { startLine: number; endLine: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/VfxEmitterDefinitionData\s*\{/i.test(line)) {
            const startLine = i;
            const endLine = findBlockEnd(lines, i);
            blocks.push({ startLine, endLine });
            i = endLine;
        }
    }

    return blocks;
}

function parseEmitter(rawContent: string, localStartLine: number): Emitter {
    return {
        name: parseEmitterName(rawContent),
        rawContent,
        localStartLine,

        birthScale0: parseVec3Property(rawContent, 'birthScale0'),
        scale0: parseVec3Property(rawContent, 'scale0'),

        bindWeight: parseFloatProperty(rawContent, 'bindWeight'),
        translationOverride: parseSimpleVec3(rawContent, 'translationOverride'),

        particleLifetime: parseFloatProperty(rawContent, 'particleLifetime'),
        lifetime: parseOptionFloat(rawContent, 'lifetime'),
        particleLinger: parseOptionFloat(rawContent, 'particleLinger'),

        rate: parseFloatProperty(rawContent, 'rate'),

        pass: parseSimpleProperty(rawContent, 'pass', 'i16'),
        miscRenderFlags: parseSimpleProperty(rawContent, 'miscRenderFlags', 'u8'),
        isGroundLayer: parseFlagProperty(rawContent, 'isGroundLayer'),
    };
}

function parseEmitterName(content: string): string {
    const match = content.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
    return match ? match[1] : 'Unnamed';
}

function parseVec3Property(content: string, propName: string): ValueVector3 | null {
    const propRegex = new RegExp(`${propName}:\\s*embed\\s*=\\s*ValueVector3\\s*\\{`, 'i');

    const match = content.match(propRegex);
    if (!match || match.index === undefined) return null;

    const startIndex = match.index;
    const blockContent = extractBlock(content, startIndex + match[0].length - 1);
    if (!blockContent) return null;

    const result: ValueVector3 = {
        constantValue: null,
        dynamicsValues: [],
        rawBlock: blockContent,
    };

    const constMatch = blockContent.match(/constantValue:\s*vec3\s*=\s*\{\s*([^}]+)\}/i);
    if (constMatch) {
        const values = constMatch[1].split(',').map((v) => parseFloat(v.trim()));
        if (values.length >= 3) {
            result.constantValue = { x: values[0], y: values[1], z: values[2] };
        }
    }

    const dynamicsMatch = blockContent.match(
        /dynamics:\s*pointer\s*=\s*VfxAnimatedVector3fVariableData\s*\{/i,
    );
    if (dynamicsMatch && dynamicsMatch.index !== undefined) {
        const dynStart = dynamicsMatch.index;
        const dynBlock = extractBlock(blockContent, dynStart + dynamicsMatch[0].length - 1);

        if (dynBlock) {
            const valuesMatch = dynBlock.match(/values:\s*list\[vec3\]\s*=\s*\{/i);
            if (valuesMatch && valuesMatch.index !== undefined) {
                const valuesStart = valuesMatch.index;
                const valuesBlock = extractBlock(dynBlock, valuesStart + valuesMatch[0].length - 1);

                if (valuesBlock) {
                    const vectorMatches = valuesBlock.matchAll(
                        /\{\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\}/g,
                    );
                    for (const vm of vectorMatches) {
                        result.dynamicsValues.push({
                            x: parseFloat(vm[1]),
                            y: parseFloat(vm[2]),
                            z: parseFloat(vm[3]),
                        });
                    }
                }
            }
        }
    }

    return result;
}

function parseSimpleVec3(content: string, propName: string): SimpleVec3 | null {
    const regex = new RegExp(`${propName}:\\s*vec3\\s*=\\s*\\{\\s*([^}]+)\\}`, 'i');

    const match = content.match(regex);
    if (!match) return null;

    const values = match[1].split(',').map((v) => parseFloat(v.trim()));
    if (values.length < 3) return null;

    return {
        constantValue: { x: values[0], y: values[1], z: values[2] },
    };
}

function parseFloatProperty(content: string, propName: string): ValueFloat | null {
    const propRegex = new RegExp(`${propName}:\\s*embed\\s*=\\s*ValueFloat\\s*\\{`, 'i');

    const match = content.match(propRegex);
    if (!match || match.index === undefined) return null;

    const startIndex = match.index;
    const blockContent = extractBlock(content, startIndex + match[0].length - 1);
    if (!blockContent) return null;

    const result: ValueFloat = {
        constantValue: null,
        dynamicsValues: [],
        rawBlock: blockContent,
    };

    const constMatch = blockContent.match(/constantValue:\s*f32\s*=\s*(-?[\d.]+)/i);
    if (constMatch) {
        result.constantValue = parseFloat(constMatch[1]);
    }

    const dynamicsMatch = blockContent.match(/values:\s*list\[f32\]\s*=\s*\{([^}]+)\}/i);
    if (dynamicsMatch) {
        const values = dynamicsMatch[1]
            .split(/\n/)
            .map((line) => {
                const num = line.trim();
                return num ? parseFloat(num) : null;
            })
            .filter((v): v is number => v !== null && !isNaN(v));
        result.dynamicsValues = values;
    }

    return result;
}

function parseOptionFloat(content: string, propName: string): OptionFloat | null {
    const regex = new RegExp(
        `${propName}:\\s*option\\[f32\\]\\s*=\\s*\\{\\s*([\\d.\\-]+)\\s*\\}`,
        'i',
    );

    const match = content.match(regex);
    if (!match) return null;

    return {
        value: parseFloat(match[1]),
    };
}

function parseSimpleProperty(content: string, propName: string, type: string): number | null {
    const regex = new RegExp(`${propName}:\\s*${type}\\s*=\\s*([\\d.\\-]+)`, 'i');

    const match = content.match(regex);
    if (!match) return null;

    return parseFloat(match[1]);
}

function parseFlagProperty(content: string, propName: string): boolean | null {
    const regex = new RegExp(`${propName}:\\s*flag\\s*=\\s*(true|false)`, 'i');

    const match = content.match(regex);
    if (!match) return null;

    return match[1].toLowerCase() === 'true';
}

// Extract a { } block starting at the given position, including the braces.
function extractBlock(content: string, startPos: number): string | null {
    if (content[startPos] !== '{') {
        const nextBrace = content.indexOf('{', startPos);
        if (nextBrace === -1) return null;
        startPos = nextBrace;
    }

    let depth = 0;
    let inString = false;
    let stringChar: string | null = null;

    for (let i = startPos; i < content.length; i++) {
        const char = content[i];
        const prevChar = i > 0 ? content[i - 1] : '';

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
            if (char === '{') depth++;
            if (char === '}') depth--;

            if (depth === 0) {
                return content.substring(startPos, i + 1);
            }
        }
    }

    return null;
}

function getShortName(fullPath: string): string {
    if (!fullPath) return 'Unknown';

    const parts = fullPath.split('/');
    let name = parts[parts.length - 1];

    name = name.replace(/^[A-Z][a-z]+_(Base_|Skin\d+_)/i, '');

    if (name.length > 35) {
        name = name.substring(0, 32) + '...';
    }

    return name;
}

export function getParseStats(data: ParsedData): ParseStats {
    const systemCount = Object.keys(data.systems).length;
    let emitterCount = 0;
    let withBirthScale = 0;
    let withScale0 = 0;
    let withBindWeight = 0;
    let withTranslationOverride = 0;

    for (const system of Object.values(data.systems)) {
        emitterCount += system.emitters.length;
        for (const emitter of system.emitters) {
            if (emitter.birthScale0) withBirthScale++;
            if (emitter.scale0) withScale0++;
            if (emitter.bindWeight) withBindWeight++;
            if (emitter.translationOverride) withTranslationOverride++;
        }
    }

    return {
        systemCount,
        emitterCount,
        withBirthScale,
        withScale0,
        withBindWeight,
        withTranslationOverride,
    };
}
