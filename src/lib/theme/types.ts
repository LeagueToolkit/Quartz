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

    // Liquid-glass button tuning (custom themes / Glass Button Tuning).
    liquidButtonTint?: string;
    liquidButtonHoverTint?: string;
    liquidButtonBlur?: string;

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

// Per-theme side effects applied when the theme is selected (ported from Quartz).
export interface ThemeBehavior {
    preferredStyle?: InterfaceStyle | '';
    effects?: {
        click?: { enabled: boolean; type?: string };
        background?: { enabled: boolean; type?: string };
    };
    wallpaper?: {
        enabled?: boolean;
        id?: string;
        displayName?: string;
        fileNamePrefix?: string;
        fileNames?: string[];
    };
}

export type InterfaceStyle = 'quartz' | 'winforms' | 'liquid' | 'minecraft';

export interface Theme {
    id: string;
    name: string;
    builtin: boolean;
    tokens: ThemeTokens;
    // Custom themes may carry behavior metadata (Quartz's __behavior).
    behavior?: ThemeBehavior;
}

/* Labels for the Theme Creator. Basic = the six primary swatches; the rest are
   surfaced under "Advanced". */
export const BASIC_TOKEN_LABELS: Partial<Record<keyof ThemeTokens, string>> = {
    accent: 'Accent',
    accent2: 'Accent 2',
    bg: 'BG',
    surface: 'Surface',
    text: 'Text',
    navIconColor: 'Nav Icons',
};

export const ADVANCED_TOKEN_LABELS: Partial<Record<keyof ThemeTokens, string>> = {
    accentMuted: 'Accent Muted',
    bg2: 'BG 2',
    surface2: 'Surface 2',
    text2: 'Text 2',
};

export const TOKEN_LABELS: Record<keyof ThemeTokens, string> = {
    accent: 'Accent',
    accent2: 'Accent 2',
    accentMuted: 'Accent Muted',
    bg: 'Background',
    bg2: 'Background 2',
    surface: 'Surface',
    surface2: 'Surface 2',
    text: 'Text',
    text2: 'Text 2',
    accentGreen: 'Success',
    accentGreenMuted: 'Success Muted',
    navIconColor: 'Nav Icons',
    glassBg: 'Glass BG',
    glassBorder: 'Glass Border',
    glassShadow: 'Glass Shadow',
    liquidButtonTint: 'Liquid Tint',
    liquidButtonHoverTint: 'Liquid Hover Tint',
    liquidButtonBlur: 'Liquid Blur',
    muiPrimary: 'MUI Primary',
    muiPrimaryLight: 'MUI Primary Light',
    muiPrimaryDark: 'MUI Primary Dark',
    muiSecondary: 'MUI Secondary',
    muiSecondaryLight: 'MUI Secondary Light',
    muiSecondaryDark: 'MUI Secondary Dark',
    muiBackground: 'MUI Background',
    muiPaper: 'MUI Paper',
    muiTextPrimary: 'MUI Text Primary',
    muiTextSecondary: 'MUI Text Secondary',
    muiDivider: 'MUI Divider',
};
