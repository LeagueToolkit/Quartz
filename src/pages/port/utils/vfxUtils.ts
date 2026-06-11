import { loadEmitterData, type VfxEmitter, type VfxSystem } from './vfxEmitterParser';

export interface ColorInfo {
    name: string;
    colors: string[];
}

export interface TextureInfo {
    path: string;
    label: string;
}

export interface MeshInfo {
    path: string;
    label: string;
    skeletonPath?: string;
    animationPath?: string;
    meshKind?: string;
}

/* Extract color info from emitter original content (ValueColor + animated). */
export const extractColorsFromEmitterContent = (originalContent: string): ColorInfo[] => {
    try {
        if (!originalContent) return [];

        const results: ColorInfo[] = [];

        const valueColorRegex =
            /(\w*color\w*)\s*:\s*embed\s*=\s*valuecolor\s*\{[\s\S]*?constantvalue\s*:\s*vec4\s*=\s*\{\s*([^}]+)\s*\}[\s\S]*?\}/gi;
        let match: RegExpExecArray | null;
        while ((match = valueColorRegex.exec(originalContent)) !== null) {
            const name = match[1] || 'color';
            const vec = match[2]
                .split(',')
                .map((v) => parseFloat(v.trim()))
                .filter((n) => !Number.isNaN(n));
            if (vec.length >= 3) {
                const [r, g, b, a = 1] = vec;
                const css = `rgba(${Math.ceil(r * 254.9)}, ${Math.ceil(g * 254.9)}, ${Math.ceil(b * 254.9)}, ${a})`;
                results.push({ name, colors: [css] });
            }
        }

        const animatedRegex =
            /(\w*color\w*)[\s\S]*?vfxanimatedcolorvariabledata\s*\{[\s\S]*?values\s*:\s*list\[vec4\]\s*=\s*\{([\s\S]*?)\}[\s\S]*?\}/gi;
        let anim: RegExpExecArray | null;
        while ((anim = animatedRegex.exec(originalContent)) !== null) {
            const name = anim[1] || 'colorAnim';
            const body = anim[2] || '';
            const stops: string[] = [];
            const vecLineRegex = /\{\s*([^}]+?)\s*\}/g;
            let line: RegExpExecArray | null;
            while ((line = vecLineRegex.exec(body)) !== null) {
                const vec = line[1]
                    .split(',')
                    .map((v) => parseFloat(v.trim()))
                    .filter((n) => !Number.isNaN(n));
                if (vec.length >= 3) {
                    const [r, g, b, a = 1] = vec;
                    stops.push(`rgba(${Math.ceil(r * 254.9)}, ${Math.ceil(g * 254.9)}, ${Math.ceil(b * 254.9)}, ${a})`);
                }
            }
            if (stops.length > 0) results.push({ name, colors: stops });
        }

        const seen = new Set<string>();
        return results.filter((c) => {
            if (seen.has(c.name)) return false;
            seen.add(c.name);
            return true;
        });
    } catch {
        return [];
    }
};

/* Extract texture name (lowercased filename, no ext) from an emitter. */
export const extractTextureNamesFromEmitter = (emitter: VfxEmitter, system: VfxSystem): string => {
    try {
        const fullEmitterData = loadEmitterData(system, emitter.name);
        if (fullEmitterData && fullEmitterData.texturePath) {
            const texturePath = fullEmitterData.texturePath;
            const fileName = texturePath.split('/').pop() || texturePath.split('\\').pop() || texturePath;
            const textureName = fileName.split('.')[0];
            return textureName.toLowerCase();
        }
    } catch {
        /* noop */
    }
    return '';
};

/* Extract all texture references from emitter content. */
export const extractTexturesFromEmitterContent = (content: string): TextureInfo[] => {
    if (!content) return [];
    const textures: TextureInfo[] = [];
    const textureSet = new Set<string>();

    const texturePatterns = [
        { key: 'texture', label: 'Main' },
        { key: 'particleColorTexture', label: 'Color' },
        { key: 'erosionMapName', label: 'Erosion' },
        { key: 'textureMult', label: 'Mult' },
        { key: 'meshColorTexture', label: 'Mesh Color' },
        { key: 'paletteTexture', label: 'Palette' },
        { key: 'normalMap', label: 'Normal' },
        { key: 'normalMapTexture', label: 'Normal' },
        { key: 'particleColorLookupTexture', label: 'Color Lookup' },
        { key: 'reflectionMapName', label: 'Reflection' },
        { key: 'rimColorLookupTexture', label: 'Rim Lookup' },
        { key: 'rimColorTexture', label: 'Rim Color' },
        { key: 'textureLookupTexture', label: 'Lookup' },
        { key: 'distortionTexture', label: 'Distortion' },
        { key: 'emissiveTexture', label: 'Emissive' },
        { key: 'glossIntensityTexture', label: 'Gloss' },
        { key: 'fresnelTexture', label: 'Fresnel' },
    ];

    texturePatterns.forEach((pattern) => {
        const regex = new RegExp(`(?<![a-zA-Z])${pattern.key}:\\s*string\\s*=\\s*"([^"]+)"`, 'gi');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
            const path = match[1].trim();
            if (path && !textureSet.has(path)) {
                textureSet.add(path);
                textures.push({ path, label: pattern.label });
            }
        }
    });

    const pathRegex = /:\s*string\s*=\s*"([^"]+\.(?:tex|dds|tga|png|jpg|jpeg|bmp))"/gi;
    let match: RegExpExecArray | null;
    while ((match = pathRegex.exec(content)) !== null) {
        const path = match[1].trim();
        if (path && !textureSet.has(path)) {
            const line = content.substring(0, content.indexOf(path)).split('\n').pop();
            let label = 'Other';
            if (line) {
                const fieldMatch = line.match(/^\s*([^:]+):/);
                if (fieldMatch) label = fieldMatch[1].trim().replace(/^m(?=[A-Z])/, '');
            }
            textureSet.add(path);
            textures.push({ path, label });
        }
    }

    return textures;
};

/* Extract primitive/skinned mesh references from emitter content. */
export const extractMeshesFromEmitterContent = (content: string): MeshInfo[] => {
    if (!content) return [];
    const meshes: MeshInfo[] = [];
    const meshSet = new Set<string>();

    const pushMesh = (meshPath: string, label = 'Mesh', extra: Partial<MeshInfo> = {}) => {
        const clean = String(meshPath || '').trim();
        if (!clean || meshSet.has(clean)) return;
        meshSet.add(clean);
        meshes.push({ path: clean, label, ...extra });
    };

    const meshBlockRegex = /mMesh:\s*embed\s*=\s*VfxMeshDefinitionData\s*\{([\s\S]*?)\}/gi;
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = meshBlockRegex.exec(content)) !== null) {
        const block = blockMatch[1] || '';
        const meshNameMatch = block.match(/mMeshName:\s*string\s*=\s*"([^"]+\.(?:skn|scb|sco))"/i);
        const skeletonMatch = block.match(/mMeshSkeletonName:\s*string\s*=\s*"([^"]+\.skl)"/i);
        const animationMatch = block.match(/mAnimationName:\s*string\s*=\s*"([^"]+\.anm)"/i);

        if (meshNameMatch) {
            const meshPath = meshNameMatch[1];
            const lower = meshPath.toLowerCase();
            const isSkinned = lower.endsWith('.skn');
            pushMesh(meshPath, isSkinned ? 'Skinned Mesh' : 'Primitive Mesh', {
                skeletonPath: skeletonMatch?.[1] || '',
                animationPath: animationMatch?.[1] || '',
                meshKind: isSkinned ? 'skinned' : 'static',
            });
        }
    }

    const simpleMeshRegex = /mSimpleMeshName:\s*string\s*=\s*"([^"]+\.(?:scb|sco))"/gi;
    let match: RegExpExecArray | null;
    while ((match = simpleMeshRegex.exec(content)) !== null) {
        pushMesh(match[1], 'Primitive Mesh', { meshKind: 'static' });
    }

    const genericMeshRegex = /:\s*string\s*=\s*"([^"]+\.(?:skn|scb|sco))"/gi;
    while ((match = genericMeshRegex.exec(content)) !== null) {
        const lower = String(match[1]).toLowerCase();
        pushMesh(match[1], lower.endsWith('.skn') ? 'Skinned Mesh' : 'Mesh', {
            meshKind: lower.endsWith('.skn') ? 'skinned' : 'static',
        });
    }

    return meshes;
};
