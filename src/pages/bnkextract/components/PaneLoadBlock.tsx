import { Box, Typography } from '@mui/material';
import { FolderOpen, Refresh } from '@mui/icons-material';
import type { Pane } from '../types';
import type { PathSet } from '../../BnkExtract';

interface Props {
    pane: Pane;
    paths: PathSet;
    onSelectFile: (pane: Pane, kind: keyof PathSet) => void;
    onSetPath: (pane: Pane, kind: keyof PathSet, value: string) => void;
    onParse: (pane: Pane) => void;
    isLoading: boolean;
}

const FIELDS: { kind: keyof PathSet; label: string; tip: string }[] = [
    { kind: 'bin', label: 'BIN File (Names)', tip: 'Select BIN File (Event Names)' },
    { kind: 'wpk', label: 'Audio File (WPK/BNK)', tip: 'Select Audio File (.wpk/.bnk)' },
    { kind: 'bnk', label: 'Events File (BNK)', tip: 'Select BNK File (Events Structure)' },
];

/* Port-style empty-pane loader: centered file pickers + Parse. Rendered only
   while the pane's tree is empty; disappears once content is loaded. Each pane
   parses its own BIN/Audio/Events triple independently. */
export default function PaneLoadBlock({ pane, paths, onSelectFile, onSetPath, onParse, isLoading }: Props) {
    const canParse = !isLoading && (!!paths.wpk || !!paths.bnk);
    return (
        <Box sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            p: 3,
            minHeight: 0,
        }}>
            <FolderOpen sx={{ fontSize: 40, color: 'var(--accent-primary)', opacity: 0.8 }} />
            <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                Select files and <b style={{ color: 'var(--text-primary)' }}>Parse</b>, or drag &amp; drop a mod folder here
            </Typography>

            <Box sx={{ width: 'min(360px, 92%)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {FIELDS.map(({ kind, label, tip }) => (
                    <Box key={kind} sx={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button
                            className={`dl-btn dl-btn--icon dl-btn--sm ${paths[kind] ? 'dl-btn--primary' : 'dl-btn--secondary'}`}
                            onClick={() => onSelectFile(pane, kind)}
                            title={tip}
                        >
                            <span className="dl-icon"><FolderOpen sx={{ fontSize: 16 }} /></span>
                        </button>
                        <input
                            className="dl-input"
                            style={{ flex: 1 }}
                            value={paths[kind]}
                            onChange={(e) => onSetPath(pane, kind, e.target.value)}
                            placeholder={label}
                        />
                    </Box>
                ))}
                <button
                    className="dl-btn dl-btn--primary dl-btn--sm"
                    style={{ justifyContent: 'center', marginTop: '0.25rem' }}
                    onClick={() => onParse(pane)}
                    disabled={!canParse}
                >
                    <span className="dl-icon"><Refresh sx={{ fontSize: 14 }} /></span>
                    <span>Parse</span>
                </button>
            </Box>
        </Box>
    );
}
