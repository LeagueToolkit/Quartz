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
