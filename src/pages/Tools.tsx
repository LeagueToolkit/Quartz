import { useState, useEffect, useRef, type DragEvent } from 'react';
import {
    Box, Typography, Button, Grid, List, ListItem, ListItemText, ListItemIcon,
    IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Snackbar, Alert,
    LinearProgress,
} from '@mui/material';
import {
    Add as AddIcon, Delete as DeleteIcon, Folder as FolderIcon, FileCopy as FileCopyIcon,
    Info as InfoIcon, Settings as SettingsIcon, Refresh as RefreshIcon, Apps as AppsIcon,
    EmojiEmotions as EmojiIcon,
} from '@mui/icons-material';
import { open } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { toolsExecute } from '@/lib/api/fileOps';
import { log } from '@/lib/util/logger';
import './tools/Tools.css';
import BinColorCopyCard from './tools/BinColorCopyCard';
import FixVfxShapeCard from './tools/FixVfxShapeCard';
import { POPULAR_EMOJIS } from './tools/popularEmojis';
import {
    loadExes as loadStoredExes, saveExes as saveStoredExes,
    loadEmojiData, saveEmojiData, type StoredExe,
} from './tools/toolsStorage';

type ExeEntry = StoredExe;

interface SnackbarState { open: boolean; message: string; severity: 'info' | 'success' | 'error' | 'warning' }

const basename = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p;
const dirname = (p: string) => {
    const norm = p.replace(/\\/g, '/');
    const idx = norm.lastIndexOf('/');
    return idx >= 0 ? p.slice(0, idx) : p;
};
const isExeName = (name: string) => {
    const l = name.toLowerCase();
    return l.endsWith('.exe') || l.endsWith('.bat') || l.endsWith('.cmd');
};

export function Tools() {
    const [exes, setExes] = useState<ExeEntry[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'info' });
    const [emojiDialog, setEmojiDialog] = useState<{ open: boolean; exeName: string | null }>({ open: false, exeName: null });
    const [selectedEmoji, setSelectedEmoji] = useState('');
    const [dragTarget, setDragTarget] = useState<string | null>(null);

    // Tracks which card the pointer is hovering during an OS drag. The webview
    // drag-drop event is window-global and carries no element, so we keep the
    // card name (resolved from DOM dragover handlers) in a ref to read at drop.
    const dragTargetRef = useRef<string | null>(null);
    const lastDropSigRef = useRef<{ ts: number; names: string[] }>({ ts: 0, names: [] });
    const exesRef = useRef<ExeEntry[]>([]);
    exesRef.current = exes;

    const notify = (message: string, severity: SnackbarState['severity'] = 'info') => setSnackbar({ open: true, message, severity });

    // ─── Persistence (load once on mount, save on change) ───────────────────────
    useEffect(() => {
        const stored = loadStoredExes();
        const emojiData = loadEmojiData();
        setExes(stored.map((e) => ({ ...e, emoji: emojiData[e.name] ?? e.emoji ?? null })));
    }, []);

    useEffect(() => { saveStoredExes(exes); }, [exes]);

    const persistEmoji = (list: ExeEntry[]) => {
        const data: Record<string, string> = {};
        list.forEach((e) => { if (e.emoji) data[e.name] = e.emoji; });
        saveEmojiData(data);
    };

    // ─── Adding executables ─────────────────────────────────────────────────────
    const addExes = (paths: string[]): number => {
        let addedCount = 0;
        setExes((prev) => {
            const existing = new Set(prev.map((e) => e.name.toLowerCase()));
            const added: ExeEntry[] = [];
            for (const p of paths) {
                const name = basename(p);
                const lower = name.toLowerCase();
                if (!isExeName(name)) continue;
                if (existing.has(lower)) continue;
                existing.add(lower);
                added.push({ name, path: p, type: lower.endsWith('.bat') ? 'bat' : 'exe', lastUsed: null, emoji: null });
            }
            addedCount = added.length;
            return added.length > 0 ? [...prev, ...added] : prev;
        });
        return addedCount;
    };

    const processDroppedExes = (paths: string[]) => {
        setIsProcessing(true);
        try {
            // Debounce duplicate drops (the OS can emit the same drop twice).
            const now = Date.now();
            const names = paths.map((p) => basename(p));
            const prev = lastDropSigRef.current;
            const isSameAsLast = now - prev.ts < 600 && names.join('|') === prev.names.join('|');
            lastDropSigRef.current = { ts: now, names };
            if (isSameAsLast) return;

            const added = addExes(paths);
            if (added > 0) notify(`Added ${added} executable(s)`, 'success');
        } finally {
            setIsProcessing(false);
        }
    };

    const pickExe = async () => {
        const picked = await open({ multiple: true, filters: [{ name: 'Executables', extensions: ['exe', 'bat', 'cmd'] }] });
        if (!picked) return;
        const paths = Array.isArray(picked) ? picked : [picked];
        const added = addExes(paths);
        notify(added > 0 ? `Added ${added} executable(s)` : 'No new executables added', added > 0 ? 'success' : 'info');
    };

    const removeExe = (exeName: string) => {
        setExes((prev) => {
            const updated = prev.filter((e) => e.name !== exeName);
            persistEmoji(updated);
            return updated;
        });
        notify(`Removed ${exeName}`, 'success');
    };

    // ─── Running ────────────────────────────────────────────────────────────────
    const runExe = async (exe: ExeEntry, args: string[] = [], cwd?: string) => {
        try {
            const result = await toolsExecute(exe.path, args, { cwd, openConsole: true });
            setExes((prev) => prev.map((e) => (e.name === exe.name ? { ...e, lastUsed: new Date().toISOString() } : e)));
            if (result.code === 0) {
                notify(`${exe.name} completed successfully! Check your folder for changes.`, 'success');
            } else {
                const errMsg = (result.stderr || result.stdout || 'Unknown error').toString().slice(0, 500);
                notify(`${exe.name} failed (code ${result.code}): ${errMsg}`, 'error');
            }
        } catch (e) {
            log.error('runExe', e);
            notify(`Error running ${exe.name}: ${String((e as Error)?.message || e)}`, 'error');
        }
    };

    // Run the target exe against each dropped (non-exe) path — the folder batch flow.
    const runExeAgainstPaths = async (exe: ExeEntry, paths: string[]) => {
        for (const p of paths) {
            try {
                const normalized = p.replace(/\//g, '\\');
                await runExe(exe, [normalized], dirname(normalized));
            } catch (error) {
                log.error('handleExeDrop', error);
                notify(`Error processing ${basename(p)}: ${String((error as Error)?.message || error)}`, 'error');
            }
        }
    };

    // ─── DOM drag handlers (track hovered card; paths come from the OS event) ────
    const handleExeDragOver = (e: DragEvent, exe: ExeEntry) => {
        e.preventDefault();
        e.stopPropagation();
        setDragTarget(exe.name);
        dragTargetRef.current = exe.name;
        setIsDragOver(false);
    };

    const handleExeDragLeave = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragTarget(null);
        dragTargetRef.current = null;
    };

    // Browser-level fallback drop (no paths available in the webview File object);
    // the authoritative drop is the Tauri onDragDropEvent handler below.
    const handleExeDrop = async (e: DragEvent, exe: ExeEntry) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragTargetRef.current) return; // OS handler will run it with real paths
        const dir = await open({ directory: true, multiple: false });
        if (typeof dir === 'string') await runExeAgainstPaths(exe, [dir]);
    };

    // ─── Tauri OS-level drag-drop (provides absolute paths) ──────────────────────
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let cancelled = false;
        (async () => {
            try {
                const webview = getCurrentWebview();
                const handle = await webview.onDragDropEvent((event) => {
                    const payload = event.payload;
                    if (payload.type === 'enter' || payload.type === 'over') {
                        // Show the global overlay only when no card is hovered.
                        if (!dragTargetRef.current) setIsDragOver(true);
                    } else if (payload.type === 'leave') {
                        setIsDragOver(false);
                    } else if (payload.type === 'drop') {
                        setIsDragOver(false);
                        const paths = payload.paths || [];
                        const target = dragTargetRef.current;
                        setDragTarget(null);
                        dragTargetRef.current = null;
                        if (paths.length === 0) return;

                        if (target) {
                            // Dropped onto a specific exe card → run it against each path.
                            const exe = exesRef.current.find((x) => x.name === target);
                            if (exe) void runExeAgainstPaths(exe, paths);
                        } else {
                            // Dropped on the page → add any executables.
                            const exePaths = paths.filter((p) => isExeName(basename(p)));
                            if (exePaths.length > 0) processDroppedExes(exePaths);
                        }
                    }
                });
                if (cancelled) handle(); else unlisten = handle;
            } catch {
                /* Drag-drop unavailable outside Tauri; the dialog flow still works. */
            }
        })();
        return () => { cancelled = true; if (unlisten) unlisten(); };
    }, []);

    // ─── Header actions ──────────────────────────────────────────────────────────
    const reload = () => {
        const stored = loadStoredExes();
        const emojiData = loadEmojiData();
        setExes(stored.map((e) => ({ ...e, emoji: emojiData[e.name] ?? e.emoji ?? null })));
    };

    const openToolsFolder = async () => {
        try {
            // No copied-tools folder in the Tauri port; reveal the directory of the
            // first added executable so the action still does something sensible.
            const first = exes[0];
            if (!first) { notify('Add an executable first', 'info'); return; }
            await openPath(dirname(first.path));
        } catch (error) {
            notify(`Error opening folder: ${String((error as Error)?.message || error)}`, 'error');
        }
    };

    // ─── Emoji dialog ─────────────────────────────────────────────────────────────
    const openEmojiDialog = (exeName: string) => { setEmojiDialog({ open: true, exeName }); setSelectedEmoji(''); };
    const closeEmojiDialog = () => { setEmojiDialog({ open: false, exeName: null }); setSelectedEmoji(''); };
    const setExeEmoji = (exeName: string, emoji: string | null) => {
        setExes((prev) => {
            const updated = prev.map((e) => (e.name === exeName ? { ...e, emoji: emoji || null } : e));
            persistEmoji(updated);
            return updated;
        });
        closeEmojiDialog();
        notify(emoji ? `Emoji ${emoji} added to ${exeName}` : `Emoji removed from ${exeName}`, 'success');
    };

    // ─── Styles ──────────────────────────────────────────────────────────────────
    const cardSx = {
        background: 'rgba(255,255,255,0.026)', border: '1px solid rgba(255,255,255,0.055)', borderRadius: '12px',
        position: 'relative', overflow: 'hidden', transition: 'all 0.2s ease-in-out',
        '&::before': {
            content: '""', position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)', pointerEvents: 'none',
        },
        '&:hover': {
            borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)', background: 'rgba(255,255,255,0.04)',
            transform: 'translateY(-2px)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        },
    } as const;
    const dropZoneSx = (active: boolean) => ({
        p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: '10px',
        border: active ? '1.5px dashed var(--accent)' : '1.5px dashed rgba(255,255,255,0.1)',
        background: active ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'rgba(255,255,255,0.015)',
        transition: 'all 0.2s ease', cursor: 'pointer',
        '&:hover': { borderColor: 'color-mix(in srgb, var(--accent) 60%, transparent)', background: 'rgba(255,255,255,0.035)' },
    } as const);

    return (
        <Box className="tools-root" sx={{ minHeight: '100%', height: '100%', width: '100%', background: 'var(--bg)', color: 'var(--text)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Slim Header */}
            <Box sx={{ p: { xs: 1.5, sm: 2 }, px: { xs: 2, sm: 3 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative', zIndex: 10, background: 'rgba(0,0,0,0.05)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: '10px', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: 'var(--accent)' }}>
                        <AppsIcon />
                    </Box>
                    <Box>
                        <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#fff', lineHeight: 1.2 }}>Tools Manager</Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>Add executables and drag skin folders onto them</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton onClick={reload} size="small" sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: 'var(--accent)' } }}><RefreshIcon fontSize="small" /></IconButton>
                    <IconButton onClick={openToolsFolder} size="small" sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: 'var(--accent)' } }}><FolderIcon fontSize="small" /></IconButton>
                    <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={pickExe}
                        sx={{ ml: 1, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', boxShadow: 'none', borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', fontWeight: 600, px: 2, '&:hover': { background: 'color-mix(in srgb, var(--accent) 25%, transparent)', borderColor: 'var(--accent)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' } }}>
                        Add Exe
                    </Button>
                </Box>
            </Box>

            {/* Main Content */}
            <Box sx={{ flex: 1, p: { xs: 2, sm: 3 }, overflow: 'auto', position: 'relative', zIndex: 1 }}>
                {isProcessing && (
                    <Box sx={{ mb: 3 }}>
                        <LinearProgress sx={{ borderRadius: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { background: 'var(--accent-gradient)' } }} />
                        <Typography sx={{ mt: 1, color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Processing files...</Typography>
                    </Box>
                )}

                <Typography sx={{ color: 'var(--accent)', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1, opacity: 0.8 }}>Built-in Tools</Typography>
                <BinColorCopyCard onNotify={({ message, severity }) => notify(message, severity)} />
                <FixVfxShapeCard onNotify={({ message, severity }) => notify(message, severity)} />

                <Typography sx={{ color: 'var(--accent)', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1, mt: 2, opacity: 0.8 }}>External Executables</Typography>

                {exes.length === 0 ? (
                    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, color: 'rgba(255,255,255,0.25)' }}>
                        <AppsIcon sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
                        <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>No Executables Added</Typography>
                        <Typography variant="body2">Drag and drop .exe files here or use the Add button</Typography>
                    </Box>
                ) : (
                    <Grid container spacing={2.5}>
                        {exes.map((exe) => (
                            <Grid item xs={12} md={6} lg={4} key={exe.name}>
                                <Box
                                    sx={{ ...cardSx, height: '100%', display: 'flex', flexDirection: 'column', p: 2, ...(dragTarget === exe.name && { borderColor: 'var(--accent)', borderWidth: '1px', boxShadow: '0 0 20px color-mix(in srgb, var(--accent) 15%, transparent)', transform: 'translateY(-2px)' }) }}
                                    onDragOver={(e) => handleExeDragOver(e, exe)}
                                    onDragLeave={handleExeDragLeave}
                                    onDrop={(e) => handleExeDrop(e, exe)}
                                >
                                    {/* Card Header */}
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, overflow: 'hidden' }}>
                                            <Box sx={{ fontSize: '1.25rem', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                {exe.emoji || <FileCopyIcon sx={{ fontSize: '1rem', opacity: 0.4 }} />}
                                            </Box>
                                            <Typography sx={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{exe.name}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <IconButton size="small" onClick={() => openEmojiDialog(exe.name)} sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: 'var(--accent)' } }}><EmojiIcon fontSize="inherit" /></IconButton>
                                            <IconButton size="small" onClick={() => removeExe(exe.name)} sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#ff4d4d' } }}><DeleteIcon fontSize="inherit" /></IconButton>
                                        </Box>
                                    </Box>

                                    {/* Drop Zone */}
                                    <Box sx={dropZoneSx(dragTarget === exe.name)}>
                                        <FolderIcon sx={{ fontSize: 28, color: dragTarget === exe.name ? 'var(--accent)' : 'rgba(255,255,255,0.15)' }} />
                                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: dragTarget === exe.name ? 'var(--accent)' : 'rgba(255,255,255,0.35)' }}>Drop skin folders here</Typography>
                                    </Box>

                                    {/* Last used */}
                                    {exe.lastUsed && (
                                        <Box sx={{ mt: 1, flex: 1 }}>
                                            <Typography sx={{ color: 'var(--accent)', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1, opacity: 0.8 }}>Recent Activity</Typography>
                                            <List sx={{ p: 0, '& .MuiListItem-root': { px: 1, py: 0.75, borderRadius: '6px', mb: 0.5, transition: 'all 0.2s', '&:hover': { background: 'rgba(255,255,255,0.03)' } } }}>
                                                <ListItem>
                                                    <ListItemIcon sx={{ minWidth: 28 }}><SettingsIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.25)' }} /></ListItemIcon>
                                                    <ListItemText
                                                        primary="Last run"
                                                        secondary={`Used ${new Date(exe.lastUsed).toLocaleString()}`}
                                                        primaryTypographyProps={{ sx: { fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', fontWeight: 500 } }}
                                                        secondaryTypographyProps={{ sx: { fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', mt: -0.25 } }}
                                                    />
                                                </ListItem>
                                            </List>
                                        </Box>
                                    )}
                                </Box>
                            </Grid>
                        ))}
                    </Grid>
                )}
            </Box>

            {/* Info Strip */}
            <Box sx={{ p: 1.5, px: 3, borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: 2, position: 'relative', zIndex: 10 }}>
                <InfoIcon sx={{ fontSize: 16, color: 'var(--accent)', opacity: 0.8 }} />
                <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                    <strong>Workflow:</strong> Add your favorite tools once, then drag and drop folders onto them to process.
                </Typography>
            </Box>

            {/* Emoji dialog */}
            <Dialog open={emojiDialog.open} onClose={closeEmojiDialog} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--surface, #1a1630)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } }}>
                <DialogTitle sx={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700, pb: 1 }}>Choose Emoji for {emojiDialog.exeName}</DialogTitle>
                <DialogContent>
                    <TextField fullWidth placeholder="Paste any emoji here..." value={selectedEmoji} onChange={(e) => setSelectedEmoji(e.target.value)}
                        sx={{ mb: 2.5, mt: 1, '& .MuiOutlinedInput-root': { background: 'rgba(255,255,255,0.03)', color: '#fff', borderRadius: '8px', fontSize: '0.9rem', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' }, '&.Mui-focused fieldset': { borderColor: 'var(--accent)' } } }} />
                    <Typography sx={{ color: 'var(--accent)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1.5 }}>Popular Choices</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 0.75 }}>
                        {POPULAR_EMOJIS.map((emoji, idx) => (
                            <Button key={idx} onClick={() => setSelectedEmoji(emoji)} sx={{ minWidth: 0, p: 0.5, fontSize: '1.25rem', borderRadius: '6px', background: selectedEmoji === emoji ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedEmoji === emoji ? 'var(--accent)' : 'transparent'}`, '&:hover': { background: 'rgba(255,255,255,0.08)' } }}>{emoji}</Button>
                        ))}
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2.5, pt: 1 }}>
                    <Button onClick={() => emojiDialog.exeName && setExeEmoji(emojiDialog.exeName, null)} sx={{ color: '#ff4d4d', fontSize: '0.8rem', fontWeight: 600, textTransform: 'none' }}>Remove Emoji</Button>
                    <Box sx={{ flex: 1 }} />
                    <Button onClick={closeEmojiDialog} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none', fontWeight: 600 }}>Cancel</Button>
                    <Button onClick={() => emojiDialog.exeName && setExeEmoji(emojiDialog.exeName, selectedEmoji)} disabled={!selectedEmoji} variant="contained"
                        sx={{ background: 'var(--accent)', color: '#000', borderRadius: '8px', textTransform: 'none', fontWeight: 700, px: 3, '&:hover': { background: 'var(--accent)', opacity: 0.9 }, '&.Mui-disabled': { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.2)' } }}>
                        Save Emoji
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                <Alert onClose={() => setSnackbar((s) => ({ ...s, open: false }))} severity={snackbar.severity} variant="filled"
                    sx={{ background: 'var(--surface, #1a1630)', color: '#fff', borderRadius: '10px', border: `1px solid ${snackbar.severity === 'error' ? '#ff4d4d' : snackbar.severity === 'success' ? '#4caf50' : 'var(--accent)'}`, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', '& .MuiAlert-icon': { color: snackbar.severity === 'error' ? '#ff4d4d' : snackbar.severity === 'success' ? '#4caf50' : 'var(--accent)' } }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>

            {/* Global Drag Overlay */}
            <Box sx={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none', display: isDragOver ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', transition: 'opacity 0.2s ease', opacity: isDragOver ? 1 : 0 }}>
                <Box sx={{ p: 6, borderRadius: '24px', textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '2px dashed var(--accent)', backdropFilter: 'blur(16px)', boxShadow: '0 48px 96px rgba(0,0,0,0.6)' }}>
                    <Box sx={{ width: 80, height: 80, borderRadius: '20px', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', mb: 3, mx: 'auto' }}>
                        <AddIcon sx={{ fontSize: 40 }} />
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#fff' }}>Add Executables</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>Drop .exe, .bat, or .cmd files to add them to your manager</Typography>
                </Box>
            </Box>
        </Box>
    );
}

export default Tools;
