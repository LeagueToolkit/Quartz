import { useEffect, useState } from 'react';
import { useUiPrefsStore } from '@/lib/stores';
import { readFileBase64 } from '@/lib/api';
import { log } from '@/lib/util/logger';

const MIME: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
};

function dataUriCache(): Map<string, string> {
    const w = window as unknown as { __qWallpaperCache?: Map<string, string> };
    if (!w.__qWallpaperCache) w.__qWallpaperCache = new Map();
    return w.__qWallpaperCache;
}

/* Full-screen wallpaper behind the app, with opacity + optional vignette. Driven
   purely by the prefs store — theme presets and the gallery both write the store,
   so there's a single source of truth. */
export function WallpaperLayer() {
    const enabled = useUiPrefsStore((s) => s.wallpaperEnabled);
    const path = useUiPrefsStore((s) => s.wallpaperPath);
    const opacity = useUiPrefsStore((s) => s.wallpaperOpacity);
    const vignetteEnabled = useUiPrefsStore((s) => s.wallpaperVignetteEnabled);
    const vignetteStrength = useUiPrefsStore((s) => s.wallpaperVignetteStrength);

    const [src, setSrc] = useState('');

    const activePath = enabled ? path : '';

    useEffect(() => {
        let cancelled = false;
        if (!activePath) { setSrc(''); return; }
        const cache = dataUriCache();
        const cached = cache.get(activePath);
        if (cached) { setSrc(cached); return; }
        const ext = (activePath.split('.').pop() || '').toLowerCase();
        readFileBase64(activePath)
            .then((b64) => {
                if (cancelled) return;
                const uri = `data:${MIME[ext] || 'image/png'};base64,${b64}`;
                cache.set(activePath, uri);
                setSrc(uri);
            })
            .catch((e) => { log.error('WallpaperLayer readFileBase64 failed', activePath, String(e)); setSrc(''); });
        return () => { cancelled = true; };
    }, [activePath]);

    if (!src) return null;

    return (
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            <img
                src={src}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity, transition: 'opacity 200ms ease' }}
            />
            {vignetteEnabled && (
                <div
                    style={{
                        position: 'absolute', inset: 0,
                        background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignetteStrength}) 100%)`,
                    }}
                />
            )}
        </div>
    );
}

export default WallpaperLayer;
