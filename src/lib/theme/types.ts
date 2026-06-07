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
}

export interface Theme {
    id: string;
    name: string;
    builtin: boolean;
    tokens: ThemeTokens;
}

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
};
