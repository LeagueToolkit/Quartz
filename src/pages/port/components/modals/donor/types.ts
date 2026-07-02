/* Shared types for the Port "Load Donor From Game" modal sub-components. */

export interface DonorChampion {
    id: string;   // CommunityDragon numeric id, as string
    name: string;
    alias: string;
}

export interface DonorSkin {
    id: number;   // base skin number (chroma ids normalized to base)
    name: string;
    tilePath: string | null;
    rarity?: string;
}

export interface DonorConfirmArgs {
    champion: { id: string; name: string; alias?: string };
    skin: { id: number; name: string; tilePath?: string | null };
    portingPrefix: string;
}
