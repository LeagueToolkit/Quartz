import { useEffect } from 'react';

export function useBnkHotkeys({
    showAudioSplitter,
    onDeleteSelected,
    onPlaySelected,
    onUndo,
    onRedo,
}) {
    useEffect(() => {
        const onKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || showAudioSplitter) return;

            if (e.code === 'Delete' || e.code === 'Backspace') {
                onDeleteSelected();
            }
            if (e.code === 'Space') {
                e.preventDefault();
                onPlaySelected();
            }
            if (e.ctrlKey && e.code === 'KeyZ') {
                e.preventDefault();
                onUndo();
            }
            if (e.ctrlKey && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
                e.preventDefault();
                onRedo();
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showAudioSplitter, onDeleteSelected, onPlaySelected, onUndo, onRedo]);
}

