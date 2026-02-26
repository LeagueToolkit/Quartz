import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

export function useBnkSearch({
    treeData,
    rightTreeData,
    rightSortMode,
    expandedNodes,
    setExpandedNodes,
    rightExpandedNodes,
    setRightExpandedNodes,
}) {
    const [leftSearchQuery, setLeftSearchQuery] = useState('');
    const [rightSearchQuery, setRightSearchQuery] = useState('');
    const [leftSearchDebounced, setLeftSearchDebounced] = useState('');
    const [rightSearchDebounced, setRightSearchDebounced] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setLeftSearchDebounced(leftSearchQuery), 350);
        return () => clearTimeout(timer);
    }, [leftSearchQuery]);

    useEffect(() => {
        const timer = setTimeout(() => setRightSearchDebounced(rightSearchQuery), 300);
        return () => clearTimeout(timer);
    }, [rightSearchQuery]);

    const filterTree = useCallback((nodes, query) => {
        if (!query) return nodes;
        const lowerQuery = query.toLowerCase();

        return nodes.map((node) => {
            const nodeMatch = node.name.toLowerCase().includes(lowerQuery);
            if (nodeMatch) {
                return node;
            }

            if (node.children) {
                const filteredChildren = filterTree(node.children, query);
                if (filteredChildren.length > 0) {
                    return { ...node, children: filteredChildren };
                }
            }

            return null;
        }).filter(Boolean);
    }, []);

    const filteredLeftTree = useMemo(
        () => filterTree(treeData, leftSearchDebounced),
        [treeData, leftSearchDebounced, filterTree],
    );

    const filteredRightTree = useMemo(() => {
        let data = [...rightTreeData];

        if (rightSortMode !== 'none') {
            const sortNodes = (nodes) => {
                return [...nodes].map((node) => {
                    if (node.children && node.children.length > 0) {
                        return { ...node, children: sortNodes(node.children) };
                    }
                    return node;
                }).sort((a, b) => {
                    const sizeA = a.audioData?.length || 0;
                    const sizeB = b.audioData?.length || 0;
                    if (rightSortMode === 'size-asc') return sizeA - sizeB;
                    if (rightSortMode === 'size-desc') return sizeB - sizeA;
                    return 0;
                });
            };
            data = sortNodes(data);
        }

        return filterTree(data, rightSearchDebounced);
    }, [rightTreeData, rightSearchDebounced, rightSortMode, filterTree]);

    const leftPreSearchExpansion = useRef(null);
    useEffect(() => {
        if (leftSearchDebounced) {
            if (leftPreSearchExpansion.current === null) {
                leftPreSearchExpansion.current = new Set(expandedNodes);
            }

            const expandMatches = (nodes, expansionSet, query) => {
                const lowerQuery = query.toLowerCase();
                const traverse = (list) => {
                    list.forEach((node) => {
                        if (node.children && node.children.length > 0) {
                            const hasDescendantMatch = (n) => {
                                if (n.name.toLowerCase().includes(lowerQuery)) return true;
                                if (n.children) return n.children.some(hasDescendantMatch);
                                return false;
                            };

                            if (hasDescendantMatch(node)) {
                                expansionSet.add(node.id);
                                traverse(node.children);
                            }
                        }
                    });
                };
                traverse(nodes);
            };

            const nextLeft = new Set(expandedNodes);
            expandMatches(treeData, nextLeft, leftSearchDebounced);
            setExpandedNodes(nextLeft);
        } else if (leftPreSearchExpansion.current !== null) {
            setExpandedNodes(leftPreSearchExpansion.current);
            leftPreSearchExpansion.current = null;
        }
    }, [leftSearchDebounced, treeData, expandedNodes, setExpandedNodes]);

    const rightPreSearchExpansion = useRef(null);
    useEffect(() => {
        if (rightSearchDebounced) {
            if (rightPreSearchExpansion.current === null) {
                rightPreSearchExpansion.current = new Set(rightExpandedNodes);
            }

            const expandMatches = (nodes, expansionSet, query) => {
                const lowerQuery = query.toLowerCase();
                const traverse = (list) => {
                    list.forEach((node) => {
                        if (node.children && node.children.length > 0) {
                            const hasDescendantMatch = (n) => {
                                if (n.name.toLowerCase().includes(lowerQuery)) return true;
                                if (n.children) return n.children.some(hasDescendantMatch);
                                return false;
                            };

                            if (hasDescendantMatch(node)) {
                                expansionSet.add(node.id);
                                traverse(node.children);
                            }
                        }
                    });
                };
                traverse(nodes);
            };

            const nextRight = new Set(rightExpandedNodes);
            expandMatches(rightTreeData, nextRight, rightSearchDebounced);
            setRightExpandedNodes(nextRight);
        } else if (rightPreSearchExpansion.current !== null) {
            setRightExpandedNodes(rightPreSearchExpansion.current);
            rightPreSearchExpansion.current = null;
        }
    }, [rightSearchDebounced, rightTreeData, rightExpandedNodes, setRightExpandedNodes]);

    return {
        leftSearchQuery,
        setLeftSearchQuery,
        rightSearchQuery,
        setRightSearchQuery,
        filteredLeftTree,
        filteredRightTree,
        leftSearchDebounced,
        rightSearchDebounced,
    };
}
