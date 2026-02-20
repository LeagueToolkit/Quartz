import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UnsavedChangesModal from '../modals/UnsavedChangesModal';
import RitobinWarningModal from '../modals/RitobinWarningModal';
import RitoBinErrorDialog from '../modals/RitoBinErrorDialog';
import { ASSET_PREVIEW_EVENT } from '../../utils/assets/assetPreviewEvent';

const AppModalWheel = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [showRitoWarning, setShowRitoWarning] = useState(false);
  const [showRitoWarningHashed, setShowRitoWarningHashed] = useState(false);
  const [showRitoError, setShowRitoError] = useState(false);

  const baseBtn = {
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(12, 14, 20, 0.9)',
    color: '#ffffff',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    transition: 'all 0.18s ease',
  };

  const openHashReminderPreview = () => {
    window.dispatchEvent(new CustomEvent('hashReminder:debug-open'));
  };

  const openAssetPreview = () => {
    window.dispatchEvent(new CustomEvent(ASSET_PREVIEW_EVENT, { detail: { mode: 'browser' } }));
  };

  return (
    <>
      <div
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        style={{
          position: 'fixed',
          right: 18,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 5000,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            opacity: expanded ? 1 : 0,
            pointerEvents: expanded ? 'auto' : 'none',
            transform: expanded ? 'translateX(0)' : 'translateX(10px)',
            transition: 'all 0.2s ease',
          }}
        >
          <button onClick={() => setShowUnsaved(true)} style={baseBtn}>Unsaved</button>
          <button onClick={() => setShowRitoWarning(true)} style={baseBtn}>Ritobin Warning</button>
          <button onClick={() => setShowRitoWarningHashed(true)} style={baseBtn}>Ritobin Hashed</button>
          <button onClick={() => setShowRitoError(true)} style={baseBtn}>Ritobin Error</button>
          <button onClick={openHashReminderPreview} style={baseBtn}>Hash Reminder</button>
          <button onClick={openAssetPreview} style={baseBtn}>Asset Explorer</button>
        </div>

        <button
          aria-label="Open modal wheel"
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '1px solid rgba(196,181,253,0.52)',
            background: 'linear-gradient(135deg, rgba(124,58,237,0.85), rgba(139,92,246,0.75))',
            color: '#ffffff',
            fontSize: 16,
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 10px 22px rgba(0,0,0,0.42), 0 0 16px rgba(139,92,246,0.42)',
            transition: 'transform 0.18s ease, box-shadow 0.2s ease',
            transform: expanded ? 'scale(1.08)' : 'scale(1)',
          }}
        >
          MOD
        </button>
      </div>

      <UnsavedChangesModal
        open={showUnsaved}
        onCancel={() => setShowUnsaved(false)}
        onSave={() => setShowUnsaved(false)}
        onDiscard={() => setShowUnsaved(false)}
        fileName="Preview.bin"
      />

      <RitobinWarningModal
        open={showRitoWarning}
        onClose={() => setShowRitoWarning(false)}
        navigate={navigate}
        isHashedContent={false}
      />

      <RitobinWarningModal
        open={showRitoWarningHashed}
        onClose={() => setShowRitoWarningHashed(false)}
        navigate={navigate}
        isHashedContent
        onContinueAnyway={() => {}}
      />

      <RitoBinErrorDialog
        open={showRitoError}
        onClose={() => setShowRitoError(false)}
        onRestoreBackup={() => setShowRitoError(false)}
      />
    </>
  );
};

export default AppModalWheel;
