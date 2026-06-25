import { invokeCommand } from './core';

export interface JointInfo {
    id: number;
    name: string;
    /** Parent joint id, or -1 for a root joint. */
    parentId: number;
}

export interface LoadedSkeleton {
    sklPath: string;
    totalJoints: number;
    name: string;
    assetName: string;
    joints: JointInfo[];
}

/** Resolve the real .skl path for a skins/animation bin. */
export function aniportAutodetectSkl(
    binPath: string,
    skeletonRef?: string,
    sklPath?: string,
): Promise<string> {
    return invokeCommand<string>('aniport_autodetect_skl', { binPath, skeletonRef, sklPath });
}

/** Parse a skeleton file into its joints + hierarchy. */
export function aniportLoadSkeleton(sklPath: string): Promise<LoadedSkeleton> {
    return invokeCommand<LoadedSkeleton>('aniport_load_skeleton', { sklPath });
}
