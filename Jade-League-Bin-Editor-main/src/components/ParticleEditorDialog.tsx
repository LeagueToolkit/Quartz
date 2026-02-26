import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './ParticleEditorDialog.css';

// Types for parsed particle data
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface VfxProperty<T> {
  constantValue: T;
  startLine: number;
  endLine: number;
  // rawBlock removed - was causing memory leak
}

interface VfxEmitter {
  name: string;
  globalStartLine: number;
  globalEndLine: number;
  birthScale0?: VfxProperty<Vec3>;
  scale0?: VfxProperty<Vec3>;
  translationOverride?: VfxProperty<Vec3>;
  bindWeight?: VfxProperty<number>;
  particleLifetime?: VfxProperty<number>;
  particleLinger?: VfxProperty<number>;
  rate?: VfxProperty<number>;
  // rawContent removed - was causing memory leak
}

interface VfxSystem {
  name: string;
  displayName: string;
  emitters: VfxEmitter[];
}

interface ParsedVfxData {
  systems: Record<string, VfxSystem>;
  systemOrder: string[];
}

interface ParticleEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editorContent: string;
  onContentChange: (newContent: string) => void;
  onScrollToLine?: (line: number) => void;
  onStatusUpdate?: (status: string) => void;
}

// Parse helpers
const parseLocaleFloat = (value: string | number): number => {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'string') return NaN;
  const normalized = value.replace(',', '.');
  return parseFloat(normalized);
};

// Count brackets in a line, ignoring those inside strings
function countBrackets(line: string): { opens: number; closes: number } {
  let opens = 0;
  let closes = 0;
  let inString = false;
  let stringChar: string | null = null;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const prevChar = i > 0 ? line[i - 1] : '';

    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
    }

    if (!inString) {
      if (char === '{') opens++;
      if (char === '}') closes++;
    }
  }

  return { opens, closes };
}

// Find the end of a block starting at startLine
function findBlockEnd(lines: string[], startLine: number): number {
  let bracketDepth = 0;
  let foundFirstBracket = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    const { opens, closes } = countBrackets(line);

    bracketDepth += opens - closes;

    if (opens > 0) foundFirstBracket = true;

    if (foundFirstBracket && bracketDepth === 0) {
      return i;
    }

    if (i - startLine > 10000) {
      return i;
    }
  }

  return lines.length - 1;
}

// Get short display name from full path
function getShortName(fullPath: string): string {
  if (!fullPath) return 'Unknown';

  const parts = fullPath.split('/');
  let name = parts[parts.length - 1];

  name = name.replace(/^[A-Z][a-z]+_(Base_|Skin\d+_)/i, '');

  if (name.length > 35) {
    name = name.substring(0, 32) + '...';
  }

  return name;
}

// Normalize line endings to \n for consistent parsing
function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// VFX parser - based on Quartz/C# implementation
function parseVfxContent(content: string): ParsedVfxData {
  const systems: Record<string, VfxSystem> = {};
  const systemOrder: string[] = [];

  if (!content) return { systems, systemOrder };

  // Normalize line endings for consistent parsing
  const normalizedContent = normalizeLineEndings(content);
  const lines = normalizedContent.split('\n');

  // Find all VfxSystemDefinitionData blocks
  // Pattern: "pathName" = VfxSystemDefinitionData { or pathName = VfxSystemDefinitionData {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const systemMatch = line.match(/^\s*"?([^"=]+)"?\s*=\s*VfxSystemDefinitionData\s*\{/);
    
    if (systemMatch) {
      const systemName = systemMatch[1].trim().replace(/"/g, '');
      const startLine = i;
      const endLine = findBlockEnd(lines, i);

      // Extract system content
      const systemLines = lines.slice(startLine, endLine + 1);
      const systemContent = systemLines.join('\n');

      // Get particle name for display
      let displayName = getShortName(systemName);
      const particleNameMatch = systemContent.match(/particleName:\s*string\s*=\s*"([^"]+)"/i);
      if (particleNameMatch) {
        displayName = particleNameMatch[1];
      }

      const system: VfxSystem = {
        name: systemName,
        displayName,
        emitters: []
      };

      // Find all VfxEmitterDefinitionData blocks within this system
      for (let j = 0; j < systemLines.length; j++) {
        if (/VfxEmitterDefinitionData\s*\{/.test(systemLines[j])) {
          const emitterStartLine = j;
          const emitterEndLine = findBlockEnd(systemLines, j);

          const emitterLines = systemLines.slice(emitterStartLine, emitterEndLine + 1);
          const emitterContent = emitterLines.join('\n');

          const emitter = parseEmitter(emitterContent, startLine + emitterStartLine + 1);
          emitter.globalStartLine = startLine + emitterStartLine + 1;
          emitter.globalEndLine = startLine + emitterEndLine + 1;

          system.emitters.push(emitter);

          j = emitterEndLine;
        }
      }

      systems[systemName] = system;
      systemOrder.push(systemName);

      i = endLine;
    }
  }

  return { systems, systemOrder };
}

function parseEmitter(content: string, globalOffset: number): VfxEmitter {
  const lines = content.split('\n');
  
  // Get emitter name
  let name = 'Unnamed';
  const nameMatch = content.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
  if (nameMatch) {
    name = nameMatch[1];
  }

  const emitter: VfxEmitter = {
    name,
    globalStartLine: globalOffset,
    globalEndLine: globalOffset
  };

  // Parse birthScale0: embed = ValueVector3 { constantValue: vec3 = { x, y, z } }
  for (let i = 0; i < lines.length; i++) {
    if (/birthScale0:\s*embed\s*=\s*ValueVector3\s*\{/i.test(lines[i])) {
      const blockEnd = findBlockEnd(lines, i);
      const blockContent = lines.slice(i, blockEnd + 1).join('\n');
      const constMatch = blockContent.match(/constantValue:\s*vec3\s*=\s*\{\s*([^}]+)\}/i);
      if (constMatch) {
        const values = constMatch[1].split(',').map(v => parseFloat(v.trim()));
        if (values.length >= 3) {
          emitter.birthScale0 = {
            constantValue: { x: values[0], y: values[1], z: values[2] },
            startLine: globalOffset + i,
            endLine: globalOffset + blockEnd
          };
        }
      }
      break;
    }
  }

  // Parse scale0: embed = ValueVector3 { ... } (but not birthScale0)
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*scale0:\s*embed\s*=\s*ValueVector3\s*\{/i.test(lines[i]) && !/birthScale0/i.test(lines[i])) {
      const blockEnd = findBlockEnd(lines, i);
      const blockContent = lines.slice(i, blockEnd + 1).join('\n');
      const constMatch = blockContent.match(/constantValue:\s*vec3\s*=\s*\{\s*([^}]+)\}/i);
      if (constMatch) {
        const values = constMatch[1].split(',').map(v => parseFloat(v.trim()));
        if (values.length >= 3) {
          emitter.scale0 = {
            constantValue: { x: values[0], y: values[1], z: values[2] },
            startLine: globalOffset + i,
            endLine: globalOffset + blockEnd
          };
        }
      }
      break;
    }
  }

  // Parse translationOverride: vec3 = { x, y, z }
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/translationOverride:\s*vec3\s*=\s*\{\s*([^}]+)\}/i);
    if (match) {
      const values = match[1].split(',').map(v => parseFloat(v.trim()));
      if (values.length >= 3) {
        emitter.translationOverride = {
          constantValue: { x: values[0], y: values[1], z: values[2] },
          startLine: globalOffset + i,
          endLine: globalOffset + i
        };
      }
      break;
    }
  }

  // Parse bindWeight: embed = ValueFloat { constantValue: f32 = value }
  for (let i = 0; i < lines.length; i++) {
    if (/bindWeight:\s*embed\s*=\s*ValueFloat\s*\{/i.test(lines[i])) {
      const blockEnd = findBlockEnd(lines, i);
      const blockContent = lines.slice(i, blockEnd + 1).join('\n');
      const constMatch = blockContent.match(/constantValue:\s*f32\s*=\s*(-?[\d.]+)/i);
      if (constMatch) {
        emitter.bindWeight = {
          constantValue: parseFloat(constMatch[1]),
          startLine: globalOffset + i,
          endLine: globalOffset + blockEnd
        };
      }
      break;
    }
  }

  // Parse particleLifetime: embed = ValueFloat { ... }
  for (let i = 0; i < lines.length; i++) {
    if (/particleLifetime:\s*embed\s*=\s*ValueFloat\s*\{/i.test(lines[i])) {
      const blockEnd = findBlockEnd(lines, i);
      const blockContent = lines.slice(i, blockEnd + 1).join('\n');
      const constMatch = blockContent.match(/constantValue:\s*f32\s*=\s*(-?[\d.]+)/i);
      if (constMatch) {
        emitter.particleLifetime = {
          constantValue: parseFloat(constMatch[1]),
          startLine: globalOffset + i,
          endLine: globalOffset + blockEnd
        };
      }
      break;
    }
  }

  // Parse particleLinger: option[f32] = { value }
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/particleLinger:\s*option\[f32\]\s*=\s*\{\s*([\d.\-]+)\s*\}/i);
    if (match) {
      emitter.particleLinger = {
        constantValue: parseFloat(match[1]),
        startLine: globalOffset + i,
        endLine: globalOffset + i
      };
      break;
    }
  }

  // Parse rate: embed = ValueFloat { ... }
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*rate:\s*embed\s*=\s*ValueFloat\s*\{/i.test(lines[i]) && !/birthRate/i.test(lines[i])) {
      const blockEnd = findBlockEnd(lines, i);
      const blockContent = lines.slice(i, blockEnd + 1).join('\n');
      const constMatch = blockContent.match(/constantValue:\s*f32\s*=\s*(-?[\d.]+)/i);
      if (constMatch) {
        emitter.rate = {
          constantValue: parseFloat(constMatch[1]),
          startLine: globalOffset + i,
          endLine: globalOffset + blockEnd
        };
      }
      break;
    }
  }

  return emitter;
}

export default function ParticleEditorDialog({
  isOpen,
  onClose,
  editorContent,
  onContentChange,
  onScrollToLine,
  onStatusUpdate
}: ParticleEditorDialogProps) {
  // State
  const [parsedData, setParsedData] = useState<ParsedVfxData | null>(null);
  const [selectedEmitters, setSelectedEmitters] = useState<Set<string>>(new Set());
  const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [scaleMultiplier, setScaleMultiplier] = useState('2');
  const [status, setStatus] = useState('');
  
  // Track if status was set by user action (should persist for a few seconds)
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userActionStatusRef = useRef(false);

  // TranslationOverride bulk values
  const [toX, setToX] = useState('0');
  const [toY, setToY] = useState('0');
  const [toZ, setToZ] = useState('0');

  // Helper to set status with timeout (for user actions)
  const setStatusWithTimeout = useCallback((message: string, persistForMs: number = 3000) => {
    // Clear any existing timeout
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }
    
    // Set status
    setStatus(message);
    userActionStatusRef.current = true;
    
    // Update main app status bar
    if (onStatusUpdate) {
      onStatusUpdate(message);
    }
    
    // Clear after timeout
    statusTimeoutRef.current = setTimeout(() => {
      userActionStatusRef.current = false;
      statusTimeoutRef.current = null;
      // Revert to default status
      if (parsedData) {
        const totalEmitters = Object.values(parsedData.systems).reduce(
          (sum, sys) => sum + sys.emitters.length, 0
        );
        const systemCount = parsedData.systemOrder.length;
        setStatus(`Found ${systemCount} systems, ${totalEmitters} emitters`);
      }
    }, persistForMs);
  }, [onStatusUpdate, parsedData]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  // Ref to track the last parsed content to avoid unnecessary re-parses
  const lastParsedContentRef = useRef<string>('');
  const parseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parse content when dialog opens (DEBOUNCED to prevent memory leak)
  useEffect(() => {
    if (!isOpen) return;
    
    // Clear any pending parse
    if (parseTimeoutRef.current) {
      clearTimeout(parseTimeoutRef.current);
      parseTimeoutRef.current = null;
    }

    // Skip if content hasn't actually changed
    const contentKey = editorContent ? `${editorContent.length}-${editorContent.charCodeAt(0)}-${editorContent.charCodeAt(editorContent.length - 1)}` : '';
    if (contentKey === lastParsedContentRef.current) {
      return;
    }

    // Debounce parsing - wait 300ms after content changes
    parseTimeoutRef.current = setTimeout(() => {
      if (!editorContent) return;
      
      try {
        const parsed = parseVfxContent(editorContent);
        setParsedData(parsed);
        lastParsedContentRef.current = contentKey;
        setSelectedEmitters(new Set());
        setExpandedSystems(new Set());
        
        // Only update status if it's not a user action status
        if (!userActionStatusRef.current) {
          const totalEmitters = Object.values(parsed.systems).reduce(
            (sum, sys) => sum + sys.emitters.length, 0
          );
          setStatus(`Found ${parsed.systemOrder.length} systems, ${totalEmitters} emitters`);
        }
      } catch (e) {
        if (!userActionStatusRef.current) {
          setStatus('Error parsing VFX data');
        }
        setParsedData(null);
      }
    }, 300);

    return () => {
      if (parseTimeoutRef.current) {
        clearTimeout(parseTimeoutRef.current);
        parseTimeoutRef.current = null;
      }
    };
  }, [isOpen, editorContent]);

  // Filtered systems based on search
  const filteredSystems = useMemo(() => {
    if (!parsedData) return [];
    
    const systems = parsedData.systemOrder.map(name => parsedData.systems[name]);
    
    if (!searchQuery.trim()) return systems;
    
    const query = searchQuery.toLowerCase();
    return systems.filter(sys => {
      if (sys.name.toLowerCase().includes(query)) return true;
      if (sys.displayName.toLowerCase().includes(query)) return true;
      return sys.emitters.some(e => e.name.toLowerCase().includes(query));
    });
  }, [parsedData, searchQuery]);

  // Selected emitter (single selection for property editing)
  const selectedEmitter = useMemo(() => {
    if (!parsedData || selectedEmitters.size !== 1) return null;
    
    const [key] = selectedEmitters;
    const [systemName, emitterName] = key.split(':');
    const system = parsedData.systems[systemName];
    if (!system) return null;
    
    return system.emitters.find(e => e.name === emitterName) || null;
  }, [parsedData, selectedEmitters]);

  // Create emitter key
  const createEmitterKey = (systemName: string, emitterName: string) => `${systemName}:${emitterName}`;

  // Selection handlers
  const toggleEmitterSelection = useCallback((systemName: string, emitterName: string, ctrlKey: boolean) => {
    const key = createEmitterKey(systemName, emitterName);
    
    setSelectedEmitters(prev => {
      const next = new Set(ctrlKey ? prev : []);
      if (prev.has(key) && ctrlKey) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectAllInSystem = useCallback((systemName: string) => {
    const system = parsedData?.systems[systemName];
    if (!system) return;

    setSelectedEmitters(prev => {
      const next = new Set(prev);
      const allSelected = system.emitters.every(e =>
        next.has(createEmitterKey(systemName, e.name))
      );

      if (allSelected) {
        system.emitters.forEach(e => {
          next.delete(createEmitterKey(systemName, e.name));
        });
      } else {
        system.emitters.forEach(e => {
          next.add(createEmitterKey(systemName, e.name));
        });
      }

      return next;
    });
  }, [parsedData]);

  const toggleSystemExpanded = useCallback((systemName: string) => {
    setExpandedSystems(prev => {
      const next = new Set(prev);
      if (next.has(systemName)) {
        next.delete(systemName);
      } else {
        next.add(systemName);
      }
      return next;
    });
  }, []);

  // Helper to replace a value within a specific line range
  const replaceInRange = useCallback((
    content: string,
    startLine: number,
    endLine: number,
    pattern: RegExp,
    replacement: string
  ): string | null => {
    const lines = content.split('\n');
    let found = false;
    
    // Lines are 1-indexed from parser, arrays are 0-indexed
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, endLine);
    
    for (let i = start; i < end; i++) {
      if (pattern.test(lines[i])) {
        lines[i] = lines[i].replace(pattern, replacement);
        found = true;
        break;
      }
    }
    
    return found ? lines.join('\n') : null;
  }, []);

  // Single property update using line-based replacement
  const handlePropertyChange = useCallback((property: string, axis: 'x' | 'y' | 'z' | null, value: string) => {
    if (!selectedEmitter || !editorContent) return;

    const numValue = parseLocaleFloat(value);
    if (isNaN(numValue)) return;

    // Normalize line endings for consistent matching
    const normalizedContent = normalizeLineEndings(editorContent);
    const hasWindowsLineEndings = editorContent.includes('\r\n');
    
    let newContent: string | null = null;

    if (property === 'birthScale0' && selectedEmitter.birthScale0 && axis) {
      const old = selectedEmitter.birthScale0.constantValue;
      const updated = { ...old, [axis]: numValue };
      newContent = replaceInRange(
        normalizedContent,
        selectedEmitter.birthScale0.startLine,
        selectedEmitter.birthScale0.endLine,
        /constantValue:\s*vec3\s*=\s*\{[^}]+\}/i,
        `constantValue: vec3 = { ${updated.x}, ${updated.y}, ${updated.z} }`
      );
    } else if (property === 'scale0' && selectedEmitter.scale0 && axis) {
      const old = selectedEmitter.scale0.constantValue;
      const updated = { ...old, [axis]: numValue };
      newContent = replaceInRange(
        normalizedContent,
        selectedEmitter.scale0.startLine,
        selectedEmitter.scale0.endLine,
        /constantValue:\s*vec3\s*=\s*\{[^}]+\}/i,
        `constantValue: vec3 = { ${updated.x}, ${updated.y}, ${updated.z} }`
      );
    } else if (property === 'translationOverride' && selectedEmitter.translationOverride && axis) {
      const old = selectedEmitter.translationOverride.constantValue;
      const updated = { ...old, [axis]: numValue };
      newContent = replaceInRange(
        normalizedContent,
        selectedEmitter.translationOverride.startLine,
        selectedEmitter.translationOverride.endLine,
        /translationOverride:\s*vec3\s*=\s*\{[^}]+\}/i,
        `translationOverride: vec3 = { ${updated.x}, ${updated.y}, ${updated.z} }`
      );
    } else if (property === 'bindWeight' && selectedEmitter.bindWeight) {
      newContent = replaceInRange(
        normalizedContent,
        selectedEmitter.bindWeight.startLine,
        selectedEmitter.bindWeight.endLine,
        /constantValue:\s*f32\s*=\s*[\d.\-]+/i,
        `constantValue: f32 = ${numValue}`
      );
    } else if (property === 'particleLifetime' && selectedEmitter.particleLifetime) {
      newContent = replaceInRange(
        normalizedContent,
        selectedEmitter.particleLifetime.startLine,
        selectedEmitter.particleLifetime.endLine,
        /constantValue:\s*f32\s*=\s*[\d.\-]+/i,
        `constantValue: f32 = ${numValue}`
      );
    } else if (property === 'particleLinger' && selectedEmitter.particleLinger) {
      newContent = replaceInRange(
        normalizedContent,
        selectedEmitter.particleLinger.startLine,
        selectedEmitter.particleLinger.endLine,
        /particleLinger:\s*option\[f32\]\s*=\s*\{[^}]+\}/i,
        `particleLinger: option[f32] = { ${numValue} }`
      );
    } else if (property === 'rate' && selectedEmitter.rate) {
      newContent = replaceInRange(
        normalizedContent,
        selectedEmitter.rate.startLine,
        selectedEmitter.rate.endLine,
        /constantValue:\s*f32\s*=\s*[\d.\-]+/i,
        `constantValue: f32 = ${numValue}`
      );
    }

    if (newContent) {
      // Restore original line endings if needed
      if (hasWindowsLineEndings) {
        newContent = newContent.replace(/\n/g, '\r\n');
      }
      onContentChange(newContent);
      setStatusWithTimeout(`Updated ${property}`);
    }
  }, [selectedEmitter, editorContent, onContentChange, replaceInRange, setStatusWithTimeout]);

  // Helper for bulk operations - replaces in lines array and returns modified count
  const replaceInLinesArray = (
    lines: string[],
    startLine: number,
    endLine: number,
    pattern: RegExp,
    replacement: string
  ): boolean => {
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, endLine);
    
    for (let i = start; i < end; i++) {
      if (pattern.test(lines[i])) {
        lines[i] = lines[i].replace(pattern, replacement);
        return true;
      }
    }
    return false;
  };

  // Bulk operations
  const applyScaleBirthScale = useCallback(() => {
    if (!parsedData || selectedEmitters.size === 0) {
      setStatusWithTimeout('Select emitters first');
      return;
    }

    const mult = parseLocaleFloat(scaleMultiplier);
    if (isNaN(mult) || mult <= 0) {
      setStatusWithTimeout('Invalid multiplier');
      return;
    }

    // Normalize line endings for consistent matching
    const normalizedContent = normalizeLineEndings(editorContent);
    const hasWindowsLineEndings = editorContent.includes('\r\n');
    
    const lines = normalizedContent.split('\n');
    let modified = 0;

    for (const key of selectedEmitters) {
      const [systemName, emitterName] = key.split(':');
      const system = parsedData.systems[systemName];
      if (!system) continue;
      
      const emitter = system.emitters.find(e => e.name === emitterName);
      if (!emitter?.birthScale0) continue;

      const old = emitter.birthScale0.constantValue;
      const updated = {
        x: (old.x * mult).toFixed(4),
        y: (old.y * mult).toFixed(4),
        z: (old.z * mult).toFixed(4)
      };

      if (replaceInLinesArray(
        lines,
        emitter.birthScale0.startLine,
        emitter.birthScale0.endLine,
        /constantValue:\s*vec3\s*=\s*\{[^}]+\}/i,
        `constantValue: vec3 = { ${updated.x}, ${updated.y}, ${updated.z} }`
      )) {
        modified++;
      }
    }

    if (modified > 0) {
      let newContent = lines.join('\n');
      // Restore original line endings if needed
      if (hasWindowsLineEndings) {
        newContent = newContent.replace(/\n/g, '\r\n');
      }
      onContentChange(newContent);
      setStatusWithTimeout(`Scaled birthScale for ${modified} emitter(s) by ${mult}x`);
    } else {
      setStatusWithTimeout('No emitters with birthScale in selection');
    }
  }, [parsedData, selectedEmitters, scaleMultiplier, editorContent, onContentChange, setStatusWithTimeout]);

  const applyScaleScale0 = useCallback(() => {
    if (!parsedData || selectedEmitters.size === 0) {
      setStatusWithTimeout('Select emitters first');
      return;
    }

    const mult = parseLocaleFloat(scaleMultiplier);
    if (isNaN(mult) || mult <= 0) {
      setStatusWithTimeout('Invalid multiplier');
      return;
    }

    // Normalize line endings for consistent matching
    const normalizedContent = normalizeLineEndings(editorContent);
    const hasWindowsLineEndings = editorContent.includes('\r\n');
    
    const lines = normalizedContent.split('\n');
    let modified = 0;

    for (const key of selectedEmitters) {
      const [systemName, emitterName] = key.split(':');
      const system = parsedData.systems[systemName];
      if (!system) continue;
      
      const emitter = system.emitters.find(e => e.name === emitterName);
      if (!emitter?.scale0) continue;

      const old = emitter.scale0.constantValue;
      const updated = {
        x: (old.x * mult).toFixed(4),
        y: (old.y * mult).toFixed(4),
        z: (old.z * mult).toFixed(4)
      };

      if (replaceInLinesArray(
        lines,
        emitter.scale0.startLine,
        emitter.scale0.endLine,
        /constantValue:\s*vec3\s*=\s*\{[^}]+\}/i,
        `constantValue: vec3 = { ${updated.x}, ${updated.y}, ${updated.z} }`
      )) {
        modified++;
      }
    }

    if (modified > 0) {
      let newContent = lines.join('\n');
      // Restore original line endings if needed
      if (hasWindowsLineEndings) {
        newContent = newContent.replace(/\n/g, '\r\n');
      }
      onContentChange(newContent);
      setStatusWithTimeout(`Scaled scale0 for ${modified} emitter(s) by ${mult}x`);
    } else {
      setStatusWithTimeout('No emitters with scale0 in selection');
    }
  }, [parsedData, selectedEmitters, scaleMultiplier, editorContent, onContentChange, setStatusWithTimeout]);

  const handleSetBindWeight = useCallback((value: number) => {
    if (!parsedData || selectedEmitters.size === 0) {
      setStatusWithTimeout('Select emitters first');
      return;
    }

    // Normalize line endings for consistent matching
    const normalizedContent = normalizeLineEndings(editorContent);
    const hasWindowsLineEndings = editorContent.includes('\r\n');
    
    const lines = normalizedContent.split('\n');
    let modified = 0;

    for (const key of selectedEmitters) {
      const [systemName, emitterName] = key.split(':');
      const system = parsedData.systems[systemName];
      if (!system) continue;
      
      const emitter = system.emitters.find(e => e.name === emitterName);
      if (!emitter?.bindWeight) continue;

      if (replaceInLinesArray(
        lines,
        emitter.bindWeight.startLine,
        emitter.bindWeight.endLine,
        /constantValue:\s*f32\s*=\s*[\d.\-]+/i,
        `constantValue: f32 = ${value}`
      )) {
        modified++;
      }
    }

    if (modified > 0) {
      let newContent = lines.join('\n');
      // Restore original line endings if needed
      if (hasWindowsLineEndings) {
        newContent = newContent.replace(/\n/g, '\r\n');
      }
      onContentChange(newContent);
      setStatusWithTimeout(`Set bindWeight to ${value} for ${modified} emitter(s)`);
    } else {
      setStatusWithTimeout('No emitters with bindWeight in selection');
    }
  }, [parsedData, selectedEmitters, editorContent, onContentChange, setStatusWithTimeout]);

  const handleSetTranslationOverride = useCallback(() => {
    if (!parsedData || selectedEmitters.size === 0) {
      setStatusWithTimeout('Select emitters first');
      return;
    }

    const x = parseLocaleFloat(toX);
    const y = parseLocaleFloat(toY);
    const z = parseLocaleFloat(toZ);
    
    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      setStatusWithTimeout('Invalid translation values');
      return;
    }

    // Normalize line endings for consistent matching
    const normalizedContent = normalizeLineEndings(editorContent);
    const hasWindowsLineEndings = editorContent.includes('\r\n');
    
    const lines = normalizedContent.split('\n');
    let modified = 0;

    for (const key of selectedEmitters) {
      const [systemName, emitterName] = key.split(':');
      const system = parsedData.systems[systemName];
      if (!system) continue;
      
      const emitter = system.emitters.find(e => e.name === emitterName);
      if (!emitter?.translationOverride) continue;

      if (replaceInLinesArray(
        lines,
        emitter.translationOverride.startLine,
        emitter.translationOverride.endLine,
        /translationOverride:\s*vec3\s*=\s*\{[^}]+\}/i,
        `translationOverride: vec3 = { ${x}, ${y}, ${z} }`
      )) {
        modified++;
      }
    }

    if (modified > 0) {
      let newContent = lines.join('\n');
      // Restore original line endings if needed
      if (hasWindowsLineEndings) {
        newContent = newContent.replace(/\n/g, '\r\n');
      }
      onContentChange(newContent);
      setStatusWithTimeout(`Set translationOverride for ${modified} emitter(s)`);
    } else {
      setStatusWithTimeout('No emitters with translationOverride in selection');
    }
  }, [parsedData, selectedEmitters, toX, toY, toZ, editorContent, onContentChange, setStatusWithTimeout]);

  // Scroll to emitter in editor
  const scrollToEmitter = useCallback((emitter: VfxEmitter) => {
    if (onScrollToLine && emitter.globalStartLine) {
      onScrollToLine(emitter.globalStartLine);
    }
  }, [onScrollToLine]);

  if (!isOpen) return null;

  return (
    <div className="ped-overlay" onClick={onClose}>
      <div className="ped-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ped-header">
          <div className="ped-header-left">
            <h2>Particle Editor</h2>
          </div>
          <button className="ped-close-btn" onClick={onClose}>×</button>
        </div>

        {/* Toolbar */}
        <div className="ped-toolbar">
          <div className="ped-toolbar-group">
            <span className="ped-toolbar-label">Scale:</span>
            <input
              type="text"
              className="ped-input ped-input-small"
              value={scaleMultiplier}
              onChange={(e) => setScaleMultiplier(e.target.value)}
              title="Scale multiplier"
            />
            <button className="ped-btn ped-btn-primary" onClick={applyScaleBirthScale}>
              BS ×{scaleMultiplier}
            </button>
            <button className="ped-btn ped-btn-primary" onClick={applyScaleScale0}>
              S ×{scaleMultiplier}
            </button>
          </div>

          <div className="ped-toolbar-divider" />

          <div className="ped-toolbar-group">
            <button className="ped-btn" onClick={() => handleSetBindWeight(0)}>BW=0</button>
            <button className="ped-btn" onClick={() => handleSetBindWeight(1)}>BW=1</button>
          </div>

          <div className="ped-toolbar-divider" />

          <div className="ped-toolbar-group">
            <span className="ped-toolbar-label">TO:</span>
            <input
              type="text"
              className="ped-input ped-input-tiny"
              value={toX}
              onChange={(e) => setToX(e.target.value)}
              placeholder="X"
            />
            <input
              type="text"
              className="ped-input ped-input-tiny"
              value={toY}
              onChange={(e) => setToY(e.target.value)}
              placeholder="Y"
            />
            <input
              type="text"
              className="ped-input ped-input-tiny"
              value={toZ}
              onChange={(e) => setToZ(e.target.value)}
              placeholder="Z"
            />
            <button className="ped-btn" onClick={handleSetTranslationOverride}>Set</button>
          </div>

          <div className="ped-toolbar-spacer" />

          <input
            type="text"
            className="ped-input ped-input-search"
            placeholder="Search emitters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Content */}
        <div className="ped-content">
          {/* Left Panel - Systems List */}
          <div className="ped-panel ped-panel-left">
            <div className="ped-panel-header">
              <h3>Systems & Emitters</h3>
            </div>
            <div className="ped-panel-body">
              {filteredSystems.length === 0 ? (
                <div className="ped-empty">
                  {parsedData ? 'No systems match your search' : 'No VFX data found'}
                </div>
              ) : (
                filteredSystems.map(system => {
                  const isExpanded = expandedSystems.has(system.name);
                  const selectedCount = system.emitters.filter(e =>
                    selectedEmitters.has(createEmitterKey(system.name, e.name))
                  ).length;

                  return (
                    <div key={system.name} className="ped-system">
                      <div
                        className={`ped-system-header ${selectedCount > 0 ? 'has-selection' : ''}`}
                      >
                        <div
                          className="ped-system-expand"
                          onClick={() => toggleSystemExpanded(system.name)}
                          title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          <span className={`ped-expand-icon ${isExpanded ? 'expanded' : ''}`}>▶</span>
                        </div>
                        <div
                          className="ped-system-info"
                          onClick={() => selectAllInSystem(system.name)}
                          title="Click to select all emitters"
                        >
                          <span className="ped-system-name">{system.displayName}</span>
                          <span className="ped-system-count">
                            {selectedCount > 0 ? `${selectedCount}/` : ''}{system.emitters.length}
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="ped-emitters">
                          {system.emitters.map(emitter => {
                            const key = createEmitterKey(system.name, emitter.name);
                            const isSelected = selectedEmitters.has(key);

                            return (
                              <div
                                key={key}
                                className={`ped-emitter ${isSelected ? 'selected' : ''}`}
                                onClick={(e) => {
                                  toggleEmitterSelection(system.name, emitter.name, e.ctrlKey || e.metaKey);
                                  scrollToEmitter(emitter);
                                }}
                              >
                                <span className="ped-emitter-name">{emitter.name}</span>
                                <div className="ped-emitter-props">
                                  {emitter.birthScale0 && (
                                    <span className="ped-prop-tag ped-prop-bs" title="Birth Scale">BS</span>
                                  )}
                                  {emitter.scale0 && (
                                    <span className="ped-prop-tag ped-prop-s" title="Scale">S</span>
                                  )}
                                  {emitter.bindWeight && (
                                    <span className="ped-prop-tag ped-prop-bw" title="Bind Weight">BW</span>
                                  )}
                                  {emitter.translationOverride && (
                                    <span className="ped-prop-tag ped-prop-to" title="Translation Override">TO</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel - Property Editor */}
          <div className="ped-panel ped-panel-right">
            <div className="ped-panel-header">
              <h3>Properties</h3>
            </div>
            <div className="ped-panel-body">
              {!selectedEmitter ? (
                <div className="ped-empty">
                  {selectedEmitters.size === 0
                    ? 'Select an emitter to edit properties'
                    : `${selectedEmitters.size} emitters selected - use bulk actions above`
                  }
                </div>
              ) : (
                <div className="ped-props">
                  <div className="ped-props-header">
                    <span className="ped-props-label">EDITING</span>
                    <span className="ped-props-name">{selectedEmitter.name}</span>
                  </div>

                  {/* Birth Scale */}
                  {selectedEmitter.birthScale0 && (
                    <div className="ped-prop-section">
                      <label className="ped-prop-label">Birth Scale</label>
                      <div className="ped-vec3-row">
                        {(['x', 'y', 'z'] as const).map(axis => {
                          const val = selectedEmitter.birthScale0!.constantValue[axis];
                          return (
                            <div key={`bs-${axis}-${val}`} className="ped-vec3-input">
                              <span className="ped-axis-label">{axis.toUpperCase()}</span>
                              <input
                                type="text"
                                className="ped-input"
                                defaultValue={val.toFixed(4)}
                                onBlur={(e) => handlePropertyChange('birthScale0', axis, e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Scale */}
                  {selectedEmitter.scale0 && (
                    <div className="ped-prop-section">
                      <label className="ped-prop-label">Scale</label>
                      <div className="ped-vec3-row">
                        {(['x', 'y', 'z'] as const).map(axis => {
                          const val = selectedEmitter.scale0!.constantValue[axis];
                          return (
                            <div key={`s-${axis}-${val}`} className="ped-vec3-input">
                              <span className="ped-axis-label">{axis.toUpperCase()}</span>
                              <input
                                type="text"
                                className="ped-input"
                                defaultValue={val.toFixed(4)}
                                onBlur={(e) => handlePropertyChange('scale0', axis, e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Translation Override */}
                  {selectedEmitter.translationOverride && (
                    <div className="ped-prop-section">
                      <label className="ped-prop-label">Translation Override</label>
                      <div className="ped-vec3-row">
                        {(['x', 'y', 'z'] as const).map(axis => {
                          const val = selectedEmitter.translationOverride!.constantValue[axis];
                          return (
                            <div key={`to-${axis}-${val}`} className="ped-vec3-input">
                              <span className="ped-axis-label">{axis.toUpperCase()}</span>
                              <input
                                type="text"
                                className="ped-input"
                                defaultValue={val.toFixed(4)}
                                onBlur={(e) => handlePropertyChange('translationOverride', axis, e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Bind Weight */}
                  {selectedEmitter.bindWeight && (() => {
                    const val = selectedEmitter.bindWeight!.constantValue;
                    return (
                      <div className="ped-prop-section">
                        <label className="ped-prop-label">Bind Weight</label>
                        <div className="ped-single-row">
                          <input
                            key={`bw-${val}`}
                            type="text"
                            className="ped-input"
                            defaultValue={val}
                            onBlur={(e) => handlePropertyChange('bindWeight', null, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          />
                          <button className="ped-btn ped-btn-sm" onClick={() => handlePropertyChange('bindWeight', null, '0')}>0</button>
                          <button className="ped-btn ped-btn-sm" onClick={() => handlePropertyChange('bindWeight', null, '1')}>1</button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Particle Lifetime */}
                  {selectedEmitter.particleLifetime && (() => {
                    const val = selectedEmitter.particleLifetime!.constantValue;
                    return (
                      <div className="ped-prop-section">
                        <label className="ped-prop-label">Particle Lifetime</label>
                        <input
                          key={`pl-${val}`}
                          type="text"
                          className="ped-input"
                          defaultValue={val.toFixed(4)}
                          onBlur={(e) => handlePropertyChange('particleLifetime', null, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                      </div>
                    );
                  })()}

                  {/* Particle Linger */}
                  {selectedEmitter.particleLinger && (() => {
                    const val = selectedEmitter.particleLinger!.constantValue;
                    return (
                      <div className="ped-prop-section">
                        <label className="ped-prop-label">Particle Linger</label>
                        <input
                          key={`plg-${val}`}
                          type="text"
                          className="ped-input"
                          defaultValue={val.toFixed(4)}
                          onBlur={(e) => handlePropertyChange('particleLinger', null, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                      </div>
                    );
                  })()}

                  {/* Rate */}
                  {selectedEmitter.rate && (() => {
                    const val = selectedEmitter.rate!.constantValue;
                    return (
                      <div className="ped-prop-section">
                        <label className="ped-prop-label">Emission Rate</label>
                        <input
                          key={`r-${val}`}
                          type="text"
                          className="ped-input"
                          defaultValue={val.toFixed(4)}
                          onBlur={(e) => handlePropertyChange('rate', null, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="ped-footer">
          <span className="ped-status">{status}</span>
          <button className="ped-btn ped-btn-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
