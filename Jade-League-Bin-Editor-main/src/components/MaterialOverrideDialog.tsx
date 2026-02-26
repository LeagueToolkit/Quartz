import { useState } from 'react';
import './MaterialOverrideDialog.css';

interface MaterialOverrideDialogProps {
  type: 'texture' | 'material';
  defaultPath: string;
  onSubmit: (path: string, submesh: string) => void;
  onCancel: () => void;
}

export default function MaterialOverrideDialog({
  type,
  defaultPath,
  onSubmit,
  onCancel
}: MaterialOverrideDialogProps) {
  const [path, setPath] = useState(defaultPath);
  const [submesh, setSubmesh] = useState('submesh');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const trimmedPath = path.trim();
    const trimmedSubmesh = submesh.trim();

    if (!trimmedPath) {
      setError('Path cannot be empty');
      return;
    }

    if (!trimmedSubmesh) {
      setError('Submesh cannot be empty');
      return;
    }

    onSubmit(trimmedPath, trimmedSubmesh);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const title = type === 'texture' ? 'Add Texture Entry' : 'Add Material Entry';
  const pathLabel = type === 'texture' ? 'Texture Path' : 'Material Path';

  return (
    <div className="mod-overlay" onClick={onCancel}>
      <div className="mod-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="mod-header">
          <span className="mod-title">{title}</span>
          <button 
            className="mod-close-btn" 
            onClick={onCancel}
            title="Cancel (Escape)"
          />
        </div>
        
        <div className="mod-content">
          <div className="mod-field">
            <label className="mod-label">{pathLabel}</label>
            <input
              type="text"
              className="mod-input mod-input-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="ASSETS/Characters/..."
              autoFocus
              title={path}
            />
          </div>
          
          <div className="mod-field">
            <label className="mod-label">Submesh</label>
            <input
              type="text"
              className="mod-input"
              value={submesh}
              onChange={(e) => setSubmesh(e.target.value)}
              placeholder="submesh"
            />
          </div>
        </div>

        {error && (
          <div className="mod-error">{error}</div>
        )}
        
        <div className="mod-actions">
          <button className="mod-btn mod-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="mod-btn mod-btn-accept" onClick={handleSubmit}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
