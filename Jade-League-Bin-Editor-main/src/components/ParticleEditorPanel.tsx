import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './ParticleEditorPanel.css';

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
  // rawBlock removed - was causing memory leak by storing duplicate strings
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
  // rawContent removed - was causing memory leak by storing duplicate strings
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

interface ParticleEditorPanelProps {
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

export default function ParticleEditorPanel({
  isOpen,
  onClose,
  editorContent,
  onContentChange,
  onScrollToLine,
  onStatusUpdate
}: ParticleEditorPanelProps) {
  // Animation state
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [panelRight, setPanelRight] = useState('28px');

  // Parsed data
  const [parsedData, setParsedData] = useState<ParsedVfxData | null>(null);
  const [selectedEmitterKey, setSelectedEmitterKey] = useState<string>('');
  const [status, setStatus] = useState('');
  
  // Track if status was set by user action (should persist for a few seconds)
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userActionStatusRef = useRef(false);

  // Section collapse state
  const [scaleCollapsed, setScaleCollapsed] = useState(false);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  const [emitterListExpanded, setEmitterListExpanded] = useState(false);

  // Get all emitters flat list
  const allEmitters = useMemo(() => {
    if (!parsedData) return [];
    const emitters: { systemName: string; systemDisplayName: string; emitter: VfxEmitter; key: string }[] = [];
    for (const sysName of parsedData.systemOrder) {
      const sys = parsedData.systems[sysName];
      for (const emit of sys.emitters) {
        emitters.push({
          systemName: sysName,
          systemDisplayName: sys.displayName,
          emitter: emit,
          key: `${sysName}:${emit.name}`
        });
      }
    }
    return emitters;
  }, [parsedData]);

  // Current selected emitter
  const currentEmitter = useMemo(() => {
    if (!allEmitters.length) return null;
    if (selectedEmitterKey) {
      return allEmitters.find(e => e.key === selectedEmitterKey) || allEmitters[0];
    }
    return allEmitters[0];
  }, [allEmitters, selectedEmitterKey]);

  // Current emitter index
  const currentIndex = useMemo(() => {
    if (!currentEmitter) return -1;
    return allEmitters.findIndex(e => e.key === currentEmitter.key);
  }, [allEmitters, currentEmitter]);

  // Update panel position
  const updatePanelPosition = useCallback(() => {
    const editorContainer = document.querySelector('.editor-container') as HTMLElement | null;
    if (!editorContainer) return;

    const containerRect = editorContainer.getBoundingClientRect();
    const minimap = editorContainer.querySelector('.monaco-editor .minimap') as HTMLElement | null;
    if (minimap) {
      const minimapRect = minimap.getBoundingClientRect();
      const minimapWidth = Math.max(0, containerRect.right - minimapRect.left);
      setPanelRight(`${Math.round(minimapWidth + 14)}px`);
      return;
    }

    setPanelRight('28px');
  }, []);

  // Handle open/close animation
  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
      updatePanelPosition();
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setIsRendered(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, updatePanelPosition]);

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
        setStatus(`${systemCount} systems, ${totalEmitters} emitters`);
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

  // Ref to track the last parsed content hash to avoid unnecessary re-parses
  const lastParsedContentRef = useRef<string>('');
  const parseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parse content when panel opens or content changes (DEBOUNCED to prevent memory leak)
  useEffect(() => {
    if (!isOpen) return;
    
    // Clear any pending parse
    if (parseTimeoutRef.current) {
      clearTimeout(parseTimeoutRef.current);
      parseTimeoutRef.current = null;
    }

    // Skip if content hasn't actually changed (quick check by length + first/last chars)
    const contentKey = editorContent ? `${editorContent.length}-${editorContent.charCodeAt(0)}-${editorContent.charCodeAt(editorContent.length - 1)}` : '';
    if (contentKey === lastParsedContentRef.current) {
      return;
    }

    // Debounce parsing - wait 300ms after user stops typing
    parseTimeoutRef.current = setTimeout(() => {
      if (!editorContent) return;
      
      try {
        const parsed = parseVfxContent(editorContent);
        setParsedData(parsed);
        lastParsedContentRef.current = contentKey;
        
        // Keep current selection if possible
        if (selectedEmitterKey) {
          const stillExists = Object.values(parsed.systems).some(sys =>
            sys.emitters.some(e => `${sys.name}:${e.name}` === selectedEmitterKey)
          );
          if (!stillExists) {
            setSelectedEmitterKey('');
          }
        }
        
        // Only update status if it's not a user action status
        if (!userActionStatusRef.current) {
          const totalEmitters = Object.values(parsed.systems).reduce(
            (sum, sys) => sum + sys.emitters.length, 0
          );
          setStatus(`${parsed.systemOrder.length} systems, ${totalEmitters} emitters`);
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
  }, [isOpen, editorContent, selectedEmitterKey]);

  // Navigation
  const goToPrev = useCallback(() => {
    if (allEmitters.length === 0) return;
    const newIndex = currentIndex > 0 ? currentIndex - 1 : allEmitters.length - 1;
    const newEmitter = allEmitters[newIndex];
    setSelectedEmitterKey(newEmitter.key);
    if (onScrollToLine) {
      onScrollToLine(newEmitter.emitter.globalStartLine);
    }
  }, [allEmitters, currentIndex, onScrollToLine]);

  const goToNext = useCallback(() => {
    if (allEmitters.length === 0) return;
    const newIndex = currentIndex < allEmitters.length - 1 ? currentIndex + 1 : 0;
    const newEmitter = allEmitters[newIndex];
    setSelectedEmitterKey(newEmitter.key);
    if (onScrollToLine) {
      onScrollToLine(newEmitter.emitter.globalStartLine);
    }
  }, [allEmitters, currentIndex, onScrollToLine]);

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

  // Property update helper
  const updateProperty = useCallback((
    propertyName: string,
    axis: 'x' | 'y' | 'z' | null,
    newValue: string
  ) => {
    if (!currentEmitter || !editorContent) return;

    const numValue = parseLocaleFloat(newValue);
    if (isNaN(numValue)) return;

    // Normalize line endings for consistent matching
    const normalizedContent = normalizeLineEndings(editorContent);
    const hasWindowsLineEndings = editorContent.includes('\r\n');
    
    let newContent: string | null = null;
    const emitter = currentEmitter.emitter;

    if (propertyName === 'birthScale0' && emitter.birthScale0 && axis) {
      const old = emitter.birthScale0.constantValue;
      const updated = { ...old, [axis]: numValue };
      newContent = replaceInRange(
        normalizedContent,
        emitter.birthScale0.startLine,
        emitter.birthScale0.endLine,
        /constantValue:\s*vec3\s*=\s*\{[^}]+\}/i,
        `constantValue: vec3 = { ${updated.x}, ${updated.y}, ${updated.z} }`
      );
    } else if (propertyName === 'scale0' && emitter.scale0 && axis) {
      const old = emitter.scale0.constantValue;
      const updated = { ...old, [axis]: numValue };
      newContent = replaceInRange(
        normalizedContent,
        emitter.scale0.startLine,
        emitter.scale0.endLine,
        /constantValue:\s*vec3\s*=\s*\{[^}]+\}/i,
        `constantValue: vec3 = { ${updated.x}, ${updated.y}, ${updated.z} }`
      );
    } else if (propertyName === 'translationOverride' && emitter.translationOverride && axis) {
      const old = emitter.translationOverride.constantValue;
      const updated = { ...old, [axis]: numValue };
      newContent = replaceInRange(
        normalizedContent,
        emitter.translationOverride.startLine,
        emitter.translationOverride.endLine,
        /translationOverride:\s*vec3\s*=\s*\{[^}]+\}/i,
        `translationOverride: vec3 = { ${updated.x}, ${updated.y}, ${updated.z} }`
      );
    } else if (propertyName === 'bindWeight' && emitter.bindWeight) {
      newContent = replaceInRange(
        normalizedContent,
        emitter.bindWeight.startLine,
        emitter.bindWeight.endLine,
        /constantValue:\s*f32\s*=\s*[\d.\-]+/i,
        `constantValue: f32 = ${numValue}`
      );
    } else if (propertyName === 'particleLifetime' && emitter.particleLifetime) {
      newContent = replaceInRange(
        normalizedContent,
        emitter.particleLifetime.startLine,
        emitter.particleLifetime.endLine,
        /constantValue:\s*f32\s*=\s*[\d.\-]+/i,
        `constantValue: f32 = ${numValue}`
      );
    } else if (propertyName === 'particleLinger' && emitter.particleLinger) {
      newContent = replaceInRange(
        normalizedContent,
        emitter.particleLinger.startLine,
        emitter.particleLinger.endLine,
        /particleLinger:\s*option\[f32\]\s*=\s*\{[^}]+\}/i,
        `particleLinger: option[f32] = { ${numValue} }`
      );
    } else if (propertyName === 'rate' && emitter.rate) {
      newContent = replaceInRange(
        normalizedContent,
        emitter.rate.startLine,
        emitter.rate.endLine,
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
      setStatusWithTimeout(`Updated ${propertyName}`);
    }
  }, [currentEmitter, editorContent, onContentChange, replaceInRange, setStatusWithTimeout]);

  // Quick actions - scale birthScale0
  const scaleBirthScaleBy = useCallback((multiplier: number) => {
    if (!currentEmitter || !editorContent) {
      setStatusWithTimeout('No emitter selected');
      return;
    }
    
    const emitter = currentEmitter.emitter;

    if (!emitter.birthScale0) {
      setStatusWithTimeout('No birthScale0 found on this emitter');
      return;
    }

    // Normalize line endings for consistent matching
    const normalizedContent = normalizeLineEndings(editorContent);
    const hasWindowsLineEndings = editorContent.includes('\r\n');
    
    const old = emitter.birthScale0.constantValue;
    const updated = {
      x: (old.x * multiplier).toFixed(4),
      y: (old.y * multiplier).toFixed(4),
      z: (old.z * multiplier).toFixed(4)
    };
    
    // Replace within the birthScale0 property's line range
    let newContent = replaceInRange(
      normalizedContent,
      emitter.birthScale0.startLine,
      emitter.birthScale0.endLine,
      /constantValue:\s*vec3\s*=\s*\{[^}]+\}/i,
      `constantValue: vec3 = { ${updated.x}, ${updated.y}, ${updated.z} }`
    );

    if (newContent) {
      // Restore original line endings if needed
      if (hasWindowsLineEndings) {
        newContent = newContent.replace(/\n/g, '\r\n');
      }
      onContentChange(newContent);
      setStatusWithTimeout(`Scaled birthScale by ${multiplier}x`);
    } else {
      setStatusWithTimeout('Could not find constantValue in birthScale0');
    }
  }, [currentEmitter, editorContent, onContentChange, replaceInRange, setStatusWithTimeout]);

  // Quick actions - scale scale0
  const scaleScale0By = useCallback((multiplier: number) => {
    if (!currentEmitter || !editorContent) {
      setStatusWithTimeout('No emitter selected');
      return;
    }
    
    const emitter = currentEmitter.emitter;

    if (!emitter.scale0) {
      setStatusWithTimeout('No scale0 found on this emitter');
      return;
    }

    // Normalize line endings for consistent matching
    const normalizedContent = normalizeLineEndings(editorContent);
    const hasWindowsLineEndings = editorContent.includes('\r\n');
    
    const old = emitter.scale0.constantValue;
    const updated = {
      x: (old.x * multiplier).toFixed(4),
      y: (old.y * multiplier).toFixed(4),
      z: (old.z * multiplier).toFixed(4)
    };
    
    // Replace within the scale0 property's line range
    let newContent = replaceInRange(
      normalizedContent,
      emitter.scale0.startLine,
      emitter.scale0.endLine,
      /constantValue:\s*vec3\s*=\s*\{[^}]+\}/i,
      `constantValue: vec3 = { ${updated.x}, ${updated.y}, ${updated.z} }`
    );

    if (newContent) {
      // Restore original line endings if needed
      if (hasWindowsLineEndings) {
        newContent = newContent.replace(/\n/g, '\r\n');
      }
      onContentChange(newContent);
      setStatusWithTimeout(`Scaled scale0 by ${multiplier}x`);
    } else {
      setStatusWithTimeout('Could not find constantValue in scale0');
    }
  }, [currentEmitter, editorContent, onContentChange, replaceInRange, setStatusWithTimeout]);

  const setBindWeight = useCallback((value: number) => {
    if (!currentEmitter || !editorContent) {
      setStatusWithTimeout('No emitter selected');
      return;
    }
    
    const emitter = currentEmitter.emitter;

    if (!emitter.bindWeight) {
      setStatusWithTimeout('bindWeight not found on this emitter');
      return;
    }
    
    // Normalize line endings for consistent matching
    const normalizedContent = normalizeLineEndings(editorContent);
    const hasWindowsLineEndings = editorContent.includes('\r\n');
    
    // Replace within the bindWeight property's line range
    let newContent = replaceInRange(
      normalizedContent,
      emitter.bindWeight.startLine,
      emitter.bindWeight.endLine,
      /constantValue:\s*f32\s*=\s*[\d.\-]+/i,
      `constantValue: f32 = ${value}`
    );
    
    if (newContent) {
      // Restore original line endings if needed
      if (hasWindowsLineEndings) {
        newContent = newContent.replace(/\n/g, '\r\n');
      }
      onContentChange(newContent);
      setStatusWithTimeout(`Set bindWeight to ${value}`);
    } else {
      setStatusWithTimeout('Could not find constantValue in bindWeight');
    }
  }, [currentEmitter, editorContent, onContentChange, replaceInRange, setStatusWithTimeout]);

  if (!isRendered) return null;

  return (
    <div className="particle-editor-panel-wrapper">
      <div
        className={`particle-editor-panel ${isVisible ? 'visible' : ''}`}
        style={{ right: panelRight }}
      >
        <div className="pep-left-bar" />
        <div className="pep-header">
          <span className="pep-title">Particle Editor</span>
          <button
            className="pep-close-btn"
            onClick={onClose}
            aria-label="Close"
          />
        </div>
        <div className="pep-divider" />

        {/* Emitter Selector - Expandable List */}
        <div className="pep-section">
          <div
            className="pep-section-header pep-emitter-selector-header"
            onClick={() => setEmitterListExpanded(!emitterListExpanded)}
          >
            <span className={`pep-collapse-icon ${emitterListExpanded ? '' : 'collapsed'}`} />
            <span className="pep-section-title">
              {currentEmitter?.emitter.name || 'No emitter'}
            </span>
            <span className="pep-emitter-count">
              {allEmitters.length > 0 ? `${currentIndex + 1}/${allEmitters.length}` : '0/0'}
            </span>
          </div>

          {emitterListExpanded && (
            <div className="pep-emitter-list">
              {parsedData && parsedData.systemOrder.map(sysName => {
                const sys = parsedData.systems[sysName];
                return (
                  <div key={sysName} className="pep-emitter-list-system">
                    <div className="pep-emitter-list-system-name">{sys.displayName}</div>
                    {sys.emitters.map(emit => {
                      const key = `${sysName}:${emit.name}`;
                      const isSelected = selectedEmitterKey === key || (!selectedEmitterKey && key === allEmitters[0]?.key);
                      return (
                        <div
                          key={key}
                          className={`pep-emitter-list-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedEmitterKey(key);
                            setEmitterListExpanded(false);
                            if (onScrollToLine) {
                              onScrollToLine(emit.globalStartLine);
                            }
                          }}
                        >
                          {emit.name}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {!emitterListExpanded && (
            <div className="pep-nav">
              <button className="pep-nav-btn" onClick={goToPrev} title="Previous emitter">◀</button>
              <button className="pep-nav-btn" onClick={goToNext} title="Next emitter">▶</button>
            </div>
          )}
        </div>

        {currentEmitter && (
          <>
            <div className="pep-divider" />

            {/* Scale Section */}
            <div className="pep-section">
              <div
                className="pep-section-header"
                onClick={() => setScaleCollapsed(!scaleCollapsed)}
              >
                <span className={`pep-collapse-icon ${scaleCollapsed ? 'collapsed' : ''}`} />
                <span className="pep-section-title">Scale</span>
              </div>

              {!scaleCollapsed && (
                <div className="pep-section-content">
                  {/* Birth Scale */}
                  {currentEmitter.emitter.birthScale0 && (
                    <div className="pep-prop-group">
                      <label className="pep-prop-label">Birth Scale</label>
                      <div className="pep-vec3-inputs">
                        {(['x', 'y', 'z'] as const).map(axis => {
                          const val = currentEmitter.emitter.birthScale0!.constantValue[axis];
                          return (
                            <input
                              key={`bs-${axis}-${currentEmitter.key}-${val}`}
                              type="text"
                              className="pep-input pep-input-vec3"
                              defaultValue={val.toFixed(2)}
                              onBlur={(e) => updateProperty('birthScale0', axis, e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                              title={axis.toUpperCase()}
                            />
                          );
                        })}
                      </div>
                      <div className="pep-quick-actions">
                        <button className="pep-btn-small" onClick={() => scaleBirthScaleBy(2)} title="Double birth scale">×2</button>
                        <button className="pep-btn-small" onClick={() => scaleBirthScaleBy(0.5)} title="Half birth scale">÷2</button>
                      </div>
                    </div>
                  )}

                  {/* Scale0 */}
                  {currentEmitter.emitter.scale0 && (
                    <div className="pep-prop-group">
                      <label className="pep-prop-label">Scale</label>
                      <div className="pep-vec3-inputs">
                        {(['x', 'y', 'z'] as const).map(axis => {
                          const val = currentEmitter.emitter.scale0!.constantValue[axis];
                          return (
                            <input
                              key={`s-${axis}-${currentEmitter.key}-${val}`}
                              type="text"
                              className="pep-input pep-input-vec3"
                              defaultValue={val.toFixed(2)}
                              onBlur={(e) => updateProperty('scale0', axis, e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                              title={axis.toUpperCase()}
                            />
                          );
                        })}
                      </div>
                      <div className="pep-quick-actions">
                        <button className="pep-btn-small" onClick={() => scaleScale0By(2)} title="Double scale">×2</button>
                        <button className="pep-btn-small" onClick={() => scaleScale0By(0.5)} title="Half scale">÷2</button>
                      </div>
                    </div>
                  )}

                  {/* Translation Override */}
                  {currentEmitter.emitter.translationOverride && (
                    <div className="pep-prop-group">
                      <label className="pep-prop-label">Translation</label>
                      <div className="pep-vec3-inputs">
                        {(['x', 'y', 'z'] as const).map(axis => {
                          const val = currentEmitter.emitter.translationOverride!.constantValue[axis];
                          return (
                            <input
                              key={`t-${axis}-${currentEmitter.key}-${val}`}
                              type="text"
                              className="pep-input pep-input-vec3"
                              defaultValue={val.toFixed(2)}
                              onBlur={(e) => updateProperty('translationOverride', axis, e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                              title={axis.toUpperCase()}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pep-divider" />

            {/* Properties Section */}
            <div className="pep-section">
              <div
                className="pep-section-header"
                onClick={() => setPropertiesCollapsed(!propertiesCollapsed)}
              >
                <span className={`pep-collapse-icon ${propertiesCollapsed ? 'collapsed' : ''}`} />
                <span className="pep-section-title">Properties</span>
              </div>

              {!propertiesCollapsed && (
                <div className="pep-section-content">
                  {/* Bind Weight */}
                  {currentEmitter.emitter.bindWeight && (() => {
                    const val = currentEmitter.emitter.bindWeight!.constantValue;
                    return (
                      <div className="pep-prop-row">
                        <label className="pep-prop-label">Bind Weight</label>
                        <input
                          key={`bw-${currentEmitter.key}-${val}`}
                          type="text"
                          className="pep-input pep-input-single"
                          defaultValue={val}
                          onBlur={(e) => updateProperty('bindWeight', null, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                        <div className="pep-btn-group">
                          <button className="pep-btn-tiny" onClick={() => setBindWeight(0)}>0</button>
                          <button className="pep-btn-tiny" onClick={() => setBindWeight(1)}>1</button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Particle Lifetime */}
                  {currentEmitter.emitter.particleLifetime && (() => {
                    const val = currentEmitter.emitter.particleLifetime!.constantValue;
                    return (
                      <div className="pep-prop-row">
                        <label className="pep-prop-label">Lifetime</label>
                        <input
                          key={`pl-${currentEmitter.key}-${val}`}
                          type="text"
                          className="pep-input pep-input-single"
                          defaultValue={val.toFixed(2)}
                          onBlur={(e) => updateProperty('particleLifetime', null, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                      </div>
                    );
                  })()}

                  {/* Particle Linger */}
                  {currentEmitter.emitter.particleLinger && (() => {
                    const val = currentEmitter.emitter.particleLinger!.constantValue;
                    return (
                      <div className="pep-prop-row">
                        <label className="pep-prop-label">Linger</label>
                        <input
                          key={`plg-${currentEmitter.key}-${val}`}
                          type="text"
                          className="pep-input pep-input-single"
                          defaultValue={val.toFixed(2)}
                          onBlur={(e) => updateProperty('particleLinger', null, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                      </div>
                    );
                  })()}

                  {/* Rate */}
                  {currentEmitter.emitter.rate && (() => {
                    const val = currentEmitter.emitter.rate!.constantValue;
                    return (
                      <div className="pep-prop-row">
                        <label className="pep-prop-label">Rate</label>
                        <input
                          key={`r-${currentEmitter.key}-${val}`}
                          type="text"
                          className="pep-input pep-input-single"
                          defaultValue={val.toFixed(2)}
                          onBlur={(e) => updateProperty('rate', null, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </>
        )}

        {/* Status */}
        {status && (
          <>
            <div className="pep-divider" />
            <div className="pep-status">{status}</div>
          </>
        )}
      </div>
    </div>
  );
}
