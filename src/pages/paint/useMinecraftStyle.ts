/* The Minecraft interface style was removed during the theme rework. This hook
   is kept as a stable no-op so the Paint components that branched on it keep
   compiling without change; it always reports false. */

export function useMinecraftStyle(): boolean {
    return false;
}
