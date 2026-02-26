// Theme definitions for Jade Editor
// Based on JadeCS theme system

export interface ThemeColors {
    id: string;
    displayName: string;
    windowBg: string;
    editorBg: string;
    titleBar: string;
    statusBar: string;
    text: string;
    tabBg: string;
    selectedTab: string;
}

export interface SyntaxColors {
    keyword: string;
    comment: string;
    stringColor: string;
    number: string;
    propertyColor: string;
}

export interface BracketColors {
    color1: string;
    color2: string;
    color3: string;
}

// All available themes
export const THEMES: ThemeColors[] = [
    {
        id: 'Default',
        displayName: 'Dark Emptiness',
        windowBg: '#1E1E1E',
        editorBg: '#1E1E1E',
        titleBar: '#252526',
        statusBar: '#505050',
        text: '#D4D4D4',
        tabBg: '#252526',
        selectedTab: '#3E3E42'
    },
    {
        id: 'DarkBlue',
        displayName: 'Blue Guilt',
        windowBg: '#0F1928',
        editorBg: '#141E2D',
        titleBar: '#19232E',
        statusBar: '#005A9E',
        text: '#DCE6F0',
        tabBg: '#19232E',
        selectedTab: '#2D415A'
    },
    {
        id: 'DarkRed',
        displayName: 'Red Regret',
        windowBg: '#280F14',
        editorBg: '#2D1419',
        titleBar: '#32191E',
        statusBar: '#9E0028',
        text: '#F0DDE1',
        tabBg: '#32191E',
        selectedTab: '#5A2D37'
    },
    {
        id: 'LightPink',
        displayName: 'Pink Remembrance',
        windowBg: '#C896B4',
        editorBg: '#D2A5BE',
        titleBar: '#B482A0',
        statusBar: '#C71585',
        text: '#000000',
        tabBg: '#B482A0',
        selectedTab: '#E696BE'
    },
    {
        id: 'PastelBlue',
        displayName: 'Primo',
        windowBg: '#E6F5FF',
        editorBg: '#D2F0FF',
        titleBar: '#FFF0FA',
        statusBar: '#50C8FF',
        text: '#000000',
        tabBg: '#EBE1FF',
        selectedTab: '#A0E6FF'
    },
    {
        id: 'ForestGreen',
        displayName: 'Green Nostalgia',
        windowBg: '#142319',
        editorBg: '#192D1E',
        titleBar: '#1E3223',
        statusBar: '#228B22',
        text: '#C8E6D2',
        tabBg: '#1E3223',
        selectedTab: '#32553C'
    },
    {
        id: 'AMOLED',
        displayName: 'AMOLED',
        windowBg: '#000000',
        editorBg: '#000000',
        titleBar: '#0A0A0A',
        statusBar: '#141414',
        text: '#B4B4B4',
        tabBg: '#0A0A0A',
        selectedTab: '#1E1E1E'
    },
    {
        id: 'Void',
        displayName: 'Purple Void',
        windowBg: '#0A0514',
        editorBg: '#0F0A1E',
        titleBar: '#140F28',
        statusBar: '#190F50',
        text: '#B4AADC',
        tabBg: '#140F28',
        selectedTab: '#281E46'
    },
    {
        id: 'VioletSorrow',
        displayName: 'Violet Sorrow',
        windowBg: '#120A23',
        editorBg: '#160C2A',
        titleBar: '#1C1234',
        statusBar: '#411E78',
        text: '#B9AAD7',
        tabBg: '#201439',
        selectedTab: '#4B3273'
    },
    {
        id: 'OrangeBurnout',
        displayName: 'Orange Burnout',
        windowBg: '#230F05',
        editorBg: '#2A1408',
        titleBar: '#32190A',
        statusBar: '#CC5500',
        text: '#FFE4D1',
        tabBg: '#32190A',
        selectedTab: '#6E2D0F'
    },
    {
        id: 'PurpleGrief',
        displayName: 'Purple Grief',
        windowBg: '#190F1E',
        editorBg: '#1E1423',
        titleBar: '#231928',
        statusBar: '#462850',
        text: '#DCC8E6',
        tabBg: '#231928',
        selectedTab: '#50325A'
    }
];

// Syntax highlighting colors for each theme
export const SYNTAX_COLORS: Record<string, SyntaxColors> = {
    Default: {
        keyword: '#569CD6',
        comment: '#6A9955',
        stringColor: '#CE9178',
        number: '#B5CEA8',
        propertyColor: '#569CD6'
    },
    DarkBlue: {
        keyword: '#5DADE2',
        comment: '#52BE80',
        stringColor: '#F39C12',
        number: '#AED6F1',
        propertyColor: '#5DADE2'
    },
    DarkRed: {
        keyword: '#EC7063',
        comment: '#82E0AA',
        stringColor: '#F8C471',
        number: '#F1948A',
        propertyColor: '#EC7063'
    },
    LightPink: {
        keyword: '#7D3C98',
        comment: '#1E8449',
        stringColor: '#BA4A00',
        number: '#6C3483',
        propertyColor: '#7D3C98'
    },
    PastelBlue: {
        keyword: '#2874A6',
        comment: '#117A65',
        stringColor: '#D68910',
        number: '#1F618D',
        propertyColor: '#2874A6'
    },
    ForestGreen: {
        keyword: '#85C1E9',
        comment: '#52BE80',
        stringColor: '#F39C12',
        number: '#AED6F1',
        propertyColor: '#85C1E9'
    },
    AMOLED: {
        keyword: '#5DADE2',
        comment: '#52BE80',
        stringColor: '#F39C12',
        number: '#AED6F1',
        propertyColor: '#5DADE2'
    },
    Void: {
        keyword: '#BB8FCE',
        comment: '#82E0AA',
        stringColor: '#F8C471',
        number: '#D7BDE2',
        propertyColor: '#BB8FCE'
    },
    VioletSorrow: {
        keyword: '#9B7EDE',
        comment: '#7EC8A3',
        stringColor: '#E8A87C',
        number: '#C8A2E0',
        propertyColor: '#9B7EDE'
    },
    OrangeBurnout: {
        keyword: '#FF8C00',
        comment: '#8B4513',
        stringColor: '#FFD700',
        number: '#F4A460',
        propertyColor: '#FFA07A'
    },
    PurpleGrief: {
        keyword: '#BE9FE1',
        comment: '#6F4E7C',
        stringColor: '#E1BEE7',
        number: '#9575CD',
        propertyColor: '#B39DDB'
    },
    HighContrast: {
        keyword: '#FFFF00',
        comment: '#00FF00',
        stringColor: '#FF00FF',
        number: '#00FFFF',
        propertyColor: '#FFFF00'
    },
    VSCode: {
        keyword: '#569CD6',
        comment: '#6A9955',
        stringColor: '#CE9178',
        number: '#B5CEA8',
        propertyColor: '#9CDCFE'
    },
    StandardFlint: {
        keyword: '#569CD6',
        comment: '#6A9955',
        stringColor: '#CE9178',
        number: '#B5CEA8',
        propertyColor: '#DCDCAA'
    }
};

// Bracket colorization for each theme
export const BRACKET_COLORS: Record<string, BracketColors> = {
    Default: { color1: '#FFD700', color2: '#DA70D6', color3: '#87CEEB' },
    DarkBlue: { color1: '#FFD700', color2: '#DA70D6', color3: '#00BFFF' },
    DarkRed: { color1: '#FFD700', color2: '#FF69B4', color3: '#FF8C00' },
    LightPink: { color1: '#4B0082', color2: '#8A2BE2', color3: '#9400D3' },
    PastelBlue: { color1: '#B8860B', color2: '#8B008B', color3: '#006400' },
    ForestGreen: { color1: '#FFD700', color2: '#40E0D0', color3: '#ADFF2F' },
    AMOLED: { color1: '#FFD700', color2: '#00FFFF', color3: '#FF00FF' },
    Void: { color1: '#FFD700', color2: '#BA55D3', color3: '#8A2BE2' },
    VioletSorrow: { color1: '#9370DB', color2: '#8A2BE2', color3: '#BA55D3' },
    OrangeBurnout: { color1: '#FF8C00', color2: '#DAA520', color3: '#FF4500' },
    PurpleGrief: { color1: '#BE9FE1', color2: '#E1BEE7', color3: '#9575CD' },
    HighContrast: { color1: '#FFFF00', color2: '#00FF00', color3: '#FF0000' },
    VSCode: { color1: '#FFD700', color2: '#DA70D6', color3: '#179FFF' },
    StandardFlint: { color1: '#FFD700', color2: '#DA70D6', color3: '#179FFF' }
};

// Syntax theme options (includes all UI themes + standalone syntax themes)
export const SYNTAX_THEME_OPTIONS = [
    ...THEMES.map(t => ({ id: t.id, displayName: t.displayName })),
    { id: 'HighContrast', displayName: 'High Contrast' },
    { id: 'VSCode', displayName: 'VS Code' },
    { id: 'StandardFlint', displayName: 'Standard Flint' }
];

// Helper functions
export function getTheme(id: string): ThemeColors | undefined {
    return THEMES.find(t => t.id === id);
}

export function getSyntaxColors(id: string): SyntaxColors {
    return SYNTAX_COLORS[id] || SYNTAX_COLORS.Default;
}

export function getBracketColors(id: string): BracketColors {
    return BRACKET_COLORS[id] || BRACKET_COLORS.Default;
}
