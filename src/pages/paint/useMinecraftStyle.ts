/* Tracks the document `data-style` attribute and reports whether the
   "minecraft" theme is active, matching the Electron paint2 components. */

import { useEffect, useState } from 'react';

export function useMinecraftStyle(): boolean {
    const [isMinecraftStyle, setIsMinecraftStyle] = useState(false);

    useEffect(() => {
        const updateStyle = () => {
            try {
                const style =
                    document.documentElement?.getAttribute('data-style') ||
                    document.body?.getAttribute('data-style') ||
                    '';
                setIsMinecraftStyle(String(style).toLowerCase() === 'minecraft');
            } catch {
                setIsMinecraftStyle(false);
            }
        };

        updateStyle();
        const observer = new MutationObserver(updateStyle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-style'] });
        if (document.body) {
            observer.observe(document.body, { attributes: true, attributeFilter: ['data-style'] });
        }
        return () => observer.disconnect();
    }, []);

    return isMinecraftStyle;
}
