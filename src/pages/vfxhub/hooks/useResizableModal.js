import { useCallback, useEffect, useState } from 'react';

export default function useResizableModal(initialSize = { width: 1000, height: 700 }) {
  const [modalSize, setModalSize] = useState(initialSize);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);

  const handleMouseDown = useCallback((e, handle) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeHandle(handle);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isResizing) return;

    setModalSize(prev => {
      const newSize = { ...prev };
      const modalElement = document.querySelector('[data-modal="vfx-hub-collections"]');
      if (!modalElement) return prev;
      const rect = modalElement.getBoundingClientRect();

      if (resizeHandle === 'se') {
        newSize.width = Math.max(400, Math.min(1200, e.clientX - rect.left));
        newSize.height = Math.max(300, Math.min(800, e.clientY - rect.top));
      } else if (resizeHandle === 'e') {
        newSize.width = Math.max(400, Math.min(1200, e.clientX - rect.left));
      } else if (resizeHandle === 's') {
        newSize.height = Math.max(300, Math.min(800, e.clientY - rect.top));
      }

      return newSize;
    });
  }, [isResizing, resizeHandle]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    setResizeHandle(null);
  }, []);

  useEffect(() => {
    if (!isResizing) return undefined;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, isResizing]);

  return {
    modalSize,
    isResizing,
    handleMouseDown,
  };
}
