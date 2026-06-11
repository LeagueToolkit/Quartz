/* Thin async stubs for the BNK/WPK parse + WEM decode/encode backend.

   TODO(backend): none of the Rust commands behind these exist yet. Each stub
   keeps the UI responsive (resolves/rejects without blocking) so every tree,
   selection, drag, splitter and playback interaction works end to end. Wire
   these to real invoke() wrappers once the soundbanks commands land. */

import { open, save } from '@tauri-apps/plugin-dialog';
import { log } from '@/lib/util/logger';
import type { AudioData, BnkNode, ExtractFormat } from '../types';

export interface LoadBanksArgs {
    bnkPath: string;
    wpkPath: string;
    binPath: string;
}

export interface LoadBanksResult {
    tree: BnkNode;
    audioFiles: AudioData[];
    fileCount: number;
    type: string;
}

/* Parse a BIN/WPK/BNK triple into a single root tree. */
export async function loadBanks(_args: LoadBanksArgs): Promise<LoadBanksResult | null> {
    // TODO(backend): invoke('bnk_load_banks', args)
    throw new Error('BNK parsing not wired yet');
}

/* Decode raw WEM bytes to a playable container (ogg/wav). Returns null until
   the decoder exists so the UI falls back gracefully to "not yet decodable". */
export async function wemToPlayable(
    _raw: Uint8Array,
    _codebook: Uint8Array | null,
): Promise<Uint8Array | null> {
    // TODO(backend): invoke('bnk_wem_to_ogg', { data })
    return null;
}

/* Per-format conversions used by the extract pipeline. */
export async function wemToWav(_raw: Uint8Array, _codebook: Uint8Array | null): Promise<Uint8Array> {
    // TODO(backend): invoke('bnk_wem_to_wav', { data })
    throw new Error('WEM->WAV not wired yet');
}
export async function wemToOgg(_raw: Uint8Array, _codebook: Uint8Array | null): Promise<Uint8Array> {
    // TODO(backend): invoke('bnk_wem_to_ogg', { data })
    throw new Error('WEM->OGG not wired yet');
}
export async function wemToMp3(_raw: Uint8Array, _codebook: Uint8Array | null, _bitrate: number): Promise<Uint8Array> {
    // TODO(backend): invoke('bnk_wem_to_mp3', { data, bitrate })
    throw new Error('WEM->MP3 not wired yet');
}

/* Write the selected nodes (already loaded into the tree) to disk under outDir. */
export async function extractNodes(
    _nodes: BnkNode[],
    _formats: ExtractFormat[],
    _mp3Bitrate: number,
    _outDir: string,
): Promise<number> {
    // TODO(backend): invoke('bnk_extract_nodes', { ids, formats, outDir })
    throw new Error('BNK extraction not wired yet');
}

/* Serialize a root node's audio back into a .bnk or .wpk container. */
export async function saveBank(_root: BnkNode, _outPath: string): Promise<void> {
    // TODO(backend): invoke('bnk_save_bank', { id, outPath })
    throw new Error('BNK save not wired yet');
}

/* Wwise / vgmstream tooling availability + install. */
export async function checkWwiseInstalled(): Promise<boolean> {
    // TODO(backend): invoke('wwise_check')
    return false;
}
export async function installWwise(): Promise<{ success: boolean; error?: string }> {
    // TODO(backend): invoke('wwise_install')
    return { success: false, error: 'Wwise install not wired yet' };
}
export async function convertToWem(_inputPath: string): Promise<Uint8Array> {
    // TODO(backend): invoke('audio_convert_to_wem', { inputPath })
    throw new Error('Audio->WEM not wired yet');
}
export async function decodeToWav(_inputData: Uint8Array): Promise<string> {
    // TODO(backend): invoke('audio_decode_to_wav', { data }) -> temp path
    throw new Error('Audio decode not wired yet');
}
export async function amplifyWem(_data: Uint8Array, _gainDb: number): Promise<Uint8Array> {
    // TODO(backend): invoke('audio_amplify_wem', { data, gainDb })
    throw new Error('Volume adjust not wired yet');
}

/* Mod folder scan + game bank extraction (WAD -> BnkGame). */
export async function getModFiles(_folderPath: string, _skinId: string | null): Promise<unknown[]> {
    // TODO(backend): invoke('bnk_scan_mod_folder', { folderPath, skinId })
    return [];
}
export async function extractBnkBanksFromGame(_args: unknown): Promise<{ success: boolean; error?: string; groups?: unknown[] }> {
    // TODO(backend): invoke('bnk_extract_banks_from_game', args)
    return { success: false, error: 'Game bank extraction not wired yet' };
}

/* Codebook used by the WEM decoder, loaded once at mount. */
export async function loadCodebook(): Promise<Uint8Array | null> {
    // TODO(backend): invoke('bnk_load_codebook') -> bytes
    return null;
}

/* Dialog helpers (these DO work today via the Tauri dialog plugin). */
export async function pickFile(name: string, extensions: string[], multiple = false): Promise<string[]> {
    try {
        const picked = await open({
            multiple,
            filters: [{ name, extensions }, { name: 'All Files', extensions: ['*'] }],
        });
        if (picked == null) return [];
        return Array.isArray(picked) ? picked : [picked];
    } catch (e) {
        log.error('[BnkExtract] pickFile failed', e);
        return [];
    }
}

export async function pickDirectory(): Promise<string | null> {
    try {
        const dir = await open({ directory: true, multiple: false });
        return typeof dir === 'string' ? dir : null;
    } catch (e) {
        log.error('[BnkExtract] pickDirectory failed', e);
        return null;
    }
}

export async function pickSavePath(defaultPath: string, name: string, extensions: string[]): Promise<string | null> {
    try {
        const path = await save({ defaultPath, filters: [{ name, extensions }] });
        return path ?? null;
    } catch (e) {
        log.error('[BnkExtract] pickSavePath failed', e);
        return null;
    }
}
