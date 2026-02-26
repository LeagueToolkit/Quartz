import { invoke } from '@tauri-apps/api/core';

/**
 * Parses linked bin file paths from bin file content.
 * Returns only the filenames (e.g., "AurelionSol.bin"), not full paths.
 */
export function parseLinkedFiles(content: string): string[] {
    const linkedFiles: string[] = [];
    
    try {
        // Find the linked: list[string] = { ... } section
        // Pattern: linked: list[string] = { followed by quoted paths until closing }
        const linkedSectionPattern = /linked:\s*list\[string\]\s*=\s*\{([^}]*)\}/s;
        const match = content.match(linkedSectionPattern);
        
        if (match) {
            const linkedContent = match[1];
            
            // Extract all quoted paths (paths like "DATA/Characters/..." or just filenames)
            const pathPattern = /"([^"]+\.bin)"/gi;
            let pathMatch;
            
            while ((pathMatch = pathPattern.exec(linkedContent)) !== null) {
                const fullPath = pathMatch[1];
                
                // Extract just the filename from the path
                const fileName = fullPath.split('/').pop() || fullPath.split('\\').pop() || fullPath;
                
                if (fileName && !linkedFiles.includes(fileName)) {
                    linkedFiles.push(fileName);
                }
            }
            
            console.log(`[LinkedBinParser] Found ${linkedFiles.length} linked bin files`);
        }
    } catch (ex) {
        console.error("LinkedBinParser: Failed to parse linked files", ex);
    }
    
    return linkedFiles;
}

export interface LinkedBinResult {
    path: string;
    content: string;
}

interface BatchConvertResult {
    path: string;
    success: boolean;
    content: string | null;
    error: string | null;
}

/**
 * Searches for and opens linked bin files from the given content.
 * Uses batch conversion for efficiency - loads hashes once for all files.
 */
export async function findAndOpenLinkedBins(
    mainFilePath: string,
    content: string,
    recursive: boolean = false,
    onFileOpened?: (result: LinkedBinResult) => void
): Promise<LinkedBinResult[]> {
    const results: LinkedBinResult[] = [];
    const openedPaths = new Set<string>();
    
    // Add the main file to prevent re-opening
    openedPaths.add(mainFilePath.toLowerCase());
    
    // Get base directory from main file path
    const basePath = mainFilePath.substring(0, mainFilePath.lastIndexOf('\\')) || 
                     mainFilePath.substring(0, mainFilePath.lastIndexOf('/'));
    
    if (!basePath) {
        return results;
    }
    
    // Phase 1: Collect all linked file paths (without converting yet)
    const pathsToConvert: string[] = [];
    const contentQueue: Array<{ content: string; basePath: string; depth: number }> = [
        { content, basePath, depth: 0 }
    ];
    
    // BFS to collect all paths first
    while (contentQueue.length > 0) {
        const { content: currentContent, basePath: currentBasePath, depth } = contentQueue.shift()!;
        
        if (depth > 3) continue; // Max recursion depth
        
        const linkedFiles = parseLinkedFiles(currentContent);
        
        for (const linkedFileName of linkedFiles) {
            try {
                // Find the file path
                const foundPath = await invoke<string | null>('find_linked_bin_file', {
                    baseDirectory: currentBasePath,
                    fileName: linkedFileName
                });
                
                if (foundPath && !openedPaths.has(foundPath.toLowerCase())) {
                    openedPaths.add(foundPath.toLowerCase());
                    pathsToConvert.push(foundPath);
                }
            } catch (e) {
                console.error(`Failed to find linked file ${linkedFileName}:`, e);
            }
        }
    }
    
    if (pathsToConvert.length === 0) {
        return results;
    }
    
    console.log(`[LinkedBinParser] Batch converting ${pathsToConvert.length} linked files`);
    
    // Phase 2: Batch convert all files at once (hashes loaded once)
    try {
        const batchResults = await invoke<BatchConvertResult[]>('batch_convert_bins', {
            inputPaths: pathsToConvert
        });
        
        // Phase 3: Process results and handle recursion
        for (const result of batchResults) {
            if (result.success && result.content) {
                const linkedResult = { path: result.path, content: result.content };
                results.push(linkedResult);
                
                if (onFileOpened) {
                    onFileOpened(linkedResult);
                }
                
                // If recursive, add this content to queue for more linked files
                if (recursive) {
                    const linkedBasePath = result.path.substring(0, result.path.lastIndexOf('\\')) || 
                                           result.path.substring(0, result.path.lastIndexOf('/'));
                    
                    // Parse additional linked files from this content
                    const moreLinkedFiles = parseLinkedFiles(result.content);
                    
                    for (const moreFileName of moreLinkedFiles) {
                        try {
                            const morePath = await invoke<string | null>('find_linked_bin_file', {
                                baseDirectory: linkedBasePath,
                                fileName: moreFileName
                            });
                            
                            if (morePath && !openedPaths.has(morePath.toLowerCase())) {
                                openedPaths.add(morePath.toLowerCase());
                                
                                // Convert this single file
                                const singleBatch = await invoke<BatchConvertResult[]>('batch_convert_bins', {
                                    inputPaths: [morePath]
                                });
                                
                                if (singleBatch[0]?.success && singleBatch[0]?.content) {
                                    const moreResult = { path: morePath, content: singleBatch[0].content };
                                    results.push(moreResult);
                                    if (onFileOpened) {
                                        onFileOpened(moreResult);
                                    }
                                }
                            }
                        } catch (e) {
                            console.error(`Failed to open recursive linked file ${moreFileName}:`, e);
                        }
                    }
                }
            } else {
                console.error(`Failed to convert ${result.path}: ${result.error}`);
            }
        }
    } catch (e) {
        console.error('Batch conversion failed:', e);
    }
    
    return results;
}
