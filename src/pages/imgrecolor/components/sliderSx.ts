/* Shared MUI Slider styling for the recolor adjustment sliders — tokenized to
   the Design-Lab theme (accent gradient track, white thumb with accent ring). */
export const sliderSx = {
    width: '100%',
    height: '8px',
    color: 'var(--accent-primary)',
    '& .MuiSlider-track': {
        background: 'linear-gradient(90deg, color-mix(in oklab, var(--accent-primary) 70%, var(--accent-secondary)), var(--accent-primary))',
        border: 'none',
        height: '6px',
        borderRadius: '999px',
    },
    '& .MuiSlider-rail': {
        backgroundColor: 'var(--bg-tertiary)',
        height: '6px',
        borderRadius: '999px',
    },
    '& .MuiSlider-thumb': {
        width: '16px',
        height: '16px',
        backgroundColor: '#fff',
        border: '2px solid var(--accent-primary)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
        transition: 'box-shadow 140ms var(--ease-out)',
        '&:hover, &.Mui-active': {
            boxShadow: '0 2px 6px rgba(0,0,0,0.35), 0 0 0 6px color-mix(in oklab, var(--accent-primary) 22%, transparent)',
        },
    },
} as const;
