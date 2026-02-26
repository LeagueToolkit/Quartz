import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

export interface BinInfo {
  success: boolean;
  message: string;
  data?: string;
}

/**
 * Opens a file dialog and reads a .bin file, converting it to text format
 */
export async function openBinFile(): Promise<{ path: string; content: string } | null> {
  try {
    // Open file dialog
    const filePath = await open({
      filters: [
        {
          name: 'Binary Files',
          extensions: ['bin']
        },
        {
          name: 'All Files',
          extensions: ['*']
        }
      ],
      multiple: false,
    });

    if (!filePath) {
      return null;
    }

    const result = await invoke<BinInfo>('convert_bin_to_text', {
      inputPath: filePath,
    });

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to read bin file');
    }

    return {
      path: filePath as string,
      content: result.data
    };
  } catch (error) {
    console.error('Error opening bin file:', error);
    throw error;
  }
}

/**
 * Saves the current text content as a .bin file
 */
export async function saveBinFile(content: string, currentPath?: string): Promise<string | null> {
  try {
    let filePath: string | null;

    if (currentPath) {
      // Save to existing file
      filePath = currentPath;
    } else {
      // Show save dialog
      filePath = await save({
        filters: [
          {
            name: 'Binary Files',
            extensions: ['bin']
          }
        ],
        defaultPath: 'output.bin'
      });
    }

    if (!filePath) {
      return null;
    }

    // Convert text to bin using C# logic
    const result = await invoke<BinInfo>('convert_text_to_bin', {
      textContent: content,
      outputPath: filePath
    });

    if (!result.success) {
      throw new Error(result.message || 'Failed to save bin file');
    }

    return filePath;
  } catch (error) {
    console.error('Error saving bin file:', error);
    throw error;
  }
}

/**
 * Saves the current content to a new file (Save As)
 */
export async function saveBinFileAs(content: string): Promise<string | null> {
  return saveBinFile(content, undefined);
}

/**
 * Read a bin file directly (without file dialog)
 */
export async function readBinDirect(filePath: string): Promise<string> {
  try {
    const result = await invoke<BinInfo>('convert_bin_to_text', {
      inputPath: filePath,
    });

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to read bin file');
    }

    return result.data;
  } catch (error) {
    console.error('Error reading bin file:', error);
    throw error;
  }
}

/**
 * Write a bin file directly (without file dialog)
 */
export async function writeBinDirect(content: string, outputPath: string): Promise<void> {
  try {
    const result = await invoke<BinInfo>('convert_text_to_bin', {
      textContent: content,
      outputPath
    });

    if (!result.success) {
      throw new Error(result.message || 'Failed to write bin file');
    }
  } catch (error) {
    console.error('Error writing bin file:', error);
    throw error;
  }
}
