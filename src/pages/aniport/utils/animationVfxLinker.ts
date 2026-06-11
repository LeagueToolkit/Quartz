// Animation VFX Linker - Links animation events with VFX systems.
// Ported 1:1 from animationVfxLinker.js. Connects ParticleEventData with
// VfxSystemDefinitionData via effect keys / ResourceResolver.

import type { AnimationData, Clip, ParticleEvent, VfxSystem } from './types';

export interface VfxConnection {
    vfxSystem: VfxSystem;
    resourceKey: string;
    connectionType: 'direct' | 'resource_resolver' | 'fuzzy';
}

export interface PortConnection {
    animationClip: string;
    particleEvent: ParticleEvent;
    vfxSystem: VfxSystem;
    resourceResolverKey: string;
    connectionType: string;
}

export interface LinkedData {
    connections: Record<string, PortConnection>;
    missingConnections: Array<{ animationClip: string; effectKey: string; startFrame: number | null; boneName: string | null }>;
    orphanedVfx: string[];
    statistics: { totalEvents: number; linkedEvents: number; missingVfx: number };
}

export function linkAnimationWithVfx(
    animationData: AnimationData,
    vfxSystems: Record<string, VfxSystem>,
    resourceResolver: Record<string, string>,
): LinkedData {
    const linkedData: LinkedData = {
        connections: {},
        missingConnections: [],
        orphanedVfx: [],
        statistics: { totalEvents: 0, linkedEvents: 0, missingVfx: 0 },
    };

    Object.values(animationData.clips).forEach((clip) => {
        clip.events.particle.forEach((particleEvent) => {
            linkedData.statistics.totalEvents++;

            if (particleEvent.effectKey) {
                const vfxConnection = findVfxSystemForEffectKey(particleEvent.effectKey, vfxSystems, resourceResolver);

                if (vfxConnection) {
                    const connectionKey = `${clip.name}.${particleEvent.effectKey}`;
                    linkedData.connections[connectionKey] = {
                        animationClip: clip.name,
                        particleEvent,
                        vfxSystem: vfxConnection.vfxSystem,
                        resourceResolverKey: vfxConnection.resourceKey,
                        connectionType: vfxConnection.connectionType,
                    };
                    linkedData.statistics.linkedEvents++;
                } else {
                    linkedData.missingConnections.push({
                        animationClip: clip.name,
                        effectKey: particleEvent.effectKey,
                        startFrame: particleEvent.startFrame,
                        boneName: particleEvent.boneName,
                    });
                    linkedData.statistics.missingVfx++;
                }
            }
        });
    });

    const usedVfxKeys = Object.values(linkedData.connections).map((conn) => conn.vfxSystem.name);
    Object.keys(vfxSystems).forEach((vfxKey) => {
        if (!usedVfxKeys.includes(vfxKey)) linkedData.orphanedVfx.push(vfxKey);
    });

    return linkedData;
}

export function findVfxSystemForEffectKey(
    effectKey: string,
    vfxSystems: Record<string, VfxSystem>,
    resourceResolver: Record<string, string>,
): VfxConnection | null {
    // Method 1: Direct match in VFX systems
    if (vfxSystems[effectKey]) {
        return { vfxSystem: vfxSystems[effectKey], resourceKey: effectKey, connectionType: 'direct' };
    }

    // Method 2: Search in ResourceResolver
    for (const [resourceKey, resourcePath] of Object.entries(resourceResolver)) {
        if (resourceKey === effectKey) {
            for (const [vfxKey, vfxSystem] of Object.entries(vfxSystems)) {
                if (resourcePath.includes(vfxKey) || vfxKey.includes(resourcePath.split('/').pop() || '')) {
                    return { vfxSystem, resourceKey, connectionType: 'resource_resolver' };
                }
            }
        }
    }

    // Method 3: Fuzzy matching
    const effectKeyLower = effectKey.toLowerCase();
    for (const [vfxKey, vfxSystem] of Object.entries(vfxSystems)) {
        if (vfxKey.toLowerCase().includes(effectKeyLower) || effectKeyLower.includes(vfxKey.toLowerCase())) {
            return { vfxSystem, resourceKey: vfxKey, connectionType: 'fuzzy' };
        }
    }

    return null;
}

export interface PortResult {
    success: boolean;
    actions: string[];
    warnings: string[];
    errors: string[];
}

export function portAnimationEventWithVfx(
    connection: PortConnection,
    targetAnimationData: AnimationData,
    targetVfxSystems: Record<string, VfxSystem>,
    targetResourceResolver: Record<string, string>,
): PortResult {
    const result: PortResult = { success: false, actions: [], warnings: [], errors: [] };

    try {
        const targetClip = targetAnimationData.clips[connection.animationClip];
        if (!targetClip) {
            result.errors.push(`Target animation clip "${connection.animationClip}" not found`);
            return result;
        }

        const vfxPortResult = portVfxSystem(connection.vfxSystem, targetVfxSystems, connection.resourceResolverKey);
        if (vfxPortResult.success) {
            result.actions.push('VFX system ported successfully');
        } else {
            result.warnings.push('VFX system porting failed, but animation event will still be ported');
        }

        const eventPortResult = portAnimationEvent(connection.particleEvent, targetClip);
        if (eventPortResult.success) {
            result.actions.push('Animation event ported successfully');
        } else {
            result.errors.push('Animation event porting failed');
            return result;
        }

        if (connection.resourceResolverKey && !targetResourceResolver[connection.resourceResolverKey]) {
            targetResourceResolver[connection.resourceResolverKey] = generateResourcePath(connection.vfxSystem.name);
            result.actions.push('Resource resolver updated');
        }

        result.success = true;
    } catch (error) {
        result.errors.push(`Porting failed: ${(error as Error).message}`);
    }

    return result;
}

function portVfxSystem(
    vfxSystem: VfxSystem,
    targetVfxSystems: Record<string, VfxSystem>,
    _resourceKey: string,
): { success: boolean; reason?: string } {
    try {
        if (targetVfxSystems[vfxSystem.name]) return { success: false, reason: 'VFX system already exists' };

        targetVfxSystems[vfxSystem.name] = {
            ...vfxSystem,
            ported: true,
            portedAt: Date.now(),
            originalContent: vfxSystem.rawContent || vfxSystem.fullContent,
            emitters: vfxSystem.emitters || [],
        };
        return { success: true };
    } catch (error) {
        return { success: false, reason: (error as Error).message };
    }
}

function portAnimationEvent(particleEvent: ParticleEvent, targetClip: Clip): { success: boolean; reason?: string } {
    if (!targetClip.events) targetClip.events = { particle: [], sound: [], submesh: [], conformToPath: [] };
    if (!targetClip.events.particle) targetClip.events.particle = [];

    const existingEvent = targetClip.events.particle.find(
        (event) => event.effectKey === particleEvent.effectKey && event.startFrame === particleEvent.startFrame,
    );
    if (existingEvent) return { success: false, reason: 'Event already exists' };

    const portedEvent: ParticleEvent = { ...particleEvent, isPorted: true };
    targetClip.events.particle.push(portedEvent);
    return { success: true };
}

function generateResourcePath(vfxSystemName: string): string {
    return `Characters/Generic/VFX/${vfxSystemName}`;
}
