/* Utilities for generating and modifying ritobin .py text. */

/* Remove a single VfxEmitterDefinitionData block by emitterName from a system's
   rawContent (fast, text-only). Returns updated content or null on failure. */
export function removeEmitterBlockFromSystem(systemRawContent: string, emitterNameToRemove: string): string | null {
    try {
        if (!systemRawContent || !emitterNameToRemove) return null;
        const sysLines = systemRawContent.split('\n');
        for (let k = 0; k < sysLines.length; k++) {
            const trimmed = (sysLines[k] || '').trim();
            if (!/VfxEmitterDefinitionData\s*\{/i.test(trimmed)) continue;
            let depth = 1;
            const startIdx = k;
            let endIdx = k;
            let foundName: string | null = null;
            for (let m = k + 1; m < sysLines.length; m++) {
                const line = sysLines[m] || '';
                const t = line.trim();
                if (foundName === null && /emitterName:/i.test(t)) {
                    const mm = t.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
                    if (mm) foundName = mm[1];
                }
                const opens = (line.match(/\{/g) || []).length;
                const closes = (line.match(/\}/g) || []).length;
                depth += opens - closes;
                if (depth <= 0) {
                    endIdx = m;
                    break;
                }
            }
            if (foundName === emitterNameToRemove) {
                const before = sysLines.slice(0, startIdx);
                const after = sysLines.slice(endIdx + 1);
                return [...before, ...after].join('\n');
            }
            k = endIdx;
        }
    } catch {
        /* noop */
    }
    return null;
}
