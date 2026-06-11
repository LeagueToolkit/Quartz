// Shared bumpath UI styles. Buttons use a filled-soft glass tone keyed off
// the `tone` color so each button reads as that role at a glance without
// looking like a wireframe. Inputs share a coordinated focus treatment so
// search/prefix fields stop reading as "default browser white".

import type { SxProps, Theme } from '@mui/material';

const tonedSurface = (tone: string, alphaTop: number, alphaBot: number) =>
    `linear-gradient(180deg, color-mix(in srgb, ${tone}, transparent ${alphaTop}%), color-mix(in srgb, ${tone}, transparent ${alphaBot}%))`;

const FONT = 'JetBrains Mono, monospace';

export const panelStyle = {
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    borderRadius: 0,
} as const;

/* Sibling of port2's `celestialButtonStyle` — 6px radius for visual
   consistency, JetBrains Mono everywhere, but with a subtle tone-tinted
   surface + tone-glow on hover to feel a notch more modern. */
export const celestialButtonStyle = {
    borderRadius: '6px',
    textTransform: 'none',
    fontFamily: FONT,
    fontWeight: 600,
    letterSpacing: '0.02em',
    transition: 'transform 140ms cubic-bezier(0.4,0,0.2,1), box-shadow 180ms ease, background 180ms ease, border-color 180ms ease, color 180ms ease',
    '&:disabled': {
        opacity: 0.4,
        cursor: 'not-allowed',
        transform: 'none',
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.32)',
        boxShadow: 'none',
    },
} as const;

interface ActionButtonOptions {
    height?: string;
    fontSize?: string;
    px?: number;
    minWidth?: string;
    iconOnly?: boolean;
    prominent?: boolean;
}

export const getActionButtonSx = (tone: string, options: ActionButtonOptions = {}): SxProps<Theme> => {
    const {
        height = '36px',
        fontSize = '0.78rem',
        px = 1.75,
        minWidth = 'auto',
        iconOnly = false,
        prominent = false,
    } = options;

    return {
        ...celestialButtonStyle,
        height,
        fontSize,
        px: iconOnly ? 0 : px,
        py: 0,
        minWidth: iconOnly ? '36px' : minWidth,
        width: iconOnly ? '36px' : 'auto',
        color: tone,
        borderRadius: '6px',
        border: `1px solid color-mix(in srgb, ${tone}, transparent ${prominent ? 55 : 70}%)`,
        background: prominent
            ? tonedSurface(tone, 80, 92)
            : tonedSurface(tone, 89, 95),
        boxShadow: prominent
            ? `0 2px 6px rgba(0,0,0,0.22), inset 0 1px 0 color-mix(in srgb, ${tone}, transparent 70%)`
            : `0 1px 2px rgba(0,0,0,0.16), inset 0 1px 0 color-mix(in srgb, ${tone}, transparent 82%)`,
        '& .MuiButton-startIcon': {
            marginRight: '7px',
            '& svg': { fontSize: '1rem' },
        },
        '&:hover': {
            transform: 'translateY(-1px)',
            color: tone,
            borderColor: `color-mix(in srgb, ${tone}, transparent 30%)`,
            background: prominent
                ? tonedSurface(tone, 70, 84)
                : tonedSurface(tone, 78, 88),
            boxShadow: prominent
                ? `0 8px 22px rgba(0,0,0,0.34), 0 0 22px color-mix(in srgb, ${tone}, transparent 55%), inset 0 1px 0 color-mix(in srgb, ${tone}, transparent 55%)`
                : `0 5px 16px rgba(0,0,0,0.28), 0 0 14px color-mix(in srgb, ${tone}, transparent 65%), inset 0 1px 0 color-mix(in srgb, ${tone}, transparent 65%)`,
        },
        '&:active': {
            transform: 'translateY(0) scale(0.985)',
            boxShadow: `inset 0 2px 5px rgba(0,0,0,0.35), inset 0 0 0 1px color-mix(in srgb, ${tone}, transparent 60%)`,
        },
        '&:disabled': celestialButtonStyle['&:disabled'],
    };
};

/* Shared input look — matches the new button language (8px radius, accent
   focus glow, no jarring solid bg). Drop into any TextField via `sx`. */
export const inputSx = {
    '& .MuiOutlinedInput-root': {
        color: 'var(--text)',
        fontSize: '0.8rem',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.008))',
        borderRadius: '8px',
        transition: 'background 180ms ease, box-shadow 180ms ease',
        '& fieldset': {
            border: '1px solid rgba(255,255,255,0.08)',
            transition: 'border-color 180ms ease',
        },
        '&:hover fieldset': {
            borderColor: 'color-mix(in srgb, var(--accent), transparent 55%)',
        },
        '&.Mui-focused': {
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent), transparent 92%), color-mix(in srgb, var(--accent), transparent 97%))',
            boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent), transparent 88%)',
        },
        '&.Mui-focused fieldset': {
            borderColor: 'var(--accent)',
            borderWidth: '1px',
        },
    },
    '& .MuiInputBase-input': {
        fontFamily: FONT,
        fontSize: '0.8rem',
        py: '8px',
        '&::placeholder': {
            color: 'rgba(255,255,255,0.35)',
            opacity: 1,
        },
    },
} as const;

// Pill badge for status counts (e.g. "0 / 0 selected").
export const countBadgeSx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    px: 1.25,
    py: 0.4,
    borderRadius: '999px',
    background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent), transparent 82%), color-mix(in srgb, var(--accent), transparent 92%))',
    border: '1px solid color-mix(in srgb, var(--accent), transparent 55%)',
    boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--accent), transparent 70%)',
    fontFamily: FONT,
    fontWeight: 600,
    fontSize: '0.7rem',
    letterSpacing: '0.02em',
    color: 'var(--accent)',
    whiteSpace: 'nowrap',
} as const;
