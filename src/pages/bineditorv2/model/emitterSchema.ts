import type { JsonBinValue } from '@/lib/api/bineditor';
import { mkValue } from './nodes';

/* VfxEmitterDefinitionData field catalog — simple-typed fields that can be
   added/created. Types + defaults come from the LeagueToolkit meta schema;
   field-name casing is irrelevant for correctness because bin field hashes are
   case-insensitive. Complex types (Pointer/List/Map/Link/Hash/VfxShape) are
   intentionally excluded from quick-add. Ported verbatim from
   bineditorV3/model/emitterSchema.js; buildFieldText -> buildFieldValue. */

export type SchemaFieldType =
    | 'flag' | 'bool' | 'u8' | 'u16' | 'i16' | 'f32'
    | 'vec2' | 'vec3' | 'vec4' | 'string' | 'option_f32'
    | 'list_f32' | 'list_vec3' | 'list_pointer'
    | 'ValueFloat' | 'ValueVector2' | 'ValueVector3' | 'ValueColor'
    | 'IntegratedValueFloat' | 'IntegratedValueVector2' | 'IntegratedValueVector3';

export type SchemaDefault = number | boolean | string | number[] | null;

export interface SchemaEntry {
    name: string;
    type: SchemaFieldType;
    def: SchemaDefault;
    group: string;
}

export const EMITTER_SCHEMA: SchemaEntry[] = [
    // Scale
    { name: 'BirthScale0', type: 'ValueVector3', def: [1, 1, 1], group: 'Scale' },
    { name: 'Scale0', type: 'ValueVector3', def: [1, 1, 1], group: 'Scale' },
    { name: 'ScaleOverride', type: 'vec3', def: [1, 1, 1], group: 'Scale' },
    { name: 'IsUniformScale', type: 'flag', def: false, group: 'Scale' },

    // Color
    { name: 'Color', type: 'ValueColor', def: [1, 1, 1, 1], group: 'Color' },
    { name: 'BirthColor', type: 'ValueColor', def: [1, 1, 1, 1], group: 'Color' },
    { name: 'ModulationFactor', type: 'vec4', def: [1, 1, 1, 1], group: 'Color' },
    { name: 'CensorModulateValue', type: 'vec4', def: [1, 1, 1, 1], group: 'Color' },
    { name: 'ColorLookUpTypeX', type: 'u8', def: 1, group: 'Color' },
    { name: 'ColorLookUpTypeY', type: 'u8', def: 0, group: 'Color' },
    { name: 'ColorLookUpOffsets', type: 'vec2', def: [0, 0], group: 'Color' },
    { name: 'ColorLookUpScales', type: 'vec2', def: [1, 1], group: 'Color' },
    { name: 'ColorblindVisibility', type: 'u8', def: 0, group: 'Color' },

    // Lifetime / timing
    { name: 'ParticleLifetime', type: 'ValueFloat', def: 3, group: 'Lifetime' },
    { name: 'Lifetime', type: 'option_f32', def: null, group: 'Lifetime' },
    { name: 'ParticleLinger', type: 'option_f32', def: 0, group: 'Lifetime' },
    { name: 'EmitterLinger', type: 'option_f32', def: 0, group: 'Lifetime' },
    { name: 'Period', type: 'option_f32', def: null, group: 'Lifetime' },
    { name: 'TimeActiveDuringPeriod', type: 'option_f32', def: null, group: 'Lifetime' },
    { name: 'TimeBeforeFirstEmission', type: 'f32', def: 0, group: 'Lifetime' },
    { name: 'DoesLifetimeScale', type: 'flag', def: false, group: 'Lifetime' },
    { name: 'DoesParticleLifetimeScale', type: 'flag', def: false, group: 'Lifetime' },

    // Rate
    { name: 'Rate', type: 'ValueFloat', def: 0, group: 'Rate' },
    { name: 'RateByVelocityFunction', type: 'ValueVector2', def: [0, 0], group: 'Rate' },
    { name: 'MaximumRateByVelocity', type: 'option_f32', def: null, group: 'Rate' },
    { name: 'ChanceToNotExist', type: 'f32', def: 0, group: 'Rate' },

    // Velocity / motion
    { name: 'BirthVelocity', type: 'ValueVector3', def: [0, 0, 0], group: 'Velocity' },
    { name: 'Velocity', type: 'ValueVector3', def: [0, 0, 0], group: 'Velocity' },
    { name: 'Acceleration', type: 'ValueVector3', def: [0, 0, 0], group: 'Velocity' },
    { name: 'BirthAcceleration', type: 'ValueVector3', def: [0, 0, 0], group: 'Velocity' },
    { name: 'WorldAcceleration', type: 'IntegratedValueVector3', def: [0, 0, 0], group: 'Velocity' },
    { name: 'BirthDrag', type: 'ValueVector3', def: [0, 0, 0], group: 'Velocity' },
    { name: 'Drag', type: 'ValueVector3', def: [0, 0, 0], group: 'Velocity' },
    { name: 'BirthOrbitalVelocity', type: 'ValueVector3', def: [0, 0, 0], group: 'Velocity' },
    { name: 'DirectionVelocityScale', type: 'f32', def: 0, group: 'Velocity' },
    { name: 'DirectionVelocityMinScale', type: 'f32', def: 1, group: 'Velocity' },

    // Rotation
    { name: 'BirthRotation0', type: 'ValueVector3', def: [0, 0, 0], group: 'Rotation' },
    { name: 'Rotation0', type: 'IntegratedValueVector3', def: [0, 0, 0], group: 'Rotation' },
    { name: 'RotationOverride', type: 'vec3', def: [0, 0, 0], group: 'Rotation' },
    { name: 'BirthRotationalVelocity0', type: 'ValueVector3', def: [0, 0, 0], group: 'Rotation' },
    { name: 'BirthRotationalAcceleration', type: 'ValueVector3', def: [0, 0, 0], group: 'Rotation' },
    { name: 'IsRotationEnabled', type: 'flag', def: false, group: 'Rotation' },
    { name: 'PostRotateOrientationAxis', type: 'vec3', def: [0, 0, 0], group: 'Rotation' },
    { name: 'HasPostRotateOrientation', type: 'flag', def: false, group: 'Rotation' },

    // UV / frames
    { name: 'BirthUvScrollRate', type: 'ValueVector2', def: [0, 0], group: 'UV' },
    { name: 'EmitterUvScrollRate', type: 'vec2', def: [0, 0], group: 'UV' },
    { name: 'ParticleUvScrollRate', type: 'IntegratedValueVector2', def: [0, 0], group: 'UV' },
    { name: 'BirthUvoffset', type: 'ValueVector2', def: [0, 0], group: 'UV' },
    { name: 'BirthUvRotateRate', type: 'ValueFloat', def: 0, group: 'UV' },
    { name: 'ParticleUvRotateRate', type: 'IntegratedValueFloat', def: 0, group: 'UV' },
    { name: 'UvScale', type: 'ValueVector2', def: [1, 1], group: 'UV' },
    { name: 'UvRotation', type: 'ValueFloat', def: 0, group: 'UV' },
    { name: 'UvMode', type: 'u8', def: 0, group: 'UV' },
    { name: 'UvScrollClamp', type: 'flag', def: false, group: 'UV' },
    { name: 'UvTransformCenter', type: 'vec2', def: [0.5, 0.5], group: 'UV' },
    { name: 'UvParallaxScale', type: 'f32', def: 0, group: 'UV' },
    { name: 'TexDiv', type: 'vec2', def: [1, 1], group: 'UV' },
    { name: 'NumFrames', type: 'u16', def: 1, group: 'UV' },
    { name: 'StartFrame', type: 'u16', def: 0, group: 'UV' },
    { name: 'FrameRate', type: 'f32', def: 0, group: 'UV' },
    { name: 'BirthFrameRate', type: 'ValueFloat', def: 1, group: 'UV' },
    { name: 'IsRandomStartFrame', type: 'flag', def: false, group: 'UV' },
    { name: 'TexAddressModeBase', type: 'u8', def: 0, group: 'UV' },
    { name: 'TextureFlipU', type: 'flag', def: false, group: 'UV' },
    { name: 'TextureFlipV', type: 'flag', def: false, group: 'UV' },

    // Texture
    { name: 'Texture', type: 'string', def: '', group: 'Texture' },
    { name: 'ParticleColorTexture', type: 'string', def: 'ASSETS/Shared/Particles/DefaultColorOverlifetime.dds', group: 'Texture' },
    { name: 'FalloffTexture', type: 'string', def: 'ASSETS/Shared/Particles/DefaultFalloff.DDS', group: 'Texture' },
    { name: 'IsTexturePixelated', type: 'bool', def: false, group: 'Texture' },

    // Rendering
    { name: 'Pass', type: 'i16', def: 0, group: 'Rendering' },
    { name: 'BlendMode', type: 'u8', def: 0, group: 'Rendering' },
    { name: 'MeshRenderFlags', type: 'u8', def: 1, group: 'Rendering' },
    { name: 'MiscRenderFlags', type: 'u8', def: 0, group: 'Rendering' },
    { name: 'ColorRenderFlags', type: 'u8', def: 0, group: 'Rendering' },
    { name: 'RenderPhaseOverride', type: 'u8', def: 7, group: 'Rendering' },
    { name: 'DepthBiasFactors', type: 'vec2', def: [0, 0], group: 'Rendering' },
    { name: 'AlphaRef', type: 'u8', def: 5, group: 'Rendering' },
    { name: 'DisableBackfaceCull', type: 'bool', def: false, group: 'Rendering' },
    { name: 'WriteAlphaOnly', type: 'flag', def: false, group: 'Rendering' },
    { name: 'DoesCastShadow', type: 'flag', def: false, group: 'Rendering' },
    { name: 'Importance', type: 'u8', def: 1, group: 'Rendering' },
    { name: 'SortEmittersByPos', type: 'flag', def: false, group: 'Rendering' },
    { name: 'StencilMode', type: 'u8', def: 0, group: 'Rendering' },
    { name: 'StencilRef', type: 'u8', def: 0, group: 'Rendering' },

    // Position
    { name: 'EmitterPosition', type: 'ValueVector3', def: [0, 0, 0], group: 'Position' },
    { name: 'TranslationOverride', type: 'vec3', def: [0, 0, 0], group: 'Position' },
    { name: 'OffsetLifetimeScaling', type: 'vec3', def: [0, 0, 0], group: 'Position' },

    // Weight
    { name: 'BindWeight', type: 'ValueFloat', def: 0, group: 'Weight' },

    // Flags / misc
    { name: 'IsSingleParticle', type: 'flag', def: false, group: 'Flags' },
    { name: 'IsLocalOrientation', type: 'flag', def: false, group: 'Flags' },
    { name: 'ParticleIsLocalOrientation', type: 'flag', def: false, group: 'Flags' },
    { name: 'IsGroundLayer', type: 'flag', def: false, group: 'Flags' },
    { name: 'IsDirectionOriented', type: 'flag', def: false, group: 'Flags' },
    { name: 'IsEmitterSpace', type: 'flag', def: false, group: 'Flags' },
    { name: 'IsFollowingTerrain', type: 'flag', def: false, group: 'Flags' },
    { name: 'UseNavmeshMask', type: 'flag', def: false, group: 'Flags' },
    { name: 'HasVariableStartTime', type: 'flag', def: false, group: 'Flags' },
    { name: 'ParticlesShareRandomValue', type: 'flag', def: false, group: 'Flags' },
    { name: 'Disabled', type: 'bool', def: false, group: 'Flags' },
];

export const SCHEMA_GROUPS = [
    'Scale', 'Color', 'Lifetime', 'Rate', 'Velocity', 'Rotation',
    'UV', 'Texture', 'Rendering', 'Position', 'Weight', 'Flags',
];

/** Grouped catalog for the add-field menu. */
export const ADD_GROUPS: Array<{ group: string; items: SchemaEntry[] }> = SCHEMA_GROUPS.map(
    (g) => ({ group: g, items: EMITTER_SCHEMA.filter((e) => e.group === g) }),
).filter((g) => g.items.length > 0);

/** Name+label pairs for the generic "+ field" menu on arbitrary structs. */
export const GENERIC_TYPES: Array<[SchemaFieldType, string]> = [
    ['f32', 'Float (f32)'], ['u8', 'Int (u8)'], ['u16', 'Int (u16)'], ['i16', 'Int (i16)'],
    ['flag', 'Flag'], ['bool', 'Bool'], ['string', 'String'],
    ['vec2', 'Vec2'], ['vec3', 'Vec3'], ['vec4', 'Vec4 / Color'],
    ['option_f32', 'Option<f32>'],
    ['list_f32', 'List<f32>'], ['list_vec3', 'List<vec3>'], ['list_pointer', 'List<pointer>'],
    ['ValueFloat', 'ValueFloat'], ['ValueVector3', 'ValueVector3'], ['ValueColor', 'ValueColor'],
];

const CONST_TYPE: Partial<Record<SchemaFieldType, string>> = {
    ValueFloat: 'f32', IntegratedValueFloat: 'f32',
    ValueVector2: 'vec2', IntegratedValueVector2: 'vec2',
    ValueVector3: 'vec3', IntegratedValueVector3: 'vec3',
    ValueColor: 'vec4',
};

/** Default `def` for a bare type (generic "+ field" without a schema entry). */
export function defaultDef(type: SchemaFieldType): SchemaDefault {
    if (type === 'flag' || type === 'bool') return false;
    if (type === 'u8' || type === 'u16' || type === 'i16' || type === 'f32') return 0;
    if (type === 'vec2') return [0, 0];
    if (type === 'vec3') return [0, 0, 0];
    if (type === 'vec4') return [0, 0, 0, 1];
    if (type === 'string') return '';
    if (type === 'option_f32') return null;
    if (type === 'ValueFloat' || type === 'IntegratedValueFloat') return 0;
    if (type === 'ValueVector2' || type === 'IntegratedValueVector2') return [0, 0];
    if (type === 'ValueVector3' || type === 'IntegratedValueVector3') return [0, 0, 0];
    if (type === 'ValueColor') return [1, 1, 1, 1];
    return 0;
}

/** Schema entry for a user-named field on an arbitrary struct. */
export function makeGenericEntry(name: string, type: SchemaFieldType): SchemaEntry {
    return { name, type, def: defaultDef(type), group: 'Custom' };
}

/**
 * The JSON default value for a schema entry — V3's buildFieldText, but
 * producing a JsonBinValue for bin_editor_insert instead of ritobin text.
 */
export function buildFieldValue(entry: SchemaEntry): JsonBinValue | null {
    const { type, def } = entry;
    switch (type) {
        case 'flag':
        case 'bool':
            return mkValue({ t: type, v: !!def });
        case 'u8':
        case 'u16':
        case 'i16':
        case 'f32':
            return mkValue({ t: type, v: Number(def ?? 0) });
        case 'vec2':
        case 'vec3':
        case 'vec4':
            return mkValue({ t: type, v: Array.isArray(def) ? def : [] });
        case 'string':
            return mkValue({ t: 'string', v: String(def ?? '') });
        case 'option_f32':
            return mkValue({
                t: 'option',
                inner: 'f32',
                value: def == null ? null : mkValue({ t: 'f32', v: Number(def) }),
            });
        case 'list_f32':
            return mkValue({ t: 'list', item: 'f32', items: [] });
        case 'list_vec3':
            return mkValue({ t: 'list', item: 'vec3', items: [] });
        case 'list_pointer':
            return mkValue({ t: 'list', item: 'pointer', items: [] });
        default: {
            const ct = CONST_TYPE[type];
            if (!ct) return null;
            const constant = Array.isArray(def)
                ? mkValue({ t: ct, v: def })
                : mkValue({ t: ct, v: Number(def ?? 0) });
            return mkValue({ t: 'embed', class: type, fields: { constantValue: constant } });
        }
    }
}
