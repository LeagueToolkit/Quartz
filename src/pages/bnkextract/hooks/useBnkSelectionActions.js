import { useCallback } from 'react';

export function useBnkSelectionActions({
    activePane,
    treeData,
    rightTreeData,
    selectedNodes,
    rightSelectedNodes,
    playAudio,
    pushToHistory,
    setTreeData,
    setRightTreeData,
    setSelectedNodes,
    setRightSelectedNodes,
    setStatusMessage,
    contextMenu,
    setContextMenu,
}) {
    const handlePlaySelected = useCallback(() => {
        const targetTree = activePane === 'left' ? treeData : rightTreeData;
        const targetSelection = activePane === 'left' ? selectedNodes : rightSelectedNodes;

        const allNodes = [];
        const collectNodes = (nodes) => {
            for (const node of nodes) {
                allNodes.push(node);
                if (node.children) collectNodes(node.children);
            }
        };
        collectNodes(targetTree);

        const selectedNode = allNodes.find((n) => targetSelection.has(n.id) && n.audioData);
        if (selectedNode) {
            playAudio(selectedNode);
        }
    }, [activePane, treeData, rightTreeData, selectedNodes, rightSelectedNodes, playAudio]);

    const handleContextMenu = useCallback((e, node, pane = 'left') => {
        e.preventDefault();
        setContextMenu({
            mouseX: e.clientX,
            mouseY: e.clientY,
            node,
            pane,
        });
    }, [setContextMenu]);

    const handleCloseContextMenu = useCallback(() => {
        setContextMenu(null);
    }, [setContextMenu]);

    const handleDeleteNode = useCallback(() => {
        if (!contextMenu?.node) return;
        pushToHistory();
        const id = contextMenu.node.id;
        const pane = contextMenu.pane;
        const setTreeFn = pane === 'left' ? setTreeData : setRightTreeData;
        const setSelectionFn = pane === 'left' ? setSelectedNodes : setRightSelectedNodes;

        setTreeFn((prev) => {
            const removeFromList = (list) => list
                .filter((node) => node.id !== id)
                .map((node) => ({
                    ...node,
                    children: node.children ? removeFromList(node.children) : node.children,
                }));
            return removeFromList(prev);
        });

        setSelectionFn((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });

        setStatusMessage(`Removed ${contextMenu.node.name} from tree`);
        handleCloseContextMenu();
    }, [
        contextMenu,
        pushToHistory,
        setTreeData,
        setRightTreeData,
        setSelectedNodes,
        setRightSelectedNodes,
        setStatusMessage,
        handleCloseContextMenu,
    ]);

    const handleDeleteSelected = useCallback(() => {
        const pane = activePane;
        const selected = pane === 'left' ? selectedNodes : rightSelectedNodes;
        if (selected.size === 0) return;

        pushToHistory();
        const setTreeFn = pane === 'left' ? setTreeData : setRightTreeData;
        const setSelectionFn = pane === 'left' ? setSelectedNodes : setRightSelectedNodes;

        setTreeFn((prev) => {
            const removeFromList = (list) => list
                .filter((node) => !selected.has(node.id))
                .map((node) => ({
                    ...node,
                    children: node.children ? removeFromList(node.children) : node.children,
                }));
            return removeFromList(prev);
        });

        setSelectionFn(new Set());
        setStatusMessage(`Successfully removed ${selected.size} node(s) from tree`);
    }, [
        activePane,
        selectedNodes,
        rightSelectedNodes,
        pushToHistory,
        setTreeData,
        setRightTreeData,
        setSelectedNodes,
        setRightSelectedNodes,
        setStatusMessage,
    ]);

    const handleCopyName = useCallback(() => {
        if (contextMenu?.node) {
            navigator.clipboard.writeText(contextMenu.node.name);
            setStatusMessage('Copied to clipboard');
        }
        handleCloseContextMenu();
    }, [contextMenu, setStatusMessage, handleCloseContextMenu]);

    const hasAudioSelection = useCallback(() => {
        const checkNodes = (nodes, selSet, isParentSelected = false) => {
            for (const node of nodes) {
                const nodeSelected = selSet.has(node.id) || isParentSelected;
                if (nodeSelected && node.audioData) return true;
                if (node.children && checkNodes(node.children, selSet, nodeSelected)) return true;
            }
            return false;
        };
        return checkNodes(treeData, selectedNodes) || checkNodes(rightTreeData, rightSelectedNodes);
    }, [treeData, rightTreeData, selectedNodes, rightSelectedNodes]);

    const hasRootSelection = useCallback(() => {
        return treeData.some((n) => selectedNodes.has(n.id)) || rightTreeData.some((n) => rightSelectedNodes.has(n.id));
    }, [treeData, rightTreeData, selectedNodes, rightSelectedNodes]);

    return {
        handlePlaySelected,
        handleContextMenu,
        handleCloseContextMenu,
        handleDeleteNode,
        handleDeleteSelected,
        handleCopyName,
        hasAudioSelection,
        hasRootSelection,
    };
}
