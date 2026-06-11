import { useEffect, useState } from 'react';
import { Box, Typography, Button as MuiButton, Tooltip } from '@mui/material';
import { PlayArrow as PlayIcon, ArrowForward as ArrowIcon } from '@mui/icons-material';
import {
    Brush as PaintIcon,
    ArrowLeftRight as PortIcon,
    Github as VFXHubIcon,
    Pipette as RGBAIcon,
    Image as ImgIcon,
    Code as BinEditorIcon,
    Wrench as ToolsIcon,
    Settings as SettingsIcon,
    Maximize as UpscaleIcon,
    FileDigit as FileHandlerIcon,
    Waypoints as BumpathIcon,
    FolderInput as AssetExtractorIcon,
    Music as BnkExtractIcon,
    Sparkles as FakeGearIcon,
    Dices as ParticleRandIcon,
    FolderSearch as WadExplorerIcon,
    type LucideIcon,
} from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useNavigationStore, type Page } from '@/lib/stores';

interface ToolCard {
    title: string;
    description: string;
    icon: LucideIcon;
    page: Page;
    isNew?: boolean;
    wip?: boolean;
}

// Order matches the old MainPage 4x4 grid.
const TOOL_CARDS: ToolCard[] = [
    { title: 'Paint', description: 'Customize your particles with ease. Choose from Random Colors, apply a Hue Shift, or generate a range of Shades.', icon: PaintIcon, page: 'paint' },
    { title: 'Port', description: 'Bring particles from different champions or skins into your own custom skin!', icon: PortIcon, page: 'port' },
    { title: 'VFX Hub', description: 'Community-powered VFX sharing exclusively for Divine members.', icon: VFXHubIcon, page: 'vfxhub' },
    { title: 'WAD Explorer', description: 'Advanced explorer for WAD files with live 3D model and texture preview.', icon: WadExplorerIcon, page: 'wadexplorer', isNew: true },

    { title: 'Image Recolor', description: 'Automatically batch recolor DDS or TEX files by simply selecting a folder and clicking "Batch Apply".', icon: ImgIcon, page: 'imgrecolor' },
    { title: 'Bin Editor', description: 'Primarily designed for editing parameters like birthscale directly within Quartz.', icon: BinEditorIcon, page: 'bineditor' },
    { title: 'Asset Extractor', description: 'Extract and decompose League of Legends game assets from WAD files.', icon: AssetExtractorIcon, page: 'extractor' },
    { title: 'Sound Banks', description: 'Extract, edit, and repack audio bank files for custom sound mods.', icon: BnkExtractIcon, page: 'soundbanks' },

    { title: 'Upscale', description: 'AI-powered image upscaling for DDS and PNG texture files.', icon: UpscaleIcon, page: 'upscale' },
    { title: 'FakeGear', description: 'Enables a Ctrl+5 in-game toggle to swap between VFX variants on your custom skin.', icon: FakeGearIcon, page: 'fakegear' },
    { title: 'Randomizer', description: 'Randomize VFX particle parameters across your entire skin at once.', icon: ParticleRandIcon, page: 'particlerandomizer' },
    { title: 'RGBA', description: 'Adjust RGBA color channels on DDS and TEX texture files.', icon: RGBAIcon, page: 'rgba' },

    { title: 'Bumpath', description: 'Repath League of Legends file references across your skin files.', icon: BumpathIcon, page: 'bumpath' },
    { title: 'File Handler', description: 'Universal file processing and randomization utility for bulk operations.', icon: FileHandlerIcon, page: 'filehandler' },
    { title: 'Tools', description: 'Add your own executables and drag-and-drop them with your folder to apply the fixes.', icon: ToolsIcon, page: 'tools' },
    { title: 'Settings', description: 'Select your preferred font and configure the Ritobin CLI path.', icon: SettingsIcon, page: 'settings' },
];

function openExternal(url: string) {
    openUrl(url).catch(() => { window.open(url, '_blank'); });
}

function Home() {
    const setPage = useNavigationStore((s) => s.setPage);
    const [isMinecraftTheme, setIsMinecraftTheme] = useState(false);

    useEffect(() => {
        const getStyle = () => (
            document.documentElement?.getAttribute('data-style') ||
            document.body?.getAttribute('data-style') ||
            ''
        ).toLowerCase();
        const update = () => setIsMinecraftTheme(getStyle() === 'minecraft');
        update();
        const observer = new MutationObserver(update);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-style'] });
        if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['data-style'] });
        return () => observer.disconnect();
    }, []);

    return (
        <Box
            className="main-page-container"
            sx={{
                minHeight: '100%', height: '100%',
                position: 'relative', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                color: 'var(--text)',
            }}
        >
            {/* ---------------------------------------------------------- HERO */}
            <Box sx={{
                position: 'relative',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                minHeight: { xs: '36%', sm: '38%', md: '40%' },
                zIndex: 2,
            }}>
                {/* Primary glow orb */}
                <Box sx={{
                    position: 'absolute', top: '55%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: { xs: 300, sm: 440, md: 580 },
                    height: { xs: 160, sm: 220, md: 280 },
                    background: 'radial-gradient(ellipse, color-mix(in srgb, var(--accent) 12%, transparent) 0%, transparent 68%)',
                    filter: 'blur(32px)',
                    animation: 'glow-pulse 10s ease-in-out infinite',
                    pointerEvents: 'none', zIndex: 0,
                }} />
                {/* Secondary tint orb */}
                <Box sx={{
                    position: 'absolute', top: '45%', left: '52%',
                    transform: 'translate(-50%, -50%)',
                    width: { xs: 200, sm: 300, md: 380 },
                    height: { xs: 100, sm: 150, md: 190 },
                    background: 'radial-gradient(ellipse, color-mix(in srgb, var(--accent2, var(--accent)) 7%, transparent) 0%, transparent 70%)',
                    filter: 'blur(38px)',
                    animation: 'glow-pulse 11s ease-in-out infinite 1.5s',
                    pointerEvents: 'none', zIndex: 0,
                }} />

                {isMinecraftTheme ? (
                    <Box sx={{
                        position: 'relative', zIndex: 1,
                        width: { xs: 'min(82vw, 420px)', sm: 'min(64vw, 520px)', md: 'min(52vw, 620px)' },
                        aspectRatio: '16 / 5',
                        maxHeight: { xs: 110, sm: 130, md: 150 },
                        mb: { xs: 2.25, sm: 2.5, md: 3 },
                        overflow: 'hidden',
                        imageRendering: 'pixelated',
                        backgroundImage: 'url("/quartzminecraft.WEBP")',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                    }} />
                ) : (
                    <>
                        <Typography variant="h1" sx={{
                            position: 'relative', zIndex: 1,
                            fontSize: { xs: '3.8rem', sm: '5.5rem', md: '7rem' },
                            fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1,
                            background: 'linear-gradient(to right, var(--accent), var(--accent2, var(--accent)), var(--accent))',
                            backgroundSize: '200% auto',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            animation: 'shimmer-text 12s linear infinite',
                            willChange: 'background-position',
                            textAlign: 'center',
                            textShadow: '0 0 20px color-mix(in srgb, var(--accent) 30%, transparent)',
                            mb: 1.25, userSelect: 'none',
                        }}>
                            Quartz
                        </Typography>
                        <Typography sx={{
                            position: 'relative', zIndex: 1,
                            color: 'var(--text)',
                            fontSize: { xs: '0.6rem', sm: '0.68rem', md: '0.73rem' },
                            letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 1,
                            mb: { xs: 2.5, sm: 3, md: 3.5 },
                            textAlign: 'center', userSelect: 'none',
                        }}>
                            League of Legends Toolkit
                        </Typography>
                    </>
                )}

                {/* CTA buttons */}
                <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', gap: { xs: 1, sm: 1.5 } }}>
                    <MuiButton
                        onClick={() => openExternal('https://divineskins.gg')}
                        startIcon={<PlayIcon sx={{ fontSize: '0.9rem !important' }} />}
                        sx={{
                            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
                            color: 'var(--text)', fontWeight: 600,
                            px: { xs: 2, sm: 2.5 }, py: { xs: 0.7, sm: 0.9 },
                            borderRadius: '8px',
                            fontSize: { xs: '0.75rem', sm: '0.82rem' },
                            textTransform: 'none', letterSpacing: '0.03em',
                            transition: 'all 0.22s ease',
                            '&:hover': {
                                background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
                                borderColor: 'var(--accent)',
                                boxShadow: '0 0 22px color-mix(in srgb, var(--accent) 28%, transparent)',
                                transform: 'translateY(-1px)',
                            },
                        }}
                    >
                        Website
                    </MuiButton>
                    <MuiButton
                        onClick={() => openExternal('https://wiki.divineskins.gg')}
                        endIcon={<ArrowIcon sx={{ fontSize: '0.9rem !important' }} />}
                        sx={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: 'var(--text)',
                            px: { xs: 2, sm: 2.5 }, py: { xs: 0.7, sm: 0.9 },
                            borderRadius: '8px',
                            fontSize: { xs: '0.75rem', sm: '0.82rem' },
                            textTransform: 'none', letterSpacing: '0.03em',
                            transition: 'all 0.22s ease',
                            '&:hover': {
                                background: 'rgba(255,255,255,0.06)',
                                borderColor: 'rgba(255,255,255,0.28)',
                                transform: 'translateY(-1px)',
                            },
                        }}
                    >
                        Wiki
                    </MuiButton>
                </Box>
            </Box>

            {/* Separator line */}
            <Box sx={{
                flexShrink: 0,
                mx: { xs: 2, sm: 3, md: 4 },
                height: '1px',
                background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 30%, transparent) 40%, color-mix(in srgb, var(--accent) 30%, transparent) 60%, transparent)',
                opacity: 0.4, zIndex: 2,
            }} />

            {/* --------------------------------------------------------- TOOL GRID */}
            <Box sx={{
                flex: 1, minHeight: 0,
                px: { xs: 1.5, sm: 2.5, md: 3.5 },
                pt: { xs: 1.25, sm: 1.5, md: 2 },
                pb: { xs: 1.5, sm: 2, md: 2.5 },
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gridTemplateRows: 'repeat(4, 1fr)',
                gap: { xs: 1, sm: 1.25, md: 1.5 },
                position: 'relative', zIndex: 2,
            }}>
                {TOOL_CARDS.map((tool) => {
                    const Icon = tool.icon;
                    return (
                        <Tooltip
                            key={tool.title}
                            placement="top"
                            arrow
                            enterDelay={400}
                            title={
                                <Box sx={{ maxWidth: 230 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.4 }}>
                                        <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: tool.wip ? 'rgba(255,255,255,0.45)' : 'var(--accent)' }}>
                                            {tool.title}
                                        </Typography>
                                        {tool.isNew && (
                                            <Box sx={{ background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.45)', borderRadius: '4px', px: 0.6, py: 0.1 }}>
                                                <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgb(96,165,250)', lineHeight: 1.4, letterSpacing: '0.04em' }}>NEW</Typography>
                                            </Box>
                                        )}
                                    </Box>
                                    <Typography sx={{ fontSize: '0.72rem', lineHeight: 1.5, color: 'var(--text-2, rgba(255,255,255,0.6))', opacity: 0.85 }}>
                                        {tool.description}
                                    </Typography>
                                </Box>
                            }
                            componentsProps={{
                                tooltip: {
                                    sx: {
                                        background: 'var(--surface)',
                                        border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                                        borderRadius: '10px', p: 1.5,
                                        '& .MuiTooltip-arrow': {
                                            color: 'var(--surface)',
                                            '&::before': { border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' },
                                        },
                                    },
                                },
                            }}
                        >
                            <Box
                                onClick={() => setPage(tool.page)}
                                className="main-page-card"
                                sx={{
                                    background: 'rgba(255,255,255,0.04)',
                                    border: tool.isNew ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(255,255,255,0.055)',
                                    borderRadius: '12px', cursor: 'pointer',
                                    p: { xs: 1.25, sm: 1.5, md: 2 },
                                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                    position: 'relative', overflow: 'hidden',
                                    boxShadow: tool.isNew ? '0 0 18px rgba(59,130,246,0.18)' : 'none',
                                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, background-color 0.2s ease',
                                    '&::before': {
                                        content: '""',
                                        position: 'absolute',
                                        top: 0, left: '20%', right: '20%', height: '1px',
                                        background: tool.isNew
                                            ? 'linear-gradient(90deg, transparent, rgba(59,130,246,0.25), transparent)'
                                            : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)',
                                        pointerEvents: 'none',
                                    },
                                    '&:hover': {
                                        background: 'rgba(255,255,255,0.07)',
                                        borderColor: tool.isNew ? 'rgba(59,130,246,0.65)' : 'color-mix(in srgb, var(--accent) 55%, transparent)',
                                        transform: 'translateY(-3px)',
                                        boxShadow: tool.isNew
                                            ? '0 8px 28px rgba(0,0,0,0.4), 0 0 18px rgba(59,130,246,0.3)'
                                            : '0 8px 28px rgba(0,0,0,0.4), 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent)',
                                    },
                                }}
                            >
                                {tool.isNew && (
                                    <Box sx={{
                                        position: 'absolute', top: 8, right: 8,
                                        background: 'rgba(59,130,246,0.18)',
                                        border: '1px solid rgba(59,130,246,0.5)',
                                        borderRadius: '5px', px: 0.65, py: 0.15,
                                    }}>
                                        <Typography sx={{ fontSize: '0.58rem', fontWeight: 800, color: 'rgb(96,165,250)', lineHeight: 1.4, letterSpacing: '0.06em' }}>NEW</Typography>
                                    </Box>
                                )}

                                <Box sx={{
                                    display: 'flex', alignItems: 'center',
                                    gap: { xs: 0.75, sm: 1 },
                                    pb: { xs: 0.5, sm: 0.65 },
                                    mb: { xs: 0.6, sm: 0.75 },
                                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                                }}>
                                    <Box sx={{
                                        color: 'var(--accent)', display: 'flex', alignItems: 'center', flexShrink: 0,
                                        filter: 'drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 40%, transparent))',
                                    }}>
                                        <Icon size={20} />
                                    </Box>
                                    <Typography sx={{
                                        color: 'var(--text)', fontWeight: 700,
                                        fontSize: { xs: '0.75rem', sm: '0.82rem', md: '0.88rem' },
                                        lineHeight: 1.2, minWidth: 0,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {tool.title}
                                    </Typography>
                                </Box>

                                <Typography sx={{
                                    color: 'var(--text-2, rgba(255,255,255,0.6))',
                                    fontSize: { xs: '0.58rem', sm: '0.63rem', md: '0.67rem' },
                                    lineHeight: 1.4, opacity: 0.72,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}>
                                    {tool.description}
                                </Typography>
                            </Box>
                        </Tooltip>
                    );
                })}
            </Box>

            <style>{`
                @keyframes glow-pulse {
                    0%, 100% { opacity: 0.5; }
                    50%       { opacity: 1;   }
                }
                @keyframes shimmer-text {
                    from { background-position: 0% center; }
                    to { background-position: 200% center; }
                }
            `}</style>
        </Box>
    );
}

export { Home };
export default Home;
