/*
 * BinEditor Operations - Batch operations for editing VFX data.
 *
 * Ported 1:1 from the Electron Quartz utils/binEditor/operations.js. These are
 * higher-level functions that operate on a Set of "systemName:emitterName"
 * selection keys and delegate the surgical text edits to the serializer.
 */

import type { ParsedData, ModifyResult, AddResult, Vec3 } from './types';
import {
    updateBirthScale,
    updateScale0,
    updateBirthScaleDynamics,
    updateScale0Dynamics,
    updateBindWeight,
    insertBindWeight,
    updateTranslationOverride,
    insertTranslationOverride,
    updateParticleLifetime,
    updateLifetime,
    updateParticleLinger,
    updatePass,
    updateMiscRenderFlags,
    insertMiscRenderFlags,
    updateIsGroundLayer,
    insertIsGroundLayer,
    markSystemModified,
} from './serializer';

export function scaleBirthScale(
    data: ParsedData,
    selectedKeys: Set<string>,
    multiplier: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.birthScale0?.constantValue) {
                const oldValue = emitter.birthScale0.constantValue;
                const newValue: Vec3 = {
                    x: oldValue.x * multiplier,
                    y: oldValue.y * multiplier,
                    z: oldValue.z * multiplier,
                };

                if (updateBirthScale(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to update birthScale0 for ${emitter.name}`);
                }
            }

            if (emitter.birthScale0?.dynamicsValues?.length) {
                const newDynamics = emitter.birthScale0.dynamicsValues.map((v) => ({
                    x: v.x * multiplier,
                    y: v.y * multiplier,
                    z: v.z * multiplier,
                }));
                if (updateBirthScaleDynamics(emitter, newDynamics)) {
                    markSystemModified(data, system.name);
                }
            }
        }
    }

    return { modified, errors };
}

export function scaleScale0(
    data: ParsedData,
    selectedKeys: Set<string>,
    multiplier: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.scale0?.constantValue) {
                const oldValue = emitter.scale0.constantValue;
                const newValue: Vec3 = {
                    x: oldValue.x * multiplier,
                    y: oldValue.y * multiplier,
                    z: oldValue.z * multiplier,
                };

                if (updateScale0(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to update scale0 for ${emitter.name}`);
                }
            }

            if (emitter.scale0?.dynamicsValues?.length) {
                const newDynamics = emitter.scale0.dynamicsValues.map((v) => ({
                    x: v.x * multiplier,
                    y: v.y * multiplier,
                    z: v.z * multiplier,
                }));
                if (updateScale0Dynamics(emitter, newDynamics)) {
                    markSystemModified(data, system.name);
                }
            }
        }
    }

    return { modified, errors };
}

export function scaleAll(
    data: ParsedData,
    selectedKeys: Set<string>,
    multiplier: number,
): ModifyResult {
    const r1 = scaleBirthScale(data, selectedKeys, multiplier);
    const r2 = scaleScale0(data, selectedKeys, multiplier);
    return {
        modified: r1.modified + r2.modified,
        errors: [...r1.errors, ...r2.errors],
    };
}

export function setBirthScale(
    data: ParsedData,
    selectedKeys: Set<string>,
    value: Vec3,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.birthScale0?.constantValue) {
                if (updateBirthScale(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to set birthScale0 for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function setBindWeight(
    data: ParsedData,
    selectedKeys: Set<string>,
    value: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.bindWeight) {
                if (updateBindWeight(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to update bindWeight for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function addBindWeight(
    data: ParsedData,
    selectedKeys: Set<string>,
    value = 1,
): AddResult {
    let added = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (!emitter.bindWeight) {
                if (insertBindWeight(emitter, value)) {
                    markSystemModified(data, system.name);
                    added++;
                } else {
                    errors.push(`Failed to add bindWeight to ${emitter.name}`);
                }
            }
        }
    }

    return { added, errors };
}

export function setTranslationOverride(
    data: ParsedData,
    selectedKeys: Set<string>,
    value: Vec3,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.translationOverride) {
                if (updateTranslationOverride(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to update translationOverride for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function addTranslationOverride(
    data: ParsedData,
    selectedKeys: Set<string>,
    value: Vec3 = { x: 0, y: 0, z: 0 },
): AddResult {
    let added = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (!emitter.translationOverride) {
                if (insertTranslationOverride(emitter, value)) {
                    markSystemModified(data, system.name);
                    added++;
                } else {
                    errors.push(`Failed to add translationOverride to ${emitter.name}`);
                }
            }
        }
    }

    return { added, errors };
}

export function scaleTranslationOverride(
    data: ParsedData,
    selectedKeys: Set<string>,
    multiplier: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.translationOverride?.constantValue) {
                const oldValue = emitter.translationOverride.constantValue;
                const newValue: Vec3 = {
                    x: oldValue.x * multiplier,
                    y: oldValue.y * multiplier,
                    z: oldValue.z * multiplier,
                };

                if (updateTranslationOverride(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to scale translationOverride for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function scaleParticleLifetime(
    data: ParsedData,
    selectedKeys: Set<string>,
    multiplier: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.particleLifetime?.constantValue != null) {
                // -1 means infinite / forever — leave it untouched.
                if (emitter.particleLifetime.constantValue === -1) continue;

                const newValue = emitter.particleLifetime.constantValue * multiplier;
                if (updateParticleLifetime(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to scale particleLifetime for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function scaleLifetime(
    data: ParsedData,
    selectedKeys: Set<string>,
    multiplier: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.lifetime?.value != null) {
                if (emitter.lifetime.value === -1) continue;

                const newValue = emitter.lifetime.value * multiplier;
                if (updateLifetime(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to scale lifetime for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function scaleParticleLinger(
    data: ParsedData,
    selectedKeys: Set<string>,
    multiplier: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.particleLinger?.value != null) {
                const newValue = emitter.particleLinger.value * multiplier;
                if (updateParticleLinger(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to scale particleLinger for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function scalePass(
    data: ParsedData,
    selectedKeys: Set<string>,
    multiplier: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.pass !== undefined && emitter.pass !== null) {
                const newValue = Math.abs(emitter.pass * multiplier);
                if (updatePass(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to scale pass for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function setParticleLifetime(
    data: ParsedData,
    selectedKeys: Set<string>,
    value: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.particleLifetime) {
                if (updateParticleLifetime(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to set particleLifetime for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function setLifetime(
    data: ParsedData,
    selectedKeys: Set<string>,
    value: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.lifetime) {
                if (updateLifetime(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to set lifetime for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function setParticleLinger(
    data: ParsedData,
    selectedKeys: Set<string>,
    value: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.particleLinger) {
                if (updateParticleLinger(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to set particleLinger for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function setMiscRenderFlags(
    data: ParsedData,
    selectedKeys: Set<string>,
    value: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.miscRenderFlags !== undefined && emitter.miscRenderFlags !== null) {
                if (updateMiscRenderFlags(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to update miscRenderFlags for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function setPass(
    data: ParsedData,
    selectedKeys: Set<string>,
    value: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.pass !== undefined && emitter.pass !== null) {
                if (updatePass(emitter, value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to update pass for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function addPass(
    data: ParsedData,
    selectedKeys: Set<string>,
    delta: number,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.pass !== undefined && emitter.pass !== null) {
                const newValue = emitter.pass + delta;
                if (updatePass(emitter, newValue)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to add to pass for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function addMiscRenderFlags(
    data: ParsedData,
    selectedKeys: Set<string>,
    value = 1,
): AddResult {
    let added = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.miscRenderFlags === undefined || emitter.miscRenderFlags === null) {
                if (insertMiscRenderFlags(emitter, value)) {
                    markSystemModified(data, system.name);
                    added++;
                } else {
                    errors.push(`Failed to add miscRenderFlags to ${emitter.name}`);
                }
            }
        }
    }

    return { added, errors };
}

export function setIsGroundLayer(
    data: ParsedData,
    selectedKeys: Set<string>,
    value: boolean,
): ModifyResult {
    let modified = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.isGroundLayer !== undefined && emitter.isGroundLayer !== null) {
                if (updateIsGroundLayer(emitter, !!value)) {
                    markSystemModified(data, system.name);
                    modified++;
                } else {
                    errors.push(`Failed to update isGroundLayer for ${emitter.name}`);
                }
            }
        }
    }

    return { modified, errors };
}

export function addIsGroundLayer(
    data: ParsedData,
    selectedKeys: Set<string>,
    value = false,
): AddResult {
    let added = 0;
    const errors: string[] = [];

    for (const system of Object.values(data.systems)) {
        for (const emitter of system.emitters) {
            const key = `${system.name}:${emitter.name}`;
            if (!selectedKeys.has(key)) continue;

            if (emitter.isGroundLayer === undefined || emitter.isGroundLayer === null) {
                if (insertIsGroundLayer(emitter, !!value)) {
                    markSystemModified(data, system.name);
                    added++;
                } else {
                    errors.push(`Failed to add isGroundLayer to ${emitter.name}`);
                }
            }
        }
    }

    return { added, errors };
}

export function createEmitterKey(systemName: string, emitterName: string): string {
    return `${systemName}:${emitterName}`;
}

export function parseEmitterKey(key: string): { systemName: string; emitterName: string } {
    const colonIndex = key.indexOf(':');
    return {
        systemName: key.substring(0, colonIndex),
        emitterName: key.substring(colonIndex + 1),
    };
}
