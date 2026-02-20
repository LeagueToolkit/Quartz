/**
 * Flint - Utility Functions
 */

// =============================================================================
// Formatting Utilities
// =============================================================================

/**
 * Format bytes to human readable size
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format a number with locale separators
 */
export function formatNumber(num: number | null | undefined): string {
    if (num == null || isNaN(num)) return '0';
    return num.toLocaleString();
}

/**
 * Format relative time (e.g., "2 days ago")
 */
export function formatRelativeTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diff = now.getTime() - d.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
}

/**
 * Truncate path for display, keeping filename visible
 */
export function truncatePath(path: string, maxLength = 40): string {
    if (path.length <= maxLength) return path;

    const parts = path.split(/[/\\]/);
    const filename = parts.pop() || '';

    if (filename.length >= maxLength - 3) {
        return '...' + filename.slice(-(maxLength - 3));
    }

    const remaining = maxLength - filename.length - 4; // 4 for "/..."
    const prefix = parts.slice(0, 2).join('/');

    if (prefix.length <= remaining) {
        return prefix + '/.../' + filename;
    }

    return '.../' + filename;
}

// =============================================================================
// Async Utilities
// =============================================================================

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout>;
    return function (this: unknown, ...args: Parameters<T>) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), wait);
    };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
    fn: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle = false;
    return function (this: unknown, ...args: Parameters<T>) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * Sleep for a number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// File Icons
// =============================================================================

// Hoisted to module level — allocated once, never recreated per call
const FILE_ICON_MAP: Record<string, string> = {
    // Documents
    'md': '📄',
    'txt': '📄',
    'pdf': '📕',

    // Code files
    'js': '📜',
    'jsx': '⚛',
    'ts': '📘',
    'tsx': '⚛',
    'json': '{}',
    'html': '🌐',
    'css': '🎨',
    'scss': '🎨',

    // Images
    'png': '🖼',
    'jpg': '🖼',
    'jpeg': '🖼',
    'gif': '🖼',
    'svg': '🎨',
    'dds': '🖼',
    'tga': '🖼',
    'tex': '🖼',

    // League of Legends specific
    'bin': '⚙',
    'skn': '👤',
    'skl': '🦴',
    'anm': '🎬',
    'scb': '🎮',
    'sco': '🎮',
    'wad': '📦',

    // Config
    'ini': '⚙',
    'cfg': '⚙',
    'config': '⚙',
    'gitignore': '🚫',

    // Other
    'zip': '📦',
    'rar': '📦',
    '7z': '📦',
};

/**
 * Get file icon based on extension
 */
export function getFileIcon(name: string, isFolder: boolean, isExpanded = false): string {
    if (isFolder) {
        return isExpanded ? '📂' : '📁';
    }

    const ext = name.split('.').pop()?.toLowerCase();
    return FILE_ICON_MAP[ext || ''] || '📄';
}

// =============================================================================
// Keyboard Shortcuts
// =============================================================================

type ShortcutHandler = (e: KeyboardEvent) => void;
const shortcuts = new Map<string, ShortcutHandler>();

/**
 * Register a keyboard shortcut
 */
export function registerShortcut(key: string, handler: ShortcutHandler): () => void {
    shortcuts.set(key.toLowerCase(), handler);
    return () => shortcuts.delete(key.toLowerCase());
}

/**
 * Initialize keyboard shortcut listener
 */
export function initShortcuts(): void {
    document.addEventListener('keydown', (e) => {
        if (!e.key) return;

        const parts: string[] = [];
        if (e.ctrlKey || e.metaKey) parts.push('ctrl');
        if (e.shiftKey) parts.push('shift');
        if (e.altKey) parts.push('alt');
        parts.push(e.key.toLowerCase());

        const combo = parts.join('+');
        const handler = shortcuts.get(combo);

        if (handler) {
            e.preventDefault();
            handler(e);
        }
    });
}
