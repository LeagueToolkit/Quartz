import { invokeCommand } from './core';

export interface HubAssetBytes {
    relPath: string;
    base64: string;
}

export interface StagedDonor {
    tempRoot: string;
    binPath: string;
}

/**
 * Stage a hub system's compiled .bin plus its asset bytes into a temp donor
 * tree so the Port donor session (vfx_open) can load it and resolve its assets,
 * exactly like a game-extracted donor. Returns the temp root (for cleanup) and
 * the .bin path to open.
 */
export function portStageHubDonor(binBase64: string, assets: HubAssetBytes[]): Promise<StagedDonor> {
    return invokeCommand<StagedDonor>('port_stage_hub_donor', { binBase64, assets });
}

export interface HubUploadAsset { name: string; base64: string }
export interface PreparedHubUpload {
    binBase64: string;
    emitters: number;
    assets: HubUploadAsset[];
    missing: string[];
}

/**
 * Prepare a target VFX system for hub upload: repath its asset references to
 * ASSETS/vfxhub/<basename>, compile the repathed system to a .bin, and collect
 * the referenced asset files from the target's mod tree. Bin-native.
 */
export function portPrepareHubUpload(binPath: string, systemContent: string): Promise<PreparedHubUpload> {
    return invokeCommand<PreparedHubUpload>('port_prepare_hub_upload', { binPath, systemContent });
}
