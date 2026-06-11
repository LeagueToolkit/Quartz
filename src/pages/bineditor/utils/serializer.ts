/*
 * BinEditor Serializer - Convert structured data back to ritobin .py text.
 *
 * Ported 1:1 from the Electron Quartz utils/binEditor/serializer.js. Edits are
 * made surgically against each emitter's preserved rawContent (block-scoped via
 * findClosingBrace) so a scale change can never corrupt neighbouring vec3 / matrix
 * blocks, then the file is reassembled from the raw blocks.
 */

import type { ParsedData, VfxSystem, Emitter, Vec3 } from './types';

export function serializeToFile(data: ParsedData): string {
    let output = data.header;

    const systemNames =
        data.systemOrder && data.systemOrder.length > 0
            ? data.systemOrder
            : Object.keys(data.systems);

    for (const systemName of systemNames) {
        const system = data.systems[systemName];
        if (!system) continue;

        if (system.prefix) {
            output += system.prefix;
        }

        output += serializeSystem(system);
        output += '\n';
    }

    if (data.footer) {
        output = output.trimEnd() + data.footer;
    }

    return output;
}

function serializeSystem(system: VfxSystem): string {
    if (!system._modified) {
        return system.rawContent;
    }

    const lines = system.rawContent.split('\n');
    const result: string[] = [];
    let lastProcessedLine = -1;

    const sortedEmitters = [...system.emitters].sort((a, b) => a.localStartLine - b.localStartLine);

    for (const emitter of sortedEmitters) {
        for (let i = lastProcessedLine + 1; i < emitter.localStartLine; i++) {
            result.push(lines[i]);
        }

        result.push(emitter.rawContent);

        lastProcessedLine = emitter.localEndLine ?? emitter.localStartLine;
    }

    for (let i = lastProcessedLine + 1; i < lines.length; i++) {
        result.push(lines[i]);
    }

    return result.join('\n');
}

export function updateBirthScale(emitter: Emitter, newValue: Vec3): boolean {
    if (!emitter.birthScale0) return false;

    let content = emitter.rawContent;
    let modified = false;

    const pattern =
        /(birthScale0:\s*embed\s*=\s*ValueVector3\s*\{[^}]*constantValue:\s*vec3\s*=\s*\{)\s*[^}]+(\})/i;
    const replacement = `$1 ${newValue.x}, ${newValue.y}, ${newValue.z} $2`;

    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
        content = newContent;
        modified = true;
    }

    if (modified) {
        emitter.rawContent = content;
        emitter.birthScale0.constantValue = { ...newValue };
        return true;
    }

    return false;
}

export function updateScale0(emitter: Emitter, newValue: Vec3): boolean {
    if (!emitter.scale0) return false;

    let content = emitter.rawContent;
    let modified = false;

    const pattern =
        /(scale0:\s*embed\s*=\s*ValueVector3\s*\{[^}]*constantValue:\s*vec3\s*=\s*\{)\s*[^}]+(\})/i;
    const replacement = `$1 ${newValue.x}, ${newValue.y}, ${newValue.z} $2`;

    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
        content = newContent;
        modified = true;
    }

    if (modified) {
        emitter.rawContent = content;
        emitter.scale0.constantValue = { ...newValue };
        return true;
    }

    return false;
}

export function updateScale0Dynamics(emitter: Emitter, newValues: Vec3[]): boolean {
    if (!emitter.scale0 || !emitter.scale0.dynamicsValues || newValues.length === 0) return false;
    return updateGenericVec3List(emitter, 'scale0', newValues);
}

export function updateBirthScaleDynamics(emitter: Emitter, newValues: Vec3[]): boolean {
    if (!emitter.birthScale0 || !emitter.birthScale0.dynamicsValues || newValues.length === 0)
        return false;
    return updateGenericVec3List(emitter, 'birthScale0', newValues);
}

function updateGenericVec3List(
    emitter: Emitter,
    propName: 'birthScale0' | 'scale0',
    newValues: Vec3[],
): boolean {
    const content = emitter.rawContent;

    const blockMatch = content.match(
        new RegExp(`${propName}:\\s*embed\\s*=\\s*ValueVector3\\s*\\{`, 'i'),
    );
    if (!blockMatch || blockMatch.index === undefined) return false;

    const blockStart = blockMatch.index;
    const blockEnd = findClosingBrace(content, blockStart);
    if (blockEnd === -1) return false;

    const blockContent = content.substring(blockStart, blockEnd);

    const valuesMatch = blockContent.match(/(values:\s*list\[vec3\]\s*=\s*\{)/i);
    if (!valuesMatch || valuesMatch.index === undefined) return false;

    const listRelStart = valuesMatch.index;
    const listRelEnd = findClosingBrace(blockContent, listRelStart);
    if (listRelEnd === -1) return false;

    const header = valuesMatch[1];
    const valueStrings = newValues.map((v) => `                            { ${v.x}, ${v.y}, ${v.z} }`);
    const newListContent = `${header}\n${valueStrings.join('\n')}\n                        }`;

    const globalListStart = blockStart + listRelStart;
    const globalListEnd = blockStart + listRelEnd;

    emitter.rawContent =
        content.substring(0, globalListStart) + newListContent + content.substring(globalListEnd);

    const prop = emitter[propName];
    if (prop && prop.dynamicsValues) {
        prop.dynamicsValues = newValues.map((v) => ({ ...v }));
    }

    return true;
}

function findClosingBrace(text: string, startIndex: number): number {
    let depth = 0;
    let foundStart = false;

    for (let i = startIndex; i < text.length; i++) {
        const char = text[i];
        if (char === '{') {
            depth++;
            foundStart = true;
        } else if (char === '}') {
            depth--;
            if (foundStart && depth === 0) return i + 1;
        }
    }
    return -1;
}

export function updateBindWeight(emitter: Emitter, newValue: number): boolean {
    if (!emitter.bindWeight) return false;

    const pattern =
        /(bindWeight:\s*embed\s*=\s*ValueFloat\s*\{[^}]*constantValue:\s*f32\s*=\s*)(-?[\d.]+)/i;
    const replacement = `$1${newValue}`;

    const newContent = emitter.rawContent.replace(pattern, replacement);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.bindWeight.constantValue = newValue;
        return true;
    }

    return false;
}

export function insertBindWeight(emitter: Emitter, value = 1): boolean {
    if (emitter.bindWeight) return false;

    const emitterNamePattern = /(emitterName:\s*string\s*=\s*"[^"]+"\n)/i;

    const match = emitter.rawContent.match(emitterNamePattern);
    if (!match) return false;

    const bindWeightBlock = `                bindWeight: embed = ValueFloat {\n                    constantValue: f32 = ${value}\n                }\n`;

    const newContent = emitter.rawContent.replace(emitterNamePattern, `$1${bindWeightBlock}`);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.bindWeight = {
            constantValue: value,
            dynamicsValues: [],
            rawBlock: bindWeightBlock,
        };
        return true;
    }

    return false;
}

export function updateTranslationOverride(emitter: Emitter, newValue: Vec3): boolean {
    if (!emitter.translationOverride) return false;

    const pattern = /(translationOverride:\s*vec3\s*=\s*\{)\s*[^}]+(\})/i;
    const replacement = `$1 ${newValue.x}, ${newValue.y}, ${newValue.z} $2`;

    const newContent = emitter.rawContent.replace(pattern, replacement);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.translationOverride.constantValue = { ...newValue };
        return true;
    }

    return false;
}

export function insertTranslationOverride(
    emitter: Emitter,
    value: Vec3 = { x: 0, y: 0, z: 0 },
): boolean {
    if (emitter.translationOverride) return false;

    const emitterNamePattern = /(emitterName:\s*string\s*=\s*"[^"]+"\n)/i;

    const match = emitter.rawContent.match(emitterNamePattern);
    if (!match) return false;

    const toLine = `                translationOverride: vec3 = { ${value.x}, ${value.y}, ${value.z} }\n`;

    const newContent = emitter.rawContent.replace(emitterNamePattern, `$1${toLine}`);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.translationOverride = {
            constantValue: { ...value },
        };
        return true;
    }

    return false;
}

export function updateParticleLifetime(emitter: Emitter, newValue: number): boolean {
    if (!emitter.particleLifetime) return false;

    const content = emitter.rawContent;
    const blockMatch = content.match(/particleLifetime:\s*embed\s*=\s*ValueFloat\s*\{/i);
    if (!blockMatch || blockMatch.index === undefined) return false;

    const blockStart = blockMatch.index;
    const blockEnd = findClosingBrace(content, blockStart);
    if (blockEnd === -1) return false;

    const blockContent = content.substring(blockStart, blockEnd);
    let updatedBlock = blockContent;
    let modified = false;

    const constantPattern = /(constantValue:\s*f32\s*=\s*)(-?[\d.]+)/i;
    updatedBlock = updatedBlock.replace(constantPattern, `$1${newValue}`);
    if (updatedBlock !== blockContent) {
        modified = true;
    }

    const dynamicsPattern = /(values:\s*list\[f32\]\s*=\s*\{\s*)(-?[\d.]+)(\s*\})/i;
    const blockAfterDynamics = updatedBlock.replace(dynamicsPattern, `$1${newValue}$3`);
    if (blockAfterDynamics !== updatedBlock) {
        updatedBlock = blockAfterDynamics;
        modified = true;
    }

    if (modified) {
        emitter.rawContent = content.substring(0, blockStart) + updatedBlock + content.substring(blockEnd);
        emitter.particleLifetime.constantValue = newValue;
        if (
            Array.isArray(emitter.particleLifetime.dynamicsValues) &&
            emitter.particleLifetime.dynamicsValues.length > 0
        ) {
            emitter.particleLifetime.dynamicsValues[0] = newValue;
        }
        return true;
    }

    return false;
}

export function updateLifetime(emitter: Emitter, newValue: number): boolean {
    if (!emitter.lifetime) return false;

    const pattern = /(lifetime:\s*option\[f32\]\s*=\s*\{\s*)[\d.\-]+(\s*\})/i;
    const replacement = `$1${newValue}$2`;

    const newContent = emitter.rawContent.replace(pattern, replacement);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.lifetime.value = newValue;
        return true;
    }

    return false;
}

export function updateParticleLinger(emitter: Emitter, newValue: number): boolean {
    if (!emitter.particleLinger) return false;

    const pattern = /(particleLinger:\s*option\[f32\]\s*=\s*\{\s*)[\d.\-]+(\s*\})/i;
    const replacement = `$1${newValue}$2`;

    const newContent = emitter.rawContent.replace(pattern, replacement);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.particleLinger.value = newValue;
        return true;
    }

    return false;
}

export function updateRate(emitter: Emitter, newValue: number): boolean {
    if (!emitter.rate) return false;

    let content = emitter.rawContent;
    let modified = false;

    const constantPattern = /(rate:\s*embed\s*=\s*ValueFloat\s*\{[^}]*constantValue:\s*f32\s*=\s*)(-?[\d.]+)/i;
    const constantReplacement = `$1${newValue}`;

    content = content.replace(constantPattern, constantReplacement);
    if (content !== emitter.rawContent) {
        modified = true;
    }

    const dynamicsMatch = content.match(
        /rate:[\s\S]*?dynamics:[\s\S]*?values:\s*list\[f32\]\s*=\s*\{([^}]+)\}/i,
    );

    if (dynamicsMatch) {
        const oldValuesList = dynamicsMatch[1];
        const existingValues = oldValuesList
            .split(/\n/)
            .map((line) => {
                const num = line.trim();
                return num ? parseFloat(num) : null;
            })
            .filter((v): v is number => v !== null && !isNaN(v));

        if (existingValues.length > 0) {
            const oldConstant = emitter.rate.constantValue ?? 0;
            const ratio = oldConstant !== 0 ? newValue / oldConstant : 1;

            const newValues = existingValues.map((v) => {
                const scaled = v * ratio;
                return Number.isInteger(scaled) ? scaled : parseFloat(scaled.toFixed(2));
            });

            const newValuesList = newValues.map((v) => `                            ${v}`).join('\n');

            const dynamicsPattern = /(rate:[\s\S]*?dynamics:[\s\S]*?values:\s*list\[f32\]\s*=\s*\{)[^}]+(\})/i;
            const dynamicsReplacement = `$1\n${newValuesList}\n                        $2`;

            const newContentWithDynamics = content.replace(dynamicsPattern, dynamicsReplacement);
            if (newContentWithDynamics !== content) {
                content = newContentWithDynamics;
                modified = true;
            }
        }
    }

    if (modified) {
        emitter.rawContent = content;
        emitter.rate.constantValue = newValue;
        return true;
    }

    return false;
}

export function markSystemModified(data: ParsedData, systemName: string): void {
    if (data.systems[systemName]) {
        data.systems[systemName]._modified = true;
    }
}

export function updateMiscRenderFlags(emitter: Emitter, newValue: number): boolean {
    if (emitter.miscRenderFlags === undefined || emitter.miscRenderFlags === null) return false;

    const pattern = /(miscRenderFlags:\s*u8\s*=\s*)[\d.\-]+/i;
    const replacement = `$1${newValue}`;

    const newContent = emitter.rawContent.replace(pattern, replacement);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.miscRenderFlags = newValue;
        return true;
    }

    return false;
}

export function updateIsGroundLayer(emitter: Emitter, newValue: boolean): boolean {
    if (emitter.isGroundLayer === undefined || emitter.isGroundLayer === null) return false;

    const pattern = /(isGroundLayer:\s*flag\s*=\s*)(true|false)/i;
    const replacement = `$1${newValue ? 'true' : 'false'}`;

    const newContent = emitter.rawContent.replace(pattern, replacement);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.isGroundLayer = !!newValue;
        return true;
    }

    return false;
}

export function updatePass(emitter: Emitter, newValue: number): boolean {
    if (emitter.pass === undefined || emitter.pass === null) return false;

    const pattern = /(pass:\s*i16\s*=\s*)[\d.\-]+/i;
    const replacement = `$1${newValue}`;

    const newContent = emitter.rawContent.replace(pattern, replacement);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.pass = newValue;
        return true;
    }

    return false;
}

export function insertMiscRenderFlags(emitter: Emitter, value = 1): boolean {
    if (emitter.miscRenderFlags !== undefined && emitter.miscRenderFlags !== null) return false;

    const emitterNamePattern = /(emitterName:\s*string\s*=\s*"[^"]+"\n)/i;

    const match = emitter.rawContent.match(emitterNamePattern);
    if (!match) return false;

    const mrLine = `                miscRenderFlags: u8 = ${value}\n`;

    const newContent = emitter.rawContent.replace(emitterNamePattern, `$1${mrLine}`);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.miscRenderFlags = value;
        return true;
    }

    return false;
}

export function insertIsGroundLayer(emitter: Emitter, value = false): boolean {
    if (emitter.isGroundLayer !== undefined && emitter.isGroundLayer !== null) return false;

    const emitterNamePattern = /(emitterName:\s*string\s*=\s*"[^"]+"\n)/i;

    const match = emitter.rawContent.match(emitterNamePattern);
    if (!match) return false;

    const glLine = `                isGroundLayer: flag = ${value ? 'true' : 'false'}\n`;

    const newContent = emitter.rawContent.replace(emitterNamePattern, `$1${glLine}`);

    if (newContent !== emitter.rawContent) {
        emitter.rawContent = newContent;
        emitter.isGroundLayer = !!value;
        return true;
    }

    return false;
}
