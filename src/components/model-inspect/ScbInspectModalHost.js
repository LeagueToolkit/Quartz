import React, { useEffect, useState } from 'react';
import ScbInspectModal from './ScbInspectModal.js';

export const OPEN_SCB_INSPECT_EVENT = 'open-scb-inspect-modal';

export default function ScbInspectModalHost() {
  const [open, setOpen] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [texturePath, setTexturePath] = useState('');

  useEffect(() => {
    const onOpen = (event) => {
      const detail = event?.detail || {};
      const targetPath = detail.path || '';
      if (!targetPath) return;
      setFilePath(targetPath);
      setTexturePath(detail.texturePath || '');
      setOpen(true);
    };

    window.addEventListener(OPEN_SCB_INSPECT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SCB_INSPECT_EVENT, onOpen);
  }, []);

  return (
    <ScbInspectModal
      open={open}
      filePath={filePath}
      texturePath={texturePath}
      onClose={() => setOpen(false)}
    />
  );
}

