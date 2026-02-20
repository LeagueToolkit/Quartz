import { useEffect } from 'react';

export default function useVfxHubThemeEffects({ electronPrefs, themeManager }) {
  useEffect(() => {
    try {
      const savedTheme = electronPrefs?.obj?.ThemeVariant;
      const savedStyle = electronPrefs?.obj?.InterfaceStyle;
      if (savedTheme && savedStyle) {
        themeManager.applyThemeVariables?.(savedTheme, savedStyle);
      }
    } catch {
      // noop
    }
  }, [electronPrefs, themeManager]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .vfx-preview-container:hover .vfx-preview-overlay { opacity: 0.7 !important; }
      .vfx-preview-overlay { opacity: 0; transition: opacity 0.3s ease; }
      .vfx-preview-container { transition: transform 0.2s ease; }
      .vfx-preview-container:hover { transform: scale(1.02); }
    `;
    document.head.appendChild(style);
    return () => {
      try {
        if (style?.parentNode === document.head) {
          document.head.removeChild(style);
        }
      } catch {
        // noop
      }
    };
  }, []);
}
