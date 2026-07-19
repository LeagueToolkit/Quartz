import type { WadExplorerEntry } from '@/lib/api/wad';
import type { WadDirectoryNode, WadFileNode, WadNode } from './types';

function fileName(path: string): string {
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts[parts.length - 1] || path;
}

export function extensionOf(path: string): string {
    const name = fileName(path);
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function buildWadTree(entries: WadExplorerEntry[]): WadNode[] {
    interface MutableDir extends WadDirectoryNode { children: WadNode[] }
    const root: MutableDir = { kind: 'directory', name: '', path: '', children: [] };
    const dirs = new Map<string, MutableDir>([['', root]]);

    for (const entry of entries) {
        const normalized = entry.path.replace(/\\/g, '/').replace(/^\/+/, '');
        const parts = normalized.split('/').filter(Boolean);
        if (parts.length === 0) continue;
        let parent = root;
        for (let i = 0; i < parts.length - 1; i++) {
            const path = parts.slice(0, i + 1).join('/');
            let dir = dirs.get(path);
            if (!dir) {
                dir = { kind: 'directory', name: parts[i], path, children: [] };
                dirs.set(path, dir);
                parent.children.push(dir);
            }
            parent = dir;
        }
        const node: WadFileNode = {
            ...entry,
            kind: 'file',
            path: normalized,
            name: parts[parts.length - 1] || normalized,
            extension: extensionOf(normalized),
        };
        parent.children.push(node);
    }

    const sort = (nodes: WadNode[]) => {
        nodes.sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });
        for (const node of nodes) if (node.kind === 'directory') sort(node.children);
    };
    sort(root.children);
    return root.children;
}

export function buildIndexTree(paths: string[]): WadNode[] {
    return buildWadTree(paths.map((path) => ({
        path,
        pathHash: '',
        size: 0,
        compressedSize: 0,
        type: 'Unknown',
        unknown: /^[0-9a-f]{16}$/i.test(path),
    })));
}

export function filterTree(nodes: WadNode[], query: string): WadNode[] {
    if (!query) return nodes;
    let match: (value: string) => boolean;
    try {
        const expression = new RegExp(query, 'i');
        match = (value) => expression.test(value);
    } catch {
        const lower = query.toLowerCase();
        match = (value) => value.toLowerCase().includes(lower);
    }
    const visit = (items: WadNode[]): WadNode[] => {
        const output: WadNode[] = [];
        for (const node of items) {
            if (node.kind === 'file') {
                if (match(node.path)) output.push(node);
                continue;
            }
            const children = visit(node.children);
            if (match(node.path) || children.length) output.push({ ...node, children });
        }
        return output;
    };
    return visit(nodes);
}

export function flattenFiles(nodes: WadNode[], output: WadFileNode[] = []): WadFileNode[] {
    for (const node of nodes) {
        if (node.kind === 'file') output.push(node);
        else flattenFiles(node.children, output);
    }
    return output;
}

export function findNode(nodes: WadNode[], path: string): WadNode | null {
    for (const node of nodes) {
        if (node.path === path) return node;
        if (node.kind === 'directory') {
            const found = findNode(node.children, path);
            if (found) return found;
        }
    }
    return null;
}

export function collectFiles(node: WadNode): WadFileNode[] {
    return node.kind === 'file' ? [node] : flattenFiles(node.children, []);
}

export function formatBytes(bytes: number): string {
    if (!bytes) return '—';
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

export function wadDisplayName(name: string): string {
    return name.replace(/\.wad\.client$/i, '').replace(/\.wad$/i, '');
}
