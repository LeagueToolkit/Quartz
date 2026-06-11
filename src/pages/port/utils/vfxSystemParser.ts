/* VFX system extraction with bracket-aware parsing.
   Ported from the Electron Quartz vfxSystemParser (the subset Port2 relies on:
   extractVFXSystem + parseCompleteVFXSystems). */

export interface CompleteVfxSystem {
    name: string;
    startLine: number;
    endLine: number;
    content: string[];
    fullContent: string;
    rawContent?: string;
    bracketCount: number;
    isValid: boolean;
    emitterCount: number;
}

export const parseCompleteVFXSystems = (content: string): CompleteVfxSystem[] => {
    const systems: CompleteVfxSystem[] = [];
    const lines = content.split('\n');

    let currentSystem: CompleteVfxSystem | null = null;
    let bracketCount = 0;
    let inSystem = false;

    const finalize = (sys: CompleteVfxSystem, endLine: number, valid: boolean) => {
        sys.endLine = endLine;
        sys.fullContent = sys.content.join('\n');
        sys.bracketCount = bracketCount;
        sys.isValid = valid;
        systems.push(sys);
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.includes('VfxSystemDefinitionData {') && line.includes('=')) {
            const nameMatch = line.match(/^"?([^"=]+)"?\s*=\s*VfxSystemDefinitionData/);
            if (nameMatch) {
                if (inSystem && currentSystem) {
                    finalize(currentSystem, i - 1, false);
                    inSystem = false;
                    currentSystem = null;
                    bracketCount = 0;
                }

                currentSystem = {
                    name: nameMatch[1].trim().replace(/"/g, ''),
                    startLine: i,
                    endLine: i,
                    content: [],
                    fullContent: '',
                    bracketCount: 0,
                    isValid: false,
                    emitterCount: 0,
                };

                inSystem = true;
                bracketCount = 1;
                currentSystem.content.push(lines[i]);
                continue;
            }
        }

        if (inSystem && currentSystem) {
            currentSystem.content.push(lines[i]);

            if (/VfxEmitterDefinitionData\s*\{/i.test(line)) currentSystem.emitterCount++;

            let inStringLiteral = false;
            let stringChar: string | null = null;
            let lineOpenBrackets = 0;
            let lineCloseBrackets = 0;

            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                const prevChar = j > 0 ? line[j - 1] : '';

                if ((char === '"' || char === "'") && prevChar !== '\\') {
                    if (!inStringLiteral) {
                        inStringLiteral = true;
                        stringChar = char;
                    } else if (char === stringChar) {
                        inStringLiteral = false;
                        stringChar = null;
                    }
                }

                if (!inStringLiteral) {
                    if (char === '{') lineOpenBrackets++;
                    else if (char === '}') lineCloseBrackets++;
                }
            }

            bracketCount += lineOpenBrackets - lineCloseBrackets;

            if (bracketCount === 0) {
                finalize(currentSystem, i, true);
                inSystem = false;
                currentSystem = null;
                bracketCount = 0;
                continue;
            }

            if (bracketCount < 0) bracketCount = 0;
        }
    }

    if (inSystem && currentSystem) {
        let completedContent = currentSystem.content.join('\n');
        for (let i = 0; i < bracketCount; i++) completedContent += '\n    }';
        currentSystem.fullContent = completedContent;
        currentSystem.isValid = true;
        currentSystem.endLine = lines.length - 1;
        systems.push(currentSystem);
    }

    return systems;
};

/* Extract a single named VFX system, throwing if not found. */
export const extractVFXSystem = (content: string, systemName: string): CompleteVfxSystem => {
    const systems = parseCompleteVFXSystems(content);
    const targetSystem = systems.find((sys) => sys.name === systemName);
    if (!targetSystem) throw new Error(`VFX system "${systemName}" not found`);
    return targetSystem;
};
