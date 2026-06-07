import { useEffect, useState } from 'react';
import { useUiPrefsStore } from '@/lib/stores';
import { readFileBase64 } from '@/lib/api';

const MIME: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
};

function dataUriCache(): Map<string, string> {
    const w = window as unknown as { __qWallpaperCache?: Map<string, string> };
    if (!w.__qWallpaperCache) w.__qWallpaperCache = new Map();
    return w.__qWallpaperCache;
}

/* Full-screen wallpaper behind the app, with opacity + optional vignette. Reads
   the active wallpaper from prefs and honors transient `wallpaperChanged` events
   (Theme Creator live preview / theme presets). */
export function WallpaperLayer() {
    const enabled = useUiPrefsStore((s) => s.wallpaperEnabled);
    const path = useUiPrefsStore((s) => s.wallpaperPath);
    const storeOpacity = useUiPrefsStore((s) => s.wallpaperOpacity);
    const vignetteEnabled = useUiPrefsStore((s) => s.wallpaperVignetteEnabled);
    const vignetteStrength = useUiPrefsStore((s) => s.wallpaperVignetteStrength);

    // Transient override from live-preview events; null means "use store".
    const [override, setOverride] = useState<{ path: string; opacity: number } | null>(null);
    const [src, setSrc] = useState('');

    useEffect(() => {
        const onChange = (e: Event) => {
            const detail = (e as CustomEvent).detail || {};
            setOverride({ path: detail.path ?? '', opacity: detail.opacity ?? storeOpacity });
        };
        window.addEventListener('wallpaperChanged', onChange);
        return () => window.removeEventListener('wallpaperChanged', onChange);
    }, [storeOpacity]);

    const activePath = override ? override.path : (enabled ? path : '');
    const opacity = override ? override.opacity : storeOpacity;

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
            .catch(() => setSrc(''));
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
