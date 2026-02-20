import { useState, useCallback } from 'react';

/**
 * useVfxHistory — simple undo system for VFX porting.
 * @param {Object} state To capture in history (targetSystems, targetPyContent, etc)
 */
export default function useVfxHistory(options = {}) {
    const maxHistory = typeof options.maxHistory === 'number' ? options.maxHistory : 10;
    const [undoHistory, setUndoHistory] = useState([]);

    /**
     * Save current state to undo history
     * @param {string} actionDescription Description of the action for the UI
     * @param {Object} stateToSave The state to capture (optional, usually provided by the master hook)
     */
    const saveStateToHistory = useCallback((actionDescription, stateToSave) => {
        const currentState = {
            ...stateToSave,
            timestamp: Date.now(),
            action: actionDescription
        };

        setUndoHistory(prev => {
            const newHistory = [...prev, currentState];
            return newHistory.slice(-maxHistory);
        });
    }, [maxHistory]);

    /**
     * Restore state from history
     * @param {Function} restoreCallback Function to update the master state
     * @returns {Object|null} The popped state or null
     */
    const handleUndo = useCallback((restoreCallback) => {
        if (undoHistory.length === 0) {
            return null;
        }

        // Get the last state from undo history
        const lastState = undoHistory[undoHistory.length - 1];

        // Pop the history
        setUndoHistory(prev => prev.slice(0, -1));

        if (restoreCallback) {
            restoreCallback(lastState);
        }

        return lastState;
    }, [undoHistory]);

    return {
        undoHistory,
        setUndoHistory,
        saveStateToHistory,
        handleUndo
    };
}
