import { useState, useEffect, useCallback, useRef } from 'react';
import './GeneralEditPanel.css';
import MaterialOverrideDialog from './MaterialOverrideDialog';

interface GeneralEditPanelProps {
  isOpen: boolean;
  onClose: () => void;
  editorContent: string;
  onContentChange: (newContent: string) => void;
}

export default function GeneralEditPanel({
  isOpen,
  onClose,
  editorContent,
  onContentChange
}: GeneralEditPanelProps) {
  // Animation state - for slide down animation like Monaco
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [panelRight, setPanelRight] = useState('28px');
  
  // SkinScale state
  const [skinScaleValue, setSkinScaleValue] = useState('1.0');
  const [percentageValue, setPercentageValue] = useState('100');
  const [originalSkinScale, setOriginalSkinScale] = useState(1.0);
  const [skinScaleExists, setSkinScaleExists] = useState(false);
  const [skinScaleStatus, setSkinScaleStatus] = useState('');
  
  // MaterialOverride state
  const [materialOverrideExists, setMaterialOverrideExists] = useState(false);
  const [materialOverrideStatus, setMaterialOverrideStatus] = useState('');
  const [showMaterialDialog, setShowMaterialDialog] = useState(false);
  const [materialDialogType, setMaterialDialogType] = useState<'texture' | 'material'>('texture');
  const [defaultTexturePath, setDefaultTexturePath] = useState('');
  
  // Section collapse state
  const [skinScaleCollapsed, setSkinScaleCollapsed] = useState(false);
  const [materialOverrideCollapsed, setMaterialOverrideCollapsed] = useState(false);
  
  const isUpdatingFromPercentage = useRef(false);

  const updatePanelPosition = useCallback(() => {
    const editorContainer = document.querySelector('.editor-container') as HTMLElement | null;
    if (!editorContainer) return;

    const containerRect = editorContainer.getBoundingClientRect();
    const findWidget = editorContainer.querySelector('.monaco-editor .find-widget') as HTMLElement | null;
    if (findWidget) {
      const widgetRect = findWidget.getBoundingClientRect();
      const rightOffset = Math.max(0, containerRect.right - widgetRect.right);
      setPanelRight(`${Math.round(rightOffset)}px`);
      return;
    }

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
      // First render the element
      setIsRendered(true);
      // Then trigger animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
      updatePanelPosition();
    } else {
      // First hide with animation
      setIsVisible(false);
      // Then unmount after animation completes
      const timer = setTimeout(() => {
        setIsRendered(false);
      }, 200); // Match CSS transition duration
      return () => clearTimeout(timer);
    }
  }, [isOpen, updatePanelPosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => updatePanelPosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, updatePanelPosition]);

  // Load skinScale value from content
  const loadSkinScaleValue = useCallback(() => {
    if (!editorContent) {
      setSkinScaleStatus('No file loaded');
      setSkinScaleExists(false);
      return;
    }

    const lines = editorContent.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim().toLowerCase();
      if (trimmedLine.startsWith('skinscale:')) {
        // Extract the value after the colon
        const colonIndex = line.indexOf(':');
        let valuePart = line.substring(colonIndex + 1).trim();
        
        // Extract just the number, removing "f32 = " or similar prefixes
        if (valuePart.includes('=')) {
          const equalsIndex = valuePart.indexOf('=');
          valuePart = valuePart.substring(equalsIndex + 1).trim();
        }
        
        setSkinScaleValue(valuePart);
        setSkinScaleExists(true);
        
        const parsedValue = parseFloat(valuePart);
        if (!isNaN(parsedValue)) {
          setOriginalSkinScale(parsedValue);
        }
        
        setSkinScaleStatus('Value loaded');
        return;
      }
    }
    
    setSkinScaleStatus('skinScale not found');
    setSkinScaleExists(false);
  }, [editorContent]);

  // Check if materialOverride exists
  const checkMaterialOverride = useCallback(() => {
    if (!editorContent) {
      setMaterialOverrideStatus('No file loaded');
      setMaterialOverrideExists(false);
      return;
    }

    const hasMaterialOverride = editorContent.includes('materialOverride:');
    setMaterialOverrideExists(hasMaterialOverride);
    setMaterialOverrideStatus(hasMaterialOverride ? 'materialOverride detected' : 'materialOverride not found');
  }, [editorContent]);

  // Extract texture path for default value
  const extractTexturePath = useCallback(() => {
    if (!editorContent) return '';
    
    const lines = editorContent.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.toLowerCase().startsWith('texture:')) {
        const parts = trimmedLine.split('=');
        if (parts.length >= 2) {
          let pathPart = parts[1].trim();
          pathPart = pathPart.replace(/^["']|["']$/g, '');
          return pathPart;
        }
      }
    }
    return '';
  }, [editorContent]);

  // Ref for debouncing content parsing
  const parseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastParsedContentRef = useRef<string>('');

  // Load values when panel opens or content changes (DEBOUNCED to prevent memory leak)
  useEffect(() => {
    if (!isOpen) return;
    
    // Clear any pending parse
    if (parseTimeoutRef.current) {
      clearTimeout(parseTimeoutRef.current);
      parseTimeoutRef.current = null;
    }

    // Skip if content hasn't actually changed
    const contentKey = editorContent ? `${editorContent.length}-${editorContent.charCodeAt(0) || 0}-${editorContent.charCodeAt(editorContent.length - 1) || 0}` : '';
    if (contentKey === lastParsedContentRef.current) {
      return;
    }

    // Debounce parsing - wait 300ms after content changes
    parseTimeoutRef.current = setTimeout(() => {
      loadSkinScaleValue();
      checkMaterialOverride();
      setDefaultTexturePath(extractTexturePath());
      lastParsedContentRef.current = contentKey;
    }, 300);

    return () => {
      if (parseTimeoutRef.current) {
        clearTimeout(parseTimeoutRef.current);
        parseTimeoutRef.current = null;
      }
    };
  }, [isOpen, editorContent, loadSkinScaleValue, checkMaterialOverride, extractTexturePath]);

  // Handle percentage change
  const handlePercentageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const percentText = e.target.value;
    setPercentageValue(percentText);
    
    if (isUpdatingFromPercentage.current) return;
    
    const percentage = parseFloat(percentText);
    if (!isNaN(percentage)) {
      const newValue = originalSkinScale * (percentage / 100.0);
      isUpdatingFromPercentage.current = true;
      setSkinScaleValue(newValue.toFixed(2));
      isUpdatingFromPercentage.current = false;
    }
  };

  // Handle skinScale value change
  const handleSkinScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSkinScaleValue(e.target.value);
    
    const parsedValue = parseFloat(e.target.value);
    if (!isNaN(parsedValue) && originalSkinScale !== 0) {
      const percentage = (parsedValue / originalSkinScale) * 100;
      setPercentageValue(percentage.toFixed(0));
    }
  };

  // Apply skinScale value
  const applySkinScale = () => {
    if (!editorContent) {
      setSkinScaleStatus('No file loaded');
      return;
    }

    const newValue = skinScaleValue.trim();
    if (!newValue) {
      setSkinScaleStatus('Please enter a value');
      return;
    }

    const lines = editorContent.split('\n');
    let found = false;
    let newLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim().toLowerCase();
      
      if (trimmedLine.startsWith('skinscale:')) {
        // Find colon position in original line
        const colonIndex = line.indexOf(':');
        const afterColon = line.substring(colonIndex + 1).trim();
        
        let newLineText: string;
        if (afterColon.includes('=')) {
          // Format: skinScale: f32 = 1.15
          const equalsIndex = line.indexOf('=', colonIndex);
          const beforeEquals = line.substring(0, equalsIndex + 1);
          newLineText = beforeEquals + ' ' + newValue;
        } else {
          // Format: skinScale: 1.15
          const prefix = line.substring(0, colonIndex + 1);
          newLineText = prefix + ' ' + newValue;
        }
        
        newLines.push(newLineText);
        found = true;
      } else {
        newLines.push(line);
      }
    }

    if (found) {
      onContentChange(newLines.join('\n'));
      setSkinScaleStatus(`Applied: ${newValue}`);
      
      // Update original value for percentage calculations
      const parsedValue = parseFloat(newValue);
      if (!isNaN(parsedValue)) {
        setOriginalSkinScale(parsedValue);
        setPercentageValue('100');
      }
    } else {
      setSkinScaleStatus('skinScale not found');
    }
  };

  // Add skinScale property
  const addSkinScale = () => {
    if (!editorContent) {
      setSkinScaleStatus('No file loaded');
      return;
    }

    let newValue = skinScaleValue.trim();
    if (!newValue) {
      newValue = '1.0';
    }

    const lines = editorContent.split('\n');
    let newLines: string[] = [];
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      newLines.push(line);
      
      // Look for skinMeshProperties line
      if (line.includes('skinMeshProperties:') && 
          line.includes('embed') && 
          line.includes('SkinMeshDataProperties')) {
        // Get indentation from next line or use default
        let indent = '        ';
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const match = nextLine.match(/^(\s*)/);
          if (match) {
            indent = match[1];
          }
        }
        
        // Insert skinScale line after skinMeshProperties
        newLines.push(`${indent}skinScale: f32 = ${newValue}`);
        found = true;
      }
    }

    if (found) {
      onContentChange(newLines.join('\n'));
      setSkinScaleStatus(`Added skinScale: ${newValue}`);
      setSkinScaleExists(true);
      
      const parsedValue = parseFloat(newValue);
      if (!isNaN(parsedValue)) {
        setOriginalSkinScale(parsedValue);
        setPercentageValue('100');
      }
    } else {
      setSkinScaleStatus('skinMeshProperties not found');
    }
  };

  // Add materialOverride structure
  const addMaterialOverride = () => {
    if (!editorContent) {
      setMaterialOverrideStatus('No file loaded');
      return;
    }

    const lines = editorContent.split('\n');
    let newLines: string[] = [];
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      newLines.push(line);
      
      // Look for skinMeshProperties line
      if (line.includes('skinMeshProperties:') && 
          line.includes('embed') && 
          line.includes('SkinMeshDataProperties')) {
        // Get indentation from next line or use default
        let indent = '        ';
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const match = nextLine.match(/^(\s*)/);
          if (match) {
            indent = match[1];
          }
        }
        
        // Insert materialOverride structure after skinMeshProperties
        newLines.push(`${indent}materialOverride: list[embed] = {`);
        newLines.push(`${indent}}`);
        found = true;
      }
    }

    if (found) {
      onContentChange(newLines.join('\n'));
      setMaterialOverrideStatus('materialOverride added');
      setMaterialOverrideExists(true);
    } else {
      setMaterialOverrideStatus('skinMeshProperties not found');
    }
  };

  // Add material override entry
  const addMaterialOverrideEntry = (path: string, submesh: string, entryType: 'texture' | 'material') => {
    if (!editorContent) {
      setMaterialOverrideStatus('No file loaded');
      return;
    }

    const lines = editorContent.split('\n');
    let newLines: string[] = [];
    let materialOverrideLineIndex = -1;
    
    // Find the materialOverride line
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('materialOverride:') && lines[i].includes('list[embed]')) {
        materialOverrideLineIndex = i;
        break;
      }
    }
    
    if (materialOverrideLineIndex === -1) {
      setMaterialOverrideStatus('materialOverride structure not found');
      return;
    }

    // Find the closing brace by tracking brace depth
    let braceDepth = 0;
    let insertLineIndex = -1;
    
    for (let j = materialOverrideLineIndex; j < lines.length; j++) {
      const currentLine = lines[j];
      for (const c of currentLine) {
        if (c === '{') braceDepth++;
        else if (c === '}') braceDepth--;
      }
      
      // When we get back to depth 0, we found the closing brace
      if (braceDepth === 0 && j > materialOverrideLineIndex) {
        insertLineIndex = j;
        break;
      }
    }
    
    if (insertLineIndex === -1) {
      setMaterialOverrideStatus('Could not find closing brace');
      return;
    }

    // Get indentation
    let indent = '            ';
    if (materialOverrideLineIndex + 1 < lines.length) {
      const nextLine = lines[materialOverrideLineIndex + 1];
      if (nextLine.trim()) {
        const match = nextLine.match(/^(\s*)/);
        if (match) {
          indent = match[1];
        }
      }
    }

    // Create the entry text
    const propertyType = entryType === 'texture' ? 'string' : 'link';
    const propertyName = entryType === 'texture' ? 'texture' : 'material';
    
    const entryLines = [
      `${indent}SkinMeshDataProperties_MaterialOverride {`,
      `${indent}    ${propertyName}: ${propertyType} = "${path}"`,
      `${indent}    Submesh: string = "${submesh}"`,
      `${indent}}`
    ];

    // Build new content
    for (let i = 0; i < lines.length; i++) {
      if (i === insertLineIndex) {
        // Insert entry before closing brace
        newLines.push(...entryLines);
      }
      newLines.push(lines[i]);
    }

    onContentChange(newLines.join('\n'));
    setMaterialOverrideStatus(`Added ${entryType} entry`);
  };

  // Open material dialog
  const openMaterialDialog = (type: 'texture' | 'material') => {
    setMaterialDialogType(type);
    setDefaultTexturePath(extractTexturePath());
    setShowMaterialDialog(true);
  };

  // Handle material dialog submit
  const handleMaterialDialogSubmit = (path: string, submesh: string) => {
    addMaterialOverrideEntry(path, submesh, materialDialogType);
    setShowMaterialDialog(false);
  };

  if (!isRendered) return null;

  return (
    <>
      <div className="general-edit-panel-wrapper">
        <div
          className={`general-edit-panel ${isVisible ? 'visible' : ''}`}
          style={{ right: panelRight }}
        >
          <div className="gep-left-bar" />
          <div className="gep-header">
            <span className="gep-title">General Editing</span>
            <button
              className="gep-close-btn"
              onClick={onClose}
              aria-label="Close (Escape)"
            >
            </button>
          </div>
          <div className="gep-divider" />
          
          {/* SkinScale Section */}
          <div className="gep-section">
            <div 
              className="gep-section-header"
              onClick={() => setSkinScaleCollapsed(!skinScaleCollapsed)}
            >
              <span className={`gep-collapse-icon ${skinScaleCollapsed ? 'collapsed' : ''}`} />
              <span className="gep-section-title">Skin Scale</span>
            </div>
            
            {!skinScaleCollapsed && (
              <div className="gep-section-content">
                <div className="gep-row">
                  <div className="gep-input-group">
                    <input
                      type="text"
                      className="gep-input gep-input-value"
                      value={skinScaleValue}
                      onChange={handleSkinScaleChange}
                      placeholder="1.0"
                      title="SkinScale value"
                    />
                  </div>
                  <div className="gep-input-group gep-percent-group">
                    <input
                      type="text"
                      className="gep-input gep-input-percent"
                      value={percentageValue}
                      onChange={handlePercentageChange}
                      placeholder="100"
                      title="Percentage of original value"
                    />
                    <span className="gep-percent-sign">%</span>
                  </div>
                  {skinScaleExists ? (
                    <button
                      className="gep-btn gep-btn-apply"
                      onClick={applySkinScale}
                      title="Apply skinScale value"
                    >
                      <span className="gep-icon-check" />
                    </button>
                  ) : (
                    <button
                      className="gep-btn gep-btn-add"
                      onClick={addSkinScale}
                      title="Add skinScale to file"
                    >
                      <span className="gep-icon-add" />
                    </button>
                  )}
                </div>
                {skinScaleStatus && (
                  <div className="gep-status">{skinScaleStatus}</div>
                )}
              </div>
            )}
          </div>

          <div className="gep-divider" />

          {/* Material Override Section */}
          <div className="gep-section">
            <div 
              className="gep-section-header"
              onClick={() => setMaterialOverrideCollapsed(!materialOverrideCollapsed)}
            >
              <span className={`gep-collapse-icon ${materialOverrideCollapsed ? 'collapsed' : ''}`} />
              <span className="gep-section-title">Material Override</span>
            </div>
            
            {!materialOverrideCollapsed && (
              <div className="gep-section-content">
                {!materialOverrideExists ? (
                  <div className="gep-row">
                    <button
                      className="gep-btn gep-btn-full"
                      onClick={addMaterialOverride}
                      title="Add materialOverride structure"
                    >
                      <span className="gep-icon-add" />
                      <span>Add materialOverride</span>
                    </button>
                  </div>
                ) : (
                  <div className="gep-row gep-row-buttons">
                    <button
                      className="gep-btn gep-btn-half"
                      onClick={() => openMaterialDialog('texture')}
                      title="Add texture override entry"
                    >
                      <span className="gep-icon-texture" />
                      <span>Texture</span>
                    </button>
                    <button
                      className="gep-btn gep-btn-half"
                      onClick={() => openMaterialDialog('material')}
                      title="Add material override entry"
                    >
                      <span className="gep-icon-material" />
                      <span>Material</span>
                    </button>
                  </div>
                )}
                {materialOverrideStatus && (
                  <div className="gep-status">{materialOverrideStatus}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showMaterialDialog && (
        <MaterialOverrideDialog
          type={materialDialogType}
          defaultPath={defaultTexturePath}
          onSubmit={handleMaterialDialogSubmit}
          onCancel={() => setShowMaterialDialog(false)}
        />
      )}
    </>
  );
}
