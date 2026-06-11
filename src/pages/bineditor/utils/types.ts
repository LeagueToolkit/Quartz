/*
 * Shared data model for the ported BinEditor parser / serializer / operations.
 * Mirrors the structures the original Electron BinEditorV2 produced from
 * ritobin .py text.
 */

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface ValueVector3 {
    constantValue: Vec3 | null;
    dynamicsValues: Vec3[];
    rawBlock?: string;
}

export interface SimpleVec3 {
    constantValue: Vec3;
}

export interface ValueFloat {
    constantValue: number | null;
    dynamicsValues: number[];
    rawBlock?: string;
}

export interface OptionFloat {
    value: number;
}

export interface Emitter {
    name: string;
    rawContent: string;
    localStartLine: number;
    localEndLine?: number;

    birthScale0: ValueVector3 | null;
    scale0: ValueVector3 | null;

    bindWeight: ValueFloat | null;
    translationOverride: SimpleVec3 | null;

    particleLifetime: ValueFloat | null;
    lifetime: OptionFloat | null;
    particleLinger: OptionFloat | null;

    rate: ValueFloat | null;

    pass: number | null;
    miscRenderFlags: number | null;
    isGroundLayer: boolean | null;
}

export interface VfxSystem {
    name: string;
    displayName: string;
    particleName: string | null;
    rawContent: string;
    globalStartLine: number;
    emitters: Emitter[];
    prefix?: string;
    _modified?: boolean;
}

export interface ParsedData {
    header: string;
    systems: Record<string, VfxSystem>;
    systemOrder: string[];
    footer: string;
    rawContent: string;
}

export interface ParseStats {
    systemCount: number;
    emitterCount: number;
    withBirthScale: number;
    withScale0: number;
    withBindWeight: number;
    withTranslationOverride: number;
}

export interface ModifyResult {
    modified: number;
    errors: string[];
}

export interface AddResult {
    added: number;
    errors: string[];
}
