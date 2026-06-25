// Shared types for the ported AniPort animation utilities.

export type ClipType =
    | 'AtomicClipData'
    | 'SequencerClipData'
    | 'SelectorClipData'
    | 'ParametricClipData'
    | 'ConditionFloatClipData'
    | 'StandaloneEvent';

export interface ParticleEvent {
    type: 'particle';
    subtype?: 'pair';
    eventName?: string | null;
    hash?: string | null;
    name?: string;
    startLine: number;
    endLine: number | null;
    effectKey: string | null;
    startFrame: number | null;
    endFrame?: number | null;
    boneName: string | null;
    isLoop?: boolean;
    isStandalone?: boolean;
    isPorted?: boolean;
    rawContent: string;
}

export interface SoundEvent {
    type: 'sound';
    eventName?: string | null;
    hash?: string | null;
    name?: string;
    startLine: number;
    endLine: number | null;
    soundName: string | null;
    startFrame?: number | null;
    isLoop: boolean;
    isSelfOnly?: boolean;
    isStandalone?: boolean;
    isPorted?: boolean;
    rawContent: string;
}

export interface SubmeshEvent {
    type: 'submesh';
    eventName?: string | null;
    hash?: string | null;
    name?: string;
    startLine: number;
    endLine: number | null;
    startFrame: number | null;
    endFrame: number | null;
    fireIfAnimationEndsEarly: boolean;
    hideSubmeshList: string[];
    showSubmeshList: string[];
    isStandalone?: boolean;
    isPorted?: boolean;
    rawContent: string;
}

export interface FaceTargetEvent {
    type: 'facetarget';
    name: string;
    eventName: string;
    hash?: string | null;
    startLine: number;
    endLine: number | null;
    startFrame: number | null;
    endFrame: number | null;
    faceTarget: number | null;
    yRotationDegrees: number | null;
    blendInTime: number | null;
    blendOutTime: number | null;
    isStandalone?: boolean;
    isPorted?: boolean;
    rawContent: string;
}

export interface ConformToPathEvent {
    type: 'conformToPath';
    startLine: number;
    endLine: number | null;
    startFrame: number | null;
    maskDataName: string | null;
    blendInTime: number | null;
    blendOutTime: number | null;
    rawContent: string;
}

export type AnimEvent =
    | ParticleEvent
    | SoundEvent
    | SubmeshEvent
    | FaceTargetEvent
    | ConformToPathEvent;

export interface ClipEvents {
    particle: ParticleEvent[];
    sound: SoundEvent[];
    submesh: SubmeshEvent[];
    conformToPath: ConformToPathEvent[];
    facetarget?: FaceTargetEvent[];
    [key: string]: AnimEvent[] | undefined;
}

export interface ClipNameEntry {
    type: 'quoted' | 'hash';
    value: string;
    raw: string;
}

export interface SelectorPair {
    clipName: string;
    probability: number;
}

export interface ParametricPair {
    clipName: string;
    value: number | null;
}

export interface ConditionFloatPair {
    clipName: string | null;
    value: number | null;
    startLine: number;
    endLine: number | null;
}

export interface Updater {
    type: string;
    startLine: number | null;
    endLine: number | null;
    properties: Record<string, { type: string; value: string }>;
}

export interface Clip {
    name: string;
    type: ClipType;
    startLine: number;
    endLine: number | null;
    flags: number | null;
    trackDataName: string | null;
    animationFilePath: string | null;
    maskDataName: string | null;
    events: ClipEvents;
    clipNameList: ClipNameEntry[];
    selectorPairs: SelectorPair[];
    parametricPairs: ParametricPair[];
    conditionFloatPairs: ConditionFloatPair[];
    updater: Updater | null;
    changeAnimationMidPlay: boolean | null;
    childAnimDelaySwitchTime: number | null;
    dontStompTransitionClip: boolean | null;
    playAnimChangeFromBeginning: boolean | null;
    syncFrameOnChangeAnim: boolean | null;
    isStandalone?: boolean;
    rawContent: string;
}

export interface EventTypeCounts {
    particle: number;
    sound: number;
    submesh: number;
    facetarget: number;
    conformToPath: number;
    sequencer: number;
    conditionFloat: number;
}

export interface AnimationData {
    clips: Record<string, Clip>;
    metadata: Record<string, unknown>;
    totalClips: number;
    maskNames: string[];
    trackNames: string[];
    eventTypes: EventTypeCounts;
}

export interface LoadedAniData {
    success: boolean;
    animationData: AnimationData;
    vfxSystems: Record<string, VfxSystem>;
    resourceResolver: Record<string, string>;
    originalAnimationContent: string;
    originalSkinsContent: string;
    currentFileContent?: string;
    animationPath: string;
    skinsPath: string;
    skeletonInfo?: { skeleton: string; simpleSkin: string | null; texture: string | null } | null;
    errors: string[];
    warnings: string[];
}

export interface VfxSystem {
    name: string;
    rawContent?: string;
    fullContent?: string;
    originalContent?: string;
    effectKey?: string;
    ported?: boolean;
    portedAt?: number;
    emitters?: unknown[];
}
