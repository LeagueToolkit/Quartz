// Extracted from useVfxHubSave: system merge/deletion pipeline

export const hasChangesToSave = (targetSystems, deletedEmitters) => {
    // Check for deleted emitters
    if (deletedEmitters.size > 0) {
      return true;
    }

    // Check for added emitters (ported systems)
    const hasPortedSystems = Object.values(targetSystems).some(system => system.ported);
    if (hasPortedSystems) {
      return true;
    }

    // Check for added emitters in existing systems
    const hasAddedEmitters = Object.values(targetSystems).some(system => {
      // Check if this system has emitters that were added (not ported systems)
      return system.emitters && system.emitters.length > 0 && !system.ported;
    });

    return hasAddedEmitters;
};

  // Find a system in the file content by name
const findSystemInContent = (lines, systemName) => {
    console.log(`Looking for system: "${systemName}"`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('= VfxSystemDefinitionData {')) {
        const keyMatch = line.match(/^(.+?)\s*=\s*VfxSystemDefinitionData\s*\{/);
        if (keyMatch) {
          const systemKey = keyMatch[1].trim().replace(/^"|"$/g, '');
          console.log(`Found system in file: "${systemKey}"`);

          // Try exact match first
          if (systemKey === systemName) {
            console.log(`Exact match found at line ${i}`);
            return i;
          }

          // Try partial match (system name is at the end of the full path)
          if (systemKey.endsWith('/' + systemName) || systemKey.endsWith('\\' + systemName)) {
            console.log(`Partial match found at line ${i} (full path: "${systemKey}")`);
            return i;
          }

          // Try matching just the last part of the path
          const pathParts = systemKey.split(/[\/\\]/);
          const lastPart = pathParts[pathParts.length - 1];
          if (lastPart === systemName) {
            console.log(`Path part match found at line ${i} (last part: "${lastPart}")`);
            return i;
          }
        }
      }
    }
    console.log(`No match found for system: "${systemName}"`);
    return -1;
};

  // Add emitters to a system in the file content
const addEmittersToSystem = async (lines, systemIndex, emitters) => {
    console.log(`addEmittersToSystem called with ${emitters.length} emitters for system at line ${systemIndex}`);

    if (!emitters || emitters.length === 0) {
      console.log('No emitters to add');
      return lines;
    }

    // Find the complexEmitterDefinitionData section in this system
    let emitterSectionStart = -1;
    let emitterSectionEnd = -1;
    let bracketDepth = 0;
    let inSystem = false;

    for (let i = systemIndex; i < lines.length; i++) {
      const line = lines[i].trim();

      if (i === systemIndex) {
        inSystem = true;
        bracketDepth = 1;
        continue;
      }

      if (inSystem) {
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        bracketDepth += openBrackets - closeBrackets;

        // Found complexEmitterDefinitionData section
        if (/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{/i.test(line)) {
          emitterSectionStart = i;
          console.log(`Found complexEmitterDefinitionData section at line ${i}`);

          // Check if this is an empty section
          if (/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{\}/i.test(line)) {
            emitterSectionEnd = i;
            console.log('Empty emitter section found');
          } else {
            // Find the end of the complexEmitterDefinitionData section
            for (let j = i + 1; j < lines.length; j++) {
              const searchLine = lines[j];
              const searchOpenBrackets = (searchLine.match(/{/g) || []).length;
              const searchCloseBrackets = (searchLine.match(/}/g) || []).length;
              bracketDepth += searchOpenBrackets - searchCloseBrackets;

              if (bracketDepth <= 0) {
                emitterSectionEnd = j;
                console.log(`Found end of emitter section at line ${j}`);
                break;
              }
            }
          }
          break;
        }

        // Exit system when brackets close
        if (bracketDepth <= 0) {
          break;
        }
      }
    }

    if (emitterSectionStart === -1) {
      console.warn(`Could not find complexEmitterDefinitionData section for system at line ${systemIndex}`);
      return lines;
    }

    console.log(`Emitter section: start=${emitterSectionStart}, end=${emitterSectionEnd}`);

    // Generate Python code for each emitter
    const emitterPythonCodes = [];
    for (const emitter of emitters) {
      try {
        console.log(`Generating Python for emitter: "${emitter.name}"`);
        const { generateEmitterPython } = await import('../../../../utils/vfx/vfxEmitterParser.js');
        const emitterCode = generateEmitterPython(emitter);
        console.log(`Generated code for "${emitter.name}":`, emitterCode.substring(0, 100) + '...');
        emitterPythonCodes.push(emitterCode);
      } catch (error) {
        console.error(`Error generating Python for emitter ${emitter.name}:`, error);
      }
    }

    if (emitterPythonCodes.length === 0) {
      console.log('No emitter codes generated');
      return lines;
    }

    console.log(`Generated ${emitterPythonCodes.length} emitter codes`);

    // Insert emitters into the section
    const newLines = [...lines];
    let insertIndex = emitterSectionEnd;

    // If the section was empty, insert before the closing brace
    if (emitterSectionStart === emitterSectionEnd) {
      insertIndex = emitterSectionStart;
      // Replace the empty section with content
      newLines.splice(emitterSectionStart, 1, 'complexEmitterDefinitionData: list[pointer] = {');
      console.log(`Replaced empty section at line ${emitterSectionStart}`);
    }

    // Insert each emitter
    for (const emitterCode of emitterPythonCodes) {
      const emitterLines = emitterCode.split('\n');
      console.log(`Inserting ${emitterLines.length} lines at index ${insertIndex}`);
      newLines.splice(insertIndex, 0, ...emitterLines);
      insertIndex += emitterLines.length;
    }

    // Add closing brace if needed
    if (emitterSectionStart === emitterSectionEnd) {
      newLines.splice(insertIndex, 0, '}');
      console.log(`Added closing brace at index ${insertIndex}`);
    }

    console.log(`Successfully modified lines. Original: ${lines.length}, New: ${newLines.length}`);
    return newLines;
};

  // Update asset paths in VFX system content to match copied assets
const updateAssetPathsInContent = (content, systemName) => {
    // Assets from GitHub are already properly named and the VFX system content
    // should already have the correct paths pointing to assets/vfxhub/
    // No path updates needed - just return the content as-is
    return content;
};

  // Remove deleted emitters from content (from Port)
const removeDeletedEmittersFromContent = (lines, deletedEmittersMap) => {
    console.log('=== DELETE FUNCTION DEBUG ===');
    console.log('Deleted emitters map:', deletedEmittersMap);
    console.log('Total lines to process:', lines.length);

    // Get list of systems that have deleted emitters
    const systemsWithDeletions = new Set();
    for (const [key, value] of deletedEmittersMap.entries()) {
      systemsWithDeletions.add(value.systemKey);
      console.log(`  - ${key} (${value.emitterName} in ${value.systemKey})`);
    }

    console.log(`Systems with deletions: ${Array.from(systemsWithDeletions).join(', ')}`);

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

      // Check if this line starts a VfxSystemDefinitionData block (support quoted and hash keys)
      if (trimmedLine.includes('VfxSystemDefinitionData {')) {
        const headerMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
        if (headerMatch) {
          currentSystemKey = headerMatch[1] || headerMatch[2];
          shouldProcessSystem = systemsWithDeletions.has(currentSystemKey);
          console.log(`Found system: ${currentSystemKey} (should process: ${shouldProcessSystem})`);
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
        console.log(`Entering complexEmitterDefinitionData section in system: ${currentSystemKey}`);

        // Count total emitters in this section first
        let tempBracketDepth = 1;
        for (let j = i + 1; j < lines.length; j++) {
          const tempLine = lines[j];
          const openBrackets = (tempLine.match(/{/g) || []).length;
          const closeBrackets = (tempLine.match(/}/g) || []).length;
          tempBracketDepth += openBrackets - closeBrackets;

          if (/VfxEmitterDefinitionData\s*\{/i.test(tempLine.trim())) {
            totalEmittersInSection++;
          }

          if (tempBracketDepth <= 0) {
            break;
          }
        }
        console.log(`Total emitters in section: ${totalEmittersInSection}`);
      }

      // Track complexEmitterDefinitionData bracket depth
      if (inComplexEmitterSection) {
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        complexEmitterBracketDepth += openBrackets - closeBrackets;

        if (complexEmitterBracketDepth <= 0) {
          inComplexEmitterSection = false;
          console.log(`Exiting complexEmitterDefinitionData section`);
        }
      }

      // Check if this line starts a VfxEmitterDefinitionData block
      if (/VfxEmitterDefinitionData\s*\{/i.test(trimmedLine)) {
        emitterCountInSection++;

        // Only process emitters if this system has deletions
        if (!shouldProcessSystem) {
          console.log(`Skipping emitter processing for system: ${currentSystemKey} (no deletions)`);
        } else {
          // Look ahead to find the emitter name and end
          let emitterName = null;
          let emitterStartLine = i;
          let emitterEndLine = i;
          let emitterBracketDepth = 1;

          // Search for emitterName and track bracket depth to find the entire emitter block
          let foundEmitterName = false;
          for (let j = i + 1; j < lines.length; j++) {
            const searchLine = lines[j];

            // Check for emitterName with flexible spacing
            if (!foundEmitterName && /emitterName:\s*string\s*=\s*"/i.test(searchLine)) {
              const match = searchLine.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
              if (match) {
                emitterName = match[1];
                foundEmitterName = true;
                console.log(`Found emitter: ${emitterName} in system: ${currentSystemKey}`);
              }
            }

            // Track bracket depth to find end of emitter block
            const openBrackets = (searchLine.match(/{/g) || []).length;
            const closeBrackets = (searchLine.match(/}/g) || []).length;
            emitterBracketDepth += openBrackets - closeBrackets;

            console.log(`Line ${j}: "${searchLine.trim()}" - Bracket depth: ${emitterBracketDepth}`);

            if (emitterBracketDepth <= 0) {
              emitterEndLine = j;
              console.log(`Found end of emitter block at line ${j}`);
              break;
            }
          }

          // Debug: Log if no emitter name was found
          if (!emitterName) {
            console.log(`⚠️ WARNING: No emitter name found for VfxEmitterDefinitionData at line ${i}`);
            console.log(`⚠️ This emitter block will be skipped for deletion`);
            // Skip this emitter block since we can't identify it
            i = emitterEndLine;
            continue;
          }

          // Check if this emitter should be deleted from this specific system
          if (emitterName && currentSystemKey) {
            console.log(`Checking emitter: ${emitterName} in system: ${currentSystemKey}`);

            // Only check for deletion in the specific system where the emitter was deleted
            const key = `${currentSystemKey}:${emitterName}`;
            console.log(`Checking key: ${key}`);
            console.log(`Key exists in map: ${deletedEmittersMap.has(key)}`);

            if (deletedEmittersMap.has(key)) {
              console.log(`✅ DELETING emitter: ${emitterName} from system: ${currentSystemKey} (lines ${emitterStartLine}-${emitterEndLine})`);

              // Check if this is the last emitter in the section
              const isLastEmitter = emitterCountInSection === totalEmittersInSection;
              console.log(`Is last emitter: ${isLastEmitter}`);

              // Skip the entire emitter block
              i = emitterEndLine; // Skip to end of emitter

              // If this is the last emitter, don't delete the bracket under it
              if (isLastEmitter) {
                console.log(`Last emitter deleted - keeping bracket under it`);
              } else {
                // Delete the bracket under this emitter (next line should be a closing bracket)
                if (i + 1 < lines.length && lines[i + 1].trim() === '}') {
                  console.log(`Deleting bracket under emitter: ${emitterName}`);
                  i++; // Skip the bracket under the emitter
                }
              }

              continue; // Don't add this emitter to modifiedLines
            } else {
              console.log(`❌ Emitter ${emitterName} not found in deletion map for system ${currentSystemKey}`);
            }
          }
        }
      }

      // Keep this line
      modifiedLines.push(line);
    }

    console.log(`Removed ${deletedEmittersMap.size} emitters from file`);
    return modifiedLines;
};

  // Generate modified Python content (from Port)
export const generateModifiedPyContent = async (originalContent, systems, deletedEmitters) => {
    console.log('Generating modified content - port APPROACH');

    const lines = originalContent.split('\n');
    let modifiedLines = [...lines];

    // First, remove deleted emitters from the file
    if (deletedEmitters.size > 0) {
      console.log(`Removing ${deletedEmitters.size} deleted emitters from file`);
      modifiedLines = removeDeletedEmittersFromContent(modifiedLines, deletedEmitters);
    }

    // For each system, find where to insert the new emitters (like port does)
    Object.values(systems).forEach(system => {
      if (system.emitters && system.emitters.length > 0) {
        // Find ported emitters (emitters that have originalContent)
        const portedEmitters = system.emitters.filter(emitter => emitter.originalContent);

        if (portedEmitters.length === 0) {
          return; // Skip if no ported emitters
        }

        // CRITICAL FIX: Check if this system has any deleted emitters that need to be cleaned first
        const systemDeletedEmitters = [];
        for (const [key, value] of deletedEmitters.entries()) {
          if (value.systemKey === system.key) {
            systemDeletedEmitters.push(value.emitterName);
          }
        }

        // CRITICAL FIX: Filter out donor emitters that would conflict with deleted emitters
        // BUT ONLY for this specific target system, not globally
        console.log(`🔍 DEBUG: Checking ${portedEmitters.length} donor emitters for system "${system.name}" (key: "${system.key}")`);
        console.log(`🔍 DEBUG: systemDeletedEmitters for this system:`, systemDeletedEmitters);

        const filteredPortedEmitters = portedEmitters.filter(emitter => {
          console.log(`🔍 DEBUG: Checking emitter "${emitter.name}"`);

          const isDeleted = systemDeletedEmitters.includes(emitter.name);
          if (isDeleted) {
            console.log(`🚫 SKIPPING donor emitter "${emitter.name}" - it was deleted from target system "${system.name}"`);
            return false;
          }

          console.log(`✅ ALLOWING emitter "${emitter.name}" to be added to "${system.name}"`);
          return true;
        });

        if (filteredPortedEmitters.length === 0) {
          console.log(`⚠️ All donor emitters were filtered out due to deletions in target system`);
          return; // Skip if all emitters were filtered out
        }

        console.log(`✅ Will merge ${filteredPortedEmitters.length} donor emitters (${portedEmitters.length - filteredPortedEmitters.length} filtered out due to deletions)`);

        if (systemDeletedEmitters.length > 0) {
          console.log(`⚠️ WARNING: System "${system.name}" has ${systemDeletedEmitters.length} deleted emitters that need to be cleaned before merging:`);
          systemDeletedEmitters.forEach(name => console.log(`  - ${name}`));
        }

        console.log(`\n=== PROCESSING SYSTEM ===`);
        console.log(`System Name: "${system.name}"`);
        console.log(`System Key: "${system.key}"`);
        console.log(`Ported Emitters: ${filteredPortedEmitters.length}`);

        // CRITICAL FIX: Clean the target system first if it has deleted emitters
        if (systemDeletedEmitters.length > 0) {
          console.log(`🧹 CLEANING target system "${system.name}" before merging donor content...`);

          // Find and clean the target system in the file
          for (let i = 0; i < modifiedLines.length; i++) {
            const line = modifiedLines[i];
            const trimmedLine = line.trim();

            if (trimmedLine.includes('= VfxSystemDefinitionData {')) {
              const keyMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
              const matchedKey = keyMatch ? (keyMatch[1] || keyMatch[2]) : null;
              if (matchedKey && (matchedKey === system.key || matchedKey.endsWith('/' + system.name) || matchedKey.endsWith('\\' + system.name))) {
                console.log(`✅ Found target system to clean at line ${i}: "${matchedKey}"`);

                // Clean this system by removing deleted emitters
                modifiedLines = removeDeletedEmittersFromContent(modifiedLines, new Map([...deletedEmitters].filter(([key, value]) => value.systemKey === system.key)));

                console.log(`✅ Cleaned target system "${system.name}" - removed ${systemDeletedEmitters.length} deleted emitters`);
                break;
              }
            }
          }
        }

        // Find the system in the file content
        let foundCorrectSystem = false;
        let systemMatches = [];

        // First, find all potential matches
        for (let i = 0; i < modifiedLines.length; i++) {
          const line = modifiedLines[i];
          const trimmedLine = line.trim();

          if (trimmedLine.includes('= VfxSystemDefinitionData {')) {
            // Extract the system key from this line (quoted or hash)
            const keyMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
            if (keyMatch) {
              const foundKey = keyMatch[1] || keyMatch[2];
              systemMatches.push({ line: i, key: foundKey, content: trimmedLine });

              // Try to match the system name (handle both full path and short name)
              console.log(`  Checking line ${i}: "${foundKey}" vs target: "${system.key}" vs name: "${system.name}"`);

              // Multiple matching strategies - prioritize exact matches
              const exactKeyMatch = foundKey === system.key;
              const exactNameMatch = foundKey === system.name;
              const nameEndMatch = foundKey.endsWith('/' + system.name) || foundKey.endsWith('\\' + system.name);
              const nameContainsMatch = foundKey.includes(system.name);
              const keyContainsName = system.key && system.key.includes(system.name);

              console.log(`    Exact key match: ${exactKeyMatch}`);
              console.log(`    Exact name match: ${exactNameMatch}`);
              console.log(`    Name end match: ${nameEndMatch}`);
              console.log(`    Name contains match: ${nameContainsMatch}`);
              console.log(`    Key contains name: ${keyContainsName}`);

              // Only proceed if we have a strong match
              if (exactKeyMatch || exactNameMatch || nameEndMatch) {
                console.log(`✅ MATCH found at line ${i}: "${foundKey}"`);

                // CRITICAL FIX: Double-check this is the right system by checking the particleName
                let isCorrectSystem = true;
                for (let j = i; j < Math.min(i + 10, modifiedLines.length); j++) {
                  const checkLine = modifiedLines[j];
                  if (/particleName:\s*string\s*=\s*"/i.test(checkLine)) {
                    const particleMatch = checkLine.match(/particleName:\s*string\s*=\s*"([^"]+)"/i);
                    if (particleMatch) {
                      const particleName = particleMatch[1];
                      console.log(`    Found particleName: "${particleName}" vs system name: "${system.name}"`);

                      // Check if particleName matches system name - be more strict
                      const particleMatchesSystem = particleName === system.name ||
                        particleName === system.particleName ||
                        particleName.includes(system.name) ||
                        (system.particleName && particleName.includes(system.particleName));

                      if (!particleMatchesSystem) {
                        console.log(`    ⚠️ WARNING: particleName "${particleName}" doesn't match system name "${system.name}"`);
                        console.log(`    This might be the wrong system - checking if we should continue...`);

                        // Only continue if this is an exact key match
                        if (!exactKeyMatch && !exactNameMatch) {
                          console.log(`    ❌ Skipping this system - not an exact match`);
                          isCorrectSystem = false;
                          break;
                        }
                      } else {
                        console.log(`    ✅ particleName matches system name`);
                      }
                    }
                    break;
                  }
                }

                if (!isCorrectSystem) {
                  console.log(`    ❌ Skipping this system - particleName mismatch`);
                  continue; // Try the next system
                }

                // Show the context around this system
                console.log(`\n--- SYSTEM CONTEXT (lines ${i - 2} to ${i + 5}) ---`);
                for (let j = Math.max(0, i - 2); j <= i + 5 && j < modifiedLines.length; j++) {
                  const marker = j === i ? ' <-- MATCHED LINE' : '';
                  console.log(`  Line ${j}: ${modifiedLines[j]}${marker}`);
                }
                foundCorrectSystem = true;

                // Now look for complexEmitterDefinitionData in the next few lines
                console.log(`\n--- SEARCHING FOR EMITTER SECTION ---`);
                let emitterSectionStart = -1;
                let emitterSectionEnd = -1;
                let bracketDepth = 0;
                let inEmitterSection = false;
                let hasDirectEmitters = false;

                // First, check if there are direct VfxEmitterDefinitionData inside this system
                for (let j = i; j < Math.min(i + 50, modifiedLines.length); j++) {
                  const searchLine = modifiedLines[j];
                  const searchTrimmed = searchLine.trim();

                  // Check if we've reached the end of this system
                  if (searchTrimmed === '}' && bracketDepth <= 1) {
                    break;
                  }

                  // Count brackets to track system depth
                  const openBrackets = (searchLine.match(/{/g) || []).length;
                  const closeBrackets = (searchLine.match(/}/g) || []).length;
                  bracketDepth += openBrackets - closeBrackets;

                  // Check for direct VfxEmitterDefinitionData (must be at bracket depth 2, meaning inside VfxSystemDefinitionData)
                  if (/VfxEmitterDefinitionData\s*\{/i.test(searchTrimmed) && bracketDepth === 2) {
                    hasDirectEmitters = true;
                    console.log(`  ✅ Found direct VfxEmitterDefinitionData at line ${j}`);
                    break;
                  }

                  // Check for empty complexEmitterDefinitionData section
                  if (/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{\}/i.test(searchTrimmed)) {
                    hasDirectEmitters = false;
                    console.log(`  ✅ Found empty complexEmitterDefinitionData at line ${j}`);
                    break;
                  }
                }

                // SIMPLIFIED FIX: Handle both systems with direct emitters AND empty systems
                if (hasDirectEmitters) {
                  console.log(`  ✅ System has direct emitters - will insert at end of system`);

                  // Find the end of the system (before the closing brace)
                  let systemEndLine = -1;
                  bracketDepth = 0;
                  let inSystem = false;

                  for (let j = i; j < modifiedLines.length; j++) {
                    const line = modifiedLines[j];
                    const trimmedLine = line.trim();

                    if (j === i) {
                      inSystem = true;
                      bracketDepth = 1;
                      continue;
                    }

                    if (inSystem) {
                      const openBrackets = (line.match(/{/g) || []).length;
                      const closeBrackets = (line.match(/}/g) || []).length;
                      bracketDepth += openBrackets - closeBrackets;

                      if (bracketDepth <= 0) {
                        systemEndLine = j;
                        console.log(`  ✅ Found end of system at line ${j}`);
                        break;
                      }
                    }
                  }

                  if (systemEndLine !== -1) {
                    console.log(`\n--- INSERTING PORTED EMITTERS INTO DIRECT SYSTEM ---`);
                    console.log(`System end: ${systemEndLine}`);
                    console.log(`Ported emitters to insert: ${filteredPortedEmitters.length}`);

                    // Insert the ported emitters before the closing brace
                    const newLines = [...modifiedLines];
                    const insertIndex = systemEndLine;

                    // Insert each ported emitter's original content
                    let currentInsertIndex = insertIndex;
                    for (const emitter of filteredPortedEmitters) {
                      console.log(`  Inserting emitter: "${emitter.name}"`);
                      const emitterLines = emitter.originalContent.split('\n');
                      newLines.splice(currentInsertIndex, 0, ...emitterLines);
                      currentInsertIndex += emitterLines.length;
                    }

                    modifiedLines = newLines;
                    console.log(`✅ Successfully inserted ${filteredPortedEmitters.length} emitters into direct system`);
                  } else {
                    console.log(`❌ Could not find end of system`);
                  }
                } else {
                  console.log(`  ✅ System is empty or has complexEmitterDefinitionData - looking for empty complexEmitterDefinitionData section`);

                  // Look for empty complexEmitterDefinitionData section
                  let emptySectionLine = -1;
                  for (let j = i; j < Math.min(i + 20, modifiedLines.length); j++) {
                    const searchLine = modifiedLines[j];
                    const searchTrimmed = searchLine.trim();

                    if (/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{\}/i.test(searchTrimmed)) {
                      emptySectionLine = j;
                      console.log(`  ✅ Found empty complexEmitterDefinitionData at line ${j}`);
                      break;
                    }
                  }

                  if (emptySectionLine !== -1) {
                    console.log(`\n--- INSERTING PORTED EMITTERS INTO EMPTY SYSTEM ---`);
                    console.log(`Empty section line: ${emptySectionLine}`);
                    console.log(`Ported emitters to insert: ${filteredPortedEmitters.length}`);

                    // Replace the empty section with content
                    const newLines = [...modifiedLines];
                    newLines.splice(emptySectionLine, 1, 'complexEmitterDefinitionData: list[pointer] = {');

                    // Insert each ported emitter's original content
                    let currentInsertIndex = emptySectionLine + 1;
                    for (const emitter of filteredPortedEmitters) {
                      console.log(`  Inserting emitter: "${emitter.name}"`);
                      const emitterLines = emitter.originalContent.split('\n');
                      newLines.splice(currentInsertIndex, 0, ...emitterLines);
                      currentInsertIndex += emitterLines.length;
                    }

                    // Add closing brace
                    newLines.splice(currentInsertIndex, 0, '}');

                    modifiedLines = newLines;
                    console.log(`✅ Successfully inserted ${filteredPortedEmitters.length} emitters into empty system`);

                    // Skip the rest of the processing since we've handled this system
                    continue;
                  } else {
                    console.log(`  ❌ Could not find empty complexEmitterDefinitionData section`);
                  }

                  // Look for complexEmitterDefinitionData section, but be more careful
                  // Only consider it if it's actually an emitter section, not metadata
                  for (let j = i; j < Math.min(i + 50, modifiedLines.length); j++) {
                    const searchLine = modifiedLines[j];
                    const searchTrimmed = searchLine.trim();

                    if (/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{/i.test(searchTrimmed)) {
                      // Check if this is actually an emitter section by looking ahead
                      let isEmitterSection = false;
                      let tempBracketDepth = 1;

                      for (let k = j + 1; k < Math.min(j + 20, modifiedLines.length); k++) {
                        const checkLine = modifiedLines[k];
                        const checkTrimmed = checkLine.trim();

                        const openBrackets = (checkLine.match(/{/g) || []).length;
                        const closeBrackets = (checkLine.match(/}/g) || []).length;
                        tempBracketDepth += openBrackets - closeBrackets;

                        // If we find VfxEmitterDefinitionData inside this section, it's an emitter section
                        if (/VfxEmitterDefinitionData\s*\{/i.test(checkTrimmed) && tempBracketDepth === 2) {
                          isEmitterSection = true;
                          break;
                        }

                        if (tempBracketDepth <= 0) break;
                      }

                      if (isEmitterSection) {
                        emitterSectionStart = j;
                        console.log(`  ✅ Found complexEmitterDefinitionData (emitter section) at line ${j}`);

                        // Check if this is an empty complexEmitterDefinitionData
                        if (/complexEmitterDefinitionData:\s*list\[pointer\]\s*=\s*\{\}/i.test(searchTrimmed)) {
                          console.log(`  ✅ Empty section detected`);
                          emitterSectionEnd = j; // Same line for empty sections
                        } else {
                          console.log(`  ✅ Non-empty section detected`);
                          // Multi-line format with existing emitters
                          inEmitterSection = true;
                          bracketDepth = 1;

                          // Find the end of the complexEmitterDefinitionData section
                          for (let k = j + 1; k < modifiedLines.length; k++) {
                            const endLine = modifiedLines[k];
                            const endOpenBrackets = (endLine.match(/{/g) || []).length;
                            const endCloseBrackets = (endLine.match(/}/g) || []).length;
                            bracketDepth += endOpenBrackets - endCloseBrackets;

                            if (bracketDepth <= 0) {
                              emitterSectionEnd = k;
                              console.log(`  ✅ Found end of complexEmitterDefinitionData at line ${k}`);
                              break;
                            }
                          }
                        }
                        break;
                      } else {
                        console.log(`  ❌ Found complexEmitterDefinitionData but it's metadata, not emitters`);
                      }
                    }
                  }

                  if (emitterSectionStart !== -1) {
                    console.log(`\n--- INSERTING PORTED EMITTERS ---`);
                    console.log(`Section: ${emitterSectionStart} to ${emitterSectionEnd}`);
                    console.log(`Ported emitters to insert: ${filteredPortedEmitters.length}`);

                    // Insert the ported emitters
                    const newLines = [...modifiedLines];
                    let insertIndex = emitterSectionEnd;

                    // If the section was empty, replace it with content
                    if (emitterSectionStart === emitterSectionEnd) {
                      newLines.splice(emitterSectionStart, 1, 'complexEmitterDefinitionData: list[pointer] = {');
                      insertIndex = emitterSectionStart;
                    }

                    // Insert each ported emitter's original content
                    for (const emitter of filteredPortedEmitters) {
                      console.log(`  Inserting emitter: "${emitter.name}"`);
                      const emitterLines = emitter.originalContent.split('\n');
                      newLines.splice(insertIndex, 0, ...emitterLines);
                      insertIndex += emitterLines.length;
                    }

                    // Add closing brace if needed
                    if (emitterSectionStart === emitterSectionEnd) {
                      newLines.splice(insertIndex, 0, '}');
                    }

                    modifiedLines = newLines;
                    console.log(`✅ Successfully inserted ${filteredPortedEmitters.length} emitters`);
                  } else {
                    console.log(`❌ Could not find complexEmitterDefinitionData section - adding it`);

                    // The system doesn't have a complexEmitterDefinitionData section, so we need to add it
                    // Find the end of the system (the closing brace)
                    let systemEndLine = -1;
                    let bracketDepth = 0;
                    let inSystem = false;

                    for (let j = i; j < modifiedLines.length; j++) {
                      const line = modifiedLines[j];
                      const trimmedLine = line.trim();

                      if (j === i) {
                        inSystem = true;
                        bracketDepth = 1;
                        continue;
                      }

                      if (inSystem) {
                        const openBrackets = (line.match(/{/g) || []).length;
                        const closeBrackets = (line.match(/}/g) || []).length;
                        bracketDepth += openBrackets - closeBrackets;

                        if (bracketDepth <= 0) {
                          systemEndLine = j;
                          console.log(`  ✅ Found end of system at line ${j}`);
                          break;
                        }
                      }
                    }

                    if (systemEndLine !== -1) {
                      console.log(`\n--- ADDING complexEmitterDefinitionData SECTION ---`);
                      console.log(`System end: ${systemEndLine}`);
                      console.log(`Ported emitters to insert: ${filteredPortedEmitters.length}`);

                      // Insert the complexEmitterDefinitionData section before the closing brace
                      const newLines = [...modifiedLines];
                      const insertIndex = systemEndLine;

                      // Add the complexEmitterDefinitionData section
                      newLines.splice(insertIndex, 0, 'complexEmitterDefinitionData: list[pointer] = {');

                      // Insert each ported emitter's original content
                      let currentInsertIndex = insertIndex + 1;
                      for (const emitter of filteredPortedEmitters) {
                        console.log(`  Inserting emitter: "${emitter.name}"`);
                        const emitterLines = emitter.originalContent.split('\n');
                        newLines.splice(currentInsertIndex, 0, ...emitterLines);
                        currentInsertIndex += emitterLines.length;
                      }

                      // Add closing brace
                      newLines.splice(currentInsertIndex, 0, '}');

                      modifiedLines = newLines;
                      console.log(`✅ Successfully added complexEmitterDefinitionData section with ${filteredPortedEmitters.length} emitters`);
                    } else {
                      console.log(`❌ Could not find end of system`);
                    }
                  }
                }
              }
            }
          }
        }

        if (!foundCorrectSystem) {
          console.log(`❌ Could not find system "${system.name}" in file`);
          console.log(`Available systems:`, systemMatches.map(m => m.key));
        }
      }
    });

    console.log('\n=== FINAL FILE CONTENT PREVIEW ===');
    // Show a preview of the modified content around the systems that were processed
    Object.values(systems).forEach(system => {
      if (system.emitters && system.emitters.length > 0) {
        const portedEmitters = system.emitters.filter(emitter => emitter.originalContent);

        // Check if this system has any deleted emitters
        const systemDeletedEmitters = [];
        for (const [key, value] of deletedEmitters.entries()) {
          if (value.systemKey === system.key) {
            systemDeletedEmitters.push(value.emitterName);
          }
        }

        // Filter out donor emitters that would conflict with deleted emitters
        const filteredPortedEmitters = portedEmitters.filter(emitter => {
          const isDeleted = systemDeletedEmitters.includes(emitter.name);
          return !isDeleted;
        });

        if (filteredPortedEmitters.length > 0) {
          console.log(`\n--- Checking system: "${system.name}" ---`);

          // Find the system in the modified content
          for (let i = 0; i < modifiedLines.length; i++) {
            const line = modifiedLines[i];
            const trimmedLine = line.trim();

            if (trimmedLine.includes('= VfxSystemDefinitionData {')) {
              const keyMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
              if (keyMatch) {
                const foundKey = keyMatch[1] || keyMatch[2];
                if (foundKey === system.key || foundKey.endsWith('/' + system.name) || foundKey.endsWith('\\' + system.name)) {
                  console.log(`System found at line ${i}: "${foundKey}"`);

                  // Show the next 20 lines to see if emitters were inserted
                  console.log('Content preview:');
                  for (let j = i; j < Math.min(i + 20, modifiedLines.length); j++) {
                    const marker = j === i ? ' <-- SYSTEM START' : '';
                    console.log(`  Line ${j}: ${modifiedLines[j]}${marker}`);
                  }
                  break;
                }
              }
            }
          }
        }
      }
    });

    return modifiedLines.join('\n');
};
