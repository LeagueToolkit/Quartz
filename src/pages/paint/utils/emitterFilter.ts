/*
 * Emitter name filtering for bulk selection.
 */

/*
 * True when an emitter's name marks it as a distortion effect.
 *
 * Distortion emitters sample the screen and offset it; their texture encodes a
 * direction vector per texel rather than a color. Recoloring one corrupts the offsets,
 * so bulk selection skips them by default.
 *
 * Riot's naming is inconsistent across skins, hence the several spellings. The bare
 * "dist" case is matched only as a whole word so names like "distance" or "district"
 * are left alone.
 */
export function isDistortionEmitterName(name = ''): boolean {
    const n = String(name).toLowerCase();
    return n.includes('distortion')
        || n.includes('distort')
        || n.includes('distord')
        || n.includes('warp')
        || n.includes('refract')
        || n.includes('heathaze')
        || n.includes('heat_haze')
        || /(^|[_\-\s.])dist([_\-\s.]|$)/.test(n)
        || /(^|[_\-\s.])(dsrt|dstrt)([_\-\s.]|$)/.test(n);
}
