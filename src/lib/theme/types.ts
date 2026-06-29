/* Core color tokens every theme must provide. Mirrors the original Quartz
   theme object's primary fields. */
export interface ThemeTokens {
    accent: string;
    accent2: string;
    accentMuted: string;
    bg: string;
    bg2: string;
    surface: string;
    surface2: string;
    text: string;
    text2: string;
    accentGreen: string;

    // Optional extras Quartz themes carry. Derived when absent (see applyTheme).
    accentGreenMuted?: string;
    navIconColor?: string;
    glassBg?: string;
    glassBorder?: string;
    glassShadow?: string;

    // MUI palette (ported MUI screens read these via --mui-* vars).
    muiPrimary?: string;
    muiPrimaryLight?: string;
    muiPrimaryDark?: string;
    muiSecondary?: string;
    muiSecondaryLight?: string;
    muiSecondaryDark?: string;
    muiBackground?: string;
    muiPaper?: string;
    muiTextPrimary?: string;
    muiTextSecondary?: string;
    muiDivider?: string;
}

/* Optional per-theme wallpaper preset (resolved by the wallpaper manager). The
   old interface-style / effect presets were removed with the theme rework. */
export interface ThemeBehavior {
    wallpaper?: {
        enabled?: boolean;
        id?: string;
        displayName?: string;
        fileNamePrefix?: string;
        fileNames?: string[];
    };
}

export interface Theme {
    id: string;
    name: string;
    builtin: boolean;
    tokens: ThemeTokens;
    behavior?: ThemeBehavior;
}
