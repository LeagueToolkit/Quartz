import { invokeCommand } from './core';

/* Detect the League of Legends install root (stored setting → registry →
   common paths). Returns null when nothing valid is found. Used by panels that
   can pull assets from the game (Port, Sound Banks) and by the paths settings. */
export function getLeaguePath(): Promise<string | null> {
    return invokeCommand<string | null>('get_league_path');
}
