/**
 * Utility functions for generating and modifying Python (.py) content
 * extracted from ritobin .bin files.
 */

// Remove deleted emitters from file content
export const removeDeletedEmittersFromContent = (lines, deletedEmittersMap) => {
    // Get list of systems that have deleted emitters
    const systemsWithDeletions = new Set();
    for (const [key, value] of deletedEmittersMap.entries()) {
        systemsWithDeletions.add(value.systemKey);
    }

    const modifiedLines = [];
    let currentSystemKey = null;
    let inComplexEmitterSection = false;
    let complexEmitterBracketDepth = 0;
    let emitterCountInSection = 0;
    let totalEmittersInSection = 0;
    let shouldProcessSystem = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Check if this line starts a VfxSystemDefinitionData block
        if (/VfxSystemDefinitionData\s*\{/i.test(trimmedLine)) {
            const headerMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/i);
            if (headerMatch) {
                currentSystemKey = headerMatch[1] || headerMatch[2];
                shouldProcessSystem = systemsWithDeletions.has(currentSystemKey);
            } else {
                shouldProcessSystem = false;
            }
            inComplexEmitterSection = false;
            complexEmitterBracketDepth = 0;
            emitterCountInSection = 0;
            totalEmittersInSection = 0;
        }

        // Check if we're entering complexEmitterDefinitionData section
        if (/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{/i.test(trimmedLine)) {
            inComplexEmitterSection = true;
            complexEmitterBracketDepth = 1;

            // Count total emitters in this section first
            let tempBracketDepth = 1;
            for (let j = i + 1; j < lines.length; j++) {
                const tempLine = lines[j];
                const openBrackets = (tempLine.match(/{/g) || []).length;
                const closeBrackets = (tempLine.match(/}/g) || []).length;
                tempBracketDepth += openBrackets - closeBrackets;

                if (/^\s*VfxEmitterDefinitionData\s*\{/i.test(tempLine)) {
                    totalEmittersInSection++;
                }

                if (tempBracketDepth <= 0) {
                    break;
                }
            }
        }

        // Track complexEmitterDefinitionData bracket depth
        if (inComplexEmitterSection) {
            const openBrackets = (line.match(/{/g) || []).length;
            const closeBrackets = (line.match(/}/g) || []).length;
            complexEmitterBracketDepth += openBrackets - closeBrackets;

            if (complexEmitterBracketDepth <= 0) {
                inComplexEmitterSection = false;
            }
        }

        // Check if this line starts a VfxEmitterDefinitionData block
        if (/^VfxEmitterDefinitionData\s*\{/i.test(trimmedLine)) {
            emitterCountInSection++;

            if (!shouldProcessSystem) {
                // Keep it
            } else {
                let emitterName = null;
                let emitterEndLine = i;
                let emitterBracketDepth = 1;

                let foundEmitterName = false;
                for (let j = i + 1; j < lines.length; j++) {
                    const searchLine = lines[j];

                    if (!foundEmitterName && /emitterName:\s*string\s*=\s*"/i.test(searchLine)) {
                        const match = searchLine.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
                        if (match) {
                            emitterName = match[1];
                            foundEmitterName = true;
                        }
                    }

                    const openBrackets = (searchLine.match(/{/g) || []).length;
                    const closeBrackets = (searchLine.match(/}/g) || []).length;
                    emitterBracketDepth += openBrackets - closeBrackets;

                    if (emitterBracketDepth <= 0) {
                        emitterEndLine = j;
                        break;
                    }
                }

                if (!emitterName) {
                    i = emitterEndLine;
                    continue;
                }

                if (emitterName && currentSystemKey) {
                    const key = `${currentSystemKey}:${emitterName}`;
                    if (deletedEmittersMap.has(key)) {
                        const isLastEmitter = emitterCountInSection === totalEmittersInSection;
                        i = emitterEndLine;
                        if (isLastEmitter) {
                        } else {
                            if (i + 1 < lines.length && lines[i + 1].trim() === '}') {
                                i++;
                            }
                        }
                        continue;
                    }
                }
            }
        }
        modifiedLines.push(line);
    }
    return modifiedLines;
};

// Generate modified Python content with updated emitters
export const generateModifiedPyContent = (originalContent, systems, deletedEmitters) => {
    const lines = originalContent.split('\n');
    let modifiedLines = [...lines];

    if (deletedEmitters && deletedEmitters.size > 0) {
        modifiedLines = removeDeletedEmittersFromContent(modifiedLines, deletedEmitters);
    }

    Object.values(systems).forEach(system => {
        if (system.emitters && system.emitters.length > 0) {
            const portedEmitters = system.emitters.filter(emitter => emitter.originalContent);
            if (portedEmitters.length === 0) return;

            const displayName = system.particleName || system.name || system.key;
            let emitterSectionStart = -1;
            let emitterSectionEnd = -1;
            let bracketDepth = 0;
            let foundCorrectSystem = false;

            for (let i = 0; i < modifiedLines.length; i++) {
                const line = modifiedLines[i];
                const trimmedLine = line.trim();

                if (/=\s*VfxSystemDefinitionData\s*\{/i.test(trimmedLine)) {
                    const keyMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/i);
                    if (keyMatch) {
                        const foundKey = keyMatch[1] || keyMatch[2];
                        if (foundKey === system.key) {
                            foundCorrectSystem = true;
                            for (let j = i; j < Math.min(i + 20, modifiedLines.length); j++) {
                                const searchLine = modifiedLines[j];
                                const searchTrimmed = searchLine.trim();

                                if (/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{/i.test(searchTrimmed)) {
                                    emitterSectionStart = j;
                                    if (/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{\}/i.test(searchTrimmed)) {
                                        emitterSectionEnd = j;
                                        break;
                                    } else {
                                        bracketDepth = 1;
                                        for (let k = j + 1; k < modifiedLines.length; k++) {
                                            const endLine = modifiedLines[k];
                                            const endOpenBrackets = (endLine.match(/{/g) || []).length;
                                            const endCloseBrackets = (endLine.match(/}/g) || []).length;
                                            bracketDepth += endOpenBrackets - endCloseBrackets;
                                            if (bracketDepth <= 0) {
                                                emitterSectionEnd = k;
                                                break;
                                            }
                                        }
                                        break;
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
            }

            if (foundCorrectSystem && emitterSectionStart !== -1 && emitterSectionEnd !== -1) {
                let insertionPoint = emitterSectionEnd;
                let targetIndentation = '    ';
                let foundExistingEmitter = false;

                for (let i = system.startLine; i <= system.endLine && i < modifiedLines.length; i++) {
                    const line = modifiedLines[i];
                    if (/^\s*VfxEmitterDefinitionData\s*\{/i.test(line)) {
                        const match = line.match(/^(\s*)/);
                        if (match) {
                            targetIndentation = match[1];
                            foundExistingEmitter = true;
                        }
                        break;
                    }
                }

                if (!foundExistingEmitter) {
                    const complexEmitterLine = modifiedLines[emitterSectionStart];
                    const match = complexEmitterLine.match(/^(\s*)/);
                    if (match) {
                        targetIndentation = match[1] + '    ';
                    }
                }

                const sectionContent = modifiedLines.slice(emitterSectionStart, emitterSectionEnd + 1).join('\n');
                const isEmptySection = /complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{\}/i.test(sectionContent);

                if (isEmptySection) {
                    const complexEmitterLine = modifiedLines[emitterSectionStart];
                    modifiedLines[emitterSectionStart] = complexEmitterLine.replace('{}', '{');
                    insertionPoint = emitterSectionStart + 1;
                } else {
                    insertionPoint = emitterSectionEnd;
                }

                let newEmitterContent = '';
                portedEmitters.forEach((emitter) => {
                    let emitterContent = emitter.originalContent.replace(/\n$/, '');
                    if (emitterContent.trim().endsWith('}')) {
                        emitterContent = emitterContent.replace(/}\s*$/, '');
                    }
                    const emitterLines = emitterContent.split('\n');
                    const indentedLines = emitterLines.map(line => {
                        if (/^VfxEmitterDefinitionData\s*\{/i.test(line.trim())) {
                            return targetIndentation + line.trim();
                        }
                        return line;
                    });
                    emitterContent = indentedLines.join('\n');
                    newEmitterContent += '\n' + emitterContent + '\n' + targetIndentation + '}\n';
                });

                const beforeSection = modifiedLines.slice(0, insertionPoint);
                const afterSection = modifiedLines.slice(insertionPoint);

                if (isEmptySection) {
                    const closingBrace = targetIndentation + '}';
                    const emitterLines = newEmitterContent.trim().split('\n');
                    modifiedLines = [...beforeSection, ...emitterLines, closingBrace, ...afterSection];
                } else {
                    const emitterLines = newEmitterContent.trim().split('\n');
                    modifiedLines = [...beforeSection, ...emitterLines, ...afterSection];
                }
            }
        }
    });

    return modifiedLines.join('\n');
};

/**
 * Remove a single VfxEmitterDefinitionData block by emitterName from a system's rawContent (fast, text-only)
 * @param {string} systemRawContent The raw Python text of the VFX system
 * @param {string} emitterNameToRemove The name of the emitter to remove
 * @returns {string|null} The updated raw content or null if failed
 */
export function removeEmitterBlockFromSystem(systemRawContent, emitterNameToRemove) {
    try {
        if (!systemRawContent || !emitterNameToRemove) return null;
        const sysLines = systemRawContent.split('\n');
        for (let k = 0; k < sysLines.length; k++) {
            const trimmed = (sysLines[k] || '').trim();
            if (!/VfxEmitterDefinitionData\s*\{/i.test(trimmed)) continue;
            let depth = 1;
            const startIdx = k;
            let endIdx = k;
            let foundName = null;
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
                if (depth <= 0) { endIdx = m; break; }
            }
            if (foundName === emitterNameToRemove) {
                // Splice out the emitter block
                const before = sysLines.slice(0, startIdx);
                const after = sysLines.slice(endIdx + 1);
                // Clean up potential extra blank line
                const merged = [...before, ...after];
                return merged.join('\n');
            }
            // Skip past this block for the outer loop
            k = endIdx;
        }
    } catch (_) { }
    return null;
};
