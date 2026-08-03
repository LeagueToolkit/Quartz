/* BNK/WPK parse + WEM decode/encode backend.

   Everything is in-process behind the bnk_* / audio_* Tauri commands: containers
   and Wwise Vorbis coding come from ritoshark::audio, and user mp3/flac/ogg is
   decoded by symphonia. There is no external toolchain to install any more. */

import { invoke } from '@tauri-apps/api/core';
import { pickPath } from '@/components/explorer';
import { log } from '@/lib/util/logger';
import type { AudioData, BnkNode, ExtractFormat } from '../types';

/* Tauri serializes Rust Vec<u8> as a JSON number array; rehydrate to bytes. */
function toBytes(value: unknown): Uint8Array {
    if (value instanceof Uint8Array) return value;
    if (Array.isArray(value)) return Uint8Array.from(value as number[]);
    return new Uint8Array();
}

function base64ToBytes(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/* Walk a freshly-loaded tree and convert every audioData.data array to bytes. */
function hydrateTree(node: BnkNode): BnkNode {
    if (node.audioData?.data) {
        node.audioData.data = toBytes(node.audioData.data);
    }
    if (node.children) node.children.forEach(hydrateTree);
    return node;
}

/* invoke() JSON-encodes a nested Uint8Array as an object, which breaks Rust's
   Vec<u8>. Strip each node to just the fields the backend needs, turning audio
   bytes into plain number arrays. */
interface WireNode {
    name: string;
    audioData?: { id: number; data: number[] } | null;
    children?: WireNode[];
    originalPath?: string;
}
function toWireNode(node: BnkNode): WireNode {
    const wire: WireNode = { name: node.name };
    if (node.audioData) {
        wire.audioData = { id: node.audioData.id, data: Array.from(toBytes(node.audioData.data)) };
    }
    if (node.children) wire.children = node.children.map(toWireNode);
    /* Saving edits the container the tree came from instead of rebuilding one,
       so the header and object hierarchy survive. The backend needs its path. */
    const source = node.originalPath ?? node.wpkPath ?? node.bnkPath;
    if (source) wire.originalPath = source;
    return wire;
}

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
export async function loadBanks(args: LoadBanksArgs): Promise<LoadBanksResult | null> {
    const result = await invoke<LoadBanksResult | null>('bnk_load_banks', { args });
    if (!result?.tree) return result;
    hydrateTree(result.tree);
    result.audioFiles?.forEach((a) => { if (a.data) a.data = toBytes(a.data); });
    return result;
}

/* Decode raw WEM bytes to a playable container (ogg/wav). Returns null on
   failure so the UI can fall back gracefully. */
export async function wemToPlayable(raw: Uint8Array): Promise<Uint8Array | null> {
    try {
        return toBytes(await invoke<number[]>('bnk_wem_to_ogg', { data: Array.from(raw) }));
    } catch (e) {
        log.error('[BnkExtract] wemToPlayable failed', e);
        return null;
    }
}

/* Per-format conversions used by the extract pipeline. */
export async function wemToWav(raw: Uint8Array): Promise<Uint8Array> {
    return toBytes(await invoke<number[]>('bnk_wem_to_wav', { data: Array.from(raw) }));
}
export async function wemToOgg(raw: Uint8Array): Promise<Uint8Array> {
    return toBytes(await invoke<number[]>('bnk_wem_to_ogg', { data: Array.from(raw) }));
}
export async function wemToMp3(raw: Uint8Array, bitrate: number): Promise<Uint8Array> {
    return toBytes(await invoke<number[]>('bnk_wem_to_mp3', { data: Array.from(raw), bitrate }));
}

/* Write the selected nodes (already loaded into the tree) to disk under outDir. */
export async function extractNodes(
    nodes: BnkNode[],
    formats: ExtractFormat[],
    mp3Bitrate: number,
    outDir: string,
): Promise<number> {
    return invoke<number>('bnk_extract_nodes', {
        args: { nodes: nodes.map(toWireNode), formats, mp3Bitrate, outDir },
    });
}

/* Serialize a root node's audio back into a .bnk or .wpk container. */
export async function saveBank(root: BnkNode, outPath: string): Promise<void> {
    await invoke('bnk_save_bank', { args: { root: toWireNode(root), outPath } });
}

/* Encoding is in-process now — no external toolchain to check for or install. */
export async function convertToWem(inputPath: string): Promise<Uint8Array> {
    return toBytes(await invoke<number[]>('audio_convert_to_wem', { inputPath }));
}
export interface BatchWemResult {
    name: string;
    data?: Uint8Array;
    error?: string;
}
export async function convertWavsToWem(
    inputs: Array<{ name: string; data: Uint8Array }>,
): Promise<BatchWemResult[]> {
    const results = await invoke<Array<{ name: string; dataBase64?: string; error?: string }>>(
        'audio_convert_wavs_to_wem',
        { inputs: inputs.map((input) => ({ name: input.name, data: Array.from(input.data) })) },
    );
    return results.map((result) => ({
        name: result.name,
        data: result.dataBase64 ? base64ToBytes(result.dataBase64) : undefined,
        error: result.error,
    }));
}
export async function decodeToWav(inputData: Uint8Array): Promise<Uint8Array> {
    return base64ToBytes(await invoke<string>('audio_decode_to_wav', { data: Array.from(inputData) }));
}
export async function amplifyWem(data: Uint8Array, gainDb: number): Promise<Uint8Array> {
    return toBytes(await invoke<number[]>('audio_amplify_wem', { data: Array.from(data), gainDb }));
}

/* Read an arbitrary file off disk as bytes (used for picked/dropped .wem files,
   which are already encoded and need no conversion). */
export async function readFileBytes(path: string): Promise<Uint8Array> {
    const b64 = await invoke<string>('read_file_base64', { path });
    return base64ToBytes(b64);
}

/* Write raw bytes to a path (used by the audio splitter to save WAV segments). */
export async function writeFileBytes(path: string, data: Uint8Array): Promise<void> {
    await invoke('audio_write_file', { path, data: Array.from(data) });
}

/* Mod folder scan + game bank extraction (WAD -> BnkGame). */
export async function getModFiles(folderPath: string, skinId: string | null): Promise<unknown[]> {
    try {
        return await invoke<unknown[]>('bnk_scan_mod_folder', { folderPath, skinId });
    } catch (e) {
        log.error('[BnkExtract] getModFiles failed', e);
        return [];
    }
}
export async function extractBnkBanksFromGame(args: unknown): Promise<{ success: boolean; error?: string; groups?: unknown[] }> {
    try {
        return await invoke<{ success: boolean; error?: string; groups?: unknown[] }>('bnk_extract_banks_from_game', { args });
    } catch (e) {
        return { success: false, error: (e as Error).message };
    }
}

/* A tiny silent WEM (the same 340-byte payload Quartz shipped in public/silence.wem),
   embedded so "Make Silent" works without touching disk or external tooling. */
const SILENCE_WEM_B64 =
    'UklGRkwBAABXQVZFZm10IEIAAAD//wIARKwAAP8FAAAAAAAAMAAAAAIxAACXGwAA2QAAAPYAAAAAAKkCAAAAANkAAAADAKkC0D4AALBAAADoqEvVCAtkYXRh9gAAANcAKSacgEIKKqzAQgsuvABDDD78AEQQQgxBRBFGHIFEEkoswYRroYk2GmmlmXYaaqmpthprrYEWEAiZQKAACgxkAMABQoIUAFBYYOgQIQLEKDAwLi4tghCZIRIRi0FiQjVQVEwHAIsLDPkAkKGxkXZxAV0GuKCLuw6EEIQgBLE4gAIScHDCDU+84Qk3OEGnqNSBAAAA0AAADwAAyQYQERHNHEeHxwdIiMgISYnJCYoAAACgBgAfAABJChAREc0cR4fHB0iIyAhJickJSiCAAAAACCAAAQEBgAEBAAABAAEBAAEBAAEBAAEBAAEBAAEBAAEDAAEAAA==';

let silenceWemCache: Uint8Array | null = null;

/* Bytes for a short silent WEM, used to mute selected audio nodes. */
export function silenceWem(): Uint8Array {
    if (silenceWemCache) return silenceWemCache;
    const bin = atob(SILENCE_WEM_B64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length !== 340 || bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) {
        throw new Error('Bundled silence WEM is invalid');
    }
    silenceWemCache = bytes;
    return bytes;
}

/* Dialog helpers (these DO work today via the Tauri dialog plugin). */
export async function pickFile(name: string, extensions: string[], multiple = false): Promise<string[]> {
    try {
        const picked = await pickPath({
            mode: multiple ? 'files' : 'file',
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
        const dir = await pickPath({ mode: 'directory' });
        return typeof dir === 'string' ? dir : null;
    } catch (e) {
        log.error('[BnkExtract] pickDirectory failed', e);
        return null;
    }
}

export async function pickSavePath(defaultPath: string, name: string, extensions: string[]): Promise<string | null> {
    try {
        const path = await pickPath({ mode: 'save', defaultPath, filters: [{ name, extensions }] });
        return typeof path === 'string' ? path : null;
    } catch (e) {
        log.error('[BnkExtract] pickSavePath failed', e);
        return null;
    }
}
