import { Folder, FileText, Music, Image, Box, Layers, File, Code, Terminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Map a filesystem entry to a lucide icon + accent color. Palette matches the
 *  WAD explorer tree so file types read consistently across the app. */
export function iconFor(entry: { isDirectory: boolean; extension: string }): { Icon: LucideIcon; color: string } {
    if (entry.isDirectory) return { Icon: Folder, color: '#fbbf24' };
    switch (entry.extension) {
        case 'ogg': case 'wav': case 'mp3': case 'wem':
            return { Icon: Music, color: '#f59e0b' };
        case 'png': case 'jpg': case 'jpeg': case 'webp': case 'gif':
            return { Icon: Image, color: '#f472b6' };
        case 'dds': case 'tex': case 'tga':
            return { Icon: Image, color: '#06b6d4' };
        case 'skn': case 'skl': case 'scb': case 'sco': case 'scw':
            return { Icon: Box, color: '#8b5cf6' };
        case 'anm':
            return { Icon: Layers, color: '#10b981' };
        case 'bin': case 'inibin':
            return { Icon: File, color: '#3b82f6' };
        case 'py': case 'js': case 'ts': case 'json':
            return { Icon: Code, color: '#60a5fa' };
        case 'txt': case 'md':
            return { Icon: FileText, color: '#94a3b8' };
        case 'exe': case 'dll': case 'bat': case 'cmd':
            return { Icon: Terminal, color: '#a78bfa' };
        default:
            return { Icon: File, color: '#64748b' };
    }
}
