import { loadEmitterData } from '../../../utils/vfx/vfxEmitterParser.js';

/**
 * Extract color info from emitter original content
 */
export const extractColorsFromEmitterContent = (originalContent) => {
    try {
        if (!originalContent) return [];

        const results = [];

        // Match ValueColor blocks with constantValue (case-insensitive)
        const valueColorRegex = /(\w*color\w*)\s*:\s*embed\s*=\s*valuecolor\s*\{[\s\S]*?constantvalue\s*:\s*vec4\s*=\s*\{\s*([^}]+)\s*\}[\s\S]*?\}/gi;
        let match;
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

        // Match Animated color lists (case-insensitive)
        const animatedRegex = /(\w*color\w*)[\s\S]*?vfxanimatedcolorvariabledata\s*\{[\s\S]*?values\s*:\s*list\[vec4\]\s*=\s*\{([\s\S]*?)\}[\s\S]*?\}/gi;
        let anim;
        while ((anim = animatedRegex.exec(originalContent)) !== null) {
            const name = anim[1] || 'colorAnim';
            const body = anim[2] || '';
            const stops = [];
            const vecLineRegex = /\{\s*([^}]+?)\s*\}/g;
            let line;
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

        // Deduplicate by name keeping first
        const seen = new Set();
        return results.filter((c) => {
            if (seen.has(c.name)) return false;
            seen.add(c.name);
            return true;
        });
    } catch (_) {
        return [];
    }
};

/**
 * Extract texture names from emitter data (with caching handled by caller)
 */
export const extractTextureNamesFromEmitter = (emitter, system) => {
    try {
        const fullEmitterData = loadEmitterData(system, emitter.name);
        if (fullEmitterData && fullEmitterData.texturePath) {
            // Extract just the filename without path and extension
            const texturePath = fullEmitterData.texturePath;
            const fileName = texturePath.split('/').pop() || texturePath.split('\\').pop() || texturePath;
            const textureName = fileName.split('.')[0]; // Remove extension
            return textureName.toLowerCase();
        }
    } catch (error) {
        console.warn('Error extracting texture name:', error);
    }
    return '';
};

/**
 * Extract all textures from emitter content
 */
export const extractTexturesFromEmitterContent = (content) => {
    if (!content) return [];
    const textures = [];
    const textureSet = new Set();

    // Define texture field patterns with labels
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
        { key: 'fresnelTexture', label: 'Fresnel' }
    ];

    texturePatterns.forEach(pattern => {
        const regex = new RegExp(`(?<![a-zA-Z])${pattern.key}:\\s*string\\s*=\\s*"([^"]+)"`, 'gi');
        let match;
        while ((match = regex.exec(content)) !== null) {
            const path = match[1].trim();
            if (path && !textureSet.has(path)) {
                textureSet.add(path);
                textures.push({ path, label: pattern.label });
            }
        }
    });

    const pathRegex = /:\s*string\s*=\s*"([^"]+\.(?:tex|dds|tga|png|jpg|jpeg|bmp))"/gi;
    let match;
    while ((match = pathRegex.exec(content)) !== null) {
        const path = match[1].trim();
        if (path && !textureSet.has(path)) {
            const line = content.substring(0, content.indexOf(path)).split('\n').pop();
            let label = 'Other';
            if (line) {
                const fieldMatch = line.match(/^\s*([^:]+):/);
                if (fieldMatch) {
                    label = fieldMatch[1].trim().replace(/^m(?=[A-Z])/, '');
                }
            }
            textureSet.add(path);
            textures.push({ path, label });
        }
    }

    return textures;
};
