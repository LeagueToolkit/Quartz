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
    onLoadFolder: () => void;
    onFilterGrayscale: () => void;
    onToggleSelectAll: () => void;
    onConfirmSelection: () => void;
    onBackToSelection: () => void;
    onReset: () => void;
    onSaveAll: () => void;
}

/* Full-width bottom action bar (Paint-style, fixed 48px). Left: Load Folder (once
   images exist) + the Include Subfolders toggle; right: mode-specific actions. */
export function RecolorFooter(p: RecolorFooterProps) {
    return (
        <Box className="imgrecolor-footer" sx={{
            height: '48px', padding: '0 16px', boxSizing: 'border-box',
            background: 'var(--bg-primary)', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0,
        }}>
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
                <Box sx={{ display: 'flex', gap: 1, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
                    <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={p.onFilterGrayscale}>Filter Grayscale</button>
                    <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={p.onToggleSelectAll}>
                        {p.allSelected ? 'Deselect All' : 'Select All'}
                    </button>
                    <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={p.onConfirmSelection} disabled={p.selectedCount === 0}>
                        Load {p.selectedCount} Images
                    </button>
                </Box>
            )}

            {!p.showingSelection && p.allImagesCount > 0 && (
                <Box sx={{ display: 'flex', gap: 1, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
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
