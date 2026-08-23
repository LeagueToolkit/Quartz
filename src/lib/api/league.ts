import { invokeCommand } from './core';

/* Detect the League of Legends install root (stored setting → registry →
   common paths). Returns null when nothing valid is found. Used by panels that
   can pull assets from the game (Port, Sound Banks) and by the paths settings. */
export function getLeaguePath(): Promise<string | null> {
    return invokeCommand<string | null>('get_league_path');
}

export interface LeaguePathCheck {
    valid: boolean;
    /** Why the path is unusable, or empty when it is fine. */
    reason: string;
}

/* Check ONE path, with no fallback to detection.
   `getLeaguePath` hides a bad configured path by moving on to the registry and
   the common install locations, so it can never tell the user that what they
   typed is wrong. This answers for the given path alone, which is what the
   Settings field needs to show valid/invalid as it is edited. */
export function checkLeaguePath(path: string): Promise<LeaguePathCheck> {
    return invokeCommand<LeaguePathCheck>('check_league_path', { path });
}
