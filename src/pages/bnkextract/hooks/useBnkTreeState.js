import { useCallback } from 'react';

export function useBnkTreeState({
    pushToHistory,
    setTreeData,
    setSelectedNodes,
    setExpandedNodes,
    setParsedData,
    setRightTreeData,
    setRightSelectedNodes,
    setRightExpandedNodes,
    setStatusMessage,
    lastSelectedId,
    setLastSelectedId,
    filteredLeftTree,
    filteredRightTree,
    expandedNodes,
    rightExpandedNodes,
    treeData,
    rightTreeData,
}) {
    const handleClearPane = useCallback((pane) => {
        pushToHistory();
        if (pane === 'left') {
            setTreeData([]);
            setSelectedNodes(new Set());
            setExpandedNodes(new Set());
            setParsedData(null);
        } else {
            setRightTreeData([]);
            setRightSelectedNodes(new Set());
            setRightExpandedNodes(new Set());
        }
        setStatusMessage(`${pane.charAt(0).toUpperCase() + pane.slice(1)} pane cleared`);
    }, [
        pushToHistory,
        setTreeData,
        setSelectedNodes,
        setExpandedNodes,
        setParsedData,
        setRightTreeData,
        setRightSelectedNodes,
        setRightExpandedNodes,
        setStatusMessage,
    ]);

    const handleNodeSelect = useCallback((node, ctrlKey, shiftKey, pane = 'left') => {
        const setSelection = pane === 'left' ? setSelectedNodes : setRightSelectedNodes;
        const currentTree = pane === 'left' ? filteredLeftTree : filteredRightTree;
        const currentExpanded = pane === 'left' ? expandedNodes : rightExpandedNodes;
        const lastId = lastSelectedId.pane === pane ? lastSelectedId.id : null;

        const getVisibleNodes = () => {
            const visible = [];
            const collect = (nodes) => {
                for (const n of nodes) {
                    visible.push(n.id);
                    if (currentExpanded.has(n.id) && n.children) {
                        collect(n.children);
                    }
                }
            };
            collect(currentTree);
            return visible;
        };

        if (ctrlKey && !shiftKey) {
            setSelection((prev) => {
                const next = new Set(prev);
                if (next.has(node.id)) {
                    next.delete(node.id);
                } else {
                    next.add(node.id);
                }
                return next;
            });
            setLastSelectedId({ id: node.id, pane });
        } else if (shiftKey && lastId) {
            const visibleNodes = getVisibleNodes();
            const startIdx = visibleNodes.indexOf(lastId);
            const endIdx = visibleNodes.indexOf(node.id);

            if (startIdx !== -1 && endIdx !== -1) {
                const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
                const rangeIds = visibleNodes.slice(min, max + 1);

                if (ctrlKey) {
                    setSelection((prev) => new Set([...prev, ...rangeIds]));
                } else {
                    setSelection(new Set(rangeIds));
                }
            }
        } else {
            setSelection(new Set([node.id]));
            setLastSelectedId({ id: node.id, pane });
        }
    }, [
        setSelectedNodes,
        setRightSelectedNodes,
        filteredLeftTree,
        filteredRightTree,
        expandedNodes,
        rightExpandedNodes,
        lastSelectedId,
        setLastSelectedId,
    ]);

    const handleToggleExpand = useCallback((nodeId, recursive = false, pane = 'left') => {
        const setExpansion = pane === 'left' ? setExpandedNodes : setRightExpandedNodes;
        const currentTree = pane === 'left' ? treeData : rightTreeData;

        setExpansion((prev) => {
            const next = new Set(prev);
            const isExpanding = !next.has(nodeId);

            if (recursive) {
                const findNode = (nodes, id) => {
                    for (const n of nodes) {
                        if (n.id === id) return n;
                        if (n.children) {
                            const found = findNode(n.children, id);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                const targetNode = findNode(currentTree, nodeId);
                if (targetNode) {
                    const collectIds = (node, list) => {
                        if (node.children && node.children.length > 0) {
                            list.push(node.id);
                            node.children.forEach((child) => collectIds(child, list));
                        }
                    };
                    const idsToChange = [];
                    collectIds(targetNode, idsToChange);
                    idsToChange.forEach((id) => (isExpanding ? next.add(id) : next.delete(id)));
                }
            }

            if (isExpanding) next.add(nodeId);
            else next.delete(nodeId);
            return next;
        });
    }, [setExpandedNodes, setRightExpandedNodes, treeData, rightTreeData]);

    return {
        handleClearPane,
        handleNodeSelect,
        handleToggleExpand,
    };
}
