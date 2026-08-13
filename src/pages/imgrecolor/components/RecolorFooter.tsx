import { Box } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Switch as DlSwitch } from '@/components/settings/primitives';

export interface RecolorFooterProps {
    nothingLoaded: boolean;
    showingSelection: boolean;
    allImagesCount: number;
    selectedCount: number;
    allSelected: boolean;
    loadedCount: number;
    recursiveScan: boolean;
    setRecursiveScan: (v: boolean) => void;
    /* Centered status line. `progress` is non-null only while a job runs, and its
       counts come from the job loop itself, so the readout is live. */
    status: string;
    progress: { done: number; total: number } | null;
    onLoadFolder: () => void;
    onFilterGrayscale: () => void;
    onBlackToAlpha: () => void;
    onToggleSelectAll: () => void;
    onConfirmSelection: () => void;
    onBackToSelection: () => void;
    onReset: () => void;
    onSaveAll: () => void;
}

/* Full-width bottom action bar (Paint-style, fixed 48px). Left: Load Folder (once
   images exist) + the Include Subfolders toggle; right: mode-specific actions. */
export function RecolorFooter(p: RecolorFooterProps) {
    const pct = p.progress && p.progress.total > 0
        ? Math.round((p.progress.done / p.progress.total) * 100)
        : 0;

    return (
        <Box className="imgrecolor-footer">
            {(p.progress || p.status) && (
                <span className="imgrecolor-footer__status">
                    <span className="imgrecolor-footer__status-label">{p.status}</span>
                    {p.progress && (
                        <>
                            <span className="imgrecolor-footer__status-track">
                                <span className="imgrecolor-footer__status-fill" style={{ width: `${pct}%` }} />
                            </span>
                            <span className="imgrecolor-footer__status-count">
                                {p.progress.done}/{p.progress.total} ({pct}%)
                            </span>
                        </>
                    )}
                </span>
            )}
            {!p.nothingLoaded && (
                <button onClick={p.onLoadFolder} className="dl-btn dl-btn--primary dl-btn--sm dl-btn--icon" title="Load Folder">
                    <span className="dl-icon"><FolderOpenIcon sx={{ fontSize: 15 }} /></span>
                </button>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <DlSwitch checked={p.recursiveScan} onChange={p.setRecursiveScan} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    Include Subfolders
                </span>
            </label>

            {p.showingSelection && p.allImagesCount > 0 && (
                <Box className="imgrecolor-footer__actions-group">
                    <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={p.onFilterGrayscale}>Filter Grayscale</button>
                    <button
                        className="dl-btn dl-btn--secondary dl-btn--sm"
                        onClick={p.onBlackToAlpha}
                        disabled={p.selectedCount === 0}
                        title="Fade black to transparent in the selected files, using each pixel's brightness. Colors are left alone. Use for textures made for an additive blend mode, which drops black on its own. This overwrites the files."
                    >
                        Remove Black
                    </button>
                    <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={p.onToggleSelectAll}>
                        {p.allSelected ? 'Deselect All' : 'Select All'}
                    </button>
                    <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={p.onConfirmSelection} disabled={p.selectedCount === 0}>
                        Load {p.selectedCount} Images
                    </button>
                </Box>
            )}

            {!p.showingSelection && p.allImagesCount > 0 && (
                <Box className="imgrecolor-footer__actions-group">
                    <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={p.onBackToSelection}>Back to Selection</button>
                    <button className="dl-btn dl-btn--secondary dl-btn--sm dl-btn--icon" onClick={p.onReset} title="Reset">
                        <span className="dl-icon"><RefreshIcon sx={{ fontSize: 15 }} /></span>
                    </button>
                    <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={p.onSaveAll} disabled={p.loadedCount === 0}>
                        <span className="dl-icon"><SaveIcon sx={{ fontSize: 15 }} /></span>
                        <span>Save All</span>
                    </button>
                </Box>
            )}
        </Box>
    );
}
