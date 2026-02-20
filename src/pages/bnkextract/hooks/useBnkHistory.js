import { useState, useCallback } from 'react';

export function useBnkHistory({
    treeData,
    rightTreeData,
    setTreeData,
    setRightTreeData,
    setStatusMessage,
}) {
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    const HISTORY_MAX_ENTRIES = 12;
    const HISTORY_MAX_BYTES = 256 * 1024 * 1024; // 256 MB cap across undo stack

    const estimateTreeAudioBytes = useCallback((roots) => {
        const seen = new WeakSet();
        let total = 0;

        const walk = (nodes) => {
            if (!nodes) return;
            for (const node of nodes) {
                const data = node?.audioData?.data;
                if (data && typeof data.byteLength === 'number' && !seen.has(data)) {
                    seen.add(data);
                    total += data.byteLength;
                }
                if (node?.children?.length) {
                    walk(node.children);
                }
            }
        };

        walk(roots);
        return total;
    }, []);

    const estimateSnapshotBytes = useCallback((leftTree, rightTree) => {
        return estimateTreeAudioBytes(leftTree) + estimateTreeAudioBytes(rightTree);
    }, [estimateTreeAudioBytes]);

    const trimHistoryByBudget = useCallback((entries) => {
        let next = [...entries];
        while (next.length > HISTORY_MAX_ENTRIES) {
            next.shift();
        }

        let totalBytes = next.reduce((acc, entry) => acc + (entry?.bytes || 0), 0);
        while (next.length > 1 && totalBytes > HISTORY_MAX_BYTES) {
            const removed = next.shift();
            totalBytes -= removed?.bytes || 0;
        }
        return next;
    }, []);

    const pushToHistory = useCallback(() => {
        const snapshotBytes = estimateSnapshotBytes(treeData, rightTreeData);
        setUndoStack((prev) => {
            const next = [...prev, { left: treeData, right: rightTreeData, bytes: snapshotBytes }];
            return trimHistoryByBudget(next);
        });
        setRedoStack([]);
    }, [treeData, rightTreeData, estimateSnapshotBytes, trimHistoryByBudget]);

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return;
        const last = undoStack[undoStack.length - 1];
        const currentBytes = estimateSnapshotBytes(treeData, rightTreeData);
        setRedoStack((prev) => {
            const next = [...prev, { left: treeData, right: rightTreeData, bytes: currentBytes }];
            return next.slice(-HISTORY_MAX_ENTRIES);
        });
        setTreeData(last.left);
        setRightTreeData(last.right);
        setUndoStack((prev) => prev.slice(0, -1));
        setStatusMessage('Undo performed');
    }, [undoStack, treeData, rightTreeData, estimateSnapshotBytes, setTreeData, setRightTreeData, setStatusMessage]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0) return;
        const last = redoStack[redoStack.length - 1];
        const currentBytes = estimateSnapshotBytes(treeData, rightTreeData);
        setUndoStack((prev) => {
            const next = [...prev, { left: treeData, right: rightTreeData, bytes: currentBytes }];
            return trimHistoryByBudget(next);
        });
        setTreeData(last.left);
        setRightTreeData(last.right);
        setRedoStack((prev) => prev.slice(0, -1).slice(-HISTORY_MAX_ENTRIES));
        setStatusMessage('Redo performed');
    }, [redoStack, treeData, rightTreeData, estimateSnapshotBytes, trimHistoryByBudget, setTreeData, setRightTreeData, setStatusMessage]);

    return {
        undoStack,
        redoStack,
        pushToHistory,
        handleUndo,
        handleRedo,
    };
}

