import type { ReferencedFile, ScannedEntry } from './types';

export function getResolvedEntryName(entryData: ScannedEntry | undefined): string {
    let entryName = entryData?.name || '';
    if (entryName.startsWith('Entry_') && Array.isArray(entryData?.referenced_files)) {
        const unhashedName = entryData!.referenced_files.find((file) =>
            !file.exists &&
            file.path &&
            !file.path.toLowerCase().endsWith('.tex'),
        );
        if (unhashedName?.path) {
            entryName = unhashedName.path;
        }
    }
    return entryName;
}

export interface GroupedFiles {
    entryName: string;
    missingFiles: Map<string, ReferencedFile[]>;
    existingFiles: ReferencedFile[];
}

export function groupReferencedFiles(entryData: ScannedEntry | undefined): GroupedFiles {
    const entryName = getResolvedEntryName(entryData);
    const referenced = Array.isArray(entryData?.referenced_files) ? entryData!.referenced_files : [];
    const filteredFiles = referenced.filter((file) => file.path && file.path !== entryName);

    const missingFiles = new Map<string, ReferencedFile[]>();
    const existingFiles: ReferencedFile[] = [];

    filteredFiles.forEach((file) => {
        if (!file.exists) {
            if (!missingFiles.has(file.path)) {
                missingFiles.set(file.path, []);
            }
            return;
        }

        const isTexture = file.path.toLowerCase().endsWith('.tex');
        if (!isTexture) {
            existingFiles.push(file);
            return;
        }

        let grouped = false;
        for (const [missingPath] of missingFiles) {
            const texturePathLower = file.path.toLowerCase();
            const missingPathLower = missingPath.toLowerCase();
            if (texturePathLower.includes(missingPathLower) || missingPathLower.includes(texturePathLower)) {
                missingFiles.get(missingPath)!.push(file);
                grouped = true;
                break;
            }
        }

        if (!grouped) {
            existingFiles.push(file);
        }
    });

    return { entryName, missingFiles, existingFiles };
}
