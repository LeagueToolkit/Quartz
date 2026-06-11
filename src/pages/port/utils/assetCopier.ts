import type { VfxEmitter } from './vfxEmitterParser';

/* Find asset file paths referenced inside emitter/system ritobin text.
   Pure text scan — copying the files to disk is a backend concern. */
export function findAssetFiles(emitterData: string | VfxEmitter | Record<string, unknown> | null): string[] {
    const assetFiles = new Set<string>();

    let textContent = '';
    if (typeof emitterData === 'string') {
        textContent = emitterData;
    } else if (emitterData && (emitterData as VfxEmitter).originalContent) {
        textContent = (emitterData as VfxEmitter).originalContent || '';
    } else if (emitterData && typeof emitterData === 'object') {
        const obj = emitterData as Record<string, unknown>;
        textContent =
            (obj.content as string) ||
            (obj.rawContent as string) ||
            (obj.text as string) ||
            JSON.stringify(emitterData);
    }

    if (!textContent || typeof textContent !== 'string') return [];

    const assetPatterns = [
        /(?:texture|texturePath|mTexture|particleColorTexture):\s*string\s*=\s*"([^"]*\.(dds|tex|png|jpg|jpeg|tga))"/gi,
        /(?:mSimpleMeshName|mMeshName|meshName|mesh):\s*string\s*=\s*"([^"]*\.(scb|sco|skn))"/gi,
        /(?:mMeshSkeletonName|skeletonName|skeleton):\s*string\s*=\s*"([^"]*\.skl)"/gi,
        /(?:mAnimationName|animationName|animation):\s*string\s*=\s*"([^"]*\.anm)"/gi,
        /erosionMapName:\s*string\s*=\s*"([^"]*\.(dds|tex|png|jpg|jpeg))"/gi,
        /"([^"]*(?:assets|ASSETS)\/[^"]*\.(dds|tex|png|jpg|jpeg|scb|sco|skn|skl|anm|bin|tga))"/gi,
        /"([^"]*\.(dds|tex|scb|sco|skn|skl|anm|png|jpg|jpeg|tga|bin))"/gi,
    ];

    for (const pattern of assetPatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(textContent)) !== null) {
            const assetPath = match[1];
            if (assetPath && assetPath.trim()) assetFiles.add(assetPath.trim());
        }
        pattern.lastIndex = 0;
    }

    return Array.from(assetFiles);
}
