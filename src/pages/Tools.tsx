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
import { useFileExplorer } from '@/components/explorer';
import { openPath } from '@tauri-apps/plugin-opener';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { toolsExecute } from '@/lib/api/fileOps';
import { log } from '@/lib/util/logger';
import './tools/Tools.css';
import './tools/tools-cards.css';
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
    const pick = useFileExplorer();
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
        const picked = await pick({ mode: 'files', filters: [{ name: 'Executables', extensions: ['exe', 'bat', 'cmd'] }] });
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
        const dir = await pick({ mode: 'directory' });
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
        background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        position: 'relative', overflow: 'hidden', transition: 'all var(--motion-fast)',
        // Accent hairline down the left edge, matching the built-in tool cards.
        '&::before': {
            content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
            background: 'linear-gradient(180deg, var(--accent-primary), color-mix(in oklab, var(--accent-primary) 40%, transparent))',
            opacity: 0.9,
        },
        '&:hover': {
            borderColor: 'color-mix(in oklab, var(--accent-primary) 35%, var(--border))',
            transform: 'translateY(-2px)', boxShadow: '0 8px 24px -8px rgba(0,0,0,0.5)',
        },
    } as const;
    const dropZoneSx = (active: boolean) => ({
        p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 'var(--radius)',
        border: active ? '1.5px dashed var(--accent-primary)' : '1.5px dashed color-mix(in oklab, var(--border) 80%, transparent)',
        background: active
            ? 'color-mix(in oklab, var(--accent-primary) 10%, transparent)'
            : 'color-mix(in oklab, var(--bg-tertiary) 60%, transparent)',
        transition: 'all var(--motion-fast)', cursor: 'pointer',
        '&:hover': { borderColor: 'color-mix(in oklab, var(--accent-primary) 60%, var(--border))', background: 'var(--bg-hover)' },
    } as const);

    return (
        <Box className="tools-root" sx={{ minHeight: '100%', height: '100%', width: '100%', background: 'var(--bg-primary)', color: 'var(--text-primary)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Slim Header */}
            <Box sx={{ p: { xs: 1.5, sm: 2 }, px: { xs: 2, sm: 3 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 10, background: 'var(--bg-secondary)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: 'var(--radius)', background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid color-mix(in oklab, var(--accent-primary) 25%, transparent)', color: 'var(--accent-primary)' }}>
                        <AppsIcon />
                    </Box>
                    <Box>
                        <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>Tools Manager</Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>Add executables and drag skin folders onto them</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton onClick={reload} size="small" sx={{ color: 'var(--text-secondary)', '&:hover': { color: 'var(--accent-primary)' } }}><RefreshIcon fontSize="small" /></IconButton>
                    <IconButton onClick={openToolsFolder} size="small" sx={{ color: 'var(--text-secondary)', '&:hover': { color: 'var(--accent-primary)' } }}><FolderIcon fontSize="small" /></IconButton>
                    <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={pickExe}
                        sx={{ ml: 1, background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)', color: 'var(--accent-primary)', border: '1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)', boxShadow: 'none', borderRadius: 'var(--radius-sm)', textTransform: 'none', fontSize: '0.75rem', fontWeight: 600, px: 2, '&:hover': { background: 'color-mix(in oklab, var(--accent-primary) 25%, transparent)', borderColor: 'var(--accent-primary)', boxShadow: 'none' } }}>
                        Add Exe
                    </Button>
                </Box>
            </Box>

            {/* Main Content */}
            <Box sx={{ flex: 1, p: { xs: 2, sm: 3 }, overflow: 'auto', position: 'relative', zIndex: 1 }}>
                {isProcessing && (
                    <Box sx={{ mb: 3 }}>
                        <LinearProgress sx={{ borderRadius: 1, height: 6, backgroundColor: 'var(--bg-tertiary)', '& .MuiLinearProgress-bar': { background: 'var(--accent-gradient)' } }} />
                        <Typography sx={{ mt: 1, color: 'var(--accent-primary)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Processing files...</Typography>
                    </Box>
                )}

                <div className="tc-section-label"><span className="tc-section-label__accent">Built-in Tools</span></div>
                <BinColorCopyCard onNotify={({ message, severity }) => notify(message, severity)} />
                <FixVfxShapeCard onNotify={({ message, severity }) => notify(message, severity)} />

                <div className="tc-section-label" style={{ marginTop: 24 }}><span className="tc-section-label__accent">External Executables</span></div>

                {exes.length === 0 ? (
                    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, color: 'var(--text-muted)' }}>
                        <AppsIcon sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
                        <Typography variant="h6" sx={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No Executables Added</Typography>
                        <Typography variant="body2">Drag and drop .exe files here or use the Add button</Typography>
                    </Box>
                ) : (
                    <Grid container spacing={2.5}>
                        {exes.map((exe) => (
                            <Grid item xs={12} md={6} lg={4} key={exe.name}>
                                <Box
                                    sx={{ ...cardSx, height: '100%', display: 'flex', flexDirection: 'column', p: 2, ...(dragTarget === exe.name && { borderColor: 'var(--accent-primary)', borderWidth: '1px', boxShadow: '0 0 0 1px color-mix(in oklab, var(--accent-primary) 30%, transparent)', transform: 'translateY(-2px)' }) }}
                                    onDragOver={(e) => handleExeDragOver(e, exe)}
                                    onDragLeave={handleExeDragLeave}
                                    onDrop={(e) => handleExeDrop(e, exe)}
                                >
                                    {/* Card Header */}
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, overflow: 'hidden' }}>
                                            <Box sx={{ fontSize: '1.25rem', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                                                {exe.emoji || <FileCopyIcon sx={{ fontSize: '1rem', color: 'var(--text-muted)' }} />}
                                            </Box>
                                            <Typography sx={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{exe.name}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <IconButton size="small" onClick={() => openEmojiDialog(exe.name)} sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--accent-primary)' } }}><EmojiIcon fontSize="inherit" /></IconButton>
                                            <IconButton size="small" onClick={() => removeExe(exe.name)} sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--color-danger)' } }}><DeleteIcon fontSize="inherit" /></IconButton>
                                        </Box>
                                    </Box>

                                    {/* Drop Zone */}
                                    <Box sx={dropZoneSx(dragTarget === exe.name)}>
                                        <FolderIcon sx={{ fontSize: 28, color: dragTarget === exe.name ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: dragTarget === exe.name ? 'var(--accent-primary)' : 'var(--text-muted)' }}>Drop skin folders here</Typography>
                                    </Box>

                                    {/* Last used */}
                                    {exe.lastUsed && (
                                        <Box sx={{ mt: 1, flex: 1 }}>
                                            <Typography sx={{ color: 'var(--accent-primary)', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1 }}>Recent Activity</Typography>
                                            <List sx={{ p: 0, '& .MuiListItem-root': { px: 1, py: 0.75, borderRadius: 'var(--radius-sm)', mb: 0.5, transition: 'all var(--motion-fast)', '&:hover': { background: 'var(--bg-tertiary)' } } }}>
                                                <ListItem>
                                                    <ListItemIcon sx={{ minWidth: 28 }}><SettingsIcon sx={{ fontSize: 16, color: 'var(--text-muted)' }} /></ListItemIcon>
                                                    <ListItemText
                                                        primary="Last run"
                                                        secondary={`Used ${new Date(exe.lastUsed).toLocaleString()}`}
                                                        primaryTypographyProps={{ sx: { fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500 } }}
                                                        secondaryTypographyProps={{ sx: { fontSize: '0.62rem', color: 'var(--text-muted)', mt: -0.25 } }}
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
            <Box sx={{ p: 1.5, px: 3, borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 2, position: 'relative', zIndex: 10 }}>
                <InfoIcon sx={{ fontSize: 16, color: 'var(--accent-primary)' }} />
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    <strong>Workflow:</strong> Add your favorite tools once, then drag and drop folders onto them to process.
                </Typography>
            </Box>

            {/* Emoji dialog */}
            <Dialog open={emojiDialog.open} onClose={closeEmojiDialog} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6)' } }}>
                <DialogTitle sx={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 700, pb: 1 }}>Choose Emoji for {emojiDialog.exeName}</DialogTitle>
                <DialogContent>
                    <TextField fullWidth placeholder="Paste any emoji here..." value={selectedEmoji} onChange={(e) => setSelectedEmoji(e.target.value)}
                        sx={{ mb: 2.5, mt: 1, '& .MuiOutlinedInput-root': { background: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', '& fieldset': { borderColor: 'var(--border)' }, '&:hover fieldset': { borderColor: 'color-mix(in oklab, var(--accent-primary) 30%, var(--border))' }, '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary)' } } }} />
                    <Typography sx={{ color: 'var(--accent-primary)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1.5 }}>Popular Choices</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 0.75 }}>
                        {POPULAR_EMOJIS.map((emoji, idx) => (
                            <Button key={idx} onClick={() => setSelectedEmoji(emoji)} sx={{ minWidth: 0, p: 0.5, fontSize: '1.25rem', borderRadius: 'var(--radius-sm)', background: selectedEmoji === emoji ? 'color-mix(in oklab, var(--accent-primary) 20%, transparent)' : 'var(--bg-tertiary)', border: `1px solid ${selectedEmoji === emoji ? 'var(--accent-primary)' : 'transparent'}`, '&:hover': { background: 'var(--bg-hover)' } }}>{emoji}</Button>
                        ))}
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2.5, pt: 1 }}>
                    <Button onClick={() => emojiDialog.exeName && setExeEmoji(emojiDialog.exeName, null)} sx={{ color: 'var(--color-danger)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'none' }}>Remove Emoji</Button>
                    <Box sx={{ flex: 1 }} />
                    <Button onClick={closeEmojiDialog} sx={{ color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 600 }}>Cancel</Button>
                    <Button onClick={() => emojiDialog.exeName && setExeEmoji(emojiDialog.exeName, selectedEmoji)} disabled={!selectedEmoji} variant="contained"
                        sx={{ background: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)', color: 'var(--accent-primary)', border: '1px solid color-mix(in oklab, var(--accent-primary) 35%, transparent)', borderRadius: 'var(--radius-sm)', textTransform: 'none', fontWeight: 700, px: 3, boxShadow: 'none', '&:hover': { background: 'color-mix(in oklab, var(--accent-primary) 22%, transparent)', borderColor: 'color-mix(in oklab, var(--accent-primary) 60%, transparent)' }, '&.Mui-disabled': { background: 'var(--bg-tertiary)', color: 'var(--text-muted)' } }}>
                        Save Emoji
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                <Alert onClose={() => setSnackbar((s) => ({ ...s, open: false }))} severity={snackbar.severity} variant="filled"
                    sx={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 'var(--radius)', border: `1px solid ${snackbar.severity === 'error' ? 'var(--color-danger)' : snackbar.severity === 'success' ? 'var(--color-success)' : 'var(--accent-primary)'}`, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.5)', '& .MuiAlert-icon': { color: snackbar.severity === 'error' ? 'var(--color-danger)' : snackbar.severity === 'success' ? 'var(--color-success)' : 'var(--accent-primary)' } }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>

            {/* Global Drag Overlay */}
            <Box sx={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none', display: isDragOver ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in oklab, black 50%, transparent)', backdropFilter: 'blur(4px)', transition: 'opacity var(--motion-fast)', opacity: isDragOver ? 1 : 0 }}>
                <Box sx={{ p: 6, borderRadius: 'var(--radius-lg)', textAlign: 'center', background: 'var(--bg-secondary)', border: '2px dashed var(--accent-primary)', backdropFilter: 'blur(16px)', boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6)' }}>
                    <Box sx={{ width: 80, height: 80, borderRadius: 'var(--radius-lg)', background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', mb: 3, mx: 'auto' }}>
                        <AddIcon sx={{ fontSize: 40 }} />
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: 'var(--text-primary)' }}>Add Executables</Typography>
                    <Typography sx={{ color: 'var(--text-secondary)' }}>Drop .exe, .bat, or .cmd files to add them to your manager</Typography>
                </Box>
            </Box>
        </Box>
    );
}

export default Tools;
