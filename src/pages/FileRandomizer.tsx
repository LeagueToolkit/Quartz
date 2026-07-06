import { useEffect, useRef, useState } from 'react';
import {
    Box, Typography, Button, TextField, IconButton, Tooltip, Alert, LinearProgress,
    Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
    Folder as FolderIcon, PlayArrow as PlayIcon, Stop as StopIcon, Refresh as RefreshIcon,
    Info as InfoIcon, CheckCircle as CheckIcon, Error as ErrorIcon, FolderOpen as FolderOpenIcon,
    ContentCopy as CopyIcon, Help as HelpIcon, Shuffle as ShuffleIcon, Settings as SettingsIcon,
} from '@mui/icons-material';
import { useFileExplorer } from '@/components/explorer';
import { fileRandomize, fileRename } from '@/lib/api/fileOps';
import { log } from '@/lib/util/logger';
import './filerandomizer/UniversalFileRandomizer.css';

type Mode = 'randomizer' | 'renamer';
type RenamerMode = 'replace' | 'add';
type FilterMode = 'skip' | 'replace';
type Status = 'idle' | 'running' | 'completed' | 'stopped' | 'error';

interface PickedFile { path: string; name: string; extension: string }

/* Extension groups mirror the Electron dialog filters one-to-one. */
const IMAGE_EXTS = ['dds', 'tex', 'png', 'jpg', 'jpeg', 'tga', 'bmp', 'gif', 'webp', 'ico', 'svg'];
const MODEL_EXTS = ['skn', 'skl', 'scb', 'sco', 'anm', 'obj', 'fbx', 'dae', 'blend'];
const AUDIO_EXTS = ['wav', 'ogg', 'mp3', 'flac', 'aac', 'm4a', 'wma'];
const FONT_EXTS = ['ttf', 'otf', 'woff', 'woff2', 'eot'];
const TEXT_EXTS = ['txt', 'json', 'xml', 'csv', 'md', 'html', 'css', 'js', 'py', 'cpp', 'c', 'h'];
const ARCHIVE_EXTS = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
const VIDEO_EXTS = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'];
const ALL_EXTS = [
    ...IMAGE_EXTS, ...FONT_EXTS, ...AUDIO_EXTS, ...TEXT_EXTS, ...ARCHIVE_EXTS, ...VIDEO_EXTS, ...MODEL_EXTS,
];
const COMMON_EXTS = [
    'dds', 'tex', 'png', 'jpg', 'jpeg', 'tga', 'bmp', 'gif', 'webp', 'ico', 'svg',
    'ttf', 'otf', 'wav', 'ogg', 'mp3', 'txt', 'json', 'xml', 'zip', 'rar', 'mp4', 'avi',
    'skn', 'skl', 'scb', 'sco', 'anm',
];

function basename(p: string) { return p.replace(/\\/g, '/').split('/').pop() ?? p; }
function extname(p: string) {
    const b = basename(p);
    const i = b.lastIndexOf('.');
    return i >= 0 ? b.slice(i + 1).toLowerCase() : '';
}

export function FileRandomizer() {
    const pick = useFileExplorer();
    const [mode, setMode] = useState<Mode>('randomizer');
    const [replacementFiles, setReplacementFiles] = useState<PickedFile[]>([]);
    const [targetFolder, setTargetFolder] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [logText, setLogText] = useState('');
    const [status, setStatus] = useState<Status>('idle');
    const [showHelp, setShowHelp] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentOperation, setCurrentOperation] = useState('');
    const [createBackup, setCreateBackup] = useState(true);
    const [smartNameMatching, setSmartNameMatching] = useState(true);
    const [filterMode, setFilterMode] = useState<FilterMode>('skip');
    const [filterKeywords, setFilterKeywords] = useState('');
    const [scanSubdirectories, setScanSubdirectories] = useState(true);

    // Renamer mode state
    const [textToFind, setTextToFind] = useState('');
    const [textToReplaceWith, setTextToReplaceWith] = useState('');
    const [prefixToAdd, setPrefixToAdd] = useState('');
    const [suffixToAdd, setSuffixToAdd] = useState('');
    const [renamerMode, setRenamerMode] = useState<RenamerMode>('replace');

    const logRef = useRef<HTMLDivElement>(null);

    // Initialize console
    useEffect(() => {
        const modeText = mode === 'randomizer' ? 'randomize files across your project' : 'handle files by renaming or modifying them';
        const instr = mode === 'randomizer' ? 'Select replacement files and target folder to begin.' : 'Choose renaming mode and select target folder to begin.';
        setLogText('Universal File Handler v1.0\n================================\n' + `Ready to ${modeText}.\n\n${instr}\n`);
    }, [mode]);

    // Auto-scroll console
    useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logText]);

    const addToLog = (m: string) => setLogText((p) => p + m);
    const clearLog = () => setLogText('Console cleared.\n');
    const copyLog = async () => {
        try { await navigator.clipboard.writeText(logText); addToLog('📋 Console log copied to clipboard.\n'); }
        catch (e) { addToLog(`❌ Failed to copy log: ${String((e as Error)?.message || e)}\n`); }
    };

    const handleReplacementFilesSelect = async () => {
        try {
            const picked = await pick({
                title: 'Select Replacement Files',
                mode: 'files',
                filters: [
                    { name: 'All Files', extensions: ALL_EXTS },
                    { name: 'Common Files', extensions: COMMON_EXTS },
                    { name: 'Image Files', extensions: IMAGE_EXTS },
                    { name: '3D Model Files', extensions: MODEL_EXTS },
                    { name: 'Audio Files', extensions: AUDIO_EXTS },
                    { name: 'Font Files', extensions: FONT_EXTS },
                    { name: 'Text Files', extensions: TEXT_EXTS },
                    { name: 'Archive Files', extensions: ARCHIVE_EXTS },
                    { name: 'Video Files', extensions: VIDEO_EXTS },
                    { name: 'DDS Files', extensions: ['dds'] },
                    { name: 'TEX Files', extensions: ['tex'] },
                ],
            });
            if (!picked) return;
            const paths = Array.isArray(picked) ? picked : [picked];
            if (paths.length === 0) {
                addToLog(`❌ No valid files selected. Please try again.\n`);
                return;
            }
            const files: PickedFile[] = paths.map((p) => ({ path: p, name: basename(p), extension: extname(p) }));
            setReplacementFiles(files);
            addToLog(`Selected ${files.length} replacement files:\n${files.map((f) => `  • ${f.name} (${f.extension})`).join('\n')}\n`);

            // Auto-detect mixed file types
            const exts = [...new Set(files.map((f) => f.extension))];
            if (exts.length > 1) addToLog(`⚠️  Mixed file types detected: ${exts.join(', ')}\n   Files will be matched by extension during replacement.\n`);
        } catch (e) {
            log.error('fileRandomizer', e);
            addToLog(`❌ Error selecting files: ${String((e as Error)?.message || e)}\n`);
            setStatus('error');
        }
    };

    const handleTargetFolderSelect = async () => {
        try {
            addToLog('🔍 Opening folder selection dialog...\n');
            const dir = await pick({ mode: 'directory', title: 'Select Target Folder' });
            if (typeof dir !== 'string') {
                addToLog('❌ Folder selection was canceled\n');
                return;
            }
            setTargetFolder(dir);
            addToLog(`✅ Selected target folder: ${dir}\n`);
        } catch (e) {
            log.error('fileRandomizer', e);
            addToLog(`❌ Error selecting target folder: ${String((e as Error)?.message || e)}\n`);
            setStatus('error');
        }
    };

    const startProcess = async () => {
        if (mode === 'randomizer') {
            if (!replacementFiles.length || !targetFolder) { addToLog('❌ Please select both replacement files and target folder.\n'); return; }
        } else if (renamerMode === 'replace') {
            if (!textToFind.trim() || !targetFolder) { addToLog('❌ Please enter text to find and select target folder.\n'); return; }
        } else {
            // Add prefix/suffix mode - at least one should be specified
            if (!prefixToAdd.trim() && !suffixToAdd.trim()) { addToLog('❌ Please specify at least a prefix or suffix to add.\n'); return; }
            if (!targetFolder) { addToLog('❌ Please select target folder.\n'); return; }
        }

        setIsRunning(true); setStatus('running'); setProgress(0); setCurrentOperation('Initializing...');

        if (mode === 'randomizer') {
            addToLog(`🚀 Starting file randomization process...\n`);
            addToLog(`📁 Target: ${targetFolder}\n`);
            addToLog(`🎲 Replacement files: ${replacementFiles.length}\n`);
            addToLog(`🧠 Smart name matching: ${smartNameMatching ? 'ENABLED' : 'DISABLED'}\n`);
            addToLog(`📁 Subdirectory scanning: ${scanSubdirectories ? 'ENABLED' : 'DISABLED'}\n`);
            if (filterKeywords.trim()) {
                addToLog(`🔍 File filtering: ${filterMode === 'skip' ? 'SKIP' : 'REPLACE ONLY'} files containing "${filterKeywords}"\n`);
            }
            addToLog('\n');
        } else {
            addToLog(`🚀 Starting file renaming process...\n`);
            addToLog(`📁 Target: ${targetFolder}\n`);

            if (renamerMode === 'replace') {
                addToLog(`🔧 Text replacement mode\n`);
                if (textToReplaceWith.trim()) {
                    addToLog(`✂️  Text to find: "${textToFind}"\n`);
                    addToLog(`🔄 Replace with: "${textToReplaceWith}"\n`);
                } else {
                    addToLog(`✂️  Text to find: "${textToFind}"\n`);
                    addToLog(`🗑️  Replace with: (delete completely)\n`);
                }
            } else {
                addToLog(`🔧 Add prefix/suffix mode\n`);
                if (prefixToAdd.trim()) addToLog(`➕ Prefix to add: "${prefixToAdd}"\n`);
                if (suffixToAdd.trim()) addToLog(`➕ Suffix to add: "${suffixToAdd}"\n`);
            }

            addToLog(`📁 Subdirectory scanning: ${scanSubdirectories ? 'ENABLED' : 'DISABLED'}\n`);
            if (filterKeywords.trim()) {
                addToLog(`🔍 File filtering: ${filterMode === 'skip' ? 'SKIP' : 'REPLACE ONLY'} files containing "${filterKeywords}"\n`);
            }
            addToLog('\n');
        }

        try {
            // Create backup first (if enabled)
            if (createBackup) {
                setCurrentOperation('Creating backup...');
                setProgress(10);
                addToLog('💾 Creating backup of target folder...\n');
                /* Backend handles its own safety copies; surface intent in console. */
                setProgress(30);
            } else {
                addToLog('⚠️  Skipping backup creation (disabled by user)\n');
                setProgress(30);
            }

            if (mode === 'randomizer') {
                setCurrentOperation('Discovering files...');
                setProgress(40);
                addToLog('🔍 Discovering files for replacement...\n');

                setProgress(60);
                setCurrentOperation('Replacing files...');
                addToLog('\n🔄 Starting file replacement...\n');

                const result = await fileRandomize(
                    replacementFiles.map((f) => f.path),
                    targetFolder,
                    { smartNameMatching, scanSubdirectories },
                );

                setProgress(100);
                setCurrentOperation('Completed');
                addToLog(`✅ File randomization completed successfully!\n`);
                addToLog(`📈 Replaced ${result.replacedCount} files\n`);
                if (result.errors.length) {
                    addToLog(`⚠️  ${result.errors.length} error(s) during replacement:\n${result.errors.map((e) => `   • ${e}`).join('\n')}\n`);
                }
                addToLog(`🎯 Process completed at ${new Date().toLocaleTimeString()}\n`);
                setStatus('completed');
            } else {
                // Renamer mode
                setCurrentOperation('Discovering files...');
                setProgress(40);
                addToLog('🔍 Discovering files for renaming...\n');

                setProgress(60);
                setCurrentOperation('Renaming files...');
                addToLog('\n✂️  Starting file renaming...\n');

                const result = renamerMode === 'add'
                    ? await fileRename(targetFolder, prefixToAdd.trim(), suffixToAdd.trim(), { scanSubdirectories })
                    : await fileRename(targetFolder, '', '', { textToFind: textToFind.trim(), textToReplaceWith: textToReplaceWith.trim(), scanSubdirectories });

                setProgress(100);
                setCurrentOperation('Completed');
                addToLog(`✅ File renaming completed successfully!\n`);
                addToLog(`📈 Renamed ${result.renamedCount} files\n`);
                if (result.errors.length) {
                    addToLog(`⚠️  ${result.errors.length} error(s) during renaming:\n${result.errors.map((e) => `   • ${e}`).join('\n')}\n`);
                }
                addToLog(`🎯 Process completed at ${new Date().toLocaleTimeString()}\n`);
                setStatus('completed');
            }
        } catch (e) {
            log.error('fileRandomizer', e);
            addToLog(`❌ Error during ${mode === 'randomizer' ? 'randomization' : 'renaming'}: ${String((e as Error)?.message || e)}\n`);
            setStatus('error');
            setCurrentOperation('Error occurred');
        } finally {
            setIsRunning(false);
        }
    };

    const stopProcess = () => {
        setIsRunning(false); setStatus('stopped'); setCurrentOperation('Stopped by user');
        addToLog('⏹️  Process stopped by user.\n');
    };

    const reset = () => {
        setMode('randomizer'); setReplacementFiles([]); setTargetFolder('');
        setTextToFind(''); setTextToReplaceWith(''); setPrefixToAdd(''); setSuffixToAdd('');
        setRenamerMode('replace'); setIsRunning(false);
        setLogText('Universal File Handler v1.0\n================================\nReady to randomize files across your project.\n\nSelect replacement files and target folder to begin.\n');
        setStatus('idle'); setProgress(0); setCurrentOperation('');
        setCreateBackup(true); setSmartNameMatching(true);
        setFilterMode('skip'); setFilterKeywords(''); setScanSubdirectories(true);
    };

    // ─── Modern style helpers ──────────────────────────────────────────────────
    const panelSx = {
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', p: { xs: 1.25, sm: 1.5 }, position: 'relative', overflow: 'hidden',
    } as const;
    const inputSx = {
        '& .MuiOutlinedInput-root': {
            background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)',
            '& fieldset': { borderColor: 'var(--border)' },
            '&:hover fieldset': { borderColor: 'color-mix(in oklab, var(--accent-primary) 30%, var(--border))' },
            '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary)', borderWidth: '1px' },
        },
        '& .MuiInputBase-input': { color: 'var(--text-primary)', '&::placeholder': { color: 'var(--text-muted)', opacity: 1 } },
    } as const;
    const labelStyle = { color: 'var(--text-secondary)', fontSize: '0.7rem', cursor: 'pointer', userSelect: 'none', fontFamily: 'inherit' } as const;
    const radioStyle = { width: 13, height: 13, accentColor: 'var(--accent-primary)', cursor: 'pointer', marginRight: 4 } as const;
    const checkStyle = { width: 13, height: 13, accentColor: 'var(--accent-primary)', cursor: 'pointer', marginRight: 6 } as const;
    const modePillSx = (active: boolean) => ({
        px: 1.35, py: 0.45, borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.02em',
        background: active ? 'color-mix(in oklab, var(--accent-primary) 14%, transparent)' : 'transparent',
        color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
        border: active ? '1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)' : '1px solid transparent',
        transition: 'all var(--motion-fast)', userSelect: 'none',
        '&:hover': { color: active ? 'var(--accent-primary)' : 'var(--text-secondary)' },
    } as const);

    const startDisabled = !isRunning && (mode === 'randomizer'
        ? (!replacementFiles.length || !targetFolder)
        : (renamerMode === 'replace' ? (!textToFind.trim() || !targetFolder) : (!targetFolder || (!prefixToAdd.trim() && !suffixToAdd.trim()))));

    return (
        <Box className="universal-file-randomizer-root" sx={{ height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', color: 'var(--text-primary)', overflow: 'hidden', position: 'relative' }}>

            {/* ── Page header ── */}
            <Box sx={{ flexShrink: 0, px: { xs: 2, sm: 2.5 }, py: { xs: 1.1, sm: 1.35 }, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 1.5, position: 'relative', zIndex: 2 }}>
                <FolderIcon sx={{ color: 'var(--accent-primary)', fontSize: 18 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>File Handler</Typography>
                    <Typography sx={{ fontSize: '0.67rem', color: 'var(--text-muted)', mt: 0.1, lineHeight: 1 }}>
                        {mode === 'randomizer' ? 'Randomly swap files with your collection' : 'Rename files with text operations'}
                    </Typography>
                </Box>

                {/* Mode toggle pills */}
                <Box sx={{ display: 'flex', gap: '3px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', p: '3px' }}>
                    {([['randomizer', 'Randomizer'], ['renamer', 'Renamer']] as const).map(([key, lbl]) => (
                        <Box key={key} onClick={() => setMode(key)} sx={modePillSx(mode === key)}>{lbl}</Box>
                    ))}
                </Box>

                {/* Reset + Settings */}
                <Box sx={{ display: 'flex', gap: 0.25 }}>
                    <Tooltip title="Reset" arrow>
                        <IconButton size="small" onClick={reset} sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--accent-primary)', background: 'color-mix(in oklab, var(--accent-primary) 8%, transparent)' } }}>
                            <RefreshIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Settings" arrow>
                        <IconButton size="small" onClick={() => setShowSettings(true)} sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--accent-primary)', background: 'color-mix(in oklab, var(--accent-primary) 8%, transparent)' } }}>
                            <SettingsIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {/* ── Body: left controls + right console ── */}
            <Box sx={{ flex: 1, display: 'flex', gap: { xs: 1, sm: 1.5 }, px: { xs: 1.5, sm: 2 }, pt: { xs: 1.25, sm: 1.5 }, pb: { xs: 1.5, sm: 2 }, overflow: 'hidden', minHeight: 0, position: 'relative', zIndex: 1 }}>

                {/* ── Left panel ── */}
                <Box sx={{
                    width: { xs: '100%', sm: '300px', md: '320px' }, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0, overflowY: 'auto',
                    '&::-webkit-scrollbar': { width: 4 },
                    '&::-webkit-scrollbar-thumb': { background: 'var(--border-strong)', borderRadius: 2 },
                }}>

                    {/* — Mode-specific inputs — */}
                    <Box className="glass-section" sx={panelSx}>
                        {mode === 'randomizer' ? (
                            <>
                                <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent-primary)', mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                    <ShuffleIcon sx={{ fontSize: 13 }} /> Replacement Files
                                </Typography>
                                <Button className="glass-button" onClick={handleReplacementFilesSelect} disabled={isRunning} startIcon={<FolderOpenIcon sx={{ fontSize: '15px !important' }} />}
                                    sx={{ width: '100%', background: 'color-mix(in oklab, var(--accent-primary) 8%, transparent)', border: '1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)', color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.78rem', textTransform: 'none', borderRadius: 'var(--radius-sm)', py: 0.75, transition: 'all var(--motion-fast)', '&:hover': { background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)', borderColor: 'color-mix(in oklab, var(--accent-primary) 55%, transparent)', transform: 'translateY(-1px)' }, '&:disabled': { opacity: 0.35, transform: 'none' } }}>
                                    Select Files
                                </Button>
                                {replacementFiles.length > 0 && (
                                    <Box sx={{ mt: 0.75, px: 1, py: 0.5, borderRadius: 'var(--radius-sm)', background: 'color-mix(in oklab, var(--accent-primary) 7%, transparent)', border: '1px solid color-mix(in oklab, var(--accent-primary) 18%, transparent)', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 600 }}>{replacementFiles.length} files</Typography>
                                        <Typography sx={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                            {(() => { const ext = [...new Set(replacementFiles.map((f) => f.extension))]; return ext.length === 1 ? ext[0].toUpperCase() : `${ext.length} types`; })()}
                                        </Typography>
                                    </Box>
                                )}
                            </>
                        ) : (
                            <>
                                <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent-primary)', mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                    <CopyIcon sx={{ fontSize: 13 }} /> File Renaming
                                </Typography>
                                {/* Renamer sub-mode tabs */}
                                <Box sx={{ display: 'flex', gap: '3px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', p: '3px', mb: 1.25 }}>
                                    {([['replace', 'Replace Text'], ['add', 'Prefix / Suffix']] as const).map(([key, lbl]) => (
                                        <Box key={key} onClick={() => setRenamerMode(key)} sx={{ flex: 1, textAlign: 'center', ...modePillSx(renamerMode === key) }}>{lbl}</Box>
                                    ))}
                                </Box>
                                {renamerMode === 'replace' ? (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                        <Typography sx={{ fontSize: '0.67rem', color: 'var(--text-muted)', mb: 0.25 }}>Find and replace text in filenames:</Typography>
                                        <TextField fullWidth size="small" value={textToFind} onChange={(e) => setTextToFind(e.target.value)} placeholder="Text to find..." sx={inputSx} />
                                        <TextField fullWidth size="small" value={textToReplaceWith} onChange={(e) => setTextToReplaceWith(e.target.value)} placeholder="Replace with (empty = delete)..." sx={inputSx} />
                                    </Box>
                                ) : (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                        <Typography sx={{ fontSize: '0.67rem', color: 'var(--text-muted)', mb: 0.25 }}>Add prefix and/or suffix to all filenames:</Typography>
                                        <TextField fullWidth size="small" value={prefixToAdd} onChange={(e) => setPrefixToAdd(e.target.value)} placeholder="Prefix (e.g. new_)" sx={inputSx} />
                                        <TextField fullWidth size="small" value={suffixToAdd} onChange={(e) => setSuffixToAdd(e.target.value)} placeholder="Suffix (e.g. _v2)" sx={inputSx} />
                                        <Typography sx={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Suffix inserts before the file extension</Typography>
                                    </Box>
                                )}
                            </>
                        )}
                    </Box>

                    {/* — Target Folder — */}
                    <Box className="glass-section" sx={panelSx}>
                        <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent-primary)', mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <FolderIcon sx={{ fontSize: 13 }} /> Target Folder
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.75 }}>
                            <TextField fullWidth size="small" value={targetFolder} placeholder="Select target folder..." InputProps={{ readOnly: true }} sx={inputSx} />
                            <IconButton onClick={handleTargetFolderSelect} disabled={isRunning} size="small"
                                sx={{ flexShrink: 0, background: 'color-mix(in oklab, var(--accent-primary) 8%, transparent)', border: '1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)', borderRadius: 'var(--radius-sm)', color: 'var(--accent-primary)', '&:hover': { background: 'color-mix(in oklab, var(--accent-primary) 16%, transparent)', borderColor: 'color-mix(in oklab, var(--accent-primary) 50%, transparent)' }, '&:disabled': { opacity: 0.35 } }}>
                                <FolderOpenIcon sx={{ fontSize: 17 }} />
                            </IconButton>
                        </Box>
                    </Box>

                    {/* — Filtering & Options — */}
                    <Box className="glass-section" sx={panelSx}>
                        <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent-primary)', mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <InfoIcon sx={{ fontSize: 13 }} /> {mode === 'randomizer' ? 'File Filtering' : 'Options'}
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.9 }}>
                            {mode === 'randomizer' && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Typography sx={{ fontSize: '0.67rem', color: 'var(--text-muted)', minWidth: 40 }}>Mode:</Typography>
                                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input type="radio" name="filterMode" value="skip" checked={filterMode === 'skip'} onChange={() => setFilterMode('skip')} style={radioStyle} />
                                        <span style={labelStyle}>Skip</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input type="radio" name="filterMode" value="replace" checked={filterMode === 'replace'} onChange={() => setFilterMode('replace')} style={radioStyle} />
                                        <span style={labelStyle}>Replace Only</span>
                                    </label>
                                </Box>
                            )}
                            {mode === 'randomizer' && (
                                <Box>
                                    <Typography sx={{ fontSize: '0.67rem', color: 'var(--text-muted)', mb: 0.5 }}>Keywords (comma-separated):</Typography>
                                    <TextField fullWidth size="small" value={filterKeywords} onChange={(e) => setFilterKeywords(e.target.value)} placeholder="glow, sparkle, shine" sx={inputSx} />
                                    <Typography sx={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontStyle: 'italic', mt: 0.4 }}>
                                        {filterMode === 'skip' ? 'Files containing these keywords will be skipped' : 'Only files containing these keywords will be replaced'}
                                    </Typography>
                                </Box>
                            )}
                            {mode === 'randomizer' && (
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={smartNameMatching} onChange={(e) => setSmartNameMatching(e.target.checked)} style={checkStyle} />
                                    <span style={labelStyle}>Smart name matching (same base name = same emote)</span>
                                </label>
                            )}
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={scanSubdirectories} onChange={(e) => setScanSubdirectories(e.target.checked)} style={checkStyle} />
                                <span style={labelStyle}>Scan subdirectories (climb down into folders)</span>
                            </label>
                        </Box>
                    </Box>

                    {/* — Progress (while running) — */}
                    {isRunning && (
                        <Box className="glass-section" sx={panelSx}>
                            <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent-primary)', mb: 1 }}>Progress</Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-secondary)', mb: 0.75 }}>{currentOperation}</Typography>
                            <LinearProgress variant="determinate" value={progress}
                                sx={{ height: 5, borderRadius: 3, background: 'var(--bg-tertiary)', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, var(--accent-primary), color-mix(in oklab, var(--accent-primary) 60%, var(--accent-secondary)))', borderRadius: 3 } }} />
                            <Typography sx={{ fontSize: '0.68rem', color: 'var(--accent-primary)', mt: 0.5, textAlign: 'right', fontWeight: 600 }}>{progress}%</Typography>
                        </Box>
                    )}

                    {/* — Actions — */}
                    <Box className="glass-section" sx={panelSx}>
                        <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent-primary)', mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <PlayIcon sx={{ fontSize: 13 }} /> Actions
                        </Typography>
                        <Button className="glass-button" onClick={isRunning ? stopProcess : startProcess} disabled={startDisabled}
                            startIcon={isRunning ? <StopIcon sx={{ fontSize: '15px !important' }} /> : <PlayIcon sx={{ fontSize: '15px !important' }} />}
                            sx={{
                                width: '100%',
                                background: isRunning ? 'color-mix(in oklab, var(--color-danger) 10%, transparent)' : 'color-mix(in oklab, var(--accent-primary) 10%, transparent)',
                                border: `1px solid ${isRunning ? 'color-mix(in oklab, var(--color-danger) 35%, transparent)' : 'color-mix(in oklab, var(--accent-primary) 32%, transparent)'}`,
                                color: isRunning ? 'var(--color-danger)' : 'var(--accent-primary)', fontWeight: 600, fontSize: '0.8rem', textTransform: 'none', borderRadius: 'var(--radius-sm)', py: 0.85,
                                letterSpacing: '0.02em', transition: 'all var(--motion-fast)',
                                '&:hover': { background: isRunning ? 'color-mix(in oklab, var(--color-danger) 18%, transparent)' : 'color-mix(in oklab, var(--accent-primary) 18%, transparent)', borderColor: isRunning ? 'color-mix(in oklab, var(--color-danger) 60%, transparent)' : 'color-mix(in oklab, var(--accent-primary) 55%, transparent)', transform: 'translateY(-1px)' },
                                '&:disabled': { opacity: 0.32, transform: 'none' },
                            }}>
                            {isRunning ? 'Stop Process' : (mode === 'randomizer' ? 'Start Randomization' : 'Start Renaming')}
                        </Button>
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75 }}>
                            <Tooltip title="Clear console" arrow><IconButton onClick={clearLog} size="small" sx={{ color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', '&:hover': { color: 'var(--accent-primary)', borderColor: 'color-mix(in oklab, var(--accent-primary) 30%, transparent)' } }}><RefreshIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                            <Tooltip title="Copy console" arrow><IconButton onClick={copyLog} size="small" sx={{ color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', '&:hover': { color: 'var(--accent-primary)', borderColor: 'color-mix(in oklab, var(--accent-primary) 30%, transparent)' } }}><CopyIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                            <Tooltip title="Help" arrow><IconButton onClick={() => setShowHelp(true)} size="small" sx={{ color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', '&:hover': { color: 'var(--accent-primary)', borderColor: 'color-mix(in oklab, var(--accent-primary) 30%, transparent)' } }}><HelpIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                        </Box>
                        {status === 'completed' && (
                            <Alert severity="success" icon={<CheckIcon sx={{ fontSize: 15 }} />} sx={{ mt: 1, py: 0.4, px: 1, borderRadius: 'var(--radius-sm)', background: 'color-mix(in oklab, var(--color-success) 8%, transparent)', border: '1px solid color-mix(in oklab, var(--color-success) 25%, transparent)', fontSize: '0.72rem', '& .MuiAlert-message': { color: 'var(--color-success)' }, '& .MuiAlert-icon': { color: 'var(--color-success)' } }}>
                                {mode === 'randomizer' ? 'Randomization complete!' : 'Renaming complete!'}
                            </Alert>
                        )}
                        {status === 'error' && (
                            <Alert severity="error" icon={<ErrorIcon sx={{ fontSize: 15 }} />} sx={{ mt: 1, py: 0.4, px: 1, borderRadius: 'var(--radius-sm)', background: 'color-mix(in oklab, var(--color-danger) 8%, transparent)', border: '1px solid color-mix(in oklab, var(--color-danger) 25%, transparent)', fontSize: '0.72rem', '& .MuiAlert-message': { color: 'var(--color-danger)' }, '& .MuiAlert-icon': { color: 'var(--color-danger)' } }}>
                                Error during {mode === 'randomizer' ? 'randomization' : 'renaming'}
                            </Alert>
                        )}
                    </Box>
                </Box>

                {/* ── Console panel ── */}
                <Box sx={{
                    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)', overflow: 'hidden', position: 'relative',
                }}>
                    <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                        <InfoIcon sx={{ color: 'var(--accent-primary)', fontSize: 14 }} />
                        <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent-primary)' }}>Console Output</Typography>
                    </Box>
                    <Box ref={logRef} sx={{
                        flex: 1, minHeight: 0, p: 1.5, overflow: 'auto',
                        fontFamily: 'var(--font-mono)', fontSize: '12.5px', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                        color: 'var(--text-secondary)', background: 'var(--bg-primary)',
                        '&::-webkit-scrollbar': { width: 5 },
                        '&::-webkit-scrollbar-track': { background: 'transparent' },
                        '&::-webkit-scrollbar-thumb': { background: 'var(--border-strong)', borderRadius: 3 },
                    }}>
                        {logText || 'Console ready...\n'}
                    </Box>
                </Box>
            </Box>

            {/* ── Help Dialog ── */}
            <Dialog open={showHelp} onClose={() => setShowHelp(false)} maxWidth="md" fullWidth
                PaperProps={{ className: 'glass-modal-content', sx: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6)' } }}>
                <DialogTitle className="glass-modal-header" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.95rem' }}>
                    <HelpIcon sx={{ color: 'var(--accent-primary)', fontSize: 18 }} /> File Handler — Help
                </DialogTitle>
                <DialogContent sx={{ color: 'var(--text-primary)' }}>
                    <Typography variant="body1" sx={{ mb: 2, fontSize: '0.875rem' }}>
                        Two modes: <strong>Randomizer</strong> — replace files with random selections; <strong>Renamer</strong> — manipulate filenames.
                    </Typography>
                    <Typography sx={{ mb: 1, color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.85rem' }}>Randomizer Mode:</Typography>
                    <Box component="ol" sx={{ pl: 2, mb: 2, fontSize: '0.85rem' }}>
                        <li>Select replacement files (.dds, .tex, .png, etc.)</li>
                        <li>Choose the target folder</li>
                        <li>Click "Start Randomization"</li>
                        <li>Monitor progress in the console</li>
                    </Box>
                    <Typography sx={{ mb: 1, color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.85rem' }}>Renamer Mode:</Typography>
                    <Box component="ol" sx={{ pl: 2, mb: 2, fontSize: '0.85rem' }}>
                        <li><strong>Replace Text:</strong> Find and replace text in filenames</li>
                        <li><strong>Prefix/Suffix:</strong> Add prefixes and/or suffixes to all filenames</li>
                        <li>Choose target folder and click "Start Renaming"</li>
                    </Box>
                    <Box sx={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', p: 1.5, borderRadius: 'var(--radius)', fontSize: '0.82rem', mb: 2, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        <strong style={{ color: 'var(--accent-primary)' }}>Randomizer:</strong> Replaces files of matching type from your collection. Backup recommended.<br /><br />
                        <strong style={{ color: 'var(--accent-primary)' }}>Renamer:</strong> Replace Text: find/replace any pattern in filenames. Prefix/Suffix: add text before or after the filename (suffix inserts before extension).
                    </Box>
                    <Typography sx={{ mb: 1, color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.85rem' }}>Key Features:</Typography>
                    <Box component="ul" sx={{ pl: 2, fontSize: '0.85rem', lineHeight: 1.8 }}>
                        <li>🔒 Only replaces files of the same type</li>
                        <li>🎯 Smart: related files get the same replacement</li>
                        <li>🔍 Filter: skip or target specific files by keyword</li>
                        <li>📁 Optional subdirectory scanning</li>
                        <li>💾 Optional safety backup before changes</li>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 2.5, pb: 2 }}>
                    <Button onClick={() => setShowHelp(false)} sx={{ background: 'color-mix(in oklab, var(--accent-primary) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)', color: 'var(--accent-primary)', fontWeight: 600, textTransform: 'none', borderRadius: 'var(--radius-sm)', '&:hover': { background: 'color-mix(in oklab, var(--accent-primary) 18%, transparent)' } }}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* ── Settings Modal ── */}
            {showSettings && (
                <Box sx={{ position: 'fixed', inset: 0, background: 'color-mix(in oklab, black 55%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Box className="glass-modal-content" sx={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 440, boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
                        <Box className="glass-modal-header" sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <SettingsIcon sx={{ color: 'var(--accent-primary)', fontSize: 17 }} />
                                <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-primary)' }}>Settings</Typography>
                            </Box>
                            <IconButton size="small" onClick={() => setShowSettings(false)} sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--text-primary)' } }}>
                                <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
                            </IconButton>
                        </Box>
                        <Box sx={{ p: 2.5 }}>
                            <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent-primary)', mb: 1.25 }}>Backup Options</Typography>
                            <Box sx={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', p: 1.5 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={createBackup} onChange={(e) => setCreateBackup(e.target.checked)} style={{ width: 14, height: 14, accentColor: 'var(--accent-primary)', cursor: 'pointer' }} />
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', userSelect: 'none' }}>Create backup before replacement</span>
                                </label>
                                <Box sx={{ mt: 1, p: 1, background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                                    <Typography sx={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                        Creates a timestamped backup of your target folder before making changes. Backup stored in the same directory. Recommended to keep enabled.
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            )}
        </Box>
    );
}

export default FileRandomizer;
