import { useUiPrefsStore } from '@/lib/stores';
import { convertFileSrc } from '@tauri-apps/api/core';

/* Full-screen wallpaper behind the app, with opacity + optional vignette. Driven
   purely by the prefs store — theme presets and the gallery both write the store,
   so there's a single source of truth.

   Rendered as a CSS background-image fed by the Tauri asset protocol
   (convertFileSrc), so the webview streams + GPU-caches the file off disk instead
   of holding a decoded base64 data URI in JS memory. */
export function WallpaperLayer() {
    const enabled = useUiPrefsStore((s) => s.wallpaperEnabled);
    const path = useUiPrefsStore((s) => s.wallpaperPath);
    const opacity = useUiPrefsStore((s) => s.wallpaperOpacity);
    const vignetteEnabled = useUiPrefsStore((s) => s.wallpaperVignetteEnabled);
    const vignetteStrength = useUiPrefsStore((s) => s.wallpaperVignetteStrength);

    const activePath = enabled ? path : '';
    if (!activePath) return null;

    const src = convertFileSrc(activePath);

    return (
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            <div
                style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: `url("${src}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    opacity,
                    transition: 'opacity 200ms ease',
                }}
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
