import { useEffect, useState } from 'react';
import { useUiPrefsStore } from '@/lib/stores';
import { findPreset } from '@/lib/wallpaper/wallpaperManager';
import { log } from '@/lib/util/logger';
import GlobalBackgroundEffect from './background/GlobalBackgroundEffect';
import GlobalClickEffect from './click/GlobalClickEffect';
import GlobalCursorEffect from './cursor/GlobalCursorEffect';
import WallpaperLayer from './WallpaperLayer';

type Override = { enabled: boolean; type?: string } | null;

/* Mounts the global background/click/cursor effects + wallpaper, driven by the
   prefs store. Transient `*Changed` events (Theme Creator live preview, theme
   presets) override the store values until the next store update. Performance
   mode disables all click/background/cursor effects (matches Quartz). */
export function EffectsLayer() {
    const performanceMode = useUiPrefsStore((s) => s.performanceMode);

    const clickEnabled = useUiPrefsStore((s) => s.clickEffectEnabled);
    const clickType = useUiPrefsStore((s) => s.clickEffectType);
    const bgEnabled = useUiPrefsStore((s) => s.backgroundEffectEnabled);
    const bgType = useUiPrefsStore((s) => s.backgroundEffectType);
    const cursorEnabled = useUiPrefsStore((s) => s.cursorEffectEnabled);
    const cursorPath = useUiPrefsStore((s) => s.cursorEffectPath);
    const cursorSize = useUiPrefsStore((s) => s.cursorEffectSize);

    const [clickOverride, setClickOverride] = useState<Override>(null);
    const [bgOverride, setBgOverride] = useState<Override>(null);

    useEffect(() => {
        const onClick = (e: Event) => setClickOverride((e as CustomEvent).detail || null);
        const onBg = (e: Event) => setBgOverride((e as CustomEvent).detail || null);
        window.addEventListener('clickEffectChanged', onClick);
        window.addEventListener('backgroundEffectChanged', onBg);
        return () => {
            window.removeEventListener('clickEffectChanged', onClick);
            window.removeEventListener('backgroundEffectChanged', onBg);
        };
    }, []);

    // Resolve a theme's wallpaper preset to an installed wallpaper.
    useEffect(() => {
        const onPreset = (e: Event) => {
            const preset = (e as CustomEvent).detail;
            findPreset(preset).then((item) => {
                if (!item) return;
                const set = useUiPrefsStore.getState().set;
                set('wallpaperEnabled', true);
                set('wallpaperId', item.id);
                set('wallpaperPath', item.filePath);
            }).catch((err) => log.error('theme wallpaper preset resolve failed', String(err)));
        };
        window.addEventListener('themeWallpaperPreset', onPreset);
        return () => window.removeEventListener('themeWallpaperPreset', onPreset);
    }, []);

    const click = clickOverride ?? { enabled: clickEnabled, type: clickType };
    const bg = bgOverride ?? { enabled: bgEnabled, type: bgType };

    return (
        <>
            <WallpaperLayer />
            <GlobalBackgroundEffect enabled={!performanceMode && bg.enabled} type={bg.type ?? bgType} />
            <GlobalClickEffect enabled={!performanceMode && click.enabled} type={click.type ?? clickType} />
            <GlobalCursorEffect enabled={!performanceMode && cursorEnabled} path={cursorPath} size={cursorSize} />
        </>
    );
}

export default EffectsLayer;
